import { useState, useEffect, useMemo, useCallback, useDeferredValue, startTransition } from 'react';
import {
  Search,
  Users,
  BarChart2,
  FileCheck2,
  Mail,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  RotateCcw,
  UserX,
  UserCheck,
  MoreVertical,
  AlertCircle,
  X,
  Pencil,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  Check,
  CheckCircle2,
  Sparkles,
  FileText,
  Award,
  ClipboardList,
  GraduationCap,
  Archive,
  Zap,
  Clock,
} from 'lucide-react';
import { VectorRingIndicator } from './VectorIcons';
import { calcFrequency, getFrequencyBadge, getCertificateStatus, getRecordKey } from '../utils/helpers';
import { calculateCurrentStudyYear } from '../utils/academicYear';
import { getMeetingType, calculateCategorizedFrequency, calculateMemberStats, isMeetingEligibleForDenominator, MEETING_TYPES, hasMeetingAttendanceLogs, getMeetingStatusInfo } from '../utils/meetingTypes';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useOrg } from '../context/OrgContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import { calculateMemberAttendance } from '../utils/attendanceCalculator';
import { buildAttendanceIndex, precompileMeetings } from '../utils/attendanceIndexer';
import { isEwidencjaInAcademicScope, getTenureMonthsInScope } from '../utils/academicScope';
import { getOfficialMemberRecord, getMemberStats, activityRegistry } from '../utils/activityRegistry';
import { getBlacklistedMembers, addMemberToBlacklist, isMemberBlacklisted } from '../utils/storage';
import { isMemberActive, isMemberGuest, isMemberInactive, isMemberArchived, isMemberPending, isMemberDeleted, hasMailingConsent, isMemberFinalSemester, isMemberGraduate } from '../utils/memberFilters';
import EditMemberModal from './EditMemberModal';
import CertificateModal from './CertificateModal';
import { exportArrayToXlsx } from '../utils/exportToExcel';
import { getActivityWeight, ACTIVITY_WEIGHTS } from '../utils/activityWeights';

