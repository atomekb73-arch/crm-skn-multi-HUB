-- ==============================================================================
-- MIGRACJA: 20261102_attendance_unique_constraint.sql
-- Cel: Wymuszenie unikalności wpisów obecności w tabeli attendance (Supabase SSOT)
-- Opis: Zapobiega ponownemu wpisaniu tego samego użytkownika na to samo spotkanie
--       w ramach wybranej organizacji (klucz złożony: organization_id, meeting_code, index_number).
-- ==============================================================================

-- 1. Unikalny indeks złożony gwarantujący jednoznaczność każdego uczestnika na spotkaniu
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_org_meeting_user 
ON public.attendance (organization_id, meeting_code, index_number);

-- 2. Komentarz dokumentacyjny
COMMENT ON INDEX public.uq_attendance_org_meeting_user IS 
'Blokada duplikatów uczestników: jeden użytkownik (index_number) może mieć dokładnie 1 wpis na danym spotkaniu (meeting_code) w ramach organizacji (organization_id)';

-- 3. Zapewnienie uprawnień dla roli anon i authenticated do operacji na tabeli attendance
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO anon, authenticated;
