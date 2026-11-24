-- Rejestracja czystej instancji (tenanta) CRM dla Studenckiego Koła Naukowego Psychologii Dzieci i Młodzieży (SKN PDiM)
-- ZERO danych startowych: puste settings, zero członków, zero spotkań, zero zgłoszeń w kwarantannie.

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    INSERT INTO public.organizations (
      tenant_id, name, full_name, list_name, short_name, code, badge_code,
      icon_name, crm_system, form_unit_id, unit_type, club_number,
      email, emoji, primary_hex, light_bg_hex, tailwind_accent, sort_order
    )
    SELECT
      'skn_dzieci_i_mlodziezy',
      'SKN Psychologii Dzieci i Młodzieży',
      'Studenckie Koło Naukowe Psychologii Dzieci i Młodzieży',
      'SKN Psychologii Dzieci i Młodzieży',
      'SKN PDiM',
      'PDiM',
      'PDiM',
      'Sparkles',
      'crm_kola',
      'Studenckie Koło Naukowe Psychologii Dzieci i Młodzieży',
      'club',
      19,
      'skn.pdim@wskz.pl',
      '🌱',
      '#0284C7',
      '#E0F2FE',
      'sky',
      28
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organizations WHERE tenant_id = 'skn_dzieci_i_mlodziezy'
    );
  END IF;

  IF to_regclass('public.organization_settings') IS NOT NULL THEN
    INSERT INTO public.organization_settings (organization_id, settings, updated_at)
    SELECT
      'skn_dzieci_i_mlodziezy',
      '{"board":[],"supervisors":[],"access_users":[],"revoked_access":{},"user_first_login_status":{}}'::jsonb,
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_settings WHERE organization_id = 'skn_dzieci_i_mlodziezy'
    );
  END IF;
END $$;
