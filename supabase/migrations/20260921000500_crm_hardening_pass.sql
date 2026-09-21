-- CRM hardening and usability pass (additive, preserves all existing rows).
--   1. Lead Rent/Sale intent
--   2. Property balcony (+ public_properties payload)
--   3. Archive forces availability to unavailable
--   4. Phone required for CRM-created leads and owners (legacy null phones untouched)
--   5. Structured sale details on transactions + private sale documents link
--   6. Self-service staff profile RPC
--   7. Admin export of a team member's operational data

-- ---------------------------------------------------------------------------
-- 1. Lead transaction intent: sale | rent
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists transaction_intent text not null default 'sale';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_transaction_intent_check') then
    alter table public.leads
      add constraint leads_transaction_intent_check check (transaction_intent in ('sale', 'rent'));
  end if;
end $$;

-- Backward compatible backfill: renters were the only rent-side leads before this column.
update public.leads
   set transaction_intent = 'rent'
 where classification in ('renter', 'tenant')
   and transaction_intent <> 'rent';

create index if not exists leads_transaction_intent_idx on public.leads (transaction_intent);

-- ---------------------------------------------------------------------------
-- 2. Property balcony
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists balcony boolean;

drop function if exists public.public_properties();
create function public.public_properties()
returns table (
  id uuid, title text, reference_code text, description text, location text,
  latitude numeric, longitude numeric, purpose text, property_type text, developer text,
  price numeric, currency text, bedrooms integer, bathrooms integer, size numeric,
  size_unit text, plot_size numeric, completion_status text, availability text,
  amenities text[], highlights text[], hero_image_url text, hero_video_url text,
  tour_360_url text, slug text, seo_title text, seo_description text, listing_source text,
  last_refreshed_at timestamptz, created_at timestamptz, updated_at timestamptz,
  country_id uuid, country_name text, country_slug text, area_id uuid, area_name text,
  area_slug text, development_id uuid, development_name text, development_slug text,
  assigned_agent_id uuid, assigned_agent_name text, assigned_agent_avatar text,
  assigned_agent_role text, tower_name text, floor_number text, unit_number text,
  parking_spaces integer, furnishing_status text, available_from date, maids_room boolean,
  majlis boolean, indoor_majlis boolean, outdoor_majlis boolean,
  cloudflare_video_uid text, cloudflare_video_status text, balcony boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p.id, p.title, p.reference_code, p.description, p.location, p.latitude, p.longitude,
    p.purpose, p.property_type, p.developer, p.price, p.currency, p.bedrooms, p.bathrooms,
    p.size, p.size_unit, p.plot_size, p.completion_status, p.availability, p.amenities,
    p.highlights, p.hero_image_url, p.hero_video_url, p.tour_360_url, p.slug, p.seo_title,
    p.seo_description, p.listing_source, p.last_refreshed_at, p.created_at, p.updated_at,
    p.country_id, c.name, c.slug,
    p.area_id, a.name, a.slug,
    p.development_id, d.name, d.slug,
    p.assigned_agent_id, ag.full_name, ag.avatar_url, ag.role,
    p.tower_name, p.floor_number, p.unit_number, p.parking_spaces, p.furnishing_status,
    p.available_from, p.maids_room, p.majlis, p.indoor_majlis, p.outdoor_majlis,
    p.cloudflare_video_uid, p.cloudflare_video_status, p.balcony
  from public.properties p
  left join public.countries c on c.id = p.country_id
  left join public.areas a on a.id = p.area_id
  left join public.developments d on d.id = p.development_id
  left join public.team_members ag on ag.id = p.assigned_agent_id
  where p.is_published = true and p.status = 'active';
$$;

grant execute on function public.public_properties() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Archiving a property makes it unavailable, whichever path archived it.
--    Restoring deliberately leaves availability alone: staff confirm it explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.properties_archive_sets_unavailable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'archived' or new.archived_at is not null then
      new.availability := 'unavailable';
    end if;
  elsif (new.status = 'archived' and old.status is distinct from 'archived')
     or (new.archived_at is not null and old.archived_at is null) then
    new.availability := 'unavailable';
  end if;
  return new;
end;
$$;

revoke all on function public.properties_archive_sets_unavailable() from public, anon, authenticated;

drop trigger if exists properties_archive_sets_unavailable on public.properties;
create trigger properties_archive_sets_unavailable
  before insert or update on public.properties
  for each row execute function public.properties_archive_sets_unavailable();

-- ---------------------------------------------------------------------------
-- 4. Phone required for CRM-created leads and owners.
--    Whitespace is normalised. Legacy rows without a phone stay valid and can still be
--    edited; only new rows, or removing an existing phone, are rejected. Server-side
--    callers (service role, auth.uid() is null) validate in their own code.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_contact_phone()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v text := nullif(regexp_replace(btrim(coalesce(new.phone, '')), '\s+', ' ', 'g'), '');
begin
  new.phone := v;
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if v is null then
      raise exception 'Phone number is required' using errcode = '23514';
    end if;
  elsif v is null and nullif(btrim(coalesce(old.phone, '')), '') is not null then
    raise exception 'Phone number cannot be removed' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_contact_phone() from public, anon, authenticated;

drop trigger if exists leads_enforce_phone on public.leads;
create trigger leads_enforce_phone
  before insert or update of phone on public.leads
  for each row execute function public.enforce_contact_phone();

drop trigger if exists owners_enforce_phone on public.owners;
create trigger owners_enforce_phone
  before insert or update of phone on public.owners
  for each row execute function public.enforce_contact_phone();

-- ---------------------------------------------------------------------------
-- 5. Structured sale history on the existing transactions ledger (no duplicate table).
--    Existing columns are reused: closed_at = sale date, transaction_value = sale price,
--    agent_id = responsible agent, commission_value = commission amount.
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists buyer_name text,
  add column if not exists buyer_phone text,
  add column if not exists buyer_email text,
  add column if not exists seller_owner_id uuid references public.owners(id) on delete set null,
  add column if not exists commission_rate numeric,
  add column if not exists payment_status text,
  add column if not exists payment_details text,
  add column if not exists recorded_by uuid references public.team_members(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_payment_status_check') then
    alter table public.transactions
      add constraint transactions_payment_status_check
      check (payment_status is null or payment_status in ('pending', 'partial', 'paid'));
  end if;
end $$;

create index if not exists transactions_property_id_idx on public.transactions (property_id);
create index if not exists transactions_seller_owner_id_idx on public.transactions (seller_owner_id);

-- Private sale documents reuse the uploads table and the private R2 property_documents category.
alter table public.uploads
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
create index if not exists uploads_transaction_id_idx on public.uploads (transaction_id);

-- Sale history for a property. Everyone who can view the property sees the headline
-- (date, price, buyer name, seller, agent). Buyer contact, commission and payment details
-- are limited to accounting, administrators and the responsible/recording agent.
create or replace function public.get_property_sales(_property_id uuid)
returns table (
  id uuid, property_id uuid, sale_date date, sale_price numeric, currency text, status text,
  buyer_name text, buyer_phone text, buyer_email text, seller_owner_id uuid, seller_name text,
  agent_id uuid, agent_name text, commission_rate numeric, commission_amount numeric,
  payment_status text, payment_details text, notes text, recorded_by uuid,
  created_at timestamptz, updated_at timestamptz, private_visible boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.property_id, t.closed_at, t.transaction_value, t.currency, t.status,
         t.buyer_name,
         case when v.ok then t.buyer_phone end,
         case when v.ok then t.buyer_email end,
         t.seller_owner_id, o.name,
         t.agent_id, tm.full_name,
         case when v.ok then t.commission_rate end,
         case when v.ok then t.commission_value end,
         case when v.ok then t.payment_status end,
         case when v.ok then t.payment_details end,
         case when v.ok then t.notes end,
         t.recorded_by, t.created_at, t.updated_at, v.ok
    from public.transactions t
   cross join lateral (
     select (
       public.has_permission('accounting', 'view')
       or public.has_permission('accounting', 'manage')
       or public.is_owner_phone_elevated()
       or t.agent_id = public.current_team_member_id()
       or t.recorded_by = public.current_team_member_id()
     ) as ok
   ) v
    left join public.owners o on o.id = t.seller_owner_id
    left join public.team_members tm on tm.id = t.agent_id
   where t.property_id = _property_id
     and t.transaction_type = 'sale'
     and public.has_permission('properties', 'view')
   order by t.closed_at desc nulls last, t.created_at desc;
$$;

create or replace function public.record_property_sale(
  _property_id uuid,
  _buyer_name text,
  _buyer_phone text,
  _buyer_email text,
  _sale_date date,
  _sale_price numeric,
  _currency text,
  _agent_id uuid,
  _commission_rate numeric,
  _commission_amount numeric,
  _payment_status text,
  _payment_details text,
  _notes text,
  _lead_id uuid default null,
  _sale_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prop public.properties%rowtype;
  v_id uuid;
  v_me uuid := public.current_team_member_id();
  v_phone text := nullif(regexp_replace(btrim(coalesce(_buyer_phone, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.has_permission('properties', 'edit') or public.has_permission('accounting', 'manage')) then
    raise exception 'You do not have permission to record a sale' using errcode = '42501';
  end if;

  select * into v_prop from public.properties where id = _property_id;
  if not found then
    raise exception 'Property not found';
  end if;

  if btrim(coalesce(_buyer_name, '')) = '' then
    raise exception 'Buyer name is required' using errcode = '23514';
  end if;
  if v_phone is null then
    raise exception 'Buyer phone number is required' using errcode = '23514';
  end if;
  if _sale_date is null then
    raise exception 'Sale date is required' using errcode = '23514';
  end if;
  if _sale_price is null or _sale_price <= 0 then
    raise exception 'Sale price is required' using errcode = '23514';
  end if;
  if _payment_status is not null and _payment_status not in ('pending', 'partial', 'paid') then
    raise exception 'Invalid payment status' using errcode = '23514';
  end if;

  if _sale_id is null then
    insert into public.transactions (
      property_id, lead_id, agent_id, transaction_type, transaction_value, commission_value,
      currency, status, closed_at, notes, buyer_name, buyer_phone, buyer_email,
      seller_owner_id, commission_rate, payment_status, payment_details, recorded_by
    ) values (
      _property_id, _lead_id, coalesce(_agent_id, v_prop.assigned_agent_id, v_me), 'sale',
      _sale_price, _commission_amount, coalesce(nullif(btrim(_currency), ''), 'QAR'), 'closed',
      _sale_date, nullif(btrim(coalesce(_notes, '')), ''), btrim(_buyer_name), v_phone,
      nullif(btrim(coalesce(_buyer_email, '')), ''), v_prop.owner_id, _commission_rate,
      _payment_status, nullif(btrim(coalesce(_payment_details, '')), ''), v_me
    ) returning id into v_id;
  else
    update public.transactions set
      lead_id = coalesce(_lead_id, lead_id),
      agent_id = coalesce(_agent_id, agent_id),
      transaction_value = _sale_price,
      commission_value = _commission_amount,
      currency = coalesce(nullif(btrim(_currency), ''), currency, 'QAR'),
      closed_at = _sale_date,
      notes = nullif(btrim(coalesce(_notes, '')), ''),
      buyer_name = btrim(_buyer_name),
      buyer_phone = v_phone,
      buyer_email = nullif(btrim(coalesce(_buyer_email, '')), ''),
      commission_rate = _commission_rate,
      payment_status = _payment_status,
      payment_details = nullif(btrim(coalesce(_payment_details, '')), '')
    where id = _sale_id and property_id = _property_id and transaction_type = 'sale'
    returning id into v_id;
    if v_id is null then
      raise exception 'Sale record not found';
    end if;
  end if;

  update public.properties set availability = 'sold'
   where id = _property_id and availability is distinct from 'sold';

  return v_id;
end;
$$;

revoke all on function public.get_property_sales(uuid) from public, anon;
revoke all on function public.record_property_sale(uuid, text, text, text, date, numeric, text, uuid, numeric, numeric, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.get_property_sales(uuid) to authenticated;
grant execute on function public.record_property_sale(uuid, text, text, text, date, numeric, text, uuid, numeric, numeric, text, text, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Staff self-service profile. Only these fields; role, permissions, team, joining
--    date and active status stay admin-controlled through team_members write policy.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile(
  _full_name text,
  _phone text,
  _date_of_birth date,
  _avatar_url text default null,
  _remove_avatar boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := nullif(btrim(coalesce(_full_name, '')), '');
  v_phone text := nullif(regexp_replace(btrim(coalesce(_phone, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Full name is required' using errcode = '23514';
  end if;
  if _date_of_birth is not null and (_date_of_birth < date '1900-01-01' or _date_of_birth > current_date) then
    raise exception 'Date of birth is not valid' using errcode = '23514';
  end if;

  update public.team_members
     set full_name = v_name,
         phone = v_phone,
         date_of_birth = _date_of_birth,
         avatar_url = case
           when _remove_avatar then null
           when nullif(btrim(coalesce(_avatar_url, '')), '') is not null then btrim(_avatar_url)
           else avatar_url
         end
   where user_id = auth.uid() and is_active is true;

  if not found then
    raise exception 'No active staff profile for this account' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, date, text, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, date, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Export a team member's operational data (admin only, before deletion).
--    Never includes auth tokens, password hashes, WhatsApp/API credentials or permissions.
--    Owner phone and id_number follow the same access rule as everywhere else.
-- ---------------------------------------------------------------------------
create or replace function public.export_team_member_data(_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v jsonb;
begin
  if auth.uid() is null or not public.has_permission('team', 'manage') then
    raise exception 'Only administrators who manage the team can export staff data' using errcode = '42501';
  end if;

  select tm.user_id into v_user from public.team_members tm where tm.id = _member_id;
  if not found then
    raise exception 'Team member not found';
  end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', tm.id, 'code', tm.code, 'full_name', tm.full_name, 'email', tm.email,
        'phone', tm.phone, 'role', tm.role, 'is_active', tm.is_active,
        'joining_date', tm.joining_date, 'date_of_birth', tm.date_of_birth,
        'team_id', tm.team_id, 'created_at', tm.created_at, 'notes', tm.notes
      ) from public.team_members tm where tm.id = _member_id
    ),
    'leads', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.leads l where l.assigned_agent_id = _member_id), '[]'::jsonb),
    'properties', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.properties p where p.assigned_agent_id = _member_id), '[]'::jsonb),
    'developments', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.developments d where d.assigned_agent_id = _member_id), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'code', o.code, 'name', o.name, 'company', o.company, 'email', o.email,
        'address', o.address, 'is_developer', o.is_developer, 'notes', o.notes,
        'phone', case when public.can_view_owner_phone(o.id) then o.phone end,
        'id_number', case when public.can_view_owner_phone(o.id) then o.id_number end,
        'created_at', o.created_at
      ) order by o.created_at)
      from public.owners o where o.assigned_agent_id = _member_id
    ), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.tasks t where t.assigned_to = _member_id), '[]'::jsonb),
    'viewings', coalesce((select jsonb_agg(to_jsonb(w) order by w.scheduled_at) from public.viewings w where w.assigned_agent_id = _member_id), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.offers f where f.agent_id = _member_id), '[]'::jsonb),
    'interactions', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.interactions i where i.created_by = _member_id or (v_user is not null and i.created_by = v_user)), '[]'::jsonb),
    'lead_notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.lead_notes n where n.author_id = _member_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.transactions x where x.agent_id = _member_id), '[]'::jsonb),
    'owner_contracts', coalesce((
      select jsonb_agg(to_jsonb(c) - 'generated_html' order by c.created_at)
      from public.owner_contracts c where c.assigned_agent_id = _member_id
    ), '[]'::jsonb),
    'property_shares', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.property_shares s where s.shared_by = _member_id), '[]'::jsonb),
    'marketing_requests', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.marketing_requests m where m.assigned_to = _member_id), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.export_team_member_data(uuid) from public, anon;
grant execute on function public.export_team_member_data(uuid) to authenticated;
