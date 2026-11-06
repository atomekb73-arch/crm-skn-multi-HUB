import { initialMembers as seedMembers } from '../data/seedMembers.js';
import { matchMemberExact, isMetadataOrHeaderLine } from '../utils/meetingParser.js';
import { isFacultySupervisor } from '../utils/specialRoles.js';
import { readSWRData, writeSWRData, CACHE_KEYS } from '../hooks/useCachedData.js';
import { getAcademicYearFromDate } from '../utils/helpers.js';
import { supabase, fetchAllTenantRows } from '../supabaseClient.js';

function normalizeOrg(orgId) {
  const fallbackOrg = typeof window !== 'undefined' && window.localStorage
    ? (localStorage.getItem('crm_skn_current_org_id') || localStorage.getItem('crm_active_org_id'))
    : null;
  const str = String(orgId || fallbackOrg || 'skn_seksuologii').trim();
  if (str === 'skn-template' || str === 'default' || !str) return 'skn_seksuologii';
  if (str === 'skn_psychoonkologii' || str === 'skn-psychoonkologia') return 'psychoonkologia';
  if (str === 'skn_uzaleznien' || str === 'sknu') return 'uzaleznienia';
  return str;
}

export async function fetchWithTimeout(resource, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: options.signal || controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

export function extractSheetId(input) {
  if (!input) return '';
  const str = String(input).trim();
  const match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return str;
}

// ─── Supabase Single Source of Truth (SSOT) ──────────────────────────────────
// Wszystkie dawne wywołania Google Apps Script / Google Sheets zostały trwale
// przekierowane na natywne operacje klienta Supabase (`members`, `quarantine_submissions`, `attendance`).
export const SHEET_ID = '';
export const SPREADSHEET_ID = '';
export const DEFAULT_GAS_URL = '';
export const APPS_SCRIPT_URL = '';
export const GAS_WEBAPP_URL = '';
export const GAS_ENDPOINT = '';
export const GAS_URL = '';

/**
 * Uniwersalna funkcja kompatybilności (dawniej sendToGAS) – wykonuje operacje bezpośrednio w bazie Supabase.
 */
export async function sendToGAS(payload) {
  const action = payload?.action || '';
  console.info(`[Supabase SSOT] Obsługa akcji: ${action}`);

  try {
    if (action === 'zapisz_obecnosci' && payload.kodSpotkania) {
      await saveMeetingAttendanceToGAS({
        kodSpotkania: payload.kodSpotkania,
        dataSpotkania: payload.dataSpotkania,
        obecnosci: payload.obecnosci || []
      });
    } else if (action === 'usun_obecnosci_spotkania' && payload.kodSpotkania) {
      await deleteMeetingAttendanceFromGAS(payload.kodSpotkania);
    } else if (action === 'zapisz_punkty_zarzadu' && Array.isArray(payload.kadencje)) {
      await saveBoardTenurePointsToGAS(payload.kadencje);
    }
    return { status: 'success', source: 'supabase' };
  } catch (err) {
    console.error('[Supabase SSOT] Błąd operacji:', err);
    throw err;
  }
}

export const sendToGas = sendToGAS;

/**
 * Pobiera kompletne dane z bazy Supabase dla danej organizacji (dawniej fetchGasData).
 */
export async function fetchGasData(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrg(orgId);
  try {
    const [
      { data: dbMembers },
      { data: dbQuarantine },
      { data: dbAttendance }
    ] = await Promise.all([
      fetchAllTenantRows('members', cleanOrg, { orderBy: 'full_name', ascending: true }),
      fetchAllTenantRows('quarantine_submissions', cleanOrg, { orderBy: 'created_at', ascending: false }),
      fetchAllTenantRows('attendance', cleanOrg)
    ]);

    const czlonkowie = (dbMembers || []).map(m => ({
      id: m.id,
      dataWplywu: m.joined_date || '',
      nrIndeksu: m.index_number || '',
      imieNazwisko: m.full_name || '',
      email: m.email || '',
      telefon: m.phone || '',
      kierunek: m.field_of_study || 'Psychologia',
      rokStudiow: m.study_year || 'Rok 1',
      zgodaMailing: Boolean(m.mailing_consent),
      statusWeryfikacji: m.activity_status === 'Archiwum' ? 'Archiwum' : 'Zatwierdzony',
      dataWeryfikacji: m.verification_date || '',
      aliasy: m.custom_fields?.aliasy || '',
      dataAktualizacji: m.custom_fields?.dataAktualizacji || ''
    }));

    const ewidencja = [];
    const dorobek = [];
    const korespondencja = [];
    const seenEwidencjaKeys = new Set();

    for (const row of (dbAttendance || [])) {
      const code = String(row.meeting_code || '').trim();
      if (code.startsWith('[DOROBEK]')) {
        try {
          const parsed = JSON.parse(row.activity_description || '{}');
          dorobek.push({
            data: parsed.date || row.meeting_date,
            nrIndeksu: parsed.nrIndeksu || row.index_number,
            kategoria: parsed.category || parsed.type || row.role || 'Project',
            opis: parsed.description || parsed.title || '',
            punkty: Number(parsed.points ?? row.points ?? 0),
            dataWpisu: parsed.dataWpisu || row.meeting_date,
            ...parsed
          });
        } catch {}
      } else if (code.startsWith('[KORESPONDENCJA]')) {
        try {
          const parsed = JSON.parse(row.activity_description || '{}');
          korespondencja.push(parsed);
        } catch {}
      } else if (code) {
        const rawIdx = String(row.index_number || '').trim().toLowerCase();
        const rawDate = String(row.meeting_date || '').trim();
        const rawCodeClean = code.toUpperCase().replace(/^\[.*?\]\s*/, '').trim();
        const dedupeKey = `${rawDate}_${rawCodeClean}_${rawIdx}`;
        if (!seenEwidencjaKeys.has(dedupeKey)) {
          seenEwidencjaKeys.add(dedupeKey);
          ewidencja.push({
            id: row.id,
            kodSpotkania: code,
            dataSpotkania: row.meeting_date,
            nrIndeksu: row.index_number,
            identyfikator: row.index_number,
            status: row.role || 'Członek koła',
            rola: row.role || 'Członek koła',
            zrodlo: 'Supabase SSOT',
            punkty: Number(row.points ?? 1),
            opisAktywnosci: row.activity_description || 'Obecność na spotkaniu'
          });
        }
      }
    }

    const kwarantannaFormularz = (dbQuarantine || []).map((q, idx) => ({
      id: q.id,
      rowIndex: idx + 1,
      dataWplywu: q.submission_date,
      academicYear: q.academic_year || '2026/2027',
      imieNazwisko: q.full_name,
      fullName: q.full_name,
      email: q.email,
      nrIndeksu: q.index_number,
      index: q.index_number,
      kierunek: q.field_of_study || 'Psychologia',
      rokStudiow: q.study_year || 'Rok 1',
      zgody: Boolean(q.consents_ok),
      zgodyOk: Boolean(q.consents_ok),
      statusWeryfikacji: q.decision_status || 'Oczekuje',
      status: q.decision_status === 'Oczekuje' ? 'pending' : 'archived',
      isArchived: q.decision_status !== 'Oczekuje'
    }));

    return {
      status: 'success',
      timestamp: new Date().toISOString(),
      czlonkowie,
      ewidencja,
      dorobek,
      korespondencja,
      kwarantannaFormularz,
      decyzjeKwarantanny: []
    };
  } catch (err) {
    console.warn('[fetchGasData -> Supabase SSOT] Błąd odczytu:', err);
    return null;
  }
}

export async function fetchMemberDetails(memberIdOrIndex, orgId = null) {
  if (!memberIdOrIndex) return null;
  const cleanId = String(memberIdOrIndex).trim();
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  try {
    let q = supabase
      .from('members')
      .select('*')
      .eq('index_number', cleanId);
    if (cleanOrg) {
      q = q.eq('organization_id', cleanOrg);
    }
    const { data } = await q.limit(1);
    return data && data[0] ? data[0] : null;
  } catch {
    return null;
  }
}

export function mapStatusToGAS(status) {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'active' || s === 'zatwierdzony' || s === 'aktywny') return 'Zatwierdzony';
  if (s === 'guest' || s === 'gosc' || s === 'gość') return 'Gosc';
  if (s === 'resigned' || s === 'nieaktywny' || s === 'rezygnacja' || s === 'były' || s === 'byly' || s === 'inactive') return 'Nieaktywny';
  if (s === 'archived' || s === 'archiwum' || s === 'odrzucony' || s === 'czarna lista') return 'Archiwum';
  if (s === 'pending' || s === 'oczekuje' || s === 'kwarantanna' || !s) return 'Oczekuje';
  if (s === 'usuniety' || s === 'usunięty' || s === 'deleted') return 'Usuniety';
  return status || 'Zatwierdzony';
}

