-- Client-reported location data cleanup.
--
-- Two Qatar areas were entered wrong when the Country -> Area -> Place
-- hierarchy was first populated, before the Place level existed:
--
--   "Lusail Marina" was entered as an AREA. It should be the AREA "Lusail"
--   with a PLACE "Marina" inside it (Lusail also has an Energy City place).
--
--   "The Pearl-Qatar" and "The Pearl Island" were both entered as AREAs for
--   the same real place. They should be a single AREA "The Pearl" with the
--   client's confirmed places inside it: Porto Arabia, Viva Bahriya,
--   Giardino, Qanat Quartier, Gewan.
--
-- Nothing is deleted. Every property/development/lead currently pointing at
-- the wrong area is reassigned to the correct area + place, then the wrong
-- area rows are deactivated (never deleted) once nothing references them
-- any more. This mirrors the "the pearl island" country fix already applied
-- in 20260920135652_places_hierarchy.sql. Areas with no client-confirmed
-- sub-places (West Bay, Msheireb Downtown, Al Waab, and the two UAE areas)
-- are untouched - they were not reported as wrong.

do $$
declare
  v_qatar uuid;
  v_lusail_old uuid;   -- wrong: "Lusail Marina" area
  v_pearl_old_1 uuid;  -- wrong: "The Pearl-Qatar" area
  v_pearl_old_2 uuid;  -- wrong: "The Pearl Island" area
  v_lusail uuid;       -- correct: "Lusail" area
  v_pearl uuid;        -- correct: "The Pearl" area
  v_place_marina uuid;
  v_place_energy_city uuid;
  v_place_porto_arabia uuid;
  v_place_viva_bahriya uuid;
  v_place_giardino uuid;
  v_place_qanat_quartier uuid;
  v_place_gewan uuid;
