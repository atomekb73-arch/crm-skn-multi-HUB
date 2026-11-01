// ─── Academic Year Progression & Graduate Detection Engine ─────────────────

/**
 * Parsuje numer roku ze stringa (np. "Rok 1", "2", "V rok", "III rok")
 */
export function parseRomanOrArabic(yearStr) {
  if (!yearStr) return null;
  const s = String(yearStr).trim().toUpperCase();

  // Rzymskie
  if (/\bV\b|ROK\s*V\b|V\s*ROK/.test(s)) return 5;
  if (/\bIV\b|ROK\s*IV\b|IV\s*ROK/.test(s)) return 4;
  if (/\bIII\b|ROK\s*III\b|III\s*ROK/.test(s)) return 3;
  if (/\bII\b|ROK\s*II\b|II\s*ROK/.test(s)) return 2;
  if (/\bI\b|ROK\s*I\b|I\s*ROK/.test(s)) return 1;

  // Cyfra arabska
  const match = s.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

import {
  ACADEMIC_SCOPES,
  ACADEMIC_YEARS,
  getAcademicScope,
  isEwidencjaInAcademicScope,
  isEwidencjaMatchForMeeting,
  getCurrentAcademicYear,
  isMeetingInAcademicScope,
  isAcademicYearPast,
  isAcademicYearFuture,
  getAcademicYearTimeStatus,
  getMemberAcademicStatus,
  isDorobekInAcademicScope,
  getTenureMonthsInScope,
} from './academicScope.js';

export {
  ACADEMIC_SCOPES,
  ACADEMIC_YEARS,
  getAcademicScope,
  isEwidencjaInAcademicScope,
  isEwidencjaMatchForMeeting,
  getCurrentAcademicYear,
  isMeetingInAcademicScope,
  isAcademicYearPast,
  isAcademicYearFuture,
  getAcademicYearTimeStatus,
  getMemberAcademicStatus,
  isDorobekInAcademicScope,
  getTenureMonthsInScope,
};
export { getAcademicYearFromDate } from './helpers.js';

/**
 * Bezpieczna normalizacja klucza roku akademickiego
 */
export function getYearKey(yearStr) {
  if (!yearStr) return getCurrentAcademicYear();
  const s = String(yearStr).trim();
  if (s === 'custom') return 'custom';

  const fullMatch = s.match(/\b(20\d\d)\/(20\d\d)\b/);
  if (fullMatch) return `${fullMatch[1]}/${fullMatch[2]}`;

  const shortMatch = s.match(/\b(\d\d)\/(\d\d)\b/);
  if (shortMatch) {
    const startCentury = 2000 + parseInt(shortMatch[1], 10);
    const endCentury = 2000 + parseInt(shortMatch[2], 10);
    return `${startCentury}/${endCentury}`;
  }

  return s;
}

export const getAcademicYearKey = getYearKey;

/**
 * Formatuje dynamiczną etykietę roku akademickiego z dynamicznym oznaczeniem "(Bieżący)"
 * @param {string} yearStr np. "2026/2027"
 * @param {string} [currentYear] opcjonalnie bieżący rok
 * @returns {string} np. "2026/2027 (Bieżący)" lub "2025/2026 (Poprzedni)"
 */
export function formatAcademicYearLabel(yearStr, currentYear = getCurrentAcademicYear()) {
  if (!yearStr) return '';
  const clean = getYearKey(yearStr);
  if (clean === 'custom') return 'Własny zakres dat...';

  if (clean === currentYear) {
    return `${clean} (Bieżący)`;
  }

  const [startY] = clean.split('/').map(Number);
  const [curStartY] = currentYear.split('/').map(Number);
  if (startY && curStartY && startY === curStartY - 1) {
    return `${clean} (Poprzedni)`;
  }
  if (startY && curStartY && startY === curStartY + 1) {
    return `${clean} (Kolejny)`;
  }
  return clean;
}

/**
 * Generuje tablicę opcji lat akademickich dla list rozwijanych (dropdown)
 * z dynamicznym przypisaniem etykiety "(Bieżący)" do aktualnego roku.
 * @param {number} spanPast liczba lat wstecz (domyślnie 2)
 * @param {number} spanFuture liczba lat w przód (domyślnie 1)
 * @param {Date} refDate data referencyjna
 * @returns {Array<{ value: string, label: string, short: string, isCurrent: boolean }>}
 */
export function getAcademicYearOptions(spanPast = 2, spanFuture = 1, refDate = new Date()) {
  const currentYear = getCurrentAcademicYear(refDate);
  const [curStartY] = currentYear.split('/').map(Number);

  const options = [];
  const startY = curStartY + spanFuture;
  const endY = curStartY - spanPast;

  for (let y = startY; y >= endY; y--) {
    const val = `${y}/${y + 1}`;
    const short = `${String(y).slice(-2)}/${String(y + 1).slice(-2)}`;
    const isCurrent = val === currentYear;
    let label = val;
    if (isCurrent) {
      label = `${val} (Bieżący)`;
    } else if (y === curStartY - 1) {
      label = `${val} (Poprzedni)`;
    } else if (y === curStartY + 1) {
      label = `${val} (Kolejny)`;
    }
    options.push({
      value: val,
      label,
      short,
      isCurrent,
    });
  }

  return options;
}

/**
 * Zwraca początkowy rok akademicki dla danej daty (rok akademicki startuje 1 października)
 * Np. 10.10.2025 -> 2025 (rok akad. 2025/2026)
 * Np. 15.05.2025 -> 2024 (rok akad. 2024/2025)
 */
export function getAcademicStartYear(dateObj) {
  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return null;
  }
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth(); // 0-indexed: 9 = Październik
  return month >= 9 ? year : year - 1;
}