export default function ManagementTab({
  members = [],
  onUpdateMember,
  onSaveMember,
  onAddMember,
  onRevertToQuarantine,
  onToggleStatus,
  onBlacklist,
  onDeleteMember,
  onOpenNewMemberModal,
  onNavigateToReports,
  meetings = [],
  academicYear: propAcademicYear,
  onAcademicYearChange,
  customStartDate: propCustomStartDate,
  customEndDate: propCustomEndDate,
  onCustomDateChange,
}) {
  const { currentOrg, getStorageKey } = useOrg();
  const { isViewer } = useAuth();
  const isSknSeks = currentOrg?.id === 'skn_seksuologii';

  const academicYearCtx = useAcademicYear();
  const academicYear = propAcademicYear || academicYearCtx.academicYear;
  const academicYearOptions = academicYearCtx?.academicYearOptions || [];
  const customStartDate = propCustomStartDate || academicYearCtx.customStartDate;
  const customEndDate = propCustomEndDate || academicYearCtx.customEndDate;
  const currentScope = academicYearCtx.currentScope;

  const handleYearChange = (newYear) => {
    if (onAcademicYearChange) {
      onAcademicYearChange(newYear);
    } else {
      academicYearCtx.setAcademicYear(newYear);
    }
  };

  const handleCustomStartChange = (val) => {
    if (onCustomDateChange) {
      onCustomDateChange(val, customEndDate);
    } else {
      academicYearCtx.setCustomStartDate(val);
    }
  };

  const handleCustomEndChange = (val) => {
    if (onCustomDateChange) {
      onCustomDateChange(customStartDate, val);
    } else {
      academicYearCtx.setCustomEndDate(val);
    }
  };

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'guest' | 'resigned' | 'graduates' | 'archived'
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [editingMember, setEditingMember] = useState(null);
  const [decisionModalMember, setDecisionModalMember] = useState(null);
  const [revertToast, setRevertToast] = useState(null);
  const [certificateModalState, setCertificateModalState] = useState({
    isOpen: false,
    member: null,
    initialDocType: 'membership',
    freqData: null,
    points: 0,
  });
  const { weights, calculateMemberPoints, attendanceConfig } = useSettings();

  // Persistent custom meeting categories (localStorage)
  const customMeetingTypes = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(getStorageKey ? getStorageKey('crm_meeting_types') : 'crm_meeting_types') || '{}');
    } catch {
      return {};
    }
  }, [getStorageKey]);

  // 1. Zindeksowane punkty zarządu z rejestru kadencji (O(1)) z ograniczeniem do aktywnego roku i organizacji
  const boardPointsMap = useMemo(() => {
    const map = new Map();
    try {
      const orgId = currentOrg?.id || 'skn_seksuologii';
      const rawTenures =
        localStorage.getItem(`skn_board_tenures_${orgId}`) ||
        localStorage.getItem('skn_board_tenures') ||
        localStorage.getItem('crm_board_tenures');
      const tenures = rawTenures ? JSON.parse(rawTenures) : [];

      const zarzadMonthly = getActivityWeight('ZARZAD_MIES', weights, 3);
      const badaniaMonthly = getActivityWeight('BADANIA', weights, 5);
      const itMonthly = getActivityWeight('IT_SYSTEMY', weights, 5);
      const smMonthly = getActivityWeight('SM_MODER_MIES', weights, 5);

      const BOARD_ROLE_RATES = {
        'Przewodniczący / Przewodnicząca': zarzadMonthly,
        'Wiceprzewodniczący / Wiceprzewodnicząca': zarzadMonthly,
        'Sekretarz Koła': zarzadMonthly,
        'Członek / Członkini Zarządu': zarzadMonthly,
        'Członek Zarządu': zarzadMonthly,
        'Członkini Zarządu': zarzadMonthly,
        'Skarbnik': zarzadMonthly,
        'Koordynator ds. Badań': badaniaMonthly,
        'Lider IT / Koordynator CRM': itMonthly,
        'Moderator Social Media / Grup': smMonthly,
        'Przewodniczący': zarzadMonthly,
        'Przewodnicząca': zarzadMonthly,
        'Wiceprzewodniczący': zarzadMonthly,
        'Wiceprzewodnicząca': zarzadMonthly,
      };

      if (Array.isArray(tenures)) {
        tenures.forEach(entry => {
          if (!entry) return;
          const rawIdx = String(entry.nrIndeksu || entry.studentIndex || entry.memberIndex || entry.index || '').trim();
          const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
          const studentEmail = String(entry.email || entry.memberEmail || '').trim().toLowerCase();
          const studentName = String(entry.memberName || entry.fullName || entry.name || '').trim().toLowerCase();

          // Oblicz liczbę miesięcy pełnienia funkcji w wybranym roku akademickim (SSOT)
          const monthsInScope = getTenureMonthsInScope(entry, currentScope);
          if (monthsInScope <= 0) {
            return;
          }

          const rate = BOARD_ROLE_RATES[entry.roleName || entry.role] || zarzadMonthly;
          const pts = monthsInScope * rate;

          if (pts > 0) {
            if (cleanIdx) {
              map.set(cleanIdx, (map.get(cleanIdx) || 0) + pts);
              map.set(`idx_${cleanIdx}`, (map.get(`idx_${cleanIdx}`) || 0) + pts);
            }
            if (rawIdx && rawIdx !== cleanIdx) {
              map.set(rawIdx, (map.get(rawIdx) || 0) + pts);
              map.set(`idx_${rawIdx}`, (map.get(`idx_${rawIdx}`) || 0) + pts);
            }
            if (studentEmail) {
              map.set(studentEmail, (map.get(studentEmail) || 0) + pts);
            }
            if (studentName) {
              map.set(`name_${studentName}`, (map.get(`name_${studentName}`) || 0) + pts);
            }
          }
        });
      }
    } catch (err) {
      console.error('Błąd indeksowania punktów zarządu:', err);
    }
    return map;
  }, [weights, currentScope, currentOrg?.id]);

  // 1. Jednorazowy odczyt ewidencji ze Storage dla aktywnego widoku i organizacji
  const attendanceIndex = useMemo(() => {
    try {
      const ewKey = getStorageKey ? getStorageKey('crm_ewidencja') : 'crm_ewidencja';
      const raw = localStorage.getItem(ewKey) || localStorage.getItem('crm_ewidencja');
      const parsed = raw ? JSON.parse(raw) : [];
      return buildAttendanceIndex(parsed);
    } catch (e) {
      console.error('Błąd indeksowania ewidencji:', e);
      return { indexByStudentIndex: new Map(), indexByEmail: new Map() };
    }
  }, [academicYear, currentOrg?.id, meetings, getStorageKey]); // Odświeżaj przy zmianie koła, roku lub spotkań

  // 2. Mianownik spotkań (baza obowiązkowa) oraz pula bonusowa liczone RAZ dla całego zakresu
  const { mandatoryScopeMeetings, bonusScopeMeetings } = useMemo(() => {
    if (!Array.isArray(meetings) || meetings.length === 0) {
      return { mandatoryScopeMeetings: [], bonusScopeMeetings: [] };
    }
    const now = new Date();
    const mandatory = [];
    const bonus = [];

    meetings.forEach(meeting => {
      if (!meeting) return;
      const mDate = meeting.start_dt || meeting.data || meeting.date;
      if (!mDate) return;
      const dateStr = String(mDate).includes('T') ? String(mDate).split('T')[0] : String(mDate).trim();
      const meetStatus = getMeetingStatusInfo(meeting);
      const isPast = meetStatus.isCompleted || (
        !meetStatus.isUpcoming && (
          new Date(dateStr) <= now ||
          (meeting.status && String(meeting.status).includes('Zakończone')) ||
          (meeting.attendanceCount && Number(meeting.attendanceCount) > 0)
        )
      );
      const inScope = (!currentScope?.startDate || dateStr >= currentScope.startDate) &&
                      (!currentScope?.endDate || dateStr <= currentScope.endDate);
      if (!isPast || !inScope) return;

      // 1. Ręczne wykluczenie/włączenie ma bezwzględne pierwszeństwo
      if (meeting.countsInFrequency === false || meeting.includeInFrequency === false || meeting.wliczajDoFrekwencji === false) {
        bonus.push(meeting);
        return;
      }
      if (meeting.countsInFrequency === true || meeting.includeInFrequency === true || meeting.wliczajDoFrekwencji === true) {
        mandatory.push(meeting);
        return;
      }

      // 2. Kwalifikacja na podstawie typu spotkania (MEETING_TYPES)
      const type = getMeetingType(meeting, customMeetingTypes);
      const typeCfg = MEETING_TYPES[type];

      // Wyklucz z mianownika spotkania o charakterze wewnętrznym, zarządu, nieobowiązkowym lub trigger warning
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

    return {
      mandatoryScopeMeetings: precompileMeetings(mandatory),
      bonusScopeMeetings: precompileMeetings(bonus),
    };
  }, [meetings, currentScope, customMeetingTypes]);

  // Zachowaj kompatybilność z wywołaniami pomocniczymi
  const eligibleScopeMeetings = mandatoryScopeMeetings;

  // 3. Pre-kalkulacja statystyk dla wszystkich członków w O(N)
  const membersStatsMap = useMemo(() => {
    const statsMap = new Map();
    const isSknu = currentOrg?.id === 'sknu';
    const totalMandatory = mandatoryScopeMeetings.length;
    const totalBonus = bonusScopeMeetings.length;

    // Pomocnik pobierania wag taryfikatora
    const getWeight = (code, fallback = 0) => getActivityWeight(code, weights, fallback);
    const onlineWeight = getWeight('OB_ONLINE', 1);
    const stacjoWeight = getWeight('OB_STACJO', 2);

    // Pre-indeksowanie uczestników i aktywności dla wszystkich spotkań w zakresie (O(M))
    const scopeMeetings = [...mandatoryScopeMeetings, ...bonusScopeMeetings];
    const meetingLogsMap = new Map();

    scopeMeetings.forEach(m => {
      if (!m) return;
      const mKeys = m._keys || [
        String(m.id || ''),
        String(m.code || ''),
        String(m.date || (m.start_dt ? m.start_dt.split('T')[0] : '') || m.data || '')
      ].filter(Boolean);

      // Bezpieczny wybór struktury z pełnymi obiektami (zamiast prostych tablic stringów)
      let rawAttendees = null;

      if (Array.isArray(m.participantRecords) && m.participantRecords.length > 0 && typeof m.participantRecords[0] === 'object') {
        rawAttendees = m.participantRecords;
      } else if (Array.isArray(m.listaObecnosci) && m.listaObecnosci.length > 0 && typeof m.listaObecnosci[0] === 'object') {
        rawAttendees = m.listaObecnosci;
      } else if (Array.isArray(m.obecnosci) && m.obecnosci.length > 0 && typeof m.obecnosci[0] === 'object') {
        rawAttendees = m.obecnosci;
      } else if (Array.isArray(m.attendees) && m.attendees.length > 0 && typeof m.attendees[0] === 'object') {
        rawAttendees = m.attendees;
      }

      // Jeśli w obiekcie spotkania nie ma struktur obiektowych, sięgnij do localStorage
      if (!rawAttendees || rawAttendees.length === 0) {
        const cleanCode = String(m.code || '').replace(/^\[.*?\]\s*/, '').trim();
        const candidateKeys = [
          getStorageKey ? getStorageKey(`crm_attendance_${m.id}`) : null,
          getStorageKey && m.date ? getStorageKey(`crm_attendance_${m.date}`) : null,
          getStorageKey && m.code ? getStorageKey(`crm_attendance_${m.code}`) : null,
          getStorageKey && cleanCode ? getStorageKey(`crm_attendance_${cleanCode}`) : null,
          m.id ? `crm_attendance_${m.id}` : null,
          m.date ? `crm_attendance_${m.date}` : null,
          m.data ? `crm_attendance_${m.data}` : null,
          m.code ? `crm_attendance_${m.code}` : null,
          cleanCode ? `crm_attendance_${cleanCode}` : null,
        ].filter(Boolean);

        for (const k of candidateKeys) {
          try {
            const cachedPayload = localStorage.getItem(k);
            if (cachedPayload) {
              const parsed = JSON.parse(cachedPayload);
              if (Array.isArray(parsed?.attendees) && parsed.attendees.length > 0 && typeof parsed.attendees[0] === 'object') {
                rawAttendees = parsed.attendees;
                break;
              } else if (Array.isArray(parsed?.allVerifiedList) && parsed.allVerifiedList.length > 0) {
                rawAttendees = parsed.allVerifiedList;
                break;
              } else if (Array.isArray(parsed?.obecnosci) && parsed.obecnosci.length > 0) {
                rawAttendees = parsed.obecnosci;
                break;
              } else if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                rawAttendees = parsed;
                break;
              }
            }
          } catch (err) {
            console.warn(`[ManagementTab] Błąd odczytu cache obecności dla spotkania ${m.id}:`, err);
          }
        }
      }

      // Fallback: prosta tablica stringów jeśli brak obiektów
      if (!rawAttendees || rawAttendees.length === 0) {
        if (Array.isArray(m.attendees) && m.attendees.length > 0) {
          rawAttendees = m.attendees;
        }
      }

      const attendeeMap = new Map();
      (rawAttendees || []).forEach(att => {
        if (!att) return;

        // Obsługa sytuacji, gdy element jest obiektem lub stringiem
        const isObj = typeof att === 'object';
        const rawIdx = isObj ? String(att.nrIndeksu || att.index || att.memberIndex || att.member?.index || att.member?.nrIndeksu || '').trim() : String(att).trim();
        const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
        const attEmail = isObj ? String(att.email || att.mail || att.member?.email || '').trim().toLowerCase() : (String(att).includes('@') ? String(att).trim().toLowerCase() : '');
        const attName = isObj ? String(att.name || att.fullName || att.rawName || att.nazwiskoImie || att.imieNazwisko || att.member?.fullName || '').trim().toLowerCase() : (!String(att).includes('@') && !/^\d+$/.test(String(att).trim()) ? String(att).trim().toLowerCase() : '');

        // Wyciągnięcie tablicy aktywności
        let activities = isObj && Array.isArray(att.activities) 
          ? att.activities 
          : (isObj && Array.isArray(att.dodatkoweAktywnosci) ? att.dodatkoweAktywnosci : []);

        if (isObj && activities.length === 0 && typeof att.opisAktywnosci === 'string') {
          const match = att.opisAktywnosci.match(/\((.*?)\)/);
          if (match && match[1]) {
            activities = match[1].split(',').map(s => s.trim().toUpperCase());
          }
        }

        // Punkty zapisane bezpośrednio lub fallback
        const explicitPoints = isObj ? Number(att.punkty || att.points || 0) : 0;
        const isApproved = isObj ? (att.manualApproved !== undefined ? Boolean(att.manualApproved) : (att.status === 'approved' || att.status === 'Zaliczona' || att.status === 'Zaliczono' || att.isEligible !== false)) : true;

        const entryData = {
          raw: att,
          isApproved,
          activities,
          punkty: explicitPoints > 0 ? explicitPoints : null,
          explicitPoints,
          trybUdzialu: isObj ? (att.trybUdzialu || (att.isOnline === false ? 'STACJONARNY' : 'ONLINE')) : 'ONLINE',
          isOnline: isObj ? (att.trybUdzialu === 'ONLINE' || att.isOnline !== false) : true,
          daysAttended: isObj ? (Number(att.daysAttended) || 1) : 1,
        };

        if (cleanIdx) attendeeMap.set(cleanIdx, entryData);
        if (rawIdx && rawIdx !== cleanIdx) attendeeMap.set(rawIdx, entryData);
        if (attEmail) attendeeMap.set(attEmail, entryData);
        if (attName) attendeeMap.set(`name_${attName}`, entryData);
      });

      mKeys.forEach(k => meetingLogsMap.set(k, attendeeMap));
    });

    members.forEach(member => {
      if (!member) return;

      if (isSknu) {
        const m01 = member?.m01 === 1 ? 1 : 0;
        const m02 = member?.m02 === 1 ? 1 : 0;
        const m03 = member?.m03 === 1 ? 1 : 0;
        const m04 = member?.m04 === 1 ? 1 : 0;
        const attended = typeof member?.attended === 'number'
          ? member.attended
          : (m01 + m02 + m03 + m04 || (typeof member?.present === 'number' ? member.present : 0));
        const totalMeetings = 3;
        const absent = Math.max(0, totalMeetings - attended);
        const freq = typeof member?.attendancePercent === 'number'
          ? member.attendancePercent
          : Math.min(100, Math.round((attended / totalMeetings) * 100));

        const sknuStats = {
          attendedCount: attended,
          missedCount: absent,
          totalCount: totalMeetings,
          attendanceRate: isNaN(freq) ? 0 : freq,
          canCert: freq >= 50,
          canIssueCertificate: freq >= 50,
          label: `${attended} / ${absent}`,
          freq: isNaN(freq) ? 0 : freq,
          present: attended,
          absent,
          presentMandatory: attended,
          mandatoryTotal: totalMeetings,
          mandatoryAttended: attended,
          bonusAttended: 0,
        };

        if (member.id) statsMap.set(member.id, sknuStats);
        if (member.memberKey) statsMap.set(member.memberKey, sknuStats);
        if (member.nrIndeksu) statsMap.set(`idx_${member.nrIndeksu}`, sknuStats);
        if (member.index) statsMap.set(`idx_${member.index}`, sknuStats);
        statsMap.set(member.id || member.nrIndeksu, sknuStats);
        return;
      }

      const rawIdx = String(member.nrIndeksu || member.index || member.cleanIndex || '').trim();
      const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
      const studentEmail = String(member.email || '').trim().toLowerCase();
      const memberFullName = String(member.fullName || member.name || `${member.firstName || ''} ${member.lastName || ''}`).trim().toLowerCase();

      const attendedSetByIndex = attendanceIndex.indexByStudentIndex.get(cleanIdx) ||
                                 attendanceIndex.indexByStudentIndex.get(rawIdx);
      const attendedSetByEmail = attendanceIndex.indexByEmail.get(studentEmail);

      let calculatedPoints = 0;

      // Pomocnik kalkulacji pojedynczego spotkania dla studenta
      const evaluateMeeting = (m) => {
        const mKeys = m._keys || [
          String(m.id || ''),
          String(m.code || ''),
          String(m.date || (m.start_dt ? m.start_dt.split('T')[0] : '') || m.data || '')
        ].filter(Boolean);

        let wasPresent = mKeys.some(k =>
          (attendedSetByIndex && attendedSetByIndex.has(k)) ||
          (attendedSetByEmail && attendedSetByEmail.has(k))
        );

        if (!wasPresent && m._attendeesIndex) {
          if (cleanIdx && m._attendeesIndex.indexes.has(cleanIdx)) wasPresent = true;
          else if (rawIdx && m._attendeesIndex.indexes.has(rawIdx)) wasPresent = true;
          else if (studentEmail && m._attendeesIndex.emails.has(studentEmail)) wasPresent = true;
        }

        // Sprawdź w zindeksowanych logach uczestników
        let studentLog = null;
        for (let k of mKeys) {
          const logMap = meetingLogsMap.get(k);
          if (logMap) {
            studentLog = (cleanIdx ? logMap.get(cleanIdx) : null) ||
                         (rawIdx ? logMap.get(rawIdx) : null) ||
                         (studentEmail ? logMap.get(studentEmail) : null) ||
                         (memberFullName ? logMap.get(`name_${memberFullName}`) : null);
            if (studentLog) break;
          }
        }

        if (studentLog && studentLog.isApproved !== false) {
          wasPresent = true;
        }

        if (!wasPresent) {
          return { attended: false, points: 0 };
        }

        // Oblicz punkty bazowe za obecność (online vs stacjo vs konferencja)
        const loc = String(m.location || '').toLowerCase();
        const notes = String(m.notes || m.description || '').toLowerCase();
        const isStacjoMtg = /sala|kampus|budynek|stacjon/.test(loc) || /sala|kampus|budynek|stacjon/.test(notes);

        let isOnline = true;
        if (studentLog?.isOnline !== undefined) {
          isOnline = Boolean(studentLog.isOnline);
        } else if (studentLog?.trybUdzialu) {
          isOnline = String(studentLog.trybUdzialu).toUpperCase() !== 'STACJONARNY';
        } else {
          isOnline = !isStacjoMtg;
        }

        const isConference = m.type === 'conference_passive' || m.charakter === 'conference_passive' || String(m.title || '').toLowerCase().includes('konferencj');
        const days = Math.max(1, studentLog?.daysAttended || 1);

        let baseMtgPts = 0;
        if (isConference) {
          baseMtgPts = (isOnline ? getWeight('CONF_BIERNA_ONLINE', 2) : getWeight('KONF_BIER', 3)) * days;
        } else {
          baseMtgPts = isOnline ? onlineWeight : stacjoWeight;
        }

        // Dodatkowe formy zaangażowania (np. PREZENTACJA = +5 pkt, DYSKUSJA = +1 pkt, POSTER = +3 pkt)
        let extraActsPts = 0;
        if (studentLog?.activities && Array.isArray(studentLog.activities)) {
          studentLog.activities.forEach(actCode => {
            const upperCode = String(actCode).trim().toUpperCase();
            if (upperCode !== 'OB_ONLINE' && upperCode !== 'OB_STACJO') {
              extraActsPts += getWeight(upperCode, 0);
            }
          });
        }

        let meetingTotalPts = baseMtgPts + extraActsPts;
        const expPts = studentLog?.explicitPoints || studentLog?.punkty;
        if (expPts && Number(expPts) > meetingTotalPts) {
          meetingTotalPts = Number(expPts);
        }

        return { attended: true, points: meetingTotalPts };
      };

      // Zlicz obecności na spotkaniach obowiązkowych (baza) oraz nalicz punkty
      let mandatoryAttended = 0;
      for (let j = 0; j < totalMandatory; j++) {
        const res = evaluateMeeting(mandatoryScopeMeetings[j]);
        if (res.attended) {
          mandatoryAttended++;
          calculatedPoints += res.points;
        }
      }

      // Zlicz obecności na spotkaniach bonusowych / warsztatowych oraz nalicz punkty
      let bonusAttended = 0;
      for (let j = 0; j < totalBonus; j++) {
        const res = evaluateMeeting(bonusScopeMeetings[j]);
        if (res.attended) {
          bonusAttended++;
          calculatedPoints += res.points;
        }
      }

      const totalAttendedAll = mandatoryAttended + bonusAttended;
      const missedMandatoryCount = Math.max(0, totalMandatory - mandatoryAttended);
      const attendanceRate = totalMandatory > 0
        ? Math.min(100, Math.round((mandatoryAttended / totalMandatory) * 100))
        : 100;

      // Zaświadczenie: min 70% frekwencji z bazy obowiązkowej oraz min 3 dowolne zaliczone spotkania
      const canCert = (totalMandatory === 0 || attendanceRate >= 70) && totalAttendedAll >= 3;

      // Punkty za pełnienie funkcji w Zarządzie Koła
      const boardPoints = boardPointsMap.get(cleanIdx) ||
                          boardPointsMap.get(rawIdx) ||
                          boardPointsMap.get(studentEmail) ||
                          boardPointsMap.get(`name_${memberFullName}`) ||
                          0;

      // Suma łączna za aktywny rok akademicki: punkty ze spotkań + punkty z zarządu w tym roku
      // (SSOT: nie pobieramy zbiorczego dożywotniego total_points z profilu)
      const meetingPoints = calculatedPoints;
      const totalMemberPoints = meetingPoints + boardPoints;

      const statsObj = {
        attendedCount: totalAttendedAll,
        attendedMandatoryCount: mandatoryAttended,
        attendedBonusCount: bonusAttended,
        bonusCount: bonusAttended,
        totalAttendedAll,
        missedCount: missedMandatoryCount,
        totalCount: totalMandatory,
        totalMandatory,
        attendanceRate,
        canCert,
        canIssueCertificate: canCert,
        label: bonusAttended > 0
          ? `${totalAttendedAll} / ${missedMandatoryCount} (+${bonusAttended})`
          : `${totalAttendedAll} / ${missedMandatoryCount}`,
        freq: attendanceRate,
        present: totalAttendedAll,
        absent: missedMandatoryCount,
        presentMandatory: mandatoryAttended,
        mandatoryTotal: totalMandatory,
        mandatoryAttended,
        bonusAttended,
        totalAttended: totalAttendedAll,
        calculatedPoints,
        meetingPoints,
        boardPoints,
        totalMemberPoints,
        points: totalMemberPoints,
      };

      if (member.id) statsMap.set(member.id, statsObj);
      if (member.memberKey) statsMap.set(member.memberKey, statsObj);
      if (member.nrIndeksu) statsMap.set(`idx_${member.nrIndeksu}`, statsObj);
      if (member.index) statsMap.set(`idx_${member.index}`, statsObj);
      statsMap.set(member.id || member.nrIndeksu, statsObj);
    });

    return statsMap;
  }, [members, currentOrg?.id, mandatoryScopeMeetings, bonusScopeMeetings, attendanceIndex, weights, boardPointsMap, getStorageKey]);

  const getMemberFreqData = (m) => {
    if (!m) {
      return { freq: 0, present: 0, absent: 0, presentMandatory: 0, mandatoryTotal: 0, canIssueCertificate: false };
    }
    const idKey = m.id;
    const memberKey = m.memberKey;
    const idxKey = m.nrIndeksu ? `idx_${m.nrIndeksu}` : (m.index ? `idx_${m.index}` : null);

    if (idKey && membersStatsMap.has(idKey)) return membersStatsMap.get(idKey);
    if (memberKey && membersStatsMap.has(memberKey)) return membersStatsMap.get(memberKey);
    if (idxKey && membersStatsMap.has(idxKey)) return membersStatsMap.get(idxKey);

    return calculateMemberAttendance(m, Array.isArray(meetings) ? meetings : [], currentScope, null, {
      attendanceIndex,
      eligibleMeetings: eligibleScopeMeetings,
    });
  };

  const blacklist = useMemo(() => {
    return getBlacklistedMembers(currentOrg?.id || 'default');
  }, [currentOrg?.id]);

  const getMemberStats = (m) => getMemberFreqData(m);

  // Prekompilowana mapa punktów członków O(N) dla aktywnego roku akademickiego
  const membersPointsMap = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m) continue;

      const statObj = membersStatsMap.get(m.id || m.nrIndeksu) || membersStatsMap.get(m.memberKey);
      const dynamicPoints = statObj?.totalMemberPoints ?? statObj?.points;
      const pts = typeof dynamicPoints === 'number' ? dynamicPoints : 0;

      if (m.id) map.set(m.id, pts);
      if (m.memberKey) map.set(m.memberKey, pts);
      if (m.nrIndeksu) map.set(`idx_${m.nrIndeksu}`, pts);
      if (m.index) map.set(`idx_${m.index}`, pts);
      map.set(m.id || m.nrIndeksu, pts);
    }
    return map;
  }, [members, membersStatsMap]);

  const getMemberPoints = (m) => {
    if (!m) return 0;
    const idKey = m.id;
    const memberKey = m.memberKey;
    const idxKey = m.nrIndeksu ? `idx_${m.nrIndeksu}` : (m.index ? `idx_${m.index}` : null);

    if (idKey && membersPointsMap.has(idKey)) return membersPointsMap.get(idKey);
    if (memberKey && membersPointsMap.has(memberKey)) return membersPointsMap.get(memberKey);
    if (idxKey && membersPointsMap.has(idxKey)) return membersPointsMap.get(idxKey);

    return 0;
  };

  const isActive = (m) => isMemberActive(m);
  const isGuest = (m) => isMemberGuest(m);
  const isInactive = (m) => isMemberInactive(m);
  const isArchived = (m) => isMemberArchived(m);

  // Prekompilowana mapa informacji o cyklu studiów i semestrze O(N) (zamiast 3-krotnego przeliczania w pętlach)
  const studyInfoMap = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m) continue;
      const info = calculateCurrentStudyYear(m?.rawTimestamp || m?.timestamp, m?.year, m?.field, m);
      if (m.id) map.set(m.id, info);
      if (m.nrIndeksu) map.set(m.nrIndeksu, info);
      if (m.index) map.set(m.index, info);
    }
    return map;
  }, [members]);

  // ── Active vs Guests vs Resigned vs Graduates vs Archived Calculations ───────────
  const activeMembers = useMemo(
    () => members.filter(m => isMemberActive(m)),
    [members]
  );
  const guestMembers = useMemo(
    () => members.filter(m => isMemberGuest(m)),
    [members]
  );
  const resignedMembers = useMemo(
    () => members.filter(m => isMemberInactive(m)),
    [members]
  );
  const archivedMembers = useMemo(
    () => members.filter(m => isMemberArchived(m)),
    [members]
  );
  const graduatesList = useMemo(
    () => members.filter(m => {
      if (isMemberArchived(m) || isMemberDeleted(m)) return false;
      if (isMemberGraduate(m)) return true;
      const info = studyInfoMap.get(m.id || m.nrIndeksu || m.index);
      return Boolean(info?.isGraduate);
    }),
    [members, studyInfoMap]
  );

  const finalSemesterList = useMemo(
    () => members.filter(m => {
      if (isMemberArchived(m) || isMemberDeleted(m)) return false;
      if (isMemberFinalSemester(m)) return true;
      const info = studyInfoMap.get(m.id || m.nrIndeksu || m.index);
      return Boolean(info?.isFinalSemester);
    }),
    [members, studyInfoMap]
  );

  const activeCount = activeMembers.length;
  const guestCount = guestMembers.length;
  const resignedCount = resignedMembers.length;
  const graduatesCount = graduatesList.length;
  const finalSemesterCount = finalSemesterList.length;
  const archivedCount = archivedMembers.length;
  const totalCount = members.filter(m => !isMemberArchived(m) && !isMemberDeleted(m)).length;

  // ── KPI Calculations (ONLY for active members, Safe against NaN%) ────────
  const avgFreq = useMemo(() => {
    if (!activeMembers.length) return 0;
    let sum = 0;
    for (let i = 0; i < activeMembers.length; i++) {
      const m = activeMembers[i];
      const stats = membersStatsMap.get(m.id || m.nrIndeksu) || membersStatsMap.get(m.memberKey);
      const f = stats?.attendanceRate ?? stats?.freq ?? 0;
      sum += isNaN(f) ? 0 : f;
    }
    const avg = Math.round(sum / activeMembers.length);
    return isNaN(avg) ? 0 : avg;
  }, [activeMembers, membersStatsMap]);

  const certReady = useMemo(() => {
    let count = 0;
    for (let i = 0; i < activeMembers.length; i++) {
      const m = activeMembers[i];
      const stats = membersStatsMap.get(m.id || m.nrIndeksu) || membersStatsMap.get(m.memberKey);
      if (!isSknSeks) {
        if ((stats?.attendanceRate ?? stats?.freq ?? 0) >= 50) count++;
      } else {
        if (stats?.canCert || stats?.canIssueCertificate) count++;
      }
    }
    return count;
  }, [activeMembers, isSknSeks, membersStatsMap]);

  const mailingConsentsCount = useMemo(() => {
    const seenEmails = new Set();
    return activeMembers.filter(m => {
      const email = (m?.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) return false;

      const hasConsent = hasMailingConsent(m);

      if (hasConsent && !seenEmails.has(email)) {
        seenEmails.add(email);
        return true;
      }
      return false;
    }).length;
  }, [activeMembers]);

  const mailingCount = mailingConsentsCount;

  // ── Sorting & Filtering ───────────────────────────────────────────────────
  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const filtered = useMemo(() => {
    let list = members.filter(m => !m?.isArchived && m?.status !== 'archived');
    if (statusFilter === 'active') {
      list = activeMembers;
    } else if (statusFilter === 'final_semester') {
      list = finalSemesterList;
    } else if (statusFilter === 'guest') {
      list = guestMembers;
    } else if (statusFilter === 'resigned') {
      list = resignedMembers;
    } else if (statusFilter === 'graduates') {
      list = graduatesList;
    } else if (statusFilter === 'archived') {
      list = archivedMembers;
    }

    const q = (deferredQuery || '').toLowerCase().trim();
    if (!q) return list;
    return list.filter(m => {
      const name  = (m?.fullName || `${m?.firstName || ''} ${m?.lastName || ''}`).toLowerCase();
      const index = (m?.index ?? m?.indexNumber ?? '').toLowerCase();
      const email = (m?.email ?? '').toLowerCase();
      return name.includes(q) || index.includes(q) || email.includes(q);
    });
  }, [members, activeMembers, finalSemesterList, guestMembers, resignedMembers, graduatesList, archivedMembers, statusFilter, deferredQuery]);

  const sortedMembers = useMemo(() => {
    if (!sortConfig.key) return filtered;
    return [...filtered].sort((a, b) => {
      const key = sortConfig.key;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;

      if (key === 'status') {
        const getStatusOrder = (item) => {
          if (isMemberActive(item)) return 0;
          if (isMemberGuest(item)) return 1;
          return 2;
        };
        return (getStatusOrder(a) - getStatusOrder(b)) * dir;
      }

      if (key === 'freq') {
        const statsA = membersStatsMap.get(a.id || a.nrIndeksu) || membersStatsMap.get(a.memberKey);
        const statsB = membersStatsMap.get(b.id || b.nrIndeksu) || membersStatsMap.get(b.memberKey);
        const aFreq = statsA?.attendanceRate ?? statsA?.freq ?? 0;
        const bFreq = statsB?.attendanceRate ?? statsB?.freq ?? 0;
        return (aFreq - bFreq) * dir;
      }

      if (key === 'points') {
        const valA = membersPointsMap.get(a.id || a.nrIndeksu) || membersPointsMap.get(a.memberKey) || 0;
        const valB = membersPointsMap.get(b.id || b.nrIndeksu) || membersPointsMap.get(b.memberKey) || 0;
        return (valA - valB) * dir;
      }

      if (key === 'present') {
        const statsA = membersStatsMap.get(a.id || a.nrIndeksu) || membersStatsMap.get(a.memberKey);
        const statsB = membersStatsMap.get(b.id || b.nrIndeksu) || membersStatsMap.get(b.memberKey);
        const aPres = statsA?.attendedCount ?? statsA?.present ?? 0;
        const bPres = statsB?.attendedCount ?? statsB?.present ?? 0;
        return (aPres - bPres) * dir;
      }

      if (key === 'absent') {
        const statsA = membersStatsMap.get(a.id || a.nrIndeksu) || membersStatsMap.get(a.memberKey);
        const statsB = membersStatsMap.get(b.id || b.nrIndeksu) || membersStatsMap.get(b.memberKey);
        const aAbs = statsA?.missedCount ?? statsA?.absent ?? 0;
        const bAbs = statsB?.missedCount ?? statsB?.absent ?? 0;
        return (aAbs - bAbs) * dir;
      }

      if (key === 'index') {
        const aNum = parseInt(a?.index || a?.indexNumber, 10) || 0;
        const bNum = parseInt(b?.index || b?.indexNumber, 10) || 0;
        return (aNum - bNum) * dir;
      }

      if (key === 'mailingConsent') {
        const aVal = hasMailingConsent(a) ? 1 : 0;
        const bVal = hasMailingConsent(b) ? 1 : 0;
        return (aVal - bVal) * dir;
      }

      if (key === 'cert' || key === 'canIssue' || key === 'certificate') {
        const statsA = membersStatsMap.get(a.id || a.nrIndeksu) || membersStatsMap.get(a.memberKey);
        const statsB = membersStatsMap.get(b.id || b.nrIndeksu) || membersStatsMap.get(b.memberKey);
        const aCert = Boolean(statsA?.canCert ?? statsA?.canIssueCertificate) ? 1 : 0;
        const bCert = Boolean(statsB?.canCert ?? statsB?.canIssueCertificate) ? 1 : 0;
        return (aCert - bCert) * dir;
      }

      const aVal = String(a?.[key] || '').toLowerCase();
      const bVal = String(b?.[key] || '').toLowerCase();
      return aVal.localeCompare(bVal, 'pl') * dir;
    });
  }, [filtered, sortConfig, membersPointsMap, membersStatsMap]);

  // Progresywne renderowanie wierszy (65 w pierwszej klatce, pełna lista w kolejnej klatce w tle),
  // zapobiega blokowaniu głównego wątku przy pierwszym montażu 147+ wierszy
  const [renderedLimit, setRenderedLimit] = useState(65);
  useEffect(() => {
    if (sortedMembers.length <= 65) {
      setRenderedLimit(sortedMembers.length);
      return;
    }
    const rafId = requestAnimationFrame(() => {
      startTransition(() => {
        setRenderedLimit(sortedMembers.length);
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [sortedMembers.length, statusFilter]);

  const visibleMembers = useMemo(
    () => (renderedLimit < sortedMembers.length ? sortedMembers.slice(0, renderedLimit) : sortedMembers),
    [sortedMembers, renderedLimit]
  );

  const renderSortIcon = (colKey) => {
    if (sortConfig.key !== colKey) {
      return (
        <span className="inline-flex items-center justify-center ml-1 p-0.5 rounded text-slate-500 hover:text-slate-800 group-hover:text-slate-800 transition-colors print:hidden shrink-0">
          <ArrowUpDown size={12} />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center ml-1 p-0.5 rounded bg-indigo-100 text-indigo-600 font-black border border-indigo-200 shadow-2xs print:hidden shrink-0">
        {sortConfig.direction === 'asc' ? <ChevronUp size={13} strokeWidth={2.5} /> : <ChevronDown size={13} strokeWidth={2.5} />}
      </span>
    );
  };

  // ── Action Handlers ────────────────────────────────────────────────────────
  const handleOpenCertificate = (m, initialDocType = 'membership') => {
    if (!m) return;
    const fData = getMemberFreqData(m);
    const mPoints = getMemberPoints(m);
    setCertificateModalState({
      isOpen: true,
      member: m,
      initialDocType,
      freqData: fData,
      points: mPoints,
    });
  };

  const handleOpenAnnualReport = () => {
    if (onNavigateToReports) {
      onNavigateToReports(null, 'meetings_summary');
      return;
    }
    setCertificateModalState({
      isOpen: true,
      member: null,
      initialDocType: 'protocol',
      freqData: null,
      points: 0,
    });
  };

  const handleRevertAction = (m) => {
    if (!onRevertToQuarantine) return;
    onRevertToQuarantine(m.id);
    setRevertToast(`Cofnięto zatwierdzenie. Student ${m.fullName || m.firstName} wrócił do Kwarantanny.`);
    setDecisionModalMember(null);

    setTimeout(() => {
      setRevertToast(null);
    }, 5000);
  };

  const handleToggleStatusAction = (m) => {
    if (!onToggleStatus) return;
    onToggleStatus(m.id);
    setDecisionModalMember(null);
  };

  const handleSetStatusAction = (m, targetStatus) => {
    if (!onToggleStatus) return;
    onToggleStatus(m.id, targetStatus);
    setDecisionModalMember(null);
  };

  const handleArchiveAction = (m) => {
    if (!m) return;
    addMemberToBlacklist(currentOrg?.id || 'default', {
      ...m,
      archiveReason: 'Czarna lista / Usunięty przez użytkownika',
    });
    if (onArchiveMember) {
      onArchiveMember(m, 'blacklist_member');
    }
    setDecisionModalMember(null);
  };

  // ── Eksport aktualnie przefiltrowanej listy członków do pliku Excel (.xlsx) ──
  const handleExportMainListXlsx = () => {
    const membersList = Array.isArray(sortedMembers) ? sortedMembers : [];
    const yearTitle = currentScope?.label || academicYear || 'Rok akademicki 2026/2027 (Bieżący)';
    const exportData = membersList.map((m, idx) => {
      const freqData = membersStatsMap.get(m.id || m.nrIndeksu) || membersStatsMap.get(m.memberKey) || getMemberFreqData(m);
      const freq = m?.frekwencja !== undefined ? m.frekwencja : (Number(freqData?.attendanceRate ?? freqData?.freq) || 0);
      const present = freqData?.attendedCount !== undefined ? freqData.attendedCount : (freqData?.present ?? (m?.obecnosci || 0));
      const missed = freqData?.missedCount !== undefined ? freqData.missedCount : (freqData?.absent ?? 0);
      const totalMtg = freqData?.totalCount !== undefined ? freqData.totalCount : (freqData?.mandatoryTotal || (Array.isArray(meetings) ? meetings.length : 0));
      const pts = m?.punkty !== undefined ? m.punkty : (membersPointsMap.get(m.id || m.nrIndeksu) || membersPointsMap.get(m.memberKey) || getMemberPoints(m));
      const studyInfo = calculateCurrentStudyYear(m?.rawTimestamp || m?.timestamp, m?.year, m?.field);
      const yearLabel = studyInfo?.displayLabel || m?.year || '';
      const kierunekRok = m?.kierunekRok || (m?.field && yearLabel ? `${m.field} (${yearLabel})` : (m?.field || yearLabel || m?.kierunek || '—'));
      const statusLabel = isActive(m)
        ? 'Aktywny'
        : isGuest(m)
        ? 'Gość'
        : isInactive(m)
        ? 'Nieaktywny'
        : (m?.statusWeryfikacji || m?.status || 'Aktywny');
      const consent = m?.zgodaMailing !== undefined
        ? (Boolean(m.zgodaMailing) && m.zgodaMailing !== 'Brak zgody' && m.zgodaMailing !== 'NIE')
        : hasMailingConsent(m);
      const certEligible = freqData?.canIssueCertificate !== undefined ? freqData.canIssueCertificate : (freqData?.isCertEligible || false);

      return {
        "Lp.": idx + 1,
        "Imię i Nazwisko": m?.imieNazwisko || m?.fullName || (m?.firstName ? `${m.firstName} ${m.lastName || ''}`.trim() : '') || m?.name || 'Brak danych',
        "Adres e-mail": m?.email || '',
        "Numer Indeksu": m?.nrIndeksu || m?.index || m?.indexNumber || m?.cleanIndex || '',
        "Kierunek / Rok": kierunekRok,
        "Status": statusLabel,
        "Rok akademicki": yearTitle,
        "Frekwencja": `${freq || 0}%`,
        "OB. / NIEOB.": freqData?.label || `${present || 0} / ${missed || 0}`,
        "Zaświadczenie": certEligible ? "Można wydać" : "W toku",
        "Punkty": pts || 0,
        "Zgoda mailing": consent ? "TAK" : "NIE"
      };
    });
    const safeYearSlug = String(yearTitle).replace(/[\/\s:]+/g, '_');
    exportArrayToXlsx(exportData, `Wykaz_czlonkow_${safeYearSlug}_${new Date().toISOString().slice(0, 10)}`);
  };

  useEffect(() => {
    const handleTriggerExport = () => {
      handleExportMainListXlsx();
    };
    window.addEventListener('crm:export-main-xlsx', handleTriggerExport);
    return () => window.removeEventListener('crm:export-main-xlsx', handleTriggerExport);
  }, [handleExportMainListXlsx]);

  return (
    <div className="w-full max-w-full overflow-x-clip space-y-4 sm:space-y-6 relative printable-area">

      {/* ── Print Page Margin Optimization CSS ─────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            margin: 12mm 10mm;
            size: A4 portrait;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* ── Official Printable Header for Dziekanat (Visible ONLY during print) ── */}
      <div className="hidden print:block mb-3 pb-2 border-b-2 border-slate-900 font-sans">
        <div className="flex items-baseline justify-between">
          <h1 className="text-sm font-bold text-slate-950 uppercase tracking-tight">
            {currentOrg?.name?.toUpperCase() || 'KOŁO NAUKOWE SEKSUOLOGII'} – WYKAZ CZŁONKÓW – {currentScope?.label || academicYear}
          </h1>
          <div className="text-[9.5px] text-slate-900 font-bold font-mono">
            Liczba studentów: {sortedMembers.length}
          </div>
        </div>
        <div className="flex items-center justify-between text-[9px] text-slate-600 font-medium mt-1">
          <div>
            Wykaz członków – {currentScope?.label || academicYear} | Dokument sporządzony na potrzeby Dziekanatu | Stan na dzień: {new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
          <div className="font-mono text-slate-500">
            {statusFilter === 'active'
              ? `[Aktywni członkowie]`
              : statusFilter === 'final_semester'
              ? `[Ostatni semestr]`
              : statusFilter === 'guest'
              ? `[Goście / Wolni słuchacze]`
              : statusFilter === 'resigned'
              ? `[Byli / Nieaktywni członkowie]`
              : statusFilter === 'graduates'
              ? `[Absolwenci]`
              : `[Pełny wykaz]`}
          </div>
        </div>
      </div>

      {/* ── Certificate & Document Generator Modal ──────────────────────────── */}
      <CertificateModal
        isOpen={certificateModalState.isOpen}
        onClose={() => setCertificateModalState(prev => ({ ...prev, isOpen: false }))}
        member={certificateModalState.member}
        initialDocType={certificateModalState.initialDocType}
        freqData={certificateModalState.freqData}
        points={certificateModalState.points}
        allMembers={members}
        meetings={meetings}
        academicYear={academicYear}
      />

      {/* ── Edit Member Modal ────────────────────────────────────────────── */}
      <EditMemberModal
        member={editingMember}
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
        allMembers={members}
        meetings={meetings}
        onSave={(updated) => {
          const saveFn = onSaveMember || onUpdateMember;
          if (typeof saveFn === 'function') {
            saveFn(updated);
          } else {
            console.error('Brak przekazanej funkcji zapisu w propsach ManagementTab!');
          }
        }}
        onSaveMember={(updated) => {
          const saveFn = onSaveMember || onUpdateMember;
          if (typeof saveFn === 'function') {
            saveFn(updated);
          }
        }}
      />

      {/* ── Search & Filter Controls Toolbar (Hidden during Print) ───────────── */}
      <div className="w-full max-w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 print:hidden no-print">
        {/* Search Input inside distinct gray base container with inner shadow */}
        <div className="bg-slate-100 border border-slate-300/80 rounded-xl p-1 shadow-inner relative flex-1 max-w-md">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              id="member-search-input"
              name="memberSearch"
              type="text"
              aria-label="Szukaj członka koła po nazwisku, numerze indeksu lub emailu"
              placeholder="Szukaj po nazwisku, nr indeksu lub emailu…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-500 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-2xs transition"
            />
            {query && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500">
                {sortedMembers.length} wyników
              </span>
            )}
          </div>
        </div>

        {/* Action Controls: Academic Year + Filters + XLSX Export + Print Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0 w-full sm:w-auto">
          {/* Academic Year Selector in Management Tab (Clean select without redundant label) */}
          <div className="inline-flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs font-semibold shrink-0 gap-1.5 shadow-2xs">
            <select
              value={academicYear}
              onChange={e => handleYearChange(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 sm:px-2.5 py-1 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer shadow-xs"
            >
              {academicYearOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  Rok {opt.label}
                </option>
              ))}
              <option value="custom">Własny zakres...</option>
            </select>
            {academicYear === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => handleCustomStartChange(e.target.value)}
                  className="px-1 py-0.5 text-xs bg-transparent focus:outline-none text-slate-800"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => handleCustomEndChange(e.target.value)}
                  className="px-1 py-0.5 text-xs bg-transparent focus:outline-none text-slate-800"
                />
              </div>
            )}
          </div>

          {/* Segmented Filter Pills (Concise Labels) */}
          <div className="inline-flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs font-semibold shrink-0 gap-1 shadow-2xs overflow-x-auto max-w-full scrollbar-none">
            <button
              type="button"
              onClick={() => startTransition(() => setStatusFilter('active'))}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Aktywni ({activeCount})</span>
            </button>

            {finalSemesterCount > 0 && (
              <button
                type="button"
                onClick={() => startTransition(() => setStatusFilter('final_semester'))}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  statusFilter === 'final_semester'
                    ? 'bg-white text-sky-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <span className="sm:hidden">Sem. ost. ({finalSemesterCount})</span>
                <span className="hidden sm:inline">Ostatni semestr ({finalSemesterCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => startTransition(() => setStatusFilter('guest'))}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                statusFilter === 'guest'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <span>Goście ({guestCount})</span>
            </button>

            <button
              type="button"
              onClick={() => startTransition(() => setStatusFilter('resigned'))}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                statusFilter === 'resigned'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
              <span className="sm:hidden">Nieaktywni ({resignedCount})</span>
              <span className="hidden sm:inline">Byli / Nieaktywni ({resignedCount})</span>
            </button>

            {graduatesCount > 0 && (
              <button
                type="button"
                onClick={() => startTransition(() => setStatusFilter('graduates'))}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  statusFilter === 'graduates'
                    ? 'bg-white text-indigo-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap size={13} className="text-indigo-600 shrink-0" />
                <span>Absolwenci ({graduatesCount})</span>
              </button>
            )}
          </div>

          {/* Export XLSX Button (Hidden on Mobile < md, Full on Desktop >= md) */}
          <button
            type="button"
            onClick={handleExportMainListXlsx}
            className="hidden md:inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer shrink-0"
            title="Pobierz zestawienie do pliku Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Eksportuj XLSX</span>
          </button>

          {/* Print List Button (Hidden on Mobile < md, Full on Desktop >= md) */}
          <button
            type="button"
            onClick={() => window.print()}
            className="hidden md:inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer shrink-0"
            title="Wydrukuj wykaz członków na potrzeby Dziekanatu"
          >
            <Printer size={16} />
            <span>Drukuj</span>
          </button>
        </div>
      </div>

      {/* Graduates Bulk Action Notification Banner */}
      {statusFilter === 'graduates' && graduatesCount > 0 && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200 print:hidden no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <GraduationCap size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950">
                Wykryto {graduatesCount} potencjalnych absolwentów koła
              </p>
              <p className="text-[11px] text-indigo-700">
                Osoby te przekroczyły programowy czas trwania studiów na podstawie roku zgłoszenia.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onBulkMarkGraduates && (
              <button
                onClick={() => onBulkMarkGraduates(graduatesList.map(g => g.id))}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <GraduationCap size={13} />
                <span>Przenieś do Byłych ({graduatesCount})</span>
              </button>
            )}
            {onBulkArchiveGraduates && (
              <button
                onClick={() => onBulkArchiveGraduates(graduatesList.map(g => g.id))}
                className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Archive size={13} />
                <span>Archiwizuj ({graduatesCount})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Table Container with Independent Scrolling & Sticky Thead ── */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Tabela ewidencji członków koła naukowego"
        className="table-wrapper printable-area w-full max-w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto overflow-y-auto block max-h-[72vh] sm:max-h-[78vh] md:max-h-[calc(100dvh-220px)] xl:max-h-[calc(100vh-230px)] scrollbar-thin scrollbar-thumb-indigo-200 touch-auto overscroll-y-auto focus:outline-none focus:ring-1 focus:ring-indigo-400/50 print:max-h-none print:overflow-visible print:shadow-none print:border-none print:rounded-none"
      >
        <table className="print-table w-full min-w-full xl:min-w-[1380px] text-xs table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-200/90 backdrop-blur-xs border-b-2 border-slate-300 shadow-sm">
            <tr className="text-left select-none print:bg-slate-100 print:border-slate-900">
              {/* 1. LP. (Liczba porządkowa) - Print: 5% */}
              <th className="w-8 sm:w-12 px-1 sm:px-2 py-2.5 text-center text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap bg-slate-200/90 backdrop-blur-xs print:w-[5%] print:text-slate-900 print:font-mono print:text-center">LP.</th>
              
              {/* 2. Imię i Nazwisko / Email - Print: 35% */}
              <th
                onClick={() => handleSort('fullName')}
                className="w-auto flex-1 min-w-0 sm:min-w-[200px] md:min-w-[240px] px-2 sm:px-3 py-2 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group bg-slate-200/90 backdrop-blur-xs print:w-[35%] print:min-w-0 print:text-slate-900 print:cursor-default"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap print:text-[8pt]">Imię i Nazwisko</span>
                    <span className="print-subtext text-[10px] font-semibold text-slate-600 hidden sm:block mt-0.5 normal-case tracking-normal">Adres e-mail</span>
                  </div>
                  <span className="shrink-0">{renderSortIcon('fullName')}</span>
                </div>
              </th>

              {/* 3. Nr Indeksu - Print: 15% */}
              <th
                onClick={() => handleSort('index')}
                className="w-16 sm:w-28 px-1 sm:px-2 py-2 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center bg-slate-200/90 backdrop-blur-xs print:w-[15%] print:min-w-0 print:text-slate-900 print:text-center"
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap print:text-[8pt]">Indeks</span>
                  <span className="shrink-0">{renderSortIcon('index')}</span>
                </div>
              </th>

              {/* 4. Kierunek / Rok - Print: 45% */}
              <th
                onClick={() => handleSort('field')}
                className="hidden md:table-cell min-w-[140px] sm:min-w-[180px] md:min-w-[200px] px-3 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group bg-slate-200/90 backdrop-blur-xs print:table-cell print:w-[45%] print:min-w-0 print:text-slate-900"
              >
                <div className="flex items-center justify-start gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap print:text-[8pt]">Kierunek / Rok</span>
                  <span className="shrink-0">{renderSortIcon('field')}</span>
                </div>
              </th>

              {/* Hidden on Print: 5. Status */}
              <th
                onClick={() => handleSort('status')}
                className="w-20 sm:w-28 px-1 sm:px-2 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center bg-slate-200/90 backdrop-blur-xs print:hidden no-print"
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap">Status</span>
                  <span className="shrink-0">{renderSortIcon('status')}</span>
                </div>
              </th>

              {/* Hidden on Print: Frekwencja */}
              <th
                onClick={() => handleSort('freq')}
                className="hidden lg:table-cell w-36 xl:w-44 px-2 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center bg-slate-200/90 backdrop-blur-xs print:hidden"
              >
                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <span>Frekwencja</span>
                  <span className="shrink-0">{renderSortIcon('freq')}</span>
                </div>
              </th>

              {/* Hidden on Print: Ob. / Nieob. */}
              <th
                onClick={() => handleSort('present')}
                className="hidden lg:table-cell w-36 xl:w-40 px-3 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center bg-slate-200/90 backdrop-blur-xs print:hidden"
              >
                <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                  <span>Ob. / Nieob.</span>
                  <span className="shrink-0">{renderSortIcon('present')}</span>
                </div>
              </th>

              {/* Hidden on Print: Zaświadczenie */}
              <th
                onClick={() => handleSort('cert')}
                className="hidden xl:table-cell w-44 xl:w-48 px-3 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center whitespace-nowrap bg-slate-200/90 backdrop-blur-xs print:hidden"
              >
                <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                  <span>Zaświadczenie</span>
                  <span className="shrink-0">{renderSortIcon('cert')}</span>
                </div>
              </th>

              {/* Hidden on Print: Punkty Aktywności */}
              <th
                onClick={() => handleSort('points')}
                className="hidden sm:table-cell w-20 sm:w-24 px-2 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center bg-slate-200/90 backdrop-blur-xs print:hidden"
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap">Punkty</span>
                  <span className="shrink-0">{renderSortIcon('points')}</span>
                </div>
              </th>

              {/* Hidden on Print: Mailing Consent */}
              <th
                onClick={() => handleSort('mailingConsent')}
                className="hidden xl:table-cell w-16 px-2 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider cursor-pointer hover:bg-slate-300/60 transition-colors group text-center bg-slate-200/90 backdrop-blur-xs print:hidden"
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider whitespace-nowrap">Mailing</span>
                  <span className="shrink-0">{renderSortIcon('mailingConsent')}</span>
                </div>
              </th>

              {/* Hidden on Print: Opcje */}
              <th className="hidden sm:table-cell w-16 sm:w-20 px-2 py-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider text-center whitespace-nowrap bg-slate-200/90 backdrop-blur-xs print:hidden">
                Opcje
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:divide-slate-300">
            {sortedMembers.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {members.length === 0
                    ? 'Ładowanie danych…'
                    : statusFilter === 'guest'
                    ? 'Brak osób o statusie Gość / Wolny słuchacz'
                    : statusFilter === 'resigned'
                    ? 'Brak osób o statusie Nieaktywny / Rezygnacja'
                    : 'Brak wyników spełniających kryteria'}
                </td>
              </tr>
            )}
            {visibleMembers.map((m, i) => {
              if (!m) return null;
              const isResigned = isInactive(m);
              const isGuestMember = isGuest(m);
              const isNonActive = !isActive(m);

              const freqData = membersStatsMap.get(m.id || m.nrIndeksu) || membersStatsMap.get(m.memberKey) || getMemberFreqData(m);
              const freq = Number(freqData?.attendanceRate ?? freqData?.freq) || 0;
              const absences = typeof freqData.missedCount === 'number'
                ? freqData.missedCount
                : (typeof freqData.absent === 'number' ? freqData.absent : (m?.absent || 0));
              const canIssue = Boolean(freqData?.canCert ?? freqData?.canIssueCertificate);
              const cert = {
                canIssue,
                label: canIssue ? 'Można wydać' : 'W toku',
                color: canIssue
                  ? 'text-emerald-600 hover:text-emerald-700'
                  : 'text-slate-500 hover:text-slate-700'
              };
              const badge = getFrequencyBadge(freq);
              const memberPoints = membersPointsMap.get(m.id || m.nrIndeksu) || membersPointsMap.get(m.memberKey) || 0;
              const name  = m?.fullName || (m?.firstName ? `${m.firstName} ${m.lastName || ''}`.trim() : '') || m?.name || 'Brak danych';
              const isSingleWordName = name.trim().split(' ').length < 2;
              const studyInfo = studyInfoMap.get(m.id || m.nrIndeksu || m.index) || calculateCurrentStudyYear(m?.rawTimestamp || m?.timestamp, m?.year, m?.field, m);
              const isFinalSem = isMemberFinalSemester(m) || studyInfo.isFinalSemester;
              const isGrad = isMemberGraduate(m) || studyInfo.isGraduate;

              return (
                <tr
                  key={m.id}
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                  className={`group/row transition-all duration-150 ease-in-out cursor-pointer print:break-inside-avoid print:page-break-inside-avoid ${
                    isNonActive
                      ? 'opacity-65 bg-slate-50/60 hover:opacity-90 hover:bg-slate-100/80 text-slate-500 print:opacity-100 print:bg-white'
                      : 'hover:bg-indigo-50/60 hover:border-indigo-300 text-slate-800'
                  }`}
                >
                  {/* 1. # (Lp.) - Print: 5% */}
                  <td className="w-8 sm:w-12 px-1 sm:px-2 py-2.5 text-slate-400 text-xs font-mono text-center align-middle whitespace-nowrap print:w-[5%] print:text-slate-900 print:font-mono print:text-center">{i + 1}</td>
                  
                  {/* 2. Name + Email - Print: 35% */}
                  <td className="w-auto min-w-0 sm:min-w-[200px] md:min-w-[240px] px-2 sm:px-3 py-2.5 align-middle text-left whitespace-nowrap print:w-[35%] print:min-w-0 print:whitespace-normal">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900 text-xs truncate print:whitespace-normal print:overflow-visible print:text-slate-900 print:leading-tight" title={name}>
                      <span
                        onClick={() => setDecisionModalMember(m)}
                        className={`cursor-pointer transition-colors hover:text-indigo-600 ${
                          isResigned ? 'line-through text-slate-400 print:no-underline print:text-slate-900' : isGuestMember ? 'text-indigo-900 font-bold' : 'text-slate-900 group-hover/row:text-indigo-600 print:text-slate-900 font-bold'
                        }`}
                        title="Kliknij, aby otworzyć zarządzanie wpisem studenta"
                      >
                        {name}
                      </span>
                      {isGuestMember && (
                        <span className="text-[10px] text-indigo-700 font-semibold shrink-0 print:hidden no-print">· Gość</span>
                      )}
                      {isResigned && (
                        <span className="text-[10px] text-slate-500 font-semibold shrink-0 print:hidden no-print">· Nieaktywny</span>
                      )}
                      {isSingleWordName && (
                        <button
                          onClick={() => setEditingMember(m)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition print:hidden cursor-pointer"
                          title="Kliknij, aby dodać nazwisko"
                        >
                          <Pencil size={11} strokeWidth={2.2} /> <span className="hidden sm:inline">Korekta</span>
                        </button>
                      )}
                    </div>
                    {m.email && (
                      <div className="print-subtext hidden sm:block text-[11px] text-slate-400 font-normal truncate mt-0.5 print:whitespace-normal print:overflow-visible" title={m.email}>{m.email}</div>
                    )}
                  </td>

                  {/* 3. Nr Indeksu - Print: 15% */}
                  <td className="w-16 sm:w-28 px-1 sm:px-2 py-2.5 text-slate-700 font-mono text-xs text-center align-middle whitespace-nowrap print:w-[15%] print:min-w-0 print:text-slate-900 print:font-mono print:font-bold print:text-center">
                    {m.index ? (
                      <span className="font-semibold text-center inline-block">{m.index}</span>
                    ) : (
                      <span className="print:text-slate-400 font-normal text-center inline-block">
                        <button
                          onClick={() => setEditingMember(m)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:underline transition-colors print:hidden cursor-pointer"
                          title="Brak numeru indeksu! Kliknij, aby uzupełnić."
                        >
                          <AlertTriangle size={11} strokeWidth={2.2} className="text-amber-500 print:hidden" /> <span>Brak</span>
                        </button>
                        <span className="hidden print:inline">—</span>
                      </span>
                    )}
                  </td>

                  {/* 4. Kierunek / Rok z dynamiczną auto-progresją i statusem absolwenta - Print: 45% */}
                  <td className="hidden md:table-cell min-w-[140px] sm:min-w-[180px] md:min-w-[200px] px-3 py-2.5 text-xs text-slate-900 whitespace-nowrap align-middle print:table-cell print:w-[45%] print:min-w-0 print:whitespace-normal print:text-slate-900">
                    <div className="truncate font-semibold text-slate-900 text-xs print:whitespace-normal print:overflow-visible print:text-[8pt] print:leading-snug">{m.field || '—'}</div>
                    <div className="print-subtext flex items-center gap-1.5 mt-0.5 whitespace-nowrap print:whitespace-normal">
                      {isGrad || studyInfo.isGraduate ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 print:text-[7pt] print:font-normal print:text-slate-600"
                          title={`Status absolwenta (${studyInfo.maxSemesters || 6} semestrów). Rejestracja: Rok ${studyInfo.originalYear || '?'}`}
                        >
                          <GraduationCap size={13} strokeWidth={2.2} className="shrink-0 text-purple-700 print:hidden" />
                          <span>Absolwent (Ukończone)</span>
                        </span>
                      ) : isFinalSem || studyInfo.isFinalSemester ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 print:text-[7pt] print:font-normal print:text-slate-600"
                          title={`Ostatni semestr studiów (${studyInfo.currentSemester || 6}. semestr). Przygotowanie do dyplomu.`}
                        >
                          <GraduationCap size={13} strokeWidth={2.2} className="shrink-0 text-sky-700 print:hidden" />
                          <span>{studyInfo.semesterLabel || `Semestr ${studyInfo.currentSemester || 6} (Ostatni)`}</span>
                        </span>
                      ) : studyInfo.currentSemester ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium print:text-[7pt] print:text-slate-600"
                          title={`Semestr ${studyInfo.currentSemester} / ${studyInfo.maxSemesters || 6} (${studyInfo.studyCycle || 'licencjat'})`}
                        >
                          <span>{studyInfo.semesterLabel || `Semestr ${studyInfo.currentSemester}`}</span>
                          {studyInfo.isProgressed && (
                            <span className="text-[10px] text-indigo-600 font-bold print:hidden" title="Automatycznie wyliczony semestr">↗️</span>
                          )}
                        </span>
                      ) : studyInfo.isProgressed ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium print:text-[7pt] print:text-slate-600"
                          title={`Auto-progresja roku akad.: +${studyInfo.diff} rok (rejestracja: Rok ${studyInfo.originalYear || '?'})`}
                        >
                          <span>{studyInfo.currentYearLabel}</span>
                          <span className="text-[10px] text-indigo-600 font-bold print:hidden" title="Automatycznie wyliczony rok na podstawie daty zgłoszenia">↗️</span>
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium text-[11px] print:text-[7pt] print:text-slate-600">
                          {m.year || '—'}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Hidden on Print: 5. Status */}
                  <td className="w-20 sm:w-28 px-1 sm:px-2 py-2 text-center align-middle whitespace-nowrap print:hidden no-print">
                    <button
                      onClick={() => setDecisionModalMember(m)}
                      className={`inline-flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer hover:underline ${
                        isGuestMember
                          ? 'text-indigo-600'
                          : isResigned
                          ? 'text-slate-500'
                          : isGrad
                          ? 'text-purple-600'
                          : isFinalSem
                          ? 'text-sky-600'
                          : 'text-emerald-600'
                      }`}
                      title="Kliknij, aby zmienić status lub opcje wpisu"
                    >
                      <VectorRingIndicator
                        color={isGuestMember ? 'indigo' : isResigned ? 'slate' : isGrad ? 'purple' : isFinalSem ? 'sky' : 'emerald'}
                        size={10}
                      />
                      <span>{isGuestMember ? 'Gość' : isResigned ? 'Nieaktywny' : isGrad ? 'Absolwent' : isFinalSem ? 'Ostatni sem.' : 'Aktywny'}</span>
                    </button>
                  </td>

                  {/* Hidden on Print: Frekwencja */}
                  <td className="hidden lg:table-cell w-36 xl:w-44 px-2 py-2.5 align-middle text-center whitespace-nowrap print:hidden">
                    <div className="flex flex-col items-center justify-center gap-0.5 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-12 bg-slate-100 rounded-full h-1.5 hidden xl:block print:hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              freq >= 75
                                ? 'bg-emerald-500'
                                : freq >= 50
                                ? 'bg-amber-400'
                                : freq >= 25
                                ? 'bg-amber-300/80'
                                : 'bg-slate-300'
                            }`}
                            style={{ width: `${Math.min(100, freq)}%` }}
                          />
                        </div>
                        <span className="text-slate-900 font-bold text-xs font-mono">{isNaN(freq) ? 0 : freq}%</span>
                      </div>
                      <span
                        className="text-[11px] font-medium text-slate-500 truncate"
                        title={`5-stopniowa skala zaangażowania: ${badge.label} (${freq}%)`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </td>

                  {/* Hidden on Print: Combined Present / Absent ({present} / {absent}) */}
                  <td className="hidden lg:table-cell w-36 xl:w-40 px-3 py-2.5 text-center align-middle whitespace-nowrap font-mono text-xs font-bold print:hidden">
                    <div className="flex items-center justify-center gap-1.5 font-medium whitespace-nowrap">
                      {/* Główna liczba: łączna liczba obecności / nieobecności obowiązkowe */}
                      <span className="text-slate-900 font-semibold font-mono">
                        {freqData.totalAttendedAll ?? freqData.present ?? 0}
                      </span>
                      <span className="text-slate-400 font-mono">/</span>
                      <span className={(freqData.missedCount ?? freqData.absent ?? 0) > 0 ? "text-amber-600 font-semibold font-mono" : "text-slate-500 font-mono"}>
                        {freqData.missedCount ?? freqData.absent ?? 0}
                      </span>

                      {/* Subtelna informacja o spotkaniach dodatkowych */}
                      {(freqData.attendedBonusCount ?? freqData.bonusAttended ?? 0) > 0 && (
                        <span
                          title={`W tym ${freqData.attendedBonusCount ?? freqData.bonusAttended} spotkań dodatkowych (Zarząd / TW / Warsztaty)`}
                          className="ml-0.5 text-[10px] font-semibold text-emerald-600 cursor-help"
                        >
                          +{freqData.attendedBonusCount ?? freqData.bonusAttended}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Hidden on Print: Zaświadczenie Status */}
                  <td className="hidden xl:table-cell w-44 xl:w-48 px-3 py-2 text-center align-middle whitespace-nowrap print:hidden">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCertificate(m, 'membership');
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer hover:underline ${
                        cert.canIssue
                          ? 'text-emerald-600 hover:text-emerald-700'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title={
                        cert.canIssue
                          ? `Spełniono wymogi zaświadczenia (${freq}%, ${absences} nieob.). Kliknij, aby przejść do generatora i wyświetlić dokument.`
                          : `Frekwencja w toku (${freq}%, ${absences} nieob.). Kliknij, aby przejść do generatora i sprawdzić szczegóły.`
                      }
                    >
                      {cert.canIssue ? (
                        <FileCheck2 size={14} strokeWidth={2.2} className="text-emerald-600 shrink-0" />
                      ) : (
                        <Clock size={13} strokeWidth={2} className="text-slate-400 shrink-0" />
                      )}
                      <span>{cert.label}</span>
                    </button>
                  </td>

                  {/* Hidden on Print: Punkty Aktywności */}
                  <td className="hidden sm:table-cell w-20 sm:w-24 px-2 py-2.5 text-center align-middle whitespace-nowrap print:hidden">
                    <span
                      title={
                        (freqData?.boardPoints ?? 0) > 0
                          ? `Spotkania: ${freqData?.meetingPoints ?? 0} pkt | Zarząd: ${freqData?.boardPoints ?? 0} pkt${(freqData?.totalMemberPoints ?? memberPoints ?? 0) > (freqData?.meetingPoints ?? 0) + (freqData?.boardPoints ?? 0) ? ` | Baza profilu: ${(freqData?.totalMemberPoints ?? memberPoints ?? 0) - (freqData?.meetingPoints ?? 0) - (freqData?.boardPoints ?? 0)} pkt` : ''}`
                          : `Spotkania: ${freqData?.meetingPoints ?? freqData?.calculatedPoints ?? 0} pkt`
                      }
                      className={`inline-flex items-center gap-1 text-xs font-bold cursor-help ${
                        (freqData?.boardPoints ?? 0) > 0 ? "text-purple-700" : "text-blue-700"
                      }`}
                    >
                      <Zap size={13} strokeWidth={2.2} className="shrink-0 text-amber-500" />
                      <span>{freqData?.totalMemberPoints ?? memberPoints ?? 0} pkt</span>
                    </span>
                  </td>

                  {/* Hidden on Print: Mailing Consent */}
                  <td className="hidden xl:table-cell w-16 px-2 py-2.5 text-center align-middle whitespace-nowrap print:hidden">
                    {hasMailingConsent(m) ? (
                      <span className="inline-flex items-center justify-center text-emerald-600" title="Zgoda na mailing udzielona (Zgoda na mailing)">
                        <Check size={15} strokeWidth={2.5} />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center text-slate-400" title="Brak zgody na mailing (Brak zgody)">
                        <X size={14} strokeWidth={2.2} />
                      </span>
                    )}
                  </td>

                  {/* Hidden on Print: Akcje / Menu Option Button */}
                  <td className="hidden sm:table-cell w-16 sm:w-20 px-2 py-2.5 text-center align-middle whitespace-nowrap print:hidden">
                    <div className="inline-flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditingMember(m)}
                        className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                        title="Edytuj profil i dane członka"
                      >
                        <Pencil size={15} strokeWidth={2.2} />
                      </button>
                      <button
                        onClick={() => setDecisionModalMember(m)}
                        className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                        title="Opcje zarządzania statusem wpisu"
                      >
                        <MoreVertical size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Revert Toast Notification (Hidden during Print) ─────────────────── */}
      {revertToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5 duration-200 text-xs print:hidden">
          <RotateCcw size={15} className="text-indigo-400 shrink-0" />
          <span>{revertToast}</span>
          <button onClick={() => setRevertToast(null)} className="text-slate-400 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Member Decision Modal (Hidden during Print) ───────────────────── */}
      {decisionModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 print:hidden">
          <div className="bg-white rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Zarządzanie wpisem studenta</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Profil: <strong className="font-semibold text-slate-800">{decisionModalMember.fullName || decisionModalMember.firstName}</strong> (nr indeksu: <strong className="font-mono text-slate-800">{decisionModalMember.index || 'Brak'}</strong>)
                </p>
              </div>
            </div>

            {/* Audit Dates Metadata Card */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 space-y-1 text-[11px] text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Data wpływu zgłoszenia:</span>
                <strong className="font-mono text-slate-800 font-semibold">{decisionModalMember.dataWplywu || decisionModalMember.timestamp || '—'}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Data weryfikacji:</span>
                <strong className="font-mono text-slate-800 font-semibold">{decisionModalMember.dataWeryfikacji || '—'}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Ostatnia aktualizacja:</span>
                <strong className="font-mono text-slate-800 font-semibold">{decisionModalMember.dataAktualizacji || 'Brak modyfikacji'}</strong>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {/* Quick Status Selection Block */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Zmień status członkostwa / etapu studiów:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetStatusAction(decisionModalMember, 'active')}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                      isActive(decisionModalMember) && !isMemberFinalSemester(decisionModalMember) && !isMemberGraduate(decisionModalMember)
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    <VectorRingIndicator color="emerald" size={13} />
                    <span>Aktywny</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatusAction(decisionModalMember, 'final_semester')}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                      isMemberFinalSemester(decisionModalMember)
                        ? 'bg-sky-100 text-sky-900 border-sky-300 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-sky-50 hover:text-sky-700'
                    }`}
                  >
                    <VectorRingIndicator color="sky" size={13} />
                    <span>Ostatni sem.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatusAction(decisionModalMember, 'graduate')}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                      isMemberGraduate(decisionModalMember)
                        ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-purple-50 hover:text-purple-700'
                    }`}
                  >
                    <VectorRingIndicator color="purple" size={13} />
                    <span>Absolwent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatusAction(decisionModalMember, 'guest')}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                      isGuest(decisionModalMember)
                        ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                  >
                    <VectorRingIndicator color="indigo" size={13} />
                    <span>Gość</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatusAction(decisionModalMember, 'resigned')}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer col-span-2 sm:col-span-1 ${
                      isInactive(decisionModalMember)
                        ? 'bg-slate-200 text-slate-900 border-slate-300 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <VectorRingIndicator color="slate" size={13} />
                    <span>Nieaktywny</span>
                  </button>
                </div>
              </div>

              {/* Option 0: Edit Member */}
              <button
                onClick={() => {
                  const m = decisionModalMember;
                  setDecisionModalMember(null);
                  setEditingMember(m);
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors text-left cursor-pointer"
              >
                <Pencil size={15} className="shrink-0 text-slate-600" />
                <div>
                  <div>Edytuj pełne dane studenta</div>
                  <div className="text-[10px] font-normal text-slate-500">Pozwala zmienić numer indeksu, email, imię, nazwisko i kierunek</div>
                </div>
              </button>

              {/* Option 0b: Generate Certificate / Speaker Diploma */}
              <button
                onClick={() => {
                  const m = decisionModalMember;
                  setDecisionModalMember(null);
                  handleOpenCertificate(m, 'membership');
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-950 text-xs font-semibold flex items-center gap-2 transition-colors text-left cursor-pointer"
              >
                <Award size={15} className="shrink-0 text-indigo-700" />
                <div>
                  <div>Wygeneruj Zaświadczenie / Dyplom</div>
                  <div className="text-[10px] font-normal text-indigo-700">Otwiera generator oficjalnego zaświadczenia lub dyplomu prelegenta</div>
                </div>
              </button>

              {/* Option 1: Revert to Quarantine */}
              <button
                onClick={() => handleRevertAction(decisionModalMember)}
                className="w-full py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold flex items-center gap-2 transition-colors text-left"
              >
                <RotateCcw size={15} className="shrink-0 text-indigo-600" />
                <div>
                  <div>Cofnij do Kwarantanny (Pomyłka)</div>
                  <div className="text-[10px] font-normal text-indigo-600/80">Usuwa z Zarządzania i przywraca jako zgłoszenie oczekujące</div>
                </div>
              </button>

              {/* Option 2b: Mark as Graduate */}
              {calculateCurrentStudyYear(decisionModalMember.rawTimestamp || decisionModalMember.timestamp, decisionModalMember.year, decisionModalMember.field).isGraduate && !isInactive(decisionModalMember) && (
                <button
                  onClick={() => handleSetStatusAction(decisionModalMember, 'resigned')}
                  className="w-full py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 text-xs font-semibold flex items-center gap-2 transition-colors text-left cursor-pointer"
                >
                  <GraduationCap size={15} className="shrink-0 text-indigo-700" />
                  <div>
                    <div>Oznacz jako Absolwenta (Przenieś do Byłych)</div>
                    <div className="text-[10px] font-normal text-indigo-700/80">Koniec toku studiów – przenosi studenta do grupy byłych członków</div>
                  </div>
                </button>
              )}

              {/* Option 3: Move to Archive & Blacklist */}
              <button
                onClick={() => handleArchiveAction(decisionModalMember)}
                className="w-full py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-800 text-xs font-semibold flex items-center gap-2 transition-colors text-left cursor-pointer"
              >
                <Archive size={15} className="shrink-0 text-rose-600" />
                <div>
                  <div>Przenieś do Archiwum & Czarna lista</div>
                  <div className="text-[10px] font-normal text-rose-600/80">
                    Trwale usuwa z listy aktywnych i dodaje na czarną listę (np. Grzegorz Brzęczyszczykiewicz) – rekord nie powróci po odświeżeniu.
                  </div>
                </div>
              </button>

              {/* Cancel */}
              <button
                onClick={() => setDecisionModalMember(null)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors text-center cursor-pointer"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
