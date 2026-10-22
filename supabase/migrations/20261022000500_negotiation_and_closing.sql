-- Negotiation property selection and the closing process.
--
-- Negotiation
--   * When a lead enters Negotiation the agent says WHICH interested property is being reserved. Only that
--     interest becomes "reserved". Other shortlisted properties are untouched, and no inventory is marked
--     sold. The property itself is only held (availability "reserved") when the agent asks for it, and the
--     interest remembers that it holds it, so the hold is released when the lead is lost.
--
-- Closing
--   * close_lead_deal records a Won / Sold / Rented deal in ONE step: the transaction (actual date, client,
--     property, price, payment method and status, commission), the property's availability, the lead's
--     stage, the interest, the history and the activity. Only Super Administrators and people holding
--     leads "finalize_won" (Administrator, Accounting) can use it.
--   * The database refuses a second closed deal for the same lead and property, and a second closed sale for
--     one property, so a deal can never be counted twice.
--   * A trigger keeps the property's availability in step with its transactions however they change.

-- 1. Interests ---------------------------------------------------------------------------------------------

alter table public.lead_property_interests
  add column if not exists holds_property boolean not null default false;

alter table public.lead_property_interests
  add constraint lead_property_interests_status_check
  check (status is null or status in ('interested', 'reserved', 'won', 'lost'));

-- 2. Transactions: payment method, and no double counting ----------------------------------------------

alter table public.transactions
  add column if not exists payment_method text;

alter table public.transactions
  add constraint transactions_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'bank_transfer', 'cheque', 'card', 'other'));

create unique index if not exists transactions_one_closed_per_lead_property
  on public.transactions (lead_id, property_id, transaction_type)
  where status = 'closed' and lead_id is not null and property_id is not null;

create unique index if not exists transactions_one_closed_sale_per_property
  on public.transactions (property_id)
  where status = 'closed' and transaction_type = 'sale' and property_id is not null;

-- 3. Availability follows the transactions -------------------------------------------------------------------

create or replace function public.transactions_sync_property_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' and new.property_id is not null then
    if new.transaction_type = 'sale' then
      update public.properties set availability = 'sold'
       where id = new.property_id and availability is distinct from 'sold';
    elsif new.transaction_type = 'rental' then
      update public.properties set availability = 'rented'
       where id = new.property_id and availability is distinct from 'rented';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'closed' and old.property_id is not null
     and (new.status is distinct from 'closed' or new.property_id is distinct from old.property_id) then
    update public.properties p
       set availability = 'available'
     where p.id = old.property_id
       and p.availability in ('sold', 'rented')
       and not exists (
         select 1 from public.transactions t
          where t.property_id = p.id and t.status = 'closed' and t.id <> new.id
       );
  end if;
  return null;
end;
$$;

create or replace trigger transactions_sync_property_availability
  after insert or update of status, property_id, transaction_type on public.transactions
  for each row execute function public.transactions_sync_property_availability();

revoke execute on function public.transactions_sync_property_availability() from public, anon, authenticated;

-- 4. Choose the property that is being negotiated -------------------------------------------------------------

