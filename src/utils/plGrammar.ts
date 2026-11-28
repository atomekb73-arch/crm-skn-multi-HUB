/**
 * Moduł poprawnej polskiej fleksji i typografii urzędowej
 * dla zaświadczeń, dyplomów oraz pism wszystkich kół naukowych WSKZ.
 */

export type PolishGender = 'F' | 'M';
export type CertificateTense = 'current' | 'past';

const MALE_NAMES_ENDING_IN_A = new Set([
  'kuba',
  'barnaba',
  'bonawentura',
  'kosma',
  'jarema',
  'zawisza',
  'dyzma',
  'kuzma',
]);

/**
 * Wykrywa płeć ('F' | 'M') z jawnego pola `gender`/`sex` lub na podstawie pierwszego imienia.
 */
export function detectGender(memberOrName: any): PolishGender {
  if (!memberOrName) return 'M';

  if (typeof memberOrName === 'object') {
    const rawGender = String(
      memberOrName.gender || memberOrName.sex || memberOrName.custom_fields?.gender || ''
    )
      .trim()
      .toUpperCase();
    if (rawGender === 'F' || rawGender === 'K' || rawGender === 'FEMALE' || rawGender === 'KOBIETA') {
      return 'F';
    }
    if (rawGender === 'M' || rawGender === 'MALE' || rawGender === 'MEZCZYZNA' || rawGender === 'MĘŻCZYZNA') {
      return 'M';
    }
    const nameCandidate =
      memberOrName.firstName ||
      memberOrName.fullName ||
      memberOrName.full_name ||
      memberOrName.imieNazwisko ||
      '';
    return detectGender(String(nameCandidate));
  }

  const firstName = String(memberOrName).trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (!firstName) return 'M';
  if (MALE_NAMES_ENDING_IN_A.has(firstName)) return 'M';
  return firstName.endsWith('a') ? 'F' : 'M';
}

export interface GenderedForms {
  gender: PolishGender;
  honorific: string;
  legitymujacy: string;
  studentStatus: string;
  naWniosek: string;
  memberNoun: string;
  memberTitle: string;
  activeMemberTitle: string;
  veryActiveTitle: string;
  leaderTitle: string;
}

export function getGenderedForms(gender: PolishGender): GenderedForms {
  if (gender === 'F') {
    return {
      gender: 'F',
      honorific: 'Pani',
      legitymujacy: 'legitymująca się',
      studentStatus: 'będąca studentką',
      naWniosek: 'na wniosek studentki',
      memberNoun: 'członkinią',
      memberTitle: 'Członkini Koła',
      activeMemberTitle: 'Aktywna Członkini',
      veryActiveTitle: 'Bardzo Aktywna',
      leaderTitle: 'Liderka Koła',
    };
  }
  return {
    gender: 'M',
    honorific: 'Pan',
    legitymujacy: 'legitymujący się',
    studentStatus: 'będący studentem',
    naWniosek: 'na wniosek studenta',
    memberNoun: 'członkiem',
    memberTitle: 'Członek Koła',
    activeMemberTitle: 'Aktywny Członek',
    veryActiveTitle: 'Bardzo Aktywny',
    leaderTitle: 'Lider Koła',
  };
}

/**
 * Odmienia status oceny aktywności zgodnie z płcią studenta.
 */
export function formatGenderedActivityRank(
  safeFreq: number,
  gender: PolishGender,
  isPastYear = false
): string {
  const forms = getGenderedForms(gender);
  if (safeFreq >= 90) return forms.leaderTitle;
  if (safeFreq >= 75) return forms.veryActiveTitle;
  if (safeFreq >= 50) return forms.activeMemberTitle;
  return isPastYear ? 'Brak zaliczenia' : 'W trakcie realizacji';
}

/**
 * Zwraca zwrot czasownikowy dopasowany do czasu (bieżący/archiwalny rok), płci i wariantu zaświadczenia.
 */
