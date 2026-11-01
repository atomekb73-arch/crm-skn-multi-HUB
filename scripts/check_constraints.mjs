import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
  console.log('Testing insert of a test row for uzaleznienia...');
  const testIndex = '99999';
  
  // 1. Spróbuj wstawić wiersz testowy z organization_id = 'uzaleznienia'
  const { data: insData, error: insErr } = await supabase.from('members').insert([{
    organization_id: 'uzaleznienia',
    index_number: testIndex,
    full_name: 'Test Użytkownik Uzależnienia',
    email: 'test_uzal@example.com',
    activity_status: 'Aktywny'
  }]).select();

  console.log('Insert test result:', insData, 'error:', insErr);

  // 2. Jeśli się udało, usuń wiersz testowy
  if (!insErr && insData && insData.length > 0) {
    const { error: delErr } = await supabase.from('members').delete().eq('id', insData[0].id);
    console.log('Deleted test row:', delErr ? delErr : 'OK');
  }
}

checkConstraints();
