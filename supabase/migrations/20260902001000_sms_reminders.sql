-- Q-Bay Real Estate CRM — SMS reminder infrastructure (module H).
--
-- No SMS provider is configured yet - this builds the full pipeline so
-- plugging one in later is a config change, not a rebuild. Notifications
-- schedule themselves automatically (contract expiry, sale/rental
-- congratulations) and sit as 'pending' until either an admin processes
-- them manually (Settings -> Notifications) or a provider + cron trigger
-- is wired up later. They are never marked 'sent' without an actual
-- provider call succeeding.

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  channel text not null default 'sms' check (channel in ('sms')),
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  template_key text references public.notification_templates(key) on delete set null,
  event_type text not null,
  owner_id uuid references public.owners(id) on delete cascade,
  recipient_name text,
  recipient_phone text,
  body text,
  related_table text,
  related_id uuid,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scheduled_notifications_status_idx on public.scheduled_notifications (status);
create index scheduled_notifications_scheduled_for_idx on public.scheduled_notifications (scheduled_for);
create index scheduled_notifications_owner_id_idx on public.scheduled_notifications (owner_id);
-- Never schedule the same reminder twice for the same source row+event while one is still pending.
create unique index scheduled_notifications_dedupe
  on public.scheduled_notifications (related_table, related_id, event_type)
  where status = 'pending';

drop trigger if exists set_updated_at on public.notification_templates;
create trigger set_updated_at before update on public.notification_templates for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.scheduled_notifications;
create trigger set_updated_at before update on public.scheduled_notifications for each row execute function public.set_updated_at();

insert into public.notification_templates (key, name, body_template) values
  ('contract_expiry', 'Owner contract approaching expiry',
   'Dear {{owner_name}}, your agreement with Q-Bay Real Estate for {{property_title}} is due to expire on {{expiry_date}}. Please contact us to discuss renewal.'),
  ('sale_congratulations', 'Successful sale congratulations',
   'Dear {{owner_name}}, congratulations! Your property {{property_title}} has successfully sold. Thank you for trusting Q-Bay Real Estate.'),
  ('rental_congratulations', 'Successful rental congratulations',
   'Dear {{owner_name}}, congratulations! Your property {{property_title}} has been successfully rented. Thank you for trusting Q-Bay Real Estate.')
on conflict (key) do nothing;

-- --- Auto-schedule: owner contract approaching expiry (30 days before) ------

create or replace function public.owner_contracts_schedule_expiry_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner record;
  v_property_title text;
begin
  if new.expiry_date is null or new.status not in ('generated', 'signed') then
    return new;
  end if;
  select * into v_owner from public.owners where id = new.owner_id;
  if v_owner is null or v_owner.phone is null then
    return new;
  end if;
  select title into v_property_title from public.properties where id = new.property_id;

  insert into public.scheduled_notifications (
    template_key, event_type, owner_id, recipient_name, recipient_phone, body,
    related_table, related_id, scheduled_for
  ) values (
    'contract_expiry', 'contract_expiry', new.owner_id, v_owner.name, v_owner.phone,
    replace(replace(replace(
      (select body_template from public.notification_templates where key = 'contract_expiry'),
      '{{owner_name}}', v_owner.name),
      '{{property_title}}', coalesce(v_property_title, 'your property')),
      '{{expiry_date}}', to_char(new.expiry_date, 'DD Mon YYYY')),
    'owner_contracts', new.id, (new.expiry_date - interval '30 days')
  )
  on conflict (related_table, related_id, event_type) where status = 'pending' do nothing;

  return new;
end;
$$;

revoke execute on function public.owner_contracts_schedule_expiry_reminder() from public, anon, authenticated;

drop trigger if exists owner_contracts_schedule_expiry_reminder on public.owner_contracts;
create trigger owner_contracts_schedule_expiry_reminder
  after insert or update on public.owner_contracts
  for each row execute function public.owner_contracts_schedule_expiry_reminder();

-- --- Auto-schedule: sale / rental congratulations on transaction close -----

create or replace function public.transactions_schedule_congratulations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner record;
  v_property_title text;
  v_owner_id uuid;
  v_template_key text;
begin
  if new.status <> 'closed' or old.status = 'closed' then
    return new;
  end if;
  if new.transaction_type not in ('sale', 'rental') then
    return new;
  end if;
  if new.property_id is null then
    return new;
  end if;

  select p.title, p.owner_id into v_property_title, v_owner_id from public.properties p where p.id = new.property_id;
  if v_owner_id is null then
    return new;
  end if;
  select * into v_owner from public.owners where id = v_owner_id;
  if v_owner is null or v_owner.phone is null then
    return new;
  end if;

  v_template_key := case when new.transaction_type = 'sale' then 'sale_congratulations' else 'rental_congratulations' end;

  insert into public.scheduled_notifications (
    template_key, event_type, owner_id, recipient_name, recipient_phone, body,
    related_table, related_id, scheduled_for
  ) values (
    v_template_key, v_template_key, v_owner.id, v_owner.name, v_owner.phone,
    replace(replace(
      (select body_template from public.notification_templates where key = v_template_key),
      '{{owner_name}}', v_owner.name),
      '{{property_title}}', coalesce(v_property_title, 'your property')),
    'transactions', new.id, now()
  )
  on conflict (related_table, related_id, event_type) where status = 'pending' do nothing;

  return new;
end;
$$;

revoke execute on function public.transactions_schedule_congratulations() from public, anon, authenticated;

drop trigger if exists transactions_schedule_congratulations on public.transactions;
create trigger transactions_schedule_congratulations
  after update on public.transactions
  for each row execute function public.transactions_schedule_congratulations();

alter table public.notification_templates enable row level security;
create policy notification_templates_select on public.notification_templates for select to authenticated using (public.has_permission('settings', 'view') or public.has_permission('settings', 'manage'));
create policy notification_templates_write on public.notification_templates for all to authenticated
  using (public.has_permission('settings', 'manage')) with check (public.has_permission('settings', 'manage'));

alter table public.scheduled_notifications enable row level security;
create policy scheduled_notifications_select on public.scheduled_notifications for select to authenticated using (public.has_permission('settings', 'view') or public.has_permission('settings', 'manage') or public.has_permission('owners', 'view'));
create policy scheduled_notifications_write on public.scheduled_notifications for all to authenticated
  using (public.has_permission('settings', 'manage')) with check (public.has_permission('settings', 'manage'));
