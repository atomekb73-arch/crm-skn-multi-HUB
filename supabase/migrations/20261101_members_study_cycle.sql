-- Migracja: Rozszerzenie struktury tabeli members o śledzenie cyklu studiów i semestrów
-- Uruchom ten skrypt w Supabase SQL Editor.
-- Aplikacja posiada wbudowaną pełną kompatybilność wsteczną: dane są równolegle zabezpieczone w kolumnie JSONB custom_fields.

-- 1. Dodanie dedykowanych kolumn cyklu studiów i semestrów do tabeli members
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS start_year TEXT,
  ADD COLUMN IF NOT EXISTS start_semester TEXT DEFAULT '1',
  ADD COLUMN IF NOT EXISTS study_cycle TEXT DEFAULT 'licencjat',
  ADD COLUMN IF NOT EXISTS current_semester INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS academic_status TEXT DEFAULT 'active';

-- 2. Komentarze dokumentujące przeznaczenie kolumn
COMMENT ON COLUMN public.members.start_year IS 'Rok kalendarzowy lub akademicki rozpoczęcia studiów (np. 2023 lub 2023/2024)';
COMMENT ON COLUMN public.members.start_semester IS 'Semestr startowy: 1 (semestr zimowy / październik) lub 2 (semestr letni / luty/marzec)';
COMMENT ON COLUMN public.members.study_cycle IS 'Cykl kształcenia: licencjat (6 sem.), jednolite_mgr (10 sem.), magisterskie (4 sem.)';
COMMENT ON COLUMN public.members.current_semester IS 'Bieżący semestr wyliczony dynamicznie lub przypisany na podstawie toku studiów';
COMMENT ON COLUMN public.members.academic_status IS 'Status akademicki w cyklu: active (w trakcie studiów), final_semester (ostatni semestr przed obroną), graduate (absolwent po ukończeniu cyklu)';

-- 3. Indeksy dla szybkiego filtrowania statusów akademickich i cykli
CREATE INDEX IF NOT EXISTS idx_members_academic_status ON public.members (academic_status);
CREATE INDEX IF NOT EXISTS idx_members_study_cycle ON public.members (study_cycle);
CREATE INDEX IF NOT EXISTS idx_members_activity_status ON public.members (activity_status);
