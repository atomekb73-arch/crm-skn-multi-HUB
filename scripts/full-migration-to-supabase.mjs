import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

const envVars = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;
const GAS_URL = envVars.VITE_GAS_URL;
const SHEET_ID = '1HzGIxVVg3Q611szA2DsMm3RiT4URmvo-63qCti-dm4U';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Brak VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY w pliku .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function normalizeDate(val) {
  if (!val) return new Date().toISOString().split('T')[0];
  const str = String(val).trim();
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return new Date().toISOString().split('T')[0];
}

function parseKierunekRok(kierunekStr) {
  const raw = String(kierunekStr || '').trim();
  if (!raw) return { field: 'Psychologia', year: 'Rok 1' };
  const parts = raw.split('/').map(s => s.trim());
  if (parts.length >= 2) {
    return { field: parts[0] || 'Psychologia', year: parts.slice(1).join(' / ') || 'Rok 1' };
  }
  const rokMatch = raw.match(/(Rok\s*\d+.*)/i);
  if (rokMatch) {
    const f = raw.replace(rokMatch[0], '').replace(/[,/-]+$/, '').trim() || 'Psychologia';
    return { field: f, year: rokMatch[1].trim() };
  }
  return { field: raw, year: 'Rok 1' };
}

async function fetchSheetGviz(sheetName) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok && text.includes('google.visualization.Query.setResponse')) {
      const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const parsed = JSON.parse(jsonStr);
      return parsed.table?.rows || [];
    }
  } catch (e) {
    console.warn(`Uwaga: nie udało się pobrać ${sheetName} przez gviz:`, e.message);
  }
  return [];
}

