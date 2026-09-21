-- property_submissions.owner_id_number is a second copy of the owner's national ID, filed by the
-- website form. It gets the same rule as owners.id_number. Additive: adds a read function and a
-- write guard. The column revoke is 20260921000900, applied once the matching CRM build is live.
--
-- Visible to: the person who filed the submission, Super Administrator / Administrator (or an
-- explicit owners.view_phone grant), and an agent with a real relationship to the owner the
-- submission is linked to (same rule as can_view_owner_phone).

create or replace function public.can_view_submission_id(_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.property_submissions s
        where s.id = _submission_id
          and (
            s.website_profile_id = auth.uid()
            or public.is_owner_phone_elevated()
            or (s.owner_id is not null and public.can_view_owner_phone(s.owner_id))
          )
     );
$$;

create or replace function public.get_submission_id_numbers(_ids uuid[])
returns table (submission_id uuid, owner_id_number text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id, s.owner_id_number
    from public.property_submissions s
   where s.id = any(_ids)
     and (s.website_profile_id = auth.uid() or public.has_permission('submissions', 'view'))
     and public.can_view_submission_id(s.id);
$$;

-- Nobody who cannot see the ID may replace it through a direct API update.
create or replace function public.submissions_guard_id_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and new.owner_id_number is distinct from old.owner_id_number
     and not public.can_view_submission_id(old.id) then
    raise exception 'You do not have access to change this submission''s ID number'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.can_view_submission_id(uuid) from public, anon;
revoke all on function public.get_submission_id_numbers(uuid[]) from public, anon;
revoke all on function public.submissions_guard_id_number() from public, anon, authenticated;
grant execute on function public.can_view_submission_id(uuid) to authenticated;
grant execute on function public.get_submission_id_numbers(uuid[]) to authenticated;

drop trigger if exists submissions_guard_id_number on public.property_submissions;
create trigger submissions_guard_id_number
  before update on public.property_submissions
  for each row execute function public.submissions_guard_id_number();