// ─── Cykle kształcenia i kalkulacja semestrów ─────────────────────────────

/**
 * Cykle kształcenia w polskim szkolnictwie wyższym:
 * - LICENCJAT (I stopnia): 3 lata / 6 semestrów
 * - JEDNOLITE MAGISTERSKIE (np. Psychologia): 5 lat / 10 semestrów
 * - MAGISTERSKIE UZUPEŁNIAJĄCE (II stopnia): 2 lata / 4 semestry
 */
export const STUDY_CYCLES = {
  licencjat: { id: 'licencjat', label: 'Licencjackie (I stopnia, 3 lata / 6 sem.)', years: 3, semesters: 6 },
  jednolite_mgr: { id: 'jednolite_mgr', label: 'Jednolite magisterskie (5 lat / 10 sem.)', years: 5, semesters: 10 },
  magisterskie: { id: 'magisterskie', label: 'Magisterskie uzupełniające (II stopnia, 2 lata / 4 sem.)', years: 2, semesters: 4 },
};

/**
 * Oblicza postęp semestralny, semestr bieżący oraz statusy końcowe (Ostatni semestr / Absolwent)
 * z uwzględnieniem semestru startowego i roku rozpoczęcia studiów.
 */
export function calculateMemberSemesterProgress(memberData, referenceDate = new Date()) {
  let now = referenceDate instanceof Date ? referenceDate : (referenceDate ? new Date(referenceDate) : new Date());
  if (isNaN(now.getTime())) now = new Date();
  const member = memberData || {};
  const custom = member.custom_fields || {};

  const fLower = String(member.field || member.kierunek || '').toLowerCase();
  const rawCycle = String(member.studyCycle || member.study_cycle || custom.studyCycle || custom.study_cycle || '').toLowerCase();

  let studyCycle = 'jednolite_mgr';
  if (rawCycle.includes('lic') || rawCycle === 'licencjat' || fLower.includes('lic') || fLower.includes('i stopnia')) {
    studyCycle = 'licencjat';
  } else if (rawCycle.includes('mgr') || rawCycle === 'magisterskie' || fLower.includes('ii stopnia') || fLower.includes('podyplom')) {
    studyCycle = 'magisterskie';
  } else {
    studyCycle = 'jednolite_mgr';
  }

  const cycleDef = STUDY_CYCLES[studyCycle] || STUDY_CYCLES.jednolite_mgr;
  const maxSemesters = cycleDef.semesters;
  const maxYears = cycleDef.years;

  // Semestr startowy (domyślnie 1 - semestr zimowy)
  const startSemester = Math.max(1, Math.min(maxSemesters, Number(member.startSemester || member.start_semester || custom.startSemester || custom.start_semester) || 1));

  // Rok rozpoczęcia studiów
  let startYearStr = member.startYear || member.start_year || custom.startYear || custom.start_year || '';
  let startAcYear = null;

  if (startYearStr) {
    const m = String(startYearStr).match(/20\d\d/);
    if (m) startAcYear = parseInt(m[0], 10);
  }

  if (!startAcYear) {
    const rawDate = member.timestamp || member.dataWplywu || member.created_at || member.rawTimestamp;
    let d = null;
    if (rawDate instanceof Date) d = rawDate;
    else if (typeof rawDate === 'string' && rawDate.trim()) {
      d = new Date(rawDate);
      if (isNaN(d.getTime())) {
        const parts = rawDate.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (parts) d = new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
      }
    }
    startAcYear = getAcademicStartYear(d) || getAcademicStartYear(now) || 2025;
    if (!startYearStr) {
      startYearStr = `${startAcYear}/${startAcYear + 1}`;
    }
  }

  const currentAcYear = getAcademicStartYear(now) || 2026;
  const currentMonth = now.getMonth(); // 0-indexed: 2=marzec, 8=wrzesień
  const isSummerTerm = currentMonth >= 2 && currentMonth <= 8;

  const yearDiff = Math.max(0, currentAcYear - startAcYear);
  const elapsed = yearDiff * 2 + (isSummerTerm ? 1 : 0);
  const currentSemester = startSemester + elapsed;

  const isFinalSemester = currentSemester === maxSemesters;
  const isGraduate = currentSemester > maxSemesters;

  const academicStatus = isGraduate
    ? 'Absolwent'
    : isFinalSemester
    ? 'Ostatni semestr'
    : 'W toku studiów';

  const semesterLabel = isGraduate
    ? 'Absolwent'
    : isFinalSemester
    ? `Semestr ${currentSemester} (Ostatni semestr)`
    : `Semestr ${currentSemester}`;

  return {
    studyCycle,
    cycleLabel: cycleDef.label,
    startYear: startYearStr,
    startSemester,
    currentSemester,
    maxSemesters,
    maxYears,
    isFinalSemester,
    isGraduate,
    academicStatus,
    semesterLabel,
  };
}

