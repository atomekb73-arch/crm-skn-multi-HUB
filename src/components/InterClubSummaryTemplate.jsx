import React, { useState, useCallback } from 'react';
import { formatPolishDate } from './DocumentTemplates';
import { WSKZ_ORGANIZATIONS } from '../config/wskzRegistry';

/**
 * Usuwa wszystkie emotikony i znaki graficzne Unicode z tekstu dokumentu urzędowego.
 */
export function stripEmojis(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Pomocnik usuwający początkowy numer porządkowy oraz emotikony z nazwy koła
 * (np. "10 SKN Seksuologii" -> "SKN Seksuologii")
 */
function cleanOrgName(name) {
  return stripEmojis(String(name || '').replace(/^\d+\s+/, '')).trim();
}

const EXTRA_ORG_ALIASES = {
  seks: 'SKN Seksuologii',
  seksuologii: 'SKN Seksuologii',
  skn_seksuologii: 'SKN Seksuologii',
  klin: 'SKN Psychologii Klinicznej',
  kliniczna: 'SKN Psychologii Klinicznej',
  skn_psychologii_klinicznej: 'SKN Psychologii Klinicznej',
  onko: 'SKN Psychoonkologii',
  onkologii: 'SKN Psychoonkologii',
  psychoonkologia: 'SKN Psychoonkologii',
  psychoonkologii: 'SKN Psychoonkologii',
  uzal: 'SKN Zachowań Ryzykownych i Uzależnień',
  uzaleznienia: 'SKN Zachowań Ryzykownych i Uzależnień',
  uzależnień: 'SKN Zachowań Ryzykownych i Uzależnień',
  terap: 'SKN Psychoterapii',
  terapii: 'SKN Psychoterapii',
  psychoterapii: 'SKN Psychoterapii',
  skn_psychoterapii: 'SKN Psychoterapii',
  krym: 'SKN Psychologii Kryminalnej',
  kryminalna: 'SKN Psychologii Kryminalnej',
  sadowa: 'SKN Psychologii Sądowej i Kryminologicznej',
  sądowa: 'SKN Psychologii Sądowej i Kryminologicznej',
  integrum: 'SKN Psychotraumatologii - Integrum',
  ewolucyjna: 'SKN Psychologii Społecznej i Ewolucyjnej',
  fizjologii: 'SKN Psychofizjologii',
  zdrowia: 'SKN Psychologii Zdrowia i Środowiska',
  rozwoju: 'SKN Psychologii Rozwoju Dzieci i Młodzieży',
  myslenia: 'SKN Warsztat Krytycznego Myślenia',
  myślenia: 'SKN Warsztat Krytycznego Myślenia',
  reklamy: 'SKN Reklamy, PR i Marketingu',
  startup: 'SKN Nowoczesnego Zarządzania i Start-upów',
};

/**
 * Mapuje obiekt lub surowy kod/skrót współorganizatora (np. "skn_seksuologii", "SEKS", "KLIN")
 * na pełną, czytelną nazwę koła naukowego.
 */
export function formatCoOrganizerName(co) {
  if (!co) return '';

  const candidates = [];
  if (typeof co === 'string') {
    candidates.push(co);
  } else if (typeof co === 'object') {
    if (co.orgId) candidates.push(String(co.orgId));
    if (co.id) candidates.push(String(co.id));
    if (co.code) candidates.push(String(co.code));
    if (co.name) candidates.push(String(co.name));
    if (co.shortName) candidates.push(String(co.shortName));
  }

  for (const raw of candidates) {
    const norm = stripEmojis(raw).trim().toLowerCase();
    if (!norm) continue;

    // 1. Dopasowanie w oficjalnym rejestrze WSKZ_ORGANIZATIONS
    const regMatch = WSKZ_ORGANIZATIONS.find(
      (o) =>
        o.orgId.toLowerCase() === norm ||
        o.code.toLowerCase() === norm ||
        cleanOrgName(o.name).toLowerCase() === norm ||
        cleanOrgName(o.shortName).toLowerCase() === norm
    );
    if (regMatch) {
      return cleanOrgName(regMatch.name);
    }

    // 2. Dopasowanie po znanych skrótach/aliasach
    if (EXTRA_ORG_ALIASES[norm]) {
      return EXTRA_ORG_ALIASES[norm];
    }
  }

  // Fallback: wyczyszczona nazwa obiektu lub surowego tekstu
  if (typeof co === 'object') {
    return cleanOrgName(co.name || co.shortName || co.code || co.orgId || '');
  }
  return cleanOrgName(co);
}

/**
 * Formatuje listę współorganizatorów jako czysty tekst (oddzielony przecinkiem) lub '—'.
 */
function formatCoOrganizersList(coOrgs) {
  if (!Array.isArray(coOrgs) || coOrgs.length === 0) return '—';
  const names = coOrgs
    .map((co) => formatCoOrganizerName(co))
    .filter(Boolean);
  const uniqueNames = Array.from(new Set(names));
  return uniqueNames.length > 0 ? uniqueNames.join(', ') : '—';
}

/**
 * Poprawna polska odmiana rzeczownika "osoba" (1 osoba, 2..4 osoby, 5..21 osób, 22..24 osoby, itd.)
 */
export function getOsobaSuffix(count) {
  const n = Math.abs(Number(count) || 0);
  if (n === 1) return 'osoba';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'osoby';
  }
  return 'osób';
}

