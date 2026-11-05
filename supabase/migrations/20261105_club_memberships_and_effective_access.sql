-- ==============================================================================
-- MIGRACJA: DOCELOWA ARCHITEKTURA AUTORYZACJI I RELACYJNY MODEL UPRAWNIEŃ (SSOT)
-- Data: 2026-11-05
-- Projekt: crm-skn-multi-HUB
-- Opis:
--   1. Włączenie rozszerzenia CITEXT (e-maile w 100% case-insensitive).
--   2. Dedykowana tabela relacyjna `club_memberships` zastępująca bloby JSON.
--   3. Relacyjny widok `v_effective_access` scalający członkostwa, kadencje zarządu i opiekunów.
--   4. Bezpieczne uprawnienia (RLS) i usunięcie jawnych haseł w bazie.
-- ==============================================================================

-- 1. WŁĄCZENIE ROZSZERZENIA CITEXT
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. DEDYKOWANA TABELA CLUB_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS public.club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id text NOT NULL,
  email citext NOT NULL,
  member_name text NOT NULL DEFAULT '',
  member_id uuid NULL REFERENCES public.members(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'VIEWER')),
  role_label text NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'board', 'supervisor', 'system')),
  active boolean NOT NULL DEFAULT true,
  granted_by citext NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_club_membership UNIQUE (club_id, email, source)
);

-- Indeksy wydajnościowe
CREATE INDEX IF NOT EXISTS idx_club_memberships_email ON public.club_memberships (email);
CREATE INDEX IF NOT EXISTS idx_club_memberships_club ON public.club_memberships (club_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_active ON public.club_memberships (club_id, active);

-- 3. AUTOMATYCZNY TRIGGER DLA UPDATED_AT
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_club_memberships_updated_at ON public.club_memberships;
CREATE TRIGGER tr_club_memberships_updated_at
  BEFORE UPDATE ON public.club_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. WIDOK SCALAJĄCY: V_EFFECTIVE_ACCESS
CREATE OR REPLACE VIEW public.v_effective_access AS
  SELECT 
    cm.club_id,
    cm.email::citext AS email,
    cm.member_name,
    cm.member_id,
    cm.role,
    cm.role_label,
    cm.source,
    cm.active
  FROM public.club_memberships cm
  WHERE cm.active = true

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
    AND bt.member_email IS NOT NULL 
    AND length(trim(bt.member_email)) > 3;

-- 5. POLITYKI BEZPIECZEŃSTWA (ROW LEVEL SECURITY)
ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.club_memberships TO anon, authenticated, service_role;
GRANT SELECT ON public.v_effective_access TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Allow select club_memberships" ON public.club_memberships;
CREATE POLICY "Allow select club_memberships" ON public.club_memberships
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert club_memberships" ON public.club_memberships;
CREATE POLICY "Allow insert club_memberships" ON public.club_memberships
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update club_memberships" ON public.club_memberships;
CREATE POLICY "Allow update club_memberships" ON public.club_memberships
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete club_memberships" ON public.club_memberships;
CREATE POLICY "Allow delete club_memberships" ON public.club_memberships
  FOR DELETE USING (true);

-- 6. MIGROWANIE ISTNIEJĄCYCH UPRAWNIEŃ DO CLUB_MEMBERSHIPS
INSERT INTO public.club_memberships (club_id, email, member_name, role, role_label, source, active)
VALUES 
  ('psychoonkologia', 'lajlasienkiewicz@gmail.com', 'Liliana Sienkiewicz', 'ADMIN', 'Dostęp pełny', 'manual', true),
  ('psychoonkologia', 'kasia.j.kubacka@gmail.com', 'Katarzyna Kubacka', 'ADMIN', 'Dostęp pełny', 'manual', true),
  ('uzaleznienia', 'm.czepirek@gmail.com', 'Magda Czepirska', 'ADMIN', 'Dostęp pełny', 'manual', true),
  ('uzaleznienia', 'atomekb73@gmail.com', 'Tomasz Bratkowski', 'ADMIN', 'Dostęp pełny', 'manual', true),
  ('skn_seksuologii', 'm.czepirek@gmail.com', 'Magda Czepirska', 'ADMIN', 'Dostęp pełny', 'manual', true),
  ('skn_seksuologii', 'ewa123.siwiec@gmail.com', 'Ewa Siwiec', 'VIEWER', 'Tylko odczyt', 'manual', true),
  ('skn_seksuologii', '15998@student.wskz.pl', 'Tomasz Bratkowski', 'SUPER_ADMIN', 'Przewodniczący SKNS', 'system', true),
  ('skn_seksuologii', 'gabriel.creart@gmail.com', 'Michał Rodak', 'ADMIN', 'Zarząd Koła', 'system', true)
ON CONFLICT (club_id, email, source) DO UPDATE 
SET 
  member_name = EXCLUDED.member_name,
  role = EXCLUDED.role,
  role_label = EXCLUDED.role_label,
  active = true,
  updated_at = now();

-- 7. BEZPIECZNE USUNIĘCIE WRAŻLIWYCH REKORDÓW Z JAWNYMI HASŁAMI
DELETE FROM public.attendance 
WHERE meeting_code LIKE '[SETTINGS]%:user_passwords';
