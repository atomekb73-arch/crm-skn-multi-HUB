import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { showToast } from '../utils/toast';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  Search,
  Filter,
  Save,
  Timer,
  Calendar,
  Clock,
  User,
  Users,
  Link2,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  Check,
  Plus,
  UserPlus,
  GraduationCap,
  Mic,
  ShieldCheck,
  Tag,
  Award,
  Loader2,
  ClipboardList,
  Play,
  Trash2,
  HelpCircle,
} from 'lucide-react';
import { ActivityWeightIcon, VectorRingIndicator } from './VectorIcons';
import {
  PARTICIPANT_ROLES,
  FACULTY_SUPERVISORS,
  CUSTOM_MAPPINGS,
  isFacultySupervisor,
  isMonikaLyniewska,
  getCustomMappedMember,
  normalizeDiacritics,
  detectParticipantRole,
  isFormerMemberRecord,
} from '../utils/specialRoles';
import { useSettings } from '../context/SettingsContext';
import { useOrg } from '../context/OrgContext';
import { ACTIVITY_OPTIONS } from '../utils/activityRegistry';
import { calculateEventDays, calculateEventPointsBreakdown } from '../utils/pointsCalculator';
import { saveMeetingAttendanceToSupabase, parseAttendanceLine, updateMemberAliasesInGAS } from '../services/googleSheets';
import { getAliasesFromStorage, saveAliasesToStorage } from '../utils/storage';
import { matchMemberExact, matchSupervisorExact, isMetadataOrHeaderLine } from '../utils/meetingParser';

function findMemberMatch(nameOrIndex, members = [], aliasesMap = {}) {
  return matchMemberExact(nameOrIndex, members, aliasesMap);
}

function resolveInitialParticipants(meeting = {}, members = [], participants = [], threshold = 15, supervisors = null, getStorageKey = (k) => k, aliasesMap = {}) {
  const processParticipant = (p, idx = 0) => {
    let candidateIndex = '';
    let candidateName = '';

    if (typeof p === 'string') {
      const trimmed = p.trim();
      if (/^\d{3,6}$/.test(trimmed)) {
        candidateIndex = trimmed;
      } else {
        candidateName = trimmed;
      }
    } else if (p && typeof p === 'object') {
      candidateIndex = String(p.member?.index || p.index || p.nrIndeksu || p.index_number || '').trim();
      candidateName = String(p.member?.fullName || p.fullName || p.full_name || p.imieNazwisko || p.rawName || p.name || '').trim();
      if (candidateName === '[object Object]') candidateName = '';
      if (candidateIndex === '[object Object]') candidateIndex = '';
    }

    let rawName = candidateName || candidateIndex || (typeof p === 'string' ? p : 'Uczestnik');
    if (rawName === '[object Object]') {
      rawName = candidateIndex || 'Uczestnik';
    }

    const isExplicitSpeaker = (typeof rawName === 'string' && (rawName.includes('[SPEAKER]') || rawName.toLowerCase().includes('[speaker]') || rawName.toLowerCase().includes('[prelegent]') || rawName.toLowerCase().startsWith('prelegent:'))) ||
      p.role === 'speaker' || p.role === 'prelegent' || p.rola === 'speaker' || p.rola === 'prelegent' || p.isSpeaker || String(p.status).toLowerCase() === 'speaker';

    const matchedSup = !isExplicitSpeaker ? matchSupervisorExact(rawName, supervisors) : null;
    const isSup = !isExplicitSpeaker && (matchedSup != null || isFacultySupervisor(rawName, supervisors));
    const supervisorFormattedName = matchedSup ? (matchedSup.fullName || `${matchedSup.academicTitle || 'mgr'} ${matchedSup.name}`) : rawName;

    const dur = typeof p.durationMinutes === 'number' ? p.durationMinutes : (parseInt(p.durationMinutes || p.durationStr, 10) || 60);

    // If participant is explicitly linked or has a custom historical index
    if (!isExplicitSpeaker && !isSup && (p.isCustomHistorical || p.isLinked || p.member?.isCustomHistorical || p.member?.isManual)) {
      const idxNum = String(p.nrIndeksu || p.member?.index || p.index || candidateIndex || '').trim();
      const customMem = p.member || {
        id: `manual_${idxNum}`,
        index: idxNum,
        nrIndeksu: idxNum,
        fullName: candidateName || rawName,
        isFormerMember: true,
        isHistorical: true,
        isManual: true,
        isCustomHistorical: true,
        status: 'archived',
        statusWeryfikacji: 'Archiwum',
      };
      return {
        ...p,
        id: p.id || `p_${idx}_${idxNum || rawName.slice(0, 10)}`,
        rawName,
        joinTime: p.joinTime || '18:00',
        durationStr: p.durationStr || `${dur} min`,
        durationMinutes: dur,
        member: customMem,
        nrIndeksu: idxNum,
        role: 'member',
        rola: 'Członek koła',
        isGuest: false,
        isExternalGuest: false,
        isLinked: true,
        isCustomHistorical: true,
        isEligible: true,
        manualApproved: true,
        hasManualOverride: true,
        activities: Array.isArray(p.activities) ? p.activities : [],
        status: 'approved',
      };
    }

    const isMonika = !isExplicitSpeaker && !isSup && (isMonikaLyniewska(rawName) || (p.member && isMonikaLyniewska(p.member.index || p.member.fullName)) || candidateIndex === '34327');
    const customMember = (!isExplicitSpeaker && !isSup) ? getCustomMappedMember(rawName) : null;
    const candidateQuery = candidateIndex || candidateName || rawName;
    const matchedMember = (!isExplicitSpeaker && !isSup)
      ? (p.member || customMember || matchMemberExact(candidateQuery, members, aliasesMap) || (candidateName ? matchMemberExact(candidateName, members, aliasesMap) : null) || (candidateIndex ? matchMemberExact(candidateIndex, members, aliasesMap) : null))
      : null;

    const finalMember = (isSup || isExplicitSpeaker)
      ? null
      : (matchedMember || (isMonika ? findMemberMatch('34327', members) || getCustomMappedMember('34327') : null));

    let role = p.role || (isExplicitSpeaker ? 'speaker' : (isSup ? 'supervisor' : (finalMember || isMonika ? 'member' : (p.isGuest ? 'guest' : 'guest'))));
    if (isExplicitSpeaker) role = 'speaker';
    if (isSup) role = 'supervisor';
    if (finalMember || isMonika) role = 'member';

    const isOver = dur >= threshold;
    const approved = p.manualApproved !== undefined ? p.manualApproved : (isExplicitSpeaker || isSup || !!finalMember || isMonika || isOver);

    let status = 'approved';
    if (role === 'supervisor') status = 'supervisor';
    else if (role === 'speaker') status = 'speaker';
    else if (role === 'guest') status = 'guest';
    else if (!finalMember && !isMonika) status = 'unmatched';
    else if (!approved) status = 'rejected_short_time';

    const cleanRawName = isExplicitSpeaker ? rawName.replace(/^\[SPEAKER\]:\s*/i, '').replace(/^\[SPEAKER\]\s*/i, '').trim() : rawName;

    const finalRawName = isSup
      ? supervisorFormattedName
      : (finalMember ? (finalMember.fullName || `${finalMember.firstName || ''} ${finalMember.lastName || ''}`.trim()) : cleanRawName);

    const safeFinalName = String(finalRawName === '[object Object]' || !finalRawName ? (finalMember?.fullName || candidateName || candidateIndex || 'Uczestnik') : finalRawName).trim();

    return {
      ...p,
      id: p.id || `att-${idx}-${Date.now()}`,
      name: safeFinalName,
      fullName: safeFinalName,
      rawName: String(isExplicitSpeaker ? (cleanRawName.startsWith('[SPEAKER]') ? cleanRawName : `[SPEAKER]: ${cleanRawName}`) : safeFinalName).trim(),
      joinTime: String(p.joinTime || '18:00'),
      durationStr: String(p.durationStr || `${dur} min`),
      durationMinutes: Number(dur) || 60,
      timeMinutes: Number(dur) || 60,
      member: finalMember,
      nrIndeksu: String(isSup ? '' : (finalMember?.index || candidateIndex || p.nrIndeksu || p.index || '')).trim(),
      index: String(isSup ? '' : (finalMember?.index || candidateIndex || p.index || p.nrIndeksu || '')).trim(),
      role: String(isSup ? 'supervisor' : (isExplicitSpeaker ? 'speaker' : (finalMember || isMonika ? 'member' : 'guest'))),
      roleDisplay: String(isSup ? 'Opiekun' : (isExplicitSpeaker ? 'Prelegent' : (finalMember || isMonika ? 'Członek koła' : 'Gość'))),
      rola: String(isSup ? 'Opiekun' : (isExplicitSpeaker ? 'Prelegent' : (finalMember || isMonika ? 'Członek koła' : 'Gość'))),
      punkty: Number(p.punkty || p.points || 1),
      aktywnosc: p.aktywnosc || (isExplicitSpeaker ? 'Prelekcja' : 'Obecność'),
      isSpeaker: Boolean(isExplicitSpeaker),
      isSupervisor: Boolean(isSup),
      isGuest: Boolean(!isSup && !isExplicitSpeaker && !finalMember && !isMonika),
      isExternalGuest: Boolean(!isSup && !isExplicitSpeaker && !finalMember && !isMonika),
      isEligible: Boolean(isExplicitSpeaker || isSup || isOver),
      manualApproved: Boolean(isSup ? true : approved),
      hasManualOverride: Boolean(p.hasManualOverride || isExplicitSpeaker || isSup || isMonika),
      activities: Array.isArray(p.activities) ? p.activities : [],
      status: String(isSup ? 'supervisor' : (isExplicitSpeaker ? 'speaker' : (finalMember || isMonika ? (approved ? 'approved' : 'rejected_short_time') : 'guest'))),
    };
  };

  if (Array.isArray(participants) && participants.length > 0) {
    return participants.map((p, i) => processParticipant(p, i));
  }

  const keys = [
    getStorageKey(`crm_attendance_${meeting?.id}`),
    getStorageKey(`crm_attendance_${meeting?.date}`),
    meeting?.code ? getStorageKey(`crm_attendance_${meeting?.code}`) : null,
  ].filter(Boolean);

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        let list = null;
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        if (parsed && Array.isArray(parsed.attendees) && parsed.attendees.length > 0) list = parsed.attendees;

        if (list) {
          return list.map((p, i) => processParticipant(p, i));
        }
      }
    } catch {}
  }

  // Fallback: reconstruct from meeting.attendees
  if (Array.isArray(meeting?.attendees) && meeting.attendees.length > 0) {
    return meeting.attendees.map((att, i) => {
      if (att && typeof att === 'object') return processParticipant(att, i);
      return processParticipant({ rawName: String(att) }, i);
    });
  }

  return [];
}