export async function updateVerificationStatus(nrIndeksu, nowyStatus = 'Zatwierdzony', orgId = null) {
  const cleanNr = String(nrIndeksu || '').replace(/\D/g, '').trim() || String(nrIndeksu || '').trim();
  const canonical = mapStatusToGAS(nowyStatus);
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  let q = supabase.from('members').update({ activity_status: canonical }).eq('index_number', cleanNr);
  if (cleanOrg) {
    q = q.eq('organization_id', cleanOrg);
  }
  await q;
  return { status: 'success' };
}

export async function changeStudentStatusInGAS({ nrIndeksu, nowyStatus = 'Zatwierdzony', orgId = null }) {
  return await updateVerificationStatus(nrIndeksu, nowyStatus, orgId);
}

export function formatDecisionDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const y = valid.getFullYear();
  const m = String(valid.getMonth() + 1).padStart(2, '0');
  const day = String(valid.getDate()).padStart(2, '0');
  const hh = String(valid.getHours()).padStart(2, '0');
  const mm = String(valid.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export async function saveQuarantineDecisionToGAS({
  nrIndeksu,
  status = 'Zatwierdzony',
  dataDecyzji,
  autor = 'Administrator CRM'
}) {
  const cleanNr = String(nrIndeksu || '').replace(/\D/g, '').trim() || String(nrIndeksu || '').trim();
  await supabase
    .from('quarantine_submissions')
    .update({
      decision_status: status,
      decision_date: dataDecyzji ? new Date(dataDecyzji).toISOString() : new Date().toISOString(),
      decision_author: autor
    })
    .eq('index_number', cleanNr);
  return { status: 'success' };
}

export async function saveQuarantineDecisionsBatchToGAS(decyzje = []) {
  for (const d of decyzje) {
    const cleanNr = String(d?.nrIndeksu || d?.index || '').replace(/\D/g, '').trim();
    if (cleanNr) {
      await saveQuarantineDecisionToGAS({
        nrIndeksu: cleanNr,
        status: d?.status || 'Zatwierdzony',
        autor: d?.autor || 'Administrator CRM'
      });
    }
  }
  return { status: 'success', count: decyzje.length };
}

/**
 * Zapisuje frekwencję danego spotkania bezpośrednio i wyłącznie w tabeli `attendance` w Supabase.
 * Całkowicie odcięte od zewnętrznych arkuszy Google Sheets.
 */
export async function saveMeetingAttendanceToSupabase({ kodSpotkania, dataSpotkania, obecnosci, orgId = 'skn_seksuologii' }) {
  const cleanOrg = normalizeOrg(orgId);
  const listToSave = Array.isArray(obecnosci) ? obecnosci : [];
  const rawCode = String(kodSpotkania || 'M00').replace(/\s+/g, ' ').trim();
  const cleanCode = rawCode.replace(/^\[.*?\]\s*/, '').trim();
  const dateStr = String(dataSpotkania || new Date().toISOString().slice(0, 10)).split('T')[0].trim();

  // Usuń dotychczasowe wpisy dla tego spotkania w Supabase w ramach tej organizacji
  await supabase.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', rawCode);
  if (cleanCode && cleanCode !== rawCode) {
    await supabase.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', cleanCode);
  }

  const rowsToInsert = listToSave.map(item => {
    if (typeof item === 'string') {
      const isIdx = /^\d+$/.test(item.trim());
      return {
        organization_id: cleanOrg,
        meeting_code: rawCode,
        meeting_date: dateStr,
        index_number: item.trim(),
        role: isIdx ? 'Członek koła' : 'Gość',
        points: 1,
        activity_description: 'Obecność na spotkaniu naukowym'
      };
    }
    const nrIndeksu = String(item.nrIndeksu || item.index || '').replace(/\D/g, '').trim();
    const name = String(item.name || item.fullName || item.rawName || '').trim();
    const isSup = item.role === 'supervisor' || item.rola === 'Opiekun';
    const isSpk = item.role === 'speaker' || item.rola === 'Prelegent';
    const isGst = item.role === 'guest' || item.rola === 'Gość' || item.isGuest || item.isExternalGuest || (!nrIndeksu && item.role !== 'member');
    const rola = String(item.rola || item.role || (isSup ? 'Opiekun' : (isSpk ? 'Prelegent' : (isGst ? 'Gość' : 'Członek koła')))).trim();
    const rawPts = item.punkty !== undefined ? item.punkty : (item.points !== undefined ? item.points : 1);
    const punkty = Number(rawPts) > 0 ? Number(rawPts) : 1;
    const opisAktywnosci = item.opisAktywnosci || item.description || 'Obecność na spotkaniu naukowym';

    const identifier = isSup
      ? (name.startsWith('[OPIEKUN]') ? name : `[OPIEKUN]: ${name}`)
      : (isSpk ? (name.startsWith('[SPEAKER]') ? name : `[SPEAKER]: ${name}`) : (nrIndeksu || name));

    return {
      organization_id: cleanOrg,
      meeting_code: rawCode,
      meeting_date: dateStr,
      index_number: identifier || 'Uczestnik',
      role: rola,
      points: punkty,
      activity_description: opisAktywnosci
    };
  }).filter(r => r.index_number);

  // Zabezpieczenie przed duplikatami wpisów na to samo spotkanie (SSOT Uniqueness)
  const seenInsertKeys = new Set();
  const uniqueRowsToInsert = [];
  for (const row of rowsToInsert) {
    const k = String(row.index_number || '').trim().toLowerCase();
    if (!k || seenInsertKeys.has(k)) continue;
    seenInsertKeys.add(k);
    uniqueRowsToInsert.push(row);
  }

  if (uniqueRowsToInsert.length > 0) {
    const { error } = await supabase.from('attendance').insert(uniqueRowsToInsert);
    if (error) {
      console.error('[saveMeetingAttendanceToSupabase] Błąd zapisu attendance:', error);
      throw error;
    }
  }

  return { status: 'success', count: uniqueRowsToInsert.length };
}

export const saveMeetingAttendanceToGAS = saveMeetingAttendanceToSupabase;

/**
 * Zapisuje punkty z kadencji zarządu w Supabase.
 */
export async function saveBoardTenurePointsToGAS(boardTenures, orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrg(orgId);
  const tenuresList = Array.isArray(boardTenures) ? boardTenures : [];
  await supabase.from('attendance').delete().eq('organization_id', cleanOrg).like('meeting_code', '[ZARZAD]%');

  const rows = tenuresList.map((t, idx) => {
    const cleanIdx = String(t.memberIndex || t.index || t.nrIndeksu || '').replace(/\D/g, '').trim() || String(t.memberName || 'Zarząd');
    const pts = Number(t.punkty ?? t.points ?? 0) || 0;
    const roleName = String(t.roleName || t.role || 'Członek Zarządu').trim();
    const dateStr = String(t.startDate || t.date || new Date().toISOString().slice(0, 10)).split('T')[0];

    return {
      organization_id: cleanOrg,
      meeting_code: `[ZARZAD] #${idx + 1}`,
      meeting_date: dateStr,
      index_number: cleanIdx,
      role: roleName,
      points: pts,
      activity_description: `Pełnienie funkcji: ${roleName}`
    };
  });

  if (rows.length > 0) {
    await supabase.from('attendance').insert(rows);
  }
  return { status: 'success', count: rows.length };
}

export function formatResearchItem(item) {
  if (!item) return null;
  const rawDate = item?.date || item?.data || (item?.year ? `${item.year}-01-01` : '') || new Date().toISOString().split('T')[0];
  const searchStr = [item?.authors, item?.speakers, item?.leadResearcher, item?.nrIndeksu, item?.studentIndex, item?.index, item?.authorIndex]
    .filter(Boolean)
    .join(' ');
  const indexMatch = String(searchStr).match(/\b\d{5,6}\b/);
  const cleanIndex = indexMatch
    ? indexMatch[0]
    : String(item?.studentIndex || item?.nrIndeksu || item?.authorIndex || item?.index || '').replace(/\D/g, '').replace(/^0+/, '');

  const rawType = item?.type || item?.category || item?.kategoria || 'Project';
  const title = String(item?.title || item?.opis || '').trim();
  const pts = Number(item?.points ?? item?.punkty ?? 0) || 0;
  const dateWpisu = item?.createdAt || item?.dataWpisu || new Date().toLocaleString('pl-PL');

  return {
    data: rawDate,
    nrIndeksu: cleanIndex || '15998',
    kategoriaAktywnosci: rawType,
    opis: title,
    punkty: pts,
    dataWpisu: dateWpisu
  };
}

/**
 * Pobiera listę dorobku naukowego bezwzględnie przefiltrowaną po organization_id
 */
export async function fetchResearchFromDB(orgId = null) {
  const cleanOrg = normalizeOrg(orgId || (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null) || 'skn_seksuologii');
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('organization_id', cleanOrg)
      .like('meeting_code', '[DOROBEK]%')
      .order('meeting_date', { ascending: false });

    if (error) {
      console.error('[fetchResearchFromDB] Błąd pobierania dorobku z Supabase:', error);
      return [];
    }

    const items = [];
    (data || []).forEach(row => {
      try {
        const parsed = JSON.parse(row.activity_description || '{}');
        // Rygorystyczna izolacja: jeśli rekord ma zapisany organization_id, musi zgadzać się z cleanOrg
        if (!parsed.organization_id || parsed.organization_id === cleanOrg) {
          items.push({
            id: parsed.id || `res_${row.id}`,
            organization_id: cleanOrg,
            orgId: cleanOrg,
            ...parsed,
            date: parsed.date || row.meeting_date,
            nrIndeksu: parsed.nrIndeksu || row.index_number,
            points: Number(parsed.points ?? row.points ?? 0),
          });
        }
      } catch (err) {
        console.warn('[fetchResearchFromDB] Błąd parsowania rekordu dorobku:', err);
      }
    });

    return items;
  } catch (err) {
    console.error('[fetchResearchFromDB] Wyjątek podczas pobierania dorobku:', err);
    return [];
  }
}