export function pluralizeOsoba(count) {
  const n = Number(count) || 0;
  return `${n} ${getOsobaSuffix(n)}`;
}

/**
 * Uniwersalna komórka/tekst z obsługą edycji inline po kliknięciu "Edytuj treść".
 * W trybie druku (@media print) automatycznie zdejmuje obramowania i tło edycji.
 */
function EditableText({
  editKey,
  defaultValue,
  isEditing,
  editedCells,
  onEditCell,
  className = '',
  style = {},
  as: Tag = 'span',
}) {
  const displayValue = editedCells[editKey] !== undefined ? editedCells[editKey] : defaultValue;

  if (!isEditing) {
    return (
      <Tag className={className} style={style}>
        {displayValue}
      </Tag>
    );
  }

  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const nextText = e.currentTarget.textContent ?? '';
        if (nextText !== String(displayValue ?? '')) {
          onEditCell(editKey, nextText);
        }
      }}
      className={`inter-club-editable inline-block min-w-[1.25rem] rounded px-1 py-0.5 border border-dashed border-indigo-400/80 bg-indigo-50/35 hover:bg-indigo-50/60 focus:bg-white focus:border-indigo-600 focus:outline-none cursor-text transition-colors ${className}`}
      style={style}
      title="Kliknij, aby edytować treść przed wydrukiem"
    >
      {displayValue}
    </Tag>
  );
}

