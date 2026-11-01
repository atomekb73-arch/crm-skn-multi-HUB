import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyTeamupConfig() {
  console.log('=== WERYFIKACJA KONFIGURACJI TEAMUP DLA KOŁA UZALEŻNIEŃ W BAZIE ===');

  const { data: rows, error } = await supabase
    .from('attendance')
    .select('meeting_code, activity_description, organization_id')
    .eq('organization_id', 'uzaleznienia')
    .like('meeting_code', '[SETTINGS]:uzaleznienia%');

  console.log('Settings rows in Supabase:', rows?.length, 'error:', error);
  rows?.forEach(r => {
    console.log(`- ${r.meeting_code}:`, JSON.parse(r.activity_description || '{}'));
  });

  console.log('=== TEST POBIERANIA SPOTKAŃ TEAMUP DLA UZALEŻNIEŃ ===');
  const calId = 'ks9aiux4jiza1ronpd';
  const subId = '15520561';
  const token = '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112';

  const res = await fetch(`https://api.teamup.com/${calId}/events?startDate=2025-10-01&endDate=2027-09-30&subcalendarId[]=${subId}`, {
    headers: { 'Teamup-Token': token }
  });
  const data = await res.json();
  console.log(`Liczba spotkań w Teamup dla subkalendarza ${subId} (Uzależnienia):`, data?.events?.length);
  if (data?.events?.length > 0) {
    data.events.slice(0, 3).forEach((ev, i) => {
      console.log(`  ${i + 1}. [${ev.start_dt.slice(0, 10)}] ${ev.title}`);
    });
  }
}

verifyTeamupConfig().catch(console.error);
