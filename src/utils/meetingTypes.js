import {
  getAcademicScope,
  isEwidencjaInAcademicScope,
  isEwidencjaMatchForMeeting,
  isMeetingInAcademicScope,
  getAcademicYearTimeStatus,
  getMemberAcademicStatus,
  getCurrentAcademicYear,
  isDorobekInAcademicScope,
  getTenureMonthsInScope,
} from './academicScope.js';
import { ACTIVITY_WEIGHTS, getActivityWeight } from './activityWeights.js';
import { isCertificateEligible } from './helpers.js';

// ─── Szybki bufor odczytów localStorage (eliminuje tysiące synchronicznych JSON.parse w pętlach) ───
const _storageJsonCache = new Map();
const STORAGE_CACHE_TTL_MS = 250;

export function invalidateMeetingStatsCache() {
  _storageJsonCache.clear();
  _lastScopedContext = null;
}

function getCachedStorageJson(key) {
  if (!key || typeof window === 'undefined' || !window.localStorage) return null;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const cached = _storageJsonCache.get(key);
  if (cached && (now - cached.ts) < STORAGE_CACHE_TTL_MS) {
    return cached.parsed;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      _storageJsonCache.set(key, { ts: now, raw: null, parsed: null });
      return null;
    }
    if (cached && cached.raw === raw) {
      cached.ts = now;
      return cached.parsed;
    }
    const parsed = JSON.parse(raw);
    _storageJsonCache.set(key, { ts: now, raw, parsed });
    return parsed;
  } catch {
    return null;
  }
}

let _lastScopedContext = null;

// ─── Meeting Types and Categorization Helper ─────────────────────────────────

export const MEETING_TYPES = {
  mandatory: {
    id: 'mandatory',
    group: 'status',
    label: 'Obowiązkowe',
    icon: '',
    ringColorClass: 'text-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description: 'Wliczane do bazowej frekwencji (mianownik)',
    countsTowardsDenominator: true,
  },
  optional: {
    id: 'optional',
    group: 'status',
    label: 'Nieobowiązkowe',
    icon: '',
    ringColorClass: 'text-amber-500',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    description: 'Otwarte / dodatkowe – brak obecności nie obniża frekwencji',
    countsTowardsDenominator: false,
  },
  trigger_warning: {
    id: 'trigger_warning',
    group: 'status',
    label: 'Trigger Warning',
    icon: '',
    ringColorClass: 'text-rose-500',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    description: 'Tematyka wrażliwa – wyłączone z obowiązku',
    countsTowardsDenominator: false,
  },
  internal: {
    id: 'internal',
    group: 'status',
    label: 'Wewnętrzne Zarządzanie',
    icon: '',
    ringColorClass: 'text-indigo-500',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    description: 'Spotkanie zarządu – niewliczane do frekwencji koła',
    countsTowardsDenominator: false,
  },
  conference_passive: {
    id: 'conference_passive',
    group: 'format',
    label: 'Konferencja / Dyskusja',
    icon: '',
    ringColorClass: 'text-purple-600',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
    description: 'Wydarzenie naukowe, dyskusja lub delegacja – udział bierny / słuchacz',
    countsTowardsDenominator: false,
  },
  workshop_external: {
    id: 'workshop_external',
    group: 'format',
    label: 'Warsztat / Szkolenie',
    icon: '',
    ringColorClass: 'text-violet-600',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-300',
    description: 'Praktyczne warsztaty, szkolenia i formy podnoszenia kwalifikacji',
    countsTowardsDenominator: false,
  },
};

/**
 * Automatyczne dopasowanie typu spotkania na podstawie reguł słownikowych
 */
export function getAutoMeetingType(meeting) {
  if (!meeting) return 'mandatory';
  const title = (meeting.title || '').toLowerCase();

  // 1. Wybory i Spotkania Organizacyjne Koła -> Obowiązkowe
  if (
    (title.includes('wybor') || title.includes('organizacyjn')) &&
    !title.includes('wewnętrzn') &&
    !title.includes('wewnetrzn')
  ) {
    return 'mandatory';
  }

  // 2. Wewnętrzne Zarządu / Inauguracja
  if (
    title.includes('inauguracja') ||
    title.includes('wewnętrzne') ||
    title.includes('wewnetrzne') ||
    title.includes('posiedzenie zarządu') ||
    title.includes('spotkanie zarządu') ||
    title.includes('spotkanie wewnętrzne')
  ) {
    return 'internal';
  }

  // 3. Trigger Warning / Wrażliwe
  if (
    title.includes('trauma') ||
    title.includes('traumy') ||
    title.includes('przemoc') ||
    title.includes('nadużyc') ||
    title.includes('naduzyc') ||
    title.includes('zaburzen')
  ) {
    return 'trigger_warning';
  }

  // 4. Nieobowiązkowe / Otwarte / Komisja
  if (
    title.includes('komisj') ||
    title.includes('otwart') ||
    title.includes('warsztat') ||
    title.includes('dodatkow') ||
    title.includes('dyskusyjn')
  ) {
    return 'optional';
  }

  // 5. Domyślnie: Merytoryczne prelekcje -> Obowiązkowe
  return 'mandatory';
}

/**
 * Zwraca aktywny typ spotkania z uwzględnieniem ręcznych modyfikacji w localStorage
 */
