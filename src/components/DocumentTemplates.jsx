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
import { getOrgKey, getMeetingAttendanceStorageKeys } from '../utils/storage';

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

  // Jednostka organizacyjna i Wydział
  let rawUnit = resolvedOrg?.unit || resolvedOrg?.faculty || 'Wydział Psychologii WSKZ';
  let unit = rawUnit
    .replace(/Instytut Psychologii/g, 'Wydział Psychologii')
    .replace(/INSTYTUT PSYCHOLOGII/g, 'WYDZIAŁ PSYCHOLOGII')
    .replace(/Instytucie Psychologii/g, 'Wydziale Psychologii')
    .replace(/Instytutu Psychologii/g, 'Wydziału Psychologii');
  let rawFaculty = resolvedOrg?.faculty || unit;
  let faculty = rawFaculty
    .replace(/Instytut Psychologii/g, 'Wydział Psychologii')
    .replace(/INSTYTUT PSYCHOLOGII/g, 'WYDZIAŁ PSYCHOLOGII')
    .replace(/Instytucie Psychologii/g, 'Wydziale Psychologii')
    .replace(/Instytutu Psychologii/g, 'Wydziału Psychologii');

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
export function formatOrgGenitive(orgName = '', orgId = null) {
  const cleanId = String(orgId || '').toLowerCase().trim();
  const str = String(orgName || '').trim();
  const lower = str.toLowerCase();

  if (cleanId === 'skn_seksuologii' || lower.includes('seksuolog')) {
    return 'Studenckiego Koła Naukowego Seksuologii WSKZ';
  }
  if (cleanId === 'uzaleznienia' || lower.includes('uzależnie') || lower.includes('ryzykownych')) {
    return 'Studenckiego Koła Naukowego Zachowań Ryzykownych i Uzależnień WSKZ';
  }
  if (cleanId === 'psychoonkologia' || lower.includes('psychoonkolog')) {
    return 'Studenckiego Koła Naukowego Psychoonkologii WSKZ';
  }

  if (!str) return 'Studenckiego Koła Naukowego';
  if (str.startsWith('Studenckie Koło Naukowe')) {
    return str.replace(/^Studenckie Koło Naukowe\s*/i, 'Studenckiego Koła Naukowego ');
  }
  if (str.startsWith('Koło Naukowe')) {
    return str.replace(/^Koło Naukowe\s*/i, 'Studenckiego Koła Naukowego ');
  }
  return `Studenckiego Koła Naukowego ${str}`;
}

/**
 * Automatyczne wykrywanie płci na podstawie imienia w języku polskim:
 * - Imiona kończące się na '-a' to forma żeńska
 * - Wyjątki męskie kończące się na '-a': Kuba, Barnaba, Bonawentura, Kosma, Jarema, Zawisza
 */
export function detectPolishGender(nameOrFullName) {
  if (!nameOrFullName || typeof nameOrFullName !== 'string') return 'male';
  const firstName = nameOrFullName.trim().split(/\s+/)[0].toLowerCase();
  if (!firstName) return 'male';

  const maleExceptions = new Set(['kuba', 'barnaba', 'bonawentura', 'kosma', 'jarema', 'zawisza']);
  if (maleExceptions.has(firstName)) {
    return 'male';
  }

  if (firstName.endsWith('a')) {
    return 'female';
  }

  return 'male';
}

/**
 * Wyodrębnia samą nazwę funkcji z etykiety roli (np. 'Przewodniczący', 'Sekretarz', 'Wiceprzewodnicząca')
 */
