-- Q-Bay Real Estate CRM — Safe demo-data mechanism for client review (module AD).
--
-- Live Supabase stays the data layer for both apps; nothing here replaces
-- it with mocks. Instead: clearly-tagged is_demo rows that flow through the
-- normal public_* RPCs (so the website looks populated during review) and
-- can be purged in one statement per table when real inventory lands:
--
--   delete from public.properties where is_demo = true;
--   delete from public.developments where is_demo = true;
--   delete from public.owners where is_demo = true;

alter table public.owners add column if not exists is_demo boolean not null default false;
alter table public.developments add column if not exists is_demo boolean not null default false;
alter table public.properties add column if not exists is_demo boolean not null default false;

create index if not exists owners_is_demo_idx on public.owners (is_demo) where is_demo = true;
create index if not exists developments_is_demo_idx on public.developments (is_demo) where is_demo = true;
create index if not exists properties_is_demo_idx on public.properties (is_demo) where is_demo = true;

-- Demo rows never queue a real marketing photo request.
create or replace function public.properties_create_marketing_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_demo then
    return new;
  end if;
  if new.hero_image_url is null or new.hero_image_url = '' then
    insert into public.marketing_requests (property_id, status)
    values (new.id, 'pending')
    on conflict (property_id) where status in ('pending', 'in_progress') do nothing;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- Seed: one demo owner/developer, two demo developments, eight demo
-- properties spanning Buy / Rent / Off-Plan Resale / Commercial across real
-- Qatar areas already in the CRM - so Categories, Areas, Area carousels,
-- Reference Codes, and Developments all have something to show.
-- Idempotent: re-running this file is a no-op after the first apply.
-- =============================================================================

do $$
declare
  v_owner_id uuid;
  v_agent_id uuid;
  v_lusail_area uuid;
  v_pearl_area uuid;
  v_westbay_area uuid;
  v_msheireb_area uuid;
  v_qatar uuid;
  v_dev_marina uuid;
  v_dev_pearl uuid;
begin
  if exists (select 1 from public.owners where is_demo = true) then
    return; -- already seeded
  end if;

  select id into v_agent_id from public.team_members order by created_at limit 1;
  select id into v_qatar from public.countries where slug = 'qatar';
  select id into v_lusail_area from public.areas where slug = 'lusail-marina';
  select id into v_pearl_area from public.areas where slug = 'the-pearl-qatar';
  select id into v_westbay_area from public.areas where slug = 'west-bay';
  select id into v_msheireb_area from public.areas where slug = 'msheireb-downtown';

  insert into public.owners (name, company, is_developer, is_demo, notes)
  values ('Demo Holdings (Sample Data)', 'Demo Holdings W.L.L.', true, true,
    'Sample owner/developer for client review. Safe to delete: delete from owners where is_demo = true (cascades to demo properties/developments).')
  returning id into v_owner_id;

  insert into public.developments (name, slug, developer, owner_id, country_id, area_id, status, is_published, is_demo, description, price_from, currency)
  values (
    'Demo Marina Heights (Sample)', 'demo-marina-heights', 'Demo Holdings', v_owner_id, v_qatar, v_lusail_area,
    'off_plan', true, true, 'Sample development for client review - replace or remove once real inventory is loaded.', 1200000, 'QAR'
  ) returning id into v_dev_marina;

  insert into public.developments (name, slug, developer, owner_id, country_id, area_id, status, is_published, is_demo, description, price_from, currency)
  values (
    'Demo Pearl Residences (Sample)', 'demo-pearl-residences', 'Demo Holdings', v_owner_id, v_qatar, v_pearl_area,
    'under_construction', true, true, 'Sample development for client review - replace or remove once real inventory is loaded.', 2100000, 'QAR'
  ) returning id into v_dev_pearl;

  insert into public.properties (
    title, description, country_id, area_id, purpose, property_type, price, currency,
    bedrooms, bathrooms, size, availability, status, is_published, is_demo, owner_id, assigned_agent_id, development_id
  ) values
    ('Demo Waterfront Apartment (Sample)', 'Sample listing for client review.', v_qatar, v_westbay_area, 'sale', 'Apartment', 1850000, 'QAR', 2, 2, 120, 'available', 'active', true, true, v_owner_id, v_agent_id, null),
    ('Demo Marina View Villa (Sample)', 'Sample listing for client review.', v_qatar, v_lusail_area, 'sale', 'Villa', 4200000, 'QAR', 4, 5, 380, 'available', 'active', true, true, v_owner_id, v_agent_id, null),
    ('Demo Island Penthouse (Sample)', 'Sample listing for client review.', v_qatar, v_pearl_area, 'sale', 'Penthouse', 6800000, 'QAR', 3, 4, 310, 'available', 'active', true, true, v_owner_id, v_agent_id, null),
    ('Demo Corniche Studio for Rent (Sample)', 'Sample listing for client review.', v_qatar, v_msheireb_area, 'rent', 'Apartment', 8500, 'QAR', 1, 1, 55, 'available', 'active', true, true, v_owner_id, v_agent_id, null),
    ('Demo Pearl Family Apartment for Rent (Sample)', 'Sample listing for client review.', v_qatar, v_pearl_area, 'rent', 'Apartment', 14500, 'QAR', 3, 3, 165, 'available', 'active', true, true, v_owner_id, v_agent_id, null),
    ('Demo Marina Heights Unit 1204 (Sample, Off-Plan Resale)', 'Sample off-plan resale listing for client review.', v_qatar, v_lusail_area, 'off_plan_resale', 'Apartment', 1450000, 'QAR', 2, 2, 105, 'available', 'active', true, true, v_owner_id, v_agent_id, v_dev_marina),
    ('Demo Pearl Residences Unit 802 (Sample, Off-Plan Resale)', 'Sample off-plan resale listing for client review.', v_qatar, v_pearl_area, 'off_plan_resale', 'Apartment', 2350000, 'QAR', 2, 3, 140, 'available', 'active', true, true, v_owner_id, v_agent_id, v_dev_pearl),
    ('Demo West Bay Office Floor (Sample)', 'Sample commercial listing for client review.', v_qatar, v_westbay_area, 'commercial', 'Commercial', 65000, 'QAR', 0, 2, 450, 'available', 'active', true, true, v_owner_id, v_agent_id, null);
end $$;
