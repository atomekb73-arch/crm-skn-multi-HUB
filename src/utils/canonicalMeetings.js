// ─── Canonical Meetings Registry (Clean Template) ───────────────────────────

export const CANONICAL_MEETINGS_TEMPLATE = [];
export const CANONICAL_MEETINGS_2025_2026 = [];
export const CANONICAL_MEETINGS_SKNU = [];
export const CANONICAL_MEETINGS_PSYCHOONKOLOGIA = [];

export const CANONICAL_MEETINGS_TEST = [
  {
    id: 'test-m01-2025',
    code: 'TEST-M01',
    name: 'TEST-M01: Zebranie Inauguracyjne Koła i Plan Badań',
    title: 'TEST-M01: Zebranie Inauguracyjne Koła i Plan Badań',
    date: '2025-10-15',
    start_dt: '2025-10-15T18:00:00',
    end_dt: '2025-10-15T20:00:00',
    type: 'Spotkanie organizacyjne',
    category: 'organizacyjne',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Inauguracja roku akademickiego 2025/2026, wybór kierunków badawczych i podział ról w zespole projektowym.',
    organization_id: 'test'
  },
  {
    id: 'test-m02-2025',
    code: 'TEST-M02',
    name: 'TEST-M02: Warsztaty Metodologiczne i Analiza Danych SPSS',
    title: 'TEST-M02: Warsztaty Metodologiczne i Analiza Danych SPSS',
    date: '2025-11-05',
    start_dt: '2025-11-05T18:00:00',
    end_dt: '2025-11-05T20:00:00',
    type: 'Warsztat naukowy',
    category: 'warsztat',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Praktyczne warsztaty ze statystyki opisowej, weryfikacji hipotez i analizy korelacji r-Pearsona w badaniach społecznych.',
    organization_id: 'test'
  },
  {
    id: 'test-m03-2025',
    code: 'TEST-M03',
    name: 'TEST-M03: Panel Dyskusyjny i Sprawozdanie Semestralne',
    title: 'TEST-M03: Panel Dyskusyjny i Sprawozdanie Semestralne',
    date: '2025-12-10',
    start_dt: '2025-12-10T18:00:00',
    end_dt: '2025-12-10T20:00:00',
    type: 'Spotkanie merytoryczne',
    category: 'merytoryczne',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Prezentacja postępów zespołów badawczych, ewaluacja aktywności członków oraz przygotowanie protokołów zaliczeniowych.',
    organization_id: 'test'
  }
];

/**
 * Filtruje techniczne wpisy organizacyjne (np. DEADLINE, przypomnienia, terminy zgłoszeń)
 */
export function filterLegitimateMeetings(meetings = [], orgId = 'skn-template') {
  if (!Array.isArray(meetings) || meetings.length === 0) return [];

  // Wyrażenia jednoznacznie wskazujące na techniczny slot organizacyjny, a nie spotkanie
  const technicalKeywords = [
    'deadline',
    'ostateczny termin',
    'termin nadsyłania',
    'termin zgłoszeń',
    'termin weryfikacji',
    'termin oddania',
    'weryfikacja zgłoszeń',
    'przypomnienie o wpłatach',
    'zamknięcie listy',
    'odwołane',
    'techniczny',
    'testowe połączenie',
    'próba połączenia',
    'slot techniczny'
  ];

  return meetings.filter(m => {
    const title = (m?.title || m?.name || '').toLowerCase();
    const type = (m?.type || '').toLowerCase();

    // Jeśli tytuł zawiera typowe oznaczenia spotkań koła, nie odrzucaj go
    const isExplicitEvent = 
      title.includes('kawiarenka') || 
      title.includes('spotkanie projektowe') || 
      title.includes('spotkanie merytoryczne') ||
      title.includes('warsztat') ||
      title.includes('konferencja');

    if (isExplicitEvent) {
      return true;
    }

    // Odrzuć tylko jeśli pasuje do jednoznacznie technicznych zwrotów
    const isTech = technicalKeywords.some(kw => title.includes(kw) || type.includes(kw));
    return !isTech;
  });
}

export function getCanonicalMeetingsForOrg(orgId = 'skn-template') {
  if (orgId === 'test') {
    return CANONICAL_MEETINGS_TEST;
  }
  return [];
}

export function getCanonicalMeetings() {
  return [];
}

export default CANONICAL_MEETINGS_TEMPLATE;

