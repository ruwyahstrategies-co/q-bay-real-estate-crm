
-- Receptionist calls (one row per inbound or transferred call)
CREATE TABLE public.receptionist_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elevenlabs_conversation_id text UNIQUE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  caller_number text,
  called_number text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  status text DEFAULT 'in_progress',
  outcome text,
  intent_level text,
  summary text,
  transcript jsonb,
  extracted_data jsonb,
  properties_mentioned jsonb,
  transfer_status text,
  transfer_target text,
  recording_url text,
  created_task_ids jsonb,
  is_new_lead boolean DEFAULT false,
  raw_webhook jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptionist_calls TO anon, authenticated;
GRANT ALL ON public.receptionist_calls TO service_role;
ALTER TABLE public.receptionist_calls DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_receptionist_calls_lead ON public.receptionist_calls(lead_id);
CREATE INDEX idx_receptionist_calls_started ON public.receptionist_calls(started_at DESC);

CREATE TRIGGER trg_receptionist_calls_updated
  BEFORE UPDATE ON public.receptionist_calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tool events
CREATE TABLE public.receptionist_tool_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.receptionist_calls(id) ON DELETE CASCADE,
  elevenlabs_conversation_id text,
  tool_name text NOT NULL,
  request_summary jsonb,
  result_summary jsonb,
  success boolean DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptionist_tool_events TO anon, authenticated;
GRANT ALL ON public.receptionist_tool_events TO service_role;
ALTER TABLE public.receptionist_tool_events DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_receptionist_tool_events_call ON public.receptionist_tool_events(call_id);
CREATE INDEX idx_receptionist_tool_events_conv ON public.receptionist_tool_events(elevenlabs_conversation_id);

-- Settings (single row keyed by id='default')
CREATE TABLE public.receptionist_settings (
  id text PRIMARY KEY DEFAULT 'default',
  agent_display_name text DEFAULT 'AI Receptionist',
  greeting text DEFAULT 'Hello, thank you for calling. How can I help you today?',
  languages jsonb DEFAULT '["en"]'::jsonb,
  business_hours jsonb DEFAULT '{"timezone":"Asia/Qatar","mon_fri":"09:00-18:00","sat":"10:00-16:00","sun":"closed"}'::jsonb,
  after_hours_behaviour text DEFAULT 'take_message',
  human_transfer_number text,
  max_call_duration_seconds integer DEFAULT 900,
  qualification_questions jsonb DEFAULT '[]'::jsonb,
  required_lead_fields jsonb DEFAULT '["name","phone"]'::jsonb,
  allowed_property_info jsonb DEFAULT '["name","location","price","bedrooms","availability","features"]'::jsonb,
  callback_rules jsonb DEFAULT '{}'::jsonb,
  viewing_request_rules jsonb DEFAULT '{}'::jsonb,
  outbound_test_allowlist jsonb DEFAULT '[]'::jsonb,
  enabled boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptionist_settings TO anon, authenticated;
GRANT ALL ON public.receptionist_settings TO service_role;
ALTER TABLE public.receptionist_settings DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_receptionist_settings_updated
  BEFORE UPDATE ON public.receptionist_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.receptionist_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;