export function getCertificateVerbPhrase({
  gender,
  tense = 'current',
  includeActivitySection = true,
}: {
  gender: PolishGender;
  tense?: CertificateTense;
  includeActivitySection?: boolean;
}): string {
  const isF = gender === 'F';
  if (tense === 'past') {
    if (includeActivitySection) {
      return isF ? 'brała aktywny udział' : 'brał aktywny udział';
    }
    return isF ? 'była członkinią' : 'był członkiem';
  }
  if (includeActivitySection) {
    return 'bierze aktywny udział';
  }
  return isF ? 'jest członkinią' : 'jest członkiem';
}

/**
 * Konwertuje numer roku studiów (1..5) na liczbę rzymską (I..V).
 */
export function toRomanYear(yearNum: number): string {
  const map: Record<number, string> = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
    6: 'VI',
  };
  const n = Math.max(1, Math.floor(Number(yearNum) || 1));
  return map[n] || String(n);
}

/**
 * Formatuje rok i semestr czysto, bez duplikatów "(rok Rok 1)":
 * np. "II rok, 4 semestr" lub "II rok" (gdy showSemester = false lub brak semestru).
 */
export function formatStudyYearAndSemester(
  yearNum: number | null | undefined,
  semesterNum?: number | null,
  showSemester = true
): string {
  const roman = toRomanYear(Number(yearNum) || 1);
  if (showSemester && semesterNum && Number(semesterNum) >= 1) {
    return `${roman} rok, ${Math.floor(Number(semesterNum))} semestr`;
  }
  return `${roman} rok`;
}

/**
 * Zamienia nazwę wydziału z mianownika na poprawny miejscownik z przyimkiem "przy":
 * np. "Wydział Psychologii WSKZ" -> "przy Wydziale Psychologii WSKZ"
 * Eliminuje błąd gramatyczny "przy Wydział".
 */
export function formatFacultyLocative(orgOrUnit: any): string {
  if (orgOrUnit && typeof orgOrUnit === 'object' && orgOrUnit.facultyLocative) {
    return sanitizeOfficialText(String(orgOrUnit.facultyLocative));
  }

  const raw =
    typeof orgOrUnit === 'string'
      ? orgOrUnit
      : String(orgOrUnit?.faculty || orgOrUnit?.unit || 'Wydział Psychologii WSKZ');

  let cleaned = raw
    .trim()
    .replace(/^przy\s+/i, '')
    .replace(/Instytut\s+Psychologii/gi, 'Wydziale Psychologii')
    .replace(/Instytucie\s+Psychologii/gi, 'Wydziale Psychologii')
    .replace(/Wydział\s+/g, 'Wydziale ')
    .replace(/WYDZIAŁ\s+/g, 'Wydziale ');

  if (!cleaned) {
    cleaned = 'Wydziale Psychologii WSKZ';
  }
  return sanitizeOfficialText(`przy ${cleaned}`);
}

/**
 * Zwraca dopełniacz pełnej nazwy koła naukowego (z jawnego pola `nameGenitive` lub inteligentnego fallbacku).
 */
export function formatOrgNameGenitive(org: any): string {
  if (org && typeof org === 'object' && org.nameGenitive) {
    return sanitizeOfficialText(String(org.nameGenitive));
  }

  const cleanId = String(org?.id || org?.orgId || '').toLowerCase().trim();
  const rawName = String(typeof org === 'string' ? org : org?.name || '').trim();
  const lower = rawName.toLowerCase();

  if (cleanId === 'skn_seksuologii' || lower.includes('seksuolog')) {
    return 'Studenckiego Koła Naukowego Seksuologii';
  }
  if (cleanId === 'uzaleznienia' || lower.includes('uzależnie') || lower.includes('ryzykown')) {
    return 'Studenckiego Koła Naukowego Zachowań Ryzykownych i Uzależnień';
  }
  if (cleanId === 'psychoonkologia' || lower.includes('psychoonkolog')) {
    return 'Studenckiego Koła Naukowego Psychoonkologii';
  }
  if (
    cleanId === 'skn_dzieci_i_mlodziezy' ||
    cleanId === 'skn_pdim' ||
    lower.includes('dzieci i młodzieży') ||
    lower.includes('dzieci i mlodziezy')
  ) {
    return 'Studenckiego Koła Naukowego Psychologii Dzieci i Młodzieży';
  }

  if (!rawName) return 'Studenckiego Koła Naukowego';
  if (/^Studenckie Koło Naukowe/i.test(rawName)) {
    return sanitizeOfficialText(rawName.replace(/^Studenckie Koło Naukowe\s*/i, 'Studenckiego Koła Naukowego '));
  }
  if (/^Koło Naukowe/i.test(rawName)) {
    return sanitizeOfficialText(rawName.replace(/^Koło Naukowe\s*/i, 'Studenckiego Koła Naukowego '));
  }
  return sanitizeOfficialText(`Studenckiego Koła Naukowego ${rawName}`);
}

