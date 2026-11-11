-- ==============================================================================
-- FINALNY LOCKDOWN RLS: WŁĄCZENIE I WYMUSZENIE RLS + CZYSZCZENIE STARYCH POLITYK
-- ==============================================================================

-- 1. Jawne włączenie i bezwzględne wymuszenie RLS (FORCE ROW LEVEL SECURITY)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance FORCE ROW LEVEL SECURITY;

ALTER TABLE public.quarantine_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarantine_submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_memberships FORCE ROW LEVEL SECURITY;


-- 2. Usunięcie wszelkich starych/domyślnych polityk, które mogły pozostać na tabelach
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('members', 'attendance', 'quarantine_submissions')
          AND policyname NOT IN (
            'Scoped select members', 'Scoped insert members', 'Scoped update members', 'Scoped delete members',
            'Scoped select attendance', 'Scoped insert attendance', 'Scoped update attendance', 'Scoped delete attendance',
            'Public insert quarantine', 'Authorized select quarantine', 'Authorized update quarantine', 'Authorized delete quarantine'
          )
    ) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;
