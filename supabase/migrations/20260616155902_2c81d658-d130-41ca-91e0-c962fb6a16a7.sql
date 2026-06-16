
-- ============= Shared trigger function =============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============= 1. organisations =============
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  logo_url TEXT,
  default_currency TEXT DEFAULT 'QAR',
  timezone TEXT DEFAULT 'Asia/Qatar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO anon, authenticated;
GRANT ALL ON public.organisations TO service_role;
ALTER TABLE public.organisations DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_organisations_updated BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= 2. team_members =============
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO anon, authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_team_members_updated BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= 3. leads =============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  nationality TEXT,
  preferred_language TEXT,
  budget_min NUMERIC,
  budget_max NUMERIC,
  currency TEXT DEFAULT 'QAR',
  preferred_locations TEXT[],
  preferred_property_types TEXT[],
  preferred_bedrooms INTEGER[],
  purchase_purpose TEXT,
  buying_timeline TEXT,
  financing_status TEXT,
  lead_source TEXT,
  pipeline_stage TEXT NOT NULL DEFAULT 'new_lead',
  assigned_agent_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_leads_full_name ON public.leads(full_name);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_email ON public.leads(email);
CREATE INDEX idx_leads_pipeline_stage ON public.leads(pipeline_stage);
CREATE INDEX idx_leads_assigned_agent_id ON public.leads(assigned_agent_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- ============= 4. properties =============
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  reference_code TEXT,
  property_type TEXT,
  location TEXT,
  developer TEXT,
  price NUMERIC,
  currency TEXT DEFAULT 'QAR',
  bedrooms INTEGER,
  bathrooms NUMERIC,
  size NUMERIC,
  size_unit TEXT,
  completion_status TEXT,
  availability TEXT NOT NULL DEFAULT 'available',
  description TEXT,
  amenities TEXT[],
  assigned_team UUID[],
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO anon, authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_properties_reference_code ON public.properties(reference_code);
CREATE INDEX idx_properties_property_type ON public.properties(property_type);
CREATE INDEX idx_properties_location ON public.properties(location);
CREATE INDEX idx_properties_price ON public.properties(price);
CREATE INDEX idx_properties_availability ON public.properties(availability);
CREATE INDEX idx_properties_status ON public.properties(status);

-- ============= 8. uploads (declared before property_media so FK resolves) =============
CREATE TABLE public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  lead_id UUID,
  property_id UUID,
  uploaded_by TEXT,
  category TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT,
  file_size BIGINT,
  processing_status TEXT NOT NULL DEFAULT 'uploaded',
  processing_error TEXT,
  extracted_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.uploads
  ADD CONSTRAINT uploads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
  ADD CONSTRAINT uploads_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO anon, authenticated;
GRANT ALL ON public.uploads TO service_role;
ALTER TABLE public.uploads DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_uploads_updated BEFORE UPDATE ON public.uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_uploads_lead_id ON public.uploads(lead_id);
CREATE INDEX idx_uploads_property_id ON public.uploads(property_id);
CREATE INDEX idx_uploads_category ON public.uploads(category);
CREATE INDEX idx_uploads_processing_status ON public.uploads(processing_status);
CREATE INDEX idx_uploads_created_at ON public.uploads(created_at DESC);

-- ============= 5. property_media =============
CREATE TABLE public.property_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.uploads(id) ON DELETE CASCADE,
  media_type TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_media TO anon, authenticated;
GRANT ALL ON public.property_media TO service_role;
ALTER TABLE public.property_media DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_property_media_property_id ON public.property_media(property_id);

-- ============= 6. lead_property_interests =============
CREATE TABLE public.lead_property_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  interest_level TEXT,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_property_interests TO anon, authenticated;
GRANT ALL ON public.lead_property_interests TO service_role;
ALTER TABLE public.lead_property_interests DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_lpi_updated BEFORE UPDATE ON public.lead_property_interests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_lpi_lead_id ON public.lead_property_interests(lead_id);
CREATE INDEX idx_lpi_property_id ON public.lead_property_interests(property_id);

-- ============= 7. interactions =============
CREATE TABLE public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL,
  direction TEXT,
  subject TEXT,
  content TEXT,
  interaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interactions TO anon, authenticated;
GRANT ALL ON public.interactions TO service_role;
ALTER TABLE public.interactions DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_interactions_updated BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_interactions_lead_id ON public.interactions(lead_id);
CREATE INDEX idx_interactions_property_id ON public.interactions(property_id);
CREATE INDEX idx_interactions_type ON public.interactions(interaction_type);
CREATE INDEX idx_interactions_date ON public.interactions(interaction_date DESC);

-- ============= 9. tasks =============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_lead_id ON public.tasks(lead_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_at ON public.tasks(due_at);

-- ============= 10. pipeline_history =============
CREATE TABLE public.pipeline_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  previous_stage TEXT,
  new_stage TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_history TO anon, authenticated;
GRANT ALL ON public.pipeline_history TO service_role;
ALTER TABLE public.pipeline_history DISABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pipeline_history_lead_id ON public.pipeline_history(lead_id);
CREATE INDEX idx_pipeline_history_changed_at ON public.pipeline_history(changed_at DESC);

-- ============= 11. ai_analyses =============
CREATE TABLE public.ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  analysis_type TEXT,
  status TEXT NOT NULL DEFAULT 'not_analysed',
  model TEXT,
  input_snapshot JSONB,
  output_json JSONB,
  confidence NUMERIC,
  error_message TEXT,
  generated_by TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_analyses TO anon, authenticated;
GRANT ALL ON public.ai_analyses TO service_role;
ALTER TABLE public.ai_analyses DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ai_analyses_updated BEFORE UPDATE ON public.ai_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ai_analyses_lead_id ON public.ai_analyses(lead_id);
CREATE INDEX idx_ai_analyses_status ON public.ai_analyses(status);
CREATE INDEX idx_ai_analyses_created_at ON public.ai_analyses(created_at DESC);

-- ============= 12. app_settings =============
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
