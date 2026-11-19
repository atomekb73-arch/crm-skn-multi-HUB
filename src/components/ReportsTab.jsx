import React, { useState, useMemo, useEffect, useRef, useTransition, useDeferredValue, useCallback } from 'react';
import { showToast } from '../utils/toast';
import {
  FileText,
  Award,
  Building2,
  Calendar,
  Users,
  Search,
  Printer,
  Copy,
  Check,
  CheckSquare,
  Square,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  Filter,
  Layers,
  BookOpen,
  Microscope,
  GraduationCap,
  ClipboardList,
  ShieldCheck,
  UserCheck,
  Edit3,
  Save,
  Plus,
  Trash2,
  X,
  CalendarPlus,
  Clock,
  User,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  MembershipCertificateTemplate,
  SpeakerDiplomaTemplate,
  BoardCertificateTemplate,
  MeetingsSummaryTableTemplate,
  MembersRegistryTemplate,
  ResearchConferencesRegistryTemplate,
  AnnualReportProtocolTemplate,
  OfficialRegistryProtocolTemplate,
  InterClubSummaryTemplate,
  generateDocumentNumber,
  formatPolishDate,
  getMeetingAttendeesCount,
  getOrgMetadata,
} from './DocumentTemplates';
import OfficialWskzDocumentA4, { OfficialWskzDocumentSheet } from './OfficialWskzDocumentA4';
import { exportMultipleSheetsToXlsx } from '../utils/exportToExcel';
import { WSKZ_ORGANIZATIONS, getWskzOrgById } from '../config/wskzRegistry';
import { fetchInterClubReportData } from '../services/interClubReportService';
import DocumentCustomizer, { DEFAULT_TABLE_COLUMNS } from './DocumentCustomizer';
import { useSettings } from '../context/SettingsContext';
import { useOrg } from '../context/OrgContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import {
  getAcademicScope,
  isMeetingInAcademicScope,
  isEwidencjaInAcademicScope,
  getAcademicYearTimeStatus,
  getMemberAcademicStatus,
  getCurrentAcademicYear,
  getInterClubDefaultDateRange,
} from '../utils/academicScope';
import { getStoredSupervisors } from '../utils/specialRoles';
import { getOfficialMemberRecord, getMemberStats } from '../utils/activityRegistry';
import { CANONICAL_MEETINGS_2025_2026, filterLegitimateMeetings, getCanonicalMeetingsForOrg } from '../utils/canonicalMeetings';
import { getMeetingType, calculateMemberStats, calculateMemberYearStats, isMeetingEligibleForDenominator } from '../utils/meetingTypes';
import { deduplicateBoard } from '../services/settingsService';
import {
  getIssuedDocumentsRegistry,
  addIssuedDocument,
  updateIssuedDocument,
  deleteIssuedDocument,
} from '../utils/storage';

const BOARD_ROLES = [
  { id: 'chairman_m', label: 'Przewodniczący Koła Naukowego Seksuologii', icon: '' },
  { id: 'chairman_f', label: 'Przewodnicząca Koła Naukowego Seksuologii', icon: '' },
  { id: 'vice_chairman_m', label: 'Wiceprzewodniczący Koła Naukowego Seksuologii', icon: '' },
  { id: 'vice_chairman_f', label: 'Wiceprzewodnicząca Koła Naukowego Seksuologii', icon: '' },
  { id: 'secretary', label: 'Sekretarz Koła Naukowego Seksuologii', icon: '' },
  { id: 'coordinator', label: 'Koordynator ds. Naukowych i Badań', icon: '' },
  { id: 'board_member_m', label: 'Członek Zarządu Koła Naukowego Seksuologii', icon: '' },
  { id: 'board_member_f', label: 'Członkini Zarządu Koła Naukowego Seksuologii', icon: '' }
];

const DOCUMENT_CATEGORIES = [
  {
    id: 'membership',
    title: 'Zaświadczenie Członka',
    subtitle: 'Aktywność & Frekwencja',
    icon: FileText,
    badge: 'Dla studenta',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Oficjalne potwierdzenie członkostwa w Kole Naukowym, frekwencji i punktów aktywności.',
  },
  {
    id: 'speaker',
    title: 'Dyplom Prelegenta',
    subtitle: 'Journal Club & Referat',
    icon: Award,
    badge: 'Prelekcja',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Certyfikat za wygłoszenie referatu naukowego lub warsztatu na zebraniu Koła.',
  },
  {
    id: 'board',
    title: 'Zaświadczenie Zarządu',
    subtitle: 'Funkcja w Zarządzie',
    icon: Building2,
    badge: 'Zarząd Koła',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Zaświadczenie o pełnieniu funkcji (Przewodniczący, Sekretarz itp.) i kierowaniu pracami Koła.',
  },
  {
    id: 'meetings_summary',
    title: 'Tabela Zbiorcza Spotkań',
    subtitle: 'Dla Dziekanatu & PKA',
    icon: Calendar,
    badge: 'Sprawozdanie WSKZ',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Ustandaryzowana 6-kolumnowa tabela zrealizowanych spotkań z datami, tematami i liczbą uczestników.',
  },
  {
    id: 'members_registry',
    title: 'Ewidencja Członków',
    subtitle: 'Wykaz członków',
    icon: Users,
    badge: 'Ewidencja Koła',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Oficjalna ewidencja wszystkich aktywnych członków z kierunkiem, rokiem i oceną zaliczenia.',
  },
  {
    id: 'research_conferences',
    title: 'Wystąpienia & Badania',
    subtitle: 'Dorobek Naukowy',
    icon: Microscope,
    badge: 'Konferencje',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Zestawienie wystąpień konferencyjnych, publikacji, badań ankietowych i materiałów edukacyjnych.',
  },
  {
    id: 'inter_club_summary',
    title: 'Zestawienie Aktywności Kół',
    subtitle: 'Dla Władz Uczelni (14 Kół)',
    icon: Building2,
    badge: 'Dla Władz Uczelni',
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description: 'Międzykołowe zestawienie spotkań merytorycznych i projektowych dla Władz Uczelni z deduplikacją i frekwencją z gośćmi.',
  },
];

