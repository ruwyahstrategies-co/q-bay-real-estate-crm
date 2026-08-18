UPDATE public.team_members
SET permissions = jsonb_set(coalesce(permissions, '{}'::jsonb), '{analytics}', '["view"]'::jsonb, true)
WHERE coalesce(permissions, '{}'::jsonb) ? 'overview'
  AND NOT (coalesce(permissions, '{}'::jsonb) ? 'analytics');