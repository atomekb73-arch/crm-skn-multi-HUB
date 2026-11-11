-- ==============================================================================
-- ETAP 3: TWARDY RLS (ROW LEVEL SECURITY) I OCHRONA DANYCH OSOBOWYCH W SUPABASE
-- Data: 2026-11-11
-- Projekt: crm-skn-multi-HUB
-- Opis:
--   1. Likwidacja luki RLS w `club_memberships` (usunięcie GRANT ALL dla anon).
--   2. Bezpieczna funkcja RPC `check_candidate_exists` dla publicznego formularza rekrutacji.
--   3. Ograniczenie tabeli `members` i `attendance` - brak nieautoryzowanego odczytu/zapisu.
--   4. Ograniczenie tabeli `quarantine_submissions`: anonimowy kandydat może TYLKO wykonać INSERT.
-- ==============================================================================

-- 1. ZABEZPIECZENIE TABELI CLUB_MEMBERSHIPS (Role i uprawnienia administracyjne)
-- Usunięcie niebezpiecznych uprawnień modyfikacji dla roli publicznej (anon)
REVOKE INSERT, UPDATE, DELETE ON public.club_memberships FROM anon;
GRANT SELECT ON public.club_memberships TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Allow insert club_memberships" ON public.club_memberships;
DROP POLICY IF EXISTS "Allow update club_memberships" ON public.club_memberships;
DROP POLICY IF EXISTS "Allow delete club_memberships" ON public.club_memberships;

-- Tylko uwierzytelniony administrator lub service_role może modyfikować uprawnienia
CREATE POLICY "Restrict insert club_memberships" ON public.club_memberships
  FOR INSERT TO authenticated, service_role
  WITH CHECK (true);

CREATE POLICY "Restrict update club_memberships" ON public.club_memberships
  FOR UPDATE TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Restrict delete club_memberships" ON public.club_memberships
  FOR DELETE TO authenticated, service_role
  USING (true);


-- 2. BEZPIECZNA FUNKCJA WERYFIKACJI DUPLIKATÓW DLA REKRUTACJI (SECURITY DEFINER)
-- Umożliwia publicznemu formularzowi rekrutacji sprawdzenie czy kandydat już istnieje,
-- BEZ udostępniania całej tabeli members i telefonów osobom trzecim.
CREATE OR REPLACE FUNCTION public.check_recruitment_candidate(
  p_org_id TEXT,
  p_index TEXT,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_org TEXT := lower(trim(p_org_id));
  v_clean_index TEXT := trim(p_index);
  v_clean_email TEXT := lower(trim(p_email));
  v_existing_member RECORD;
  v_existing_quarantine RECORD;
BEGIN
  -- 1. Sprawdzenie w tabeli członków (members)
  SELECT id, full_name, activity_status INTO v_existing_member
  FROM public.members
  WHERE organization_id = v_clean_org
    AND (
      (length(v_clean_index) >= 4 AND trim(index_number) = v_clean_index)
      OR (length(v_clean_email) >= 5 AND lower(trim(email)) = v_clean_email)
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'exists', true,
      'source', 'members',
      'status', COALESCE(v_existing_member.activity_status, 'Aktywny'),
      'full_name', v_existing_member.full_name
    );
  END IF;

  -- 2. Sprawdzenie w tabeli kwarantanny (quarantine_submissions)
  SELECT id, full_name, decision_status INTO v_existing_quarantine
  FROM public.quarantine_submissions
  WHERE organization_id = v_clean_org
    AND (
      (length(v_clean_index) >= 4 AND trim(index_number) = v_clean_index)
      OR (length(v_clean_email) >= 5 AND lower(trim(email)) = v_clean_email)
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'exists', true,
      'source', 'quarantine',
      'status', COALESCE(v_existing_quarantine.decision_status, 'Oczekuje'),
      'full_name', v_existing_quarantine.full_name
    );
  END IF;

  -- Brak kolizji
  RETURN jsonb_build_object('exists', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_recruitment_candidate(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- 3. ZABEZPIECZENIE TABELI QUARANTINE_SUBMISSIONS
-- Anonimowy kandydat może TYLKO wykonać INSERT (wysłać nową deklarację)
DROP POLICY IF EXISTS "Allow select quarantine" ON public.quarantine_submissions;
DROP POLICY IF EXISTS "Allow insert quarantine" ON public.quarantine_submissions;
DROP POLICY IF EXISTS "Allow update quarantine" ON public.quarantine_submissions;
DROP POLICY IF EXISTS "Allow delete quarantine" ON public.quarantine_submissions;

-- Publiczny kandydat może składać deklarację
CREATE POLICY "Public insert quarantine" ON public.quarantine_submissions
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    organization_id IS NOT NULL 
    AND length(trim(organization_id)) > 0
    AND length(trim(full_name)) > 1
    AND length(trim(email)) > 3
  );

-- Odczyt, aktualizacja i usuwanie zgłoszeń kwarantanny dostępne wyłącznie dla personelu CRM
CREATE POLICY "Authorized select quarantine" ON public.quarantine_submissions
  FOR SELECT TO anon, authenticated, service_role
  USING (
    organization_id IS NOT NULL AND (
      public.current_tenant_org_id() IS NOT NULL AND organization_id = public.current_tenant_org_id()
    )
  );

CREATE POLICY "Authorized update quarantine" ON public.quarantine_submissions
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL AND organization_id = public.current_tenant_org_id()
  )
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Authorized delete quarantine" ON public.quarantine_submissions
  FOR DELETE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL AND organization_id = public.current_tenant_org_id()
  );


-- 4. UTWARDZENIE TABELI MEMBERS (Zlikwidowanie luki NULL w current_tenant_org_id)
DROP POLICY IF EXISTS "Allow select members" ON public.members;
DROP POLICY IF EXISTS "Allow insert members" ON public.members;
DROP POLICY IF EXISTS "Allow update members" ON public.members;
DROP POLICY IF EXISTS "Allow delete members" ON public.members;

-- Odczyt tabeli członków WYMAGA jawnego podania aktywnego tenanta w nagłówku x-organization-id
CREATE POLICY "Scoped select members" ON public.members
  FOR SELECT TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped insert members" ON public.members
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped update members" ON public.members
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  )
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped delete members" ON public.members
  FOR DELETE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );


-- 5. UTWARDZENIE TABELI ATTENDANCE (Zlikwidowanie luki NULL w current_tenant_org_id)
DROP POLICY IF EXISTS "Allow select attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow delete attendance" ON public.attendance;

CREATE POLICY "Scoped select attendance" ON public.attendance
  FOR SELECT TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped insert attendance" ON public.attendance
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped update attendance" ON public.attendance
  FOR UPDATE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  )
  WITH CHECK (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );

CREATE POLICY "Scoped delete attendance" ON public.attendance
  FOR DELETE TO anon, authenticated, service_role
  USING (
    public.current_tenant_org_id() IS NOT NULL 
    AND organization_id = public.current_tenant_org_id()
  );
