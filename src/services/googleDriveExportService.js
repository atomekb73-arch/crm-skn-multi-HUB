/**
 * Serwis generowania dokumentów PDF A4 (Base64) i wysyłki jednym kliknięciem
 * bezpośrednio do przypisanego folderu koła naukowego na Dysku Google
 * poprzez webhook Google Apps Script (VITE_GOOGLE_DRIVE_WEBHOOK_URL).
 */

/**
 * Wyciąga czyste folderId z pełnego adresu URL Google Drive lub zwraca samo ID,
 * jeśli użytkownik wkleił bezpośrednio identyfikator folderu.
 *
 * Obsługiwane formaty:
 * - https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz?usp=sharing
 * - https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
 * - https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz
 * - https://drive.google.com/folderview?id=1AbCdEfGhIjKlMnOpQrStUvWxYz
 * - 1AbCdEfGhIjKlMnOpQrStUvWxYz (surowe ID)
 */
export function extractGoogleDriveFolderId(urlOrId) {
  if (!urlOrId) return null;
  const raw = String(urlOrId).trim();
  if (!raw) return null;

  // Format: /folders/<ID>
  const foldersMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (foldersMatch?.[1]) {
    return foldersMatch[1];
  }

  // Format: ?id=<ID> lub &id=<ID>
  const queryIdMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryIdMatch?.[1]) {
    return queryIdMatch[1];
  }

  // Surowy identyfikator folderu (bez ukośników i protokołu)
  if (!raw.includes('/') && !raw.includes(' ') && /^[a-zA-Z0-9_-]{15,}$/.test(raw)) {
    return raw;
  }

  return null;
}

/**
 * Zwraca skonfigurowany adres URL webhooka Google Apps Script z .env / Vercel.
 */
export function getGoogleDriveWebhookUrl() {
  try {
    const url = import.meta?.env?.VITE_GOOGLE_DRIVE_WEBHOOK_URL || '';
    return String(url).trim();
  } catch {
    return '';
  }
}

/**
 * Buduje bezpieczną, czytelną nazwę pliku PDF (bez polskich znaków specjalnych i ukośników).
 */
export function buildSafePdfFileName({ title = 'Dokument_SKN', docNumber = '', orgShortName = '', date = new Date() } = {}) {
  const sanitize = (str) =>
    String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

  const dateObj = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const dateStr = dateObj.toISOString().slice(0, 10);

  const parts = [
    sanitize(orgShortName),
    sanitize(title).slice(0, 60),
    sanitize(docNumber),
    dateStr,
  ].filter(Boolean);

  const base = parts.join('_') || `Dokument_SKN_${dateStr}`;
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

/**
 * Renderuje wskazany arkusz A4 DOM (#skn-a4-print-area) do binarnego PDF A4
 * i zwraca czysty ciąg Base64 (bez prefiksu data:application/pdf;base64,).
 * Biblioteki html2canvas-pro oraz jspdf są ładowane leniwie (dynamic import).
 */
export async function generatePdfBase64FromElement(element, { isMultiPage = false } = {}) {
  if (!element) {
    throw new Error('Nie znaleziono arkusza dokumentu A4 do wygenerowania pliku PDF.');
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  // Poczekaj aż wszystkie obrazki wewnątrz arkusza (nagłówek/stopka WSKZ) są załadowane
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    })
  );

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: element.scrollWidth || 794,
    onclone: (clonedDoc) => {
      // Ukryj elementy nieprzeznaczone do druku w klonie
      clonedDoc.querySelectorAll('.print\\:hidden').forEach((el) => {
        el.style.display = 'none';
      });
      // Zamień aktywne inputy/textarea na czysty wygląd wydruku
      clonedDoc.querySelectorAll('#skn-a4-print-area input, #skn-a4-print-area textarea').forEach((el) => {
        el.style.border = 'none';
        el.style.background = 'transparent';
        el.style.boxShadow = 'none';
      });
    },
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const imgWidthMm = pageWidthMm;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  if (!isMultiPage || imgHeightMm <= pageHeightMm + 1) {
    // Dokument jednostronicowy — dopasowanie 1:1 do arkusza A4
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const renderHeight = Math.min(imgHeightMm, pageHeightMm);
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMm, renderHeight, undefined, 'FAST');
  } else {
    // Dokument wielostronicowy — podział canvasu na kolejne strony A4 (297mm)
    const pageHeightPx = Math.floor((canvas.width * pageHeightMm) / pageWidthMm);
    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - offsetY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;

      const ctx = pageCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx
      );

      const sliceHeightMm = (sliceHeightPx * pageWidthMm) / canvas.width;
      const sliceData = pageCanvas.toDataURL('image/jpeg', 0.92);

      if (pageIndex > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(sliceData, 'JPEG', 0, 0, pageWidthMm, sliceHeightMm, undefined, 'FAST');

      offsetY += sliceHeightPx;
      pageIndex += 1;
    }
  }

  const dataUri = pdf.output('datauristring');
  const commaIdx = dataUri.indexOf(',');
  return commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
}

/**
 * Generuje PDF A4 z arkusza DOM i wysyła go na webhook Google Apps Script,
 * który zapisuje plik bezpośrednio w folderze Google Drive przypisanym do koła.
 */
export async function uploadPdfToGoogleDrive({
  element,
  folderUrlOrId,
  fileName,
  isMultiPage = false,
  orgId = null,
  docNumber = null,
}) {
  const folderId = extractGoogleDriveFolderId(folderUrlOrId);
  if (!folderId) {
    const err = new Error(
      'Koło nie ma jeszcze podpiętego folderu na Dysku Google. Przejdź do zakładki: Ustawienia → Folder Dysku Google i wklej link do folderu koła.'
    );
    err.code = 'NO_FOLDER';
    throw err;
  }

  const webhookUrl = getGoogleDriveWebhookUrl();
  if (!webhookUrl) {
    const err = new Error(
      'Brak skonfigurowanego adresu webhooka (VITE_GOOGLE_DRIVE_WEBHOOK_URL). Wdróż skrypt scripts/google-drive-uploader.gs jako Web App i dodaj URL w zmiennych środowiskowych.'
    );
    err.code = 'NO_WEBHOOK';
    throw err;
  }

  const fileBase64 = await generatePdfBase64FromElement(element, { isMultiPage });

  // Używamy Content-Type: text/plain;charset=utf-8, aby uniknąć blokady CORS preflight (OPTIONS) w Google Apps Script
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      folderId,
      fileName,
      fileBase64,
      mimeType: 'application/pdf',
      orgId,
      docNumber,
    }),
  });

  if (!response.ok) {
    throw new Error(`Błąd serwera Google Apps Script (HTTP ${response.status}). Sprawdź wdrożenie Web App.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Nieprawidłowa odpowiedź z webhooka Google Apps Script (oczekiwano JSON).');
  }

  if (!data || data.status !== 'ok' || !data.fileUrl) {
    throw new Error(data?.message || 'Nie udało się zapisać pliku PDF na Dysku Google.');
  }

  return {
    status: 'ok',
    fileId: data.fileId,
    fileUrl: data.fileUrl,
    fileName: data.fileName || fileName,
  };
}
