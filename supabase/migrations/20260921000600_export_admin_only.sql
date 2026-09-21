-- Staff data export is limited to Super Administrator and Administrator roles that also
-- hold team.manage. An agent who happens to carry team.manage cannot export.

create or replace function public.export_team_member_data(_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_role text;
  v jsonb;
begin
  select tm.role into v_role
    from public.team_members tm
   where tm.user_id = auth.uid() and tm.is_active is true;

  if auth.uid() is null
     or v_role not in ('super_administrator', 'administrator')
     or not public.has_permission('team', 'manage') then
    raise exception 'Only administrators who manage the team can export staff data' using errcode = '42501';
  end if;

  select tm.user_id into v_user from public.team_members tm where tm.id = _member_id;
  if not found then
    raise exception 'Team member not found';
  end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', tm.id, 'code', tm.code, 'full_name', tm.full_name, 'email', tm.email,
        'phone', tm.phone, 'role', tm.role, 'is_active', tm.is_active,
        'joining_date', tm.joining_date, 'date_of_birth', tm.date_of_birth,
        'team_id', tm.team_id, 'created_at', tm.created_at, 'notes', tm.notes
      ) from public.team_members tm where tm.id = _member_id
    ),
    'leads', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.leads l where l.assigned_agent_id = _member_id), '[]'::jsonb),
    'properties', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.properties p where p.assigned_agent_id = _member_id), '[]'::jsonb),
    'developments', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.developments d where d.assigned_agent_id = _member_id), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'code', o.code, 'name', o.name, 'company', o.company, 'email', o.email,
        'address', o.address, 'is_developer', o.is_developer, 'notes', o.notes,
        'phone', case when public.can_view_owner_phone(o.id) then o.phone end,
        'id_number', case when public.can_view_owner_phone(o.id) then o.id_number end,
        'created_at', o.created_at
      ) order by o.created_at)
      from public.owners o where o.assigned_agent_id = _member_id
    ), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.tasks t where t.assigned_to = _member_id), '[]'::jsonb),
    'viewings', coalesce((select jsonb_agg(to_jsonb(w) order by w.scheduled_at) from public.viewings w where w.assigned_agent_id = _member_id), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.offers f where f.agent_id = _member_id), '[]'::jsonb),
    'interactions', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.interactions i where i.created_by = _member_id or (v_user is not null and i.created_by = v_user)), '[]'::jsonb),
    'lead_notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.lead_notes n where n.author_id = _member_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.transactions x where x.agent_id = _member_id), '[]'::jsonb),
    'owner_contracts', coalesce((
      select jsonb_agg(to_jsonb(c) - 'generated_html' order by c.created_at)
      from public.owner_contracts c where c.assigned_agent_id = _member_id
    ), '[]'::jsonb),
    'property_shares', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.property_shares s where s.shared_by = _member_id), '[]'::jsonb),
    'marketing_requests', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.marketing_requests m where m.assigned_to = _member_id), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.export_team_member_data(uuid) from public, anon;
grant execute on function public.export_team_member_data(uuid) to authenticated;
