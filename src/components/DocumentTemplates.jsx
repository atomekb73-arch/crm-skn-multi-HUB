import React, { useMemo } from 'react';
import { showToast } from '../utils/toast';
import {
  Sparkles,
  Award,
  CheckCircle2,
  Calendar,
  FileText,
  UserCheck,
  ShieldCheck,
  Building2,
  Users,
  Presentation,
  BookOpen,
  Microscope,
  Plus,
  Trash2,
  GraduationCap,
  Mail,
  AlertTriangle,
  Clock,
  FileQuestion,
} from 'lucide-react';
import { CANONICAL_MEETINGS_2025_2026 } from '../utils/canonicalMeetings';
import { getOfficialMemberRecord, getMemberStats } from '../utils/activityRegistry';
import {
  getCurrentAcademicYear,
  getAcademicScope,
  isMeetingInAcademicScope,
  isEwidencjaInAcademicScope,
  getAcademicYearTimeStatus,
  getMemberAcademicStatus,
} from '../utils/academicScope';
import { calculateMemberStats, hasMeetingAttendanceLogs } from '../utils/meetingTypes';
import { DEFAULT_FACULTY_SUPERVISORS } from '../utils/specialRoles';
import { getOrgKey } from '../utils/storage';

export function getAcademicYearShortSlug(academicYear = getCurrentAcademicYear()) {
  const str = String(academicYear || '');
  const matchFull = str.match(/(\d{4})\s*[\/\-]\s*(\d{4})/);
  if (matchFull) {
    return `${matchFull[1].slice(-2)}-${matchFull[2].slice(-2)}`;
  }
  const matchShort = str.match(/(\d{2})\s*[\/\-]\s*(\d{2})/);
  if (matchShort) {
    return `${matchShort[1]}-${matchShort[2]}`;
  }
  return '26-27';
}

/**
 * Zwraca ujednolicone, w pełni dynamiczne metadane organizacji dla szablonów dokumentów
 * Pobiera właściwości bezpośrednio z aktywnego kontekstu organizacji bez twardego kodowania nazw
 */
export function getOrgMetadata(org) {
  let resolvedOrg = org;
  
  // Jeśli org nie został przekazany, próba odczytu z localStorage i domyślnych definicji
  if (!resolvedOrg && typeof window !== 'undefined') {
    const savedId = localStorage.getItem('crm_active_org_id');
    if (savedId) {
      resolvedOrg = { id: savedId };
    }
  }

  const id = resolvedOrg?.id || 'default';
  
  // Nazwa koła - w 100% z obiektu tenanta
  let name = resolvedOrg?.name || '';
  if (!name || name === 'Studenckie Koło Naukowe' || name === 'Studenckie Koło Naukowe WSKZ') {
    name = resolvedOrg?.shortName ? `Studenckie Koło Naukowe ${resolvedOrg.shortName}` : 'Studenckie Koło Naukowe';
  }

  // Skrócona nazwa koła
  let shortName = resolvedOrg?.shortName || resolvedOrg?.tag || name || 'SKN';

  // Oficjalny tag referencyjny dokumentacji (np. SKN-UZAL, SKN-SEKS)
  let tag = resolvedOrg?.tag || (resolvedOrg?.shortName ? resolvedOrg.shortName.toUpperCase().replace(/\s+/g, '-') : 'SKN');

  // Jednostka organizacyjna i Instytut
  let unit = resolvedOrg?.unit || resolvedOrg?.faculty || 'Instytut Psychologii WSKZ';
  const faculty = resolvedOrg?.faculty || unit;

  return {
    id,
    name,
    shortName,
    tag,
    unit,
    faculty,
    resolvedOrg: resolvedOrg || { id, name, shortName, tag, unit, faculty },
  };
}

/**
 * Zwraca dopełniacz nazwy koła (np. do formuły autentyczności certyfikatu w systemie CRM ...)
 */
export function formatOrgGenitive(orgName = '') {
  if (!orgName) return 'Studenckiego Koła Naukowego';
  let str = orgName.trim();
  if (str.startsWith('Studenckie Koło Naukowe')) {
    return str.replace(/^Studenckie Koło Naukowe\s*/i, 'Studenckiego Koła Naukowego ');
  }
  if (str.startsWith('Koło Naukowe')) {
    return str.replace(/^Koło Naukowe\s*/i, 'Studenckiego Koła Naukowego ');
  }
  return `Studenckiego Koła Naukowego ${str}`;
}

/**
 * Zwraca pełną, ujednoliconą nazwę koła z oficjalnym prefixem „Studenckie Koło Naukowe ...”
 */
export function formatOrgFullName(orgName = '') {
  if (!orgName) return 'Studenckie Koło Naukowe';
  let str = orgName.trim();
  if (str.startsWith('Studenckie Koło Naukowe')) {
    return str;
  }
  if (str.startsWith('Koło Naukowe')) {
    return `Studenckie ${str}`;
  }
  return `Studenckie Koło Naukowe ${str}`;
}

/**
 * Wyciąga samą nazwę koła bez przedrostka (np. „Zachowań Ryzykowych i Uzależnień” lub „Seksuologii WSKZ”)
 */
export function getOrgAffiliationSub(orgName = '') {
  if (!orgName) return 'Koła Naukowego';
  return orgName
    .replace(/^Studenckie Koło Naukowe\s*/i, '')
    .replace(/^Koło Naukowe\s*/i, '')
    .trim();
}

/**
 * Globalny, ujednolicony nagłówek dokumentu w architekturze Multi-Tenant:
 * Lewa strona:
 *   Linia 1: WYŻSZA SZKOŁA KSZTAŁCENIA ZAWODOWEGO
 *   Linia 2: INSTYTUT PSYCHOLOGII WSKZ (lub odpowiedni instytut)
 *   Linia 3: Pełna nazwa koła (np. STUDENCKIE KOŁO NAUKOWE ZACHOWAŃ RYZYKOWYCH I UZALEŻNIEŃ)
 *   Linia 4 (jeśli dotyczy): Dodatkowy podtytuł (np. Działalność Badawcza i Konferencyjna)
 * Zmniejszona czcionka (8-9pt / text-[8.5px] - text-[9px]), aby tytuł główny był dominujący.
 * Prawa strona:
 *   Numer dokumentu (np. Rejestr: SKN-UZAL/...) oraz data (np. Stan na dzień: ...)
 */