/**
 * Interaktywny Searchable Combobox do wyszukiwania studentów z bazy 141 osób
 */
function MemberAutocomplete({
  members = [],
  value,
  onChange,
  placeholder = 'Wpisz imię, nazwisko lub nr indeksu...',
  className = '',
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedMember = useMemo(() => {
    if (!value) return null;
    return members.find(m => m.id === value || m.index === value);
  }, [members, value]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const nameA = (a.fullName || `${a.firstName} ${a.lastName}`).trim();
      const nameB = (b.fullName || `${b.firstName} ${b.lastName}`).trim();
      return nameA.localeCompare(nameB, 'pl', { sensitivity: 'base' });
    });
  }, [members]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sortedMembers;
    const q = normalizeDiacritics(query);
    return sortedMembers.filter(m => {
      const name = normalizeDiacritics(m.fullName || `${m.firstName} ${m.lastName}`);
      const idx = String(m.index || '').toLowerCase();
      const em = normalizeDiacritics(m.email);
      return name.includes(q) || idx.includes(q) || em.includes(q);
    });
  }, [sortedMembers, query]);

  const displayInputValue = isOpen
    ? query
    : selectedMember
    ? `${selectedMember.fullName || `${selectedMember.firstName} ${selectedMember.lastName}`} (${selectedMember.index})`
    : query;

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          id="combobox-search-member"
          name="comboboxSearchMember"
          aria-label="Wyszukaj członka koła po imieniu, nazwisku lub indeksie"
          type="text"
          value={displayInputValue}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={e => e.stopPropagation()}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 220);
          }}
          placeholder={placeholder}
          className="w-full text-xs border border-purple-300 rounded-xl pl-8 pr-8 py-2 bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-purple-400 outline-none shadow-2xs transition"
        />
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-400" />
        
        {selectedMember && !isOpen && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange('');
              setQuery('');
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 transition cursor-pointer p-0.5"
            title="Wyczyść wybór"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white rounded-2xl shadow-xl border border-purple-200 z-50 p-1.5 space-y-1 scrollbar-thin scrollbar-thumb-purple-200 animate-in fade-in zoom-in-95 duration-100">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-slate-400">
              Nie znaleziono studenta o frazie &bdquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((m, mIdx) => {
              const name = String(m.fullName || `${m.firstName || ''} ${m.lastName || ''}`).trim();
              const isSelected = value === m.id || value === m.index;
              const isFormer = isFormerMemberRecord(m);
              const isActive = (m.status === 'active' || !m.status) && !isFormer;

              return (
                <button
                  key={`${m.id || m.index || 'member'}-${mIdx}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(m.id || m.index);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-purple-100 text-purple-950 font-bold'
                      : 'hover:bg-purple-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold truncate">{name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Indeks: <strong>{String(m.index || m.nrIndeksu || '')}</strong> {m.field ? `• ${String(m.field)}` : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isFormer
                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {isActive ? '🟢 Aktywny' : isFormer ? '⚪ Były członek' : '⚪ Baza ogólna'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Autocomplete i inteligentny input do ręcznego dodawania uczestników (członkowie SKN oraz goście zewnętrzni)
 */
function AddParticipantInput({
  members = [],
  value,
  onChange,
  onSelectMember,
  selectedMember,
  placeholder = "Wpisz imię, nazwisko lub wklej wpis z Meet...",
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const nameA = (a.fullName || `${a.firstName} ${a.lastName}`).trim();
      const nameB = (b.fullName || `${b.firstName} ${b.lastName}`).trim();
      return nameA.localeCompare(nameB, 'pl', { sensitivity: 'base' });
    });
  }, [members]);

  const filtered = useMemo(() => {
    if (!value || !value.trim()) return sortedMembers.slice(0, 20);
    const q = normalizeDiacritics(value).toLowerCase().trim();
    return sortedMembers.filter(m => {
      const name = normalizeDiacritics(m.fullName || `${m.firstName} ${m.lastName}`).toLowerCase();
      const idx = String(m.index || '').toLowerCase();
      const em = normalizeDiacritics(m.email || '').toLowerCase();
      return name.includes(q) || idx.includes(q) || em.includes(q);
    });
  }, [sortedMembers, value]);

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          id="add-participant-name-input"
          name="addParticipantNameInput"
          aria-label="Wpisz imię, nazwisko lub wklej wpis z Meet"
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={e => e.stopPropagation()}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 240)}
          placeholder={placeholder}
          className="w-full text-xs border border-purple-300 rounded-xl pl-8 pr-8 py-2 bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-purple-400 outline-none shadow-2xs transition"
        />
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-400" />

        {value && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange('');
              if (onSelectMember) onSelectMember(null);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 transition cursor-pointer p-0.5"
            title="Wyczyść"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white rounded-2xl shadow-xl border border-purple-200 z-50 p-1.5 space-y-1 scrollbar-thin scrollbar-thumb-purple-200 animate-in fade-in zoom-in-95 duration-100">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-center text-xs text-purple-800 bg-purple-50/80 rounded-xl font-medium">
              👤 Brak w bazie SKN &mdash; zostanie dodany jako <strong>Gość zewnętrzny</strong>
            </div>
          ) : (
            filtered.map((m, mIdx) => {
              const name = String(m.fullName || `${m.firstName || ''} ${m.lastName || ''}`).trim();
              const isSelected = selectedMember && (selectedMember.id === m.id || selectedMember.index === m.index);
              const isFormer = isFormerMemberRecord(m);
              const isActive = (m.status === 'active' || !m.status) && !isFormer;

              return (
                <button
                  key={`${m.id || m.index || 'add_mem'}-${mIdx}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (onSelectMember) onSelectMember(m);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-purple-100 text-purple-950 font-bold'
                      : 'hover:bg-purple-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold truncate">{name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Indeks: <strong>{String(m.index || m.nrIndeksu || '')}</strong> {m.field ? `• ${String(m.field)}` : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isFormer
                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {isActive ? '🟢 Członek' : isFormer ? '⚪ Były członek' : '⚪ Baza'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function AttendanceModal({
  isOpen,
  onClose,
  meeting,
  members = [],
  participants = [],
  initialRawText = '',
  onRawTextChange,
  minDurationThreshold = 15,
  onThresholdChange,
  onSaveAttendance,
}) {
  
  const { supervisors, weights } = useSettings();
  const [localThreshold, setLocalThreshold] = useState(minDurationThreshold);
  const [aliasesMap, setAliasesMap] = useState(() => getAliasesFromStorage());
  const [linkingParticipantId, setLinkingParticipantId] = useState(null);
  const [linkTab, setLinkTab] = useState('search'); // 'search' | 'manual'
  const [manualIndexInput, setManualIndexInput] = useState('');
  const [manualNameInput, setManualNameInput] = useState('');
  const [localParticipants, setLocalParticipants] = useState(() =>
    resolveInitialParticipants(meeting, members, participants, minDurationThreshold, supervisors, (k) => k, getAliasesFromStorage())
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'member', 'supervisor', 'speaker', 'guest', 'short_time', 'unmatched'
  const [selectedAssignee, setSelectedAssignee] = useState({});
  const [openActivityPopoverId, setOpenActivityPopoverId] = useState(null);
  const [popoverPos, setPopoverPos] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const popoverRef = useRef(null);

  // Persistent popover size from localStorage (default: width 360px, height 320px)
  const [popoverSize, setPopoverSize] = useState(() => {
    try {
      const saved = localStorage.getItem('crm_activities_popover_size');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return {
            width: Math.max(320, Math.min(parsed.width, window.innerWidth * 0.9)),
            height: Math.max(220, Math.min(parsed.height, window.innerHeight * 0.7)),
          };
        }
      }
    } catch {}
    return { width: 360, height: 320 };
  });

  const handleTogglePopover = (e, participantId) => {
    if (openActivityPopoverId === participantId) {
      setOpenActivityPopoverId(null);
      setPopoverPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpwards = spaceBelow < 300 && spaceAbove > spaceBelow;

      const popoverWidth = popoverSize?.width || 360;
      const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, rect.right - popoverWidth));

      if (openUpwards) {
        const bottom = window.innerHeight - rect.top + 6;
        const maxHeight = Math.max(220, Math.min(500, rect.top - 20));
        setPopoverPos({ id: participantId, bottom, left, openUpwards: true, maxHeight });
      } else {
        const top = rect.bottom + 6;
        const maxHeight = Math.max(220, Math.min(500, spaceBelow - 20));
        setPopoverPos({ id: participantId, top, left, openUpwards: false, maxHeight });
      }
      setOpenActivityPopoverId(participantId);
    }
  };

  const handleSetParticipantDays = (participantId, days) => {
    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participantId) return p;
        return {
          ...p,
          daysAttended: Number(days) || 1,
        };
      })
    );
  };

  useEffect(() => {
    if (!openActivityPopoverId) return;
    const handleClose = (e) => {
      if (popoverRef.current && popoverRef.current.contains(e.target)) {
        return;
      }
      setOpenActivityPopoverId(null);
      setPopoverPos(null);
    };
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [openActivityPopoverId]);

  // ResizeObserver: auto-save user resized popover dimensions to localStorage
  useEffect(() => {
    if (!openActivityPopoverId || !popoverRef.current) return;
    const el = popoverRef.current;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          const width = Math.round(entry.borderBoxSize?.[0]?.inlineSize || el.offsetWidth);
          const height = Math.round(entry.borderBoxSize?.[0]?.blockSize || el.offsetHeight);
          if (width >= 300 && height >= 200) {
            setPopoverSize(prev => {
              if (prev.width === width && prev.height === height) return prev;
              const next = { width, height };
              try {
                localStorage.setItem('crm_activities_popover_size', JSON.stringify(next));
              } catch {}
              return next;
            });
          }
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [openActivityPopoverId]);

  const activeMembersOnly = useMemo(() => {
    return members.filter(m => m && (m.status === 'active' || !m.status) && !isFormerMemberRecord(m));
  }, [members]);

  const handleOpenLinkModal = (participantId, defaultName = '') => {
    setLinkingParticipantId(participantId);
    const rawClean = defaultName ? defaultName.replace(/^\[SPEAKER\]:\s*/i, '').replace(/^\[GOŚĆ\]:\s*/i, '').replace(/^\[GOSC\]:\s*/i, '').trim() : '';
    const isPureDigits = /^\d+$/.test(rawClean);

    if (isPureDigits) {
      setManualIndexInput(rawClean);
      setManualNameInput('');
      setLinkTab('manual');
    } else {
      setManualIndexInput('');
      setManualNameInput(rawClean);
      setLinkTab('search');
    }
  };

  const matchingMemberByIndex = useMemo(() => {
    const clean = manualIndexInput.trim().replace(/\D/g, '');
    if (!clean) return null;
    return members.find(m => {
      if (!m) return false;
      const idx = String(m.index || m.nrIndeksu || '').replace(/\D/g, '').trim();
      return idx === clean;
    });
  }, [manualIndexInput, members]);

  const handleAssignManualIndex = (participant, manualIndex, customName = '') => {
    if (!manualIndex || !manualIndex.trim()) return;
    const cleanIndex = manualIndex.trim();

    // Szukaj w bazie członków (w tym archiwalnych i byłych)
    const existingMember = members.find(m => {
      if (!m) return false;
      const idx = String(m.index || m.nrIndeksu || '').replace(/\D/g, '').trim();
      return idx && idx === cleanIndex.replace(/\D/g, '');
    });

    let cleanName = '';
    const trimmedCustom = (customName || '').trim();
    if (trimmedCustom && !/^\d+$/.test(trimmedCustom)) {
      cleanName = trimmedCustom;
    } else if (existingMember) {
      cleanName = existingMember.fullName || `${existingMember.firstName || ''} ${existingMember.lastName || ''}`.trim();
    } else {
      const rawClean = participant.rawName.replace(/^\[SPEAKER\]:\s*/i, '').replace(/^\[GOŚĆ\]:\s*/i, '').replace(/^\[GOSC\]:\s*/i, '').trim();
      cleanName = (!/^\d+$/.test(rawClean) && rawClean) ? rawClean : `Członek koła (${cleanIndex})`;
    }

    const manualMember = existingMember ? {
      ...existingMember,
      index: cleanIndex,
      nrIndeksu: cleanIndex,
      fullName: cleanName,
      isLinked: true,
      isCustomHistorical: true,
    } : {
      id: `manual_${cleanIndex}`,
      index: cleanIndex,
      nrIndeksu: cleanIndex,
      fullName: cleanName,
      firstName: cleanName.split(' ')[0] || cleanName,
      lastName: cleanName.split(' ').slice(1).join(' ') || '',
      status: 'archived',
      statusWeryfikacji: 'Archiwum',
      isFormerMember: true,
      isHistorical: true,
      isManual: true,
      isCustomHistorical: true,
    };

    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participant.id) return p;
        return {
          ...p,
          rawName: cleanName,
          name: cleanName,
          fullName: cleanName,
          member: manualMember,
          nrIndeksu: cleanIndex,
          index: cleanIndex,
          role: 'member',
          rola: 'Członek koła',
          isGuest: false,
          isExternalGuest: false,
          isLinked: true,
          isCustomHistorical: true,
          manualApproved: true,
          hasManualOverride: true,
          status: 'approved',
        };
      })
    );

    setLinkingParticipantId(null);
    setManualIndexInput('');
    setManualNameInput('');
  };

  const renderLinkingPanel = (p) => (
    <div className="bg-slate-50 border border-indigo-200 rounded-2xl p-3 space-y-2.5 shadow-sm animate-in fade-in duration-100 text-left">
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setLinkTab('search')}
          className={`px-3 py-1.5 rounded-xl transition cursor-pointer text-xs ${
            linkTab === 'search'
              ? 'bg-indigo-600 text-white font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          Wybierz aktualnego członka
        </button>
        <button
          type="button"
          onClick={() => {
            setLinkTab('manual');
            const cleanRaw = p.rawName.replace(/^\[SPEAKER\]:\s*/i, '').replace(/^\[GOŚĆ\]:\s*/i, '').replace(/^\[GOSC\]:\s*/i, '').trim();
            if (/^\d+$/.test(cleanRaw)) {
              if (!manualIndexInput) setManualIndexInput(cleanRaw);
              if (manualNameInput === cleanRaw) setManualNameInput('');
            } else if (!manualNameInput) {
              setManualNameInput(cleanRaw);
            }
          }}
          className={`px-3 py-1.5 rounded-xl transition cursor-pointer text-xs ${
            linkTab === 'manual'
              ? 'bg-indigo-600 text-white font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          Wpisz indeks historyczny
        </button>
      </div>

      {linkTab === 'search' ? (
        <div className="space-y-1.5 pt-1">
          <MemberAutocomplete
            members={activeMembersOnly}
            value=""
            onChange={val => {
              if (val) handleLinkAlias(p, val);
            }}
            placeholder="Wyszukaj w bazie aktualnych członków..."
            className="w-full"
          />
        </div>
      ) : (
        <div className="space-y-2.5 pt-1">
          <div>
            <label htmlFor="manual-history-index-input" className="block text-[11px] font-bold text-slate-700 mb-1">
              Numer indeksu (historyczny wpis z okresu spotkania):
            </label>
            <input
              id="manual-history-index-input"
              name="manualIndexInput"
              type="text"
              value={manualIndexInput}
              onChange={e => setManualIndexInput(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              placeholder="np. 12345"
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold bg-white text-slate-900 focus:ring-2 focus:ring-indigo-400 outline-none shadow-2xs"
            />
          </div>

          {matchingMemberByIndex && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
              <div>
                <p className="font-bold">{matchingMemberByIndex.fullName || `${matchingMemberByIndex.firstName} ${matchingMemberByIndex.lastName}`}</p>
                <p className="text-[10px] text-emerald-700 font-mono mt-0.5">
                  Nr indeksu: <strong>{matchingMemberByIndex.index}</strong> {matchingMemberByIndex.field ? `• ${matchingMemberByIndex.field}` : ''}
                </p>
              </div>
              <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-bold shrink-0">
                Znaleziono w SKN
              </span>
            </div>
          )}

          <div>
            <label htmlFor="manual-history-name-input" className="block text-[11px] font-bold text-slate-700 mb-1">
              Imię i nazwisko (opcjonalnie):
            </label>
            <input
              id="manual-history-name-input"
              name="manualNameInput"
              type="text"
              value={manualNameInput}
              onChange={e => setManualNameInput(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              placeholder={matchingMemberByIndex ? (matchingMemberByIndex.fullName || `${matchingMemberByIndex.firstName} ${matchingMemberByIndex.lastName}`) : "np. Jan Kowalski"}
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-400 outline-none shadow-2xs"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!manualIndexInput.trim()}
              onClick={() => handleAssignManualIndex(p, manualIndexInput, manualNameInput)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
            >
              Zatwierdź jako członka koła
            </button>
          </div>
        </div>
      )}

      <div className="pt-1 flex justify-end">
        <button
          type="button"
          onClick={() => setLinkingParticipantId(null)}
          className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline cursor-pointer"
        >
          Anuluj
        </button>
      </div>
    </div>
  );

  // Paste drawer inside modal
  const [isPasteDrawerOpen, setIsPasteDrawerOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState(initialRawText || '');

  React.useEffect(() => {
    if (isOpen) {
      setPasteRawText(initialRawText || '');
    }
  }, [isOpen, initialRawText]);

  const handleProcessPastedText = () => {
    if (!pasteRawText.trim()) return;
    if (onRawTextChange) onRawTextChange(pasteRawText);

    const lines = pasteRawText.split(/\r?\n/).map(l => l.replace(/^\uFEFF/, ''));
    const participantLines = lines.filter(line => !isMetadataOrHeaderLine(line));
    const parsedList = [];
    const seenNames = new Set();

    for (let i = 0; i < participantLines.length; i++) {
      const p = parseAttendanceLine(participantLines[i]);
      if (p && p.rawName && !isMetadataOrHeaderLine(p.rawName) && !seenNames.has(p.rawName.toLowerCase())) {
        seenNames.add(p.rawName.toLowerCase());
        parsedList.push({
          id: `att_${Date.now()}_${i}`,
          rawName: p.rawName,
          name: p.rawName,
          durationMinutes: p.durationMinutes || 60,
          durationStr: p.durationStr || `${p.durationMinutes || 60} min`,
          joinTime: p.joinTime || '18:00',
          role: p.isExplicitGuest ? 'guest' : undefined,
          isGuest: p.isExplicitGuest,
        });
      }
    }

    if (parsedList.length > 0) {
      const currentAliases = getAliasesFromStorage();
      const resolved = resolveInitialParticipants(meeting, members, parsedList, localThreshold, supervisors, getStorageKey, currentAliases);
      setLocalParticipants(resolved);
      setIsPasteDrawerOpen(false);
    }
  };

  const handleToggleActivity = (participantId, actId) => {
    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participantId) return p;
        const current = Array.isArray(p.activities) ? p.activities : [];
        let next = [...current];

        if (actId === 'CONF_BIERNA_ONLINE') {
          // Wykluczenie trybu stacjonarnego
          next = next.filter(id => id !== 'KONF_BIER' && id !== 'OB_STACJO');
          if (current.includes('CONF_BIERNA_ONLINE')) {
            next = next.filter(id => id !== 'CONF_BIERNA_ONLINE');
          } else {
            next.push('CONF_BIERNA_ONLINE');
          }
        } else if (actId === 'KONF_BIER') {
          // Wykluczenie trybu online
          next = next.filter(id => id !== 'CONF_BIERNA_ONLINE');
          if (current.includes('KONF_BIER')) {
            next = next.filter(id => id !== 'KONF_BIER');
          } else {
            next.push('KONF_BIER');
          }
        } else {
          next = current.includes(actId)
            ? current.filter(id => id !== actId)
            : [...current, actId];
        }

        return {
          ...p,
          activities: next,
        };
      })
    );
  };

  // Connect guest pseudonym to member profile (Alias Matching)
  const handleLinkAlias = (participant, memberId) => {
    const targetMember = members.find(m => m.id === memberId || m.index === memberId) || getCustomMappedMember(memberId);
    if (!targetMember) return;

    const rawKey = normalizeDiacritics(participant.rawName).toLowerCase().trim();
    const cleanRawMeetName = String(participant.rawName || '')
      .replace(/^\[SPEAKER\]:\s*/i, '')
      .replace(/^\[SPEAKER\]\s*/i, '')
      .replace(/^\[GOŚĆ\]:\s*/i, '')
      .replace(/^\[GOŚĆ\]\s*/i, '')
      .replace(/^\[GOSC\]:\s*/i, '')
      .replace(/^\[GOSC\]\s*/i, '')
      .replace(/^\[OPIEKUN\]:\s*/i, '')
      .replace(/^\[OPIEKUN\]\s*/i, '')
      .replace(/^\[CZŁONEK KOŁA\]:\s*/i, '')
      .replace(/^\[CZŁONEK KOŁA\]\s*/i, '')
      .replace(/^\[CZLONEK KOLA\]:\s*/i, '')
      .replace(/^Indeks:\s*/i, '')
      .replace(/^Nr:\s*/i, '')
      .trim();

    const targetName = targetMember.fullName || `${targetMember.firstName} ${targetMember.lastName}`;

    const updatedAliases = {
      ...aliasesMap,
      [rawKey]: targetName,
    };

    setAliasesMap(updatedAliases);
    saveAliasesToStorage(updatedAliases);

    // Synchronizacja do Google Sheets (kolumna J) przez GAS
    const targetIndex = String(targetMember.index || targetMember.nrIndeksu || '').trim();
    if (targetIndex && cleanRawMeetName) {
      updateMemberAliasesInGAS(targetIndex, cleanRawMeetName).catch(err => {
        console.warn('Błąd automatycznego zapisu aliasu w GAS:', err);
      });

      // Zaktualizuj aliasy obiektu w pamięci
      if (Array.isArray(targetMember.aliases)) {
        if (!targetMember.aliases.includes(cleanRawMeetName)) {
          targetMember.aliases.push(cleanRawMeetName);
        }
      } else if (typeof targetMember.aliases === 'string') {
        targetMember.aliases = targetMember.aliases ? `${targetMember.aliases}, ${cleanRawMeetName}` : cleanRawMeetName;
      } else {
        targetMember.aliases = [cleanRawMeetName];
      }
    }

    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participant.id) return p;
        return {
          ...p,
          member: targetMember,
          nrIndeksu: targetIndex,
          role: 'member',
          rola: 'Członek koła',
          isGuest: false,
          isExternalGuest: false,
          isLinked: true,
          manualApproved: true,
          hasManualOverride: true,
          status: 'approved',
        };
      })
    );

    setLinkingParticipantId(null);
  };

  // Manual participant add form
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [addRawInput, setAddRawInput] = useState('');
  const [addSelectedMember, setAddSelectedMember] = useState(null);
  const [addDuration, setAddDuration] = useState('60');
  const [addJoinTime, setAddJoinTime] = useState('18:00');
  const [addRole, setAddRole] = useState('guest');

  const { getStorageKey } = useOrg();
  const prevMeetingKeyRef = React.useRef(null);
  const wasOpenRef = React.useRef(false);

  // Sync state ONLY when modal is newly opened or meeting changes (Prevents resetting user edits)
  React.useEffect(() => {
    if (isOpen && meeting) {
      const currentMeetingKey = `${meeting.id || meeting.date}_${meeting.code || ''}`;
      if (!wasOpenRef.current || prevMeetingKeyRef.current !== currentMeetingKey) {
        prevMeetingKeyRef.current = currentMeetingKey;
        wasOpenRef.current = true;
        setActiveFilter('all');
        setSearchQuery('');
        const currentAliases = getAliasesFromStorage();
        setAliasesMap(currentAliases);
        setLocalParticipants(resolveInitialParticipants(meeting, members, participants, localThreshold, supervisors, getStorageKey, currentAliases));
      }
    } else if (!isOpen) {
      wasOpenRef.current = false;
      prevMeetingKeyRef.current = null;
    }
  }, [isOpen, meeting, getStorageKey]);

  React.useEffect(() => {
    setLocalThreshold(minDurationThreshold);
  }, [minDurationThreshold]);

  // Recalculate local participants when threshold changes inside modal
  const handleLocalThresholdChange = (val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setLocalThreshold(num);
    if (onThresholdChange) onThresholdChange(num);

    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.role === 'supervisor' || p.role === 'speaker' || p.role === 'guest') return p;
        const isOver = p.durationMinutes >= num;
        const approved = p.hasManualOverride ? p.manualApproved : isOver;
        let status = 'approved';
        if (!approved) status = 'rejected_short_time';
        if (!p.member && !isMonikaLyniewska(p.rawName)) status = approved ? 'approved_unmatched' : 'unmatched';

        return {
          ...p,
          isEligible: isOver,
          manualApproved: approved,
          status,
        };
      })
    );
  };

  // Set explicit approval (true/false)
  const handleSetApproval = (participantId, isApproved) => {
    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participantId) return p;
        let nextStatus = isApproved ? 'approved' : 'rejected_short_time';
        if (p.role === 'supervisor') nextStatus = 'supervisor';
        else if (p.role === 'speaker') nextStatus = 'speaker';
        else if (p.role === 'guest') nextStatus = 'guest';
        else if (!p.member && !isMonikaLyniewska(p.rawName)) nextStatus = isApproved ? 'approved_unmatched' : 'unmatched';

        return {
          ...p,
          manualApproved: isApproved,
          hasManualOverride: true,
          status: nextStatus,
        };
      })
    );
  };

  // Set participant role (member, supervisor, speaker, guest)
  const handleSetParticipantRole = (participantId, newRole) => {
    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participantId) return p;

        if (newRole === 'supervisor') {
          return {
            ...p,
            role: 'supervisor',
            isGuest: false,
            manualApproved: true,
            status: 'supervisor',
          };
        }
        if (newRole === 'speaker') {
          return {
            ...p,
            role: 'speaker',
            isGuest: false,
            manualApproved: true,
            status: 'speaker',
          };
        }
        if (newRole === 'guest') {
          return {
            ...p,
            role: 'guest',
            isGuest: true,
            member: null,
            manualApproved: false,
            status: 'guest',
          };
        }

        // Standard student member
        const isOver = p.durationMinutes >= localThreshold;
        const isAppr = p.hasManualOverride ? p.manualApproved : isOver;
        return {
          ...p,
          role: 'member',
          isGuest: false,
          manualApproved: isAppr,
          status: (p.member || isMonikaLyniewska(p.rawName)) ? (isAppr ? 'approved' : 'rejected_short_time') : 'unmatched',
        };
      })
    );
  };

  // Assign participant to a known member from the 141 database
  const handleAssignMember = (participantId, memberId) => {
    const targetMember = members.find(m => m.id === memberId || m.index === memberId) || getCustomMappedMember(memberId);
    if (!targetMember) return;

    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participantId) return p;

        return {
          ...p,
          member: targetMember,
          role: 'member',
          isGuest: false,
          manualApproved: true,
          hasManualOverride: true,
          status: 'approved',
        };
      })
    );

    setSelectedAssignee(prev => ({ ...prev, [participantId]: '' }));
  };

  // Unlink member from participant
  const handleUnlinkMember = (participantId) => {
    setLocalParticipants(prev =>
      prev.map(p => {
        if (p.id !== participantId) return p;
        return {
          ...p,
          member: null,
          nrIndeksu: null,
          index: null,
          role: 'guest',
          rola: 'Gość zewnętrzny',
          isGuest: true,
          isExternalGuest: true,
          isLinked: false,
          isCustomHistorical: false,
          manualApproved: false,
          hasManualOverride: true,
          status: 'guest',
        };
      })
    );
  };

  // Remove participant from local attendance list
  const handleRemoveParticipant = (participantId) => {
    setLocalParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const handleAddInputChange = (rawVal) => {
    // 1. Maintain raw input string exactly as typed (do not trim trailing spaces synchronously while typing)
    setAddRawInput(rawVal);

    // 2. Parse/strip date signatures only for searching in member database
    const lookupName = (rawVal || '')
      .replace(/\d{4}-\d{2}-\d{2}.*$/, '')
      .replace(/\d{1,2}:\d{2}.*$/, '');

    const normClean = normalizeDiacritics(lookupName).toLowerCase().trim();
    if (!normClean) {
      setAddSelectedMember(null);
      setAddRole('guest');
      return;
    }

    const matched = members.find(m => {
      if (!m) return false;
      const normFull = normalizeDiacritics(m.fullName || `${m.firstName} ${m.lastName}`).toLowerCase().trim();
      const normIdx = String(m.index || '').trim();
      const normEmail = normalizeDiacritics(m.email || '').toLowerCase().trim();
      if (normIdx && normClean === normIdx) return true;
      if (normFull && (normClean === normFull || normClean === normFull.split(' ').reverse().join(' '))) return true;
      if (normEmail && normClean === normEmail) return true;
      return false;
    });

    if (matched) {
      setAddSelectedMember(matched);
      if (isFacultySupervisor(matched.fullName || `${matched.firstName} ${matched.lastName}`)) {
        setAddRole('supervisor');
      } else {
        setAddRole('member');
      }
    } else {
      setAddSelectedMember(null);
      setAddRole('guest');
    }
  };

  const handleSelectMemberForAdd = (member) => {
    if (!member) {
      setAddSelectedMember(null);
      setAddRole('guest');
      return;
    }
    const name = member.fullName || `${member.firstName} ${member.lastName}`;
    setAddRawInput(name);
    setAddSelectedMember(member);
    if (isFacultySupervisor(name)) {
      setAddRole('supervisor');
    } else {
      setAddRole('member');
    }
  };

  // Add new participant manually (member or external guest / speaker / supervisor)
  const handleAddParticipantSubmit = (e) => {
    e.preventDefault();
    const cleanName = (addRawInput || '')
      .replace(/\d{4}-\d{2}-\d{2}.*$/, '')
      .replace(/\d{1,2}:\d{2}.*$/, '')
      .trim();

    if (!cleanName) return;

    // Resolve target member from state or fuzzy lookup in loaded database
    const targetMember = addSelectedMember || members.find(m => {
      if (!m) return false;
      const normClean = normalizeDiacritics(cleanName).toLowerCase().trim();
      const normFull = normalizeDiacritics(m.fullName || `${m.firstName} ${m.lastName}`).toLowerCase().trim();
      const normIdx = String(m.index || '').trim();
      if (normIdx && normClean === normIdx) return true;
      if (normFull && (normClean === normFull || normClean === normFull.split(' ').reverse().join(' '))) return true;
      return false;
    }) || getCustomMappedMember(cleanName);

    const displayName = targetMember
      ? (targetMember.fullName || `${targetMember.firstName} ${targetMember.lastName}`)
      : cleanName;
    const targetIndex = targetMember ? String(targetMember.index).trim() : '';
    const normDisplayName = normalizeDiacritics(displayName).toLowerCase().trim();

    // 3. Blokada dodawania duplikatów (po indeksie lub nazwisku case-insensitive)
    const isDuplicate = localParticipants.some(a => {
      const aIndex = a.member?.index ? String(a.member.index).trim() : '';
      const aName = normalizeDiacritics(a.member?.fullName || a.rawName || '').toLowerCase().trim();
      if (targetIndex && aIndex && targetIndex === aIndex) return true;
      if (normDisplayName && aName && normDisplayName === aName) return true;
      return false;
    });

    if (isDuplicate) {
      showToast(`Uczestnik "${displayName}${targetIndex ? ` (${targetIndex})` : ''}" już znajduje się na liście tego spotkania!`);
      return;
    }

    const dur = parseInt(addDuration, 10) || 60;
    const effectiveRole = addRole || (targetMember ? 'member' : 'guest');
    const isGuest = effectiveRole === 'guest' || !targetMember;
    const isSup = effectiveRole === 'supervisor' || isFacultySupervisor(displayName);
    const isSpeaker = effectiveRole === 'speaker';

    const newParticipant = {
      id: `manual_${Date.now()}_${targetMember ? targetMember.index : Math.random().toString(36).substring(2, 7)}`,
      rawName: displayName,
      joinTime: addJoinTime || '18:00',
      durationStr: `${dur} min`,
      durationMinutes: dur,
      member: targetMember || null,
      role: effectiveRole,
      isGuest: Boolean(isGuest && !isSup && !isSpeaker),
      isEligible: true,
      manualApproved: true,
      hasManualOverride: true,
      status: isSup ? 'supervisor' : (isSpeaker ? 'speaker' : (isGuest ? 'guest' : 'approved')),
      isExternalGuest: !targetMember,
    };

    setLocalParticipants(prev => [newParticipant, ...prev]);
    setIsAddFormOpen(false);
    setAddRawInput('');
    setAddSelectedMember(null);
    setAddDuration('60');
    setAddRole('guest');
  };

  // Helper to determine if participant is a Faculty Supervisor
  const isSupervisorPerson = (p) => {
    if (!p) return false;
    return p.role === 'supervisor' || p.rola === 'Opiekun' || p.rola === 'supervisor' || p.isSupervisor || isFacultySupervisor(p.rawName, supervisors);
  };

  // Helper to determine if participant is a Speaker / Special Guest
  const isSpeakerPerson = (p) => {
    if (!p || isSupervisorPerson(p)) return false;
    return p.role === 'speaker' || p.rola === 'Prelegent' || p.rola === 'speaker' || p.isSpeaker || (typeof p.rawName === 'string' && p.rawName.toLowerCase().includes('[speaker]'));
  };

  // Helper to determine if participant is an External Guest (strictly excluding supervisors and speakers)
  const isGuestPerson = (p) => {
    if (!p || isSupervisorPerson(p) || isSpeakerPerson(p)) return false;
    return p.role === 'guest' || p.rola === 'Gość' || p.isGuest || p.isExternalGuest;
  };

  // Helper to determine if participant is a Student Member
  const isStudentMemberPerson = (p) => {
    if (!p || isSupervisorPerson(p) || isSpeakerPerson(p) || isGuestPerson(p)) return false;
    return true;
  };

  // List of faculty supervisors present on this meeting
  const supervisorsPresent = useMemo(() => {
    return localParticipants.filter(isSupervisorPerson);
  }, [localParticipants, supervisors]);

  // Helper to determine if participant has approved attendance ("Zaliczono")
  const isApprovedParticipant = (p) => {
    if (isSupervisorPerson(p)) return true;
    if (isSpeakerPerson(p)) return true;
    if (isGuestPerson(p)) return true;
    if (p.manualApproved !== undefined) return Boolean(p.manualApproved);
    return Boolean(p.isEligible || p.status === 'approved' || p.status === 'Zaliczona');
  };

  // Helper to determine if participant is an approved student member
  const isApprovedStudent = (p) => {
    if (!isStudentMemberPerson(p)) return false;
    const isApproved = p.manualApproved !== undefined ? p.manualApproved : (p.isEligible || p.status === 'approved' || p.status === 'Zaliczona');
    const hasIndex = Boolean(p.member?.index || p.nrIndeksu || p.index);
    return Boolean(isApproved && (hasIndex || !!p.member || isMonikaLyniewska(p.rawName)));
  };

  // Sorted and Filtered Participants (Strict Polish Alphabetical Order)
  const sortedAndFilteredParticipants = useMemo(() => {
    const filtered = localParticipants.filter(p => {
      // 1. Tab filter
      if (activeFilter === 'approved') {
        if (!isApprovedParticipant(p)) return false;
      } else if (activeFilter === 'member') {
        if (!isApprovedStudent(p)) return false;
      } else if (activeFilter === 'supervisor') {
        if (!isSupervisorPerson(p)) return false;
      } else if (activeFilter === 'speaker') {
        if (!isSpeakerPerson(p)) return false;
      } else if (activeFilter === 'guest') {
        if (!isGuestPerson(p)) return false;
      } else if (activeFilter === 'short_time') {
        if (!isStudentMemberPerson(p) || (p.durationMinutes >= localThreshold || p.manualApproved)) return false;
      } else if (activeFilter === 'unmatched') {
        if (!isStudentMemberPerson(p) || p.member || p.nrIndeksu || p.index || isMonikaLyniewska(p.rawName)) return false;
      }

      // 2. Query search
      if (!searchQuery.trim()) return true;
      const q = normalizeDiacritics(searchQuery);
      const raw = normalizeDiacritics(p.rawName);
      const memberName = p.member ? normalizeDiacritics(p.member.fullName || `${p.member.firstName} ${p.member.lastName}`) : '';
      const index = (p.member?.index || p.nrIndeksu || p.index) ? String(p.member?.index || p.nrIndeksu || p.index).toLowerCase() : '';
      const email = p.member?.email ? normalizeDiacritics(p.member.email) : '';

      return raw.includes(q) || memberName.includes(q) || index.includes(q) || email.includes(q);
    });

    // Alphabetical sort by Polish collation
    return [...filtered].sort((a, b) => {
      const nameA = (a.member ? (a.member.fullName || `${a.member.firstName} ${a.member.lastName}`) : (a.rawName || '')).trim();
      const nameB = (b.member ? (b.member.fullName || `${b.member.firstName} ${b.member.lastName}`) : (b.rawName || '')).trim();
      return nameA.localeCompare(nameB, 'pl', { sensitivity: 'base' });
    });
  }, [localParticipants, activeFilter, searchQuery, localThreshold, supervisors]);

  // Statistics (Aggregated by status "Zaliczono")
  const countApprovedTotal = (localParticipants || []).filter(isApprovedParticipant).length;
  const countApprovedMembers = (localParticipants || []).filter(isApprovedStudent).length;
  const countMembers = (localParticipants || []).filter(
    p => isStudentMemberPerson(p) || p.role === 'member' || p.rola === 'Członek koła' || p.isMember
  ).length;
  const countSupervisors = (localParticipants || []).filter(
    p => isSupervisorPerson(p) || p.role === 'supervisor' || p.rola === 'Opiekun Koła' || p.isSupervisor
  ).length;
  const countSpeakers = (localParticipants || []).filter(
    p => isSpeakerPerson(p) || p.role === 'speaker' || p.rola === 'Prelegent' || p.isSpeaker
  ).length;
  const countGuests = (localParticipants || []).filter(
    p => isGuestPerson(p) || p.role === 'guest' || p.rola === 'Gość' || p.isGuest
  ).length;
  const countShortTime = (localParticipants || []).filter(
    p => isStudentMemberPerson(p) && p.durationMinutes < localThreshold && !p.manualApproved
  ).length;
  const countUnmatched = (localParticipants || []).filter(
    p => isStudentMemberPerson(p) && !p.member && !p.nrIndeksu && !p.index && !isMonikaLyniewska(p.rawName)
  ).length;
  const totalCount = (localParticipants || []).length;

  // Save changes
  const handleSaveAndApply = async () => {
    setIsSaving(true);
    try {
      const startDate = meeting.startDate || meeting.date;
      const endDate = meeting.endDate;
      const totalEventDays = calculateEventDays(startDate, endDate);

      const meetingTypeStr = String(meeting.type || meeting.meetingType || meeting.customType || '').toLowerCase();
      const isConferenceOrDelegation = meetingTypeStr.includes('conference') || meetingTypeStr.includes('konf') || meetingTypeStr.includes('delegac') || totalEventDays > 1;

      const meetingModeStr = String(meeting.eventMode || meeting.mode || meeting.forma || '').toLowerCase();
      const isConferenceOnline = meetingModeStr.includes('online');

      const allVerifiedList = localParticipants
        .filter(isApprovedParticipant)
        .map(p => {
          const nrIndeksu = String(p.member?.index || p.nrIndeksu || p.index || (isMonikaLyniewska(p.rawName) ? '34327' : (p.rawName.match(/\d{4,6}/)?.[0] || ''))).trim();
          const name = String(p.member?.fullName || p.fullName || p.rawName || '').trim();
          const isSup = p.role === 'supervisor' || isFacultySupervisor(p.rawName);
          const isSpk = p.role === 'speaker';
          const isGst = p.role === 'guest' || p.isGuest || p.isExternalGuest || (!nrIndeksu && p.role !== 'member');
          const rola = String(isSup ? 'Opiekun' : (isSpk ? 'Prelegent' : (isGst ? 'Gość' : 'Członek koła'))).trim();

          const attendeeDays = typeof p.daysAttended === 'number' && p.daysAttended > 0 ? Math.min(totalEventDays, p.daysAttended) : totalEventDays;
          const extraActs = Array.isArray(p.activities) ? p.activities : [];

          // Zastosuj dokładnie tę samą funkcję breakdownu, którą użytkownik widzi w tabeli
          const breakdown = calculateEventPointsBreakdown(meeting, weights, {
            ...p,
            daysAttended: attendeeDays,
            activities: extraActs,
          });

          // Punkty naliczane są tylko zweryfikowanym członkom koła
          const finalPointsForMeeting = (!isSup && !isSpk && !isGst) ? breakdown.totalPoints : 0;

          const activityDesc = extraActs.length > 0
            ? `Obecność + aktywności (${extraActs.join(', ')})`
            : (isConferenceOrDelegation ? `Udział w konferencji/delegacji (${attendeeDays} dni)` : (breakdown.isParticipantOnline ? 'Obecność na spotkaniu online' : 'Obecność na spotkaniu stacjonarnym'));

          return {
            nrIndeksu,
            name,
            rola,
            punkty: finalPointsForMeeting,
            trybUdzialu: breakdown.isParticipantOnline ? 'ONLINE' : 'STACJONARNY',
            opisAktywnosci: activityDesc,
          };
        })
        .filter(item => item.nrIndeksu || item.name);

      const confirmedIndexes = allVerifiedList.map(m => m.nrIndeksu || m.name).filter(Boolean);

      // Zapis bezpośrednio do tabeli attendance w Supabase (bez Google Sheets)
      try {
        await saveMeetingAttendanceToSupabase({
          kodSpotkania: meeting.code || "M00",
          dataSpotkania: meeting.date || new Date().toISOString().slice(0, 10),
          obecnosci: allVerifiedList,
          aliasy: aliasesMap,
          orgId: currentOrg?.id || 'skn_seksuologii'
        });
      } catch (e) {
        console.warn("Błąd zapisu obecności w Supabase:", e);
      }

      // Wzbogać obiekty uczestników o obliczone punkty za to spotkanie (w tym dodatkowe aktywności)
      const enrichedParticipants = localParticipants.map(p => {
        const attendeeDays = typeof p.daysAttended === 'number' && p.daysAttended > 0 ? Math.min(totalEventDays, p.daysAttended) : totalEventDays;
        const extraActs = Array.isArray(p.activities) ? p.activities : [];
        const breakdown = calculateEventPointsBreakdown(meeting, weights, {
          ...p,
          daysAttended: attendeeDays,
          activities: extraActs,
        });
        const isSup = isSupervisorPerson(p);
        const isSpk = p.role === 'speaker';
        const isGst = p.role === 'guest' || p.isGuest || p.isExternalGuest || (!p.nrIndeksu && p.role !== 'member');
        const finalPts = (!isSup && !isSpk && !isGst && isApprovedParticipant(p)) ? breakdown.totalPoints : 0;
        return {
          ...p,
          punkty: finalPts,
          trybUdzialu: breakdown.isParticipantOnline ? 'ONLINE' : 'STACJONARNY',
        };
      });

      const payload = {
        meetingId: meeting.id || meeting.date,
        meetingDate: meeting.date,
        meetingCode: meeting.code,
        attendees: enrichedParticipants,
        allVerifiedList: allVerifiedList,
        obecnosci: allVerifiedList,
        participantRecords: enrichedParticipants,
        confirmedIndexes: confirmedIndexes,
        confirmedCount: countApprovedTotal,
        supervisors: supervisorsPresent.map(s => s.rawName),
        aliasy: aliasesMap,
        savedAt: new Date().toISOString(),
      };

      const cleanMeetingCode = String(meeting.code || '').replace(/^\[.*?\]\s*/, '').trim();
      const keys = [
        getStorageKey(`crm_attendance_${meeting.id || meeting.date}`),
        meeting.id ? getStorageKey(`crm_attendance_${meeting.id}`) : null,
        meeting.date ? getStorageKey(`crm_attendance_${meeting.date}`) : null,
        meeting.code ? getStorageKey(`crm_attendance_${meeting.code}`) : null,
        cleanMeetingCode ? getStorageKey(`crm_attendance_${cleanMeetingCode}`) : null,
        `crm_attendance_${meeting.id || meeting.date}`,
        meeting.id ? `crm_attendance_${meeting.id}` : null,
        meeting.date ? `crm_attendance_${meeting.date}` : null,
        meeting.code ? `crm_attendance_${meeting.code}` : null,
        cleanMeetingCode ? `crm_attendance_${cleanMeetingCode}` : null,
      ].filter(Boolean);

      keys.forEach(k => {
        try {
          localStorage.setItem(k, JSON.stringify(payload));
        } catch {}
      });

      if (onSaveAttendance) {
        await onSaveAttendance(meeting.id || meeting.date, confirmedIndexes, enrichedParticipants, payload);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !meeting) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-[96vw] max-w-7xl h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 relative">
        
        {/* ── Modal Header ─────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-white flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Stable sized Badge */}
            <div className="h-12 px-3.5 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md shrink-0 font-mono tracking-tight text-center">
              {String(meeting?.code || 'SPOTKANIE')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 leading-snug truncate">
                  {String(meeting?.title || '')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                  Weryfikacja obecności
                </span>
                {supervisorsPresent.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 shadow-2xs shrink-0">
                    <GraduationCap size={13} className="text-indigo-600" />
                    <span>Opiekunowie: <strong>{supervisorsPresent.map(s => String(s?.rawName || s?.name || '')).filter(Boolean).join(', ')}</strong></span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 font-mono truncate">
                <Calendar size={12} className="text-slate-400 shrink-0" />
                <span>{String(meeting?.formattedDate || meeting?.date || '')}</span>
                {meeting?.who && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="font-sans text-slate-600 flex items-center gap-1 truncate">
                      <User size={11} className="shrink-0" /> {String(meeting.who)}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-2.5 self-end md:self-auto flex-wrap shrink-0">
            {/* 📋 Wklej z Meet button */}
            <button
              type="button"
              onClick={() => {
                setIsPasteDrawerOpen(prev => !prev);
                if (isAddFormOpen) setIsAddFormOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              title="Wklej lub edytuj surową listę obecności z Google Meet"
            >
              <ClipboardList size={15} strokeWidth={2.2} />
              <span>Wklej z Meet</span>
            </button>

            {/* Dodaj osobę ręcznie button */}
            <button
              type="button"
              onClick={() => {
                setIsAddFormOpen(prev => !prev);
                if (isPasteDrawerOpen) setIsPasteDrawerOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              title="Ręcznie dopisz osobę do listy"
            >
              <UserPlus size={15} strokeWidth={2.2} />
              <span>Dodaj osobę</span>
            </button>

            {/* Threshold Selector: 10m, 15m, 20m, 30m, 45m, 60m */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-indigo-100 shadow-2xs">
              <Timer size={13} className="text-indigo-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-600">Próg:</span>
              <div className="flex items-center gap-1">
                {[10, 15, 20, 30, 45, 60].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleLocalThresholdChange(m)}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      localThreshold === m
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Paste Raw Meet Text Drawer ─────────────────────────────────── */}
        {isPasteDrawerOpen && (
          <div className="p-4 bg-indigo-50/95 border-b border-indigo-200 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                <ClipboardList size={16} className="text-indigo-700 shrink-0" />
                <span>Wklej lub edytuj surową listę obecności z Google Meet (CSV / TSV / Tekst):</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
              >
                ✕ Zamknij pole
              </button>
            </div>

            <textarea
              value={pasteRawText}
              onChange={e => setPasteRawText(e.target.value)}
              rows={5}
              placeholder="Wklej logi z Google Meet (np. 'Imię Nazwisko', '18:00', '45 min' lub format CSV)..."
              className="w-full text-xs font-mono border border-indigo-200 rounded-xl p-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y shadow-inner"
            />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500 font-medium">
                Wykryto linii: {pasteRawText.split(/\r?\n/).filter(l => l.trim()).length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPasteRawText('')}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
                >
                  Wyczyść
                </button>
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  disabled={!pasteRawText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                >
                  <Play size={13} className="fill-current" />
                  <span>Przetwórz i zastosuj listę</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Participant Modal Drawer ─────────────────────────────────── */}
        {isAddFormOpen && (
          <div className="p-4 bg-purple-50/95 border-b border-purple-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center gap-2 text-purple-950 font-bold text-xs">
              <UserPlus size={16} className="text-purple-700 shrink-0" />
              <span>Dopisz uczestnika do listy:</span>
            </div>

            <form onSubmit={handleAddParticipantSubmit} className="flex items-center gap-2.5 flex-wrap flex-1 md:justify-end">
              <AddParticipantInput
                members={members}
                value={addRawInput}
                onChange={handleAddInputChange}
                onSelectMember={handleSelectMemberForAdd}
                selectedMember={addSelectedMember}
                placeholder="Wpisz imię, nazwisko lub wklej wpis z Meet..."
                className="flex-1 max-w-sm"
              />

              {addSelectedMember ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-1.5 rounded-xl border border-emerald-300 shadow-2xs">
                  <UserCheck size={12} className="text-emerald-700" />
                  <span>W bazie SKN ({addSelectedMember.index})</span>
                </span>
              ) : addRawInput.trim() ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 bg-purple-100/90 px-2.5 py-1.5 rounded-xl border border-purple-300 shadow-2xs">
                  <User size={12} className="text-purple-700" />
                  <span>Gość zewnętrzny</span>
                </span>
              ) : null}

              <div className="flex items-center gap-1 bg-white border border-purple-300 rounded-xl px-3 py-1.5 text-xs shadow-2xs">
                <Clock size={13} className="text-purple-600" />
                <input
                  id="add-participant-duration"
                  name="addParticipantDuration"
                  aria-label="Czas obecności w minutach"
                  type="number"
                  min="1"
                  max="300"
                  value={addDuration}
                  onChange={e => setAddDuration(e.target.value)}
                  onKeyDown={e => e.stopPropagation()}
                  placeholder="Minuty"
                  className="w-12 text-center font-bold text-slate-800 outline-none"
                />
                <span className="text-[11px] text-slate-400 font-semibold">min</span>
              </div>

              <select
                id="add-participant-role-select"
                name="addParticipantRole"
                aria-label="Rola uczestnika na spotkaniu"
                value={addRole}
                onChange={e => setAddRole(e.target.value)}
                className="text-xs font-bold border border-purple-300 rounded-xl px-2.5 py-1.5 bg-white text-purple-900 shadow-2xs cursor-pointer"
              >
                <option value="guest">👤 Gość</option>
                <option value="member">🟢 Członek koła</option>
                <option value="supervisor">🎓 Opiekun Koła</option>
                <option value="speaker">🎤 Prelegent</option>
              </select>

              <button
                type="submit"
                disabled={!addRawInput.trim()}
                className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
              >
                Dopisz
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen(false);
                  setAddRawInput('');
                  setAddSelectedMember(null);
                  setAddRole('guest');
                }}
                className="px-3.5 py-2 rounded-xl bg-white border border-purple-200 text-slate-600 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
              >
                Anuluj
              </button>
            </form>
          </div>
        )}

        {/* ── KPI Summary Cards Bar ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 p-3 sm:p-4 bg-slate-50/60 border-b border-slate-100 shrink-0">
          {/* 1. Approved Attendance (All with status Zaliczono) */}
          <div
            onClick={() => setActiveFilter('approved')}
            className={`p-3 rounded-2xl border shadow-2xs flex items-center gap-3 cursor-pointer transition ${
              activeFilter === 'approved' ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-200' : 'bg-white border-emerald-100 hover:bg-emerald-50/30'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 leading-none">{countApprovedTotal}</p>
              <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">Zaliczonych obecności</p>
            </div>
          </div>

          {/* 2. Supervisors */}
          <div
            onClick={() => setActiveFilter('supervisor')}
            className={`p-3 rounded-2xl border shadow-2xs flex items-center gap-3 cursor-pointer transition ${
              activeFilter === 'supervisor' ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white border-indigo-100 hover:bg-indigo-50/30'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 leading-none">{countSupervisors}</p>
              <p className="text-[11px] font-semibold text-indigo-700 mt-0.5">Opiekunów koła</p>
            </div>
          </div>

          {/* 3. Student Members */}
          <div
            onClick={() => setActiveFilter('member')}
            className={`p-3 rounded-2xl border shadow-2xs flex items-center gap-3 cursor-pointer transition ${
              activeFilter === 'member' ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white border-indigo-100 hover:bg-indigo-50/30'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <UserCheck size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 leading-none">{countMembers}</p>
              <p className="text-[11px] font-semibold text-indigo-700 mt-0.5">Członków koła</p>
            </div>
          </div>

          {/* 4. Short Time */}
          <div
            onClick={() => setActiveFilter('short_time')}
            className={`p-3 rounded-2xl border shadow-2xs flex items-center gap-3 cursor-pointer transition ${
              activeFilter === 'short_time' ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-200' : 'bg-white border-rose-100 hover:bg-rose-50/30'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 leading-none">{countShortTime}</p>
              <p className="text-[11px] font-semibold text-rose-700 mt-0.5">Czas &lt; {localThreshold}m</p>
            </div>
          </div>

          {/* 5. Total Logged */}
          <div
            onClick={() => setActiveFilter('all')}
            className={`col-span-2 sm:col-span-1 p-3 rounded-2xl border shadow-2xs flex items-center gap-3 cursor-pointer transition ${
              activeFilter === 'all' ? 'bg-purple-50/80 border-purple-300 ring-2 ring-purple-200' : 'bg-white border-purple-100 hover:bg-purple-50/30'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 leading-none">{totalCount}</p>
              <p className="text-[11px] font-semibold text-purple-700 mt-0.5">Wszystkich w logach</p>
            </div>
          </div>
        </div>

        {/* ── Search & Filter Tabs Bar ─────────────────────────────────────── */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="modal-search-participants"
              name="modalSearchParticipants"
              aria-label="Filtruj listę uczestników spotkania po nazwisku lub indeksie"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              placeholder="Filtruj po nazwisku, indeksie lub tekście z Meet..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Filter Pills */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Wszyscy ({totalCount})
            </button>

            <button
              onClick={() => setActiveFilter('approved')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeFilter === 'approved' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <VectorRingIndicator color="emerald" size={11} />
              <span>Zaliczono ({countApprovedTotal})</span>
            </button>

            <button
              onClick={() => setActiveFilter('supervisor')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeFilter === 'supervisor' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap size={13} strokeWidth={2.2} className="text-indigo-600 shrink-0" />
              <span>Opiekunowie ({countSupervisors})</span>
            </button>

            {countSpeakers > 0 && (
              <button
                onClick={() => setActiveFilter('speaker')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  activeFilter === 'speaker' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mic size={13} strokeWidth={2.2} className="text-amber-600 shrink-0" />
                <span>Prelegenci ({countSpeakers})</span>
              </button>
            )}

            {countGuests > 0 && (
              <button
                onClick={() => setActiveFilter('guest')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  activeFilter === 'guest' ? 'bg-white text-purple-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User size={13} strokeWidth={2.2} className="text-purple-600 shrink-0" />
                <span>Goście ({countGuests})</span>
              </button>
            )}

            {countShortTime > 0 && (
              <button
                onClick={() => setActiveFilter('short_time')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  activeFilter === 'short_time' ? 'bg-white text-rose-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <AlertTriangle size={13} strokeWidth={2.2} className="text-rose-500 shrink-0" />
                <span>Krótki czas ({countShortTime})</span>
              </button>
            )}

            {countUnmatched > 0 && (
              <button
                onClick={() => setActiveFilter('unmatched')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  activeFilter === 'unmatched' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HelpCircle size={13} strokeWidth={2.2} className="text-amber-500 shrink-0" />
                <span>Do dopasowania ({countUnmatched})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable Participants Table Area ───────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-200 p-3 sm:p-4 md:p-6 pb-24 sm:pb-32">
          {sortedAndFilteredParticipants.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
              <Users size={40} className="text-slate-300 mb-2" />
              <p className="text-sm font-semibold">Brak osób spełniających wybrane kryteria</p>
              <p className="text-xs text-slate-400 mt-1">Zmień filtr lub wpisaną frazę w wyszukiwarce</p>
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabela obecności i logów spotkania"
              className="table-wrapper border border-slate-200 rounded-2xl overflow-x-auto block w-full max-w-full shadow-2xs bg-white touch-auto focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
            >
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs text-slate-600 font-semibold border-b border-slate-200 z-20">
                  <tr>
                    <th className="p-3 w-10 text-center">LP.</th>
                    <th className="p-3 min-w-[150px] sm:min-w-[170px]">Wpis z Meet / Uczestnik</th>
                    <th className="p-3 w-32">Rola na Spotkaniu</th>
                    <th className="p-3 min-w-[160px] sm:min-w-[190px]">Powiązany Profil z bazy SKN</th>
                    <th className="p-3 text-center w-20">Wejście</th>
                    <th className="p-3 text-center w-24">Czas</th>
                    <th className="p-3 text-center w-24">Status</th>
                    <th className="p-3 w-48 text-center">Dodatkowe Aktywności</th>
                    <th className="p-3 text-center w-20">Punkty</th>
                    <th className="p-3 text-right w-36">Akcja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAndFilteredParticipants.map((p, idx) => {
                    const isSupervisorRole = isSupervisorPerson(p);
                    const isSpeakerRole = isSpeakerPerson(p);
                    const isGuestRole = isGuestPerson(p);
                    const isMemberRole = isStudentMemberPerson(p);

                    const openUpwards = idx >= Math.max(1, sortedAndFilteredParticipants.length - 3) || (sortedAndFilteredParticipants.length > 3 && idx >= sortedAndFilteredParticipants.length / 2);

                    const isApproved = p.manualApproved !== undefined ? p.manualApproved : (p.isEligible || p.status === 'approved' || p.status === 'Zaliczona');
                    const isShortTime = isMemberRole && p.durationMinutes < localThreshold;
                    const isUnmatched = isMemberRole && !p.member && !isMonikaLyniewska(p.rawName);

                    const startDate = meeting.startDate || meeting.date;
                    const endDate = meeting.endDate;
                    const totalEventDays = calculateEventDays(startDate, endDate);

                    const meetingTypeStr = String(meeting.type || meeting.meetingType || meeting.customType || '').toLowerCase();
                    const isConferenceOrDelegation = meetingTypeStr.includes('conference') || meetingTypeStr.includes('konf') || meetingTypeStr.includes('delegac') || totalEventDays > 1;

                    const meetingModeStr = String(meeting.eventMode || meeting.mode || meeting.forma || '').toLowerCase();
                    const isConferenceOnline = meetingModeStr.includes('online');

                    const isStationaryMeeting = meeting.location && (
                      meeting.location.toLowerCase().includes('stacjon') ||
                      meeting.location.toLowerCase().includes('sala') ||
                      meeting.location.toLowerCase().includes('warszaw') ||
                      meeting.location.toLowerCase().includes('kampus')
                    );

                    const extraActs = Array.isArray(p.activities) ? p.activities : [];
                    const attendeeDays = typeof p.daysAttended === 'number' && p.daysAttended > 0 ? Math.min(totalEventDays, p.daysAttended) : totalEventDays;

                    const breakdown = calculateEventPointsBreakdown(meeting, weights, {
                      ...p,
                      daysAttended: attendeeDays,
                      activities: extraActs,
                    });
                    const pointsForMeeting = (isMemberRole && isApproved) ? breakdown.totalPoints : 0;

                    return (
                      <tr
                        key={p.id || `row-${idx}`}
                        className={`transition-colors ${
                          isSupervisorRole
                            ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                            : isSpeakerRole
                            ? 'bg-amber-50/30 hover:bg-amber-50/60'
                            : isGuestRole
                            ? 'bg-purple-50/30 hover:bg-purple-50/60'
                            : isUnmatched
                            ? 'bg-amber-50/50 hover:bg-amber-50/80'
                            : isApproved
                            ? 'bg-white hover:bg-slate-50/70'
                            : 'bg-rose-50/30 hover:bg-rose-50/60'
                        }`}
                      >
                        {/* 1. LP */}
                        <td className="p-3 text-center font-mono text-slate-400 text-[11px]">
                          {idx + 1}
                        </td>

                        {/* 2. Raw Name from List */}
                        <td className="p-3">
                          <p className="font-semibold text-slate-900 leading-tight">
                            {String(p.rawName || p.name || '')}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {isSupervisorRole
                              ? 'Oficjalny Opiekun Koła'
                              : isSpeakerRole
                              ? 'Prelegent spotkania'
                              : isGuestRole
                              ? 'Gość zewnętrzny'
                              : 'Wpis ze spotkania'}
                          </p>
                        </td>

                        {/* 3. Role Selector */}
                        <td className="p-3">
                          <select
                            value={String(p.role || 'member')}
                            onChange={e => handleSetParticipantRole(p.id, e.target.value)}
                            className="w-full text-[11px] font-bold border border-slate-200 rounded-xl px-2 py-1 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-300 cursor-pointer shadow-2xs"
                          >
                            <option value="member">Członek koła</option>
                            <option value="supervisor">Opiekun Koła</option>
                            <option value="speaker">Prelegent</option>
                            <option value="guest">Gość</option>
                          </select>
                        </td>

                        {/* 4. Matched Member / Matcher */}
                        <td className="p-3">
                          {isSupervisorRole ? (
                            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 p-2 rounded-xl text-indigo-900 shadow-2xs">
                              <GraduationCap size={16} className="text-indigo-600 shrink-0" />
                              <div>
                                <p className="font-bold text-xs leading-tight">{String(p.rawName || '')}</p>
                                <p className="text-[10px] text-indigo-600 font-medium">Opiekun Koła Naukowego</p>
                              </div>
                            </div>
                          ) : isSpeakerRole ? (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-2 rounded-xl text-amber-900 shadow-2xs">
                              <Mic size={16} className="text-amber-600 shrink-0" />
                              <div>
                                <p className="font-bold text-xs leading-tight">{String(p.rawName || '')}</p>
                                <p className="text-[10px] text-amber-700 font-medium">Prelegent / Wykładowca</p>
                              </div>
                            </div>
                          ) : linkingParticipantId === p.id ? (
                            renderLinkingPanel(p)
                          ) : p.member ? (
                            (isFormerMemberRecord(p.member) || p.isCustomHistorical) ? (
                              <div className="flex items-center justify-between gap-2 bg-slate-100/90 border border-slate-300 p-2 rounded-xl text-slate-800 shadow-2xs">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-slate-900 truncate leading-tight">
                                      {String(p.member.fullName || `${p.member.firstName || ''} ${p.member.lastName || ''}`).trim()}
                                    </p>
                                    <span className="text-[10px] bg-slate-200 border border-slate-300 text-slate-700 px-1.5 py-0.2 rounded-md font-semibold">
                                      {p.isCustomHistorical ? 'Wpis historyczny' : 'Były członek (Archiwum)'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                    <span>Nr: <strong>{String(p.member.index || p.nrIndeksu || '')}</strong></span>
                                    {p.member.field && <span>• {String(p.member.field)}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleOpenLinkModal(p.id, p.member.fullName || p.rawName);
                                      setLinkTab('manual');
                                      setManualIndexInput(String(p.member.index || p.nrIndeksu || ''));
                                      setManualNameInput(String(p.member.fullName || p.rawName || ''));
                                    }}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold px-1.5 py-0.5 rounded hover:bg-white transition cursor-pointer"
                                    title="Edytuj wpis"
                                  >
                                    Edytuj
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkMember(p.id)}
                                    className="text-[10px] text-slate-400 hover:text-rose-600 font-bold px-1.5 py-0.5 rounded hover:bg-white transition cursor-pointer"
                                    title="Odłącz powiązanie z tym studentem"
                                  >
                                    Rozłącz
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2 bg-emerald-50/70 border border-emerald-200 p-2 rounded-xl shadow-2xs">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 truncate leading-tight">
                                    {String(p.member.fullName || `${p.member.firstName || ''} ${p.member.lastName || ''}`).trim()}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                    <span>Nr: <strong>{String(p.member.index || p.nrIndeksu || '')}</strong></span>
                                    {p.member.field && <span>• {String(p.member.field)}</span>}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkMember(p.id)}
                                  className="text-[10px] text-slate-400 hover:text-rose-600 font-bold px-1.5 py-0.5 rounded hover:bg-white transition cursor-pointer"
                                  title="Odłącz powiązanie z tym studentem"
                                >
                                  Rozłącz
                                </button>
                              </div>
                            )
                          ) : isGuestRole ? (
                            <div className="flex items-center justify-between gap-2 bg-purple-50 border border-purple-200 p-2 rounded-xl text-purple-900 shadow-2xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <User size={16} className="text-purple-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-bold text-xs leading-tight truncate">Gość zewnętrzny (brak w bazie SKN)</p>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLinkModal(p.id, p.rawName)}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer mt-0.5 block text-left"
                                  >
                                    🔗 Połącz z członkiem
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1">
                                <MemberAutocomplete
                                  members={activeMembersOnly}
                                  value={selectedAssignee[p.id] || ''}
                                  onChange={val => {
                                    if (val) handleAssignMember(p.id, val);
                                  }}
                                  placeholder="Wybierz studenta z bazy..."
                                  className="w-full"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenLinkModal(p.id, p.rawName)}
                                className="text-[10px] whitespace-nowrap font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1.5 rounded-xl cursor-pointer transition shadow-2xs"
                                title="Wprowadź numer indeksu ręcznie (Wpis historyczny)"
                              >
                                + Indeks
                              </button>
                            </div>
                          )}
                        </td>

                        {/* 5. Join Time */}
                        <td className="p-3 text-center font-mono text-[11px] text-slate-600">
                          {String(p.joinTime || '—')}
                        </td>

                        {/* 6. Duration / Dni obecności */}
                        <td className="p-3 text-center">
                          {totalEventDays > 1 ? (
                            <div className="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 px-2 py-1 rounded-xl shadow-2xs">
                              <Clock size={12} className="text-purple-600 shrink-0" />
                              <select
                                id={`participant-days-select-${p.id}`}
                                name={`participantDaysSelect_${p.id}`}
                                aria-label="Liczba dni obecności"
                                value={p.daysAttended || totalEventDays}
                                onChange={(e) => handleSetParticipantDays(p.id, Number(e.target.value))}
                                className="text-xs font-bold text-purple-900 bg-transparent outline-none cursor-pointer"
                              >
                                {Array.from({ length: totalEventDays }, (_, i) => i + 1).map((d) => (
                                  <option key={d} value={d}>
                                    {d} {d === 1 ? 'dzień' : 'dni'}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold font-mono border ${
                              isShortTime
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            }`}>
                              <Clock size={11} />
                              <span>{String(p.durationStr || `${p.durationMinutes || 0} min`)}</span>
                            </span>
                          )}
                        </td>

                        {/* 7. Status Badge */}
                        <td className="p-3 text-center">
                          {isSupervisorRole ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              <GraduationCap size={12} strokeWidth={2.2} />
                              <span>Opiekun</span>
                            </span>
                          ) : isSpeakerRole ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <Mic size={12} strokeWidth={2.2} />
                              <span>Prelegent</span>
                            </span>
                          ) : isGuestRole ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              <User size={12} strokeWidth={2.2} />
                              <span>Gość</span>
                            </span>
                          ) : isUnmatched ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <HelpCircle size={11} /> Brak w bazie
                            </span>
                          ) : isApproved ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={11} /> Zaliczona (+{Number(pointsForMeeting) || 1} pkt{totalEventDays > 1 ? `, ${attendeeDays} dni` : ''})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle size={11} /> Za krótko
                            </span>
                          )}
                        </td>

                        {/* 8. DODATKOWE AKTYWNOŚCI (Multi-select Checkbox Popover) */}
                        <td className="p-3 relative text-center">
                          {isSupervisorRole || isGuestRole ? (
                            <span className="text-[11px] text-slate-300 italic">—</span>
                          ) : (
                            <div className="relative inline-block w-full">
                              <button
                                type="button"
                                onClick={(e) => handleTogglePopover(e, p.id)}
                                className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-semibold border flex items-center justify-between gap-1 transition shadow-2xs cursor-pointer ${
                                  extraActs.length > 0
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-300 font-bold'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <Tag size={12} strokeWidth={2.2} className="text-indigo-600 shrink-0" />
                                  <span>
                                    {extraActs.length > 0
                                      ? `${String(extraActs.length)} wybrane`
                                      : 'Wybierz aktywność'}
                                  </span>
                                </span>
                                <ChevronDown size={12} className={`shrink-0 transition-transform ${openActivityPopoverId === p.id ? 'rotate-180 text-indigo-600' : 'text-slate-400'}`} />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* 9. Punkty za spotkanie */}
                        <td className="p-3 text-center">
                          {isSupervisorRole || isGuestRole ? (
                            <span className="text-[11px] text-slate-300 italic">—</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center min-w-[120px]">
                              <span
                                className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-xl text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs"
                                title={breakdown.displayText}
                              >
                                +{Number(pointsForMeeting) || 0} pkt
                              </span>
                              {isApproved && pointsForMeeting > 0 && (
                                <span className="text-[10px] text-slate-500 font-normal mt-0.5 whitespace-nowrap">
                                  ({breakdown.displayText.replace(/^\+\d+\s*pkt\s*\((.*)\)$/, '$1')})
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 10. Action Toggle & Delete */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isSupervisorRole || isSpeakerRole ? (
                              <span className="text-[11px] text-slate-400 font-medium mr-1">Protokół</span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSetApproval(p.id, true)}
                                  className={`px-2 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                    isApproved
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                  title="Zalicz obecność"
                                >
                                  <Check size={11} />
                                  <span>Zalicz</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSetApproval(p.id, false)}
                                  className={`px-2 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                    !isApproved
                                      ? 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                                  }`}
                                  title="Odrzuć obecność"
                                >
                                  <X size={11} />
                                  <span>Odrzuć</span>
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveParticipant(p.id)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer ml-1"
                              title="Usuń ze spotkania"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Modal Footer Bar ─────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Podsumowanie do zapisu: <strong className="text-emerald-700 font-bold">{countApprovedTotal}</strong> zaliczonych obecności (w tym {countApprovedMembers} członków koła, {countSupervisors} opiekunów).
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer min-h-[38px] sm:min-h-0 text-center"
            >
              Anuluj
            </button>

            <button
              type="button"
              onClick={handleSaveAndApply}
              disabled={isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-md cursor-pointer min-h-[38px] sm:min-h-0"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? (
                <span>Zapisywanie w Supabase...</span>
              ) : (
                <>
                  <span className="sm:hidden">Zapisz ({countApprovedTotal})</span>
                  <span className="hidden sm:inline">{`Zapisz i przelicz frekwencję koła (${countApprovedTotal})`}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Floating Activity Popover via Portal */}
      {openActivityPopoverId && popoverPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => {
              e.stopPropagation();
              setOpenActivityPopoverId(null);
              setPopoverPos(null);
            }}
          />
          <div
            ref={popoverRef}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onScroll={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: `${popoverPos.left}px`,
              ...(popoverPos.openUpwards ? { bottom: `${popoverPos.bottom}px` } : { top: `${popoverPos.top}px` }),
              width: `${popoverSize.width || 360}px`,
              height: `${popoverSize.height || 320}px`,
              resize: 'both',
              overflow: 'auto',
              minWidth: '320px',
              minHeight: '220px',
              maxWidth: '90vw',
              maxHeight: '70vh',
            }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-[9999] animate-in fade-in zoom-in-95 duration-100 flex flex-col space-y-1.5 text-left"
          >
            <div className="px-1 py-1 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-700 shrink-0">
              <span className="flex items-center gap-1.5">
                <Tag size={13} strokeWidth={2.2} className="text-indigo-600 shrink-0" />
                <span>Aktywności na spotkaniu:</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActivityPopoverId(null);
                  setPopoverPos(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-0.5 cursor-pointer rounded hover:bg-slate-100 transition"
                title="Zamknij"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 py-1 pr-1 custom-scrollbar">
              {ACTIVITY_OPTIONS.map((opt, optIdx) => {
                const currentParticipant = sortedAndFilteredParticipants.find(p => p?.id === openActivityPopoverId);
                const extraActs = Array.isArray(currentParticipant?.activities) ? currentParticipant.activities : [];
                const isChecked = extraActs.includes(opt.id);
                const pts = weights?.[opt.id]?.points ?? opt.points;
                const optLabel = weights?.[opt.id]?.label || opt.label;
                return (
                  <label
                    key={`${opt.id}-${optIdx}`}
                    htmlFor={`participant-${openActivityPopoverId}-activity-${opt.id}`}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition gap-2 ${
                      isChecked
                        ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/80 shadow-2xs'
                        : 'hover:bg-slate-50 text-slate-700 font-medium border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        id={`participant-${openActivityPopoverId}-activity-${opt.id}`}
                        name={`activity_${opt.id}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleActivity(openActivityPopoverId, opt.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-400 shrink-0 cursor-pointer"
                      />
                      <ActivityWeightIcon code={opt.id} size={15} />
                      <span className="whitespace-normal leading-tight text-xs">{String(optLabel || '')}</span>
                    </div>
                    <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold text-indigo-600 shrink-0 shadow-2xs ml-1">
                      +{Number(pts) || 0} pkt
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
