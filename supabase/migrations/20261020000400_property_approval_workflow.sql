-- Property approval workflow.
--
-- Properties added by agents wait for an Administrator or Super Administrator. Approval and website
-- publication are SEPARATE: approval makes a property eligible, is_published still decides whether it
-- appears. Nothing unapproved can reach the public website, whatever is_published says.
--
--   * "approve" is a new explicit action on properties, granted to Administrator and Super Administrator
--     accounts. Stored team_members.permissions stay the authority.
--   * Every property that exists today is backfilled as APPROVED, so live listings, galleries,
--     references and publication state are untouched. The column default for NEW rows is 'pending'
--     (fail closed): any creation path, including ones that do not know about approvals, produces a
--     pending property, never a silently live one.
--   * The trigger below is the enforcement point, so the UI, imports, direct API calls and any other
--     path all behave the same. Approval fields cannot be edited directly. They change only through
--     review_property() / resubmit_property(), or the automatic re-review described next.
--   * Re-review: if someone WITHOUT approval rights changes the commercial identity of an approved
--     property (price, currency, purpose, owner, development, type), it goes back to pending and is
--     hidden from the public site until re-approved. The is_published flag itself is left as it was, so
--     approving again restores the listing. Ordinary edits (photos, description, availability, etc.) do
--     not trigger review.

-- 1. Permission: Administrator and Super Administrator accounts may approve.
update public.team_members
   set permissions = jsonb_set(
         coalesce(permissions, '{}'::jsonb),
         '{properties}',
         coalesce(permissions -> 'properties', '[]'::jsonb) || '["approve"]'::jsonb
       )
 where role in ('administrator', 'super_administrator')
   and not (coalesce(permissions -> 'properties', '[]'::jsonb) ? 'approve');

