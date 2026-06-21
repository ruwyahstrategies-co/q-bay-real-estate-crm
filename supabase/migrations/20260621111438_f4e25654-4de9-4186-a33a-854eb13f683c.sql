
-- 1. Disable RLS on inconsistently-protected tables to match the open prototype
ALTER TABLE public.external_market_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_intelligence_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_events DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Open anon access" ON public.external_market_sources;
DROP POLICY IF EXISTS "Open anon access" ON public.market_intelligence_reports;
DROP POLICY IF EXISTS "Open anon access" ON public.property_events;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_market_sources TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_intelligence_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_events TO anon, authenticated;
GRANT ALL ON public.external_market_sources TO service_role;
GRANT ALL ON public.market_intelligence_reports TO service_role;
GRANT ALL ON public.property_events TO service_role;

-- 2. Extend interactions for call transcripts
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_interactions_upload_id ON public.interactions(upload_id);

-- 3. Extend tasks for marketing-execution bridge + new status values
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS marketing_report_id uuid REFERENCES public.market_intelligence_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS refs jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_tasks_marketing_report ON public.tasks(marketing_report_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON public.tasks(source);

-- 4. Outdated-analysis detection on ai_analyses
ALTER TABLE public.ai_analyses
  ADD COLUMN IF NOT EXISTS is_outdated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outdated_reason text,
  ADD COLUMN IF NOT EXISTS source_signature text;
CREATE INDEX IF NOT EXISTS idx_ai_analyses_outdated ON public.ai_analyses(is_outdated);

-- Trigger: when leads / interactions / lead_property_interests / pipeline_history / uploads change, mark active analyses outdated
CREATE OR REPLACE FUNCTION public.mark_lead_analyses_outdated()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _lead_id uuid;
  _reason text;
BEGIN
  IF TG_TABLE_NAME = 'leads' THEN
    _lead_id := COALESCE(NEW.id, OLD.id);
    _reason := 'lead_updated';
  ELSIF TG_TABLE_NAME = 'interactions' THEN
    _lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
    _reason := 'interaction_changed';
  ELSIF TG_TABLE_NAME = 'lead_property_interests' THEN
    _lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
    _reason := 'property_interest_changed';
  ELSIF TG_TABLE_NAME = 'pipeline_history' THEN
    _lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
    _reason := 'pipeline_stage_changed';
  ELSIF TG_TABLE_NAME = 'uploads' THEN
    _lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
    _reason := 'file_changed';
  END IF;

  IF _lead_id IS NOT NULL THEN
    UPDATE public.ai_analyses
      SET is_outdated = true,
          outdated_reason = COALESCE(outdated_reason, _reason)
      WHERE lead_id = _lead_id
        AND is_outdated = false
        AND status = 'completed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_outdate_analyses ON public.leads;
CREATE TRIGGER trg_leads_outdate_analyses
  AFTER UPDATE ON public.leads
  FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION public.mark_lead_analyses_outdated();

DROP TRIGGER IF EXISTS trg_interactions_outdate_analyses ON public.interactions;
CREATE TRIGGER trg_interactions_outdate_analyses
  AFTER INSERT OR UPDATE OR DELETE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.mark_lead_analyses_outdated();

DROP TRIGGER IF EXISTS trg_lpi_outdate_analyses ON public.lead_property_interests;
CREATE TRIGGER trg_lpi_outdate_analyses
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_property_interests
  FOR EACH ROW EXECUTE FUNCTION public.mark_lead_analyses_outdated();

DROP TRIGGER IF EXISTS trg_pipeline_outdate_analyses ON public.pipeline_history;
CREATE TRIGGER trg_pipeline_outdate_analyses
  AFTER INSERT ON public.pipeline_history
  FOR EACH ROW EXECUTE FUNCTION public.mark_lead_analyses_outdated();

DROP TRIGGER IF EXISTS trg_uploads_outdate_analyses ON public.uploads;
CREATE TRIGGER trg_uploads_outdate_analyses
  AFTER INSERT OR UPDATE OR DELETE ON public.uploads
  FOR EACH ROW EXECUTE FUNCTION public.mark_lead_analyses_outdated();

-- 5. Lightweight rate-limit table for edge functions
CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_window ON public.edge_rate_limits(window_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_rate_limits TO anon, authenticated, service_role;
ALTER TABLE public.edge_rate_limits DISABLE ROW LEVEL SECURITY;

-- Atomic check-and-increment
CREATE OR REPLACE FUNCTION public.check_rate_limit(_key text, _max_per_minute integer)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _window timestamptz := date_trunc('minute', now());
  _new_count integer;
BEGIN
  INSERT INTO public.edge_rate_limits(key, window_start, count)
    VALUES (_key, _window, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = public.edge_rate_limits.count + 1
    RETURNING count INTO _new_count;
  -- opportunistic cleanup of windows older than 1 hour
  DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '1 hour';
  RETURN _new_count <= _max_per_minute;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer) TO anon, authenticated, service_role;

-- 6. Demand score view (transparent aggregation per property)
CREATE OR REPLACE VIEW public.property_demand_scores AS
WITH event_counts AS (
  SELECT
    pe.property_id,
    COUNT(*) FILTER (WHERE pe.event_type = 'view')              AS views,
    COUNT(*) FILTER (WHERE pe.event_type = 'mention')           AS mentions,
    COUNT(*) FILTER (WHERE pe.event_type = 'enquiry')           AS enquiries,
    COUNT(*) FILTER (WHERE pe.event_type = 'shortlist')         AS shortlists,
    COUNT(*) FILTER (WHERE pe.event_type = 'viewing_request')   AS viewing_requests,
    COUNT(*) FILTER (WHERE pe.event_type = 'offer')             AS offers,
    COUNT(*) FILTER (WHERE pe.event_type = 'rejection')         AS rejections,
    COUNT(*) FILTER (WHERE pe.event_type = 'closed_deal')       AS closed_deals,
    COUNT(*) FILTER (WHERE pe.event_type = 'brochure_download') AS brochure_downloads,
    COUNT(DISTINCT pe.lead_id) FILTER (WHERE pe.lead_id IS NOT NULL) AS unique_leads,
    MAX(pe.occurred_at)                                          AS last_event_at
  FROM public.property_events pe
  GROUP BY pe.property_id
),
interest_counts AS (
  SELECT property_id, COUNT(*) AS interested_leads
  FROM public.lead_property_interests
  GROUP BY property_id
)
SELECT
  p.id AS property_id,
  COALESCE(ec.views, 0)              AS views,
  COALESCE(ec.mentions, 0)           AS mentions,
  COALESCE(ec.enquiries, 0)          AS enquiries,
  COALESCE(ec.shortlists, 0)         AS shortlists,
  COALESCE(ec.viewing_requests, 0)   AS viewing_requests,
  COALESCE(ec.offers, 0)             AS offers,
  COALESCE(ec.rejections, 0)         AS rejections,
  COALESCE(ec.closed_deals, 0)       AS closed_deals,
  COALESCE(ec.brochure_downloads, 0) AS brochure_downloads,
  COALESCE(ec.unique_leads, 0)       AS unique_event_leads,
  COALESCE(ic.interested_leads, 0)   AS interested_leads,
  ec.last_event_at,
  -- Transparent weighted score: internal buyer behaviour weighted higher than online mentions
  (
    COALESCE(ic.interested_leads, 0) * 4
    + COALESCE(ec.shortlists, 0)        * 3
    + COALESCE(ec.viewing_requests, 0)  * 5
    + COALESCE(ec.enquiries, 0)         * 3
    + COALESCE(ec.offers, 0)            * 8
    + COALESCE(ec.brochure_downloads, 0)* 2
    + COALESCE(ec.views, 0)             * 1
    - COALESCE(ec.rejections, 0)        * 2
    + COALESCE(ec.mentions, 0)          * 1
  ) AS demand_score
FROM public.properties p
LEFT JOIN event_counts    ec ON ec.property_id = p.id
LEFT JOIN interest_counts ic ON ic.property_id = p.id;

GRANT SELECT ON public.property_demand_scores TO anon, authenticated, service_role;
