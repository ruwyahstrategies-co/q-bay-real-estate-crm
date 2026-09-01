-- These are trigger functions only — never meant to be called directly via
-- PostgREST. Revoke the default anon/authenticated EXECUTE grant the linter
-- flagged; trigger firing does not require EXECUTE grants to work.
revoke execute on function public.owners_assign_code() from public, anon, authenticated;
revoke execute on function public.team_members_assign_code() from public, anon, authenticated;
revoke execute on function public.properties_assign_reference() from public, anon, authenticated;
