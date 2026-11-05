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

async function seed() {
  console.log('Seeding members, quarantine_submissions, and meeting attendances for tenant: test...');

  // 1. Members (25 members)
  const membersRaw = [
    ['Jan Kowalski', 'jan.kowalski@student.wskz.pl', '98101', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Anna Nowak', 'anna.nowak@student.wskz.pl', '98102', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Piotr Wiśniewski', 'piotr.wisniewski@student.wskz.pl', '98103', 'Psychologia kliniczna', 'Rok III', 'active', 'Zatwierdzony', true],
    ['Katarzyna Zielińska', 'katarzyna.zielinska@student.wskz.pl', '98104', 'Psychologia', 'Rok III', 'active', 'Zatwierdzony', true],
    ['Michał Lewandowski', 'michal.lewandowski@student.wskz.pl', '98105', 'Psychologia', 'Rok I', 'active', 'Zatwierdzony', true],
    ['Aleksandra Wójcik', 'aleksandra.wojcik@student.wskz.pl', '98106', 'Psychologia', 'Rok I', 'active', 'Zatwierdzony', true],
    ['Krzysztof Kamiński', 'krzysztof.kaminski@student.wskz.pl', '98107', 'Psychologia biznesu', 'Rok II', 'active', 'Zatwierdzony', false],
    ['Magdalena Kaczmarek', 'magdalena.kaczmarek@student.wskz.pl', '98108', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Tomasz Mazur', 'tomasz.mazur@student.wskz.pl', '98109', 'Psychologia', 'Rok III', 'final_semester', 'Zatwierdzony', true],
    ['Karolina Krawczyk', 'karolina.krawczyk@student.wskz.pl', '98110', 'Psychologia', 'Rok III', 'final_semester', 'Zatwierdzony', true],
    ['Jakub Piotrowski', 'jakub.piotrowski@student.wskz.pl', '98111', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Paulina Grabowska', 'paulina.grabowska@student.wskz.pl', '98112', 'Psychologia', 'Rok I', 'active', 'Zatwierdzony', true],
    ['Mateusz Pawłowski', 'mateusz.pawlowski@student.wskz.pl', '98113', 'Psychologia zdrowia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Zofia Michalska', 'zofia.michalska@student.wskz.pl', '98114', 'Psychologia', 'Rok I', 'active', 'Zatwierdzony', true],
    ['Filip Król', 'filip.krol@student.wskz.pl', '98115', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', false],
    ['Natalia Wieczorek', 'natalia.wieczorek@student.wskz.pl', '98116', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Szymon Jabłoński', 'szymon.jablonski@student.wskz.pl', '98117', 'Psychologia kliniczna', 'Rok III', 'active', 'Zatwierdzony', true],
    ['Wiktoria Wróbel', 'wiktoria.wrobel@student.wskz.pl', '98118', 'Psychologia', 'Rok I', 'active', 'Zatwierdzony', true],
    ['Łukasz Majewski', 'lukasz.majewski@student.wskz.pl', '98119', 'Psychologia', 'Rok II', 'active', 'Zatwierdzony', true],
    ['Oliwia Olszewska', 'oliwia.olszewska@student.wskz.pl', '98120', 'Psychologia', 'Rok I', 'active', 'Zatwierdzony', true],
    ['Bartek Stępień', 'bartek.stepien@student.wskz.pl', '98121', 'Psychologia', 'Rok III', 'graduate', 'Absolwent', true],
    ['Dominika Jaworska', 'dominika.jaworska@student.wskz.pl', '98122', 'Psychologia', 'Rok III', 'graduate', 'Absolwent', true],
    ['Maciej Malinowski', 'maciej.malinowski@student.wskz.pl', '98123', 'Socjologia (Inny wydział)', 'Rok II', 'guest', 'Gość / Słuchacz', true],
    ['Marta Dudek', 'marta.dudek@student.wskz.pl', '98124', 'Pedagogika', 'Rok I', 'guest', 'Gość / Słuchacz', true],
    ['Grzegorz Adamczyk', 'grzegorz.adamczyk@student.wskz.pl', '98125', 'Psychologia', 'Rok I', 'resigned', 'Rezygnacja', false]
  ];

  const statusMap = {
    'active': 'Aktywny',
    'final_semester': 'Ostatni semestr',
    'graduate': 'Absolwent',
    'guest': 'Gość / Słuchacz',
    'resigned': 'Rezygnacja'
  };

  const memberRows = membersRaw.map(m => ({
    organization_id: 'test',
    full_name: m[0],
    email: m[1],
    index_number: m[2],
    field_of_study: m[3],
    study_year: m[4],
    activity_status: statusMap[m[5]] || m[5],
    verification_date: '2025-10-01',
    joined_date: '2025-10-01',
    mailing_consent: Boolean(m[7]),
    total_points: 0,
    custom_fields: { status_raw: m[5], status_weryfikacji: m[6] }
  }));

  await supabase.from('members').delete().eq('organization_id', 'test');
  const { data: mData, error: mErr } = await supabase.from('members').insert(memberRows).select();
  if (mErr) {
    console.error('Error inserting members:', mErr);
  } else {
    console.log(`Successfully inserted ${mData.length} members.`);
  }

  // 2. Quarantine submissions (10 submissions)
  const quarantineRaw = [
    ['Patrycja Sikora', 'patrycja.sikora@student.wskz.pl', '98126', 'Psychologia', 'Rok I', 'Chcę rozwijać warsztat analizy statystycznej i brać udział w publikacjach.', 1],
    ['Kacper Walczak', 'kacper.walczak@student.wskz.pl', '98127', 'Psychologia', 'Rok I', 'Interesuję się metodologią eksperymentalną i neuronauką.', 2],
    ['Julia Baran', 'julia.baran@student.wskz.pl', '98128', 'Psychologia', 'Rok II', 'Chciałabym pomagać w organizacji warsztatów i konferencji koła.', 3],
    ['Damian Rutkowski', 'damian.rutkowski@student.wskz.pl', '98129', 'Psychologia biznesu', 'Rok I', 'Chcę łączyć psychologię z rynkiem pracy i prowadzić badania ankietowe.', 4],
    ['Klaudia Szewczyk', 'klaudia.szewczyk@student.wskz.pl', '98130', 'Psychologia kliniczna', 'Rok II', 'Zależy mi na zdobyciu pierwszych punktów do stypendium rektora.', 5],
    ['Adrian Ostrowski', 'adrian.ostrowski@student.wskz.pl', '98131', 'Psychologia', 'Rok I', 'Chętnie pomogę przy promocji i prowadzeniu social mediów koła.', 6],
    ['Martyna Zalewska', 'martyna.zalewska@student.wskz.pl', '98132', 'Psychologia', 'Rok I', 'Szukam ambitnej grupy do wspólnego pisania artykułu naukowego.', 7],
    ['Kamil Tomaszewski', 'kamil.tomaszewski@student.wskz.pl', '98133', 'Psychologia', 'Rok II', 'Moim celem jest realizacja badań do pracy licencjackiej w ramach koła.', 8],
    ['Weronika Pietrzak', 'weronika.pietrzak@student.wskz.pl', '98134', 'Psychologia', 'Rok I', 'Chcę uczestniczyć w cyklicznych spotkaniach dyskusyjnych.', 9],
    ['Rafał Marciniak', 'rafal.marciniak@student.wskz.pl', '98135', 'Psychologia', 'Rok II', 'Chcę dołączyć do zespołu analizującego dane w SPSS/JASP.', 10]
  ];

  const qRows = quarantineRaw.map(q => {
    const subDate = new Date(Date.now() - q[6] * 24 * 3600 * 1000).toISOString();
    return {
      organization_id: 'test',
      full_name: q[0],
      email: q[1],
      index_number: q[2],
      field_of_study: q[3],
      study_year: q[4],
      submission_date: subDate,
      consents_ok: true,
      decision_status: 'Oczekujący',
      academic_year: '2025/2026',
      custom_fields: { motivation: q[5], status: 'pending' }
    };
  });

  await supabase.from('quarantine_submissions').delete().eq('organization_id', 'test');
  const { data: qData, error: qErr } = await supabase.from('quarantine_submissions').insert(qRows).select();
  if (qErr) {
    console.error('Error inserting quarantine_submissions:', qErr);
  } else {
    console.log(`Successfully inserted ${qData.length} quarantine_submissions.`);
  }

  // 3. 6 ODBYTYCH SPOTKAŃ I LOGI OBECNOŚCI (attendance)
  await supabase.from('attendance').delete().eq('organization_id', 'test').not('meeting_code', 'like', '[%');
  const attendanceRaw = [
    // Spotkanie 1
    ['TEST-M01', '2025-10-15', '98101', 'Uczestnik', 1, 'Zebranie organizacyjne koła - inauguracja roku'],
    ['TEST-M01', '2025-10-15', '98102', 'Uczestnik', 1, 'Zebranie organizacyjne koła - inauguracja roku'],
    ['TEST-M01', '2025-10-15', '98103', 'Uczestnik', 1, 'Zebranie organizacyjne koła - inauguracja roku'],
    ['TEST-M01', '2025-10-15', '98104', 'Prelegent', 5, 'Wystąpienie inaugurujące projekt badawczy'],
    ['TEST-M01', '2025-10-15', '98105', 'Uczestnik', 1, 'Zebranie organizacyjne koła - inauguracja roku'],
    ['TEST-M01', '2025-10-15', '98106', 'Uczestnik', 1, 'Zebranie organizacyjne koła - inauguracja roku'],
    // Spotkanie 2
    ['TEST-M02', '2025-11-05', '98101', 'Uczestnik', 1, 'Warsztat: Konstrukcja narzędzi badawczych'],
    ['TEST-M02', '2025-11-05', '98102', 'Uczestnik', 1, 'Warsztat: Konstrukcja narzędzi badawczych'],
    ['TEST-M02', '2025-11-05', '98104', 'Prelegent', 5, 'Prowadzenie warsztatu metodologicznego'],
    ['TEST-M02', '2025-11-05', '98107', 'Uczestnik', 1, 'Warsztat: Konstrukcja narzędzi badawczych'],
    ['TEST-M02', '2025-11-05', '98108', 'Uczestnik', 1, 'Warsztat: Konstrukcja narzędzi badawczych'],
    // Spotkanie 3
    ['TEST-M03', '2025-12-03', '98101', 'Uczestnik', 1, 'Journal Club: Przegląd badań z APA PsycNet'],
    ['TEST-M03', '2025-12-03', '98103', 'Prelegent', 5, 'Prezentacja artykułu empirycznego'],
    ['TEST-M03', '2025-12-03', '98109', 'Uczestnik', 1, 'Journal Club: Przegląd badań z APA PsycNet'],
    ['TEST-M03', '2025-12-03', '98110', 'Uczestnik', 1, 'Journal Club: Przegląd badań z APA PsycNet'],
    // Spotkanie 4
    ['TEST-M04', '2026-01-14', '98101', 'Uczestnik', 1, 'Warsztat: Wprowadzenie do JASP i analizy r-Pearsona'],
    ['TEST-M04', '2026-01-14', '98102', 'Uczestnik', 1, 'Warsztat: Wprowadzenie do JASP i analizy r-Pearsona'],
    ['TEST-M04', '2026-01-14', '98104', 'Uczestnik', 1, 'Warsztat: Wprowadzenie do JASP i analizy r-Pearsona'],
    ['TEST-M04', '2026-01-14', '98111', 'Uczestnik', 1, 'Warsztat: Wprowadzenie do JASP i analizy r-Pearsona'],
    // Spotkanie 5
    ['TEST-M05', '2026-02-18', '98101', 'Uczestnik', 1, 'Seminarium: Standardy raportowania APA 7'],
    ['TEST-M05', '2026-02-18', '98103', 'Uczestnik', 1, 'Seminarium: Standardy raportowania APA 7'],
    ['TEST-M05', '2026-02-18', '98105', 'Uczestnik', 1, 'Seminarium: Standardy raportowania APA 7'],
    ['TEST-M05', '2026-02-18', '98112', 'Uczestnik', 1, 'Seminarium: Standardy raportowania APA 7'],
    // Spotkanie 6
    ['TEST-M06', '2026-03-10', '98101', 'Prelegent', 5, 'Próba wystąpień przedkonferencyjnych'],
    ['TEST-M06', '2026-03-10', '98102', 'Prelegent', 5, 'Próba wystąpień przedkonferencyjnych'],
    ['TEST-M06', '2026-03-10', '98104', 'Uczestnik', 1, 'Próba wystąpień przedkonferencyjnych'],
    ['TEST-M06', '2026-03-10', '98106', 'Uczestnik', 1, 'Próba wystąpień przedkonferencyjnych'],
    ['TEST-M06', '2026-03-10', '98113', 'Uczestnik', 1, 'Próba wystąpień przedkonferencyjnych']
  ];

  const meetingAttendanceRows = attendanceRaw.map(a => ({
    organization_id: 'test',
    meeting_code: a[0],
    meeting_date: a[1],
    index_number: a[2],
    role: a[3],
    points: a[4],
    activity_description: a[5]
  }));

  const { data: aData, error: aErr } = await supabase.from('attendance').insert(meetingAttendanceRows).select();
  if (aErr) {
    console.error('Error inserting attendance:', aErr);
  } else {
    console.log(`Successfully inserted ${aData.length} attendance rows.`);
  }

  // Summary counts
  const { count: cmCount } = await supabase.from('club_memberships').select('*', { count: 'exact', head: true }).eq('club_id', 'test');
  const { count: mCount } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('organization_id', 'test');
  const { count: qCount } = await supabase.from('quarantine_submissions').select('*', { count: 'exact', head: true }).eq('organization_id', 'test');
  const { count: attCount } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('organization_id', 'test');
  const { data: osData } = await supabase.from('organization_settings').select('*').eq('organization_id', 'test');

  console.log('--- FINAL SEED REPORT FOR TENANT: test ---');
  console.log({
    club_memberships: cmCount,
    members: mCount,
    quarantine_submissions: qCount,
    attendance_total: attCount,
    organization_settings: osData?.length
  });
}

seed().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
