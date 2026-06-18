
-- 1. property_events
CREATE TABLE public.property_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'view','mention','enquiry','shortlist','brochure_download',
    'link_sent','viewing_request','offer','rejection','closed_deal'
  )),
  source text,                -- e.g. 'web', 'whatsapp', 'call_transcript', 'email', 'manual'
  source_ref text,            -- e.g. interaction:<id>, upload:<id>
  weight numeric NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_events TO anon, authenticated;
GRANT ALL ON public.property_events TO service_role;

ALTER TABLE public.property_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open anon access" ON public.property_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_property_events_property ON public.property_events(property_id);
CREATE INDEX idx_property_events_lead ON public.property_events(lead_id);
CREATE INDEX idx_property_events_type ON public.property_events(event_type);
CREATE INDEX idx_property_events_occurred ON public.property_events(occurred_at DESC);


-- 2. external_market_sources
CREATE TABLE public.external_market_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text,
  title text NOT NULL,
  publisher text,
  url text NOT NULL,
  summary text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  relevant_locations text[] NOT NULL DEFAULT '{}',
  relevant_property_types text[] NOT NULL DEFAULT '{}',
  price_info jsonb,
  raw jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_market_sources TO anon, authenticated;
GRANT ALL ON public.external_market_sources TO service_role;

ALTER TABLE public.external_market_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open anon access" ON public.external_market_sources FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_external_market_sources_updated_at
  BEFORE UPDATE ON public.external_market_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_external_market_sources_active ON public.external_market_sources(active);
CREATE INDEX idx_external_market_sources_retrieved ON public.external_market_sources(retrieved_at DESC);
CREATE UNIQUE INDEX uq_external_market_sources_url ON public.external_market_sources(url);


-- 3. market_intelligence_reports
CREATE TABLE public.market_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('processing','completed','failed')),
  label text NOT NULL DEFAULT 'early_signals' CHECK (label IN ('early_signals','pattern_analysis')),
  conversation_count int NOT NULL DEFAULT 0,
  lead_count int NOT NULL DEFAULT 0,
  model text,
  input_snapshot jsonb,
  output_json jsonb,
  source_ids uuid[] NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_intelligence_reports TO anon, authenticated;
GRANT ALL ON public.market_intelligence_reports TO service_role;

ALTER TABLE public.market_intelligence_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open anon access" ON public.market_intelligence_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_market_intelligence_reports_updated_at
  BEFORE UPDATE ON public.market_intelligence_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_market_intelligence_reports_created ON public.market_intelligence_reports(created_at DESC);
