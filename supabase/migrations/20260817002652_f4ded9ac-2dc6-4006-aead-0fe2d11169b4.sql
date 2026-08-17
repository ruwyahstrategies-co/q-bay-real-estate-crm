-- check_rate_limit is only ever called by background functions (service role).
revoke execute on function public.check_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer) to service_role;

-- Make the demand-scores view respect the caller's own access rules.
alter view public.property_demand_scores set (security_invoker = on);
grant select on public.property_demand_scores to authenticated;
grant select on public.property_demand_scores to service_role;