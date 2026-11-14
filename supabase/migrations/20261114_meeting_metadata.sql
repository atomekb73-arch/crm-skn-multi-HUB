-- ==============================================================================
-- MIGRACJA: TABELA MEETING_METADATA W SUPABASE
-- Data: 2026-11-14
-- Projekt: crm-skn-multi-HUB
-- Opis:
--   1. Tworzy tabelę `meeting_metadata` dla rozszerzonych danych spotkań:
--      frekwencja z gośćmi spoza koła (total_participants), koła współorganizujące (co_organizers),
--      metadane spotkań własnych (custom_payload).
--   2. Włącza i wymusza Row Level Security (RLS) analogicznie do tabeli `attendance`
--      w oparciu o nagłówek x-organization-id (current_tenant_org_id()).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_metadata (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  meeting_key TEXT NOT NULL,
  title TEXT DEFAULT '',
  meeting_date DATE,
  meeting_type TEXT DEFAULT 'mandatory',
  total_participants INTEGER DEFAULT 0,
  co_organizers JSONB DEFAULT '[]'::jsonb,
  custom_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_meeting_metadata_org_key UNIQUE (organization_id, meeting_key)
);

-- Indeksy przyspieszające wyszukiwanie i filtrowanie
CREATE INDEX IF NOT EXISTS idx_meeting_metadata_org_id ON public.meeting_metadata (organization_id);
CREATE INDEX IF NOT EXISTS idx_meeting_metadata_meeting_key ON public.meeting_metadata (organization_id, meeting_key);
CREATE INDEX IF NOT EXISTS idx_meeting_metadata_date ON public.meeting_metadata (organization_id, meeting_date);

-- Nadanie uprawnień dla ról aplikacji
GRANT ALL ON TABLE public.meeting_metadata TO anon, authenticated, service_role;

-- Konfiguracja i wymuszenie Row Level Security (RLS)
ALTER TABLE public.meeting_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_metadata FORCE ROW LEVEL SECURITY;

-- Czyszczenie istniejących polityk przed ich redefinicją
DROP POLICY IF EXISTS "Scoped select meeting_metadata" ON public.meeting_metadata;
DROP POLICY IF EXISTS "Scoped insert meeting_metadata" ON public.meeting_metadata;
DROP POLICY IF EXISTS "Scoped update meeting_metadata" ON public.meeting_metadata;
DROP POLICY IF EXISTS "Scoped delete meeting_metadata" ON public.meeting_metadata;

-- Polityki RLS oparte na aktywnym tenancie (funkcja current_tenant_org_id() lub bezpośredni nagłówek)
CREATE POLICY "Scoped select meeting_metadata" ON public.meeting_metadata
  FOR SELECT TO anon, authenticated, service_role
  USING (
    organization_id IS NOT NULL 
    AND (
      public.current_tenant_org_id() IS NULL 
      OR organization_id = public.current_tenant_org_id()
    )
  );

CREATE POLICY "Scoped insert meeting_metadata" ON public.meeting_metadata
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    organization_id IS NOT NULL 
    AND (
      public.current_tenant_org_id() IS NULL 
      OR organization_id = public.current_tenant_org_id()
    )
  );

CREATE POLICY "Scoped update meeting_metadata" ON public.meeting_metadata
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    organization_id IS NOT NULL 
    AND (
      public.current_tenant_org_id() IS NULL 
      OR organization_id = public.current_tenant_org_id()
    )
  )
  WITH CHECK (
    organization_id IS NOT NULL 
    AND (
      public.current_tenant_org_id() IS NULL 
      OR organization_id = public.current_tenant_org_id()
    )
  );

CREATE POLICY "Scoped delete meeting_metadata" ON public.meeting_metadata
  FOR DELETE TO anon, authenticated, service_role
  USING (
    organization_id IS NOT NULL 
    AND (
      public.current_tenant_org_id() IS NULL 
      OR organization_id = public.current_tenant_org_id()
    )
  );