/**
 * Zapisuje i synchronizuje listę dorobku naukowego bezpośrednio w bazie Supabase (`attendance` z prefiksem `[DOROBEK]`).
 */
export async function saveResearchToGAS(researchList, orgId = null) {
  const cleanOrg = normalizeOrg(orgId || (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null) || 'skn_seksuologii');
  const list = Array.isArray(researchList) ? researchList : [];
  
  // Bezpieczne usuwanie wyłącznie rekordów powiązanych z tym kołem
  await supabase.from('attendance').delete().eq('organization_id', cleanOrg).like('meeting_code', '[DOROBEK]%');

  const rows = list.map((item, idx) => {
    const formatted = formatResearchItem(item);
    const dateStr = String(formatted?.data || new Date().toISOString().slice(0, 10)).split('T')[0];
    const itemWithOrg = {
      ...item,
      organization_id: cleanOrg,
      orgId: cleanOrg,
    };
    return {
      organization_id: cleanOrg,
      meeting_code: `[DOROBEK] #${idx + 1}`,
      meeting_date: dateStr,
      index_number: formatted?.nrIndeksu || '15998',
      role: String(item?.type || item?.category || 'Project'),
      points: Number(item?.points ?? item?.punkty ?? 0) || 0,
      activity_description: JSON.stringify(itemWithOrg)
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase.from('attendance').insert(rows);
    if (error) console.error('[saveResearchToGAS -> Supabase] Błąd zapisu dorobku:', error);
  }
  return { status: 'success', count: rows.length };
}

export async function saveResearchItemToGAS(item, allResearchList = [], orgId = null) {
  const cleanOrg = normalizeOrg(orgId || item?.organization_id || item?.orgId || (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null) || 'skn_seksuologii');
  const list = Array.isArray(allResearchList) && allResearchList.length > 0 ? allResearchList : (item ? [item] : []);
  return await saveResearchToGAS(list, cleanOrg);
}

export const syncResearchToGAS = saveResearchToGAS;
export const saveResearchToSheets = saveResearchToGAS;

export async function smartSyncAndFetch() {
  const freshData = await fetchAllData();
  return { freshData, flushedCount: 0, success: true };
}

export async function syncAttendancePointsToGAS() {
  return { status: 'success' };
}

export async function syncAllPointsToGAS({ boardTenures = [] }) {
  if (Array.isArray(boardTenures) && boardTenures.length > 0) {
    await saveBoardTenurePointsToGAS(boardTenures);
  }
  return { status: 'success' };
}

/**
 * Usuwa frekwencję danego spotkania bezpośrednio z tabeli `attendance` w Supabase.
 */
export async function deleteMeetingAttendanceFromSupabase(kodSpotkania, dateOrStart = null, orgId = null) {
  const rawCode = String(kodSpotkania || '').replace(/\s+/g, ' ').trim();
  const cleanCode = rawCode.replace(/^\[.*?\]\s*/, '').trim();
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);

  if (rawCode) {
    let q1 = supabase.from('attendance').delete().eq('meeting_code', rawCode);
    let q2 = supabase.from('attendance').delete().ilike('meeting_code', `%${cleanCode}%`);
    if (cleanOrg) {
      q1 = q1.eq('organization_id', cleanOrg);
      q2 = q2.eq('organization_id', cleanOrg);
    }
    await q1;
    await q2;
  }
  return { status: 'success' };
}

export const deleteMeetingAttendanceFromGAS = deleteMeetingAttendanceFromSupabase;

export async function claimGuestAttendance(nazwiskoGoscia, nowyNrIndeksu) {
  const guestName = String(nazwiskoGoscia || '').trim();
  const newIdx = String(nowyNrIndeksu || '').trim();
  if (guestName && newIdx) {
    await supabase
      .from('attendance')
      .update({ index_number: newIdx, role: 'Członek koła' })
      .eq('index_number', guestName);
  }
  return { status: 'success' };
}

export async function initializeSubmissionsRegistryInGAS() {
  return { status: 'success' };
}

export async function editMemberInGAS({ nrIndeksu, imieNazwisko, email, telefon, kierunek, aliasy, orgId }) {
  const cleanIdx = String(nrIndeksu || '').replace(/\D/g, '').trim();
  if (!cleanIdx) return { status: 'error' };
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  let q = supabase
    .from('members')
    .update({
      full_name: imieNazwisko,
      email: email,
      phone: telefon || null,
      field_of_study: kierunek || 'Psychologia',
      custom_fields: { aliasy: aliasy || '', dataAktualizacji: new Date().toISOString() }
    })
    .eq('index_number', cleanIdx);
  if (cleanOrg) {
    q = q.eq('organization_id', cleanOrg);
  }
  await q;
  return { status: 'success' };
}

/**
 * Automatyczny zapis / aktualizacja aliasu członka w bazie Supabase (`members.custom_fields.aliasy`).
 */
export async function updateMemberAliasesInGAS(nrIndeksu, nowyAlias, orgId = null) {
  const cleanNr = String(nrIndeksu || '').replace(/\D/g, '').trim();
  const cleanAlias = String(nowyAlias || '').trim();
  if (!cleanNr || !cleanAlias) return null;
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);

  let q = supabase
    .from('members')
    .select('id, custom_fields')
    .eq('index_number', cleanNr);
  if (cleanOrg) {
    q = q.eq('organization_id', cleanOrg);
  }

  const { data: existing } = await q.limit(1);

  if (existing && existing[0]) {
    const cf = existing[0].custom_fields || {};
    const currentAliases = String(cf.aliasy || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!currentAliases.includes(cleanAlias)) {
      currentAliases.push(cleanAlias);
    }
    await supabase
      .from('members')
      .update({
        custom_fields: {
          ...cf,
          aliasy: currentAliases.join(', '),
          dataAktualizacji: new Date().toISOString()
        }
      })
      .eq('id', existing[0].id);
  }

  return { status: 'success' };
}