export function extractCleanRoleTitle(roleStr = '', isFemale = false) {
  if (!roleStr) return isFemale ? 'Członkini Zarządu' : 'Członek Zarządu';

  const roleIdMap = {
    chairman_m: 'Przewodniczący',
    chairman_f: 'Przewodnicząca',
    vice_chairman_m: 'Wiceprzewodniczący',
    vice_chairman_f: 'Wiceprzewodnicząca',
    secretary: 'Sekretarz',
    coordinator: 'Koordynator ds. Naukowych i Badań',
    board_member_m: 'Członek Zarządu',
    board_member_f: 'Członkini Zarządu',
  };

  if (roleIdMap[roleStr]) {
    return roleIdMap[roleStr];
  }

  // Wytnij z etykiety dopisek koła, np. "Przewodniczący Koła Naukowego Seksuologii" -> "Przewodniczący"
  let clean = String(roleStr)
    .replace(/\s*[-–—:]?\s*(Studenckiego Koła Naukowego|Studenckie Koło Naukowe|Koła Naukowego|Koło Naukowe|Koła|SKN).*$/i, '')
    .trim();

  if (isFemale) {
    if (clean === 'Przewodniczący') clean = 'Przewodnicząca';
    if (clean === 'Wiceprzewodniczący') clean = 'Wiceprzewodnicząca';
    if (clean === 'Członek Zarządu') clean = 'Członkini Zarządu';
  }

  return clean || roleStr;
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
 *   Linia 2: WYDZIAŁ PSYCHOLOGII WSKZ (lub odpowiedni wydział)
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
  docLabel = 'Nr dokumentu',
  subtitle = null,
  dateLabel = 'Wrocław, dn.',
  className = '',
  borderBottom = true,
  rightCustom = null,
  showFullBanner = false,
  hideDocNumber = false,
}) {
  const { name: orgName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);

  return (
    <div className={`document-standard-header w-full ${borderBottom ? 'border-b border-slate-300 pb-1.5 mb-2.5' : 'pb-1 mb-1.5'} ${className}`}>
      {/* 1. Opcjonalna belka graficzna WSKZ (tylko w trybie standalone bez wrapper A4) */}
      {showFullBanner && (
        <div className="w-full mb-1 overflow-hidden p-0 m-0 text-left flex justify-start items-center">
          <img
            src="/wskz-header.png"
            alt="Wyższa Szkoła Kształcenia Zawodowego"
            className="w-full h-auto max-h-[17mm] sm:max-h-[20mm] object-contain object-left block m-0 p-0"
            loading="eager"
          />
        </div>
      )}

      {/* 2. Kompaktowy pasek metadanych: Jednostka / Data (Linia 1) oraz Pełna nazwa koła 100% szerokości (Linia 2) */}
      <div className="w-full text-left space-y-0.5">
        <div className="flex items-center justify-between w-full">
          <p className="text-[8.5pt] font-normal tracking-wider text-slate-500 uppercase font-sans">
            {orgUnit.toUpperCase()}
          </p>
          {rightCustom ? (
            rightCustom
          ) : (
            <div className="text-right flex items-center gap-2">
              {!hideDocNumber && docNumber && (
                <div className="inline-flex items-center gap-1 font-mono text-[8.5pt] font-semibold text-slate-800 bg-slate-100 px-2 py-0.2 rounded border border-slate-200 whitespace-nowrap shadow-2xs">
                  {docLabel && <span className="text-slate-500 font-sans uppercase text-[7.5pt] tracking-wider font-normal">{docLabel}:</span>}
                  <span>{docNumber}</span>
                </div>
              )}
              <p className="text-[8.5pt] text-slate-500 font-sans whitespace-nowrap">
                {dateLabel} {formatPolishDate(docDate)}
              </p>
            </div>
          )}
        </div>

        {/* Linia 2: Pełna nazwa koła na całą szerokość arkusza (bez truncate i bez ...) */}
        <p className="w-full text-[9.5pt] sm:text-[10pt] font-bold tracking-tight text-indigo-950 uppercase font-sans leading-snug">
          {orgName.toUpperCase()}
        </p>

        {subtitle && (
          <p className="w-full text-[8.5pt] font-normal text-slate-500 italic mt-0.5 font-sans">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * ─── REUŻYWALNA OFICJALNA STOPKA UCZELNIANA WSKZ ORAZ CRM ─────────────────────
 */
export function DocumentStandardFooter({
  org = null,
  docDate = new Date(),
  docNumber = null,
  showBanner = false, // Domyślnie false - stopka WSKZ full-bleed jest renderowana przez OfficialWskzDocumentSheet
  pageNumberText = null,
  className = '',
}) {
  const { name: orgName } = getOrgMetadata(org);
  const orgGenitive = formatOrgGenitive(orgName);

  return (
    <div
      className={`document-standard-footer w-full mt-auto pt-2 break-inside-avoid ${className}`}
      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      {/* Pasek techniczny z potwierdzeniem autentyczności (wyrównany do lewego marginesu, bez ikon AI) */}
      <div className="flex items-end justify-between text-[8pt] text-slate-400 font-sans leading-tight select-text w-full">
        <div className="text-left space-y-0.5">
          <p className="text-[7.5pt] text-slate-400 leading-none">Autentyczność dokumentu potwierdzona w systemie</p>
          <p className="text-[8pt] font-semibold text-slate-600 leading-none">CRM {orgGenitive}</p>
          <p className="text-[7.5pt] text-slate-400 leading-none">Wygenerowano w systemie CRM SKN WSKZ</p>
        </div>
        <div className="text-right shrink-0 space-y-0.5 font-sans">
          {pageNumberText && <p className="font-semibold text-slate-600 text-[8pt]">{pageNumberText}</p>}
          <p className="text-[8pt] text-slate-500">Wrocław, dn. {formatPolishDate(docDate)}</p>
          {docNumber && <p className="font-mono text-[8pt] text-slate-600 font-medium">Nr ref.: {docNumber}</p>}
        </div>
      </div>

      {/* Oficjalna belka adresowo-rejestrowa WSKZ (tylko w trybie standalone bez wrapper A4) */}
      {showBanner && (
        <div className="w-full overflow-hidden mt-1">
          <img
            src="/wskz-footer.png"
            alt="Wyższa Szkoła Kształcenia Zawodowego"
            className="w-full h-auto max-h-[13mm] sm:max-h-[15mm] object-contain block"
            loading="eager"
          />
        </div>
      )}
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
  try {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
    return d.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch (_e) {
    return new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
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
  let text = '';
  if (typeof s === 'string') {
    text = s;
  } else {
    const rawTitle = (s.academicTitle || '').trim();
    const rawName = (s.name || s.fullName || '').trim();
    // Jeśli imię już zaczyna się od tytułu (np. name="mgr Martyna Dziekan" i academicTitle="mgr")
    if (rawTitle && rawName.toLowerCase().startsWith(rawTitle.toLowerCase())) {
      text = rawName;
    } else {
      text = `${rawTitle ? rawTitle + ' ' : ''}${rawName}`.trim();
    }
  }
  // Wyeliminowanie podwójnych stopni / tytułów (np. "mgr mgr", "dr dr", "prof. prof.")
  return text
    .replace(/\b(mgr|dr|prof\.|hab\.)\s+\1\b/gi, '$1')
    .replace(/\b(mgr|dr|prof\.|hab\.)\s+(mgr|dr|prof\.|hab\.)\b/gi, (match, p1, p2) => {
      if (p1.toLowerCase() === p2.toLowerCase()) return p1;
      return match;
    })
    .trim();
}

export function formatSupervisorRole(s) {
  if (!s) return 'Opiekun Koła';
  if (typeof s === 'string') return 'Opiekun Koła';
  return s.role || 'Opiekun Koła';
}

export function formatSupervisorAffiliation(s, defaultUnit = 'Wydział Psychologii WSKZ') {
  if (!s) return defaultUnit;
  if (typeof s === 'string') {
    return s
      .replace(/Instytut Psychologii/g, 'Wydział Psychologii')
      .replace(/INSTYTUT PSYCHOLOGII/g, 'WYDZIAŁ PSYCHOLOGII')
      .replace(/Instytucie Psychologii/g, 'Wydziale Psychologii')
      .replace(/Instytutu Psychologii/g, 'Wydziału Psychologii');
  }
  const rawAff = s.affiliation || defaultUnit;
  return rawAff
    .replace(/Instytut Psychologii/g, 'Wydział Psychologii')
    .replace(/INSTYTUT PSYCHOLOGII/g, 'WYDZIAŁ PSYCHOLOGII')
    .replace(/Instytucie Psychologii/g, 'Wydziale Psychologii')
    .replace(/Instytutu Psychologii/g, 'Wydziału Psychologii');
}

/**
 * Reużywalny, w 100% dynamiczny blok podpisów (bez zbędnego powielania „Zarząd”)
 */
export function DocumentSignaturesBlock({
  activeSupervisors = [],
  orgShortName = 'Koło Naukowe',
  orgName = '',
  orgUnit = 'Wydział Psychologii WSKZ',
  chairpersonTitle = 'Zarząd Koła Naukowego',
  chairpersonSub = null,
  className = 'pt-3 sm:pt-4',
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
      className={`signature-block signatures-block w-full pb-1 border-t border-slate-200 mt-auto break-inside-avoid ${className}`}
      style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
    >
      <div className={`grid gap-3 sm:gap-4 text-center ${gridColsClass}`}>
        {/* 1. Pole podpisu Przewodniczącego / Zarządu */}
        <div className="flex flex-col items-center text-center">
          <div className="h-8 sm:h-9 w-full border-b border-dashed border-slate-300 mb-1.5 flex items-end justify-center pb-0.5">
            <span className="text-[8.5px] text-slate-400 font-serif italic">[Podpis elektroniczny]</span>
          </div>
          <span className="text-[11px] font-medium text-slate-800 leading-tight">{chairpersonTitle}</span>
          {resolvedSub && (
            <span className="text-[9.5px] text-slate-500 font-normal leading-tight mt-0.5">{resolvedSub}</span>
          )}
        </div>

        {/* 2. Dynamiczne pola podpisów Opiekunów Naukowych */}
        {activeSupervisors.map((sup, index) => (
          <div key={index} className="flex flex-col items-center text-center">
            <div className="h-8 sm:h-9 w-full border-b border-dashed border-slate-300 mb-1.5 flex items-end justify-center pb-0.5">
              <span className="text-[8.5px] text-slate-400 font-serif italic">[Podpis elektroniczny]</span>
            </div>
            <span className="text-[11px] font-medium text-slate-800 leading-tight">
              {formatSupervisorName(sup)}
            </span>
            <span className="text-[9.5px] text-slate-600 font-normal leading-tight mt-0.5">
              {formatSupervisorRole(sup)}
            </span>
            <span className="text-[8.5px] text-slate-400 font-normal leading-tight">
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
  const safePresent = typeof safeFreqData?.presentMandatory === 'number'
    ? safeFreqData.presentMandatory
    : (typeof safeFreqData?.attendedMandatoryCount === 'number'
        ? safeFreqData.attendedMandatoryCount
        : (totalMeetings > 0 ? Math.min(totalMeetings, safeFreqData?.present || 0) : (safeFreqData?.present || 0)));
  const bonusCount = safeFreqData?.bonusAttended || safeFreqData?.optionalBonus || 0;
  const safePoints = typeof points === 'number' ? points : 0;

  const hasDataForYear = totalMeetings > 0 || safePresent > 0 || safePoints > 0;

  // Visibility toggles for certificate sections (controlled via DocumentCustomizer & edit toggles)
  const showFreqSection = columnVisibility.cert_freq !== false;
  const showPointsSection = columnVisibility.cert_points !== false;
  const showDetailedActivityRating = columnVisibility.cert_detailed_rating !== false;
  // Compute number of visible metric columns to adjust grid dynamically
  const visibleMetricCols = [showFreqSection, showPointsSection, true].filter(Boolean).length; // "Ocena" always shown

  const docNumber = generateDocumentNumber('CERT', member?.index || member?.indexNumber || '00000', academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const studentName = member?.fullName || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Imię i Nazwisko Studenta';
  const isFemale = detectPolishGender(member?.firstName || studentName) === 'female';
  const indexNumber = member?.index || member?.indexNumber || '—';
  const fieldName = member?.field || 'Psychologia';
  const yearLabel = member?.year ? `rok ${member.year}` : 'jednolite studia magisterskie';

  // Dynamiczny nagłówek dokumentu:
  // Domyślnie (gdy frekwencja jest włączona): ZAŚWIADCZENIE O CZŁONKOSTWIE I FREKWENCJI
  // Gdy wyłączono opcję pokazywania frekwencji: ZAŚWIADCZENIE O CZŁONKOSTWIE
  const certificateTitle = showFreqSection
    ? 'Zaświadczenie o Członkostwie i Frekwencji'
    : 'Zaświadczenie o Członkostwie';

  return (
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
      {/* ── STREFA 1 (GÓRNA): Nagłówek Uczelni, Sygnatura, Tytuł i Formuła Wstępna ── */}
      <div className="relative z-10 space-y-2.5">
        {/* Globalny Ujednolicony Nagłówek Uczelniany WSKZ i Koła (bez duplikatu numeru i bez ucinania ...) */}
        <DocumentStandardHeader
          org={org}
          docDate={docDate}
          hideDocNumber={true}
          dateLabel="Wrocław, dn."
          borderBottom={true}
          className="border-indigo-900"
        />

        {/* Tytuł Zaświadczenia */}
        <div className="text-center my-1.5 sm:my-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-wide mt-1 uppercase [text-wrap:balance]">
            {certificateTitle}
          </h2>
          <p className="text-[10px] text-slate-500 font-normal tracking-wide mt-0.5">
            Rok akademicki {academicYear} &bull; Oficjalny Rejestr Działalności Studenckiej
          </p>
        </div>

        {/* Formuła Wstępna */}
        <p className="text-[11px] sm:text-[11.5px] leading-relaxed text-slate-700 text-justify [text-justify:inter-word] [text-wrap:pretty] indent-4 font-normal">
          Niniejszym zaświadcza się, że {isFemale ? 'Pani' : 'Pan'}{' '}
          <strong className="text-slate-800 font-semibold border-b border-slate-300 pb-0.5 px-1">{studentName}</strong>,{' '}
          {isFemale ? 'legitymująca się' : 'legitymujący się'} numerem indeksu: <strong className="font-mono text-slate-800 font-semibold">{indexNumber}</strong>,{' '}
          {isFemale ? 'będąca studentką' : 'będący studentem'} kierunku: <strong className="font-semibold text-slate-800">{fieldName}</strong> ({yearLabel}), w&nbsp;roku akademickim{' '}
          <strong className="font-semibold text-slate-800">{academicYear}</strong> {isFemale ? 'brała' : 'brał'} aktywny udział w&nbsp;działalności naukowo-badawczej i&nbsp;spotkaniach Koła:{' '}
          <strong className="text-slate-800 font-semibold">{orgName}</strong> przy&nbsp;{orgUnit}.
        </p>
      </div>

      {/* ── STREFA 2 (ŚRODKOWA): Kluczowe Dane, Metryki i Wyszczególnienie Aktywności ── */}
      <div className="relative z-10 flex-grow flex flex-col justify-center mt-1 sm:mt-1.5 mb-2 space-y-2 sm:space-y-2.5">
        {!hasDataForYear ? (
          <div className="my-2 p-4 bg-amber-50/90 border-2 border-dashed border-amber-300 rounded-xl text-center">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-700 mb-1.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-tight">
              Brak zarejestrowanej działalności w roku {academicYear}
            </h3>
            <p className="text-[10px] text-slate-600 mt-0.5 max-w-md mx-auto leading-relaxed font-normal">
              Dla roku akademickiego <strong className="font-semibold text-slate-800">{academicYear}</strong> nie zarejestrowano spotkań ani obecności studenta <strong className="font-semibold text-slate-800">{studentName}</strong>. Wystawienie oficjalnego zaświadczenia z zerowymi wartościami zostało wstrzymane.
            </p>
            <div className="mt-1.5 inline-block bg-white px-2 py-0.5 rounded-md border border-amber-200 text-[8.5px] text-slate-500 font-mono">
              Status: {isFutureYear ? 'Okres planowany' : (isPastYear ? 'Brak wpisów archiwalnych' : 'Brak danych w roku bieżącym')}
            </div>
          </div>
        ) : (
          <>
            {/* ── Metryka Osiągnięć i Frekwencji (podniesiona i odchudzona pionowo o 12px) ── */}
            <div
              className="metric-box-container w-full grid gap-2 px-3 py-2 sm:py-2.5 bg-slate-50/90 rounded-xl border border-slate-200/90 text-center shadow-2xs box-border"
              style={{ gridTemplateColumns: `repeat(${visibleMetricCols}, minmax(0, 1fr))`, width: '100%' }}
            >
              {showFreqSection && (
                <div className="py-1 px-1.5 border-r border-slate-200 min-w-0">
                  <span className="text-[8.5px] uppercase font-medium text-slate-500 tracking-wider block truncate">Łączna Frekwencja</span>
                  <span className="text-xl sm:text-2xl font-normal text-emerald-700 font-mono leading-none my-0.5 block">{safeFreq}%</span>
                  <span className="text-[8.5px] text-slate-500 block truncate">
                    {safeFreqData?.displayRatio || `${safePresent} / ${totalMeetings}`} spotkań{bonusCount > 0 ? ` (+${bonusCount})` : ''}
                  </span>
                </div>
              )}
              {showPointsSection && (
                <div className="py-1 px-1.5 border-r border-slate-200 min-w-0">
                  <span className="text-[8.5px] uppercase font-medium text-slate-500 tracking-wider block truncate">Punkty Aktywności</span>
                  <span className="text-xl sm:text-2xl font-normal text-purple-700 font-mono leading-none my-0.5 block">{safePoints} pkt</span>
                  <span className="text-[8.5px] text-slate-500 block truncate">Wykaz aktywności</span>
                </div>
              )}
              <div className="py-1 px-1.5 min-w-0 flex flex-col justify-center">
                <span className="text-[8.5px] uppercase font-medium text-slate-500 tracking-wider block truncate">Ocena Aktywności</span>
                {showDetailedActivityRating ? (
                  <>
                    <span className="text-xs font-normal text-indigo-950 block leading-tight mt-0.5 truncate">
                      {safeFreq >= 90 ? 'Lider Koła' : safeFreq >= 75 ? 'Bardzo Aktywny' : (safeFreq >= 50 ? 'Aktywny Członek' : (isPastYear ? 'Brak zaliczenia' : 'W trakcie realizacji'))}
                    </span>
                    <span className={`text-[8.5px] font-medium flex items-center justify-center gap-0.5 mt-0.5 ${
                      safeFreq >= 50 ? 'text-emerald-600' : (isPastYear ? 'text-rose-600' : 'text-slate-500')
                    }`}>
                      {safeFreq >= 50 ? (
                        <><CheckCircle2 size={10} /> Kryteria spełnione</>
                      ) : isPastYear ? (
                        <><AlertTriangle size={10} /> Kryteria niespełnione</>
                      ) : (
                        <><Clock size={10} /> Aktywność w toku</>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-bold text-indigo-950 block leading-tight mt-0.5">
                    Aktywny członek koła naukowego
                  </span>
                )}
              </div>
            </div>

            {/* ── Wyszczególnienie aktywności merytorycznej (podniesione i zoptymalizowane) ── */}
            <div className="text-[10px] sm:text-[10.5px] text-slate-700 space-y-1.5 bg-indigo-50/40 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-indigo-100/90 shadow-2xs font-normal">
              <p className="font-semibold text-indigo-950 text-[10px] sm:text-[10.5px] uppercase tracking-wide">
                Wyszczególnienie aktywności merytorycznej:
              </p>
              {isEditing ? (
                <textarea
                  rows={3}
                  value={customText || `• Udział w comiesięcznych spotkaniach merytorycznych, seminaryjnych oraz warsztatowych Koła.\n• Wystąpienia prelekcyjne, udział w sesjach Journal Club i dyskusjach klinicznych.\n• Praca nad materiałami edukacyjnymi, analizami piśmiennictwa i projektami badawczymi Koła.`}
                  onChange={(e) => onUpdateCustomText(e.target.value)}
                  className="w-full p-2 bg-white border border-indigo-300 rounded-lg text-[10px] font-sans text-slate-800 focus:outline-none"
                />
              ) : (
                <ul className="list-disc list-inside space-y-1 text-[9.5px] sm:text-[10px] text-slate-700 pl-1 leading-snug">
                  {(customText || `Udział w comiesięcznych spotkaniach merytorycznych, seminaryjnych oraz warsztatowych Koła.\nWystąpienia prelekcyjne, udział w sesjach Journal Club i dyskusjach klinicznych.\nPraca nad materiałami edukacyjnymi, analizami piśmiennictwa i projektami badawczymi Koła.`)
                    .split('\n')
                    .filter(Boolean)
                    .map((line, idx) => (
                      <li key={idx} className="leading-snug">{line.replace(/^[•\-\*]\s*/, '')}</li>
                    ))}
                </ul>
              )}
            </div>
          </>
        )}

        <p className="text-[9px] sm:text-[9.5px] text-slate-500 italic leading-snug text-center px-2 mt-0.5 mb-0.5">
          Zaświadczenie wydaje się na wniosek studenta celem przedłożenia w&nbsp;Dziekanacie Uczelni, do&nbsp;stypendium Rektora, 
          do&nbsp;suplementu do&nbsp;dyplomu lub do&nbsp;portfolio osiągnięć naukowych.
        </p>
      </div>

      {/* ── STREFA 3 (DOLNA): Podpisy i Stopka WSKZ ── */}
      <div className="relative z-10 mt-auto pt-1 space-y-1">
        {/* Dynamiczny Blok Podpisów */}
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Zarząd Koła Naukowego"
          chairpersonSub={orgShortName}
          className="pt-1.5 sm:pt-2"
        />
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
      {/* ── STREFA 1 (GÓRNA): Nagłówek Uczelniany i Koła ── */}
      <div className="relative z-10 space-y-2">
        <DocumentStandardHeader
          org={org}
          docNumber={docNumber}
          docDate={docDate}
          docLabel="Nr"
          dateLabel="Data:"
          borderBottom={true}
          className="border-amber-300"
        />
      </div>

      {/* ── STREFA 2 (ŚRODKOWA): Prestiżowy Środek Dyplomu ── */}
      <div className="relative z-10 flex-grow flex flex-col justify-center my-2 sm:my-3.5 space-y-3 sm:space-y-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 mx-auto shadow-2xs">
          <Award size={26} />
        </div>

        <div>
          <span className="text-[9.5px] uppercase tracking-widest font-medium text-amber-800 bg-amber-100/70 px-3.5 py-0.5 rounded-full border border-amber-300">
            Certyfikat Wystąpienia Naukowego
          </span>
          <h1 className="text-2xl sm:text-3xl font-normal tracking-wide text-slate-900 uppercase mt-2">
            Dyplom Prelegenta
          </h1>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">Nr {docNumber}</p>
        </div>

        <div className="space-y-1 py-1">
          <p className="text-[10.5px] text-slate-600 uppercase tracking-widest font-normal">Niniejszy certyfikat otrzymuje</p>
          <h2 className="text-xl sm:text-2xl font-medium text-indigo-950 font-sans tracking-wide border-b-2 border-amber-400 inline-block pb-1 px-5">
            {studentName}
          </h2>
          <p className="text-[10px] text-slate-500 font-mono">Nr Indeksu: {indexNumber}</p>
        </div>

        <div className="max-w-lg mx-auto bg-amber-50/60 p-3.5 sm:p-4 rounded-2xl border border-amber-200/90 text-center space-y-1.5 shadow-2xs font-normal">
          <p className="text-[10px] text-amber-900 font-medium uppercase tracking-wider">
            Za przygotowanie i wygłoszenie referatu naukowego pt.:
          </p>
          {isEditing ? (
            <textarea
              rows={2}
              value={presentationTopic}
              onChange={(e) => onUpdateTopic(e.target.value)}
              className="w-full p-2 bg-white border border-amber-400 rounded-lg text-xs font-medium text-slate-900 italic text-center focus:outline-none"
            />
          ) : (
            <p className="text-sm sm:text-base font-medium text-slate-900 italic px-2 leading-snug">
              „{presentationTopic}”
            </p>
          )}
          <p className="text-[10px] text-slate-500 mt-1 font-normal">
            w ramach oficjalnego seminarium naukowego {orgName} ({academicYear})
          </p>
        </div>
      </div>

      {/* ── STREFA 3 (DOLNA): Podpisy i Stopka ── */}
      <div className="relative z-10 mt-auto pt-2 space-y-2">
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Przewodniczący Koła Naukowego"
          chairpersonSub={orgAffiliationSub}
        />

        <DocumentStandardFooter org={org} docDate={docDate} />
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
  docNumber: propDocNumber = null,
  docDate = new Date(),
  isEditing = false,
  customDuties = null,
  onUpdateDuties = () => {},
  org = null,
}) {
  const { id: orgId, name: orgName, shortName: orgShortName, tag: orgTag, unit: orgUnit } = getOrgMetadata(org);
  const orgGenitive = formatOrgGenitive(orgName, orgId);

  const docNumber = propDocNumber || generateDocumentNumber('BOARD', member?.index || member?.indexNumber || '00000', academicYear, orgTag);
  const activeSupervisors = getActiveSupervisors(supervisors, org);

  const studentName = member?.fullName || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Imię i Nazwisko Członka';
  const isFemale = detectPolishGender(member?.firstName || studentName) === 'female';
  const indexNumber = member?.index || member?.indexNumber || '00000';
  const fieldName = member?.field || 'Psychologia';

  // Wyodrębniona sama nazwa funkcji (np. Przewodniczący, Sekretarz, Wiceprzewodnicząca)
  const cleanRoleTitle = useMemo(() => {
    return extractCleanRoleTitle(boardRole, isFemale);
  }, [boardRole, isFemale]);

  // Pełna nazwa funkcji połączona z dopełniaczem nazwy koła, np. "Przewodniczący Studenckiego Koła Naukowego Seksuologii WSKZ"
  const fullRoleWithGenitive = useMemo(() => {
    if (!cleanRoleTitle) return orgGenitive;
    if (cleanRoleTitle.includes(orgGenitive)) return cleanRoleTitle;
    return `${cleanRoleTitle} ${orgGenitive}`;
  }, [cleanRoleTitle, orgGenitive]);

  return (
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
      {/* ── STREFA 1 (GÓRNA): Nagłówek Uczelni, Sygnatura, Tytuł i Formuła Wstępna ── */}
      <div className="relative z-10 space-y-2.5">
        {/* Globalny Ujednolicony Nagłówek Uczelniany WSKZ i Koła (bez duplikatu numeru i bez ucinania ...) */}
        <DocumentStandardHeader
          org={org}
          docDate={docDate}
          hideDocNumber={true}
          dateLabel="Wrocław, dn."
          borderBottom={true}
          className="border-indigo-900"
        />

        {/* Tytuł Zaświadczenia z estetycznym podziałem i oddechem od górnej linii */}
        <div className="text-center mt-7 mb-2">
          <span className="text-[10.5px] font-normal text-slate-500 uppercase tracking-widest block mb-2.5">
            Zaświadczenie o:
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-wide uppercase whitespace-nowrap leading-snug">
            Pełnieniu Funkcji w&nbsp;Zarządzie Koła
          </h2>
          <p className="text-[10px] text-slate-500 font-normal tracking-wide mt-1.5">
            Kadencja Zarządu Koła &bull; Rok Akademicki {academicYear}
          </p>
        </div>

        {/* Formuła Wstępna z oddechem od nagłówka i poprawną odmianą płci */}
        <p className="mt-8 pt-2 text-[11px] sm:text-[11.5px] leading-relaxed text-slate-700 text-justify [text-justify:inter-word] [text-wrap:pretty] indent-4 font-normal">
          Niniejszym zaświadcza się, że {isFemale ? 'Pani' : 'Pan'}{' '}
          <strong className="text-slate-800 font-semibold border-b border-slate-300 pb-0.5 px-1">{studentName}</strong>,{' '}
          numer indeksu: <strong className="font-mono text-slate-800 font-semibold">{indexNumber}</strong>,{' '}
          {isFemale ? 'studentka' : 'student'} kierunku: <strong className="font-semibold text-slate-800">{fieldName}</strong>, w&nbsp;roku akademickim{' '}
          <strong className="font-semibold text-slate-800">{academicYear}</strong>{' '}
          {isFemale ? 'pełniła' : 'pełnił'} z&nbsp;wyboru funkcję w&nbsp;Zarządzie Koła Naukowego:
        </p>
      </div>

      {/* ── STREFA 2 (ŚRODKOWA): Boks Funkcji w Zarządzie i Zakres Obowiązków ── */}
      <div className="relative z-10 flex-grow flex flex-col justify-center my-2 sm:my-3.5 space-y-3 sm:space-y-3.5">
        {/* Boks Oficjalnej Funkcji w Zarządzie z nagłówkiem łączącym funkcję z nazwą koła w dopełniaczu */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-center shadow-2xs space-y-1.5 font-normal">
          <span className="text-[9px] font-semibold uppercase text-indigo-700 tracking-widest block mb-1">
            Oficjalna Funkcja w&nbsp;Zarządzie Koła Naukowego
          </span>
          {/* Główny duży nagłówek: funkcja połączona z pełną nazwą koła w dopełniaczu */}
          <span className="text-lg sm:text-xl font-bold text-indigo-950 block tracking-tight leading-snug">
            {fullRoleWithGenitive}
          </span>
          {/* Okres kadencji bezpośrednio pod nagłówkiem */}
          <span className="text-[10px] sm:text-[10.5px] text-slate-500 font-normal block pt-0.5">
            w&nbsp;okresie kadencji: {termDates}
          </span>
        </div>

        {/* Zakres Obowiązków Statutowych */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/90 border border-slate-200 text-[10.5px] sm:text-[11px] space-y-2 shadow-2xs font-normal">
          <p className="font-medium text-slate-900 text-[11px] uppercase tracking-wide">
            Zakres zrealizowanych obowiązków statutowych:
          </p>
          {isEditing ? (
            <textarea
              rows={4}
              value={customDuties || `• Kierowanie bieżącą działalnością naukową i organizacyjną ${orgGenitive}.\n• Koordynacja ogólnopolskich spotkań naukowych, warsztatów merytorycznych i sesji dyskusyjnych.\n• Nadzór nad realizacją projektów badawczych i przygotowaniem publikacji naukowych.\n• Reprezentowanie Koła przed Władzami Uczelni, Dziekanatem oraz jednostkami zewnętrznymi.`}
              onChange={(e) => onUpdateDuties(e.target.value)}
              className="w-full p-2 bg-white border border-indigo-300 rounded-lg text-[10.5px] font-sans text-slate-800 focus:outline-none"
            />
          ) : (
            <ul className="list-disc list-inside text-slate-700 space-y-1 sm:space-y-1.5 pl-1 leading-snug">
              {(customDuties || `Kierowanie bieżącą działalnością naukową i organizacyjną ${orgGenitive}.\nKoordynacja ogólnopolskich spotkań naukowych, warsztatów merytorycznych i sesji dyskusyjnych.\nNadzór nad realizacją projektów badawczych i przygotowaniem publikacji naukowych.\nReprezentowanie Koła przed Władzami Uczelni, Dziekanatem oraz jednostkami zewnętrznymi.`)
                .split('\n')
                .filter(Boolean)
                .map((line, idx) => (
                  <li key={idx} className="leading-snug">{line.replace(/^[•\-\*]\s*/, '')}</li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── STREFA 3 (DOLNA): Podpisy i Stopka WSKZ ── */}
      <div className="relative z-10 mt-auto pt-1 space-y-1">
        <DocumentSignaturesBlock
          activeSupervisors={activeSupervisors}
          orgShortName={orgShortName}
          orgName={orgName}
          orgUnit={orgUnit}
          chairpersonTitle="Dziekanat / Dyrekcja"
          chairpersonSub={orgUnit}
          className="pt-1.5 sm:pt-2"
        />
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
      const keys = getMeetingAttendanceStorageKeys(orgId || 'skn_seksuologii', m);
      const mDateStr = String(m.date || (m.start_dt ? String(m.start_dt).split('T')[0] : '') || '').trim().slice(0, 10);

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (parsed.organization_id && orgId && parsed.organization_id !== orgId) continue;
            const rawPDate = parsed.date || parsed.meetingDate || '';
            const pDateStr = rawPDate ? String(rawPDate).trim().slice(0, 10) : '';
            if (pDateStr && mDateStr && pDateStr !== mDateStr) continue;
            // Ochrona przed starym cache z 2025/2026 bez daty pod gołym kluczem _M04 / _M07
            if (/_M\d+$/i.test(key) && mDateStr >= '2026-10-01' && (!pDateStr || pDateStr !== mDateStr)) {
              continue;
            }
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
      {/* ── Nagłówek Uczelniany i Identyfikator Dokumentu ── */}
      <DocumentStandardHeader
        org={org}
        docLabel="Dokument"
        docNumber={docNumber}
        dateLabel="Stan na dzień:"
        docDate={docDate}
      />

      {/* ── Tytuł Sprawozdania z nowym standardem wizualnym (optymalny oddech i interlinia) ── */}
      <div className="mt-4 mb-6 text-center">
        <h2 className="text-xl font-normal text-slate-950 uppercase tracking-wide">
          ZBIORCZA TABELA ZREALIZOWANYCH SPOTKAŃ
        </h2>
        <div className="mt-2 space-y-1">
          <h3 className="text-sm font-medium text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-normal text-slate-600">
            Rejestr aktywności i spotkań naukowych
          </p>
        </div>
        <div className="mt-2.5 space-y-0.5 text-xs text-slate-600 font-normal">
          <p>
            Rok Akademicki {academicYear} &bull; {orgUnit}
          </p>
          <p className="text-[11px] text-slate-500">
            <span className="font-medium">Opieka naukowa:</span> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {/* ── KPI Podsumowanie ── */}
      <div className="metric-box-container w-full grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-2.5 sm:gap-3 mb-5 text-center text-xs box-border print:mb-3">
        <div className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9.5px] uppercase font-medium text-slate-500 tracking-wider block">Zrealizowane spotkania</span>
          <span className="text-base font-normal text-indigo-950 font-mono mt-0.5 block">{meetingsList.length}</span>
          <span className="text-[9px] text-slate-400 block mt-0.5">z listą obecności</span>
        </div>
        <div className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9.5px] uppercase font-medium text-slate-500 tracking-wider block">Łączna liczba osobodni</span>
          <span className="text-base font-normal text-emerald-700 font-mono mt-0.5 block">{totalAttendees} os.</span>
          <span className="text-[9px] text-slate-400 block mt-0.5">łączna frekwencja</span>
        </div>
        <div className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9.5px] uppercase font-medium text-slate-500 tracking-wider block">Średnia uczestników / spotkanie</span>
          <span className="text-base font-normal text-slate-900 font-mono mt-0.5 block">{avgAttendees} os.</span>
          <span className="text-[9px] text-slate-400 block mt-0.5">na zrealizowane zebranie</span>
        </div>
      </div>

      {/* ── Tabela Spotkań ze zoptymalizowanymi kolumnami ── */}
      <div className="border border-slate-200 rounded-lg overflow-hidden text-[9.5px] flex-1 min-h-[300px] flex flex-col mb-4 print:border-none print:rounded-none print:overflow-visible print:m-0">
        <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead className="bg-slate-100 text-slate-700 font-medium border-b border-slate-200" style={{ display: 'table-header-group' }}>
            <tr className="hidden print:table-row bg-white border-b border-slate-300">
              <th colSpan={10} className="p-0 pb-1 text-left font-normal">
                <div className="flex items-center justify-between text-[8px] text-slate-600 font-sans pb-1 mb-1 border-b border-slate-200">
                  <span className="font-semibold text-slate-800 uppercase tracking-tight">{orgName}</span>
                  <span className="font-mono text-slate-500">
                    Tabela Spotkań &bull; {docNumber}
                  </span>
                </div>
              </th>
            </tr>
            <tr>
              {showLp && <th className="py-2 px-1 text-center whitespace-nowrap" style={{ width: '4%' }}>LP.</th>}
              {showDate && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '11%' }}>Data</th>}
              {showType && <th className="py-2 px-2" style={{ width: '15%' }}>Forma</th>}
              {showTitle && <th className="py-2 px-2.5" style={{ width: isEditing ? '30%' : '33%' }}>Temat / Zakres Merytoryczny</th>}
              {showSpeaker && <th className="py-2 px-2" style={{ width: '24%' }}>Prelegent / Prowadzący</th>}
              {showAttendees && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: isEditing ? '13%' : '13%' }}>Frekwencja</th>}
              {isEditing && <th className="py-2 px-1 text-center print:hidden" style={{ width: '5%' }}>Akcja</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meetingsList.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400 italic bg-slate-50/50">
                  Brak zarejestrowanych pozycji w wybranym okresie.
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

        <DocumentStandardFooter org={org} docDate={docDate} />
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
  const resolvedOrg = org || orgMeta?.resolvedOrg || { id: orgId || 'skn_seksuologii', name: orgName || 'Koło Naukowe', shortName: orgShortName || 'SKN' };

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

  // Pobranie rejestru zarządu dla aktywnej organizacji
  const scopedTenures = useMemo(() => {
    let raw = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const tKey = getOrgKey(resolvedOrg?.id || orgId, 'skn_board_tenures');
        const s = localStorage.getItem(tKey) || localStorage.getItem(`skn_board_tenures_${resolvedOrg?.id || orgId}`) || localStorage.getItem('skn_board_tenures');
        if (s) raw = JSON.parse(s);
      } catch {}
    }
    return Array.isArray(raw) ? raw : [];
  }, [resolvedOrg?.id, orgId]);

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
      lp: showStatus ? 4 : 4,
      name: showStatus ? 22 : 25,
      index: showStatus ? 9 : 10,
      field: showStatus ? 20 : 23,
      year: showStatus ? 6 : 7,
      present: showStatus ? 9 : 10,
      freq: showStatus ? 9 : 10,
      points: showStatus ? 9 : 11,
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
        boardTenures: scopedTenures,
        orgId: resolvedOrg?.id || orgId,
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
      {/* ── Nagłówek Formalny Raportu ── */}
      <DocumentStandardHeader
        org={org}
        docLabel="Ewidencja"
        docNumber={docNumber}
        dateLabel="Stan na:"
        docDate={docDate}
      />

      {/* ── Tytuł Ewidencji ── */}
      <div className="mt-3 mb-5 text-center">
        <h2 className="text-xl font-bold text-slate-950 uppercase tracking-wide">
          OFICJALNA EWIDENCJA CZŁONKÓW KOŁA
        </h2>
        <div className="mt-1.5 space-y-0.5">
          <h3 className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
        </div>
        <div className="mt-2 space-y-0.5 text-xs text-slate-600 font-normal">
          <p>
            Rok Akademicki {academicYear} &bull; {orgUnit} &bull; Zarejestrowanych aktywnych studentów: <span className="font-semibold text-slate-900">{activeMembers.length}</span>
          </p>
          <p className="text-[11px] text-slate-500">
            <span className="font-medium">Opieka naukowa:</span> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {!hasDataForYear ? (
        <div className="my-10 p-8 bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-tight">
            Brak danych archiwalnych / rejestru spotkań
          </h3>
          <p className="text-xs text-slate-600 mt-1.5 max-w-lg mx-auto font-normal">
            Dla roku akademickiego <strong className="font-semibold text-slate-800">{academicYear}</strong> nie zarejestrowano spotkań naukowych ani wpisów w ewidencji obecności członków Koła <strong className="font-semibold text-slate-800">{orgName}</strong>.
          </p>
          <div className="mt-3.5 inline-block bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-[10.5px] text-slate-500 font-mono">
            Status okresu: {isFutureYear ? 'Okres planowany (przyszły)' : (isPastYear ? 'Archiwalny okres bez zarejestrowanej działalności' : 'Bieżący okres przed rozpoczęciem zebrań')}
          </div>
        </div>
      ) : (
        /* ── Tabela członków ze zoptymalizowanymi kolumnami dopasowanymi w 100% do A4 ── */
        <div className="w-full max-w-full border border-slate-200 rounded-lg overflow-hidden text-[10px] flex-1 min-h-[300px] flex flex-col mb-4 print:border-none print:rounded-none print:overflow-visible box-border">
          <table className="w-full text-left border-collapse print:text-[9.5px]" style={{ tableLayout: 'fixed', width: '100%', pageBreakInside: 'auto', breakInside: 'auto' }}>
            <thead className="bg-slate-100 text-slate-700 font-medium border-b border-slate-200" style={{ display: 'table-header-group' }}>
              <tr className="hidden print:table-row bg-white border-b border-slate-300">
                <th colSpan={10} className="p-0 pb-1 text-left font-normal">
                  <div className="flex items-center justify-between text-[8px] text-slate-600 font-sans pb-1 mb-1 border-b border-slate-200">
                    <span className="font-semibold text-slate-800 uppercase tracking-tight">{orgName}</span>
                    <div className="font-mono text-slate-500">
                      Ewidencja Członków &bull; {docNumber}
                    </div>
                  </div>
                </th>
              </tr>
              <tr>
                {showLp && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.lp }}>LP.</th>}
                {showName && <th className="py-2 px-2.5 text-[10px]" style={{ width: colWidths.name }}>Imię i Nazwisko</th>}
                {showIndex && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.index }}>Nr Albumu</th>}
                {showField && <th className="py-2 px-2.5 text-[10px]" style={{ width: colWidths.field }}>Kierunek Studiów</th>}
                {showYear && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.year }}>Rok</th>}
                {showPresent && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.present }}>Obecności</th>}
                {showFreq && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.freq }}>Frekwencja</th>}
                {showPoints && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.points }}>Punkty</th>}
                {showStatus && <th className="py-2 px-2 text-center text-[10px] whitespace-nowrap" style={{ width: colWidths.status }}>Zaliczenie</th>}
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
                    {showLp && <td className="py-2 px-2 text-center text-slate-400 font-mono text-[9.5px] whitespace-nowrap align-top">{row.lp}</td>}
                    {showName && <td className="py-2 px-2.5 font-medium text-slate-900 text-[10px] align-top">{row.name}</td>}
                    {showIndex && <td className="py-2 px-2 text-center font-mono text-[9.5px] whitespace-nowrap align-top">{row.cleanIndex}</td>}
                    {showField && <td className="py-2 px-2.5 text-slate-600 text-[9.5px] align-top">{row.field}</td>}
                    {showYear && <td className="py-2 px-2 text-center text-[9.5px] whitespace-nowrap align-top">{row.yearDisplay}</td>}
                    {showPresent && (
                      <td className="py-2 px-2 text-center font-mono text-[9.5px] whitespace-nowrap align-top">
                        {row.isZeroActivity && isPastYear ? '—' : `${row.present} / ${row.memberTotalMeetings}`}
                      </td>
                    )}
                    {showFreq && (
                      <td className="py-2 px-2 text-center font-mono font-medium text-[9.5px] whitespace-nowrap align-top">
                        <span className={row.freq >= 50 ? 'text-emerald-700' : (row.isZeroActivity && isPastYear ? 'text-slate-400' : 'text-slate-600')}>
                          {row.isZeroActivity && isPastYear ? '—' : `${row.freq}%`}
                        </span>
                      </td>
                    )}
                    {showPoints && (
                      <td className="py-2 px-2 text-center font-mono font-semibold text-[9.5px] whitespace-nowrap align-top">
                        <span className={row.points > 0 ? 'text-purple-700' : 'text-slate-400'}>
                          {row.isZeroActivity && isPastYear ? '—' : `${row.points} pkt`}
                        </span>
                      </td>
                    )}
                    {showStatus && (
                      <td className="py-2 px-2 text-center align-top">
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

        <DocumentStandardFooter org={org} docDate={docDate} />
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
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
      <div className="mt-4 mb-6 text-center">
        <h2 className="text-xl font-normal text-slate-950 uppercase tracking-wide">
          WYKAZ KONFERENCJI, BADAŃ I PUBLIKACJI NAUKOWYCH
        </h2>
        <div className="mt-2 space-y-1">
          <h3 className="text-sm font-medium text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-normal text-slate-600">
            Wykaz konferencji, badań i publikacji naukowych
          </p>
        </div>
        <div className="mt-2.5 space-y-0.5 text-xs text-slate-600 font-normal">
          <p>
            Rok Akademicki {academicYear} &bull; {orgUnit}
          </p>
          <p className="text-[11px] text-slate-500">
            <span className="font-medium">Opieka naukowa:</span> {activeSupervisors.map(s => formatSupervisorName(s)).join(' • ')}
          </p>
        </div>
      </div>

      {/* Tabela projektów */}
      <div className="border border-slate-200 rounded-lg overflow-hidden text-[9.5px] flex-1 min-h-[340px] flex flex-col mb-4 print:border-none print:rounded-none print:overflow-visible">
        <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead className="bg-slate-100 text-slate-700 font-medium border-b border-slate-200" style={{ display: 'table-header-group' }}>
            <tr className="hidden print:table-row bg-white border-b border-slate-300">
              <th colSpan={10} className="p-0 pb-1 text-left font-normal">
                <div className="flex items-center justify-between text-[8px] text-slate-600 font-sans pb-1 mb-1 border-b border-slate-200">
                  <span className="font-semibold text-slate-800 uppercase tracking-tight">{orgName}</span>
                  <div className="font-mono text-slate-500">
                    Ewidencja Badań i Konferencji &bull; {docNumber}
                  </div>
                </div>
              </th>
            </tr>
            <tr>
              {showLp && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '4%' }}>LP.</th>}
              {showCategory && <th className="py-2 px-2" style={{ width: '16%' }}>Kategoria</th>}
              {showTitle && <th className="py-2 px-2.5" style={{ width: isEditing ? '27%' : '32%' }}>Tytuł Osiągnięcia / Projektu</th>}
              {showAuthors && <th className="py-2 px-2" style={{ width: '20%' }}>Autorzy / Zespół</th>}
              {showScope && <th className="py-2 px-2" style={{ width: '20%' }}>Zakres Prac</th>}
              {showPoints && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '8%' }}>Waga</th>}
              {isEditing && <th className="py-2 px-1 text-center print:hidden" style={{ width: '5%' }}>Akcja</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentActivities.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 px-6 text-center text-slate-400 italic bg-slate-50/50">
                  <div className="max-w-md mx-auto">
                    <p className="text-xs text-slate-500 italic">Brak zarejestrowanych osiągnięć w wybranym okresie.</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentActivities.map((act, i) => (
              <tr key={i} className="hover:bg-slate-50 break-inside-avoid align-top" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                {showLp && <td className="py-2.5 px-2 text-center text-slate-400 font-mono align-top">{i + 1}</td>}
                {showCategory && (
                  <td className="py-2.5 px-2 font-medium text-indigo-900 align-top">
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
                  <td className="py-2.5 px-2.5 font-medium text-slate-950 align-top">
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
                  <td className="py-2.5 px-1.5 text-center font-mono font-medium text-purple-700 align-top">
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

        <DocumentStandardFooter org={org} docDate={docDate} />
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans select-text relative">
      {/* Nagłówek */}
      <DocumentStandardHeader
        org={org}
        docLabel="Protokół"
        docNumber={docNumber}
        dateLabel="Data:"
        docDate={docDate}
      />

      {/* Tytuł z nowym standardem wizualnym (optymalny oddech i interlinia) */}
      <div className="mt-4 mb-6 text-center">
        <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">
          ZBIORCZY PROTOKÓŁ SPRAWOZDAWCZY
        </h2>
        <div className="mt-2 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-700 tracking-tight">
            Oficjalne roczne sprawozdanie z działalności akademickiej
          </p>
        </div>
        <div className="mt-2.5 space-y-0.5 text-xs text-slate-600 font-medium">
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
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Aktywni Członkowie</span>
          <span className="text-base font-bold text-slate-900 font-mono">{activeMembers.length}</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Zrealizowane Spotkania</span>
          <span className="text-base font-bold text-indigo-900 font-mono">{totalMeetings}</span>
          <span className="text-[8px] text-slate-400 block">({totalMeetings} spotkań koła)</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Średnia Frekwencja</span>
          <span className="text-base font-bold text-emerald-700 font-mono">{avgAttendancePercent}%</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <span className="text-[9px] uppercase font-bold text-slate-500 block">Spełniają Kryteria</span>
          <span className="text-base font-bold text-purple-700 font-mono">{passingMembers.length}</span>
        </div>
      </div>

      {/* Dynamiczne Pole Opiekunów */}
      <div className="mb-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 text-xs print:bg-transparent print:border-slate-300 print:rounded-none">
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
        <div className="border border-slate-200 rounded-lg overflow-hidden text-[10.5px] print:border-none print:rounded-none print:overflow-visible">
          <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200" style={{ display: 'table-header-group' }}>
              <tr>
                {showLp && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '4%' }}>LP.</th>}
                {showName && <th className="py-2 px-2.5" style={{ width: '24%' }}>Imię i Nazwisko</th>}
                {showIndex && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '12%' }}>Nr Indeksu</th>}
                {showField && <th className="py-2 px-2.5" style={{ width: '23%' }}>Kierunek</th>}
                {showPresent && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '10%' }}>Obecności</th>}
                {showFreq && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '9%' }}>Frekwencja</th>}
                {showPoints && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '8%' }}>Punkty</th>}
                {showStatus && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '10%' }}>Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeMembers.slice(0, 10).map((m, i) => (
                <tr key={i} className="hover:bg-slate-50 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  {showLp && <td className="py-2 px-2 text-center text-slate-400 font-mono align-top">{i + 1}</td>}
                  {showName && <td className="py-2 px-2.5 font-medium text-slate-900 align-top">{m.fullName || m.name}</td>}
                  {showIndex && <td className="py-2 px-2 text-center font-mono whitespace-nowrap align-top">{m.index}</td>}
                  {showField && <td className="py-2 px-2.5 text-slate-600 align-top">{m.field || 'Psychologia'}</td>}
                  {showPresent && <td className="py-2 px-2 text-center font-mono whitespace-nowrap align-top">{m.present || totalMeetings}/{totalMeetings}</td>}
                  {showFreq && <td className="py-2 px-2 text-center font-mono font-bold text-emerald-700 whitespace-nowrap align-top">{m.attendancePercent || 100}%</td>}
                  {showPoints && <td className="py-2 px-2 text-center font-mono text-purple-700 font-semibold whitespace-nowrap align-top">{m.points || 0}</td>}
                  {showStatus && (
                    <td className="py-2 px-2 text-center whitespace-nowrap align-top">
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

        <DocumentStandardFooter org={org} docDate={docDate} />
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
  docDate = new Date(),
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-800 font-sans mx-auto select-text relative">
      {/* Header */}
      <DocumentStandardHeader
        org={org}
        docLabel="Protokół"
        docNumber={academicYear}
        dateLabel="Wydano:"
        docDate={docDate}
      />

      {/* Title */}
      <div className="text-center mt-4 mb-6">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
          OFICJALNY PROTOKÓŁ ZBIORCZY EWIDENCJI WYDANYCH DOKUMENTÓW
        </h2>
        <div className="mt-2 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-600 tracking-tight">
            Rejestr Zaświadczeń, Dyplomów i Aktów Koła Naukowego w roku akademickim {academicYear}
          </p>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="metric-box-container grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 my-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center box-border print:border-none print:p-0 print:bg-transparent">
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Wszystkie Akty</p>
          <p className="text-base font-black text-slate-900 font-mono">{totalCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Zaświadczenia Członków</p>
          <p className="text-base font-black text-emerald-700 font-mono">{memberCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-amber-600 uppercase">Dyplomy Prelegentów</p>
          <p className="text-base font-black text-amber-700 font-mono">{speakerCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-indigo-600 uppercase">Zaświadczenia Zarządu</p>
          <p className="text-base font-black text-indigo-700 font-mono">{boardCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 print:border-none print:rounded-none print:overflow-visible">
        <table className="w-full text-[10.5px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr className="bg-slate-900 text-white font-bold text-left">
              {showLp && <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '4%' }}>Lp.</th>}
              {showId && <th className="py-2 px-2.5" style={{ width: '20%' }}>Nr Aktu / Sygnatura</th>}
              {showType && <th className="py-2 px-2.5" style={{ width: '17%' }}>Typ Dokumentu</th>}
              {showRecipient && <th className="py-2 px-2.5" style={{ width: '20%' }}>Odbiorca (Nr Albumu)</th>}
              {showIssueDate && <th className="py-2 px-2.5 text-center whitespace-nowrap" style={{ width: '11%' }}>Data Wydania</th>}
              {showDetails && <th className="py-2 px-2.5" style={{ width: '18%' }}>Przedmiot / Temat / Rola</th>}
              {showStatus && <th className="py-2 px-2.5 text-center whitespace-nowrap" style={{ width: '10%' }}>Status</th>}
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

        <DocumentStandardFooter org={org} docDate={new Date()} />
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
    <div className="w-full flex-1 flex flex-col justify-between bg-white text-slate-800 font-sans mx-auto select-text relative">
      {/* Header */}
      <DocumentStandardHeader
        org={org}
        docLabel="Dziennik Podawczy"
        docNumber={academicYear}
        dateLabel="Stan na:"
        docDate={new Date()}
      />

      {/* Title */}
      <div className="text-center mt-4 mb-6">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
          ELEKTRONICZNY DZIENNIK PODAWCZY
        </h2>
        <div className="mt-2 space-y-1">
          <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
            {formatOrgFullName(orgName)}
          </h3>
          <p className="text-xs font-semibold text-slate-600 tracking-tight">
            Rejestr pism przychodzących i wychodzących kancelarii w roku akademickim {academicYear}
          </p>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="metric-box-container grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-2.5 sm:gap-3 my-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center box-border print:border-none print:p-0 print:bg-transparent">
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Wszystkie Pisma</p>
          <p className="text-base font-black text-slate-900 font-mono">{totalCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Przychodzące (IN)</p>
          <p className="text-base font-black text-emerald-700 font-mono">{inCount}</p>
        </div>
        <div className="p-2 bg-white rounded-lg border border-slate-200 print:bg-transparent print:border-slate-300 print:rounded-none">
          <p className="text-[10px] font-bold text-sky-600 uppercase">Wychodzące (OUT)</p>
          <p className="text-base font-black text-sky-700 font-mono">{outCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 print:border-none print:rounded-none print:overflow-visible">
        <table className="w-full text-[10px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr className="bg-slate-900 text-white font-bold text-left">
              <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '4%' }}>Lp.</th>
              <th className="py-2 px-2" style={{ width: '18%' }}>Sygnatura</th>
              <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '10%' }}>Data</th>
              <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '9%' }}>Kierunek</th>
              <th className="py-2 px-2" style={{ width: '22%' }}>Nadawca / Odbiorca</th>
              <th className="py-2 px-2" style={{ width: '27%' }}>Temat & Przedmiot Pisma</th>
              <th className="py-2 px-2 text-center whitespace-nowrap" style={{ width: '10%' }}>Status</th>
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

        <DocumentStandardFooter org={org} docDate={new Date()} />
      </div>
    </div>
  );
}

