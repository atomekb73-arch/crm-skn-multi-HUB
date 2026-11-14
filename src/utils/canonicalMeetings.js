// ─── Canonical Meetings Registry (Clean Production) ───────────────────────────

export const CANONICAL_MEETINGS_TEMPLATE = [];
export const CANONICAL_MEETINGS_2025_2026 = [];
export const CANONICAL_MEETINGS_SKNU = [];
export const CANONICAL_MEETINGS_PSYCHOONKOLOGIA = [];

/**
 * Filtruje techniczne wpisy organizacyjne (np. DEADLINE, przypomnienia, terminy zgłoszeń)
 */
export function filterLegitimateMeetings(meetings = [], orgId = 'skn_seksuologii') {
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

export function getCanonicalMeetingsForOrg(orgId = 'skn_seksuologii') {
  return [];
}

export function getCanonicalMeetings() {
  return [];
}

export default CANONICAL_MEETINGS_TEMPLATE;