export async function addMemberManuallyToGAS(member, orgId = null) {
  const cleanIdx = String(member.index || member.cleanIndex || member.nrIndeksu || '').replace(/\D/g, '').trim();
  const fullName = String(member.imieNazwisko || member.fullName || '').trim();
  const cleanOrg = orgId ? normalizeOrg(orgId) : (member?.organization_id ? normalizeOrg(member.organization_id) : ((typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null) || 'skn_seksuologii'));
  const payload = {
    organization_id: cleanOrg,
    index_number: cleanIdx || `TEMP_${Date.now()}`,
    full_name: fullName,
    email: String(member.email || '').toLowerCase().trim(),
    phone: member.phone || null,
    field_of_study: member.field || 'Psychologia',
    study_year: member.year || 'Rok 1',
    activity_status: 'Aktywny',
    verification_date: new Date().toISOString().split('T')[0],
    joined_date: new Date().toISOString().split('T')[0],
    mailing_consent: Boolean(member.mailingConsent ?? true),
    total_points: 0,
    custom_fields: { aliasy: member.aliases || '' }
  };
  await supabase.from('members').insert([payload]);
  return { status: 'success' };
}

export async function fetchQuarantineFromGAS(orgId = null) {
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  let q = supabase
    .from('quarantine_submissions')
    .select('*')
    .eq('decision_status', 'Oczekuje');
  if (cleanOrg) {
    q = q.eq('organization_id', cleanOrg);
  }
  const { data } = await q;
  return data || [];
}

