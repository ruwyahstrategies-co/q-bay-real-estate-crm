-- Bulk Reassign / Archive / Delete for Leads and Owners, and a Super Administrator reassignment
-- permission.
--
--   * "reassign" is a new, explicit permission action on leads and owners. It is granted to the
--     Super Administrator accounts only. It is separate from the ordinary "assign" action, which
--     agents use for one lead at a time and which is unchanged.
--   * Owners get a real archive state (status / archived_at / archived_by). Archive is not Delete.
--   * Permanent delete refuses any record that still has linked business history, instead of
--     letting the database cascade-delete it. Archive is the safe alternative.
--   * Reassignments are recorded in assignment_events, with the previous and new agent.

-- 1. Grant the new action to Super Administrators (stored permissions are authoritative).
update public.team_members
   set permissions = jsonb_set(
         coalesce(permissions, '{}'::jsonb),
         '{leads}',
         coalesce(permissions -> 'leads', '[]'::jsonb) || '["reassign"]'::jsonb
       )
 where role = 'super_administrator'
   and not (coalesce(permissions -> 'leads', '[]'::jsonb) ? 'reassign');

update public.team_members
   set permissions = jsonb_set(
         coalesce(permissions, '{}'::jsonb),
         '{owners}',
         coalesce(permissions -> 'owners', '[]'::jsonb) || '["reassign"]'::jsonb
       )
 where role = 'super_administrator'
   and not (coalesce(permissions -> 'owners', '[]'::jsonb) ? 'reassign');

-- 2. Owner archive state.
alter table public.owners
  add column if not exists status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.team_members (id) on delete set null;

alter table public.owners
  add constraint owners_status_check check (status in ('active', 'archived'));

create index if not exists owners_status_idx on public.owners (status);

-- Owners are read through an explicit column list (phone / id_number are never granted), so the
-- new non-private columns need their own SELECT grant.
grant select (status, archived_at, archived_by) on public.owners to authenticated;

-- 3. Reassignment history.
create table if not exists public.assignment_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'owner')),
  entity_id uuid not null,
  from_agent_id uuid,
  to_agent_id uuid,
  actor_user_id uuid,
  actor_team_member_id uuid,
  batch_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists assignment_events_entity_idx on public.assignment_events (entity_type, entity_id, created_at desc);

alter table public.assignment_events enable row level security;

create policy assignment_events_select on public.assignment_events
  for select to authenticated
  using (
    (entity_type = 'lead' and exists (select 1 from public.leads l where l.id = assignment_events.entity_id))
    or (entity_type = 'owner' and public.has_permission('owners', 'view'))
  );

revoke all on public.assignment_events from anon, authenticated;
grant select on public.assignment_events to authenticated;

-- 4. Bulk reassign: Super Administrator only (explicit "reassign" permission, checked here).
create or replace function public.bulk_reassign_leads(_ids uuid[], _to_agent_id uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_member uuid := public.current_team_member_id();
  v_team uuid;
  v_changed integer := 0;
  v_same integer := 0;
  r record;
begin
  if auth.uid() is null or not public.has_permission('leads', 'reassign') then
    raise exception 'Only a Super Administrator can reassign leads.' using errcode = '42501';
  end if;
  if _to_agent_id is null then
    raise exception 'Choose the agent who should take over these leads.' using errcode = '22023';
  end if;
  if coalesce(cardinality(_ids), 0) = 0 then
    raise exception 'Select at least one lead.' using errcode = '22023';
  end if;
  if cardinality(_ids) > 500 then
    raise exception 'Reassign at most 500 leads at a time.' using errcode = '22023';
  end if;

  select tm.team_id into v_team
    from public.team_members tm
   where tm.id = _to_agent_id and coalesce(tm.is_active, true);
  if not found then
    raise exception 'That agent could not be found, or is no longer active.' using errcode = '22023';
  end if;

  for r in
    select l.id, l.assigned_agent_id
      from public.leads l
     where l.id = any (_ids)
     order by l.id
       for update
  loop
    if r.assigned_agent_id is not distinct from _to_agent_id then
      v_same := v_same + 1;
      continue;
    end if;

    -- The new agent's team becomes the lead's team, so team visibility follows the lead.
    update public.leads set assigned_agent_id = _to_agent_id, team_id = v_team where id = r.id;

    insert into public.assignment_events (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason)
    values ('lead', r.id, r.assigned_agent_id, _to_agent_id, auth.uid(), v_member, v_batch, left(nullif(btrim(coalesce(_reason, '')), ''), 500));

    v_changed := v_changed + 1;
  end loop;

  return jsonb_build_object(
    'requested', cardinality(_ids),
    'reassigned', v_changed,
    'unchanged', v_same,
    'missing', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(_ids) x where not exists (select 1 from public.leads where id = x)),
    'batch_id', v_batch
  );
