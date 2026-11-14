import { getCanonicalMeetingsForOrg } from './canonicalMeetings.js';
import {
  saveEmailConfigToDB,
  fetchOrgFullSupabaseData,
  restoreOrgFullSupabaseData,
  fetchMasterSupabaseData,
  restoreMasterSupabaseData,
  deduplicateBoard,
  deduplicateSupervisors,
  normalizeOrgId,
} from '../services/settingsService.js';

// ─── Multi-Tenant Workspace Storage Engine ─────────────────────────────────
// Ensures complete data isolation between different Student Science Clubs (KN).

/**
 * Automatically purges legacy and unscoped global storage cache to prevent cross-tenant state pollution
 */
export function purgeLegacyStorageCache() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const legacyPrefixes = [
      'crm_psychoonkologia_',
      'crm_seksuologia_',
      'crm_org_',
      'skn_seks_',
      'skn_psycho_',
      'crm_skn_test_',
      'crm_attendance_',
    ];
    const unscopedGlobalKeys = [
      'skn_board_tenures',
      'crm_board_tenures',
      'CACHE_APP_STATE_SNAPSHOT',
      'CACHE_APP_STATE_SNAPSHOT_skn-template',
      'skn_supervisors_config',
      'crm_point_weights',
      'crm_attendance_config',
      'skn_attendance_config',
      'crm_drive_folder_url',
      'skn_drive_folder_url',
      'skn_settings_config',
      'crm_meeting_types',
      'crm_meet_aliases',
      'crm_members',
      'crm_czlonkowie',
      'crm_dorobek',
      'crm_ewidencja',
    ];
    unscopedGlobalKeys.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && legacyPrefixes.some(p => k.startsWith(p))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn('[Storage] Legacy cache cleanup warning:', err);
  }
}

// Run legacy purge on module load
purgeLegacyStorageCache();

/**
 * Returns a standardized, isolated localStorage key for a specific organization.
 * @param {string} orgId - Unique organization slug/identifier (e.g. 'skn-template')
 * @param {string} baseKey - Logical resource key (e.g. 'members', 'attendance_M01', 'custom_overrides')
 * @returns {string} Fully qualified namespaced key: `crm_skn_${orgId}_${baseKey}`
 */
export function getOrgKey(orgId = 'skn_seksuologii', baseKey = '') {
  let cleanOrgId = String(orgId || 'skn_seksuologii').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (cleanOrgId === 'skn_template' || cleanOrgId === 'default') {
    cleanOrgId = 'skn_seksuologii';
  }
  const cleanBaseKey = String(baseKey || '').trim();
  
  return `crm_skn_${cleanOrgId}_${cleanBaseKey}`;
}

/**
 * Generates all isolated localStorage keys for a specific meeting within a given organization.
 * Ensures 100% isolation between scientific circles even when meeting codes (e.g. M01, M02) are identical.
 */
export function getMeetingAttendanceStorageKeys(orgId = 'skn_seksuologii', meeting = {}) {
  if (!meeting) return [];
  let cleanOrgId = String(orgId || meeting.organization_id || meeting.orgId || 'skn_seksuologii')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  if (cleanOrgId === 'skn_template' || cleanOrgId === 'default') {
    cleanOrgId = 'skn_seksuologii';
  }

  const mId = meeting.id ? String(meeting.id).trim() : '';
  const rawDate = meeting.date || meeting.meetingDate || (meeting.start_dt ? String(meeting.start_dt).split('T')[0] : '') || meeting.data || '';
  const mDate = String(rawDate).trim();
  const mCode = meeting.code || meeting.meetingCode ? String(meeting.code || meeting.meetingCode).trim() : '';
  const cleanCode = mCode.replace(/^\[.*?\]\s*/, '').trim();
  const noBracketsCode = mCode.replace(/[\[\]]/g, '').trim();

  const keys = new Set();
  const addOrgScoped = (suffix) => {
    if (!suffix) return;
    keys.add(getOrgKey(cleanOrgId, `crm_attendance_${cleanOrgId}_${suffix}`));
    keys.add(getOrgKey(cleanOrgId, `crm_attendance_${suffix}`));
  };

  addOrgScoped(mId);
  addOrgScoped(mDate);
  addOrgScoped(mCode);
  if (noBracketsCode && noBracketsCode !== mCode) {
    addOrgScoped(noBracketsCode);
    addOrgScoped(`[${noBracketsCode.replace(/\s+(M\d+)/i, '] $1')}`);
  }
  if (cleanCode && cleanCode !== mCode) {
    addOrgScoped(cleanCode);
  }

  return Array.from(keys);
}

/**
 * Reads data from localStorage for a specific organization.
 */
export function getOrgStorage(orgId, baseKey, defaultValue = null) {
  if (typeof window === 'undefined') return defaultValue;
  
  const orgKey = getOrgKey(orgId, baseKey);
  
  try {
    const raw = localStorage.getItem(orgKey);
    if (raw !== null) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
  } catch (err) {
    console.warn(`[Storage] Error reading ${orgKey}:`, err);
  }
  
  return defaultValue;
}

/**
 * Writes data to localStorage for a specific organization.
 */
export function setOrgStorage(orgId, baseKey, value) {
  if (typeof window === 'undefined') return;
  
  const orgKey = getOrgKey(orgId, baseKey);
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(orgKey, serialized);
  } catch (err) {
    console.error(`[Storage] Error writing ${orgKey}:`, err);
  }
}

/**
 * Removes data from localStorage for a specific organization.
 */
export function removeOrgStorage(orgId, baseKey) {
  if (typeof window === 'undefined') return;
  
  const orgKey = getOrgKey(orgId, baseKey);
  try {
    localStorage.removeItem(orgKey);
  } catch (err) {
    console.error(`[Storage] Error removing ${orgKey}:`, err);
  }
}

/**
 * Clears all stored data belonging to a specific organization workspace.
 */
export function clearOrgWorkspace(orgId) {
  if (typeof window === 'undefined' || !orgId) return;
  
  const prefix = `crm_skn_${String(orgId).trim().toLowerCase()}_`;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.error(`[Storage] Error clearing workspace ${orgId}:`, err);
  }
}

/**
 * Restores canonical meeting and attendance data if needed
 */
export function restoreLegacyMeetingData(orgId = 'skn-template') {
  if (typeof window === 'undefined' || !orgId) return;

  const cleanId = String(orgId).trim().toLowerCase();
  const targetMeetingsKey = getOrgKey(cleanId, 'meetings');

  try {
    const existingRaw = localStorage.getItem(targetMeetingsKey);
    let currentMeetings = [];
    if (existingRaw) {
      try { currentMeetings = JSON.parse(existingRaw); } catch {}
    }

    if (!Array.isArray(currentMeetings) || currentMeetings.length === 0) {
      currentMeetings = getCanonicalMeetingsForOrg(cleanId);
      if (Array.isArray(currentMeetings) && currentMeetings.length > 0) {
        localStorage.setItem(targetMeetingsKey, JSON.stringify(currentMeetings));
      }
    }
  } catch (err) {
    console.warn('[Storage Migration] Error in restoreLegacyMeetingData:', err);
  }
}