export async function testSheetConnection() {
  const { count, error } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true });
  if (error) {
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    rowCount: count || 0,
    message: `Połączono pomyślnie z bazą Supabase SSOT! Znaleziono ${count || 0} członków.`
  };
}

export function parsePercent(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    return val <= 1 ? Math.round(val * 100) : Math.round(val);
  }
  const cleaned = String(val).replace('%', '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

export function parseGasResponse(gasData) {
  return gasData || {
    members: seedMembers,
    quarantine: [],
    archivedQuarantine: [],
    mailLog: [],
    attendanceByMeeting: {},
    gasDecyzje: [],
    dorobek: [],
    ewidencja: []
  };
}

export function getCachedFormsRegistry() {
  const globalCached = readSWRData(CACHE_KEYS.FORMS_REGISTRY);
  return globalCached?.data || null;
}

export function setCachedFormsRegistry(data) {
  if (!data) return;
  writeSWRData(CACHE_KEYS.FORMS_REGISTRY, data);
}

export async function fetchAllData(orgId = null) {
  const cleanOrg = orgId ? normalizeOrg(orgId) : ((typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null) || 'skn_seksuologii');
  const gasData = await fetchGasData(cleanOrg);
  return gasData || {
    members: seedMembers,
    quarantine: [],
    archivedQuarantine: [],
    mailLog: [],
    attendanceByMeeting: {},
    gasDecyzje: [],
    dorobek: [],
    ewidencja: []
  };
}

// ─── Duration & Attendance Parsing Helpers ────────────────────────────────────

export function parseDurationToMinutes(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') {
    if (val > 0 && val < 1) {
      return Math.round(val * 24 * 60);
    }
    return Math.round(val);
  }
  const str = String(val).trim();
  if (!str) return 0;

  const hmsMatch = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const mins = parseInt(hmsMatch[2], 10);
    const secs = parseInt(hmsMatch[3], 10);
    return Math.round(hours * 60 + mins + secs / 60);
  }

  const msMatch = str.match(/^(\d{1,3}):(\d{2})$/);
  if (msMatch) {
    const mins = parseInt(msMatch[1], 10);
    const secs = parseInt(msMatch[2], 10);
    return Math.round(mins + secs / 60);
  }

  let total = 0;
  let matched = false;
  const hoursMatch = str.match(/(\d+)\s*(?:h|godz|hr|hours?)/i);
  if (hoursMatch) {
    total += parseInt(hoursMatch[1], 10) * 60;
    matched = true;
  }
  const minsMatch = str.match(/(\d+)\s*(?:m|min|minut|minutes?)/i);
  if (minsMatch) {
    total += parseInt(minsMatch[1], 10);
    matched = true;
  }
  if (matched) return total;

  const num = parseFloat(str.replace(',', '.'));
  if (!isNaN(num)) {
    return Math.round(num);
  }
  return 0;
}