export function getMeetingType(meeting, customTypes = {}) {
  if (!meeting) return 'mandatory';
  const mId = meeting.id;
  const mCode = meeting.code;

  if (customTypes && (mId in customTypes || mCode in customTypes)) {
    if (mId && customTypes[mId]) return customTypes[mId];
    if (mCode && customTypes[mCode]) return customTypes[mCode];
  }

  // Fallback to localStorage if customTypes was omitted or empty
  if (typeof window !== 'undefined' && window.localStorage) {
    const orgTypes = getCachedStorageJson('crm_skn_crm_meeting_types') || getCachedStorageJson('crm_psychoonkologia_crm_meeting_types');
    if (orgTypes) {
      if (mId && orgTypes[mId]) return orgTypes[mId];
      if (mCode && orgTypes[mCode]) return orgTypes[mCode];
    }
    const globalTypes = getCachedStorageJson('crm_meeting_types');
    if (globalTypes) {
      if (mId && globalTypes[mId]) return globalTypes[mId];
      if (mCode && globalTypes[mCode]) return globalTypes[mCode];
    }
  }

  if (meeting.customType && MEETING_TYPES[meeting.customType]) {
    return meeting.customType;
  }
  if (meeting.meetingType && MEETING_TYPES[meeting.meetingType]) {
    return meeting.meetingType;
  }
  if (meeting.type && MEETING_TYPES[meeting.type]) {
    return meeting.type;
  }
  return getAutoMeetingType(meeting);
}

/**
 * Single Source of Truth dla stanu spotkania w całym systemie CRM.
 * Obecność (count > 0) ma bezwzględny priorytet nad statusem kalendarzowym (czasem).
 */
export function getMeetingStatusInfo(meeting, customCount = null) {
  if (!meeting) {
    return {
      isCompleted: false,
      isUpcoming: false,
      count: 0,
      label: 'Brak danych',
      badgeColor: 'text-slate-400',
    };
  }

  // 1. Sprawdź obecność: przekazany customCount lub z właściwości obiektu
  let effectiveCount = (customCount !== null && customCount !== undefined)
    ? Number(customCount)
    : Number(meeting.attendanceCount ?? meeting.attendeesCount ?? (Array.isArray(meeting.attendees) ? meeting.attendees.length : 0));

  if (isNaN(effectiveCount)) effectiveCount = 0;

  // 2. Jeśli count wynosi 0, sprawdź czy spotkanie ma zapisane logi (np. w ewidencji lub localStorage)
  const hasAttendance = effectiveCount > 0 || hasMeetingAttendanceLogs(meeting);

  // 3. Reguła nadrzędna: jeśli jest obecność, spotkanie jest ZAKOŃCZONE, NIE nadchodzące
  const isCompleted = hasAttendance || (!meeting.isUpcoming && (
    (meeting.status && String(meeting.status).toLowerCase().includes('zakończone')) ||
    (meeting.date && new Date(String(meeting.date).includes('T') ? meeting.date.split('T')[0] : meeting.date) < new Date().setHours(0,0,0,0))
  ));

  const isUpcoming = !hasAttendance && Boolean(meeting.isUpcoming);

  return {
    isCompleted,
    isUpcoming,
    count: effectiveCount,
    hasAttendance,
    label: isCompleted
      ? (effectiveCount > 0 ? `Zakończone (${effectiveCount} obecnych)` : 'Zakończone')
      : (isUpcoming ? 'Zaplanowane' : 'Nierozliczone'),
    badgeColor: isCompleted
      ? 'text-emerald-700 font-bold'
      : (isUpcoming ? 'text-emerald-700 font-medium' : 'text-slate-400 font-medium'),
  };
}

/**
 * Sprawdza czy spotkanie posiada zarejestrowane i zweryfikowane logi obecności
 */
export function hasMeetingAttendanceLogs(meeting, ewidencja = null) {
  try {
    if (!meeting) return false;

    if (meeting.attendanceCount !== undefined && meeting.attendanceCount !== null && Number(meeting.attendanceCount) > 0) {
      return true;
    }
    if (meeting.attendeesCount !== undefined && meeting.attendeesCount !== null && Number(meeting.attendeesCount) > 0) {
      return true;
    }
    if (Array.isArray(meeting.attendees) && meeting.attendees.length > 0) {
      return true;
    }
    if (Array.isArray(meeting.listaObecnosci) && meeting.listaObecnosci.length > 0) {
      return true;
    }
    if (Array.isArray(meeting.participantRecords) && meeting.participantRecords.length > 0) {
      return true;
    }
    if (Array.isArray(meeting.attendanceLogs) && meeting.attendanceLogs.length > 0) {
      return true;
    }

    // Sprawdź ewidencja w pamięci lub w localStorage z rygorystyczną izolacją lat akademickich
    let activeEwidencja = ewidencja;
    if (!activeEwidencja && typeof window !== 'undefined' && window.localStorage) {
      activeEwidencja = getCachedStorageJson('crm_ewidencja');
    }

    if (Array.isArray(activeEwidencja) && activeEwidencja.length > 0) {
      const hasEwidencja = activeEwidencja.some(e => isEwidencjaMatchForMeeting(e, meeting));
      if (hasEwidencja) return true;
    }

    // Sprawdź w localStorage czy istnieją zapisane obecności dla tego spotkania
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keys = [
          meeting.id ? `crm_attendance_${meeting.id}` : null,
          meeting.date ? `crm_attendance_${meeting.date}` : null,
          meeting.code ? `crm_attendance_${meeting.code}` : null,
        ].filter(Boolean);

        for (const k of keys) {
          const parsed = getCachedStorageJson(k);
          if (parsed) {
            if (parsed.date && meeting.date && parsed.date !== meeting.date) continue;
            if (parsed.code && meeting.code) {
              const pHas2526 = parsed.code.includes('25/26');
              const pHas2627 = parsed.code.includes('26/27');
              const mHas2526 = meeting.code.includes('25/26');
              const mHas2627 = meeting.code.includes('26/27');
              if ((pHas2526 && mHas2627) || (pHas2627 && mHas2526)) continue;
            }
            if (typeof parsed.confirmedCount === 'number' && parsed.confirmedCount > 0) {
              return true;
            }
            if (Array.isArray(parsed.confirmedIndexes) && parsed.confirmedIndexes.length > 0) {
              return true;
            }
            if (Array.isArray(parsed.attendees) && parsed.attendees.length > 0) {
              return true;
            }
            if (Array.isArray(parsed) && parsed.length > 0) {
              return true;
            }
          }
        }
      } catch {}
    }

    return false;
  } catch (err) {
    console.warn('[meetingTypes] Błąd w hasMeetingAttendanceLogs:', meeting, err);
    return false;
  }
}

