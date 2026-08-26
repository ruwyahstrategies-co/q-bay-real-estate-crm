-- Thin service-role-only wrappers around Supabase Vault so edge functions can
-- store/rotate/read the per-agent WhatsApp access token without the raw
-- secret ever passing through a table that PostgREST/RLS exposes to clients.

create or replace function public.vault_create_secret(_secret text, _name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  _id uuid;
begin
  _id := vault.create_secret(_secret, _name);
  return _id;
end;
$$;

create or replace function public.vault_update_secret(_id uuid, _secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  perform vault.update_secret(_id, _secret);
end;
$$;

create or replace function public.vault_read_secret(_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  _val text;
begin
  select decrypted_secret into _val from vault.decrypted_secrets where id = _id;
  return _val;
end;
$$;

create or replace function public.vault_delete_secret(_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = _id;
end;
$$;

revoke execute on function public.vault_create_secret(text, text) from public, anon, authenticated;
revoke execute on function public.vault_update_secret(uuid, text) from public, anon, authenticated;
revoke execute on function public.vault_read_secret(uuid) from public, anon, authenticated;
revoke execute on function public.vault_delete_secret(uuid) from public, anon, authenticated;
grant execute on function public.vault_create_secret(text, text) to service_role;
grant execute on function public.vault_update_secret(uuid, text) to service_role;
grant execute on function public.vault_read_secret(uuid) to service_role;
grant execute on function public.vault_delete_secret(uuid) to service_role;
