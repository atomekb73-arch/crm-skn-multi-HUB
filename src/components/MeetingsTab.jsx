import React, { useState, useMemo, useEffect, useRef, useTransition, useCallback } from 'react';
import { showToast } from '../utils/toast';
import {
  CalendarDays,
  ClipboardList,
  Play,
  CheckCircle2,
  Circle,
  RefreshCw,
  Calendar,
  MapPin,
  Sparkles,
  Clock,
  User,
  Tag,
  Timer,
  Sliders,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  Check,
  X,
  RotateCcw,
  FileText,
  Printer,
  Plus,
  Minus,
  Save,
  FolderPlus,
  Edit3,
  Trash2,
  Undo2,
  Loader2,
  Search,
  Users,
  Maximize2,
} from 'lucide-react';
import { MEETING_TYPES, getMeetingType, isMeetingEligibleForDenominator, getMeetingStatusInfo } from '../utils/meetingTypes';
import { parseAttendanceLine, parseDurationToMinutes, fetchMeetingSheetAttendance, saveMeetingAttendanceToGAS, deleteMeetingAttendanceFromGAS, sendToGAS } from '../services/googleSheets';
import { isFacultySupervisor, isMonikaLyniewska, FACULTY_SUPERVISORS, PARTICIPANT_ROLES, detectParticipantRole, isFormerMemberRecord } from '../utils/specialRoles';
import { matchMemberExact, matchSupervisorExact, resolveParticipantFromSavedIndex, parseAttendanceInput, parseAliasesList } from '../utils/meetingParser';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { ACADEMIC_YEARS, getAcademicYearKey, getAcademicYearOptions } from '../utils/academicYear';
import { getAcademicYearFromDate } from '../utils/helpers';
import AttendanceModal from './AttendanceModal';
import CalendarSelector, { DEFAULT_CALENDAR_SUB_ID } from './CalendarSelector';
import { OfficialMeetingMinutesTemplate } from './DocumentTemplates';
import {
  getMeetingProtocol,
  saveMeetingProtocol,
  addDocumentToRegistry,
  getMeetingsTrash,
  addMeetingToTrash,
  restoreMeetingFromTrash,
  permanentlyDeleteMeetingFromTrash,
  getIgnoredMeetings,
  addIgnoredMeeting,
  removeIgnoredMeeting,
  getCustomMeetings,
  saveCustomMeeting,
  deleteCustomMeeting,
  getMeetingOverrides,
  saveMeetingOverride,
} from '../utils/storage';

const normalizeDiacritics = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .trim();
};

// ── Vector Outline Icons for Meeting Status & Format Categories ──────────────
function MeetingTypeVectorIcon({ typeId, size = 16 }) {
  switch (typeId) {
    case 'mandatory':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-emerald-500 shrink-0" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
    case 'optional':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-amber-500 shrink-0" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
    case 'trigger_warning':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-rose-500 shrink-0" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
    case 'internal':
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-indigo-500 shrink-0" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
    case 'conference_passive':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 shrink-0" aria-hidden="true">
          <path d="M2 3h20" />
          <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
          <path d="m7 21 5-5 5 5" />
        </svg>
      );
    case 'workshop_external':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600 shrink-0" aria-hidden="true">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-emerald-500 shrink-0" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
  }
}

