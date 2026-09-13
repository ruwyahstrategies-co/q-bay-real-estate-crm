-- User-confirmed: grant the sole existing staff row (organisation
-- founder/administrator) permanent-delete rights on properties and relabel
-- as super_administrator, so this ships without locking them out of their
-- own data once properties_delete requires hard_delete.
update public.team_members
set role = 'super_administrator',
    permissions = jsonb_set(
      permissions,
      '{properties}',
      to_jsonb(
        (select array_agg(distinct x) from unnest(
          array(select jsonb_array_elements_text(permissions->'properties')) || array['hard_delete']
        ) as x)
      )
    )
where role = 'administrator';