export default function ReportsTab({
  members = [],
  meetings = [],
  academicYear: propAcademicYear,
  initialMember = null,
  initialDocType = 'membership',
}) {
  const { currentOrg, getStorageKey } = useOrg();
  const isSknSeks = currentOrg?.id === 'skn_seksuologii';
  const academicYearCtx = useAcademicYear();
  const academicYear = propAcademicYear || academicYearCtx?.academicYear;
  const setAcademicYear = academicYearCtx?.setAcademicYear || (() => {});
  const academicYearOptions = academicYearCtx?.academicYearOptions || [];
  const currentScope = academicYearCtx?.currentScope;

  const [isPending, startTransition] = useTransition();
  const [selectedDocType, setSelectedDocType] = useState(initialDocType || 'membership');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const autocompleteRef = useRef(null);

  // Inline Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [interClubEdits, setInterClubEdits] = useState({});
  const handleInterClubEditCell = useCallback((key, value) => {
    setInterClubEdits(prev => ({ ...prev, [key]: value }));
  }, []);
  const [saveToast, setSaveToast] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Column Visibility Customization State
  const [columnVisibility, setColumnVisibility] = useState({});

  const handleColumnVisibilityChange = (colKey, isVisible) => {
    setColumnVisibility(prev => ({ ...prev, [colKey]: isVisible }));
  };

  const handleResetColumns = () => {
    setColumnVisibility({});
  };

  // Add Meeting Modal State
  const [isAddMeetingModalOpen, setIsAddMeetingModalOpen] = useState(false);
  const [newMeetingMode, setNewMeetingMode] = useState('teamup'); // 'teamup' | 'manual'
  const [newMeetingForm, setNewMeetingForm] = useState({
    date: '2026-10-15',
    type: 'Wykład Merytoryczny',
    title: 'Spotkanie naukowe Koła Psychoonkologii',
    speaker: 'Zarząd Koła',
    attendeesCount: 0,
  });

  // Specific form states
  const [presentationTopic, setPresentationTopic] = useState('Wprowadzenie do psychoonkologii klinicznej i form wsparcia pacjentów');
  const [presentationDate, setPresentationDate] = useState('2026-10-15');
  const [boardRole, setBoardRole] = useState(
    currentOrg?.name ? `Przewodniczący ${currentOrg.name}` : 'Przewodniczący Koła Naukowego'
  );
  const [termDates, setTermDates] = useState('1 października 2026 r. – 30 września 2027 r.');

  useEffect(() => {
    if (currentOrg?.name) {
      setBoardRole(`Przewodniczący ${currentOrg.name}`);
    }
  }, [currentOrg?.name]);

  // Stan oficjalnego modala A4 (Portal)
  const [isA4ModalOpen, setIsA4ModalOpen] = useState(false);

  // Oficjalna data wystawienia dokumentów A4 (domyślnie bieżąca data systemowa)
  const [docDate, setDocDate] = useState(() => new Date());

  // Stan dla Generatora Zestawień Międzykołowych dla Władz Uczelni (Ścisła izolacja do aktywnego koła)
  const [interClubStartDate, setInterClubStartDate] = useState(() => {
    return getInterClubDefaultDateRange(academicYear).startDate;
  });
  const [interClubEndDate, setInterClubEndDate] = useState(() => {
    return getInterClubDefaultDateRange(academicYear).endDate;
  });
  const activeInterClubOrgId = useMemo(() => {
    return (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
  }, [currentOrg?.id]);

  const [selectedInterClubOrgIds, setSelectedInterClubOrgIds] = useState(() => [
    (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii'
  ]);
  const [interClubData, setInterClubData] = useState(null);
  const [isLoadingInterClub, setIsLoadingInterClub] = useState(false);

  // Synchronizacja wybranego koła przy zmianie aktywnej organizacji
  useEffect(() => {
    setSelectedInterClubOrgIds([activeInterClubOrgId]);
  }, [activeInterClubOrgId]);

  const selectedInterClubOrgs = useMemo(() => {
    return WSKZ_ORGANIZATIONS.filter(o => o.orgId === activeInterClubOrgId);
  }, [activeInterClubOrgId]);

  // Pomocnik weryfikujący poprawny format daty i realistyczny zakres lat (zapobiega zapytaniom do API dla lat 0001, 0002 przy pisaniu z klawiatury)
  const isValidReportDate = (dStr) => {
    if (!dStr || typeof dStr !== 'string' || dStr.length !== 10) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return false;
    const yr = parseInt(dStr.slice(0, 4), 10);
    return yr >= 2020 && yr <= 2035;
  };

  const handleFetchInterClubReport = useCallback(async (customStart = null, customEnd = null) => {
    // Zabezpieczenie przed przekazaniem obiektu zdarzenia e (onClick) jako customStart
    const validStart = typeof customStart === 'string' && isValidReportDate(customStart) ? customStart : null;
    const validEnd = typeof customEnd === 'string' && isValidReportDate(customEnd) ? customEnd : null;
    const sDate = validStart || (isValidReportDate(interClubStartDate) ? interClubStartDate : '2026-10-01');
    const eDate = validEnd || (isValidReportDate(interClubEndDate) ? interClubEndDate : new Date().toISOString().slice(0, 10));
    if (!sDate || !eDate) return;

    setIsLoadingInterClub(true);
    try {
      const result = await fetchInterClubReportData({
        startDate: sDate,
        endDate: eDate,
        selectedOrgIds: [activeInterClubOrgId],
      });
      setInterClubData(result);
    } catch (err) {
      console.error('Błąd pobierania raportu międzykołowego:', err);
      showToast('Wystąpił błąd podczas generowania zestawienia', 'error');
    } finally {
      setIsLoadingInterClub(false);
    }
  }, [interClubStartDate, interClubEndDate, activeInterClubOrgId]);

  // Automatyczne ustawienie domyślnego zakresu dat przy zmianie roku akademickiego
  const prevAcademicYearRef = useRef(academicYear);
  useEffect(() => {
    if (prevAcademicYearRef.current !== academicYear) {
      prevAcademicYearRef.current = academicYear;
      const { startDate: defStart, endDate: defEnd } = getInterClubDefaultDateRange(academicYear);
      setInterClubStartDate(defStart);
      setInterClubEndDate(defEnd);
      if (selectedDocType === 'inter_club_summary') {
        handleFetchInterClubReport(defStart, defEnd);
      }
    }
  }, [academicYear, selectedDocType, handleFetchInterClubReport]);

  // Automatyczne odświeżenie przy zmianie organizacji
  const prevOrgIdRef = useRef(activeInterClubOrgId);
  useEffect(() => {
    if (prevOrgIdRef.current !== activeInterClubOrgId) {
      prevOrgIdRef.current = activeInterClubOrgId;
      if (selectedDocType === 'inter_club_summary') {
        handleFetchInterClubReport();
      }
    }
  }, [activeInterClubOrgId, selectedDocType, handleFetchInterClubReport]);

  // Pobranie danych przy pierwszym wejściu w widok zestawienia
  useEffect(() => {
    if (selectedDocType === 'inter_club_summary' && !interClubData && !isLoadingInterClub) {
      handleFetchInterClubReport();
    }
  }, [selectedDocType, interClubData, isLoadingInterClub, handleFetchInterClubReport]);

  // Ręczna zmiana dat przez użytkownika (input date z walidacją roku >= 2020)
  const handleStartDateChange = (val) => {
    setInterClubStartDate(val);
    if (isValidReportDate(val)) {
      const effectiveEnd = isValidReportDate(interClubEndDate) && interClubEndDate >= val ? interClubEndDate : val;
      if (effectiveEnd !== interClubEndDate) {
        setInterClubEndDate(effectiveEnd);
      }
      handleFetchInterClubReport(val, effectiveEnd);
    }
  };

  const handleEndDateChange = (val) => {
    setInterClubEndDate(val);
    if (isValidReportDate(val)) {
      const effectiveStart = isValidReportDate(interClubStartDate) && interClubStartDate <= val ? interClubStartDate : val;
      if (effectiveStart !== interClubStartDate) {
        setInterClubStartDate(effectiveStart);
      }
      handleFetchInterClubReport(effectiveStart, val);
    }
  };

  // Szybki wybór okresu (presety)
  const handleDatePreset = (presetStart, presetEnd) => {
    setInterClubStartDate(presetStart);
    setInterClubEndDate(presetEnd);
    handleFetchInterClubReport(presetStart, presetEnd);
  };

  const matchYr = useMemo(() => String(academicYear || '').match(/(\d{4})\/(\d{4})/), [academicYear]);
  const curAcademicStartYear = matchYr ? parseInt(matchYr[1], 10) : 2026;
  const curAcademicEndYear = matchYr ? parseInt(matchYr[2], 10) : curAcademicStartYear + 1;
  const shortYearLabel = `${String(curAcademicStartYear).slice(2)}/${String(curAcademicEndYear).slice(2)}`;
  const curSysAcademicYear = useMemo(() => getCurrentAcademicYear(), []);
  const isSelectedYearCurrent = (academicYear || curSysAcademicYear) === curSysAcademicYear;
  const defRangeForSelectedYear = useMemo(() => getInterClubDefaultDateRange(academicYear), [academicYear]);

  const handleToggleInterClubOrg = (_orgId) => {
    setSelectedInterClubOrgIds([activeInterClubOrgId]);
  };

  const handleSelectAllInterClubOrgs = () => {
    setSelectedInterClubOrgIds([activeInterClubOrgId]);
  };

  const handleSelectActiveCrmInterClubOrgs = () => {
    setSelectedInterClubOrgIds([activeInterClubOrgId]);
  };

  const handleClearInterClubOrgs = () => {
    setSelectedInterClubOrgIds([activeInterClubOrgId]);
  };

  const handleExportInterClubToExcel = async () => {
    if (!interClubData) return;
    try {
      const substantiveRows = (interClubData.substantiveMeetings || []).map((m, idx) => ({
        'Lp.': idx + 1,
        'Data': m.date,
        'Koło wiodące': m.primaryOrg?.name || '',
        'Współorganizatorzy': (m.coOrgs || []).map(co => co.shortName || co.name).join(', ') || 'Brak',
        'Temat / Tytuł spotkania': m.title,
        'Prelegent / Prowadzący': m.speaker,
        'Łączna frekwencja (z gośćmi)': m.totalParticipants || 0,
      }));

      const projectRows = (interClubData.projectMeetings || []).map((m, idx) => ({
        'Lp.': idx + 1,
        'Data': m.date,
        'Koło naukowe': m.primaryOrg?.name || '',
        'Współorganizatorzy': (m.coOrgs || []).map(co => co.shortName || co.name).join(', ') || 'Brak',
        'Temat / Cel prac projektowych': m.title,
        'Koordynator / Prowadzący': m.speaker,
        'Frekwencja': m.totalParticipants || 0,
      }));

      const summaryRows = (interClubData.byOrgStats || []).map(item => ({
        'Lp.': item.lp,
        'Kod': item.org.code || item.org.number,
        'Nazwa Koła Naukowego': item.org.name,
        'Spotkania merytoryczne (liczba)': item.substantiveCount,
        'Łączna frekwencja merytoryczna': item.substantiveAttendees,
        'Średnia frekwencja': item.substantiveCount > 0 ? Math.round(item.substantiveAttendees / item.substantiveCount) : 0,
        'Prace projektowe i techniczne': item.projectCount,
        'Wydarzenia współorganizowane': item.jointCount,
        'Suma wszystkich aktywności': item.totalActivities,
      }));

      await exportMultipleSheetsToXlsx({
        'Spotkania Merytoryczne': substantiveRows,
        'Spotkania Projektowe': projectRows,
        'Zbiorcze Zestawienie Kół': summaryRows,
      }, `Zestawienie_Kol_WSKZ_${interClubStartDate}_${interClubEndDate}`);

      showToast('Pomyślnie wyeksportowano zestawienie do Excela (.xlsx)', 'success');
    } catch (e) {
      console.error('Błąd eksportu Excel:', e);
      showToast('Błąd eksportu do pliku Excel', 'error');
    }
  };

  // Custom Editable fields
  const [membershipCustomText, setMembershipCustomText] = useState(null);
  const [boardCustomDuties, setBoardCustomDuties] = useState(null);
  const scope = useMemo(() => {
    return currentScope || getAcademicScope(academicYear);
  }, [currentScope, academicYear]);

  // Active organization meetings strictly scoped to the active academic year
  const orgMeetings = useMemo(() => {
    const allOrgMeetings = (meetings && meetings.length > 0)
      ? filterLegitimateMeetings(meetings, currentOrg?.id)
      : getCanonicalMeetingsForOrg(currentOrg?.id);

    return allOrgMeetings.filter(m => isMeetingInAcademicScope(m, scope));
  }, [meetings, currentOrg?.id, scope]);

  // Tylko zrealizowane spotkania w tym roku akademickim (z faktycznie zarejestrowaną frekwencją)
  const completedOrgMeetings = useMemo(() => {
    return orgMeetings.filter(m => getMeetingAttendeesCount(m, currentOrg?.id) > 0);
  }, [orgMeetings, currentOrg?.id]);

  const [customMeetingsList, setCustomMeetingsList] = useState(completedOrgMeetings);
  const meetingsSyncKeyRef = useRef('');

  // Sync customMeetingsList whenever active organization or its meetings change (bez pętli renderowania)
  useEffect(() => {
    const syncKey = `${currentOrg?.id || ''}__${academicYear || ''}__${(completedOrgMeetings || []).map(m => m.id || m.code).join(',')}`;
    if (meetingsSyncKeyRef.current !== syncKey) {
      meetingsSyncKeyRef.current = syncKey;
      setCustomMeetingsList(completedOrgMeetings);
      if (completedOrgMeetings && completedOrgMeetings.length > 0) {
        const defaultMeeting = completedOrgMeetings.find(m => m.code === 'M02' || m.id === 'M02') || completedOrgMeetings[0];
        if (defaultMeeting) {
          setPresentationTopic(prev => prev || defaultMeeting.title || '');
          setPresentationDate(prev => prev || defaultMeeting.date || defaultMeeting.dateFormatted || '');
        }
      }
    }
  }, [currentOrg?.id, academicYear, completedOrgMeetings]);

  // Clean legitimate meetings list (filtered from technical entries)
  const legitimateMeetings = useMemo(() => {
    return filterLegitimateMeetings(customMeetingsList.length > 0 ? customMeetingsList : orgMeetings, currentOrg?.id);
  }, [customMeetingsList, orgMeetings, currentOrg?.id]);

  // Weryfikacja czy dla wybranego roku istnieją jakiekolwiek zrealizowane spotkania lub logi obecności
  const hasDataForYear = useMemo(() => {
    if (completedOrgMeetings.length > 0) return true;
    let raw = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const ewKey = getStorageKey ? getStorageKey('crm_ewidencja') : 'crm_ewidencja';
        const s = localStorage.getItem(ewKey);
        if (s) raw = JSON.parse(s);
      } catch {}
    }
    const scopedE = (Array.isArray(raw) ? raw : []).filter(e => isEwidencjaInAcademicScope(e, scope, orgMeetings));
    return scopedE.length > 0;
  }, [completedOrgMeetings, scope, orgMeetings, currentOrg?.id, getStorageKey]);
  const [customResearchActivities, setCustomResearchActivities] = useState(() => []);

  // ── Issued Documents Registry State (Ewidencja Wydanych Aktów) ───────────
  const [issuedRegistry, setIssuedRegistry] = useState(() => getIssuedDocumentsRegistry(currentOrg?.id || 'skn-psychoonkologia'));
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [registrySearchQuery, setRegistrySearchQuery] = useState('');
  const [registryTypeFilter, setRegistryTypeFilter] = useState('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isPrintingProtocol, setIsPrintingProtocol] = useState(false);

  const isMultiPageDoc = useMemo(() => {
    if (isPrintingProtocol) return true;
    return selectedDocType !== 'membership' && selectedDocType !== 'speaker' && selectedDocType !== 'board';
  }, [isPrintingProtocol, selectedDocType]);
  const [manualForm, setManualForm] = useState({
    id: '',
    type: 'Zaświadczenie Członka',
    recipientName: '',
    recipientIndex: '',
    issueDate: new Date().toISOString().slice(0, 10),
    academicYear: academicYear || academicYearCtx?.currentAcademicYear || '2026/2027',
    details: '',
    status: 'Wydany / Podpisany',
  });

  useEffect(() => {
    if (currentOrg?.id) {
      setIssuedRegistry(getIssuedDocumentsRegistry(currentOrg.id));
    }
  }, [currentOrg?.id]);

  const filteredRegistry = useMemo(() => {
    return issuedRegistry.filter(entry => {
      if (!entry) return false;
      const matchesType = registryTypeFilter === 'all' || entry.type === registryTypeFilter;
      if (!matchesType) return false;

      if (!registrySearchQuery.trim()) return true;
      const q = registrySearchQuery.trim().toLowerCase();
      const idMatch = String(entry.id || '').toLowerCase().includes(q);
      const nameMatch = String(entry.recipientName || '').toLowerCase().includes(q);
      const indexMatch = String(entry.recipientIndex || '').toLowerCase().includes(q);
      const detailsMatch = String(entry.details || '').toLowerCase().includes(q);

      return idMatch || nameMatch || indexMatch || detailsMatch;
    });
  }, [issuedRegistry, registryTypeFilter, registrySearchQuery]);

  const handleOpenManualModal = (entryToEdit = null) => {
    if (entryToEdit) {
      setEditingEntry(entryToEdit);
      setManualForm({
        id: entryToEdit.id,
        type: entryToEdit.type || 'Zaświadczenie Członka',
        recipientName: entryToEdit.recipientName || '',
        recipientIndex: entryToEdit.recipientIndex || '',
        issueDate: entryToEdit.issueDate || new Date().toISOString().slice(0, 10),
        academicYear: entryToEdit.academicYear || academicYear,
        details: entryToEdit.details || '',
        status: entryToEdit.status || 'Wydany / Podpisany',
      });
    } else {
      setEditingEntry(null);
      const tag = currentOrg?.id === 'sknu' ? 'SKNU' : (currentOrg?.tag || 'SKN-SEKS');
      const generatedId = `${tag}/25-26/${String(Math.floor(10000 + Math.random() * 90000))}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
      setManualForm({
        id: generatedId,
        type: 'Zaświadczenie Członka',
        recipientName: '',
        recipientIndex: '',
        issueDate: new Date().toISOString().slice(0, 10),
        academicYear: academicYear || academicYearCtx?.currentAcademicYear || '2026/2027',
        details: '',
        status: 'Wydany / Podpisany',
      });
    }
    setIsManualModalOpen(true);
  };

  const handleSaveManualEntry = (e) => {
    e.preventDefault();
    if (!manualForm.id.trim() || !manualForm.recipientName.trim()) return;

    if (editingEntry) {
      const updated = updateIssuedDocument(currentOrg.id, editingEntry.id, manualForm);
      if (updated) setIssuedRegistry(updated);
    } else {
      const updated = addIssuedDocument(currentOrg.id, manualForm);
      if (updated) setIssuedRegistry(updated);
    }
    setIsManualModalOpen(false);
    setEditingEntry(null);
  };

  const handleDeleteRegistryEntry = (docId) => {
    const updated = deleteIssuedDocument(currentOrg.id, docId);
    if (updated) setIssuedRegistry(updated);
    showToast('Usunięto wpis z ewidencji wydanych dokumentów.');
  };

  const handlePrintRegistryProtocol = () => {
    setIsPrintingProtocol(true);
    setIsA4ModalOpen(true);
  };

  // Settings & Supervisors
  const { weights, calculateMemberPoints, supervisors: contextSupervisors, attendanceConfig } = useSettings() || {};

  const supervisors = contextSupervisors && contextSupervisors.length > 0
    ? contextSupervisors
    : getStoredSupervisors();

  // Active members list
  const activeMembers = useMemo(() => {
    return members.filter(m => (m?.status === 'active' || !m?.status) && !m?.isArchived && m?.status !== 'resigned');
  }, [members]);

  // Selected student state (defaults to first active member)
  const [selectedMember, setSelectedMember] = useState(() => {
    if (initialMember) return initialMember;
    if (isSknSeks) {
      const tomasz = members.find(m => String(m?.index || m?.indexNumber) === '15998');
      if (tomasz) return tomasz;
    }
    return activeMembers[0] || members[0] || null;
  });

  const lastInitialMemberIdRef = useRef(null);

  // Keep selectedMember synced safely bez zapętlania
  useEffect(() => {
    if (initialMember) {
      const initId = initialMember.id || initialMember.index || initialMember.nrIndeksu;
      if (initId && initId !== lastInitialMemberIdRef.current) {
        lastInitialMemberIdRef.current = initId;
        setSelectedMember(initialMember);
        if (initialDocType) setSelectedDocType(initialDocType);
      }
      return;
    }

    setSelectedMember(prev => {
      if (prev) {
        const prevId = prev.id;
        const prevIdx = String(prev.index || prev.indexNumber || prev.nrIndeksu || '').trim();
        const exists = members.some(m => {
          if (prevId && m.id === prevId) return true;
          const mIdx = String(m.index || m.indexNumber || m.nrIndeksu || '').trim();
          return prevIdx && mIdx === prevIdx;
        });
        if (exists) return prev;
      }
      return activeMembers[0] || members[0] || null;
    });
  }, [initialMember, initialDocType, activeMembers, members]);

  // Close autocomplete on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target)) {
        setIsAutocompleteOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered members for autocomplete z użyciem deferredSearchQuery
  const autocompleteResults = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    if (!q) return activeMembers.slice(0, 10);
    return members.filter(m => {
      const name = (m?.fullName || `${m?.firstName || ''} ${m?.lastName || ''}`).toLowerCase();
      const index = String(m?.index || m?.indexNumber || '').toLowerCase();
      const email = String(m?.email || '').toLowerCase();
      return name.includes(q) || index.includes(q) || email.includes(q);
    }).slice(0, 15);
  }, [members, activeMembers, deferredSearchQuery]);

  // Persistent custom meeting categories (localStorage)
  const customMeetingTypes = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(getStorageKey ? getStorageKey('crm_meeting_types') : 'crm_meeting_types') || '{}');
    } catch {
      return {};
    }
  }, [getStorageKey]);

  // Globalny zmemoizowany indeks statystyk wszystkich członków (O(1)) dla bieżącego roku
  const memberStatsMap = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(members) || members.length === 0) return map;

    let scopedEwidencja = [];
    let rawTenures = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const ewKey = getStorageKey ? getStorageKey('crm_ewidencja') : 'crm_ewidencja';
        const raw = localStorage.getItem(ewKey) || localStorage.getItem(`crm_ewidencja_${currentOrg?.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            scopedEwidencja = parsed.filter(e => (!e?.organization_id || e.organization_id === currentOrg?.id) && isEwidencjaInAcademicScope(e, scope, orgMeetings));
          }
        }
      } catch {}

      try {
        const orgId = currentOrg?.id || 'skn_seksuologii';
        const tenKey = getStorageKey ? getStorageKey('skn_board_tenures') : `skn_board_tenures_${orgId}`;
        const rawT = localStorage.getItem(tenKey) || localStorage.getItem(`skn_board_tenures_${orgId}`) || localStorage.getItem('skn_board_tenures');
        if (rawT) {
          const parsed = JSON.parse(rawT);
          if (Array.isArray(parsed)) rawTenures = deduplicateBoard(parsed, orgId);
        }
      } catch {}
    }

    members.forEach(m => {
      if (!m) return;
      const stats = calculateMemberYearStats(m, scopedEwidencja, orgMeetings, customMeetingTypes || {}, {
        ...attendanceConfig,
        academicYear,
        scope,
        startDate: scope?.startDate,
        endDate: scope?.endDate,
        boardTenures: rawTenures,
        orgId: currentOrg?.id,
        organization_id: currentOrg?.id,
      });

      const rawIdx = String(m.index || m.indexNumber || m.nrIndeksu || m.cleanIndex || '').trim();
      const cleanIdx = rawIdx.replace(/\D/g, '');
      const studentEmail = String(m.email || '').trim().toLowerCase();

      if (m.id) map.set(String(m.id), stats);
      if (rawIdx) map.set(rawIdx, stats);
      if (cleanIdx && cleanIdx !== rawIdx) map.set(cleanIdx, stats);
      if (studentEmail) map.set(studentEmail, stats);
    });

    return map;
  }, [members, orgMeetings, scope, academicYear, customMeetingTypes, attendanceConfig, currentOrg?.id, getStorageKey]);

  const getMemberFreqData = useCallback((m) => {
    if (!m) {
      return {
        freq: 0,
        percentage: 0,
        presentMandatory: 0,
        mandatoryTotal: currentOrg?.id === 'sknu' ? 3 : 0,
        baseDenominator: currentOrg?.id === 'sknu' ? 3 : 0,
        optionalBonus: 0,
        totalAttended: 0,
        attendedCount: 0,
        present: 0,
        absent: 0,
        isCertEligible: false,
        displayPercentage: '0%',
        displayRatio: '0 / 0',
      };
    }
    const rawIdx = String(m.index || m.indexNumber || m.nrIndeksu || m.cleanIndex || '').trim();
    const cleanIdx = rawIdx.replace(/\D/g, '');
    const email = String(m.email || '').trim().toLowerCase();

    return memberStatsMap.get(String(m.id)) ||
      (rawIdx && memberStatsMap.get(rawIdx)) ||
      (cleanIdx && memberStatsMap.get(cleanIdx)) ||
      (email && memberStatsMap.get(email)) ||
      calculateMemberYearStats(m, null, orgMeetings, customMeetingTypes || {}, {
        ...attendanceConfig,
        academicYear,
        scope,
        orgId: currentOrg?.id,
        organization_id: currentOrg?.id,
      });
  }, [memberStatsMap, currentOrg?.id, orgMeetings, customMeetingTypes, attendanceConfig, academicYear, scope]);

  const getMemberPoints = useCallback((m) => {
    if (!m) return 0;
    const stats = getMemberFreqData(m);
    return Number(stats.totalPoints ?? stats.points ?? 0);
  }, [getMemberFreqData]);

  // Frequency & stats of selected member (błyskawiczne O(1) dzięki memberStatsMap)
  const memberFreqData = useMemo(() => {
    return getMemberFreqData(selectedMember);
  }, [selectedMember, getMemberFreqData]);

  const memberPoints = useMemo(() => {
    return getMemberPoints(selectedMember);
  }, [selectedMember, getMemberPoints]);


  const currentDocNumber = useMemo(() => {
    const prefixMap = {
      membership: 'CERT',
      speaker: 'SPEAKER',
      board: 'BOARD',
      meetings_summary: 'TABELA-SPOTKAN',
      inter_club_summary: 'ZESTAWIENIE-KOL',
      members_registry: 'EWIDENCJA',
      research_conferences: 'BADANIA-KONF',
      annual_report: 'PROTOKOL-DZIEKANAT',
    };
    const pfx = prefixMap[selectedDocType] || 'DOC';
    const { tag: orgTag } = getOrgMetadata(currentOrg);
    return generateDocumentNumber(pfx, selectedMember?.index || selectedMember?.indexNumber || '00000', academicYear, orgTag);
  }, [selectedDocType, selectedMember, academicYear, currentOrg]);

  const handlePrint = () => {
    // Walidacja braku danych dla lat przyszłych i przeszłych
    if (!hasDataForYear && (selectedDocType === 'members_registry' || selectedDocType === 'meetings_summary' || selectedDocType === 'membership')) {
      alert(`W roku akademickim ${academicYear} nie zarejestrowano żadnych spotkań ani obecności członków Koła. Wystawianie oficjalnych pism z zerowymi/pustymi wartościami zostało wstrzymane.`);
      return;
    }

    // 1. Auto-register issued document in organization registry
    const docTypeTitleMap = {
      membership: 'Zaświadczenie Członka',
      speaker: 'Dyplom Prelegenta',
      board: 'Zaświadczenie Zarządu',
      meetings_summary: 'Tabela Zbiorcza Spotkań',
      inter_club_summary: 'Zestawienie Aktywności Kół (Dla Władz Uczelni)',
      members_registry: 'Ewidencja Członków',
      research_conferences: 'Wykaz Dorobku Naukowego',
      annual_report: 'Protokół Sprawozdawczy dla Dziekanatu',
    };

    let detailsText = '';
    if (selectedDocType === 'speaker') {
      detailsText = `Referat: ${presentationTopic || '—'}`;
    } else if (selectedDocType === 'membership') {
      detailsText = `Frekwencja: ${memberFreqData.displayPercentage || `${memberFreqData.freq}%`}, Punkty: ${memberPoints} pkt`;
    } else if (selectedDocType === 'board') {
      const roleObj = BOARD_ROLES.find(r => r.id === boardRole);
      detailsText = `Funkcja: ${roleObj?.label || boardRole}`;
    } else if (selectedDocType === 'meetings_summary') {
      detailsText = `Zrealizowano spotkań: ${legitimateMeetings.length}`;
    } else if (selectedDocType === 'inter_club_summary') {
      detailsText = `Łącznie wydarzeń: ${interClubData?.summaryStats?.totalEvents || 0} (${selectedInterClubOrgs.length} kół)`;
    } else if (selectedDocType === 'members_registry') {
      detailsText = `Liczba członków: ${members.length}`;
    } else {
      detailsText = `Sprawozdanie roczne WSKZ`;
    }

    const recipientName = selectedMember
      ? (selectedMember.fullName || `${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`.trim())
      : (selectedDocType === 'inter_club_summary' ? 'Władze Uczelni WSKZ' : (selectedDocType === 'members_registry' || selectedDocType === 'meetings_summary' || selectedDocType === 'annual_report' ? 'Koło Naukowe (Dziekanat)' : '—'));

    const recipientIndex = selectedMember?.index || selectedMember?.indexNumber || (selectedDocType.includes('summary') || selectedDocType.includes('report') ? 'WSKZ' : '—');

    const newEntry = {
      id: currentDocNumber,
      type: docTypeTitleMap[selectedDocType] || 'Akt Koła',
      recipientName,
      recipientIndex,
      issueDate: new Date().toISOString().slice(0, 10),
      academicYear,
      details: detailsText,
      status: 'Wydany / Podpisany',
    };

    if (currentOrg?.id) {
      const updated = addIssuedDocument(currentOrg.id, newEntry);
      if (updated) setIssuedRegistry(updated);
    }

    setIsA4ModalOpen(true);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(currentDocNumber);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyText = () => {
    const name = selectedMember?.fullName || `${selectedMember?.firstName || ''} ${selectedMember?.lastName || ''}`.trim();
    const idx = selectedMember?.index || selectedMember?.indexNumber || '—';
    const orgName = currentOrg?.name || 'Studenckie Koło Naukowe Seksuologii WSKZ';
    const totalMeetings = memberFreqData.baseDenominator || memberFreqData.mandatoryTotal || (!isSknSeks ? (meetings?.length || 7) : 12);
    const text = `Zaświadczenie ${orgName} (${academicYear})\nStudent: ${name} (nr albumu: ${idx})\nFrekwencja: ${memberFreqData.displayPercentage || `${memberFreqData.freq}%`} (${memberFreqData.present}/${totalMeetings} spotkań)\nPunkty aktywności: ${memberPoints} pkt\nIdentyfikator: ${currentDocNumber}`;
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      setIsEditing(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } else {
      setIsEditing(true);
    }
  };

  // Add meeting from dialog
  const handleInsertMeeting = () => {
    const newMeeting = {
      name: currentOrg?.name || 'Studenckie Koło Naukowe Seksuologii WSKZ',
      date: newMeetingForm.date || new Date().toISOString().split('T')[0],
      dateFormatted: newMeetingForm.date || new Date().toISOString().split('T')[0],
      type: newMeetingForm.type || 'Seminarium',
      title: newMeetingForm.title || 'Nowe spotkanie naukowe Koła',
      speaker: newMeetingForm.speaker || '',
      attendeesCount: Number(newMeetingForm.attendeesCount) || 0,
    };
    setCustomMeetingsList(prev => [...prev, newMeeting]);
    setIsAddMeetingModalOpen(false);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const quickActiveStudents = useMemo(() => {
    return members.slice(0, 6);
  }, [members]);

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 sm:space-y-6">

      {/* ── Print Specific Styles ── */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: ${isMultiPageDoc ? '14mm 0 16mm 0' : '0'};
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Jeśli otwarty jest oficjalny modal A4 (#skn-a4-modal-backdrop), ukryj #root, a modal zrób w 100% widocznym */
          body:has(#skn-a4-modal-backdrop) #root {
            display: none !important;
          }
          body:has(#skn-a4-modal-backdrop) #skn-a4-modal-backdrop,
          body:has(#skn-a4-modal-backdrop) #skn-a4-modal-backdrop * {
            visibility: visible !important;
          }

          /* Gdy drukujemy bezpośrednio z podglądu w zakładce (bez modala) */
          body:not(:has(#skn-a4-modal-backdrop)) nav,
          body:not(:has(#skn-a4-modal-backdrop)) header,
          body:not(:has(#skn-a4-modal-backdrop)) aside,
          body:not(:has(#skn-a4-modal-backdrop)) button,
          body:not(:has(#skn-a4-modal-backdrop)) input,
          body:not(:has(#skn-a4-modal-backdrop)) .no-print,
          body:not(:has(#skn-a4-modal-backdrop)) .print\\:hidden,
          body:not(:has(#skn-a4-modal-backdrop)) .tabs-container {
            display: none !important;
          }

          body:not(:has(#skn-a4-modal-backdrop)) .lg\\:col-span-7 {
            width: 100% !important;
            max-width: 100% !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body:not(:has(#skn-a4-modal-backdrop)) .grid {
            display: block !important;
            width: 100% !important;
          }

          body:not(:has(#skn-a4-modal-backdrop)) #reports-print-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }

          ${isMultiPageDoc ? `
          #reports-print-container #skn-a4-print-area {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            display: block !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #reports-print-container #skn-a4-print-area > div:first-child {
            padding: 0 15mm !important;
            width: 100% !important;
            box-sizing: border-box !important;
            display: block !important;
          }
          ` : `
          #reports-print-container #skn-a4-print-area {
            width: 210mm !important;
            max-width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
          }
          `}

          .doc-a4-sheet {
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            min-height: auto !important;
            max-height: 275mm !important;
            height: 100% !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            position: relative !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .doc-a4-sheet.doc-a4-multipage,
          .doc-a4-multipage {
            display: block !important;
            min-height: auto !important;
            max-height: none !important;
            height: auto !important;
            padding: 0 !important;
            overflow: visible !important;
            page-break-after: auto !important;
            break-after: auto !important;
            border: none !important;
            box-shadow: none !important;
          }
          .doc-a4-sheet .border,
          .doc-a4-sheet .rounded-lg,
          .doc-a4-sheet .rounded-xl,
          .doc-a4-sheet .rounded-2xl {
            box-shadow: none !important;
          }
          .cert-frame-outer {
            position: absolute !important;
            inset: 3mm !important;
            pointer-events: none !important;
          }
          .cert-frame-inner {
            position: absolute !important;
            inset: 4.5mm !important;
            pointer-events: none !important;
          }
          .multipage-closing-block,
          .signature-block,
          .signatures-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 24px !important;
            width: 100% !important;
          }
          /* Pełnoszerokościowa (edge-to-edge 210mm) grafika stopki /wskz-footer.png na ostatniej stronie */
          #reports-print-container #skn-a4-print-area .wskz-footer-fullbleed,
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
          #reports-print-container #skn-a4-print-area .wskz-footer-fullbleed img,
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
          #reports-print-container #skn-a4-print-area:has(.inter-club-report-print) {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          #reports-print-container #skn-a4-print-area:has(.inter-club-report-print) > div:first-child {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            padding: 0 15mm !important;
            box-sizing: border-box !important;
            width: 100% !important;
          }
          #reports-print-container #skn-a4-print-area:has(.inter-club-report-print) > div:first-child > div:last-child {
            display: block !important;
            min-height: auto !important;
            width: 100% !important;
          }
          #reports-print-container #skn-a4-print-area .inter-club-report-print {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
            width: 100% !important;
          }
          #reports-print-container #skn-a4-print-area .inter-club-report-print .inter-club-last-page {
            page-break-before: always !important;
            break-before: page !important;
            display: flex !important;
            flex-direction: column !important;
            min-height: 265mm !important;
            height: auto !important;
            width: 100% !important;
          }
          #reports-print-container #skn-a4-print-area .inter-club-report-print .multipage-closing-block,
          #reports-print-container #skn-a4-print-area .inter-club-closing-block {
            margin-top: auto !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            width: 100% !important;
          }
          #reports-print-container table,
          #skn-a4-print-area table,
          .doc-a4-sheet table {
            page-break-inside: auto !important;
            break-inside: auto !important;
            width: 100% !important;
            min-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          #reports-print-container thead,
          #skn-a4-print-area thead,
          .doc-a4-sheet thead {
            display: table-header-group !important;
          }
          #reports-print-container tr,
          #skn-a4-print-area tr,
          .doc-a4-sheet tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: auto !important;
          }
          #reports-print-container td,
          #reports-print-container th,
          #skn-a4-print-area td,
          #skn-a4-print-area th,
          .doc-a4-sheet td,
          .doc-a4-sheet th {
            padding: 6px 8px !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
            line-height: 1.3 !important;
            box-sizing: border-box !important;
          }
          #reports-print-container .whitespace-nowrap,
          #skn-a4-print-area .whitespace-nowrap,
          .doc-a4-sheet .whitespace-nowrap {
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow-wrap: normal !important;
          }
          .doc-a4-sheet input {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* ── Top Header Banner (Hidden on Print) ── */}
      <div className="bg-white px-6 py-3.5 h-[72px] min-h-[72px] max-h-[72px] rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center min-w-0">
          <div className="w-11 h-11 min-w-[44px] rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center mr-4 shrink-0 shadow-2xs">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-tight text-slate-900 tracking-tight truncate">
                Sprawozdawczość & Dokumenty Akademickie
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                {currentOrg?.shortName || currentOrg?.name || 'Koło Naukowe'} {academicYear}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-normal mt-0.5 truncate">
              {currentOrg?.name || 'Studenckie Koło Naukowe Seksuologii WSKZ'} • Generator oficjalnych zaświadczeń, certyfikatów i sprawozdań.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="h-9 px-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 flex items-center font-mono">
            <span>Opiekunowie:&nbsp;</span>
            <strong className="text-slate-800 truncate max-w-[280px]">
              {supervisors.map(s => typeof s === 'string' ? s : (s.academicTitle ? `${s.academicTitle} ${s.name}` : (s.fullName || s.name))).join(', ')}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Grid Container: Left Controls & Right Live Preview ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block">

        {/* ── SECTOR A: Control & Selector Panel (col-span-5) ── */}
        <div className="lg:col-span-5 space-y-5 print:hidden">

          {/* Step 1: Category Selector Cards */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-600" />
                1. Wybierz Kategorię Dokumentu:
              </h2>
              <span className="text-[11px] font-mono text-slate-400">{DOCUMENT_CATEGORIES.length} szablonów</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-2.5">
              {DOCUMENT_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const isSelected = selectedDocType === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      startTransition(() => {
                        setSelectedDocType(cat.id);
                      });
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Icon size={16} />
                      </div>
                      <span className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full border ${cat.badgeColor}`}>
                        {cat.badge}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-slate-900 tracking-tight">{cat.title}</div>
                    <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">{cat.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Contextual Selector Fields */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Filter size={14} className="text-indigo-600" />
              2. Parametry i Dane Dokumentu:
            </h2>

            {/* Student Search with Autocomplete (for membership, speaker, board) */}
            {(selectedDocType === 'membership' || selectedDocType === 'speaker' || selectedDocType === 'board') && (
              <div className="space-y-2 relative" ref={autocompleteRef}>
                <label className="text-xs font-bold text-slate-700 block">
                  Wybierz Studenta / Członka Koła:
                </label>

                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsAutocompleteOpen(true);
                    }}
                    onFocus={() => setIsAutocompleteOpen(true)}
                    placeholder="Wyszukaj po nazwisku, imieniu lub nr indeksu..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-sans"
                  />
                  {selectedMember && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] bg-indigo-100 text-indigo-800 font-mono font-bold px-2 py-0.5 rounded-md">
                      #{selectedMember.index || selectedMember.indexNumber}
                    </span>
                  )}
                </div>

                {/* Autocomplete dropdown menu */}
                {isAutocompleteOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-64 overflow-y-auto z-30 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                    {autocompleteResults.length > 0 ? (
                      autocompleteResults.map(m => {
                        const mName = m?.fullName || `${m?.firstName || ''} ${m?.lastName || ''}`.trim();
                        const isCurrent = String(m?.index || m?.indexNumber) === String(selectedMember?.index || selectedMember?.indexNumber);
                        const mStats = getMemberFreqData(m);
                        const mPts = getMemberPoints(m);
                        return (
                          <button
                            key={m.id || m.index}
                            onClick={() => {
                              startTransition(() => {
                                setSelectedMember(m);
                              });
                              setIsAutocompleteOpen(false);
                              setSearchQuery('');
                            }}
                            className={`w-full p-2.5 text-left text-xs flex items-center justify-between transition hover:bg-indigo-50/70 cursor-pointer ${
                              isCurrent ? 'bg-indigo-50/90 font-bold text-indigo-950' : 'text-slate-800'
                            }`}
                          >
                            <div>
                              <div className="font-semibold">{mName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Indeks: {m?.index || m?.indexNumber} • {m?.field || 'Psychologia'}
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono">
                                {mStats.displayPercentage || `${mStats.freq}%`}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-mono">
                                <Sparkles size={11} className="shrink-0" />
                                <span>{mPts} pkt</span>
                              </span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Nie znaleziono studenta spełniającego kryteria wyszukiwania.
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Selection Chips */}
                <div className="pt-1">
                  <span className="text-[10.5px] text-slate-400 block mb-1.5 font-medium">Szybki wybór czołowych aktywnych:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickActiveStudents.map(qm => {
                      const isSel = String(qm?.index || qm?.indexNumber) === String(selectedMember?.index || selectedMember?.indexNumber);
                      const qmStats = getMemberFreqData(qm);
                      return (
                        <button
                          key={qm.id || qm.index}
                          onClick={() => {
                            startTransition(() => {
                              setSelectedMember(qm);
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                            isSel
                              ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>{qm.fullName || qm.firstName} ({qm.index})</span>
                          <span className={`text-[10px] font-bold font-mono px-1 py-0.2 rounded ${
                            isSel ? 'bg-indigo-700 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {qmStats.displayPercentage || `${qmStats.freq}%`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Student Summary Card */}
                {selectedMember && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between mt-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {selectedMember.fullName || `${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                        Nr albumu: {selectedMember.index || selectedMember.indexNumber} • {selectedMember.field || 'Psychologia'}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-700 font-mono block">
                          {memberFreqData.displayPercentage || `${memberFreqData.freq}%`}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {memberFreqData.present}/{memberFreqData.baseDenominator || memberFreqData.mandatoryTotal || 12} spotkań
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-purple-700 font-mono block">
                          {memberPoints} pkt
                        </span>
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> {memberFreqData.isCertEligible ? 'Zaliczono' : 'W toku'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Przełączniki widoczności dla Zaświadczenia (Frekwencja & Ocena Aktywności) */}
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">Opcje Zaświadczenia:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Przełącznik Frekwencji */}
                    <button
                      type="button"
                      onClick={() => handleColumnVisibilityChange('cert_freq', columnVisibility.cert_freq === false)}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition cursor-pointer select-none ${
                        columnVisibility.cert_freq !== false
                          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                      title="Włącza lub wyłącza blok frekwencji oraz dopisek w tytule zaświadczenia"
                    >
                      <div className="flex items-center gap-2">
                        {columnVisibility.cert_freq !== false ? (
                          <CheckSquare size={14} className="text-emerald-700 shrink-0" />
                        ) : (
                          <Square size={14} className="text-slate-400 shrink-0" />
                        )}
                        <span className="text-[11px]">Frekwencja i obecności</span>
                      </div>
                      <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
                        columnVisibility.cert_freq !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {columnVisibility.cert_freq !== false ? 'Włączona' : 'Ukryta'}
                      </span>
                    </button>

                    {/* Przełącznik Szczegółowej Oceny Aktywności */}
                    <button
                      type="button"
                      onClick={() => handleColumnVisibilityChange('cert_detailed_rating', columnVisibility.cert_detailed_rating === false)}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition cursor-pointer select-none ${
                        columnVisibility.cert_detailed_rating !== false
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                      title="Przełącza pomiędzy szczegółową rangą (Lider/Kryteria spełnione) a czystym statusem Aktywny członek koła"
                    >
                      <div className="flex items-center gap-2">
                        {columnVisibility.cert_detailed_rating !== false ? (
                          <CheckSquare size={14} className="text-indigo-700 shrink-0" />
                        ) : (
                          <Square size={14} className="text-slate-400 shrink-0" />
                        )}
                        <span className="text-[11px]">Szczegółowa ranga</span>
                      </div>
                      <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
                        columnVisibility.cert_detailed_rating !== false ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {columnVisibility.cert_detailed_rating !== false ? 'Pełna' : 'Prosta'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Specific Inputs for Speaker Diploma */}
            {selectedDocType === 'speaker' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Wybierz zrealizowaną prelekcję / spotkanie Koła:
                  </label>
                  <select
                    onChange={(e) => {
                      const m = legitimateMeetings.find(item => item.code === e.target.value || item.id === e.target.value);
                      if (m) {
                        setPresentationTopic(m.title);
                        setPresentationDate(m.date || m.dateFormatted);
                      }
                    }}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-sans"
                  >
                    <option value="">-- Wybierz z listy {legitimateMeetings.length} spotkań {currentOrg?.shortName || currentOrg?.name} --</option>
                    {legitimateMeetings.map(m => (
                      <option key={m.code || m.id} value={m.code || m.id}>
                        [{m.code || m.id} • {m.dateFormatted || m.date}] {m.title.slice(0, 60)}... ({m.speaker})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Temat referatu / wystąpienia naukowego (edytowalny):
                  </label>
                  <textarea
                    rows={2}
                    value={presentationTopic}
                    onChange={(e) => setPresentationTopic(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-sans resize-none"
                    placeholder="Wpisz pełny temat prezentacji..."
                  />
                </div>
              </div>
            )}
            {/* Specific Inputs for Board Certificate */}
            {selectedDocType === 'board' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Funkcja pełniona w Zarządzie:
                  </label>
                  <select
                    value={boardRole}
                    onChange={(e) => setBoardRole(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-sans"
                  >
                    {BOARD_ROLES.map(role => (
                      <option key={role.id} value={role.label}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Okres kadencji:
                  </label>
                  <input
                    type="text"
                    value={termDates}
                    onChange={(e) => setTermDates(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-sans"
                  />
                </div>
              </div>
            )}

            {/* Opcje parametrów dla Oficjalnej Ewidencji Członków */}
            {selectedDocType === 'members_registry' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    Opcje kolumn tabeli ewidencji:
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Domyślnie zoptymalizowane</span>
                </div>

                {/* Dedykowany przełącznik (ptaszek) dla kolumny Zaliczenie */}
                <div
                  onClick={() => handleColumnVisibilityChange('status', !columnVisibility.status)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                    columnVisibility.status
                      ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs ring-1 ring-emerald-400/30'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                  }`}
                  title="Kliknij, aby włączyć lub wyłączyć kolumnę Zaliczenie w tabeli raportu"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="pt-0.5">
                      {columnVisibility.status ? (
                        <div className="w-4 h-4 rounded bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded border border-slate-300 bg-white" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Pokaż kolumnę „Zaliczenie”</span>
                        <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-semibold ${
                          columnVisibility.status ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-200/80 text-slate-600'
                        }`}>
                          {columnVisibility.status ? 'Włączona' : 'Domyślnie ukryta'}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
                        Dołącza kolumnę z oficjalnym statusem zaliczenia roku (Zaliczono / W toku / Niezaliczono).
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <button
                      type="button"
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        columnVisibility.status ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          columnVisibility.status ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Szybkie przełączniki widoczności pozostałych kolumn tabeli */}
                <div className="pt-1">
                  <span className="text-[10.5px] font-semibold text-slate-500 block mb-1.5">Pozostałe kolumny tabeli:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-1.5">
                    {[
                      { key: 'lp', label: 'LP.' },
                      { key: 'fullName', label: 'Imię i Nazwisko' },
                      { key: 'index', label: 'Nr Albumu' },
                      { key: 'field', label: 'Kierunek Studiów' },
                      { key: 'year', label: 'Rok Studiów' },
                      { key: 'present', label: 'Obecności' },
                      { key: 'freq', label: 'Frekwencja' },
                      { key: 'points', label: 'Punkty' },
                    ].map(col => {
                      const isChecked = columnVisibility[col.key] !== false;
                      return (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => handleColumnVisibilityChange(col.key, !isChecked)}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-white text-slate-800 border-slate-300 font-semibold shadow-2xs hover:border-slate-400'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-70 hover:opacity-100'
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare size={12} className="text-indigo-600 shrink-0" />
                          ) : (
                            <Square size={12} className="text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{col.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Opcje parametrów dla Zestawienia Międzykołowego dla Władz Uczelni */}
            {selectedDocType === 'inter_club_summary' && (
              <div className="space-y-3.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar size={14} className="text-indigo-600" />
                    <span>Przedział czasowy zestawienia:</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">Teamup & Supabase</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Data od:</label>
                    <input
                      type="date"
                      value={interClubStartDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Data do:</label>
                    <input
                      type="date"
                      value={interClubEndDate}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Szybki wybór okresu */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleDatePreset(defRangeForSelectedYear.startDate, defRangeForSelectedYear.endDate)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      interClubStartDate === defRangeForSelectedYear.startDate &&
                      interClubEndDate === defRangeForSelectedYear.endDate
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-200'
                    }`}
                    title="Ustaw przedział od 1 października do dzisiaj (lub do 30.09 dla lat archiwalnych)"
                  >
                    {isSelectedYearCurrent ? 'Od 1 X do dzisiaj' : 'Domyślny zakres'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePreset(`${curAcademicStartYear}-10-01`, `${curAcademicEndYear}-09-30`)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      interClubStartDate === `${curAcademicStartYear}-10-01` &&
                      interClubEndDate === `${curAcademicEndYear}-09-30`
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 border-slate-200'
                    }`}
                  >
                    Cały rok {shortYearLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePreset(`${curAcademicStartYear}-10-01`, `${curAcademicEndYear}-02-28`)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      interClubStartDate === `${curAcademicStartYear}-10-01` &&
                      interClubEndDate === `${curAcademicEndYear}-02-28`
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 border-slate-200'
                    }`}
                  >
                    Semestr zimowy
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePreset(`${curAcademicEndYear}-03-01`, `${curAcademicEndYear}-09-30`)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      interClubStartDate === `${curAcademicEndYear}-03-01` &&
                      interClubEndDate === `${curAcademicEndYear}-09-30`
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 border-slate-200'
                    }`}
                  >
                    Semestr letni
                  </button>
                </div>

                {/* Wybór Kół Naukowych (Ścisła izolacja do aktywnego koła) */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 size={14} className="text-indigo-600" />
                      <span>Koło Naukowe:</span>
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Izolacja instancji
                    </span>
                  </div>

                  <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1">
                    {WSKZ_ORGANIZATIONS.map(org => {
                      const isCurrentActive = org.orgId === activeInterClubOrgId;
                      return (
                        <div
                          key={org.orgId}
                          className={`flex items-center justify-between p-1.5 rounded-lg text-xs select-none transition ${
                            isCurrentActive
                              ? 'bg-white font-bold text-slate-900 shadow-2xs border border-indigo-300 ring-1 ring-indigo-200'
                              : 'opacity-40 bg-slate-100/40 text-slate-400 cursor-not-allowed'
                          }`}
                          title={isCurrentActive ? 'Aktywna instancja koła' : 'Zablokowane: sprawozdawczość ograniczona do aktywnego koła'}
                        >
                          <div className="flex items-center gap-2 truncate pr-1">
                            <input
                              type="checkbox"
                              checked={isCurrentActive}
                              disabled={true}
                              readOnly
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-not-allowed"
                            />
                            <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-600">
                              {org.number}
                            </span>
                            <span className="truncate">{org.name}</span>
                          </div>
                          {isCurrentActive && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                              AKTYWNE
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 italic mt-1 leading-tight">
                    Sprawozdanie jest ściśle izolowane do aktywnego koła ({currentOrg?.shortName || currentOrg?.name || 'Seksuologia'}). Zestawienia wielokołowe są dostępne wyłącznie w CRM Kancelarii Samorządu.
                  </p>
                </div>

                {/* Przycisk Generuj / Odśwież Zestawienie */}
                <button
                  type="button"
                  onClick={() => handleFetchInterClubReport()}
                  disabled={isLoadingInterClub || selectedInterClubOrgIds.length === 0}
                  className="w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw size={14} className={isLoadingInterClub ? 'animate-spin' : ''} />
                  <span>{isLoadingInterClub ? 'Pobieranie danych z Teamup & Supabase...' : 'Wygeneruj / Zaktualizuj Zestawienie'}</span>
                </button>
              </div>
            )}

            {/* Academic Year Selection */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Rok akademicki:</label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {academicYearOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── SECTOR B: Live Print Preview (col-span-7) ── */}
        <div className="lg:col-span-7 space-y-4 print:w-full print:block print:max-w-full print:m-0 print:p-0">

          {/* Action Bar Above Preview (Hidden during print) */}
          <div className="bg-white p-3.5 sm:px-5 rounded-2xl shadow-sm border border-slate-200 text-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-800">Podgląd arkusza A4</span>
              <span className="text-[11px] font-mono font-semibold text-indigo-700 bg-indigo-50/80 px-2.5 py-0.5 rounded-lg border border-indigo-200/80">
                {currentDocNumber}
              </span>
              {saveToast && (
                <span className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 animate-in fade-in">
                  ✓ Zaktualizowano!
                </span>
              )}
            </div>

            {/* Exact Required Order of Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Kopiuj ID */}
              <button
                type="button"
                onClick={handleCopyId}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-700 hover:text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
                title="Skopiuj numer ewidencyjny dokumentu"
              >
                {copiedId ? (
                  <Check size={18} strokeWidth={2.2} className="w-[18px] h-[18px] text-emerald-600 shrink-0" />
                ) : (
                  <Copy size={18} strokeWidth={2} className="w-[18px] h-[18px] text-slate-600 shrink-0" />
                )}
                <span>{copiedId ? 'Skopiowano ID!' : 'Kopiuj ID'}</span>
              </button>

              {/* 2. Kopiuj tekst */}
              <button
                type="button"
                onClick={handleCopyText}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-700 hover:text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
                title="Skopiuj treść tekstową do schowka"
              >
                {copiedText ? (
                  <Check size={18} strokeWidth={2.2} className="w-[18px] h-[18px] text-emerald-600 shrink-0" />
                ) : (
                  <FileText size={18} strokeWidth={2} className="w-[18px] h-[18px] text-slate-600 shrink-0" />
                )}
                <span>{copiedText ? 'Skopiowano treść!' : 'Kopiuj tekst'}</span>
              </button>

              {/* 3. Edytuj treść / Zapisz zmiany */}
              <button
                type="button"
                onClick={handleToggleEdit}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-2xs cursor-pointer border ${
                  isEditing
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 font-bold shadow-sm'
                    : 'bg-amber-50/90 hover:bg-amber-100/90 text-amber-900 border-amber-200/90'
                }`}
                title="Przełącz bezpośrednią edycję tekstu i tabel w arkuszu"
              >
                {isEditing ? (
                  <Save size={18} strokeWidth={2.2} className="w-[18px] h-[18px] text-white shrink-0" />
                ) : (
                  <Edit3 size={18} strokeWidth={2} className="w-[18px] h-[18px] text-amber-600 shrink-0" />
                )}
                <span>{isEditing ? 'Zapisz zmiany' : 'Edytuj treść'}</span>
              </button>

              {/* 4. Ewidencja Wydanych Aktów */}
              <button
                type="button"
                onClick={() => setIsRegistryOpen(true)}
                className="px-3.5 py-2 rounded-xl border border-indigo-200/90 bg-indigo-50/90 hover:bg-indigo-100/90 text-indigo-900 text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                title="Otwórz oficjalny rejestr i ewidencję wydanych dokumentów"
              >
                <ClipboardList size={18} strokeWidth={2} className="w-[18px] h-[18px] text-indigo-600 shrink-0" />
                <span>Ewidencja Wydanych Aktów</span>
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold border border-indigo-200">
                  {issuedRegistry.length}
                </span>
              </button>

              {/* Eksport do Excela (.xlsx) dla Zestawienia Międzykołowego */}
              {selectedDocType === 'inter_club_summary' && (
                <button
                  type="button"
                  onClick={handleExportInterClubToExcel}
                  disabled={isLoadingInterClub || !interClubData}
                  className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Pobierz pełne zestawienie w formacie skoroszytu Excel (.xlsx)"
                >
                  <FileSpreadsheet size={18} strokeWidth={2} className="w-[18px] h-[18px] text-emerald-700 shrink-0" />
                  <span>Eksportuj do Excela (.xlsx)</span>
                </button>
              )}

              {/* 5. Drukuj dokument (PDF) */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={!hasDataForYear && (selectedDocType === 'members_registry' || selectedDocType === 'meetings_summary' || selectedDocType === 'membership')}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all ${
                  !hasDataForYear && (selectedDocType === 'members_registry' || selectedDocType === 'meetings_summary' || selectedDocType === 'membership')
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-75'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                }`}
                title={!hasDataForYear && (selectedDocType === 'members_registry' || selectedDocType === 'meetings_summary' || selectedDocType === 'membership') ? `Brak danych w roku ${academicYear} - drukowanie zablokowane` : 'Drukuj dokument (PDF)'}
              >
                <Printer size={18} strokeWidth={2.2} className="w-[18px] h-[18px] text-white shrink-0" />
                <span>Drukuj dokument (PDF)</span>
              </button>
            </div>
          </div>

          {/* Interactive Column Customizer for Table Templates */}
          {isEditing && (
            <DocumentCustomizer
              docType={isPrintingProtocol ? 'official_registry' : selectedDocType}
              columnVisibility={columnVisibility}
              onChangeVisibility={handleColumnVisibilityChange}
              onResetColumns={handleResetColumns}
            />
          )}

          {/* Informacyjny banner walidacji braku danych dla roku */}
          {!hasDataForYear && (selectedDocType === 'members_registry' || selectedDocType === 'meetings_summary' || selectedDocType === 'membership') && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-xs mb-3 print:hidden shadow-2xs">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  Brak zarejestrowanych spotkań i obecności dla roku akademickiego <strong>{academicYear}</strong>.
                  Generowanie oficjalnych pism z zerami lub fałszywym statusem zostało wstrzymane.
                </span>
              </div>
              <span className="text-[11px] font-mono bg-white px-2.5 py-1 rounded border border-amber-200 text-amber-800 shrink-0">
                Stan ewidencji: PUSTY
              </span>
            </div>
          )}

          {/* Printable Document Sheet Container z płynnym, leniwym renderowaniem transition */}
          <div className="bg-slate-100 p-2 sm:p-4 rounded-2xl border border-slate-200 overflow-x-auto max-h-[85vh] overflow-y-auto flex justify-center items-start print:max-h-none print:overflow-visible print:p-0 print:bg-transparent print:border-none">
            <div id="reports-print-container" className={`w-full flex justify-center transition-opacity duration-150 ${isPending ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
              <OfficialWskzDocumentSheet
                org={currentOrg}
                academicYear={academicYear}
                docNumber={currentDocNumber}
                docDate={docDate}
                isMultiPage={isMultiPageDoc}
              >
                {isPrintingProtocol ? (
                  <OfficialRegistryProtocolTemplate
                    registry={filteredRegistry.length > 0 ? filteredRegistry : issuedRegistry}
                    org={currentOrg}
                    academicYear={academicYear}
                    supervisors={supervisors}
                    columnVisibility={columnVisibility}
                    docDate={docDate}
                  />
                ) : (
                  <>
                    {selectedDocType === 'membership' && (
                      <MembershipCertificateTemplate
                        member={selectedMember}
                        freqData={memberFreqData}
                        points={memberPoints}
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docNumber={currentDocNumber}
                        docDate={docDate}
                        isEditing={isEditing}
                        customText={membershipCustomText}
                        onUpdateCustomText={setMembershipCustomText}
                        org={currentOrg}
                        columnVisibility={columnVisibility}
                      />
                    )}

                    {selectedDocType === 'speaker' && (
                      <SpeakerDiplomaTemplate
                        member={selectedMember}
                        presentationTopic={presentationTopic}
                        presentationDate={presentationDate}
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docDate={docDate}
                        isEditing={isEditing}
                        onUpdateTopic={setPresentationTopic}
                        org={currentOrg}
                      />
                    )}

                    {selectedDocType === 'board' && (
                      <BoardCertificateTemplate
                        member={selectedMember}
                        boardRole={boardRole}
                        termDates={termDates}
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docNumber={currentDocNumber}
                        docDate={docDate}
                        isEditing={isEditing}
                        customDuties={boardCustomDuties}
                        onUpdateDuties={setBoardCustomDuties}
                        org={currentOrg}
                      />
                    )}

                    {selectedDocType === 'meetings_summary' && (
                      <MeetingsSummaryTableTemplate
                        meetings={customMeetingsList}
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docDate={docDate}
                        isEditing={isEditing}
                        onUpdateMeetings={setCustomMeetingsList}
                        onOpenAddModal={() => setIsAddMeetingModalOpen(true)}
                        org={currentOrg}
                        columnVisibility={columnVisibility}
                      />
                    )}

                    {selectedDocType === 'inter_club_summary' && (
                      <InterClubSummaryTemplate
                        startDate={interClubStartDate}
                        endDate={interClubEndDate}
                        selectedOrgs={selectedInterClubOrgs}
                        allProcessedEvents={interClubData?.allProcessedEvents || []}
                        substantiveMeetings={interClubData?.substantiveMeetings || []}
                        projectMeetings={interClubData?.projectMeetings || []}
                        summaryStats={interClubData?.summaryStats || {}}
                        byOrgStats={interClubData?.byOrgStats || []}
                        docDate={docDate}
                        isEditing={isEditing}
                        editedCells={interClubEdits}
                        onEditCell={handleInterClubEditCell}
                        onExportExcel={handleExportInterClubToExcel}
                        onPrint={handlePrint}
                      />
                    )}

                    {selectedDocType === 'members_registry' && (
                      <MembersRegistryTemplate
                        members={members}
                        meetings={orgMeetings}
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docDate={docDate}
                        docNumber={currentDocNumber}
                        org={currentOrg}
                        columnVisibility={columnVisibility}
                        customMeetingTypes={customMeetingTypes}
                        attendanceConfig={attendanceConfig}
                        precalculatedStatsMap={memberStatsMap}
                      />
                    )}

                    {selectedDocType === 'research_conferences' && (
                      <ResearchConferencesRegistryTemplate
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docDate={docDate}
                        isEditing={isEditing}
                        activities={customResearchActivities}
                        onUpdateActivities={setCustomResearchActivities}
                        org={currentOrg}
                        columnVisibility={columnVisibility}
                      />
                    )}

                    {selectedDocType === 'annual_report' && (
                      <AnnualReportProtocolTemplate
                        members={members}
                        meetings={legitimateMeetings}
                        supervisors={supervisors}
                        academicYear={academicYear}
                        docDate={docDate}
                        org={currentOrg}
                        isEditing={isEditing}
                        columnVisibility={columnVisibility}
                      />
                    )}
                  </>
                )}
              </OfficialWskzDocumentSheet>
            </div>
          </div>
        </div>

      </div>

      {/* ── Modal: Oficjalny Podgląd Pełnoekranowy i Wydruk A4 WSKZ (Portal) ── */}
      <OfficialWskzDocumentA4
        isOpen={isA4ModalOpen}
        onClose={() => setIsA4ModalOpen(false)}
        title={isPrintingProtocol ? 'Oficjalny Protokół Zbiorczy Wydanych Dokumentów' : (DOCUMENT_CATEGORIES.find(d => d.id === selectedDocType)?.title || 'Dokument A4')}
        documentCode={currentDocNumber}
        docNumber={currentDocNumber}
        docDate={docDate}
        academicYear={academicYear}
        org={currentOrg}
        isMultiPage={isMultiPageDoc}
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
        onExportExcel={
          selectedDocType === 'inter_club_summary'
            ? handleExportInterClubToExcel
            : (isPrintingProtocol ? handleExportToExcel : null)
        }
        docxUrl="/szablon-pisma-wskz.docx"
        extraActions={
          selectedDocType === 'membership' ? (
            <div className="flex items-center gap-1.5 mr-1">
              <button
                type="button"
                onClick={() => handleColumnVisibilityChange('cert_freq', columnVisibility.cert_freq === false)}
                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer select-none flex items-center gap-1.5 ${
                  columnVisibility.cert_freq !== false
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 text-slate-500 border-slate-300'
                }`}
                title="Włącz/wyłącz sekcję frekwencji w zaświadczeniu"
              >
                {columnVisibility.cert_freq !== false ? <CheckSquare size={13} className="text-emerald-700" /> : <Square size={13} />}
                <span>Frekwencja: {columnVisibility.cert_freq !== false ? 'Wł.' : 'Wył.'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleColumnVisibilityChange('cert_detailed_rating', columnVisibility.cert_detailed_rating === false)}
                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer select-none flex items-center gap-1.5 ${
                  columnVisibility.cert_detailed_rating !== false
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                    : 'bg-slate-100 text-slate-500 border-slate-300'
                }`}
                title="Przełącz szczegółową ocenę aktywności (ranga / aktywny członek)"
              >
                {columnVisibility.cert_detailed_rating !== false ? <CheckSquare size={13} className="text-indigo-700" /> : <Square size={13} />}
                <span>Ocena: {columnVisibility.cert_detailed_rating !== false ? 'Ranga' : 'Prosta'}</span>
              </button>
            </div>
          ) : null
        }
      >
        {isPrintingProtocol ? (
          <OfficialRegistryProtocolTemplate
            registry={filteredRegistry.length > 0 ? filteredRegistry : issuedRegistry}
            org={currentOrg}
            academicYear={academicYear}
            supervisors={supervisors}
            columnVisibility={columnVisibility}
            docDate={docDate}
          />
        ) : (
          <>
            {selectedDocType === 'membership' && (
              <MembershipCertificateTemplate
                member={selectedMember}
                freqData={memberFreqData}
                points={memberPoints}
                supervisors={supervisors}
                academicYear={academicYear}
                docNumber={currentDocNumber}
                docDate={docDate}
                isEditing={isEditing}
                customText={membershipCustomText}
                onUpdateCustomText={setMembershipCustomText}
                org={currentOrg}
                columnVisibility={columnVisibility}
              />
            )}

            {selectedDocType === 'speaker' && (
              <SpeakerDiplomaTemplate
                member={selectedMember}
                presentationTopic={presentationTopic}
                presentationDate={presentationDate}
                supervisors={supervisors}
                academicYear={academicYear}
                docDate={docDate}
                isEditing={isEditing}
                onUpdateTopic={setPresentationTopic}
                org={currentOrg}
              />
            )}

            {selectedDocType === 'board' && (
              <BoardCertificateTemplate
                member={selectedMember}
                boardRole={boardRole}
                termDates={termDates}
                supervisors={supervisors}
                academicYear={academicYear}
                docNumber={currentDocNumber}
                docDate={docDate}
                isEditing={isEditing}
                customDuties={boardCustomDuties}
                onUpdateDuties={setBoardCustomDuties}
                org={currentOrg}
              />
            )}

            {selectedDocType === 'meetings_summary' && (
              <MeetingsSummaryTableTemplate
                meetings={customMeetingsList}
                supervisors={supervisors}
                academicYear={academicYear}
                docDate={docDate}
                isEditing={isEditing}
                onUpdateMeetings={setCustomMeetingsList}
                onOpenAddModal={() => setIsAddMeetingModalOpen(true)}
                org={currentOrg}
                columnVisibility={columnVisibility}
              />
            )}

            {selectedDocType === 'inter_club_summary' && (
              <InterClubSummaryTemplate
                startDate={interClubStartDate}
                endDate={interClubEndDate}
                selectedOrgs={selectedInterClubOrgs}
                allProcessedEvents={interClubData?.allProcessedEvents || []}
                substantiveMeetings={interClubData?.substantiveMeetings || []}
                projectMeetings={interClubData?.projectMeetings || []}
                summaryStats={interClubData?.summaryStats || {}}
                byOrgStats={interClubData?.byOrgStats || []}
                docDate={docDate}
                isEditing={isEditing}
                editedCells={interClubEdits}
                onEditCell={handleInterClubEditCell}
                onExportExcel={handleExportInterClubToExcel}
                onPrint={handlePrint}
              />
            )}

            {selectedDocType === 'members_registry' && (
              <MembersRegistryTemplate
                members={members}
                meetings={orgMeetings}
                supervisors={supervisors}
                academicYear={academicYear}
                docDate={docDate}
                docNumber={currentDocNumber}
                org={currentOrg}
                columnVisibility={columnVisibility}
                customMeetingTypes={customMeetingTypes}
                attendanceConfig={attendanceConfig}
                precalculatedStatsMap={memberStatsMap}
              />
            )}

            {selectedDocType === 'research_conferences' && (
              <ResearchConferencesRegistryTemplate
                supervisors={supervisors}
                academicYear={academicYear}
                docDate={docDate}
                isEditing={isEditing}
                activities={customResearchActivities}
                onUpdateActivities={setCustomResearchActivities}
                org={currentOrg}
                columnVisibility={columnVisibility}
              />
            )}

            {selectedDocType === 'annual_report' && (
              <AnnualReportProtocolTemplate
                members={members}
                meetings={legitimateMeetings}
                supervisors={supervisors}
                academicYear={academicYear}
                docDate={docDate}
                org={currentOrg}
                isEditing={isEditing}
                columnVisibility={columnVisibility}
              />
            )}
          </>
        )}
      </OfficialWskzDocumentA4>

      {/* ── Add Meeting Modal Dialog ─────────────────────────────────────── */}
      {isAddMeetingModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden font-sans">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <CalendarPlus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Dodaj Spotkanie do Tabeli Sprawozdawczej</h3>
                  <p className="text-[11px] text-slate-400">{currentOrg?.name || 'Studenckie Koło Naukowe Seksuologii WSKZ'} • Rok Akademicki {academicYear}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddMeetingModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4">

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setNewMeetingMode('teamup')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    newMeetingMode === 'teamup'
                      ? 'bg-white text-indigo-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar size={14} className={newMeetingMode === 'teamup' ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>Wybierz z kalendarza Teamup</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewMeetingMode('manual')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    newMeetingMode === 'manual'
                      ? 'bg-white text-indigo-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Edit3 size={14} className={newMeetingMode === 'manual' ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>Wpisz ręcznie</span>
                </button>
              </div>

              {/* Variant A: Select from Teamup / Canonical list */}
              {newMeetingMode === 'teamup' && (
                <div className="space-y-3 p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <label className="text-xs font-bold text-indigo-950 block">
                    Wybierz zrealizowane spotkanie z listy {legitimateMeetings.length} spotkań Koła:
                  </label>
                  <select
                    onChange={(e) => {
                      const found = legitimateMeetings.find(m => m.code === e.target.value || m.id === e.target.value);
                      if (found) {
                        setNewMeetingForm({
                          date: found.date || found.dateFormatted || new Date().toISOString().split('T')[0],
                          type: found.type || 'Seminarium',
                          title: found.title || '',
                          speaker: found.speaker || '',
                          attendeesCount: typeof found.attendeesCount === 'number'
                            ? found.attendeesCount
                            : (Array.isArray(found.attendees) ? found.attendees.length : 0),
                        });
                      }
                    }}
                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 font-sans focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Wybierz spotkanie (np. M05 Journal Club Trauma) --</option>
                    {legitimateMeetings.map(m => (
                      <option key={m.code || m.id} value={m.code || m.id}>
                        [{m.code || m.id} • {m.dateFormatted || m.date}] {m.title.slice(0, 55)}... ({m.speaker})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Editable Fields Form */}
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Data spotkania:</label>
                    <input
                      type="text"
                      value={newMeetingForm.date}
                      onChange={(e) => setNewMeetingForm(prev => ({ ...prev, date: e.target.value }))}
                      placeholder="np. 16.02.2026"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Rodzaj spotkania:</label>
                    <input
                      type="text"
                      value={newMeetingForm.type}
                      onChange={(e) => setNewMeetingForm(prev => ({ ...prev, type: e.target.value }))}
                      placeholder="np. Journal Club"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Temat merytoryczny:</label>
                  <textarea
                    rows={2}
                    value={newMeetingForm.title}
                    onChange={(e) => setNewMeetingForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Wpisz pełny temat spotkania merytorycznego..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">Prowadzący / Prelegenci:</label>
                    <input
                      type="text"
                      value={newMeetingForm.speaker}
                      onChange={(e) => setNewMeetingForm(prev => ({ ...prev, speaker: e.target.value }))}
                      placeholder="np. Jan Kowalski, Anna Nowak"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Uczestnicy:</label>
                    <input
                      type="number"
                      value={newMeetingForm.attendeesCount}
                      onChange={(e) => setNewMeetingForm(prev => ({ ...prev, attendeesCount: Number(e.target.value) }))}
                      placeholder="0"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-mono text-center"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddMeetingModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleInsertMeeting}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-900/20 transition-all cursor-pointer"
              >
                <Check size={14} />
                <span>✓ Wstaw do sprawozdania</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Issued Documents Registry Modal (Ewidencja Wydanych Aktów) ────── */}
      {isRegistryOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-150 print:hidden">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden font-sans">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Oficjalny Rejestr i Ewidencja Wydanych Dokumentów
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-mono">
                      {issuedRegistry.length} pozycji
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {currentOrg?.name || 'Koło Naukowe'} • Ewidencja zaświadczeń, dyplomów i aktów z numeracją
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintRegistryProtocol}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition cursor-pointer"
                  title="Drukuj oficjalny protokół zestawienia dla Dziekanatu i PKA"
                >
                  <Printer size={14} />
                  <span>Drukuj Zestawienie (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRegistryOpen(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Filter & Action Controls Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                {/* Search Bar */}
                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={registrySearchQuery}
                    onChange={(e) => setRegistrySearchQuery(e.target.value)}
                    placeholder="Szukaj po nazwisku, nr albumu, sygnaturze..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                  />
                  {registrySearchQuery && (
                    <button
                      onClick={() => setRegistrySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Type Filter */}
                <select
                  value={registryTypeFilter}
                  onChange={(e) => setRegistryTypeFilter(e.target.value)}
                  className="py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="all">Wszystkie typy aktów</option>
                  <option value="Zaświadczenie Członka">Zaświadczenia Członków</option>
                  <option value="Dyplom Prelegenta">Dyplomy Prelegentów</option>
                  <option value="Zaświadczenie Zarządu">Zaświadczenia Zarządu</option>
                  <option value="Tabela Zbiorcza Spotkań">Tabele Spotkań</option>
                  <option value="Ewidencja Członków">Ewidencje Członków</option>
                  <option value="Protokół Sprawozdawczy dla Dziekanatu">Protokoły Dziekanatu</option>
                </select>
              </div>

              {/* Add Manual Record Button */}
              <button
                type="button"
                onClick={() => handleOpenManualModal()}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
              >
                <Plus size={14} />
                <span>Dopisz ręcznie dokument</span>
              </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/70">
                    <th className="py-2.5 px-3 text-center w-10">Lp.</th>
                    <th className="py-2.5 px-3 w-44">Sygnatura / Nr Aktu</th>
                    <th className="py-2.5 px-3 w-40">Typ Dokumentu</th>
                    <th className="py-2.5 px-3">Odbiorca (Nr Albumu)</th>
                    <th className="py-2.5 px-3 text-center w-24">Data Wydania</th>
                    <th className="py-2.5 px-3">Przedmiot / Szczegóły</th>
                    <th className="py-2.5 px-3 text-center w-28">Status</th>
                    <th className="py-2.5 px-3 text-right w-20">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredRegistry.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 italic">
                        Brak wpisów w ewidencji spełniających kryteria wyszukiwania.
                      </td>
                    </tr>
                  ) : (
                    filteredRegistry.map((doc, idx) => {
                      let typePillClass = 'bg-slate-100 text-slate-700 border-slate-200';
                      if (doc.type?.includes('Prelegent') || doc.type?.includes('Dyplom')) {
                        typePillClass = 'bg-amber-50 text-amber-800 border-amber-200';
                      } else if (doc.type?.includes('Członk')) {
                        typePillClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                      } else if (doc.type?.includes('Zarząd')) {
                        typePillClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
                      }

                      return (
                        <tr key={doc.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-950">
                            {doc.id}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${typePillClass}`}>
                              {doc.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {doc.recipientName} {doc.recipientIndex && doc.recipientIndex !== '—' && (
                              <span className="font-mono text-slate-500 font-semibold">({doc.recipientIndex})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                            {doc.issueDate}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-[220px] truncate" title={doc.details}>
                            {doc.details || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ✓ {doc.status || 'Wydany'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenManualModal(doc)}
                                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                                title="Edytuj wpis"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRegistryEntry(doc.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Usuń z rejestru"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>Wszystkie dokumenty rejestrowane są w pamięci koła naukowego ({currentOrg?.shortName || currentOrg?.name}).</span>
              <button
                type="button"
                onClick={() => setIsRegistryOpen(false)}
                className="px-4 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-semibold transition cursor-pointer"
              >
                Zamknij
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Manual Document Add / Edit Modal ───────────────────────────────── */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-in fade-in duration-150 print:hidden">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden font-sans">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Award size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {editingEntry ? 'Edycja Wpisu w Rejestrze' : 'Dopisz Dokument do Rejestru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {currentOrg?.name} • Rok akademicki {manualForm.academicYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualEntry} className="p-4 sm:p-6 space-y-3.5 text-xs">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Typ Dokumentu:</label>
                <select
                  value={manualForm.type}
                  onChange={(e) => setManualForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Zaświadczenie Członka">Zaświadczenie Członka</option>
                  <option value="Dyplom Prelegenta">Dyplom Prelegenta</option>
                  <option value="Zaświadczenie Zarządu">Zaświadczenie Zarządu</option>
                  <option value="Tabela Zbiorcza Spotkań">Tabela Zbiorcza Spotkań</option>
                  <option value="Ewidencja Członków">Ewidencja Członków</option>
                  <option value="Protokół Sprawozdawczy dla Dziekanatu">Protokół Sprawozdawczy dla Dziekanatu</option>
                  <option value="Inny Akt Koła">Inny Akt Koła</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Sygnatura / Nr Aktu:</label>
                  <input
                    type="text"
                    required
                    value={manualForm.id}
                    onChange={(e) => setManualForm(prev => ({ ...prev, id: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-indigo-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Data Wydania:</label>
                  <input
                    type="date"
                    required
                    value={manualForm.issueDate}
                    onChange={(e) => setManualForm(prev => ({ ...prev, issueDate: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">Imię i Nazwisko Odbiorcy:</label>
                  <input
                    type="text"
                    required
                    value={manualForm.recipientName}
                    onChange={(e) => setManualForm(prev => ({ ...prev, recipientName: e.target.value }))}
                    placeholder="np. Anna Nowak"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nr Albumu (Indeks):</label>
                  <input
                    type="text"
                    value={manualForm.recipientIndex}
                    onChange={(e) => setManualForm(prev => ({ ...prev, recipientIndex: e.target.value }))}
                    placeholder="26535"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Przedmiot / Temat / Opis:</label>
                <textarea
                  rows={2}
                  value={manualForm.details}
                  onChange={(e) => setManualForm(prev => ({ ...prev, details: e.target.value }))}
                  placeholder="np. Referat: Historia profilaktyki uzależnień"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Zapisz w ewidencji</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
