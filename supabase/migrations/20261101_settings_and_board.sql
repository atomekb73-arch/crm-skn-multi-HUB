-- Migracja: Dedykowane tabele dla Ustawień, Opiekunów, Kadencji Zarządu oraz Szablonów E-mail w Supabase
-- Uruchom ten skrypt w Supabase SQL Editor, aby wdrożyć dedykowane tabele.
-- Uwaga: Aplikacja posiada wbudowaną automatyczną obsługę zarówno tych tabel, jak i bezpiecznego zapisu awaryjnego.

-- 1. Tabela Ustawień Organizacji (Opiekunowie, Rok Akademicki, Reguły frekwencji, Wagi punktowe)
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  settings_key TEXT NOT NULL,
  settings_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uprawnienia dla roli anon i authenticated
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read organization_settings" ON public.organization_settings FOR SELECT USING (true);
CREATE POLICY "Allow public insert organization_settings" ON public.organization_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update organization_settings" ON public.organization_settings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete organization_settings" ON public.organization_settings FOR DELETE USING (true);

-- 2. Tabela Kadencji Zarządu i Historii Funkcji
CREATE TABLE IF NOT EXISTS public.board_terms (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  member_index TEXT,
  member_email TEXT,
  role_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  points NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.board_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read board_terms" ON public.board_terms FOR SELECT USING (true);
CREATE POLICY "Allow public insert board_terms" ON public.board_terms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update board_terms" ON public.board_terms FOR UPDATE USING (true);
CREATE POLICY "Allow public delete board_terms" ON public.board_terms FOR DELETE USING (true);

-- 3. Tabela Szablonów i Konfiguracji E-mail
CREATE TABLE IF NOT EXISTS public.email_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  config JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read email_templates" ON public.email_templates FOR SELECT USING (true);
CREATE POLICY "Allow public insert email_templates" ON public.email_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update email_templates" ON public.email_templates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete email_templates" ON public.email_templates FOR DELETE USING (true);
