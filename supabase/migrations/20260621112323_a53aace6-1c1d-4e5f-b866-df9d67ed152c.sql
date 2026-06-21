CREATE OR REPLACE FUNCTION public.check_rate_limit(_key text, _max_per_minute integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _window timestamptz := date_trunc('minute', now());
  _new_count integer;
BEGIN
  INSERT INTO public.edge_rate_limits(key, window_start, count)
    VALUES (_key, _window, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = public.edge_rate_limits.count + 1
    RETURNING count INTO _new_count;
  DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '1 hour';
  RETURN _new_count <= _max_per_minute;
END;
$$;