export function parseAttendanceLine(rawLine) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const line = rawLine.replace(/^\uFEFF/, '').trim();
  if (!line) return null;

  if (isMetadataOrHeaderLine(line)) {
    return null;
  }

  try {
    const lower = String(line || '').toLowerCase();
    let rawName = line;
    let joinTime = '18:00';
    let durationStr = '60 min';
    let durationMinutes = 60;
    let extractedIndex = '';
    let isExplicitGuest = false;

    if (line.includes('"') || (line.includes(',') && !line.includes(';'))) {
      const csvMatches = [...line.matchAll(/"([^"]*)"|([^,]+)/g)]
        .map(m => (m[1] !== undefined ? m[1] : m[2]).trim())
        .filter(Boolean);

      if (csvMatches.length >= 1) {
        const nameCand = csvMatches[0];
        if (isMetadataOrHeaderLine(nameCand)) {
          return null;
        }
        rawName = nameCand;

        if (csvMatches.length >= 2) {
          const timeMatch = csvMatches[1].match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
          if (timeMatch) joinTime = timeMatch[1];
        }

        if (csvMatches.length >= 3) {
          durationStr = csvMatches[2];
          durationMinutes = parseDurationToMinutes(durationStr);
        } else if (csvMatches.length === 2) {
          const dur = parseDurationToMinutes(csvMatches[1]);
          if (dur > 0) {
            durationStr = csvMatches[1];
            durationMinutes = dur;
          }
        }

        if (durationMinutes <= 0) durationMinutes = 60;

        return {
          rawName,
          joinTime: joinTime || '18:00',
          durationStr: durationStr || `${durationMinutes} min`,
          durationMinutes,
          extractedIndex: '',
          isExplicitGuest: false,
          isMultiColumn: true,
        };
      }
    }

    if (line.includes('Sprawdź opis') || lower.includes('[gość]') || lower.includes('gosc') || lower.startsWith('gość')) {
      isExplicitGuest = true;
    }

    const lineAfterDate = line.split(/\d{4}-\d{2}-\d{2}/)[1] || line;
    const indexMatch = lineAfterDate.match(/(?:Zgodny\s*✔️?\s*|indeks[:\s]*|nr[:\s]*)(\d{3,6})/i) || lineAfterDate.match(/\b(\d{4,6})\b/);
    if (indexMatch) {
      extractedIndex = indexMatch[1];
    }

    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);

    if (dateMatch) {
      const dateIndex = dateMatch.index;
      if (dateIndex > 0) {
        rawName = line.slice(0, dateIndex).trim();
      }

      joinTime = dateMatch[2] || '18:00';

      const afterJoin = line.slice(dateIndex + dateMatch[0].length).trim();
      const durMatch = afterJoin.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2}|\d+\s*(?:m|min|h|godz))/i);
      if (durMatch) {
        durationStr = durMatch[1];
        durationMinutes = parseDurationToMinutes(durationStr);
      }
    } else if (line.includes('\t') || line.includes(';')) {
      const sep = line.includes('\t') ? '\t' : ';';
      const parts = line.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        rawName = parts[0];
        joinTime = parts[1];
        durationStr = parts[2];
        durationMinutes = parseDurationToMinutes(durationStr);
      } else if (parts.length === 2) {
        rawName = parts[0];
        const dur = parseDurationToMinutes(parts[1]);
        if (dur > 0) {
          durationStr = parts[1];
          durationMinutes = dur;
        } else {
          joinTime = parts[1];
        }
      }
    } else {
      const durationEndMatch = line.match(/\s+(\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:m|min|minut|h|godz))\s*$/i);
      if (durationEndMatch) {
        durationStr = durationEndMatch[1];
        rawName = line.slice(0, durationEndMatch.index).trim();
        durationMinutes = parseDurationToMinutes(durationStr);
      }
    }

    rawName = rawName
      .replace(/\d{4}-\d{2}-\d{2}.*$/, '')
      .replace(/\d{1,2}:\d{2}.*$/, '')
      .replace(/Zgodny.*$/, '')
      .replace(/Sprawdź opis.*$/, '')
      .replace(/\[GOŚĆ\].*$/i, '')
      .trim();

    if (!rawName) {
      rawName = line.trim();
    }

    if (durationMinutes <= 0) {
      durationMinutes = 60;
    }

    return {
      rawName,
      joinTime: joinTime || '18:00',
      durationStr: durationStr || `${durationMinutes} min`,
      durationMinutes,
      extractedIndex,
      isExplicitGuest,
      isMultiColumn: false,
    };
  } catch (err) {
    const clean = rawLine.replace(/\d{4}-\d{2}-\d{2}.*$/, '').replace(/\d{1,2}:\d{2}.*$/, '').trim() || rawLine;
    return {
      rawName: clean,
      joinTime: '18:00',
      durationStr: '60 min',
      durationMinutes: 60,
      extractedIndex: '',
      isExplicitGuest: true,
      isMultiColumn: false,
    };
  }
}

export function parseAttendanceText(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  lines.forEach(line => {
    try {
      const parsed = parseAttendanceLine(line);
      if (parsed && parsed.rawName) results.push(parsed);
    } catch {}
  });
  return results;
}

export const parseAttendanceInput = parseAttendanceText;

/**
 * Pobiera obecności na wybranym spotkaniu bezpośrednio z tabeli `attendance` w Supabase.
 */