// ─── BACKUP & RECOVERY SUITE (Single Org & Master SuperAdmin) ───────────────

/**
 * Utility helper to trigger browser download of a JSON object as a file.
 */
export function downloadJSONFile(filename, dataObj) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const jsonStr = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Backup Download Error]', err);
  }
}

/**
 * Exports isolated workspace backup for a specific organization with Supabase SSOT snapshot.
 */
export async function exportOrgBackup(orgId, author = 'Admin') {
  if (typeof window === 'undefined' || !orgId) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const prefix = `crm_skn_${cleanId}_`;

  const orgData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      try {
        orgData[k] = JSON.parse(localStorage.getItem(k));
      } catch {
        orgData[k] = localStorage.getItem(k);
      }
    }
  }

  // Pobranie pełnego zrzutu danych z bazy Supabase SSOT
  let supabaseData = null;
  try {
    supabaseData = await fetchOrgFullSupabaseData(cleanId);
  } catch (err) {
    console.warn('[exportOrgBackup] Błąd pobierania danych Supabase:', err);
  }

  const payload = {
    version: '3.0.0-supabase-ssot',
    type: 'ORG_BACKUP',
    orgId: cleanId,
    exportedAt: new Date().toISOString(),
    exportedBy: author,
    totalKeys: Object.keys(orgData).length,
    data: orgData,
    supabase: supabaseData,
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  downloadJSONFile(`${cleanId}_backup_${dateStr}.json`, payload);
  return payload;
}

/**
 * Validates and imports organization backup, restoring both localStorage and Supabase SSOT.
 */
export async function importOrgBackup(targetOrgId, jsonInput) {
  if (typeof window === 'undefined' || !targetOrgId) {
    throw new Error('Środowisko nie obsługuje localStorage lub nie podano ID koła.');
  }
  const cleanTargetId = String(targetOrgId).trim().toLowerCase();

  let backup;
  try {
    backup = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
  } catch (e) {
    throw new Error('Nieprawidłowy format JSON pliku kopii zapasowej.');
  }

  if (!backup || typeof backup !== 'object') {
    throw new Error('Struktura pliku jest pusta lub nieprawidłowa.');
  }

  const rawData = backup.data || backup;
  if (!rawData || typeof rawData !== 'object' || Object.keys(rawData).length === 0) {
    throw new Error('Plik kopii zapasowej nie zawiera żadnych danych rejestru koła.');
  }

  // Create safety auto-snapshot before restoring
  try {
    await createOrgSnapshot(cleanTargetId, 'Przed przywróceniem z pliku');
  } catch (e) {
    console.warn('[Backup] Nie udało się utworzyć migawki przed importem:', e);
  }

  // 1. Clear existing keys for target organization
  clearOrgWorkspace(cleanTargetId);

  // 2. Restore keys, ensuring they are mapped to targetOrgId
  let restoredCount = 0;
  const targetPrefix = `crm_skn_${cleanTargetId}_`;

  Object.keys(rawData).forEach((origKey) => {
    let newKey = origKey;
    if (origKey.startsWith('crm_skn_') || origKey.startsWith('crm_psychoonkologia_') || origKey.startsWith('crm_org_')) {
      const parts = origKey.split('_');
      const baseKey = parts.slice(3).join('_');
      newKey = `${targetPrefix}${baseKey}`;
    } else {
      newKey = `${targetPrefix}${origKey}`;
    }

    const value = rawData[origKey];
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(newKey, serialized);
      restoredCount++;
    } catch (err) {
      console.error(`[Backup Restore] Błąd zapisu klucza ${newKey}:`, err);
    }
  });

  // 3. Jeśli kopia zawiera zrzut tabel Supabase, przywróć je bezpośrednio w bazie
  let supabaseResult = null;
  if (backup.supabase && typeof backup.supabase === 'object') {
    try {
      supabaseResult = await restoreOrgFullSupabaseData(cleanTargetId, backup.supabase);
    } catch (err) {
      console.warn('[importOrgBackup] Błąd przywracania danych w Supabase:', err);
    }
  }

  return {
    success: true,
    targetOrgId: cleanTargetId,
    keysRestored: restoredCount,
    supabaseRestored: supabaseResult?.results,
    timestamp: new Date().toISOString(),
  };
}

/**
 * SuperAdmin Master Backup: Exports all organizations and global settings with complete Supabase DB dump.
 */
export async function exportMasterBackup(author = 'SuperAdmin') {
  if (typeof window === 'undefined') return null;

  const masterData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('crm_')) {
      try {
        const val = localStorage.getItem(k);
        masterData[k] = JSON.parse(val);
      } catch {
        masterData[k] = localStorage.getItem(k);
      }
    }
  }

  let supabaseMaster = null;
  try {
    supabaseMaster = await fetchMasterSupabaseData();
  } catch (err) {
    console.warn('[exportMasterBackup] Błąd pobierania Master Supabase:', err);
  }

  const payload = {
    version: '3.0.0-supabase-ssot',
    type: 'MASTER_CRM_BACKUP',
    exportedAt: new Date().toISOString(),
    exportedBy: author,
    totalKeys: Object.keys(masterData).length,
    data: masterData,
    supabase: supabaseMaster,
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  downloadJSONFile(`MASTER_CRM_SUPABASE_BACKUP_${dateStr}.json`, payload);
  return payload;
}

/**
 * SuperAdmin Master Restore: Imports all organizations and restores Supabase tables.
 */
export async function importMasterBackup(jsonInput) {
  if (typeof window === 'undefined') {
    throw new Error('Środowisko nie obsługuje localStorage.');
  }

  let backup;
  try {
    backup = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
  } catch (e) {
    throw new Error('Nieprawidłowy format JSON pliku Master Backup.');
  }

  if (!backup || typeof backup !== 'object') {
    throw new Error('Plik Master Backup jest pusty lub uszkodzony.');
  }

  const rawData = backup.data || backup;
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Brak danych w pliku Master Backup.');
  }

  let restoredCount = 0;
  Object.keys(rawData).forEach((key) => {
    if (key.startsWith('crm_')) {
      const val = rawData[key];
      try {
        const serialized = typeof val === 'string' ? val : JSON.stringify(val);
        localStorage.setItem(key, serialized);
        restoredCount++;
      } catch (err) {
        console.error(`[Master Restore] Błąd zapisu ${key}:`, err);
      }
    }
  });

  // Przywrócenie całego schematu Supabase
  let supabaseStats = null;
  if (backup.supabase && typeof backup.supabase === 'object') {
    try {
      const res = await restoreMasterSupabaseData(backup.supabase);
      supabaseStats = res.stats;
    } catch (err) {
      console.warn('[importMasterBackup] Błąd przywracania bazy Supabase:', err);
    }
  }

  return {
    success: true,
    keysRestored: restoredCount,
    supabaseStats,
    timestamp: new Date().toISOString(),
  };
}

