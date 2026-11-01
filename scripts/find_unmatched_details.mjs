import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNames() {
  const { data: members } = await supabase.from('members').select('*').eq('organization_id', 'uzaleznienia');
  const { data: qData } = await supabase.from('quarantine_submissions').select('*').eq('organization_id', 'uzaleznienia');

  const namesToCheck = [
    'Aneta Grabowska',
    'Kucman',
    'Stamoglou',
    'Arleta',
    'Twardowska',
    'Zygmunt',
    'Dagmara',
    'Kowalczyk',
    'Schelle',
    'Nocoń',
    'Wiącek',
    'Mosznińska',
    'Harabin',
    'Kałwa',
    'Grela',
    'Pietrzak',
    'Czerhoniak',
    'Czerchoniak',
    'Kowalska'
  ];

  console.log('=== CHECKING IN MEMBERS ===');
  for (const n of namesToCheck) {
    const matched = members.filter(m => 
      (m.full_name || '').toLowerCase().includes(n.toLowerCase()) ||
      (m.email || '').toLowerCase().includes(n.toLowerCase()) ||
      (m.custom_fields?.aliasy || '').toLowerCase().includes(n.toLowerCase())
    );
    if (matched.length > 0) {
      console.log(`[MEMBERS] "${n}" ->`, matched.map(m => `${m.full_name} (${m.index_number}, ${m.email})`));
    }
  }

  console.log('=== CHECKING IN QUARANTINE ===');
  for (const n of namesToCheck) {
    const matched = qData.filter(q => 
      (q.full_name || '').toLowerCase().includes(n.toLowerCase()) ||
      (q.email || '').toLowerCase().includes(n.toLowerCase())
    );
    if (matched.length > 0) {
      console.log(`[QUARANTINE] "${n}" ->`, matched.map(q => `${q.full_name} (${q.index_number}, ${q.email})`));
    }
  }
}

checkNames();
