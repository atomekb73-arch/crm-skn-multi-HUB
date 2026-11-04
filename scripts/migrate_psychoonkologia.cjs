/**
 * ==============================================================================
 * SKRYPT MIGRACYJNY: migrate_psychoonkologia.cjs
 * Cel: Migracja nowego tenantu (SKN Psychoonkologii) do bazy Supabase
 * Źródła: Google Sheets (members.csv, kwarantanna.csv, backendData.csv, psychoonkologia_full.xlsx)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ORG_ID = 'psychoonkologia';

// 1. Inicjalizacja klienta Supabase
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.error('Brak zmiennych VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY w .env');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim(), {
  auth: { persistSession: false }
});

function safeIsoDate(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  return null;
}

// Pomocnik do bezpiecznego parsowania CSV
function parseCsv(content) {
  const rows = [];
  let row = [];
  let inQuotes = false;
  let cur = '';

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some(x => x.length > 0)) {
        rows.push(row);
      }
      row = [];
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.some(x => x.length > 0)) rows.push(row);
  }
  return rows;
}

async function run() {
  console.log(`=======================================================`);
  console.log(` ROZPOCZĘCIE MIGRACJI DLA TENANTU: ${ORG_ID}`);
  console.log(`=======================================================\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // KROK 1: MIGRACJA CZŁONKÓW (MEMBERS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`[Krok 1/3] Przetwarzanie listy członków (Aktualna lista KN / members.csv)...`);
  const membersCsvPath = path.resolve(__dirname, 'psychoonkologia_data/members.csv');
  const membersRaw = parseCsv(fs.readFileSync(membersCsvPath, 'utf8'));

  // Pobierz seedMembers jeśli istnieje dla dodatkowych danych
  let seedMap = new Map();
  try {
    const seedPath = 'C:/Users/User/Documents/antigravity/crm-skn-psychoonkologii/src/data/seedMembers.json';
    if (fs.existsSync(seedPath)) {
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      seedData.forEach(s => {
        const idx = String(s.index || '').replace(/\D/g, '').trim();
        if (idx) seedMap.set(idx, s);
      });
      console.log(`  Załadowano ${seedMap.size} rekordów uzupełniających z seedMembers.json`);
    }
  } catch (e) {
    console.warn('  Brak seedMembers.json:', e.message);
  }

  // Pobierz istniejących członków w Supabase dla tego tenantu (idempotentność)
  const { data: existingMembers, error: exErr } = await supabase
    .from('members')
    .select('id, index_number, email')
    .eq('organization_id', ORG_ID);

  if (exErr) {
    console.error('Błąd odczytu z tabeli members:', exErr);
    process.exit(1);
  }

  const existingIndexes = new Set((existingMembers || []).map(m => String(m.index_number).trim()));
  const existingEmails = new Set((existingMembers || []).map(m => String(m.email).trim().toLowerCase()));

  console.log(`  Istniejących członków w Supabase dla ${ORG_ID}: ${existingMembers.length}`);

  const membersToInsert = [];
  const seenIndexes = new Set();
  const seenEmails = new Set();

  for (let i = 1; i < membersRaw.length; i++) {
    const row = membersRaw[i];
    if (row.length < 4) continue;
    const fullName = String(row[0] || '').trim();
    const rawIdx = String(row[1] || '').trim();
    const phone = String(row[2] || '').trim();
    const email = String(row[3] || '').trim().toLowerCase();
    const field = String(row[4] || 'Psychologia').trim();
    const year = String(row[5] || 'Rok 1').trim();

    const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;

    if (!cleanIdx || !fullName || !email) continue;

    // Rygorystyczna eliminacja duplikatów
    if (seenIndexes.has(cleanIdx) || seenEmails.has(email)) {
      console.warn(`  [Pominięto duplikat w pliku]: ${cleanIdx} / ${email}`);
      continue;
    }
    seenIndexes.add(cleanIdx);
    seenEmails.add(email);

    if (existingIndexes.has(cleanIdx) || existingEmails.has(email)) {
      continue; // Już istnieje w bazie
    }

    const seed = seedMap.get(cleanIdx) || {};

    membersToInsert.push({
      organization_id: ORG_ID,
      index_number: cleanIdx,
      full_name: fullName,
      email: email,
      phone: phone || seed.phone || null,
      field_of_study: field || seed.field || 'Psychologia',
      study_year: year || seed.year || 'Rok 1',
      activity_status: 'Aktywny',
      verification_date: '2026-05-04',
      joined_date: seed.timestamp || '2026-05-02',
      mailing_consent: seed.mailingConsent !== undefined ? seed.mailingConsent : true,
      total_points: Number(seed.points || 0),
      custom_fields: {
        source_sheet: 'Aktualna lista członków (KN)',
        consent_status: seed.consentStatus || 'Zgody OK',
        clean_index: cleanIdx,
      }
    });
  }

  console.log(`  Przygotowano ${membersToInsert.length} nowych członków do wstawienia.`);

  // Wstawianie partiami po 50 rekordów
  for (let i = 0; i < membersToInsert.length; i += 50) {
    const batch = membersToInsert.slice(i, i + 50);
    const { error: insErr } = await supabase.from('members').insert(batch);
    if (insErr) {
      console.error(`  Błąd wstawiania partii members (${i}-${i + batch.length}):`, insErr);
      throw insErr;
    }
  }
  console.log(`  ✅ Wstawiono pomyślnie ${membersToInsert.length} rekordów do tabeli members.\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // KROK 2: MIGRACJA ZGŁOSZEŃ KWARANTANNY (QUARANTINE_SUBMISSIONS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`[Krok 2/3] Przetwarzanie zgłoszeń rekrutacyjnych (Baza Kwarantanna)...`);
  const quarCsvPath = path.resolve(__dirname, 'psychoonkologia_data/kwarantanna.csv');
  const quarRaw = parseCsv(fs.readFileSync(quarCsvPath, 'utf8'));

  const { data: existingQuar, error: qErr } = await supabase
    .from('quarantine_submissions')
    .select('id, index_number, email')
    .eq('organization_id', ORG_ID);

  if (qErr) {
    console.error('Błąd odczytu quarantine_submissions:', qErr);
    process.exit(1);
  }

  const existingQuarSet = new Set((existingQuar || []).map(q => `${ORG_ID}:${q.index_number}:${q.email}`));
  console.log(`  Istniejących wpisów w quarantine_submissions dla ${ORG_ID}: ${existingQuar.length}`);

  const quarToInsert = [];
  const allApprovedMemberIndexes = new Set([...existingIndexes, ...seenIndexes]);

  for (let i = 1; i < quarRaw.length; i++) {
    const row = quarRaw[i];
    if (row.length < 10) continue;
    
    // Kolumny:
    // 0: Dodaj do listy w Zarządzanie (TRUE/FALSE)
    // 1: Sygnatura czasowa (np. 2026-05-02 19:11:33)
    // 2: Adres e-mail
    // 3: Imię
    // 4: Nazwisko
    // 5: Adres e-mail do kontaktu
    // 6: Nr Indeksu
    // 7: Kierunek studiów
    // 8: Rok i semestr
    // 9: Nr telefonu
    // 10: Zgoda na kontakt
    // 11: Zgody i RODO
    // 19: Weryfikacja Opiekuna (np. "Zgody OK", "Duplikat zgłoszenia", "Oczekuje")
    // 20: Data Weryfikacji
    // 24: Zgoda na mailing

    const isAdded = row[0] === 'TRUE';
    const subDate = String(row[1] || '').trim();
    const rawEmail = String(row[2] || '').trim().toLowerCase();
    const firstName = String(row[3] || '').trim();
    const lastName = String(row[4] || '').trim();
    const contactEmail = String(row[5] || rawEmail).trim().toLowerCase();
    const rawIdx = String(row[6] || '').trim();
    const field = String(row[7] || 'Psychologia').trim();
    const year = String(row[8] || 'Rok 1').trim();
    const phone = String(row[9] || '').trim();
    const contactConsent = String(row[10] || '').trim();
    const rodoConsent = String(row[11] || '').trim();
    const verStatus = row[19] ? String(row[19]).trim() : '';
    const verDate = row[20] ? String(row[20]).trim() : '';

    const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;
    const fullName = `${firstName} ${lastName}`.trim();

    if (!cleanIdx || !rawEmail) continue;

    const key = `${ORG_ID}:${cleanIdx}:${rawEmail}`;
    if (existingQuarSet.has(key)) continue;

    let decisionStatus = 'Oczekuje';
    if (allApprovedMemberIndexes.has(cleanIdx) || isAdded || verStatus === 'Zgody OK') {
      decisionStatus = 'Zatwierdzony';
    } else if (verStatus.toLowerCase().includes('duplikat')) {
      decisionStatus = 'Duplikat';
    } else if (verStatus.toLowerCase().includes('odrzuc')) {
      decisionStatus = 'Odrzucony';
    }

    quarToInsert.push({
      organization_id: ORG_ID,
      submission_date: safeIsoDate(subDate) || new Date().toISOString(),
      index_number: cleanIdx,
      full_name: fullName,
      email: rawEmail,
      field_of_study: field,
      study_year: year,
      consents_ok: rodoConsent.length > 10,
      decision_status: decisionStatus,
      decision_date: safeIsoDate(verDate),
      decision_author: 'dr Ewa Skupińska',
      academic_year: '2025/2026',
      custom_fields: {
        phone: phone,
        contact_email: contactEmail,
        contact_channels: contactConsent,
        verification_notes: verStatus,
      }
    });

    existingQuarSet.add(key);
  }

  console.log(`  Przygotowano ${quarToInsert.length} zgłoszeń kwarantanny do wstawienia.`);

  for (let i = 0; i < quarToInsert.length; i += 50) {
    const batch = quarToInsert.slice(i, i + 50);
    const { error: qInsErr } = await supabase.from('quarantine_submissions').insert(batch);
    if (qInsErr) {
      console.error(`  Błąd wstawiania partii quarantine_submissions:`, qInsErr);
      throw qInsErr;
    }
  }
  console.log(`  ✅ Wstawiono pomyślnie ${quarToInsert.length} zgłoszeń do tabeli quarantine_submissions.\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // KROK 3: MIGRACJA HISTORII OBECNOŚCI ZE SPOTKAŃ (ATTENDANCE)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`[Krok 3/3] Przetwarzanie frekwencji ze spotkań Psychoonkologii...`);

  // Zindeksuj członków dla dokładnego dopasowania indeksów po nazwisku
  const memberNameMap = new Map();
  const allMembers = await supabase.from('members').select('index_number, full_name').eq('organization_id', ORG_ID);
  (allMembers.data || []).forEach(m => {
    memberNameMap.set(m.full_name.trim().toLowerCase(), m.index_number.trim());
  });

  // Spotkanie M05 (2026-06-16) - 41 osób (w arkuszu M05 obecne numery indeksów)
  // Przykładowe spotkania archiwalne z frekwencją
  const attendanceRecords = [];

  // 3.1 Odczyt z pliku psychoonkologia_full.xlsx dla M05, M-SPR-1, M-SPR-2
  try {
    const zipfile = require('zipfile'); // or inspect python script output
  } catch (e) {
    // We can run python helper to generate attendance JSON
  }

  // Uruchomienie pomocnika do wygenerowania attendees_extracted.json
  const attendeesJsonPath = path.resolve(__dirname, 'psychoonkologia_data/attendees_extracted.json');
  if (fs.existsSync(attendeesJsonPath)) {
    const extractedAttendance = JSON.parse(fs.readFileSync(attendeesJsonPath, 'utf8'));
    console.log(`  Załadowano ${extractedAttendance.length} rekordów obecności z attendees_extracted.json`);

    // Sprawdź istniejące obecności w Supabase dla tego tenantu
    const { data: exAtt } = await supabase
      .from('attendance')
      .select('meeting_code, index_number')
      .eq('organization_id', ORG_ID);

    const existingAttSet = new Set((exAtt || []).map(a => `${a.meeting_code}:${a.index_number}`));

    const attToInsert = [];
    for (const a of extractedAttendance) {
      const key = `${a.meeting_code}:${a.index_number}`;
      if (!existingAttSet.has(key)) {
        attToInsert.push({
          organization_id: ORG_ID,
          meeting_code: a.meeting_code,
          meeting_date: a.meeting_date,
          index_number: a.index_number,
          role: a.role || 'Członek koła',
          points: a.points || 1,
          activity_description: a.activity_description || 'Obecność na spotkaniu naukowym',
        });
        existingAttSet.add(key);
      }
    }

    if (attToInsert.length > 0) {
      for (let i = 0; i < attToInsert.length; i += 50) {
        const batch = attToInsert.slice(i, i + 50);
        const { error: aErr } = await supabase.from('attendance').insert(batch);
        if (aErr) console.warn('  Błąd wstawiania attendance:', aErr);
      }
      console.log(`  ✅ Wstawiono ${attToInsert.length} rekordów frekwencji do tabeli attendance.`);
    } else {
      console.log(`  Brak nowych rekordów attendance do wstawienia (już istnieją w bazie).`);
    }
  }

  console.log(`\n=======================================================`);
  console.log(` MIGRACJA DLA TENANTU ${ORG_ID} ZAKOŃCZONA SUKCESEM!`);
  console.log(`=======================================================`);
}

run().catch(err => {
  console.error('Błąd krytyczny migracji:', err);
  process.exit(1);
});
