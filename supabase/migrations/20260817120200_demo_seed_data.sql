-- OPTIONAL demo dataset for client walkthroughs — Q-Bay Real Estate CRM.
--
-- This is NOT part of the required schema migration. It is safe, small,
-- clearly fictional Qatar real-estate data meant purely to make the app feel
-- alive during a live demo (3 staff, 5 properties, 8 leads, interactions,
-- tasks, pipeline history, property interests).
--
-- Run this manually/deliberately (e.g. via the Supabase SQL editor) — do NOT
-- wire it into automatic deploys. Every row uses a fixed UUID and
-- `on conflict (id) do nothing`, so it's safe to re-run.
--
-- IMPORTANT: this script does NOT create Supabase Auth logins. The seeded
-- team_members rows are contact-only (user_id is null) until an admin
-- creates real logins for them from Team → Add member using
-- admin-create-staff-user. That keeps no credentials embedded in SQL.

-- ---------------------------------------------------------------------------
-- Staff (contact-only until logins are created via the Team page)
-- ---------------------------------------------------------------------------

insert into public.team_members (id, full_name, email, phone, role, is_active, notes)
values
  ('11111111-1111-1111-1111-111111111101', 'Fatima Al-Kaabi', 'fatima.alkaabi@qbayrealestate.com', '+974 5511 2201', 'sales_manager', true, 'Demo data — Sales Manager.'),
  ('11111111-1111-1111-1111-111111111102', 'Youssef Haddad', 'youssef.haddad@qbayrealestate.com', '+974 5511 2202', 'sales_agent', true, 'Demo data — Sales Agent.'),
  ('11111111-1111-1111-1111-111111111103', 'Layla Ahmadi', 'layla.ahmadi@qbayrealestate.com', '+974 5511 2203', 'marketing', true, 'Demo data — Marketing.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------

insert into public.properties (id, title, reference_code, property_type, location, developer, price, currency, bedrooms, bathrooms, size, size_unit, completion_status, availability, description, amenities)
values
  ('22222222-2222-2222-2222-222222222201', 'Marina Heights Tower — 2BR', 'QB-LUS-201', 'Apartment', 'Lusail Marina', 'Lusail Real Estate Development', 2450000, 'QAR', 2, 2, 132, 'sqm', 'Ready', 'available',
    'Waterfront 2-bedroom apartment with marina views, demo listing for walkthrough purposes.',
    array['Marina view', 'Gym', 'Swimming pool', 'Covered parking']),
  ('22222222-2222-2222-2222-222222222202', 'Pearl Residence 14 — 3BR', 'QB-PRL-114', 'Apartment', 'The Pearl-Qatar', 'United Development Company', 3800000, 'QAR', 3, 3, 198, 'sqm', 'Ready', 'available',
    'Spacious 3-bedroom residence in Porto Arabia with promenade access.',
    array['Sea view', 'Concierge', 'Beach access', 'Gym']),
  ('22222222-2222-2222-2222-222222222203', 'Al Waab Garden Villa', 'QB-WAB-305', 'Villa', 'Al Waab', 'Barwa Real Estate', 6200000, 'QAR', 5, 6, 520, 'sqm', 'Ready', 'available',
    'Five-bedroom family villa with private garden and majlis.',
    array['Private garden', 'Maid room', 'Driver room', 'Private pool']),
  ('22222222-2222-2222-2222-222222222204', 'West Bay Business Suites', 'QB-WBY-812', 'Commercial', 'West Bay', 'Qatari Diar', 1650000, 'QAR', null, 2, 145, 'sqm', 'Ready', 'available',
    'Grade-A office suite in West Bay''s financial district.',
    array['24/7 security', 'Reserved parking', 'Business lounge']),
  ('22222222-2222-2222-2222-222222222205', 'Msheireb Heritage Loft — 1BR', 'QB-MSH-047', 'Apartment', 'Msheireb Downtown', 'Msheireb Properties', 1450000, 'QAR', 1, 1, 78, 'sqm', 'Ready', 'reserved',
    'Boutique 1-bedroom loft in Qatar''s smart-city heritage district.',
    array['Smart home', 'Rooftop terrace', 'Walkable district'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

insert into public.leads (id, full_name, phone, email, nationality, preferred_language, budget_min, budget_max, currency, preferred_locations, preferred_property_types, purchase_purpose, buying_timeline, financing_status, lead_source, pipeline_stage, assigned_agent_id, notes)
values
  ('33333333-3333-3333-3333-333333333301', 'Ahmed Al-Sulaiti', '+974 5566 1001', 'ahmed.alsulaiti@example.com', 'Qatari', 'Arabic', 2000000, 2600000, 'QAR', array['Lusail Marina'], array['Apartment'], 'Primary residence', '1-3 months', 'Mortgage approved', 'Referral', 'qualified', '11111111-1111-1111-1111-111111111102', 'Demo lead — wants marina-facing unit.'),
  ('33333333-3333-3333-3333-333333333302', 'Sarah Thompson', '+974 5566 1002', 'sarah.thompson@example.com', 'British', 'English', 1200000, 1600000, 'QAR', array['Msheireb Downtown'], array['Apartment'], 'Investment', 'Exploring', 'Cash', 'Website', 'new_lead', '11111111-1111-1111-1111-111111111102', 'Demo lead — early enquiry via website form.'),
  ('33333333-3333-3333-3333-333333333303', 'Mohammed Rahman', '+974 5566 1003', 'mohammed.rahman@example.com', 'Bangladeshi', 'English', 1400000, 1800000, 'QAR', array['West Bay'], array['Commercial'], 'Investment', '3-6 months', 'Mortgage pending', 'Property Finder', 'contacted', '11111111-1111-1111-1111-111111111101', 'Demo lead — looking for office suite for his business.'),
  ('33333333-3333-3333-3333-333333333304', 'Elena Petrova', '+974 5566 1004', 'elena.petrova@example.com', 'Russian', 'English', 3200000, 4000000, 'QAR', array['The Pearl-Qatar'], array['Apartment'], 'Primary residence', '1-3 months', 'Cash', 'Referral', 'property_matching', '11111111-1111-1111-1111-111111111102', 'Demo lead — relocating with family, needs 3BR.'),
  ('33333333-3333-3333-3333-333333333305', 'Khalid Al-Marri', '+974 5566 1005', 'khalid.almarri@example.com', 'Qatari', 'Arabic', 5500000, 7000000, 'QAR', array['Al Waab'], array['Villa'], 'Primary residence', 'Immediate', 'Cash', 'Walk-in', 'viewing_scheduled', '11111111-1111-1111-1111-111111111101', 'Demo lead — viewing scheduled for the Al Waab villa.'),
  ('33333333-3333-3333-3333-333333333306', 'Priya Nair', '+974 5566 1006', 'priya.nair@example.com', 'Indian', 'English', 3500000, 3900000, 'QAR', array['The Pearl-Qatar'], array['Apartment'], 'Investment', '1-3 months', 'Mortgage approved', 'Property Finder', 'negotiation', '11111111-1111-1111-1111-111111111102', 'Demo lead — in active price negotiation.'),
  ('33333333-3333-3333-3333-333333333307', 'James Wilson', '+974 5566 1007', 'james.wilson@example.com', 'American', 'English', 1300000, 1500000, 'QAR', array['Msheireb Downtown'], array['Apartment'], 'Primary residence', 'Immediate', 'Cash', 'Referral', 'won', '11111111-1111-1111-1111-111111111101', 'Demo lead — closed on the Msheireb loft.'),
  ('33333333-3333-3333-3333-333333333308', 'Noura Al-Kuwari', '+974 5566 1008', 'noura.alkuwari@example.com', 'Qatari', 'Arabic', 1000000, 1300000, 'QAR', array['Lusail Marina'], array['Apartment'], 'Investment', 'Exploring', 'Undecided', 'Website', 'lost', '11111111-1111-1111-1111-111111111102', 'Demo lead — went with a competitor developer.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Pipeline history — one entry per lead reflecting its seeded stage
-- ---------------------------------------------------------------------------

insert into public.pipeline_history (lead_id, previous_stage, new_stage)
select id, null, pipeline_stage from public.leads
where id in (
  '33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333302',
  '33333333-3333-3333-3333-333333333303', '33333333-3333-3333-3333-333333333304',
  '33333333-3333-3333-3333-333333333305', '33333333-3333-3333-3333-333333333306',
  '33333333-3333-3333-3333-333333333307', '33333333-3333-3333-3333-333333333308'
)
and not exists (select 1 from public.pipeline_history ph where ph.lead_id = public.leads.id);

-- ---------------------------------------------------------------------------
-- Lead ↔ property interests
-- ---------------------------------------------------------------------------

insert into public.lead_property_interests (id, lead_id, property_id, interest_level, status)
values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'high', 'interested'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222202', 'high', 'interested'),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222203', 'high', 'viewing_scheduled'),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333306', '22222222-2222-2222-2222-222222222202', 'high', 'negotiating'),
  ('44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333307', '22222222-2222-2222-2222-222222222205', 'high', 'closed'),
  ('44444444-4444-4444-4444-444444444406', '33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222204', 'medium', 'interested')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Interactions
-- ---------------------------------------------------------------------------

insert into public.interactions (id, lead_id, property_id, interaction_type, direction, subject, content, interaction_date)
values
  ('55555555-5555-5555-5555-555555555501', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'phone_call', 'outbound', 'Intro call', 'Discussed budget and timeline. Ahmed is pre-approved and wants a marina-facing 2BR.', now() - interval '6 days'),
  ('55555555-5555-5555-5555-555555555502', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'whatsapp', 'inbound', 'Follow-up', 'Asked about service charges for Marina Heights Tower.', now() - interval '2 days'),
  ('55555555-5555-5555-5555-555555555503', '33333333-3333-3333-3333-333333333302', null, 'website_enquiry', 'inbound', 'Website enquiry', 'Submitted enquiry form asking about investment apartments downtown.', now() - interval '1 days'),
  ('55555555-5555-5555-5555-555555555504', '33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222204', 'email', 'outbound', 'Office suite details', 'Sent floor plan and pricing for West Bay Business Suites.', now() - interval '4 days'),
  ('55555555-5555-5555-5555-555555555505', '33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222202', 'meeting', 'inbound', 'In-office consultation', 'Met to discuss relocation timeline; family needs 3BR near international school.', now() - interval '3 days'),
  ('55555555-5555-5555-5555-555555555506', '33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222203', 'phone_call', 'outbound', 'Viewing confirmation', 'Confirmed Saturday viewing for the Al Waab villa.', now() - interval '1 days'),
  ('55555555-5555-5555-5555-555555555507', '33333333-3333-3333-3333-333333333306', '22222222-2222-2222-2222-222222222202', 'whatsapp', 'inbound', 'Price negotiation', 'Priya countered at 3.7M; awaiting developer response.', now() - interval '12 hours'),
  ('55555555-5555-5555-5555-555555555508', '33333333-3333-3333-3333-333333333307', '22222222-2222-2222-2222-222222222205', 'manual_note', 'internal', 'Deal closed', 'Signed contract for the Msheireb loft — handover next month.', now() - interval '10 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tasks / follow-ups
-- ---------------------------------------------------------------------------

insert into public.tasks (id, title, description, task_type, due_at, priority, status, lead_id, property_id, assigned_to)
values
  ('66666666-6666-6666-6666-666666666601', 'Call Ahmed re: service charges', 'Follow up on Marina Heights Tower service charge question.', 'call', now() + interval '1 days', 'high', 'pending', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102'),
  ('66666666-6666-6666-6666-666666666602', 'Send investment brochure to Sarah', 'Email downtown investment options with rental yield estimates.', 'email', now() + interval '2 days', 'medium', 'pending', '33333333-3333-3333-3333-333333333302', null, '11111111-1111-1111-1111-111111111102'),
  ('66666666-6666-6666-6666-666666666603', 'Confirm viewing logistics with Khalid', 'Arrange driver and confirm 4pm Saturday viewing at Al Waab villa.', 'call', now() + interval '3 days', 'high', 'pending', '33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111101'),
  ('66666666-6666-6666-6666-666666666604', 'Present counter-offer to developer', 'Relay Priya''s 3.7M counter-offer to Pearl Residence developer contact.', 'meeting', now() - interval '1 days', 'urgent', 'pending', '33333333-3333-3333-3333-333333333306', '22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111102'),
  ('66666666-6666-6666-6666-666666666605', 'Prepare handover checklist', 'Draft handover checklist for James ahead of Msheireb loft handover.', 'other', now() + interval '5 days', 'low', 'pending', '33333333-3333-3333-3333-333333333307', '22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;
