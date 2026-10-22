-- Website listing submissions: the phone number the owner typed is protected like the owner's own phone.
--
-- A submission carries a second copy of the owner's phone number. Every role with "view submissions" (which
-- includes all sales agents) could read it straight from the table, which bypassed the protection on owners.
-- The column can no longer be read directly. It is released by get_submission_phones, to the same people who
-- may see the submission's ID number: the person who submitted it, Super Administrators and Administrators,
-- anyone with the owner-phone permission, and the agent working with that owner. Saving a phone is unchanged.

revoke select (phone) on public.property_submissions from authenticated;

create or replace function public.get_submission_phones(_ids uuid[])
returns table(submission_id uuid, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.phone
    from public.property_submissions s
   where s.id = any(_ids)
     and (s.website_profile_id = auth.uid() or public.has_permission('submissions', 'view'))
     and public.can_view_submission_id(s.id);
$$;

grant execute on function public.get_submission_phones(uuid[]) to authenticated;
revoke execute on function public.get_submission_phones(uuid[]) from anon, public;
