
DO $$
DECLARE
  b TEXT;
  buckets TEXT[] := ARRAY['lead-imports','property-documents','property-media','conversation-files','call-recordings','general-documents'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = %L)', 'anon_select_' || b, b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = %L)', 'anon_insert_' || b, b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', 'anon_update_' || b, b, b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = %L)', 'anon_delete_' || b, b);
  END LOOP;
END $$;
