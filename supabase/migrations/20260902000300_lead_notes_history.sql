-- Q-Bay Real Estate CRM — Lead Notes History (module E).
-- lead_notes holds current content; lead_note_versions is an append-only
-- snapshot of every prior version, written by a trigger so editing a note
-- can never destroy its previous state.

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  content text not null,
  author_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_note_versions (
  id uuid primary key default gen_random_uuid(),
  lead_note_id uuid not null references public.lead_notes(id) on delete cascade,
  content text not null,
  edited_by uuid references public.team_members(id) on delete set null,
  edited_at timestamptz not null default now()
);

create index lead_notes_lead_id_idx on public.lead_notes (lead_id);
create index lead_note_versions_lead_note_id_idx on public.lead_note_versions (lead_note_id);

drop trigger if exists set_updated_at on public.lead_notes;
create trigger set_updated_at before update on public.lead_notes for each row execute function public.set_updated_at();

create or replace function public.lead_notes_snapshot_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.content is distinct from new.content then
    insert into public.lead_note_versions (lead_note_id, content, edited_by, edited_at)
    values (old.id, old.content, public.current_team_member_id(), now());
  end if;
  return new;
end;
$$;

revoke execute on function public.lead_notes_snapshot_before_update() from public, anon, authenticated;

drop trigger if exists lead_notes_snapshot_before_update on public.lead_notes;
create trigger lead_notes_snapshot_before_update
  before update on public.lead_notes
  for each row execute function public.lead_notes_snapshot_before_update();

alter table public.lead_notes enable row level security;
create policy lead_notes_select on public.lead_notes for select to authenticated using (
  exists (select 1 from public.leads l where l.id = lead_notes.lead_id and (
    public.has_permission('leads', 'view_all')
    or (public.has_permission('leads', 'view_team') and l.team_id = public.current_team_id())
    or (public.has_permission('leads', 'view') and l.assigned_agent_id = public.current_team_member_id())
  ))
);
create policy lead_notes_insert on public.lead_notes for insert to authenticated with check (public.has_permission('leads', 'edit'));
create policy lead_notes_update on public.lead_notes for update to authenticated
  using (public.has_permission('leads', 'edit')) with check (public.has_permission('leads', 'edit'));
create policy lead_notes_delete on public.lead_notes for delete to authenticated using (public.has_permission('leads', 'delete'));

alter table public.lead_note_versions enable row level security;
create policy lead_note_versions_select on public.lead_note_versions for select to authenticated using (
  exists (
    select 1 from public.lead_notes n join public.leads l on l.id = n.lead_id
    where n.id = lead_note_versions.lead_note_id and (
      public.has_permission('leads', 'view_all')
      or (public.has_permission('leads', 'view_team') and l.team_id = public.current_team_id())
      or (public.has_permission('leads', 'view') and l.assigned_agent_id = public.current_team_member_id())
    )
  )
);
-- No client-facing insert/update/delete policy on versions: only the
-- security-definer snapshot trigger writes here, so history can't be edited.
