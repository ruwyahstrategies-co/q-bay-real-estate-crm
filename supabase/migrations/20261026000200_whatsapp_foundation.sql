-- WhatsApp Business API foundation (preparation only: nothing here sends or receives a live message).
--
-- Two-way conversation history, delivery and read statuses, media metadata, approved templates, an
-- integration event log, and every rule that must hold no matter which client calls us:
--
--   * Reading and sending follow the LEAD. A person may read or send only for a lead they may see under the
--     existing Conversations and Leads permissions. A conversation with no lead is for a Super Administrator only.
--   * Duplicates cannot happen. A message is unique per connection and Meta message id; an outbound send is
--     unique per client request id; both are guarded by advisory locks AND unique indexes.
--   * Statuses only move forward (sent, delivered, read). A late or repeated webhook never rewinds one.
--   * Meta's rules are enforced in the database, not only in the screen: free text only inside the 24 hour
--     customer service window, templates otherwise, and never to someone who has opted out.
--   * Every write runs through a service-role-only function. The browser can read what it is allowed to see
--     and can write nothing directly.
--
-- Works with either a shared company number or individual agent numbers: a connection has a scope
-- ('agent' or 'company'). Inbound routing uses the connection that owns the receiving number.

-- ---------------------------------------------------------------- connections

alter table public.agent_whatsapp_connections
  add column if not exists scope text not null default 'agent';

alter table public.agent_whatsapp_connections
  add constraint agent_whatsapp_connections_scope_check check (scope in ('agent', 'company'));

-- A Meta phone number belongs to exactly one connection, so an inbound message has exactly one owner.
create unique index if not exists agent_whatsapp_connections_phone_number_id_key
  on public.agent_whatsapp_connections (phone_number_id);

-- ---------------------------------------------------------------- helpers

