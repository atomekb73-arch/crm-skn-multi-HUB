-- ============================================================================
-- MIGRACJA RBAC ADMIN PANEL V2 (Moduł RBAC, Strzeżone Logowanie, Izolacja Kół)
-- Idempotentna i bezpieczna względem istniejącej tabeli public.organizations
-- oraz istniejących danych CRM (members, attendance, quarantine_submissions,
-- board_terms, organization_settings, email_templates, research_projects,
-- meeting_metadata).
-- ============================================================================

-- 1. Tabela profili użytkowników RBAC
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT user_profiles_role_check CHECK (lower(role) IN ('superadmin', 'admin', 'user'))
);

-- Unikalność po znormalizowanym adresie email (małe litery)
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_email_lower
  ON public.user_profiles (lower(trim(email)));

CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_uid
  ON public.user_profiles (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_role_active
  ON public.user_profiles (role, is_active);

-- 2. Tabela przypisań użytkowników do kół naukowych
CREATE TABLE IF NOT EXISTS public.user_organization_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_org_access UNIQUE (user_id, organization_id),
  CONSTRAINT user_org_access_role_check CHECK (lower(role) IN ('superadmin', 'admin', 'user'))
);

CREATE INDEX IF NOT EXISTS idx_user_org_access_user_id
  ON public.user_organization_access (user_id);

CREATE INDEX IF NOT EXISTS idx_user_org_access_org_id
  ON public.user_organization_access (organization_id);

-- UWAGA: public.organizations istnieje już w tej bazie (23 koła WSKZ współdzielone
-- z Generatorem Formularzy). Celowo NIE nadpisujemy ani NIE usuwamy jej struktury.

