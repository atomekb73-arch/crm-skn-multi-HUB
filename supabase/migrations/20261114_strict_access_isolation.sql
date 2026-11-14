-- ==============================================================================
-- MIGRACJA: ŚCISŁA IZOLACJA KÓŁ NAUKOWYCH ORAZ KILL SWITCH SUPERADMINA
-- Data: 2026-11-14
-- Projekt: crm-skn-multi-HUB
-- Opis:
--   1. Usunięcie nieprodukcyjnych rekordów testowych (`club_id = 'test'`) z club_memberships.
--   2. Aktualizacja widoku `v_effective_access`, aby respektował listę cofniętych
--      dostępów (`organization_settings.settings->'revoked_access'`) oraz wykluczał
--      środowisko `test` i globalne uprawnienia `SUPER_ADMIN` dla kont innych niż
--      atomekb73@gmail.com.
-- ==============================================================================

-- 1. Oczyszczenie śmieciowych rekordów środowiska 'test'
DELETE FROM public.club_memberships
WHERE lower(trim(club_id)) = 'test';

-- 2. Utwardzony widok v_effective_access z weryfikacją Kill Switch (revoked_access)
CREATE OR REPLACE VIEW public.v_effective_access AS
  WITH revoked AS (
    SELECT
      lower(trim(os.organization_id)) AS club_id,
      lower(trim(coalesce(elem->>'email', trim(both '"' from elem::text)))) AS email
    FROM public.organization_settings os,
         LATERAL jsonb_array_elements(coalesce(os.settings->'revoked_access', '[]'::jsonb)) elem
    WHERE coalesce(elem->>'active', 'false') <> 'true'
  )
  SELECT
    cm.club_id,
    cm.email::citext AS email,
    cm.member_name,
    cm.member_id,
    CASE
      WHEN lower(trim(cm.email::text)) <> 'atomekb73@gmail.com' AND cm.role = 'SUPER_ADMIN' THEN 'ADMIN'
      ELSE cm.role
    END AS role,
    cm.role_label,
    cm.source,
    cm.active
  FROM public.club_memberships cm
  WHERE cm.active = true
    AND lower(trim(cm.club_id)) <> 'test'
    AND NOT EXISTS (
      SELECT 1 FROM revoked r
      WHERE r.club_id = lower(trim(cm.club_id))
        AND r.email = lower(trim(cm.email::text))
    )

  UNION

  SELECT
    bt.organization_id AS club_id,
    lower(trim(bt.member_email))::citext AS email,
    bt.member_name,
    NULL::uuid AS member_id,
    CASE
      WHEN lower(bt.role_name) LIKE '%przewodnicz%' OR lower(bt.role_name) LIKE '%sekretarz%' THEN 'ADMIN'
      ELSE 'COORDINATOR'
    END AS role,
    bt.role_name AS role_label,
    'board' AS source,
    true AS active
  FROM public.board_terms bt
  WHERE bt.is_active = true
    AND lower(trim(bt.organization_id)) <> 'test'
    AND bt.member_email IS NOT NULL
    AND length(trim(bt.member_email)) > 3
    AND NOT EXISTS (
      SELECT 1 FROM revoked r
      WHERE r.club_id = lower(trim(bt.organization_id))
        AND r.email = lower(trim(bt.member_email))
    );

GRANT SELECT ON public.v_effective_access TO anon, authenticated, service_role;
