const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  console.error('Supabase URL or Key missing in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function seedAttendance() {
  console.log('Czyszczenie starych wpisów TEST-M01 i TEST-M02...');
  const { error: delErr } = await supabase
    .from('attendance')
    .delete()
    .eq('organization_id', 'test')
    .in('meeting_code', ['TEST-M01', 'TEST-M02']);

  if (delErr) {
    console.error('Błąd usuwania:', delErr);
    return;
  }

  const records = [
    // TEST-M01
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98101', role: 'Przewodniczący', points: 3, activity_description: 'Jan Kowalski - Prowadzenie zebrania inaugurującego' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98102', role: 'Zarząd', points: 2, activity_description: 'Anna Nowak - Sprawy organizacyjne i plan badań' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98103', role: 'Sekretarz', points: 2, activity_description: 'Piotr Wiśniewski - Sporządzenie protokołu i listy' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98104', role: 'Prelegent', points: 5, activity_description: 'Katarzyna Zielińska - Referat wprowadzający do metodologii' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98105', role: 'Uczestnik', points: 1, activity_description: 'Michał Lewandowski - Udział w dyskusji' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98106', role: 'Uczestnik', points: 1, activity_description: 'Aleksandra Wójcik - Udział w dyskusji' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98107', role: 'Uczestnik', points: 1, activity_description: 'Krzysztof Kamiński - Obecność zaliczona' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98108', role: 'Uczestnik', points: 1, activity_description: 'Magdalena Kaczmarek - Obecność zaliczona' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98109', role: 'Uczestnik', points: 1, activity_description: 'Tomasz Mazur - Obecność zaliczona' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98110', role: 'Uczestnik', points: 1, activity_description: 'Karolina Krawczyk - Obecność zaliczona' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98111', role: 'Uczestnik', points: 1, activity_description: 'Jakub Piotrowski - Obecność zaliczona' },
    { organization_id: 'test', meeting_code: 'TEST-M01', meeting_date: '2025-10-15', index_number: '98112-BŁĄD', role: 'Do weryfikacji', points: 1, activity_description: 'Paulina Grabowska - Błędny numer indeksu na liście' },

    // TEST-M02
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98101', role: 'Uczestnik', points: 1, activity_description: 'Jan Kowalski - Udział w warsztacie SPSS' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98102', role: 'Uczestnik', points: 1, activity_description: 'Anna Nowak - Ćwiczenia praktyczne z bazą danych' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98104', role: 'Prowadzący', points: 5, activity_description: 'Katarzyna Zielińska - Prowadzenie warsztatu analizy r-Pearsona' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98105', role: 'Uczestnik', points: 1, activity_description: 'Michał Lewandowski - Udział w warsztacie' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98107', role: 'Uczestnik', points: 1, activity_description: 'Krzysztof Kamiński - Udział w warsztacie' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98113', role: 'Uczestnik', points: 1, activity_description: 'Mateusz Pawłowski - Zadania statystyczne' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98114', role: 'Uczestnik', points: 1, activity_description: 'Zofia Michalska - Zadania statystyczne' },
    { organization_id: 'test', meeting_code: 'TEST-M02', meeting_date: '2025-11-05', index_number: '98115', role: 'Niepotwierdzony ?', points: 0, activity_description: 'Filip Król - Wymaga zatwierdzenia obecności i przeliczenia punktów' }
  ];

  const { data: insData, error: insErr } = await supabase.from('attendance').insert(records).select();
  if (insErr) {
    console.error('Błąd wstawiania:', insErr);
  } else {
    console.log(`Sukces: Pomyślnie dodano ${insData.length} wpisów obecności dla koła test!`);
  }

  // Weryfikacja
  const { data: checkData } = await supabase
    .from('attendance')
    .select('meeting_code, index_number, role, points, activity_description')
    .eq('organization_id', 'test')
    .in('meeting_code', ['TEST-M01', 'TEST-M02'])
    .order('meeting_code', { ascending: true })
    .order('index_number', { ascending: true });

  console.log(`Liczba rekordów w bazie po aktualizacji: ${checkData?.length}`);
  console.log('Rekordy TEST-M01:', checkData?.filter(r => r.meeting_code === 'TEST-M01').length);
  console.log('Rekordy TEST-M02:', checkData?.filter(r => r.meeting_code === 'TEST-M02').length);
}

seedAttendance().catch(err => {
  console.error('Błąd wykonania:', err);
  process.exit(1);
});
