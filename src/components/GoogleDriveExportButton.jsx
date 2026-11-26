import React, { useState, useEffect } from 'react';
import { CloudUpload, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { showToast } from '../utils/toast';
import {
  extractGoogleDriveFolderId,
  buildSafePdfFileName,
  uploadPdfToGoogleDrive,
} from '../services/googleDriveExportService';

/**
 * Przycisk akcji "Wyślij na Dysk Google" dla generatora dokumentów PDF A4.
 * Generuje PDF Base64 z arkusza A4, wysyła POST na webhook GAS
 * i po zapisaniu wyświetla plakietkę "✓ Na Dysku" oraz link "Otwórz na Dysku Google".
 */
export default function GoogleDriveExportButton({
  getTargetElement,
  title = 'Dokument_A4',
  docNumber = '',
  docDate = new Date(),
  org = null,
  isMultiPage = false,
  disabled = false,
  compact = false,
}) {
  const { driveFolderUrl } = useSettings();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const effectiveFolderUrl = driveFolderUrl || org?.driveFolderUrl || org?.gdriveUrl || '';
  const hasFolderConfigured = Boolean(extractGoogleDriveFolderId(effectiveFolderUrl));

  // Reset statusu po zmianie dokumentu lub koła
  useEffect(() => {
    setUploadedFile(null);
  }, [title, docNumber, org?.id]);

  const handleUploadToDrive = async () => {
    if (isUploading || disabled) return;

    if (!hasFolderConfigured) {
      showToast(
        'Brak podpiętego folderu Google Drive dla tego koła. Przejdź do: Ustawienia → Folder Dysku Google, aby wkleić link folderu.',
        'error'
      );
      return;
    }

    const element = typeof getTargetElement === 'function' ? getTargetElement() : null;
    if (!element) {
      showToast('Nie znaleziono arkusza A4 do wyeksportowania.', 'error');
      return;
    }

    const fileName = buildSafePdfFileName({
      title,
      docNumber,
      orgShortName: org?.shortName || org?.tag || 'SKN',
      date: docDate,
    });

    setIsUploading(true);
    try {
      const result = await uploadPdfToGoogleDrive({
        element,
        folderUrlOrId: effectiveFolderUrl,
        fileName,
        isMultiPage,
        orgId: org?.id || null,
        docNumber: docNumber || null,
      });

      setUploadedFile(result);
      showToast(`Zapisano PDF na Dysku Google: ${result.fileName}`, 'success');
    } catch (err) {
      console.error('[GoogleDriveExportButton] Błąd eksportu PDF na Dysk Google:', err);
      showToast(err?.message || 'Nie udało się wysłać pliku PDF na Dysk Google.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={handleUploadToDrive}
        disabled={disabled || isUploading}
        className={`inline-flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
          compact ? 'px-3 py-1.5' : 'px-3.5 py-2'
        } ${
          disabled
            ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-75'
            : isUploading
              ? 'bg-sky-600 text-white border border-sky-600 cursor-wait opacity-90'
              : 'bg-sky-600 hover:bg-sky-700 text-white border border-sky-600 cursor-pointer shadow-sm'
        }`}
        title={
          !hasFolderConfigured
            ? 'Skonfiguruj folder w: Ustawienia → Folder Dysku Google'
            : 'Wygeneruj PDF A4 i wyślij bezpośrednio do folderu koła na Dysku Google'
        }
      >
        {isUploading ? (
          <>
            <Loader2 size={compact ? 14 : 16} className="animate-spin shrink-0" />
            <span>Wysyłanie PDF...</span>
          </>
        ) : (
          <>
            <CloudUpload size={compact ? 14 : 16} className="shrink-0" />
            <span>Wyślij na Dysk Google</span>
          </>
        )}
      </button>

      {uploadedFile?.fileUrl && (
        <div className="inline-flex items-center gap-1.5 animate-in fade-in">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
            <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
            <span>✓ Na Dysku</span>
          </span>
          <a
            href={uploadedFile.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 text-sky-700 hover:text-sky-900 border border-sky-200 text-[11px] font-bold transition shadow-2xs"
            title={`Otwórz zapisany plik ${uploadedFile.fileName} na Dysku Google`}
          >
            <span>Otwórz na Dysku Google</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        </div>
      )}
    </div>
  );
}
