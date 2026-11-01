/**
 * ============================================================================
 * Studenckie Koło Naukowe WSKZ — Backend Google Apps Script (Code.gs)
 * ============================================================================
 * Obsługuje arkusze Google Sheets:
 * 1. Rejestr_Zgloszen (Baza członków)
 * 2. Ewidencja_Obecnosci (Obecności i punkty za spotkania)
 * 3. Rejestr_Dorobku (Punkty funkcyjne Zarządu, referaty, projekty badawcze)
 * 4. Dziennik_Korespondencji (Kancelaria, pisma przychodzące i wychodzące)
 *
 * Obsługuje żądania GET oraz POST (CORS-safe / no-cors).
 */

const DB_CONFIG = {
  SHEET_ID: "[TUTAJ_ID_ARKUSZA_GOOGLE]"
};

const SHEET_NAME_ZGLOSZENIA = "Rejestr_Zgloszen";
const SHEET_NAME_OBECNOSCI = "Ewidencja_Obecnosci";
const SHEET_NAME_DOROBEK = "Rejestr_Dorobku";
const SHEET_NAME_KORESPONDENCJA = "Dziennik_Korespondencji";
const SHEET_NAME_KWARANTANNA = "Baza_Kwarantanna";

/**
 * Nagłówki kolumn arkusza Rejestr_Zgloszen:
 */
const HEADERS_ZGLOSZENIA = [
  "Data_Wplywu",
  "Nr_Indeksu",
  "Imie_Nazwisko",
  "Email",
  "Telefon",
  "Kierunek_Semestr",
  "Zgoda_Mailing",
  "Status_Weryfikacji",
  "Data_Weryfikacji",
  "Aliasy",
  "Data_Aktualizacji"
];

/**
 * Nagłówki kolumn arkusza Ewidencja_Obecnosci (7 kolumn bazowych + znacznik aktualizacji):
 * A: Kod_Spotkania
 * B: Data_Spotkania
 * C: Identyfikator (Nr_Indeksu lub Imię i Nazwisko gościa)
 * D: Rola ("member" / "guest" / "Członek koła")
 * E: Zrodlo ("CRM Web (Sync)")
 * F: Punkty (1)
 * G: Opis_Aktywnosci ("Obecność na spotkaniu naukowym")
 * H: Data_Aktualizacji
 */
const HEADERS_OBECNOSCI = [
  "Kod_Spotkania",
  "Data_Spotkania",
  "Identyfikator",
  "Rola",
  "Zrodlo",
  "Punkty",
  "Opis_Aktywnosci",
  "Data_Aktualizacji"
];

/**
 * Nagłówki kolumn arkusza Rejestr_Dorobku:
 * A: Data
 * B: Nr_Indeksu
 * C: Kategoria_Aktywnosci
 * D: Opis
 * E: Punkty
 * F: Data_Wpisu
 */
const HEADERS_DOROBEK = [
  "Data",
  "Nr_Indeksu",
  "Kategoria_Aktywnosci",
  "Opis",
  "Punkty",
  "Data_Wpisu"
];

/**
 * Nagłówki kolumn arkusza Dziennik_Korespondencji:
 */