// ─── LOCAL AUTO-SNAPSHOTS & RESTORE POINT (ROLLBACK) ───────────────────────

const MAX_SNAPSHOTS_PER_ORG = 1;

/**
 * Usuwa wszystkie istniejące migawki (crm_snap_*) z localStorage.
 */
export function clearAllSnapshots() {
  if (typeof window === 'undefined') return;
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('crm_snap_')) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch (err) {
    console.warn('[Clear Snapshots Error]', err);
  }
}

/**
 * Czyści stare i nadmiarowe migawki ze wszystkich organizacji w localStorage.
 */
export function pruneAllOldSnapshots(maxKeep = 0) {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('crm_snap_') || (k.includes('_snap_') && !k.endsWith('_snapshots_meta')))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch (err) {
    console.warn('[Prune Heavy Snapshots Error]', err);
  }
}

// Wywołaj automatyczne wyczyszczenie ciężkich starych migawek z pamięci przeglądarki przy starcie
if (typeof window !== 'undefined') {
  setTimeout(() => pruneAllOldSnapshots(0), 100);
}

/**
 * Tworzy hermetyczną migawkę stanu koła opartą na Supabase SSOT oraz rejestrze workspace.
 * Zapisuje pełne dane punktu przywracania stanu z możliwością natychmiastowego przywrócenia lub pobrania JSON.
 */
