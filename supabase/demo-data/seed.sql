-- Q-Bay demo/sample dataset - safe to run against the live project any time.
--
-- Every row this script creates is clearly named "... (Sample Data)" /
-- "... (Sample)" and, where the table supports it, flagged is_demo = true.
-- No real-looking client identities are created - names, phones and emails
-- are all obviously placeholder (example.qbay-demo.invalid addresses,
-- 000-series phone numbers).
--
-- Idempotent: every insert is guarded by a "does this sample row already
-- exist" check, so running this file twice never creates duplicates. Run it
-- with the Supabase SQL editor, `supabase db execute -f supabase/demo-data/seed.sql`,
-- or paste it into the SQL editor in the dashboard.
--
-- To remove everything this script (and the original demo-data migration)
-- created, run cleanup.sql in this same folder.

do $$
declare
  v_owner_id uuid;
  v_agent_id uuid;
  v_lead_buyer uuid;
  v_lead_tenant uuid;
  v_tenant_id uuid;
  v_lease_id uuid;
  v_schedule_paid uuid;
  v_prop_marina_villa uuid;
  v_prop_marina_unit uuid;
  v_prop_island_penthouse uuid;
  v_prop_pearl_rent uuid;
  v_prop_pearl_unit uuid;
  v_prop_corniche uuid;
  v_prop_westbay_office uuid;
  v_prop_waterfront uuid;
  v_dev_marina uuid;
  v_dev_pearl uuid;
