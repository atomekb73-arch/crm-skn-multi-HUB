/**
 * Automatyczne wyliczanie aktualnego roku studiów i semestru na podstawie
 * polskiego kalendarza akademickiego (semestr zimowy X–II, letni III–IX).
 * Obsługuje zarówno nabór październikowy, jak i wiosenny (WSKZ).
 */

export interface AcademicProgressInput {
  year?: string | number | null;
  study_year?: string | number | null;
  rokStudiow?: string | number | null;
  semester?: string | number | null;
  current_semester?: string | number | null;
  currentSemester?: string | number | null;
  study_status_updated_at?: string | Date | null;
  studyStatusUpdatedAt?: string | Date | null;
  joined_at?: string | Date | null;
  joined_date?: string | Date | null;
  dataWplywu?: string | Date | null;
  created_at?: string | Date | null;
  studyCycle?: string | null;
  study_cycle?: string | null;
  field?: string | null;
  field_of_study?: string | null;
  kierunek?: string | null;
  custom_fields?: Record<string, any> | null;
}

export interface AcademicProgressResult {
  currentYear: number;
  currentSemester: number;
  isEstimated: boolean;
  possibleGraduation: boolean;
  maxSemester: number;
  deltaSemesters: number;
  referenceDate: Date;
  estimationNote: string | null;
  warningMessage: string | null;
}

/**
 * Zwraca monotoniczny indeks semestru dla danej daty wg kalendarza akademickiego PL:
 * - semestr zimowy: październik–grudzień (year * 2 + 1) oraz styczeń–luty ((year - 1) * 2 + 1)
 * - semestr letni: marzec–wrzesień (year * 2)
 */
export function getSemesterIndex(date: Date): number {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const month = d.getMonth() + 1; // 1..12
  const year = d.getFullYear();

  if (month >= 10) {
    return year * 2 + 1;
  }
  if (month <= 2) {
    return (year - 1) * 2 + 1;
  }
  return year * 2;
}

function isWinterSemesterDate(date: Date): boolean {
  const month = date.getMonth() + 1;
  return month >= 10 || month <= 2;
}

function parseSafeDate(raw: string | Date | null | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Wyciąga numer roku studiów (1..5) z wartości typu "Rok 1", "II rok", "Rok 2, Semestr 4", 3 itp.
 */
export function parseBaseYear(rawYear: string | number | null | undefined): number {
  if (typeof rawYear === 'number' && Number.isFinite(rawYear) && rawYear >= 1) {
    return Math.min(10, Math.floor(rawYear));
  }
  const str = String(rawYear || '').trim();
  if (!str) return 1;

  // Dopasowanie liczb arabskich po słowie "rok" lub na początku
  const rokMatch = str.match(/rok\s*(\d+)/i) || str.match(/^(\d+)\s*(?:rok|r\.?)?/i);
  if (rokMatch?.[1]) {
    const n = parseInt(rokMatch[1], 10);
    if (n >= 1 && n <= 10) return n;
  }

  // Dopasowanie cyfr rzymskich (I, II, III, IV, V)
  const romanMap: Record<string, number> = { V: 5, IV: 4, III: 3, II: 2, I: 1 };
  const romanMatch = str.match(/\b(IV|III|II|I|V)\b/i);
  if (romanMatch?.[1]) {
    const val = romanMap[romanMatch[1].toUpperCase()];
    if (val) return val;
  }

  return 1;
}

/**
 * Wyciąga jawnie zapisany numer semestru (1..10), jeśli istnieje w polu `semester`
 * lub w tekście typu "Rok 2, Semestr 4". Zwraca null dla starych rekordów z samym "Rok 1".
 */
export function parseExplicitSemester(member: AcademicProgressInput | null | undefined): number | null {
  if (!member) return null;
  const cf = member.custom_fields || {};

  const directCandidates = [
    member.semester,
    cf.semester,
  ];
  for (const cand of directCandidates) {
    if (cand !== null && cand !== undefined && cand !== '') {
      const n = Number(cand);
      if (Number.isInteger(n) && n >= 1 && n <= 12) {
        return n;
      }
    }
  }

  // Sprawdź czy w polu year/study_year zapisano jawnie "Semestr X" (np. "Rok 2, Semestr 4")
  const rawYearStr = String(member.year || member.study_year || member.rokStudiow || '');
  const semMatch = rawYearStr.match(/sem(?:estr|\.)?\s*(\d{1,2})/i);
  if (semMatch?.[1]) {
    const n = parseInt(semMatch[1], 10);
    if (n >= 1 && n <= 12) return n;
  }

  return null;
}

/**
 * Określa maksymalną liczbę semestrów dla kierunku/trybu studiów:
 * - 6 dla studiów I stopnia (licencjat), jeśli typ jest znany
 * - 10 domyślnie (jednolite studia magisterskie z psychologii WSKZ)
 */
export function getMaxSemesterForMember(member: AcademicProgressInput | null | undefined): number {
  const cf = member?.custom_fields || {};
  const cycle = String(member?.studyCycle || member?.study_cycle || cf.studyCycle || cf.study_cycle || '').toLowerCase();
  const field = String(member?.field || member?.field_of_study || member?.kierunek || '').toLowerCase();

  if (cycle === 'licencjat' || cycle.includes('i stop') || field.includes('licencjat') || field.includes('i stop')) {
    return 6;
  }
  return 10;
}

/**
 * Główna funkcja wyliczająca aktualny rok i semestr studenta na dzień `targetDate`.
 */
export function calculateAcademicProgress(
  member: AcademicProgressInput | null | undefined,
  targetDateInput: Date | string = new Date()
): AcademicProgressResult {
  const targetDate = parseSafeDate(targetDateInput, new Date());
  const cf = member?.custom_fields || {};

  const rawRef =
    member?.study_status_updated_at ||
    member?.studyStatusUpdatedAt ||
    cf.study_status_updated_at ||
    member?.joined_at ||
    member?.joined_date ||
    member?.dataWplywu ||
    member?.created_at ||
    null;

  const referenceDate = parseSafeDate(rawRef, targetDate);
  const deltaSemesters = Math.max(0, getSemesterIndex(targetDate) - getSemesterIndex(referenceDate));
  const maxSemester = getMaxSemesterForMember(member);

  const explicitSemester = parseExplicitSemester(member);
  let baseSemester: number;
  let isEstimated: boolean;

  if (explicitSemester !== null) {
    // Tryb dokładny
    baseSemester = explicitSemester;
    isEstimated = false;
  } else {
    // Tryb szacunkowy (fallback dla starych rekordów z samym polem "Rok 1")
    const baseYear = parseBaseYear(member?.year || member?.study_year || member?.rokStudiow);
    baseSemester = isWinterSemesterDate(referenceDate) ? baseYear * 2 - 1 : baseYear * 2;
    isEstimated = true;
  }

  const rawCurrentSemester = baseSemester + deltaSemesters;
  const possibleGraduation = rawCurrentSemester > maxSemester;
  const currentSemester = Math.min(maxSemester, Math.max(1, rawCurrentSemester));
  const currentYear = Math.ceil(currentSemester / 2);

  return {
    currentYear,
    currentSemester,
    isEstimated,
    possibleGraduation,
    maxSemester,
    deltaSemesters,
    referenceDate,
    estimationNote: isEstimated
      ? 'Wyliczono automatycznie z daty zapisu — przy rekrutacji wiosennej sprawdź semestr'
      : null,
    warningMessage: possibleGraduation
      ? 'Zweryfikuj status studenta (możliwe ukończenie studiów)'
      : null,
  };
}
