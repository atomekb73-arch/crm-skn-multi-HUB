import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDuplicateIndex() {
  const { data, error } = await supabase.from('members').insert([{
    organization_id: 'uzaleznienia',
    index_number: '15998',
    full_name: 'Test Student Ten Sam Indeks',
    email: 'test_multi@example.com'
  }]).select();

  console.log('Result for same index in different org:', data, 'error:', error);

  if (data && data[0]) {
    await supabase.from('members').delete().eq('id', data[0].id);
    console.log('Deleted successfully. Multi-tenant supported on members table!');
  }
}

testDuplicateIndex();
