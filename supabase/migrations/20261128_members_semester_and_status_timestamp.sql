-- ==============================================================================
-- Migracja: Dodanie kolumn `semester` (int 1..10) oraz `study_status_updated_at`
-- do tabeli `members` (oraz `semester` do `quarantine_submissions`)
-- dla dokładnego automatycznego przeliczania roku i semestru studiów (WSKZ).
-- ==============================================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS semester INTEGER
    CHECK (semester IS NULL OR (semester >= 1 AND semester <= 12));

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS study_status_updated_at TIMESTAMPTZ;

ALTER TABLE public.quarantine_submissions
  ADD COLUMN IF NOT EXISTS semester INTEGER
    CHECK (semester IS NULL OR (semester >= 1 AND semester <= 12));

COMMENT ON COLUMN public.members.semester IS 'Aktualny semestr studiów (1-10) zapisany w momencie ostatniej weryfikacji statusu studenta';
COMMENT ON COLUMN public.members.study_status_updated_at IS 'Znacznik czasu ostatniej ręcznej weryfikacji roku/semestru studenta (punkt odniesienia dla automatycznego przyrostu semestrów)';