/**
 * Sprawdza, czy spotkanie kwalifikuje się do mianownika frekwencji (bazy wymaganych spotkań).
 * Warunki:
 * 1. Nie jest to spotkanie nadchodzące (isUpcoming === false).
 * 2. Jeśli zdefiniowano ręczny przełącznik countsInFrequency / includeInFrequency:
 *    - false -> bezwzględnie wykluczone
 *    - true -> wliczone do mianownika
 * 3. Jeśli brak ręcznego przełącznika:
 *    - Typ spotkania musi mieć countsTowardsDenominator: true (domyślnie 'mandatory').
 *      Spotkania 'internal' (zarząd), 'optional' (otwarte) i 'trigger_warning' są wykluczone.
 *    - Spotkanie MUSI posiadać zarejestrowaną/zweryfikowaną listę obecności (attendanceCount > 0 lub wpisy w ewidencji / localStorage).
 */
export function isMeetingEligibleForDenominator(meeting, customTypes = {}, ewidencja = null) {
  try {
    if (!meeting) return false;
    const statusInfo = getMeetingStatusInfo(meeting);
    if (statusInfo.isUpcoming && !statusInfo.isCompleted) return false;

    // 1. Ręczny override z checkboxa
    if (meeting.wliczajDoFrekwencji === false || 
        meeting.countsInFrequency === false || 
        meeting.includeInFrequency === false) {
      return false;
    }
    if (meeting.wliczajDoFrekwencji === true || 
        meeting.countsInFrequency === true || 
        meeting.includeInFrequency === true) {
      return true;
    }

    // 2. Weryfikacja typu spotkania
    const rawType = meeting.type || meeting.meetingType || meeting.category || '';
    const typeKey = String(rawType).toLowerCase();
    if (typeKey === 'mandatory' || typeKey === 'obowiazkowe' || typeKey === 'obowiązkowe') return true;
    if (['optional', 'internal', 'trigger_warning', 'workshop_external', 'conference_passive'].includes(typeKey)) {
      return false;
    }

    const type = getMeetingType(meeting, customTypes);
    const typeConfig = MEETING_TYPES[type];
    if (typeConfig && !typeConfig.countsTowardsDenominator) {
      return false;
    }

    // 3. Weryfikacja słów kluczowych (dla surowych wpisów z Teamup / kalendarza)
    const text = `${meeting.title || ''} ${meeting.name || ''} ${meeting.charakter || ''}`.toLowerCase();
    const isExcluded = 
      text.includes('nieobowiązkowe') ||
      text.includes('nieobowiazkowe') ||
      text.includes('wewnętrzne') ||
      text.includes('wewnetrzne') ||
      text.includes('zarząd') ||
      text.includes('zarzad') ||
      text.includes('klub czytelniczy') ||
      text.includes('journal club') ||
      text.includes('burza mózgów') ||
      text.includes('spotkanie z dyrektorem') ||
      text.includes('relacja z konferencji') ||
      text.includes('trigger warning') ||
      text.includes('[tw]');

    if (isExcluded) return false;

    // Sprawdź czy spotkanie ma cechy spotkania merytorycznego / koła
    if (
      text.includes('spotkanie merytoryczne') || 
      text.includes('kawiarenka') || 
      text.includes('spotkanie projektowe') ||
      text.includes('inauguracja') ||
      text.includes('zebranie') ||
      text.includes('prelekcja') ||
      text.includes('wybory') ||
      typeConfig?.countsTowardsDenominator
    ) {
      return true;
    }

    return typeConfig ? Boolean(typeConfig.countsTowardsDenominator) : true;
  } catch (err) {
    console.warn('[meetingTypes] Błąd sprawdzania mianownika dla spotkania:', meeting, err);
    return false;
  }
}

/**
 * Główna, jednolita funkcja kalkulacji frekwencji i statystyk studenta (Single Source of Truth)
 * Używana identycznie w tabeli głównej (ManagementTab) oraz modalu profilu (EditMemberModal)
 */
