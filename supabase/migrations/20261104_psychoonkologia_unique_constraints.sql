-- ==============================================================================
-- MIGRACJA: 20261104_psychoonkologia_unique_constraints.sql
-- Cel: Twarda izolacja i ograniczenia unikalności dla koła Psychoonkologii (i wszystkich tenantów)
-- ==============================================================================

-- 1. Unikalność indeksu w ramach koła (tenanta) w tabeli members
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_org_index 
ON public.members (organization_id, index_number);

-- 2. Unikalność adresu e-mail w ramach koła (tenanta) w tabeli members
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_org_email 
ON public.members (organization_id, lower(trim(email)));

-- 3. Unikalność obecności uczestnika na danym spotkaniu w ramach koła
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_org_meeting_user 
ON public.attendance (organization_id, meeting_code, index_number);

-- 4. Indeksy ułatwiające filtrowanie zgłoszeń i zapytań tenantowych
CREATE INDEX IF NOT EXISTS idx_quarantine_submissions_org_idx 
ON public.quarantine_submissions (organization_id, index_number);

CREATE INDEX IF NOT EXISTS idx_members_org_email_lower 
ON public.members (organization_id, lower(trim(email)));

-- 5. Nadanie pełnych uprawnień dla roli anon i authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quarantine_submissions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO anon, authenticated;