end;
$$;

create or replace function public.bulk_reassign_owners(_ids uuid[], _to_agent_id uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_member uuid := public.current_team_member_id();
  v_changed integer := 0;
  v_same integer := 0;
  r record;
begin
  if auth.uid() is null or not public.has_permission('owners', 'reassign') then
    raise exception 'Only a Super Administrator can reassign owners.' using errcode = '42501';
  end if;
  if _to_agent_id is null then
    raise exception 'Choose the agent who should take over these owners.' using errcode = '22023';
  end if;
  if coalesce(cardinality(_ids), 0) = 0 then
    raise exception 'Select at least one owner.' using errcode = '22023';
  end if;
  if cardinality(_ids) > 500 then
    raise exception 'Reassign at most 500 owners at a time.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.team_members tm where tm.id = _to_agent_id and coalesce(tm.is_active, true)) then
    raise exception 'That agent could not be found, or is no longer active.' using errcode = '22023';
  end if;

  for r in
    select o.id, o.assigned_agent_id
      from public.owners o
     where o.id = any (_ids)
     order by o.id
       for update
  loop
    if r.assigned_agent_id is not distinct from _to_agent_id then
      v_same := v_same + 1;
      continue;
    end if;

    update public.owners set assigned_agent_id = _to_agent_id where id = r.id;

    insert into public.assignment_events (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason)
    values ('owner', r.id, r.assigned_agent_id, _to_agent_id, auth.uid(), v_member, v_batch, left(nullif(btrim(coalesce(_reason, '')), ''), 500));

    v_changed := v_changed + 1;
  end loop;

  return jsonb_build_object(
    'requested', cardinality(_ids),
    'reassigned', v_changed,
    'unchanged', v_same,
    'missing', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(_ids) x where not exists (select 1 from public.owners where id = x)),
    'batch_id', v_batch
  );
end;
$$;

-- 5. Bulk archive / restore. SECURITY INVOKER: row-level security decides what the caller can touch.
create or replace function public.bulk_archive_leads(_ids uuid[], _archive boolean default true)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_target text := case when _archive then 'archived' else 'active' end;
  v_changed integer;
  v_visible integer;
begin
  if not public.has_permission('leads', 'edit') then
    raise exception 'You do not have permission to archive leads.' using errcode = '42501';
  end if;
  if coalesce(cardinality(_ids), 0) = 0 then
    raise exception 'Select at least one lead.' using errcode = '22023';
  end if;
  if cardinality(_ids) > 500 then
    raise exception 'Change at most 500 leads at a time.' using errcode = '22023';
  end if;

  select count(*) into v_visible from public.leads where id = any (_ids);

  with changed as (
    update public.leads
       set status = v_target,
           archived_at = case when _archive then now() else null end
     where id = any (_ids)
       and status is distinct from v_target
    returning id
  )
  select count(*) into v_changed from changed;

  return jsonb_build_object(
    'requested', cardinality(_ids),
    'changed', v_changed,
    'unchanged', v_visible - v_changed,
    'inaccessible', cardinality(_ids) - v_visible
  );
end;
$$;

create or replace function public.bulk_archive_owners(_ids uuid[], _archive boolean default true)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_target text := case when _archive then 'archived' else 'active' end;
  v_changed integer;
  v_visible integer;
