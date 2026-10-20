-- Trigger functions run when their trigger fires; nobody needs to call them through the API. Same convention as
-- 20260902000110_lock_down_trigger_functions.sql.
revoke execute on function public.leads_enforce_forward_pipeline() from public, anon, authenticated;
revoke execute on function public.leads_record_pipeline_history() from public, anon, authenticated;
revoke execute on function public.pipeline_history_skip_duplicate() from public, anon, authenticated;
revoke execute on function public.viewings_before_write() from public, anon, authenticated;
revoke execute on function public.viewings_after_write() from public, anon, authenticated;
revoke execute on function public.developments_assign_code() from public, anon, authenticated;
revoke execute on function public.properties_enforce_approval() from public, anon, authenticated;
revoke execute on function public.properties_log_approval() from public, anon, authenticated;
revoke execute on function public.property_approval_notify() from public, anon, authenticated;
revoke execute on function public.tasks_stamp_creator() from public, anon, authenticated;