begin
  select id into v_agent_id from public.team_members order by created_at limit 1;

  select id into v_prop_marina_villa from public.properties where title = 'Demo Marina View Villa (Sample)';
  select id into v_prop_marina_unit from public.properties where title like 'Demo Marina Heights Unit 1204%';
  select id into v_prop_island_penthouse from public.properties where title = 'Demo Island Penthouse (Sample)';
  select id into v_prop_pearl_rent from public.properties where title = 'Demo Pearl Family Apartment for Rent (Sample)';
  select id into v_prop_pearl_unit from public.properties where title like 'Demo Pearl Residences Unit 802%';
  select id into v_prop_corniche from public.properties where title = 'Demo Corniche Studio for Rent (Sample)';
  select id into v_prop_westbay_office from public.properties where title = 'Demo West Bay Office Floor (Sample)';
  select id into v_prop_waterfront from public.properties where title = 'Demo Waterfront Apartment (Sample)';
  select id into v_dev_marina from public.developments where slug = 'demo-marina-heights';
  select id into v_dev_pearl from public.developments where slug = 'demo-pearl-residences';

  -- Realistic Qatar coordinates so every demo property/development shows on
  -- both the CRM and public website maps (a listing with no lat/long simply
  -- never appears on a map view).
  update public.properties set latitude = 25.4310, longitude = 51.4880 where id = v_prop_marina_villa and latitude is null;
  update public.properties set latitude = 25.4355, longitude = 51.4920 where id = v_prop_marina_unit and latitude is null;
  update public.properties set latitude = 25.3690, longitude = 51.5500 where id = v_prop_island_penthouse and latitude is null;
  update public.properties set latitude = 25.3710, longitude = 51.5525 where id = v_prop_pearl_rent and latitude is null;
  update public.properties set latitude = 25.3675, longitude = 51.5540 where id = v_prop_pearl_unit and latitude is null;
  update public.properties set latitude = 25.2865, longitude = 51.5230 where id = v_prop_corniche and latitude is null;
  update public.properties set latitude = 25.3225, longitude = 51.5290 where id = v_prop_westbay_office and latitude is null;
  update public.properties set latitude = 25.3200, longitude = 51.5335 where id = v_prop_waterfront and latitude is null;
  update public.developments set latitude = 25.4340, longitude = 51.4905 where id = v_dev_marina and latitude is null;
  update public.developments set latitude = 25.3700, longitude = 51.5515 where id = v_dev_pearl and latitude is null;

  -- Two more demo owners (three total, alongside "Demo Holdings" from the
  -- original demo-data migration) so Owners/Owner-profile flows have more
  -- than one record to click through.
  if not exists (select 1 from public.owners where name = 'Demo Family Trust (Sample Data)') then
    insert into public.owners (name, phone, email, is_demo, notes)
    values ('Demo Family Trust (Sample Data)', '00000102', 'demo.family.trust@example.qbay-demo.invalid', true,
      'Sample owner record for demo/testing. Safe to delete.');
  end if;
  if not exists (select 1 from public.owners where name = 'Demo Investment Group (Sample Data)') then
    insert into public.owners (name, phone, email, is_demo, notes)
    values ('Demo Investment Group (Sample Data)', '00000103', 'demo.investment.group@example.qbay-demo.invalid', true,
      'Sample owner record for demo/testing. Safe to delete.');
  end if;

  -- Two sample leads so Leads/Pipeline/Viewings have something beyond real
  -- staff-entered records to demonstrate against.
  if not exists (select 1 from public.leads where full_name = 'Demo Buyer Lead (Sample Data)') then
    insert into public.leads (full_name, phone, email, lead_source, pipeline_stage, assigned_agent_id, classification, purchase_purpose, notes)
    values ('Demo Buyer Lead (Sample Data)', '00000201', 'demo.buyer.lead@example.qbay-demo.invalid', 'website', 'qualified', v_agent_id, 'buyer', 'investment',
      'Sample lead record for demo/testing. Safe to delete.')
    returning id into v_lead_buyer;
  else
    select id into v_lead_buyer from public.leads where full_name = 'Demo Buyer Lead (Sample Data)';
  end if;

  if not exists (select 1 from public.leads where full_name = 'Demo Tenant Lead (Sample Data)') then
    insert into public.leads (full_name, phone, email, lead_source, pipeline_stage, assigned_agent_id, classification, purchase_purpose, notes)
    values ('Demo Tenant Lead (Sample Data)', '00000202', 'demo.tenant.lead@example.qbay-demo.invalid', 'referral', 'viewing_scheduled', v_agent_id, 'tenant', 'end_use',
      'Sample lead record for demo/testing. Safe to delete.')
    returning id into v_lead_tenant;
  else
    select id into v_lead_tenant from public.leads where full_name = 'Demo Tenant Lead (Sample Data)';
  end if;

  -- Two sample viewings - one upcoming, one completed - against real demo properties.
  if v_prop_island_penthouse is not null and not exists (select 1 from public.viewings where lead_id = v_lead_buyer and property_id = v_prop_island_penthouse) then
    insert into public.viewings (lead_id, property_id, assigned_agent_id, scheduled_at, status, notes, latitude, longitude)
    values (v_lead_buyer, v_prop_island_penthouse, v_agent_id, now() + interval '3 days', 'scheduled',
      'Sample viewing record for demo/testing. Safe to delete.', 25.3690, 51.5500);
  end if;
  if v_prop_pearl_rent is not null and not exists (select 1 from public.viewings where lead_id = v_lead_tenant and property_id = v_prop_pearl_rent) then
    insert into public.viewings (lead_id, property_id, assigned_agent_id, scheduled_at, status, notes, latitude, longitude)
    values (v_lead_tenant, v_prop_pearl_rent, v_agent_id, now() - interval '2 days', 'completed',
      'Sample viewing record for demo/testing. Safe to delete.', 25.3710, 51.5525);
  end if;

  -- One sample tenancy on the Pearl rental unit, with a paid, an overdue and
  -- an upcoming rent schedule item, so Property Management dashboards have
  -- something in every state to show.
  if v_prop_pearl_rent is not null then
    update public.properties set is_managed = true where id = v_prop_pearl_rent;

    if not exists (select 1 from public.tenants where full_name = 'Demo Tenant (Sample Data)') then
      insert into public.tenants (full_name, phone, email, nationality, is_demo, notes)
      values ('Demo Tenant (Sample Data)', '00000301', 'demo.tenant@example.qbay-demo.invalid', 'Sample', true,
        'Sample tenant record for demo/testing. Safe to delete.')
      returning id into v_tenant_id;
    else
      select id into v_tenant_id from public.tenants where full_name = 'Demo Tenant (Sample Data)';
    end if;

    if not exists (select 1 from public.property_leases where property_id = v_prop_pearl_rent and tenant_id = v_tenant_id) then
      insert into public.property_leases (property_id, tenant_id, tenant_name, tenant_phone, tenant_email, lease_start, lease_end, rent_amount, currency, payment_status, payment_frequency, status, renewal_state, maintenance_notes)
      values (v_prop_pearl_rent, v_tenant_id, 'Demo Tenant (Sample Data)', '00000301', 'demo.tenant@example.qbay-demo.invalid',
        current_date - interval '2 months', current_date + interval '10 months', 8500, 'QAR', 'current', 'monthly', 'active', 'not_due',
        'Sample tenancy record for demo/testing. Safe to delete.')
      returning id into v_lease_id;

      insert into public.rent_schedule_items (property_lease_id, due_date, amount, currency, status)
      values (v_lease_id, current_date - interval '1 month', 8500, 'QAR', 'paid')
      returning id into v_schedule_paid;
      insert into public.rent_schedule_items (property_lease_id, due_date, amount, currency, status)
      values (v_lease_id, current_date - interval '5 days', 8500, 'QAR', 'overdue');
      insert into public.rent_schedule_items (property_lease_id, due_date, amount, currency, status)
      values (v_lease_id, current_date + interval '25 days', 8500, 'QAR', 'due');

      insert into public.rent_payments (property_lease_id, rent_schedule_item_id, received_date, amount, currency, method, status, notes)
      values (v_lease_id, v_schedule_paid, current_date - interval '1 month', 8500, 'QAR', 'bank_transfer', 'received',
        'Sample payment record for demo/testing. Safe to delete.');
    end if;
  end if;
end $$;