begin
  if not public.has_permission('owners', 'edit') then
    raise exception 'You do not have permission to archive owners.' using errcode = '42501';
  end if;
  if coalesce(cardinality(_ids), 0) = 0 then
    raise exception 'Select at least one owner.' using errcode = '22023';
  end if;
  if cardinality(_ids) > 500 then
    raise exception 'Change at most 500 owners at a time.' using errcode = '22023';
  end if;

  select count(*) into v_visible from public.owners where id = any (_ids);

  with changed as (
    update public.owners
       set status = v_target,
           archived_at = case when _archive then now() else null end,
           archived_by = case when _archive then public.current_team_member_id() else null end
     where id = any (_ids)
       and status is distinct from v_target
    returning id
  )
  select count(*) into v_changed from changed;

  return jsonb_build_object(
    'requested', cardinality(_ids),
    'changed', v_changed,
    'unchanged', v_visible - v_changed,
    'inaccessible', cardinality(_ids) - v_visible
  );
end;
$$;

-- 6. Bulk delete. A record that still has linked business history is NOT deleted (the foreign keys
-- would cascade-delete that history or detach it). It is reported back with what is linked, and the
-- caller is pointed at Archive. SECURITY DEFINER only so the link counts see every row; access is
-- checked explicitly (permission + the caller must be able to see the record).
create or replace function public.bulk_delete_leads(_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_links jsonb;
  v_deleted uuid[] := '{}';
  v_blocked jsonb := '[]'::jsonb;
  v_inaccessible integer := 0;
begin
  if auth.uid() is null or not public.has_permission('leads', 'delete') then
    raise exception 'You do not have permission to delete leads.' using errcode = '42501';
  end if;
  if coalesce(cardinality(_ids), 0) = 0 then
    raise exception 'Select at least one lead.' using errcode = '22023';
  end if;
  if cardinality(_ids) > 500 then
    raise exception 'Delete at most 500 leads at a time.' using errcode = '22023';
  end if;

  for r in select l.id, l.full_name, l.converted_owner_id from public.leads l where l.id = any (_ids) order by l.id for update loop
    if not public.can_access_lead(r.id) then
      v_inaccessible := v_inaccessible + 1;
      continue;
    end if;

    v_links := jsonb_strip_nulls(jsonb_build_object(
      'viewings', nullif((select count(*) from public.viewings where lead_id = r.id), 0),
      'tasks', nullif((select count(*) from public.tasks where lead_id = r.id), 0),
      'conversations', nullif((select count(*) from public.interactions where lead_id = r.id), 0),
      'offers', nullif((select count(*) from public.offers where lead_id = r.id), 0),
      'notes', nullif((select count(*) from public.lead_notes where lead_id = r.id), 0),
      'ai_analyses', nullif((select count(*) from public.ai_analyses where lead_id = r.id), 0),
      'transactions', nullif((select count(*) from public.transactions where lead_id = r.id), 0),
      'invoices', nullif((select count(*) from public.invoices where lead_id = r.id), 0),
      'shared_properties', nullif((select count(*) from public.property_shares where lead_id = r.id), 0),
      'files', nullif((select count(*) from public.uploads where lead_id = r.id), 0),
      'website_enquiries', nullif((select count(*) from public.website_enquiries where lead_id = r.id), 0),
      'owner_conversion', case when r.converted_owner_id is not null
                                or exists (select 1 from public.owners where source_lead_id = r.id) then 1 end
    ));

    if v_links <> '{}'::jsonb then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object('id', r.id, 'name', r.full_name, 'linked', v_links));
      continue;
    end if;

    begin
      delete from public.leads where id = r.id;
      v_deleted := v_deleted || r.id;
    exception when foreign_key_violation then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object('id', r.id, 'name', r.full_name, 'linked', jsonb_build_object('other_records', 1)));
    end;
  end loop;

  return jsonb_build_object(
    'requested', cardinality(_ids),
    'deleted', cardinality(v_deleted),
    'deleted_ids', to_jsonb(v_deleted),
    'blocked', v_blocked,
    'inaccessible', v_inaccessible + (cardinality(_ids) - (select count(*) from public.leads where id = any (_ids)) - cardinality(v_deleted))
  );
end;
$$;

