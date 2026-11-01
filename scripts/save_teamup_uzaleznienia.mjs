import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function saveTeamupConfig() {
  console.log('=== Zapis konfiguracji Teamup API dla koła Uzależnień w Supabase ===');

  const orgId = 'uzaleznienia';
  const teamupPayload = {
    calendarId: 'ks9aiux4jiza1ronpd',
    subcalendarId: '15520561',
    apiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    subcalendarName: '05 🏷️ SKN Psychologii Zachowań Ryzykownych i Uzależnień',
    academicYear: '2026/2027',
    sheetId: '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y'
  };

  // 1. Próba zapisu do organization_settings
  try {
    const { error: setErr } = await supabase.from('organization_settings').upsert({
      id: `${orgId}_teamup`,
      organization_id: orgId,
      settings_key: 'teamup',
      settings_value: teamupPayload,
      updated_at: new Date().toISOString()
    });
    console.log('organization_settings teamup upsert:', setErr ? setErr.message : 'OK');
  } catch (e) {
    console.warn('organization_settings not present or error:', e.message);
  }

  // 2. Zapis fallbacku w tabeli attendance pod [SETTINGS]:uzaleznienia:teamup
  const code = `[SETTINGS]:${orgId}:teamup`;
  await supabase.from('attendance').delete().eq('organization_id', orgId).eq('meeting_code', code);
  const { error: attErr } = await supabase.from('attendance').insert({
    organization_id: orgId,
    meeting_code: code,
    meeting_date: new Date().toISOString().slice(0, 10),
    index_number: 'teamup',
    role: 'Ustawienia Teamup',
    points: 0,
    activity_description: JSON.stringify(teamupPayload)
  });
  console.log('attendance fallback [SETTINGS]:uzaleznienia:teamup insert:', attErr ? attErr.message : 'OK');

  // 3. Zapis fallbacku pod [SETTINGS]:uzaleznienia:general
  const generalCode = `[SETTINGS]:${orgId}:general`;
  await supabase.from('attendance').delete().eq('organization_id', orgId).eq('meeting_code', generalCode);
  const { error: genErr } = await supabase.from('attendance').insert({
    organization_id: orgId,
    meeting_code: generalCode,
    meeting_date: new Date().toISOString().slice(0, 10),
    index_number: 'general',
    role: 'Ustawienia Ogólne',
    points: 0,
    activity_description: JSON.stringify({
      orgName: 'Koło Naukowe Zachowań Ryzykowych i Uzależnień',
      shortName: 'SKN Uzależnień',
      academicYear: '2026/2027',
      calendarId: 'ks9aiux4jiza1ronpd',
      subcalendarId: '15520561',
      teamupApiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
      sheetId: '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y'
    })
  });
  console.log('attendance fallback [SETTINGS]:uzaleznienia:general insert:', genErr ? genErr.message : 'OK');

  console.log('=== Konfiguracja Teamup pomyślnie zapisana trwale w Supabase! ===');
}

saveTeamupConfig().catch(console.error);
