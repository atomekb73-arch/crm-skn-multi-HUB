import { createClient } from '@supabase/supabase-js';
import { prepareData } from './import_uzaleznienia.mjs';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAndReimportMembers() {
  console.log('=== Ponowny import członków z deduplikacją numerów indeksu ===');

  const { members } = await prepareData();

  // Deduplikacja członków wg index_number
  const uniqueMembersMap = new Map();
  const duplicates = [];

  for (const m of members) {
    const key = m.index_number || m.email;
    if (uniqueMembersMap.has(key)) {
      duplicates.push({ existing: uniqueMembersMap.get(key), duplicate: m });
      // Zachowaj ten z większą liczbą punktów lub uzupełnionymi danymi
      const prev = uniqueMembersMap.get(key);
      if ((m.total_points || 0) > (prev.total_points || 0)) {
        uniqueMembersMap.set(key, m);
      }
    } else {
      uniqueMembersMap.set(key, m);
    }
  }

  const uniqueMembers = Array.from(uniqueMembersMap.values());
  console.log(`Liczba członków przed deduplikacją: ${members.length}, po deduplikacji: ${uniqueMembers.length}`);
  console.log('Wykryte duplikaty:', duplicates.map(d => `${d.duplicate.full_name} (${d.duplicate.index_number})`));

  // Wyczyść dotychczas wstawionych członków dla uzaleznienia
  await supabase.from('members').delete().eq('organization_id', 'uzaleznienia');

  // Wstaw unikalnych
  const chunkSize = 50;
  for (let i = 0; i < uniqueMembers.length; i += chunkSize) {
    const chunk = uniqueMembers.slice(i, i + chunkSize);
    const { error } = await supabase.from('members').insert(chunk);
    if (error) {
      console.error(`Błąd wstawiania unikalnych członków (partia ${i}-${i + chunk.length}):`, error);
    } else {
      console.log(`Pomyślnie wstawiono partię ${i + 1} - ${Math.min(i + chunkSize, uniqueMembers.length)}`);
    }
  }

  // Sprawdź ile członków jest teraz w bazie
  const { data: finalMembers } = await supabase
    .from('members')
    .select('id, full_name, index_number, total_points')
    .eq('organization_id', 'uzaleznienia');

  console.log(`Łączna liczba członków w bazie dla uzaleznienia: ${finalMembers?.length || 0}`);
}

fixAndReimportMembers().catch(console.error);
