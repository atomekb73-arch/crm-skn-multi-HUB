import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  CalendarDays,
  Wrench,
  RefreshCw,
  WifiOff,
  CheckCircle2,
  X,
  Settings,
  ChevronDown,
  Building2,
  FileText,
  FolderKanban,
  Microscope,
} from 'lucide-react';
import ManagementTab from './components/ManagementTab';
import QuarantineTab from './components/QuarantineTab';
import MeetingsTab   from './components/MeetingsTab';
import DocumentsRepositoryTab from './components/DocumentsRepositoryTab';
import ResearchTab   from './components/ResearchTab';
import ReportsTab    from './components/ReportsTab';
import ToolsTab      from './components/ToolsTab';
import SettingsTab   from './components/SettingsTab';
import Navbar        from './components/Navbar';
import SettingsModal from './components/SettingsModal';
import ProfileMenu   from './components/ProfileMenu';
import SyncIndicator from './components/SyncIndicator';
import ErrorBoundary from './components/ErrorBoundary';
import LoginScreen from './components/LoginScreen';
import SknApplicationForm from './components/SknApplicationForm';
import { supabase, isValidUUID, fetchAllTenantRows } from './supabaseClient';
import { useAuth } from './context/AuthContext';
import { useOrg } from './context/OrgContext';
import { getTenantTheme } from './theme/tenantTheme';
import { useSettings } from './context/SettingsContext';
import { useAcademicYear } from './context/AcademicYearContext';
import { fetchTeamupEvents, fetchTeamupSubcalendars, DEFAULT_SUBCALENDAR_ID, getCachedTeamupEvents, getCachedTeamupSubcalendars } from './services/teamupService';
import { useCachedData, useCachedFetch, readSWRData, writeSWRData, CACHE_KEYS } from './hooks/useCachedData';
import { materials, initialMembers, initialMeetings } from './data/mockData';
import { getRecordKey, getAcademicYearFromDate } from './utils/helpers';
import { getAcademicYearKey, getCurrentAcademicYear } from './utils/academicYear';
import { getCanonicalMeetingsForOrg, filterLegitimateMeetings } from './utils/canonicalMeetings';
import { getMeetingType, calculateCategorizedFrequency, calculateMemberStats, isMeetingEligibleForDenominator, MEETING_TYPES, hasMeetingAttendanceLogs } from './utils/meetingTypes';
import { isMemberActive, isMemberGuest, isMemberInactive, isMemberArchived, hasMailingConsent } from './utils/memberFilters';
import { normalizeDiacritics, isFacultySupervisor } from './utils/specialRoles';
import { uniqueTenures, deduplicateBoard, deduplicateBoardTenures, DEFAULT_BOARD_TENURES_SEKSUOLOGIA, getDefaultBoardTenuresForOrg } from './services/settingsService';
import { buildAttendanceIndex, precompileMeetings } from './utils/attendanceIndexer';
import { calculateMemberAttendance } from './utils/attendanceCalculator';
import { isEwidencjaInAcademicScope, isEwidencjaMatchForMeeting } from './utils/academicScope';
import {
  getOrgKey,
  createOrgSnapshot,
  getBlacklistedMembers,
  addMemberToBlacklist,
  isMemberBlacklisted,
  getMeetingsTrash,
  getIgnoredMeetings,
  getCustomMeetings,
  getMeetingOverrides,
  getCorrespondenceLog,
  setOrgStorage,
} from './utils/storage';

const TABS = [
  { id: 'management', label: 'Zarządzanie',                   icon: LayoutDashboard },
  { id: 'quarantine', label: 'Kwarantanna',                    icon: ShieldAlert },
  { id: 'meetings',   label: 'Spotkania & Obecność',           icon: CalendarDays },
  { id: 'documents',  label: 'Dokumenty & Uchwały',            icon: FolderKanban },
  { id: 'research',   label: 'Dorobek & Badania',              icon: Microscope },
  { id: 'reports',    label: 'Sprawozdawczość & Dokumenty',    icon: FileText },
  { id: 'tools',      label: 'Narzędzia & Mailing',            icon: Wrench },
  { id: 'settings',   label: 'Ustawienia & Dostęp',            icon: Settings },
];

// Sanitization: Complete elimination of local cache overrides (Single Source of Truth)
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('crm_archived_row_ids');
    localStorage.removeItem('crm_custom_overrides');
    localStorage.removeItem('crm_archived_keys');
    ['skn_psychoonkologii', 'skn_seksuologii', 'sknu', 'default'].forEach(org => {
      localStorage.removeItem(`crm_psychoonkologia_${org}_crm_archived_row_ids`);
      localStorage.removeItem(`crm_psychoonkologia_${org}_crm_custom_overrides`);
      localStorage.removeItem(`crm_${org}_crm_archived_row_ids`);
      localStorage.removeItem(`crm_${org}_crm_custom_overrides`);
    });
  } catch {}
}



// Jednorazowy reset starych, zbyt dużych kluczy (> 2MB) powodujących QuotaExceededError
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    ['CACHE_APP_STATE_SNAPSHOT', 'CACHE_APP_STATE_SNAPSHOT_skn-template'].forEach(k => {
      const item = localStorage.getItem(k);
      if (item && item.length > 2000000) { // jeśli klucz ma > 2MB
        console.warn(`[SWR] Usuwanie przerośniętego klucza ${k} (${(item.length / 1024 / 1024).toFixed(2)} MB)...`);
        localStorage.removeItem(k);
      }
    });
  }
} catch (e) {
  console.warn('[SWR] Błąd podczas czyszczenia przerośniętych kluczy:', e);
}