async function runFullMigration() {
  console.log('🚀 ROZPOCZYNAM PEŁNĄ MIGRACJĘ BAZY CRMSKN_SEKS_2026_2027_BACKUP DO SUPABASE...');

  // 1. Pobierz dane z GAS (który czyta z arkusza CRMSKN_SEKS_2026_2027_BACKUP) oraz bezpośrednio z gviz
  const gasRes = await fetch(`${GAS_URL}?action=pobierz_dane`);
  if (!gasRes.ok) {
    throw new Error(`Błąd pobierania danych z GAS: HTTP ${gasRes.status}`);
  }
  const gasData = await gasRes.json();

  const rawCzlonkowie = Array.isArray(gasData.czlonkowie) ? gasData.czlonkowie : [];
  const rawKwarantanna = Array.isArray(gasData.kwarantannaFormularz) ? gasData.kwarantannaFormularz : [];
  const rawDecyzje = Array.isArray(gasData.decyzjeKwarantanny) ? gasData.decyzjeKwarantanny : [];
  const rawEwidencja = Array.isArray(gasData.ewidencja) ? gasData.ewidencja : [];
  const rawDorobek = Array.isArray(gasData.dorobek) ? gasData.dorobek : [];
  const rawKorespondencja = Array.isArray(gasData.korespondencja) ? gasData.korespondencja : [];

  // Pobierz dodatkowo lata studiów z Aktualna_Baza_Czlonkow
  const aktualnaBazaRows = await fetchSheetGviz('Aktualna_Baza_Czlonkow');
  const yearByIndexMap = new Map();
  for (const r of aktualnaBazaRows) {
    const c = r.c || [];
    const idx = String(c[4]?.v || '').replace(/\D/g, '').trim();
    const yr = String(c[6]?.v || '').trim();
    if (idx && yr) {
      yearByIndexMap.set(idx, yr);
    }
  }

  console.log(`📊 Pobrane dane źródłowe:
  - Rejestr_Zgloszen / Aktualna_Baza_Członków: ${rawCzlonkowie.length}
  - Baza_Kwarantanna: ${rawKwarantanna.length}
  - Decyzje_Kwarantanny: ${rawDecyzje.length}
  - Ewidencja_Obecnosci: ${rawEwidencja.length}
  - Rejestr_Dorobku: ${rawDorobek.length}
  - Dziennik_Korespondencji: ${rawKorespondencja.length}`);

  // 2. Zbuduj mapę punktów z Ewidencji Obecności oraz z Rejestru Dorobku dla każdego nrIndeksu
  const attendancePointsByIndex = new Map();
  const attendanceCountByIndex = new Map();
  for (const ew of rawEwidencja) {
    const rawId = String(ew.nrIndeksu || '').trim();
    const cleanIdx = rawId.replace(/\D/g, '').trim();
    const pts = Number(ew.punkty) || 1;
    if (cleanIdx) {
      attendancePointsByIndex.set(cleanIdx, (attendancePointsByIndex.get(cleanIdx) || 0) + pts);
      attendanceCountByIndex.set(cleanIdx, (attendanceCountByIndex.get(cleanIdx) || 0) + 1);
    }
  }

  const dorobekByIndex = new Map();
  const dorobekPointsByIndex = new Map();
  for (const d of rawDorobek) {
    const cleanIdx = String(d.nrIndeksu || '').replace(/\D/g, '').trim();
    const pts = Number(d.punkty) || 0;
    if (cleanIdx) {
      dorobekPointsByIndex.set(cleanIdx, (dorobekPointsByIndex.get(cleanIdx) || 0) + pts);
      if (!dorobekByIndex.has(cleanIdx)) dorobekByIndex.set(cleanIdx, []);
      dorobekByIndex.get(cleanIdx).push(d);
    }
  }

  // 3. Przygotuj i wykonaj UPSERT do tabeli `members`
  const membersMap = new Map();
  for (const m of rawCzlonkowie) {
    const cleanIdx = String(m.nrIndeksu || m.index || '').replace(/\D/g, '').trim();
    if (!cleanIdx) continue;

    const { field, year: parsedYear } = parseKierunekRok(m.kierunek || m.field);
    const studyYear = yearByIndexMap.get(cleanIdx) || m.rokStudiow || parsedYear || 'Rok 1';
    const rawStatus = String(m.statusWeryfikacji || 'Zatwierdzony').trim();

    // Tomasz Bratkowski (15998) to Przewodniczący Koła - w arkuszu miał testowo wpisane 'Usuniety', przywracamy na 'Aktywny'
    let activityStatus = 'Aktywny';
    if (cleanIdx === '15998') {
      activityStatus = 'Aktywny';
    } else if (rawStatus === 'Usuniety' || rawStatus === 'Archiwum' || rawStatus === 'Odrzucony') {
      activityStatus = 'Archiwum';
    } else if (rawStatus === 'Nieaktywny' || rawStatus === 'Rezygnacja') {
      activityStatus = 'Nieaktywny';
    } else if (rawStatus === 'Gosc' || rawStatus === 'Gość') {
      activityStatus = 'Gosc';
    } else {
      activityStatus = 'Aktywny';
    }

    const attPts = attendancePointsByIndex.get(cleanIdx) || 0;
    const dorPts = dorobekPointsByIndex.get(cleanIdx) || 0;
    const totalPts = attPts + dorPts;

    const customFields = {
      aliasy: m.aliasy || '',
      original_status: rawStatus,
      dataAktualizacji: m.dataAktualizacji || '',
      attendance_count: attendanceCountByIndex.get(cleanIdx) || 0,
      attendance_points: attPts,
      dorobek_points: dorPts,
      dorobek: dorobekByIndex.get(cleanIdx) || []
    };

    // Dla Przewodniczącego (15998) zapiszmy też globalny rejestr dorobku i dziennik korespondencji w custom_fields jako backup w members
    if (cleanIdx === '15998') {
      customFields.global_dorobek = rawDorobek;
      customFields.global_korespondencja = rawKorespondencja;
    }

    membersMap.set(cleanIdx, {
      organization_id: 'skn_seksuologii',
      index_number: cleanIdx,
      full_name: String(m.imieNazwisko || m.fullName || '').trim(),
      email: String(m.email || '').toLowerCase().trim(),
      phone: String(m.telefon || m.phone || '').trim() || null,
      field_of_study: field,
      study_year: studyYear,
      activity_status: activityStatus,
      verification_date: normalizeDate(m.dataWeryfikacji || m.dataWplywu),
      joined_date: normalizeDate(m.dataWplywu),
      mailing_consent: Boolean(m.zgodaMailing),
      total_points: totalPts,
      custom_fields: customFields
    });
  }

  const membersPayload = Array.from(membersMap.values());
  console.log(`\n📦 Synchronizacja ${membersPayload.length} członków w tabeli [members]...`);
  await supabase.from('members').delete().eq('organization_id', 'skn_seksuologii');
  const { error: mErr } = await supabase
    .from('members')
    .insert(membersPayload);

  if (mErr) {
    console.error('❌ Błąd insertu do members:', mErr);
  } else {
    console.log(`✅ Pomyślnie zapisano ${membersPayload.length} rekordów w tabeli [members]!`);
  }

  // 4. Przygotuj i wykonaj UPSERT do tabeli `quarantine_submissions`
  // Mapa decyzji kwarantanny po indeksie
  const decisionsByIndex = new Map();
  for (const d of rawDecyzje) {
    const idx = String(d.nrIndeksu || '').replace(/\D/g, '').trim();
    if (idx && d.status !== 'TEST_DIAGNOZA') {
      decisionsByIndex.set(idx, d);
    }
  }

  const quarantineMap = new Map();
  for (let i = 0; i < rawKwarantanna.length; i++) {
    const q = rawKwarantanna[i];
    const rawIdxStr = String(q.nrIndeksu || q.index || '').trim();
    const cleanDigits = rawIdxStr.replace(/\D/g, '').trim();
    const email = String(q.email || '').toLowerCase().trim();
    const fullName = String(q.imieNazwisko || q.fullName || '').trim();

    // Klucz indeksu: jeśli są cyfry i nie jest to sklejona lista dwóch indeksów, użyj cyfr; w przeciwnym razie unikalny klucz tekstowy
    const indexKey = cleanDigits || rawIdxStr || email || `HIST_${i + 1}`;

    const isApprovedInMembers = cleanDigits && membersMap.has(cleanDigits) && membersMap.get(cleanDigits).activity_status === 'Aktywny';
    const dec = cleanDigits ? decisionsByIndex.get(cleanDigits) : null;

    let decisionStatus = q.statusWeryfikacji || 'Oczekuje';
    if (decisionStatus === 'Oczekuje' && isApprovedInMembers) {
      decisionStatus = 'Zatwierdzony';
    } else if (decisionStatus === 'Oczekuje' && dec && dec.status && dec.status !== 'Zatwierdzony') {
      decisionStatus = dec.status;
    }

    const subDate = normalizeDate(q.dataWplywu);
    const decDate = dec?.data ? normalizeDate(dec.data) : (decisionStatus !== 'Oczekuje' ? subDate : null);

    quarantineMap.set(indexKey, {
      organization_id: 'skn_seksuologii',
      submission_date: subDate,
      index_number: indexKey,
      full_name: fullName,
      email: email || `brak_${indexKey}@skn.pl`,
      field_of_study: q.kierunek || q.field || 'Psychologia',
      study_year: q.rokStudiow || q.year || 'Rok 1',
      consents_ok: Boolean(q.zgody ?? q.zgodyOk ?? true),
      decision_status: decisionStatus,
      decision_date: decDate,
      decision_author: dec?.autor || (decisionStatus !== 'Oczekuje' ? 'Administrator CRM' : null),
      academic_year: q.academicYear || (subDate >= '2026-10-01' ? '2026/2027' : '2025/2026'),
      custom_fields: {
        raw_index: rawIdxStr,
        rowIndex: q.rowIndex || i + 1,
        zrodlo: q.zrodlo || 'Baza_Kwarantanna'
      }
    });
  }

  for (const [idx, m] of membersMap.entries()) {
    const existing = quarantineMap.get(idx);
    if (existing) {
      // Jeśli zgłoszenie tej samej osoby jest już w kwarantannie (np. jako 'Duplikat' z Baza_Kwarantanna), pozostawiamy je jako ślad archiwalny w Archiwum Zgłoszeń!
      continue;
    }
    // Dodajemy do quarantine_submissions ze statusem 'Zatwierdzony' (np. dla Macieja i Magdaleny, których nie było w Baza_Kwarantanna)
    quarantineMap.set(idx, {
      organization_id: 'skn_seksuologii',
      submission_date: m.joined_date,
      index_number: idx,
      full_name: m.full_name,
      email: m.email,
      field_of_study: m.field_of_study,
      study_year: m.study_year,
      consents_ok: m.mailing_consent,
      decision_status: m.activity_status === 'Archiwum' ? 'Archiwum' : 'Zatwierdzony',
      decision_date: m.verification_date,
      decision_author: 'Administrator CRM',
      academic_year: m.joined_date >= '2026-10-01' ? '2026/2027' : '2025/2026',
      custom_fields: {
        synced_from_members: true
      }
    });
  }

  const quarantinePayload = Array.from(quarantineMap.values());
  console.log(`\n📦 Synchronizacja ${quarantinePayload.length} zgłoszeń w tabeli [quarantine_submissions]...`);
  await supabase.from('quarantine_submissions').delete().eq('organization_id', 'skn_seksuologii');
  const { error: qErr } = await supabase
    .from('quarantine_submissions')
    .insert(quarantinePayload);

  if (qErr) {
    console.error('❌ Błąd insertu do quarantine_submissions:', qErr);
  } else {
    console.log(`✅ Pomyślnie zapisano ${quarantinePayload.length} rekordów w tabeli [quarantine_submissions]!`);
  }

  // 5. Migracja Ewidencji Obecności (958 rekordów) + Rejestru Dorobku (3 rekordy) + Dziennika Korespondencji (20 rekordów) do tabeli `attendance`
  console.log('\n🧹 Czyszczenie tabeli [attendance] przed czystym importem SSOT...');
  const { error: delAttErr } = await supabase
    .from('attendance')
    .delete()
    .eq('organization_id', 'skn_seksuologii');
  if (delAttErr) {
    console.warn('Uwaga przy czyszczeniu attendance:', delAttErr.message);
  }

  const attendanceRows = [];

  // 5a. 958 rekordów obecności ze spotkań
  for (const ew of rawEwidencja) {
    const code = String(ew.kodSpotkania || 'M00').trim();
    const dateStr = normalizeDate(ew.dataSpotkania);
    const idxOrName = String(ew.nrIndeksu || ew.identyfikator || 'Uczestnik').trim();
    const role = String(ew.status || ew.rola || 'Członek koła').trim();
    const pts = Number(ew.punkty) || 1;
    const desc = String(ew.opisAktywnosci || 'Obecność na spotkaniu').trim();

    attendanceRows.push({
      organization_id: 'skn_seksuologii',
      meeting_code: code,
      meeting_date: dateStr,
      index_number: idxOrName,
      role: role,
      points: pts,
      activity_description: desc
    });
  }

  // 5b. Rekordy z Rejestru Dorobku jako specjalne wpisy [DOROBEK] w tabeli `attendance` (aby były dostępne w 100% z Supabase SSOT)
  for (let i = 0; i < rawDorobek.length; i++) {
    const d = rawDorobek[i];
    const dateStr = normalizeDate(d.data);
    const idx = String(d.nrIndeksu || '15998').trim();
    const cat = String(d.kategoria || 'Project').trim();
    const pts = Number(d.punkty) || 0;
    const opis = String(d.opis || '').trim();

    attendanceRows.push({
      organization_id: 'skn_seksuologii',
      meeting_code: `[DOROBEK] #${i + 1}`,
      meeting_date: dateStr,
      index_number: idx,
      role: cat,
      points: pts,
      activity_description: JSON.stringify({
        id: `dorobek_${i + 1}`,
        type: cat,
        category: cat,
        date: dateStr,
        year: dateStr.slice(0, 4),
        nrIndeksu: idx,
        title: opis.split(' - ')[0] || opis,
        description: opis,
        summary: opis,
        points: pts,
        status: 'W toku',
        dataWpisu: d.dataWpisu || dateStr
      })
    });
  }

  // 5c. Rekordy z Dziennika Korespondencji jako specjalne wpisy [KORESPONDENCJA] w tabeli `attendance`
  for (let i = 0; i < rawKorespondencja.length; i++) {
    const k = rawKorespondencja[i];
    const sygnatura = String(k.sygnatura || `SKN-SEKS/DK/2026/${i + 1}`).trim();
    const dateStr = normalizeDate(k.dataWplywu || k.dataWyslania);
    const isOut = String(k.typ || '').toLowerCase().includes('wychod');

    attendanceRows.push({
      organization_id: 'skn_seksuologii',
      meeting_code: `[KORESPONDENCJA] ${sygnatura}`,
      meeting_date: dateStr,
      index_number: sygnatura,
      role: isOut ? 'OUT' : 'IN',
      points: 0,
      activity_description: JSON.stringify({
        id: sygnatura,
        sygnatura: sygnatura,
        date: dateStr,
        dataWplywu: k.dataWplywu || dateStr,
        dataWyslania: k.dataWyslania || '',
        typ: k.typ || (isOut ? 'Wychodzące' : 'Wchodzące'),
        direction: isOut ? 'OUT' : 'IN',
        kierunek: isOut ? 'OUT' : 'IN',
        sender: k.nadawca || '',
        nadawca: k.nadawca || '',
        recipient: k.odbiorca || '',
        odbiorca: k.odbiorca || '',
        subject: k.przedmiot || '',
        przedmiot: k.przedmiot || '',
        summary: k.przedmiot || '',
        status: k.status || 'Zakończone',
        driveLink: k.lokalizacjaDrive || '',
        lokalizacjaDrive: k.lokalizacjaDrive || '',
        dataAktualizacji: k.dataAktualizacji || ''
      })
    });
  }

  console.log(`\n📦 Wstawianie ${attendanceRows.length} rekordów do tabeli [attendance] (w paczkach po 250)...`);
  const chunkSize = 250;
  let insertedAtt = 0;
  for (let i = 0; i < attendanceRows.length; i += chunkSize) {
    const chunk = attendanceRows.slice(i, i + chunkSize);
    const { error: attErr } = await supabase.from('attendance').insert(chunk);
    if (attErr) {
      console.error(`❌ Błąd wstawiania paczki attendance (${i}..${i + chunk.length}):`, attErr);
    } else {
      insertedAtt += chunk.length;
    }
  }
  console.log(`✅ Pomyślnie zapisano ${insertedAtt} / ${attendanceRows.length} rekordów w tabeli [attendance]!`);

  // 6. Podsumowanie końcowe z bazy Supabase
  const { count: finalMCount } = await supabase.from('members').select('*', { count: 'exact', head: true });
  const { count: finalQCount } = await supabase.from('quarantine_submissions').select('*', { count: 'exact', head: true });
  const { count: finalACount } = await supabase.from('attendance').select('*', { count: 'exact', head: true });

  console.log(`\n🎉 MIGRACJA ZAKOŃCZONA SUKCESEM! Stan bazy Supabase:
  - Tabela [members]: ${finalMCount} rekordów
  - Tabela [quarantine_submissions]: ${finalQCount} rekordów
  - Tabela [attendance] (obecności + dorobek + korespondencja): ${finalACount} rekordów`);
}

runFullMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Krytyczny błąd migracji:', err);
    process.exit(1);
  });
