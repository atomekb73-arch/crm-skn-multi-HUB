/**
 * sheetSync.js - Moduł synchronizacji z arkuszem Google (w tym dedykowana karta Ewidencja_Poczty)
 * 
 * Zapewnia ścisłą izolację danych i odczyt/zapis rejestru spraw wyłącznie w dedykowanej karcie "Ewidencja_Poczty".
 */

import {
  SHEET_ID,
  MAIL_REGISTRY_TAB,
  fetchSheet,
  fetchMailRegistryFromSheet,
  formatCorrespondenceForSheet,
  extractSheetId,
} from './googleSheets.js';

export {
  SHEET_ID,
  MAIL_REGISTRY_TAB,
  fetchSheet,
  fetchMailRegistryFromSheet,
  formatCorrespondenceForSheet,
  extractSheetId,
};

/**
 * Pobiera aktualne wpisy korespondencji z dedykowanej zakładki Ewidencja_Poczty w arkuszu.
 */
export async function syncMailRegistry(sheetId = SHEET_ID) {
  return await fetchMailRegistryFromSheet(sheetId);
}

/**
 * Eksportuje lokalny dziennik korespondencji do sformatowanego formatu TSV/tablicy dla zakładki Ewidencja_Poczty.
 */
export function prepareMailRegistryExport(entries = []) {
  return formatCorrespondenceForSheet(entries);
}

export default {
  SHEET_ID,
  MAIL_REGISTRY_TAB,
  syncMailRegistry,
  fetchMailRegistryFromSheet,
  formatCorrespondenceForSheet,
  prepareMailRegistryExport,
};