export function DocumentStandardHeader({
  org = null,
  docNumber = null,
  docDate = new Date(),
  docLabel = 'Dokument', // 'Dokument' | 'Rejestr' | 'Ewidencja' | 'Protokół' | 'Nr aktu' | 'Nr dokumentu' | 'Nr'
  subtitle = null, // Opcjonalna Linia 4
  dateLabel = 'Stan na dzień:', // 'Stan na dzień:' | 'Data:' | 'Wydano:'
  className = '',
  borderBottom = true,
  rightCustom = null,
}) {
  const { name: orgName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);

  return (
    <div className={`w-full ${borderBottom ? 'border-b-2 border-slate-900 pb-2 mb-3' : 'pb-1 mb-2'} ${className}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Lewa strona nagłówka (Struktura 3-4 linie, dyskretna czcionka 8-9pt) */}
        <div className="text-left space-y-0.5">
          <p className="text-[9px] font-bold tracking-wider text-slate-900 uppercase leading-tight font-sans">
            WYŻSZA SZKOŁA KSZTAŁCENIA ZAWODOWEGO
          </p>
          <p className="text-[8.5px] font-bold tracking-wide text-slate-600 uppercase leading-tight font-sans">
            {orgUnit.toUpperCase()}
          </p>
          <p className="text-[8.5px] font-extrabold tracking-tight text-indigo-950 uppercase leading-tight font-sans">
            {orgName.toUpperCase()}
          </p>
          {subtitle && (
            <p className="text-[8px] font-medium text-slate-500 italic leading-tight mt-0.5 font-sans">
              {subtitle}
            </p>
          )}
        </div>

        {/* Prawa strona nagłówka */}
        {rightCustom ? (
          rightCustom
        ) : (
          <div className="text-right shrink-0">
            {docNumber && (
              <div className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                {docLabel && <span className="text-slate-500 font-sans uppercase text-[8px] tracking-wider">{docLabel}:</span>}
                <span>{docNumber}</span>
              </div>
            )}
            <p className="text-[8px] text-slate-500 font-mono mt-0.5 whitespace-nowrap">
              {dateLabel} {formatPolishDate(docDate)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Generuje unikalny, powtarzalny hash i numer dokumentu
 */
export function generateDocumentNumber(prefix, indexNumber, seed = getCurrentAcademicYear(), orgTag = 'SKN') {
  const cleanIdx = String(indexNumber || '00000').replace(/\D/g, '') || '00000';
  let hash = 0;
  const tag = String(orgTag || 'SKN').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const str = `${prefix}-${cleanIdx}-${seed}-${tag}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
  const yearSlug = getAcademicYearShortSlug(seed);
  return `${tag}/${yearSlug}/${cleanIdx}-${hex}`;
}

export function formatPolishDate(date = new Date()) {
  const d = new Date(date);
  return d.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Dynamiczne pobieranie listy aktywnych opiekunów z konfiguracji koła lub stanu
 */
export function getActiveSupervisors(supervisors = [], org = null) {
  const filterActive = (s) => {
    if (!s) return false;
    return typeof s === 'string' || s.isActive !== false;
  };

  if (Array.isArray(supervisors) && supervisors.length > 0) {
    const filtered = supervisors.filter(filterActive);
    if (filtered.length > 0) return filtered;
  }
  if (org && Array.isArray(org.supervisors) && org.supervisors.length > 0) {
    const filtered = org.supervisors.filter(filterActive);
    if (filtered.length > 0) return filtered;
  }
  return (DEFAULT_FACULTY_SUPERVISORS || []).filter(filterActive);
}

export function formatSupervisorName(s) {
  if (!s) return '';
  if (typeof s === 'string') return s;
  return `${s.academicTitle ? s.academicTitle + ' ' : ''}${s.name || s.fullName || ''}`.trim();
}

export function formatSupervisorRole(s) {
  if (!s) return 'Opiekun Koła';
  if (typeof s === 'string') return 'Opiekun Koła';
  return s.role || 'Opiekun Koła';
}

export function formatSupervisorAffiliation(s, defaultUnit = 'Instytut Psychologii WSKZ') {
  if (!s) return defaultUnit;
  if (typeof s === 'string') {
    return s.includes('Wydział Psychologii') ? 'Instytut Psychologii WSKZ' : s;
  }
  const aff = s.affiliation || defaultUnit;
  return aff.includes('Wydział Psychologii') ? 'Instytut Psychologii WSKZ' : aff;
}

/**
 * Reużywalny, w 100% dynamiczny blok podpisów (bez zbędnego powielania „Zarząd”)
 */
export function DocumentSignaturesBlock({
  activeSupervisors = [],
  orgShortName = 'Koło Naukowe',
  orgName = '',
  orgUnit = 'Instytut Psychologii WSKZ',
  chairpersonTitle = 'Zarząd Koła Naukowego',
  chairpersonSub = null,
}) {
  const gridColsClass = activeSupervisors.length === 1
    ? 'grid-cols-2 justify-between'
    : activeSupervisors.length === 2
      ? 'grid-cols-3'
      : 'grid-cols-2 sm:grid-cols-4';

  // Usunięcie zbędnego dublowania napisu „Zarząd Koła Naukowego”
  const resolvedSub = useMemo(() => {
    if (chairpersonSub === false) return null;
    let sub = chairpersonSub;
    if (!sub) {
      sub = orgShortName || orgName;
    }
    // Jeśli tytuł zawiera już "Zarząd", a podtytuł zaczyna się od "Zarząd ", usuwamy zdublowane "Zarząd "
    if (chairpersonTitle?.toLowerCase().includes('zarząd') && sub?.toLowerCase().startsWith('zarząd ')) {
      sub = sub.replace(/^zarząd\s+/i, '');
    }
    // Jeśli podtytuł jest identyczny z tytułem głównym, nie powielamy go
    if (sub?.trim().toLowerCase() === chairpersonTitle?.trim().toLowerCase()) {
      return null;
    }
    return sub;
  }, [chairpersonTitle, chairpersonSub, orgShortName, orgName]);

  return (
    <div
      className="signature-block signatures-block w-full pt-6 sm:pt-8 pb-1 border-t border-slate-200 mt-auto break-inside-avoid"
      style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
    >
      <div className={`grid gap-4 sm:gap-6 text-center ${gridColsClass}`}>
        {/* 1. Pole podpisu Przewodniczącego / Zarządu */}
        <div className="flex flex-col items-center text-center">
          <div className="h-10 sm:h-12 w-full border-b border-dashed border-slate-300 mb-2 flex items-end justify-center pb-1">
            <span className="text-[9px] text-slate-400 font-serif italic">[Podpis elektroniczny]</span>
          </div>
          <span className="text-[11.5px] font-bold text-slate-800 leading-tight">{chairpersonTitle}</span>
          {resolvedSub && (
            <span className="text-[10px] text-slate-500 leading-tight mt-0.5">{resolvedSub}</span>
          )}
        </div>

        {/* 2. Dynamiczne pola podpisów Opiekunów Naukowych */}
        {activeSupervisors.map((sup, index) => (
          <div key={index} className="flex flex-col items-center text-center">
            <div className="h-10 sm:h-12 w-full border-b border-dashed border-slate-300 mb-2 flex items-end justify-center pb-1">
              <span className="text-[9px] text-slate-400 font-serif italic">[Podpis elektroniczny]</span>
            </div>
            <span className="text-[11.5px] font-bold text-slate-800 leading-tight">
              {formatSupervisorName(sup)}
            </span>
            <span className="text-[10px] text-slate-600 font-medium leading-tight mt-0.5">
              {formatSupervisorRole(sup)}
            </span>
            <span className="text-[9px] text-slate-400 leading-tight">
              {formatSupervisorAffiliation(sup, orgUnit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 1. SZABLON: OFICJALNE ZAŚWIADCZENIE O AKTYWNOŚCI I FREKWENCJI ────────────
export function MembershipCertificateTemplate({
  member,
  freqData = null,
  points = 0,
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  isEditing = false,
  customText = null,
  onUpdateCustomText = () => {},
  org = null,
  columnVisibility = {},
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const orgGenitive = formatOrgGenitive(orgName);

  const timeStatus = getAcademicYearTimeStatus(academicYear);
  const isPastYear = timeStatus === 'PAST';
  const isFutureYear = timeStatus === 'FUTURE';
  const isCurrentYear = timeStatus === 'CURRENT';

  const totalMeetings = freqData?.baseDenominator || freqData?.mandatoryTotal || 0;
  const safeFreqData = freqData || { freq: 0, present: 0, absent: 0 };
  const safeFreq = typeof safeFreqData?.percentage === 'number'
    ? safeFreqData.percentage
    : (typeof safeFreqData?.freq === 'number' ? safeFreqData.freq : 0);
  const safePresent = typeof safeFreqData?.attendedCount === 'number'
    ? safeFreqData.attendedCount
    : (typeof safeFreqData?.present === 'number' ? safeFreqData.present : 0);
  const safePoints = typeof points === 'number' ? points : 0;

  const hasDataForYear = totalMeetings > 0 || safePresent > 0 || safePoints > 0;

  // Visibility toggles for certificate sections (controlled via DocumentCustomizer)
  const showFreqSection = columnVisibility.cert_freq !== false;
  const showPointsSection = columnVisibility.cert_points !== false;
  // Compute number of visible metric columns to adjust grid dynamically
  const visibleMetricCols = [showFreqSection, showPointsSection, true].filter(Boolean).length; // "Ocena" always shown

  const docNumber = generateDocumentNumber('CERT', member?.index || member?.indexNumber || '00000', academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const studentName = member?.fullName || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Imię i Nazwisko Studenta';
  const indexNumber = member?.index || member?.indexNumber || '—';
  const fieldName = member?.field || 'Psychologia';
  const yearLabel = member?.year ? `rok ${member.year}` : 'jednolite studia magisterskie';

  return (
    <div className="doc-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 font-sans p-10 sm:p-12 relative flex flex-col justify-between border border-slate-300 shadow-xl mx-auto my-0 select-text print:max-w-none print:w-full print:border-none print:shadow-none print:p-10 print:m-0 box-border">
      {/* Ozdobna ramka wewnętrzna */}
      <div className="cert-frame-outer absolute inset-5 border border-slate-200 pointer-events-none rounded-lg" />
      <div className="cert-frame-inner absolute inset-7 border-2 border-indigo-950/20 pointer-events-none rounded-md" />

      {/* ── STREFA 1 (GÓRNA): Nagłówek Uczelni, Sygnatura, Tytuł i Formuła Wstępna ── */}
      <div className="relative z-10 space-y-4">
        {/* Globalny Ujednolicony Nagłówek Uczelniany i Koła */}
        <DocumentStandardHeader
          org={org}
          docNumber={docNumber}
          docDate={docDate}
          docLabel="Nr dokumentu"
          dateLabel="Data:"
          borderBottom={true}
          className="border-indigo-900 pb-2"
        />

        {/* Tytuł Zaświadczenia (Główny, dominujący element wizualny) */}
        <div className="text-center my-3 sm:my-4">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200">
            Oficjalne Zaświadczenie Akademickie
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-2 uppercase [text-wrap:balance]">
            Zaświadczenie o&nbsp;Członkostwie i&nbsp;Frekwencji
          </h2>
          <p className="text-[11px] text-slate-500 font-medium tracking-wide mt-1">
            Rok akademicki {academicYear} &bull; Oficjalny Rejestr Działalności Studenckiej
          </p>
        </div>

        {/* Formuła Wstępna */}
        <p className="text-[12px] sm:text-[12.5px] leading-relaxed text-slate-800 text-justify [text-justify:inter-word] [text-wrap:pretty] indent-6">
          Niniejszym zaświadcza się, że Pan/Pani{' '}
          <strong className="text-slate-950 font-bold border-b border-slate-400 pb-0.5 px-1">{studentName}</strong>,{' '}
          legitymujący/a się numerem indeksu: <strong className="font-mono text-slate-950 font-bold">{indexNumber}</strong>,{' '}
          będący/a studentem/ką kierunku: <strong>{fieldName}</strong> ({yearLabel}), w&nbsp;roku akademickim{' '}
          <strong>{academicYear}</strong> brał/a aktywny udział w&nbsp;działalności naukowo-badawczej i&nbsp;spotkaniach Koła:{' '}
          <strong className="text-slate-950">{orgName}</strong> przy&nbsp;{orgUnit}.
        </p>
      </div>

      {/* ── STREFA 2 (ŚRODKOWA): Kluczowe Dane, Metryki i Wyszczególnienie Aktywności ── */}
      <div className="relative z-10 flex-grow flex flex-col justify-center my-6 sm:my-8 space-y-6">
        {!hasDataForYear ? (
          <div className="my-6 p-8 bg-amber-50/90 border-2 border-dashed border-amber-300 rounded-2xl text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
              Brak zarejestrowanej działalności w roku {academicYear}
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">
              Dla roku akademickiego <strong>{academicYear}</strong> nie zarejestrowano spotkań ani obecności studenta <strong>{studentName}</strong>. Wystawienie oficjalnego zaświadczenia z zerowymi wartościami zostało wstrzymane.
            </p>
            <div className="mt-3 inline-block bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-[10px] text-slate-500 font-mono">
              Status: {isFutureYear ? 'Okres planowany' : (isPastYear ? 'Brak wpisów archiwalnych' : 'Brak danych w roku bieżącym')}
            </div>
          </div>
        ) : (
          <>
            {/* ── Metryka Osiągnięć i Frekwencji ── */}
            <div
              className="metric-box-container w-full grid gap-3 p-4 sm:p-5 bg-slate-50/90 rounded-2xl border border-slate-200/90 text-center shadow-xs box-border"
              style={{ gridTemplateColumns: `repeat(${visibleMetricCols}, minmax(0, 1fr))`, width: '100%' }}
            >
              {showFreqSection && (
                <div className="p-2 border-r border-slate-200 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block truncate">Łączna Frekwencja</span>
                  <span className="text-2xl sm:text-3xl font-bold text-emerald-700 font-mono leading-none my-1.5 block">{safeFreq}%</span>
                  <span className="text-[10px] text-slate-500 block truncate">{safePresent} / {totalMeetings} spotkań</span>
                </div>
              )}
              {showPointsSection && (
                <div className="p-2 border-r border-slate-200 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block truncate">Punkty Aktywności</span>
                  <span className="text-2xl sm:text-3xl font-bold text-purple-700 font-mono leading-none my-1.5 block">{safePoints} pkt</span>
                  <span className="text-[10px] text-slate-500 block truncate">Wykaz aktywności</span>
                </div>
              )}
              <div className="p-2 min-w-0 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block truncate">Ocena Aktywności</span>
                <span className="text-sm font-bold text-indigo-950 block leading-tight mt-1 truncate">
                  {safeFreq >= 90 ? 'Lider Koła' : safeFreq >= 75 ? 'Bardzo Aktywny' : (safeFreq >= 50 ? 'Aktywny Członek' : (isPastYear ? 'Brak zaliczenia' : 'W trakcie realizacji'))}
                </span>
                <span className={`text-[9.5px] font-semibold flex items-center justify-center gap-1 mt-1 ${
                  safeFreq >= 50 ? 'text-emerald-600' : (isPastYear ? 'text-rose-600' : 'text-slate-500')
                }`}>
                  {safeFreq >= 50 ? (
                    <><CheckCircle2 size={12} /> Kryteria spełnione</>
                  ) : isPastYear ? (
                    <><AlertTriangle size={12} /> Kryteria niespełnione</>
                  ) : (
                    <><Clock size={12} /> Aktywność w toku</>
                  )}
                </span>
              </div>
            </div>

            {/* ── Wyszczególnienie aktywności merytorycznej ── */}
            <div className="text-[11px] sm:text-[11.5px] text-slate-700 space-y-3 bg-indigo-50/50 p-5 sm:p-6 rounded-2xl border border-indigo-100 shadow-xs">
              <p className="font-bold text-indigo-950 flex items-center gap-2 text-xs uppercase tracking-wide">
                <Sparkles size={13} className="text-indigo-600 shrink-0" />
                Wyszczególnienie aktywności merytorycznej:
              </p>
              {isEditing ? (
                <textarea
                  rows={3}
                  value={customText || `• Udział w comiesięcznych spotkaniach merytorycznych, seminaryjnych oraz warsztatowych Koła.\n• Wystąpienia prelekcyjne, udział w sesjach Journal Club i dyskusjach klinicznych.\n• Praca nad materiałami edukacyjnymi, analizami piśmiennictwa i projektami badawczymi Koła.`}
                  onChange={(e) => onUpdateCustomText(e.target.value)}
                  className="w-full p-2 bg-white border border-indigo-300 rounded-lg text-[11px] font-sans text-slate-800 focus:outline-none"
                />
              ) : (
                <ul className="list-disc list-inside space-y-2.5 sm:space-y-3 text-[11px] sm:text-[11.5px] text-slate-700 pl-1 leading-relaxed">
                  {(customText || `Udział w comiesięcznych spotkaniach merytorycznych, seminaryjnych oraz warsztatowych Koła.\nWystąpienia prelekcyjne, udział w sesjach Journal Club i dyskusjach klinicznych.\nPraca nad materiałami edukacyjnymi, analizami piśmiennictwa i projektami badawczymi Koła.`)
                    .split('\n')
                    .filter(Boolean)
                    .map((line, idx) => (
                      <li key={idx} className="leading-relaxed">{line.replace(/^[•\-\*]\s*/, '')}</li>
                    ))}
                </ul>
              )}
            </div>
          </>
        )}

        <p className="text-[10.5px] text-slate-500 italic leading-relaxed text-center px-4">
          Zaświadczenie wydaje się na wniosek studenta celem przedłożenia w&nbsp;Dziekanacie Uczelni, do&nbsp;stypendium Rektora, 
          do&nbsp;suplementu do&nbsp;dyplomu lub do&nbsp;portfolio osiągnięć naukowych.
        </p>
      </div>

      {/* ── STREFA 3 (DOLNA): Podpisy i Stopka Systemowa ── */}
      <div className="relative z-10 mt-auto pt-6 sm:pt-8 space-y-3">
        {/* Dynamiczny Blok Podpisów */}
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Zarząd Koła Naukowego"
          chairpersonSub={orgShortName}
        />

        {/* Stopka techniczna */}
        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={11} className="text-indigo-600 shrink-0" />
            <span>Autentyczność certyfikatu potwierdzona w systemie CRM {orgGenitive}</span>
          </div>
          <div>Data wydania: {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. SZABLON: DYPLOM / CERTYFIKAT PRELECENTA ──────────────────────────────
export function SpeakerDiplomaTemplate({
  member,
  presentationTopic = 'Wprowadzenie do problematyki badawczej i metodologii klinicznej',
  presentationDate = '2026-02-16',
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  isEditing = false,
  onUpdateTopic = () => {},
  org = null,
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const orgGenitive = formatOrgGenitive(orgName);
  const orgAffiliationSub = getOrgAffiliationSub(orgName);

  const docNumber = generateDocumentNumber('SPEAKER', member?.index || member?.indexNumber || '00000', academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const studentName = member?.fullName || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Imię i Nazwisko Studenta';
  const indexNumber = member?.index || member?.indexNumber || '—';

  return (
    <div className="doc-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 font-sans p-10 sm:p-12 relative flex flex-col justify-between border border-amber-300/80 shadow-xl mx-auto my-0 select-text print:max-w-none print:w-full print:border-none print:shadow-none print:p-10 print:m-0 box-border">
      {/* Ozdobna złota ramka */}
      <div className="cert-frame-outer absolute inset-5 border-2 border-amber-500/30 pointer-events-none rounded-lg" />
      <div className="cert-frame-inner absolute inset-7 border border-amber-600/20 pointer-events-none rounded-md" />

      {/* ── STREFA 1 (GÓRNA): Nagłówek Uczelniany i Koła ── */}
      <div className="relative z-10 space-y-2">
        <DocumentStandardHeader
          org={org}
          docNumber={docNumber}
          docDate={docDate}
          docLabel="Nr"
          dateLabel="Data:"
          borderBottom={true}
          className="border-amber-300 pb-2.5"
        />
      </div>

      {/* ── STREFA 2 (ŚRODKOWA): Prestiżowy Środek Dyplomu ── */}
      <div className="relative z-10 flex-grow flex flex-col justify-center my-6 sm:my-8 space-y-6 sm:space-y-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-amber-700 mx-auto shadow-xs">
          <Award size={38} />
        </div>

        <div>
          <span className="text-[11px] uppercase tracking-widest font-bold text-amber-800 bg-amber-100/70 px-4 py-1 rounded-full border border-amber-300">
            Certyfikat Wystąpienia Naukowego
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 uppercase mt-4">
            Dyplom Prelegenta
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1.5">Nr {docNumber}</p>
        </div>

        <div className="space-y-2 py-2">
          <p className="text-xs text-slate-600 uppercase tracking-widest font-medium">Niniejszy certyfikat otrzymuje</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-indigo-950 font-sans tracking-tight border-b-2 border-amber-400 inline-block pb-1.5 px-6">
            {studentName}
          </h2>
          <p className="text-xs text-slate-500 font-mono">Nr Indeksu: {indexNumber}</p>
        </div>

        <div className="max-w-lg mx-auto bg-amber-50/60 p-5 sm:p-6 rounded-2xl border border-amber-200/90 text-center space-y-2 shadow-xs">
          <p className="text-[11px] text-amber-900 font-bold uppercase tracking-wider">
            Za przygotowanie i wygłoszenie referatu naukowego pt.:
          </p>
          {isEditing ? (
            <textarea
              rows={2}
              value={presentationTopic}
              onChange={(e) => onUpdateTopic(e.target.value)}
              className="w-full p-2.5 bg-white border border-amber-400 rounded-lg text-sm font-bold text-slate-900 italic text-center focus:outline-none"
            />
          ) : (
            <p className="text-base sm:text-lg font-bold text-slate-900 italic px-3 leading-snug">
              „{presentationTopic}”
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-2 font-medium">
            w ramach oficjalnego seminarium naukowego {orgName} ({academicYear})
          </p>
        </div>
      </div>

      {/* ── STREFA 3 (DOLNA): Podpisy i Stopka ── */}
      <div className="relative z-10 mt-auto pt-6 sm:pt-8 space-y-3">
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Przewodniczący Koła Naukowego"
          chairpersonSub={orgAffiliationSub}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={11} className="text-amber-600 shrink-0" />
            <span>Autentyczność dyplomu potwierdzona w systemie CRM {orgGenitive}</span>
          </div>
          <div>Warszawa, {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. SZABLON: ZAŚWIADCZENIE O PEŁNIENIU FUNKCJI W ZARZĄDZIE KOŁA ──────────
export function BoardCertificateTemplate({
  member,
  boardRole = 'Przewodniczący Koła Naukowego',
  termDates = '1 października 2026 r. – 30 września 2027 r.',
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  isEditing = false,
  customDuties = null,
  onUpdateDuties = () => {},
  org = null,
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const orgGenitive = formatOrgGenitive(orgName);

  const docNumber = generateDocumentNumber('BOARD', member?.index || member?.indexNumber || '00000', academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const studentName = member?.fullName || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Imię i Nazwisko Członka';
  const indexNumber = member?.index || member?.indexNumber || '00000';
  const fieldName = member?.field || 'Psychologia';

  // Dynamiczne doprecyzowanie roli w Zarządzie na podstawie nazwy aktywnego koła
  const formattedRole = useMemo(() => {
    if (!boardRole || boardRole === 'Przewodniczący Koła Naukowego Seksuologii') {
      return `Przewodniczący ${orgName}`;
    }
    if (boardRole === 'Przewodniczący Koła Naukowego') {
      return `Przewodniczący ${orgName}`;
    }
    return boardRole;
  }, [boardRole, orgName]);

  return (
    <div className="doc-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 font-sans p-10 sm:p-12 relative flex flex-col justify-between border border-indigo-300/80 shadow-xl mx-auto my-0 select-text print:max-w-none print:w-full print:border-none print:shadow-none print:p-10 print:m-0 box-border">
      {/* Ozdobna podwójna ramka */}
      <div className="cert-frame-outer absolute inset-5 border border-indigo-200 pointer-events-none rounded-lg" />
      <div className="cert-frame-inner absolute inset-7 border-2 border-indigo-900/30 pointer-events-none rounded-md" />

      {/* ── STREFA 1 (GÓRNA): Nagłówek Uczelni, Sygnatura, Tytuł i Formuła Wstępna ── */}
      <div className="relative z-10 space-y-4">
        {/* Globalny Ujednolicony Nagłówek Uczelniany i Koła */}
        <DocumentStandardHeader
          org={org}
          docNumber={docNumber}
          docDate={docDate}
          docLabel="Nr aktu"
          dateLabel="Data:"
          borderBottom={true}
          className="border-indigo-900 pb-2"
        />

        {/* Tytuł Zaświadczenia z estetycznym podziałem (Główny, dominujący element) */}
        <div className="text-center my-3 sm:my-4">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200">
            Uchwała Walnego Zebrania Członków
          </span>
          <div className="mt-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">
              Zaświadczenie o:
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase [text-wrap:balance]">
              Pełnieniu Funkcji w&nbsp;Zarządzie Koła
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 font-medium tracking-wide mt-1">
            Kadencja Zarządu Koła &bull; Rok Akademicki {academicYear}
          </p>
        </div>

        {/* Formuła Wstępna */}
        <p className="text-[12px] sm:text-[12.5px] leading-relaxed text-slate-800 text-justify [text-justify:inter-word] [text-wrap:pretty] indent-6">
          Niniejszym zaświadcza się, że Pan/Pani{' '}
          <strong className="text-slate-950 font-bold border-b border-slate-400 pb-0.5 px-1">{studentName}</strong>,{' '}
          numer indeksu: <strong className="font-mono text-slate-950 font-bold">{indexNumber}</strong>,{' '}
          student/ka kierunku: <strong>{fieldName}</strong>, w&nbsp;roku akademickim <strong>{academicYear}</strong>{' '}
          pełnił/a z&nbsp;wyboru funkcję w&nbsp;Zarządzie Koła Naukowego:
        </p>
      </div>

      {/* ── STREFA 2 (ŚRODKOWA): Boks Funkcji w Zarządzie i Zakres Obowiązków ── */}
      <div className="relative z-10 flex-grow flex flex-col justify-center my-6 sm:my-8 space-y-6">
        {/* Boks Oficjalnej Funkcji w Zarządzie */}
        <div className="p-5 sm:py-6 sm:px-6 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-center shadow-xs space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-indigo-700 tracking-widest block">
            Oficjalna Funkcja w&nbsp;Zarządzie Koła Naukowego
          </span>
          <span className="text-xl sm:text-2xl font-extrabold text-indigo-950 block tracking-tight">
            {formattedRole}
          </span>
          <span className="text-xs text-slate-600 font-medium block">
            {orgName} &bull; w&nbsp;okresie kadencji: {termDates}
          </span>
        </div>

        {/* Zakres Obowiązków Statutowych */}
        <div className="p-5 sm:p-6 rounded-2xl bg-slate-50/90 border border-slate-200 text-[11px] sm:text-[11.5px] space-y-3 shadow-xs">
          <p className="font-bold text-slate-900 text-xs uppercase tracking-wide">
            Zakres zrealizowanych obowiązków statutowych:
          </p>
          {isEditing ? (
            <textarea
              rows={4}
              value={customDuties || `• Kierowanie bieżącą działalnością naukową i organizacyjną ${orgName}.\n• Koordynacja ogólnopolskich spotkań naukowych, warsztatów merytorycznych i sesji dyskusyjnych.\n• Nadzór nad realizacją projektów badawczych i przygotowaniem publikacji naukowych.\n• Reprezentowanie Koła przed Władzami Uczelni, Dziekanatem oraz jednostkami zewnętrznymi.`}
              onChange={(e) => onUpdateDuties(e.target.value)}
              className="w-full p-2 bg-white border border-indigo-300 rounded-lg text-[11px] font-sans text-slate-800 focus:outline-none"
            />
          ) : (
            <ul className="list-disc list-inside text-slate-700 space-y-2.5 sm:space-y-3 pl-1 leading-relaxed">
              {(customDuties || `Kierowanie bieżącą działalnością naukową i organizacyjną ${orgName}.\nKoordynacja ogólnopolskich spotkań naukowych, warsztatów merytorycznych i sesji dyskusyjnych.\nNadzór nad realizacją projektów badawczych i przygotowaniem publikacji naukowych.\nReprezentowanie Koła przed Władzami Uczelni, Dziekanatem oraz jednostkami zewnętrznymi.`)
                .split('\n')
                .filter(Boolean)
                .map((line, idx) => (
                  <li key={idx} className="leading-relaxed">{line.replace(/^[•\-\*]\s*/, '')}</li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── STREFA 3 (DOLNA): Podpisy i Stopka ── */}
      <div className="relative z-10 mt-auto pt-6 sm:pt-8 space-y-3">
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Dziekanat / Dyrekcja"
          chairpersonSub={orgUnit}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={11} className="text-indigo-600 shrink-0" />
            <span>Autentyczność zaświadczenia potwierdzona w systemie CRM {orgGenitive}</span>
          </div>
          <div>Data wydania: {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pobiera rzeczywistą liczbę obecnych na danym spotkaniu ze wszystkich dostępnych źródeł
 */
export function getMeetingAttendeesCount(m, orgId = null) {
  if (!m) return 0;
  if (typeof m.attendeesCount === 'number' && m.attendeesCount > 0) return m.attendeesCount;
  if (typeof m.attendanceCount === 'number' && m.attendanceCount > 0) return m.attendanceCount;
  if (Array.isArray(m.participantRecords) && m.participantRecords.length > 0) return m.participantRecords.length;
  if (Array.isArray(m.attendees) && m.attendees.length > 0) return m.attendees.length;
  if (Array.isArray(m.listaObecnosci) && m.listaObecnosci.length > 0) return m.listaObecnosci.length;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cleanCode = String(m.code || '').replace(/^\[.*?\]\s*/, '').trim();
      const orgPrefix = orgId ? `${orgId}_` : '';
      const keys = [
        `crm_${orgPrefix}attendance_${m.id}`,
        `crm_${orgPrefix}attendance_${m.date}`,
        m.code ? `crm_${orgPrefix}attendance_${m.code}` : null,
        cleanCode ? `crm_${orgPrefix}attendance_${cleanCode}` : null,
        `crm_attendance_${m.id}`,
        `crm_attendance_${m.date}`,
        m.code ? `crm_attendance_${m.code}` : null,
        cleanCode ? `crm_attendance_${cleanCode}` : null,
        `attendance_${m.id}`,
        `attendance_${m.date}`,
        m.code ? `attendance_${m.code}` : null,
        cleanCode ? `attendance_${cleanCode}` : null,
      ].filter(Boolean);

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const pDate = parsed.date || parsed.meetingDate;
            if (pDate && m.date && pDate !== m.date) continue;
            let count = 0;
            if (typeof parsed.confirmedCount === 'number') count = parsed.confirmedCount;
            else if (Array.isArray(parsed.confirmedIndexes)) count = parsed.confirmedIndexes.length;
            else if (Array.isArray(parsed.attendees)) count = parsed.attendees.length;
            else if (Array.isArray(parsed.participantRecords)) count = parsed.participantRecords.length;
            else if (Array.isArray(parsed.listaObecnosci)) count = parsed.listaObecnosci.length;
            else if (Array.isArray(parsed)) count = parsed.length;
            if (count > 0) return count;
          }
        }
      }
    } catch {}
  }
  return 0;
}

// ─── 4. SZABLON: TABELA ZBIORCZA SPOTKAŃ DLA DZIEKANATU WSKZ / PKA ──────────
export function MeetingsSummaryTableTemplate({
  meetings = [],
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  isEditing = false,
  onUpdateMeetings = () => {},
  onOpenAddModal = null,
  org = null,
  columnVisibility = {},
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const docNumber = generateDocumentNumber('TABELA-SPOTKAN', orgTag, academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  // Filtrowanie spotkań: TYLKO zrealizowane (faktyczna obecność / wgrana lista obecności)
  const completedMeetingsList = useMemo(() => {
    const rawList = (meetings && meetings.length > 0) ? meetings : [];
    return rawList
      .map((m, idx) => {
        const count = getMeetingAttendeesCount(m, orgId);
        return {
          id: m.id || idx,
          name: m.name || orgName,
          date: m.dateFormatted || m.date || '',
          type: m.type || 'Spotkanie merytoryczne',
          title: m.title || 'Prelekcja naukowa',
          speaker: m.speaker || 'Zarząd Koła',
          attendeesCount: count,
          rawMeeting: m,
        };
      })
      .filter((m) => {
        // Warunek zaliczenia spotkania jako zrealizowane:
        // faktyczna obecność / wgrana lista obecności > 0
        return Number(m.attendeesCount) > 0;
      });
  }, [meetings, orgId, orgName]);

  const meetingsList = isEditing ? (meetings || []) : completedMeetingsList;
  const totalAttendees = meetingsList.reduce((acc, m) => acc + (Number(m.attendeesCount) || 0), 0);
  const avgAttendees = meetingsList.length > 0 ? Math.round(totalAttendees / meetingsList.length) : 0;

  const handleRowChange = (index, field, value) => {
    const updated = [...meetingsList];
    updated[index] = { ...updated[index], [field]: value };
    onUpdateMeetings(updated);
  };

  const handleDeleteRow = (index) => {
    const updated = meetingsList.filter((_, i) => i !== index);
    onUpdateMeetings(updated);
  };

  // Kolumny
  const showLp = columnVisibility.lp !== false;
  const showDate = columnVisibility.date !== false;
  const showType = columnVisibility.type !== false;
  const showTitle = columnVisibility.title !== false;
  const showSpeaker = columnVisibility.speaker !== false;
  const showAttendees = columnVisibility.attendees !== false;

  return (
    <div className="doc-a4-sheet doc-a4-multipage bg-white text-slate-900 font-sans p-8 sm:p-12 relative flex flex-col justify-between border border-slate-300 shadow-xl w-full max-w-[210mm] min-h-[297mm] mx-auto my-0 select-text print:p-0 print:border-none print:shadow-none print:max-w-none print:w-full box-border">
      {/* ── Nagłówek Uczelniany i Identyfikator Dokumentu ── */}
      <DocumentStandardHeader
        org={org}
        docLabel="Dokument"
        docNumber={docNumber}
        dateLabel="Stan na dzień:"
        docDate={docDate}
      />

      {/* ── Tytuł Sprawozdania z nowym standardem wizualnym (optymalny oddech i interlinia) ── */}
      <div className="mt-6 mb-7 sm:mb-8 text-center">
        <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
          Oficjalna Ewidencja Działalności Akademickiej
        </span>
        <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">
          ZBIORCZA TABELA ZREALIZOWANYCH SPOTKAŃ
        </h2>
        <div className="mt-2.5 sm:mt-3 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-700 tracking-tight">
            Rejestr aktywności i spotkań naukowych
          </p>
        </div>
        <div className="mt-3.5 space-y-1 text-xs text-slate-600 font-medium">
          <p>
            Rok Akademicki {academicYear} &bull; {orgUnit}
          </p>
          <p className="text-[11px] text-slate-500">
            <strong>Opieka naukowa:</strong> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {/* ── KPI Podsumowanie ── */}
      <div className="metric-box-container w-full grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-2.5 sm:gap-3 mb-6 text-center text-xs box-border">
        <div className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200">
          <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Zrealizowane spotkania</span>
          <span className="text-base font-bold text-indigo-950 font-mono mt-0.5 block">{meetingsList.length}</span>
          <span className="text-[9px] text-slate-400 block mt-0.5">z listą obecności</span>
        </div>
        <div className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200">
          <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Łączna liczba osobodni</span>
          <span className="text-base font-bold text-emerald-700 font-mono mt-0.5 block">{totalAttendees} os.</span>
          <span className="text-[9px] text-slate-400 block mt-0.5">łączna frekwencja</span>
        </div>
        <div className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200">
          <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">Średnia uczestników / spotkanie</span>
          <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">{avgAttendees} os.</span>
          <span className="text-[9px] text-slate-400 block mt-0.5">na zrealizowane zebranie</span>
        </div>
      </div>

      {/* ── Tabela Spotkań ze zoptymalizowanymi kolumnami ── */}
      <div className="border border-slate-200 rounded-lg overflow-hidden text-[9.5px] flex-1 min-h-[300px] flex flex-col mb-4 print:overflow-visible">
        <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200" style={{ display: 'table-header-group' }}>
            <tr>
              {showLp && <th className="py-2 px-1 text-center whitespace-nowrap" style={{ width: '4%' }}>LP.</th>}
              {showDate && <th className="py-2 px-2 whitespace-nowrap" style={{ width: '12%' }}>Data</th>}
              {showType && <th className="py-2 px-2 whitespace-nowrap" style={{ width: '14%' }}>Forma</th>}
              {showTitle && <th className="py-2 px-2.5" style={{ width: isEditing ? '33%' : '36%' }}>Temat / Zakres Merytoryczny</th>}
              {showSpeaker && <th className="py-2 px-2" style={{ width: '16%' }}>Prelegent / Prowadzący</th>}
              {showAttendees && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: isEditing ? '15%' : '18%' }}>Frekwencja</th>}
              {isEditing && <th className="py-2 px-1 text-center print:hidden" style={{ width: '6%' }}>Akcja</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meetingsList.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400 italic bg-slate-50/50">
                  Brak zrealizowanych spotkań z zarejestrowaną listą obecności w wybranym roku akademickim.
                </td>
              </tr>
            ) : (
              meetingsList.map((m, i) => (
                <tr key={i} className="hover:bg-slate-50 break-inside-avoid align-top" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  {showLp && <td className="py-2 px-1 text-center text-slate-400 font-mono align-top">{i + 1}</td>}
                  {showDate && (
                    <td className="py-2 px-2 font-mono whitespace-nowrap align-top">
                      {isEditing ? (
                        <input
                          type="text"
                          value={m.date}
                          onChange={(e) => handleRowChange(i, 'date', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-[9.5px]"
                        />
                      ) : (
                        m.date
                      )}
                    </td>
                  )}
                  {showType && (
                    <td className="py-2 px-2 font-medium text-slate-700 break-words align-top">
                      {isEditing ? (
                        <input
                          type="text"
                          value={m.type}
                          onChange={(e) => handleRowChange(i, 'type', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-[9.5px]"
                        />
                      ) : (
                        m.type
                      )}
                    </td>
                  )}
                  {showTitle && (
                    <td className="py-2 px-2.5 font-semibold text-slate-900 break-words align-top">
                      {isEditing ? (
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => handleRowChange(i, 'title', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-[9.5px]"
                        />
                      ) : (
                        m.title
                      )}
                    </td>
                  )}
                  {showSpeaker && (
                    <td className="py-2 px-2 text-slate-600 break-words align-top">
                      {isEditing ? (
                        <input
                          type="text"
                          value={m.speaker}
                          onChange={(e) => handleRowChange(i, 'speaker', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-[9.5px]"
                        />
                      ) : (
                        m.speaker
                      )}
                    </td>
                  )}
                  {showAttendees && (
                    <td className="py-2 px-2 text-center font-mono font-bold text-slate-900 whitespace-nowrap align-top">
                      {isEditing ? (
                        <input
                          type="number"
                          value={m.attendeesCount}
                          onChange={(e) => handleRowChange(i, 'attendeesCount', e.target.value)}
                          className="w-16 bg-white border border-slate-300 rounded px-1 py-0.5 text-[9.5px] text-center"
                        />
                      ) : (
                        `${m.attendeesCount} os.`
                      )}
                    </td>
                  )}
                  {isEditing && (
                    <td className="py-2 px-1 text-center print:hidden align-top">
                      <button
                        onClick={() => handleDeleteRow(i)}
                        className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                        title="Usuń wiersz"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isEditing && (
        <div className="mb-4 print:hidden flex items-center justify-between">
          <div>
            {meetingsList.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onUpdateMeetings([]);
                  showToast('Wyczyszczono tabelę spotkań.');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold hover:bg-rose-100 cursor-pointer shadow-2xs transition-all"
              >
                <Trash2 size={13} /> Wyczyść całą tabelę
              </button>
            )}
          </div>
          <button
            onClick={() => {
              if (onOpenAddModal) {
                onOpenAddModal();
              } else {
                const newRow = {
                  name: orgName,
                  date: '2026-08-15',
                  type: 'Spotkanie otwarte',
                  title: 'Nowe spotkanie naukowe Koła',
                  speaker: 'Zarząd Koła',
                  attendeesCount: 0,
                };
                onUpdateMeetings([...meetingsList, newRow]);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-semibold hover:bg-indigo-100 cursor-pointer shadow-2xs transition-all"
          >
            <Plus size={14} /> ➕ Dodaj spotkanie do tabeli
          </button>
        </div>
      )}

      {/* ── Dolna sekcja: Podpisy i Stopka CRM z gwarancją zakotwiczenia na dole strony ── */}
      <div className="mt-auto shrink-0 pt-6 signature-block break-inside-avoid page-break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Zarząd Koła Naukowego"
          chairpersonSub={orgShortName}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-indigo-600 shrink-0" />
            <span>Autentyczność rejestru potwierdzona w systemie CRM {formatOrgGenitive(orgName)}</span>
          </div>
          <div>Warszawa, {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 5. SZABLON: OFICJALNA EWIDENCJA CZŁONKÓW KOŁA ───────────────────────────
export function MembersRegistryTemplate({
  members = [],
  meetings = [],
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  org = null,
  columnVisibility = {},
  customMeetingTypes = {},
  attendanceConfig = {},
  precalculatedStatsMap = null,
}) {
  const orgMeta = getOrgMetadata(org);
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = orgMeta;
  const resolvedOrg = org || orgMeta?.resolvedOrg || { id: orgId || 'test', name: orgName || 'Koło Naukowe', shortName: orgShortName || 'SKN' };

  const scope = useMemo(() => getAcademicScope(academicYear), [academicYear]);
  const timeStatus = getAcademicYearTimeStatus(academicYear);
  const isPastYear = timeStatus === 'PAST';
  const isFutureYear = timeStatus === 'FUTURE';
  const isCurrentYear = timeStatus === 'CURRENT';

  // Ścisłe filtrowanie spotkań do wybranego roku akademickiego
  const scopedMeetings = useMemo(() => {
    return (Array.isArray(meetings) ? meetings : []).filter(m => isMeetingInAcademicScope(m, scope));
  }, [meetings, scope]);

  // Pobranie ewidencji ściśle dla tego roku i aktywnej organizacji
  const scopedEwidencja = useMemo(() => {
    let raw = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const ewKey = getOrgKey(resolvedOrg?.id || orgId, 'crm_ewidencja');
        const s = localStorage.getItem(ewKey);
        if (s) raw = JSON.parse(s);
      } catch {}
    }
    return (Array.isArray(raw) ? raw : []).filter(e => isEwidencjaInAcademicScope(e, scope, scopedMeetings));
  }, [scope, scopedMeetings, resolvedOrg?.id, orgId]);

  // Zlicz zrealizowane spotkania
  const conductedMeetingsCount = useMemo(() => {
    return scopedMeetings.filter(m => {
      const count = m.attendeesCount ?? (Array.isArray(m.attendees) ? m.attendees.length : 0);
      return count > 0 || hasMeetingAttendanceLogs(m, scopedEwidencja);
    }).length;
  }, [scopedMeetings, scopedEwidencja]);

  const totalMeetings = conductedMeetingsCount > 0 ? conductedMeetingsCount : scopedMeetings.length;
  const hasDataForYear = conductedMeetingsCount > 0 || scopedEwidencja.length > 0;

  const docNumber = generateDocumentNumber('EWIDENCJA', orgTag, academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const activeMembers = useMemo(() => {
    if (!Array.isArray(members) || members.length === 0) return [];
    return members.filter(m => {
      const status = (m?.status || '').toLowerCase();
      const isResigned = status === 'resigned' || status === 'rezygnacja' || m?.isArchived;
      return !isResigned;
    });
  }, [members]);

  // Kolumny (Domyślnie kolumna status/Zaliczenie jest ukryta; pozostałe domyślnie widoczne)
  const showLp = columnVisibility.lp !== false;
  const showName = columnVisibility.fullName !== false;
  const showIndex = columnVisibility.index !== false;
  const showField = columnVisibility.field !== false;
  const showYear = columnVisibility.year !== false;
  const showPresent = columnVisibility.present !== false;
  const showFreq = columnVisibility.freq !== false;
  const showPoints = columnVisibility.points !== false;
  const showStatus = columnVisibility.status === true;

  // Dynamiczny, proporcjonalny rozkład szerokości kolumn dopasowany w 100% do ramki A4
  const colWidths = useMemo(() => {
    const baseWeights = {
      lp: showStatus ? 4.5 : 5,
      name: showStatus ? 22.5 : 26,
      index: showStatus ? 9 : 10,
      field: showStatus ? 18.5 : 24,
      year: showStatus ? 6.5 : 7,
      present: showStatus ? 9 : 9,
      freq: showStatus ? 9.5 : 10,
      points: showStatus ? 8.5 : 9,
      status: showStatus ? 12 : 0,
    };

    const activeCols = [];
    if (showLp) activeCols.push('lp');
    if (showName) activeCols.push('name');
    if (showIndex) activeCols.push('index');
    if (showField) activeCols.push('field');
    if (showYear) activeCols.push('year');
    if (showPresent) activeCols.push('present');
    if (showFreq) activeCols.push('freq');
    if (showPoints) activeCols.push('points');
    if (showStatus) activeCols.push('status');

    if (activeCols.length === 0) return {};

    const totalWeight = activeCols.reduce((acc, colKey) => acc + (baseWeights[colKey] || 10), 0);
    const widths = {};
    let allocatedTotal = 0;

    activeCols.forEach((colKey, idx) => {
      if (idx === activeCols.length - 1) {
        const lastWidth = (100 - allocatedTotal).toFixed(1);
        widths[colKey] = `${lastWidth}%`;
      } else {
        const pct = Number(((baseWeights[colKey] / totalWeight) * 100).toFixed(1));
        allocatedTotal += pct;
        widths[colKey] = `${pct}%`;
      }
    });

    return widths;
  }, [showLp, showName, showIndex, showField, showYear, showPresent, showFreq, showPoints, showStatus]);

  // Memoizowane wiersze ewidencji – eliminuje przeliczanie 150+ studentów przy każdym renderze
  const registryRows = useMemo(() => {
    return activeMembers.map((m, i) => {
      const idxNum = m?.index || m?.indexNumber || '';
      const rawIdx = String(idxNum || m?.nrIndeksu || '').trim();
      const cleanIdx = rawIdx.replace(/\D/g, '');
      const email = String(m?.email || '').trim().toLowerCase();

      const stats = (precalculatedStatsMap && (
        precalculatedStatsMap.get(String(m.id)) ||
        (rawIdx && precalculatedStatsMap.get(rawIdx)) ||
        (cleanIdx && precalculatedStatsMap.get(cleanIdx)) ||
        (email && precalculatedStatsMap.get(email))
      )) || calculateMemberStats(m, scopedEwidencja, scopedMeetings, customMeetingTypes, {
        ...attendanceConfig,
        academicYear,
        scope,
      });

      const name = m?.fullName || `${m?.firstName || ''} ${m?.lastName || ''}`.trim() || '—';
      const cleanIndex = idxNum || '—';
      const field = m?.field || 'Psychologia';
      const rawYear = m?.year || 2;
      const yearDisplay = String(rawYear).toLowerCase().includes('rok') ? rawYear : `Rok ${rawYear}`;

      const present = stats.present;
      const freq = stats.freq;
      const points = stats.points;
      const memberTotalMeetings = stats.baseDenominator > 0 ? stats.baseDenominator : totalMeetings;

      const statusInfo = getMemberAcademicStatus({
        freq,
        present,
        points,
        isCertEligible: stats.isCertEligible,
        academicYear,
      });

      const isZeroActivity = present === 0 && points === 0;

      return {
        id: m.id || m.index || i,
        lp: i + 1,
        name,
        cleanIndex,
        field,
        yearDisplay,
        present,
        memberTotalMeetings,
        freq,
        points,
        statusInfo,
        isZeroActivity,
      };
    });
  }, [
    activeMembers,
    precalculatedStatsMap,
    scopedEwidencja,
    scopedMeetings,
    customMeetingTypes,
    attendanceConfig,
    academicYear,
    scope,
    totalMeetings,
  ]);

  return (
    <div className="doc-a4-sheet doc-a4-multipage bg-white text-slate-900 font-sans p-8 sm:p-12 relative flex flex-col justify-between border border-slate-300 shadow-xl w-full max-w-[210mm] min-h-[297mm] mx-auto my-0 select-text print:p-0 print:border-none print:shadow-none print:max-w-none print:w-full print:m-0 print:min-h-0 print:block box-border">
      {/* ── Nagłówek Formalny Raportu ── */}
      <DocumentStandardHeader
        org={org}
        docLabel="Ewidencja"
        docNumber={docNumber}
        dateLabel="Stan na:"
        docDate={docDate}
      />

      {/* ── Tytuł Ewidencji z nowym standardem wizualnym (optymalny oddech i interlinia) ── */}
      <div className="mt-6 mb-7 sm:mb-8 text-center">
        <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
          Oficjalna Ewidencja Działalności Akademickiej
        </span>
        <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">
          OFICJALNA EWIDENCJA CZŁONKÓW
        </h2>
        <div className="mt-2.5 sm:mt-3 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-700 tracking-tight">
            Oficjalna ewidencja członków
          </p>
        </div>
        <div className="mt-3.5 space-y-1 text-xs text-slate-600 font-medium">
          <p>
            Rok Akademicki {academicYear} &bull; {orgUnit} &bull; Zarejestrowanych aktywnych studentów: <strong>{activeMembers.length}</strong>
          </p>
          <p className="text-[11px] text-slate-500">
            <strong>Opieka naukowa:</strong> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {!hasDataForYear ? (
        <div className="my-10 p-8 bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
            Brak danych archiwalnych / rejestru spotkań
          </h3>
          <p className="text-xs text-slate-600 mt-1.5 max-w-lg mx-auto">
            Dla roku akademickiego <strong>{academicYear}</strong> nie zarejestrowano spotkań naukowych ani wpisów w ewidencji obecności członków Koła <strong>{orgName}</strong>.
          </p>
          <div className="mt-3.5 inline-block bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-[10.5px] text-slate-500 font-mono">
            Status okresu: {isFutureYear ? 'Okres planowany (przyszły)' : (isPastYear ? 'Archiwalny okres bez zarejestrowanej działalności' : 'Bieżący okres przed rozpoczęciem zebrań')}
          </div>
        </div>
      ) : (
        /* ── Tabela członków ze zoptymalizowanymi kolumnami dopasowanymi w 100% do A4 ── */
        <div className="w-full max-w-full border border-slate-200 rounded-lg overflow-hidden text-[10px] flex-1 min-h-[300px] flex flex-col mb-4 print:border-slate-300 print:rounded-none print:overflow-visible box-border">
          <table className="w-full text-left border-collapse print:text-[9.5px]" style={{ tableLayout: 'fixed', width: '100%', pageBreakInside: 'auto', breakInside: 'auto' }}>
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200" style={{ display: 'table-header-group' }}>
              <tr>
                {showLp && <th className="py-2 px-1 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.lp }}>LP.</th>}
                {showName && <th className="py-2 px-2 text-[10px]" style={{ width: colWidths.name }}>Imię i Nazwisko</th>}
                {showIndex && <th className="py-2 px-1 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.index }}>Nr Albumu</th>}
                {showField && <th className="py-2 px-2 text-[10px]" style={{ width: colWidths.field }}>Kierunek Studiów</th>}
                {showYear && <th className="py-2 px-1 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.year }}>Rok</th>}
                {showPresent && <th className="py-2 px-1 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.present }}>Obecności</th>}
                {showFreq && <th className="py-2 px-1 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.freq }}>Frekwencja</th>}
                {showPoints && <th className="py-2 px-1 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.points }}>Punkty</th>}
                {showStatus && <th className="py-2 px-1.5 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.status }}>Zaliczenie</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registryRows.map((row) => {
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50 break-inside-avoid page-break-inside-avoid align-top"
                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid', pageBreakAfter: 'auto', contentVisibility: 'auto', containIntrinsicSize: '0 26px' }}
                  >
                    {showLp && <td className="py-1.5 px-1 text-center text-slate-400 font-mono text-[9.5px] whitespace-nowrap align-top">{row.lp}</td>}
                    {showName && <td className="py-1.5 px-2 font-medium text-slate-900 text-[10px] break-words align-top">{row.name}</td>}
                    {showIndex && <td className="py-1.5 px-1 text-center font-mono text-[9.5px] whitespace-nowrap align-top">{row.cleanIndex}</td>}
                    {showField && <td className="py-1.5 px-2 text-slate-600 break-words text-[9.5px] align-top">{row.field}</td>}
                    {showYear && <td className="py-1.5 px-1 text-center text-[9.5px] whitespace-nowrap align-top">{row.yearDisplay}</td>}
                    {showPresent && (
                      <td className="py-1.5 px-1 text-center font-mono text-[9.5px] whitespace-nowrap align-top">
                        {row.isZeroActivity && isPastYear ? '—' : `${row.present} / ${row.memberTotalMeetings}`}
                      </td>
                    )}
                    {showFreq && (
                      <td className="py-1.5 px-1 text-center font-mono font-bold text-[9.5px] whitespace-nowrap align-top">
                        <span className={row.freq >= 50 ? 'text-emerald-700' : (row.isZeroActivity && isPastYear ? 'text-slate-400' : 'text-slate-600')}>
                          {row.isZeroActivity && isPastYear ? '—' : `${row.freq}%`}
                        </span>
                      </td>
                    )}
                    {showPoints && (
                      <td className="py-1.5 px-1 text-center font-mono font-semibold text-[9.5px] whitespace-nowrap align-top">
                        <span className={row.points > 0 ? 'text-purple-700' : 'text-slate-400'}>
                          {row.isZeroActivity && isPastYear ? '—' : `${row.points} pkt`}
                        </span>
                      </td>
                    )}
                    {showStatus && (
                      <td className="py-1.5 px-1 text-center align-top">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-semibold border whitespace-nowrap ${row.statusInfo.badgeClass}`}>
                          {row.statusInfo.label}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[9.5px] text-slate-500 italic mb-2 break-inside-avoid page-break-inside-avoid">
        * Pełny rejestr wszystkich {activeMembers.length} aktywnych członków koła znajduje się w centralnej bazie danych CRM WSKZ.
      </p>

      {/* ── Dolna sekcja: Podpisy i Stopka CRM z gwarancją zakotwiczenia na dole strony ── */}
      <div className="mt-auto shrink-0 pt-6 signature-block break-inside-avoid page-break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Zarząd Koła Naukowego"
          chairpersonSub={orgShortName}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-indigo-600 shrink-0" />
            <span>Autentyczność ewidencji potwierdzona w systemie CRM {formatOrgGenitive(orgName)}</span>
          </div>
          <div>Warszawa, {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 6. SZABLON: EWIDENCJA WYSTĄPIEŃ I AKTYWNOŚCI BADAWCZEJ ─────────────────
export function ResearchConferencesRegistryTemplate({
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  isEditing = false,
  activities = [],
  onUpdateActivities = () => {},
  org = null,
  columnVisibility = {},
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);

  const docNumber = generateDocumentNumber('BADANIA-KONF', orgTag, academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);
  const defaultActivities = [
    {
      type: 'Konferencja Stacjonarna',
      title: 'Ogólnopolska Konferencja Naukowa „Budowanie Mostów” WSKZ',
      authors: 'Członkowie Zarządu i Zespołu Badawczego',
      scope: 'Wystąpienie ustne i organizacja sesji posterowej (3 dni)',
      points: 25,
    },
    {
      type: 'Projekt Badawczy',
      title: `Badanie ankietowe studentów: profilaktyka i zdrowie psychiczne`,
      authors: `Zespół Badawczy ${orgName}`,
      scope: 'Projektowanie metodologiczne, zbieranie danych i opracowanie statystyczne',
      points: 30,
    },
    {
      type: 'Materiały EDU & Wideo',
      title: 'Cykl edukacyjnych przewodników klinicznych w formacie PDF i wideo-seminariów',
      authors: 'Członkowie Koła Naukowego',
      scope: 'Kompleksowe materiały szkoleniowe dla studentów psychologii',
      points: 24,
    },
    {
      type: 'Journal Club & Referaty',
      title: 'Cykl referatów monograficznych w ramach sesji dyskusyjnych',
      authors: 'Prelegenci i Członkowie Koła',
      scope: 'Przygotowanie i wygłoszenie referatów tematycznych oraz analizy piśmiennictwa międzynarodowego (PubMed / Scopus)',
      points: 30,
    },
  ];

  const currentActivities = activities !== undefined && activities !== null ? activities : defaultActivities;

  const handleAddActivity = () => {
    const newItem = {
      type: 'Inicjatywa / Konkurs',
      title: 'Nowy projekt badawczy lub konferencja',
      authors: `Członkowie ${orgShortName}`,
      scope: 'Opis zakresu zrealizowanych prac i celów naukowych',
      points: 15,
    };
    onUpdateActivities([...currentActivities, newItem]);
  };

  const handleRemoveActivity = (idx) => {
    const updated = currentActivities.filter((_, i) => i !== idx);
    onUpdateActivities(updated);
  };

  const handleItemChange = (idx, field, val) => {
    const updated = [...currentActivities];
    updated[idx] = { ...updated[idx], [field]: val };
    onUpdateActivities(updated);
  };

  // Kolumny
  const showLp = columnVisibility.lp !== false;
  const showCategory = columnVisibility.category !== false;
  const showTitle = columnVisibility.title !== false;
  const showAuthors = columnVisibility.authors !== false;
  const showScope = columnVisibility.scope !== false;
  const showPoints = columnVisibility.points !== false;

  return (
    <div className="doc-a4-sheet doc-a4-multipage bg-white text-slate-900 font-sans p-8 sm:p-12 relative flex flex-col justify-between border border-slate-300 shadow-xl w-full max-w-[210mm] min-h-[297mm] mx-auto my-0 select-text print:p-0 print:border-none print:shadow-none print:max-w-none print:w-full box-border">
      {/* Nagłówek */}
      <DocumentStandardHeader
        org={org}
        docLabel="Rejestr"
        docNumber={docNumber}
        subtitle="Działalność Badawcza i Konferencyjna"
        dateLabel="Data:"
        docDate={docDate}
      />

      {/* ── Tytuł Wykazu z nowym standardem wizualnym (optymalny oddech i interlinia) ── */}
      <div className="mt-6 mb-7 sm:mb-8 text-center">
        <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
          Oficjalna Ewidencja Działalności Akademickiej
        </span>
        <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">
          WYKAZ KONFERENCJI, BADAŃ I PUBLIKACJI NAUKOWYCH
        </h2>
        <div className="mt-2.5 sm:mt-3 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-700 tracking-tight">
            Wykaz konferencji, badań i publikacji naukowych
          </p>
        </div>
        <div className="mt-3.5 space-y-1 text-xs text-slate-600 font-medium">
          <p>
            Rok Akademicki {academicYear} &bull; {orgUnit}
          </p>
          <p className="text-[11px] text-slate-500">
            <strong>Opieka naukowa:</strong> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {/* Tabela projektów */}
      <div className="border border-slate-200 rounded-lg overflow-hidden text-[9.5px] flex-1 min-h-[340px] flex flex-col mb-4 print:overflow-visible">
        <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200" style={{ display: 'table-header-group' }}>
            <tr>
              {showLp && <th className="py-2 px-2 text-center" style={{ width: '5%' }}>LP.</th>}
              {showCategory && <th className="py-2 px-2" style={{ width: '17%' }}>Kategoria</th>}
              {showTitle && <th className="py-2 px-2.5" style={{ width: isEditing ? '27%' : '32%' }}>Tytuł Osiągnięcia / Projektu</th>}
              {showAuthors && <th className="py-2 px-2" style={{ width: '20%' }}>Autorzy / Zespół</th>}
              {showScope && <th className="py-2 px-2" style={{ width: '19%' }}>Zakres Prac</th>}
              {showPoints && <th className="py-2 px-1.5 text-center" style={{ width: '7%' }}>Waga</th>}
              {isEditing && <th className="py-2 px-1 text-center print:hidden" style={{ width: '5%' }}>Akcja</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentActivities.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 px-6 text-center text-slate-400 italic bg-slate-50/50">
                  <div className="max-w-md mx-auto space-y-1">
                    <p className="font-semibold text-slate-600 text-xs">Brak zarejestrowanych osiągnięć badawczych i konferencji</p>
                    <p className="text-[10.5px] text-slate-400">Kliknij „➕ Dodaj projekt/aktywność”, aby wprowadzić pozycję dorobku naukowego koła.</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentActivities.map((act, i) => (
              <tr key={i} className="hover:bg-slate-50 break-inside-avoid align-top" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                {showLp && <td className="py-2.5 px-2 text-center text-slate-400 font-mono align-top">{i + 1}</td>}
                {showCategory && (
                  <td className="py-2.5 px-2 font-semibold text-indigo-900 align-top">
                    {isEditing ? (
                      <input
                        type="text"
                        value={act.type}
                        onChange={(e) => handleItemChange(i, 'type', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[9.5px]"
                      />
                    ) : (
                      act.type
                    )}
                  </td>
                )}
                {showTitle && (
                  <td className="py-2.5 px-2.5 font-bold text-slate-950 align-top">
                    {isEditing ? (
                      <input
                        type="text"
                        value={act.title}
                        onChange={(e) => handleItemChange(i, 'title', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[9.5px]"
                      />
                    ) : (
                      act.title
                    )}
                  </td>
                )}
                {showAuthors && (
                  <td className="py-2.5 px-2 text-slate-700 align-top">
                    {isEditing ? (
                      <input
                        type="text"
                        value={act.authors}
                        onChange={(e) => handleItemChange(i, 'authors', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[9.5px]"
                      />
                    ) : (
                      act.authors
                    )}
                  </td>
                )}
                {showScope && (
                  <td className="py-2.5 px-2 text-slate-600 align-top">
                    {isEditing ? (
                      <input
                        type="text"
                        value={act.scope}
                        onChange={(e) => handleItemChange(i, 'scope', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[9.5px]"
                      />
                    ) : (
                      act.scope
                    )}
                  </td>
                )}
                {showPoints && (
                  <td className="py-2.5 px-1.5 text-center font-mono font-bold text-purple-700 align-top">
                    {isEditing ? (
                      <input
                        type="number"
                        value={act.points}
                        onChange={(e) => handleItemChange(i, 'points', e.target.value)}
                        className="w-12 bg-white border border-slate-300 rounded px-1 py-1 text-[9.5px] text-center"
                      />
                    ) : (
                      `${act.points} pkt`
                    )}
                  </td>
                )}
                {isEditing && (
                  <td className="py-2.5 px-1 text-center print:hidden align-top">
                    <button
                      onClick={() => handleRemoveActivity(i)}
                      className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                      title="Usuń wiersz"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                )}
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {isEditing && (
        <div className="mb-4 print:hidden flex items-center justify-between">
          <div>
            {currentActivities.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onUpdateActivities([]);
                  showToast('Wyczyszczono tabelę dorobku.');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold hover:bg-rose-100 cursor-pointer shadow-2xs transition-all"
              >
                <Trash2 size={13} /> Wyczyść całą tabelę
              </button>
            )}
          </div>
          <button
            onClick={handleAddActivity}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-semibold hover:bg-indigo-100 cursor-pointer shadow-2xs transition-all"
          >
            <Plus size={14} /> ➕ Dodaj projekt/aktywność
          </button>
        </div>
      )}

      {/* ── Dolna sekcja: Podpisy i Stopka CRM z gwarancją zakotwiczenia na dole strony ── */}
      <div className="mt-auto shrink-0 pt-6 signature-block break-inside-avoid page-break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Zarząd Koła Naukowego"
          chairpersonSub={`Koordynator ds. Badań i Nauki – ${orgShortName}`}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-indigo-600 shrink-0" />
            <span>Autentyczność rejestru potwierdzona w systemie CRM {formatOrgGenitive(orgName)}</span>
          </div>
          <div>Warszawa, {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── 7. SZABLON: ZBIORCZY PROTOKÓŁ SPRAWOZDAWCZY DLA DZIEKANATU ──────────────
export function AnnualReportProtocolTemplate({
  members = [],
  meetings = [],
  supervisors = [],
  academicYear = getCurrentAcademicYear(),
  docDate = new Date(),
  org = null,
  columnVisibility = {},
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const totalMeetings = Array.isArray(meetings) ? meetings.length : 0;

  const docNumber = generateDocumentNumber('PROTOKOL-DZIEKANAT', orgTag, academicYear, orgTag);
  const activeMembers = members.filter(m => (m?.status === 'active' || !m?.status) && !m?.isArchived && m?.status !== 'resigned');
  const passingMembers = activeMembers.filter(m => {
    const present = m?.present || 0;
    const freq = m?.attendancePercent ?? (totalMeetings > 0 ? (present / totalMeetings) * 100 : 0);
    const requiredMeetings = totalMeetings > 0 ? Math.ceil(totalMeetings * 0.5) : 1;
    return present >= requiredMeetings || freq >= 50 || (m?.points || 0) >= 10;
  });

  const avgAttendancePercent = activeMembers.length > 0
    ? Math.round(
        activeMembers.reduce((acc, m) => {
          const pct = m?.attendancePercent ?? (totalMeetings > 0 ? ((m?.present || 0) / totalMeetings) * 100 : 0);
          return acc + pct;
        }, 0) / activeMembers.length
      )
    : 0;

  const activeSupervisors = getActiveSupervisors(supervisors, org);

  // Kolumny
  const showLp = columnVisibility.lp !== false;
  const showName = columnVisibility.fullName !== false;
  const showIndex = columnVisibility.index !== false;
  const showField = columnVisibility.field !== false;
  const showPresent = columnVisibility.present !== false;
  const showFreq = columnVisibility.freq !== false;
  const showPoints = columnVisibility.points !== false;
  const showStatus = columnVisibility.status !== false;

  return (
    <div className="doc-a4-sheet doc-a4-multipage bg-white text-slate-900 font-sans p-8 sm:p-12 relative flex flex-col justify-between border border-slate-300 shadow-xl w-full max-w-[210mm] min-h-[297mm] mx-auto my-0 select-text print:p-0 print:border-none print:shadow-none print:max-w-none print:w-full box-border">
      {/* Nagłówek */}
      <DocumentStandardHeader
        org={org}
        docLabel="Protokół"
        docNumber={docNumber}
        dateLabel="Data:"
        docDate={docDate}
      />

      {/* Tytuł z nowym standardem wizualnym (optymalny oddech i interlinia) */}
      <div className="mt-6 mb-7 sm:mb-8 text-center">
        <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
          Oficjalna Ewidencja Działalności Akademickiej
        </span>
        <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">
          ZBIORCZY PROTOKÓŁ SPRAWOZDAWCZY
        </h2>
        <div className="mt-2.5 sm:mt-3 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-700 tracking-tight">
            Oficjalne roczne sprawozdanie z działalności akademickiej
          </p>
        </div>
        <div className="mt-3.5 space-y-1 text-xs text-slate-600 font-medium">
          <p>
            dla Dziekanatu i Władz {orgUnit} &bull; Rok Akademicki {academicYear}
          </p>
          <p className="text-[11px] text-slate-500">
            <strong>Opieka naukowa:</strong> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {/* KPI Podsumowanie */}
      <div className="metric-box-container w-full grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-center box-border">
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Aktywni Członkowie</span>
          <span className="text-base font-bold text-slate-900 font-mono">{activeMembers.length}</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Zrealizowane Spotkania</span>
          <span className="text-base font-bold text-indigo-900 font-mono">{totalMeetings}</span>
          <span className="text-[8px] text-slate-400 block">({totalMeetings} spotkań koła)</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Średnia Frekwencja</span>
          <span className="text-base font-bold text-emerald-700 font-mono">{avgAttendancePercent}%</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Spełniają Kryteria</span>
          <span className="text-base font-bold text-purple-700 font-mono">{passingMembers.length}</span>
        </div>
      </div>

      {/* Dynamiczne Pole Opiekunów */}
      <div className="mb-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 text-xs">
        <p className="font-bold text-indigo-950 mb-1">Opiekunowie Naukowi Koła:</p>
        <div className={`grid gap-2 text-[11px] text-slate-700 ${activeSupervisors.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {activeSupervisors.map((s, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <UserCheck size={13} className="text-indigo-600 shrink-0" />
              <span>
                <strong>{formatSupervisorName(s)}</strong> – {formatSupervisorAffiliation(s, orgUnit)}{s.email ? ` (${s.email})` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Skrócona tabela podsumowująca czołowych studentów */}
      <div className="mb-4 flex-1">
        <p className="text-xs font-bold text-slate-900 mb-1.5">
          Wykaz studentów o najwyższej aktywności naukowej i frekwencji (Próbka rejestru):
        </p>
        <div className="border border-slate-200 rounded-lg overflow-hidden text-[10.5px] print:overflow-visible">
          <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200" style={{ display: 'table-header-group' }}>
              <tr>
                {showLp && <th className="py-1 px-2 text-center" style={{ width: '5%' }}>LP.</th>}
                {showName && <th className="py-1 px-2" style={{ width: '23%' }}>Imię i Nazwisko</th>}
                {showIndex && <th className="py-1 px-2 text-center" style={{ width: '12%' }}>Nr Indeksu</th>}
                {showField && <th className="py-1 px-2" style={{ width: '24%' }}>Kierunek</th>}
                {showPresent && <th className="py-1 px-2 text-center" style={{ width: '10%' }}>Obecności</th>}
                {showFreq && <th className="py-1 px-2 text-center" style={{ width: '9%' }}>Frekwencja</th>}
                {showPoints && <th className="py-1 px-2 text-center" style={{ width: '8%' }}>Punkty</th>}
                {showStatus && <th className="py-1 px-2 text-center" style={{ width: '9%' }}>Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeMembers.slice(0, 10).map((m, i) => (
                <tr key={i} className="hover:bg-slate-50 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  {showLp && <td className="py-1 px-2 text-center text-slate-400 font-mono">{i + 1}</td>}
                  {showName && <td className="py-1 px-2 font-medium text-slate-900 break-words">{m.fullName || m.name}</td>}
                  {showIndex && <td className="py-1 px-2 text-center font-mono">{m.index}</td>}
                  {showField && <td className="py-1 px-2 text-slate-600 break-words">{m.field || 'Psychologia'}</td>}
                  {showPresent && <td className="py-1 px-2 text-center font-mono">{m.present || totalMeetings}/{totalMeetings}</td>}
                  {showFreq && <td className="py-1 px-2 text-center font-mono font-bold text-emerald-700">{m.attendancePercent || 100}%</td>}
                  {showPoints && <td className="py-1 px-2 text-center font-mono text-purple-700 font-semibold">{m.points || 0}</td>}
                  {showStatus && (
                    <td className="py-1 px-2 text-center">
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Zaliczono
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9.5px] text-slate-500 mt-1 italic">
          * Pełna lista {activeMembers.length} studentów dostępna w załączniku nr 1 do niniejszego protokołu.
        </p>
      </div>

      {/* ── Dolna sekcja: Podpisy i Stopka CRM z gwarancją zakotwiczenia na dole strony ── */}
      <div className="mt-auto shrink-0 pt-6 signature-block break-inside-avoid page-break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Zarząd Koła Naukowego"
          chairpersonSub={orgShortName}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-indigo-600 shrink-0" />
            <span>Autentyczność protokołu potwierdzona w systemie CRM {formatOrgGenitive(orgName)}</span>
          </div>
          <div>Warszawa, {formatPolishDate(docDate)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Oficjalny Protokół Zbiorczy Ewidencji Wydanych Zaświadczeń i Dyplomów dla Dziekanatu / PKA
 */
export function OfficialRegistryProtocolTemplate({
  registry = [],
  org = null,
  academicYear = getCurrentAcademicYear(),
  supervisors = [],
  columnVisibility = {},
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const totalCount = registry.length;
  const speakerCount = registry.filter(r => r.type?.toLowerCase().includes('prelegent') || r.type?.toLowerCase().includes('dyplom')).length;
  const memberCount = registry.filter(r => r.type?.toLowerCase().includes('członk') || r.type?.toLowerCase().includes('zaświadczenie')).length;
  const boardCount = registry.filter(r => r.type?.toLowerCase().includes('zarząd')).length;

  const showLp = columnVisibility.lp !== false;
  const showId = columnVisibility.id !== false;
  const showType = columnVisibility.type !== false;
  const showRecipient = columnVisibility.recipient !== false;
  const showIssueDate = columnVisibility.issueDate !== false;
  const showDetails = columnVisibility.details !== false;
  const showStatus = columnVisibility.status !== false;

  return (
    <div className="doc-a4-sheet doc-a4-multipage w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 p-8 sm:p-12 font-sans shadow-lg mx-auto flex flex-col justify-between print:shadow-none print:max-w-none print:w-full print:m-0">
      {/* Header */}
      <DocumentStandardHeader
        org={org}
        docLabel="Protokół"
        docNumber={academicYear}
        dateLabel="Wydano:"
        docDate={new Date()}
      />

      {/* Title */}
      <div className="text-center mt-6 mb-7 sm:mb-8">
        <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
          Oficjalna Ewidencja Działalności Akademickiej
        </span>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
          OFICJALNY PROTOKÓŁ ZBIORCZY EWIDENCJI WYDANYCH DOKUMENTÓW
        </h2>
        <div className="mt-2.5 sm:mt-3 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-600 tracking-tight">
            Rejestr Zaświadczeń, Dyplomów i Aktów Koła Naukowego w roku akademickim {academicYear}
          </p>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="metric-box-container grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 my-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center box-border">
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Wszystkie Akty</p>
          <p className="text-base font-black text-slate-900 font-mono">{totalCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Zaświadczenia Członków</p>
          <p className="text-base font-black text-emerald-700 font-mono">{memberCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-amber-600 uppercase">Dyplomy Prelegentów</p>
          <p className="text-base font-black text-amber-700 font-mono">{speakerCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-indigo-600 uppercase">Zaświadczenia Zarządu</p>
          <p className="text-base font-black text-indigo-700 font-mono">{boardCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 print:overflow-visible">
        <table className="w-full text-[10.5px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr className="bg-slate-900 text-white font-bold text-left">
              {showLp && <th className="py-2 px-2.5 text-center" style={{ width: '5%' }}>Lp.</th>}
              {showId && <th className="py-2 px-2.5" style={{ width: '21%' }}>Nr Aktu / Sygnatura</th>}
              {showType && <th className="py-2 px-2.5" style={{ width: '17%' }}>Typ Dokumentu</th>}
              {showRecipient && <th className="py-2 px-2.5" style={{ width: '20%' }}>Odbiorca (Nr Albumu)</th>}
              {showIssueDate && <th className="py-2 px-2.5 text-center" style={{ width: '11%' }}>Data Wydania</th>}
              {showDetails && <th className="py-2 px-2.5" style={{ width: '16%' }}>Przedmiot / Temat / Rola</th>}
              {showStatus && <th className="py-2 px-2.5 text-center" style={{ width: '10%' }}>Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {registry.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-8 text-center text-slate-400 italic">
                  Brak wpisów w ewidencji wydanych dokumentów.
                </td>
              </tr>
            ) : (
              registry.map((doc, idx) => (
                <tr key={doc.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  {showLp && <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>}
                  {showId && <td className="py-1.5 px-2.5 font-mono font-bold text-indigo-950 break-words">{doc.id}</td>}
                  {showType && <td className="py-1.5 px-2.5 font-semibold text-slate-800 break-words">{doc.type}</td>}
                  {showRecipient && (
                    <td className="py-1.5 px-2.5 font-medium text-slate-900 break-words">
                      {doc.recipientName} {doc.recipientIndex && doc.recipientIndex !== '—' && <span className="font-mono text-slate-500 font-bold">({doc.recipientIndex})</span>}
                    </td>
                  )}
                  {showIssueDate && <td className="py-1.5 px-2.5 text-center font-mono text-slate-600">{doc.issueDate}</td>}
                  {showDetails && <td className="py-1.5 px-2.5 text-slate-700 break-words" title={doc.details}>{doc.details || '—'}</td>}
                  {showStatus && (
                    <td className="py-1.5 px-2.5 text-center">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✓ {doc.status || 'Wydany'}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-500 mb-8 italic">
        * Niniejszy protokół stanowi oficjalną dokumentację potwierdzającą wydanie aktów prawnych, dyplomów i zaświadczeń przez Zarząd i Opiekuna Koła Naukowego w Wyższej Szkole Kształcenia Zawodowego.
      </p>

      {/* ── Dolna sekcja: Podpisy i Stopka CRM z gwarancją zakotwiczenia na dole strony ── */}
      <div className="mt-auto shrink-0 pt-6 signature-block break-inside-avoid page-break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Przewodniczący Koła"
          chairpersonSub={orgShortName}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-indigo-600 shrink-0" />
            <span>Autentyczność protokołu potwierdzona w systemie CRM {formatOrgGenitive(orgName)}</span>
          </div>
          <div>Warszawa, {formatPolishDate(new Date())}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Oficjalny Dziennik Podawczy i Księga Korespondencji dla Dziekanatu / PKA
 */
export function OfficialCorrespondenceProtocolTemplate({
  correspondenceLog = [],
  org = null,
  academicYear = getCurrentAcademicYear(),
  supervisors = [],
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const totalCount = correspondenceLog.length;
  const inCount = correspondenceLog.filter(c => c.direction === 'IN').length;
  const outCount = correspondenceLog.filter(c => c.direction === 'OUT').length;

  return (
    <div className="doc-a4-sheet doc-a4-multipage w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 p-8 sm:p-12 font-sans shadow-lg mx-auto flex flex-col justify-between print:shadow-none print:max-w-none print:w-full print:m-0">
      {/* Header */}
      <DocumentStandardHeader
        org={org}
        docLabel="Dziennik Podawczy"
        docNumber={academicYear}
        dateLabel="Stan na:"
        docDate={new Date()}
      />

      {/* Title */}
      <div className="text-center mt-6 mb-7 sm:mb-8">
        <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
          Oficjalna Ewidencja Kancelaryjna
        </span>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
          ELEKTRONICZNY DZIENNIK PODAWCZY
        </h2>
        <div className="mt-2.5 sm:mt-3 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-600 tracking-tight">
            Rejestr pism przychodzących i wychodzących kancelarii w roku akademickim {academicYear}
          </p>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="metric-box-container grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-2.5 sm:gap-3 my-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center box-border">
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Wszystkie Pisma</p>
          <p className="text-base font-black text-slate-900 font-mono">{totalCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Przychodzące (IN)</p>
          <p className="text-base font-black text-emerald-700 font-mono">{inCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200">
          <p className="text-[10px] font-bold text-sky-600 uppercase">Wychodzące (OUT)</p>
          <p className="text-base font-black text-sky-700 font-mono">{outCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 print:overflow-visible">
        <table className="w-full text-[10px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr className="bg-slate-900 text-white font-bold text-left">
              <th className="py-2 px-2 text-center" style={{ width: '4%' }}>Lp.</th>
              <th className="py-2 px-2" style={{ width: '18%' }}>Sygnatura</th>
              <th className="py-2 px-2 text-center" style={{ width: '10%' }}>Data</th>
              <th className="py-2 px-2 text-center" style={{ width: '9%' }}>Kierunek</th>
              <th className="py-2 px-2" style={{ width: '22%' }}>Nadawca / Odbiorca</th>
              <th className="py-2 px-2" style={{ width: '27%' }}>Temat & Przedmiot Pisma</th>
              <th className="py-2 px-2 text-center" style={{ width: '10%' }}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {correspondenceLog.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-8 text-center text-slate-400 italic">
                  Brak wpisów w dzienniku podawczym.
                </td>
              </tr>
            ) : (
              correspondenceLog.map((item, idx) => (
                <tr key={item.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                  <td className="py-1.5 px-2 font-mono font-bold text-indigo-950 break-words">{item.id}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-600">{item.date}</td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold ${
                      item.direction === 'IN'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-sky-100 text-sky-800 border border-sky-300'
                    }`}>
                      {item.direction === 'IN' ? '📥 PRZYCH.' : '📤 WYCH.'}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-slate-700 break-words">
                    <div className="font-semibold text-slate-900">{item.sender}</div>
                    <div className="text-[9px] text-slate-500">→ {item.recipient}</div>
                  </td>
                  <td className="py-1.5 px-2 text-slate-800 break-words">
                    <div className="font-semibold text-slate-900">{item.subject}</div>
                    {item.summary && <div className="text-[9px] text-slate-500 italic mt-0.5">{item.summary}</div>}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                      {item.status || 'Zarejestrowane'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[9.5px] text-slate-500 mb-8 italic">
        * Niniejszy dokument stanowi oficjalny wyciąg z Elektronicznego Dziennika Podawczego Koła Naukowego dla potrzeb Dziekanatu Wydziału Nauk Społecznych i Polskiej Komisji Akredytacyjnej.
      </p>

      {/* ── Dolna sekcja: Podpisy i Stopka CRM z gwarancją zakotwiczenia na dole strony ── */}
      <div className="mt-auto shrink-0 pt-6 signature-block break-inside-avoid page-break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Przewodniczący Koła"
          chairpersonSub={`Kancelaria ${orgShortName}`}
        />

        <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
          <div className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-indigo-600 shrink-0" />
            <span>Autentyczność rejestru potwierdzona w systemie CRM {formatOrgGenitive(orgName)}</span>
          </div>
          <div>Warszawa, {formatPolishDate(new Date())}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Oficjalny Protokół / Notatka ze Spotkania Naukowego
 */
export function OfficialMeetingMinutesTemplate({
  meeting,
  protocolData = {},
  org = null,
  academicYear = getCurrentAcademicYear(),
  supervisors = [],
}) {
  const activeSupervisors = useMemo(
    () => getActiveSupervisors(supervisors, org),
    [supervisors, org]
  );

  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);

  const cleanYear = String(academicYear || getCurrentAcademicYear()).replace(/[\[\]]/g, '');
  const cleanCode = String(meeting?.code || meeting?.id || 'M01').replace(/[\[\]]/g, '').trim();
  const protocolNumber = protocolData.protocolNumber || `PROT/${orgTag}/${cleanCode}/${cleanYear.replace(/20/g, '')}`;
  const cleanMeetingTitle = String(meeting?.title || protocolData?.title || 'Spotkanie Naukowe Koła').replace(/[\[\]]/g, '').trim();
  const cleanSpeaker = String(protocolData?.speaker || meeting?.who || 'Zarząd Koła Naukowego').replace(/[\[\]]/g, '').trim();
  const rawAttendees = protocolData?.attendees || meeting?.attendanceList || meeting?.attendees || [];
  const attendanceList = Array.isArray(rawAttendees) ? rawAttendees : [];
  const shouldShowAppendix = protocolData?.includeAttendeesList || (attendanceList.length > 0 && protocolData?.includeAttendeesList !== false);

  return (
    <div id="printable-protocol-document" className="print-document w-full max-w-[210mm] mx-auto bg-white text-slate-900 font-sans print:max-w-none print:shadow-none print:bg-white text-xs leading-relaxed">
      
      {/* SEKCJA 1: STRONA PROTOKOŁU (Karta Merytoryczna) */}
      <section className="protocol-main-page min-h-[297mm] p-8 sm:p-12 relative flex flex-col justify-between break-after-page print:p-0 print:min-h-0">
        <div>
          {/* Nagłówek Uczelni i Koła */}
          <DocumentStandardHeader
            org={org}
            docLabel="Nr"
            docNumber={protocolNumber}
            dateLabel="Wrocław, dn."
            docDate={protocolData.date || meeting?.formattedDate || meeting?.date || new Date()}
          />

          {/* Document Title */}
          <div className="text-center mt-6 mb-7 sm:mb-8">
            <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-3.5 py-1 rounded-full border border-indigo-200/80 mb-3 sm:mb-3.5">
              Oficjalna Dokumentacja Zebrania
            </span>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
              PROTOKÓŁ ZE SPOTKANIA NAUKOWEGO
            </h2>
            <div className="mt-2.5 sm:mt-3 space-y-1">
              <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
                {formatOrgFullName(orgName)}
              </h3>
              <p className="text-xs font-semibold text-slate-700 tracking-tight">
                Spotkanie {cleanCode} &bull; Rok Akademicki {cleanYear}
              </p>
            </div>
          </div>

          {/* Meeting Metadata Table */}
          <div className="mb-6 border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <tbody>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <td className="py-2.5 px-3 font-bold text-slate-700 w-1/4 border-r border-slate-200">Temat / Tytuł:</td>
                  <td className="py-2.5 px-3 font-bold text-slate-900" colSpan="3">
                    {cleanMeetingTitle}
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 px-3 font-bold text-slate-700 border-r border-slate-200">Data i Godzina:</td>
                  <td className="py-2 px-3 font-mono text-slate-900 border-r border-slate-200">
                    {protocolData.date || meeting?.formattedDate || meeting?.date} ({protocolData.time || meeting?.time || '18:00 - 19:30'})
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-700 border-r border-slate-200 w-1/4">Miejsce / Tryb:</td>
                  <td className="py-2 px-3 text-slate-900">
                    {protocolData.location || meeting?.location || 'MS Teams / Google Meet (Tryb zdalny)'}
                  </td>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <td className="py-2 px-3 font-bold text-slate-700 border-r border-slate-200">Prelegent / Prowadzący:</td>
                  <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                    {cleanSpeaker}
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-700 border-r border-slate-200">Liczba Uczestników:</td>
                  <td className="py-2 px-3 font-bold text-emerald-800">
                    {protocolData.attendeesCount ?? meeting?.attendeesCount ?? attendanceList.length ?? 0} osób zweryfikowanych
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-700 border-r border-slate-200">Protokolant:</td>
                  <td className="py-2 px-3 text-slate-900" colSpan="3">
                    {protocolData.recorder || 'Protokolant Zarządu Koła'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 1: Porządek Obrad */}
          <div className="mb-5 space-y-1.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
              1. Cel spotkania i porządek obrad
            </h3>
            <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-200/80 whitespace-pre-line text-slate-800 leading-relaxed font-sans text-[11px]">
              {protocolData.agenda || '1. Otwarcie spotkania przez Przewodniczącego Koła.\n2. Wystąpienie prelegenta i prezentacja referatu naukowego.\n3. Dyskusja naukowa, sesja pytań i odpowiedzi (Q&A).\n4. Wolne wnioski, sprawy organizacyjne i zamknięcie posiedzenia.'}
            </div>
          </div>

          {/* Section 2: Przebieg Spotkania */}
          <div className="mb-5 space-y-1.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
              2. Przebieg posiedzenia, streszczenie prelekcji i dyskusja
            </h3>
            <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-200/80 whitespace-pre-line text-slate-800 leading-relaxed font-sans text-[11px]">
              {protocolData.content || 'W trakcie posiedzenia prelegent przedstawił prezentację merytoryczną. Członkowie koła aktywnie uczestniczyli w dyskusji nad zaprezentowaną tematyką badawczą, poruszając kluczowe aspekty metodologiczne i practical.'}
            </div>
          </div>

          {/* Section 3: Ustalenia i Wnioski */}
          <div className="mb-6 space-y-1.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
              3. Ustalenia końcowe, zadania i wnioski
            </h3>
            <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-200/80 whitespace-pre-line text-slate-800 leading-relaxed font-sans text-[11px]">
              {protocolData.conclusions || '1. Przyjęto sprawozdanie z przeprowadzonego referatu naukowego do ewidencji działalności koła.\n2. Ustalono termin kolejnego spotkania seminaryjnego.\n3. Zobowiązano członków do przygotowania materiałów na kolejną sesję roboczą.'}
            </div>
          </div>
        </div>

        {/* Stopka z podpisami elektronicznymi TYLKO NA KOŃCU PROTOKOŁU */}
        <div
          className="signatures-block signature-block mt-8 pt-4 border-t border-slate-200"
          style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            
            {/* 1. Podpis Protokolanta / Przewodniczącego */}
            <div className="flex flex-col items-center">
              <div className="h-10 border-b border-dashed border-slate-300 w-full mb-1"></div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">[Podpis elektroniczny]</span>
              <span className="text-xs font-semibold text-slate-800">{protocolData.recorder || 'Protokolant Zarządu Koła'}</span>
              <span className="text-[10px] text-slate-500">{orgShortName}</span>
            </div>

            {/* 2. Dynamiczne podpisy Opiekunów Naukowych */}
            {activeSupervisors.map((sup, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="h-10 border-b border-dashed border-slate-300 w-full mb-1"></div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">[Podpis elektroniczny]</span>
                <span className="text-xs font-semibold text-slate-800">
                  {formatSupervisorName(sup)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatSupervisorRole(sup)}
                </span>
              </div>
            ))}

          </div>
        </div>
      </section>

      {/* SEKCJA 2: ZAŁĄCZNIK - LISTA OBECNOŚCI (Startuje na czystej stronie) */}
      {shouldShowAppendix && attendanceList.length > 0 && (
        <section className="protocol-appendix-page min-h-[297mm] p-8 sm:p-12 break-before-page print:p-0 print:min-h-0">
          {/* Zwięzły nagłówek załącznika (jedno-linijkowy) */}
          <div className="border-b-2 border-slate-800 pb-2 mb-4 flex justify-between items-end">
            <div>
              <h3 className="text-sm font-bold tracking-wider text-slate-800 uppercase">
                Załącznik nr 1 do Protokołu {cleanCode}
              </h3>
              <p className="text-xs text-slate-500">Imienna lista zweryfikowanych uczestników spotkania</p>
            </div>
            <span className="text-xs font-bold text-slate-700">Liczba obecnych: {attendanceList.length}</span>
          </div>

          {/* Tabela / Siatka obecności w naturalnym przepływie (2 kolumny) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] leading-tight">
            {attendanceList.map((person, idx) => (
              <div key={idx} className="flex justify-between border-b border-slate-100 py-0.5 leading-tight text-[11px]">
                <span className="text-slate-800 font-medium truncate pr-2">
                  {idx + 1}. {person.name || person.rawName || person.memberName}
                </span>
                <span className="text-slate-400 font-mono shrink-0">
                  {person.nrIndeksu || person.index || person.indeks || 'Gość'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}




