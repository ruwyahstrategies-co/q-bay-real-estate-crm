-- Q-Bay Real Estate CRM — Convert Won Lead to Owner (module R).
-- Two-way link so conversion is idempotent (never creates a duplicate Owner)
-- and the resulting Owner traces back to its source Lead.

alter table public.owners add column if not exists source_lead_id uuid references public.leads(id) on delete set null;
alter table public.leads add column if not exists converted_owner_id uuid references public.owners(id) on delete set null;

create unique index if not exists owners_source_lead_id_key on public.owners (source_lead_id) where source_lead_id is not null;
create index if not exists leads_converted_owner_id_idx on public.leads (converted_owner_id);
