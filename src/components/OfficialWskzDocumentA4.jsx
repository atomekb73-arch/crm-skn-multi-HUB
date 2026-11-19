import React from 'react';
import { createPortal } from 'react-dom';
import {
  Edit3,
  Save,
  Printer,
  Download,
  X,
  FileSpreadsheet,
  FileText,
  Building2,
} from 'lucide-react';
import { getOrgMetadata, getActiveSupervisors, formatSupervisorName, formatPolishDate, formatOrgGenitive } from './DocumentTemplates';

/**
 * Usuwa początkowy numer porządkowy z nazwy koła (np. "10 SKN Seksuologii" -> "SKN Seksuologii")
 */
function cleanOrgName(name) {
  return String(name || '').replace(/^\d+\s+/, '').trim();
}

/**
 * Komponent arkusza dokumentu A4 z oficjalnym nagłówkiem i stopką WSKZ
 */
export function OfficialWskzDocumentSheet({
  children,
  org = null,
  academicYear = '2026/2027',
  docNumber = null,
  docDate = new Date(),
  isMultiPage = false,
  className = '',
  style = {},
}) {
  const { name: rawOrgName } = getOrgMetadata(org);
  const activeOrgName = cleanOrgName(rawOrgName);

  return (
    <div
      id="skn-a4-print-area"
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        width: '210mm',
        minHeight: isMultiPage ? 'auto' : '297mm',
        height: isMultiPage ? 'auto' : '297mm',
        display: isMultiPage ? 'block' : 'flex',
        flexDirection: isMultiPage ? undefined : 'column',
        justifyContent: isMultiPage ? undefined : 'space-between',
        padding: 0,
        margin: '0 auto',
        background: '#ffffff',
        boxSizing: 'border-box',
        ...style,
      }}
      className={`w-full max-w-[210mm] shrink-0 bg-white text-slate-900 rounded-xs shadow-2xl border border-slate-300 relative select-text mb-8 print:mb-0 print:border-none print:shadow-none ${
        isMultiPage ? 'min-h-auto h-auto' : 'h-[297mm] min-h-[297mm] max-h-[297mm] overflow-hidden'
      } ${className}`}
    >
      {/* ── STREFA GÓRNA: Padding 15mm 20mm 0 20mm + Oficjalny Nagłówek WSKZ ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '15mm 20mm 0 20mm',
          width: '100%',
          boxSizing: 'border-box',
        }}
        className={`w-full select-text ${isMultiPage ? 'print:!py-0 print:!px-[15mm] print:!w-full print:!block' : 'flex-1'}`}
      >
        {/* 1:1 Oficjalny Nagłówek Graficzny WSKZ (Logo + Cytat Marka Twaina) */}
        <div className="pb-3 select-none w-full">
          <img
            src="/wskz-header.png"
            alt="Wyższa Szkoła Kształcenia Zawodowego — Nagłówek oficjalny"
            className="w-full h-auto block object-contain"
            loading="eager"
          />
        </div>

        {/* Zawartość merytoryczna dokumentu */}
        <div className="flex-1 flex flex-col w-full text-[11pt] leading-[1.5] text-[#111827]">
          {children}
        </div>
      </div>

      {/* ── STREFA DOLNA: Full-Bleed Stopka WSKZ (tylko dla dokumentów jednostronicowych) ── */}
      {!isMultiPage && (
        <div
          style={{ width: '100%', margin: 0, padding: 0 }}
          className="break-inside-avoid select-none w-full mt-auto"
        >
          {/* Dyskretny, oficjalny pasek metadanych systemu CRM SKN WSKZ */}
          <div
            style={{ padding: '0 20mm 16px 20mm' }}
            className="flex items-end justify-between text-[8pt] text-slate-500 font-sans leading-tight select-text w-full"
          >
            <div className="text-left space-y-0.5">
              <p className="text-[7.5pt] text-slate-400 leading-none">Autentyczność dokumentu potwierdzona w systemie</p>
              <p className="text-[8pt] font-semibold text-slate-700 leading-none">CRM {formatOrgGenitive(activeOrgName)}</p>
              <p className="text-[7.5pt] text-slate-400 leading-none">Wygenerowano w systemie CRM SKN WSKZ</p>
            </div>
            <div className="text-right shrink-0 space-y-0.5 font-sans">
              <p className="text-[8pt] text-slate-500">Wrocław, dn. {formatPolishDate(docDate || new Date())}</p>
              {docNumber && <p className="font-mono text-[8pt] text-slate-700 font-medium">Nr ref.: {docNumber}</p>}
            </div>
          </div>

          {/* 1:1 Oficjalna Stopka Graficzna WSKZ Full-Bleed */}
          <img
            src="/wskz-footer.png"
            alt="Wyższa Szkoła Kształcenia Zawodowego — Stopka oficjalna"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              margin: 0,
              padding: 0,
              verticalAlign: 'bottom',
            }}
            className="w-full h-auto block object-cover print:object-cover"
            loading="eager"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Główny komponent modala z portalem pełnoekranowym, odizolowanym od drzewa DOM aplikacji (#root)
 */
export default function OfficialWskzDocumentA4({
  isOpen = false,
  onClose,
  title = 'Podgląd i Druk Dokumentu A4',
  documentCode = null,
  docNumber = null,
  docDate = new Date(),
  academicYear = '2026/2027',
  org = null,
  isMultiPage = false,
  isEditing = false,
  onToggleEdit = null,
  onExportExcel = null,
  docxUrl = '/szablon-pisma-wskz.docx',
  extraActions = null,
  children,
}) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div
      id="skn-a4-modal-backdrop"
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex flex-col items-center p-3 sm:p-6 print:p-0 print:bg-white print:static print:block font-sans"
    >
      {/* ── Hermetyczne Style Druku (@media print & @page) ── */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: ${isMultiPage ? '14mm 0 16mm 0' : '0'};
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${isMultiPage ? '100%' : '210mm'} !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          #root,
          #skn-a4-top-bar {
            display: none !important;
          }
          #skn-a4-modal-backdrop {
            position: static !important;
            display: block !important;
            visibility: visible !important;
            overflow: visible !important;
            width: ${isMultiPage ? '100%' : '210mm'} !important;
            min-height: auto !important;
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #skn-a4-modal-backdrop * {
            visibility: visible !important;
          }
          #skn-a4-print-area {
            position: static !important;
            width: 100% !important;
            max-width: ${isMultiPage ? '100%' : '210mm'} !important;
            min-height: ${isMultiPage ? 'auto' : '297mm'} !important;
            height: ${isMultiPage ? 'auto' : '297mm'} !important;
            max-height: ${isMultiPage ? 'none' : '297mm'} !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            display: ${isMultiPage ? 'block' : 'flex'} !important;
            flex-direction: ${isMultiPage ? 'unset' : 'column'} !important;
            justify-content: ${isMultiPage ? 'unset' : 'space-between'} !important;
            page-break-inside: ${isMultiPage ? 'auto' : 'avoid'} !important;
            break-inside: ${isMultiPage ? 'auto' : 'avoid'} !important;
            page-break-after: ${isMultiPage ? 'auto' : 'avoid'} !important;
            break-after: ${isMultiPage ? 'auto' : 'avoid'} !important;
            overflow: ${isMultiPage ? 'visible' : 'hidden'} !important;
            background: #ffffff !important;
          }

          /* Dla wielostronicowych tabel: boczne marginesy 15mm na kontenerze treści (pozwala na full-bleed stopki 210mm) */
          ${isMultiPage ? `
          #skn-a4-print-area > div:first-child {
            padding: 0 15mm !important;
            width: 100% !important;
            box-sizing: border-box !important;
            display: block !important;
          }
          ` : ''}

          #skn-a4-print-area img {
            max-width: 100% !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #skn-a4-print-area input,
          #skn-a4-print-area textarea {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            outline: none !important;
            padding: 0 !important;
            resize: none !important;
          }
          /* Tabele wielostronicowe */
          #skn-a4-print-area table {
            width: 100% !important;
            min-width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          #skn-a4-print-area thead {
            display: table-header-group !important;
          }
          #skn-a4-print-area tbody {
            display: table-row-group !important;
          }
          #skn-a4-print-area tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #skn-a4-print-area th,
          #skn-a4-print-area td {
            padding: 6px 8px !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
            hyphens: manual !important;
            box-sizing: border-box !important;
          }
          #skn-a4-print-area .whitespace-nowrap,
          #skn-a4-print-area th.whitespace-nowrap,
          #skn-a4-print-area td.whitespace-nowrap,
          #skn-a4-print-area .col-nowrap {
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow-wrap: normal !important;
          }
          /* Nierozdzielny blok końcowy: podpisy + nota + stopka WSKZ */
          .multipage-closing-block,
          #skn-a4-print-area .multipage-closing-block,
          #skn-a4-print-area .signature-block,
          #skn-a4-print-area .signatures-block,
          #skn-a4-print-area .inter-club-signatures,
          #skn-a4-print-area [data-signature-block] {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 24px !important;
            width: 100% !important;
          }
          /* Pełnoszerokościowa (edge-to-edge 210mm) grafika stopki /wskz-footer.png na ostatniej stronie */
          #skn-a4-print-area .wskz-footer-fullbleed,
          .multipage-closing-block .wskz-footer-fullbleed {
            width: 210mm !important;
            max-width: 210mm !important;
            margin-left: -15mm !important;
            margin-right: -15mm !important;
            margin-bottom: -16mm !important;
            padding: 0 !important;
            display: block !important;
            overflow: hidden !important;
          }
          #skn-a4-print-area .wskz-footer-fullbleed img,
          .multipage-closing-block .wskz-footer-fullbleed img {
            width: 210mm !important;
            max-width: 210mm !important;
            height: auto !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            object-fit: cover !important;
          }
          /* Sprawozdanie Zbiorcze Aktywności: brak pustej 1. strony oraz zakotwiczenie stopki na samym dole ostatniej strony */
          #skn-a4-print-area:has(.inter-club-report-print) {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          #skn-a4-print-area:has(.inter-club-report-print) > div:first-child {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            padding: 0 15mm !important;
            box-sizing: border-box !important;
            width: 100% !important;
          }
          #skn-a4-print-area:has(.inter-club-report-print) > div:first-child > div:last-child {
            display: block !important;
            min-height: auto !important;
            width: 100% !important;
          }
          #skn-a4-print-area .inter-club-report-print {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
            width: 100% !important;
          }
          #skn-a4-print-area .inter-club-report-print .inter-club-last-page {
            page-break-before: always !important;
            break-before: page !important;
            display: flex !important;
            flex-direction: column !important;
            min-height: 265mm !important;
            height: auto !important;
            width: 100% !important;
          }
          #skn-a4-print-area .inter-club-report-print .multipage-closing-block,
          #skn-a4-print-area .inter-club-report-print .inter-club-closing-block {
            margin-top: auto !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            width: 100% !important;
          }
          /* Usunięcie obramowań kontenerów wewnątrz kartki */
          #skn-a4-print-area .border,
          #skn-a4-print-area .rounded-xl,
          #skn-a4-print-area .rounded-2xl {
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* ── Górny Pasek Akcji (#skn-a4-top-bar, ukryty w druku) ── */}
      <div
        id="skn-a4-top-bar"
        className="w-full max-w-[210mm] shrink-0 bg-white rounded-2xl border border-slate-300 shadow-xl p-3 sm:p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden z-10"
      >
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {title}
            </h3>
            <p className="text-[11px] text-slate-500 font-mono truncate">
              {documentCode && <span className="font-bold text-indigo-700 mr-1.5">{documentCode}</span>}
              Format A4 • Rok akad. {academicYear}
            </p>
          </div>
        </div>

        {/* Przyciski operacyjne */}
        <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
          {extraActions}

          {/* 1. Edytuj treść na żywo */}
          {onToggleEdit && (
            <button
              type="button"
              onClick={onToggleEdit}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isEditing
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {isEditing ? <Save size={14} className="text-amber-800" /> : <Edit3 size={14} className="text-slate-600" />}
              <span>{isEditing ? 'Zakończ edycję' : 'Edytuj treść'}</span>
            </button>
          )}

          {/* 2. Eksport do Excela (jeśli dotyczy tabeli) */}
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition cursor-pointer shadow-2xs"
              title="Eksportuj dane zestawienia do arkusza Excel (.xlsx)"
            >
              <FileSpreadsheet size={14} className="text-emerald-700" />
              <span>Eksportuj do Excela (XLSX)</span>
            </button>
          )}

          {/* 3. Pobierz szablon DOCX */}
          {docxUrl && (
            <a
              href={docxUrl}
              download="szablon-pisma-wskz.docx"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition cursor-pointer"
              title="Pobierz oficjalny szablon dokumentu programu Word (.DOCX)"
            >
              <Download size={14} className="text-slate-600" />
              <span>Szablon DOCX</span>
            </a>
          )}

          {/* 4. Drukuj / Zapisz PDF */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition cursor-pointer"
            title="Drukuj lub zapisz jako PDF (Ctrl+P)"
          >
            <Printer size={14} />
            <span>Drukuj / Zapisz PDF</span>
          </button>

          {/* 5. Zamknij podgląd */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer border border-transparent hover:border-slate-300"
            title="Zamknij podgląd dokumentu"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Arkusz A4 ── */}
      <OfficialWskzDocumentSheet
        org={org}
        academicYear={academicYear}
        docNumber={docNumber || documentCode}
        docDate={docDate}
        isMultiPage={isMultiPage}
      >
        {children}
      </OfficialWskzDocumentSheet>
    </div>,
    document.body
  );
}
