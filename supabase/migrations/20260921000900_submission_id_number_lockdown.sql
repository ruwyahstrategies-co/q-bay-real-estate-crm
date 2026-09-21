-- Remove direct read of property_submissions.owner_id_number from client roles. Apply once the CRM
-- build that reads submissions through explicit columns and get_submission_id_numbers() is live
-- (select("*") on property_submissions is rejected from here on). The website account page
-- already selects explicit columns and is unaffected. Edge functions (service role) are unaffected.

revoke select on public.property_submissions from anon, authenticated;
grant select (
  id, website_profile_id, full_name, phone, email, country_id, area_id, location, property_type,
  purpose, price, currency, bedrooms, bathrooms, size, description, media, documents, status,
  reviewed_by, review_notes, converted_property_id, submitted_at, last_refreshed_at, created_at,
  updated_at, tower_name, floor_number, unit_number, parking_spaces, furnishing_status, owner_id,
  development_id, source, terms_accepted, custom_area, available_from, place_id
) on public.property_submissions to authenticated;
