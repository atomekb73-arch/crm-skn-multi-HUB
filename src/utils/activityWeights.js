// ─── Kanoniczny słownik kodów i wag aktywności (Activity Weights SSOT) ─────────────

export const ACTIVITY_WEIGHTS = {
  // Spotkania
  SPOTKANIE_ONLINE: 1,
  SPOTKANIE_STACJONARNE: 2,
  OB_ONLINE: 1,
  OB_STACJO: 2,

  // Aktywności merytoryczne i organizacyjne
  PREZENTACJA: 5,
  WARSZTAT_PROWADZENIE: 5,
  ORG_LOGIST: 5, // Ustalony standard: 5 pkt
  PUBLIKACJA_ARTYKUL: 10,
  POSTER: 3,
  BADANIA: 5,
  BADANIA_PROJEKT: 5,
  DYSKUSJA: 1,
  EDU_VIDEO_PDF: 8,
  CONF_BIERNA_ONLINE: 2,
  CONF_BIERNA_STACJONARNA: 3,
  KONF_BIER: 3,
  CONF_CZYNNA: 6,
  KONF_AKTYW: 10,

  // Funkcje funkcyjne / zarząd
  ZARZAD_MIES: 3,
  LIDER_SEKCJI_MIES: 2,
  KOMISJA_REWIZYJNA_MIES: 1,
  SM_MODER_MIES: 5,
  IT_SYSTEMY: 5,

  // Aktywność domyślna
  INNE_DOROBEK: 1,
};

// Słownik z pełnymi metadanymi dla UI (opcje w formularzach i tabelach)
export const ACTIVITY_WEIGHTS_METADATA = {
  OB_ONLINE: { id: 'OB_ONLINE', label: 'Obecność na spotkaniu Online', points: 1, icon: '', category: 'presence' },
  OB_STACJO: { id: 'OB_STACJO', label: 'Obecność Stacjonarna', points: 2, icon: '', category: 'presence' },
  DYSKUSJA: { id: 'DYSKUSJA', label: 'Aktywna dyskusja na spotkaniu', points: 1, icon: '', category: 'activity' },
  PREZENTACJA: { id: 'PREZENTACJA', label: 'Prezentacja merytoryczna / Referat', points: 5, icon: '', category: 'merit' },
  POSTER: { id: 'POSTER', label: 'Prezentacja posteru naukowego', points: 3, icon: '', category: 'merit' },
  EDU_VIDEO_PDF: { id: 'EDU_VIDEO_PDF', label: 'Materiały EDU (filmy / poradniki / PDF)', points: 8, icon: '', category: 'merit' },
  BADANIA: { id: 'BADANIA', label: 'Udział w badaniach / zbieranie danych', points: 5, icon: '', category: 'research' },
  ORG_LOGIST: { id: 'ORG_LOGIST', label: 'Organizacja wydarzeń / obsługa logistyczna', points: 5, icon: '', category: 'organization' },
  CONF_BIERNA_ONLINE: { id: 'CONF_BIERNA_ONLINE', label: 'Konferencja bierna Online', points: 2, icon: '', category: 'conference' },
  KONF_BIER: { id: 'KONF_BIER', label: 'Konferencja bierna Stacjonarna', points: 3, icon: '', category: 'conference' },
  KONF_AKTYW: { id: 'KONF_AKTYW', label: 'Wystąpienie na konferencji', points: 10, icon: '', category: 'conference' },
  ZARZAD_MIES: { id: 'ZARZAD_MIES', label: 'Zarząd Koła (pkt/miesiąc)', points: 3, icon: '', category: 'board' },
  SM_MODER_MIES: { id: 'SM_MODER_MIES', label: 'Moderacja Social Media / Grup', points: 5, icon: '', category: 'board' },
  IT_SYSTEMY: { id: 'IT_SYSTEMY', label: 'Koordynacja IT / Systemów CRM', points: 5, icon: '', category: 'board' },
};

/**
 * Bezpiecznie pobiera wagę punktową dla podanego kodu aktywności z uwzględnieniem
 * przekazanego słownika wag (np. z SettingsContext) i fallbacku.
 */
export function getActivityWeight(code, customWeights = {}, fallback = 0) {
  if (!code) return fallback;
  const configured = customWeights?.[code];
  if (configured !== undefined && configured !== null) {
    if (typeof configured === 'number') return configured;
    if (typeof configured.points === 'number') return configured.points;
  }
  const defaultEntry = ACTIVITY_WEIGHTS[code];
  if (defaultEntry !== undefined) {
    return defaultEntry;
  }
  const metaEntry = ACTIVITY_WEIGHTS_METADATA[code];
  if (metaEntry !== undefined) {
    return metaEntry.points;
  }
  return fallback;
}

export default ACTIVITY_WEIGHTS;