begin
  select id into v_qatar from public.countries where slug = 'qatar';
  if v_qatar is null then
    return; -- nothing to clean up if Qatar itself isn't seeded
  end if;

  select id into v_lusail_old from public.areas
   where country_id = v_qatar and slug = 'lusail-marina';
  select id into v_pearl_old_1 from public.areas
   where country_id = v_qatar and slug = 'the-pearl-qatar';
  select id into v_pearl_old_2 from public.areas
   where country_id = v_qatar and slug = 'the-pearl-island';

  -- ---------------------------------------------------------------------
  -- Create the correct canonical areas (idempotent - safe to re-run).
  -- ---------------------------------------------------------------------
  insert into public.areas (country_id, name, slug, is_active, display_order)
  values (v_qatar, 'Lusail', 'lusail', true,
    coalesce((select max(display_order) + 1 from public.areas where country_id = v_qatar), 0))
  on conflict (country_id, slug) do nothing;
  select id into v_lusail from public.areas where country_id = v_qatar and slug = 'lusail';

  insert into public.areas (country_id, name, slug, is_active, display_order)
  values (v_qatar, 'The Pearl', 'the-pearl', true,
    coalesce((select max(display_order) + 1 from public.areas where country_id = v_qatar), 0))
  on conflict (country_id, slug) do nothing;
  select id into v_pearl from public.areas where country_id = v_qatar and slug = 'the-pearl';

  -- ---------------------------------------------------------------------
  -- Create the confirmed places inside each (idempotent).
  -- ---------------------------------------------------------------------
  insert into public.places (area_id, name, slug, is_active, display_order) values
    (v_lusail, 'Marina', 'marina', true, 0),
    (v_lusail, 'Energy City', 'energy-city', true, 1)
  on conflict (area_id, slug) do nothing;
  select id into v_place_marina from public.places where area_id = v_lusail and slug = 'marina';
  select id into v_place_energy_city from public.places where area_id = v_lusail and slug = 'energy-city';

  insert into public.places (area_id, name, slug, is_active, display_order) values
    (v_pearl, 'Porto Arabia', 'porto-arabia', true, 0),
    (v_pearl, 'Viva Bahriya', 'viva-bahriya', true, 1),
    (v_pearl, 'Giardino', 'giardino', true, 2),
    (v_pearl, 'Qanat Quartier', 'qanat-quartier', true, 3),
    (v_pearl, 'Gewan', 'gewan', true, 4)
  on conflict (area_id, slug) do nothing;
  select id into v_place_porto_arabia from public.places where area_id = v_pearl and slug = 'porto-arabia';

  -- ---------------------------------------------------------------------
  -- Reassign records that pointed at the wrong "Lusail Marina" area: the
  -- whole area meant "Marina", so every referencing row gets area=Lusail,
  -- place=Marina.
  -- ---------------------------------------------------------------------
  if v_lusail_old is not null then
    update public.properties
       set area_id = v_lusail, place_id = v_place_marina
     where area_id = v_lusail_old;

    update public.developments
       set area_id = v_lusail, place_id = v_place_marina
     where area_id = v_lusail_old;

    update public.leads
       set preferred_area_id = v_lusail, preferred_place_id = v_place_marina
     where preferred_area_id = v_lusail_old;

    update public.property_submissions
       set area_id = v_lusail, place_id = v_place_marina
     where area_id = v_lusail_old;
  end if;

  -- ---------------------------------------------------------------------
  -- Reassign records that pointed at "The Pearl-Qatar": area -> The Pearl.
  -- Place is only set when the record's own title clearly names one of the
  -- five confirmed places; otherwise it is left null rather than guessed.
  -- ---------------------------------------------------------------------
  if v_pearl_old_1 is not null then
    update public.properties
       set area_id = v_pearl,
           place_id = case
             when title ilike '%porto arabia%' then v_place_porto_arabia
             when title ilike '%viva bahriya%' then v_place_viva_bahriya
             when title ilike '%giardino%' then v_place_giardino
             when title ilike '%qanat%' then v_place_qanat_quartier
             when title ilike '%gewan%' then v_place_gewan
             else place_id
           end
     where area_id = v_pearl_old_1;

    update public.developments set area_id = v_pearl where area_id = v_pearl_old_1;

    update public.leads set preferred_area_id = v_pearl where preferred_area_id = v_pearl_old_1;

    update public.property_submissions
       set area_id = v_pearl,
           place_id = case
             when location ilike '%porto arabia%' then v_place_porto_arabia
             when location ilike '%viva bahriya%' then v_place_viva_bahriya
             when location ilike '%giardino%' then v_place_giardino
             when location ilike '%qanat%' then v_place_qanat_quartier
             when location ilike '%gewan%' then v_place_gewan
             else place_id
           end
     where area_id = v_pearl_old_1;
  end if;

  -- "The Pearl Island" (v_pearl_old_2) is a duplicate with no place-level
  -- hint of its own; reassign any referencing rows straight to The Pearl.
  if v_pearl_old_2 is not null then
    update public.properties set area_id = v_pearl where area_id = v_pearl_old_2;
    update public.developments set area_id = v_pearl where area_id = v_pearl_old_2;
    update public.leads set preferred_area_id = v_pearl where preferred_area_id = v_pearl_old_2;
    update public.property_submissions set area_id = v_pearl where area_id = v_pearl_old_2;
  end if;

  -- ---------------------------------------------------------------------
  -- Deactivate the wrong/duplicate areas, but only once nothing references
  -- them any more (the reassignments above should already guarantee this -
  -- this is a defensive re-check, matching the existing cleanup pattern).
  -- Never deleted: deactivating keeps them resolvable for anything this
  -- migration didn't know about, and keeps full audit history.
  -- ---------------------------------------------------------------------
  if v_lusail_old is not null
     and not exists (select 1 from public.properties where area_id = v_lusail_old)
     and not exists (select 1 from public.developments where area_id = v_lusail_old)
     and not exists (select 1 from public.leads where preferred_area_id = v_lusail_old)
     and not exists (select 1 from public.property_submissions where area_id = v_lusail_old)
  then
    update public.areas set is_active = false where id = v_lusail_old;
  end if;

  if v_pearl_old_1 is not null
     and not exists (select 1 from public.properties where area_id = v_pearl_old_1)
     and not exists (select 1 from public.developments where area_id = v_pearl_old_1)
     and not exists (select 1 from public.leads where preferred_area_id = v_pearl_old_1)
     and not exists (select 1 from public.property_submissions where area_id = v_pearl_old_1)
  then
    update public.areas set is_active = false where id = v_pearl_old_1;
  end if;

  if v_pearl_old_2 is not null
     and not exists (select 1 from public.properties where area_id = v_pearl_old_2)
     and not exists (select 1 from public.developments where area_id = v_pearl_old_2)
     and not exists (select 1 from public.leads where preferred_area_id = v_pearl_old_2)
     and not exists (select 1 from public.property_submissions where area_id = v_pearl_old_2)
  then
    update public.areas set is_active = false where id = v_pearl_old_2;
  end if;
end;
$$;
