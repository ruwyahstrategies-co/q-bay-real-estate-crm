-- Pin the search path on three small pure helper functions added earlier today (flagged by the Supabase
-- security advisor). They read no tables; this only removes the "role mutable search_path" warning.
alter function public.property_type_family(text) set search_path = public;
alter function public.property_type_matches(text, text[]) set search_path = public;
alter function public.owner_phone_key(text) set search_path = public;
