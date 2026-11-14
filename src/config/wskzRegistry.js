/**
 * Centralny słownik wszystkich 14 Kół Naukowych WSKZ (Wydział Psychologii)
 * Łączy identyfikatory bazodanowe Supabase (organization_id), podkalendarze Teamup,
 * kolory identyfikacji wizualnej oraz ikony Lucide.
 *
 * Flaga `hasActiveCrm: true` oznacza pełną instancję w przełączniku CRM (tylko 3 koła z wdrożonym CRM).
 * Flaga `hasActiveCrm: false` oznacza koła partnerskie/współorganizatorów oraz do zestawień międzykołowych.
 */

export const WSKZ_ORGANIZATIONS = [
  {
    orgId: "skn_psychologii_klinicznej",
    number: "01",
    name: "SKN Psychologii Klinicznej",
    shortName: "01 SKN Psychologii Klinicznej",
    code: "KLINICZNA",
    subcalendarId: 14518769,
    color: "#6D28D9",
    bgLight: "#EDE9FE",
    icon: "Brain",
    hasActiveCrm: false
  },
  {
    orgId: "skn_psychotraumatologii",
    number: "02",
    name: "SKN Psychotraumatologii - Integrum",
    shortName: "02 SKN Psychotraumatologii",
    code: "INTEGRUM",
    subcalendarId: 15289290,
    color: "#BE185D",
    bgLight: "#FCE7F3",
    icon: "Puzzle",
    hasActiveCrm: false
  },
  {
    orgId: "skn_psychoterapii",
    number: "03",
    name: "SKN Psychoterapii",
    shortName: "03 SKN Psychoterapii",
    code: "TERAPII",
    subcalendarId: null,
    color: "#DB2777",
    bgLight: "#FDF2F8",
    icon: "Armchair",
    hasActiveCrm: false
  },
  {
    orgId: "skn_psychologii_kryminalnej",
    number: "04",
    name: "SKN Psychologii Kryminalnej",
    shortName: "04 SKN Psychologii Kryminalnej",
    code: "KRYMINALNA",
    subcalendarId: 15106247,
    color: "#B45309",
    bgLight: "#FEF3C7",
    icon: "Search",
    hasActiveCrm: false
  },
  {
    orgId: "uzaleznienia",
    number: "05",
    name: "SKN Psychologii Zachowań Ryzykownych i Uzależnień",
    shortName: "05 SKN Zachowań Ryzykownych",
    code: "UZALEŻNIEŃ",
    subcalendarId: 15520561,
    color: "#C2410C",
    bgLight: "#FFEDD5",
    icon: "Flame",
    hasActiveCrm: true
  },
  {
    orgId: "skn_spolecznej_ewolucyjnej",
    number: "06",
    name: "SKN Psychologii Społecznej i Ewolucyjnej",
    shortName: "06 SKN Społecznej i Ewolucyjnej",
    code: "EWOLUCYJNA",
    subcalendarId: 15558004,
    color: "#D97706",
    bgLight: "#FEF3C7",
    icon: "Dna",
    hasActiveCrm: false
  },
  {
    orgId: "psychoonkologia",
    number: "07",
    name: "SKN Psychoonkologii",
    shortName: "07 SKN Psychoonkologii",
    code: "ONKOLOGII",
    subcalendarId: 15520558,
    color: "#0284C7",
    bgLight: "#E0F2FE",
    icon: "Ribbon",
    hasActiveCrm: true
  },
  {
    orgId: "skn_psychofizjologii",
    number: "08",
    name: "SKN Psychofizjologii",
    shortName: "08 SKN Psychofizjologii",
    code: "FIZJOLOGII",
    subcalendarId: 15289330,
    color: "#0D9488",
    bgLight: "#CCFBF1",
    icon: "Zap",
    hasActiveCrm: false
  },
  {
    orgId: "skn_zdrowia_srodowiska",
    number: "09",
    name: "SKN Psychologii Zdrowia i Środowiska",
    shortName: "09 SKN Zdrowia i Środowiska",
    code: "ZDROWIA",
    subcalendarId: 14519898,
    color: "#059669",
    bgLight: "#D1FAE5",
    icon: "Leaf",
    hasActiveCrm: false
  },
  {
    orgId: "skn_seksuologii",
    number: "10",
    name: "SKN Seksuologii",
    shortName: "10 SKN Seksuologii",
    code: "SEKSUOLOGII",
    subcalendarId: 14518766,
    color: "#16A34A",
    bgLight: "#DCFCE7",
    icon: "Heart",
    hasActiveCrm: true
  },
  {
    orgId: "skn_rozwoju_dzieci",
    number: "11",
    name: "SKN Psychologii Rozwoju Dzieci i Młodzieży",
    shortName: "11 SKN Rozwoju Dzieci",
    code: "ROZWOJU",
    subcalendarId: 15520555,
    color: "#A21CAF",
    bgLight: "#FAE8FF",
    icon: "Sparkles",
    hasActiveCrm: false
  },
  {
    orgId: "skn_krytycznego_myslenia",
    number: "12",
    name: "SKN Warsztat Krytycznego Myślenia",
    shortName: "12 SKN Krytycznego Myślenia",
    code: "MYŚLENIA",
    subcalendarId: 15656474,
    color: "#7E22CE",
    bgLight: "#F3E8FF",
    icon: "HelpCircle",
    hasActiveCrm: false
  },
  {
    orgId: "skn_reklamy_pr",
    number: "13",
    name: "SKN Reklamy, PR i Marketingu",
    shortName: "13 SKN Reklamy, PR i Marketingu",
    code: "REKLAMY",
    subcalendarId: 14518764,
    color: "#E11D48",
    bgLight: "#FFE4E6",
    icon: "Target",
    hasActiveCrm: false
  },
  {
    orgId: "skn_startupow",
    number: "14",
    name: "SKN Nowoczesnego Zarządzania i Start-upów",
    shortName: "14 SKN Start-upów",
    code: "STARTUP",
    subcalendarId: null,
    color: "#10B981",
    bgLight: "#D1FAE5",
    icon: "Rocket",
    hasActiveCrm: false
  }
];

export const EXCLUDED_SUBCALENDAR_IDS = [15572962, 15572975, 15572979, 15572992, 15572997, 15573005, 15582961];

/**
 * Zwraca listę organizacji z aktywną instancją CRM (3 koła).
 */
export function getActiveCrmOrganizations() {
  return WSKZ_ORGANIZATIONS.filter(org => org.hasActiveCrm);
}

/**
 * Wyszukuje koło w rejestrze po identyfikatorze organizacji (orgId).
 */
export function getWskzOrgById(orgId) {
  if (!orgId) return null;
  const cleanId = String(orgId).trim().toLowerCase();
  return WSKZ_ORGANIZATIONS.find(org => org.orgId.toLowerCase() === cleanId) || null;
}

/**
 * Wyszukuje koło po ID podkalendarza Teamup.
 */
export function getWskzOrgBySubcalendarId(subcalendarId) {
  if (!subcalendarId) return null;
  const numId = Number(subcalendarId);
  return WSKZ_ORGANIZATIONS.find(org => org.subcalendarId === numId) || null;
}

/**
 * Sprawdza, czy dany podkalendarz należy do wykluczonych (np. techniczne, archiwalne).
 */
export function isSubcalendarExcluded(subcalendarId) {
  if (!subcalendarId) return false;
  const numId = Number(subcalendarId);
  return EXCLUDED_SUBCALENDAR_IDS.includes(numId);
}