export async function createOrgSnapshot(orgId, reason = 'Automatyczna migawka') {
  if (typeof window === 'undefined' || !orgId) return null;
  const cleanId = normalizeOrgId(orgId);
  const prefix = `crm_skn_${cleanId}_`;
  const boardKey = `skn_board_tenures_${cleanId}`;
  const usersKey = `skn_access_users_${cleanId}`;
  const dorobekKey = `crm_dorobek_${cleanId}`;

  const snapshotData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const isOrgKey = k.startsWith(prefix) || k === boardKey || k === usersKey || k === dorobekKey;
    if (isOrgKey) {
      if (k.includes('_snap_content_') || k.includes('_snapshots_meta') || k.includes('_backup_')) continue;
      try {
        let parsed = JSON.parse(localStorage.getItem(k));
        if (k.includes('board_tenures') && Array.isArray(parsed)) {
          parsed = deduplicateBoard(parsed, cleanId);
        } else if (k.includes('supervisors') && Array.isArray(parsed)) {
          parsed = deduplicateSupervisors(parsed, cleanId);
        }
        snapshotData[k] = parsed;
      } catch {
        snapshotData[k] = localStorage.getItem(k);
      }
    }
  }

  // Pobranie zrzutu tabel z Supabase SSOT
  let supabaseData = null;
  try {
    supabaseData = await fetchOrgFullSupabaseData(cleanId);
    if (supabaseData && Array.isArray(supabaseData.organization_settings)) {
      supabaseData.organization_settings = supabaseData.organization_settings.map(row => {
        if (row.settings && typeof row.settings === 'object') {
          const cleanSettings = { ...row.settings };
          if (Array.isArray(cleanSettings.board)) {
            cleanSettings.board = deduplicateBoard(cleanSettings.board, cleanId);
          }
          if (Array.isArray(cleanSettings.supervisors)) {
            cleanSettings.supervisors = deduplicateSupervisors(cleanSettings.supervisors, cleanId);
          }
          return { ...row, settings: cleanSettings };
        }
        return row;
      });
    }
  } catch (err) {
    console.warn('[createOrgSnapshot] Pobranie zrzutu Supabase:', err);
  }

  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const snapshotKey = `snap_${now}_${rand}`;

  const dateObj = new Date(now);
  const dateStr = dateObj.toISOString().slice(0, 10);
  const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}-${String(dateObj.getMinutes()).padStart(2, '0')}`;
  const defaultFileName = `Migawka_${cleanId.toUpperCase()}_${dateStr}_${timeStr}.json`;

  const fullPayload = {
    key: snapshotKey,
    id: snapshotKey,
    orgId: cleanId,
    timestamp: now,
    isoDate: dateObj.toISOString(),
    formattedDate: dateObj.toLocaleString('pl-PL'),
    reason,
    keysCount: Object.keys(snapshotData).length,
    fileName: defaultFileName,
    data: snapshotData,
    supabase: supabaseData,
  };

  // Zapisz pełny zrzut migawki pod dedykowanym kluczem
  const contentKey = `crm_skn_${cleanId}_snap_content_${snapshotKey}`;
  try {
    localStorage.setItem(contentKey, JSON.stringify(fullPayload));
  } catch (e) {
    console.warn('[createOrgSnapshot] Pominięto lokalny zapis ciężkiego payloadu migawki:', e);
  }

  const metaItem = {
    key: snapshotKey,
    id: snapshotKey,
    orgId: cleanId,
    timestamp: now,
    isoDate: dateObj.toISOString(),
    formattedDate: dateObj.toLocaleString('pl-PL'),
    reason,
    keysCount: Object.keys(snapshotData).length,
    fileName: defaultFileName,
  };

  // Zapisz listę metadanych (maks. 5 ostatnich migawek)
  const metaKey = `crm_skn_${cleanId}_snapshots_meta`;
  let existingList = [];
  try {
    const raw = localStorage.getItem(metaKey);
    if (raw) existingList = JSON.parse(raw);
    if (!Array.isArray(existingList)) existingList = [];
  } catch {
    existingList = [];
  }

  existingList = existingList.filter(item => item.key !== snapshotKey);
  existingList.unshift(metaItem);
  const updatedList = existingList.slice(0, 5);

  try {
    localStorage.setItem(metaKey, JSON.stringify(updatedList));
  } catch (e) {
    console.warn('[createOrgSnapshot] Błąd zapisu metadanych migawki:', e);
  }

  return metaItem;
}

/**
 * Zwraca lekką listę metadanych migawek dla wybranego koła (najnowsze na początku).
 */
export function getOrgSnapshots(orgId) {
  if (typeof window === 'undefined' || !orgId) return [];
  const cleanId = String(orgId).trim().toLowerCase();
  const metaKey = `crm_skn_${cleanId}_snapshots_meta`;

  try {
    const raw = localStorage.getItem(metaKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => b.timestamp - a.timestamp);
      }
    }
  } catch {}

  return [];
}

/**
 * Pobiera plik JSON wybranej migawki na dysk komputera.
 */
export function downloadOrgSnapshotFile(orgId, snapshotKey) {
  if (typeof window === 'undefined' || !orgId || !snapshotKey) return;
  const cleanId = String(orgId).trim().toLowerCase();
  const contentKey = `crm_skn_${cleanId}_snap_content_${snapshotKey}`;

  let payload = null;
  try {
    const raw = localStorage.getItem(contentKey);
    if (raw) payload = JSON.parse(raw);
  } catch {}

  if (!payload) {
    payload = {
      key: snapshotKey,
      orgId: cleanId,
      timestamp: Date.now(),
      data: {},
    };
  }

  downloadJSONFile(payload.fileName || `Migawka_${cleanId}_${snapshotKey}.json`, payload);
}

/**
 * Przywraca stan aplikacji i bazy Supabase z wybranej migawki.
 */
export async function restoreOrgSnapshot(orgId, snapshotObjOrKey) {
  if (typeof window === 'undefined' || !orgId) {
    throw new Error('Brak wymaganych parametrów do przywrócenia migawki.');
  }
  const cleanId = normalizeOrgId(orgId);

  let snapshot = null;
  const key = typeof snapshotObjOrKey === 'object' ? snapshotObjOrKey?.key || snapshotObjOrKey?.id : snapshotObjOrKey;

  if (key) {
    const contentKey = `crm_skn_${cleanId}_snap_content_${key}`;
    try {
      const raw = localStorage.getItem(contentKey);
      if (raw) snapshot = JSON.parse(raw);
    } catch {}
  }

  if (!snapshot && typeof snapshotObjOrKey === 'object' && snapshotObjOrKey !== null) {
    snapshot = snapshotObjOrKey;
  }

  if (!snapshot || (!snapshot.data && !snapshot.supabase)) {
    throw new Error('Nie znaleziono zawartości wybranej migawki w pamięci lokalnej. Skorzystaj z opcji „Przywróć z pliku”.');
  }

  // Walidacja przynależności migawki do aktualnego koła (blokada cross-tenant restore)
  if (snapshot.orgId && normalizeOrgId(snapshot.orgId) !== cleanId) {
    throw new Error(`Migawka należy do koła "${snapshot.orgId}", a nie do "${cleanId}". Przywrócenie zostało zablokowane.`);
  }

  // 1. Wyczyszczenie i odtworzenie localStorage z twardą deduplikacją
  if (snapshot.data && typeof snapshot.data === 'object') {
    clearOrgWorkspace(cleanId);
    let restored = 0;
    const expectedPrefix = `crm_skn_${cleanId}_`;
    Object.keys(snapshot.data).forEach((k) => {
      try {
        // Ignoruj klucze należące do obcych organizacji
        if (k.startsWith('crm_skn_') && !k.startsWith(expectedPrefix)) return;
        if (k.startsWith('skn_board_tenures_') && k !== `skn_board_tenures_${cleanId}`) return;

        const val = snapshot.data[k];
        if (k && k.includes('board_tenures')) {
          let list = typeof val === 'string' ? JSON.parse(val) : val;
          if (Array.isArray(list)) {
            const cleanList = deduplicateBoard(list, cleanId);
            localStorage.setItem(k, JSON.stringify(cleanList));
            restored++;
            return;
          }
        }
        if (k && k.includes('supervisors')) {
          let list = typeof val === 'string' ? JSON.parse(val) : val;
          if (Array.isArray(list)) {
            const cleanList = deduplicateSupervisors(list, cleanId);
            localStorage.setItem(k, JSON.stringify(cleanList));
            restored++;
            return;
          }
        }
        localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
        restored++;
      } catch (e) {
        console.error(`[Snapshot Restore] Błąd przywracania ${k}:`, e);
      }
    });
  }

  // 2. Przywrócenie danych w Supabase SSOT (z deduplikacją przed zapisem)
  let supabaseRestored = null;
  if (snapshot.supabase && typeof snapshot.supabase === 'object') {
    try {
      const sanitizedSupabase = { ...snapshot.supabase };
      if (Array.isArray(sanitizedSupabase.organization_settings)) {
        sanitizedSupabase.organization_settings = sanitizedSupabase.organization_settings.map(row => {
          if (row.settings && typeof row.settings === 'object') {
            const cleanSettings = { ...row.settings };
            if (Array.isArray(cleanSettings.board)) {
              cleanSettings.board = deduplicateBoard(cleanSettings.board, cleanId);
            }
            if (Array.isArray(cleanSettings.supervisors)) {
              cleanSettings.supervisors = deduplicateSupervisors(cleanSettings.supervisors, cleanId);
            }
            return { ...row, settings: cleanSettings, organization_id: cleanId };
          }
          return { ...row, organization_id: cleanId };
        });
      }
      supabaseRestored = await restoreOrgFullSupabaseData(cleanId, sanitizedSupabase);
    } catch (e) {
      console.warn('[Snapshot Restore] Błąd przywracania Supabase:', e);
    }
  }

  return {
    success: true,
    keysRestored: snapshot.data ? Object.keys(snapshot.data).length : 0,
    supabaseRestored: supabaseRestored?.results,
    snapshotDate: snapshot.formattedDate || new Date().toLocaleString('pl-PL'),
  };
}

/**
 * Usuwa metadane wybranej migawki.
 */
export function deleteOrgSnapshot(snapshotKey, orgId) {
  if (typeof window === 'undefined' || !snapshotKey) return;
  const cleanId = orgId ? String(orgId).trim().toLowerCase() : '';
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith('_snapshots_meta')) {
        if (cleanId && !k.includes(`_${cleanId}_`)) continue;
        try {
          const list = JSON.parse(localStorage.getItem(k));
          if (Array.isArray(list)) {
            const filtered = list.filter(item => item.key !== snapshotKey && item.id !== snapshotKey);
            localStorage.setItem(k, JSON.stringify(filtered));
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error('[Snapshot Delete Error]', err);
  }
}

/**
 * Hard Rollback to Canonical Baseline: Restores verified canonical state
 * for meetings, supervisors, and baseline settings for the organization.
 */
export function restoreStableBaseline(orgId) {
  if (typeof window === 'undefined' || !orgId) return;
  const cleanId = String(orgId).trim().toLowerCase();

  // Create backup snapshot before baseline reset
  try {
    createOrgSnapshot(cleanId, 'Przed przywróceniem stanu bazowego (Rollback)');
  } catch {}

  // 1. Restore canonical meetings & verified attendances
  restoreLegacyMeetingData(cleanId);

  // 2. Remove corrupted/inconsistent override keys
  removeOrgStorage(cleanId, 'custom_meeting_types');

  return {
    success: true,
    orgId: cleanId,
    timestamp: new Date().toISOString(),
  };
}

// ─── OFFICIAL ISSUED DOCUMENTS REGISTRY (Ewidencja Wydanych Aktów) ───────────

export const DEFAULT_ISSUED_REGISTRY = {};

/**
 * Returns list of issued certificates and documents for an organization.
 */
export function getIssuedDocumentsRegistry(orgId) {
  if (typeof window === 'undefined' || !orgId) return [];
  const cleanId = String(orgId).trim().toLowerCase();
  const defaultList = DEFAULT_ISSUED_REGISTRY[cleanId] || [];

  const stored = getOrgStorage(cleanId, 'issued_documents_registry', null);
  if (stored && Array.isArray(stored)) {
    return stored;
  }

  // First time initialization with defaults
  if (defaultList.length > 0) {
    setOrgStorage(cleanId, 'issued_documents_registry', defaultList);
    return defaultList;
  }

  return [];
}

/**
 * Appends a newly issued document to the organization's registry if not already present.
 */
export function addIssuedDocument(orgId, docEntry) {
  if (typeof window === 'undefined' || !orgId || !docEntry || !docEntry.id) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getIssuedDocumentsRegistry(cleanId);

  // Check if exists by ID
  const existingIdx = current.findIndex(d => d.id === docEntry.id);
  let updated;
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...updated[existingIdx], ...docEntry, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...docEntry, createdAt: docEntry.createdAt || new Date().toISOString() }, ...current];
  }

  setOrgStorage(cleanId, 'issued_documents_registry', updated);
  return updated;
}

/**
 * Updates an existing entry in the organization's registry.
 */
export function updateIssuedDocument(orgId, docId, updatedFields) {
  if (typeof window === 'undefined' || !orgId || !docId) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getIssuedDocumentsRegistry(cleanId);

  const updated = current.map(doc => {
    if (doc.id !== docId) return doc;
    return {
      ...doc,
      ...updatedFields,
      updatedAt: new Date().toISOString(),
    };
  });

  setOrgStorage(cleanId, 'issued_documents_registry', updated);
  return updated;
}

/**
 * Deletes a document entry from the registry.
 */
export function deleteIssuedDocument(orgId, docId) {
  if (typeof window === 'undefined' || !orgId || !docId) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getIssuedDocumentsRegistry(cleanId);

  const updated = current.filter(d => d.id !== docId);
  setOrgStorage(cleanId, 'issued_documents_registry', updated);
  return updated;
}

// ─── ELECTRONIC CORRESPONDENCE LOG (Dziennik Podawczy & Kancelaria) ──────────

export const DEFAULT_CORRESPONDENCE_LOG = {
  'skn_seksuologii': [
    {
      id: 'SKN-SEKS/DK/2026/03/01',
      sygnatura: 'SKN-SEKS/DK/2026/03/01',
      date: '2026-03-17',
      dataWplywu: '2026-03-17',
      direction: 'IN',
      typ: 'Wchodzące',
      kierunek: 'IN',
      sender: 'mgr Martyna Dziekan (Opiekun Naukowy SKN)',
      nadawca: 'mgr Martyna Dziekan (Opiekun Naukowy SKN)',
      recipient: 'Zarząd Koła Naukowego Seksuologii',
      adresat: 'Zarząd Koła Naukowego Seksuologii',
      subject: 'Aneks jakościowy do raportu Koła',
      przedmiot: 'Aneks jakościowy do raportu Koła',
      summary: 'Aneks jakościowy do raportu Koła Naukowego Seksuologii za I semestr roku akademickiego 2025/2026.',
      tresc: 'Aneks jakościowy do raportu Koła Naukowego Seksuologii za I semestr roku akademickiego 2025/2026.',
      status: 'W toku',
      driveLink: '',
      driveUrl: '',
      hash: 'SKN-SEKS/DK/2026/03/01_2026-03-17',
      dataAktualizacji: '2026-09-20 11:10',
      createdAt: '2026-09-20T11:10:00.000Z',
      updatedAt: '2026-09-20T11:10:00.000Z',
    },
  ],
  'skn-seksuologia': [
    {
      id: 'SKN-SEKS/DK/2026/03/01',
      sygnatura: 'SKN-SEKS/DK/2026/03/01',
      date: '2026-03-17',
      dataWplywu: '2026-03-17',
      direction: 'IN',
      typ: 'Wchodzące',
      kierunek: 'IN',
      sender: 'mgr Martyna Dziekan (Opiekun Naukowy SKN)',
      nadawca: 'mgr Martyna Dziekan (Opiekun Naukowy SKN)',
      recipient: 'Zarząd Koła Naukowego Seksuologii',
      adresat: 'Zarząd Koła Naukowego Seksuologii',
      subject: 'Aneks jakościowy do raportu Koła',
      przedmiot: 'Aneks jakościowy do raportu Koła',
      summary: 'Aneks jakościowy do raportu Koła Naukowego Seksuologii za I semestr roku akademickiego 2025/2026.',
      tresc: 'Aneks jakościowy do raportu Koła Naukowego Seksuologii za I semestr roku akademickiego 2025/2026.',
      status: 'W toku',
      driveLink: '',
      driveUrl: '',
      hash: 'SKN-SEKS/DK/2026/03/01_2026-03-17',
      dataAktualizacji: '2026-09-20 11:10',
      createdAt: '2026-09-20T11:10:00.000Z',
      updatedAt: '2026-09-20T11:10:00.000Z',
    },
  ],
};

/**
 * Filtruje i czyści listę wpisów kancelarii z obcych rekordów (np. błędnie zaciągniętych zgłoszeń rekrutacyjnych).
 */
export function sanitizeCorrespondenceEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(item => {
    if (!item) return false;
    const sygnatura = String(item.id || item.sygnatura || '').trim();
    if (!sygnatura) return false;
    
    // Odrzuć pozycje posiadające sygnaturę ze znacznikiem Date(...) lub adresem e-mail
    if (sygnatura.startsWith('Date(') || sygnatura.includes('@')) return false;
    
    // Odrzuć wiersze ze zgłoszeń gdzie nadawcą jest adres e-mail i brak typowej sygnatury koła
    const sender = String(item.sender || item.nadawca || '').trim();
    if (sender.includes('@') && !sygnatura.includes('/') && !sygnatura.startsWith('SKN') && !sygnatura.startsWith('KANC')) return false;
    
    return true;
  });
}

// Czyszczenie obcych danych kancelaryjnych w pamięci przeglądarki przy starcie
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.endsWith('_correspondence_log')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const clean = sanitizeCorrespondenceEntries(parsed);
              if (clean.length !== parsed.length) {
                localStorage.setItem(k, JSON.stringify(clean.length > 0 ? clean : (DEFAULT_CORRESPONDENCE_LOG['skn-seksuologia'] || [])));
              }
            }
          }
        }
      }
    } catch {}
  }, 150);
}

/**
 * Returns correspondence log records for an organization with automatic sanitization.
 */
export function getCorrespondenceLog(orgId) {
  if (typeof window === 'undefined' || !orgId) return [];
  const cleanId = String(orgId).trim().toLowerCase();
  const defaultList = DEFAULT_CORRESPONDENCE_LOG[cleanId] || [];

  const stored = getOrgStorage(cleanId, 'correspondence_log', null);
  if (stored && Array.isArray(stored)) {
    const sanitized = sanitizeCorrespondenceEntries(stored);
    // Jeśli usunięto obce rekordy (np. zgłoszenia z Date(...)), natychmiast uaktualnij localStorage
    if (sanitized.length !== stored.length) {
      const finalList = sanitized.length > 0 ? sanitized : defaultList;
      setOrgStorage(cleanId, 'correspondence_log', finalList);
      return finalList;
    }
    if (sanitized.length > 0) return sanitized;
  }

  // Initialize with defaults if empty
  if (defaultList.length > 0) {
    setOrgStorage(cleanId, 'correspondence_log', defaultList);
    return defaultList;
  }

  return [];
}

/**
 * Adds a new entry into the organization's correspondence log.
 */
export function addCorrespondenceEntry(orgId, entry) {
  if (typeof window === 'undefined' || !orgId || !entry || !entry.id) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getCorrespondenceLog(cleanId);

  const existingIdx = current.findIndex(d => d.id === entry.id);
  let updated;
  const now = new Date();
  const nowFormatted = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = {
      ...current[existingIdx],
      ...entry,
      date: entry.date || current[existingIdx].date,
      dataWplywu: entry.date || current[existingIdx].dataWplywu || current[existingIdx].date,
      dataAktualizacji: nowFormatted,
      updatedAt: now.toISOString(),
    };
  } else {
    updated = [
      {
        ...entry,
        date: entry.date,
        dataWplywu: entry.date,
        dataAktualizacji: nowFormatted,
        createdAt: entry.createdAt || now.toISOString(),
        updatedAt: now.toISOString(),
      },
      ...current
    ];
  }

  setOrgStorage(cleanId, 'correspondence_log', updated);
  return updated;
}

/**
 * Updates an existing entry in the correspondence log.
 */
export function updateCorrespondenceEntry(orgId, entryId, updatedFields) {
  if (typeof window === 'undefined' || !orgId || !entryId) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getCorrespondenceLog(cleanId);

  const updated = current.map(d => {
    if (d.id === entryId) {
      return { ...d, ...updatedFields, updatedAt: new Date().toISOString() };
    }
    return d;
  });

  setOrgStorage(cleanId, 'correspondence_log', updated);
  return updated;
}

/**
 * Deletes an entry from the correspondence log.
 */
export function deleteCorrespondenceEntry(orgId, entryId) {
  if (typeof window === 'undefined' || !orgId || !entryId) return [];
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getCorrespondenceLog(cleanId);

  const updated = current.filter(d => d.id !== entryId);
  setOrgStorage(cleanId, 'correspondence_log', updated);
  return updated;
}

/**
 * Retrieves the saved protocol for a specific meeting.
 */
export function getMeetingProtocol(orgId, meetingId) {
  if (typeof window === 'undefined' || !orgId || !meetingId) return null;
  const cleanOrgId = String(orgId).trim().toLowerCase();
  const cleanMeetingId = String(meetingId).trim().replace(/[\[\]]/g, '');
  return getOrgStorage(cleanOrgId, `meeting_${cleanMeetingId}_protocol`, null);
}

/**
 * Saves or updates the protocol for a specific meeting.
 */
export function saveMeetingProtocol(orgId, meetingId, protocolData) {
  if (typeof window === 'undefined' || !orgId || !meetingId || !protocolData) return null;
  const cleanOrgId = String(orgId).trim().toLowerCase();
  const cleanMeetingId = String(meetingId).trim().replace(/[\[\]]/g, '');
  const entry = {
    ...protocolData,
    meetingId: cleanMeetingId,
    orgId: cleanOrgId,
    updatedAt: new Date().toISOString(),
  };
  setOrgStorage(cleanOrgId, `meeting_${cleanMeetingId}_protocol`, entry);
  return entry;
}

/**
 * Retrieves the documents list for an organization.
 */
export function getDocumentsRegistry(orgId) {
  if (typeof window === 'undefined' || !orgId) return [];
  const cleanOrgId = String(orgId).trim().toLowerCase();
  return getOrgStorage(cleanOrgId, 'documents', []);
}

/**
 * Adds or updates a document in the documents repository.
 */
export function addDocumentToRegistry(orgId, newDoc) {
  if (typeof window === 'undefined' || !orgId || !newDoc || !newDoc.id) return [];
  const cleanOrgId = String(orgId).trim().toLowerCase();
  const current = getDocumentsRegistry(cleanOrgId);
  const existingIdx = current.findIndex(d => d.id === newDoc.id || d.code === newDoc.code);
  let updated;
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...updated[existingIdx], ...newDoc, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...newDoc, createdAt: newDoc.createdAt || new Date().toISOString() }, ...current];
  }
  setOrgStorage(cleanOrgId, 'documents', updated);
  return updated;
}

// ─── Blacklist / Wykluczeni członkowie (crm_psychoonkologia_${orgId}_blacklist_members) ──
/**
 * Pobiera listę wykluczonych członków dla danej organizacji
 */
export function getBlacklistedMembers(orgId = 'default') {
  if (typeof window === 'undefined') return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  return getOrgStorage(cleanOrgId, 'blacklist_members', []);
}

/**
 * Dodaje członka na stałą czarną listę organizacji
 */
export function addMemberToBlacklist(orgId = 'default', member) {
  if (typeof window === 'undefined' || !member) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getBlacklistedMembers(cleanOrgId) || [];

  const fullName = String(member.fullName || `${member.firstName || ''} ${member.lastName || ''}`).trim();
  const email = String(member.email || '').trim().toLowerCase();
  const rawIdx = String(member.index || member.indexNumber || member.cleanIndex || '').replace(/\D/g, '');
  const id = String(member.id || '');

  const exists = current.some(item => {
    if (id && item.id && item.id === id) return true;
    if (email && item.email && item.email.toLowerCase() === email) return true;
    if (rawIdx && item.index && item.index === rawIdx) return true;
    if (fullName && item.fullName && item.fullName.toLowerCase() === fullName.toLowerCase()) return true;
    return false;
  });

  if (!exists) {
    const entry = {
      id: id || `bl_${Date.now()}`,
      fullName,
      email,
      index: rawIdx,
      reason: member.archiveReason || 'Usunięty / Archiwum',
      archivedAt: new Date().toISOString(),
    };
    current.push(entry);
    setOrgStorage(cleanOrgId, 'blacklist_members', current);
  }
  return current;
}

/**
 * Usuwa członka z czarnej listy
 */
export function removeMemberFromBlacklist(orgId = 'default', identifier) {
  if (typeof window === 'undefined') return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getBlacklistedMembers(cleanOrgId) || [];
  const cleanId = String(identifier || '').toLowerCase().trim();

  const filtered = current.filter(item => {
    if (item.id && item.id.toLowerCase() === cleanId) return false;
    if (item.email && item.email.toLowerCase() === cleanId) return false;
    if (item.index && item.index === cleanId) return false;
    if (item.fullName && item.fullName.toLowerCase() === cleanId) return false;
    return true;
  });

  setOrgStorage(cleanOrgId, 'blacklist_members', filtered);
  return filtered;
}

/**
 * Sprawdza czy dany członek znajduje się na czarnej liście
 */
export function isMemberBlacklisted(member, blacklist = []) {
  if (!member || !Array.isArray(blacklist) || blacklist.length === 0) return false;

  const fullName = String(member.fullName || `${member.firstName || ''} ${member.lastName || ''}`).trim().toLowerCase();
  const email = String(member.email || '').trim().toLowerCase();
  const rawIdx = String(member.index || member.indexNumber || member.cleanIndex || '').replace(/\D/g, '');
  const id = String(member.id || '');

  return blacklist.some(item => {
    if (id && item.id && item.id === id) return true;
    if (email && item.email && item.email.toLowerCase() === email) return true;
    if (rawIdx && item.index && item.index === rawIdx) return true;
    if (fullName && item.fullName && item.fullName.toLowerCase() === fullName) return true;
    return false;
  });
}

// ─── Meetings Soft Delete / Trash & Custom Management (crm_psychoonkologia_${orgId}_meetings_trash) ──

/**
 * Pobiera listę ignorowanych/ukrytych spotkań (np. obcych spotkań z Teamup)
 */
export function getIgnoredMeetings(orgId = 'default') {
  if (typeof window === 'undefined') return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const list = getOrgStorage(cleanOrgId, 'ignored_meetings', []);
  const hidden = getOrgStorage(cleanOrgId, 'meetings_permanently_hidden', []);
  const trash = getOrgStorage(cleanOrgId, 'meetings_trash', []).flatMap(m => [
    m.id ? String(m.id).trim() : null,
    m.code ? String(m.code).trim() : null,
    m.code ? String(m.code).trim().replace(/[\[\]]/g, '') : null
  ]).filter(Boolean);
  return Array.from(new Set([...list, ...hidden, ...trash].filter(Boolean)));
}

/**
 * Dodaje spotkanie do listy ignorowanych (trwale ukrytych przed ponownym pobraniem z kalendarza)
 * Używa WYŁĄCZNIE unikalnego id / kodu spotkania (NIGDY samej daty!).
 */
export function addIgnoredMeeting(orgId = 'default', meetingOrId) {
  if (typeof window === 'undefined' || !meetingOrId) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getOrgStorage(cleanOrgId, 'ignored_meetings', []);
  const idsToAdd = [];

  if (typeof meetingOrId === 'object') {
    if (meetingOrId.id) idsToAdd.push(String(meetingOrId.id).trim());
    if (meetingOrId.code) {
      idsToAdd.push(String(meetingOrId.code).trim());
      idsToAdd.push(String(meetingOrId.code).trim().replace(/[\[\]]/g, ''));
    }
  } else {
    idsToAdd.push(String(meetingOrId).trim());
    idsToAdd.push(String(meetingOrId).trim().replace(/[\[\]]/g, ''));
  }

  const updated = Array.from(new Set([...current, ...idsToAdd.filter(Boolean)]));
  setOrgStorage(cleanOrgId, 'ignored_meetings', updated);
  setOrgStorage(cleanOrgId, 'meetings_permanently_hidden', updated);
  return updated;
}

/**
 * Usuwa spotkanie z listy ignorowanych (np. przy przywracaniu z kosza)
 */
export function removeIgnoredMeeting(orgId = 'default', meetingId) {
  if (typeof window === 'undefined' || !meetingId) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const cleanMId = String(meetingId).trim().replace(/[\[\]]/g, '');
  const rawMId = String(meetingId).trim();

  const currentIgnored = getOrgStorage(cleanOrgId, 'ignored_meetings', []);
  const currentHidden = getOrgStorage(cleanOrgId, 'meetings_permanently_hidden', []);

  const updatedIgnored = currentIgnored.filter(id => id !== cleanMId && id !== rawMId);
  const updatedHidden = currentHidden.filter(id => id !== cleanMId && id !== rawMId);

  setOrgStorage(cleanOrgId, 'ignored_meetings', updatedIgnored);
  setOrgStorage(cleanOrgId, 'meetings_permanently_hidden', updatedHidden);
  return updatedIgnored;
}

/**
 * Pobiera listę spotkań w Koszu (Soft Delete) dla danej organizacji
 */
export function getMeetingsTrash(orgId = 'default') {
  if (typeof window === 'undefined') return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  return getOrgStorage(cleanOrgId, 'meetings_trash', []);
}

/**
 * Przenosi spotkanie do Kosza (Soft Delete)
 */
export function addMeetingToTrash(orgId = 'default', meeting) {
  if (typeof window === 'undefined' || !meeting) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getMeetingsTrash(cleanOrgId);
  const mId = meeting.id || meeting.code || meeting.date;

  const existingIdx = current.findIndex(m => (m.id && m.id === mId) || (m.code && m.code === meeting.code));
  const trashEntry = {
    ...meeting,
    deletedAt: new Date().toISOString(),
  };

  let updated;
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = trashEntry;
  } else {
    updated = [trashEntry, ...current];
  }

  setOrgStorage(cleanOrgId, 'meetings_trash', updated);
  // Zapisz również jako ignorowane, aby nie powracało z API Teamup
  addIgnoredMeeting(cleanOrgId, meeting);
  return updated;
}

/**
 * Przywraca spotkanie z Kosza na główną listę spotkań
 */
export function restoreMeetingFromTrash(orgId = 'default', meetingId) {
  if (typeof window === 'undefined' || !meetingId) return { updatedTrash: [], restoredMeeting: null };
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getMeetingsTrash(cleanOrgId);
  const cleanMId = String(meetingId).trim().replace(/[\[\]]/g, '');

  const found = current.find(m => (m.id && String(m.id).trim() === cleanMId) || (m.code && String(m.code).trim() === cleanMId));
  const updatedTrash = current.filter(m => !( (m.id && String(m.id).trim() === cleanMId) || (m.code && String(m.code).trim() === cleanMId) ));

  setOrgStorage(cleanOrgId, 'meetings_trash', updatedTrash);
  removeIgnoredMeeting(cleanOrgId, meetingId);
  return { updatedTrash, restoredMeeting: found };
}

/**
 * Trwale usuwa spotkanie z Kosza (Permanent Delete)
 */
export function permanentlyDeleteMeetingFromTrash(orgId = 'default', meetingId) {
  if (typeof window === 'undefined' || !meetingId) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getMeetingsTrash(cleanOrgId);
  const cleanMId = String(meetingId).trim().replace(/[\[\]]/g, '');

  const updatedTrash = current.filter(m => !( (m.id && String(m.id).trim() === cleanMId) || (m.code && String(m.code).trim() === cleanMId) ));
  setOrgStorage(cleanOrgId, 'meetings_trash', updatedTrash);

  // Dodaj ID do listy trwale ukrytych spotkań, aby nie powracało z API Teamup/kalendarza
  addIgnoredMeeting(cleanOrgId, meetingId);

  return updatedTrash;
}

/**
 * Pobiera ręcznie dodane spotkania
 */
export function getCustomMeetings(orgId = 'default') {
  if (typeof window === 'undefined') return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  return getOrgStorage(cleanOrgId, 'custom_meetings', []);
}

/**
 * Zapisuje lub aktualizuje ręcznie dodane spotkanie
 */
export function saveCustomMeeting(orgId = 'default', meeting) {
  if (typeof window === 'undefined' || !meeting) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getCustomMeetings(cleanOrgId);
  const mId = meeting.id || meeting.code;

  const existingIdx = current.findIndex(m => m.id === mId || (m.code && m.code === meeting.code));
  let updated;
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...updated[existingIdx], ...meeting, updatedAt: new Date().toISOString() };
  } else {
    updated = [...current, { ...meeting, createdAt: new Date().toISOString() }];
  }

  setOrgStorage(cleanOrgId, 'custom_meetings', updated);
  return updated;
}

/**
 * Usuwa ręcznie dodane spotkanie
 */
export function deleteCustomMeeting(orgId = 'default', meetingId) {
  if (typeof window === 'undefined' || !meetingId) return [];
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const current = getCustomMeetings(cleanOrgId);
  const cleanMId = String(meetingId).trim();
  const updated = current.filter(m => m.id !== cleanMId && m.code !== cleanMId);
  setOrgStorage(cleanOrgId, 'custom_meetings', updated);
  return updated;
}

/**
 * Pobiera nadpisania spotkań (np. zmieniony kod, zmieniony tytuł)
 */
export function getMeetingOverrides(orgId = 'default') {
  if (typeof window === 'undefined') return {};
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  return getOrgStorage(cleanOrgId, 'meeting_overrides', {});
}

/**
 * Zapisuje nadpisanie spotkania (kod, tytuł) oraz migruje klucze obecności w razie zmiany kodu
 */
export function saveMeetingOverride(orgId = 'default', meetingId, overrides = {}) {
  if (typeof window === 'undefined' || !meetingId) return {};
  const cleanOrgId = String(orgId || 'default').trim().toLowerCase();
  const allOverrides = getMeetingOverrides(cleanOrgId);
  const cleanMId = String(meetingId).trim();

  const prevOverride = allOverrides[cleanMId] || {};
  const newOverride = { ...prevOverride, ...overrides };
  allOverrides[cleanMId] = newOverride;

  setOrgStorage(cleanOrgId, 'meeting_overrides', allOverrides);

  // Jeśli zmieniono kod spotkania, migruj powiązane klucze obecności
  if (overrides.code && overrides.oldCode && overrides.code !== overrides.oldCode) {
    const oldCode = overrides.oldCode;
    const newCode = overrides.code;

    const oldListKey = getOrgKey(cleanOrgId, `meeting_${oldCode}_list`);
    const newListKey = getOrgKey(cleanOrgId, `meeting_${newCode}_list`);
    const oldListVal = localStorage.getItem(oldListKey);
    if (oldListVal && !localStorage.getItem(newListKey)) {
      localStorage.setItem(newListKey, oldListVal);
    }

    const oldAttKey = getOrgKey(cleanOrgId, `crm_attendance_${oldCode}`);
    const newAttKey = getOrgKey(cleanOrgId, `crm_attendance_${newCode}`);
    const oldAttVal = localStorage.getItem(oldAttKey);
    if (oldAttVal && !localStorage.getItem(newAttKey)) {
      localStorage.setItem(newAttKey, oldAttVal);
    }

    const oldProtoKey = getOrgKey(cleanOrgId, `meeting_${oldCode}_protocol`);
    const newProtoKey = getOrgKey(cleanOrgId, `meeting_${newCode}_protocol`);
    const oldProtoVal = localStorage.getItem(oldProtoKey);
    if (oldProtoVal && !localStorage.getItem(newProtoKey)) {
      localStorage.setItem(newProtoKey, oldProtoVal);
    }
  }

  return allOverrides;
}

// ─── EMAIL & NOTIFICATION CONFIGURATION (crm_skn_${orgId}_email_config) ──────

export const DEFAULT_EMAIL_CONFIG = {
  default: {
    senderEmail: '',
    senderName: 'Zarząd Koła Naukowego',
    replyTo: '',
    webmailUrl: 'https://137.74.6.65:8080/webmail/',
    preferredMailClient: 'gmail', // 'gmail' | 'webmail' | 'system'
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    footerSignature: 'Z poważaniem,\nZarząd Studenckiego Koła Naukowego WSKZ\nWydział Psychologii WSKZ\ne-mail: zarzad@wskz.pl',
    welcomeSubjectTemplate: 'Potwierdzenie przyjęcia zgłoszenia i powitanie w {ORGANIZACJA}',
    welcomeBodyTemplate: `Dzień dobry {IMIE},\n\nZ radością informujemy, że Twoje zgłoszenie do {ORGANIZACJA} na rok akademicki 2026/2027 zostało pomyślnie zweryfikowane i przyjęte!\n\nTwoje dane ewidencyjne:\n• Imię i nazwisko: {IMIE_NAZWISKO}\n• Kierunek: {KIERUNEK} ({ROK})\n• Numer indeksu: {INDEKS}\n\nNajważniejsze informacje organizacyjne:\n1. Harmonogram spotkań, sesji seminaryjnych oraz warsztatów merytorycznych dostępny jest w kalendarzu koła.\n2. Udział w spotkaniach i aktywność naukowa są na bieżąco ewidencjonowane w systemie CRM.\n3. W razie jakichkolwiek pytań zachęcamy do kontaktu mailowego z Zarządem Koła.\n\nSerdecznie witamy w naszym zespole i życzymy owocnej pracy naukowej!\n\n{PODPIS}`,
  },
};

export function getEmailConfig(orgId = 'default') {
  if (typeof window === 'undefined' || !orgId) return DEFAULT_EMAIL_CONFIG.default;
  const cleanId = String(orgId).trim().toLowerCase();
  const defaultConf = DEFAULT_EMAIL_CONFIG[cleanId] || DEFAULT_EMAIL_CONFIG.default;
  const stored = getOrgStorage(cleanId, 'email_config', null);
  if (stored && typeof stored === 'object') {
    return { ...defaultConf, ...stored };
  }
  return defaultConf;
}

export function saveEmailConfig(orgId, config) {
  if (typeof window === 'undefined' || !orgId || !config) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  const current = getEmailConfig(cleanId);
  const updated = { ...current, ...config, updatedAt: new Date().toISOString() };
  setOrgStorage(cleanId, 'email_config', updated);
  try {
    saveEmailConfigToDB(cleanId, updated).catch(() => {});
  } catch {}
  return updated;
}

// ─── GOOGLE MEET ALIASES (crm_meet_aliases) ──────────────────────────────

export function getAliasesFromStorage(orgId = 'skn_seksuologii') {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getOrgKey(orgId, 'meet_aliases'));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAliasesToStorage(aliases, orgId = 'skn_seksuologii') {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(aliases || {});
    localStorage.setItem(getOrgKey(orgId, 'meet_aliases'), json);
    localStorage.removeItem('crm_meet_aliases');
  } catch {}
}