// ── Memoized Single Meeting Card Component for Zero Re-render Overhead ────────
const MeetingListItem = React.memo(function MeetingListItem({
  meeting: m,
  isSelected,
  isUpcoming,
  typeConfig,
  count,
  academicYear,
  onSelect,
  onEdit,
}) {
  const statusInfo = getMeetingStatusInfo(m, count);
  const isCardUpcoming = statusInfo.isUpcoming && !statusInfo.isCompleted;

  const dateAcad = m.date ? getAcademicYearFromDate(m.date) : null;
  const rawYear = String(m.academicYearShort || (dateAcad ? dateAcad.short : (m.academicYear || academicYear || '26/27')));
  const cleanYear = rawYear.replace(/[\[\]]/g, '').replace(/20(\d\d)/g, '$1').trim();
  const rawCode = String(m.code || m.id || 'M01').replace(/[\[\]]/g, '');
  const cleanCodeOnly = rawCode
    .replace(/\b20\d\d\/20\d\d\b/g, '')
    .replace(/\b20\d\d\/\d\d\b/g, '')
    .replace(/\b\d\d\/\d\d\b/g, '')
    .replace(/^[\s•\-\/]+|[\s•\-\/]+$/g, '')
    .trim() || rawCode.trim();
  const displayCodeBadge = cleanYear ? `${cleanYear} • ${cleanCodeOnly}` : cleanCodeOnly;
  const isNewlyCreated = Boolean(m.isNewlyCreated);

  return (
    <button
      type="button"
      onClick={() => onSelect(m)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onEdit) onEdit(m);
      }}
      title="Kliknij dwukrotnie, aby edytować dane spotkania"
      className={`group w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
        isNewlyCreated
          ? 'border-purple-400 bg-purple-50/90 shadow-md ring-2 ring-purple-300'
          : isSelected
          ? 'border-indigo-500 bg-indigo-50/90 shadow-2xs ring-2 ring-indigo-200'
          : isCardUpcoming
          ? 'border-emerald-200/80 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50/60'
          : 'border-slate-200/80 bg-white hover:border-indigo-300 hover:bg-slate-50'
      }`}
    >
      {isNewlyCreated && (
        <div className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-bold py-0.5 px-2 rounded-md flex items-center justify-between shadow-2xs">
          <span className="flex items-center gap-1 truncate">
            <Sparkles size={11} className="text-amber-300 shrink-0" />
            <span>Właśnie dodane – uzupełnij obecności</span>
          </span>
          <span className="text-[9px] bg-white/20 px-1 rounded uppercase tracking-wider shrink-0 ml-1">NOWE</span>
        </div>
      )}
      {/* Top Row: Code Pill + Date */}
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex items-center gap-1 min-w-0">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight shrink-0 border ${
            isSelected
              ? 'bg-indigo-600 text-white border-indigo-600'
              : isCardUpcoming
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
              : 'bg-slate-100 text-slate-700 border-slate-200 group-hover:bg-indigo-100 group-hover:text-indigo-800'
          }`}>
            {displayCodeBadge}
          </span>
          {typeConfig && (
            <span className="shrink-0 inline-flex items-center" title={typeConfig.label}>
              <MeetingTypeVectorIcon typeId={typeConfig.id} size={13} />
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-400 shrink-0 truncate max-w-[85px]">
          {m.formattedDate || m.date || m.start_dt}
        </span>
      </div>

      {/* Middle Row: Title (compact text-xs, truncate) */}
      <p className={`text-xs font-semibold leading-tight line-clamp-2 ${
        isSelected ? 'text-indigo-950 font-bold' : 'text-slate-800'
      }`} title={m.title}>
        {m.title}
      </p>

      {/* Bottom Row: Status pill */}
      <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-slate-100/70">
        {statusInfo.isCompleted ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
            <Check size={10} className="text-emerald-600" />
            <span>{statusInfo.count > 0 ? `✓ ${statusInfo.count} obecnych` : '✓ Zakończone'}</span>
          </span>
        ) : statusInfo.isUpcoming ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <Sparkles size={10} className="text-emerald-500" />
            <span>Zaplanowane</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
            <Clock size={10} />
            <span>{statusInfo.count > 0 ? `${statusInfo.count} obecnych` : 'Brak obecności'}</span>
          </span>
        )}

        {m.who && (
          <span className="text-slate-400 truncate max-w-[85px] text-[10px]" title={m.who}>
            {m.who}
          </span>
        )}
      </div>
    </button>
  );
});

export default function MeetingsTab({
  meetings = [],
  members = [],
  onMarkAttendance,
  subcalendars = [],
  selectedSubcalendar,
  onSubcalendarChange,
  onRefreshMeetings,
  loadingMeetings,
  academicYear,
  onAcademicYearChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
}) {
  const { currentOrg, getStorageKey } = useOrg();
  const { isViewer } = useAuth();
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [activeMeetingId, setActiveMeetingId] = useState(null);
  const [isPending, startTransition] = useTransition();

  const [rawList, setRawList]   = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef(null);
  const [results, setResults]   = useState(null);
  const [parsedParticipants, setParsedParticipants] = useState([]);
  const [attendeeSearchQuery, setAttendeeSearchQuery] = useState('');
  const [manualOverrides, setManualOverrides] = useState({});
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [sheetFeedback, setSheetFeedback] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  // Counter that increments on every localStorage attendance mutation to force sidebar card re-renders
  const [localStorageVersion, setLocalStorageVersion] = useState(0);
  const [isClearingAttendance, setIsClearingAttendance] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // ── Resizable Sidebar state (12.5% to 25% of window width, default: 18vw) ──
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_sidebar_width');
      if (saved) return saved;
    }
    return '18vw'; // domyślna wartość startowa
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarContainerRef = useRef(null);
  const selectedMeetingRef = useRef(selectedMeeting);
  useEffect(() => {
    selectedMeetingRef.current = selectedMeeting;
  }, [selectedMeeting]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const screenWidth = window.innerWidth;
      const containerLeft = sidebarContainerRef.current ? sidebarContainerRef.current.getBoundingClientRect().left : 0;
      const newWidthPx = containerLeft > 0 ? (e.clientX - containerLeft) : e.clientX;

      const minAllowed = screenWidth * 0.125; // 1/8 (12.5%)
      const maxAllowed = screenWidth * 0.25;  // 1/4 (25%)

      if (newWidthPx >= minAllowed && newWidthPx <= maxAllowed) {
        setSidebarWidth(`${newWidthPx}px`);
      } else if (newWidthPx < minAllowed) {
        setSidebarWidth(`${minAllowed}px`);
      } else if (newWidthPx > maxAllowed) {
        setSidebarWidth(`${maxAllowed}px`);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setSidebarWidth(currentWidth => {
        try { localStorage.setItem('crm_sidebar_width', currentWidth); } catch {}
        return currentWidth;
      });
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Protocol / Meeting Minutes state
  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [isPrintingProtocol, setIsPrintingProtocol] = useState(false);
  const [protocolSaveStatus, setProtocolSaveStatus] = useState(null);
  const [protocolForm, setProtocolForm] = useState({
    protocolNumber: '',
    date: '',
    time: '18:00 - 19:30',
    location: 'Google Meet / MS Teams',
    title: '',
    speaker: '',
    attendeesCount: 0,
    recorder: 'Zarząd Koła Naukowego',
    agenda: '',
    content: '',
    conclusions: '',
    includeAttendeesList: true,
    attendees: [],
  });

  // Attendance threshold in minutes (default: 15 minutes)
  const [minDurationThreshold, setMinDurationThreshold] = useState(() => {
    try {
      const saved = localStorage.getItem(getStorageKey('crm_meeting_min_duration'));
      if (saved) return parseInt(saved, 10) || 15;
    } catch {}
    return 15;
  });

  const handleThresholdChange = (newThreshold) => {
    const val = Math.max(1, parseInt(newThreshold, 10) || 1);
    setMinDurationThreshold(val);
    try {
      localStorage.setItem(getStorageKey('crm_meeting_min_duration'), String(val));
    } catch {}

    // Re-evaluate participants if already processed
    if (parsedParticipants.length > 0) {
      recalculateAttendance(parsedParticipants, manualOverrides, val);
    }
  };

  // Persistent custom meeting categories (localStorage)
  const [customTypes, setCustomTypes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(getStorageKey('crm_meeting_types')) || '{}');
    } catch {
      return {};
    }
  });

  // ── Soft Delete (Trash) and Custom Meetings & Overrides state ──────────────
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'trash'
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [editedCodeValue, setEditedCodeValue] = useState('');
  const [meetingToTrash, setMeetingToTrash] = useState(null);
  const [meetingToPermanentDelete, setMeetingToPermanentDelete] = useState(null);
  const [meetingToEdit, setMeetingToEdit] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMeetingForm, setNewMeetingForm] = useState({
    code: '',
    title: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    eventMode: 'stacjonarnie',
    date: new Date().toISOString().slice(0, 10),
    time: '18:00 - 19:30',
    speaker: '',
    defaultType: 'mandatory',
  });

  const computedNewMeetingDays = useMemo(() => {
    const startStr = newMeetingForm.startDate || newMeetingForm.date;
    const endStr = newMeetingForm.endDate;
    if (!startStr || !endStr || endStr <= startStr) return 1;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 1;
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays + 1);
  }, [newMeetingForm.startDate, newMeetingForm.date, newMeetingForm.endDate]);

  // Storage data for Trash, Custom Meetings and Overrides
  const [trashList, setTrashList] = useState(() => {
    return getMeetingsTrash(currentOrg?.id || 'default');
  });

  const [customMeetings, setCustomMeetings] = useState(() => {
    return getCustomMeetings(currentOrg?.id || 'default');
  });

  const [meetingOverrides, setMeetingOverrides] = useState(() => {
    return getMeetingOverrides(currentOrg?.id || 'default');
  });

  useEffect(() => {
    const orgId = currentOrg?.id || 'default';
    setTrashList(getMeetingsTrash(orgId));
    setCustomMeetings(getCustomMeetings(orgId));
    setMeetingOverrides(getMeetingOverrides(orgId));
  }, [currentOrg?.id]);

  // Compute all effective meetings combining props + custom meetings + overrides
  const allEffectiveMeetings = useMemo(() => {
    const combined = [...meetings];

    customMeetings.forEach(cm => {
      const idx = combined.findIndex(m => m.id === cm.id || (m.code && cm.code && m.code === cm.code));
      if (idx >= 0) {
        combined[idx] = { ...combined[idx], ...cm };
      } else {
        combined.push(cm);
      }
    });

    return combined.map(m => {
      const mId = m.id || m.code;
      const ov = (m.id && meetingOverrides[m.id]) || (m.code && meetingOverrides[m.code]) || meetingOverrides[mId];
      if (ov) {
        return {
          ...m,
          ...ov,
          code: ov.code || m.code,
        };
      }
      return m;
    });
  }, [meetings, customMeetings, meetingOverrides]);

  const trashKeySet = useMemo(() => {
    const s = new Set();
    const orgId = currentOrg?.id || 'default';
    const ignored = getIgnoredMeetings(orgId);
    ignored.forEach(id => {
      const clean = String(id || '').trim();
      if (clean) {
        s.add(clean);
        s.add(clean.replace(/[\[\]]/g, ''));
      }
    });
    trashList.forEach(t => {
      if (t.id) s.add(String(t.id).trim());
      if (t.code) {
        const cleanCode = String(t.code).trim();
        s.add(cleanCode);
        s.add(cleanCode.replace(/[\[\]]/g, ''));
      }
    });
    return s;
  }, [trashList, currentOrg?.id]);

  // Zakres dat dla wybranego roku akademickiego
  const selectedYearRange = useMemo(() => {
    const key = getAcademicYearKey(academicYear);
    if (key === 'custom') {
      return {
        startDate: customStartDate || '2026-10-01',
        endDate: customEndDate || '2027-09-30'
      };
    }
    if (ACADEMIC_YEARS[key]) {
      return {
        startDate: ACADEMIC_YEARS[key].startDate,
        endDate: ACADEMIC_YEARS[key].endDate
      };
    }
    return {
      startDate: ACADEMIC_YEARS["2026/2027"].startDate,
      endDate: ACADEMIC_YEARS["2026/2027"].endDate
    };
  }, [academicYear, customStartDate, customEndDate]);

  const activeMeetings = useMemo(() => {
    const filtered = allEffectiveMeetings.filter(m => {
      const mId = m.id ? String(m.id).trim() : '';
      const mCode = m.code ? String(m.code).trim() : '';
      const cleanCode = mCode ? mCode.replace(/[\[\]]/g, '') : '';

      const idMatch = mId && trashKeySet.has(mId);
      const codeMatch = (mCode && trashKeySet.has(mCode)) || (cleanCode && trashKeySet.has(cleanCode));
      // Filtrowanie wykluczające z Kosza
      if (idMatch || codeMatch) return false;

      // Ścisłe filtrowanie po dacie wybranego roku akademickiego
      const meetingDate = m.start_dt || m.date || m.dataSpotkania || m.data;
      if (meetingDate && selectedYearRange.startDate && selectedYearRange.endDate) {
        const dStr = String(meetingDate).split('T')[0];
        if (dStr < selectedYearRange.startDate || dStr > selectedYearRange.endDate) {
          return false;
        }
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      // 1. Jeśli jedno ze spotkań jest świeżo dodane w tej sesji, zachowaj je na samej górze
      if (a.isNewlyCreated && !b.isNewlyCreated) return -1;
      if (!a.isNewlyCreated && b.isNewlyCreated) return 1;

      // 2. Standardowe sortowanie chronologiczne po dacie (rosnąco)
      const parseDate = (item) => {
        const raw = item.date || item.dataSpotkania || (item.start_dt ? String(item.start_dt).split('T')[0] : '');
        if (!raw) return 0;
        const ts = new Date(raw).getTime();
        return isNaN(ts) ? 0 : ts;
      };

      const dateA = parseDate(a);
      const dateB = parseDate(b);

      if (dateA !== dateB) {
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      }

      // 3. W przypadku identycznej daty, sortuj po kodzie numerycznym (M01, M02...)
      const codeA = String(a.code || a.id || '').replace(/\D/g, '');
      const codeB = String(b.code || b.id || '').replace(/\D/g, '');
      if (codeA && codeB && Number(codeA) !== Number(codeB)) {
        return Number(codeA) - Number(codeB);
      }
      return String(a.code || a.id || '').localeCompare(String(b.code || b.id || ''));
    });
  }, [allEffectiveMeetings, trashKeySet, selectedYearRange]);

  // Keep selectedMeeting synced with latest overrides
  const currentSelectedMeeting = useMemo(() => {
    if (!selectedMeeting) return null;
    const mId = selectedMeeting.id || selectedMeeting.code;
    const ov = (selectedMeeting.id && meetingOverrides[selectedMeeting.id]) ||
               (selectedMeeting.code && meetingOverrides[selectedMeeting.code]) ||
               meetingOverrides[mId];
    if (ov) {
      return { ...selectedMeeting, ...ov, code: ov.code || selectedMeeting.code };
    }
    return selectedMeeting;
  }, [selectedMeeting, meetingOverrides]);

  useEffect(() => {
    if (activeMeetings.length > 0) {
      const isCurrentSelectedStillActive = selectedMeeting && activeMeetings.some(m => (m.id && m.id === selectedMeeting.id) || (m.code && m.code === selectedMeeting.code));
      if (!isCurrentSelectedStillActive) {
        handleSelectMeeting(activeMeetings[0]);
      }
    } else if (selectedMeeting) {
      setSelectedMeeting(null);
      setActiveMeetingId(null);
    }
  }, [activeMeetings, selectedMeeting]);

  const handleOpenAddModal = () => {
    setMeetingToEdit(null);
    const existingCodes = allEffectiveMeetings
      .map(m => String(m.code || m.id || '').replace(/\D/g, ''))
      .filter(Boolean)
      .map(Number);
    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    const nextCode = `M${String(maxNum + 1).padStart(2, '0')}`;

    setNewMeetingForm({
      code: nextCode,
      title: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      eventMode: 'stacjonarnie',
      date: new Date().toISOString().slice(0, 10),
      time: '18:00 - 19:30',
      speaker: '',
      defaultType: 'mandatory',
    });
    setIsAddModalOpen(true);
  };

  const handleEditMeeting = useCallback((meeting) => {
    if (!meeting) return;
    const rawCode = String(meeting.code || meeting.id || '').replace(/[\[\]]/g, '');
    const cleanCodeOnly = rawCode
      .replace(/\b20\d\d\/20\d\d\b/g, '')
      .replace(/\b20\d\d\/\d\d\b/g, '')
      .replace(/\b\d\d\/\d\d\b/g, '')
      .replace(/^[\s•\-\/]+|[\s•\-\/]+$/g, '')
      .trim() || rawCode.trim();

    const startDate = meeting.startDate || meeting.date || (meeting.start_dt ? String(meeting.start_dt).split('T')[0] : new Date().toISOString().slice(0, 10));
    const endDate = meeting.endDate || (meeting.end_dt ? String(meeting.end_dt).split('T')[0] : '');
    const eventMode = meeting.eventMode || (meeting.forma === 'Online' || meeting.mode === 'online' ? 'online' : 'stacjonarnie');
    const time = meeting.time || '18:00 - 19:30';
    const speaker = meeting.speaker || meeting.who || '';
    const defaultType = meeting.type || meeting.meetingType || meeting.category || (customTypes && (meeting.id && customTypes[meeting.id] || meeting.code && customTypes[meeting.code])) || 'mandatory';

    setMeetingToEdit(meeting);
    setNewMeetingForm({
      code: cleanCodeOnly,
      title: meeting.title || '',
      startDate,
      endDate,
      eventMode,
      date: startDate,
      time,
      speaker,
      defaultType,
    });
    setIsAddModalOpen(true);
  }, [customTypes]);

  const teamupSuggestionsForDate = useMemo(() => {
    if (!newMeetingForm.date) return [];
    const targetDate = String(newMeetingForm.date).trim();
    return (meetings || []).filter(m => {
      const mDate = m.date || (m.start_dt ? String(m.start_dt).split('T')[0] : '');
      return mDate === targetDate;
    });
  }, [newMeetingForm.date, meetings]);

  const handleSelectTeamupSuggestion = (m) => {
    let extractedCode = '';
    if (m.code) {
      const codeMatch = m.code.match(/M\d+/i);
      if (codeMatch) extractedCode = codeMatch[0].toUpperCase();
      else extractedCode = m.code.replace(/[\[\]]/g, '').trim();
    } else if (m.title) {
      const titleCodeMatch = m.title.match(/\[?\s*(?:M\d+|M\s*\d+)\s*\]?/i);
      if (titleCodeMatch) extractedCode = titleCodeMatch[0].replace(/[\[\]]/g, '').trim().toUpperCase();
    }

    let extractedTime = '18:00 - 19:30';
    if (m.start_dt && m.end_dt) {
      const startT = m.start_dt.split('T')[1]?.slice(0, 5) || '18:00';
      const endT = m.end_dt.split('T')[1]?.slice(0, 5) || '19:30';
      extractedTime = `${startT} - ${endT}`;
    } else if (m.time) {
      extractedTime = m.time;
    }

    setNewMeetingForm(prev => ({
      ...prev,
      code: extractedCode || prev.code,
      title: m.title || prev.title,
      time: extractedTime,
      speaker: m.who || m.speaker || prev.speaker || 'Prelegent / Zarząd Koła',
    }));
  };

  const handleSaveNewMeeting = (e) => {
    if (e) e.preventDefault();
    if (!newMeetingForm.title?.trim()) {
      showToast('Wprowadź tytuł spotkania.');
      return;
    }

    const cleanCode = (newMeetingForm.code?.trim() || `M${allEffectiveMeetings.length + 1}`).toUpperCase().replace(/[\[\]]/g, '');
    const startDateVal = newMeetingForm.startDate || newMeetingForm.date || new Date().toISOString().slice(0, 10);
    const endDateVal = newMeetingForm.endDate || '';

    let daysCount = 1;
    if (startDateVal && endDateVal && endDateVal > startDateVal) {
      const start = new Date(startDateVal);
      const end = new Date(endDateVal);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        daysCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      }
    }

    const formattedDateStr = (endDateVal && endDateVal > startDateVal)
      ? `${startDateVal} — ${endDateVal} (${daysCount} dni)`
      : `${startDateVal}, ${newMeetingForm.time || '18:00 - 19:30'}`;

    const orgId = currentOrg?.id || 'default';

    if (meetingToEdit) {
      // ── Tryb Edycji Istniejącego Spotkania ──────────────────────────────
      const targetId = meetingToEdit.id || meetingToEdit.code;
      const updatedMeeting = {
        ...meetingToEdit,
        code: cleanCode,
        title: newMeetingForm.title.trim(),
        date: startDateVal,
        startDate: startDateVal,
        endDate: endDateVal,
        daysCount: daysCount,
        eventMode: newMeetingForm.eventMode || 'stacjonarnie',
        mode: newMeetingForm.eventMode || 'stacjonarnie',
        forma: newMeetingForm.eventMode === 'online' ? 'Online' : (newMeetingForm.eventMode === 'hybrydowo' ? 'Hybrydowo' : 'Stacjonarnie'),
        time: newMeetingForm.time || '18:00 - 19:30',
        formattedDate: formattedDateStr,
        speaker: newMeetingForm.speaker?.trim() || meetingToEdit.speaker || 'Prelegent / Zarząd Koła',
        who: newMeetingForm.speaker?.trim() || meetingToEdit.who || 'Prelegent / Zarząd Koła',
        type: newMeetingForm.defaultType,
        meetingType: newMeetingForm.defaultType,
        category: newMeetingForm.defaultType,
        isUpcoming: new Date(endDateVal || startDateVal) >= new Date(),
      };

      const updatedOverrides = saveMeetingOverride(orgId, targetId, {
        code: cleanCode,
        title: updatedMeeting.title,
        date: startDateVal,
        startDate: startDateVal,
        endDate: endDateVal,
        daysCount: daysCount,
        eventMode: updatedMeeting.eventMode,
        mode: updatedMeeting.mode,
        forma: updatedMeeting.forma,
        time: updatedMeeting.time,
        formattedDate: formattedDateStr,
        speaker: updatedMeeting.speaker,
        who: updatedMeeting.who,
        type: newMeetingForm.defaultType,
        meetingType: newMeetingForm.defaultType,
        category: newMeetingForm.defaultType,
      });
      setMeetingOverrides(updatedOverrides);

      if (meetingToEdit.isCustom) {
        const updatedCustoms = saveCustomMeeting(orgId, updatedMeeting);
        setCustomMeetings(updatedCustoms);
      }

      if (newMeetingForm.defaultType) {
        const newCustomTypes = { ...customTypes, [targetId]: newMeetingForm.defaultType, [cleanCode]: newMeetingForm.defaultType };
        setCustomTypes(newCustomTypes);
        try {
          localStorage.setItem(getStorageKey('crm_meeting_types'), JSON.stringify(newCustomTypes));
        } catch {}
      }

      setSelectedMeeting(updatedMeeting);
      setIsAddModalOpen(false);
      setMeetingToEdit(null);
    } else {
      // ── Tryb Tworzenia Nowego Spotkania ─────────────────────────────────
      const newMeetingId = `custom_${Date.now()}`;
      const newMeeting = {
        id: newMeetingId,
        code: cleanCode,
        title: newMeetingForm.title.trim(),
        date: startDateVal,
        startDate: startDateVal,
        endDate: endDateVal,
        daysCount: daysCount,
        eventMode: newMeetingForm.eventMode || 'stacjonarnie',
        mode: newMeetingForm.eventMode || 'stacjonarnie',
        forma: newMeetingForm.eventMode === 'online' ? 'Online' : (newMeetingForm.eventMode === 'hybrydowo' ? 'Hybrydowo' : 'Stacjonarnie'),
        time: newMeetingForm.time,
        formattedDate: formattedDateStr,
        speaker: newMeetingForm.speaker?.trim() || 'Prelegent / Zarząd Koła',
        academicYear: academicYear && academicYear !== 'custom' ? academicYear : getAcademicYearFromDate(startDateVal).full,
        academicYearShort: getAcademicYearFromDate(startDateVal).short,
        academicYearCode: `[${getAcademicYearFromDate(startDateVal).short}]`,
        type: newMeetingForm.defaultType,
        meetingType: newMeetingForm.defaultType,
        isCustom: true,
        isUpcoming: new Date(endDateVal || startDateVal) >= new Date(),
        isNewlyCreated: true, // Tymczasowe przypięcie na samej górze po dodaniu (State UX)
        attendees: [],
        participantRecords: [],
      };

      const updated = saveCustomMeeting(orgId, newMeeting);
      setCustomMeetings(updated.map(m => m.id === newMeetingId ? { ...m, isNewlyCreated: true } : m));

      if (newMeetingForm.defaultType) {
        const newCustomTypes = { ...customTypes, [newMeetingId]: newMeetingForm.defaultType, [cleanCode]: newMeetingForm.defaultType };
        setCustomTypes(newCustomTypes);
        try {
          localStorage.setItem(getStorageKey('crm_meeting_types'), JSON.stringify(newCustomTypes));
        } catch {}
      }

      setIsAddModalOpen(false);
      handleSelectMeeting(newMeeting);
      setViewMode('active');
    }
  };

  const handleSaveEditedCode = () => {
    if (!currentSelectedMeeting) return;
    const cleanNewCode = editedCodeValue.trim().toUpperCase().replace(/[\[\]]/g, '');
    if (!cleanNewCode) {
      setIsEditingCode(false);
      return;
    }

    const oldCode = String(currentSelectedMeeting.code || currentSelectedMeeting.id).trim().replace(/[\[\]]/g, '');
    if (cleanNewCode === oldCode) {
      setIsEditingCode(false);
      return;
    }

    const orgId = currentOrg?.id || 'default';
    const meetingKey = currentSelectedMeeting.id || currentSelectedMeeting.code;

    const updatedOverrides = saveMeetingOverride(orgId, meetingKey, {
      code: cleanNewCode,
      oldCode: oldCode,
    });
    setMeetingOverrides(updatedOverrides);

    setSelectedMeeting(prev => ({
      ...prev,
      code: cleanNewCode,
    }));

    setIsEditingCode(false);
  };

  const handleSetMeetingType = (meetingId, typeId) => {
    const m = currentSelectedMeeting || selectedMeeting;
    const targetId = meetingId || m?.id;
    const mCode = m?.code;
    const orgId = currentOrg?.id || 'default';
    const meetingKey = targetId || mCode;
    if (!meetingKey) return;

    const updatedOverrides = saveMeetingOverride(orgId, meetingKey, {
      meetingType: typeId,
      type: typeId,
      customType: typeId,
      category: typeId,
      charakter: typeId === 'mandatory' ? 'Obowiązkowe' : typeId === 'internal' ? 'Wewnętrzne' : 'Nieobowiązkowe',
    });
    setMeetingOverrides(updatedOverrides);

    setSelectedMeeting(prev => prev ? ({
      ...prev,
      meetingType: typeId,
      type: typeId,
      customType: typeId,
      category: typeId,
    }) : null);

    const updatedCustomTypes = { ...customTypes };
    if (targetId) updatedCustomTypes[targetId] = typeId;
    if (mCode) updatedCustomTypes[mCode] = typeId;
    setCustomTypes(updatedCustomTypes);
    try {
      localStorage.setItem(getStorageKey('crm_meeting_types'), JSON.stringify(updatedCustomTypes));
      localStorage.setItem('crm_meeting_types', JSON.stringify(updatedCustomTypes));
    } catch {}
  };

  const handleSelectMeetingType = (typeIdOrEvent, maybeTypeKey) => {
    if (typeof typeIdOrEvent === 'string' && !maybeTypeKey) {
      const m = currentSelectedMeeting || selectedMeeting;
      handleSetMeetingType(m?.id || m?.code, typeIdOrEvent);
    } else {
      handleSetMeetingType(typeIdOrEvent, maybeTypeKey);
    }
  };

  const handleToggleCountsInFrequency = (meetingId, include) => {
    const m = currentSelectedMeeting || selectedMeeting;
    const mId = meetingId || m?.id;
    const mCode = m?.code;
    const orgId = currentOrg?.id || 'default';
    const meetingKey = mId || mCode;
    if (!meetingKey) return;

    const updatedOverrides = saveMeetingOverride(orgId, meetingKey, {
      countsInFrequency: include,
      includeInFrequency: include,
    });
    setMeetingOverrides(updatedOverrides);
    setSelectedMeeting(prev => prev ? ({ ...prev, countsInFrequency: include, includeInFrequency: include }) : null);
  };

  const handleConfirmMoveToTrash = () => {
    if (isViewer) { showToast('Brak uprawnień do modyfikacji danych (konto w trybie tylko do odczytu).'); return; }
    if (!meetingToTrash) return;
    const orgId = currentOrg?.id || 'default';

    const updatedTrash = addMeetingToTrash(orgId, meetingToTrash);
    setTrashList(updatedTrash);

    if (selectedMeeting && (selectedMeeting.id === meetingToTrash.id || selectedMeeting.code === meetingToTrash.code)) {
      setSelectedMeeting(null);
    }

    setMeetingToTrash(null);
  };

  const handleRestoreMeeting = (m) => {
    if (!m) return;
    const orgId = currentOrg?.id || 'default';
    const mId = m.id || m.code;

    const { updatedTrash, restoredMeeting } = restoreMeetingFromTrash(orgId, mId);
    setTrashList(updatedTrash);

    if (restoredMeeting) {
      setSelectedMeeting(restoredMeeting);
      setViewMode('active');
    }
  };

  const handleConfirmPermanentDelete = () => {
    if (isViewer) { showToast('Brak uprawnień do modyfikacji danych (konto w trybie tylko do odczytu).'); return; }
    if (!meetingToPermanentDelete) return;
    const orgId = currentOrg?.id || 'default';
    const mId = meetingToPermanentDelete.id || meetingToPermanentDelete.code;

    const updatedTrash = permanentlyDeleteMeetingFromTrash(orgId, mId);
    setTrashList(updatedTrash);

    if (meetingToPermanentDelete.isCustom) {
      const updatedCustom = deleteCustomMeeting(orgId, mId);
      setCustomMeetings(updatedCustom);
    }

    if (selectedMeeting && (selectedMeeting.id === mId || selectedMeeting.code === mId)) {
      setSelectedMeeting(null);
    }

    setMeetingToPermanentDelete(null);
  };

  // ── Pre-indexed Member Lookup (O(1) Map/Set) for Instant Waterfall Matching ──
  const memberLookup = useMemo(() => {
    const byIndex = new Map();
    const byEmail = new Map();
    const byNormalizedName = new Map();
    const byReversedName = new Map();
    const byAlias = new Map();

    (members || []).forEach(m => {
      if (!m) return;
      const rawIdx = String(m.index || m.nrIndeksu || '').trim();
      if (rawIdx) {
        byIndex.set(rawIdx, m);
        const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '');
        if (cleanIdx) byIndex.set(cleanIdx, m);
      }

      const email = normalizeDiacritics(m.email || '').toLowerCase().trim();
      if (email) byEmail.set(email, m);

      const fullName = m.fullName || m.imieNazwisko || m.name || `${m.firstName || m.imie || ''} ${m.lastName || m.nazwisko || ''}`.trim();
      const normFull = normalizeDiacritics(fullName).toLowerCase().trim();
      if (normFull) {
        byNormalizedName.set(normFull, m);
        const tokens = normFull.split(' ').filter(Boolean);
        if (tokens.length >= 2) {
          byReversedName.set([...tokens].reverse().join(' '), m);
        }
      }

      const fn = normalizeDiacritics(m.firstName || m.imie || '').toLowerCase().trim();
      const ln = normalizeDiacritics(m.lastName || m.nazwisko || '').toLowerCase().trim();
      if (fn && ln) {
        byNormalizedName.set(`${fn} ${ln}`, m);
        byReversedName.set(`${ln} ${fn}`, m);
      }

      const memberAliases = parseAliasesList(m.aliases || m.aliasy || m.alias || m.meetAlias);
      memberAliases.forEach(alias => {
        const aNorm = normalizeDiacritics(alias).toLowerCase().trim();
        if (aNorm) {
          byAlias.set(aNorm, m);
          const aTokens = aNorm.split(' ').filter(Boolean);
          if (aTokens.length >= 2) {
            byAlias.set([...aTokens].reverse().join(' '), m);
          }
        }
      });
    });

    return { byIndex, byEmail, byNormalizedName, byReversedName, byAlias };
  }, [members]);

  const findMemberFast = useCallback((parsedRawName, extractedIndex) => {
    if (!parsedRawName && !extractedIndex) return null;

    if (extractedIndex) {
      const cleanIdx = String(extractedIndex).replace(/\D/g, '').replace(/^0+/, '');
      const match = memberLookup.byIndex.get(extractedIndex) || (cleanIdx ? memberLookup.byIndex.get(cleanIdx) : null);
      if (match) return match;
    }

    if (!parsedRawName) return null;

    const embeddedIdxMatch = parsedRawName.match(/\b\d{3,6}\b/);
    if (embeddedIdxMatch) {
      const embIdx = embeddedIdxMatch[0];
      const cleanEmb = embIdx.replace(/^0+/, '');
      const match = memberLookup.byIndex.get(embIdx) || memberLookup.byIndex.get(cleanEmb);
      if (match) return match;
    }

    const normRaw = normalizeDiacritics(parsedRawName).toLowerCase().trim();

    if (memberLookup.byNormalizedName.has(normRaw)) {
      return memberLookup.byNormalizedName.get(normRaw);
    }
    if (memberLookup.byReversedName.has(normRaw)) {
      return memberLookup.byReversedName.get(normRaw);
    }
    if (memberLookup.byAlias.has(normRaw)) {
      return memberLookup.byAlias.get(normRaw);
    }
    if (memberLookup.byEmail.has(normRaw)) {
      return memberLookup.byEmail.get(normRaw);
    }

    return matchMemberExact(parsedRawName, members);
  }, [memberLookup, members]);

  function getMeetingStorageKey(m) {
    if (!m) return '';
    return getStorageKey(`crm_attendance_${m.id || m.date || m.code}`);
  }

  function getSavedMeetingAttendance(m) {
    if (!m) return null;
    const cleanCode = String(m.code || '').replace(/^\[.*?\]\s*/, '').trim();
    const keys = [
      getStorageKey(`crm_attendance_${m.id}`),
      getStorageKey(`crm_attendance_${m.date}`),
      m.code ? getStorageKey(`crm_attendance_${m.code}`) : null,
      cleanCode ? getStorageKey(`crm_attendance_${cleanCode}`) : null,
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
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const pDate = parsed.date || parsed.meetingDate;
            if (pDate && m.date && pDate !== m.date) continue;
            const pCode = parsed.code || parsed.meetingCode;
            if (pCode && m.code) {
              const pHas2526 = pCode.includes('25/26');
              const pHas2627 = pCode.includes('26/27');
              const mHas2526 = m.code.includes('25/26');
              const mHas2627 = m.code.includes('26/27');
              if ((pHas2526 && mHas2627) || (pHas2627 && mHas2526)) continue;
            }
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  }

  // Memoized current saved attendance for active meeting (avoids repeated JSON parsing in JSX)
  const selectedMeetingSavedAttendance = useMemo(() => {
    if (!selectedMeeting) return null;
    return getSavedMeetingAttendance(selectedMeeting);
  }, [selectedMeeting, localStorageVersion, currentOrg?.id]);

  // Memoized map of attendance counts for all sidebar items (avoids 300+ JSON.parse per render)
  const meetingsAttendanceCounts = useMemo(() => {
    const countMap = new Map();
    activeMeetings.forEach(m => {
      let count = 0;
      if (m.attendanceCount !== undefined && m.attendanceCount !== null && Number(m.attendanceCount) > 0) {
        count = Number(m.attendanceCount);
      } else if (m.attendeesCount !== undefined && m.attendeesCount !== null && Number(m.attendeesCount) > 0) {
        count = Number(m.attendeesCount);
      } else if (Array.isArray(m.participantRecords) && m.participantRecords.length > 0) {
        count = m.participantRecords.length;
      } else if (Array.isArray(m.attendees) && m.attendees.length > 0) {
        count = m.attendees.length;
      } else {
        const saved = getSavedMeetingAttendance(m);
        if (saved) {
          if (saved.confirmedCount !== undefined) count = saved.confirmedCount;
          else if (Array.isArray(saved.confirmedIndexes)) count = saved.confirmedIndexes.length;
          else if (Array.isArray(saved.attendees)) count = saved.attendees.length;
          else if (Array.isArray(saved)) count = saved.length;
        }
      }
      const key = m.id || m.code || m.date;
      countMap.set(key, Math.max(0, parseInt(count, 10) || 0));
    });
    return countMap;
  }, [activeMeetings, localStorageVersion, currentOrg?.id]);

  const processAttendanceFromLines = useCallback((lines, threshold = minDurationThreshold, targetMeeting = selectedMeetingRef.current) => {
    if (!targetMeeting) return [];

    const participants = [];
    const matched = [];
    const unmatched = [];

    lines.forEach((rawLine, idx) => {
      let parsed = null;
      try {
        parsed = parseAttendanceLine(rawLine);
      } catch (e) {
        console.warn("Błąd parsowania pojedynczej linii:", rawLine, e);
      }
      if (!parsed || !parsed.rawName) return;

      const durMinutes = (parsed.durationMinutes !== undefined && parsed.durationMinutes > 0)
        ? parsed.durationMinutes
        : parseDurationToMinutes(parsed.durationStr || parsed.duration || '60 min');
      const isEligible = durMinutes >= threshold;
      const extractedIdx = parsed.extractedIndex || '';

      const member = findMemberFast(parsed.rawName, extractedIdx);

      const role = detectParticipantRole(parsed.rawName, member);
      const isSup = isFacultySupervisor(parsed.rawName);
      const isMonika = isMonikaLyniewska(parsed.rawName) || (extractedIdx === '34327');
      const isMemberInDB = Boolean(member || isMonika);
      const isGuest = !isSup && (parsed.isExplicitGuest || role === 'guest' || !isMemberInDB || parsed.rawName.includes('[GOŚĆ]') || parsed.rawName.includes('GOSC') || parsed.rawName.toLowerCase().startsWith('gość'));
      const status = isSup ? 'supervisor' : (isGuest ? 'guest' : (isEligible ? 'approved' : 'short_time'));

      const pObj = {
        id: `p_${idx}_${idx}`,
        rawName: parsed.rawName,
        joinTime: parsed.joinTime || parsed.time || '18:00',
        durationStr: parsed.durationStr || parsed.duration || '60 min',
        durationMinutes: durMinutes,
        member: isGuest || isSup ? null : (member || (isMonika ? { fullName: 'Monika Łyniewska', index: '34327', email: '34327@student.wskz.pl' } : null)),
        role: isSup ? 'supervisor' : (isGuest ? 'guest' : role),
        isGuest: !!isGuest,
        isExternalGuest: !isSup && !isMemberInDB,
        isEligible: isGuest || isSup || isEligible,
        manualApproved: isSup || isGuest || isMonika || (isEligible && !!member),
        hasManualOverride: false,
        status,
      };

      participants.push(pObj);
      if (isSup) {
        // Supervisor
      } else if (isGuest) {
        // Guest
      } else if (member) {
        if (isEligible) matched.push(member);
      } else {
        unmatched.push(parsed.rawName);
      }
    });

    // Deduplicate: keep only first occurrence per index or normalized name
    const seenKeys = new Set();
    const dedupedParticipants = participants.filter(p => {
      const key = p.member?.index
        ? String(p.member.index).trim()
        : normalizeDiacritics(p.rawName || '').toLowerCase().trim();
      if (!key || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    setParsedParticipants(dedupedParticipants);
    setManualOverrides({});
    setResults({ matched, unmatched });
    return dedupedParticipants;
  }, [minDurationThreshold, findMemberFast]);

  const loadMeetingAttendance = useCallback((m) => {
    if (!m) return;
    const mId = m.id || m.code || m.date;
    const listKey = getStorageKey(`meeting_${mId}_list`);

    let savedListText = null;
    try {
      savedListText = localStorage.getItem(listKey) || (m.code ? localStorage.getItem(getStorageKey(`meeting_${m.code}_list`)) : null);
    } catch {}

    const saved = getSavedMeetingAttendance(m);
    let participants = null;

    if (saved) {
      if (Array.isArray(saved) && saved.length > 0) {
        participants = saved;
      } else if (Array.isArray(saved.attendees) && saved.attendees.length > 0) {
        participants = saved.attendees;
      } else if (Array.isArray(saved.confirmedIndexes) && saved.confirmedIndexes.length > 0) {
        participants = saved.confirmedIndexes.map((idx, i) => {
          return resolveParticipantFromSavedIndex(idx, members, FACULTY_SUPERVISORS, i);
        });
      }
    } else if (Array.isArray(m.participantRecords) && m.participantRecords.length > 0) {
      participants = m.participantRecords;
    } else if (Array.isArray(m.attendees) && m.attendees.length > 0) {
      participants = m.attendees.map((idx, i) => {
        return resolveParticipantFromSavedIndex(idx, members, FACULTY_SUPERVISORS, i);
      });
    }

    if (Array.isArray(participants) && participants.length > 0) {
      participants = participants.map((p, i) => {
        if (p && typeof p === 'object' && p.fullName && p.member) return p;
        return resolveParticipantFromSavedIndex(p, members, FACULTY_SUPERVISORS, i);
      }).filter(Boolean);
    }

    if (savedListText && savedListText.trim()) {
      setRawList(savedListText);
      if (participants && participants.length > 0) {
        setParsedParticipants(participants);
      } else {
        const lines = savedListText.split('\n').map(l => l.trim()).filter(Boolean);
        processAttendanceFromLines(lines, minDurationThreshold, m);
      }
    } else if (participants && participants.length > 0) {
      setParsedParticipants(participants);
      const preview = participants.map(p => {
        const displayName = p.fullName || p.rawName || p.name || p.member?.fullName || p.nrIndeksu || p.index || 'Uczestnik';
        return `${displayName}\t${p.joinTime || '18:00'}\t${p.durationStr || `${p.durationMinutes || 60} min`}`;
      }).join('\n');
      setRawList(preview);
    } else {
      setParsedParticipants([]);
      setRawList('');
    }
  }, [getStorageKey, members, minDurationThreshold, processAttendanceFromLines]);

  const handleSelectMeeting = useCallback((m) => {
    if (!m) return;
    const mId = m.id || m.code || m.date;
    // 1. Natychmiastowa reakcja podświetlenia w UI (INP < 50 ms)
    setActiveMeetingId(mId);

    // 2. Nieblokujące ładowanie danych i aktualizacja widoku w tle (React 18 Concurrent)
    startTransition(() => {
      setSelectedMeeting(m);
      setResults(null);
      setSheetFeedback(null);
      setAttendeeSearchQuery('');
      loadMeetingAttendance(m);
    });
  }, [loadMeetingAttendance]);

  function findMemberMatch(nameOrIndex) {
    if (!nameOrIndex) return null;
    return findMemberFast(nameOrIndex);
  }

  function recalculateAttendance(participantsList, overrides, threshold = minDurationThreshold) {
    const updated = participantsList.map(p => {
      if (p.role === 'supervisor' || p.role === 'speaker' || p.role === 'guest') {
        return p;
      }
      const isOverThreshold = p.durationMinutes >= threshold;
      const hasManualOverride = overrides[p.id] !== undefined;
      const isApproved = hasManualOverride ? overrides[p.id] : isOverThreshold;

      let status = 'approved';
      if (!isApproved) {
        status = 'rejected_short_time';
      }
      if (!p.member) {
        status = isApproved ? 'approved_unmatched' : 'unmatched';
      }

      return {
        ...p,
        isEligible: isApproved,
        manualApproved: isApproved,
        hasManualOverride,
        status,
      };
    });

    setParsedParticipants(updated);

    if (selectedMeeting) {
      const storageKey = getMeetingStorageKey(selectedMeeting);
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
    }
  }

  async function handleSaveSidebarAttendance() {
    if (isViewer) { showToast('Brak uprawnień do modyfikacji danych (konto w trybie tylko do odczytu).'); return; }
    if (!selectedMeeting || parsedParticipants.length === 0) return;
    setIsSavingAttendance(true);

    const verifiedList = parsedParticipants
      .filter(p => p.manualApproved)
      .map(p => {
        const nrIndeksu = String(p.member?.index || p.nrIndeksu || p.index || (isMonikaLyniewska(p.rawName) ? '34327' : (p.rawName.match(/\d{4,6}/)?.[0] || ''))).replace(/\D/g, '').trim();
        let name = String(p.member?.fullName || p.fullName || p.rawName || '').trim();
        if (/^\d+$/.test(name) && nrIndeksu) {
          name = (p.member && !/^\d+$/.test(p.member.fullName || '')) ? p.member.fullName : '';
        }
        const isSup = p.role === 'supervisor' || isFacultySupervisor(p.rawName);
        const isSpk = p.role === 'speaker';
        const isGst = p.role === 'guest' || p.isGuest || p.isExternalGuest || (!nrIndeksu && p.role !== 'member');
        const rola = String(isSup ? 'Opiekun' : (isSpk ? 'Prelegent' : (isGst ? 'Gość' : 'Członek koła'))).trim();
        return {
          nrIndeksu: nrIndeksu || '',
          name,
          rola,
          punkty: 1,
          opisAktywnosci: 'Obecność na spotkaniu'
        };
      })
      .filter(p => p.nrIndeksu || p.name);

    const meetCode = String(selectedMeeting?.code || selectedMeeting?.id || "M00").replace(/\s+/g, ' ').trim();
    const payload = {
      action: "zapisz_obecnosci",
      kodSpotkania: meetCode,
      dataSpotkania: selectedMeeting?.date || new Date().toISOString().slice(0, 10),
      obecnosci: verifiedList
    };

    try {
      const result = await sendToGAS(payload);
      console.log("Wynik zapisu w GAS:", result);

      const confirmedIndexes = verifiedList.map(item => item.nrIndeksu || item.name).filter(Boolean);
      setCustomMeetings(prev => prev.map(m => (m.id === selectedMeeting?.id || m.code === selectedMeeting?.code) ? { ...m, isNewlyCreated: false } : m));
      setSelectedMeeting(prev => prev ? ({ ...prev, isNewlyCreated: false }) : null);

      const attendancePayload = {
        meetingId: selectedMeeting.id,
        meetingDate: selectedMeeting.date,
        date: selectedMeeting.date,
        meetingCode: selectedMeeting.code,
        code: selectedMeeting.code,
        academicYear: selectedMeeting.academicYear || (selectedMeeting.date >= '2026-10-01' ? '2026/2027' : '2025/2026'),
        attendees: parsedParticipants,
        allVerifiedList: verifiedList,
        obecnosci: verifiedList,
        participantRecords: parsedParticipants,
        confirmedIndexes,
        confirmedCount: confirmedIndexes.length,
        savedAt: new Date().toISOString(),
      };

      // Mirror save to localStorage so that meetingsAttendanceCounts and getSavedMeetingAttendance immediately find it
      if (typeof window !== 'undefined' && window.localStorage) {
        const cleanMeetingCode = String(selectedMeeting.code || '').replace(/^\[.*?\]\s*/, '').trim();
        const keys = [
          getStorageKey(`crm_attendance_${selectedMeeting.id || selectedMeeting.date}`),
          selectedMeeting.id ? getStorageKey(`crm_attendance_${selectedMeeting.id}`) : null,
          selectedMeeting.date ? getStorageKey(`crm_attendance_${selectedMeeting.date}`) : null,
          selectedMeeting.code ? getStorageKey(`crm_attendance_${selectedMeeting.code}`) : null,
          cleanMeetingCode ? getStorageKey(`crm_attendance_${cleanMeetingCode}`) : null,
          `crm_attendance_${selectedMeeting.id || selectedMeeting.date}`,
          selectedMeeting.id ? `crm_attendance_${selectedMeeting.id}` : null,
          selectedMeeting.date ? `crm_attendance_${selectedMeeting.date}` : null,
          selectedMeeting.code ? `crm_attendance_${selectedMeeting.code}` : null,
          cleanMeetingCode ? `crm_attendance_${cleanMeetingCode}` : null,
        ].filter(Boolean);

        keys.forEach(k => {
          try {
            localStorage.setItem(k, JSON.stringify(attendancePayload));
          } catch {}
        });
      }

      onMarkAttendance(selectedMeeting.id, confirmedIndexes, attendancePayload);
      // Bump version to force sidebar cards to reflect new count immediately
      setLocalStorageVersion(v => v + 1);
      showToast("Obecności zostały zapisane w arkuszu Google!");
    } catch (err) {
      console.error("Błąd sieciowy podczas zapisu do GAS:", err);
      showToast("Błąd połączenia z bazą Google Sheets: " + (err.message || err));
    } finally {
      setIsSavingAttendance(false);
    }
  }

  const handleProcessAttendance = (overrideText = null) => {
    try {
      console.log("--- START PARSOWANIA SPOTKANIA ---");
      const rawText = (typeof overrideText === 'string' ? overrideText : rawList) || "";
      if (!rawText.trim()) {
        showToast("Pole z listą obecności jest puste. Wklej dane z Google Meet lub wgraj plik CSV.");
        return;
      }

      // Ensure a meeting is selected
      const currentMeeting = selectedMeeting || currentSelectedMeeting || activeMeetings[0] || {
        id: 'M01',
        code: 'M01',
        title: 'Spotkanie',
        date: new Date().toISOString().slice(0, 10),
      };
      if (!selectedMeeting) {
        setSelectedMeeting(currentMeeting);
      }

      const { parsedList, matched, unmatched } = parseAttendanceInput(rawText, {
        members,
        supervisors: FACULTY_SUPERVISORS,
        aliasesMap: {},
        minDurationThreshold: minDurationThreshold || 15,
      });

      console.log(`Pomyślnie sparsowano: ${parsedList.length} uczestników. Otwieram modal.`);
      console.info("Sparsowano wierszy:", parsedList.length);

      // Ustawienie stanu i natychmiastowe otwarcie modala
      setParsedParticipants(parsedList);
      setManualOverrides({});
      setResults({ matched, unmatched });

      const storageKey = getMeetingStorageKey(currentMeeting);
      try {
        localStorage.setItem(storageKey, JSON.stringify(parsedList));
      } catch {}

      setIsModalOpen(true);
    } catch (error) {
      console.error("BŁĄD PODCZAS PARSOWANIA:", error);
      showToast("Wystąpił błąd parsowania: " + (error.message || error));
    }
  };

  // ── Drag & Drop oraz File Upload CSV ────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result || '';
      setRawList(text);
      setResults(null);
      handleProcessAttendance(text);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result || '';
        setRawList(text);
        setResults(null);
        handleProcessAttendance(text);
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  async function handleFetchFromSheet() {
    if (!selectedMeeting) return;
    const requestedMeetingId = selectedMeeting.id || selectedMeeting.code || selectedMeeting.date;
    setFetchingSheet(true);
    setSheetFeedback(null);
    try {
      const res = await fetchMeetingSheetAttendance(selectedMeeting.code || selectedMeeting.id, null, members);

      // Zabezpieczenie przed race condition: weryfikacja czy spotkanie jest nadal aktywne
      const currentActiveId = selectedMeetingRef.current?.id || selectedMeetingRef.current?.code || selectedMeetingRef.current?.date;
      if (currentActiveId !== requestedMeetingId) {
        console.warn('[MeetingsTab] Zignorowano odpowiedź sieciową fetchMeetingSheetAttendance dla nieaktywnego już spotkania:', requestedMeetingId);
        return;
      }

      if (res.ok && res.participants?.length > 0) {
        setSheetFeedback({ ok: true, message: `Wczytano ${res.participants.length} uczestników z arkusza "${res.tabName}"` });

        // Map to lines
        const lines = res.participants.map(p => `${p.rawName}\t${p.joinTime}\t${p.durationStr}`);
        const rawText = lines.join('\n');
        setRawList(rawText);
        await processAttendanceFromLines(lines, minDurationThreshold, selectedMeetingRef.current);
      } else {
        setSheetFeedback({ ok: false, error: res.error || 'Nie odnaleziono zapisanych obecności w arkuszu.' });
      }
    } catch (err) {
      setSheetFeedback({ ok: false, error: err.message || 'Błąd odczytu z arkusza' });
    } finally {
      setFetchingSheet(false);
    }
  }

  async function handleClearAttendanceFromDB(targetMeeting = null) {
    if (isViewer) { showToast('Brak uprawnień do modyfikacji danych (konto w trybie tylko do odczytu).'); return; }
    // Bezpieczne pobranie obiektu spotkania (odrzucenie eventu click)
    const isActualMeeting = targetMeeting && typeof targetMeeting === 'object' && ('id' in targetMeeting || 'code' in targetMeeting);
    const m = isActualMeeting ? targetMeeting : selectedMeeting;

    if (!m) return;

    const cleanMeetCode = (c) => String(c || '').replace(/^\[.*?\]\s*/, '').replace(/\s+/g, ' ').trim();
    const rawCode = m.code || m.id || '';
    const meetCode = cleanMeetCode(rawCode);

    setIsClearingAttendance(true);

    try {
      // 1. Wysłanie żądania usunięcia do Google Apps Script z poprawnym kodem spotkania
      await deleteMeetingAttendanceFromGAS(m.code || meetCode || m.id, m.date || m.start_dt);

      // 2. Aktualizacja wybranego spotkania w stanie lokalnym
      if (selectedMeeting && (selectedMeeting.id === m.id || selectedMeeting.code === m.code)) {
        setRawList('');
        setResults(null);
        setParsedParticipants([]);
        setManualOverrides({});
        setSelectedMeeting(prev => prev ? ({
          ...prev,
          attendees: [],
          attendeesCount: 0,
          attendanceCount: 0,
          confirmedCount: 0,
          participantRecords: [],
          status: 'Zaplanowane',
          listaObecnosci: []
        }) : null);
      }

      // 3. Wyczyszczenie pamięci podręcznej localStorage dla tego spotkania
      const cleanCode = cleanMeetCode(m.code || '');
      const mId = m.id || m.code;
      const rawCode = m.code || m.id || '';
      const dateKey = m.date || m.start_dt ? String(m.date || m.start_dt).split('T')[0] : '';
      const keysToRemove = [
        dateKey ? getStorageKey(`crm_attendance_${dateKey}`) : null,
        dateKey ? `crm_attendance_${dateKey}` : null,
        dateKey ? `attendance_${dateKey}` : null,
        dateKey ? `skn_attendance_${dateKey}` : null,
        dateKey ? getStorageKey(`meeting_${dateKey}_list`) : null,
        dateKey ? `meeting_${dateKey}_list` : null,
        rawCode ? getStorageKey(`crm_attendance_${rawCode}`) : null,
        rawCode ? `crm_attendance_${rawCode}` : null,
        rawCode ? `attendance_${rawCode}` : null,
        rawCode ? `skn_attendance_${rawCode}` : null,
        rawCode ? getStorageKey(`meeting_${rawCode}_list`) : null,
        rawCode ? `meeting_${rawCode}_list` : null,
        cleanCode ? `skn_attendance_${cleanCode}` : null,
        m.id ? `skn_attendance_${m.id}` : null,
        getStorageKey(`crm_attendance_${m.id}`),
        m.code ? getStorageKey(`crm_attendance_${m.code}`) : null,
        cleanCode ? getStorageKey(`crm_attendance_${cleanCode}`) : null,
        getStorageKey(`meeting_${mId}_list`),
        m.code ? getStorageKey(`meeting_${m.code}_list`) : null,
        cleanCode ? getStorageKey(`meeting_${cleanCode}_list`) : null,
        `crm_attendance_${m.id}`,
        m.code ? `crm_attendance_${m.code}` : null,
        cleanCode ? `crm_attendance_${cleanCode}` : null,
        `attendance_${m.id}`,
        m.code ? `attendance_${m.code}` : null,
        cleanCode ? `attendance_${cleanCode}` : null,
        `meeting_${mId}_list`,
        m.code ? `meeting_${m.code}_list` : null,
        cleanCode ? `meeting_${cleanCode}_list` : null,
        getMeetingStorageKey(m)
      ].filter(Boolean);

      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });

      // Usunięcie wpisów z bufora crm_ewidencja
      try {
        const rawEwidencja = localStorage.getItem('crm_ewidencja');
        if (rawEwidencja) {
          const parsed = JSON.parse(rawEwidencja);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter(item => {
              const itemCode = cleanMeetCode(item.kodSpotkania || item.code || '');
              return itemCode !== meetCode && item.kodSpotkania !== rawCode && item.id !== m.id;
            });
            localStorage.setItem('crm_ewidencja', JSON.stringify(filtered));
          }
        }
      } catch (err) {
        console.warn('Błąd czyszczenia crm_ewidencja:', err);
      }

      // 4. Powiadomienie komponentu nadrzędnego o wyzerowaniu obecności
      if (typeof onMarkAttendance === 'function') {
        onMarkAttendance(m.id || m.code, [], {
          meetingId: m.id || m.code,
          meetingDate: m.date,
          meetingCode: m.code,
          attendees: [],
          confirmedIndexes: [],
          confirmedCount: 0,
          attendeesCount: 0,
          status: 'Zaplanowane',
          cleared: true,
          savedAt: new Date().toISOString(),
        });
      }

      setLocalStorageVersion(v => v + 1);

      const meetTitle = m.title || m.code || m.id;
      setSheetFeedback({ ok: true, message: `Obecności dla spotkania "${meetTitle}" zostały pomyślnie wyczyszczone.` });
    } catch (err) {
      console.error('Błąd usuwania obecności z bazy:', err);
      setSheetFeedback({ ok: false, error: 'Wystąpił błąd podczas usuwania obecności: ' + (err.message || err) });
    } finally {
      setIsClearingAttendance(false);
    }
  }

  function handleToggleManualApproval(participantId) {
    const part = parsedParticipants.find(p => p.id === participantId);
    if (!part) return;

    const currentApproved = part.manualApproved;
    const nextApproved = !currentApproved;

    const nextOverrides = {
      ...manualOverrides,
      [participantId]: nextApproved,
    };
    setManualOverrides(nextOverrides);

    recalculateAttendance(parsedParticipants, nextOverrides);
  }

  // ── Protocol / Meeting Minutes Handlers ────────────────────────────────────
  const handleOpenProtocolModal = () => {
    if (!selectedMeeting) return;
    const cleanYear = String(academicYear || '2025/2026').replace(/[\[\]]/g, '');
    const cleanCode = String(selectedMeeting.code || selectedMeeting.id || 'M01').replace(/[\[\]]/g, '').trim();
    const savedProtocol = getMeetingProtocol(currentOrg.id, cleanCode);
    const defNumber = `PROT/${(currentOrg.shortName || currentOrg.name || 'SKN').toUpperCase().replace(/[^A-Z0-9]/g, '')}/${cleanCode}/${cleanYear.replace(/20/g, '')}`;

    const currentSaved = getSavedMeetingAttendance(selectedMeeting);
    const confirmedCount = currentSaved?.confirmedCount ??
      (currentSaved?.confirmedIndexes?.length) ??
      (Array.isArray(currentSaved?.attendees) ? currentSaved.attendees.filter(p => p.manualApproved && p.member?.index).length : (selectedMeeting.attendeesCount || selectedMeeting.attendees?.length || 0));

    let currentAttendees = [];
    if (Array.isArray(currentSaved?.attendees) && currentSaved.attendees.length > 0) {
      currentAttendees = currentSaved.attendees
        .filter(p => p.manualApproved && p.member?.index)
        .map(p => ({
          name: p.member?.name || p.rawName,
          rawName: p.rawName,
          index: p.member?.index,
          durationStr: p.durationStr || `${p.durationMinutes || 60} min`,
        }));
    } else if (parsedParticipants.length > 0) {
      currentAttendees = parsedParticipants
        .filter(p => (manualOverrides[p.id]?.status === 'approved' || (!manualOverrides[p.id] && p.status === 'approved')) && p.member?.index)
        .map(p => ({
          name: p.member?.name || p.rawName,
          rawName: p.rawName,
          index: p.member?.index,
          durationStr: p.durationStr || `${p.durationMinutes || 60} min`,
        }));
    }

    if (savedProtocol) {
      setProtocolForm({
        protocolNumber: savedProtocol.protocolNumber || defNumber,
        date: savedProtocol.date || selectedMeeting.formattedDate || selectedMeeting.date || new Date().toISOString().slice(0, 10),
        time: savedProtocol.time || '18:00 - 19:30',
        location: savedProtocol.location || selectedMeeting.location || 'Google Meet / MS Teams (Tryb zdalny)',
        title: savedProtocol.title || selectedMeeting.title || '',
        speaker: savedProtocol.speaker || selectedMeeting.who || 'Zarząd Koła Naukowego',
        attendeesCount: savedProtocol.attendeesCount ?? confirmedCount,
        recorder: savedProtocol.recorder || 'Protokolant Zarządu Koła',
        agenda: savedProtocol.agenda || `1. Otwarcie spotkania naukowego ${cleanCode} przez Przewodniczącego Koła.\n2. Wystąpienie prelegenta (${selectedMeeting.who || 'Zarząd'}) na temat: „${selectedMeeting.title}”.\n3. Dyskusja naukowa z udziałem członków koła i sesja pytań (Q&A).\n4. Podsumowanie, wolne wnioski i ustalenie terminu kolejnego zebrania.`,
        content: savedProtocol.content || `W dniu ${selectedMeeting.formattedDate || selectedMeeting.date} odbyło się oficjalne spotkanie naukowe Koła ${currentOrg.shortName}. Prelegent przedstawił referat dotyczący zagadnień: „${selectedMeeting.title}”.\n\nW części dyskusyjnej członkowie koła aktywnie analizowali zaprezentowane studia przypadków oraz metodologię badań naukowych.`,
        conclusions: savedProtocol.conclusions || `1. Przyjęto sprawozdanie z referatu ${cleanCode} do dorobku naukowego Koła.\n2. Zweryfikowano i zatwierdzono listę obecności (${confirmedCount} uczestników).\n3. Zaplanowano kolejne wystąpienie seminaryjne.`,
        includeAttendeesList: savedProtocol.includeAttendeesList ?? true,
        attendees: savedProtocol.attendees && savedProtocol.attendees.length > 0 ? savedProtocol.attendees : currentAttendees,
      });
    } else {
      setProtocolForm({
        protocolNumber: defNumber,
        date: selectedMeeting.formattedDate || selectedMeeting.date || new Date().toISOString().slice(0, 10),
        time: '18:00 - 19:30',
        location: selectedMeeting.location || 'Google Meet / MS Teams (Tryb zdalny)',
        title: selectedMeeting.title || '',
        speaker: selectedMeeting.who || 'Zarząd Koła Naukowego',
        attendeesCount: confirmedCount,
        recorder: 'Protokolant Zarządu Koła',
        agenda: `1. Otwarcie spotkania naukowego ${cleanCode} przez Przewodniczącego Koła.\n2. Wystąpienie prelegenta (${selectedMeeting.who || 'Zarząd'}) na temat: „${selectedMeeting.title}”.\n3. Dyskusja naukowa z udziałem członków koła i sesja pytań (Q&A).\n4. Podsumowanie, wolne wnioski i ustalenie terminu kolejnego zebrania.`,
        content: `W dniu ${selectedMeeting.formattedDate || selectedMeeting.date} odbyło się oficjalne spotkanie naukowe Koła ${currentOrg.shortName}. Prelegent przedstawił referat dotyczący zagadnień: „${selectedMeeting.title}”.\n\nW części dyskusyjnej członkowie koła aktywnie analizowali zaprezentowane studia przypadków oraz metodologię badań naukowych.`,
        conclusions: `1. Przyjęto sprawozdanie z referatu ${cleanCode} do dorobku naukowego Koła.\n2. Zweryfikowano i zatwierdzono listę obecności (${confirmedCount} uczestników).\n3. Zaplanowano kolejne wystąpienie seminaryjne.`,
        includeAttendeesList: true,
        attendees: currentAttendees,
      });
    }
    setIsProtocolModalOpen(true);
  };

  const handleSaveProtocol = () => {
    if (!selectedMeeting) return;
    const cleanCode = String(selectedMeeting.code || selectedMeeting.id || 'M01').replace(/[\[\]]/g, '').trim();
    saveMeetingProtocol(currentOrg.id, cleanCode, protocolForm);
    setProtocolSaveStatus('Zapisano notatkę w rejestrze spotkania!');
    setTimeout(() => setProtocolSaveStatus(null), 3000);
  };

  const handleSaveProtocolToDocsRepo = () => {
    if (!selectedMeeting) return;
    handleSaveProtocol();
    const cleanCode = String(selectedMeeting.code || selectedMeeting.id || 'M01').replace(/[\[\]]/g, '').trim();
    const newDoc = {
      id: `doc_prot_${cleanCode}_${Date.now()}`,
      code: protocolForm.protocolNumber,
      title: `Protokół ze spotkania ${cleanCode}: ${protocolForm.title}`,
      category: 'Protokoły Zebrań',
      date: protocolForm.date,
      status: 'Obowiązujący',
      description: `Oficjalny protokół ze spotkania naukowego ${cleanCode} z dnia ${protocolForm.date} (Liczba obecnych: ${protocolForm.attendeesCount}).`,
      driveUrl: '',
    };
    addDocumentToRegistry(currentOrg.id, newDoc);
    setProtocolSaveStatus('Zapisano i zarejestrowano w Dzienniku Dokumentów Koła!');
    setTimeout(() => setProtocolSaveStatus(null), 3500);
  };

  const handlePrintProtocol = () => {
    handleSaveProtocol();
    setIsPrintingProtocol(true);
    setTimeout(() => {
      window.print();
      setIsPrintingProtocol(false);
    }, 300);
  };

  // Count completed vs upcoming using SSOT getMeetingStatusInfo
  const completedCount = useMemo(() => {
    return activeMeetings.filter(m => {
      const key = m.id || m.code || m.date;
      const count = meetingsAttendanceCounts.get(key) || 0;
      return getMeetingStatusInfo(m, count).isCompleted;
    }).length;
  }, [activeMeetings, meetingsAttendanceCounts]);

  const upcomingCount = Math.max(0, activeMeetings.length - completedCount);
  const archivedCount = completedCount;

  // Dynamic counts for each meeting category in the current view
  const categoryCounts = useMemo(() => {
    const counts = {
      mandatory: 0,
      optional: 0,
      trigger_warning: 0,
      internal: 0,
    };

    activeMeetings.forEach(m => {
      const type = getMeetingType(m, customTypes);
      if (counts[type] !== undefined) {
        counts[type]++;
      } else {
        counts.mandatory++;
      }
    });

    return counts;
  }, [activeMeetings, customTypes]);

  const eligibleDenominatorMeetings = useMemo(() => {
    return activeMeetings.filter(m => isMeetingEligibleForDenominator(m, customTypes));
  }, [activeMeetings, customTypes]);

  const countMandatory = eligibleDenominatorMeetings.length;
  const countOptional = categoryCounts.optional;
  const countTrigger = categoryCounts.trigger_warning;
  const countInternal = categoryCounts.internal;
  const countNonMandatory = Math.max(0, activeMeetings.length - countMandatory);

  // Selected meeting active type config
  const selectedType = currentSelectedMeeting ? getMeetingType(currentSelectedMeeting, customTypes) : 'mandatory';
  const selectedTypeConfig = MEETING_TYPES[selectedType] || MEETING_TYPES.mandatory;

  // Verified attendance statistics (Aggregated by status "Zaliczono")
  const isSpeakerAttendee = (p) => p.role === 'speaker' || p.role === 'prelegent' || p.rola === 'speaker' || p.isSpeaker || String(p.rawName || '').includes('[SPEAKER]') || String(p.name || '').includes('[SPEAKER]');
  const isSupervisorAttendee = (p) => p.role === 'supervisor' || p.rola === 'supervisor' || isFacultySupervisor(p.rawName);

  const approvedParticipantsCount = parsedParticipants.filter(p => {
    if (isSupervisorAttendee(p) || isSpeakerAttendee(p)) return true;
    return p.manualApproved !== undefined ? p.manualApproved : (p.isEligible || p.status === 'approved' || p.status === 'Zaliczona');
  }).length;
  const rejectedParticipantsCount = parsedParticipants.filter(p => {
    if (isSupervisorAttendee(p) || isSpeakerAttendee(p)) return false;
    return p.manualApproved === false || (!p.manualApproved && !p.isEligible);
  }).length;
  const unmatchedParticipantsCount = parsedParticipants.filter(p => {
    if (p.member || isSupervisorAttendee(p) || isSpeakerAttendee(p) || isMonikaLyniewska(p.rawName)) return false;
    return true;
  }).length;

  // Filtered participants for sidebar search
  const filteredParticipants = useMemo(() => {
    if (!attendeeSearchQuery.trim()) return parsedParticipants;
    const q = attendeeSearchQuery.toLowerCase().trim();
    return parsedParticipants.filter(p => {
      const name = (p.member ? (p.member.fullName || `${p.member.firstName} ${p.member.lastName}`) : p.rawName || '').toLowerCase();
      const idx = String(p.member?.index || '').toLowerCase();
      return name.includes(q) || idx.includes(q);
    });
  }, [parsedParticipants, attendeeSearchQuery]);

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 sm:space-y-6">
      {/* Header controls for Academic Year & Calendar (Sticky at Top) */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 md:p-5 border border-slate-200 shadow-sm space-y-3 sm:space-y-4 sticky top-14 sm:top-16 z-20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Calendar size={18} className="text-indigo-600" />
              Harmonogram & Kategoryzacja Spotkań
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>Wszystkich spotkań: <strong>{activeMeetings.length}</strong></span>
              <span>•</span>
              <span className="text-emerald-700 font-medium">{upcomingCount} nadchodzących</span>
              <span>•</span>
              <span className="text-slate-500">{archivedCount} zakończonych</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Academic Year Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rok:</span>
              <select
                value={academicYear}
                onChange={e => onAcademicYearChange(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
              >
                {getAcademicYearOptions(2, 1).map(opt => (
                  <option key={opt.value} value={opt.value}>
                    Rok akademicki {opt.label}
                  </option>
                ))}
                <option value="custom">Własny zakres dat...</option>
              </select>
            </div>

            {/* Subcalendar Filter */}
            <CalendarSelector
              selectedSubcalendar={selectedSubcalendar || currentOrg?.subcalendarId || DEFAULT_CALENDAR_SUB_ID}
              onSubcalendarChange={onSubcalendarChange}
              subcalendars={subcalendars}
            />

            {/* Refresh Button */}
            <button
              onClick={onRefreshMeetings}
              disabled={loadingMeetings}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50 shrink-0 cursor-pointer w-full sm:w-auto min-h-[38px] sm:min-h-0"
            >
              <RefreshCw size={13} className={loadingMeetings ? 'animate-spin' : ''} />
              <span className="sm:hidden">Odśwież</span>
              <span className="hidden sm:inline">Odśwież kalendarz</span>
            </button>
          </div>
        </div>

        {/* Custom date range inputs */}
        {academicYear === 'custom' && (
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 bg-slate-50/50 p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start-date" className="text-xs font-semibold text-slate-600">Data od:</label>
              <input
                id="custom-start-date"
                name="customStartDate"
                type="date"
                value={customStartDate}
                onChange={e => onCustomDateChange(e.target.value, customEndDate)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end-date" className="text-xs font-semibold text-slate-600">Data do:</label>
              <input
                id="custom-end-date"
                name="customEndDate"
                type="date"
                value={customEndDate}
                onChange={e => onCustomDateChange(customStartDate, e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Three-Column Master-Detail Layout with Resizable Sidebar */}
      <div
        ref={sidebarContainerRef}
        className="flex flex-col lg:flex-row items-start w-full h-full overflow-hidden"
        style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}
      >
        {/* ── Left Column: Resizable Navigation Sidebar (12.5vw - 25vw) ── */}
        <div
          style={{
            width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : '100%',
            minWidth: typeof window !== 'undefined' && window.innerWidth >= 1024 ? '12.5vw' : '100%',
            maxWidth: typeof window !== 'undefined' && window.innerWidth >= 1024 ? '25vw' : '100%',
            flexShrink: 0,
            overflowY: 'auto',
          }}
          className="w-full shrink-0 space-y-2.5 pr-1.5 scrollbar-thin scrollbar-thumb-indigo-200"
        >
          {/* Header with View Switcher (Active vs Trash) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer text-[11px] ${
                viewMode === 'active'
                  ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays size={12} className={viewMode === 'active' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Aktywne ({activeMeetings.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('trash')}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer text-[11px] ${
                viewMode === 'trash'
                  ? 'bg-white text-rose-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-rose-700'
              }`}
            >
              <Trash2 size={12} className={viewMode === 'trash' ? 'text-rose-600' : 'text-slate-400'} />
              <span>Kosz ({trashList.length})</span>
            </button>
          </div>

          {/* ➕ Dodaj spotkanie button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-semibold hover:from-indigo-700 hover:to-indigo-800 shadow-xs transition-all cursor-pointer"
          >
            <Plus size={13} />
            <span>Dodaj spotkanie</span>
          </button>

          {/* Scrollable Meeting Cards List */}
          <div className="space-y-2 max-h-[calc(100vh-270px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-indigo-200">
            {viewMode === 'trash' ? (
              trashList.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-4 sm:p-6 text-center text-slate-400 text-xs">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Trash2 size={16} />
                  </div>
                  <div className="font-semibold text-slate-700 text-xs">Kosz jest pusty</div>
                  <p className="text-slate-400 mt-0.5 text-[11px]">Brak usuniętych spotkań.</p>
                </div>
              ) : (
                trashList.map(tm => {
                  const rawTrashCode = String(tm.code || tm.id || '').replace(/[\[\]]/g, '');
                  const cleanTrashCode = rawTrashCode
                    .replace(/\b20\d\d\/20\d\d\b/g, '')
                    .replace(/\b20\d\d\/\d\d\b/g, '')
                    .replace(/\b\d\d\/\d\d\b/g, '')
                    .replace(/^[\s•\-\/]+|[\s•\-\/]+$/g, '')
                    .trim() || rawTrashCode.trim();

                  return (
                    <div
                      key={tm.id || tm.code}
                      className="p-2.5 rounded-xl border border-rose-200/80 bg-rose-50/30 hover:bg-rose-50/60 transition-all flex flex-col gap-1.5 shadow-2xs text-xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                          {cleanTrashCode}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {tm.formattedDate || tm.date}
                        </span>
                      </div>
                    <div className="text-[11px] font-bold text-slate-800 truncate" title={tm.title}>
                      {tm.title}
                    </div>
                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-rose-100">
                      <button
                        type="button"
                        onClick={() => handleRestoreMeeting(tm)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-semibold transition cursor-pointer"
                        title="Przywróć spotkanie"
                      >
                        <RotateCcw size={10} />
                        <span>Przywróć</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMeetingToPermanentDelete(tm)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white text-rose-600 hover:bg-rose-100 border border-rose-200 text-[10px] font-semibold transition cursor-pointer"
                        title="Usuń trwale"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  );
                })
              )
            ) : activeMeetings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 text-center text-slate-400 text-xs">
                Brak spotkań w wybranym okresie.
              </div>
            ) : (
              activeMeetings.map(m => {
                const meetingKey = m.id || m.code || m.date;
                const isSelected = activeMeetingId
                  ? (m.id === activeMeetingId || m.code === activeMeetingId || m.date === activeMeetingId)
                  : (currentSelectedMeeting?.id === m.id || currentSelectedMeeting?.code === m.code);
                const isUpcoming = m.isUpcoming;
                const type = getMeetingType(m, customTypes);
                const typeConfig = MEETING_TYPES[type] || MEETING_TYPES.mandatory;
                const count = meetingsAttendanceCounts.get(meetingKey) || 0;

                return (
                  <MeetingListItem
                    key={m.id || m.code || m.date}
                    meeting={m}
                    isSelected={isSelected}
                    isUpcoming={isUpcoming}
                    typeConfig={typeConfig}
                    count={count}
                    academicYear={academicYear}
                    onSelect={handleSelectMeeting}
                    onEdit={handleEditMeeting}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ── Resizer: Interactive divider between sidebar and main content ── */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className={`hidden lg:flex items-center justify-center w-[5px] shrink-0 cursor-col-resize select-none z-10 transition-colors duration-150 self-stretch my-0.5 rounded-full group ${
            isResizing
              ? 'bg-indigo-500 shadow-xs'
              : 'hover:bg-indigo-400 bg-transparent hover:shadow-xs'
          }`}
          style={{
            width: '5px',
            cursor: 'col-resize',
            backgroundColor: isResizing ? '#6366f1' : 'transparent',
            transition: 'background-color 0.15s ease',
            flexShrink: 0,
            userSelect: 'none',
            zIndex: 10,
          }}
          title="Przeciągnij krawędź, aby dostosować szerokość panelu (12.5% - 25%)"
        >
          <div className={`w-[1px] h-8 rounded-full transition-colors ${
            isResizing ? 'bg-white' : 'bg-slate-300 group-hover:bg-indigo-200'
          }`} />
        </div>

        {/* ── Main Content Area: Middle Column + Right Column ── */}
        <div className="flex-1 min-w-0 w-full flex flex-col xl:flex-row gap-4 items-start pl-0 lg:pl-3 pt-4 lg:pt-0">
          {/* ── Middle Column: Main Details & Editing Panel (flex-1) ── */}
          <div className="flex-1 min-w-0 w-full space-y-4">
          {!selectedMeeting ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 md:p-12 text-center text-slate-400 text-sm shadow-sm">
              <ClipboardList size={36} className="mx-auto mb-2 text-slate-300" />
              Wybierz spotkanie z listy po lewej stronie, aby edytować jego szczegóły, próg obecności lub przetworzyć dane z Google Meet.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 md:p-5 space-y-4 shadow-sm">
              {/* Selected Meeting Banner with Inline Code Edit */}
              <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                currentSelectedMeeting.isUpcoming
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              }`}>
                <div className="flex items-center gap-2.5 text-sm font-bold min-w-0 flex-1">
                  {isEditingCode ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="text"
                        value={editedCodeValue}
                        onChange={(e) => setEditedCodeValue(e.target.value.toUpperCase())}
                        className="w-20 px-2 py-0.5 text-xs font-mono font-bold bg-white text-slate-900 border border-indigo-400 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        placeholder="np. M07"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditedCode();
                          if (e.key === 'Escape') setIsEditingCode(false);
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveEditedCode}
                        className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition cursor-pointer"
                        title="Zapisz nowy kod"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingCode(false)}
                        className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition cursor-pointer"
                        title="Anuluj"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs border font-mono font-bold ${
                        currentSelectedMeeting.isUpcoming
                          ? 'bg-emerald-200 border-emerald-300 text-emerald-900'
                          : 'bg-indigo-200 border-indigo-300 text-indigo-900'
                      }`}>
                        {(() => {
                          const raw = String(currentSelectedMeeting.code || currentSelectedMeeting.id || 'M01').replace(/[\[\]]/g, '');
                          const clean = raw
                            .replace(/\b20\d\d\/20\d\d\b/g, '')
                            .replace(/\b20\d\d\/\d\d\b/g, '')
                            .replace(/\b\d\d\/\d\d\b/g, '')
                            .replace(/^[\s•\-\/]+|[\s•\-\/]+$/g, '')
                            .trim() || raw.trim();
                          return clean;
                        })()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const raw = String(currentSelectedMeeting.code || currentSelectedMeeting.id || 'M01').replace(/[\[\]]/g, '');
                          const clean = raw
                            .replace(/\b20\d\d\/20\d\d\b/g, '')
                            .replace(/\b20\d\d\/\d\d\b/g, '')
                            .replace(/\b\d\d\/\d\d\b/g, '')
                            .replace(/^[\s•\-\/]+|[\s•\-\/]+$/g, '')
                            .trim() || raw.trim();
                          setEditedCodeValue(clean);
                          setIsEditingCode(true);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 transition cursor-pointer rounded"
                        title="✏️ Zmień kod spotkania (np. na M07)"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="truncate font-semibold">{currentSelectedMeeting.title}</span>
                    <button
                      type="button"
                      onClick={() => handleEditMeeting(currentSelectedMeeting || selectedMeeting)}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white/60 transition cursor-pointer rounded-lg shrink-0"
                      title="Edytuj dane spotkania"
                    >
                      <Edit3 size={14} />
                    </button>
                  </div>
                </div>
                <span className="text-xs font-mono font-medium shrink-0 ml-2">{currentSelectedMeeting.formattedDate || currentSelectedMeeting.date}</span>
              </div>

              {/* ── Action Buttons: Protocol Minutes & Trash ── */}
              <div className="flex items-center gap-2 my-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenProtocolModal(currentSelectedMeeting)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl text-xs font-semibold hover:opacity-95 shadow-sm transition-all border border-indigo-900/50 cursor-pointer"
                >
                  <FileText className="w-5 h-5 shrink-0" size={20} />
                  <span>Utwórz Notatkę / Protokół ze spotkania</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMeetingToTrash(currentSelectedMeeting)}
                  className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer shrink-0"
                  title="Przenieś to spotkanie do Kosza (Soft Delete)"
                >
                  <Trash2 size={14} className="text-rose-600" />
                  <span className="hidden sm:inline">Kosz</span>
                </button>
              </div>

              {/* ── Meeting Type Selector Card ── */}
              <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Tag size={13} className="text-indigo-600" />
                      <span>Charakter spotkania:</span>
                    </span>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      Obowiązkowe dla frekwencji: <strong className="text-emerald-700 font-bold">{countMandatory}</strong> | Pozostałe: <strong className="text-slate-700 font-bold">{countNonMandatory}</strong>
                    </p>
                  </div>
                  <span className={`self-start sm:self-auto text-xs font-bold min-w-40 max-w-60 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border shrink-0 ${selectedTypeConfig.badgeClass}`}>
                    <MeetingTypeVectorIcon typeId={selectedType} size={14} />
                    <span className="flex-1 text-center truncate">{selectedTypeConfig.label}</span>
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 leading-tight">
                  {selectedTypeConfig.description}
                </p>


                {/* ── Meeting Categorization Selector ── */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Charakter / Kategoria Spotkania:
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Wybierz typ wpływający na zaliczenia
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
                    {/* LEWA GRUPA: Wskaźniki statusu / charakteru spotkania (4 puste kółka wektorowe) */}
                    <div className="lg:col-span-7 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
                        Status / Charakter spotkania
                      </span>
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        {Object.entries(MEETING_TYPES)
                          .filter(([, cfg]) => cfg.group === 'status')
                          .map(([typeKey, typeCfg]) => {
                            const activeM = currentSelectedMeeting || selectedMeeting;
                            const isCurrent = getMeetingType(activeM, customTypes) === typeKey;

                            return (
                              <button
                                key={typeKey}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const targetId = activeM?.id || selectedMeeting?.id;
                                  handleSetMeetingType(targetId, typeKey);
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-white border-indigo-600 shadow-md ring-2 ring-indigo-300 text-slate-900 font-bold'
                                    : 'bg-white/75 border-slate-200 hover:bg-white hover:border-slate-300 text-slate-700 font-semibold'
                                }`}
                              >
                                <span className="shrink-0 flex items-center justify-center">
                                  <MeetingTypeVectorIcon typeId={typeKey} size={17} />
                                </span>
                                <span className="text-xs font-bold leading-snug flex-1">
                                  {typeCfg.label}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    {/* PRAWA GRUPA: Osobne kategorie formatu wydarzenia (Konferencja / Dyskusja, Warsztat / Szkolenie) */}
                    <div className="lg:col-span-5 flex flex-col gap-1.5 pt-2.5 lg:pt-0 border-t border-slate-200/80 lg:border-t-0 lg:border-l lg:border-slate-200/90 lg:pl-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
                        Format / Kategoria wydarzenia
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 flex-1">
                        {Object.entries(MEETING_TYPES)
                          .filter(([, cfg]) => cfg.group === 'format')
                          .map(([typeKey, typeCfg]) => {
                            const activeM = currentSelectedMeeting || selectedMeeting;
                            const isCurrent = getMeetingType(activeM, customTypes) === typeKey;

                            return (
                              <button
                                key={typeKey}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const targetId = activeM?.id || selectedMeeting?.id;
                                  handleSetMeetingType(targetId, typeKey);
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-white border-indigo-600 shadow-md ring-2 ring-indigo-300 text-slate-900 font-bold'
                                    : 'bg-slate-100/70 border-slate-200/90 hover:bg-white hover:border-indigo-300 text-slate-700 font-semibold'
                                }`}
                              >
                                <span className="shrink-0 flex items-center justify-center">
                                  <MeetingTypeVectorIcon typeId={typeKey} size={17} />
                                </span>
                                <span className="text-xs font-bold leading-snug flex-1">
                                  {typeCfg.label}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                {/* ── Manual Toggle: Wliczaj do ogólnej frekwencji i certyfikatów ── */}
                <div className="pt-2.5 mt-1 border-t border-slate-200/80 flex items-center justify-between gap-3">
                  <label htmlFor="toggle-denominator-check" className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700 hover:text-slate-900">
                    <input
                      id="toggle-denominator-check"
                      name="toggleDenominator"
                      type="checkbox"
                      checked={isMeetingEligibleForDenominator(currentSelectedMeeting || selectedMeeting, customTypes)}
                      onChange={(e) => handleToggleCountsInFrequency(selectedMeeting?.id, e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Wliczaj do ogólnej frekwencji i certyfikatów (mianownik)</span>
                  </label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isMeetingEligibleForDenominator(currentSelectedMeeting || selectedMeeting, customTypes)
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {isMeetingEligibleForDenominator(currentSelectedMeeting || selectedMeeting, customTypes) ? 'Wliczane (Mianownik)' : 'Wykluczone z mianownika'}
                  </span>
                </div>
              </div>
            </div>

              {/* ── Attendance Duration Threshold Regulator ── */}
              <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/50 rounded-xl p-3.5 border border-indigo-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Timer size={14} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-800">Próg zaliczenia obecności</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs font-mono font-bold text-xs text-indigo-900">
                    <span>{minDurationThreshold}</span>
                    <span className="text-[10px] text-indigo-500 font-sans">min</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      id="min-duration-threshold"
                      name="minDurationThreshold"
                      aria-label="Próg zaliczenia obecności w minutach"
                      type="range"
                      min="1"
                      max="120"
                      step="1"
                      value={minDurationThreshold}
                      onChange={e => handleThresholdChange(e.target.value)}
                      className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">Szybki wybór:</span>
                    {[10, 15, 20, 30, 45, 60].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleThresholdChange(m)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer border ${
                          minDurationThreshold === m
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-indigo-50 border-slate-200'
                        }`}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 leading-snug">
                  Uczestnicy z czasem &lt; <strong>{minDurationThreshold} min</strong> zostaną oznaczeni jako ⚠️ <em>nieobecni</em> (z możliwością natychmiastowego ręcznego zaliczenia w panelu po prawej).
                </p>
              </div>

              {/* ── Attendance Source & Action ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Lista z Google Meet / Arkusza (Kol. B i C)
                    </span>
                    {(() => {
                      const currentSaved = selectedMeetingSavedAttendance;
                      const isCurrentVerified = !!(currentSaved && (
                        (currentSaved.confirmedCount !== undefined && currentSaved.confirmedCount > 0) ||
                        (Array.isArray(currentSaved.confirmedIndexes) && currentSaved.confirmedIndexes.length > 0) ||
                        (Array.isArray(currentSaved.attendees) && currentSaved.attendees.length > 0) ||
                        (Array.isArray(currentSaved) && currentSaved.length > 0)
                      ));
                      const currentSavedCount = currentSaved?.confirmedCount ??
                        (Array.isArray(currentSaved?.attendees)
                          ? currentSaved.attendees.filter(p => p.role === 'supervisor' || isFacultySupervisor(p.rawName) || p.role === 'speaker' || (p.manualApproved !== undefined ? p.manualApproved : (p.isEligible || p.status === 'approved' || p.status === 'Zaliczona'))).length
                          : (currentSaved?.confirmedIndexes?.length ?? (selectedMeeting?.attendees?.length || 0)));

                      if (!isCurrentVerified) return null;
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>Zapisano ({currentSavedCount} obecnych)</span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Hidden file input for CSV / TXT upload */}
                    <input
                      id="meet-csv-file-input"
                      name="meetCsvFile"
                      aria-label="Wgraj plik obecności z Google Meet (.csv / .txt)"
                      type="file"
                      ref={fileInputRef}
                      accept=".csv,.txt,text/csv,text/plain"
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:text-indigo-700 px-2 py-1 rounded-lg transition border border-slate-300 shadow-2xs cursor-pointer"
                      title="Wgraj plik obecności z Google Meet (.csv / .txt) z dysku"
                    >
                      <FileSpreadsheet size={13} strokeWidth={2.2} className="text-emerald-600 shrink-0" />
                      <span>Wgraj plik CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleFetchFromSheet}
                      disabled={fetchingSheet}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition border border-indigo-200/80 cursor-pointer disabled:opacity-50"
                    >
                      <Download size={12} className={fetchingSheet ? 'animate-spin' : ''} />
                      <span>{fetchingSheet ? 'Wczytywanie…' : 'Wczytaj z arkusza'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowClearConfirmModal(true)}
                      disabled={isClearingAttendance || !selectedMeeting}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                      title="Usuwa zapisane obecności dla tego spotkania z arkusza Google"
                    >
                      <Trash2 size={12} className={isClearingAttendance ? 'animate-spin' : ''} />
                      <span>{isClearingAttendance ? 'Usuwanie…' : 'Wyczyść bazę'}</span>
                    </button>
                  </div>
                </div>

                {sheetFeedback && (
                  <div className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border ${
                    sheetFeedback.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    {sheetFeedback.ok ? <Check size={14} className="shrink-0 text-emerald-600" /> : <AlertTriangle size={14} className="shrink-0 text-amber-600" />}
                    <span>{sheetFeedback.ok ? sheetFeedback.message : sheetFeedback.error}</span>
                  </div>
                )}

                {/* ── Drag & Drop Interactive Dropzone ── */}
                <div
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative rounded-xl transition-all duration-200 ${
                    isDraggingOver
                      ? 'border-2 border-dashed border-indigo-500 bg-indigo-50/80 shadow-md ring-4 ring-indigo-100'
                      : 'border border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {isDraggingOver && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-indigo-50/95 rounded-xl pointer-events-none text-indigo-700 backdrop-blur-2xs animate-in fade-in duration-150">
                      <FileSpreadsheet className="w-8 h-8 mb-1 text-indigo-600 animate-bounce" />
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-950">Upuść plik CSV / TXT tutaj</span>
                      <span className="text-[11px] text-indigo-600 font-medium">Plik z Google Meet zostanie natychmiast załadowany i przetworzony</span>
                    </div>
                  )}

                  <textarea
                    value={rawList}
                    onChange={e => { setRawList(e.target.value); setResults(null); }}
                    rows={4}
                    placeholder="Przeciągnij i upuść plik CSV z Google Meet lub wklej surową listę obecności..."
                    className="w-full text-xs p-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-xl bg-transparent transition"
                  />
                </div>

                {/* Adaptive Action Buttons */}
                {(() => {
                  const currentSaved = selectedMeetingSavedAttendance;
                  const isCurrentVerified = !!(currentSaved && (
                    (currentSaved.confirmedCount !== undefined && currentSaved.confirmedCount > 0) ||
                    (Array.isArray(currentSaved.confirmedIndexes) && currentSaved.confirmedIndexes.length > 0) ||
                    (Array.isArray(currentSaved.attendees) && currentSaved.attendees.length > 0) ||
                    (Array.isArray(currentSaved) && currentSaved.length > 0)
                  ));

                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Przycisk 1: Przetwórz i zweryfikuj listę */}
                        <button
                          type="button"
                          onClick={handleProcessAttendance}
                          className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs hover:shadow-md cursor-pointer text-center"
                        >
                          <Play size={13} className="fill-current shrink-0" />
                          <span className="truncate">Przetwórz i zweryfikuj listę</span>
                        </button>

                        {/* Przycisk 2: Powiększ do dużego ekranu */}
                        <button
                          type="button"
                          onClick={() => {
                            if (rawList.trim() && parsedParticipants.length === 0) {
                              handleProcessAttendance();
                            } else {
                              setIsModalOpen(true);
                            }
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 text-xs font-bold transition shadow-2xs hover:shadow-xs cursor-pointer text-center"
                          title="Otwórz pełnoekranowy edytor i weryfikator obecności"
                        >
                          <Maximize2 size={13} className="text-indigo-600 shrink-0" />
                          <span className="truncate">Powiększ do dużego ekranu</span>
                        </button>
                      </div>

                      {isCurrentVerified && rawList.trim() && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setShowResetConfirm(true)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-rose-300 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-[11px] font-semibold transition cursor-pointer"
                            title="Przetwórz surowy tekst od nowa (Reset korekt)"
                          >
                            <RotateCcw size={12} />
                            <span>Resetuj korekty i przetwórz od nowa</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Attendance List Sidebar (280px - 320px) ── */}
        <div className="w-full lg:w-[285px] xl:w-[315px] shrink-0 space-y-3 lg:sticky lg:top-20">
          {!selectedMeeting ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-8 text-center text-slate-400 text-xs shadow-sm">
              <Users size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">Lista obecności</p>
              <p className="mt-1 text-[11px]">Wybierz spotkanie, aby podejrzeć listę uczestników.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3 shadow-sm">
              {/* Sidebar Header */}
              <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users size={14} className="text-indigo-600 shrink-0" />
                  <h3 className="text-xs font-bold text-slate-800 truncate">Lista obecności</h3>
                </div>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                  {parsedParticipants.length} os.
                </span>
              </div>

              {/* Status Breakdown Badges */}
              {parsedParticipants.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap text-[10px] font-bold">
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <MeetingTypeVectorIcon typeId="mandatory" size={10} />
                    <span>{approvedParticipantsCount}</span>
                  </span>
                  {rejectedParticipantsCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full" title={`Czas < ${minDurationThreshold} min`}>
                      <AlertTriangle size={10} strokeWidth={2.2} />
                      <span>{rejectedParticipantsCount} za krótko</span>
                    </span>
                  )}
                  {unmatchedParticipantsCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" title="Nierozpoznany student w bazie">
                      <AlertTriangle size={10} strokeWidth={2.2} />
                      <span>{unmatchedParticipantsCount} nieznanych</span>
                    </span>
                  )}
                </div>
              )}

              {/* Filter search if list is long */}
              {parsedParticipants.length > 5 && (
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                  <input
                    type="text"
                    value={attendeeSearchQuery}
                    onChange={(e) => setAttendeeSearchQuery(e.target.value)}
                    placeholder="Szukaj uczestnika..."
                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                  {attendeeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAttendeeSearchQuery('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              {/* Numbered Participants List */}
              {parsedParticipants.length === 0 ? (
                <div className="py-8 px-3 text-center text-slate-400 text-xs">
                  <Clock size={24} className="mx-auto mb-1.5 text-slate-300" />
                  <p className="font-medium text-slate-600 text-xs">Brak wczytanych obecności</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                    Wklej listę z Google Meet w środkowym panelu lub kliknij &bdquo;Wczytaj z arkusza&rdquo;.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-indigo-200">
                  {filteredParticipants.map((p, idx) => {
                    const isApproved = p.manualApproved;
                    const isSpeaker = p.role === 'speaker' || p.role === 'prelegent' || p.rola === 'speaker' || p.rola === 'prelegent' || p.isSpeaker || String(p.rawName || '').includes('[SPEAKER]') || String(p.name || '').includes('[SPEAKER]');
                    const isSup = !isSpeaker && (p.role === 'supervisor' || p.rola === 'supervisor' || p.rola === 'Opiekun Koła' || isFacultySupervisor(p.rawName) || isFacultySupervisor(p.name));
                    const isGuest = !isSpeaker && !isSup && (p.isGuest || p.role === 'guest' || p.rola === 'guest');
                    const isShortTime = !isSpeaker && !isSup && !isGuest && p.durationMinutes < minDurationThreshold;
                    const candidateRaw = p.member
                      ? (p.member.fullName || `${p.member.firstName || ''} ${p.member.lastName || ''}`.trim())
                      : (p.fullName || p.name || p.rawName || '');
                    const rawDisplayName = (!candidateRaw || candidateRaw === '[object Object]')
                      ? (p.nrIndeksu || p.index || 'Uczestnik')
                      : candidateRaw;
                    const memberName = String(rawDisplayName)
                      .replace(/^\[SPEAKER\]:\s*/i, '')
                      .replace(/^\[PRELEGENT\]:\s*/i, '')
                      .replace(/^\[GOŚĆ\]:\s*/i, '')
                      .replace(/^\[GOSC\]:\s*/i, '')
                      .replace(/^\[OPIEKUN\]:\s*/i, '')
                      .replace(/^\[CZŁONEK KOŁA\]:\s*/i, '')
                      .replace(/^\[CZLONEK KOLA\]:\s*/i, '')
                      .replace(/^Indeks:\s*/i, '')
                      .replace(/^Nr:\s*/i, '')
                      .trim() || String(p.nrIndeksu || p.index || 'Uczestnik');

                    return (
                      <div
                        key={p.id || `row-${idx}`}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                          isApproved
                            ? 'bg-white border-slate-200/80 hover:border-indigo-200'
                            : 'bg-rose-50/40 border-rose-200/80 hover:bg-rose-50/70'
                        }`}
                      >
                        {/* Number + Name + Subtext */}
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-[10px] font-mono font-bold text-slate-400 w-5 text-right shrink-0">
                            {idx + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 text-[11px] truncate leading-tight" title={String(memberName)}>
                              {String(memberName)}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono mt-0.5">
                              {(() => {
                                if (isSpeaker) {
                                  return <span className="text-purple-700 bg-purple-100 border border-purple-300 font-sans font-bold px-1.5 py-0.5 rounded text-[10px]">Prelegent</span>;
                                }
                                if (isSup) {
                                  return <span className="text-indigo-700 bg-indigo-100 border border-indigo-300 font-sans font-bold px-1.5 py-0.5 rounded text-[10px]">Opiekun Koła</span>;
                                }

                                const studentIndex = p.member?.index || p.nrIndeksu || p.index;
                                const isFormer = isFormerMemberRecord(p.member) || p.isCustomHistorical;

                                const cleanIndex = String(studentIndex || '')
                                  .replace(/^\[SPEAKER\]:\s*/i, '')
                                  .replace(/^\[GOŚĆ\]:\s*/i, '')
                                  .replace(/^\[GOSC\]:\s*/i, '')
                                  .replace(/^\[OPIEKUN\]:\s*/i, '')
                                  .replace(/^\[CZŁONEK KOŁA\]:\s*/i, '')
                                  .replace(/^Indeks:\s*/i, '')
                                  .replace(/^Nr:\s*/i, '')
                                  .trim();

                                if (cleanIndex && !cleanIndex.includes('[') && !cleanIndex.toLowerCase().includes('opiekun') && !cleanIndex.toLowerCase().includes('speaker')) {
                                  return (
                                    <span className="flex items-center gap-1">
                                      <span>Nr: {String(cleanIndex)}</span>
                                      {isFormer && (
                                        <span className="text-slate-600 bg-slate-100 border border-slate-300 font-sans font-semibold px-1 py-0.2 text-[9px] rounded">
                                          Były członek
                                        </span>
                                      )}
                                    </span>
                                  );
                                }
                                if (isGuest) {
                                  return <span className="text-amber-700 bg-amber-100 border border-amber-300 font-sans font-medium px-1.5 py-0.5 rounded text-[10px]">Gość</span>;
                                }
                                return <span className="text-amber-600 font-sans">Gość</span>;
                              })()}
                              <span>·</span>
                              <span className={isShortTime ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                                {String(p.durationStr || `${p.durationMinutes || 0}m`)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status icon + Manual toggle */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isApproved ? (
                            <span title="Zaliczona obecność" className="text-emerald-600">
                              <CheckCircle2 size={13} />
                            </span>
                          ) : (
                            <span title={`Czas (${p.durationMinutes} min) poniżej progu (${minDurationThreshold} min)`} className="text-rose-500">
                              <AlertTriangle size={13} />
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleManualApproval(p.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                              isApproved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Przełącz zaliczenie obecności (Tak / Nie)"
                          >
                            {isApproved ? 'Tak' : 'Nie'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons in Right Column */}
              {parsedParticipants.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <button
                    type="button"
                    onClick={handleSaveSidebarAttendance}
                    disabled={isSavingAttendance}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    {isSavingAttendance ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    <span>{isSavingAttendance ? 'Zapisywanie...' : `Zapisz (${approvedParticipantsCount}) w Google Sheets`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-indigo-600 text-[11px] font-semibold transition cursor-pointer"
                  >
                    <span>⛶ Pełny edytor (modal)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Fullscreen Attendance Verification Modal ── */}
      {isModalOpen && selectedMeeting && (
        <AttendanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        meeting={selectedMeeting || currentSelectedMeeting || activeMeetings[0] || { id: 'M01', code: 'M01', title: 'Spotkanie', date: new Date().toISOString().slice(0, 10) }}
        members={members}
        participants={parsedParticipants}
        initialRawText={rawList}
        onRawTextChange={setRawList}
        minDurationThreshold={minDurationThreshold}
        onThresholdChange={handleThresholdChange}
        onSaveAttendance={(meetingId, confirmedIndexes, updatedParticipants, payload) => {
          const targetMeeting = meetings.find(m => m.id === meetingId || m.date === meetingId || m.code === meetingId) || selectedMeeting;
          const cleanMeetingCode = String(targetMeeting?.code || '').replace(/^\[.*?\]\s*/, '').trim();
          const finalPayload = payload || {
            meetingId: targetMeeting?.id || targetMeeting?.date || meetingId,
            meetingDate: targetMeeting?.date,
            attendees: updatedParticipants,
            allVerifiedList: updatedParticipants,
            participantRecords: updatedParticipants,
            confirmedIndexes: confirmedIndexes,
            confirmedCount: confirmedIndexes.length,
            savedAt: new Date().toISOString(),
          };

          const keys = [
            getStorageKey(`crm_attendance_${targetMeeting?.id || meetingId}`),
            targetMeeting?.date ? getStorageKey(`crm_attendance_${targetMeeting.date}`) : null,
            targetMeeting?.code ? getStorageKey(`crm_attendance_${targetMeeting.code}`) : null,
            cleanMeetingCode ? getStorageKey(`crm_attendance_${cleanMeetingCode}`) : null,
            `crm_attendance_${targetMeeting?.id || meetingId}`,
            targetMeeting?.date ? `crm_attendance_${targetMeeting.date}` : null,
            targetMeeting?.code ? `crm_attendance_${targetMeeting.code}` : null,
            cleanMeetingCode ? `crm_attendance_${cleanMeetingCode}` : null,
          ].filter(Boolean);

          keys.forEach(k => {
            try {
              localStorage.setItem(k, JSON.stringify(finalPayload));
            } catch {}
          });

          setParsedParticipants(updatedParticipants);
          setCustomMeetings(prev => prev.map(m => (m.id === meetingId || m.code === meetingId || m.date === meetingId) ? { ...m, isNewlyCreated: false } : m));
          onMarkAttendance(meetingId, confirmedIndexes, finalPayload);
          // Bump version to force sidebar cards to reflect new count immediately
          setLocalStorageVersion(v => v + 1);
          if (selectedMeeting && (selectedMeeting.id === meetingId || selectedMeeting.date === meetingId || selectedMeeting.code === meetingId)) {
            setSelectedMeeting(prev => ({
              ...prev,
              isNewlyCreated: false,
              attendees: confirmedIndexes,
              participantRecords: updatedParticipants,
            }));
          }
        }}
        />
      )}

      {/* ── Reset Reprocess Confirmation Modal ── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-6 max-w-md w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Nadpisanie zweryfikowanej listy</h3>
                <p className="text-xs text-slate-500 font-mono truncate max-w-xs">{selectedMeeting?.title}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-amber-50/70 p-3 rounded-xl border border-amber-200">
              ⚠️ <strong>Uwaga:</strong> Lista obecności dla tego spotkania została już zweryfikowana i zapisana. Czy na pewno chcesz wczytać surowy tekst od nowa? Spowoduje to utratę wprowadzonych ręcznych dopasowań i ról.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  handleProcessAttendance();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Tak, przetwórz od nowa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meeting Protocol / Minutes Modal ── */}
      {isProtocolModalOpen && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden font-sans">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center justify-center">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Protokół Posiedzenia Koła Naukowego</h3>
                  <p className="text-[11px] text-slate-400">Oficjalna dokumentacja formalno-merytoryczna spotkania</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProtocolModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {protocolSaveStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 w-5 h-5" />
                  <span>{protocolSaveStatus}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="protocol-number-input" className="text-[11px] font-bold text-slate-700 block mb-1">Sygnatura / Nr Protokołu:</label>
                  <input
                    id="protocol-number-input"
                    name="protocolNumber"
                    type="text"
                    value={protocolForm.protocolNumber}
                    onChange={e => setProtocolForm({ ...protocolForm, protocolNumber: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-indigo-950 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="protocol-date-input" className="text-[11px] font-bold text-slate-700 block mb-1">Data:</label>
                  <input
                    id="protocol-date-input"
                    name="protocolDate"
                    type="text"
                    value={protocolForm.date}
                    onChange={e => setProtocolForm({ ...protocolForm, date: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="protocol-time-input" className="text-[11px] font-bold text-slate-700 block mb-1">Godziny / Czas trwania:</label>
                  <input
                    id="protocol-time-input"
                    name="protocolTime"
                    type="text"
                    value={protocolForm.time}
                    onChange={e => setProtocolForm({ ...protocolForm, time: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="protocol-title-input" className="text-[11px] font-bold text-slate-700 block mb-1">Tytuł spotkania / referatu:</label>
                  <input
                    id="protocol-title-input"
                    name="protocolTitle"
                    type="text"
                    value={protocolForm.title}
                    onChange={e => setProtocolForm({ ...protocolForm, title: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="protocol-speaker-input" className="text-[11px] font-bold text-slate-700 block mb-1">Prelegent / Prowadzący:</label>
                  <input
                    id="protocol-speaker-input"
                    name="protocolSpeaker"
                    type="text"
                    value={protocolForm.speaker}
                    onChange={e => setProtocolForm({ ...protocolForm, speaker: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="protocol-location-input" className="text-[11px] font-bold text-slate-700 block mb-1">Miejsce / Platforma:</label>
                  <input
                    id="protocol-location-input"
                    name="protocolLocation"
                    type="text"
                    value={protocolForm.location}
                    onChange={e => setProtocolForm({ ...protocolForm, location: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="protocol-attendees-count-input" className="text-[11px] font-bold text-slate-700 block mb-1">Liczba obecnych:</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setProtocolForm({ ...protocolForm, attendeesCount: Math.max(0, (protocolForm.attendeesCount || 0) - 1) })}
                      aria-label="Zmniejsz liczbę obecnych"
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      id="protocol-attendees-count-input"
                      name="protocolAttendeesCount"
                      aria-label="Liczba obecnych w protokole"
                      type="number"
                      value={protocolForm.attendeesCount}
                      onChange={e => setProtocolForm({ ...protocolForm, attendeesCount: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-full text-center p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-emerald-800 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setProtocolForm({ ...protocolForm, attendeesCount: (protocolForm.attendeesCount || 0) + 1 })}
                      aria-label="Zwiększ liczbę obecnych"
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="protocol-recorder-input" className="text-[11px] font-bold text-slate-700 block mb-1">Protokolant:</label>
                  <input
                    id="protocol-recorder-input"
                    name="protocolRecorder"
                    type="text"
                    value={protocolForm.recorder}
                    onChange={e => setProtocolForm({ ...protocolForm, recorder: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="protocol-agenda-textarea" className="text-[11px] font-bold text-slate-700 block mb-1">
                  1. Cel spotkania / Porządek obrad:
                </label>
                <textarea
                  id="protocol-agenda-textarea"
                  name="protocolAgenda"
                  rows={3}
                  value={protocolForm.agenda}
                  onChange={e => setProtocolForm({ ...protocolForm, agenda: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed text-xs resize-y min-h-[90px]"
                />
              </div>

              <div>
                <label htmlFor="protocol-content-textarea" className="text-[11px] font-bold text-slate-700 block mb-1">
                  2. Przebieg posiedzenia, streszczenie prelekcji i dyskusja:
                </label>
                <textarea
                  id="protocol-content-textarea"
                  name="protocolContent"
                  rows={4}
                  value={protocolForm.content}
                  onChange={e => setProtocolForm({ ...protocolForm, content: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed text-xs resize-y min-h-[90px]"
                />
              </div>

              <div>
                <label htmlFor="protocol-conclusions-textarea" className="text-[11px] font-bold text-slate-700 block mb-1">
                  3. Ustalenia końcowe / Zadania i wnioski:
                </label>
                <textarea
                  id="protocol-conclusions-textarea"
                  name="protocolConclusions"
                  rows={3}
                  value={protocolForm.conclusions}
                  onChange={e => setProtocolForm({ ...protocolForm, conclusions: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed text-xs resize-y min-h-[90px]"
                />
              </div>

              {/* Include attendees toggle */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <label htmlFor="protocol-include-attendees-checkbox" className="flex items-center justify-between w-full cursor-pointer">
                  <div>
                    <span className="font-bold text-slate-800 block">Dołącz imienną listę obecnych do protokołu</span>
                    <span className="text-[11px] text-slate-500">
                      Załącznik zawiera listę zweryfikowanych uczestników ({protocolForm.attendees?.length || 0} osób).
                    </span>
                  </div>
                  <input
                    id="protocol-include-attendees-checkbox"
                    name="protocolIncludeAttendees"
                    type="checkbox"
                    checked={protocolForm.includeAttendeesList}
                    onChange={e => setProtocolForm({ ...protocolForm, includeAttendeesList: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer shrink-0"
                  />
                </label>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-3 sm:px-6 sm:py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={handleSaveProtocolToDocsRepo}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer min-h-[38px] sm:min-h-0"
                title="Dodaje protokół jako oficjalny dokument do Repozytorium Dokumentów i Rejestru Uchwał"
              >
                <FolderPlus className="w-5 h-5 shrink-0" size={20} />
                <span className="sm:hidden">Zapisz w Dzienniku</span>
                <span className="hidden sm:inline">Zapisz w Dzienniku Dokumentów Koła</span>
              </button>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleSaveProtocol}
                  className="flex-1 sm:flex-none justify-center px-3.5 sm:px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2 transition cursor-pointer min-h-[38px] sm:min-h-0"
                >
                  <Save className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" size={18} />
                  <span className="sm:hidden">Zapisz</span>
                  <span className="hidden sm:inline">Zapisz zmiany</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintProtocol}
                  className="flex-1 sm:flex-none justify-center px-3.5 sm:px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer min-h-[38px] sm:min-h-0"
                >
                  <Printer className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" size={18} />
                  <span className="sm:hidden">Drukuj</span>
                  <span className="hidden sm:inline">Drukuj Protokół (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsProtocolModalOpen(false)}
                  className="w-full sm:w-auto justify-center px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer min-h-[38px] sm:min-h-0"
                >
                  Zamknij
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Modal: ➕ Dodaj nowe spotkanie ───────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  {meetingToEdit ? <Edit3 size={18} /> : <Plus size={18} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {meetingToEdit ? 'Edytuj spotkanie / wydarzenie' : 'Dodaj nowe spotkanie'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {meetingToEdit ? 'Edycja parametrów i szczegółów wybranego wydarzenia' : 'Ręczne utworzenie spotkania w harmonogramie Koła'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setMeetingToEdit(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveNewMeeting} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label htmlFor="new-meeting-code-input" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Kod spotkania
                  </label>
                  <input
                    id="new-meeting-code-input"
                    name="newMeetingCode"
                    type="text"
                    value={newMeetingForm.code}
                    onChange={(e) => setNewMeetingForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="np. M22"
                    required
                  />
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor="new-meeting-start-date-input" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Data rozpoczęcia
                  </label>
                  <input
                    id="new-meeting-start-date-input"
                    name="newMeetingStartDate"
                    type="date"
                    value={newMeetingForm.startDate || newMeetingForm.date}
                    onChange={(e) => setNewMeetingForm(prev => ({ ...prev, startDate: e.target.value, date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    required
                  />
                </div>

                <div className="sm:col-span-5">
                  <label htmlFor="new-meeting-end-date-input" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Data zakończenia (opcjonalnie)
                  </label>
                  <input
                    id="new-meeting-end-date-input"
                    name="newMeetingEndDate"
                    type="date"
                    value={newMeetingForm.endDate || ''}
                    onChange={(e) => setNewMeetingForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    placeholder="YYYY-MM-DD"
                  />
                </div>
              </div>

              {/* ── Badgik trwania wydarzenia wielodniowego ── */}
              {computedNewMeetingDays > 1 && (
                <div className="p-2.5 bg-indigo-50/90 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" />
                    <span>Wydarzenie wielodniowe:</span>
                  </span>
                  <span className="font-mono bg-white px-2.5 py-0.5 rounded-lg border border-indigo-200 text-indigo-700 shadow-2xs">
                    ⏱️ Czas trwania: {computedNewMeetingDays} dni
                  </span>
                </div>
              )}

              {/* ── Inteligentne podpowiedzi z Teamup dla wybranej daty ── */}
              {teamupSuggestionsForDate.length > 0 && (
                <div className="p-3 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                    <Sparkles size={14} className="text-indigo-600" />
                    <span>Znaleziono spotkania w Teamup dla tego dnia ({teamupSuggestionsForDate.length}):</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {teamupSuggestionsForDate.map((sug, idx) => (
                      <button
                        key={sug.id || idx}
                        type="button"
                        onClick={() => handleSelectTeamupSuggestion(sug)}
                        className="w-full text-left p-2.5 bg-white hover:bg-indigo-50/80 border border-indigo-100 hover:border-indigo-300 rounded-xl text-xs transition flex items-center justify-between gap-2.5 cursor-pointer shadow-2xs group"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 group-hover:text-indigo-950 leading-tight">
                            {sug.title}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {sug.code ? <strong className="text-indigo-700">{sug.code} • </strong> : ''}
                            {sug.who || sug.speaker || 'Prelegent'} • {sug.time || (sug.start_dt ? `${sug.start_dt.split('T')[1]?.slice(0, 5) || '18:00'} - ${sug.end_dt ? sug.end_dt.split('T')[1]?.slice(0, 5) : '19:30'}` : '18:00 - 19:30')}
                          </p>
                        </div>
                        <span className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg shrink-0 shadow-2xs transition">
                          Wstaw dane
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="new-meeting-title-input" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Tytuł / Temat spotkania
                </label>
                <input
                  id="new-meeting-title-input"
                  name="newMeetingTitle"
                  type="text"
                  value={newMeetingForm.title}
                  onChange={(e) => setNewMeetingForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="np. Ogólnopolska Konferencja Seksuologiczna"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-meeting-event-mode-select" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Forma wydarzenia
                  </label>
                  <select
                    id="new-meeting-event-mode-select"
                    name="newMeetingEventMode"
                    value={newMeetingForm.eventMode || 'stacjonarnie'}
                    onChange={(e) => setNewMeetingForm(prev => ({ ...prev, eventMode: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="stacjonarnie">🏫 Stacjonarnie (na uczelni / delegacja)</option>
                    <option value="online">💻 Online (Google Meet / MS Teams / Zoom)</option>
                    <option value="hybrydowo">🌐 Hybrydowo (Stacjonarnie i Online)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="new-meeting-time-input" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Godziny (czas trwania)
                  </label>
                  <input
                    id="new-meeting-time-input"
                    name="newMeetingTime"
                    type="text"
                    value={newMeetingForm.time}
                    onChange={(e) => setNewMeetingForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="18:00 - 19:30"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="new-meeting-speaker-input" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Prelegent / Prowadzący
                </label>
                <input
                  id="new-meeting-speaker-input"
                  name="newMeetingSpeaker"
                  type="text"
                  value={newMeetingForm.speaker}
                  onChange={(e) => setNewMeetingForm(prev => ({ ...prev, speaker: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="np. mgr Jan Kowalski"
                />
              </div>

              <div>
                <label htmlFor="new-meeting-default-type-select" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Kategoria / Typ spotkania
                </label>
                <select
                  id="new-meeting-default-type-select"
                  name="newMeetingDefaultType"
                  value={newMeetingForm.defaultType}
                  onChange={(e) => setNewMeetingForm(prev => ({ ...prev, defaultType: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  <optgroup label="Status / Charakter spotkania">
                    <option value="mandatory">◯ Obowiązkowe (wliczane do frekwencji certyfikatu)</option>
                    <option value="optional">◯ Nieobowiązkowe / Dodatkowe (dla chętnych)</option>
                    <option value="trigger_warning">◯ Trigger Warning (ostrzeżenie / wymóg szczególny)</option>
                    <option value="internal">◯ Wewnętrzne Zarządzanie (organizacyjne)</option>
                  </optgroup>
                  <optgroup label="Format / Kategoria wydarzenia">
                    <option value="conference_passive">Konferencja / Dyskusja (udział bierny / słuchacz)</option>
                    <option value="workshop_external">Warsztat / Szkolenie</option>
                  </optgroup>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setMeetingToEdit(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  {meetingToEdit ? <Save size={14} /> : <Plus size={14} />}
                  <span>{meetingToEdit ? 'Zapisz zmiany w spotkaniu' : 'Dodaj spotkanie'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: ⚠️ Ostrzeżenie przed przeniesieniem do Kosza ───────────── */}
      {meetingToTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">⚠️ Przenieść spotkanie do Kosza?</h3>
                <p className="text-xs text-slate-500">Bezpieczne usunięcie (Soft Delete)</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <div>
                Spotkanie <strong className="text-indigo-900 font-mono">[{meetingToTrash.code || meetingToTrash.id}]</strong> - <strong>{meetingToTrash.title}</strong> oraz powiązane listy obecności zostaną ukryte.
              </div>
              <div className="text-[11px] text-slate-500">
                Będziesz mógł je w każdej chwili przywrócić z Kosza bez utraty danych obecności.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMeetingToTrash(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveToTrash}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Przenieś do kosza</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Definitywne trwałe usunięcie z Kosza ──────────────────── */}
      {meetingToPermanentDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-rose-200 max-w-md w-full p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Trwałe usunięcie spotkania</h3>
                <p className="text-xs text-rose-600 font-medium">Operacja jest nieodwracalna</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Czy na pewno chcesz bezpowrotnie usunąć spotkanie <strong className="text-slate-900">[{meetingToPermanentDelete.code || meetingToPermanentDelete.id}] {meetingToPermanentDelete.title}</strong>? Rekord zniknie z Kosza.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMeetingToPermanentDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="px-4 py-2 rounded-xl bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 shadow-sm transition cursor-pointer"
              >
                Definitywnie usuń
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal potwierdzenia trwałego usunięcia obecności z Google Sheets ── */}
      {showClearConfirmModal && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 p-4 sm:p-6 max-w-lg w-full space-y-5 animate-in zoom-in-95 duration-150">
            
            {/* Nagłówek z ikoną ostrzegawczą */}
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-600 shadow-2xs">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Wyczyścić bazę obecności dla tego spotkania?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Operacja trwale usunie zarejestrowane obecności z arkusza Google Sheets i bazy koła.
                </p>
              </div>
            </div>

            {/* Wizytówka spotkania z metrykami */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {selectedMeeting.code || 'M??'}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 line-clamp-1">
                    {selectedMeeting.title || 'Spotkanie koła'}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-medium text-slate-500 shrink-0">
                  {selectedMeeting.formattedDate || selectedMeeting.date || '—'}
                </span>
              </div>

              {/* Informacja o uczestnikach do wyzerowania */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Liczba zarejestrowanych uczestników:</span>
                <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                  {selectedMeeting.attendeesCount || selectedMeeting.attendees?.length || 0} osób
                </span>
              </div>
            </div>

            {/* Ostrzeżenie o skutkach */}
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={15} />
              <span>
                <strong>Uwaga:</strong> Usunięcie obecności spowoduje odliczenie punktów za to spotkanie u wszystkich zapisanych uczestników oraz zmianę statusu spotkania na <em>„Zaplanowane”</em>.
              </span>
            </div>

            {/* Przyciski akcji */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                disabled={isClearingAttendance}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleClearAttendanceFromDB(selectedMeeting);
                  setShowClearConfirmModal(false);
                }}
                disabled={isClearingAttendance}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isClearingAttendance ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                <span>{isClearingAttendance ? 'Usuwanie z arkusza…' : 'Tak, wyczyść trwale'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Printable Meeting Minutes Protocol (A4) ── */}
      {isPrintingProtocol && currentSelectedMeeting && (
        <div id="protocol-print-container" className="hidden print:block fixed inset-0 bg-white z-9999 p-0 m-0">
          <OfficialMeetingMinutesTemplate
            meeting={currentSelectedMeeting}
            protocolData={protocolForm}
            org={currentOrg}
            academicYear={academicYear || '2025/2026'}
            supervisors={currentOrg.supervisors}
          />
        </div>
      )}
    </div>
  );
}