export function calculateMemberStats(memberOrIndex, ewidencja = null, meetings = [], customTypesOrTenures = {}, settingsOrDorobek = {}, extraSettings = {}) {
  // Rozpoznanie elastycznych sygnatur wywołania:
  // a) calculateMemberStats(m, ewidencja, meetings, customTypes, settings)
  // b) calculateMemberStats(m, ewidencja, meetings, boardTenures, dorobek, settings)
  let customTypes = {};
  let explicitBoardTenures = null;
  let explicitDorobek = null;
  let settings = {};

  if (Array.isArray(customTypesOrTenures)) {
    explicitBoardTenures = customTypesOrTenures;
    explicitDorobek = settingsOrDorobek;
    settings = extraSettings || {};
  } else {
    customTypes = customTypesOrTenures || {};
    settings = settingsOrDorobek || {};
  }

  // Pobranie ustawień z parametru lub domyślnych
  let activeSettings = {
    calcMode: 'DYNAMIC_MANDATORY',
    fixedTarget: 10,
    minPassingPercent: 50,
    zeroAttendanceDisplay: 'PERCENT_ZERO',
    ...(settings || {}),
  };

  if (!settings || Object.keys(settings).length === 0) {
    const parsedSaved = getCachedStorageJson('crm_attendance_config') || getCachedStorageJson('skn_attendance_config');
    if (parsedSaved && typeof parsedSaved === 'object') {
      activeSettings = { ...activeSettings, ...parsedSaved };
    }
  }

  const calcMode = activeSettings.calcMode || 'DYNAMIC_MANDATORY';
  const fixedTarget = Math.max(1, Number(activeSettings.fixedTarget) || 10);
  const minPassingPercent = Math.max(1, Math.min(100, Number(activeSettings.minPassingPercent) || 50));
  const zeroAttendanceDisplay = activeSettings.zeroAttendanceDisplay || 'PERCENT_ZERO';

  if (!memberOrIndex) {
    return {
      freq: 0,
      percentage: 0,
      attendedCount: 0,
      present: 0,
      absent: 0,
      presentMandatory: 0,
      mandatoryTotal: 0,
      baseDenominator: 0,
      optionalBonus: 0,
      totalAttended: 0,
      attendedRecords: [],
      isCertEligible: false,
      canGetCertificate: false,
      displayRatio: '0 / 0',
      displayPercentage: zeroAttendanceDisplay === 'NEUTRAL_DASH' ? '—' : '0%',
      badge: { label: 'Wymaga uzupełnienia', dotColor: 'bg-slate-500', color: 'bg-slate-100 text-slate-700 border-slate-300' },
      certStatus: { canIssue: false, label: 'W toku', color: 'bg-slate-100 text-slate-700 border-slate-300' },
    };
  }

  // 1. Bezpieczne pobranie bazy ewidencji z parametru lub zbuforowanego localStorage
  let activeEwidencja = Array.isArray(ewidencja) ? ewidencja : null;
  if (!activeEwidencja) {
    const parsed = getCachedStorageJson('crm_ewidencja');
    if (Array.isArray(parsed)) activeEwidencja = parsed;
  }
  if (!activeEwidencja) activeEwidencja = [];

  const safeMeetings = Array.isArray(meetings) ? meetings : [];

  // Wyznaczenie aktywnego zakresu akademickiego (SSOT: Academic Scope)
  let activeScope = activeSettings.scope || null;
  let scopeStartDate = activeSettings.startDate || (activeScope?.startDate) || null;
  let scopeEndDate = activeSettings.endDate || (activeScope?.endDate) || null;
  let academicYearKey = activeSettings.academicYear || (activeScope?.id) || null;

  if (!scopeStartDate || !scopeEndDate) {
    if (typeof window !== 'undefined') {
      try {
        const storedYr = sessionStorage.getItem('crm_skn_academic_year_session') ||
                         localStorage.getItem('crm_skn_academic_year');
        const resolved = getAcademicScope(storedYr);
        if (resolved && resolved.startDate && resolved.endDate) {
          scopeStartDate = scopeStartDate || resolved.startDate;
          scopeEndDate = scopeEndDate || resolved.endDate;
          academicYearKey = academicYearKey || resolved.id;
          activeScope = activeScope || resolved;
        }
      } catch {}
    }
  }

  if (!activeScope) {
    activeScope = getAcademicScope(academicYearKey || '2026/2027', scopeStartDate, scopeEndDate);
  }

  // Buforowany kontekst rocznika (zapobiega 147-krotnemu filtrowaniu tej samej tablicy spotkań i ewidencji w jednym przebiegu)
  const nowTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const scopeIdKey = `${activeScope?.id || ''}|${activeScope?.startDate || ''}|${activeScope?.endDate || ''}`;
  let scopedCtx = _lastScopedContext;
  if (
    !scopedCtx ||
    (nowTs - scopedCtx.ts) >= STORAGE_CACHE_TTL_MS ||
    scopedCtx.meetingsRef !== safeMeetings ||
    scopedCtx.meetingsLen !== safeMeetings.length ||
    scopedCtx.ewidencjaRef !== activeEwidencja ||
    scopedCtx.ewidencjaLen !== activeEwidencja.length ||
    scopedCtx.scopeIdKey !== scopeIdKey
  ) {
    const scopedMeetingsList = safeMeetings.filter(m => isMeetingInAcademicScope(m, activeScope));
    const scopedEwidencjaList = activeEwidencja.filter(e => isEwidencjaInAcademicScope(e, activeScope, scopedMeetingsList));

    const uniqueConductedMap = new Map();
    scopedMeetingsList.filter(m => {
      if (!m) return false;
      const s = getMeetingStatusInfo(m);
      return s.isCompleted || !s.isUpcoming;
    }).forEach(m => {
      const meetKey = String(m.code || m.id || m.date || '').trim();
      if (meetKey && !uniqueConductedMap.has(meetKey)) {
        uniqueConductedMap.set(meetKey, m);
      }
    });
    const conductedMeetingsList = Array.from(uniqueConductedMap.values());
    const eligibleMandatoryMeetingsList = conductedMeetingsList.filter(m =>
      isMeetingEligibleForDenominator(m, customTypes, scopedEwidencjaList)
    );
    const allVerifiedMeetingsList = conductedMeetingsList.filter(m =>
      hasMeetingAttendanceLogs(m, scopedEwidencjaList)
    );
    const eligibleSet = new Set(eligibleMandatoryMeetingsList);

    scopedCtx = {
      ts: nowTs,
      meetingsRef: safeMeetings,
      meetingsLen: safeMeetings.length,
      ewidencjaRef: activeEwidencja,
      ewidencjaLen: activeEwidencja.length,
      scopeIdKey,
      scopedMeetings: scopedMeetingsList,
      scopedEwidencja: scopedEwidencjaList,
      conductedMeetings: conductedMeetingsList,
      eligibleMandatoryMeetings: eligibleMandatoryMeetingsList,
      allVerifiedMeetings: allVerifiedMeetingsList,
      eligibleSet,
    };
    _lastScopedContext = scopedCtx;
  }

  const {
    scopedMeetings,
    scopedEwidencja,
    conductedMeetings,
    eligibleMandatoryMeetings,
    allVerifiedMeetings,
    eligibleSet,
  } = scopedCtx;

  // 2. Normalizacja identyfikatorów studenta
  let rawIdx = '';
  let cleanIdxDigits = '';
  let rawEmail = '';
  let rawFullName = '';
  let rawAliases = '';

  if (typeof memberOrIndex === 'object' && memberOrIndex !== null) {
    rawIdx = String(memberOrIndex.nrIndeksu || memberOrIndex.index || memberOrIndex.cleanIndex || memberOrIndex.indexNumber || '').trim();
    cleanIdxDigits = rawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
    rawEmail = String(memberOrIndex.email || '').trim().toLowerCase();
    rawFullName = String(memberOrIndex.fullName || memberOrIndex.name || `${memberOrIndex.firstName || ''} ${memberOrIndex.lastName || ''}`).trim().toLowerCase();
    rawAliases = String(memberOrIndex.aliasy || memberOrIndex.aliases || memberOrIndex.alias || '').trim().toLowerCase();
  } else {
    rawIdx = String(memberOrIndex || '').trim();
    cleanIdxDigits = rawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
  }

  // 3. Dopasowanie rekordów obecności studenta z przefiltrowanej tablicy scopedEwidencja
  const studentAttendance = scopedEwidencja.filter(e => {
    if (!e) return false;
    const eRawIdx = String(e.nrIndeksu || e.index || '').trim();
    const eCleanIdx = eRawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
    const eEmail = String(e.email || '').trim().toLowerCase();
    const eName = String(e.name || e.fullName || e.imieNazwisko || '').trim().toLowerCase();

    // a) Dopasowanie po numerze indeksu
    if (rawIdx && eRawIdx && rawIdx === eRawIdx) return true;
    if (cleanIdxDigits && eCleanIdx && cleanIdxDigits === eCleanIdx) return true;

    // b) Dopasowanie po aliasach Meet
    if (rawAliases) {
      if (eRawIdx && rawAliases.includes(eRawIdx.toLowerCase())) return true;
      if (eCleanIdx && rawAliases.includes(eCleanIdx)) return true;
      if (eName && rawAliases.includes(eName)) return true;
    }

    // c) Dopasowanie po emailu
    if (rawEmail && eEmail && rawEmail === eEmail) return true;

    // d) Dopasowanie po imieniu i nazwisku
    if (rawFullName && eName && (rawFullName === eName || eName.includes(rawFullName) || rawFullName.includes(eName))) return true;

    return false;
  });

  // 5. Wyznaczenie bazy spotkań do mianownika w zależności od trybu konfiguracji
  let baseDenominator = 0;

  if (calcMode === 'FIXED_TARGET') {
    baseDenominator = fixedTarget;
  } else if (calcMode === 'ALL_VERIFIED') {
    baseDenominator = allVerifiedMeetings.length > 0 ? allVerifiedMeetings.length : (conductedMeetings.length > 0 ? conductedMeetings.length : 1);
  } else {
    // Domyślny: DYNAMIC_MANDATORY
    baseDenominator = eligibleMandatoryMeetings.length > 0 ? eligibleMandatoryMeetings.length : 0;
  }

  // 6. Zliczanie zaliczonych obecności
  const attendedMeetingCodes = new Set();
  let presentMandatory = 0;
  let optionalBonus = 0;

  conductedMeetings.forEach(m => {
    const isEligibleMandatory = eligibleSet.has(m);
    const mCode = String(m.code || m.id || '').trim();
    const mCodeUpper = mCode.replace(/[\[\]]/g, '').trim().toUpperCase();
    const mNumMatch = mCodeUpper.match(/M(\d+)/i);
    const mNum = mNumMatch ? parseInt(mNumMatch[1], 10) : null;

    // a) Sprawdź w studentAttendance (ze scoped ewidencji)
    let isPresent = studentAttendance.some(e => {
      const eCode = String(e.kodSpotkania || e.meetingCode || '').replace(/[\[\]]/g, '').trim().toUpperCase();
      const eNumMatch = eCode.match(/M(\d+)/i);
      const eNum = eNumMatch ? parseInt(eNumMatch[1], 10) : null;
      if (eCode === mCodeUpper) return true;
      if (e.dataSpotkania && m.date && String(e.dataSpotkania).trim() === String(m.date).trim()) return true;
      if (mNum !== null && eNum !== null && mNum === eNum) {
        const eHas2526 = eCode.includes('25/26');
        const eHas2627 = eCode.includes('26/27');
        const mHas2526 = mCodeUpper.includes('25/26');
        const mHas2627 = mCodeUpper.includes('26/27');
        if (eHas2526 && mHas2627) return false;
        if (eHas2627 && mHas2526) return false;
        return true;
      }
      return false;
    });

    // b) Sprawdź w m.attendees
    if (!isPresent && Array.isArray(m.attendees) && m.attendees.length > 0) {
      isPresent = m.attendees.some(att => {
        if (!att) return false;
        if (typeof att === 'object') {
          const attIdx = String(att.index || att.member?.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
          const attEmail = String(att.email || att.member?.email || '').trim().toLowerCase();
          const attName = String(att.fullName || att.rawName || att.name || '').trim().toLowerCase();
          const isApproved = att.manualApproved !== undefined ? Boolean(att.manualApproved) : (att.status === 'approved' || att.status === 'Zaliczona' || att.status === 'Zaliczono' || att.isEligible);
          if (!isApproved) return false;
          if (cleanIdxDigits && attIdx && cleanIdxDigits === attIdx) return true;
          if (rawEmail && attEmail && rawEmail === attEmail) return true;
          if (rawFullName && attName && (rawFullName === attName || attName.includes(rawFullName) || rawFullName.includes(attName))) return true;
          return false;
        }
        const strAtt = String(att).trim();
        const cleanAtt = strAtt.replace(/\D/g, '').replace(/^0+/, '').trim();
        if (cleanIdxDigits && cleanAtt && cleanAtt === cleanIdxDigits) return true;
        if (rawEmail && strAtt.toLowerCase() === rawEmail) return true;
        return false;
      });
    }

    // c) Sprawdź w m.participantRecords
    if (!isPresent && Array.isArray(m.participantRecords) && m.participantRecords.length > 0) {
      isPresent = m.participantRecords.some(p => {
        if (!p) return false;
        const isApproved = p.manualApproved !== undefined
          ? Boolean(p.manualApproved)
          : (p.isEligible || p.status === 'approved' || p.status === 'Zaliczona' || p.status === 'Zaliczono');
        if (!isApproved) return false;

        const pIdx = String(p.member?.index || p.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
        const pEmail = String(p.member?.email || p.email || '').trim().toLowerCase();
        const pName = String(p.member?.fullName || p.rawName || '').trim().toLowerCase();

        if (cleanIdxDigits && pIdx && cleanIdxDigits === pIdx) return true;
        if (rawEmail && pEmail && rawEmail === pEmail) return true;
        if (rawFullName && pName && (rawFullName === pName || pName.includes(rawFullName) || rawFullName.includes(pName))) return true;
        return false;
      });
    }

    // d) Sprawdź w zbuforowanym localStorage
    if (!isPresent && typeof window !== 'undefined' && window.localStorage) {
      const storageKeys = [
        m.id ? `crm_attendance_${m.id}` : null,
        m.date ? `crm_attendance_${m.date}` : null,
        m.code ? `crm_attendance_${m.code}` : null,
      ].filter(Boolean);

      for (const key of storageKeys) {
        const parsed = getCachedStorageJson(key);
        if (parsed) {
          const atts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.attendees) ? parsed.attendees : []);
          const matched = atts.some(p => {
            const isApproved = p.manualApproved !== undefined
              ? Boolean(p.manualApproved)
              : (p.isEligible || p.status === 'approved' || p.status === 'Zaliczona' || p.status === 'Zaliczono');
            if (!isApproved) return false;
            const pIdx = String(p.member?.index || p.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
            const pEmail = String(p.member?.email || p.email || '').trim().toLowerCase();
            const pName = String(p.member?.fullName || p.rawName || '').trim().toLowerCase();
            if (cleanIdxDigits && pIdx && cleanIdxDigits === pIdx) return true;
            if (rawEmail && pEmail && rawEmail === pEmail) return true;
            if (rawFullName && pName && (rawFullName === pName || pName.includes(rawFullName) || rawFullName.includes(pName))) return true;
            return false;
          });
          if (matched) {
            isPresent = true;
            break;
          }
          const confIdxs = Array.isArray(parsed?.confirmedIndexes) ? parsed.confirmedIndexes : [];
          if (cleanIdxDigits && confIdxs.some(ci => String(ci).replace(/\D/g, '').replace(/^0+/, '').trim() === cleanIdxDigits)) {
            isPresent = true;
            break;
          }
        }
      }
    }

    if (isPresent) {
      if (!attendedMeetingCodes.has(mCode)) {
        attendedMeetingCodes.add(mCode);
        if (isEligibleMandatory) {
          presentMandatory++;
        } else {
          optionalBonus++;
        }
      }
    }
  });

  // Fallback do obecności bezpośrednio z tablicy studentAttendance, jeśli spotkania nie miały kodów
  const totalAttended = Math.max(attendedMeetingCodes.size, studentAttendance.length);
  
  // W zależności od trybu wyznaczamy obecności wliczane do frekwencji
  let attendedRelevant = totalAttended;
  let finalPresentMandatory = presentMandatory;

  if (calcMode === 'DYNAMIC_MANDATORY') {
    finalPresentMandatory = baseDenominator > 0 ? Math.min(baseDenominator, Math.max(presentMandatory, studentAttendance.length)) : totalAttended;
    attendedRelevant = finalPresentMandatory;
  } else {
    finalPresentMandatory = totalAttended;
    attendedRelevant = totalAttended;
  }

  const absentCount = baseDenominator > 0 ? Math.max(0, baseDenominator - attendedRelevant) : 0;
  const freq = baseDenominator > 0 ? Math.min(100, Math.round((attendedRelevant / baseDenominator) * 100)) : 0;

  // Badge zaangażowania
  let badge = { label: 'Wymaga uzupełnienia', dotColor: 'bg-slate-500', color: 'bg-slate-100 text-slate-700 border-slate-300' };
  if (baseDenominator > 0) {
    if (freq >= 90) {
      badge = { label: 'Lider', dotColor: 'bg-emerald-500', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    } else if (freq >= 75) {
      badge = { label: 'Bardzo aktywny', dotColor: 'bg-teal-500', color: 'bg-teal-50 text-teal-700 border-teal-200' };
    } else if (freq >= 50) {
      badge = { label: 'Bezpieczny brzeg', dotColor: 'bg-amber-500', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    } else if (freq >= 25) {
      badge = { label: 'Niższa aktywność', dotColor: 'bg-stone-500', color: 'bg-stone-100 text-stone-700 border-stone-300' };
    }
  }

  const attendedCount = totalAttended;
  const isCertEligible = isCertificateEligible({
    attendancePercent: freq,
    attendedMandatoryCount: attendedRelevant,
    attendedCount: totalAttended,
  }, {
    minAttendanceThreshold: minPassingPercent,
    minAttendanceCount: activeSettings.minAttendanceCount !== undefined ? activeSettings.minAttendanceCount : 3,
  });
  const certStatus = isCertEligible
    ? { canIssue: true, label: 'Można wydać', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : { canIssue: false, label: 'W toku', color: 'bg-slate-100 text-slate-700 border-slate-300' };

  // ─── KALKULACJA PUNKTÓW AKTYWNOŚCI (v9.4 Points & Merit) ───────────────────
  let meetingPoints = 0;
  let meritPoints = 0;
  let tenurePoints = 0;

  // 1. Punkty ze spotkań (z tablicy ewidencja / studentAttendance)
  studentAttendance.forEach(e => {
    if (!e) return;
    const rawVal = e.punkty !== undefined ? e.punkty : (e.points !== undefined ? e.points : (e.pkt !== undefined ? e.pkt : null));
    let p = 1; // domyślnie 1 pkt za zweryfikowaną obecność
    if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '') {
      const parsed = Number(rawVal);
      if (!isNaN(parsed)) p = parsed;
    }
    meetingPoints += p;
  });

  // Punkty z przypisanych aktywności spotkań (zbuforowany localStorage crm_attendance_*) w aktywnym roku akademickim
  if (typeof window !== 'undefined' && window.localStorage) {
    scopedMeetings.forEach(m => {
      if (!m || m.isUpcoming) return;
      const storageKeys = [
        m.id ? `crm_attendance_${m.id}` : null,
        m.date ? `crm_attendance_${m.date}` : null,
        m.code ? `crm_attendance_${m.code}` : null,
      ].filter(Boolean);

      for (const k of storageKeys) {
        const parsed = getCachedStorageJson(k);
        if (parsed) {
          const atts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.attendees) ? parsed.attendees : []);
          const matched = atts.find(att => {
            const attIdx = String(att.member?.index || att.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
            if (cleanIdxDigits && attIdx && cleanIdxDigits === attIdx) return true;
            const attEmail = String(att.member?.email || att.email || '').trim().toLowerCase();
            if (rawEmail && attEmail && rawEmail === attEmail) return true;
            return false;
          });

          if (matched && Array.isArray(matched.activities)) {
            matched.activities.forEach(actId => {
              const upper = String(actId || '').trim().toUpperCase();
              // Bazowa obecność OB_ONLINE / OB_STACJO jest już zaliczona w frekwencji ze studentAttendance
              if (upper !== 'OB_ONLINE' && upper !== 'OB_STACJO') {
                const actWeight = getActivityWeight(actId, {}, 0);
                meetingPoints += actWeight;
              }
            });
          }
        }
      }
    });
  }

  // 2. Punkty stałe z dorobku naukowego (izolowane ściśle do aktywnego roku akademickiego)
  let activeDorobek = explicitDorobek || settings?.dorobek || null;
  if (!activeDorobek) {
    activeDorobek = getCachedStorageJson('crm_dorobek') || getCachedStorageJson('skn_dorobek');
  }

  if (activeDorobek) {
    if (Array.isArray(activeDorobek)) {
      activeDorobek.forEach(item => {
        if (!item) return;
        // Weryfikacja czy data lub rok akademicki publikacji/badania przypada na activeScope
        if (!isDorobekInAcademicScope(item, activeScope)) {
          return;
        }

        const dIdx = String(item.nrIndeksu || item.index || item.cleanIndex || '').replace(/\D/g, '').replace(/^0+/, '').trim();
        const dEmail = String(item.email || '').trim().toLowerCase();
        const dName = String(item.imieNazwisko || item.name || item.fullName || '').trim().toLowerCase();

        let isMatch = false;
        if (cleanIdxDigits && dIdx && cleanIdxDigits === dIdx) isMatch = true;
        else if (rawEmail && dEmail && rawEmail === dEmail) isMatch = true;
        else if (rawFullName && dName && (rawFullName === dName || dName.includes(rawFullName) || rawFullName.includes(dName))) isMatch = true;
        else if (rawAliases && (dIdx && rawAliases.includes(dIdx) || dName && rawAliases.includes(dName))) isMatch = true;

        if (isMatch) {
          const pts = typeof item.punkty === 'number'
            ? item.punkty
            : (Number(item.punkty) || Number(item.points) || Number(item.pkt) || 0);
          meritPoints += pts;
        }
      });
    } else if (typeof activeDorobek === 'object') {
      const entry = activeDorobek[cleanIdxDigits] || (rawIdx ? activeDorobek[rawIdx] : null) || (rawEmail ? activeDorobek[rawEmail] : null);
      if (typeof entry === 'number') {
        meritPoints += entry;
      } else if (entry && typeof entry === 'object') {
        if (Array.isArray(entry)) {
          entry.forEach(it => {
            if (isDorobekInAcademicScope(it, activeScope)) {
              meritPoints += Number(it.punkty || it.points || it.pkt || 0);
            }
          });
        } else if (isDorobekInAcademicScope(entry, activeScope)) {
          meritPoints += Number(entry.punkty || entry.points || entry.totalPoints || 0);
        }
      }
    }
  }

  // 3. Punkty z kadencji zarządu (skn_board_tenures) – tylko miesiące przypadające na activeScope
  const BOARD_ROLE_MONTHLY_WEIGHTS = {
    'Przewodniczący / Przewodnicząca': 3,
    'Wiceprzewodniczący / Wiceprzewodnicząca': 3,
    'Sekretarz Koła': 3,
    'Członek / Członkini Zarządu': 3,
    'Członek Zarządu': 3,
    'Członkini Zarządu': 3,
    'Skarbnik': 3,
    'Koordynator ds. Badań': 4,
    'Lider IT / Koordynator CRM': 5,
    'Moderator Social Media / Grup': 5,
    'Przewodniczący': 3,
    'Przewodnicząca': 3,
    'Wiceprzewodniczący': 3,
    'Wiceprzewodnicząca': 3,
  };

  let activeTenures = explicitBoardTenures || settings?.boardTenures || null;
  if (!activeTenures) {
    const parsedTenures = getCachedStorageJson('skn_board_tenures');
    if (Array.isArray(parsedTenures)) activeTenures = parsedTenures;
  }

  if (Array.isArray(activeTenures)) {
    activeTenures.forEach(t => {
      if (!t) return;
      const tIdx = String(t.memberIndex || t.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
      const tEmail = String(t.memberEmail || t.email || '').trim().toLowerCase();
      const tName = String(t.memberName || t.name || '').trim().toLowerCase();

      let isMatch = false;
      if (cleanIdxDigits && tIdx && cleanIdxDigits === tIdx) isMatch = true;
      else if (rawEmail && tEmail && rawEmail === tEmail) isMatch = true;
      else if (rawFullName && tName && (rawFullName === tName || tName.includes(rawFullName) || rawFullName.includes(tName))) isMatch = true;

      if (isMatch) {
        const ptsPerMonth = BOARD_ROLE_MONTHLY_WEIGHTS[t.roleName] || 3;
        const months = getTenureMonthsInScope(t, activeScope);
        if (months > 0) {
          tenurePoints += months * ptsPerMonth;
        }
      }
    });
  }

  // 4. Punkty łączone: SSOT wyliczane ściśle z aktywności, dorobku i zarządu w danym roku akademickim.
  // Nie sumujemy zbiorczego dożywotniego total_points z bazy profilu!
  const totalPoints = Math.max(0, meetingPoints + meritPoints + tenurePoints);

  const displayPercentage = (totalAttended === 0 && zeroAttendanceDisplay === 'NEUTRAL_DASH')
    ? '—'
    : `${isNaN(freq) ? 0 : freq}%`;

  const displayRatio = `${attendedRelevant} / ${baseDenominator}`;

  const academicStatus = getMemberAcademicStatus({
    freq: isNaN(freq) ? 0 : freq,
    present: totalAttended,
    points: totalPoints,
    isCertEligible,
    academicYear: academicYearKey || activeScope?.id,
    currentYear: getCurrentAcademicYear(),
  });

  return {
    freq: isNaN(freq) ? 0 : freq,
    percentage: isNaN(freq) ? 0 : freq,
    attendedCount: totalAttended,
    present: totalAttended,
    absent: absentCount,
    presentMandatory: finalPresentMandatory,
    mandatoryTotal: baseDenominator,
    baseDenominator,
    optionalBonus,
    totalAttended,
    attendedRecords: studentAttendance,
    isCertEligible,
    canGetCertificate: isCertEligible,
    displayRatio,
    displayPercentage,
    badge,
    certStatus,
    academicStatus,
    completionStatus: academicStatus.label,
    // Punkty v9.4 (Points & Merit)
    points: totalPoints,
    totalPoints,
    punkty: totalPoints,
    meetingPoints,
    meritPoints,
    tenurePoints,
  };
}

/**
 * Wylicza frekwencję członka na podstawie skategoryzowanych i zakończonych spotkań
 */
export function calculateCategorizedFrequency(
  memberOrIndex,
  meetings = [],
  customTypes = {},
  fallbackPresent = 0,
  fallbackAbsent = 0,
  ewidencja = null,
  settings = {}
) {
  return calculateMemberStats(memberOrIndex, ewidencja, meetings, customTypes, settings);
}