create or replace function public.set_negotiation_property(
  _lead_id uuid,
  _property_id uuid,
  _hold_property boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop record;
  v_hold boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in to choose the negotiated property.' using errcode = '42501';
  end if;
  if not (
    (public.has_permission('leads', 'edit') and public.can_access_lead(_lead_id))
    or (public.has_permission('leads', 'create') and public.lead_created_by_me(_lead_id))
  ) then
    raise exception 'You do not have permission to change this lead.' using errcode = '42501';
  end if;

  select id, availability into v_prop from public.properties where id = _property_id;
  if not found then
    raise exception 'That property no longer exists.' using errcode = '22023';
  end if;

  -- Only one property is under negotiation at a time: release the previous choice.
  update public.lead_property_interests
     set status = 'interested', updated_at = now()
   where lead_id = _lead_id and status = 'reserved' and property_id <> _property_id;

  update public.properties p
     set availability = 'available'
   where p.availability = 'reserved'
     and p.id in (
       select i.property_id from public.lead_property_interests i
        where i.lead_id = _lead_id and i.property_id <> _property_id and i.holds_property
     )
     and not exists (
       select 1 from public.lead_property_interests o
        where o.property_id = p.id and o.holds_property and o.lead_id <> _lead_id and o.status = 'reserved'
     );
  update public.lead_property_interests set holds_property = false
   where lead_id = _lead_id and property_id <> _property_id and holds_property;

  if _hold_property and v_prop.availability = 'available' then
    update public.properties set availability = 'reserved' where id = _property_id;
    v_hold := true;
  end if;

  insert into public.lead_property_interests (lead_id, property_id, status, holds_property)
  values (_lead_id, _property_id, 'reserved', v_hold)
  on conflict (lead_id, property_id)
  do update set status = 'reserved',
                holds_property = public.lead_property_interests.holds_property or excluded.holds_property,
                updated_at = now();

  return jsonb_build_object('property_id', _property_id, 'held', v_hold);
end;
$$;

revoke all on function public.set_negotiation_property(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_negotiation_property(uuid, uuid, boolean) to authenticated;

-- A lead that is lost lets go of what it was holding.
create or replace function public.leads_release_holds_on_lost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new record;
begin
  if new.pipeline_stage is not distinct from old.pipeline_stage then
    return null;
  end if;
  select * into v_new from public.pipeline_stage_info(new.pipeline_stage);
  if not coalesce(v_new.is_lost, false) then
    return null;
  end if;

  update public.properties p
     set availability = 'available'
   where p.availability = 'reserved'
     and exists (select 1 from public.lead_property_interests i
                  where i.lead_id = new.id and i.property_id = p.id and i.holds_property)
     and not exists (select 1 from public.lead_property_interests o
                      where o.property_id = p.id and o.holds_property and o.lead_id <> new.id and o.status = 'reserved');

  update public.lead_property_interests
     set status = 'lost', holds_property = false, updated_at = now()
   where lead_id = new.id and status = 'reserved';
  return null;
end;
$$;

create or replace trigger leads_release_holds_on_lost
  after update of pipeline_stage on public.leads
  for each row execute function public.leads_release_holds_on_lost();

revoke execute on function public.leads_release_holds_on_lost() from public, anon, authenticated;

-- 5. The closing process ---------------------------------------------------------------------------------------

create or replace function public.close_lead_deal(
  _lead_id uuid,
  _property_id uuid,
  _transaction_type text,
  _closing_date date,
  _price numeric,
  _currency text,
  _client_name text,
  _client_phone text,
  _client_email text,
  _payment_method text,
  _payment_status text,
  _payment_details text,
  _commission_rate numeric default null,
  _commission_amount numeric default null,
  _notes text default null,
  _transaction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  v_lead public.leads;
  v_prop public.properties;
  v_stage record;
  v_won_stage text;
  v_txn uuid;
  v_agent uuid;
  v_today date := (now() at time zone 'Asia/Qatar')::date;
  v_phone text := nullif(regexp_replace(btrim(coalesce(_client_phone, '')), '\s+', ' ', 'g'), '');
  v_summary text;
  r record;
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Sign in to close a deal.' using errcode = '42501';
  end if;
  if not public.can_finalize_won() then
    raise exception 'Only a Super Administrator, an authorised Administrator or Accounts can close a deal.' using errcode = '42501';
  end if;

  if _transaction_type not in ('sale', 'rental') then
    raise exception 'Choose whether this was a sale or a rental.' using errcode = '22023';
  end if;
  if _closing_date is null then
    raise exception 'The actual transaction date is required.' using errcode = '23514';
  end if;
  if _closing_date > v_today then
    raise exception 'The transaction date cannot be in the future.' using errcode = '23514';
  end if;
  if _price is null or _price <= 0 then
    raise exception 'The agreed price is required.' using errcode = '23514';
  end if;
  if btrim(coalesce(_client_name, '')) = '' then
    raise exception 'The client name is required.' using errcode = '23514';
  end if;
  if v_phone is null then
    raise exception 'The client phone number is required.' using errcode = '23514';
  end if;
  if _payment_method is null or _payment_method not in ('cash', 'bank_transfer', 'cheque', 'card', 'other') then
    raise exception 'Choose how the client paid.' using errcode = '23514';
  end if;
  if _payment_status is null or _payment_status not in ('pending', 'partial', 'paid') then
    raise exception 'Choose the payment status.' using errcode = '23514';
  end if;
  if _commission_rate is not null and (_commission_rate < 0 or _commission_rate > 100) then
    raise exception 'The commission rate must be between 0 and 100.' using errcode = '23514';
  end if;

  select * into v_lead from public.leads where id = _lead_id for update;
  if not found then
    raise exception 'That lead could not be found.' using errcode = '22023';
  end if;
  select * into v_prop from public.properties where id = _property_id for update;
  if not found then
    raise exception 'Choose the property that was sold or rented.' using errcode = '22023';
  end if;

  select * into v_stage from public.pipeline_stage_info(v_lead.pipeline_stage);
  if found and v_stage.is_lost and not public.is_super_administrator() then
    raise exception 'This lead is Lost. Only a Super Administrator can reopen it.' using errcode = '23514';
  end if;

  if _transaction_type = 'sale' and v_prop.purpose = 'rent' then
    raise exception 'This property is listed for rent, so it cannot be recorded as a sale.' using errcode = '23514';
  end if;
  if _transaction_type = 'rental' and v_prop.purpose in ('sale', 'off_plan', 'off_plan_resale') then
    raise exception 'This property is listed for sale, so it cannot be recorded as a rental.' using errcode = '23514';
  end if;

  -- Another lead's closed deal already holds this property.
  if exists (
    select 1 from public.transactions t
     where t.property_id = _property_id and t.status = 'closed'
       and t.lead_id is distinct from _lead_id
       and t.id is distinct from _transaction_id
       and (_transaction_type = 'sale' or t.transaction_type = 'sale' or v_prop.availability = 'rented')
  ) then
    raise exception 'This property already has a closed deal with another client. Cancel that deal first if it was a mistake.' using errcode = '23505';
  end if;

  v_agent := coalesce(v_lead.assigned_agent_id, v_prop.assigned_agent_id, v_me);

  if _transaction_id is not null then
    v_txn := _transaction_id;
    update public.transactions set
        lead_id = _lead_id,
        property_id = _property_id,
        agent_id = coalesce(agent_id, v_agent),
        transaction_type = _transaction_type,
        transaction_value = _price,
        commission_value = _commission_amount,
        currency = coalesce(nullif(btrim(_currency), ''), 'QAR'),
        status = 'closed',
        closed_at = _closing_date,
        notes = nullif(btrim(coalesce(_notes, '')), ''),
        buyer_name = btrim(_client_name),
        buyer_phone = v_phone,
        buyer_email = nullif(btrim(coalesce(_client_email, '')), ''),
        seller_owner_id = v_prop.owner_id,
        commission_rate = _commission_rate,
        payment_status = _payment_status,
        payment_method = _payment_method,
        payment_details = nullif(btrim(coalesce(_payment_details, '')), '')
      where id = _transaction_id and lead_id = _lead_id;
    if not found then
      raise exception 'That transaction does not belong to this lead.' using errcode = '22023';
    end if;
  else
    -- Reuse a pending record for the same lead and property instead of creating a second one.
    select id into v_txn from public.transactions
     where lead_id = _lead_id and property_id = _property_id and transaction_type = _transaction_type
       and status in ('pending', 'cancelled')
     order by (status = 'pending') desc, created_at desc
     limit 1
       for update;
    if v_txn is not null then
      update public.transactions set
          agent_id = coalesce(agent_id, v_agent),
          transaction_value = _price,
          commission_value = _commission_amount,
          currency = coalesce(nullif(btrim(_currency), ''), 'QAR'),
          status = 'closed',
          closed_at = _closing_date,
          notes = nullif(btrim(coalesce(_notes, '')), ''),
          buyer_name = btrim(_client_name),
          buyer_phone = v_phone,
          buyer_email = nullif(btrim(coalesce(_client_email, '')), ''),
          seller_owner_id = v_prop.owner_id,
          commission_rate = _commission_rate,
          payment_status = _payment_status,
          payment_method = _payment_method,
          payment_details = nullif(btrim(coalesce(_payment_details, '')), '')
        where id = v_txn;
    else
      insert into public.transactions (
        property_id, lead_id, agent_id, transaction_type, transaction_value, commission_value, currency,
        status, closed_at, notes, buyer_name, buyer_phone, buyer_email, seller_owner_id, commission_rate,
        payment_status, payment_method, payment_details, recorded_by
      ) values (
        _property_id, _lead_id, v_agent, _transaction_type, _price, _commission_amount,
        coalesce(nullif(btrim(_currency), ''), 'QAR'), 'closed', _closing_date,
        nullif(btrim(coalesce(_notes, '')), ''), btrim(_client_name), v_phone,
        nullif(btrim(coalesce(_client_email, '')), ''), v_prop.owner_id, _commission_rate,
        _payment_status, _payment_method, nullif(btrim(coalesce(_payment_details, '')), ''), v_me
      ) returning id into v_txn;
    end if;
  end if;
  -- (the transactions trigger has set the property to sold / rented)

  -- The lead becomes Won, recorded as a closing in its history.
  select s.stage_key into v_won_stage
    from public.pipeline_stages s where s.is_won and s.is_active order by s.position limit 1;
  v_summary := case _transaction_type when 'sale' then 'Sold' else 'Rented' end || ': ' || v_prop.title
    || ' for ' || coalesce(nullif(btrim(_currency), ''), 'QAR') || ' ' || trim(to_char(_price, 'FM999,999,999,990.##'))
    || ' on ' || to_char(_closing_date, 'DD Mon YYYY');
  if v_won_stage is not null and v_lead.pipeline_stage is distinct from v_won_stage then
    perform set_config('app.stage_change_kind', 'closing', true);
    perform set_config('app.stage_change_reason', left(v_summary, 500), true);
    update public.leads set pipeline_stage = v_won_stage where id = _lead_id;
    perform set_config('app.stage_change_kind', '', true);
    perform set_config('app.stage_change_reason', '', true);
  end if;

  -- The interest: won, and any hold released. Other clients waiting on this property are told.
  insert into public.lead_property_interests (lead_id, property_id, status, holds_property)
  values (_lead_id, _property_id, 'won', false)
  on conflict (lead_id, property_id)
  do update set status = 'won', holds_property = false, updated_at = now();

  for r in
    update public.lead_property_interests i
       set status = 'lost', holds_property = false, updated_at = now()
     where i.property_id = _property_id and i.lead_id <> _lead_id and i.status = 'reserved'
    returning i.lead_id
  loop
    perform public.enqueue_staff_notification(
      (select assigned_agent_id from public.leads where id = r.lead_id),
      'Property no longer available',
      v_prop.title || ' was ' || case _transaction_type when 'sale' then 'sold' else 'rented' end || ' to another client.',
      '/leads/' || r.lead_id::text, 'property_unavailable', 'properties', _property_id, 'closed:' || r.lead_id::text
    );
  end loop;

  -- Property statistics and activity history.
  insert into public.property_events (property_id, lead_id, event_type, source, source_ref, weight, metadata)
  values (_property_id, _lead_id, 'deal_closed', 'closing', v_txn::text, 0,
          jsonb_build_object('transaction_type', _transaction_type, 'price', _price, 'closed_at', _closing_date));

  insert into public.interactions (lead_id, property_id, interaction_type, direction, subject, content, interaction_date, metadata)
  values (_lead_id, _property_id, 'manual_note', 'internal', 'Deal closed', v_summary || '. Payment: ' || _payment_method || ' (' || _payment_status || ').',
          now(), jsonb_build_object('transaction_id', v_txn, 'kind', 'deal_closed'));

  if v_lead.assigned_agent_id is not null and v_lead.assigned_agent_id is distinct from v_me then
    perform public.enqueue_staff_notification(
      v_lead.assigned_agent_id, 'Deal closed', v_lead.full_name || ': ' || v_summary, '/leads/' || _lead_id::text,
      'deal_closed', 'transactions', v_txn, 'closed'
    );
  end if;

  return jsonb_build_object('transaction_id', v_txn, 'stage', coalesce(v_won_stage, v_lead.pipeline_stage), 'summary', v_summary);
end;
$$;

revoke all on function public.close_lead_deal(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.close_lead_deal(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, numeric, numeric, text, uuid) to authenticated;

-- 6. The closing queue: deals waiting for someone who can finalise them ------------------------------------

create or replace function public.get_closing_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_finalize_won() then
    raise exception 'Only people who can finalise deals can see the closing queue.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(q) order by q.waiting_since)
      from (
        select l.id, l.full_name, l.pipeline_stage, l.transaction_intent, l.budget_max, l.currency,
               l.assigned_agent_id, tm.full_name as agent_name,
               (select s.is_won from public.pipeline_stages s where s.stage_key = l.pipeline_stage) as already_won,
               l.updated_at as waiting_since,
               coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'property_id', p.id, 'title', p.title, 'reference_code', p.reference_code,
                          'price', p.price, 'currency', p.currency, 'status', i.status, 'purpose', p.purpose)
                        order by (i.status = 'reserved') desc, p.title)
                   from public.lead_property_interests i
                   join public.properties p on p.id = i.property_id
                  where i.lead_id = l.id), '[]'::jsonb) as properties
          from public.leads l
          left join public.team_members tm on tm.id = l.assigned_agent_id
         where (l.pipeline_stage = 'documentation')
            or (
              exists (select 1 from public.pipeline_stages s where s.stage_key = l.pipeline_stage and s.is_won)
              and not exists (select 1 from public.transactions t where t.lead_id = l.id and t.status = 'closed')
            )
      ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_closing_queue() from public, anon;
grant execute on function public.get_closing_queue() to authenticated;

-- (Follow-up applied as closing_queue_contact_details) The queue also returns the lead's phone and email, so the
-- closing form can be pre-filled by Accounts, who may not otherwise work with the lead.
create or replace function public.get_closing_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_finalize_won() then
    raise exception 'Only people who can finalise deals can see the closing queue.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(q) order by q.waiting_since)
      from (
        select l.id, l.full_name, l.phone, l.email, l.pipeline_stage, l.transaction_intent, l.budget_max, l.currency,
               l.assigned_agent_id, tm.full_name as agent_name,
               (select s.is_won from public.pipeline_stages s where s.stage_key = l.pipeline_stage) as already_won,
               l.updated_at as waiting_since,
               coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'property_id', p.id, 'title', p.title, 'reference_code', p.reference_code,
                          'price', p.price, 'currency', p.currency, 'status', i.status, 'purpose', p.purpose)
                        order by (i.status = 'reserved') desc, p.title)
                   from public.lead_property_interests i
                   join public.properties p on p.id = i.property_id
                  where i.lead_id = l.id), '[]'::jsonb) as properties
          from public.leads l
          left join public.team_members tm on tm.id = l.assigned_agent_id
         where (l.pipeline_stage = 'documentation')
            or (
              exists (select 1 from public.pipeline_stages s where s.stage_key = l.pipeline_stage and s.is_won)
              and not exists (select 1 from public.transactions t where t.lead_id = l.id and t.status = 'closed')
            )
      ) q
  ), '[]'::jsonb);
end;
$$;