-- 3. Funkcja normalizacji ID koła po stronie SQL (spójna z frontendem)
CREATE OR REPLACE FUNCTION public.normalize_crm_org_id(raw_org_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw_org_id IS NULL OR trim(raw_org_id) = '' THEN ''
    WHEN lower(trim(raw_org_id)) IN ('skn-template', 'default', 'skn-seksuologia', 'skn-seksuologii') THEN 'skn_seksuologii'
    WHEN lower(trim(raw_org_id)) IN ('skn-uzaleznien', 'skn-zachowan-ryzykownych', 'skn-psychologii-zachowan-ryzykownych') THEN 'uzaleznienia'
    WHEN lower(trim(raw_org_id)) IN ('skn-psychoonkologii') THEN 'psychoonkologia'
    ELSE lower(trim(raw_org_id))
  END;
$$;

-- 4. Usunięcie testowych / nielegalnych wpisów ('test' oraz wildcard '*' dla innych niż Superadmin)
DELETE FROM public.club_memberships
WHERE lower(trim(club_id)) = 'test'
   OR (trim(club_id) = '*' AND lower(trim(email)) <> 'atomekb73@gmail.com');

DELETE FROM public.user_organization_access uoa
USING public.user_profiles up
WHERE uoa.user_id = up.id
  AND (
    lower(trim(uoa.organization_id)) = 'test'
    OR (trim(uoa.organization_id) = '*' AND lower(trim(up.email)) <> 'atomekb73@gmail.com')
  );

-- 5. Seed chronionego konta Superadministratora (atomekb73@gmail.com)
INSERT INTO public.user_profiles (auth_user_id, email, name, role, must_change_password, is_active)
SELECT
  au.id,
  'atomekb73@gmail.com',
  'Tomasz Bratkowski (Superadmin)',
  'superadmin',
  FALSE,
  TRUE
FROM (SELECT 1) AS dummy
LEFT JOIN auth.users au ON lower(trim(au.email)) = 'atomekb73@gmail.com'
ON CONFLICT ((lower(trim(email)))) DO UPDATE SET
  role = 'superadmin',
  must_change_password = FALSE,
  is_active = TRUE,
  auth_user_id = COALESCE(public.user_profiles.auth_user_id, EXCLUDED.auth_user_id),
  updated_at = NOW();

INSERT INTO public.user_organization_access (user_id, organization_id, role)
SELECT up.id, '*', 'superadmin'
FROM public.user_profiles up
WHERE lower(trim(up.email)) = 'atomekb73@gmail.com'
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'superadmin';

-- 6. Jednorazowy, idempotentny backfill aktywnych członków zarządu z club_memberships
INSERT INTO public.user_profiles (email, name, role, must_change_password, is_active)
SELECT
  lower(trim(cm.email)) AS email,
  COALESCE(NULLIF(MAX(trim(cm.member_name)), ''), split_part(lower(trim(cm.email)), '@', 1)) AS name,
  CASE
    WHEN lower(trim(cm.email)) = 'atomekb73@gmail.com' THEN 'superadmin'
    WHEN bool_or(lower(cm.role) IN ('admin', 'club_admin', 'board', 'zarzad', 'super_admin')) THEN 'admin'
    ELSE 'user'
  END AS role,
  FALSE AS must_change_password,
  TRUE AS is_active
FROM public.club_memberships cm
WHERE cm.active = TRUE
  AND cm.email IS NOT NULL
  AND trim(cm.email) <> ''
  AND lower(trim(cm.club_id)) <> 'test'
GROUP BY lower(trim(cm.email))
ON CONFLICT ((lower(trim(email)))) DO NOTHING;

INSERT INTO public.user_organization_access (user_id, organization_id, role)
SELECT DISTINCT
  up.id,
  public.normalize_crm_org_id(cm.club_id) AS organization_id,
  CASE
    WHEN lower(trim(up.email)) = 'atomekb73@gmail.com' THEN 'superadmin'
    WHEN lower(cm.role) IN ('admin', 'club_admin', 'board', 'zarzad', 'super_admin') THEN 'admin'
    ELSE 'user'
  END AS role
FROM public.club_memberships cm
JOIN public.user_profiles up ON lower(trim(up.email)) = lower(trim(cm.email))
WHERE cm.active = TRUE
  AND public.normalize_crm_org_id(cm.club_id) NOT IN ('', 'test', '*')
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- 7. Triggery chroniące Superadministratora (atomekb73@gmail.com) przed usunięciem lub degradacją
CREATE OR REPLACE FUNCTION public.protect_superadmin_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(trim(OLD.email)) = 'atomekb73@gmail.com' THEN
      RAISE EXCEPTION 'Nie można usunąć chronionego konta Superadministratora (atomekb73@gmail.com).';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF lower(trim(OLD.email)) = 'atomekb73@gmail.com' THEN
      IF lower(trim(NEW.email)) <> 'atomekb73@gmail.com'
         OR lower(trim(NEW.role)) <> 'superadmin'
         OR NEW.is_active = FALSE THEN
        RAISE EXCEPTION 'Konto Superadministratora (atomekb73@gmail.com) jest chronione przed degradacją, zmianą adresu i blokadą.';
      END IF;
    ELSIF lower(trim(NEW.role)) = 'superadmin' THEN
      RAISE EXCEPTION 'Rola Superadministratora jest zastrzeżona wyłącznie dla atomekb73@gmail.com.';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF lower(trim(NEW.role)) = 'superadmin' AND lower(trim(NEW.email)) <> 'atomekb73@gmail.com' THEN
      RAISE EXCEPTION 'Rola Superadministratora jest zastrzeżona wyłącznie dla atomekb73@gmail.com.';
    END IF;
    NEW.email := lower(trim(NEW.email));
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_superadmin_profile ON public.user_profiles;
CREATE TRIGGER trg_protect_superadmin_profile
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_superadmin_profile();

CREATE OR REPLACE FUNCTION public.protect_superadmin_org_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT lower(trim(email)) INTO v_email FROM public.user_profiles WHERE id = OLD.user_id;
    IF v_email = 'atomekb73@gmail.com' AND OLD.organization_id = '*' THEN
      RAISE EXCEPTION 'Nie można odebrać pełnego dostępu (*) chronionemu kontu Superadministratora.';
    END IF;
    RETURN OLD;
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM public.user_profiles WHERE id = NEW.user_id;
  IF lower(trim(NEW.organization_id)) = 'test' THEN
    RAISE EXCEPTION 'Koło testowe ("test") jest zablokowane w środowisku produkcyjnym.';
  END IF;
  IF trim(NEW.organization_id) = '*' AND coalesce(v_email, '') <> 'atomekb73@gmail.com' THEN
    RAISE EXCEPTION 'Dostęp typu wildcard (*) jest zastrzeżony wyłącznie dla atomekb73@gmail.com.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_superadmin_org_access ON public.user_organization_access;
CREATE TRIGGER trg_protect_superadmin_org_access
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_organization_access
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_superadmin_org_access();

-- 8. Funkcje pomocnicze RLS: is_super_admin() i has_access_to_organization(target_org_id)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    WHEN lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'atomekb73@gmail.com' THEN TRUE
    ELSE EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE (up.id = auth.uid() OR up.auth_user_id = auth.uid())
        AND lower(trim(up.email)) = 'atomekb73@gmail.com'
        AND lower(up.role) = 'superadmin'
        AND up.is_active = TRUE
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_organization(target_org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN target_org_id IS NULL OR public.normalize_crm_org_id(target_org_id) IN ('', 'test') THEN FALSE
    WHEN auth.uid() IS NOT NULL THEN
      (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1
          FROM public.user_profiles up
          JOIN public.user_organization_access uoa ON uoa.user_id = up.id
          WHERE (
              up.id = auth.uid()
              OR up.auth_user_id = auth.uid()
              OR lower(trim(up.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
            AND up.is_active = TRUE
            AND (
              public.normalize_crm_org_id(uoa.organization_id) = public.normalize_crm_org_id(target_org_id)
              OR (uoa.organization_id = '*' AND lower(trim(up.email)) = 'atomekb73@gmail.com')
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.club_memberships cm
          WHERE lower(trim(cm.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            AND cm.active = TRUE
            AND public.normalize_crm_org_id(cm.club_id) = public.normalize_crm_org_id(target_org_id)
        )
      )
      AND (
        public.current_tenant_org_id() IS NULL
        OR public.normalize_crm_org_id(public.current_tenant_org_id()) = public.normalize_crm_org_id(target_org_id)
      )
    ELSE
      -- Tryb obecnego klienta SPA (anon + nagłówek x-organization-id): ścisła izolacja po tenancie
      public.current_tenant_org_id() IS NOT NULL
      AND public.normalize_crm_org_id(public.current_tenant_org_id()) = public.normalize_crm_org_id(target_org_id)
  END;
$$;

-- 9. Bezpieczny widok v_effective_access (zachowuje oryginalną sygnaturę: club_id, email, role, active)
CREATE OR REPLACE VIEW public.v_effective_access AS
WITH rbac_rows AS (
  SELECT
    CASE
      WHEN uoa.organization_id = '*' THEN '*'
      ELSE public.normalize_crm_org_id(uoa.organization_id)
    END AS club_id,
    lower(trim(up.email)) AS email,
    CASE
      WHEN lower(trim(up.email)) = 'atomekb73@gmail.com' THEN 'SUPER_ADMIN'
      WHEN lower(coalesce(uoa.role, up.role)) = 'admin' THEN 'CLUB_ADMIN'
      ELSE 'VIEWER'
    END AS role,
    up.is_active AS active
  FROM public.user_profiles up
  JOIN public.user_organization_access uoa ON uoa.user_id = up.id
  WHERE public.normalize_crm_org_id(uoa.organization_id) <> 'test'
    AND (uoa.organization_id <> '*' OR lower(trim(up.email)) = 'atomekb73@gmail.com')
),
membership_rows AS (
  SELECT
    public.normalize_crm_org_id(cm.club_id) AS club_id,
    lower(trim(cm.email)) AS email,
    CASE
      WHEN lower(trim(cm.email)) = 'atomekb73@gmail.com' THEN 'SUPER_ADMIN'
      WHEN lower(coalesce(cm.role, '')) IN ('admin', 'club_admin', 'board', 'zarzad', 'super_admin') THEN 'CLUB_ADMIN'
      ELSE 'VIEWER'
    END AS role,
    cm.active AS active
  FROM public.club_memberships cm
  LEFT JOIN public.user_profiles up ON lower(trim(up.email)) = lower(trim(cm.email))
  WHERE cm.active = TRUE
    AND coalesce(up.is_active, TRUE) = TRUE
    AND public.normalize_crm_org_id(cm.club_id) NOT IN ('', 'test', '*')
)
SELECT DISTINCT ON (club_id, email)
  club_id,
  email,
  role,
  active
FROM (
  SELECT *, 1 AS prio FROM rbac_rows
  UNION ALL
  SELECT *, 2 AS prio FROM membership_rows
) merged
WHERE club_id IS NOT NULL AND club_id <> '' AND club_id <> 'test'
ORDER BY club_id, email, prio ASC, active DESC;

-- 10. Funkcja RPC do bezpiecznego sprawdzenia statusu logowania (bez ujawniania hashów haseł)
CREATE OR REPLACE FUNCTION public.get_rbac_login_profile(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(coalesce(p_email, '')));
  v_profile RECORD;
  v_clubs TEXT[];
BEGIN
  IF v_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT id, email, name, role, must_change_password, is_active, updated_at, last_login_at
  INTO v_profile
  FROM public.user_profiles
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(DISTINCT uoa.organization_id), ARRAY[]::TEXT[])
  INTO v_clubs
  FROM public.user_organization_access uoa
  WHERE uoa.user_id = v_profile.id
    AND uoa.organization_id <> 'test'
    AND (uoa.organization_id <> '*' OR v_email = 'atomekb73@gmail.com');

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'email', v_profile.email,
    'name', v_profile.name,
    'role', CASE WHEN v_email = 'atomekb73@gmail.com' THEN 'superadmin' ELSE lower(v_profile.role) END,
    'must_change_password', CASE WHEN v_email = 'atomekb73@gmail.com' THEN FALSE ELSE v_profile.must_change_password END,
    'is_active', CASE WHEN v_email = 'atomekb73@gmail.com' THEN TRUE ELSE v_profile.is_active END,
    'clubs', to_jsonb(v_clubs),
    'updated_at', v_profile.updated_at,
    'last_login_at', v_profile.last_login_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rbac_login_profile(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_access_to_organization(TEXT) TO anon, authenticated;

-- 11. Row Level Security (RLS) dla tabel RBAC oraz tabel domenowych CRM
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organization_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rbac_profiles_select" ON public.user_profiles;
CREATE POLICY "rbac_profiles_select" ON public.user_profiles
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR id = (SELECT auth.uid())
    OR auth_user_id = (SELECT auth.uid())
    OR lower(trim(email)) = lower(trim(coalesce((SELECT auth.jwt() ->> 'email'), '')))
  );

DROP POLICY IF EXISTS "rbac_profiles_superadmin_write" ON public.user_profiles;
CREATE POLICY "rbac_profiles_superadmin_write" ON public.user_profiles
  FOR ALL USING (
    (SELECT public.is_super_admin())
  ) WITH CHECK (
    (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS "rbac_org_access_select" ON public.user_organization_access;
CREATE POLICY "rbac_org_access_select" ON public.user_organization_access
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = user_organization_access.user_id
        AND (
          up.id = (SELECT auth.uid())
          OR up.auth_user_id = (SELECT auth.uid())
          OR lower(trim(up.email)) = lower(trim(coalesce((SELECT auth.jwt() ->> 'email'), '')))
        )
    )
  );

DROP POLICY IF EXISTS "rbac_org_access_superadmin_write" ON public.user_organization_access;
CREATE POLICY "rbac_org_access_superadmin_write" ON public.user_organization_access
  FOR ALL USING (
    (SELECT public.is_super_admin())
  ) WITH CHECK (
    (SELECT public.is_super_admin())
  );

-- Aktualizacja polityk RLS na tabelach danych CRM tak, aby wykorzystywały has_access_to_organization(organization_id)
DO $$
DECLARE
  v_table TEXT;
  v_pol RECORD;
  v_tables TEXT[] := ARRAY[
    'members',
    'attendance',
    'board_terms',
    'organization_settings',
    'email_templates',
    'research_projects',
    'meeting_metadata'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      FOR v_pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_table);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY "rbac_tenant_isolation_%s" ON public.%I FOR ALL USING ((SELECT public.has_access_to_organization(organization_id))) WITH CHECK ((SELECT public.has_access_to_organization(organization_id)))',
        v_table, v_table
      );
    END IF;
  END LOOP;
END $$;

-- Dla quarantine_submissions zachowujemy możliwość publicznego wysyłania formularza rekrutacyjnego (INSERT)
DO $$
DECLARE
  v_pol RECORD;
BEGIN
  IF to_regclass('public.quarantine_submissions') IS NOT NULL THEN
    ALTER TABLE public.quarantine_submissions ENABLE ROW LEVEL SECURITY;
    FOR v_pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'quarantine_submissions'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.quarantine_submissions', v_pol.policyname);
    END LOOP;

    CREATE POLICY "rbac_select_quarantine_submissions" ON public.quarantine_submissions
      FOR SELECT USING ((SELECT public.has_access_to_organization(organization_id)));

    CREATE POLICY "rbac_insert_quarantine_submissions" ON public.quarantine_submissions
      FOR INSERT WITH CHECK (
        public.normalize_crm_org_id(organization_id) NOT IN ('', 'test')
      );

    CREATE POLICY "rbac_update_quarantine_submissions" ON public.quarantine_submissions
      FOR UPDATE USING ((SELECT public.has_access_to_organization(organization_id)))
      WITH CHECK ((SELECT public.has_access_to_organization(organization_id)));

    CREATE POLICY "rbac_delete_quarantine_submissions" ON public.quarantine_submissions
      FOR DELETE USING ((SELECT public.has_access_to_organization(organization_id)));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.complete_rbac_password_change(
  p_email TEXT,
  p_new_password_hash TEXT,
  p_old_password_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(coalesce(p_email, '')));
  v_jwt_email TEXT := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_profile RECORD;
BEGIN
  IF v_email = '' OR coalesce(trim(p_new_password_hash), '') = '' THEN
    RETURN FALSE;
  END IF;

  SELECT id, auth_user_id, password_hash, must_change_password, is_active
  INTO v_profile
  FROM public.user_profiles
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF NOT FOUND OR v_profile.is_active = FALSE THEN
    RETURN FALSE;
  END IF;

  -- Ochrona konta Superadmina: wymaga zweryfikowanego poprzedniego hasła lub sesji Auth
  IF v_email = 'atomekb73@gmail.com' THEN
    IF NOT (
      (auth.uid() IS NOT NULL AND (v_profile.id = auth.uid() OR v_profile.auth_user_id = auth.uid() OR v_jwt_email = v_email))
      OR (v_profile.password_hash IS NOT NULL AND v_profile.password_hash = p_old_password_hash)
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Wymagaj autoryzacji przez sesję Auth, pasujący stary hash lub stan pierwszego logowania (must_change_password = TRUE przy braku starego hasha)
  IF NOT (
    (auth.uid() IS NOT NULL AND (v_profile.id = auth.uid() OR v_profile.auth_user_id = auth.uid() OR v_jwt_email = v_email))
    OR (v_profile.password_hash IS NOT NULL AND v_profile.password_hash = p_old_password_hash)
    OR (v_profile.password_hash IS NULL AND v_profile.must_change_password = TRUE)
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_profiles
  SET
    password_hash = p_new_password_hash,
    must_change_password = FALSE,
    updated_at = NOW(),
    last_login_at = NOW()
  WHERE id = v_profile.id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_rbac_password_change(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Odświeżenie cache schematu PostgREST
NOTIFY pgrst, 'reload schema';
