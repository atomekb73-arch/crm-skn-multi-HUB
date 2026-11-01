import React from 'react';
import { Columns, CheckSquare, Square, RotateCcw, Eye } from 'lucide-react';

/**
 * Predefiniowane schematy kolumn dla poszczególnych szablonów tabelarycznych
 */
export const DEFAULT_TABLE_COLUMNS = {
  members_registry: [
    { key: 'lp', label: 'LP.', default: true },
    { key: 'fullName', label: 'Imię i Nazwisko', default: true },
    { key: 'index', label: 'Nr Albumu / Indeksu', default: true },
    { key: 'field', label: 'Kierunek Studiów', default: true },
    { key: 'year', label: 'Rok', default: true },
    { key: 'present', label: 'Obecności', default: true },
    { key: 'freq', label: 'Frekwencja (%)', default: true },
    { key: 'points', label: 'Punkty Aktywności', default: true },
    { key: 'status', label: 'Zaliczenie / Status', default: false },
  ],
  meetings_summary: [
    { key: 'lp', label: 'LP.', default: true },
    { key: 'date', label: 'Data', default: true },
    { key: 'type', label: 'Forma / Typ', default: true },
    { key: 'title', label: 'Temat / Zakres Merytoryczny', default: true },
    { key: 'speaker', label: 'Prelegent / Prowadzący', default: true },
    { key: 'attendees', label: 'Frekwencja (os.)', default: true },
  ],
  research_conferences: [
    { key: 'lp', label: 'LP.', default: true },
    { key: 'category', label: 'Kategoria', default: true },
    { key: 'title', label: 'Tytuł Osiągnięcia / Projektu', default: true },
    { key: 'authors', label: 'Autorzy / Zespół', default: true },
    { key: 'scope', label: 'Zakres Prac', default: true },
    { key: 'points', label: 'Waga / Punkty', default: true },
  ],
  annual_report: [
    { key: 'lp', label: 'LP.', default: true },
    { key: 'fullName', label: 'Imię i Nazwisko', default: true },
    { key: 'index', label: 'Nr Indeksu', default: true },
    { key: 'field', label: 'Kierunek', default: true },
    { key: 'present', label: 'Obecności', default: true },
    { key: 'freq', label: 'Frekwencja (%)', default: true },
    { key: 'points', label: 'Punkty', default: true },
    { key: 'status', label: 'Status', default: true },
  ],
  official_registry: [
    { key: 'lp', label: 'LP.', default: true },
    { key: 'id', label: 'Nr Aktu / Sygnatura', default: true },
    { key: 'type', label: 'Typ Dokumentu', default: true },
    { key: 'recipient', label: 'Odbiorca (Nr Albumu)', default: true },
    { key: 'issueDate', label: 'Data Wydania', default: true },
    { key: 'details', label: 'Przedmiot / Temat', default: true },
    { key: 'status', label: 'Status', default: true },
  ],
  membership: [
    { key: 'cert_freq', label: 'Sekcja Frekwencji', default: true },
    { key: 'cert_points', label: 'Sekcja Punktów i Oceny', default: true },
  ],
};

export default function DocumentCustomizer({
  docType = 'members_registry',
  columnVisibility = {},
  onChangeVisibility = () => {},
  onResetColumns = () => {},
}) {
  const schema = DEFAULT_TABLE_COLUMNS[docType];
  if (!schema || schema.length === 0) return null;

  const handleToggle = (key) => {
    const colDef = schema.find(c => c.key === key);
    const currentVal = columnVisibility[key] !== undefined ? Boolean(columnVisibility[key]) : Boolean(colDef?.default);
    onChangeVisibility(key, !currentVal);
  };

  const handleSelectAll = () => {
    schema.forEach(col => onChangeVisibility(col.key, true));
  };

  return (
    <div className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-3 sm:p-4 text-slate-800 text-xs shadow-xs animate-in fade-in duration-200 print:hidden mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-amber-300/40">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-lg bg-amber-500 text-slate-950 font-bold">
            <Columns size={14} />
          </span>
          <div>
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              {docType === 'membership' ? 'Widoczność sekcji zaświadczenia' : 'Konfiguracja widoczności kolumn tabeli'}
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 font-mono">
                Tryb edycji
              </span>
            </h4>
            <p className="text-[11px] text-slate-600">
              {docType === 'membership'
                ? 'Zaznacz lub odznacz sekcje, które mają pojawić się na wydruku (PDF) lub w podglądzie.'
                : 'Zaznacz lub odznacz kolumny, które mają pojawić się na wydruku (PDF) lub w podglądzie.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-amber-300 text-amber-900 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            title="Włącz wszystkie kolumny"
          >
            <Eye size={12} />
            Wszystkie
          </button>
          <button
            type="button"
            onClick={onResetColumns}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-amber-300 text-slate-700 font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            title="Przywróć domyślny układ kolumn"
          >
            <RotateCcw size={12} />
            Resetuj
          </button>
        </div>
      </div>

      {/* Toggles grid */}
      <div className="flex flex-wrap gap-2 pt-1">
        {schema.map(col => {
          const isVisible = columnVisibility[col.key] !== undefined ? Boolean(columnVisibility[col.key]) : Boolean(col.default);
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => handleToggle(col.key)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                isVisible
                  ? 'bg-white text-slate-900 border-amber-400 font-semibold shadow-2xs ring-1 ring-amber-400/30'
                  : 'bg-slate-100/80 text-slate-400 border-slate-300 line-through opacity-70 hover:opacity-100'
              }`}
            >
              {isVisible ? (
                <CheckSquare size={13} className="text-amber-600 shrink-0" />
              ) : (
                <Square size={13} className="text-slate-400 shrink-0" />
              )}
              <span>{col.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