export default function InterClubSummaryTemplate({
  startDate = '2026-10-01',
  endDate = '2027-09-30',
  selectedOrgs = [],
  allProcessedEvents = [],
  substantiveMeetings = [],
  projectMeetings = [],
  summaryStats = {},
  byOrgStats = [],
  docDate = new Date(),
  isEditing = false,
  editedCells: externalEditedCells = null,
  onEditCell: externalOnEditCell = null,
  onExportExcel = null,
  onPrint = null,
}) {
  const [localEdits, setLocalEdits] = useState({});
  const editedCells = externalEditedCells || localEdits;
  const handleEditCell = useCallback(
    (key, value) => {
      if (externalOnEditCell) {
        externalOnEditCell(key, value);
      } else {
        setLocalEdits((prev) => ({ ...prev, [key]: value }));
      }
    },
    [externalOnEditCell]
  );

  const formattedDocDate = docDate instanceof Date
    ? docDate.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })
    : stripEmojis(String(docDate));

  const rawActiveOrgName = selectedOrgs.length > 0
    ? (selectedOrgs[0]?.name || selectedOrgs[0]?.shortName || 'Koła Naukowego')
    : 'Koła Naukowego';
  const activeOrgName = cleanOrgName(rawActiveOrgName);

  // Obliczenie łącznej frekwencji i średniej na spotkaniach merytorycznych (Tabela A)
  const substantiveTotalAttendees = substantiveMeetings.reduce(
    (acc, m) => acc + (Number(m.totalParticipants) || 0),
    0
  );

  // Obliczenie łącznej frekwencji i średniej na spotkaniach projektowych (Tabela B)
  const projectTotalAttendees = projectMeetings.reduce(
    (acc, m) => acc + (Number(m.totalParticipants) || 0),
    0
  );
  const projectAvgAttendees = projectMeetings.length > 0
    ? (Math.round((projectTotalAttendees / projectMeetings.length) * 10) / 10).toFixed(1)
    : '0.0';

  // Całkowita frekwencja z obu tabel (Tabela A + Tabela B) dla kafelka "Łączna frekwencja z gośćmi"
  const totalAllAttendees = substantiveTotalAttendees + projectTotalAttendees;

  const noBreakWordStyle = {
    wordBreak: 'normal',
    overflowWrap: 'normal',
    hyphens: 'none',
  };

  return (
    <div
      className="w-full text-slate-900 font-sans select-text relative inter-club-report-print flex flex-col min-h-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 14mm 0 16mm 0;
        }
        @media print {
          .inter-club-report-print {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            min-height: 100vh !important;
            height: auto !important;
            overflow: visible !important;
          }
          .inter-club-main-section {
            flex: 1 0 auto !important;
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
          }
          .inter-club-closing-block,
          .inter-club-report-print .multipage-closing-block,
          #skn-a4-print-area .inter-club-closing-block,
          #skn-a4-print-area .inter-club-report-print .multipage-closing-block {
            margin-top: auto !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            width: 100% !important;
          }
          .inter-club-report-print .wskz-footer-fullbleed {
            width: 210mm !important;
            max-width: 210mm !important;
            margin-left: -15mm !important;
            margin-right: -15mm !important;
            margin-bottom: -16mm !important;
            padding: 0 !important;
            display: block !important;
            overflow: hidden !important;
          }
          .inter-club-report-print .wskz-footer-fullbleed img {
            width: 210mm !important;
            max-width: 210mm !important;
            height: auto !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            object-fit: cover !important;
          }
          .inter-club-editable {
            border: none !important;
            background: transparent !important;
            outline: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }
          .inter-club-report-print table {
            table-layout: fixed !important;
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9.5px !important;
          }
          .inter-club-report-print th,
          .inter-club-report-print td {
            padding: 5px 6px !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
            font-size: 9.5px !important;
            line-height: 1.25 !important;
          }
          .inter-club-report-print .col-org-nobreak {
            word-break: normal !important;
            overflow-wrap: normal !important;
            hyphens: none !important;
          }
          .inter-club-report-print .whitespace-nowrap,
          .inter-club-report-print th.whitespace-nowrap,
          .inter-club-report-print td.whitespace-nowrap {
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow-wrap: normal !important;
          }
          .inter-club-report-print tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .inter-club-kpi-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            padding: 6px 8px !important;
          }
          .inter-club-signatures {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .inter-club-report-print .border,
          .inter-club-report-print .rounded-xl,
          .inter-club-report-print .rounded-2xl {
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Dyskretny pasek informacyjny o aktywnym trybie edycji (ukryty w druku) */}
      {isEditing && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs flex items-center justify-between gap-2 print:hidden">
          <span>
            <strong>Tryb edycji aktywny:</strong> kliknij dowolną komórkę tabeli, nagłówek lub podpis, aby bezpośrednio zmodyfikować treść przed wydrukiem PDF.
          </span>
        </div>
      )}

      {/* ── Sekcja Główna Raportu (Nagłówek, Kafelki Podsumowania oraz Tabele A, B, C) ── */}
      <div
        className="w-full text-slate-900 font-sans inter-club-main-section flex-1 flex flex-col space-y-4"
        style={{ flex: '1 0 auto' }}
      >
        {/* ── Nagłówek Urzędowy WSKZ (Dla Władz Uczelni) ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 print:bg-black inline-block"></span>
              <EditableText
                editKey="hdr_univ"
                defaultValue="Wyższa Szkoła Kształcenia Zawodowego • Wydział Psychologii"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
                className="text-[10.5px] font-bold tracking-widest uppercase text-slate-500 font-mono"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 leading-tight">
              <div>
                <EditableText
                  editKey="hdr_title"
                  defaultValue="Sprawozdanie Zbiorcze Aktywności"
                  isEditing={isEditing}
                  editedCells={editedCells}
                  onEditCell={handleEditCell}
                />
              </div>
              <div className="text-indigo-800 font-extrabold">
                <EditableText
                  editKey="hdr_org"
                  defaultValue={activeOrgName}
                  isEditing={isEditing}
                  editedCells={editedCells}
                  onEditCell={handleEditCell}
                />
              </div>
            </h1>
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
              <div>
                <EditableText
                  editKey="hdr_sub1"
                  defaultValue="Ustandaryzowane zestawienie dla Władz Uczelni"
                  isEditing={isEditing}
                  editedCells={editedCells}
                  onEditCell={handleEditCell}
                />
              </div>
              <div>
                <EditableText
                  editKey="hdr_sub2"
                  defaultValue="(Dziekanat, Kolegium Dziekańskie, PKA)"
                  isEditing={isEditing}
                  editedCells={editedCells}
                  onEditCell={handleEditCell}
                />
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="text-[11px] font-mono font-bold text-slate-600">
              Okres:{' '}
              <EditableText
                editKey="meta_start"
                defaultValue={startDate}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
                className="text-indigo-600 font-black"
              />{' '}
              do{' '}
              <EditableText
                editKey="meta_end"
                defaultValue={endDate}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
                className="text-indigo-600 font-black"
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Data wygenerowania:{' '}
              <EditableText
                editKey="meta_date"
                defaultValue={formattedDocDate}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
                className="font-bold"
              />
            </div>
            <div className="text-[10px] text-slate-500">
              Koło sprawozdawcze:{' '}
              <EditableText
                editKey="meta_org"
                defaultValue={activeOrgName}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
                className="font-bold"
              />
            </div>
          </div>
        </div>

        {/* ── Kafelki Syntetyczne (KPI Podsumowanie) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 print:my-2.5">
          {/* KAFELEK 1: Spotkania Merytoryczne */}
          <div className="inter-club-kpi-card bg-emerald-50/70 rounded-xl px-2.5 py-2 border border-emerald-200/80 print:border-slate-300">
            <EditableText
              editKey="kpi1_lbl"
              defaultValue="Spotkania Merytoryczne"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide block leading-tight"
            />
            <div className="text-[19px] leading-tight font-bold text-emerald-950 mt-0.5 font-mono">
              <EditableText
                editKey="kpi1_val"
                defaultValue={String(summaryStats.substantiveEventsCount || 0)}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <EditableText
              editKey="kpi1_sub"
              defaultValue="Warsztaty, prelekcje, wykłady"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9px] text-emerald-700 mt-0.5 block leading-tight"
            />
          </div>

          {/* KAFELEK 2: Prace Projektowe */}
          <div className="inter-club-kpi-card bg-cyan-50/70 rounded-xl px-2.5 py-2 border border-cyan-200/80 print:border-slate-300">
            <EditableText
              editKey="kpi2_lbl"
              defaultValue="Prace Projektowe & Tech."
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9.5px] font-bold text-cyan-800 uppercase tracking-wide block leading-tight"
            />
            <div className="text-[19px] leading-tight font-bold text-cyan-950 mt-0.5 font-mono">
              <EditableText
                editKey="kpi2_val"
                defaultValue={String(summaryStats.projectEventsCount || 0)}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <EditableText
              editKey="kpi2_sub"
              defaultValue="Zespoły badawcze i wdrożenia"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9px] text-cyan-700 mt-0.5 block leading-tight"
            />
          </div>

          {/* KAFELEK 3: Łącznie Wydarzeń */}
          <div className="inter-club-kpi-card bg-slate-50/90 rounded-xl px-2.5 py-2 border border-slate-200/90 print:border-slate-300">
            <EditableText
              editKey="kpi3_lbl"
              defaultValue="Łącznie Wydarzeń"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block leading-tight"
            />
            <div className="text-[19px] leading-tight font-bold text-slate-900 mt-0.5 font-mono">
              <EditableText
                editKey="kpi3_val"
                defaultValue={String(summaryStats.totalEvents || 0)}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <EditableText
              editKey="kpi3_sub"
              defaultValue={`w tym ${summaryStats.jointEventsCount || 0} międzykołowe`}
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9px] text-slate-500 mt-0.5 block leading-tight"
            />
          </div>

          {/* KAFELEK 4: Łączna Frekwencja z Gośćmi */}
          <div className="inter-club-kpi-card bg-indigo-50/70 rounded-xl px-2.5 py-2 border border-indigo-200/80 print:border-slate-300">
            <EditableText
              editKey="kpi4_lbl"
              defaultValue="Łączna Frekwencja z Gośćmi"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9.5px] font-bold text-indigo-800 uppercase tracking-wide block leading-tight"
            />
            <div className="text-[19px] leading-tight font-bold text-indigo-950 mt-0.5 font-mono">
              <EditableText
                editKey="kpi4_val"
                defaultValue={`${totalAllAttendees} ${getOsobaSuffix(totalAllAttendees)}`}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <EditableText
              editKey="kpi4_sub"
              defaultValue={`średnia: ${substantiveMeetings.length > 0 ? Math.round(substantiveTotalAttendees / substantiveMeetings.length) : 0} os. / spotkanie merytoryczne`}
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[9px] text-indigo-700 mt-0.5 block leading-tight font-medium"
            />
          </div>
        </div>

        {/* ── SEKCJA 1: Spotkania Merytoryczne i Warsztaty ── */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
              <EditableText
                editKey="secA_heading"
                defaultValue={`A. Spotkania Merytoryczne, Warsztaty i Otwarte Prelekcje (${substantiveMeetings.length})`}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </h2>
            <span className="text-[10.5px] font-mono text-slate-500">
              <EditableText
                editKey="secA_total_lbl"
                defaultValue={`Łączna frekwencja: ${substantiveTotalAttendees} uczestników`}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '32%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[10px]">
                  <th className="py-2 px-1.5 text-center whitespace-nowrap" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>Lp.</th>
                  <th className="py-2 px-1.5 text-center whitespace-nowrap" style={{ padding: '6px 5px', whiteSpace: 'nowrap' }}>Data</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', ...noBreakWordStyle }}>Koło wiodące</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', ...noBreakWordStyle }}>Współorganizatorzy</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', wordBreak: 'normal', overflowWrap: 'break-word' }}>Temat / Tytuł spotkania</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', wordBreak: 'normal', overflowWrap: 'break-word' }}>Prelegent / Prowadzący</th>
                  <th className="py-2 px-1.5 text-center whitespace-nowrap bg-emerald-50/70" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>Frekwencja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {substantiveMeetings.length > 0 ? (
                  substantiveMeetings.map((m, idx) => {
                    const rowId = m.id || `a_${idx}`;
                    const primaryOrgDisplay = formatCoOrganizerName(m.primaryOrg) || cleanOrgName(m.primaryOrg?.name || m.primaryOrg?.shortName);
                    const coOrgsDisplay = formatCoOrganizersList(m.coOrgs);
                    const cleanTitle = stripEmojis(m.title || '');
                    const cleanSpeaker = stripEmojis(m.speaker || '');
                    const attDisplay = m.totalParticipants > 0 ? `${m.totalParticipants} os.` : '—';

                    return (
                      <tr key={rowId} className="hover:bg-slate-50/80 transition-colors break-inside-avoid print:break-inside-avoid">
                        <td className="py-1.5 px-1.5 text-center font-mono text-slate-500 font-semibold" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                          <EditableText
                            editKey={`secA_${rowId}_lp`}
                            defaultValue={String(idx + 1)}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-1.5 text-center text-slate-700 whitespace-nowrap text-[10px]" style={{ padding: '6px 5px', whiteSpace: 'nowrap' }}>
                          <EditableText
                            editKey={`secA_${rowId}_date`}
                            defaultValue={stripEmojis(m.date || '')}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-2 col-org-nobreak" style={{ padding: '6px 6px', ...noBreakWordStyle }}>
                          <EditableText
                            editKey={`secA_${rowId}_org`}
                            defaultValue={primaryOrgDisplay}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                            className="font-semibold text-slate-900 block"
                            style={noBreakWordStyle}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-left col-org-nobreak" style={{ padding: '6px 6px', ...noBreakWordStyle }}>
                          <EditableText
                            editKey={`secA_${rowId}_coorgs`}
                            defaultValue={coOrgsDisplay}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                            className={coOrgsDisplay === '—' ? 'text-slate-400 text-[10px]' : 'font-semibold text-slate-900 block'}
                            style={noBreakWordStyle}
                          />
                        </td>
                        <td className="py-1.5 px-2 font-medium text-slate-900 break-words" style={{ padding: '6px 6px', overflowWrap: 'break-word' }}>
                          <EditableText
                            editKey={`secA_${rowId}_title`}
                            defaultValue={cleanTitle}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-slate-600 text-[10.5px] break-words" style={{ padding: '6px 6px', overflowWrap: 'break-word' }}>
                          <EditableText
                            editKey={`secA_${rowId}_speaker`}
                            defaultValue={cleanSpeaker || '—'}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-1.5 text-center whitespace-nowrap font-mono font-bold text-emerald-800 bg-emerald-50/40" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                          <EditableText
                            editKey={`secA_${rowId}_att`}
                            defaultValue={attDisplay}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                      Brak zarejestrowanych spotkań merytorycznych w wybranym przedziale czasowym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SEKCJA 2: Spotkania Zespołów Projektowych i Technicznych ── */}
        <div className="space-y-2.5 pt-5 print:pt-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-600 shrink-0"></span>
              <EditableText
                editKey="secB_heading"
                defaultValue={`B. Spotkania Zespołów Projektowych, Technicznych i Badawczych (${projectMeetings.length})`}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </h2>
            <span className="text-[10.5px] font-mono text-slate-500">
              <EditableText
                editKey="secB_sub"
                defaultValue="Niewliczane do mianownika frekwencji ogólnej"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '32%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[10px]">
                  <th className="py-2 px-1.5 text-center whitespace-nowrap" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>Lp.</th>
                  <th className="py-2 px-1.5 text-center whitespace-nowrap" style={{ padding: '6px 5px', whiteSpace: 'nowrap' }}>Data</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', ...noBreakWordStyle }}>Koło wiodące</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', ...noBreakWordStyle }}>Współorganizatorzy</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', wordBreak: 'normal', overflowWrap: 'break-word' }}>Temat / Cel prac projektowych</th>
                  <th className="py-2 px-2 text-left" style={{ padding: '6px 6px', wordBreak: 'normal', overflowWrap: 'break-word' }}>Koordynator / Prelegent</th>
                  <th className="py-2 px-1.5 text-center whitespace-nowrap bg-cyan-50/70" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>Frekwencja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {projectMeetings.length > 0 ? (
                  projectMeetings.map((m, idx) => {
                    const rowId = m.id || `b_${idx}`;
                    const primaryOrgDisplay = formatCoOrganizerName(m.primaryOrg) || cleanOrgName(m.primaryOrg?.name || m.primaryOrg?.shortName);
                    const coOrgsDisplay = formatCoOrganizersList(m.coOrgs);
                    const cleanTitle = stripEmojis(m.title || '');
                    const cleanSpeaker = stripEmojis(m.speaker || '');
                    const attDisplay = m.totalParticipants > 0 ? `${m.totalParticipants} os.` : '—';

                    return (
                      <tr key={rowId} className="hover:bg-slate-50/80 transition-colors break-inside-avoid print:break-inside-avoid">
                        <td className="py-1.5 px-1.5 text-center font-mono text-slate-500 font-semibold" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                          <EditableText
                            editKey={`secB_${rowId}_lp`}
                            defaultValue={String(idx + 1)}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-1.5 text-center text-slate-700 whitespace-nowrap text-[10px]" style={{ padding: '6px 5px', whiteSpace: 'nowrap' }}>
                          <EditableText
                            editKey={`secB_${rowId}_date`}
                            defaultValue={stripEmojis(m.date || '')}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-2 col-org-nobreak" style={{ padding: '6px 6px', ...noBreakWordStyle }}>
                          <EditableText
                            editKey={`secB_${rowId}_org`}
                            defaultValue={primaryOrgDisplay}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                            className="font-semibold text-slate-900 block"
                            style={noBreakWordStyle}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-left col-org-nobreak" style={{ padding: '6px 6px', ...noBreakWordStyle }}>
                          <EditableText
                            editKey={`secB_${rowId}_coorgs`}
                            defaultValue={coOrgsDisplay}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                            className={coOrgsDisplay === '—' ? 'text-slate-400 text-[10px]' : 'font-semibold text-slate-900 block'}
                            style={noBreakWordStyle}
                          />
                        </td>
                        <td className="py-1.5 px-2 font-medium text-slate-900 break-words" style={{ padding: '6px 6px', overflowWrap: 'break-word' }}>
                          <EditableText
                            editKey={`secB_${rowId}_title`}
                            defaultValue={cleanTitle}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-slate-600 text-[10.5px] break-words" style={{ padding: '6px 6px', overflowWrap: 'break-word' }}>
                          <EditableText
                            editKey={`secB_${rowId}_speaker`}
                            defaultValue={cleanSpeaker || '—'}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                        <td className="py-1.5 px-1.5 text-center whitespace-nowrap font-mono font-bold text-cyan-800 bg-cyan-50/40" style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                          <EditableText
                            editKey={`secB_${rowId}_att`}
                            defaultValue={attDisplay}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                      Brak zarejestrowanych spotkań projektowych/technicznych w wybranym przedziale czasowym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pastylka / Pasek podsumowujący frekwencję projektową */}
          <div className="mt-2 px-3 py-1.5 rounded-xl bg-cyan-50/80 border border-cyan-200/90 text-cyan-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 print:py-1 print:px-2.5 print:text-[9.5px] print:bg-slate-50 print:border-slate-300 break-inside-avoid print:break-inside-avoid">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-600 print:bg-slate-700 shrink-0"></span>
              <EditableText
                editKey="secB_summary_bar"
                defaultValue={`Łączna frekwencja na spotkaniach grup projektowych: ${projectTotalAttendees} uczestników (średnio ${projectAvgAttendees} os./spotkanie)`}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <EditableText
              editKey="secB_summary_tag"
              defaultValue="Osobny wskaźnik zaangażowania"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[10px] text-cyan-700 print:text-slate-600 font-medium"
            />
          </div>
        </div>

        {/* ── SEKCJA 3: Zbiorcze Zestawienie Aktywności wg Kół Naukowych ── */}
        <div className="space-y-2.5 pt-5 print:pt-3.5 print:break-before-page">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></span>
              <EditableText
                editKey="secC_heading"
                defaultValue={`C. Zbiorcza Aktywność Kół Naukowych WSKZ (${byOrgStats.length} Kół)`}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </h2>
            <EditableText
              editKey="secC_sub"
              defaultValue="Synteza statystyczna"
              isEditing={isEditing}
              editedCells={editedCells}
              onEditCell={handleEditCell}
              className="text-[10.5px] font-mono text-slate-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '37%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[10px]">
                  <th className="p-2 text-center whitespace-nowrap">Lp.</th>
                  <th className="p-2 text-center whitespace-nowrap">Kod</th>
                  <th className="p-2 whitespace-nowrap">Nazwa Koła Naukowego</th>
                  <th className="p-2 text-center whitespace-nowrap bg-emerald-50/50">Merytoryczne</th>
                  <th className="p-2 text-center whitespace-nowrap bg-indigo-50/50">Frekwencja</th>
                  <th className="p-2 text-center whitespace-nowrap bg-cyan-50/50">Projektowe</th>
                  <th className="p-2 text-center whitespace-nowrap">Wspólne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {byOrgStats.map((item, idx) => {
                  const org = item.org;
                  const rowId = org.orgId || `c_${idx}`;
                  return (
                    <tr key={rowId} className="hover:bg-slate-50/80 transition-colors break-inside-avoid print:break-inside-avoid">
                      <td className="p-2 text-center font-mono text-slate-500 font-semibold">
                        <EditableText
                          editKey={`secC_${rowId}_lp`}
                          defaultValue={String(idx + 1)}
                          isEditing={isEditing}
                          editedCells={editedCells}
                          onEditCell={handleEditCell}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                          <EditableText
                            editKey={`secC_${rowId}_code`}
                            defaultValue={stripEmojis(org.code || org.number || '')}
                            isEditing={isEditing}
                            editedCells={editedCells}
                            onEditCell={handleEditCell}
                          />
                        </span>
                      </td>
                      <td className="p-2 font-bold text-slate-900 col-org-nobreak" style={noBreakWordStyle}>
                        <EditableText
                          editKey={`secC_${rowId}_name`}
                          defaultValue={cleanOrgName(org.name)}
                          isEditing={isEditing}
                          editedCells={editedCells}
                          onEditCell={handleEditCell}
                        />
                        {org.hasActiveCrm && (
                          <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                            CRM
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold text-emerald-800 bg-emerald-50/30">
                        <EditableText
                          editKey={`secC_${rowId}_subst`}
                          defaultValue={String(item.substantiveCount)}
                          isEditing={isEditing}
                          editedCells={editedCells}
                          onEditCell={handleEditCell}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-semibold text-indigo-900 bg-indigo-50/30 whitespace-nowrap">
                        <EditableText
                          editKey={`secC_${rowId}_att`}
                          defaultValue={item.substantiveAttendees > 0 ? `${item.substantiveAttendees} os.` : '—'}
                          isEditing={isEditing}
                          editedCells={editedCells}
                          onEditCell={handleEditCell}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-semibold text-cyan-800 bg-cyan-50/30">
                        <EditableText
                          editKey={`secC_${rowId}_proj`}
                          defaultValue={String(item.projectCount)}
                          isEditing={isEditing}
                          editedCells={editedCells}
                          onEditCell={handleEditCell}
                        />
                      </td>
                      <td className="p-2 text-center font-mono text-slate-700">
                        <EditableText
                          editKey={`secC_${rowId}_joint`}
                          defaultValue={String(item.jointCount)}
                          isEditing={isEditing}
                          editedCells={editedCells}
                          onEditCell={handleEditCell}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black border-t-2 border-slate-300 text-slate-900 text-xs">
                  <td colSpan={3} className="p-2 text-right uppercase tracking-wider text-[10px]">
                    Suma łączna:
                  </td>
                  <td className="p-2 text-center font-mono text-emerald-900">
                    <EditableText
                      editKey="secC_sum_subst"
                      defaultValue={String(summaryStats.substantiveEventsCount || 0)}
                      isEditing={isEditing}
                      editedCells={editedCells}
                      onEditCell={handleEditCell}
                    />
                  </td>
                  <td className="p-2 text-center font-mono text-indigo-950 whitespace-nowrap">
                    <EditableText
                      editKey="secC_sum_att"
                      defaultValue={`${substantiveTotalAttendees} os.`}
                      isEditing={isEditing}
                      editedCells={editedCells}
                      onEditCell={handleEditCell}
                    />
                  </td>
                  <td className="p-2 text-center font-mono text-cyan-900">
                    <EditableText
                      editKey="secC_sum_proj"
                      defaultValue={String(summaryStats.projectEventsCount || 0)}
                      isEditing={isEditing}
                      editedCells={editedCells}
                      onEditCell={handleEditCell}
                    />
                  </td>
                  <td className="p-2 text-center font-mono">
                    <EditableText
                      editKey="secC_sum_joint"
                      defaultValue={String(summaryStats.jointEventsCount || 0)}
                      isEditing={isEditing}
                      editedCells={editedCells}
                      onEditCell={handleEditCell}
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ── Stopka z Podpisami Władz Uczelni, Notą i Stopką Graficzną WSKZ (Nierozdzielny blok końcowy na dole ostatniej strony) ── */}
      <div
        className="w-full multipage-closing-block inter-club-closing-block break-inside-avoid page-break-inside-avoid select-text mt-auto"
        style={{
          breakInside: 'avoid',
          pageBreakInside: 'avoid',
          marginTop: 'auto',
        }}
      >
        <div className="inter-club-signatures pt-6 border-t border-slate-300 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs print:pt-5">
          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-8 w-40 mx-auto mb-1.5"></div>
            <div className="font-bold text-slate-900 text-[11px]">
              <EditableText
                editKey="sig1_title"
                defaultValue="Koordynator ds. Kół Naukowych"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <div className="text-[10px] text-slate-500">
              <EditableText
                editKey="sig1_sub"
                defaultValue="Wydział Psychologii WSKZ"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-8 w-40 mx-auto mb-1.5"></div>
            <div className="font-bold text-slate-900 text-[11px]">
              <EditableText
                editKey="sig2_title"
                defaultValue="Opiekunowie Naukowi Kół"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <div className="text-[10px] text-slate-500">
              <EditableText
                editKey="sig2_sub"
                defaultValue="Wydział Psychologii WSKZ"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-8 w-40 mx-auto mb-1.5"></div>
            <div className="font-bold text-slate-900 text-[11px]">
              <EditableText
                editKey="sig3_title"
                defaultValue="Dziekan Wydziału Psychologii"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
            <div className="text-[10px] text-slate-500">
              <EditableText
                editKey="sig3_sub"
                defaultValue="Wyższa Szkoła Kształcenia Zawodowego"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </div>
          </div>
        </div>

        {/* Dyskretny pasek metadanych systemu CRM SKN WSKZ */}
        <div className="flex items-end justify-between text-[8pt] text-slate-500 font-sans leading-tight w-full pt-4 pb-2">
          <div className="text-left space-y-0.5">
            <p className="text-[7.5pt] text-slate-400 leading-none">Autentyczność dokumentu potwierdzona w systemie</p>
            <p className="text-[8pt] font-semibold text-slate-700 leading-none">CRM Studenckich Kół Naukowych WSKZ</p>
            <p className="text-[7.5pt] text-slate-400 leading-none">Wygenerowano w systemie CRM SKN WSKZ</p>
          </div>
          <div className="text-right shrink-0 space-y-0.5 font-sans">
            <p className="text-[8pt] text-slate-500">
              Wrocław, dn.{' '}
              <EditableText
                editKey="foot_date"
                defaultValue={formatPolishDate(docDate || new Date())}
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </p>
            <p className="font-mono text-[8pt] text-slate-700 font-medium">
              Nr ref.:{' '}
              <EditableText
                editKey="foot_ref"
                defaultValue="ZESTAWIENIE-WSKZ"
                isEditing={isEditing}
                editedCells={editedCells}
                onEditCell={handleEditCell}
              />
            </p>
          </div>
        </div>

        {/* 1:1 Oficjalna Stopka Graficzna WSKZ (Full-Bleed 210mm) */}
        <div
          className="wskz-footer-fullbleed mt-1 select-none"
          style={{
            width: 'calc(100% + 40mm)',
            maxWidth: '210mm',
            marginLeft: '-20mm',
            marginRight: '-20mm',
            marginBottom: 0,
            padding: 0,
            overflow: 'hidden',
          }}
        >
          <img
            src="/wskz-footer.png"
            alt="Wyższa Szkoła Kształcenia Zawodowego — Stopka oficjalna"
            style={{
              width: '100%',
              maxWidth: '210mm',
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
      </div>
    </div>
  );
}