export default function App() {
  const { user, isAuthenticated } = useAuth();
  const { currentOrg, organizations, switchOrg, getStorageKey, theme } = useOrg();
  const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
  const { attendanceConfig } = useSettings();
  const [activeTab, setActiveTabState] = useState(() => {
    try {
      return sessionStorage.getItem('crm_skn_active_tab') || 'members';
    } catch {
      return 'members';
    }
  });
  const setActiveTab = useCallback((tab) => {
    startTransition(() => {
      setActiveTabState(tab);
    });
    try {
      sessionStorage.setItem('crm_skn_active_tab', tab);
    } catch {}
  }, []);

  const [membersSubTab, setMembersSubTabState] = useState(() => {
    try {
      return sessionStorage.getItem('crm_skn_members_subtab') || 'management';
    } catch {
      return 'management';
    }
  });
  const setMembersSubTab = useCallback((subTab) => {
    startTransition(() => {
      setMembersSubTabState(subTab);
    });
    try {
      sessionStorage.setItem('crm_skn_members_subtab', subTab);
    } catch {}
  }, []);

  const [documentationSubTab, setDocumentationSubTabState] = useState(() => {
    try {
      return sessionStorage.getItem('crm_skn_doc_subtab') || 'reports';
    } catch {
      return 'reports';
    }
  });
  const setDocumentationSubTab = useCallback((subTab) => {
    startTransition(() => {
      setDocumentationSubTabState(subTab);
    });
    try {
      sessionStorage.setItem('crm_skn_doc_subtab', subTab);
    } catch {}
  }, []);

  const [settingsToolsSubTab, setSettingsToolsSubTabState] = useState(() => {
    try {
      return sessionStorage.getItem('crm_skn_settings_subtab') || 'settings';
    } catch {
      return 'settings';
    }
  });
  const setSettingsToolsSubTab = useCallback((subTab) => {
    startTransition(() => {
      setSettingsToolsSubTabState(subTab);
    });
    try {
      sessionStorage.setItem('crm_skn_settings_subtab', subTab);
    } catch {}
  }, []);

  const activeOrgIdRef = useRef(currentOrgCleanId);
  activeOrgIdRef.current = currentOrgCleanId;
  const loadedOrgIdRef = useRef(null);
  const loadRequestIdRef = useRef(0);

  // ── Stale-While-Revalidate (SWR): Instant 0ms synchronous cache hydration ──
  const initialSWRState = useMemo(() => {
    try {
      const activeOrgId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
      const snapshotKey = `${CACHE_KEYS.APP_STATE_SNAPSHOT}_${activeOrgId}`;
      const rawSnapshot = readSWRData(snapshotKey);
      const snapshot = rawSnapshot?.data || rawSnapshot;

      if (snapshot && snapshot.orgId && snapshot.orgId !== activeOrgId) {
        return null;
      }

      // Zabezpieczenie przed przywracaniem zdublowanych kadencji zarządu ze snapshotu SWR
      if (typeof window !== 'undefined' && window.localStorage) {
        if (snapshot && Array.isArray(snapshot.boardTenures)) {
          let cleanTenures = deduplicateBoard(snapshot.boardTenures, activeOrgId);
          if (cleanTenures.length === 0) {
            cleanTenures = getDefaultBoardTenuresForOrg(activeOrgId);
          }
          localStorage.setItem(`skn_board_tenures_${activeOrgId}`, JSON.stringify(cleanTenures));
        } else {
          const rawTenures = localStorage.getItem(`skn_board_tenures_${activeOrgId}`);
          if (rawTenures) {
            try {
              const parsed = JSON.parse(rawTenures);
              if (Array.isArray(parsed)) {
                let cleanTenures = deduplicateBoard(parsed, activeOrgId);
                if (cleanTenures.length === 0) {
                  cleanTenures = getDefaultBoardTenuresForOrg(activeOrgId);
                }
                localStorage.setItem(`skn_board_tenures_${activeOrgId}`, JSON.stringify(cleanTenures));
              }
            } catch {}
          } else {
            const defaults = getDefaultBoardTenuresForOrg(activeOrgId);
            if (defaults.length > 0) {
              localStorage.setItem(`skn_board_tenures_${activeOrgId}`, JSON.stringify(defaults));
            }
          }
        }
      }

      if (snapshot && Array.isArray(snapshot.members) && (snapshot.members.length > 0 || (snapshot.quarantine && snapshot.quarantine.length > 0))) {
        const memberIdxSet = new Set((snapshot.members || []).map(m => String(m.index || m.nrIndeksu || '').replace(/\D/g, '').trim()).filter(Boolean));
        const memberEmailSet = new Set((snapshot.members || []).map(m => String(m.email || '').toLowerCase().trim()).filter(Boolean));
        const memberNameSet = new Set((snapshot.members || []).map(m => String(m.fullName || m.imieNazwisko || '').toLowerCase().trim()).filter(Boolean));

        const effectiveQuarantine = (Array.isArray(snapshot.quarantine) ? snapshot.quarantine : []).filter(q => {
          const qIdx = String(q.index || q.nrIndeksu || '').replace(/\D/g, '').trim();
          const qEmail = String(q.email || '').toLowerCase().trim();
          const qName = String(q.fullName || q.imieNazwisko || '').toLowerCase().trim();
          const isApproved = q.statusWeryfikacji === 'Zatwierdzony' || q.status === 'active';
          const alreadyInMembers = (qIdx && memberIdxSet.has(qIdx)) || (qEmail && memberEmailSet.has(qEmail)) || (qName && memberNameSet.has(qName));
          return !alreadyInMembers && !isApproved;
        });

        const effectiveArchived = Array.isArray(snapshot.archivedQuarantine) ? snapshot.archivedQuarantine : [];
        loadedOrgIdRef.current = activeOrgId;

        return {
          members: snapshot.members,
          quarantine: effectiveQuarantine,
          archivedQuarantine: effectiveArchived,
          meetings: Array.isArray(snapshot.meetings) && snapshot.meetings.length > 0
            ? snapshot.meetings
            : (getCanonicalMeetingsForOrg(activeOrgId) || []),
          lastSync: snapshot.timestamp ? new Date(snapshot.timestamp) : new Date(),
        };
      }
    } catch (e) {
      console.warn('[SWR] Błąd odczytu stanu początkowego z pamięci podręcznej:', e);
    }
    return null;
  }, [currentOrg?.id]);

  // Master Data State (0ms hydrated from SWR cache if available)
  const [members, setMembers]       = useState(() => initialSWRState?.members || (currentOrgCleanId === 'skn_seksuologii' ? initialMembers : []));
  const [quarantine, setQuarantine] = useState(() => initialSWRState?.quarantine || []);
  const [archivedQuarantine, setArchivedQuarantine] = useState(() => initialSWRState?.archivedQuarantine || []);
  const [approvedKeys, setApprovedKeys] = useState([]);
  const [archivedRowIds, setArchivedRowIds] = useState([]);
  const [resignedKeys, setResignedKeys] = useState([]);

  // Teamup Meetings State & Academic Year Filter (0ms hydrated from SWR cache if available)
  const [meetings, setMeetings]     = useState(() => initialSWRState?.meetings || getCanonicalMeetingsForOrg(currentOrg?.id) || []);
  const [subcalendars, setSubcalendars] = useState(() => {
    const cachedSubs = getCachedTeamupSubcalendars();
    return (Array.isArray(cachedSubs) && cachedSubs.length > 0)
      ? cachedSubs
      : [{ id: DEFAULT_SUBCALENDAR_ID || '', name: 'Główne spotkania koła' }];
  });
  const [selectedSubcalendar, setSelectedSubcalendar] = useState(() => currentOrg?.subcalendarId || DEFAULT_SUBCALENDAR_ID || '14518766');

  // Synchronizacja wybranego podkalendarza przy przełączeniu organizacji
  useEffect(() => {
    if (currentOrg?.subcalendarId) {
      setSelectedSubcalendar(currentOrg.subcalendarId);
    }
  }, [currentOrg?.id, currentOrg?.subcalendarId]);

  // Persistent Academic Year via AcademicYearContext
  const {
    academicYear,
    setAcademicYear,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getRangeForYear,
    currentScope,
  } = useAcademicYear();

  const [pendingSyncCount, setPendingSyncCount] = useState(() => {
    try {
      const saved = localStorage.getItem(getStorageKey('crm_pending_sync_count'));
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(getStorageKey('crm_pending_sync_count'), String(pendingSyncCount));
    } catch {}
  }, [pendingSyncCount, currentOrg]);

  // Helper: tworzy płytki (shallow) obiekt członka bez ciężkich historii/surowych JSONów
  const toShallowMember = (m) => {
    if (!m) return null;
    const nrIndeksu = m.nrIndeksu || m.index || m.cleanIndex || '';
    const cleanIndex = m.cleanIndex || String(nrIndeksu).replace(/\D/g, '');
    const imieNazwisko = m.imieNazwisko || m.fullName || '';
    const kierunek = m.kierunek || m.field || '';
    const rokStudiow = m.rokStudiow || m.year || '';
    const kierunekRok = m.kierunekRok || (kierunek && rokStudiow ? `${kierunek} / ${rokStudiow}` : kierunek || rokStudiow);

    return {
      id: m.id,
      imieNazwisko,
      fullName: m.fullName || imieNazwisko,
      email: m.email || '',
      nrIndeksu,
      index: m.index || nrIndeksu,
      cleanIndex,
      kierunek,
      field: m.field || kierunek,
      rokStudiow,
      year: m.year || rokStudiow,
      kierunekRok,
      status: m.status || 'active',
      statusWeryfikacji: m.statusWeryfikacji || '',
      frekwencja: m.frekwencja || m.attendance || 0,
      punkty: m.punkty || m.points || 0,
      zgodaMailing: m.zgodaMailing || false,
      mailingConsent: m.mailingConsent || m.zgodaMailing || false,
      aliasy: m.aliasy || m.aliases || '',
      telefon: m.telefon || '',
      uwagi: m.uwagi ? String(m.uwagi).slice(0, 100) : '',
    };
  };

  const toShallowMeeting = (mtg) => {
    if (!mtg) return null;
    const attCount = mtg.attendanceCount !== undefined && mtg.attendanceCount !== null
      ? Number(mtg.attendanceCount)
      : (mtg.attendeesCount !== undefined && mtg.attendeesCount !== null
        ? Number(mtg.attendeesCount)
        : (Array.isArray(mtg.attendees) ? mtg.attendees.length : 0));

    return {
      id: mtg.id,
      code: mtg.code,
      title: mtg.title,
      date: mtg.date,
      start_dt: mtg.start_dt || mtg.date,
      end_dt: mtg.end_dt,
      formattedDate: mtg.formattedDate,
      type: mtg.type || mtg.meetingType,
      speaker: mtg.speaker || mtg.who,
      status: mtg.status,
      isUpcoming: mtg.isUpcoming,
      countsInFrequency: mtg.countsInFrequency !== undefined ? mtg.countsInFrequency : true,
      attendanceCount: attCount,
      attendeesCount: attCount,
      attendees: Array.isArray(mtg.attendees) ? mtg.attendees : [],
      academicYear: mtg.academicYear,
    };
  };

  // Keep SWR APP_STATE_SNAPSHOT updated whenever members, quarantine, archivedQuarantine, or meetings change (Shallow payload, debounced)
  useEffect(() => {
    if (members.length === 0 && quarantine.length === 0 && archivedQuarantine.length === 0) return;
    const targetOrgId = currentOrgCleanId;
    // Blokada zapisu snapshotu, dopóki dane dla nowego koła nie zostaną oficjalnie załadowane (ochrona przed skażeniem stanu przy przełączaniu kół)
    if (!targetOrgId || loadedOrgIdRef.current !== targetOrgId) return;

    const timer = setTimeout(() => {
      if (activeOrgIdRef.current !== targetOrgId || loadedOrgIdRef.current !== targetOrgId) return;
      try {
        const payload = {
          orgId: targetOrgId,
          members: members.map(toShallowMember).filter(Boolean),
          quarantine: quarantine.map(toShallowMember).filter(Boolean),
          archivedQuarantine: archivedQuarantine.map(toShallowMember).filter(Boolean),
          meetings: meetings.map(toShallowMeeting).filter(Boolean),
          timestamp: Date.now(),
        };
        const snapshotKey = `${CACHE_KEYS.APP_STATE_SNAPSHOT}_${targetOrgId}`;
        writeSWRData(snapshotKey, payload);
      } catch (err) {
        console.warn('[App] Pominięto zapis snapshotu stanu:', err);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [members, quarantine, archivedQuarantine, meetings, currentOrgCleanId]);

  // Data Loss Prevention: warn user before closing/reloading page if there are unsynced changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (pendingSyncCount > 0) {
        e.preventDefault();
        e.returnValue = 'Masz niezsynchronizowane zmiany. Czy na pewno chcesz opuścić stronę?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pendingSyncCount]);

  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Centralny timer zamykania powiadomień toast (likwidacja wyścigów timerów)
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Globalny nasłuchiwacz zdarzeń toast dla całej aplikacji
  useEffect(() => {
    const handleCustomToast = (e) => {
      if (e?.detail) {
        setToastMessage(typeof e.detail === 'string' ? e.detail : e.detail.message || String(e.detail));
      }
    };
    window.addEventListener('crm-toast', handleCustomToast);
    return () => window.removeEventListener('crm-toast', handleCustomToast);
  }, []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [reportsTarget, setReportsTarget] = useState({ member: null, docType: 'membership' });

  const handleNavigateToReports = useCallback((member, docType = 'membership') => {
    setReportsTarget({ member, docType });
    setActiveTab('documentation');
    setDocumentationSubTab('reports');
  }, [setActiveTab, setDocumentationSubTab]);

  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastSync, setLastSync]     = useState(() => initialSWRState?.lastSync || null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState({
    status: 'synced',
    lastSyncTime: initialSWRState?.lastSync || null,
    errorMessage: null,
  });

  const loadDataInFlightRef = useRef(false);
  const prevOrgIdRef = useRef(null);
  const loadDataRef = useRef(null);
  const hasCachedDataRef = useRef(Boolean(initialSWRState));

  const mergeMeetingWithLocalStorage = useCallback((m) => {
    if (!m) return m;
    const cleanCode = String(m.code || '').replace(/^\[.*?\]\s*/, '').trim();
    const keys = [
      getStorageKey(`crm_attendance_${m.id}`),
      getStorageKey(`crm_attendance_${m.date}`),
      m.code ? getStorageKey(`crm_attendance_${m.code}`) : null,
      cleanCode ? getStorageKey(`crm_attendance_${cleanCode}`) : null,
    ].filter(Boolean);

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            // Weryfikacja spójności daty i roku akademickiego
            if (parsed.date && m.date && parsed.date !== m.date) continue;
            if (parsed.code && m.code) {
              const pHas2526 = parsed.code.includes('25/26');
              const pHas2627 = parsed.code.includes('26/27');
              const mHas2526 = m.code.includes('25/26');
              const mHas2627 = m.code.includes('26/27');
              if ((pHas2526 && mHas2627) || (pHas2627 && mHas2526)) continue;
            }
            if (Array.isArray(parsed)) {
              const confirmed = parsed
                .filter(p => p.manualApproved && p.member?.index)
                .map(p => p.member.index);
              return {
                ...m,
                attendees: confirmed,
                attendeesCount: confirmed.length,
                attendanceCount: confirmed.length,
                participantRecords: parsed,
              };
            } else if (parsed.confirmedIndexes || parsed.attendees) {
              const confirmed = parsed.confirmedIndexes || (
                Array.isArray(parsed.attendees)
                  ? parsed.attendees.filter(p => p.manualApproved && p.member?.index).map(p => p.member.index)
                  : []
              );
              const count = parsed.confirmedCount !== undefined ? parsed.confirmedCount : confirmed.length;
              return {
                ...m,
                attendees: confirmed,
                attendeesCount: count,
                attendanceCount: count,
                participantRecords: Array.isArray(parsed.attendees) ? parsed.attendees : [],
              };
            }
          }
        }
      } catch {}
    }
    return m;
  }, [getStorageKey]);

  // ── Fetch Teamup Meetings ──────────────────────────────────────────────────
  const loadMeetings = useCallback(async (
    subId = selectedSubcalendar,
    yr = academicYear,
    cStart = customStartDate,
    cEnd = customEndDate,
    sheetAttendanceMap = null,
    preFetchedMeetings = undefined,
    silentMeetings = false,
    bypassCache = false
  ) => {
    const targetOrgId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
    const isTestOrg = targetOrgId === 'test';
    if (!silentMeetings) {
      setLoadingMeetings(true);
    }
    try {
      const { startDate, endDate, yearPrefix } = getRangeForYear(yr, cStart, cEnd);
      const effectiveSubId = isTestOrg ? 'test_subcal' : (subId || currentOrg?.subcalendarId || DEFAULT_SUBCALENDAR_ID || '14518766');
      const effectiveCalId = currentOrg?.calendarKey || currentOrg?.calendarId || 'ks9aiux4jiza1ronpd';
      const effectiveToken = currentOrg?.teamupApiKey || currentOrg?.teamupToken || '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112';

      // W instancji testowej korzystamy z autonomicznych spotkań lokalnych bez odpytywania Teamup
      const fetchedMeetings = preFetchedMeetings !== undefined
        ? preFetchedMeetings
        : isTestOrg
          ? getCanonicalMeetingsForOrg('test')
          : await fetchTeamupEvents({
              startDate,
              endDate,
              subcalendarId: effectiveSubId,
              calendarId: effectiveCalId,
              token: effectiveToken,
              yearPrefix,
              bypassCache,
            });

      // Race condition guard: jeśli w trakcie pobierania przełączono organizację, odrzuć wynik
      if (activeOrgIdRef.current !== targetOrgId) {
        return;
      }

      let legitimateMeetings = [];
      if (fetchedMeetings && fetchedMeetings.length > 0) {
        legitimateMeetings = filterLegitimateMeetings(fetchedMeetings, currentOrg.id);
      } else {
        legitimateMeetings = getCanonicalMeetingsForOrg(currentOrg.id);
      }

      // Dodatkowe, ścisłe zabezpieczenie: filtruj wydarzenia po dacie roku akademickiego
      legitimateMeetings = legitimateMeetings.filter(m => {
        const mDate = m.date || (m.start_dt ? m.start_dt.split('T')[0] : '');
        if (startDate && mDate && mDate < startDate) return false;
        if (endDate && mDate && mDate > endDate) return false;
        return true;
      });

      const trash = getMeetingsTrash(currentOrg.id);
      const ignored = getIgnoredMeetings(currentOrg.id);
      const trashIds = new Set([
        ...trash.map(t => t.id ? String(t.id).trim() : null),
        ...trash.map(t => t.code ? String(t.code).trim() : null),
        ...trash.map(t => t.code ? String(t.code).trim().replace(/[\[\]]/g, '') : null),
        ...ignored.map(id => String(id).trim()),
        ...ignored.map(id => String(id).trim().replace(/[\[\]]/g, ''))
      ].filter(Boolean));

      const customMeetings = getCustomMeetings(currentOrg.id);
      const overrides = getMeetingOverrides(currentOrg.id);

      // Scal ze spotkaniami dodanymi ręcznie
      const allMeetings = [...legitimateMeetings];
      customMeetings.forEach(cm => {
        if (!allMeetings.some(m => (m.id && cm.id && m.id === cm.id) || (m.code && cm.code && m.code === cm.code))) {
          allMeetings.push(cm);
        }
      });

      // Odfiltruj Kosz i ignorowane spotkania (WYŁĄCZNIE po ID i kodzie, nigdy po samej dacie!)
      const finalMeetings = allMeetings
        .filter(m => {
          const mId = m.id ? String(m.id).trim() : '';
          const mCode = m.code ? String(m.code).trim() : '';
          const cleanCode = mCode ? mCode.replace(/[\[\]]/g, '') : '';
          return !trashIds.has(mId) && !trashIds.has(mCode) && !trashIds.has(cleanCode);
        })
        .map(m => {
          const ov = overrides[m.id] || overrides[m.code];
          return ov ? { ...m, ...ov, code: ov.code || m.code } : m;
        });

      // Zastosuj frekwencję z bazy Supabase jako Jedyne Źródło Prawdy (SSOT)
      let effectiveSheetAttendanceMap = sheetAttendanceMap;
      if (!effectiveSheetAttendanceMap && typeof window !== 'undefined' && window.localStorage) {
        try {
          const rawEw = localStorage.getItem(getOrgKey(currentOrg.id, 'crm_ewidencja'));
          if (rawEw) {
            const parsedEw = JSON.parse(rawEw);
            if (Array.isArray(parsedEw) && parsedEw.length > 0) {
              effectiveSheetAttendanceMap = {};
              parsedEw.forEach(item => {
                const rawCode = String(item.kodSpotkania || '').trim();
                if (!rawCode) return;
                const cleanCode = rawCode.toUpperCase().replace(/^\[.*?\]\s*/, '');
                if (!effectiveSheetAttendanceMap[rawCode]) effectiveSheetAttendanceMap[rawCode] = [];
                effectiveSheetAttendanceMap[rawCode].push(item);
                if (cleanCode && cleanCode !== rawCode) {
                  if (!effectiveSheetAttendanceMap[cleanCode]) effectiveSheetAttendanceMap[cleanCode] = [];
                  effectiveSheetAttendanceMap[cleanCode].push(item);
                }
              });
            }
          }
        } catch {}
      }

      const syncedMeetings = finalMeetings.map(m => {
        if (effectiveSheetAttendanceMap) {
          const rawCode = String(m.code || m.id || '').toUpperCase().trim();
          const cleanCode = rawCode.replace(/^\[.*?\]\s*/, '');
          
          let sheetRecords = null;
          if (effectiveSheetAttendanceMap[m.code]) {
            sheetRecords = effectiveSheetAttendanceMap[m.code];
          } else if (rawCode && effectiveSheetAttendanceMap[rawCode]) {
            sheetRecords = effectiveSheetAttendanceMap[rawCode];
          } else if (cleanCode && effectiveSheetAttendanceMap[cleanCode]) {
            sheetRecords = effectiveSheetAttendanceMap[cleanCode];
          }

          if (!sheetRecords) {
            for (const [k, records] of Object.entries(effectiveSheetAttendanceMap)) {
              const kClean = k.toUpperCase().trim().replace(/^\[.*?\]\s*/, '');
              if (kClean === cleanCode || k.toUpperCase().includes(cleanCode)) {
                sheetRecords = records;
                break;
              }
            }
          }

          // Rygorystyczna filtracja rekordów: weryfikuj dopasowanie do daty i roku spotkania oraz unikaj duplikatów
          let uniqueRecords = [];
          if (Array.isArray(sheetRecords) && sheetRecords.length > 0) {
            const seenPersons = new Set();
            for (const rec of sheetRecords) {
              if (!isEwidencjaMatchForMeeting(rec, m)) continue;
              const personId = String(rec.nrIndeksu || rec.index || rec.identyfikator || rec.fullName || '').trim().toLowerCase();
              if (personId && !seenPersons.has(personId)) {
                seenPersons.add(personId);
                uniqueRecords.push(rec);
              }
            }
          }

          const attendeesList = uniqueRecords.map(p => p.index || p.nrIndeksu || p.fullName);
          const count = attendeesList.length;
          const acad = getAcademicYearFromDate(m.date || m.start_dt);
          return {
            ...m,
            academicYear: m.academicYear || acad.full,
            academicYearShort: m.academicYearShort || acad.short,
            academicYearCode: `[${acad.short}]`,
            attendees: attendeesList,
            attendeesCount: count,
            attendanceCount: count,
            participantRecords: uniqueRecords,
            status: count > 0 ? `Zakończone (${count})` : (m.isUpcoming ? 'Zaplanowane' : 'Nierozliczone'),
          };
        }
        const merged = mergeMeetingWithLocalStorage(m);
        const acad = getAcademicYearFromDate(merged.date || merged.start_dt);
        return {
          ...merged,
          academicYear: merged.academicYear || acad.full,
          academicYearShort: merged.academicYearShort || acad.short,
          academicYearCode: `[${acad.short}]`,
        };
      });

      startTransition(() => {
        setMeetings(prev => {
          try {
            if (JSON.stringify(prev) === JSON.stringify(syncedMeetings)) return prev;
          } catch {}
          return syncedMeetings;
        });
      });
    } catch (err) {
      console.error('Błąd pobierania spotkań:', err);
      const fallback = getCanonicalMeetingsForOrg(currentOrg.id);
      const trash = getMeetingsTrash(currentOrg.id);
      const trashIds = new Set(trash.map(t => String(t.id || t.code || t.date).trim()));
      const customMeetings = getCustomMeetings(currentOrg.id);
      const overrides = getMeetingOverrides(currentOrg.id);

      const allFallback = [...fallback];
      customMeetings.forEach(cm => {
        if (!allFallback.some(m => m.id === cm.id || (m.code && cm.code && m.code === cm.code))) {
          allFallback.push(cm);
        }
      });

      const finalFallback = allFallback
        .filter(m => !trashIds.has(String(m.id).trim()) && !trashIds.has(String(m.code).trim()))
        .map(m => {
          const ov = overrides[m.id] || overrides[m.code];
          return ov ? { ...m, ...ov, code: ov.code || m.code } : m;
        });

      const syncedFallback = finalFallback.map(m => {
        if (effectiveSheetAttendanceMap) {
          const rawCode = String(m.code || m.id || '').toUpperCase().trim();
          const cleanCode = rawCode.replace(/^\[.*?\]\s*/, '');

          let sheetRecords = null;
          if (effectiveSheetAttendanceMap[m.code]) {
            sheetRecords = effectiveSheetAttendanceMap[m.code];
          } else if (rawCode && effectiveSheetAttendanceMap[rawCode]) {
            sheetRecords = effectiveSheetAttendanceMap[rawCode];
          } else if (cleanCode && effectiveSheetAttendanceMap[cleanCode]) {
            sheetRecords = effectiveSheetAttendanceMap[cleanCode];
          }

          if (!sheetRecords) {
            for (const [k, records] of Object.entries(effectiveSheetAttendanceMap)) {
              const kClean = k.toUpperCase().trim().replace(/^\[.*?\]\s*/, '');
              if (kClean === cleanCode || k.toUpperCase().includes(cleanCode)) {
                sheetRecords = records;
                break;
              }
            }
          }

          // Rygorystyczna filtracja rekordów: weryfikuj dopasowanie do daty i roku spotkania oraz unikaj duplikatów
          let uniqueRecords = [];
          if (Array.isArray(sheetRecords) && sheetRecords.length > 0) {
            const seenPersons = new Set();
            for (const rec of sheetRecords) {
              if (!isEwidencjaMatchForMeeting(rec, m)) continue;
              const personId = String(rec.nrIndeksu || rec.index || rec.identyfikator || rec.fullName || '').trim().toLowerCase();
              if (personId && !seenPersons.has(personId)) {
                seenPersons.add(personId);
                uniqueRecords.push(rec);
              }
            }
          }

          const attendeesList = uniqueRecords.map(p => p.index || p.nrIndeksu || p.fullName);
          const count = attendeesList.length;
          const acad = getAcademicYearFromDate(m.date || m.start_dt);
          return {
            ...m,
            academicYear: m.academicYear || acad.full,
            academicYearShort: m.academicYearShort || acad.short,
            academicYearCode: `[${acad.short}]`,
            attendees: attendeesList,
            attendeesCount: count,
            attendanceCount: count,
            participantRecords: uniqueRecords,
            status: count > 0 ? `Zakończone (${count})` : (m.isUpcoming ? 'Zaplanowane' : 'Nierozliczone'),
          };
        }
        const merged = mergeMeetingWithLocalStorage(m);
        const acad = getAcademicYearFromDate(merged.date || merged.start_dt);
        return {
          ...merged,
          academicYear: merged.academicYear || acad.full,
          academicYearShort: merged.academicYearShort || acad.short,
          academicYearCode: `[${acad.short}]`,
        };
      });

      startTransition(() => {
        setMeetings(syncedFallback);
      });
    } finally {
      setLoadingMeetings(false);
    }
  }, [currentOrg?.id, currentOrg?.subcalendarId, getRangeForYear, mergeMeetingWithLocalStorage]);

  // ── Bufor pamięciowy (In-Memory Cache) dla zapytań Supabase SSOT (eliminacja nadmiarowych zapytań przy nawigacji) ──
  const supabaseDataCacheRef = useRef({
    dbMembers: null,
    qData: null,
    attData: null,
    subcals: null,
    timestamp: 0,
  });
  const lastSnapshotTimeRef = useRef(0);

  // ── Fetch All Live Data & Categorize by Approved/Archived/Resigned Keys (SWR Revalidation) ───
  const loadData = useCallback(async (options = {}) => {
    const { silent = false, force = false, bypassCache = false, sheetType = 'all' } = options || {};
    if (loadDataInFlightRef.current && !force) {
      return;
    }
    loadDataInFlightRef.current = true;
    const requestId = ++loadRequestIdRef.current;

    const isBackgroundRevalidation = silent || hasCachedDataRef.current;
    if (!isBackgroundRevalidation) {
      setLoading(true);
    }
    setError(null);
    setCloudSyncStatus(prev => ({ ...prev, status: 'saving', errorMessage: null }));

    try {
      const orgSheetId = currentOrg?.sheetId;
      const orgId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
      const { startDate, endDate, yearPrefix } = getRangeForYear(academicYear, customStartDate, customEndDate);
      const effectiveSubId = currentOrg?.subcalendarId || DEFAULT_SUBCALENDAR_ID || '14518766';
      const effectiveCalId = currentOrg?.calendarKey || currentOrg?.calendarId || 'ks9aiux4jiza1ronpd';
      const effectiveToken = currentOrg?.teamupApiKey || currentOrg?.teamupToken || '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112';

      // Sprawdzenie, czy dysponujemy świeżym buforem w pamięci RAM (TTL: 5 minut) dla wybranej organizacji
      const cacheNow = Date.now();
      const cacheEntry = supabaseDataCacheRef.current;
      const canUseMemoryCache =
        !bypassCache &&
        cacheEntry.orgId === orgId &&
        Array.isArray(cacheEntry.dbMembers) &&
        Array.isArray(cacheEntry.qData) &&
        Array.isArray(cacheEntry.attData) &&
        (cacheNow - cacheEntry.timestamp) < 5 * 60 * 1000;

      let dbMembers, mError, qData, qError, attData, attError, subcals, preFetchedEvents;

      if (canUseMemoryCache) {
        dbMembers = cacheEntry.dbMembers;
        qData = cacheEntry.qData;
        attData = cacheEntry.attData;
        subcals = cacheEntry.subcals || [];
        preFetchedEvents = await fetchTeamupEvents({
          startDate,
          endDate,
          subcalendarId: effectiveSubId,
          calendarId: effectiveCalId,
          token: effectiveToken,
          yearPrefix,
          bypassCache: false,
        }).catch(() => undefined);
      } else {
        // ── Supabase Single Source of Truth: pobranie members, quarantine_submissions oraz attendance dla wybranej organizacji ──
        [
          { data: dbMembers, error: mError },
          { data: qData, error: qError },
          { data: attData, error: attError },
          subcals,
          preFetchedEvents
        ] = await Promise.all([
          fetchAllTenantRows('members', orgId, { orderBy: 'full_name', ascending: true }),
          fetchAllTenantRows('quarantine_submissions', orgId, { orderBy: 'created_at', ascending: false }),
          fetchAllTenantRows('attendance', orgId),
          fetchTeamupSubcalendars(effectiveCalId, effectiveToken, effectiveSubId).catch(() => []),
          fetchTeamupEvents({
            startDate,
            endDate,
            subcalendarId: effectiveSubId,
            calendarId: effectiveCalId,
            token: effectiveToken,
            yearPrefix,
            bypassCache,
          }).catch(() => undefined),
        ]);

        if (!mError && !qError && !attError && activeOrgIdRef.current === orgId) {
          supabaseDataCacheRef.current = {
            orgId,
            dbMembers: dbMembers || [],
            qData: qData || [],
            attData: attData || [],
            subcals: subcals || [],
            timestamp: Date.now(),
          };
        }
      }

      // Race condition guard: jeśli w trakcie asynchronicznego pobierania przełączono organizację lub uruchomiono nowsze żądanie, porzuć ten wynik!
      if (requestId !== loadRequestIdRef.current || activeOrgIdRef.current !== orgId) {
        return;
      }

      if (mError) console.error('[loadData] Błąd pobierania members z Supabase:', mError);
      if (qError) console.error('[loadData] Błąd pobierania quarantine_submissions z Supabase:', qError);
      if (attError) console.error('[loadData] Błąd pobierania attendance z Supabase:', attError);

      // 1. Mapowanie członków z tabeli members w Supabase
      const allMembers = (dbMembers || []).map(m => {
        const field = m.field_of_study || 'Psychologia';
        const year = m.study_year || 'Rok 1';
        const isArch = m.activity_status === 'Archiwum' || m.activity_status === 'Usuniety' || m.activity_status === 'Odrzucony';
        const isSusp = m.activity_status === 'Zawieszony';
        const isGuest = m.activity_status === 'Gosc' || m.activity_status === 'guest';
        const isResigned = m.activity_status === 'Nieaktywny' || m.activity_status === 'resigned' || m.activity_status === 'inactive';
        const isGrad = m.activity_status === 'Absolwent' || m.activity_status === 'graduate';
        const isFinalSem = m.activity_status === 'Ostatni semestr' || m.activity_status === 'final_semester';

        let appStatus = 'active';
        if (isArch) appStatus = 'archived';
        else if (isGuest) appStatus = 'guest';
        else if (isResigned) appStatus = 'resigned';
        else if (isGrad) appStatus = 'graduate';
        else if (isFinalSem) appStatus = 'final_semester';

        const statusWeryf = isArch ? 'Archiwum' : (isSusp ? 'Zawieszony' : (isGrad ? 'Absolwent' : (isFinalSem ? 'Ostatni semestr' : (isGuest ? 'Gosc' : (isResigned ? 'Nieaktywny' : 'Zatwierdzony')))));

        return {
          id: m.id,
          supabaseId: m.id,
          index: m.index_number,
          nrIndeksu: m.index_number,
          cleanIndex: m.index_number,
          fullName: m.full_name,
          imieNazwisko: m.full_name,
          email: m.email,
          phone: m.phone || '',
          telefon: m.phone || '',
          field: field,
          kierunek: field,
          year: year,
          rokStudiow: year,
          kierunekRok: `${field} / ${year}`,
          status: appStatus,
          statusWeryfikacji: statusWeryf,
          activity_status: m.activity_status || 'Aktywny',
          isArchived: isArch,
          isBlacklisted: isArch,
          startYear: m.start_year || m.custom_fields?.startYear || m.custom_fields?.start_year || '',
          startSemester: m.start_semester || m.custom_fields?.startSemester || m.custom_fields?.start_semester || '1',
          studyCycle: m.study_cycle || m.custom_fields?.studyCycle || m.custom_fields?.study_cycle || 'licencjat',
          currentSemester: m.current_semester || m.custom_fields?.currentSemester || m.custom_fields?.current_semester || null,
          academicStatus: m.academic_status || m.custom_fields?.academicStatus || m.custom_fields?.academic_status || (isGrad ? 'graduate' : (isFinalSem ? 'final_semester' : null)),
          dataWeryfikacji: m.verification_date || '',
          dataWplywu: m.joined_date || (m.created_at ? m.created_at.split('T')[0] : ''),
          mailingConsent: Boolean(m.mailing_consent),
          zgodaMailing: Boolean(m.mailing_consent),
          points: Number(m.total_points || 0),
          totalPoints: Number(m.total_points || 0),
          aliasy: m.custom_fields?.aliasy || '',
          dataAktualizacji: m.custom_fields?.dataAktualizacji || '',
          custom_fields: m.custom_fields || {}
        };
      });

      // Indeksy szybkiego wyszukiwania członków dla relacji (Join)
      const memberByIndex = new Map();
      const memberByEmail = new Map();
      const memberByName = new Map();

      allMembers.forEach(mem => {
        if (mem.index) {
          const idxStr = String(mem.index).trim();
          memberByIndex.set(idxStr, mem);
          const cleanIdx = idxStr.replace(/\D/g, '');
          if (cleanIdx && cleanIdx !== idxStr) memberByIndex.set(cleanIdx, mem);
        }
        if (mem.email) memberByEmail.set(String(mem.email).trim().toLowerCase(), mem);
        if (mem.fullName) memberByName.set(normalizeDiacritics(mem.fullName).toLowerCase().trim(), mem);
        if (mem.aliasy) {
          const aliases = String(mem.aliasy).split(/[,;\n]/).map(a => a.trim()).filter(Boolean);
          aliases.forEach(a => {
            memberByName.set(normalizeDiacritics(a).toLowerCase().trim(), mem);
            const aIdx = a.replace(/\D/g, '');
            if (aIdx) memberByIndex.set(aIdx, mem);
          });
        }
      });

      // 2. Przetworzenie ewidencji obecności, dorobku i dziennika korespondencji z tabeli attendance w Supabase
      const sheetAttendanceMap = {};
      const supabaseEwidencja = [];
      const supabaseDorobek = [];
      const supabaseKorespondencja = [];
      const supabaseBoardTenures = [];

      if (Array.isArray(attData)) {
        attData.forEach(row => {
          const code = String(row.meeting_code || '').trim();
          if (code.startsWith('[DOROBEK]')) {
            try {
              const parsedDor = JSON.parse(row.activity_description || '{}');
              if (parsedDor && (parsedDor.title || parsedDor.opis || parsedDor.description)) {
                supabaseDorobek.push({
                  ...parsedDor,
                  supabaseId: row.id,
                  organization_id: orgId,
                  date: parsedDor.date || row.meeting_date,
                  nrIndeksu: parsedDor.nrIndeksu || row.index_number,
                  points: Number(parsedDor.points ?? row.points ?? 0),
                  punkty: Number(parsedDor.punkty ?? row.points ?? 0),
                });
              }
            } catch {}
            return;
          }

          if (code.startsWith('[KORESPONDENCJA]')) {
            try {
              const parsedKor = JSON.parse(row.activity_description || '{}');
              if (parsedKor && (parsedKor.id || parsedKor.sygnatura)) {
                supabaseKorespondencja.push({
                  ...parsedKor,
                  supabaseId: row.id,
                });
              }
            } catch {}
            return;
          }

          if (code.startsWith('[BOARD_TERM]')) {
            try {
              const parsedTenure = JSON.parse(row.activity_description || '{}');
              if (parsedTenure && (parsedTenure.memberName || parsedTenure.roleName)) {
                supabaseBoardTenures.push({
                  ...parsedTenure,
                  id: parsedTenure.id || row.id,
                  organization_id: orgId,
                  memberIndex: parsedTenure.memberIndex || row.index_number,
                  points: Number(parsedTenure.points ?? row.points ?? 0),
                  punkty: Number(parsedTenure.punkty ?? row.points ?? 0),
                });
              }
            } catch {}
            return;
          }

          if (
            code.startsWith('[SETTINGS]') ||
            code.startsWith('[EMAIL_CONFIG]') ||
            code.startsWith('[ZARZAD]') ||
            code.startsWith('[ACCESS_USER]') ||
            code.startsWith('[DOKUMENT]')
          ) {
            return;
          }

          if (!code) return;

          const rawIdxStr = String(row.index_number || '').trim();
          const cleanIdxStr = rawIdxStr.replace(/\D/g, '');
          const normNameStr = normalizeDiacritics(rawIdxStr).toLowerCase().trim();

          const isSupervisor = (row.role && (row.role.toLowerCase().includes('opiekun') || row.role.toLowerCase().includes('supervisor'))) ||
            rawIdxStr.includes('[OPIEKUN]') || isFacultySupervisor(rawIdxStr);

          const isSpeaker = !isSupervisor && (
            (row.role && (row.role.toLowerCase().includes('speaker') || row.role.toLowerCase().includes('prelegent'))) ||
            rawIdxStr.includes('[SPEAKER]')
          );

          // Automatyczne powiązanie (join) z tabelą members po indeksie, emailu lub nazwisku
          const matchedMember = (!isSupervisor && !isSpeaker)
            ? ((cleanIdxStr && memberByIndex.get(cleanIdxStr)) ||
               memberByIndex.get(rawIdxStr) ||
               memberByEmail.get(rawIdxStr.toLowerCase()) ||
               memberByName.get(normNameStr) ||
               null)
            : null;

          const cleanCode = code.toUpperCase().replace(/^\[.*?\]\s*/, '');
          const resolvedName = isSupervisor
            ? rawIdxStr.replace(/^\[OPIEKUN\]:\s*/i, '').trim()
            : isSpeaker
            ? rawIdxStr.replace(/^\[SPEAKER\]:\s*/i, '').trim()
            : (matchedMember ? matchedMember.fullName : rawIdxStr);

          const resolvedIndex = isSupervisor ? '' : (isSpeaker ? '[SPEAKER]' : (matchedMember ? matchedMember.index : (cleanIdxStr || rawIdxStr)));

          let parsedDesc = null;
          try {
            if (row.activity_description && (row.activity_description.startsWith('{') || row.activity_description.startsWith('['))) {
              parsedDesc = JSON.parse(row.activity_description);
            }
          } catch {}

          const rawJoinTime = parsedDesc?.joinTime || '20:00';
          const rawDurMinutes = Number(parsedDesc?.durationMinutes ?? 60);
          const rawDurStr = parsedDesc?.durationStr || `${rawDurMinutes} min`;
          const rawStatus = parsedDesc?.status || (matchedMember ? (row.role || 'Członek koła') : (row.role || (isSupervisor ? 'Opiekun' : (isSpeaker ? 'Prelegent' : 'Gość'))));

          const ewItem = {
            id: row.id,
            supabaseId: row.id,
            kodSpotkania: code,
            dataSpotkania: row.meeting_date,
            nrIndeksu: resolvedIndex,
            identyfikator: resolvedIndex,
            index: resolvedIndex,
            fullName: resolvedName,
            name: resolvedName,
            rawName: parsedDesc?.rawName || parsedDesc?.name || resolvedName,
            imieNazwisko: resolvedName,
            email: matchedMember?.email || parsedDesc?.email || '',
            member: matchedMember,
            status: rawStatus,
            rola: matchedMember ? (row.role || 'Członek koła') : (row.role || (isSupervisor ? 'Opiekun' : (isSpeaker ? 'Prelegent' : 'Gość'))),
            role: isSupervisor ? 'supervisor' : (isSpeaker ? 'speaker' : (matchedMember ? 'member' : 'guest')),
            roleDisplay: isSupervisor ? 'Opiekun' : (isSpeaker ? 'Prelegent' : (matchedMember ? 'Członek koła' : 'Gość')),
            punkty: Number(row.points ?? 1),
            points: Number(row.points ?? 1),
            isSupervisor,
            isSpeaker,
            isGuest: !isSupervisor && !isSpeaker && !matchedMember,
            isExternalGuest: !isSupervisor && !isSpeaker && !matchedMember,
            isEligible: parsedDesc?.isEligible !== undefined ? parsedDesc.isEligible : (matchedMember || isSpeaker || isSupervisor ? true : false),
            manualApproved: parsedDesc?.manualApproved !== undefined ? parsedDesc.manualApproved : (matchedMember || isSpeaker || isSupervisor ? true : false),
            opisAktywnosci: parsedDesc?.opisAktywnosci || row.activity_description || 'Obecność na spotkaniu',
            durationMinutes: rawDurMinutes,
            durationStr: rawDurStr,
            joinTime: rawJoinTime,
          };
          supabaseEwidencja.push(ewItem);

          if (!sheetAttendanceMap[code]) sheetAttendanceMap[code] = [];
          sheetAttendanceMap[code].push(ewItem);
          if (cleanCode && cleanCode !== code) {
            if (!sheetAttendanceMap[cleanCode]) sheetAttendanceMap[cleanCode] = [];
            sheetAttendanceMap[cleanCode].push(ewItem);
          }
          const prefixedCode = `[26/27] ${cleanCode}`;
          if (!sheetAttendanceMap[prefixedCode]) sheetAttendanceMap[prefixedCode] = [];
          sheetAttendanceMap[prefixedCode].push(ewItem);
        });
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const ewJson = JSON.stringify(supabaseEwidencja);
          localStorage.setItem(getOrgKey(orgId, 'crm_ewidencja'), ewJson);

          localStorage.setItem(getOrgKey(orgId, 'members'), JSON.stringify(allMembers));
          localStorage.removeItem('crm_dorobek');
          localStorage.removeItem('crm_members');
          localStorage.removeItem('crm_czlonkowie');

          const dorobekKey = `crm_dorobek_${orgId}`;
          const resKey = getOrgKey(orgId, 'research');
          localStorage.setItem(dorobekKey, JSON.stringify(supabaseDorobek));
          localStorage.setItem(resKey, JSON.stringify(supabaseDorobek));

          let dedupedTenures = deduplicateBoard(supabaseBoardTenures, orgId);
          if (dedupedTenures.length === 0) {
            // Sprawdź czy dane istnieją już w localStorage, aby nie nadpisywać pustą tablicą
            try {
              const existingRaw = localStorage.getItem(`skn_board_tenures_${orgId}`) || localStorage.getItem(getOrgKey(orgId, 'skn_board_tenures'));
              if (existingRaw) {
                const parsedExisting = JSON.parse(existingRaw);
                if (Array.isArray(parsedExisting) && parsedExisting.length > 0) {
                  dedupedTenures = deduplicateBoard(parsedExisting, orgId);
                }
              }
            } catch {}
          }
          if (dedupedTenures.length === 0) {
            dedupedTenures = getDefaultBoardTenuresForOrg(orgId);
          }
          const tenuresJson = JSON.stringify(dedupedTenures);
          localStorage.setItem(`skn_board_tenures_${orgId}`, tenuresJson);
          localStorage.setItem(getOrgKey(orgId, 'skn_board_tenures'), tenuresJson);

          if (supabaseKorespondencja.length > 0) {
            setOrgStorage(orgId, 'correspondence_log', supabaseKorespondencja);
          }
        } catch (storageErr) {
          console.warn('[loadData] Błąd zapisu do localStorage:', storageErr);
        }
      }

      if (subcals && subcals.length > 0) {
        startTransition(() => {
          setSubcalendars(subcals);
        });
      }

      const activeAndGeneralMembers = allMembers.filter(m => !m.isArchived);

      // Mapowanie zgłoszeń z quarantine_submissions w Supabase
      const allSupabaseQuarantine = Array.isArray(qData) ? qData : [];

      // ── Rozwiązanie duplikatów: Indeksy, emaile i nazwiska obecne już w members ──
      const existingMemberIndexes = new Set(
        allMembers.map(m => String(m.index || m.nrIndeksu || m.cleanIndex || '').replace(/\D/g, '').trim()).filter(Boolean)
      );
      const existingMemberEmails = new Set(
        allMembers.map(m => String(m.email || '').toLowerCase().trim()).filter(Boolean)
      );
      const existingMemberNames = new Set(
        allMembers.map(m => String(m.fullName || m.imieNazwisko || '').toLowerCase().trim()).filter(Boolean)
      );

      const pendingQuarantineList = allSupabaseQuarantine
        .filter(item => {
          const s = String(item.decision_status || 'Oczekuje').toLowerCase().trim();
          const isPending = s === 'oczekuje' || s === 'oczekujący' || s === 'oczekujacy' || s === 'pending';
          if (!isPending) return false;

          // Bezwzględne wykluczenie rekordów, które zostały już zatwierdzone i przeniesione do tabeli members
          const rawIdx = String(item.index_number || '').replace(/\D/g, '').trim();
          const rawEm = String(item.email || '').toLowerCase().trim();
          const rawName = String(item.full_name || '').toLowerCase().trim();

          const alreadyInMembers =
            (rawIdx && existingMemberIndexes.has(rawIdx)) ||
            (rawEm && existingMemberEmails.has(rawEm)) ||
            (rawName && existingMemberNames.has(rawName));

          return !alreadyInMembers;
        })
        .map((item, idx) => {
          const field = item.field_of_study || 'Psychologia';
          const year = item.study_year || 'Rok 1, Semestr 1';
          const kierunekRok = `${field} / ${year}`;
          const isZgodyOk = Boolean(item.consents_ok);
          const rawDateVal = item.submission_date || item.created_at || new Date().toISOString();
          let dateVal = rawDateVal;
          try {
            dateVal = new Date(rawDateVal).toISOString().split('T')[0];
          } catch {
            if (String(rawDateVal).includes('T')) {
              dateVal = String(rawDateVal).split('T')[0];
            }
          }
          const acad = getAcademicYearFromDate(dateVal);

          return {
            id: item.id || `sq_${idx + 1}`,
            supabaseId: item.id,
            fullName: item.full_name,
            imieNazwisko: item.full_name,
            full_name: item.full_name,
            email: item.email,
            index: item.index_number,
            nrIndeksu: item.index_number,
            cleanIndex: item.index_number,
            index_number: item.index_number,
            field: field,
            kierunek: field,
            year: year,
            rokStudiow: year,
            study_year: year,
            kierunekRok: kierunekRok,
            consentStatus: isZgodyOk ? 'Zgody OK' : 'Brak zgód',
            zgody: isZgodyOk,
            zgodyOk: isZgodyOk,
            zgodaMailing: true,
            mailingConsent: true,
            zgodaNaMailing: 'Zgoda na mailing',
            zgodaTajemnica: true,
            zgodaOmawianie: true,
            zgodaRegulamin: isZgodyOk,
            dataWplywu: dateVal,
            timestamp: dateVal,
            academicYear: item.academic_year || acad.full,
            academicYearShort: acad.short,
            academicYearCode: `[${acad.short}]`,
            status: 'quarantine',
            statusWeryfikacji: 'Oczekuje',
            isApproved: false,
            fromSheet: 'Supabase_Kwarantanna',
            custom_fields: item.custom_fields || {}
          };
        });

      const archiveQuarantineList = allSupabaseQuarantine
        .filter(item => {
          const s = String(item.decision_status || '').toLowerCase();
          return s !== 'oczekuje' && s !== 'pending' && s !== 'zatwierdzony';
        })
        .map((item, idx) => {
          const field = item.field_of_study || 'Psychologia';
          const year = item.study_year || 'Rok 1, Semestr 1';
          const kierunekRok = `${field} / ${year}`;
          const isZgodyOk = Boolean(item.consents_ok);
          const rawDateVal = item.submission_date || item.created_at || new Date().toISOString();
          let dateVal = rawDateVal;
          try {
            dateVal = new Date(rawDateVal).toISOString().split('T')[0];
          } catch {
            if (String(rawDateVal).includes('T')) {
              dateVal = String(rawDateVal).split('T')[0];
            }
          }
          const acad = getAcademicYearFromDate(dateVal);

          return {
            id: item.id || `sq_arch_${idx + 1}`,
            supabaseId: item.id,
            fullName: item.full_name,
            imieNazwisko: item.full_name,
            full_name: item.full_name,
            email: item.email,
            index: item.index_number,
            nrIndeksu: item.index_number,
            cleanIndex: item.index_number,
            index_number: item.index_number,
            field: field,
            kierunek: field,
            year: year,
            rokStudiow: year,
            study_year: year,
            kierunekRok: kierunekRok,
            consentStatus: isZgodyOk ? 'Zgody OK' : 'Brak zgód',
            zgody: isZgodyOk,
            zgodyOk: isZgodyOk,
            dataWplywu: dateVal,
            timestamp: dateVal,
            academicYear: item.academic_year || acad.full,
            academicYearShort: acad.short,
            academicYearCode: `[${acad.short}]`,
            status: 'archived',
            statusWeryfikacji: item.decision_status || 'Odrzucony',
            isArchived: true,
            isBlacklisted: true,
            fromSheet: 'Supabase_Kwarantanna',
            custom_fields: item.custom_fields || {}
          };
        });

      hasCachedDataRef.current = true;
      loadedOrgIdRef.current = orgId;

      // Aktualizacja stanów React
      startTransition(() => {
        setMembers(activeAndGeneralMembers);
        setQuarantine(pendingQuarantineList);
        setArchivedQuarantine(archiveQuarantineList);
      });

      await loadMeetings(
        selectedSubcalendar,
        academicYear,
        customStartDate,
        customEndDate,
        Object.keys(sheetAttendanceMap).length > 0 ? sheetAttendanceMap : null,
        preFetchedEvents,
        isBackgroundRevalidation
      );

      if (requestId !== loadRequestIdRef.current || activeOrgIdRef.current !== orgId) {
        return;
      }

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });

      // Auto-snapshot: Save local snapshot asynchronously & throttled (at most once every 5 min) so it never blocks main thread
      if (orgId && (Date.now() - lastSnapshotTimeRef.current) > 5 * 60 * 1000) {
        lastSnapshotTimeRef.current = Date.now();
        setTimeout(() => {
          if (activeOrgIdRef.current !== orgId) return;
          try {
            createOrgSnapshot(orgId, 'Automatyczna migawka Supabase SSOT');
          } catch {}
        }, 1500);
      }
    } catch (err) {
      if (requestId === loadRequestIdRef.current && !hasCachedDataRef.current) {
        setError(err.message);
      }
      if (requestId === loadRequestIdRef.current) {
        setCloudSyncStatus(prev => ({ ...prev, status: 'error', errorMessage: err.message }));
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        loadDataInFlightRef.current = false;
        setLoading(false);
      }
    }
  }, [currentOrg?.id, currentOrg?.sheetId, currentOrg?.subcalendarId, getRangeForYear, loadMeetings, selectedSubcalendar, academicYear, customStartDate, customEndDate]);

  // Keep loadDataRef current
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  const [isSyncing, setIsSyncing] = useState(false);

  // ─── Inteligentna synchronizacja dwukierunkowa (Smart Sync & Reconciliation) ───
  const handleRefreshData = useCallback(async (options = {}) => {
    const { silent = false } = options || {};
    if (isSyncing || loadDataInFlightRef.current) return;

    setIsSyncing(true);
    setCloudSyncStatus(prev => ({ ...prev, status: 'saving', errorMessage: null }));

    let flushedDecisionsCount = 0;
    let flushedResearchCount = 0;

    try {
      const orgId = currentOrg?.id || 'default';
      const orgSheetId = currentOrg?.sheetId;
      const decisionsKey = getStorageKey ? getStorageKey('crm_pending_quarantine_decisions') : 'crm_pending_quarantine_decisions';
      const researchKey = getStorageKey ? getStorageKey('research') : 'research';

      // ── FAZA 1: DETEKCJA I WYPCHNIĘCIE (PUSH / FLUSH) ──────────────────────
      // 1. Wyczyszczenie przestarzałych kluczy kolejki decyzji (decyzje trafiają bezpośrednio do Supabase)
      try {
        localStorage.removeItem(decisionsKey);
      } catch {}

      // 2. Wyczyszczenie flag lokalnej kolejki dorobku (dorobek zapisywany bezpośrednio w Supabase)
      try {
        localStorage.removeItem('crm_pending_research_sync');
        if (getStorageKey) localStorage.removeItem(getStorageKey('crm_pending_research_sync'));
      } catch (err) {
        console.warn('[SmartSync] Błąd czyszczenia flagi dorobku:', err);
      }

      // ── FAZA 2: POBRANIE NAJNOWSZEGO STANU (PULL & RECONCILE Z BYPASS CACHE) ──────────────
      await loadData({ force: true, silent, bypassCache: true });

      // ── FAZA 3: SYGNALIZACJA W INTERFEJSIE (UX) ───────────────────────────
      const now = new Date();
      setLastSync(now);
      setPendingSyncCount(0);
      setCloudSyncStatus({
        status: 'synced',
        lastSyncTime: now,
        errorMessage: null
      });

      const totalFlushed = flushedDecisionsCount + flushedResearchCount;
      if (totalFlushed > 0) {
        setToastMessage(`Zsynchronizowano z bazą Supabase i pobrano najnowsze dane.`);
      } else {
        setToastMessage('Pomyślnie zsynchronizowano z bazą Supabase.');
      }

    } catch (err) {
      console.error('[SmartSync] Błąd podczas synchronizacji z Supabase:', err);
      setCloudSyncStatus(prev => ({
        ...prev,
        status: 'error',
        errorMessage: err?.message || 'Błąd połączenia'
      }));
      setToastMessage(`Błąd synchronizacji: ${err?.message || 'Problem z połączeniem z bazą Supabase'}`);
    } finally {
      setIsSyncing(false);
    }
  }, [currentOrg, getStorageKey, loadData, isSyncing, pendingSyncCount]);

  // ── Inicjalne pobranie danych (SWR: natychmiastowy odczyt z cache + cichy fetch w tle) ─────
  useEffect(() => {
    if (loadDataRef.current) {
      loadDataRef.current({ force: true, silent: hasCachedDataRef.current });
    }
  }, []); // BEZWZGLĘDNIE PUSTA TABLICA ZALEŻNOŚCI!

  // ── Dynamiczne przełączanie kontekstu organizacji (Multi-Tenant) ───────────────────
  useEffect(() => {
    const orgId = currentOrg?.id;
    if (!orgId) return;

    if (prevOrgIdRef.current && prevOrgIdRef.current !== orgId) {
      console.info(`[Multi-Tenant] Przełączono organizację na: ${orgId}`);
      // 1. Natychmiastowe unieważnienie trwających zapytań poprzedniej organizacji i wyczyszczenie bufora RAM
      loadedOrgIdRef.current = null;
      loadDataInFlightRef.current = false;
      loadRequestIdRef.current += 1;
      supabaseDataCacheRef.current = {
        orgId: null,
        dbMembers: null,
        qData: null,
        attData: null,
        subcals: [],
        timestamp: 0,
      };
      hasCachedDataRef.current = false;

      // 2. Twarde czyszczenie globalnych/przestarzałych kluczy w localStorage (brak wycieków między kołami)
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.removeItem('crm_ewidencja');
          localStorage.removeItem('skn_board_tenures');
          localStorage.removeItem('crm_board_tenures');
          localStorage.removeItem('crm_dorobek');
          localStorage.removeItem('crm_members');
          localStorage.removeItem('crm_czlonkowie');
          localStorage.removeItem('CACHE_TEAMUP_EVENTS');
          localStorage.removeItem('CRM_TEAMUP_MEETINGS_2026_2027');
          localStorage.removeItem('CACHE_APP_STATE_SNAPSHOT');
          localStorage.removeItem('skn_supervisors_config');
          localStorage.removeItem('skn_settings_config');
          // Czyszczenie nieizolowanych kluczy obecności z poprzednich wersji
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith('crm_attendance_')) {
              localStorage.removeItem(k);
            }
          }
        } catch {}
      }

      // 3. Natychmiastowe wyczyszczenie stanów komponentów przed załadowaniem danych nowego koła
      startTransition(() => {
        setMembers([]);
        setQuarantine([]);
        setArchivedQuarantine([]);
        setMeetings([]);
      });

      if (loadDataRef.current) {
        loadDataRef.current({ force: true, silent: false, bypassCache: true });
      }
    }
    prevOrgIdRef.current = orgId;
  }, [currentOrg?.id]);

  useEffect(() => {
    // Purge legacy mock attendance data for M01 from localStorage on startup
    try {
      const purgeKey = 'crm_mock_attendance_purged_v3';
      if (!localStorage.getItem(purgeKey)) {
        const keysToPurge = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.includes('2089952664') || k.includes('M01') || k.includes('2026-05-07'))) {
            keysToPurge.push(k);
          }
        }
        keysToPurge.forEach(k => {
          try { localStorage.removeItem(k); } catch {}
        });
        localStorage.setItem(purgeKey, 'true');
      }
    } catch {}

    // Trwałe usunięcie i zablokowanie automatycznego zmartwychwstawania obecności na spotkaniu M07 (2026-12-07)
    try {
      const purgeM07Key = 'crm_purge_m07_future_resurrection_v2';
      if (!localStorage.getItem(purgeM07Key)) {
        const keysToPurge = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) {
            if (
              k.includes('2026-12-07') ||
              k.includes('2155589753') ||
              k.endsWith('_M07') ||
              k.endsWith('_M07_list') ||
              k.includes('_M07_') ||
              k === 'crm_attendance_M07' ||
              k === 'attendance_M07' ||
              k === 'meeting_M07_list' ||
              k.includes('CRM_TEAMUP_MEETINGS_2026_2027') ||
              k.includes('crm_swr_teamup_events')
            ) {
              keysToPurge.push(k);
            }
          }
        }
        keysToPurge.forEach(k => {
          try { localStorage.removeItem(k); } catch {}
        });
        localStorage.setItem(purgeM07Key, 'true');
      }
    } catch {}
  }, []);

  // ── Member Edit & Real-time GAS Atomic Edit Sync ─────────────────────────
  // ── Member Edit & Real-time Supabase SSOT Atomic Edit Sync ─────────────────────────
  async function handleSaveMember(updatedMember) {
    if (!updatedMember) return;
    const rawIndex = String(updatedMember.nrIndeksu || updatedMember.index || updatedMember.cleanIndex || '').replace(/\D/g, '').trim();

    const statusWeryfikacjiMap = {
      active: 'Aktywny',
      guest: 'Gosc',
      resigned: 'Nieaktywny',
      inactive: 'Nieaktywny',
      archived: 'Archiwum',
      pending: 'Oczekuje',
      quarantine: 'Oczekuje',
      final_semester: 'Ostatni semestr',
      graduate: 'Absolwent'
    };
    const targetStatus = updatedMember.status || 'active';
    const targetStatusWeryfikacji = updatedMember.statusWeryfikacji || statusWeryfikacjiMap[targetStatus] || targetStatus;

    const memberWithCanonical = {
      ...updatedMember,
      status: targetStatus,
      statusWeryfikacji: targetStatusWeryfikacji,
      isArchived: targetStatus === 'archived',
      isBlacklisted: targetStatus === 'archived'
    };

    if (targetStatus === 'archived') {
      setArchivedQuarantine(prev => [
        memberWithCanonical,
        ...(Array.isArray(prev) ? prev : []).filter(a => {
          const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || '').replace(/\D/g, '').trim();
          return a.id !== updatedMember.id && (!rawIndex || aIdx !== rawIndex);
        })
      ]);
      setMembers(prev => (Array.isArray(prev) ? prev : []).filter(m => {
        const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
        return m.id !== updatedMember.id && (!rawIndex || mIdx !== rawIndex);
      }));
      setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => {
        const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || '').replace(/\D/g, '').trim();
        return q.id !== updatedMember.id && (!rawIndex || qIdx !== rawIndex);
      }));
    } else if (targetStatus === 'pending' || targetStatus === 'quarantine') {
      setQuarantine(prev => [
        memberWithCanonical,
        ...(Array.isArray(prev) ? prev : []).filter(q => {
          const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || '').replace(/\D/g, '').trim();
          return q.id !== updatedMember.id && (!rawIndex || qIdx !== rawIndex);
        })
      ]);
      setMembers(prev => (Array.isArray(prev) ? prev : []).filter(m => {
        const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
        return m.id !== updatedMember.id && (!rawIndex || mIdx !== rawIndex);
      }));
      setArchivedQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(a => {
        const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || '').replace(/\D/g, '').trim();
        return a.id !== updatedMember.id && (!rawIndex || aIdx !== rawIndex);
      }));
    } else {
      // Active, Guest, Resigned -> goes to members
      setMembers(prev => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some(m => {
          const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
          return m.id === updatedMember.id || (rawIndex && mIdx === rawIndex);
        });
        if (exists) {
          return list.map(m => {
            const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
            return (m.id === updatedMember.id || (rawIndex && mIdx === rawIndex)) ? memberWithCanonical : m;
          });
        }
        return [memberWithCanonical, ...list];
      });
      setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => {
        const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || '').replace(/\D/g, '').trim();
        return q.id !== updatedMember.id && (!rawIndex || qIdx !== rawIndex);
      }));
      setArchivedQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(a => {
        const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || '').replace(/\D/g, '').trim();
        return a.id !== updatedMember.id && (!rawIndex || aIdx !== rawIndex);
      }));
    }

    // ── Supabase SSOT: Zapis edycji członka w bazie Supabase ──
    try {
      if (targetStatus === 'archived') {
        let query = supabase.from('members').update({ activity_status: 'Archiwum' }).eq('organization_id', currentOrgCleanId);
        if (isValidUUID(updatedMember.supabaseId || updatedMember.id)) {
          query = query.eq('id', updatedMember.supabaseId || updatedMember.id);
        } else if (rawIndex) {
          query = query.eq('index_number', rawIndex);
        }
        await query;
        if (rawIndex) {
          await supabase.from('quarantine_submissions').update({
            decision_status: 'Duplikat',
            decision_date: new Date().toISOString(),
            decision_author: 'Administrator CRM'
          }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
        }
      } else if (targetStatus === 'pending' || targetStatus === 'quarantine') {
        let delQuery = supabase.from('members').delete().eq('organization_id', currentOrgCleanId);
        if (isValidUUID(updatedMember.supabaseId || updatedMember.id)) {
          delQuery = delQuery.eq('id', updatedMember.supabaseId || updatedMember.id);
        } else if (rawIndex) {
          delQuery = delQuery.eq('index_number', rawIndex);
        }
        await delQuery;
        if (rawIndex) {
          await supabase.from('quarantine_submissions').update({
            decision_status: 'Oczekuje',
            decision_date: null,
            decision_author: null
          }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
        }
      } else {
        const memberPayload = {
          organization_id: currentOrgCleanId,
          full_name: updatedMember.fullName || `${updatedMember.firstName || ''} ${updatedMember.lastName || ''}`.trim(),
          email: updatedMember.email || '',
          phone: updatedMember.phone || updatedMember.telefon || null,
          field_of_study: updatedMember.field || updatedMember.kierunek || 'Psychologia',
          study_year: updatedMember.year || updatedMember.rokStudiow || 'Rok 1',
          activity_status: targetStatusWeryfikacji || 'Aktywny',
          custom_fields: {
            ...(updatedMember.custom_fields || {}),
            notatki: updatedMember.notes || updatedMember.notatki || '',
            notes: updatedMember.notes || updatedMember.notatki || '',
            aliasy: updatedMember.aliases || updatedMember.aliasy || '',
            startYear: updatedMember.startYear || updatedMember.start_year || '',
            startSemester: updatedMember.startSemester || updatedMember.start_semester || '',
            studyCycle: updatedMember.studyCycle || updatedMember.study_cycle || '',
            currentSemester: updatedMember.currentSemester || updatedMember.current_semester || '',
            academicStatus: updatedMember.academicStatus || updatedMember.academic_status || '',
            dataAktualizacji: new Date().toISOString()
          }
        };

        if (updatedMember.startYear || updatedMember.start_year) memberPayload.start_year = String(updatedMember.startYear || updatedMember.start_year);
        if (updatedMember.startSemester || updatedMember.start_semester) memberPayload.start_semester = String(updatedMember.startSemester || updatedMember.start_semester);
        if (updatedMember.studyCycle || updatedMember.study_cycle) memberPayload.study_cycle = String(updatedMember.studyCycle || updatedMember.study_cycle);
        if (updatedMember.currentSemester || updatedMember.current_semester) memberPayload.current_semester = Number(updatedMember.currentSemester || updatedMember.current_semester);
        if (updatedMember.academicStatus || updatedMember.academic_status) memberPayload.academic_status = String(updatedMember.academicStatus || updatedMember.academic_status);

        let query = supabase.from('members').update(memberPayload).eq('organization_id', currentOrgCleanId);
        if (isValidUUID(updatedMember.supabaseId || updatedMember.id)) {
          query = query.eq('id', updatedMember.supabaseId || updatedMember.id);
        } else if (rawIndex) {
          query = query.eq('index_number', rawIndex);
        }
        let { error } = await query;
        if (error && (error.code === '42703' || String(error.message || '').includes('column'))) {
          // Fallback w przypadku braku dedykowanych kolumn SQL: zachowaj dane w custom_fields
          const safePayload = {
            organization_id: currentOrgCleanId,
            full_name: memberPayload.full_name,
            email: memberPayload.email,
            phone: memberPayload.phone,
            field_of_study: memberPayload.field_of_study,
            study_year: memberPayload.study_year,
            activity_status: memberPayload.activity_status,
            custom_fields: memberPayload.custom_fields
          };
          let retryQuery = supabase.from('members').update(safePayload).eq('organization_id', currentOrgCleanId);
          if (isValidUUID(updatedMember.supabaseId || updatedMember.id)) {
            retryQuery = retryQuery.eq('id', updatedMember.supabaseId || updatedMember.id);
          } else if (rawIndex) {
            retryQuery = retryQuery.eq('index_number', rawIndex);
          }
          const retryRes = await retryQuery;
          error = retryRes.error;
        }

        if (error) {
          console.error('[handleSaveMember] Błąd zapisu do Supabase:', error);
          throw error;
        }

        if (rawIndex) {
          await supabase.from('quarantine_submissions').update({
            decision_status: 'Zatwierdzony',
            decision_date: new Date().toISOString(),
            decision_author: 'Administrator CRM'
          }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
        }
      }

      setToastMessage(`Pomyślnie zaktualizowano dane studenta: ${updatedMember.fullName || rawIndex}`);
      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error("[handleSaveMember] Błąd zapisu do bazy Supabase:", err);
      setToastMessage(`Błąd zapisu do Supabase: ${err.message || err}`);
    }
  }

  // ── Manual Member Onboarding Handler (Supabase SSOT) ────────────────
  async function handleAddMember(newMember) {
    if (!newMember) return;
    const rawIndex = String(newMember.index || newMember.nrIndeksu || newMember.cleanIndex || '').replace(/\D/g, '').trim();

    try {
      const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
      const memberPayload = {
        organization_id: currentOrgCleanId,
        index_number: rawIndex,
        full_name: newMember.fullName || `${newMember.firstName || ''} ${newMember.lastName || ''}`.trim(),
        email: newMember.email || '',
        phone: newMember.phone || newMember.telefon || null,
        field_of_study: newMember.field || newMember.kierunek || 'Psychologia',
        study_year: newMember.year || newMember.rokStudiow || 'Rok 1',
        activity_status: newMember.statusWeryfikacji || 'Aktywny',
        verification_date: new Date().toISOString().split('T')[0],
        joined_date: new Date().toISOString().split('T')[0],
        mailing_consent: Boolean(newMember.zgodaMailing || newMember.mailingConsent),
        total_points: newMember.points || 0,
        custom_fields: {
          aliasy: newMember.aliases || newMember.aliasy || '',
          addedManually: true
        }
      };

      const { data: existingM } = await supabase
        .from('members')
        .select('id')
        .eq('organization_id', currentOrgCleanId)
        .eq('index_number', rawIndex);

      let data, error;
      if (existingM && existingM.length > 0) {
        ({ data, error } = await supabase
          .from('members')
          .update(memberPayload)
          .eq('organization_id', currentOrgCleanId)
          .eq('index_number', rawIndex)
          .select());
      } else {
        ({ data, error } = await supabase
          .from('members')
          .insert([memberPayload])
          .select());
      }
      if (error) throw error;

      const createdMember = data && data[0] ? {
        ...newMember,
        id: data[0].id,
        supabaseId: data[0].id,
        index: data[0].index_number,
        nrIndeksu: data[0].index_number,
        cleanIndex: data[0].index_number,
        status: 'active',
        statusWeryfikacji: 'Aktywny',
        activity_status: 'Aktywny'
      } : {
        ...newMember,
        id: `m_${Date.now()}`,
        status: 'active'
      };

      setMembers(prev => [createdMember, ...(Array.isArray(prev) ? prev : []).filter(m => {
        const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
        return m.id !== createdMember.id && (!rawIndex || mIdx !== rawIndex);
      })]);

      setToastMessage("Student został trwale dodany do bazy Supabase");
    } catch (err) {
      console.error('[handleAddMember] Błąd zapisu do Supabase:', err);
      setToastMessage(`Błąd dodawania studenta w Supabase: ${err.message || err}`);
    }
  }

  // ── Batch Sync Members (Supabase SSOT) ──────────────
  async function handleBatchSyncMembers() {
    console.log(`[handleBatchSyncMembers] Synchronizacja członków z bazą Supabase...`);
    setCloudSyncStatus(prev => ({ ...prev, status: 'saving', errorMessage: null }));
    try {
      await loadData({ force: true, bypassCache: true });
      setPendingSyncCount(0);
      try {
        localStorage.setItem(getStorageKey('crm_pending_sync_count'), '0');
      } catch {}

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage(`Pomyślnie zsynchronizowano dane z bazą Supabase!`);
    } catch (err) {
      setCloudSyncStatus(prev => ({ ...prev, status: 'error', errorMessage: err.message }));
      setToastMessage(`Błąd synchronizacji z bazą Supabase: ${err.message || err}`);
    }
  }

  const handleSubcalendarChange = (newSubId) => {
    const targetSub = String(newSubId || currentOrg?.subcalendarId || '14518766').trim();
    setSelectedSubcalendar(targetSub);
    loadMeetings(targetSub, academicYear, customStartDate, customEndDate, null, undefined, false, true);
  };

  const handleRefreshCalendar = useCallback(async () => {
    const targetSub = String(selectedSubcalendar || currentOrg?.subcalendarId || '14518766').trim();
    return await loadMeetings(
      targetSub,
      academicYear,
      customStartDate,
      customEndDate,
      null,
      undefined,
      false,
      true
    );
  }, [loadMeetings, selectedSubcalendar, currentOrg?.subcalendarId, academicYear, customStartDate, customEndDate]);

  const handleAcademicYearChange = (newYr) => {
    setAcademicYear(newYr);
    loadMeetings(selectedSubcalendar, newYr, customStartDate, customEndDate);
  };

  const handleCustomDateChange = (newStart, newEnd) => {
    setCustomStartDate(newStart);
    setCustomEndDate(newEnd);
    loadMeetings(selectedSubcalendar, 'custom', newStart, newEnd);
  };

  // ── Member Status Toggle / Setter (Aktywni vs Goście vs Rezygnacja) ────────
  async function handleToggleStatus(id, explicitStatus = null) {
    const member = members.find(m => m.id === id);
    if (!member) return;
    const rawIndex = String(member.nrIndeksu || member.index || member.cleanIndex || member.id || '').replace(/\D/g, '').trim();

    let targetStatus;
    if (explicitStatus) {
      targetStatus = explicitStatus;
    } else {
      const isCurrentlyResigned = member.status === 'resigned' || member.status === 'inactive' || member.statusWeryfikacji === 'Nieaktywny';
      targetStatus = isCurrentlyResigned ? 'active' : 'resigned';
    }

    const statusWeryfikacjiMap = {
      active: 'Aktywny',
      guest: 'Gosc',
      resigned: 'Nieaktywny',
      inactive: 'Nieaktywny',
      archived: 'Archiwum',
      quarantine: 'Oczekuje',
      final_semester: 'Ostatni semestr',
      graduate: 'Absolwent'
    };
    const targetStatusWeryfikacji = statusWeryfikacjiMap[targetStatus] || targetStatus;

    setMembers(prev =>
      prev.map(m => {
        const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
        return (m.id === id || (rawIndex && mIdx === rawIndex))
          ? { ...m, status: targetStatus, statusWeryfikacji: targetStatusWeryfikacji, isArchived: false, isBlacklisted: false }
          : m;
      })
    );

    // ── Supabase SSOT: Zmiana statusu w bazie ──
    try {
      if (rawIndex) {
        const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
        const { error } = await supabase.from('members').update({
          activity_status: targetStatusWeryfikacji
        }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
        if (error) console.error('[handleToggleStatus] Błąd Supabase:', error);
      }
      setToastMessage("Zapisano status w bazie Supabase");
      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error('[handleToggleStatus] Błąd zapisu do Supabase:', err);
    }
  }

  // ── Revert Member Back to Quarantine (Cofnięcie zatwierdzenia) ────────────
  async function handleRevertToQuarantine(id) {
    const member = members.find(m => m.id === id);
    if (!member) return;
    const rawIndex = String(member.nrIndeksu || member.index || member.cleanIndex || member.id || '').replace(/\D/g, '').trim();
    const rawEmail = String(member.email || '').trim().toLowerCase();
    const fullName = member.fullName || member.imieNazwisko || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Student';
    const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';

    setMembers(prev => prev.filter(m => {
      const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
      return m.id !== id && (!rawIndex || mIdx !== rawIndex);
    }));

    setQuarantine(prev => [{
      ...member,
      status: 'quarantine',
      statusWeryfikacji: 'Oczekuje',
      isArchived: false,
      isBlacklisted: false
    }, ...prev]);

    setToastMessage("Cofanie studenta do Kwarantanny w bazie Supabase...");

    try {
      // 1. Usunięcie z members w Supabase
      if (rawIndex) {
        const { error: delErr } = await supabase.from('members').delete().eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
        if (delErr) console.warn('[handleRevertToQuarantine] Błąd usunięcia z members:', delErr);
      }

      // 2. Aktualizacja statusu w quarantine_submissions na 'Oczekuje'
      let updatedSubmission = false;
      if (rawIndex) {
        const { data: existingQ } = await supabase.from('quarantine_submissions').select('id').eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
        if (existingQ && existingQ.length > 0) {
          const { error: updErr } = await supabase.from('quarantine_submissions').update({
            decision_status: 'Oczekuje',
            decision_date: null,
            decision_author: null
          }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
          if (!updErr) updatedSubmission = true;
        }
      }

      if (!updatedSubmission) {
        await supabase.from('quarantine_submissions').insert([{
          organization_id: currentOrg?.id || 'skn_seksuologii',
          index_number: rawIndex || `TEMP_${Date.now()}`,
          full_name: fullName,
          email: rawEmail || `student_${rawIndex || Date.now()}@skn.pl`,
          field_of_study: member.field || member.kierunek || 'Psychologia',
          study_year: member.year || member.rokStudiow || 'Rok 1',
          consents_ok: Boolean(member.zgody || member.zgodyOk || member.mailingConsent),
          decision_status: 'Oczekuje',
          decision_date: null,
          decision_author: null,
          academic_year: member.academicYear || academicYear || getCurrentAcademicYear(),
          submission_date: new Date().toISOString().split('T')[0],
          custom_fields: member.custom_fields || {}
        }]);
      }

      setToastMessage("Pomyślnie cofnięto studenta do Kwarantanny (zapisano w Supabase)");
      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error('[handleRevertToQuarantine] Błąd bazy Supabase:', err);
      setToastMessage(`Błąd cofania do kwarantanny: ${err.message || err}`);
    }
  }

  // ── Move Member to Archive (Duplikat / Usunięcie z Zarządzania) ──
  async function handleArchiveMember(memberOrId, reason = 'duplicate') {
    const member = typeof memberOrId === 'object' && memberOrId !== null
      ? memberOrId
      : (members.find(m => m.id === memberOrId) || quarantine.find(q => q.id === memberOrId));

    if (!member || !member.id) return;
    const rawIndex = String(member.nrIndeksu || member.index || member.cleanIndex || member.id || '').replace(/\D/g, '').trim();

    const archivedItem = {
      ...member,
      status: 'archived',
      statusWeryfikacji: 'Archiwum',
      isArchived: true,
      isBlacklisted: true,
      archiveReason: reason,
    };

    setMembers(prev => (Array.isArray(prev) ? prev : []).filter(m => {
      const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
      return m.id !== member.id && (!rawIndex || mIdx !== rawIndex);
    }));

    setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => {
      const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || '').replace(/\D/g, '').trim();
      return q.id !== member.id && (!rawIndex || qIdx !== rawIndex);
    }));

    setArchivedQuarantine(prev => [
      archivedItem,
      ...(Array.isArray(prev) ? prev : []).filter(a => {
        const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || '').replace(/\D/g, '').trim();
        return a.id !== member.id && (!rawIndex || aIdx !== rawIndex);
      }),
    ]);

    setToastMessage("Przenoszenie do Archiwum w bazie Supabase...");

    try {
      if (rawIndex) {
        await supabase.from('members').update({
          activity_status: 'Archiwum'
        }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);

        const targetDecisionStatus = reason === 'duplicate' ? 'Duplikat' : (reason === 'resignation' ? 'Rezygnacja' : 'Odrzucony');
        await supabase.from('quarantine_submissions').update({
          decision_status: targetDecisionStatus,
          decision_date: new Date().toISOString(),
          decision_author: 'Administrator CRM'
        }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
      }

      setToastMessage("Przeniesiono wpis do Archiwum (zapisano w Supabase)");
      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error('[handleArchiveMember] Błąd Supabase:', err);
      setToastMessage(`Błąd archiwizacji: ${err.message || err}`);
    }
  }

  // ── Bulk Mark Graduates as Former Members (Przenieś absolwentów do Byłych / Oznacz jako Absolwent) ────
  async function handleBulkMarkGraduates(memberIds) {
    if (!memberIds || !memberIds.length) return;
    const targetMembers = members.filter(m => memberIds.includes(m.id));

    setMembers(prev =>
      prev.map(m =>
        memberIds.includes(m.id)
          ? { ...m, status: 'graduate', statusWeryfikacji: 'Absolwent' }
          : m
      )
    );

    const targetIndexes = targetMembers.map(m => String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim()).filter(Boolean);
    if (targetIndexes.length > 0) {
      try {
        await supabase.from('members').update({
          activity_status: 'Absolwent'
        }).eq('organization_id', currentOrgCleanId).in('index_number', targetIndexes);
        setToastMessage("Zapisano status absolwentów w bazie Supabase");
        await loadData({ silent: true, bypassCache: true });
      } catch (err) {
        console.error('[handleBulkMarkGraduates] Błąd Supabase:', err);
      }
    }
  }

  // ── Bulk Archive Graduates (Przenieś absolwentów do Archiwum) ───────
  async function handleBulkArchiveGraduates(memberIds) {
    if (!memberIds || !memberIds.length) return;
    const targetMembers = members.filter(m => memberIds.includes(m.id));

    setMembers(prev => prev.filter(m => !memberIds.includes(m.id)));

    setArchivedQuarantine(prev => [
      ...targetMembers.map(m => ({ ...m, isArchived: true, status: 'archived', statusWeryfikacji: 'Archiwum', isBlacklisted: true })),
      ...(Array.isArray(prev) ? prev : []).filter(a => !memberIds.includes(a.id)),
    ]);

    const targetIndexes = targetMembers.map(m => String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim()).filter(Boolean);
    if (targetIndexes.length > 0) {
      try {
        await supabase.from('members').update({
          activity_status: 'Archiwum'
        }).eq('organization_id', currentOrgCleanId).in('index_number', targetIndexes);
        setToastMessage("Zarchiwizowano absolwentów w bazie Supabase");
        await loadData({ silent: true, bypassCache: true });
      } catch (err) {
        console.error('[handleBulkArchiveGraduates] Błąd Supabase:', err);
      }
    }
  }

  // ── Quarantine Handlers (Supabase SSOT) ──────
  async function handleApprove(id) {
    const now = new Date();
    const entry = (Array.isArray(quarantine) ? quarantine : []).find(q => q.id === id);
    if (!entry) return;

    const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
    const rawIndex = String(entry.index || entry.cleanIndex || entry.nrIndeksu || entry.index_number || '').replace(/\D/g, '').trim();
    const rawEmail = String(entry.email || '').trim().toLowerCase();
    const validUuid = (isValidUUID(entry.supabaseId) && entry.supabaseId) || (isValidUUID(entry.id) && entry.id) || null;
    const fullName = entry.fullName || entry.full_name || `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'Nowy Członek';

    const approvedMember = {
      ...entry,
      status: 'active',
      statusWeryfikacji: 'Zatwierdzony',
      activity_status: 'Aktywny',
      isArchived: false,
      isBlacklisted: false
    };

    setMembers(prev => [approvedMember, ...(Array.isArray(prev) ? prev : []).filter(m => {
      const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').replace(/\D/g, '').trim();
      return m.id !== id && (!rawIndex || mIdx !== rawIndex);
    })]);
    setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => q.id !== id));

    setToastMessage("Zatwierdzanie studenta w bazie Supabase...");

    try {
      // 1. Aktualizacja statusu zgłoszenia w quarantine_submissions
      let query = supabase
        .from('quarantine_submissions')
        .update({
          decision_status: 'Zatwierdzony',
          decision_date: now.toISOString(),
          decision_author: 'Administrator CRM'
        })
        .eq('organization_id', currentOrgCleanId);

      if (validUuid) {
        query = query.eq('id', validUuid);
      } else if (rawIndex) {
        query = query.eq('index_number', rawIndex);
      } else if (rawEmail && rawEmail.includes('@')) {
        query = query.eq('email', rawEmail);
      }
      const { error: qError } = await query;
      if (qError) {
        console.error('[handleApprove] Błąd aktualizacji quarantine_submissions:', qError);
      }

      // 2. Wpisanie/aktualizacja w tabeli members w Supabase
      const memberPayload = {
        organization_id: currentOrgCleanId,
        index_number: rawIndex || (fullName.toLowerCase().includes('opiekun') ? 'OPIEKUN' : `TEMP_${Date.now()}`),
        full_name: fullName,
        email: rawEmail || `student_${rawIndex || Date.now()}@skn.pl`,
        phone: entry.phone || entry.telefon || entry.custom_fields?.phone || null,
        field_of_study: entry.field || entry.kierunek || entry.field_of_study || 'Psychologia',
        study_year: entry.year || entry.rokStudiow || entry.study_year || 'Rok 1',
        activity_status: 'Aktywny',
        verification_date: now.toISOString().split('T')[0],
        joined_date: now.toISOString().split('T')[0],
        mailing_consent: Boolean(entry.zgody || entry.zgodyOk || entry.consents_ok || entry.mailing_consent),
        total_points: entry.points || 0,
        custom_fields: {
          ...(entry.custom_fields || {}),
          approvedFromQuarantineAt: now.toISOString()
        }
      };

      const { data: existingM } = await supabase
        .from('members')
        .select('id')
        .eq('organization_id', currentOrgCleanId)
        .eq('index_number', memberPayload.index_number);

      const { error: mError } = (existingM && existingM.length > 0)
        ? await supabase.from('members').update(memberPayload).eq('organization_id', currentOrgCleanId).eq('index_number', memberPayload.index_number)
        : await supabase.from('members').insert([memberPayload]);

      if (mError) {
        console.error('[handleApprove] Błąd zapisu do members w Supabase:', mError);
      }

      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage("Pomyślnie zatwierdzono studenta i zapisano w bazie Supabase");

      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error('[handleApprove] Błąd operacji Supabase:', err);
      setToastMessage(`Błąd zatwierdzania w bazie: ${err.message || err}`);
    }
  }

  async function handleBulkApprove(ids) {
    const now = new Date();
    const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
    const entriesToApprove = (Array.isArray(quarantine) ? quarantine : []).filter(q => ids.includes(q.id));
    if (entriesToApprove.length === 0) return;

    const approvedMembers = entriesToApprove.map(entry => ({
      ...entry,
      status: 'active',
      statusWeryfikacji: 'Zatwierdzony',
      activity_status: 'Aktywny',
      isArchived: false,
      isBlacklisted: false
    }));

    setMembers(prev => [...approvedMembers, ...(Array.isArray(prev) ? prev : []).filter(m => !ids.includes(m.id))]);
    setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => !ids.includes(q.id)));

    setToastMessage(`Zatwierdzanie ${entriesToApprove.length} zgłoszeń w bazie Supabase...`);

    try {
      const validUuids = entriesToApprove
        .map(e => (isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id) || null)
        .filter(Boolean);

      const nonUuidIndexes = entriesToApprove
        .filter(e => !((isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id)))
        .map(e => String(e.index || e.cleanIndex || e.nrIndeksu || e.index_number || '').replace(/\D/g, '').trim())
        .filter(Boolean);

      const nonUuidEmails = entriesToApprove
        .filter(e => !((isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id)) && !String(e.index || e.cleanIndex || e.nrIndeksu || e.index_number || '').replace(/\D/g, '').trim())
        .map(e => String(e.email || '').trim().toLowerCase())
        .filter(em => em && em.includes('@'));

      const updatePayload = {
        decision_status: 'Zatwierdzony',
        decision_date: now.toISOString(),
        decision_author: 'Administrator CRM'
      };

      if (validUuids.length > 0) {
        await supabase.from('quarantine_submissions').update(updatePayload).eq('organization_id', currentOrgCleanId).in('id', validUuids);
      }
      if (nonUuidIndexes.length > 0) {
        await supabase.from('quarantine_submissions').update(updatePayload).eq('organization_id', currentOrgCleanId).in('index_number', nonUuidIndexes);
      }
      if (nonUuidEmails.length > 0) {
        await supabase.from('quarantine_submissions').update(updatePayload).eq('organization_id', currentOrgCleanId).in('email', nonUuidEmails);
      }

      // Upsert do tabeli members
      const membersToUpsert = entriesToApprove.map(entry => {
        const rawIndex = String(entry.index || entry.cleanIndex || entry.nrIndeksu || entry.index_number || '').replace(/\D/g, '').trim();
        const rawEmail = String(entry.email || '').trim().toLowerCase();
        const fullName = entry.fullName || entry.full_name || `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'Nowy Członek';

        return {
          organization_id: currentOrgCleanId,
          index_number: rawIndex || (fullName.toLowerCase().includes('opiekun') ? 'OPIEKUN' : `TEMP_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
          full_name: fullName,
          email: rawEmail || `student_${rawIndex || Date.now()}@skn.pl`,
          phone: entry.phone || entry.telefon || entry.custom_fields?.phone || null,
          field_of_study: entry.field || entry.kierunek || entry.field_of_study || 'Psychologia',
          study_year: entry.year || entry.rokStudiow || entry.study_year || 'Rok 1',
          activity_status: 'Aktywny',
          verification_date: now.toISOString().split('T')[0],
          joined_date: now.toISOString().split('T')[0],
          mailing_consent: Boolean(entry.zgody || entry.zgodyOk || entry.consents_ok || entry.mailing_consent),
          total_points: entry.points || 0,
          custom_fields: {
            ...(entry.custom_fields || {}),
            approvedFromQuarantineAt: now.toISOString()
          }
        };
      });

      for (const mItem of membersToUpsert) {
        const { data: ex } = await supabase
          .from('members')
          .select('id')
          .eq('organization_id', currentOrgCleanId)
          .eq('index_number', mItem.index_number);

        if (ex && ex.length > 0) {
          await supabase
            .from('members')
            .update(mItem)
            .eq('organization_id', currentOrgCleanId)
            .eq('index_number', mItem.index_number);
        } else {
          await supabase.from('members').insert([mItem]);
        }
      }

      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage(`Pomyślnie zatwierdzono ${entriesToApprove.length} zgłoszeń w bazie Supabase`);

      await loadData({ silent: true, bypassCache: true });
    } catch (e) {
      console.error("[handleBulkApprove] Błąd zapisu do Supabase:", e);
      setCloudSyncStatus(prev => ({ ...prev, status: 'error', errorMessage: e.message }));
      setToastMessage(`Błąd masowego zatwierdzania: ${e.message || e}`);
    }
  }

  async function handleArchive(id) {
    const entry = typeof id === 'object' && id !== null
      ? id
      : ((Array.isArray(quarantine) ? quarantine : []).find(q => q.id === id) || (Array.isArray(members) ? members : []).find(m => m.id === id));
    if (!entry) return;

    const rawIndex = String(entry.nrIndeksu || entry.index || entry.cleanIndex || entry.index_number || '').replace(/\D/g, '').trim();
    const rawEmail = String(entry.email || '').trim().toLowerCase();
    const validUuid = (isValidUUID(entry.supabaseId) && entry.supabaseId) || (isValidUUID(entry.id) && entry.id) || (typeof id === 'string' && isValidUUID(id) ? id : null);

    setArchivedQuarantine(prev => [{
      ...entry,
      isArchived: true,
      status: 'archived',
      statusWeryfikacji: 'Odrzucony',
      isBlacklisted: true
    }, ...(Array.isArray(prev) ? prev : [])]);
    setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => q.id !== (entry.id || id)));

    try {
      let query = supabase
        .from('quarantine_submissions')
        .update({
          decision_status: 'Odrzucony',
          decision_date: new Date().toISOString(),
          decision_author: 'Administrator CRM'
        })
        .eq('organization_id', currentOrgCleanId);

      if (validUuid) {
        query = query.eq('id', validUuid);
      } else if (rawIndex) {
        query = query.eq('index_number', rawIndex);
      } else if (rawEmail && rawEmail.includes('@')) {
        query = query.eq('email', rawEmail);
      }

      const { error } = await query;
      if (error) {
        console.error('[handleArchive] Błąd aktualizacji Supabase:', error);
      }

      if (rawIndex) {
        await supabase.from('members').update({ activity_status: 'Archiwum' }).eq('organization_id', currentOrgCleanId).eq('index_number', rawIndex);
      }

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage("Odrzucono wniosek (zapisano w bazie Supabase)");

      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error('[handleArchive] Błąd zapisu do Supabase:', err);
      setToastMessage(`Błąd archiwizowania w Supabase: ${err.message || err}`);
    }
  }

  async function handleBulkArchive(ids, reason = 'duplicate') {
    const entriesToArchive = (Array.isArray(quarantine) ? quarantine : []).filter(q => ids.includes(q.id));
    if (entriesToArchive.length === 0) return;

    const statusForSupabase = reason === 'duplicate' ? 'Duplikat' : (reason === 'resignation' ? 'Rezygnacja' : 'Odrzucony');

    setArchivedQuarantine(prev => [
      ...entriesToArchive.map(e => ({
        ...e,
        isArchived: true,
        status: 'archived',
        statusWeryfikacji: statusForSupabase,
        archiveReason: reason,
        isBlacklisted: true
      })),
      ...(Array.isArray(prev) ? prev : []).filter(a => !ids.includes(a.id)),
    ]);
    setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => !ids.includes(q.id)));

    try {
      const validUuids = entriesToArchive
        .map(e => (isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id) || null)
        .filter(Boolean);

      const nonUuidIndexes = entriesToArchive
        .filter(e => !((isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id)))
        .map(e => String(e.nrIndeksu || e.index || e.cleanIndex || e.index_number || '').replace(/\D/g, '').trim())
        .filter(Boolean);

      const nonUuidEmails = entriesToArchive
        .filter(e => !((isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id)) && !String(e.nrIndeksu || e.index || e.cleanIndex || e.index_number || '').replace(/\D/g, '').trim())
        .map(e => String(e.email || '').trim().toLowerCase())
        .filter(em => em && em.includes('@'));

      const updatePayload = {
        decision_status: statusForSupabase,
        decision_date: new Date().toISOString(),
        decision_author: 'Administrator CRM'
      };

      if (validUuids.length > 0) {
        await supabase.from('quarantine_submissions').update(updatePayload).eq('organization_id', currentOrgCleanId).in('id', validUuids);
      }
      if (nonUuidIndexes.length > 0) {
        await supabase.from('quarantine_submissions').update(updatePayload).eq('organization_id', currentOrgCleanId).in('index_number', nonUuidIndexes);
        await supabase.from('members').update({ activity_status: 'Archiwum' }).eq('organization_id', currentOrgCleanId).in('index_number', nonUuidIndexes);
      }
      if (nonUuidEmails.length > 0) {
        await supabase.from('quarantine_submissions').update(updatePayload).eq('organization_id', currentOrgCleanId).in('email', nonUuidEmails);
      }

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage(`Odrzucono ${entriesToArchive.length} pozycji (zapisano w Supabase)`);

      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error("[handleBulkArchive] Błąd zapisu do Supabase:", err);
      setCloudSyncStatus(prev => ({ ...prev, status: 'error', errorMessage: err.message }));
      setToastMessage(`Błąd masowego odrzucania w Supabase: ${err.message || err}`);
    }
  }

  async function handleRestoreArchive(idOrStudent) {
    const rawIndex = String(
      (typeof idOrStudent === 'object' && idOrStudent !== null
        ? (idOrStudent.nrIndeksu || idOrStudent.index || idOrStudent.cleanIndex || idOrStudent.index_number || idOrStudent.id)
        : idOrStudent) || ''
    ).replace(/\D/g, '').trim();

    const cleanId = typeof idOrStudent === 'object' && idOrStudent !== null
      ? String(idOrStudent.supabaseId || idOrStudent.id || '').trim()
      : String(idOrStudent || '').trim();

    const entry = (typeof idOrStudent === 'object' && idOrStudent !== null)
      ? idOrStudent
      : (Array.isArray(archivedQuarantine) ? archivedQuarantine : []).find(a => {
          const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || a.index_number || '').replace(/\D/g, '').trim();
          return (rawIndex && aIdx === rawIndex) || String(a.id) === cleanId || String(a.supabaseId) === cleanId;
        }) || (Array.isArray(quarantine) ? quarantine : []).find(q => {
          const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || q.index_number || '').replace(/\D/g, '').trim();
          return (rawIndex && qIdx === rawIndex) || String(q.id) === cleanId || String(q.supabaseId) === cleanId;
        });

    const targetIndex = rawIndex || String(entry?.nrIndeksu || entry?.index || entry?.cleanIndex || entry?.index_number || '').replace(/\D/g, '').trim();
    const targetEmail = String(entry?.email || (typeof idOrStudent === 'object' ? idOrStudent?.email : '') || '').trim().toLowerCase();
    const rowId = entry?.id || cleanId;

    const validUuid = (isValidUUID(entry?.supabaseId) && entry.supabaseId) ||
                      (isValidUUID(entry?.id) && entry.id) ||
                      (isValidUUID(cleanId) && cleanId) ||
                      null;

    setToastMessage("Przywracanie zgłoszenia do kwarantanny w bazie Supabase...");

    try {
      let query = supabase.from('quarantine_submissions').update({
        decision_status: 'Oczekuje',
        decision_date: null,
        decision_author: null
      }).eq('organization_id', currentOrgCleanId);

      if (validUuid) {
        query = query.eq('id', validUuid);
      } else if (targetIndex) {
        query = query.eq('index_number', targetIndex);
      } else if (targetEmail && targetEmail.includes('@')) {
        query = query.eq('email', targetEmail);
      }

      const { data, error } = await query.select();
      if (error) {
        console.error('[handleRestoreArchive] Błąd Supabase podczas przywracania:', error);
        throw error;
      }
      console.log('DIAGNOSTYKA SUPABASE - Przywrócono rekord do kwarantanny:', data);

      // Bezpieczeństwo SSOT: usunięcie z tabeli members, aby student nie widniał w Zarządzaniu
      if (targetIndex) {
        await supabase.from('members').delete().eq('organization_id', currentOrgCleanId).eq('index_number', targetIndex);
      }

      setArchivedQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(item => {
        const itemIdx = String(item.nrIndeksu || item.index || item.cleanIndex || item.index_number || '').replace(/\D/g, '').trim();
        const itemRowId = String(item.id || '').trim();
        const itemSupabaseId = String(item.supabaseId || '').trim();
        return (targetIndex ? itemIdx !== targetIndex : true) &&
               itemRowId !== rowId &&
               itemRowId !== cleanId &&
               (validUuid ? itemRowId !== validUuid && itemSupabaseId !== validUuid : true);
      }));

      const restoredItem = {
        ...(entry || {}),
        id: rowId,
        isArchived: false,
        isBlacklisted: false,
        status: 'quarantine',
        statusWeryfikacji: 'Oczekuje'
      };

      setQuarantine(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        const exists = arr.some(q => {
          const qId = String(q.id || '').trim();
          const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || q.index_number || '').replace(/\D/g, '').trim();
          const qSupId = String(q.supabaseId || '').trim();
          return (targetIndex && qIdx === targetIndex) ||
                 qId === rowId ||
                 (validUuid && (qId === validUuid || qSupId === validUuid));
        });
        if (exists) return arr;
        return [restoredItem, ...arr];
      });

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage("Pomyślnie przywrócono zgłoszenie do Kwarantanny (zapisano w Supabase)");

      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error('[handleRestoreArchive] Błąd przywracania w Supabase:', err);
      setToastMessage(`Błąd zapisu w bazie Supabase: ${err.message || 'Nieznany błąd'}`);
    }
  }

  async function handleBulkRestoreArchive(ids) {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids.map(i => String(i || '').trim()));

    const entriesToRestore = (Array.isArray(archivedQuarantine) ? archivedQuarantine : []).filter(a => {
      const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || a.index_number || '').replace(/\D/g, '').trim();
      return idSet.has(String(a.id)) || (aIdx && idSet.has(aIdx)) || (a.supabaseId && idSet.has(String(a.supabaseId)));
    });
    if (entriesToRestore.length === 0) return;

    setToastMessage(`Przywracanie ${entriesToRestore.length} zgłoszeń w bazie Supabase...`);

    const validUuids = [];
    const nonUuidIndexes = [];
    const nonUuidEmails = [];

    entriesToRestore.forEach(e => {
      const u = (isValidUUID(e.supabaseId) && e.supabaseId) || (isValidUUID(e.id) && e.id) || null;
      if (u) {
        validUuids.push(u);
      } else {
        const idx = String(e.nrIndeksu || e.index || e.cleanIndex || e.index_number || '').replace(/\D/g, '').trim();
        if (idx) {
          nonUuidIndexes.push(idx);
        } else {
          const em = String(e.email || '').trim().toLowerCase();
          if (em && em.includes('@')) {
            nonUuidEmails.push(em);
          }
        }
      }
    });

    try {
      const restorePayload = {
        decision_status: 'Oczekuje',
        decision_date: null,
        decision_author: null
      };

      if (validUuids.length > 0) {
        const { error: uuidErr } = await supabase
          .from('quarantine_submissions')
          .update(restorePayload)
          .eq('organization_id', currentOrgCleanId)
          .in('id', validUuids);
        if (uuidErr) throw uuidErr;
      }

      if (nonUuidIndexes.length > 0) {
        const { error: idxErr } = await supabase
          .from('quarantine_submissions')
          .update(restorePayload)
          .eq('organization_id', currentOrgCleanId)
          .in('index_number', nonUuidIndexes);
        if (idxErr) throw idxErr;
        // Bezpieczeństwo SSOT: usunięcie z tabeli members
        await supabase.from('members').delete().eq('organization_id', currentOrgCleanId).in('index_number', nonUuidIndexes);
      }

      if (nonUuidEmails.length > 0) {
        const { error: emailErr } = await supabase
          .from('quarantine_submissions')
          .update(restorePayload)
          .eq('organization_id', currentOrgCleanId)
          .in('email', nonUuidEmails);
        if (emailErr) throw emailErr;
      }

      const restoredRowIds = new Set(entriesToRestore.map(e => String(e.id)));
      const restoredUuidSet = new Set(validUuids);
      const restoredIndexSet = new Set(nonUuidIndexes);
      const restoredEmailSet = new Set(nonUuidEmails);

      setArchivedQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(a => {
        const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || a.index_number || '').replace(/\D/g, '').trim();
        const aId = String(a.id || '').trim();
        const aSupId = String(a.supabaseId || '').trim();
        const aEmail = String(a.email || '').trim().toLowerCase();
        return !restoredRowIds.has(aId) &&
               !restoredUuidSet.has(aId) &&
               !restoredUuidSet.has(aSupId) &&
               (!aIdx || !restoredIndexSet.has(aIdx)) &&
               (!aEmail || !restoredEmailSet.has(aEmail));
      }));

      const restoredList = entriesToRestore.map(e => ({
        ...e,
        isArchived: false,
        isBlacklisted: false,
        status: 'quarantine',
        statusWeryfikacji: 'Oczekuje'
      }));
      setQuarantine(prev => [...restoredList, ...(Array.isArray(prev) ? prev : []).filter(q => !restoredRowIds.has(String(q.id)))]);

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage(`Pomyślnie przywrócono ${entriesToRestore.length} zgłoszeń do Kwarantanny (zapisano w Supabase)`);

      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error("[handleBulkRestoreArchive] Błąd zapisu do Supabase:", err);
      setToastMessage(`Błąd zapisu masowego w bazie Supabase: ${err.message || 'Nieznany błąd'}`);
    }
  }

  async function handlePermanentDeleteArchive(idOrStudent) {
    const rawIndex = String(
      (typeof idOrStudent === 'object' && idOrStudent !== null
        ? (idOrStudent.nrIndeksu || idOrStudent.index || idOrStudent.cleanIndex || idOrStudent.index_number || idOrStudent.id)
        : idOrStudent) || ''
    ).replace(/\D/g, '').trim();

    const cleanId = typeof idOrStudent === 'object' && idOrStudent !== null
      ? String(idOrStudent.supabaseId || idOrStudent.id || '').trim()
      : String(idOrStudent || '').trim();

    const entry = (typeof idOrStudent === 'object' && idOrStudent !== null)
      ? idOrStudent
      : (Array.isArray(archivedQuarantine) ? archivedQuarantine : []).find(a => {
          const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || a.index_number || '').replace(/\D/g, '').trim();
          return (rawIndex && aIdx === rawIndex) || String(a.id) === cleanId || String(a.supabaseId) === cleanId;
        }) || (Array.isArray(quarantine) ? quarantine : []).find(q => {
          const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || q.index_number || '').replace(/\D/g, '').trim();
          return (rawIndex && qIdx === rawIndex) || String(q.id) === cleanId || String(q.supabaseId) === cleanId;
        });

    const targetIndex = rawIndex || String(entry?.nrIndeksu || entry?.index || entry?.cleanIndex || entry?.index_number || '').replace(/\D/g, '').trim();
    const targetEmail = String(entry?.email || (typeof idOrStudent === 'object' ? idOrStudent?.email : '') || '').trim().toLowerCase();
    const rowId = entry?.id || cleanId;

    const validUuid = (isValidUUID(entry?.supabaseId) && entry.supabaseId) ||
                      (isValidUUID(entry?.id) && entry.id) ||
                      (isValidUUID(cleanId) && cleanId) ||
                      null;

    setToastMessage("Usuwanie wpisu z bazy Supabase...");

    try {
      let deleteQuery = supabase.from('quarantine_submissions').delete().eq('organization_id', currentOrgCleanId);
      let queryApplied = false;

      if (validUuid) {
        deleteQuery = deleteQuery.eq('id', validUuid);
        queryApplied = true;
      } else if (targetIndex) {
        deleteQuery = deleteQuery.eq('index_number', targetIndex);
        queryApplied = true;
      } else if (targetEmail && targetEmail.includes('@')) {
        deleteQuery = deleteQuery.eq('email', targetEmail);
        queryApplied = true;
      }

      if (queryApplied) {
        const { error } = await deleteQuery;
        if (error) {
          console.error('[handlePermanentDeleteArchive] Błąd Supabase podczas usuwania:', error);
          throw error;
        }
      }

      // Usunięcie również z members jeśli istnieje
      if (targetIndex) {
        await supabase.from('members').delete().eq('organization_id', currentOrgCleanId).eq('index_number', targetIndex);
      }

      setArchivedQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(a => {
        const aIdx = String(a.nrIndeksu || a.index || a.cleanIndex || a.index_number || '').replace(/\D/g, '').trim();
        const aId = String(a.id || '').trim();
        const aSupId = String(a.supabaseId || '').trim();
        const aEmail = String(a.email || '').trim().toLowerCase();
        return (targetIndex ? aIdx !== targetIndex : true) &&
               aId !== cleanId &&
               aId !== rowId &&
               (validUuid ? aId !== validUuid && aSupId !== validUuid : true) &&
               (targetEmail ? aEmail !== targetEmail : true);
      }));

      setQuarantine(prev => (Array.isArray(prev) ? prev : []).filter(q => {
        const qIdx = String(q.nrIndeksu || q.index || q.cleanIndex || q.index_number || '').replace(/\D/g, '').trim();
        const qId = String(q.id || '').trim();
        const qSupId = String(q.supabaseId || '').trim();
        const qEmail = String(q.email || '').trim().toLowerCase();
        return (targetIndex ? qIdx !== targetIndex : true) &&
               qId !== cleanId &&
               qId !== rowId &&
               (validUuid ? qId !== validUuid && qSupId !== validUuid : true) &&
               (targetEmail ? qEmail !== targetEmail : true);
      }));

      setMembers(prev => (Array.isArray(prev) ? prev : []).filter(m => {
        const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || m.index_number || '').replace(/\D/g, '').trim();
        const mId = String(m.id || '').trim();
        const mSupId = String(m.supabaseId || '').trim();
        const mEmail = String(m.email || '').trim().toLowerCase();
        return (targetIndex ? mIdx !== targetIndex : true) &&
               mId !== cleanId &&
               mId !== rowId &&
               (validUuid ? mId !== validUuid && mSupId !== validUuid : true) &&
               (targetEmail ? mEmail !== targetEmail : true);
      }));

      const now = new Date();
      setLastSync(now);
      setCloudSyncStatus({ status: 'synced', lastSyncTime: now, errorMessage: null });
      setToastMessage("Trwale usunięto wpis z bazy Supabase");

      await loadData({ silent: true, bypassCache: true });
    } catch (err) {
      console.error("[handlePermanentDeleteArchive] Błąd zapisu do Supabase:", err);
      setToastMessage(`Błąd usuwania wpisu z bazy Supabase: ${err.message || 'Nieznany błąd'}`);
    }
  }

  // ── Mark attendance ─────────────────────────────────────────────────────────
  function handleMarkAttendance(meetingId, indexes, payload) {
    const attendeesArr = Array.isArray(indexes) ? indexes : (payload?.confirmedIndexes || []);
    const count = payload?.confirmedCount !== undefined ? payload.confirmedCount : attendeesArr.length;
    const targetId = String(meetingId || '').trim();
    const cleanTargetId = targetId.toUpperCase().replace(/^\[.*?\]\s*/, '').trim();
    // Also match by meetingCode from payload (e.g. "[25/26] M14" or "M14")
    const payloadCode = String(payload?.meetingCode || '').trim();
    const cleanPayloadCode = payloadCode.toUpperCase().replace(/^\[.*?\]\s*/, '').trim();

    setMeetings(prev =>
      prev.map(m => {
        const mCode = String(m.code || '').trim();
        const mCleanCode = mCode.toUpperCase().replace(/^\[.*?\]\s*/, '').trim();
        const mId = String(m.id || '').trim();
        const mDate = String(m.date || '').trim();

        const isMatch = mId === targetId || mDate === targetId || mCode === targetId ||
          (cleanTargetId && (mCleanCode === cleanTargetId || mCode.toUpperCase().includes(cleanTargetId) || cleanTargetId.includes(mCleanCode))) ||
          (payloadCode && (mCode === payloadCode || mId === payloadCode)) ||
          (cleanPayloadCode && (mCleanCode === cleanPayloadCode));

        if (isMatch) {
          return {
            ...m,
            attendees: attendeesArr,
            attendeesCount: count,
            attendanceCount: count,
            participantRecords: payload?.attendees || payload?.participantRecords || (count === 0 ? [] : m.participantRecords || []),
            listaObecnosci: payload?.attendees || payload?.participantRecords || (count === 0 ? [] : m.listaObecnosci || []),
            status: count > 0 ? `Zakończone (${count})` : 'Nierozliczone',
            isUpcoming: count > 0 ? false : m.isUpcoming,
          };
        }
        return m;
      })
    );
  }

  const pendingCount = quarantine.length;
  const activeMembersCount = members.filter(isMemberActive).length;

  const customMeetingTypes = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(getStorageKey ? getStorageKey('crm_meeting_types') : 'crm_meeting_types') || '{}');
    } catch {
      return {};
    }
  }, [getStorageKey]);

  const blacklist = useMemo(() => {
    return getBlacklistedMembers(currentOrg?.id || 'default');
  }, [currentOrg?.id]);

  const membersMetrics = useMemo(() => {
    const activeMembersList = members.filter(m => isMemberActive(m));
    const activeCount = activeMembersList.length;
    const safeMeetings = Array.isArray(meetings) ? meetings : [];
    const isSknSeks = currentOrg?.id === 'skn_seksuologii';

    // 1. Parsowanie ewidencji O(1) dla całości KPI (izolowane per organizacja)
    let rawEw = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(getOrgKey(currentOrg?.id, 'crm_ewidencja'));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) rawEw = parsed;
        }
      } catch {}
    }

    const scopedEwidencja = rawEw.length > 0
      ? rawEw.filter(e => isEwidencjaInAcademicScope(e, currentScope, safeMeetings))
      : [];

    const attendanceIndex = buildAttendanceIndex(scopedEwidencja);

    const now = new Date();
    const mandatory = [];
    const bonus = [];

    safeMeetings.forEach(meeting => {
      if (!meeting) return;
      const rawDate = meeting.start_dt || meeting.data || meeting.date;
      if (!rawDate) return;

      const dateStr = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();

      const inRange = (!currentScope?.startDate || dateStr >= currentScope.startDate) &&
                      (!currentScope?.endDate || dateStr <= currentScope.endDate);

      const isPast = !meeting.isUpcoming && (
        new Date(dateStr) <= now ||
        (meeting.status && String(meeting.status).includes('Zakończone')) ||
        (meeting.attendanceCount && Number(meeting.attendanceCount) > 0)
      );

      if (!inRange || !isPast) return;

      // 1. Manual overrides
      if (meeting.countsInFrequency === false || meeting.includeInFrequency === false || meeting.wliczajDoFrekwencji === false) {
        bonus.push(meeting);
        return;
      }
      if (meeting.countsInFrequency === true || meeting.includeInFrequency === true || meeting.wliczajDoFrekwencji === true) {
        mandatory.push(meeting);
        return;
      }

      // 2. Type configuration
      const type = getMeetingType(meeting, customMeetingTypes);
      const typeCfg = MEETING_TYPES[type];
      const rawCharakter = String(meeting.charakter || meeting.type || '').toLowerCase();
      const isExplicitBonusCharakter =
        rawCharakter.includes('zarząd') ||
        rawCharakter.includes('zarzad') ||
        rawCharakter.includes('wewnętrzn') ||
        rawCharakter.includes('wewnetrzn') ||
        rawCharakter.includes('nieobowiązkow') ||
        rawCharakter.includes('nieobowiazkow') ||
        rawCharakter.includes('trigger') ||
        rawCharakter.includes('otwart');

      if (typeCfg?.countsTowardsDenominator && !isExplicitBonusCharakter) {
        mandatory.push(meeting);
      } else {
        bonus.push(meeting);
      }
    });

    const precompiledMandatory = precompileMeetings(mandatory);
    const precompiledBonus = precompileMeetings(bonus);

    let sum = 0;
    let certReadyCount = 0;
    const seenEmails = new Set();
    let consentsCount = 0;
    const minThreshold = attendanceConfig?.minPassingPercent || 50;

    activeMembersList.forEach(m => {
      const fData = calculateMemberAttendance(m, safeMeetings, currentScope, scopedEwidencja, {
        attendanceIndex,
        mandatoryMeetings: precompiledMandatory,
        bonusMeetings: precompiledBonus,
        eligibleMeetings: precompiledMandatory,
        scopedEwidencja,
      });

      const f = fData?.attendanceRate ?? 0;
      sum += isNaN(f) ? 0 : f;

      if (!isSknSeks) {
        if (f >= minThreshold) certReadyCount++;
      } else {
        if (fData?.canIssueCertificate) certReadyCount++;
      }

      const email = (m?.email || '').trim().toLowerCase();
      if (email && email.includes('@') && hasMailingConsent(m) && !seenEmails.has(email)) {
        seenEmails.add(email);
        consentsCount++;
      }
    });

    const avgFreq = activeCount > 0 ? Math.round(sum / activeCount) : 0;

    return {
      activeCount,
      avgFreq: isNaN(avgFreq) ? 0 : avgFreq,
      certReady: certReadyCount,
      mailingConsentsCount: consentsCount,
      archivedCount: Array.isArray(archivedQuarantine) ? archivedQuarantine.length : 0,
      meetingsCount: Array.isArray(safeMeetings) ? safeMeetings.length : (Array.isArray(meetings) ? meetings.length : 0),
    };
  }, [members, meetings, isMemberActive, currentOrg?.id, attendanceConfig?.minPassingPercent, academicYear, currentScope, archivedQuarantine]);

  const allMembersForMeetings = useMemo(() => {
    const list = [...(Array.isArray(members) ? members : [])];
    if (Array.isArray(archivedQuarantine)) {
      archivedQuarantine.forEach(arch => {
        if (!list.some(m => m.id === arch.id || (m.index && arch.index && String(m.index) === String(arch.index)))) {
          list.push({
            ...arch,
            isFormerMember: true,
            isArchived: true,
          });
        }
      });
    }
    return list;
  }, [members, archivedQuarantine]);

  const syncLabel = lastSync
    ? lastSync.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const isPublicFormRequested = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).has('form') ||
    new URLSearchParams(window.location.search).has('rekrutacja') ||
    new URLSearchParams(window.location.search).has('deklaracja') ||
    window.location.hash.includes('rekrutacja') ||
    window.location.hash.includes('form')
  );

  const [showPublicForm, setShowPublicForm] = useState(isPublicFormRequested);

  const urlOrgParam = typeof window !== 'undefined' ? (
    new URLSearchParams(window.location.search).get('org') ||
    new URLSearchParams(window.location.search).get('organization_id') ||
    new URLSearchParams(window.location.search).get('kolo') ||
    new URLSearchParams(window.location.search).get('tenant')
  ) : null;
  const effectiveFormOrgId = urlOrgParam || currentOrg?.id;

  if (showPublicForm) {
    return <SknApplicationForm orgId={effectiveFormOrgId} />;
  }

  if (!isAuthenticated || !user) {
    return <LoginScreen onOpenPublicForm={() => setShowPublicForm(true)} />;
  }

  return (
    <div
      className={`min-h-screen w-full max-w-full overflow-x-clip tenant-backdrop bg-gradient-to-br transition-colors duration-500 ${theme?.backdropGradientClass || 'from-slate-50 via-sky-50/40 to-indigo-50/50'}`}
      style={theme?.backdropStyle}
    >

      {/* ── Toast Notification Banner ───────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[90] bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5 duration-200 text-xs print:hidden">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Header with Bulletproof Z-Index & Clean Responsive Tiering ─────────── */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-50 print:hidden w-full shadow-xs">
        <div className="w-full max-w-[1850px] mx-auto px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 sm:gap-3 xl:gap-4 min-h-[56px] sm:min-h-[64px]">

          {/* Row 1 on Mobile & Tablets (< 1280px): Logo & Multi-Tenant Organization Switcher */}
          <div className="flex items-center justify-between xl:justify-start gap-2 sm:gap-3 min-w-0 w-full xl:w-auto relative">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 xl:flex-none">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shadow-md text-white font-black text-xs tracking-wider shrink-0 transition-all duration-300 ${
                theme?.headerBadgeGradient || 'bg-gradient-to-br from-purple-700 via-violet-700 to-indigo-800 shadow-purple-500/25'
              }`}>
                {theme?.badgeText || (currentOrg.id === 'uzaleznienia' ? 'UZAL' : currentOrg.id === 'psychoonkologia' ? 'ONKO' : 'SEKS')}
              </div>
              
              <div className="relative min-w-0 flex-1 xl:flex-none">
                <button
                  onClick={() => setIsOrgDropdownOpen(prev => !prev)}
                  className="w-full flex items-center justify-between xl:justify-start gap-1.5 sm:gap-2 text-left group hover:bg-slate-100/80 px-2 sm:px-2.5 py-1 sm:py-1.5 -mx-1 sm:-mx-1.5 rounded-xl transition cursor-pointer border border-transparent hover:border-slate-200/60 min-w-0"
                  title="Kliknij, aby przełączyć koło naukowe"
                >
                  <div className="min-w-0 flex-1 xl:flex-none">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <h1 className={`text-xs sm:text-sm font-extrabold text-slate-900 transition leading-tight truncate ${theme?.headerHoverTitle || 'group-hover:text-indigo-600'}`}>
                        {currentOrg.name}
                      </h1>
                      <span className={`text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border font-mono tracking-wide transition-colors shrink-0 ${
                        theme?.headerTagBadge || 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                      }`}>
                        {currentOrg.tag || 'WSKZ'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                      <p className="truncate hidden sm:inline">System Ewidencyjno-Sprawozdawczy</p>
                      <p className="truncate sm:hidden">System CRM</p>
                      <span className="text-[10px] text-slate-400 shrink-0">•</span>
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                        {academicYear}
                      </span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`text-slate-400 transition shrink-0 ml-1 ${theme?.headerHoverIcon || 'group-hover:text-indigo-600'}`} />
                </button>

                {/* Organization Dropdown Menu */}
                {isOrgDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setIsOrgDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[70] animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                        <span>Wybierz Koło Naukowe</span>
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">Multi-Tenant</span>
                      </div>
                      <div className="space-y-1.5 py-1.5 max-h-72 overflow-y-auto">
                        {organizations.map(org => {
                          const isSelected = org.id === currentOrg.id;
                          const orgTheme = getTenantTheme(org.id);
                          return (
                            <button
                              key={org.id}
                              onClick={() => {
                                switchOrg(org.id);
                                setIsOrgDropdownOpen(false);
                                setToastMessage(`Przełączono kontekst: ${org.name}`);
                              }}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs text-left transition cursor-pointer border ${
                                isSelected
                                  ? (orgTheme.dropdownSelectedClass || 'bg-indigo-50/90 text-indigo-950 font-bold border-indigo-200 shadow-xs')
                                  : 'text-slate-700 hover:bg-slate-50 border-transparent hover:border-slate-200/60'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] text-white shrink-0 shadow-2xs ${
                                  orgTheme.headerBadgeGradient || 'bg-gradient-to-br from-indigo-600 to-violet-700'
                                }`}>
                                  {orgTheme.badgeText || (org.id === 'uzaleznienia' ? 'UZAL' : org.id === 'psychoonkologia' ? 'ONKO' : 'SEKS')}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-bold leading-snug">{org.name}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[10px] text-slate-500 font-mono">{org.tag || 'WSKZ'}</span>
                                    <span className="text-[9px] text-slate-400">•</span>
                                    <span className="text-[10px] text-slate-400 truncate">{org.faculty || 'Wydział Psychologii'}</span>
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle2 size={16} className={`${orgTheme.dropdownSelectedIcon || 'text-indigo-600'} shrink-0`} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="border-t border-slate-100 pt-1.5 mt-1">
                        <button
                          onClick={() => {
                            setIsOrgDropdownOpen(false);
                            setIsSettingsOpen(true);
                          }}
                          className={`w-full flex items-center gap-2 p-2 rounded-xl text-xs font-bold text-slate-600 ${theme?.headerHoverTitle || 'hover:text-indigo-600'} hover:bg-slate-50 transition cursor-pointer`}
                        >
                          <Settings size={14} />
                          <span>Konfiguracja kół i uprawnień…</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Row 2 on Mobile/Tablets, Right Column on Large Desktop (xl:): Controls Toolbar */}
          <div className="flex items-center justify-between xl:justify-end gap-2 sm:gap-3 shrink-0 w-full xl:w-auto pt-2 xl:pt-0 border-t border-slate-100 xl:border-t-0 min-h-[38px] sm:min-h-[44px]">
            {/* Intelligent Cloud Sync Indicator */}
            <div className="shrink-0 min-w-0">
              <SyncIndicator
                status={isSyncing ? 'syncing' : cloudSyncStatus.status}
                lastSyncTime={cloudSyncStatus.lastSyncTime || lastSync}
                onRetry={() => handleRefreshData({ silent: false })}
              />
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto xl:ml-0">
              {/* Refresh button with Smart Sync & Reconciliation */}
              <button
                onClick={() => handleRefreshData({ silent: false })}
                disabled={loading || isSyncing}
                title="Inteligentna synchronizacja dwukierunkowa (Smart Sync & Reconcile)"
                className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl ${theme?.primaryBtn || 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'} disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer whitespace-nowrap min-h-[36px] sm:min-h-0`}
              >
                <RefreshCw size={13} className={(loading || isSyncing) ? 'animate-spin' : ''} />
                <span className="hidden md:inline">{isSyncing ? 'Synchronizacja...' : 'Odśwież dane'}</span>
              </button>

              {/* User Profile & Role Switcher Menu */}
              <ProfileMenu onOpenSettings={() => setIsSettingsOpen(true)} />
            </div>
          </div>
        </div>
      </header>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border-b border-red-100 px-3 sm:px-4 md:px-6 py-2 print:hidden w-full max-w-full overflow-x-hidden">
          <div className="w-full max-w-[1850px] mx-auto flex items-center gap-2 text-sm text-red-700">
            <WifiOff size={14} className="shrink-0" />
            <span>Błąd pobierania danych: <strong>{error}</strong></span>
            <button onClick={() => handleRefreshData({ silent: false })} className="ml-auto underline text-xs cursor-pointer">Spróbuj ponownie</button>
          </div>
        </div>
      )}

      {/* ── Main Content Area with Protected Top Padding ───────────────────── */}
      <main className="w-full max-w-[1850px] mx-auto px-3 sm:px-4 md:px-6 pt-5 sm:pt-6 md:pt-8 pb-12 space-y-4 sm:space-y-6 min-h-[calc(100vh-80px)] overflow-x-clip">

        {/* Navigation Bar with Condensed 5 Tabs and Sub-Tabs */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingCount={pendingCount}
          membersSubTab={membersSubTab}
          setMembersSubTab={setMembersSubTab}
          documentationSubTab={documentationSubTab}
          setDocumentationSubTab={setDocumentationSubTab}
          settingsToolsSubTab={settingsToolsSubTab}
          setSettingsToolsSubTab={setSettingsToolsSubTab}
          membersMetrics={membersMetrics}
        />

        {/* Skeleton loading state on first load */}
        {loading && members.length === 0 && quarantine.length === 0 && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 h-24" />
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 h-64" />
          </div>
        )}

        {/* Tabs */}
        {(!loading || members.length > 0 || quarantine.length > 0) && (
          <ErrorBoundary>
            {(() => {
              switch (activeTab) {
                case 'members':
                  if (membersSubTab === 'quarantine') {
                    return (
                      <QuarantineTab
                        members={members}
                        quarantine={quarantine}
                        archivedQuarantine={archivedQuarantine}
                        academicYear={academicYear}
                        onApprove={handleApprove}
                        onBulkApprove={handleBulkApprove}
                        onArchive={handleArchive}
                        onBulkArchive={handleBulkArchive}
                        onRestoreArchive={handleRestoreArchive}
                        onBulkRestoreArchive={handleBulkRestoreArchive}
                        onPermanentDeleteArchive={handlePermanentDeleteArchive}
                        onSaveMember={handleSaveMember}
                        onAddMember={handleAddMember}
                        pendingSyncCount={pendingSyncCount}
                        onBatchSyncMembers={handleBatchSyncMembers}
                      />
                    );
                  }
                  return (
                    <ManagementTab
                      members={members}
                      meetings={meetings}
                      isLoading={loading}
                      academicYear={academicYear}
                      onAcademicYearChange={handleAcademicYearChange}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomDateChange={handleCustomDateChange}
                      onToggleStatus={handleToggleStatus}
                      onRevertToQuarantine={handleRevertToQuarantine}
                      onSaveMember={handleSaveMember}
                      onArchiveMember={handleArchiveMember}
                      onBulkMarkGraduates={handleBulkMarkGraduates}
                      onBulkArchiveGraduates={handleBulkArchiveGraduates}
                      onNavigateToReports={handleNavigateToReports}
                    />
                  );

                case 'management':
                  return (
                    <ManagementTab
                      members={members}
                      meetings={meetings}
                      isLoading={loading}
                      academicYear={academicYear}
                      onAcademicYearChange={handleAcademicYearChange}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomDateChange={handleCustomDateChange}
                      onToggleStatus={handleToggleStatus}
                      onRevertToQuarantine={handleRevertToQuarantine}
                      onSaveMember={handleSaveMember}
                      onArchiveMember={handleArchiveMember}
                      onBulkMarkGraduates={handleBulkMarkGraduates}
                      onBulkArchiveGraduates={handleBulkArchiveGraduates}
                      onNavigateToReports={handleNavigateToReports}
                    />
                  );

                case 'quarantine':
                  return (
                    <QuarantineTab
                      members={members}
                      quarantine={quarantine}
                      archivedQuarantine={archivedQuarantine}
                      meetings={meetings}
                      academicYear={academicYear}
                      onApprove={handleApprove}
                      onBulkApprove={handleBulkApprove}
                      onArchive={handleArchive}
                      onBulkArchive={handleBulkArchive}
                      onRestoreArchive={handleRestoreArchive}
                      onBulkRestoreArchive={handleBulkRestoreArchive}
                      onPermanentDeleteArchive={handlePermanentDeleteArchive}
                      onSaveMember={handleSaveMember}
                      onAddMember={handleAddMember}
                      pendingSyncCount={pendingSyncCount}
                      onBatchSyncMembers={handleBatchSyncMembers}
                    />
                  );

                case 'meetings':
                  return (
                    <MeetingsTab
                      meetings={meetings}
                      members={allMembersForMeetings}
                      onMarkAttendance={handleMarkAttendance}
                      subcalendars={subcalendars}
                      selectedSubcalendar={selectedSubcalendar}
                      onSubcalendarChange={handleSubcalendarChange}
                      onRefreshMeetings={handleRefreshCalendar}
                      loadingMeetings={loadingMeetings}
                      academicYear={academicYear}
                      onAcademicYearChange={handleAcademicYearChange}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomDateChange={handleCustomDateChange}
                    />
                  );

                case 'documentation':
                  if (documentationSubTab === 'documents') {
                    return <DocumentsRepositoryTab />;
                  }
                  return (
                    <ReportsTab
                      members={members}
                      meetings={meetings}
                      academicYear={academicYear}
                      initialMember={reportsTarget.member}
                      initialDocType={reportsTarget.docType}
                    />
                  );

                case 'reports':
                  return (
                    <ReportsTab
                      members={members}
                      meetings={meetings}
                      academicYear={academicYear}
                      initialMember={reportsTarget.member}
                      initialDocType={reportsTarget.docType}
                    />
                  );

                case 'documents':
                case 'repository':
                  return <DocumentsRepositoryTab />;

                case 'research':
                  return <ResearchTab members={members} />;

                case 'settings_tools':
                  if (settingsToolsSubTab === 'tools') {
                    return (
                      <ToolsTab
                        members={members}
                        materials={materials}
                        meetings={meetings}
                        onBulkMarkGraduates={handleBulkMarkGraduates}
                        onBulkArchiveGraduates={handleBulkArchiveGraduates}
                      />
                    );
                  }
                  return (
                    <SettingsTab
                      members={members}
                      meetings={meetings}
                      onRefreshData={handleRefreshData}
                    />
                  );

                case 'settings':
                  return (
                    <SettingsTab
                      members={members}
                      meetings={meetings}
                      onRefreshData={handleRefreshData}
                    />
                  );

                case 'tools':
                  return (
                    <ToolsTab
                      members={members}
                      materials={materials}
                      meetings={meetings}
                      onBulkMarkGraduates={handleBulkMarkGraduates}
                      onBulkArchiveGraduates={handleBulkArchiveGraduates}
                    />
                  );

                default:
                  return (
                    <ManagementTab
                      members={members}
                      meetings={meetings}
                      isLoading={loading}
                      academicYear={academicYear}
                      onAcademicYearChange={handleAcademicYearChange}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      onCustomDateChange={handleCustomDateChange}
                      onToggleStatus={handleToggleStatus}
                      onRevertToQuarantine={handleRevertToQuarantine}
                      onSaveMember={handleSaveMember}
                      onArchiveMember={handleArchiveMember}
                      onBulkMarkGraduates={handleBulkMarkGraduates}
                      onBulkArchiveGraduates={handleBulkArchiveGraduates}
                      onNavigateToReports={handleNavigateToReports}
                    />
                  );
              }
            })()}
          </ErrorBoundary>
        )}
      </main>

      {/* ── Multi-Tenant Settings Modal ─────────────────────────────────────── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          handleRefreshData();
        }}
      />
    </div>
  );
}
