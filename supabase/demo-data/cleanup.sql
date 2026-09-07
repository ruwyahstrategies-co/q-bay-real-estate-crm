-- Removes every demo/sample record created by the original demo-data
-- migration (20260902000600_demo_data.sql) and by supabase/demo-data/seed.sql
-- in this folder. Safe to run once Q-Bay has entered real inventory and no
-- longer needs sample content - nothing here touches a row that isn't
-- flagged is_demo = true or named with the "(Sample" convention.
--
-- Run with the Supabase SQL editor or
-- `supabase db execute -f supabase/demo-data/cleanup.sql`.
--
-- Order matters: children are deleted before the parents they reference.

begin;

-- Property Management: the sample tenancy on the demo Pearl rental unit.
delete from public.rent_payments
  where property_lease_id in (
    select pl.id from public.property_leases pl
    join public.tenants t on t.id = pl.tenant_id
    where t.is_demo = true
  );
delete from public.rent_schedule_items
  where property_lease_id in (
    select pl.id from public.property_leases pl
    join public.tenants t on t.id = pl.tenant_id
    where t.is_demo = true
  );
delete from public.property_leases
  where tenant_id in (select id from public.tenants where is_demo = true);
delete from public.tenants where is_demo = true;

-- Sample viewings, then the sample leads they point at.
delete from public.viewings
  where lead_id in (select id from public.leads where full_name like 'Demo %(Sample Data)');
delete from public.leads where full_name like 'Demo %(Sample Data)';

-- Sample properties/developments/owners (and anything referencing them:
-- media, offers, transactions, interactions, contracts, submissions).
delete from public.property_media where property_id in (select id from public.properties where is_demo = true);
delete from public.development_media where development_id in (select id from public.developments where is_demo = true);
delete from public.offers where property_id in (select id from public.properties where is_demo = true);
delete from public.transactions where property_id in (select id from public.properties where is_demo = true);
delete from public.property_events where property_id in (select id from public.properties where is_demo = true);
delete from public.lead_property_interests where property_id in (select id from public.properties where is_demo = true);
delete from public.interactions where property_id in (select id from public.properties where is_demo = true);
delete from public.marketing_requests where property_id in (select id from public.properties where is_demo = true);
delete from public.owner_contracts where owner_id in (select id from public.owners where is_demo = true);
delete from public.property_submissions where owner_id in (select id from public.owners where is_demo = true);

delete from public.properties where is_demo = true;
delete from public.developments where is_demo = true;
delete from public.owners where is_demo = true;

commit;
