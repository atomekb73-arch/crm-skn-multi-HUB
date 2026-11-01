import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const gasMatch = envContent.match(/VITE_GAS_URL=(.*)/);

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();
const gasUrl = gasMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('--- Rozpoczynanie migracji danych z Google Sheets do Supabase ---');
  console.log('Pobieranie danych z Google Apps Script:', gasUrl);

  const res = await fetch(gasUrl + '?action=pobierz_dane');
  if (!res.ok) {
    throw new Error(`Błąd HTTP z GAS: ${res.status} ${res.statusText}`);
  }
  const gasData = await res.json();

  const czlonkowie = Array.isArray(gasData.czlonkowie) ? gasData.czlonkowie : [];
  const kwarantanna = Array.isArray(gasData.kwarantannaFormularz) ? gasData.kwarantannaFormularz : [];

  console.log(`Pobrano z Google Sheets:`);
  console.log(`- Członkowie (Rejestr_Zgloszen): ${czlonkowie.length}`);
  console.log(`- Zgłoszenia Kwarantanna/Archiwum (kwarantannaFormularz): ${kwarantanna.length}`);

  // 1. Sprawdzenie istniejących rekordów w Supabase
  const { data: existingMembers, error: mErr } = await supabase.from('members').select('index_number, email');
  if (mErr) console.warn('Błąd pobierania existing members:', mErr);
  const existingMemberIndexes = new Set((existingMembers || []).map(m => String(m.index_number).trim()));

  const { data: existingQuarantine, error: qErr } = await supabase.from('quarantine_submissions').select('index_number, email');
  if (qErr) console.warn('Błąd pobierania existing quarantine:', qErr);
  const existingQuarIndexes = new Set((existingQuarantine || []).map(q => String(q.index_number).trim()));
  const existingQuarEmails = new Set((existingQuarantine || []).map(q => String(q.email || '').toLowerCase().trim()));

  // 2. Mapowanie i wstawianie członków do tabeli `members`
  console.log('\n--- Krok 1: Migracja do tabeli members ---');
  const membersToInsert = [];
  const seenMemberIndexes = new Set();

  for (const m of czlonkowie) {
    const rawIdx = String(m.nrIndeksu || m.index || '').replace(/\D/g, '').trim();
    const fullName = String(m.imieNazwisko || m.fullName || '').trim();
    const email = String(m.email || '').trim().toLowerCase();

    if (!rawIdx || !fullName || !email) {
      console.warn('Pominięto niekompletny rekord członka:', { rawIdx, fullName, email });
      continue;
    }

    if (existingMemberIndexes.has(rawIdx) || seenMemberIndexes.has(rawIdx)) {
      continue;
    }
    seenMemberIndexes.add(rawIdx);

    const rawStatus = String(m.statusWeryfikacji || m.status || '').toLowerCase();
    let activityStatus = 'Aktywny';
    if (rawStatus.includes('usun') || rawStatus.includes('odrzuc') || rawStatus.includes('arch')) {
      activityStatus = 'Archiwum';
    } else if (rawStatus.includes('zawie')) {
      activityStatus = 'Zawieszony';
    }

    membersToInsert.push({
      organization_id: 'skn_seksuologii',
      index_number: rawIdx,
      full_name: fullName,
      email: email,
      phone: m.telefon ? String(m.telefon).trim() : null,
      field_of_study: m.kierunek || 'Psychologia',
      study_year: m.kierunekSemestr || m.studyYear || 'Rok 1',
      activity_status: activityStatus,
      verification_date: m.dataWeryfikacji || null,
      joined_date: m.dataWplywu || null,
      mailing_consent: Boolean(m.zgodaMailing),
      total_points: 0,
      custom_fields: {
        aliasy: m.aliasy || '',
        dataAktualizacji: m.dataAktualizacji || null,
        original_status: m.statusWeryfikacji || null,
      }
    });
  }

  console.log(`Przygotowano ${membersToInsert.length} unikalnych rekordów do tabeli members.`);

  // Wstawianie partiami (batch po 50)
  let insertedMembersCount = 0;
  for (let i = 0; i < membersToInsert.length; i += 50) {
    const batch = membersToInsert.slice(i, i + 50);
    const { data, error } = await supabase.from('members').insert(batch).select();
    if (error) {
      console.error(`Błąd wstawiania partii members [${i} - ${i + batch.length}]:`, error);
      throw error;
    }
    insertedMembersCount += (data ? data.length : batch.length);
    console.log(`Wstawiono members: ${insertedMembersCount}/${membersToInsert.length}`);
  }

  // 3. Mapowanie i wstawianie do tabeli `quarantine_submissions`
  console.log('\n--- Krok 2: Migracja do tabeli quarantine_submissions ---');
  const quarantineToInsert = [];
  const seenQuarKeys = new Set();

  for (const q of kwarantanna) {
    const rawIdx = String(q.nrIndeksu || q.index || '').replace(/\D/g, '').trim();
    const fullName = String(q.fullName || q.imieNazwisko || '').trim();
    const email = String(q.email || '').trim().toLowerCase();
    const dedupeKey = rawIdx ? `idx_${rawIdx}` : `email_${email}`;

    if (!fullName || (!rawIdx && !email)) {
      continue;
    }

    if (
      (rawIdx && existingQuarIndexes.has(rawIdx)) ||
      (email && existingQuarEmails.has(email)) ||
      seenQuarKeys.has(dedupeKey)
    ) {
      continue;
    }
    seenQuarKeys.add(dedupeKey);

    const isArchived = Boolean(q.isArchived || q.status === 'archived');
    const rawStatus = String(q.statusWeryfikacji || '').trim();
    let decisionStatus = 'Oczekuje';
    if (isArchived) {
      decisionStatus = rawStatus && rawStatus !== 'Oczekuje' ? rawStatus : 'Odrzucony';
    } else if (rawStatus && rawStatus !== 'Oczekuje') {
      decisionStatus = rawStatus;
    }

    let submissionDate = null;
    if (q.dataWplywu) {
      try {
        submissionDate = new Date(q.dataWplywu).toISOString();
      } catch {
        submissionDate = new Date().toISOString();
      }
    }

    const cleanIndexNumber = rawIdx || (fullName.toLowerCase().includes('gołaś') || fullName.toLowerCase().includes('opiekun') ? 'OPIEKUN' : 'BRAK');

    quarantineToInsert.push({
      organization_id: 'skn_seksuologii',
      index_number: cleanIndexNumber,
      full_name: fullName,
      email: email,
      field_of_study: q.field || q.kierunek || 'Psychologia',
      study_year: q.year || q.rokStudiow || 'Rok 1',
      consents_ok: Boolean(q.zgodyOk || q.zgody),
      decision_status: decisionStatus,
      decision_date: isArchived ? (submissionDate || new Date().toISOString()) : null,
      decision_author: isArchived ? 'Administrator CRM (Migracja)' : null,
      academic_year: q.academicYear || '2025/2026',
      submission_date: submissionDate || new Date().toISOString(),
      custom_fields: {
        zrodlo: q.zrodlo || 'Migracja_GAS',
        consentStatus: q.consentStatus || 'Zgody OK'
      }
    });
  }

  console.log(`Przygotowano ${quarantineToInsert.length} unikalnych rekordów do tabeli quarantine_submissions.`);

  let insertedQuarantineCount = 0;
  for (let i = 0; i < quarantineToInsert.length; i += 50) {
    const batch = quarantineToInsert.slice(i, i + 50);
    const { data, error } = await supabase.from('quarantine_submissions').insert(batch).select();
    if (error) {
      console.error(`Błąd wstawiania partii quarantine_submissions [${i} - ${i + batch.length}]:`, error);
      throw error;
    }
    insertedQuarantineCount += (data ? data.length : batch.length);
    console.log(`Wstawiono quarantine_submissions: ${insertedQuarantineCount}/${quarantineToInsert.length}`);
  }

  console.log('\n=== PODSUMOWANIE MIGRACJI ===');
  console.log(`Pomyślnie zmigrowano do Supabase:`);
  console.log(`- Członkowie w tabeli members: ${insertedMembersCount}`);
  console.log(`- Zgłoszenia w tabeli quarantine_submissions: ${insertedQuarantineCount}`);
  console.log('Migracja zakończona sukcesem!');
}

runMigration().catch(err => {
  console.error('Krytyczny błąd migracji:', err);
  process.exit(1);
});