create or replace function public.bulk_delete_owners(_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_links jsonb;
  v_deleted uuid[] := '{}';
  v_blocked jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.has_permission('owners', 'delete') then
    raise exception 'You do not have permission to delete owners.' using errcode = '42501';
  end if;
  if coalesce(cardinality(_ids), 0) = 0 then
    raise exception 'Select at least one owner.' using errcode = '22023';
  end if;
  if cardinality(_ids) > 500 then
    raise exception 'Delete at most 500 owners at a time.' using errcode = '22023';
  end if;

  for r in select o.id, o.name from public.owners o where o.id = any (_ids) order by o.id for update loop
    v_links := jsonb_strip_nulls(jsonb_build_object(
      'properties', nullif((select count(*) from public.properties where owner_id = r.id), 0),
      'developments', nullif((select count(*) from public.developments where owner_id = r.id), 0),
      'contracts', nullif((select count(*) from public.owner_contracts where owner_id = r.id), 0),
      'conversations', nullif((select count(*) from public.interactions where owner_id = r.id), 0),
      'tasks', nullif((select count(*) from public.tasks where owner_id = r.id), 0),
      'transactions', nullif((select count(*) from public.transactions where seller_owner_id = r.id), 0),
      'invoices', nullif((select count(*) from public.invoices where owner_id = r.id), 0),
      'submissions', nullif((select count(*) from public.property_submissions where owner_id = r.id), 0),
      'files', nullif((select count(*) from public.uploads where owner_id = r.id), 0),
      'scheduled_messages', nullif((select count(*) from public.scheduled_notifications where owner_id = r.id), 0),
      'converted_from_lead', nullif((select count(*) from public.leads where converted_owner_id = r.id), 0)
    ));

    if v_links <> '{}'::jsonb then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object('id', r.id, 'name', r.name, 'linked', v_links));
      continue;
    end if;

    begin
      delete from public.owners where id = r.id;
      v_deleted := v_deleted || r.id;
    exception when foreign_key_violation then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object('id', r.id, 'name', r.name, 'linked', jsonb_build_object('other_records', 1)));
    end;
  end loop;

  return jsonb_build_object(
    'requested', cardinality(_ids),
    'deleted', cardinality(v_deleted),
    'deleted_ids', to_jsonb(v_deleted),
    'blocked', v_blocked,
    'inaccessible', cardinality(_ids) - (select count(*) from public.owners where id = any (_ids)) - cardinality(v_deleted)
  );
end;
$$;

-- Owner pickers and typeahead search offer active owners only. (The Owners page filters archived
-- owners in and out itself.)
create or replace function public.search_owners(_query text, _limit integer default 8)
returns table(id uuid, name text, company text, code text, phone text, phone_hidden boolean)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.name,
         o.company,
         o.code::text,
         case when public.can_view_owner_phone(o.id) then o.phone else null end,
         not public.can_view_owner_phone(o.id)
    from public.owners o
   where public.has_permission('owners', 'view')
     and o.status = 'active'
     and length(trim(coalesce(_query, ''))) >= 2
     and (
       o.name ilike '%' || trim(_query) || '%'
       or o.company ilike '%' || trim(_query) || '%'
       or o.code::text ilike '%' || trim(_query) || '%'
       or (public.can_view_owner_phone(o.id) and o.phone ilike '%' || trim(_query) || '%')
     )
   order by o.name
   limit least(coalesce(_limit, 8), 25);
$$;

revoke all on function public.bulk_reassign_leads(uuid[], uuid, text) from public, anon;
revoke all on function public.bulk_reassign_owners(uuid[], uuid, text) from public, anon;
revoke all on function public.bulk_archive_leads(uuid[], boolean) from public, anon;
revoke all on function public.bulk_archive_owners(uuid[], boolean) from public, anon;
revoke all on function public.bulk_delete_leads(uuid[]) from public, anon;
revoke all on function public.bulk_delete_owners(uuid[]) from public, anon;
grant execute on function public.bulk_reassign_leads(uuid[], uuid, text) to authenticated;
grant execute on function public.bulk_reassign_owners(uuid[], uuid, text) to authenticated;
grant execute on function public.bulk_archive_leads(uuid[], boolean) to authenticated;
grant execute on function public.bulk_archive_owners(uuid[], boolean) to authenticated;
grant execute on function public.bulk_delete_leads(uuid[]) to authenticated;
grant execute on function public.bulk_delete_owners(uuid[]) to authenticated;
