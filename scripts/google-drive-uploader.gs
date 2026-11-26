/**
 * ==============================================================================
 * CRM SKN WSKZ — Google Apps Script: Automatyczny zapis PDF A4 na Dysku Google
 * ==============================================================================
 *
 * INSTRUKCJA WDROŻENIA JAKO WEB APP (KROK PO KROKU):
 * 1. Otwórz https://script.google.com i zaloguj się na konto Google z dostępem
 *    do folderów kół naukowych (uprawnienia Edytor dla każdego folderu koła).
 * 2. Kliknij „Nowy projekt” i nadaj mu nazwę np. „CRM SKN - Google Drive PDF Uploader”.
 * 3. Wklej całą zawartość tego pliku do edytora (Kod.gs) i zapisz (Ctrl+S).
 * 4. Kliknij przycisk „Wdróż” (Deploy) -> „Nowe wdrożenie” (New deployment).
 * 5. Wybierz typ: „Aplikacja internetowa” (Web app):
 *    - Opis: „CRM SKN PDF Uploader v1”
 *    - Wykonaj jako (Execute as): „Ja” (Me)
 *    - Kto ma dostęp (Who has access): „Każdy” (Anyone)
 * 6. Kliknij „Wdróż”, zatwierdź uprawnienia do Google Drive (Zaawansowane -> Przejdź do projektu).
 * 7. Skopiuj wygenerowany adres URL aplikacji internetowej (kończy się na /exec).
 * 8. Wklej ten adres jako zmienną środowiskową:
 *      VITE_GOOGLE_DRIVE_WEBHOOK_URL="https://script.google.com/macros/s/.../exec"
 *    w pliku .env lokalnie oraz w panelu Vercel (Project Settings -> Environment Variables).
 * 9. W aplikacji CRM dla każdego koła wpisz link do jego folderu Google Drive w:
 *      Ustawienia -> Główny Katalog Google Drive Koła Naukowego
 * ==============================================================================
 */

/**
 * Odbiera żądanie POST z CRM SKN WSKZ i zapisuje plik PDF w docelowym folderze Drive.
 * Oczekiwany payload JSON:
 * {
 *   "folderId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
 *   "fileName": "SKN_Seksuologii_ZASW_2026-11-26.pdf",
 *   "fileBase64": "<czysty_ciag_base64>",
 *   "mimeType": "application/pdf"
 * }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'error',
        message: 'Brak danych w żądaniu POST (puste body).'
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var folderId = (payload.folderId || '').toString().trim();
    var fileName = (payload.fileName || 'Dokument_SKN.pdf').toString().trim();
    var fileBase64 = (payload.fileBase64 || '').toString().trim();
    var mimeType = (payload.mimeType || 'application/pdf').toString().trim();

    if (!folderId) {
      return createJsonResponse({
        status: 'error',
        message: 'Brak wymaganego parametru folderId.'
      });
    }

    if (!fileBase64) {
      return createJsonResponse({
        status: 'error',
        message: 'Brak wymaganego parametru fileBase64 (zawartości PDF).'
      });
    }

    // Usunięcie ewentualnego prefiksu data:application/pdf;base64,
    var cleanBase64 = fileBase64.indexOf(',') !== -1
      ? fileBase64.split(',')[1]
      : fileBase64;

    var bytes = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);

    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);

    return createJsonResponse({
      status: 'ok',
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: file.getName()
    });
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: 'Błąd zapisu na Dysku Google: ' + (err && err.message ? err.message : String(err))
    });
  }
}

/**
 * Prosty endpoint diagnostyczny GET (do sprawdzenia w przeglądarce, czy Web App działa).
 */
function doGet() {
  return createJsonResponse({
    status: 'ok',
    service: 'CRM SKN WSKZ Google Drive PDF Uploader',
    timestamp: new Date().toISOString()
  });
}

/**
 * Helper zwracający poprawną odpowiedź JSON z Google Apps Script.
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