export async function fetchMeetingAttendanceFromSupabase(meetingCode, sheetId = '', members = [], orgId = null) {
  if (Array.isArray(sheetId)) {
    members = sheetId;
  }
  if (!meetingCode) return { ok: false, error: 'Brak kodu spotkania' };
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);

  let activeMembersList = Array.isArray(members) && members.length > 0 ? members : [];
  if (activeMembersList.length === 0 && typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem('crm_members');
      if (cached) activeMembersList = JSON.parse(cached);
    } catch {}
  }

  const rawCodeUpper = String(meetingCode).trim().toUpperCase();
  const cleanCodeUpper = rawCodeUpper.replace(/^\[.*?\]\s*/, '');

  try {
    // Jeśli lista członków nadal jest pusta, pobierz ją równolegle z members w Supabase
    if (activeMembersList.length === 0) {
      let qMem = supabase.from('members').select('*');
      if (cleanOrg) qMem = qMem.eq('organization_id', cleanOrg);
      const { data: dbMems } = await qMem;
      if (Array.isArray(dbMems)) {
        activeMembersList = dbMems.map(m => ({
          ...m,
          index: m.index_number,
          nrIndeksu: m.index_number,
          fullName: m.full_name,
        }));
      }
    }

    let attQuery = supabase.from('attendance').select('*');
    if (cleanOrg) attQuery = attQuery.eq('organization_id', cleanOrg);
    const { data: attRows, error } = await attQuery;

    if (error) throw error;

    const matching = (attRows || []).filter(row => {
      const itemCode = String(row.meeting_code || '').trim().toUpperCase();
      if (itemCode.startsWith('[DOROBEK]') || itemCode.startsWith('[KORESPONDENCJA]') || itemCode.startsWith('[ZARZAD]')) {
        return false;
      }
      const itemCleanCode = itemCode.replace(/^\[.*?\]\s*/, '');
      return itemCode === rawCodeUpper || itemCleanCode === cleanCodeUpper || itemCode.includes(cleanCodeUpper) || cleanCodeUpper.includes(itemCleanCode);
    });

    if (matching.length > 0) {
      // Deduplikacja uczestników przy odczycie z Supabase
      const seenAttendees = new Set();
      const participants = [];

      matching.forEach((item, idx) => {
        const idxStr = String(item.index_number || '').trim();
        const dedupeKey = idxStr.toLowerCase();
        if (seenAttendees.has(dedupeKey)) return;
        seenAttendees.add(dedupeKey);

        const rolaStr = String(item.role || '').toLowerCase().trim();

        const isSupervisor = rolaStr === 'supervisor' || rolaStr === 'opiekun' ||
                             idxStr.includes('[OPIEKUN]') || isFacultySupervisor(idxStr);

        const isSpeaker = !isSupervisor && (
                          idxStr.includes('[SPEAKER]') || idxStr.toLowerCase() === 'speaker' ||
                          rolaStr === 'speaker' || rolaStr === 'prelegent');

        const isExplicitGuest = !isSupervisor && !isSpeaker && (
          idxStr.includes('[GOŚĆ]') || idxStr.includes('GOSC') ||
          rolaStr === 'gość' || rolaStr === 'guest' || rolaStr === 'gosc'
        );

        const cleanName = idxStr
          .replace(/^\[SPEAKER\]:\s*/i, '')
          .replace(/^\[PRELEGENT\]:\s*/i, '')
          .replace(/^\[GOŚĆ\]:\s*/i, '')
          .replace(/^\[GOSC\]:\s*/i, '')
          .replace(/^\[OPIEKUN\]:\s*/i, '')
          .trim();

        let matchedMember = null;
        if (!isSupervisor && !isSpeaker && !isExplicitGuest && Array.isArray(activeMembersList) && activeMembersList.length > 0) {
          matchedMember = matchMemberExact(idxStr, activeMembersList) || matchMemberExact(cleanName, activeMembersList);
        }

        const finalName = isSupervisor
          ? cleanName
          : (isSpeaker ? cleanName : (matchedMember ? (matchedMember.fullName || `${matchedMember.firstName || ''} ${matchedMember.lastName || ''}`.trim()) : cleanName));
        const finalIndex = isSupervisor ? '' : (isSpeaker ? '[SPEAKER]' : (isExplicitGuest ? '' : (matchedMember?.index || (/^\d+$/.test(cleanName) ? cleanName : ''))));
        const finalRole = isSupervisor ? 'supervisor' : (isSpeaker ? 'speaker' : (isExplicitGuest ? 'Gość' : (item.role || (matchedMember || finalIndex ? 'Członek koła' : 'Gość'))));

        let formattedRawName = finalName;
        if (isSpeaker) {
          formattedRawName = finalName.startsWith('[SPEAKER]') ? finalName : `[SPEAKER]: ${finalName}`;
        } else if (finalRole === 'Gość' || isExplicitGuest) {
          formattedRawName = finalName.startsWith('[GOŚĆ]') ? finalName : `[GOŚĆ]: ${finalName}`;
        } else if (finalIndex && !finalName.includes(finalIndex)) {
          formattedRawName = `${finalName} (${finalIndex})`;
        }

        participants.push({
          id: item.id || `p_sup_${idx}`,
          rawName: formattedRawName,
          fullName: finalName,
          name: finalName,
          index: (isSpeaker || isSupervisor) ? '' : finalIndex,
          nrIndeksu: isSupervisor ? '[OPIEKUN]' : (isSpeaker ? '[SPEAKER]' : finalIndex),
          email: matchedMember?.email || '',
          member: matchedMember || null,
          role: finalRole,
          rola: isSupervisor ? 'Opiekun Koła' : (isSpeaker ? 'speaker' : (finalRole || 'Członek koła')),
          isSupervisor,
          isSpeaker,
          isGuest: isExplicitGuest || (!matchedMember && finalRole === 'Gość'),
          manualApproved: true,
          isEligible: true,
          status: isSupervisor ? 'supervisor' : (isSpeaker ? 'speaker' : 'approved'),
          joinTime: item.meeting_date || '18:00',
          durationStr: '60 min',
          durationMinutes: 60,
        });
      });

      return { ok: true, tabName: 'Supabase (attendance)', participants };
    }
  } catch (err) {
    console.warn('[fetchMeetingAttendanceFromSupabase -> Supabase] Błąd odczytu:', err);
  }

  return {
    ok: false,
    error: 'Brak zapisanych obecności w bazie Supabase dla tego spotkania. Wklej listę z Google Meet i kliknij Przetwórz.',
  };
}

export const fetchMeetingSheetAttendance = fetchMeetingAttendanceFromSupabase;

// ─── 4. EWIDENCJA POCZTY (Supabase Sync: Dziennik_Korespondencji) ────────────

export const MAIL_REGISTRY_TAB = 'Dziennik_Korespondencji (Supabase)';

export async function fetchMailRegistryFromSheet() {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .like('meeting_code', '[KORESPONDENCJA]%');

    if (error) throw error;

    const validEntries = (data || []).map((row, idx) => {
      let item = {};
      try {
        item = JSON.parse(row.activity_description || '{}');
      } catch {}
      const sygnatura = String(item.sygnatura || item.id || row.index_number || `SKN-SEKS/DK/2026/03/${String(idx + 1).padStart(2, '0')}`).trim();
      const dataWplywu = String(item.dataWplywu || item.date || row.meeting_date || new Date().toISOString().slice(0, 10)).trim();
      const isOut = String(item.kierunek || item.direction || item.typ || row.role || '').toUpperCase().includes('OUT') || String(item.typ || '').toLowerCase().includes('wychod');
      const direction = isOut ? 'OUT' : 'IN';

      return {
        id: sygnatura,
        sygnatura,
        date: dataWplywu,
        dataWplywu,
        dataWyslania: String(item.dataWyslania || '').trim(),
        typ: String(item.typ || (isOut ? 'Wychodzące' : 'Wchodzące')).trim(),
        kierunek: direction,
        direction,
        sender: String(item.sender || item.nadawca || '').trim(),
        nadawca: String(item.sender || item.nadawca || '').trim(),
        recipient: String(item.recipient || item.adresat || item.odbiorca || '').trim(),
        adresat: String(item.recipient || item.adresat || item.odbiorca || '').trim(),
        odbiorca: String(item.recipient || item.adresat || item.odbiorca || '').trim(),
        subject: String(item.subject || item.przedmiot || 'Pismo urzędowe').trim(),
        przedmiot: String(item.subject || item.przedmiot || 'Pismo urzędowe').trim(),
        summary: String(item.summary || item.tresc || '').trim(),
        tresc: String(item.summary || item.tresc || '').trim(),
        status: String(item.status || 'Zarejestrowane').trim(),
        driveLink: String(item.driveLink || item.lokalizacjaDrive || '').trim(),
        driveUrl: String(item.driveLink || item.lokalizacjaDrive || '').trim(),
        hash: String(item.hash || `${sygnatura}_${dataWplywu}`),
        fromSheet: 'Supabase_SSOT',
        createdAt: item.createdAt || new Date().toISOString()
      };
    });

    return { ok: true, tabName: MAIL_REGISTRY_TAB, entries: validEntries };
  } catch (err) {
    console.warn('[fetchMailRegistryFromSheet -> Supabase] Błąd:', err);
    return { ok: true, tabName: MAIL_REGISTRY_TAB, entries: [] };
  }
}