-- 2. Columns. Added with default 'approved' so every existing row is backfilled as approved, then the
-- default for new rows is switched to 'pending'.
alter table public.properties
  add column if not exists approval_status text not null default 'approved',
  add column if not exists submitted_by uuid references public.team_members (id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references public.team_members (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.properties
  add constraint properties_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected', 'changes_requested'));

alter table public.properties alter column approval_status set default 'pending';

create index if not exists properties_approval_status_idx
  on public.properties (approval_status) where approval_status <> 'approved';

-- 3. Review history (decisions, reasons, who and when).
create table if not exists public.property_approval_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  action text not null check (action in (
    'submitted', 'auto_approved', 'approved', 'rejected', 'changes_requested', 'resubmitted', 'edited_after_approval'
  )),
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid,
  actor_team_member_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists property_approval_events_property_idx
  on public.property_approval_events (property_id, created_at desc);

alter table public.property_approval_events enable row level security;

create policy property_approval_events_select on public.property_approval_events
  for select to authenticated
  using (public.has_permission('properties', 'view'));

revoke all on public.property_approval_events from anon, authenticated;
grant select on public.property_approval_events to authenticated;

-- 4. Enforcement.
create or replace function public.properties_enforce_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me uuid;
  v_can_approve boolean;
  v_can_publish boolean;
  v_review_mode boolean := coalesce(current_setting('app.property_review', true), '') = 'on';
  v_material boolean;
begin
  -- Service-role writes (edge functions, maintenance) carry no signed-in user: leave the row as supplied.
  -- A new row from such a path still defaults to 'pending', which keeps it off the public site.
  if v_uid is null then
    return new;
  end if;

  v_me := public.current_team_member_id();
  v_can_approve := public.has_permission('properties', 'approve');
  v_can_publish := public.has_permission('properties', 'publish');

  if tg_op = 'INSERT' then
    if v_can_approve then
      new.approval_status := 'approved';
      new.submitted_by := v_me;
      new.submitted_at := now();
      new.reviewed_by := v_me;
      new.reviewed_at := now();
    else
      new.approval_status := 'pending';
      new.submitted_by := v_me;
      new.submitted_at := now();
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
    if coalesce(new.is_published, false) and (new.approval_status <> 'approved' or not v_can_publish) then
      new.is_published := false;
    end if;
    return new;
  end if;

  -- UPDATE. Approval bookkeeping is not editable by hand.
  if not v_review_mode then
    new.approval_status := old.approval_status;
    new.submitted_by := old.submitted_by;
    new.submitted_at := old.submitted_at;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;

    if not v_can_approve and old.approval_status = 'approved' then
      v_material :=
        new.price is distinct from old.price
        or new.currency is distinct from old.currency
        or new.purpose is distinct from old.purpose
        or new.owner_id is distinct from old.owner_id
        or new.development_id is distinct from old.development_id
        or new.property_type is distinct from old.property_type;
      if v_material then
        new.approval_status := 'pending';
        new.submitted_by := v_me;
        new.submitted_at := now();
        new.reviewed_by := null;
        new.reviewed_at := null;
      end if;
    end if;
  end if;

  -- Switching publication ON needs the publish permission AND an approved property.
  if coalesce(new.is_published, false) and not coalesce(old.is_published, false) then
    if new.approval_status <> 'approved' then
      raise exception 'This property must be approved before it can be published to the website.'
        using errcode = '42501';
    end if;
    if not v_can_publish then
      raise exception 'You do not have permission to publish properties.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace trigger properties_enforce_approval
  before insert or update on public.properties
  for each row execute function public.properties_enforce_approval();

create or replace function public.properties_log_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(current_setting('app.property_review_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.property_approval_events (property_id, action, to_status, actor_user_id, actor_team_member_id)
    values (new.id, case when new.approval_status = 'approved' then 'auto_approved' else 'submitted' end,
            new.approval_status, auth.uid(), public.current_team_member_id());
  elsif new.approval_status is distinct from old.approval_status then
    insert into public.property_approval_events (property_id, action, from_status, to_status, note, actor_user_id, actor_team_member_id)
    values (
      new.id,
      case new.approval_status
        when 'approved' then 'approved'
        when 'rejected' then 'rejected'
        when 'changes_requested' then 'changes_requested'
        else case when old.approval_status = 'approved' then 'edited_after_approval' else 'resubmitted' end
      end,
      old.approval_status, new.approval_status, v_note, auth.uid(), public.current_team_member_id()
    );
  end if;
  return null;
end;
$$;

create or replace trigger properties_log_approval
  after insert or update on public.properties
  for each row execute function public.properties_log_approval();

-- 5. Review actions.
create or replace function public.review_property(_property_id uuid, _decision text, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  p record;
  v_status text;
begin
  if auth.uid() is null or not public.has_permission('properties', 'approve') then
    raise exception 'Only an Administrator or Super Administrator can review properties.' using errcode = '42501';
  end if;
  if _decision not in ('approve', 'reject', 'return') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  if _decision in ('reject', 'return') and nullif(btrim(coalesce(_note, '')), '') is null then
    raise exception 'Add a reason so the agent knows what to fix.' using errcode = '22023';
  end if;

  select id, approval_status, submitted_by into p from public.properties where id = _property_id for update;
  if not found then
    raise exception 'That property could not be found.' using errcode = 'P0002';
  end if;

  v_status := case _decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;

  if _decision = 'approve' then
    if p.approval_status = 'approved' then
      raise exception 'This property is already approved.' using errcode = '23514';
    end if;
    -- Nobody approves their own submission.
    if p.submitted_by is not null and p.submitted_by = v_me then
      raise exception 'You cannot approve a property you submitted yourself. Ask another Administrator.' using errcode = '42501';
    end if;
  elsif p.approval_status not in ('pending', 'approved') then
    raise exception 'This property is not waiting for review.' using errcode = '23514';
  end if;

  perform set_config('app.property_review', 'on', true);
  perform set_config('app.property_review_note', coalesce(btrim(_note), ''), true);

  update public.properties
     set approval_status = v_status, reviewed_by = v_me, reviewed_at = now()
   where id = _property_id;

  perform set_config('app.property_review', 'off', true);
  perform set_config('app.property_review_note', '', true);

  return jsonb_build_object('property_id', _property_id, 'approval_status', v_status);
end;
$$;

create or replace function public.resubmit_property(_property_id uuid, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  p record;
begin
  if auth.uid() is null or not public.has_permission('properties', 'edit') then
    raise exception 'You do not have permission to resubmit properties.' using errcode = '42501';
  end if;

  select id, approval_status, submitted_by into p from public.properties where id = _property_id for update;
  if not found then
    raise exception 'That property could not be found.' using errcode = 'P0002';
  end if;
  if p.approval_status not in ('rejected', 'changes_requested') then
    raise exception 'Only a property that was returned or rejected can be resubmitted.' using errcode = '23514';
  end if;
  if p.submitted_by is not null and p.submitted_by <> v_me and not public.has_permission('properties', 'approve') then
    raise exception 'Only the agent who submitted this property can resubmit it.' using errcode = '42501';
  end if;

  perform set_config('app.property_review', 'on', true);
  perform set_config('app.property_review_note', coalesce(btrim(_note), ''), true);

  update public.properties
     set approval_status = 'pending', submitted_at = now(), reviewed_by = null, reviewed_at = null
   where id = _property_id;

  perform set_config('app.property_review', 'off', true);
  perform set_config('app.property_review_note', '', true);

  return jsonb_build_object('property_id', _property_id, 'approval_status', 'pending');
end;
$$;

revoke all on function public.review_property(uuid, text, text) from public, anon;
revoke all on function public.resubmit_property(uuid, text) from public, anon;
grant execute on function public.review_property(uuid, text, text) to authenticated;
grant execute on function public.resubmit_property(uuid, text) to authenticated;

-- 6. The public website only ever sees approved properties. Every database object the site reads
-- (direct policies, media, files and the two public functions) carries the same gate.
alter policy properties_select_public on public.properties
  using (is_published = true and status = 'active' and approval_status = 'approved');

alter policy property_media_select_public on public.property_media
  using (exists (
    select 1 from public.properties p
     where p.id = property_media.property_id and p.is_published = true and p.approval_status = 'approved'
  ));

alter policy uploads_select_public on public.uploads
  using (
    exists (
      select 1
        from public.property_media pm
        join public.properties p on p.id = pm.property_id
       where pm.upload_id = uploads.id and p.is_published = true and p.approval_status = 'approved'
    )
    or exists (
      select 1
        from public.development_media dm
        join public.developments d on d.id = dm.development_id
       where dm.upload_id = uploads.id and d.is_published = true
    )
  );

-- Re-create the two public functions from their current definitions with the approval gate added, so
-- every column and rule they have today is kept exactly.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.public_properties()'::regprocedure) into v_def;
  v_def := replace(v_def, 'p.is_published = true', 'p.is_published = true and p.approval_status = ''approved''');
  if position('approval_status' in v_def) = 0 then
    raise exception 'public_properties gate was not applied';
  end if;
  execute v_def;

  select pg_get_functiondef('public.similar_properties(uuid, integer)'::regprocedure) into v_def;
  v_def := replace(v_def, 'p.is_published = true', 'p.is_published = true and p.approval_status = ''approved''');
  v_def := replace(v_def, 'and is_published = true;', 'and is_published = true and approval_status = ''approved'';');
  if (length(v_def) - length(replace(v_def, 'approval_status', ''))) / length('approval_status') < 2 then
    raise exception 'similar_properties gate was not applied';
  end if;
  execute v_def;
end;
$$;