/**
 * Zwraca poprawną polską odmianę liczebnika dla liczby osób/uczestników:
 * - nominative: '1 osoba zweryfikowana', '2/3/4/52 osoby zweryfikowane', '0/5/12/50 osób zweryfikowanych'
 * - genitive: '1 osoby', '52 osób' (np. "z udziałem 52 osób")
 * - simple: '1 osoba', '2/3/4/52 osoby', '0/5/12/50 osób'
 */
export function formatPolishAttendeeCount(count, variant = 'nominative') {
  const n = Math.abs(parseInt(count, 10)) || 0;
  if (variant === 'genitive') {
    return n === 1 ? '1 osoby' : `${n} osób`;
  }
  const mod10 = n % 10;
  const mod100 = n % 100;
  const isFew = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);

  if (variant === 'simple') {
    if (n === 1) return '1 osoba';
    if (isFew) return `${n} osoby`;
    return `${n} osób`;
  }

  if (n === 1) return '1 osoba zweryfikowana';
  if (isFew) return `${n} osoby zweryfikowane`;
  return `${n} osób zweryfikowanych`;
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
  // Zawsze priorytetyzuj aktualne dane wpisane w formularzu protokołu modala
  const cleanMeetingTitle = String(protocolData?.title || meeting?.title || 'Spotkanie Naukowe Koła').replace(/[\[\]]/g, '').trim();
  const cleanSpeaker = String(protocolData?.speaker || meeting?.who || 'Zarząd Koła Naukowego').replace(/[\[\]]/g, '').trim();
  const rawAttendees = protocolData?.attendees || meeting?.attendanceList || meeting?.attendees || [];
  const attendanceList = Array.isArray(rawAttendees) ? rawAttendees : [];
  const shouldShowAppendix = protocolData?.includeAttendeesList ?? (attendanceList.length > 0);

  // Spójna liczba uczestników (z formularza lub fallback z listy obecności)
  const effectiveAttendeesCount = (protocolData?.attendeesCount !== undefined && protocolData?.attendeesCount !== null && String(protocolData.attendeesCount).trim() !== '')
    ? Number(protocolData.attendeesCount)
    : (attendanceList.length || meeting?.attendeesCount || 0);

  return (
    <div id="printable-protocol-document" className="print-document w-full flex-1 flex flex-col justify-between bg-white text-slate-900 font-sans text-xs leading-relaxed select-text relative">
      
      {/* SEKCJA 1: STRONA PROTOKOŁU (Karta Merytoryczna) */}
      <section className="protocol-main-page flex-1 w-full relative flex flex-col justify-between break-after-page print:p-0">
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
          <div className="text-center mt-4 mb-6">
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
              PROTOKÓŁ ZE SPOTKANIA NAUKOWEGO
            </h2>
            <div className="mt-2 space-y-1">
              <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
                {formatOrgFullName(orgName)}
              </h3>
              <p className="text-xs font-semibold text-slate-700 tracking-tight">
                Spotkanie {cleanCode} &bull; Rok Akademicki {cleanYear}
              </p>
            </div>
          </div>

          {/* Meeting Metadata Table */}
          <div
            className="protocol-metadata-table mb-6 border border-slate-300 rounded-xl overflow-hidden shadow-2xs print:border-none print:shadow-none print:rounded-none"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
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
                    {formatPolishAttendeeCount(effectiveAttendeesCount, 'nominative')}
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
          <div
            className="protocol-section-block mb-5 space-y-1.5"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <h3
              className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              1. Cel spotkania i porządek obrad
            </h3>
            <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-200/80 whitespace-pre-line text-slate-800 leading-relaxed font-sans text-[11px]">
              {protocolData.agenda || '1. Otwarcie spotkania przez Przewodniczącego Koła.\n2. Wystąpienie prelegenta i prezentacja referatu naukowego.\n3. Dyskusja naukowa, sesja pytań i odpowiedzi (Q&A).\n4. Wolne wnioski, sprawy organizacyjne i zamknięcie posiedzenia.'}
            </div>
          </div>

          {/* Section 2: Przebieg Spotkania */}
          <div
            className="protocol-section-block mb-5 space-y-1.5"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <h3
              className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              2. Przebieg posiedzenia, streszczenie prelekcji i dyskusja
            </h3>
            <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-200/80 whitespace-pre-line text-slate-800 leading-relaxed font-sans text-[11px]">
              {protocolData.content || 'W trakcie posiedzenia prelegent przedstawił prezentację merytoryczną. Członkowie koła aktywnie uczestniczyli w dyskusji nad zaprezentowaną tematyką badawczą, poruszając kluczowe aspekty metodologiczne i praktyczne.'}
            </div>
          </div>

          {/* Section 3: Ustalenia i Wnioski */}
          <div
            className="protocol-section-block mb-6 space-y-1.5"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <h3
              className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              3. Ustalenia końcowe, zadania i wnioski
            </h3>
            <div className="p-3 bg-slate-50/60 rounded-lg border border-slate-200/80 whitespace-pre-line text-slate-800 leading-relaxed font-sans text-[11px]">
              {protocolData.conclusions || `1. Przyjęto sprawozdanie z przeprowadzonego referatu naukowego do ewidencji działalności koła.\n2. Zweryfikowano i zatwierdzono listę obecności z udziałem ${formatPolishAttendeeCount(effectiveAttendeesCount, 'genitive')}.\n3. Ustalono termin kolejnego spotkania seminaryjnego i zobowiązano członków do przygotowania materiałów.`}
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
            <div className="flex flex-col items-center" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <div className="h-10 border-b border-dashed border-slate-300 w-full mb-1"></div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">[Podpis elektroniczny]</span>
              <span className="text-xs font-semibold text-slate-800">{protocolData.recorder || 'Protokolant Zarządu Koła'}</span>
              <span className="text-[10px] text-slate-500">{orgShortName}</span>
            </div>

            {/* 2. Dynamiczne podpisy Opiekunów Naukowych */}
            {activeSupervisors.map((sup, idx) => (
              <div key={idx} className="flex flex-col items-center" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
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

        <DocumentStandardFooter org={org} docDate={protocolData.date || meeting?.formattedDate || meeting?.date || new Date()} />
      </section>

      {/* SEKCJA 2: ZAŁĄCZNIK - LISTA OBECNOŚCI (Startuje na czystej stronie) */}
      {shouldShowAppendix && attendanceList.length > 0 && (
        <section
          className="protocol-appendix-page min-h-[297mm] p-8 sm:p-12 break-before-page print:p-0 print:min-h-0"
          style={{ breakBefore: 'page', pageBreakBefore: 'always' }}
        >
          {/* Zwięzły nagłówek załącznika (jedno-linijkowy) */}
          <div className="border-b-2 border-slate-800 pb-2 mb-4 flex justify-between items-end" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            <div>
              <h3 className="text-sm font-bold tracking-wider text-slate-800 uppercase">
                Załącznik nr 1 do Protokołu {cleanCode}
              </h3>
              <p className="text-xs text-slate-500">Imienna lista zweryfikowanych uczestników spotkania</p>
            </div>
            <span className="text-xs font-bold text-slate-700">
              Liczba obecnych: {formatPolishAttendeeCount(attendanceList.length, 'nominative')}
            </span>
          </div>

          {/* Tabela / Siatka obecności w naturalnym przepływie (2 kolumny) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] leading-tight">
            {attendanceList.map((person, idx) => (
              <div
                key={idx}
                className="flex justify-between border-b border-slate-100 py-0.5 leading-tight text-[11px]"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
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

export { default as InterClubSummaryTemplate } from './InterClubSummaryTemplate';




