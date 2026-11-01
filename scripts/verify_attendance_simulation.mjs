import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('=== Weryfikacja danych obecności dla uzaleznienia w Supabase ===');
  
  const { data: attRows, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('organization_id', 'uzaleznienia')
    .eq('meeting_date', '2026-10-29');

  if (error) {
    console.error('Błąd:', error);
    return;
  }

  console.log(`Pobrano z Supabase ${attRows.length} wierszy dla spotkania z 29.10.2026 r.`);
  
  const roles = {};
  const statuses = {};
  attRows.forEach(r => {
    roles[r.role] = (roles[r.role] || 0) + 1;
    try {
      const desc = JSON.parse(r.activity_description);
      statuses[desc.status] = (statuses[desc.status] || 0) + 1;
    } catch {}
  });

  console.log('Rozkład ról:', roles);
  console.log('Rozkład statusów:', statuses);

  // Sprawdź przykładowe rekordy
  const sampleMember = attRows.find(r => r.role === 'Członek koła');
  const sampleSpeaker = attRows.find(r => r.role === 'Prelegent');
  const sampleGuest = attRows.find(r => r.role === 'Gość');

  console.log('\nPrzykładowy Członek koła:');
  console.log(sampleMember);

  console.log('\nPrzykładowy Prelegent:');
  console.log(sampleSpeaker);

  console.log('\nPrzykładowy Gość:');
  console.log(sampleGuest);
}

verify();