export const fetchCorrespondenceFromGAS = fetchMailRegistryFromSheet;
export const fetchDziennikFromGAS = fetchMailRegistryFromSheet;

export function formatCorrespondenceForSheet(entries = []) {
  const headers = ['Sygnatura', 'Data', 'Kierunek', 'Nadawca', 'Odbiorca', 'Temat', 'Streszczenie / Treść', 'Status', 'Hash / Sygnatura cyfrowa'];
  const rows = entries.map(item => [
    item.id || '',
    item.date || '',
    item.direction || 'IN',
    item.sender || '',
    item.recipient || '',
    item.subject || '',
    (item.summary || '').replace(/[\r\n\t]+/g, ' '),
    item.status || 'Zarejestrowane',
    item.hash || '',
  ]);

  const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  return { headers, rows, tsv };
}

export async function registerCorrespondenceToGAS(entry, orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrg(orgId || entry?.orgId);
  const sygnatura = String(entry.sygnatura || entry.id || `SKN/DK/${Date.now()}`).trim();
  const code = `[KORESPONDENCJA] ${sygnatura}`;
  const dateStr = String(entry.dataWplywu || entry.date || new Date().toISOString().slice(0, 10)).split(' ')[0].split('T')[0];
  const isOut = entry.direction === 'OUT' || entry.kierunek === 'OUT' || entry.typ === 'Wychodzące';

  await supabase.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', code);
  const { error } = await supabase.from('attendance').insert([{
    organization_id: cleanOrg,
    meeting_code: code,
    meeting_date: dateStr,
    index_number: sygnatura,
    role: isOut ? 'OUT' : 'IN',
    points: 0,
    activity_description: JSON.stringify(entry)
  }]);
  if (error) throw error;
  return { status: 'success' };
}

export async function batchRegisterCorrespondenceToGAS(entries = [], orgId, onProgress = null) {
  if (!Array.isArray(entries) || entries.length === 0) return { success: true, count: 0, total: 0 };
  let successCount = 0;
  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      await registerCorrespondenceToGAS(entry, orgId);
      successCount++;
      if (onProgress) onProgress({ current: i + 1, total, entry });
    } catch (err) {
      console.warn(`[batchRegisterCorrespondenceToGAS -> Supabase] Błąd zapisu wpisu:`, err);
    }
  }
  return { success: true, count: successCount, total };
}

export async function updateCorrespondenceStatusInGAS(id, status, orgId = null) {
  const code = `[KORESPONDENCJA] ${String(id).trim()}`;
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  let q = supabase.from('attendance').select('*').eq('meeting_code', code);
  if (cleanOrg) q = q.eq('organization_id', cleanOrg);
  const { data } = await q.limit(1);
  if (data && data[0]) {
    let parsed = {};
    try { parsed = JSON.parse(data[0].activity_description || '{}'); } catch {}
    parsed.status = status;
    parsed.dataAktualizacji = new Date().toISOString();
    await supabase.from('attendance').update({
      activity_description: JSON.stringify(parsed)
    }).eq('id', data[0].id);
  }
  return { status: 'success' };
}

export async function deleteCorrespondenceFromGAS(id, orgId = null) {
  const code = `[KORESPONDENCJA] ${String(id).trim()}`;
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  let q = supabase.from('attendance').delete().eq('meeting_code', code);
  if (cleanOrg) q = q.eq('organization_id', cleanOrg);
  await q;
  return { status: 'success' };
}

export async function registerDocumentActToGAS(doc, orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrg(orgId || doc?.orgId);
  const code = `[DOKUMENT] ${String(doc.code || doc.id || Date.now()).trim()}`;
  const dateStr = String(doc.date || new Date().toISOString().slice(0, 10)).split('T')[0];
  await supabase.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', code);
  await supabase.from('attendance').insert([{
    organization_id: cleanOrg,
    meeting_code: code,
    meeting_date: dateStr,
    index_number: String(doc.code || doc.id || 'DOK'),
    role: String(doc.category || 'Uchwały Zarządu'),
    points: 0,
    activity_description: JSON.stringify(doc)
  }]);
  return { status: 'success' };
}

export async function batchRegisterDocumentActsToGAS(documents = [], orgId, onProgress = null) {
  if (!Array.isArray(documents) || documents.length === 0) return { success: true, count: 0, total: 0 };
  let successCount = 0;
  const total = documents.length;
  for (let i = 0; i < documents.length; i++) {
    try {
      await registerDocumentActToGAS(documents[i], orgId);
      successCount++;
      if (onProgress) onProgress({ current: i + 1, total, doc: documents[i] });
    } catch {}
  }
  return { success: true, count: successCount, total };
}

export async function deleteDocumentActFromGAS(codeOrId, orgId = null) {
  const code = `[DOKUMENT] ${String(codeOrId).trim()}`;
  const cleanOrg = orgId ? normalizeOrg(orgId) : (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null);
  let q = supabase.from('attendance').delete().eq('meeting_code', code);
  if (cleanOrg) q = q.eq('organization_id', cleanOrg);
  await q;
  return { status: 'success' };
}

export function extractGoogleDriveFolderId(input) {
  if (!input) return '';
  const str = String(input).trim();
  const match = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return str;
}

export async function saveSnapshotToDriveGAS({ folderId = '' }) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `Migawka_SKN_${dateStr}_${timeStr}.json`;
  const cleanFolderId = extractGoogleDriveFolderId(folderId);
  const folderUrl = folderId ? (folderId.startsWith('http') ? folderId : `https://drive.google.com/drive/folders/${cleanFolderId}`) : '';

  return {
    status: 'success',
    fileId: `supabase_snap_${Date.now()}`,
    fileName,
    url: folderUrl
  };
}
