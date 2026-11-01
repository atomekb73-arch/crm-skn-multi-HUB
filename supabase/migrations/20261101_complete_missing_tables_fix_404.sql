-- ==============================================================================
-- KOMPLETNA MIGRACJA SUPABASE: ELIMINACJA BŁĘDÓW 404 I DOMKNIĘCIE STRUKTUR SSOT
-- Projekt: crm-skn-wskz (zlpvnxzqylfghdxgkyyf)
-- ==============================================================================
-- Skrypt tworzy brakujące tabele (organization_settings, board_terms,
-- email_templates, research_projects, organizations), nadaje uprawnienia,
-- konfiguruje Row Level Security (RLS) oraz automatycznie migruje dotychczasowe
-- ustawienia, hasła i kadencje z tabeli attendance do dedykowanych struktur.
-- ==============================================================================

-- 1. TABELA USTAWIEŃ ORGANIZACJI (Ustawienia, Opiekunowie, Hasła, Użytkownicy)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  settings_key TEXT NOT NULL,
  settings_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_organization_settings_key UNIQUE (organization_id, settings_key)
);

CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON public.organization_settings (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_settings_lookup ON public.organization_settings (organization_id, settings_key);

-- 2. TABELA KADENCJI ZARZĄDU I HISTORII PEŁNIONYCH FUNKCJI
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_terms (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  member_index TEXT,
  member_email TEXT,
  role_name TEXT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  points NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_terms_org_id ON public.board_terms (organization_id);
CREATE INDEX IF NOT EXISTS idx_board_terms_dates ON public.board_terms (organization_id, start_date);

-- 3. TABELA SZABLONÓW I KONFIGURACJI POCZTY E-MAIL
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_email_templates_key UNIQUE (organization_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON public.email_templates (organization_id);

-- 4. TABELA PROJEKTÓW BADAWCZYCH, PUBLIKACJI I KONFERENCJI (DOROBEK)
-- ------------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_research_projects_org_id ON public.research_projects (organization_id);

-- 5. TABELA ORGANIZACJI / KÓŁ NAUKOWYCH
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  tag TEXT,
  logo_url TEXT,
  sheet_id TEXT,
  subcalendar_id TEXT,
  calendar_key TEXT,
  drive_folder_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inicjalne rekordy dla znanych organizacji
INSERT INTO public.organizations (id, name, short_name, tag)
VALUES 
  ('skn_seksuologii', 'Studenckie Koło Naukowe Seksuologii WSKZ', 'SKN Seksuologii', 'SKN-SEKS'),
  ('uzaleznienia', 'Studenckie Koło Naukowe Zachowań Ryzykownych i Uzależnień', 'SKN Uzależnień', 'SKNU')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, tag = EXCLUDED.tag;

-- 6. NADAWANIE UPRAWNIEŃ DLA RÓL SUPABASE (anon, authenticated, service_role)
-- ------------------------------------------------------------------------------
GRANT ALL ON TABLE public.organization_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.board_terms TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_templates TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.research_projects TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.organizations TO anon, authenticated, service_role;

-- 7. KONFIGURACJA ROW LEVEL SECURITY (RLS) - PEŁNA INTEGRACJA Z APLIKACJĄ CRM
-- ------------------------------------------------------------------------------
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Polityki dla organization_settings
DROP POLICY IF EXISTS "Allow all on organization_settings" ON public.organization_settings;
CREATE POLICY "Allow all on organization_settings" ON public.organization_settings 
  FOR ALL USING (true) WITH CHECK (true);

-- Polityki dla board_terms
DROP POLICY IF EXISTS "Allow all on board_terms" ON public.board_terms;
CREATE POLICY "Allow all on board_terms" ON public.board_terms 
  FOR ALL USING (true) WITH CHECK (true);

-- Polityki dla email_templates
DROP POLICY IF EXISTS "Allow all on email_templates" ON public.email_templates;
CREATE POLICY "Allow all on email_templates" ON public.email_templates 
  FOR ALL USING (true) WITH CHECK (true);

-- Polityki dla research_projects
DROP POLICY IF EXISTS "Allow all on research_projects" ON public.research_projects;
CREATE POLICY "Allow all on research_projects" ON public.research_projects 
  FOR ALL USING (true) WITH CHECK (true);

-- Polityki dla organizations
DROP POLICY IF EXISTS "Allow all on organizations" ON public.organizations;
CREATE POLICY "Allow all on organizations" ON public.organizations 
  FOR ALL USING (true) WITH CHECK (true);

-- 8. AUTOMATYCZNA MIGRACJA DANYCH Z TABELI ATTENDANCE DO NOWYCH STRUKTUR
-- ------------------------------------------------------------------------------

-- 8a. Migracja ustawień, haseł użytkowników, opiekunów i wag punktowych
INSERT INTO public.organization_settings (id, organization_id, settings_key, settings_value, updated_at)
SELECT 
  organization_id || '_' || split_part(meeting_code, ':', 3) AS id,
  organization_id,
  split_part(meeting_code, ':', 3) AS settings_key,
  activity_description::jsonb AS settings_value,
  NOW() AS updated_at
FROM public.attendance
WHERE meeting_code LIKE '[SETTINGS]:%'
  AND split_part(meeting_code, ':', 3) <> ''
ON CONFLICT (id) DO UPDATE 
SET settings_value = EXCLUDED.settings_value, updated_at = NOW();

-- 8b. Migracja kadencji zarządu
INSERT INTO public.board_terms (id, organization_id, member_name, member_index, member_email, role_name, start_date, is_active, points, updated_at)
SELECT 
  COALESCE(activity_description::jsonb->>'id', id::text) AS id,
  organization_id,
  COALESCE(activity_description::jsonb->>'memberName', role, 'Członek Zarządu') AS member_name,
  COALESCE(activity_description::jsonb->>'memberIndex', index_number, '') AS member_index,
  COALESCE(activity_description::jsonb->>'memberEmail', '') AS member_email,
  COALESCE(activity_description::jsonb->>'roleName', role, 'Członek Zarządu') AS role_name,
  meeting_date AS start_date,
  COALESCE((activity_description::jsonb->>'isActive')::boolean, true) AS is_active,
  points,
  NOW() AS updated_at
FROM public.attendance
WHERE meeting_code LIKE '[BOARD_TERM]:%'
ON CONFLICT (id) DO UPDATE 
SET member_name = EXCLUDED.member_name, points = EXCLUDED.points, updated_at = NOW();

-- 8c. Migracja konfiguracji i szablonów e-mail
INSERT INTO public.email_templates (id, organization_id, template_key, subject, body, config, updated_at)
SELECT 
  organization_id || '_global_config' AS id,
  organization_id,
  '__GLOBAL_CONFIG__' AS template_key,
  COALESCE(activity_description::jsonb->>'welcomeSubjectTemplate', 'Witamy w Kole Naukowym') AS subject,
  COALESCE(activity_description::jsonb->>'welcomeBodyTemplate', '') AS body,
  activity_description::jsonb AS config,
  NOW() AS updated_at
FROM public.attendance
WHERE meeting_code LIKE '[EMAIL_CONFIG]:%'
ON CONFLICT (id) DO UPDATE 
SET config = EXCLUDED.config, subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = NOW();

-- 8d. Migracja dorobku naukowego
INSERT INTO public.research_projects (id, organization_id, title, type, status, date, description, nr_indeksu, author_name, points, payload, updated_at)
SELECT 
  COALESCE(activity_description::jsonb->>'id', id::text) AS id,
  organization_id,
  COALESCE(activity_description::jsonb->>'title', activity_description::jsonb->>'opis', 'Projekt badawczy') AS title,
  COALESCE(activity_description::jsonb->>'type', 'project') AS type,
  COALESCE(activity_description::jsonb->>'status', 'active') AS status,
  COALESCE((activity_description::jsonb->>'date')::date, meeting_date) AS date,
  COALESCE(activity_description::jsonb->>'description', activity_description::jsonb->>'opis', '') AS description,
  COALESCE(activity_description::jsonb->>'nrIndeksu', index_number, '') AS nr_indeksu,
  COALESCE(activity_description::jsonb->>'authorName', activity_description::jsonb->>'memberName', '') AS author_name,
  points,
  activity_description::jsonb AS payload,
  NOW() AS updated_at
FROM public.attendance
WHERE meeting_code LIKE '[DOROBEK]%'
ON CONFLICT (id) DO NOTHING;

-- 9. PRZEŁADOWANIE PAMIĘCI PODRĘCZNEJ SCHEMATU POSTGREST (PGRST205 FIX)
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