/**
 * Oblicza aktualny rok studiów, status progresji, semestr oraz wykrywa absolwentów
 * @param {Date|string|object} registrationDateOrMember - Data zgłoszenia / wpisu lub obiekt członka
 * @param {string|number} originalYearStr - Oryginalnie podany rok (np. "Rok 2", "1")
 * @param {string} fieldOfStudy - Kierunek studiów (do detekcji licencjat vs magister)
 * @param {Date} now - Bieżąca data referencyjna
 * @param {object} options - Opcjonalne parametry startYear, startSemester, studyCycle
 */
export function calculateCurrentStudyYear(registrationDateOrMember, originalYearStr, fieldOfStudy = '', nowOrOptions = new Date(), maybeOptions = {}) {
  let memberObj = null;
  let regDate = registrationDateOrMember;
  let yearStr = originalYearStr;
  let field = fieldOfStudy;

  let now = new Date();
  let options = maybeOptions || {};

  if (nowOrOptions instanceof Date) {
    now = nowOrOptions;
  } else if (typeof nowOrOptions === 'string' && !isNaN(new Date(nowOrOptions).getTime())) {
    now = new Date(nowOrOptions);
  } else if (nowOrOptions && typeof nowOrOptions === 'object') {
    options = { ...nowOrOptions, ...options };
    if (!memberObj) memberObj = nowOrOptions;
  }

  if (registrationDateOrMember && typeof registrationDateOrMember === 'object' && !(registrationDateOrMember instanceof Date)) {
    memberObj = registrationDateOrMember;
    regDate = memberObj.rawTimestamp || memberObj.timestamp || memberObj.dataWplywu || memberObj.created_at;
    yearStr = memberObj.year || memberObj.rokStudiow || originalYearStr;
    field = memberObj.field || memberObj.kierunek || fieldOfStudy;
  }

  const semProgress = calculateMemberSemesterProgress({
    ...(memberObj || {}),
    field,
    year: yearStr,
    timestamp: regDate,
    ...options,
  }, now);

  const originalYear = parseRomanOrArabic(yearStr);
  let regDateObj = null;
  if (regDate instanceof Date) regDateObj = regDate;
  else if (typeof regDate === 'string' && regDate.trim()) {
    const d = new Date(regDate);
    if (!isNaN(d.getTime())) regDateObj = d;
  }

  const regStartYear = getAcademicStartYear(regDateObj);
  const currentStartYear = getAcademicStartYear(now);
  const diff = (regStartYear != null && currentStartYear != null)
    ? Math.max(0, currentStartYear - regStartYear)
    : Math.max(0, Math.floor((semProgress.currentSemester - semProgress.startSemester) / 2));

  const currentYear = originalYear ? originalYear + diff : Math.ceil(semProgress.currentSemester / 2);
  const isGraduate = semProgress.isGraduate;
  const isFinalSemester = semProgress.isFinalSemester;

  return {
    originalYear,
    currentYear,
    currentYearLabel: isGraduate ? 'Absolwent' : `Rok ${currentYear}`,
    diff,
    isProgressed: diff > 0,
    isGraduate,
    isFinalSemester,
    maxYears: semProgress.maxYears,
    maxSemesters: semProgress.maxSemesters,
    currentSemester: semProgress.currentSemester,
    startYear: semProgress.startYear,
    startSemester: semProgress.startSemester,
    studyCycle: semProgress.studyCycle,
    semesterLabel: semProgress.semesterLabel,
    academicStatus: semProgress.academicStatus,
  };
}