/**
 * Zwraca poprawny tytuł podpisu zarządu bez duplikacji "Koła Naukowego SKN ...":
 * np. "Zarząd SKN Seksuologii" zamiast "Zarząd Koła Naukowego SKN Seksuologii".
 */
export function formatBoardSignatureTitle(org: any): string {
  if (org && typeof org === 'object' && org.boardSignatureTitle) {
    return sanitizeOfficialText(String(org.boardSignatureTitle));
  }

  const shortName = String(
    typeof org === 'string' ? org : org?.shortName || org?.name || 'Koła Naukowego'
  )
    .replace(/^\d+\s+/, '')
    .replace(/^zarząd\s+/i, '')
    .trim();

  if (/\b(SKN|KN)\b/i.test(shortName) || /koło|koła/i.test(shortName)) {
    return sanitizeOfficialText(`Zarząd ${shortName}`);
  }
  return sanitizeOfficialText(`Zarząd Koła Naukowego ${shortName}`);
}

/**
 * Formatuje datę urzędową po polsku zawsze z "r." na końcu i bez zbędnego "dn.",
 * np. "28 listopada 2026 r."
 */
export function formatOfficialPolishDate(date: Date | string = new Date()): string {
  const d = date ? new Date(date) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const formatted = valid.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return formatted.endsWith('r.') ? formatted : `${formatted} r.`;
}

/**
 * Formatuje datę z miejscowością: "Wrocław, 28 listopada 2026 r."
 */
export function formatCityPolishDate(date: Date | string = new Date(), city = 'Wrocław'): string {
  return sanitizeOfficialText(`${city}, ${formatOfficialPolishDate(date)}`);
}

/**
 * Czyści typowe błędy typograficzne i gramatyczne w tekście urzędowym.
 */
export function sanitizeOfficialText(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/przy\s+Wydział\s+/g, 'przy Wydziale ')
    .replace(/\(rok\s+Rok\s+/gi, '(')
    .replace(/Zarząd\s+Koła\s+Naukowego\s+(SKN|KN)\b/gi, 'Zarząd $1')
    .trim();
}

export interface FieldTypoDetection {
  hasTypo: boolean;
  original: string;
  suggestion: string;
}

/**
 * Wykrywa oczywiste literówki w nazwie kierunku studiów (np. "Psychologa" -> "Psychologia").
 */
export function detectFieldOfStudyTypo(field: string | null | undefined): FieldTypoDetection | null {
  const raw = String(field || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Poprawne kanoniczne nazwy
  if (lower === 'psychologia' || lower === 'psychologia w biznesie') {
    return null;
  }

  // Literówki w "Psychologia w biznesie"
  if (lower.includes('bizn') && lower !== 'psychologia w biznesie') {
    return {
      hasTypo: true,
      original: raw,
      suggestion: 'Psychologia w biznesie',
    };
  }

  // Oczywiste literówki w "Psychologia" (np. Psychologa, Psychologi, Psyhologia, Psycholgia, Psycholoiga)
  if (
    /^psyh?ch?ol[a-z]{0,5}$/i.test(lower) ||
    lower === 'psychologa' ||
    lower === 'psychologi' ||
    lower === 'psycholgia' ||
    lower === 'psycholoiga' ||
    lower === 'psyhologia'
  ) {
    return {
      hasTypo: true,
      original: raw,
      suggestion: 'Psychologia',
    };
  }

  return null;
}