const HEADERS_KORESPONDENCJA = [
  "Sygnatura",
  "Data_Wplywu",
  "Data_Wyslania",
  "Typ",
  "Kierunek",
  "Nadawca",
  "Adresat",
  "Temat_Przedmiot",
  "Tresc_Streszczenie",
  "Status",
  "Link_Dysk",
  "Zalaczniki",
  "Data_Aktualizacji"
];

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "pobierz_dane";
    const type = (e && e.parameter && (e.parameter.type || e.parameter.sheetType)) ? String(e.parameter.type || e.parameter.sheetType).toLowerCase().trim() : "all";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "pobierz_dane") {
      // 1. Pobierz Członków (Rejestr_Zgloszen)
      let czlonkowie = [];
      let sheetZgloszenia = ss.getSheetByName(SHEET_NAME_ZGLOSZENIA);
      if (sheetZgloszenia && sheetZgloszenia.getLastRow() > 1) {
        const raw = sheetZgloszenia.getRange(2, 1, sheetZgloszenia.getLastRow() - 1, sheetZgloszenia.getLastColumn()).getValues();
        czlonkowie = raw.map(row => {
          const dataWplywu = String(row[0] || '').trim();
          const nrIndeksu = String(row[1] || '').trim();
          const imieNazwisko = String(row[2] || '').trim();
          const email = String(row[3] || '').trim();
          const telefon = String(row[4] || '').trim();
          const kierunekSemestr = String(row[5] || '').trim();
          const zgodaMailing = String(row[6] || '').trim();
          const statusWeryfikacji = String(row[7] || '').trim();
          const dataWeryfikacji = String(row[8] || '').trim();
          const aliasy = String(row[9] || '').trim();

          return {
            dataWplywu: dataWplywu,
            nrIndeksu: nrIndeksu,
            cleanIndex: nrIndeksu,
            imieNazwisko: imieNazwisko,
            fullName: imieNazwisko,
            email: email,
            telefon: telefon,
            phone: telefon,
            kierunek: kierunekSemestr,
            zgodaMailing: zgodaMailing,
            mailingConsent: zgodaMailing === "Zgoda na mailing" || zgodaMailing === "true" || zgodaMailing === true,
            statusWeryfikacji: statusWeryfikacji,
            status: statusWeryfikacji === "Archiwum" ? "archived" : (statusWeryfikacji === "Rezygnacja" ? "resigned" : "active"),
            dataWeryfikacji: dataWeryfikacji,
            aliasy: aliasy,
            aliases: aliasy
          };
        });
      }

      // Płytkie pobieranie (Shallow Fetching): jeśli żądano tylko listy członków, zwróć natychmiast
      if (type === "members" || type === "shallow" || type === "czlonkowie") {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          action: action,
          type: type,
          count: czlonkowie.length,
          czlonkowie: czlonkowie,
          ewidencja: [],
          dorobek: [],
          korespondencja: []
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // 2. Pobierz Ewidencję Obecności (Ewidencja_Obecnosci)
      let ewidencja = [];
      let sheetObecnosci = ss.getSheetByName(SHEET_NAME_OBECNOSCI);
      if (sheetObecnosci && sheetObecnosci.getLastRow() > 1) {
        const raw = sheetObecnosci.getRange(2, 1, sheetObecnosci.getLastRow() - 1, Math.max(sheetObecnosci.getLastColumn(), 7)).getValues();
        ewidencja = raw.map(row => ({
          kodSpotkania: String(row[0] || '').trim(),
          dataSpotkania: String(row[1] || '').trim(),
          nrIndeksu: String(row[2] || '').trim(),
          identyfikator: String(row[2] || '').trim(),
          rola: String(row[3] || 'Członek koła').trim(),
          zrodlo: String(row[4] || 'CRM Web (Sync)').trim(),
          punkty: Number(row[5]) || 1,
          opisAktywnosci: String(row[6] || 'Obecność na spotkaniu naukowym').trim(),
          dataAktualizacji: String(row[7] || '').trim()
        }));
      }

      // 3. Pobierz Rejestr Dorobku (Rejestr_Dorobku)
      let dorobek = [];
      let sheetDorobek = ss.getSheetByName(SHEET_NAME_DOROBEK);
      if (sheetDorobek && sheetDorobek.getLastRow() > 1) {
        const raw = sheetDorobek.getRange(2, 1, sheetDorobek.getLastRow() - 1, Math.max(sheetDorobek.getLastColumn(), 6)).getValues();
        dorobek = raw.map(row => ({
          data: String(row[0] || '').trim(),
          nrIndeksu: String(row[1] || '').trim(),
          kategoria: String(row[2] || '').trim(),
          kategoriaAktywnosci: String(row[2] || '').trim(),
          opis: String(row[3] || '').trim(),
          punkty: Number(row[4]) || 0,
          dataWpisu: String(row[5] || '').trim()
        }));
      }

      // 4. Pobierz Dziennik Korespondencji (Dziennik_Korespondencji)
      let korespondencja = [];
      let sheetKoresp = ss.getSheetByName(SHEET_NAME_KORESPONDENCJA);
      if (sheetKoresp && sheetKoresp.getLastRow() > 1) {
        const raw = sheetKoresp.getRange(2, 1, sheetKoresp.getLastRow() - 1, Math.max(sheetKoresp.getLastColumn(), 13)).getValues();
        korespondencja = raw.map(row => ({
          sygnatura: String(row[0] || '').trim(),
          id: String(row[0] || '').trim(),
          dataWplywu: String(row[1] || '').trim(),
          date: String(row[1] || '').trim(),
          dataWyslania: String(row[2] || '').trim(),
          typ: String(row[3] || '').trim(),
          kierunek: String(row[4] || '').trim(),
          direction: String(row[4] || '').trim(),
          nadawca: String(row[5] || '').trim(),
          sender: String(row[5] || '').trim(),
          adresat: String(row[6] || '').trim(),
          recipient: String(row[6] || '').trim(),
          przedmiot: String(row[7] || '').trim(),
          subject: String(row[7] || '').trim(),
          tresc: String(row[8] || '').trim(),
          summary: String(row[8] || '').trim(),
          status: String(row[9] || '').trim(),
          driveUrl: String(row[10] || '').trim(),
          driveLink: String(row[10] || '').trim(),
          zalaczniki: String(row[11] || '').trim(),
          dataAktualizacji: String(row[12] || '').trim()
        })).filter(item => {
          if (!item.sygnatura) return false;
          if (item.sygnatura.startsWith('Date(') || item.sygnatura.includes('@')) return false;
          return true;
        });
      }

      // 5. Pobierz nieprzetworzone zgłoszenia z Baza_Kwarantanna
      let kwarantannaFormularz = [];
      let sheetKwarantanna = ss.getSheetByName(SHEET_NAME_KWARANTANNA);
      if (sheetKwarantanna && sheetKwarantanna.getLastRow() > 1) {
        const rawKw = sheetKwarantanna.getRange(2, 1, sheetKwarantanna.getLastRow() - 1, Math.max(sheetKwarantanna.getLastColumn(), 11)).getValues();
        const hasConsent = (val) => {
          if (!val) return false;
          const s = String(val).toUpperCase().trim();
          return s.startsWith("TAK") || s === "TRUE" || s === "1" || s.includes("ZGODA") || s.includes("ZOBOWIĄZUJĘ");
        };

        for (let i = 0; i < rawKw.length; i++) {
          const row = rawKw[i];
          const isProcessed = row[0] === true || String(row[0]).toUpperCase().trim() === "TRUE";
          if (isProcessed) continue; // Pomiń przetworzone (Checkbox w kolumnie A)

          const dataWplywuStr = String(row[1] || "").trim();
          const zgodaTajemnica = hasConsent(row[8]); // Kolumna I
          const zgodaOmawianie = hasConsent(row[9]); // Kolumna J
          const zgodaNagrywanie = hasConsent(row[10]); // Kolumna K
          const allConsentsGranted = zgodaTajemnica && zgodaOmawianie && zgodaNagrywanie;

          const kierunek = String(row[6] || "").trim() || "Psychologia";
          const rokStudiow = String(row[7] || "").trim() || "Rok 2";

          kwarantannaFormularz.push({
            rowIndex: i + 2,
            dataWplywu: dataWplywuStr,
            imieNazwisko: String(row[3] || "").trim(),
            email: String(row[4] || row[2] || "").trim().toLowerCase(),
            nrIndeksu: String(row[5] || "").replace(/\D/g, "").trim(),
            kierunek: kierunek,
            rokStudiow: rokStudiow,
            kierunekRok: `${kierunek}${rokStudiow ? ` / ${rokStudiow}` : ''}`,
            field: kierunek,
            year: rokStudiow,
            zgody: allConsentsGranted,
            zgodyOk: allConsentsGranted,
            consentStatus: allConsentsGranted ? "Zgody OK" : "Brak zgód",
            zgodaMailing: true,
            mailingConsent: true,
            zgodaNaMailing: "Zgoda na mailing",
            zgodaTajemnica: zgodaTajemnica,
            zgodaOmawianie: zgodaOmawianie,
            zgodaNagrywanie: zgodaNagrywanie,
            zgodaRegulamin: allConsentsGranted,
            statusWeryfikacji: "Oczekuje",
            status: "pending",
            zrodlo: "Baza_Kwarantanna"
          });
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        count: czlonkowie.length,
        czlonkowie: czlonkowie,
        ewidencja: ewidencja,
        dorobek: dorobek,
        korespondencja: korespondencja,
        kwarantannaFormularz: kwarantannaFormularz
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Dedykowana akcja pobierania samej kwarantanny z Baza_Kwarantanna
    if (action === "pobierz_kwarantanne") {
      let kwarantanna = [];
      let sheetKwarantanna = ss.getSheetByName(SHEET_NAME_KWARANTANNA);
      if (sheetKwarantanna && sheetKwarantanna.getLastRow() > 1) {
        const rawKw = sheetKwarantanna.getRange(2, 1, sheetKwarantanna.getLastRow() - 1, Math.max(sheetKwarantanna.getLastColumn(), 11)).getValues();
        const hasConsent = (val) => {
          if (!val) return false;
          const s = String(val).toUpperCase().trim();
          return s.startsWith("TAK") || s === "TRUE" || s === "1" || s.includes("ZGODA") || s.includes("ZOBOWIĄZUJĘ");
        };

        for (let i = 0; i < rawKw.length; i++) {
          const row = rawKw[i];
          const isProcessed = row[0] === true || String(row[0]).toUpperCase().trim() === "TRUE";
          if (isProcessed) continue;

          const dataWplywuStr = String(row[1] || "").trim();
          const zgodaTajemnica = hasConsent(row[8]); // Kolumna I
          const zgodaOmawianie = hasConsent(row[9]); // Kolumna J
          const zgodaNagrywanie = hasConsent(row[10]); // Kolumna K
          const allConsentsGranted = zgodaTajemnica && zgodaOmawianie && zgodaNagrywanie;

          const kierunek = String(row[6] || "").trim() || "Psychologia";
          const rokStudiow = String(row[7] || "").trim() || "Rok 2";

          kwarantanna.push({
            rowIndex: i + 2,
            dataWplywu: dataWplywuStr,
            imieNazwisko: String(row[3] || "").trim(),
            email: String(row[4] || row[2] || "").trim().toLowerCase(),
            nrIndeksu: String(row[5] || "").replace(/\D/g, "").trim(),
            kierunek: kierunek,
            rokStudiow: rokStudiow,
            kierunekRok: `${kierunek}${rokStudiow ? ` / ${rokStudiow}` : ''}`,
            field: kierunek,
            year: rokStudiow,
            zgody: allConsentsGranted,
            zgodyOk: allConsentsGranted,
            consentStatus: allConsentsGranted ? "Zgody OK" : "Brak zgód",
            zgodaMailing: true,
            mailingConsent: true,
            zgodaNaMailing: "Zgoda na mailing",
            zgodaTajemnica: zgodaTajemnica,
            zgodaOmawianie: zgodaOmawianie,
            zgodaNagrywanie: zgodaNagrywanie,
            zgodaRegulamin: allConsentsGranted,
            statusWeryfikacji: "Oczekuje",
            status: "pending",
            zrodlo: "Baza_Kwarantanna"
          });
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        count: kwarantanna.length,
        kwarantanna: kwarantanna,
        kwarantannaFormularz: kwarantanna
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Dedykowane pobieranie korespondencji kancelaryjnej (Dziennik_Korespondencji)
    if (action === "pobierz_dziennik" || action === "pobierz_korespondencje") {
      let korespondencja = [];
      const sheetName = (e && e.parameter && e.parameter.sheetName) ? e.parameter.sheetName : SHEET_NAME_KORESPONDENCJA;
      let sheetKoresp = ss.getSheetByName(sheetName) || ss.getSheetByName(SHEET_NAME_KORESPONDENCJA);
      if (sheetKoresp && sheetKoresp.getLastRow() > 1) {
        const raw = sheetKoresp.getRange(2, 1, sheetKoresp.getLastRow() - 1, Math.max(sheetKoresp.getLastColumn(), 13)).getValues();
        korespondencja = raw.map(row => ({
          sygnatura: String(row[0] || '').trim(),
          id: String(row[0] || '').trim(),
          dataWplywu: String(row[1] || '').trim(),
          date: String(row[1] || '').trim(),
          dataWyslania: String(row[2] || '').trim(),
          typ: String(row[3] || '').trim(),
          kierunek: String(row[4] || '').trim(),
          direction: String(row[4] || '').trim(),
          nadawca: String(row[5] || '').trim(),
          sender: String(row[5] || '').trim(),
          adresat: String(row[6] || '').trim(),
          recipient: String(row[6] || '').trim(),
          przedmiot: String(row[7] || '').trim(),
          subject: String(row[7] || '').trim(),
          tresc: String(row[8] || '').trim(),
          summary: String(row[8] || '').trim(),
          status: String(row[9] || '').trim(),
          driveUrl: String(row[10] || '').trim(),
          driveLink: String(row[10] || '').trim(),
          zalaczniki: String(row[11] || '').trim(),
          dataAktualizacji: String(row[12] || '').trim()
        })).filter(item => {
          if (!item.sygnatura) return false;
          if (item.sygnatura.startsWith('Date(') || item.sygnatura.includes('@')) return false;
          return true;
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        sheetName: SHEET_NAME_KORESPONDENCJA,
        count: korespondencja.length,
        korespondencja: korespondencja,
        entries: korespondencja
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Pobieranie szczegółowych danych pojedynczego członka (Shallow Fetching on-demand)
    if (action === "szczegoly_czlonka" || action === "member_details") {
      const targetId = String((e && e.parameter && (e.parameter.id || e.parameter.nrIndeksu || e.parameter.index)) || '').trim().toLowerCase();
      let sheetZgloszenia = ss.getSheetByName(SHEET_NAME_ZGLOSZENIA);
      let foundMember = null;

      if (sheetZgloszenia && sheetZgloszenia.getLastRow() > 1) {
        const raw = sheetZgloszenia.getRange(2, 1, sheetZgloszenia.getLastRow() - 1, sheetZgloszenia.getLastColumn()).getValues();
        for (let i = 0; i < raw.length; i++) {
          const row = raw[i];
          const nrIndeksu = String(row[1] || '').trim();
          const email = String(row[3] || '').trim().toLowerCase();
          const cleanIdx = nrIndeksu.replace(/\D/g, '');
          const rowId = `gas_m_${i + 1}`;

          if (rowId.toLowerCase() === targetId || nrIndeksu.toLowerCase() === targetId || cleanIdx === targetId || email === targetId) {
            foundMember = {
              id: rowId,
              nrIndeksu: nrIndeksu,
              cleanIndex: cleanIdx || nrIndeksu,
              imieNazwisko: String(row[2] || '').trim(),
              email: email,
              telefon: String(row[4] || '').trim(),
              kierunekSemestr: String(row[5] || '').trim(),
              kierunek: String(row[5] || '').trim(),
              zgodaMailing: String(row[6] || '').trim(),
              statusWeryfikacji: String(row[7] || '').trim(),
              dataWeryfikacji: String(row[8] || '').trim(),
              aliasy: String(row[9] || '').trim(),
              dataAktualizacji: String(row[10] || '').trim(),
              dataWplywu: String(row[0] || '').trim(),
            };
            break;
          }
        }
      }

      if (foundMember) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          action: action,
          id: targetId,
          member: foundMember,
          details: {
            notatki: "",
            odpowiedziAnkiet: null,
            historiaLogow: [],
            roleZarzadowe: []
          }
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Nie znaleziono członka o podanym ID: " + targetId
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "SKN WSKZ GAS API Ready v9.5"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nowTimestamp = new Date().toISOString();

    // ────────────────────────────────────────────────────────────────────────
    // 1. INICJALIZACJA REJESTRU ZGŁOSZEŃ (Hurtowy zapis członków)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "inicjalizuj_rejestr") {
      let sheet = ss.getSheetByName(SHEET_NAME_ZGLOSZENIA);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME_ZGLOSZENIA);
        sheet.appendRow(HEADERS_ZGLOSZENIA);
      } else {
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(HEADERS_ZGLOSZENIA);
        } else {
          sheet.getRange(1, 1, 1, HEADERS_ZGLOSZENIA.length).setValues([HEADERS_ZGLOSZENIA]);
        }
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
        }
      }

      const members = Array.isArray(payload.members) ? payload.members : [];
      if (members.length > 0) {
        const rows = members.map(m => {
          const rawIdx = String(m.index || m.cleanIndex || m.nrIndeksu || '').trim();
          const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;
          const fullName = String(
            m.imieNazwisko ||
            m.fullName ||
            `${m.imie || m.firstName || ''} ${m.nazwisko || m.lastName || ''}`.trim() ||
            m.name ||
            ''
          ).trim();
          const email = String(m.email || '').trim();
          const phone = String(m.phone || '').trim();
          const fieldAndYear = String(m.fieldAndYear || `${m.field || ''} ${m.year ? '(' + m.year + ')' : ''}`).trim();
          
          let mailingConsent = "Brak zgody";
          if (m.mailingConsent === true || m.mailingConsent === "true" || m.zgodaNaMailing === "Zgoda na mailing" || m.consentStatus === "Zgody OK") {
            mailingConsent = "Zgoda na mailing";
          }

          const status = m.status === "archived" ? "Archiwum" : (m.status === "resigned" ? "Rezygnacja" : "Zatwierdzony");
          const dateVerified = m.verificationDate || m.timestamp || new Date().toISOString().slice(0, 10);
          const dateCreated = m.createdAt || m.timestamp || new Date().toISOString().slice(0, 10);
          const aliases = Array.isArray(m.aliases) ? m.aliases.join(", ") : String(m.aliases || m.alias || '').trim();

          return [
            dateCreated,      // A: Data_Wplywu
            cleanIdx,         // B: Nr_Indeksu
            fullName,         // C: Imie_Nazwisko
            email,            // D: Email
            phone,            // E: Telefon
            fieldAndYear,     // F: Kierunek_Semestr
            mailingConsent,   // G: Zgoda_Mailing
            status,           // H: Status_Weryfikacji
            dateVerified,     // I: Data_Weryfikacji
            aliases,          // J: Aliasy
            nowTimestamp      // K: Data_Aktualizacji
          ];
        });

        sheet.getRange(2, 1, rows.length, HEADERS_ZGLOSZENIA.length).setValues(rows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: `Pomyślnie zainicjalizowano ${members.length} rekordów w arkuszu ${SHEET_NAME_ZGLOSZENIA}`,
        count: members.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2. RĘCZNE DODANIE CZŁONKA DO BAZY
    // ────────────────────────────────────────────────────────────────────────
    if (action === "dodaj_czlonka_recznie") {
      let sheet = ss.getSheetByName(SHEET_NAME_ZGLOSZENIA);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME_ZGLOSZENIA);
        sheet.appendRow(HEADERS_ZGLOSZENIA);
      }

      const m = payload.member || payload;
      const rawIdx = String(m.index || m.cleanIndex || m.nrIndeksu || '').trim();
      const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;
      const fullName = String(
        m.imieNazwisko ||
        m.fullName ||
        `${m.imie || m.firstName || ''} ${m.nazwisko || m.lastName || ''}`.trim() ||
        m.name ||
        ''
      ).trim();
      const email = String(m.email || '').trim();
      const phone = String(m.phone || '').trim();
      const fieldAndYear = String(m.fieldAndYear || `${m.field || ''} ${m.year ? '(' + m.year + ')' : ''}`).trim();

      let mailingConsent = "Brak zgody";
      if (m.mailingConsent === true || m.mailingConsent === "true" || m.zgodaNaMailing === "Zgoda na mailing" || m.consentStatus === "Zgody OK") {
        mailingConsent = "Zgoda na mailing";
      }

      const status = m.status === "archived" ? "Archiwum" : (m.status === "resigned" ? "Rezygnacja" : "Zatwierdzony");
      const today = new Date().toISOString().slice(0, 10);
      const aliases = Array.isArray(m.aliases) ? m.aliases.join(", ") : String(m.aliases || m.alias || '').trim();

      const newRow = [
        today,           // A: Data_Wplywu
        cleanIdx,        // B: Nr_Indeksu
        fullName,        // C: Imie_Nazwisko
        email,           // D: Email
        phone,           // E: Telefon
        fieldAndYear,    // F: Kierunek_Semestr
        mailingConsent,  // G: Zgoda_Mailing
        status,          // H: Status_Weryfikacji
        today,           // I: Data_Weryfikacji
        aliases,         // J: Aliasy
        nowTimestamp     // K: Data_Aktualizacji
      ];

      sheet.appendRow(newRow);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: `Pomyślnie dodano członka ${fullName} (indeks: ${cleanIdx}) do ${SHEET_NAME_ZGLOSZENIA}`,
        member: newRow
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. ZMIANA STATUSU WERYFIKACJI CZŁONKA
    // ────────────────────────────────────────────────────────────────────────
    if (action === "zmien_status_czlonka" || action === "zmien_status") {
      let sheet = ss.getSheetByName(SHEET_NAME_ZGLOSZENIA);
      if (sheet && sheet.getLastRow() > 1) {
        const targetIdx = String(payload.nrIndeksu || payload.index || '').trim();
        const cleanTarget = targetIdx.replace(/\D/g, '').replace(/^0+/, '') || targetIdx;
        const data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
        const today = new Date().toISOString().slice(0, 10);
        const newStatus = payload.nowyStatus || payload.status || "Zatwierdzony";

        for (let i = 0; i < data.length; i++) {
          const rowIdx = String(data[i][0]).replace(/\D/g, '').replace(/^0+/, '') || String(data[i][0]).trim();
          if (rowIdx === cleanTarget) {
            const rowIndex = i + 2;
            sheet.getRange(rowIndex, 8).setValue(newStatus); // Kolumna H (Status_Weryfikacji)
            sheet.getRange(rowIndex, 9).setValue(today);     // Kolumna I (Data_Weryfikacji)
            sheet.getRange(rowIndex, 11).setValue(nowTimestamp); // Kolumna K (Data_Aktualizacji)
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. ZAPIS OBECNOŚCI SPOTKANIA (zapisz_obecnosci) - 7 kolumn
    // ────────────────────────────────────────────────────────────────────────
    if (action === "zapisz_obecnosci") {
      let sheet = ss.getSheetByName(SHEET_NAME_OBECNOSCI);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME_OBECNOSCI);
        sheet.appendRow(HEADERS_OBECNOSCI);
      } else if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS_OBECNOSCI);
      } else {
        // Upewnij się, że nagłówki są zgodne
        sheet.getRange(1, 1, 1, HEADERS_OBECNOSCI.length).setValues([HEADERS_OBECNOSCI]);
      }

      const kod = String(payload.kodSpotkania || "M00").trim();
      const data = String(payload.dataSpotkania || new Date().toISOString().slice(0, 10)).trim();
      const obecnosci = Array.isArray(payload.obecnosci) ? payload.obecnosci : [];

      // Usuń istniejące wpisy dla tego spotkania, aby uniknąć duplikatów
      if (sheet.getLastRow() > 1) {
        const existingData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
        for (let i = existingData.length - 1; i >= 0; i--) {
          if (String(existingData[i][0]).trim() === kod) {
            sheet.deleteRow(i + 2);
          }
        }
      }

      if (obecnosci.length > 0) {
        const rows = obecnosci.map(o => {
          const rawIdx = String(o.nrIndeksu || o.identyfikator || o.index || '').trim();
          const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;
          const identyfikator = cleanIdx || String(o.name || o.fullName || o.rawName || '').trim();
          const rola = String(o.rola || o.role || 'Członek koła').trim();
          const zrodlo = String(o.zrodlo || 'CRM Web (Sync)').trim();
          const rawPts = o.punkty !== undefined ? o.punkty : (o.points !== undefined ? o.points : 1);
          const punkty = (Number(rawPts) > 0) ? Number(rawPts) : 1;
          const opisAktywnosci = String(o.opisAktywnosci || o.description || 'Obecność na spotkaniu naukowym').trim();

          return [
            kod,             // A: Kod_Spotkania
            data,            // B: Data_Spotkania
            identyfikator,   // C: Identyfikator (Nr indeksu lub Imię i nazwisko)
            rola,            // D: Rola
            zrodlo,          // E: Zrodlo
            punkty,          // F: Punkty (1)
            opisAktywnosci,  // G: Opis_Aktywnosci
            nowTimestamp     // H: Data_Aktualizacji
          ];
        });

        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS_OBECNOSCI.length).setValues(rows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        count: obecnosci.length,
        message: `Zapisano ${obecnosci.length} obecności z punktacją dla spotkania ${kod}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 5. USUNIĘCIE OBECNOŚCI SPOTKANIA (usun_obecnosci_spotkania)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "usun_obecnosci_spotkania") {
      let sheet = ss.getSheetByName(SHEET_NAME_OBECNOSCI);
      if (sheet && sheet.getLastRow() > 1) {
        const kod = String(payload.kodSpotkania || '').trim().toUpperCase();
        const rawKod = String(payload.rawKodSpotkania || '').trim().toUpperCase();
        const cleanKod = kod.replace(/^\[.*?\]\s*/, '').trim();
        const existingData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
        for (let i = existingData.length - 1; i >= 0; i--) {
          const rowVal = String(existingData[i][0] || '').trim().toUpperCase();
          const cleanRowVal = rowVal.replace(/^\[.*?\]\s*/, '').trim();
          if (rowVal === kod || (rawKod && rowVal === rawKod) || (cleanKod && cleanRowVal === cleanKod)) {
            sheet.deleteRow(i + 2);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 6. ZAPIS PUNKTÓW ZARZĄDU W REJESTR_DOROBKU (zapisz_punkty_zarzadu)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "zapisz_punkty_zarzadu") {
      let sheet = ss.getSheetByName(SHEET_NAME_DOROBEK);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME_DOROBEK);
        sheet.appendRow(HEADERS_DOROBEK);
      } else if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS_DOROBEK);
      } else {
        sheet.getRange(1, 1, 1, HEADERS_DOROBEK.length).setValues([HEADERS_DOROBEK]);
      }

      const kadencje = Array.isArray(payload.kadencje) ? payload.kadencje : (Array.isArray(payload.boardTenures) ? payload.boardTenures : []);
      
      if (kadencje.length > 0) {
        // Usuń stare wpisy z kategorii "Działalność w Zarządzie Koła", aby uniknąć duplikacji
        if (sheet.getLastRow() > 1) {
          const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
          for (let i = data.length - 1; i >= 0; i--) {
            const kategoria = String(data[i][2] || '').trim();
            if (kategoria === "Działalność w Zarządzie Koła") {
              sheet.deleteRow(i + 2);
            }
          }
        }

        const rows = kadencje.map(t => {
          const rawIdx = String(t.memberIndex || t.index || t.nrIndeksu || '').replace(/\D/g, '').trim();
          const cleanIdx = rawIdx.replace(/^0+/, '') || rawIdx;
          const startDate = String(t.startDate || t.date || new Date().toISOString().slice(0, 10)).trim();
          const roleName = String(t.roleName || t.role || t.opis || 'Członek Zarządu').trim();
          const pts = Number(t.punkty !== undefined ? t.punkty : (t.points !== undefined ? t.points : 0)) || 0;

          return [
            startDate,                            // A: Data
            cleanIdx,                             // B: Nr_Indeksu
            "Działalność w Zarządzie Koła",       // C: Kategoria_Aktywnosci
            `Pełnienie funkcji: ${roleName}`,     // D: Opis
            pts,                                  // E: Punkty
            nowTimestamp                          // F: Data_Wpisu
          ];
        }).filter(r => r[1]); // tylko wpisy z indeksem

        if (rows.length > 0) {
          sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS_DOROBEK.length).setValues(rows);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        count: kadencje.length,
        message: `Pomyślnie zapisano ${kadencje.length} wpisów Zarządu w arkuszu ${SHEET_NAME_DOROBEK}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 6.5 SYNCHRONIZACJA DOROBKU NAUKOWEGO (zapisz_dorobek / sync_research / zapisz_rejestr_dorobku)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "zapisz_dorobek" || action === "sync_research" || action === "zapisz_rejestr_dorobku") {
      let sheet = ss.getSheetByName(SHEET_NAME_DOROBEK);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME_DOROBEK);
        sheet.appendRow(HEADERS_DOROBEK);
      } else if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS_DOROBEK);
      } else {
        sheet.getRange(1, 1, 1, HEADERS_DOROBEK.length).setValues([HEADERS_DOROBEK]);
      }

      let items = Array.isArray(payload.items) && payload.items.length > 0
        ? payload.items
        : (Array.isArray(payload.allResearch) && payload.allResearch.length > 0
          ? payload.allResearch
          : (payload.item ? [payload.item] : []));

      // Czyszczenie starej zawartości z zachowaniem nagłówka w wierszu 1
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, HEADERS_DOROBEK.length).clearContent();
      }

      if (Array.isArray(payload.rows) && payload.rows.length > 0) {
        sheet.getRange(2, 1, payload.rows.length, HEADERS_DOROBEK.length).setValues(payload.rows);
      } else if (items.length > 0) {
        const rows = items.map(it => {
          if (Array.isArray(it)) return it;
          const dataVal = String(it.data || it.date || new Date().toISOString().slice(0, 10)).trim();
          const rawIdx = String(it.nrIndeksu || it.studentIndex || it.authorIndex || it.index || '').replace(/\D/g, '').trim();
          const cleanIdx = rawIdx.replace(/^0+/, '') || rawIdx;
          const kategoria = String(it.kategoriaAktywnosci || it.category || it.kategoria || it.type || '').trim();
          const opis = String(it.opis || it.description || it.title || '').trim();
          const pts = Number(it.punkty !== undefined ? it.punkty : (it.points !== undefined ? it.points : 0)) || 0;
          const dataWpisu = String(it.dataWpisu || nowTimestamp).trim();

          return [
            dataVal,      // A: Data
            cleanIdx,     // B: Nr_Indeksu
            kategoria,    // C: Kategoria_Aktywnosci
            opis,         // D: Opis
            pts,          // E: Punkty
            dataWpisu     // F: Data_Wpisu
          ];
        });

        sheet.getRange(2, 1, rows.length, HEADERS_DOROBEK.length).setValues(rows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        count: items.length,
        message: `Pomyślnie zsynchronizowano ${items.length} rekordów w arkuszu ${SHEET_NAME_DOROBEK}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 7. MIGRACJA I UZUPEŁNIENIE PUNKTACJI (uzupelnij_punkty_obecnosci / migruj_punkty_i_dorobek)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "uzupelnij_punkty_obecnosci" || action === "migruj_punkty_i_dorobek") {
      let updatedAttendanceCount = 0;
      let sheetObecnosci = ss.getSheetByName(SHEET_NAME_OBECNOSCI);
      
      // Krok A: Uzupełnij kolumny F i G w Ewidencja_Obecnosci
      if (sheetObecnosci) {
        if (sheetObecnosci.getLastRow() === 0) {
          sheetObecnosci.appendRow(HEADERS_OBECNOSCI);
        } else {
          sheetObecnosci.getRange(1, 1, 1, HEADERS_OBECNOSCI.length).setValues([HEADERS_OBECNOSCI]);
        }

        if (sheetObecnosci.getLastRow() > 1) {
          const range = sheetObecnosci.getRange(2, 1, sheetObecnosci.getLastRow() - 1, Math.max(sheetObecnosci.getLastColumn(), 8));
          const values = range.getValues();
          
          for (let i = 0; i < values.length; i++) {
            let changed = false;
            // Kolumna E (Zrodlo)
            if (!values[i][4]) {
              values[i][4] = "CRM Web (Sync)";
              changed = true;
            }
            // Kolumna F (Punkty)
            if (values[i][5] === "" || values[i][5] === null || values[i][5] === undefined || Number(values[i][5]) === 0) {
              values[i][5] = 1;
              changed = true;
            }
            // Kolumna G (Opis_Aktywnosci)
            if (!values[i][6]) {
              values[i][6] = "Obecność na spotkaniu naukowym";
              changed = true;
            }
            // Kolumna H (Data_Aktualizacji)
            if (changed) {
              values[i][7] = nowTimestamp;
              updatedAttendanceCount++;
            }
          }
          range.setValues(values);
        }
      }

      // Krok B: Jeśli przesłano kadencje Zarządu, zapisz je w Rejestr_Dorobku
      const kadencje = Array.isArray(payload.kadencje) ? payload.kadencje : (Array.isArray(payload.boardTenures) ? payload.boardTenures : []);
      if (kadencje.length > 0) {
        let sheetDorobek = ss.getSheetByName(SHEET_NAME_DOROBEK);
        if (!sheetDorobek) {
          sheetDorobek = ss.insertSheet(SHEET_NAME_DOROBEK);
          sheetDorobek.appendRow(HEADERS_DOROBEK);
        } else if (sheetDorobek.getLastRow() === 0) {
          sheetDorobek.appendRow(HEADERS_DOROBEK);
        } else {
          sheetDorobek.getRange(1, 1, 1, HEADERS_DOROBEK.length).setValues([HEADERS_DOROBEK]);
        }

        if (sheetDorobek.getLastRow() > 1) {
          const data = sheetDorobek.getRange(2, 1, sheetDorobek.getLastRow() - 1, sheetDorobek.getLastColumn()).getValues();
          for (let i = data.length - 1; i >= 0; i--) {
            const kategoria = String(data[i][2] || '').trim();
            if (kategoria === "Działalność w Zarządzie Koła") {
              sheetDorobek.deleteRow(i + 2);
            }
          }
        }

        const rows = kadencje.map(t => {
          const rawIdx = String(t.memberIndex || t.index || t.nrIndeksu || '').replace(/\D/g, '').trim();
          const cleanIdx = rawIdx.replace(/^0+/, '') || rawIdx;
          const startDate = String(t.startDate || t.date || new Date().toISOString().slice(0, 10)).trim();
          const roleName = String(t.roleName || t.role || t.opis || 'Członek Zarządu').trim();
          const pts = Number(t.punkty !== undefined ? t.punkty : (t.points !== undefined ? t.points : 0)) || 0;

          return [
            startDate,
            cleanIdx,
            "Działalność w Zarządzie Koła",
            `Pełnienie funkcji: ${roleName}`,
            pts,
            nowTimestamp
          ];
        }).filter(r => r[1]);

        if (rows.length > 0) {
          sheetDorobek.getRange(sheetDorobek.getLastRow() + 1, 1, rows.length, HEADERS_DOROBEK.length).setValues(rows);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        updatedAttendanceCount: updatedAttendanceCount,
        tenuresCount: kadencje.length,
        message: `Zaktualizowano ${updatedAttendanceCount} obecności oraz ${kadencje.length} wpisów Zarządu w arkuszu Google.`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 8. REJESTRACJA PISMA KANCELARYJNEGO (zarejestruj_pismo)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "zarejestruj_pismo") {
      let sheet = ss.getSheetByName(SHEET_NAME_KORESPONDENCJA);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME_KORESPONDENCJA);
        sheet.appendRow(HEADERS_KORESPONDENCJA);
      } else if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS_KORESPONDENCJA);
      } else {
        sheet.getRange(1, 1, 1, HEADERS_KORESPONDENCJA.length).setValues([HEADERS_KORESPONDENCJA]);
      }

      const pismo = payload.pismo || payload;
      const sygnatura = String(pismo.sygnatura || `PISMO/${Date.now()}`).trim();
      const dataWplywu = String(pismo.dataWplywu || pismo.data || new Date().toISOString().slice(0, 10)).trim();
      const dataWyslania = String(pismo.dataWyslania || '').trim();
      const typ = String(pismo.typ || 'Pismo przychodzące').trim();
      const kierunek = String(pismo.kierunek || 'Przychodzące').trim();
      const nadawca = String(pismo.nadawca || '').trim();
      const adresat = String(pismo.adresat || '').trim();
      const przedmiot = String(pismo.przedmiot || pismo.temat || '').trim();
      const tresc = String(pismo.tresc || pismo.streszczenie || '').trim();
      const status = String(pismo.status || 'Zarejestrowane').trim();
      const driveUrl = String(pismo.driveUrl || pismo.link || '').trim();
      const zalaczniki = Array.isArray(pismo.zalaczniki) ? pismo.zalaczniki.join(', ') : String(pismo.zalaczniki || '').trim();

      const newRow = [
        sygnatura,
        dataWplywu,
        dataWyslania,
        typ,
        kierunek,
        nadawca,
        adresat,
        przedmiot,
        tresc,
        status,
        driveUrl,
        zalaczniki,
        nowTimestamp
      ];

      sheet.appendRow(newRow);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: action,
        sygnatura: sygnatura,
        message: `Pomyślnie zarejestrowano pismo ${sygnatura} w arkuszu ${SHEET_NAME_KORESPONDENCJA}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 9. ZAPIS MIGAWKI STANU CRM W PLIKU JSON NA DYSKU GOOGLE (zapisz_migawke_na_drive)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "zapisz_migawke_na_drive") {
      var folderId = payload.folderId || (e.parameter ? e.parameter.folderId : null) || (typeof pobierzFolderIdKola === "function" ? pobierzFolderIdKola() : null);
      var folder;
      if (folderId && String(folderId).trim()) {
        try {
          folder = DriveApp.getFolderById(String(folderId).trim());
        } catch (fErr) {
          folder = DriveApp.getRootFolder();
        }
      } else {
        folder = DriveApp.getRootFolder();
      }

      var timestamp = Utilities.formatDate(new Date(), "Europe/Warsaw", "yyyy-MM-dd_HH-mm");
      var fileName = "Migawka_SKN_" + timestamp + ".json";

      var contentStr = "";
      if (typeof payload.snapshotData === "string") {
        contentStr = payload.snapshotData;
      } else if (payload.snapshotData && typeof payload.snapshotData === "object") {
        contentStr = JSON.stringify(payload.snapshotData, null, 2);
      } else if (typeof payload.data === "string") {
        contentStr = payload.data;
      } else if (payload.data && typeof payload.data === "object") {
        contentStr = JSON.stringify(payload.data, null, 2);
      } else if (e && e.postData && e.postData.contents) {
        contentStr = e.postData.contents;
      } else {
        contentStr = JSON.stringify(payload, null, 2);
      }

      var file = folder.createFile(fileName, contentStr, MimeType.PLAIN_TEXT);
      file.setDescription("Automatyczna migawka stanu CRM SKN Seksuologii");

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        fileId: file.getId(),
        fileName: fileName,
        url: file.getUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: `Nieznana akcja: ${action}`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