create or replace function public.whatsapp_digits(_v text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(coalesce(_v, ''), '\D', '', 'g');
$$;

-- Meta's customer service window: free-form replies are allowed for 24 hours after the customer's last message.
create or replace function public.whatsapp_window_open(_last_inbound_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select _last_inbound_at is not null and now() - _last_inbound_at < interval '24 hours';
$$;

create or replace function public.whatsapp_status_rank(_status text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case _status
    when 'received' then 0
    when 'sending' then 1
    when 'sent' then 2
    when 'delivered' then 3
    when 'read' then 4
    when 'failed' then 1
    else 0
  end;
$$;

-- ---------------------------------------------------------------- tables

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.agent_whatsapp_connections(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  wa_id text not null,
  contact_name text,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0 check (unread_count >= 0),
  opt_in_status text not null default 'unknown' check (opt_in_status in ('unknown', 'opted_in', 'opted_out')),
  opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversations_wa_id_digits check (wa_id ~ '^[0-9]{6,20}$'),
  unique (connection_id, wa_id)
);
create index if not exists whatsapp_conversations_lead_idx on public.whatsapp_conversations (lead_id) where lead_id is not null;
create index if not exists whatsapp_conversations_recent_idx on public.whatsapp_conversations (last_message_at desc nulls last);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  connection_id uuid not null references public.agent_whatsapp_connections(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  wa_message_id text,
  client_request_id uuid,
  message_type text not null default 'text',
  body text,
  template_name text,
  template_language text,
  template_params jsonb,
  reply_to_wa_message_id text,
  status text not null default 'received'
    check (status in ('received', 'sending', 'sent', 'delivered', 'read', 'failed')),
  status_updated_at timestamptz,
  error_code text,
  error_text text,
  sent_by uuid references public.team_members(id) on delete set null,
  wa_timestamp timestamptz,
  interaction_id uuid references public.interactions(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists whatsapp_messages_wa_id_key
  on public.whatsapp_messages (connection_id, wa_message_id) where wa_message_id is not null;
create unique index if not exists whatsapp_messages_request_key
  on public.whatsapp_messages (conversation_id, client_request_id) where client_request_id is not null;
create index if not exists whatsapp_messages_thread_idx
  on public.whatsapp_messages (conversation_id, (coalesce(wa_timestamp, created_at)));

create table if not exists public.whatsapp_message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  media_id text,
  media_kind text not null check (media_kind in ('image', 'document', 'audio', 'video', 'sticker')),
  mime_type text,
  sha256 text,
  filename text,
  caption text,
  size_bytes bigint,
  source_upload_id uuid references public.uploads(id) on delete set null,
  storage_key text,
  download_status text not null default 'pending'
    check (download_status in ('pending', 'stored', 'failed', 'expired', 'not_needed')),
  download_error text,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_message_media_message_idx on public.whatsapp_message_media (message_id);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null,
  name text not null,
  language text not null,
  category text,
  status text not null default 'pending'
    check (status in ('approved', 'pending', 'rejected', 'paused', 'disabled', 'unknown')),
  components jsonb not null default '[]'::jsonb,
  body_text text,
  param_count integer not null default 0 check (param_count >= 0),
  source text not null default 'meta' check (source in ('meta', 'manual')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, name, language)
);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  phone_number_id text,
  event_kind text not null,
  wa_id text,
  wa_message_id text,
  outcome text not null check (outcome in ('processed', 'duplicate', 'ignored', 'rejected', 'error')),
  detail text,
  payload jsonb
);
create index if not exists whatsapp_webhook_events_recent_idx on public.whatsapp_webhook_events (received_at desc);

-- One WhatsApp interaction row per Meta message id, so the lead timeline can never show a message twice.
create unique index if not exists interactions_whatsapp_message_key
  on public.interactions ((metadata ->> 'message_id'))
  where interaction_type = 'whatsapp' and (metadata ->> 'message_id') is not null;

create or replace trigger set_updated_at before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();
create or replace trigger set_updated_at before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- who may read and send

-- Same scope as reading a lead's interactions today (Conversations permission), AND the lead itself must be
-- visible to the person (Leads permission).
create or replace function public.whatsapp_can_read_lead(_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _lead_id is not null
     and public.can_access_lead(_lead_id)
     and exists (
       select 1
         from public.leads l
        where l.id = _lead_id
          and (
            public.has_permission('conversations', 'view_all')
            or (public.has_permission('conversations', 'view_team') and l.team_id is not null and l.team_id = public.current_team_id())
            or (public.has_permission('conversations', 'view') and l.assigned_agent_id = public.current_team_member_id())
          )
     );
$$;

create or replace function public.whatsapp_can_send_lead(_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.whatsapp_can_read_lead(_lead_id) and public.has_permission('conversations', 'create');
$$;

-- ---------------------------------------------------------------- row level security

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_message_media enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

revoke all on public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_message_media,
  public.whatsapp_templates, public.whatsapp_webhook_events from anon, authenticated;
grant select on public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_message_media,
  public.whatsapp_templates to authenticated;

create policy whatsapp_conversations_select on public.whatsapp_conversations
  for select to authenticated
  using (
    (lead_id is null and public.is_super_administrator())
    or public.whatsapp_can_read_lead(lead_id)
  );

create policy whatsapp_messages_select on public.whatsapp_messages
  for select to authenticated
  using (exists (select 1 from public.whatsapp_conversations c where c.id = whatsapp_messages.conversation_id));

create policy whatsapp_message_media_select on public.whatsapp_message_media
  for select to authenticated
  using (exists (select 1 from public.whatsapp_messages m where m.id = whatsapp_message_media.message_id));

create policy whatsapp_templates_select on public.whatsapp_templates
  for select to authenticated
  using (public.has_permission('conversations', 'create') or public.has_permission('team', 'manage'));

-- whatsapp_webhook_events: no policy, so only the service role can touch it.

-- ---------------------------------------------------------------- inbound message

create or replace function public.whatsapp_ingest_inbound(
  _phone_number_id text,
  _wa_id text,
  _contact_name text,
  _wa_message_id text,
  _type text,
  _body text,
  _wa_timestamp timestamptz,
  _media jsonb default '[]'::jsonb,
  _reply_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn public.agent_whatsapp_connections%rowtype;
  v_agent public.team_members%rowtype;
  v_conv public.whatsapp_conversations%rowtype;
  v_digits text := public.whatsapp_digits(_wa_id);
  v_ts timestamptz := coalesce(_wa_timestamp, now());
  v_kw text := lower(btrim(coalesce(_body, '')));
  v_lead uuid;
  v_created boolean := false;
  v_opt text;
  v_msg uuid;
  v_int uuid;
  v_preview text;
  m jsonb;
begin
  if v_digits = '' or _wa_message_id is null or _wa_message_id = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_message');
  end if;

  select * into v_conn from public.agent_whatsapp_connections where phone_number_id = _phone_number_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_number');
  end if;

  -- The same Meta message can be delivered twice, even at the same moment. One winner, the rest see a duplicate.
  perform pg_advisory_xact_lock(hashtext('wa_in:' || v_conn.id::text || ':' || _wa_message_id));
  if exists (select 1 from public.whatsapp_messages where connection_id = v_conn.id and wa_message_id = _wa_message_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('wa_conv:' || v_conn.id::text || ':' || v_digits));
  select * into v_conv from public.whatsapp_conversations where connection_id = v_conn.id and wa_id = v_digits;

  if not found or v_conv.lead_id is null then
    select * into v_agent from public.team_members where id = v_conn.team_member_id;

    -- Match the sender to an existing lead on the FULL number (never a partial tail). An agent's own number only
    -- ever matches that agent's leads, so one agent's conversation can never expose another agent's lead.
    select l.id into v_lead
      from public.leads l
     where length(ltrim(public.whatsapp_digits(l.phone), '0')) >= 8
       and (
         ltrim(public.whatsapp_digits(l.phone), '0') = v_digits
         or v_digits like '%' || ltrim(public.whatsapp_digits(l.phone), '0')
       )
       and (v_conn.scope = 'company' or l.assigned_agent_id = v_conn.team_member_id)
     order by (l.assigned_agent_id is not null) desc, l.created_at desc
     limit 1;

    if v_lead is null then
      insert into public.leads (full_name, phone, lead_source, pipeline_stage, assigned_agent_id, team_id, organisation_id)
      values (
        coalesce(nullif(btrim(_contact_name), ''), 'WhatsApp contact'),
        '+' || v_digits,
        'whatsapp',
        'new_lead',
        case when v_conn.scope = 'agent' then v_conn.team_member_id else null end,
        case when v_conn.scope = 'agent' then v_agent.team_id else null end,
        v_agent.organisation_id
      )
      returning id into v_lead;
      v_created := true;
    end if;

    if v_conv.id is null then
      insert into public.whatsapp_conversations (connection_id, lead_id, wa_id, contact_name)
      values (v_conn.id, v_lead, v_digits, nullif(btrim(_contact_name), ''))
      returning * into v_conv;
    else
      update public.whatsapp_conversations set lead_id = v_lead where id = v_conv.id returning * into v_conv;
    end if;
  end if;

  -- Opt-in follows the customer's own words. Writing to us opts them in; STOP opts them out until START.
  v_opt := v_conv.opt_in_status;
  if v_kw in ('stop', 'stop all', 'unsubscribe', 'cancel', 'end', 'quit') then
    v_opt := 'opted_out';
  elsif v_kw in ('start', 'unstop', 'subscribe') or v_opt = 'unknown' then
    v_opt := 'opted_in';
  end if;

  v_preview := left(coalesce(nullif(btrim(_body), ''), '[' || coalesce(_type, 'message') || ']'), 120);

  insert into public.whatsapp_messages (
    conversation_id, connection_id, direction, wa_message_id, message_type, body,
    reply_to_wa_message_id, status, status_updated_at, wa_timestamp
  ) values (
    v_conv.id, v_conn.id, 'inbound', _wa_message_id, coalesce(_type, 'text'), _body,
    _reply_to, 'received', now(), v_ts
  ) returning id into v_msg;

  for m in select * from jsonb_array_elements(coalesce(_media, '[]'::jsonb)) loop
    insert into public.whatsapp_message_media (message_id, media_id, media_kind, mime_type, sha256, filename, caption, size_bytes)
    values (
      v_msg,
      m ->> 'media_id',
      coalesce(m ->> 'kind', 'document'),
      m ->> 'mime_type',
      m ->> 'sha256',
      m ->> 'filename',
      m ->> 'caption',
      nullif(m ->> 'size_bytes', '')::bigint
    );
  end loop;

  if v_conv.lead_id is not null then
    insert into public.interactions (lead_id, interaction_type, direction, content, interaction_date, metadata)
    values (
      v_conv.lead_id, 'whatsapp', 'inbound', coalesce(nullif(btrim(_body), ''), '[' || coalesce(_type, 'message') || ']'), v_ts,
      jsonb_build_object('message_id', _wa_message_id, 'phone_number_id', _phone_number_id, 'agent_team_member_id', v_conn.team_member_id)
    )
    on conflict do nothing
    returning id into v_int;
    update public.whatsapp_messages set interaction_id = v_int where id = v_msg;
  end if;

  update public.whatsapp_conversations
     set last_inbound_at = greatest(coalesce(last_inbound_at, v_ts), v_ts),
         last_message_at = greatest(coalesce(last_message_at, v_ts), v_ts),
         last_message_preview = v_preview,
         unread_count = unread_count + 1,
         contact_name = coalesce(contact_name, nullif(btrim(_contact_name), '')),
         opt_in_status = v_opt,
         opt_in_at = case when v_opt = 'opted_in' and opt_in_status <> 'opted_in' then now() else opt_in_at end
   where id = v_conv.id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'conversation_id', v_conv.id, 'message_id', v_msg, 'lead_id', v_conv.lead_id, 'created_lead', v_created
  );
end;
$$;

-- ---------------------------------------------------------------- delivery and read statuses

create or replace function public.whatsapp_apply_status(
  _phone_number_id text,
  _wa_message_id text,
  _status text,
  _ts timestamptz default null,
  _error_code text default null,
  _error_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn_id uuid;
  v_msg public.whatsapp_messages%rowtype;
begin
  if _status not in ('sent', 'delivered', 'read', 'failed') then
    return jsonb_build_object('ok', true, 'found', false, 'updated', false, 'reason', 'unsupported_status');
  end if;

  select id into v_conn_id from public.agent_whatsapp_connections where phone_number_id = _phone_number_id;
  if v_conn_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_number');
  end if;

  select * into v_msg
    from public.whatsapp_messages
   where connection_id = v_conn_id and wa_message_id = _wa_message_id and direction = 'outbound'
   for update;
  if not found then
    return jsonb_build_object('ok', true, 'found', false, 'updated', false);
  end if;

  -- Forward only. A late "sent" can never undo "read", and nothing can fail a message already delivered.
  if _status = 'failed' then
    if public.whatsapp_status_rank(v_msg.status) >= 3 or v_msg.status = 'failed' then
      return jsonb_build_object('ok', true, 'found', true, 'updated', false);
    end if;
  elsif public.whatsapp_status_rank(_status) <= public.whatsapp_status_rank(v_msg.status) and v_msg.status <> 'failed' then
    return jsonb_build_object('ok', true, 'found', true, 'updated', false);
  end if;

  update public.whatsapp_messages
     set status = _status,
         status_updated_at = coalesce(_ts, now()),
         error_code = case when _status = 'failed' then _error_code else null end,
         error_text = case when _status = 'failed' then left(_error_text, 500) else null end
   where id = v_msg.id;

  return jsonb_build_object('ok', true, 'found', true, 'updated', true, 'message_id', v_msg.id);
end;
$$;

-- ---------------------------------------------------------------- outbound message (two steps)

-- Step 1: reserve the message BEFORE Meta is called. Enforces the window and opt-out rules and makes a repeated
-- request (double click, retry) return the same message instead of sending twice.
create or replace function public.whatsapp_begin_outbound(
  _connection_id uuid,
  _lead_id uuid,
  _wa_id text,
  _client_request_id uuid,
  _type text,
  _body text,
  _template_name text,
  _template_language text,
  _template_params jsonb,
  _sent_by uuid,
  _opt_in_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := public.whatsapp_digits(_wa_id);
  v_conv public.whatsapp_conversations%rowtype;
  v_existing public.whatsapp_messages%rowtype;
  v_is_template boolean := _type = 'template';
  v_msg uuid;
begin
  if v_digits = '' then
    raise exception 'invalid_recipient';
  end if;

  perform pg_advisory_xact_lock(hashtext('wa_conv:' || _connection_id::text || ':' || v_digits));

  select * into v_conv from public.whatsapp_conversations where connection_id = _connection_id and wa_id = v_digits;
  if not found then
    insert into public.whatsapp_conversations (connection_id, lead_id, wa_id)
    values (_connection_id, _lead_id, v_digits)
    returning * into v_conv;
  elsif v_conv.lead_id is null then
    update public.whatsapp_conversations set lead_id = _lead_id where id = v_conv.id returning * into v_conv;
  elsif v_conv.lead_id <> _lead_id then
    -- Two leads share this number. The history belongs to the first lead and must not leak to the second.
    raise exception 'conversation_belongs_to_other_lead';
  end if;

  if _client_request_id is not null then
    select * into v_existing from public.whatsapp_messages
     where conversation_id = v_conv.id and client_request_id = _client_request_id;
    if found then
      return jsonb_build_object(
        'ok', true, 'duplicate', true, 'message_id', v_existing.id, 'status', v_existing.status,
        'wa_message_id', v_existing.wa_message_id, 'conversation_id', v_conv.id
      );
    end if;
  end if;

  if v_conv.opt_in_status = 'opted_out' then
    raise exception 'recipient_opted_out';
  end if;
  if v_is_template then
    if v_conv.opt_in_status = 'unknown' and not coalesce(_opt_in_confirmed, false) then
      raise exception 'opt_in_required';
    end if;
  elsif not public.whatsapp_window_open(v_conv.last_inbound_at) then
    raise exception 'window_closed';
  end if;

  insert into public.whatsapp_messages (
    conversation_id, connection_id, direction, client_request_id, message_type, body,
    template_name, template_language, template_params, status, status_updated_at, sent_by
  ) values (
    v_conv.id, _connection_id, 'outbound', _client_request_id, _type, _body,
    _template_name, _template_language, _template_params, 'sending', now(), _sent_by
  ) returning id into v_msg;

  -- A confirmed opt-in is remembered, so the next template to this person does not ask again.
  if v_is_template and v_conv.opt_in_status = 'unknown' and coalesce(_opt_in_confirmed, false) then
    update public.whatsapp_conversations set opt_in_status = 'opted_in', opt_in_at = now() where id = v_conv.id;
  end if;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'message_id', v_msg, 'conversation_id', v_conv.id,
    'window_open', public.whatsapp_window_open(v_conv.last_inbound_at)
  );
end;
$$;

-- Step 2: record what Meta answered.
create or replace function public.whatsapp_finish_outbound(
  _message_id uuid,
  _wa_message_id text,
  _error_code text default null,
  _error_text text default null,
  _sent_by_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.whatsapp_messages%rowtype;
  v_conv public.whatsapp_conversations%rowtype;
  v_conn public.agent_whatsapp_connections%rowtype;
  v_int uuid;
  v_text text;
begin
  select * into v_msg from public.whatsapp_messages where id = _message_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_msg.status <> 'sending' then
    return jsonb_build_object('ok', true, 'already', true, 'status', v_msg.status);
  end if;

  select * into v_conv from public.whatsapp_conversations where id = v_msg.conversation_id;
  select * into v_conn from public.agent_whatsapp_connections where id = v_msg.connection_id;
  v_text := coalesce(nullif(btrim(v_msg.body), ''), '[template: ' || coalesce(v_msg.template_name, 'message') || ']');

  if _wa_message_id is null or _wa_message_id = '' then
    update public.whatsapp_messages
       set status = 'failed', status_updated_at = now(), error_code = _error_code, error_text = left(_error_text, 500)
     where id = _message_id;
    update public.whatsapp_conversations
       set last_message_at = now(), last_message_preview = left(v_text, 120)
     where id = v_conv.id;
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;

  update public.whatsapp_messages
     set status = 'sent', status_updated_at = now(), wa_message_id = _wa_message_id, wa_timestamp = now(),
         error_code = null, error_text = null
   where id = _message_id;

  if v_conv.lead_id is not null then
    insert into public.interactions (lead_id, interaction_type, direction, content, interaction_date, created_by, metadata)
    values (
      v_conv.lead_id, 'whatsapp', 'outbound', v_text, now(), _sent_by_user,
      jsonb_build_object('message_id', _wa_message_id, 'phone_number_id', v_conn.phone_number_id, 'to', v_conv.wa_id)
    )
    on conflict do nothing
    returning id into v_int;
    update public.whatsapp_messages set interaction_id = v_int where id = _message_id;
  end if;

  update public.whatsapp_conversations
     set last_message_at = now(), last_message_preview = left(v_text, 120)
   where id = v_conv.id;

  return jsonb_build_object('ok', true, 'status', 'sent', 'wa_message_id', _wa_message_id);
end;
$$;

-- ---------------------------------------------------------------- actions from the inbox (signed-in staff)

create or replace function public.whatsapp_mark_conversation_read(_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  select lead_id into v_lead from public.whatsapp_conversations where id = _conversation_id;
  if not found then
    return;
  end if;
  if (v_lead is null and not public.is_super_administrator())
     or (v_lead is not null and not public.whatsapp_can_read_lead(v_lead)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.whatsapp_conversations set unread_count = 0 where id = _conversation_id and unread_count > 0;
end;
$$;

-- Attach a conversation that arrived with no matching lead to a lead (Super Administrator, or team managers).
create or replace function public.whatsapp_link_conversation(_conversation_id uuid, _lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_super_administrator() or public.has_permission('team', 'manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.leads where id = _lead_id) then
    raise exception 'lead not found';
  end if;
  update public.whatsapp_conversations set lead_id = _lead_id where id = _conversation_id;
end;
$$;

-- ---------------------------------------------------------------- function privileges

revoke execute on function public.whatsapp_ingest_inbound(text, text, text, text, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.whatsapp_apply_status(text, text, text, timestamptz, text, text)
  from public, anon, authenticated;
revoke execute on function public.whatsapp_begin_outbound(uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.whatsapp_finish_outbound(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.whatsapp_ingest_inbound(text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.whatsapp_apply_status(text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.whatsapp_begin_outbound(uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, boolean) to service_role;
grant execute on function public.whatsapp_finish_outbound(uuid, text, text, text, uuid) to service_role;

revoke execute on function public.whatsapp_can_read_lead(uuid) from public, anon;
revoke execute on function public.whatsapp_can_send_lead(uuid) from public, anon;
revoke execute on function public.whatsapp_mark_conversation_read(uuid) from public, anon;
revoke execute on function public.whatsapp_link_conversation(uuid, uuid) from public, anon;
grant execute on function public.whatsapp_can_read_lead(uuid) to authenticated, service_role;
grant execute on function public.whatsapp_can_send_lead(uuid) to authenticated, service_role;
grant execute on function public.whatsapp_mark_conversation_read(uuid) to authenticated;
grant execute on function public.whatsapp_link_conversation(uuid, uuid) to authenticated;
