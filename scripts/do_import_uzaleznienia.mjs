import { createClient } from '@supabase/supabase-js';
import { prepareData } from './import_uzaleznienia.mjs';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function doImport() {
  console.log('=== Rozpoczynanie importu dla Koła Naukowego Zachowań Ryzykowych i Uzależnień (uzaleznienia) ===');

  const { members, attendanceRecords, quarantineSubmissions } = await prepareData();

  // 1. Sprawdź czy już istnieją rekordy dla uzaleznienia
  const { data: existingMembers } = await supabase
    .from('members')
    .select('id')
    .eq('organization_id', 'uzaleznienia');

  console.log(`Istniejący członkowie w bazie dla uzaleznienia: ${existingMembers?.length || 0}`);

  if (existingMembers && existingMembers.length > 0) {
    console.log('Czyszczenie poprzednich danych członków dla uzaleznienia...');
    await supabase.from('members').delete().eq('organization_id', 'uzaleznienia');
  }

  // Wstawianie członków partiami (np. po 50)
  console.log(`Wstawianie ${members.length} członków...`);
  const chunkSize = 50;
  for (let i = 0; i < members.length; i += chunkSize) {
    const chunk = members.slice(i, i + chunkSize);
    const { error } = await supabase.from('members').insert(chunk);
    if (error) {
      console.error(`Błąd wstawiania członków (partia ${i}-${i + chunk.length}):`, error);
    } else {
      console.log(`Wstawiono członków ${i + 1} - ${Math.min(i + chunkSize, members.length)}`);
    }
  }

  // 2. Obecności
  const { data: existingAttendance } = await supabase
    .from('attendance')
    .select('id')
    .eq('organization_id', 'uzaleznienia');

  console.log(`Istniejące obecności w bazie dla uzaleznienia: ${existingAttendance?.length || 0}`);
  if (existingAttendance && existingAttendance.length > 0) {
    console.log('Czyszczenie poprzednich obecności dla uzaleznienia...');
    await supabase.from('attendance').delete().eq('organization_id', 'uzaleznienia');
  }

  console.log(`Wstawianie ${attendanceRecords.length} rekordów obecności...`);
  for (let i = 0; i < attendanceRecords.length; i += chunkSize) {
    const chunk = attendanceRecords.slice(i, i + chunkSize);
    const { error } = await supabase.from('attendance').insert(chunk);
    if (error) {
      console.error(`Błąd wstawiania obecności (partia ${i}-${i + chunk.length}):`, error);
    } else {
      console.log(`Wstawiono obecności ${i + 1} - ${Math.min(i + chunkSize, attendanceRecords.length)}`);
    }
  }

  // 3. Kwarantanna
  const { data: existingQuar } = await supabase
    .from('quarantine_submissions')
    .select('id')
    .eq('organization_id', 'uzaleznienia');

  console.log(`Istniejące zgłoszenia kwarantanny dla uzaleznienia: ${existingQuar?.length || 0}`);
  if (existingQuar && existingQuar.length > 0) {
    console.log('Czyszczenie poprzednich zgłoszeń kwarantanny dla uzaleznienia...');
    await supabase.from('quarantine_submissions').delete().eq('organization_id', 'uzaleznienia');
  }

  console.log(`Wstawianie ${quarantineSubmissions.length} zgłoszeń kwarantanny...`);
  for (let i = 0; i < quarantineSubmissions.length; i += chunkSize) {
    const chunk = quarantineSubmissions.slice(i, i + chunkSize);
    const { error } = await supabase.from('quarantine_submissions').insert(chunk);
    if (error) {
      console.error(`Błąd wstawiania kwarantanny (partia ${i}-${i + chunk.length}):`, error);
    } else {
      console.log(`Wstawiono kwarantannę ${i + 1} - ${Math.min(i + chunkSize, quarantineSubmissions.length)}`);
    }
  }

  // 4. Zapis konfiguracji i opiekunów dla uzaleznienia (fallback w tabeli attendance)
  const uzalSupervisors = [
    {
      id: 'sup_pietrzak',
      academicTitle: 'mgr',
      name: 'Sławomir Pietrzak',
      fullName: 'mgr Sławomir Pietrzak',
      affiliation: 'Wydział Psychologii WSKZ',
      role: 'Opiekun Koła Naukowego',
      email: 'slawomir.pietrzak@wskz.pl',
      isActive: true,
    }
  ];

  await supabase.from('attendance').insert([
    {
      organization_id: 'uzaleznienia',
      meeting_code: '[SETTINGS]:uzaleznienia:supervisors',
      meeting_date: new Date().toISOString().slice(0, 10),
      index_number: 'SYSTEM_SETTINGS',
      role: 'system',
      points: 0,
      activity_description: JSON.stringify(uzalSupervisors)
    },
    {
      organization_id: 'uzaleznienia',
      meeting_code: '[SETTINGS]:uzaleznienia:general',
      meeting_date: new Date().toISOString().slice(0, 10),
      index_number: 'SYSTEM_SETTINGS',
      role: 'system',
      points: 0,
      activity_description: JSON.stringify({
        orgName: 'Koło Naukowe Zachowań Ryzykowych i Uzależnień',
        shortName: 'SKN Uzależnień',
        academicYear: '2026/2027',
        subcalendarId: '15520561',
        sheetId: '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y'
      })
    }
  ]);

  console.log('=== Import dla uzaleznienia zakończony sukcesem! ===');
}

doImport().catch(console.error);
