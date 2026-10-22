-- Detailed activity log.
--
--   * Every conversation / contact attempt is its own row in interactions and is never merged with another
--     one, even several in the same pipeline stage.
--   * The database stamps WHO did it (the signed-in user and their team member) and the pipeline stage the
--     lead was in at that moment, so the history cannot be forged from the browser.
--   * A contact outcome (answered, no answer, ...) can be recorded with each attempt.
--   * An uploaded screenshot / image / file can be tied to the exact interaction it is evidence for
--     (uploads.interaction_id). Uploads also record who uploaded them.

alter table public.interactions
  add column if not exists actor_team_member_id uuid references public.team_members (id) on delete set null,
  add column if not exists lead_stage text,
  add column if not exists outcome text;

create index if not exists interactions_lead_date_idx
  on public.interactions (lead_id, interaction_date desc);
create index if not exists interactions_actor_idx
  on public.interactions (actor_team_member_id);

create or replace function public.interactions_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.actor_team_member_id := public.current_team_member_id();
  end if;
  if new.lead_id is not null and new.lead_stage is null then
    select l.pipeline_stage into new.lead_stage from public.leads l where l.id = new.lead_id;
  end if;
  return new;
end;
$$;

create or replace trigger interactions_stamp_actor
  before insert on public.interactions
  for each row execute function public.interactions_stamp_actor();

alter table public.uploads
  add column if not exists interaction_id uuid references public.interactions (id) on delete set null;

create index if not exists uploads_interaction_idx
  on public.uploads (interaction_id) where interaction_id is not null;

create or replace function public.uploads_stamp_uploader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace trigger uploads_stamp_uploader
  before insert on public.uploads
  for each row execute function public.uploads_stamp_uploader();

revoke execute on function public.interactions_stamp_actor() from public, anon, authenticated;
revoke execute on function public.uploads_stamp_uploader() from public, anon, authenticated;
