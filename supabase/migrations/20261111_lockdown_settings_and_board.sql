-- ==============================================================================
-- ETAP 4: LOCKDOWN RLS DLA USTAWIEŃ, KADENCJI ZARZĄDU I SZABLONÓW EMAIL
-- Data: 2026-11-11
-- Projekt: crm-skn-multi-HUB
-- Opis:
--   1. Włączenie i bezwzględne wymuszenie RLS (FORCE ROW LEVEL SECURITY)
--      dla tabel: organization_settings, board_terms, email_templates.
--   2. Usunięcie starych, nieograniczonych polityk publicznych (Allow public update / insert / delete).
--   3. Wdrożenie ścisłych polityk dzierżawczych (Scoped Tenant RLS) powiązanych
--      z public.current_tenant_org_id() - blokada nieautoryzowanych modyfikacji.
-- ==============================================================================

-- 1. Jawne włączenie i wymuszenie RLS
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.board_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_terms FORCE ROW LEVEL SECURITY;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates FORCE ROW LEVEL SECURITY;


-- 2. Usunięcie wszelkich starych polityk z tych trzech tabel
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('organization_settings', 'board_terms', 'email_templates')
    ) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;


-- 3. POLITYKI DLA ORGANIZATION_SETTINGS
-- Odczyt: dostępny (potrzebny m.in. przy sprawdzaniu uprawnień i konfiguracji kół przed logowaniem)
CREATE POLICY "Public select organization_settings" ON public.organization_settings
  FOR SELECT TO anon, authenticated, service_role
  USING (true);

-- Wstawianie: wyłącznie ze zgodnym nagłówkiem organizacji (tenant)
CREATE POLICY "Scoped insert organization_settings" ON public.organization_settings
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

-- Aktualizacja: wyłącznie ze zgodnym nagłówkiem organizacji (tenant)
CREATE POLICY "Scoped update organization_settings" ON public.organization_settings
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  )
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

-- Usuwanie: wyłącznie ze zgodnym nagłówkiem organizacji (tenant)
CREATE POLICY "Scoped delete organization_settings" ON public.organization_settings
  FOR DELETE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );


-- 4. POLITYKI DLA BOARD_TERMS (Kadencje Zarządu)
-- Odczyt: dostępny (potrzebny przy weryfikacji ról zarządczych przed zalogowaniem)
CREATE POLICY "Public select board_terms" ON public.board_terms
  FOR SELECT TO anon, authenticated, service_role
  USING (true);

-- Modyfikacja kadencji: wyłącznie ze zgodnym nagłówkiem organizacji (tenant)
CREATE POLICY "Scoped insert board_terms" ON public.board_terms
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped update board_terms" ON public.board_terms
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  )
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped delete board_terms" ON public.board_terms
  FOR DELETE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );


-- 5. POLITYKI DLA EMAIL_TEMPLATES (Szablony wiadomości e-mail)
-- Odczyt i modyfikacja: ściśle ograniczone do zalogowanego personelu koła (tenant)
CREATE POLICY "Scoped select email_templates" ON public.email_templates
  FOR SELECT TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped insert email_templates" ON public.email_templates
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped update email_templates" ON public.email_templates
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  )
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped delete email_templates" ON public.email_templates
  FOR DELETE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL
    AND organization_id = public.current_tenant_org_id()
  );
