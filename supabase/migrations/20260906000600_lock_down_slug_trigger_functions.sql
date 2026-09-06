-- The two new slug-assignment trigger functions were left publicly callable
-- via PostgREST RPC (they matched the existing has_permission-guarded RPC
-- functions in shape, but a bare trigger function has no such guard). Every
-- other trigger function in this schema has anon/authenticated EXECUTE
-- revoked (see 20260901231748_lock_down_trigger_functions); bring these two
-- in line so they can only run as triggers, never as a direct RPC call.
revoke execute on function public.properties_assign_slug() from public, anon, authenticated;
revoke execute on function public.developments_assign_slug() from public, anon, authenticated;
