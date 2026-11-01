/**
 * Global Academic Scopes & Years Definition
 * Definicje okresów akademickich dla całego systemu CRM z automatycznym wyznaczaniem roku bieżącego
 */

/**
 * Automatycznie wyznacza bieżący rok akademicki na podstawie aktualnej daty systemu (gdzie rok akademicki startuje 1 października).
 * Np. od 1 października 2026 r. bieżącym rokiem jest "2026/2027", a przed 1 października 2026 r. był to "2025/2026".
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} np. "2026/2027"
 */
export function getCurrentAcademicYear(dateInput = new Date()) {
  let d = null;
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    d = dateInput;
  } else if (typeof dateInput === 'string' && dateInput.trim()) {
    const trimmed = dateInput.trim();
    const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmyMatch) {
      d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    } else {
      d = new Date(trimmed);
    }
  } else if (typeof dateInput === 'number') {
    d = new Date(dateInput);
  }

  if (!d || isNaN(d.getTime())) {
    d = new Date();
  }

  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = styczeń, 9 = październik
  const startYear = month >= 9 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}/${endYear}`;
}

const _curAcademicYear = getCurrentAcademicYear();
const [_curStartNum] = _curAcademicYear.split('/').map(Number);
const _prevAcademicYear = `${_curStartNum - 1}/${_curStartNum}`;

export const ACADEMIC_SCOPES = {
  CURRENT: {
    id: _curAcademicYear,
    label: `Rok akademicki ${_curAcademicYear} (Bieżący)`,
    startDate: `${_curStartNum}-10-01`,
    endDate: `${_curStartNum + 1}-09-30`,
    yearPrefix: `${String(_curStartNum).slice(-2)}/${String(_curStartNum + 1).slice(-2)}`,
    isCurrent: true,
  },
  PREVIOUS: {
    id: _prevAcademicYear,
    label: `Rok akademicki ${_prevAcademicYear} (Poprzedni)`,
    startDate: `${_curStartNum - 1}-10-01`,
    endDate: `${_curStartNum}-09-30`,
    yearPrefix: `${String(_curStartNum - 1).slice(-2)}/${String(_curStartNum).slice(-2)}`,
    isCurrent: false,
  },
  CUSTOM: {
    id: 'custom',
    label: 'Własny zakres dat...',
    isCurrent: false,
  }
};

export const ACADEMIC_YEARS = {
  [_curAcademicYear]: ACADEMIC_SCOPES.CURRENT,
  [_prevAcademicYear]: ACADEMIC_SCOPES.PREVIOUS,
};

export function getAcademicScope(id, customStart = null, customEnd = null) {
  const current = getCurrentAcademicYear();
  const [curStartY] = current.split('/').map(Number);

  if (!id) return ACADEMIC_SCOPES.CURRENT;

  if (id === 'custom') {
    return {
      ...ACADEMIC_SCOPES.CUSTOM,
      startDate: customStart || `${curStartY}-10-01`,
      endDate: customEnd || `${curStartY + 1}-09-30`,
      yearPrefix: 'Własny',
    };
  }

  let cleanId = String(id).trim();
  const shortMatch = cleanId.match(/^(\d{2})\/(\d{2})$/);
  if (shortMatch) {
    cleanId = `20${shortMatch[1]}/20${shortMatch[2]}`;
  }

  const match = cleanId.match(/^(\d{4})\/(\d{4})$/);
  if (match) {
    const startY = parseInt(match[1], 10);
    const endY = parseInt(match[2], 10);
    const isCurrent = cleanId === current;
    let label = `Rok akademicki ${cleanId}`;
    if (isCurrent) {
      label += ' (Bieżący)';
    } else if (startY === curStartY - 1) {
      label += ' (Poprzedni)';
    } else if (startY === curStartY + 1) {
      label += ' (Kolejny)';
    }

    return {
      id: cleanId,
      label,
      startDate: `${startY}-10-01`,
      endDate: `${endY}-09-30`,
      yearPrefix: `${String(startY).slice(-2)}/${String(endY).slice(-2)}`,
      isCurrent,
    };
  }

  if (cleanId.includes('26/27') || cleanId.includes('2026/2027')) {
    return getAcademicScope('2026/2027', customStart, customEnd);
  }
  if (cleanId.includes('25/26') || cleanId.includes('2025/2026')) {
    return getAcademicScope('2025/2026', customStart, customEnd);
  }

  return ACADEMIC_SCOPES.CURRENT;
}

/**
 * Sprawdza, czy rekord z ewidencji obecności dokładnie odpowiada danemu spotkaniu
 * Zapobiega fałszywym powiązaniom między różnymi latami akademickimi (np. [25/26] M07 vs [26/27] M07).
 *
 * @param {Object} e - rekord obecności (np. z crm_ewidencja)
 * @param {Object} m - obiekt spotkania
 * @returns {boolean}
 */
export function isEwidencjaMatchForMeeting(e, m) {
  if (!e || !m) return false;

  const rawEDate = String(e.dataSpotkania || e.date || e.joinTime || '').trim();
  const eDate = rawEDate.includes('T') ? rawEDate.split('T')[0] : (rawEDate.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(rawEDate) ? rawEDate.substring(0, 10) : rawEDate);
  const mDate = String(m.date || (m.start_dt ? m.start_dt.split('T')[0] : '')).trim();

  // 1. Jeśli oba obiekty posiadają sformatowane daty (YYYY-MM-DD) i daty się różnią, to NIE jest to samo spotkanie
  if (eDate && mDate && /^\d{4}-\d{2}-\d{2}$/.test(eDate) && /^\d{4}-\d{2}-\d{2}$/.test(mDate) && eDate !== mDate) {
    return false;
  }

  // 2. Bezpośrednie dopasowanie po identycznej dacie
  if (eDate && mDate && eDate === mDate) return true;

  const eCode = String(e.kodSpotkania || e.meetingCode || '').replace(/[\[\]]/g, '').trim().toUpperCase();
  const mCode = String(m.code || m.id || '').replace(/[\[\]]/g, '').trim().toUpperCase();

  // 3. Bezpośrednie dopasowanie po identycznym pełnym kodzie
  if (eCode && mCode && eCode === mCode) return true;

  // 4. Dopasowanie po kodzie numerycznym Mxx z weryfikacją lat akademickich
  const eCleanCode = eCode.replace(/^(25\/26|26\/27)\s*/, '').trim();
  const mCleanCode = mCode.replace(/^(25\/26|26\/27)\s*/, '').trim();

  if (eCleanCode && mCleanCode && eCleanCode === mCleanCode) {
    const eHas2526 = eCode.includes('25/26') || (eDate && eDate < '2026-10-01');
    const eHas2627 = eCode.includes('26/27') || (eDate && eDate >= '2026-10-01');
    const mHas2526 = mCode.includes('25/26') || (mDate && mDate < '2026-10-01') || String(m.academicYear || '').includes('25/26');
    const mHas2627 = mCode.includes('26/27') || (mDate && mDate >= '2026-10-01') || String(m.academicYear || '').includes('26/27');

    if (eHas2526 && mHas2627) return false;
    if (eHas2627 && mHas2526) return false;
    return true;
  }

  return false;
}

/**
 * Sprawdza, czy rekord z ewidencji obecności należy do danego zakresu akademickiego
 * @param {Object} e - rekord obecności (np. z crm_ewidencja)
 * @param {Object} scope - aktywny zakres akademicki { id, startDate, endDate, yearPrefix }
 * @param {Array} meetings - opcjonalna lista spotkań dla danego zakresu
 * @returns {boolean}
 */
export function isEwidencjaInAcademicScope(e, scope, meetings = []) {
  if (!e) return false;

  const rawDate = String(e.dataSpotkania || e.date || e.joinTime || '').trim();
  const eDate = rawDate.includes('T') ? rawDate.split('T')[0] : (rawDate.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.substring(0, 10) : rawDate);
  const eCode = String(e.kodSpotkania || e.meetingCode || '').replace(/[\[\]]/g, '').trim().toUpperCase();

  // 1. Twarda weryfikacja daty w ramach [startDate, endDate]
  if (eDate && /^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
    if (scope?.startDate && eDate < scope.startDate) return false;
    if (scope?.endDate && eDate > scope.endDate) return false;
    return true;
  }

  // 2. Bezpośrednie dopasowanie do listy spotkań aktywnego zakresu (zabezpieczone przed kolizjami między latami)
  if (Array.isArray(meetings) && meetings.length > 0) {
    const isDirectMatch = meetings.some(m => isEwidencjaMatchForMeeting(e, m));
    if (isDirectMatch) return true;
  }

  // 3. Weryfikacja po prefiksie roku w kodzie spotkania (np. [25/26] vs [26/27])
  if (scope?.id === '2026/2027' || scope?.yearPrefix === '26/27') {
    if (eCode.includes('25/26') || eCode.includes('2025')) return false;
    if (eCode.includes('26/27') || eCode.includes('2026/2027')) return true;
  } else if (scope?.id === '2025/2026' || scope?.yearPrefix === '25/26') {
    if (eCode.includes('26/27') || eCode.includes('2027')) return false;
    if (eCode.includes('25/26') || eCode.includes('2025/2026')) return true;
  }

  // 4. Jeśli zdefiniowano sztywne granice dat, a rekord nie ma daty ani nie pasuje do spotkań z tego roku
  if (scope?.startDate && scope?.endDate) {
    return false;
  }

  return true;
}

/**
 * Sprawdza, czy spotkanie należy do danego zakresu roku akademickiego.
 * Izoluje spotkania pomiędzy latami (np. 2024/2025 vs 2025/2026 vs 2026/2027).
 *
 * @param {Object} m - obiekt spotkania
 * @param {Object} scope - aktywny zakres akademicki
 * @returns {boolean}
 */
export function isMeetingInAcademicScope(m, scope) {
  if (!m || !scope) return false;

  const mAcad = String(m.academicYear || m.academicYearShort || '').replace(/[\[\]]/g, '').trim();
  const scopeId = String(scope.id || '').replace(/[\[\]]/g, '').trim();
  const scopePrefix = String(scope.yearPrefix || '').replace(/[\[\]]/g, '').trim();

  // 1. Sprawdź explicit pole academicYear na spotkaniu
  if (mAcad) {
    if (scopeId && (mAcad === scopeId || mAcad.includes(scopeId) || scopeId.includes(mAcad))) return true;
    if (scopePrefix && (mAcad === scopePrefix || mAcad.includes(scopePrefix))) return true;
    const mMatch = mAcad.match(/(\d{2,4})\/(\d{2,4})/);
    const sMatch = scopeId.match(/(\d{2,4})\/(\d{2,4})/);
    if (mMatch && sMatch) {
      const mY = mMatch[1].slice(-2);
      const sY = sMatch[1].slice(-2);
      if (mY !== sY) return false;
    }
  }

  // 2. Weryfikacja po dacie spotkania (YYYY-MM-DD lub DD.MM.YYYY)
  const rawDate = m.date || m.start_dt || m.dataSpotkania || m.data;
  if (rawDate) {
    const dStr = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();
    let dFormatted = dStr;
    const dmy = dStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
      dFormatted = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dFormatted) && scope.startDate && scope.endDate) {
      return dFormatted >= scope.startDate && dFormatted <= scope.endDate;
    }
  }

  // 3. Weryfikacja po kodzie spotkania (np. [25/26] M01 vs [26/27] M01)
  const mCode = String(m.code || m.id || '').toUpperCase();
  if (scopePrefix && mCode.includes(scopePrefix)) return true;
  if (scopeId) {
    const parts = scopeId.split('/');
    if (parts.length === 2) {
      const short = `${parts[0].slice(-2)}/${parts[1].slice(-2)}`;
      if (mCode.includes(short)) return true;
    }
  }

  return false;
}

/**
 * Sprawdza, czy wpis dorobku naukowego (publikacja, projekt badawczy) należy do danego zakresu akademickiego.
 * @param {Object} item - wpis dorobku
 * @param {Object} scope - aktywny zakres akademicki
 * @returns {boolean}
 */
export function isDorobekInAcademicScope(item, scope) {
  if (!item || !scope) return false;

  // 1. Sprawdź pole academicYear
  const itemAcad = String(item.academicYear || item.rokAkademicki || '').replace(/[\[\]]/g, '').trim();
  const scopeId = String(scope.id || '').replace(/[\[\]]/g, '').trim();
  const scopePrefix = String(scope.yearPrefix || '').replace(/[\[\]]/g, '').trim();

  if (itemAcad) {
    if (scopeId && (itemAcad === scopeId || itemAcad.includes(scopeId) || scopeId.includes(itemAcad))) return true;
    if (scopePrefix && (itemAcad === scopePrefix || itemAcad.includes(scopePrefix))) return true;
    const mMatch = itemAcad.match(/(\d{2,4})\/(\d{2,4})/);
    const sMatch = scopeId.match(/(\d{2,4})\/(\d{2,4})/);
    if (mMatch && sMatch) {
      if (mMatch[1].slice(-2) !== sMatch[1].slice(-2)) return false;
      return true;
    }
  }

  // 2. Sprawdź po dacie (YYYY-MM-DD lub DD.MM.YYYY)
  const rawDate = item.date || item.data || item.dataPublikacji || item.publicationDate;
  if (rawDate) {
    const dStr = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();
    let dFormatted = dStr;
    const dmy = dStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
      dFormatted = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dFormatted) && scope.startDate && scope.endDate) {
      return dFormatted >= scope.startDate && dFormatted <= scope.endDate;
    }
  }

  // Jeśli brak daty i roku, a zdefiniowano konkretny rok akademicki - wykluczamy
  if (scope.startDate && scope.endDate) {
    return false;
  }

  return true;
}

/**
 * Sprawdza i wylicza liczbę miesięcy nakładania się kadencji w zarządzie na dany rok akademicki.
 * @param {Object} tenure - wpis kadencji { startDate, endDate, isActive, roleName, ... }
 * @param {Object} scope - zakres akademicki { startDate, endDate }
 * @returns {number} liczba miesięcy w danym roku akademickim (0 jeśli brak nakładania)
 */
export function getTenureMonthsInScope(tenure, scope) {
  if (!tenure || !tenure.startDate) return 0;
  const tStart = new Date(tenure.startDate);
  const tEnd = (!tenure.isActive && tenure.endDate) ? new Date(tenure.endDate) : new Date();
  if (isNaN(tStart.getTime()) || isNaN(tEnd.getTime())) return 0;

  if (!scope || !scope.startDate || !scope.endDate) {
    const diffTime = Math.max(0, tEnd.getTime() - tStart.getTime());
    return Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.4375)));
  }

  const scopeStart = new Date(scope.startDate);
  const scopeEnd = new Date(scope.endDate);

  const overlapStart = new Date(Math.max(tStart.getTime(), scopeStart.getTime()));
  const overlapEnd = new Date(Math.min(tEnd.getTime(), scopeEnd.getTime()));

  if (overlapEnd < overlapStart) {
    return 0;
  }

  const diffDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.round(diffDays / 30.4375));
}

/**
 * Sprawdza czy dany rok akademicki jest rokiem przeszłym (zakończonym).
 * @param {string} academicYear np. "2024/2025" lub "2025/2026"
 * @param {string} [currentYear] domyślnie bieżący rok z systemu
 * @returns {boolean}
 */
export function isAcademicYearPast(academicYear, currentYear = getCurrentAcademicYear()) {
  if (!academicYear) return false;
  const matchA = String(academicYear).match(/(\d{4})\/(\d{4})/);
  const matchC = String(currentYear).match(/(\d{4})\/(\d{4})/);
  if (!matchA || !matchC) return false;
  return parseInt(matchA[1], 10) < parseInt(matchC[1], 10);
}

/**
 * Sprawdza czy dany rok akademicki jest rokiem przyszłym (planowanym).
 * @param {string} academicYear np. "2027/2028"
 * @param {string} [currentYear] domyślnie bieżący rok z systemu
 * @returns {boolean}
 */
export function isAcademicYearFuture(academicYear, currentYear = getCurrentAcademicYear()) {
  if (!academicYear) return false;
  const matchA = String(academicYear).match(/(\d{4})\/(\d{4})/);
  const matchC = String(currentYear).match(/(\d{4})\/(\d{4})/);
  if (!matchA || !matchC) return false;
  return parseInt(matchA[1], 10) > parseInt(matchC[1], 10);
}

/**
 * Zwraca status roku akademickiego w relacji do czasu: 'PAST' | 'CURRENT' | 'FUTURE'
 * @param {string} academicYear
 * @param {string} [currentYear]
 * @returns {'PAST' | 'CURRENT' | 'FUTURE'}
 */
export function getAcademicYearTimeStatus(academicYear, currentYear = getCurrentAcademicYear()) {
  if (isAcademicYearPast(academicYear, currentYear)) return 'PAST';
  if (isAcademicYearFuture(academicYear, currentYear)) return 'FUTURE';
  return 'CURRENT';
}

/**
 * SSOT dla statusu zaliczenia studenta w oficjalnych raportach i ewidencjach.
 * Zapewnia rygorystyczne przestrzeganie reguł:
 * - Dla lat przeszłych (zakończonych): "Zaliczono", "Niezaliczono" lub "Brak aktywności" (NIGDY "W toku")
 * - Dla roku bieżącego: "Zaliczono" (po spełnieniu kryteriów) lub "W toku"
 * - Dla lat przyszłych: "Planowane"
 */
export function getMemberAcademicStatus({
  freq = 0,
  present = 0,
  points = 0,
  isCertEligible = false,
  academicYear = getCurrentAcademicYear(),
  currentYear = getCurrentAcademicYear(),
}) {
  const timeStatus = getAcademicYearTimeStatus(academicYear, currentYear);
  const numFreq = typeof freq === 'number' ? freq : Number(freq) || 0;
  const isPassing = isCertEligible || numFreq >= 50;

  if (timeStatus === 'FUTURE') {
    return {
      status: 'PLANOWANE',
      label: 'Planowane',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      isPassed: false,
    };
  }

  if (timeStatus === 'PAST') {
    if (isPassing) {
      return {
        status: 'ZALICZONO',
        label: 'Zaliczono',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        isPassed: true,
      };
    }
    if (present > 0 || points > 0) {
      return {
        status: 'NIEZALICZONO',
        label: 'Niezaliczono',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        isPassed: false,
      };
    }
    return {
      status: 'BRAK_AKTYWNOSCI',
      label: 'Brak aktywności',
      badgeClass: 'bg-slate-50 text-slate-400 border-slate-200',
      isPassed: false,
    };
  }

  // CURRENT
  if (isPassing) {
    return {
      status: 'ZALICZONO',
      label: 'Zaliczono',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isPassed: true,
    };
  }
  return {
    status: 'W_TOKU',
    label: 'W toku',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    isPassed: false,
  };
}
