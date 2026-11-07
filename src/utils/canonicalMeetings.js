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
    name: 'TEST-M03: Panel Dyskusyjny i Przygotowanie Narzędzi Badawczych',
    title: 'TEST-M03: Panel Dyskusyjny i Przygotowanie Narzędzi Badawczych',
    date: '2025-11-26',
    start_dt: '2025-11-26T18:00:00',
    end_dt: '2025-11-26T20:00:00',
    type: 'Spotkanie merytoryczne',
    category: 'merytoryczne',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Konstrukcja autorskiej ankiety psychometrycznej i pilotaż na próbie studenckiej.',
    organization_id: 'test'
  },
  {
    id: 'test-m04-2025',
    code: 'TEST-M04',
    name: 'TEST-M04: Zebranie Zarządu i Podsumowanie Naboru',
    title: 'TEST-M04: Zebranie Zarządu i Podsumowanie Naboru',
    date: '2025-12-10',
    start_dt: '2025-12-10T17:30:00',
    end_dt: '2025-12-10T19:30:00',
    type: 'Spotkanie organizacyjne',
    category: 'organizacyjne',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Rozpatrzenie deklaracji członkowskich z kwarantanny, uchwały o przyjęciu nowych członków i budżet koła.',
    organization_id: 'test'
  },
  {
    id: 'test-m05-2026',
    code: 'TEST-M05',
    name: 'TEST-M05: Warsztaty Pisania Abstraktów Konferencyjnych',
    title: 'TEST-M05: Warsztaty Pisania Abstraktów Konferencyjnych',
    date: '2026-01-14',
    start_dt: '2026-01-14T18:00:00',
    end_dt: '2026-01-14T20:00:00',
    type: 'Warsztat naukowy',
    category: 'warsztat',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Struktura abstraktu IMRaD, wymogi komitetów naukowych i przygotowanie zgłoszeń na zjazdy ogólnopolskie.',
    organization_id: 'test'
  },
  {
    id: 'test-m06-2026',
    code: 'TEST-M06',
    name: 'TEST-M06: Seminarium z Opiekunem Naukowym – Etapy Recenzji',
    title: 'TEST-M06: Seminarium z Opiekunem Naukowym – Etapy Recenzji',
    date: '2026-02-18',
    start_dt: '2026-02-18T18:00:00',
    end_dt: '2026-02-18T20:00:00',
    type: 'Spotkanie merytoryczne',
    category: 'merytoryczne',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Konsultacje metodologiczne wyników badań ankietowych i standardy etyczne w badaniach psychologicznych.',
    organization_id: 'test'
  },
  {
    id: 'test-m07-2026',
    code: 'TEST-M07',
    name: 'TEST-M07: Próba Wystąpień i Przygotowanie Posterów Naukowych',
    title: 'TEST-M07: Próba Wystąpień i Przygotowanie Posterów Naukowych',
    date: '2026-03-18',
    start_dt: '2026-03-18T18:00:00',
    end_dt: '2026-03-18T20:30:00',
    type: 'Warsztat naukowy',
    category: 'warsztat',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Prezentacje studenckich referatów i sesja informacji zwrotnej przed konferencją instytutową.',
    organization_id: 'test'
  },
  {
    id: 'test-m08-2026',
    code: 'TEST-M08',
    name: 'TEST-M08: Zebranie Podsumowujące Semestr Letni i Sprawozdanie',
    title: 'TEST-M08: Zebranie Podsumowujące Semestr Letni i Sprawozdanie',
    date: '2026-04-15',
    start_dt: '2026-04-15T18:00:00',
    end_dt: '2026-04-15T20:00:00',
    type: 'Spotkanie podsumowujące',
    category: 'podsumowujace',
    academicYear: '2025/2026',
    subcalendarId: 'test_subcal',
    description: 'Rozliczenie punktów aktywności, zatwierdzenie protokołów sprawozdawczych i wręczenie certyfikatów członkowskich.',
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

