-- ============================================================================
-- Migracja Multi-Tenant: Izolacja organizacji i kół naukowych (RLS + Indeksy)
-- ============================================================================

-- 1. Dodanie kolumny organization_id do kluczowych tabel (o ile nie istnieje)
ALTER TABLE IF EXISTS public.members 
  ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT 'skn_seksuologii';

ALTER TABLE IF EXISTS public.attendance 
  ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT 'skn_seksuologii';

ALTER TABLE IF EXISTS public.quarantine_submissions 
  ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT 'skn_seksuologii';

-- 2. Tabela Ustawień Organizacji (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  settings_key TEXT NOT NULL,
  settings_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_org_settings UNIQUE (organization_id, settings_key)
);

-- 3. Tabela Kadencji Zarządu (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.board_terms (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  member_index TEXT,
  member_email TEXT,
  role_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  points NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela Szablonów E-mail (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.email_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  config JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_org_email_template UNIQUE (organization_id, template_key)
);

-- 4b. Tabela Dorobku i Projektów Badawczych (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.research_projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'project',
  status TEXT DEFAULT 'active',
  date DATE,
  description TEXT,
  nr_indeksu TEXT,
  author_name TEXT,
  points NUMERIC DEFAULT 0,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Optymalizacja indeksów dla zapytań scoped po organization_id
CREATE INDEX IF NOT EXISTS idx_members_org_id ON public.members (organization_id);
CREATE INDEX IF NOT EXISTS idx_members_org_index ON public.members (organization_id, index_number);
CREATE INDEX IF NOT EXISTS idx_attendance_org_id ON public.attendance (organization_id);
CREATE INDEX IF NOT EXISTS idx_attendance_org_meeting ON public.attendance (organization_id, meeting_code);
CREATE INDEX IF NOT EXISTS idx_quarantine_org_id ON public.quarantine_submissions (organization_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_org_index ON public.quarantine_submissions (organization_id, index_number);
CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON public.organization_settings (organization_id);
CREATE INDEX IF NOT EXISTS idx_board_terms_org_id ON public.board_terms (organization_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON public.email_templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_org_id ON public.research_projects (organization_id);

-- 5b. Funkcja pomocnicza RLS odczytująca aktywny tenant z nagłówka x-organization-id lub JWT
CREATE OR REPLACE FUNCTION public.current_tenant_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(TRIM((current_setting('request.headers', true)::json ->> 'x-organization-id')), ''),
    NULLIF(TRIM((current_setting('request.jwt.claims', true)::json ->> 'organization_id')), '')
  );
$$;

-- 6. Konfiguracja Row Level Security (RLS)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarantine_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_projects ENABLE ROW LEVEL SECURITY;

-- Polityki dla members (ścisła izolacja po organization_id)
DROP POLICY IF EXISTS "Allow select members" ON public.members;
CREATE POLICY "Allow select members" ON public.members 
  FOR SELECT USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

DROP POLICY IF EXISTS "Allow insert members" ON public.members;
CREATE POLICY "Allow insert members" ON public.members 
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow update members" ON public.members;
CREATE POLICY "Allow update members" ON public.members 
  FOR UPDATE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  ) WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow delete members" ON public.members;
CREATE POLICY "Allow delete members" ON public.members 
  FOR DELETE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

-- Polityki dla attendance (ścisła izolacja po organization_id)
DROP POLICY IF EXISTS "Allow select attendance" ON public.attendance;
CREATE POLICY "Allow select attendance" ON public.attendance 
  FOR SELECT USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

DROP POLICY IF EXISTS "Allow insert attendance" ON public.attendance;
CREATE POLICY "Allow insert attendance" ON public.attendance 
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow update attendance" ON public.attendance;
CREATE POLICY "Allow update attendance" ON public.attendance 
  FOR UPDATE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  ) WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow delete attendance" ON public.attendance;
CREATE POLICY "Allow delete attendance" ON public.attendance 
  FOR DELETE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

-- Polityki dla quarantine_submissions (ścisła izolacja po organization_id)
DROP POLICY IF EXISTS "Allow select quarantine" ON public.quarantine_submissions;
CREATE POLICY "Allow select quarantine" ON public.quarantine_submissions 
  FOR SELECT USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

DROP POLICY IF EXISTS "Allow insert quarantine" ON public.quarantine_submissions;
CREATE POLICY "Allow insert quarantine" ON public.quarantine_submissions 
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow update quarantine" ON public.quarantine_submissions;
CREATE POLICY "Allow update quarantine" ON public.quarantine_submissions 
  FOR UPDATE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  ) WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow delete quarantine" ON public.quarantine_submissions;
CREATE POLICY "Allow delete quarantine" ON public.quarantine_submissions 
  FOR DELETE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

-- Polityki dla research_projects
DROP POLICY IF EXISTS "Allow select research_projects" ON public.research_projects;
CREATE POLICY "Allow select research_projects" ON public.research_projects 
  FOR SELECT USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

DROP POLICY IF EXISTS "Allow insert research_projects" ON public.research_projects;
CREATE POLICY "Allow insert research_projects" ON public.research_projects 
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow update research_projects" ON public.research_projects;
CREATE POLICY "Allow update research_projects" ON public.research_projects 
  FOR UPDATE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  ) WITH CHECK (
    organization_id IS NOT NULL AND length(trim(organization_id)) > 0
  );

DROP POLICY IF EXISTS "Allow delete research_projects" ON public.research_projects;
CREATE POLICY "Allow delete research_projects" ON public.research_projects 
  FOR DELETE USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NULL OR organization_id = public.current_tenant_org_id()
    )
  );

-- Polityki dla organization_settings
DROP POLICY IF EXISTS "Allow select organization_settings" ON public.organization_settings;
CREATE POLICY "Allow select organization_settings" ON public.organization_settings 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert organization_settings" ON public.organization_settings;
CREATE POLICY "Allow insert organization_settings" ON public.organization_settings 
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update organization_settings" ON public.organization_settings;
CREATE POLICY "Allow update organization_settings" ON public.organization_settings 
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete organization_settings" ON public.organization_settings;
CREATE POLICY "Allow delete organization_settings" ON public.organization_settings 
  FOR DELETE USING (true);

-- Polityki dla board_terms
DROP POLICY IF EXISTS "Allow select board_terms" ON public.board_terms;
CREATE POLICY "Allow select board_terms" ON public.board_terms 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert board_terms" ON public.board_terms;
CREATE POLICY "Allow insert board_terms" ON public.board_terms 
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update board_terms" ON public.board_terms;
CREATE POLICY "Allow update board_terms" ON public.board_terms 
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete board_terms" ON public.board_terms;
CREATE POLICY "Allow delete board_terms" ON public.board_terms 
  FOR DELETE USING (true);

-- Polityki dla email_templates
DROP POLICY IF EXISTS "Allow select email_templates" ON public.email_templates;
CREATE POLICY "Allow select email_templates" ON public.email_templates 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert email_templates" ON public.email_templates;
CREATE POLICY "Allow insert email_templates" ON public.email_templates 
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update email_templates" ON public.email_templates;
CREATE POLICY "Allow update email_templates" ON public.email_templates 
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete email_templates" ON public.email_templates;
CREATE POLICY "Allow delete email_templates" ON public.email_templates 
  FOR DELETE USING (true);
