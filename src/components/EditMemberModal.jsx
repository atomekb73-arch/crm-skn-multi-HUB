import React, { useState, useEffect, useMemo } from 'react';
import { showToast } from '../utils/toast';
import {
  X,
  User,
  Mail,
  Hash,
  BookOpen,
  Calendar,
  Phone,
  Sparkles,
  Clock,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Award,
  ShieldCheck,
  Check,
  Timer,
  Tag,
  CheckCircle,
  XCircle,
  BarChart3,
  CalendarDays,
  FileCheck2,
  Layers,
  Loader2,
  Edit3,
  Zap,
  GraduationCap,
} from 'lucide-react';
import { VectorRingIndicator } from './VectorIcons';
import {
  calculateCategorizedFrequency,
  calculateMemberStats,
  getMeetingType,
  MEETING_TYPES,
  isMeetingEligibleForDenominator,
} from '../utils/meetingTypes';
import { getEngagementScaleLevel, useSettings } from '../context/SettingsContext';
import { useOrg } from '../context/OrgContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import { calculateMemberSemesterProgress, STUDY_CYCLES } from '../utils/academicYear';
import { getTenureMonthsInScope } from '../utils/academicScope';
import { supabase, isValidUUID } from '../supabaseClient';

export default function EditMemberModal({
  member,
  isOpen,
  onClose,
  onSave,
  onSaveMember,
  allMembers = [],
  meetings = [],
}) {
  const { currentOrg, getStorageKey } = useOrg();
  const { attendanceConfig } = useSettings();
  const { academicYear, currentScope } = useAcademicYear();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [index, setIndex] = useState('');
  const [phone, setPhone] = useState('');
  const [field, setField] = useState('');
  const [year, setYear] = useState('');
  const [startYear, setStartYear] = useState('');
  const [startSemester, setStartSemester] = useState(1);
  const [studyCycle, setStudyCycle] = useState('licencjat');
  const [aliases, setAliases] = useState('');
  const [status, setStatus] = useState('active');
  const [mailingConsent, setMailingConsent] = useState(false);
  const [attendanceFilter, setAttendanceFilter] = useState('all'); // 'all' | 'attended' | 'absent'

  // Shallow Fetching: szczegółowe dane dociągane na żądanie przy otwarciu modala (/api/member-details?id=...)
  const [memberDetails, setMemberDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [notes, setNotes] = useState('');

  // ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (member) {
      const rawFullName = member.fullName || `${member.firstName || ''} ${member.lastName || ''}`.trim();
      setFullName(String(rawFullName || ''));
      setEmail(String(member.email || ''));
      setIndex(String(member.index || member.cleanIndex || member.nrIndeksu || ''));
      setPhone(String(member.phone || member.telefon || ''));
      setField(String(member.field || member.kierunek || ''));
      setYear(String(member.year || ''));

      const custom = member.custom_fields || {};
      const sYear = member.startYear || member.start_year || custom.startYear || custom.start_year || '';
      setStartYear(String(sYear || ''));

      const sSem = member.startSemester || member.start_semester || custom.startSemester || custom.start_semester || 1;
      setStartSemester(Number(sSem) || 1);

      const sCycle = member.studyCycle || member.study_cycle || custom.studyCycle || custom.study_cycle || (
        String(member.field || member.kierunek || '').toLowerCase().includes('lic')
          ? 'licencjat'
          : String(member.field || member.kierunek || '').toLowerCase().includes('mgr') && !String(member.field || member.kierunek || '').toLowerCase().includes('jednolit')
          ? 'magisterskie'
          : 'jednolite_mgr'
      );
      setStudyCycle(sCycle);

      const rawAliases = member.aliases || member.aliasy || member.alias || member.meetAlias || '';
      const cleanInitAliases = Array.isArray(rawAliases) ? rawAliases.join(', ') : String(rawAliases || '');
      setAliases(cleanInitAliases);

      setStatus(member.status || 'active');

      const hasConsent =
        member.zgodaNaMailing === 'Zgoda na mailing' ||
        (member.mailingConsent === true && member.zgodaNaMailing !== 'Brak zgody' && member.consentStatus !== 'Brak zgody');
      setMailingConsent(Boolean(hasConsent));
    }
  }, [member]);

  // Asynchroniczne dociąganie szczegółów z Supabase SSOT
  useEffect(() => {
    if (member && isOpen) {
      const memberId = member.id || member.nrIndeksu || member.index || member.cleanIndex;
      const existingNotes = member.notes || member.notatki || member.custom_fields?.notatki || member.custom_fields?.notes || '';
      if (existingNotes) {
        setNotes(existingNotes);
      }
      if (memberId) {
        setLoadingDetails(true);
        const uuidFilter = isValidUUID(memberId) ? memberId : '00000000-0000-0000-0000-000000000000';
        supabase
          .from('members')
          .select('*')
          .or(`id.eq.${uuidFilter},index_number.eq.${String(memberId).replace(/\D/g, '') || '0'}`)
          .maybeSingle()
          .then(({ data, error }) => {
            if (data) {
              setMemberDetails(data);
              const customNotes = data.custom_fields?.notatki || data.custom_fields?.notes;
              if (customNotes) {
                setNotes(customNotes);
              }
            }
          })
          .catch(err => {
            console.warn('[EditMemberModal] Błąd dociągania szczegółów członka z Supabase:', err);
          })
          .finally(() => {
            setLoadingDetails(false);
          });
      }
    } else {
      setMemberDetails(null);
      setLoadingDetails(false);
      setNotes('');
    }
  }, [member, isOpen]);

  // Kalkulacja postępu semestralnego i statusu akademickiego
  const semesterProgression = useMemo(() => {
    return calculateMemberSemesterProgress({
      ...(member || {}),
      field,
      year,
      startYear,
      startSemester,
      studyCycle,
    });
  }, [member, field, year, startYear, startSemester, studyCycle]);

  const currentIdx = String(index || '').trim();
  const initialIdx = String(member?.index || member?.cleanIndex || member?.nrIndeksu || '').trim();
  const initialId = String(member?.id || '').trim();
  const currentEmail = String(email || '').trim().toLowerCase();
  const initialEmail = String(member?.email || '').trim().toLowerCase();

  const isDuplicateIndex = Boolean(
    currentIdx &&
    (allMembers || []).some(m => {
      const mIdx = String(m.nrIndeksu || m.index || m.cleanIndex || '').trim();
      const mId = String(m.id || '').trim();
      if (mId && initialId && mId === initialId) return false;
      if (mIdx && initialIdx && mIdx === initialIdx) return false;
      return mIdx === currentIdx;
    })
  );

  const isDuplicateEmail = Boolean(
    currentEmail &&
    (allMembers || []).some(m => {
      const mEmail = String(m.email || '').trim().toLowerCase();
      const mId = String(m.id || '').trim();
      if (mId && initialId && mId === initialId) return false;
      if (mEmail && initialEmail && mEmail === initialEmail) return false;
      return mEmail === currentEmail;
    })
  );

  // Custom Meeting Types from storage
  const customMeetingTypes = useMemo(() => {
    try {
      const key = getStorageKey ? getStorageKey('crm_meeting_types') : 'crm_meeting_types';
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      return {};
    }
  }, [getStorageKey]);

  // Read ewidencja list from storage (isolated per organization)
  const ewidencjaList = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try {
      const ewKey = getStorageKey ? getStorageKey('crm_ewidencja') : 'crm_ewidencja';
      const raw = localStorage.getItem(ewKey) || localStorage.getItem('crm_ewidencja');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [getStorageKey, currentOrg?.id]);

  // Filter student attendance directly from ewidencja
  const studentAttendanceRecords = useMemo(() => {
    if (!member) return [];
    const cleanMemberIdx = String(member.index || member.nrIndeksu || member.cleanIndex || '').replace(/\D/g, '').replace(/^0+/, '').trim();
    const cleanMemberEmail = String(member.email || '').trim().toLowerCase();
    const cleanMemberName = String(member.fullName || `${member.firstName || ''} ${member.lastName || ''}`).trim().toLowerCase();

    return ewidencjaList.filter(e => {
      if (!e) return false;
      const eIdx = String(e.nrIndeksu || e.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
      const eEmail = String(e.email || '').trim().toLowerCase();
      const eName = String(e.name || e.fullName || e.imieNazwisko || '').trim().toLowerCase();

      if (cleanMemberIdx && eIdx && cleanMemberIdx === eIdx) return true;
      if (cleanMemberEmail && eEmail && cleanMemberEmail === eEmail) return true;
      if (cleanMemberName && eName && (cleanMemberName === eName || eName.includes(cleanMemberName) || cleanMemberName.includes(eName))) return true;
      return false;
    });
  }, [member, ewidencjaList]);

  // Read board tenures for member
  const memberTenures = useMemo(() => {
    if (!member) return [];
    let rawTenures = [];
    try {
      const orgId = currentOrg?.id || 'skn_seksuologii';
      const saved = localStorage.getItem(`skn_board_tenures_${orgId}`) || localStorage.getItem('skn_board_tenures');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) rawTenures = parsed;
      }
    } catch {}

    const cleanMemberIdx = String(member.index || member.nrIndeksu || member.cleanIndex || '').replace(/\D/g, '').replace(/^0+/, '').trim();
    const cleanMemberEmail = String(member.email || '').trim().toLowerCase();
    const cleanMemberName = String(member.fullName || member.name || `${member.firstName || ''} ${member.lastName || ''}`).trim().toLowerCase();
    const cleanMemberAliases = String(member.aliasy || member.aliases || '').trim().toLowerCase();

    return rawTenures.filter(t => {
      if (!t) return false;
      const tIdx = String(t.memberIndex || t.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
      const tEmail = String(t.memberEmail || t.email || '').trim().toLowerCase();
      const tName = String(t.memberName || t.name || '').trim().toLowerCase();

      if (cleanMemberIdx && tIdx && cleanMemberIdx === tIdx) return true;
      if (cleanMemberEmail && tEmail && cleanMemberEmail === tEmail) return true;
      if (cleanMemberName && tName && (cleanMemberName === tName || tName.includes(cleanMemberName) || cleanMemberName.includes(tName))) return true;
      if (cleanMemberAliases && tName && (cleanMemberAliases.includes(tName) || tName.includes(cleanMemberAliases))) return true;
      if (tName && cleanMemberIdx === '11654' && (tName.includes('rodak') || tEmail.includes('gabriel.creart'))) return true;
      if (tName && (tName.includes('rodak') && (cleanMemberName.includes('rodak') || cleanMemberAliases.includes('rodak') || cleanMemberEmail.includes('gabriel.creart')))) return true;
      if (tName && (tName.includes('czepir') && (cleanMemberName.includes('czepir') || cleanMemberIdx === '26535' || cleanMemberEmail.includes('czepir')))) return true;
      if (tName && (tName.includes('bratkow') && (cleanMemberName.includes('bratkow') || cleanMemberIdx === '15998' || cleanMemberEmail.includes('bratkow') || cleanMemberEmail.includes('15998')))) return true;
      return false;
    }).map(t => {
      // Oblicz punkty w wybranym roku akademickim (SSOT)
      const monthsInScope = getTenureMonthsInScope(t, currentScope);

      // Oblicz pełny czas kadencji dożywotnio (dla pełnego kontekstu historycznego)
      let lifetimeMonths = 1;
      if (t.startDate) {
        const start = new Date(t.startDate);
        const end = (t.isActive || !t.endDate) ? new Date() : new Date(t.endDate);
        const diffTime = Math.max(0, end.getTime() - start.getTime());
        lifetimeMonths = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.4375)));
      }

      const ptsPerMonth = t.roleName?.includes('Badań') ? 4 : t.roleName?.includes('IT') || t.roleName?.includes('Social') ? 5 : 3;
      const calculatedPoints = monthsInScope * ptsPerMonth;
      const lifetimePoints = lifetimeMonths * ptsPerMonth;

      return {
        ...t,
        monthsInScope,
        lifetimeMonths,
        ptsPerMonth,
        calculatedPoints,
        lifetimePoints,
      };
    }).sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
  }, [member, currentOrg?.id, currentScope]);

  const totalTenurePoints = useMemo(() => {
    return memberTenures.reduce((sum, t) => sum + (t.calculatedPoints || 0), 0);
  }, [memberTenures]);

  // Compute live categorized frequency data (Single Source of Truth)
  const freqData = useMemo(() => {
    if (!member) return { freq: 0, present: 0, absent: 0, presentMandatory: 0, mandatoryTotal: 0, optionalBonus: 0, totalAttended: 0, totalPoints: 0, meetingPoints: 0, tenurePoints: 0 };
    let rawTenures = [];
    try {
      const orgId = currentOrg?.id || 'skn_seksuologii';
      const saved = localStorage.getItem(`skn_board_tenures_${orgId}`) || localStorage.getItem('skn_board_tenures');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) rawTenures = parsed;
      }
    } catch {}

    return calculateMemberStats(
      member,
      ewidencjaList,
      meetings,
      customMeetingTypes,
      {
        ...attendanceConfig,
        academicYear,
        startDate: currentScope?.startDate,
        endDate: currentScope?.endDate,
        scope: currentScope,
        boardTenures: rawTenures,
      }
    );
  }, [member, meetings, customMeetingTypes, ewidencjaList, attendanceConfig, academicYear, currentScope, currentOrg?.id]);

  // Process and sort all meetings with individual student attendance status
  const auditedMeetings = useMemo(() => {
    const cleanMemberIdx = String(member?.index || member?.nrIndeksu || member?.cleanIndex || '').replace(/\D/g, '').replace(/^0+/, '').trim();
    const cleanMemberEmail = String(member?.email || '').trim().toLowerCase();
    const cleanMemberName = String(member?.fullName || `${member?.firstName || ''} ${member?.lastName || ''}`).trim().toLowerCase();

    // De-duplicate meetings by code or id
    const seenCodes = new Set();
    const uniqueMeetings = (meetings || []).filter(m => {
      if (!m) return false;
      const mCode = String(m.code || m.id || m.date || '').trim();
      if (!mCode || seenCodes.has(mCode)) return false;
      seenCodes.add(mCode);
      return true;
    });

    return uniqueMeetings.map(m => {
      const typeId = getMeetingType(m, customMeetingTypes);
      const typeConfig = MEETING_TYPES[typeId] || MEETING_TYPES.mandatory;
      const isEligibleMandatory = isMeetingEligibleForDenominator(m, customMeetingTypes, ewidencjaList);
      const mCodeUpper = String(m.code || m.id || '').replace(/[\[\]]/g, '').trim().toUpperCase();

      // Check attendance in ewidencja
      let matchingEwidencja = studentAttendanceRecords.find(e => {
        const eCode = String(e.kodSpotkania || e.meetingCode || '').replace(/[\[\]]/g, '').trim().toUpperCase();
        return eCode === mCodeUpper;
      });

      // Check attendees array if not in ewidencja
      let isAttended = Boolean(matchingEwidencja);
      let durationStr = matchingEwidencja?.durationStr || '60 min';
      let joinTime = matchingEwidencja?.joinTime || m.date || '18:00';

      if (!isAttended && Array.isArray(m.attendees) && m.attendees.length > 0) {
        isAttended = m.attendees.some(att => {
          if (!att) return false;
          if (typeof att === 'object') {
            const attIdx = String(att.index || att.member?.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
            const attEmail = String(att.email || att.member?.email || '').trim().toLowerCase();
            const attName = String(att.fullName || att.rawName || att.name || '').trim().toLowerCase();
            if (cleanMemberIdx && attIdx && cleanMemberIdx === attIdx) return true;
            if (cleanMemberEmail && attEmail && cleanMemberEmail === attEmail) return true;
            if (cleanMemberName && attName && (cleanMemberName === attName || attName.includes(cleanMemberName) || cleanMemberName.includes(attName))) return true;
            return false;
          }
          const strAtt = String(att).trim();
          const cleanAtt = strAtt.replace(/\D/g, '').replace(/^0+/, '').trim();
          return (cleanMemberIdx && cleanAtt === cleanMemberIdx) || (cleanMemberEmail && strAtt.toLowerCase() === cleanMemberEmail);
        });
      }

      // Check participantRecords
      if (!isAttended && Array.isArray(m.participantRecords) && m.participantRecords.length > 0) {
        const pRecord = m.participantRecords.find(p => {
          if (!p) return false;
          const pIdx = String(p.member?.index || p.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
          const pEmail = String(p.member?.email || p.email || '').trim().toLowerCase();
          const pName = String(p.member?.fullName || p.rawName || '').trim().toLowerCase();
          return (cleanMemberIdx && pIdx === cleanMemberIdx) || (cleanMemberEmail && pEmail === cleanMemberEmail) || (cleanMemberName && pName && (cleanMemberName === pName || pName.includes(cleanMemberName) || cleanMemberName.includes(pName)));
        });
        if (pRecord) {
          isAttended = pRecord.manualApproved !== undefined ? Boolean(pRecord.manualApproved) : (pRecord.isEligible || pRecord.status === 'approved' || pRecord.status === 'Zaliczona');
          if (pRecord.durationStr) durationStr = pRecord.durationStr;
          if (pRecord.joinTime) joinTime = pRecord.joinTime;
        }
      }

      // Check localStorage
      if (!isAttended && typeof window !== 'undefined') {
        const storageKeys = [
          `crm_attendance_${m.id}`,
          `crm_attendance_${m.date}`,
          m.code ? `crm_attendance_${m.code}` : null,
        ].filter(Boolean);

        for (const key of storageKeys) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              const atts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.attendees) ? parsed.attendees : []);
              const matched = atts.find(p => {
                const pIdx = String(p.member?.index || p.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
                const pEmail = String(p.member?.email || p.email || '').trim().toLowerCase();
                const pName = String(p.member?.fullName || p.rawName || '').trim().toLowerCase();
                return (cleanMemberIdx && pIdx === cleanMemberIdx) || (cleanMemberEmail && pEmail === cleanMemberEmail) || (cleanMemberName && pName && (cleanMemberName === pName || pName.includes(cleanMemberName) || cleanMemberName.includes(pName)));
              });
              if (matched) {
                isAttended = matched.manualApproved !== undefined ? Boolean(matched.manualApproved) : (matched.isEligible || matched.status === 'approved' || matched.status === 'Zaliczona');
                if (matched.durationStr) durationStr = matched.durationStr;
                if (matched.joinTime) joinTime = matched.joinTime;
                break;
              }
            }
          } catch {}
        }
      }

      return {
        ...m,
        typeId,
        typeConfig,
        isEligibleMandatory,
        isAttended,
        durationStr,
        joinTime,
      };
    }).sort((a, b) => {
      const parseDate = (item) => {
        const raw = item.date || item.dataSpotkania || (item.start_dt ? String(item.start_dt).split('T')[0] : '');
        return raw ? new Date(raw).getTime() : 0;
      };
      const diff = parseDate(a) - parseDate(b);
      if (diff !== 0) return diff;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });
  }, [member, meetings, customMeetingTypes, studentAttendanceRecords, ewidencjaList]);

  // Filtered meetings list based on selector
  const filteredAuditedMeetings = useMemo(() => {
    if (attendanceFilter === 'attended') {
      return auditedMeetings.filter(m => m.isAttended);
    }
    if (attendanceFilter === 'absent') {
      return auditedMeetings.filter(m => !m.isAttended && m.isEligibleMandatory);
    }
    return auditedMeetings;
  }, [auditedMeetings, attendanceFilter]);

  if (!isOpen || !member) return null;

  const dataWplywu = member.dataWplywu || member.timestamp || '—';
  const dataWeryfikacji = member.dataWeryfikacji || '—';
  const dataAktualizacji = member.dataAktualizacji || 'Brak modyfikacji';

  const freqPercent = freqData.freq ?? 0;
  const engagement = getEngagementScaleLevel(freqPercent);
  const isCertEligible = freqPercent >= 50 && freqData.absent <= 5;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isDuplicateIndex) {
      showToast("Podany numer indeksu jest już przypisany do innego członka koła.");
      return;
    }
    const cleanFullName = String(fullName || '').trim();
    const cleanEmailVal = String(email || '').trim();
    const cleanPhoneVal = String(phone || '').trim();
    const cleanFieldVal = String(field || '').trim();
    const cleanYearVal = String(year || '').trim();
    const cleanIdx = String(index || '').replace(/\D/g, '') || String(index || '').trim();
    const cleanAliases = Array.isArray(aliases)
      ? aliases.join(', ').trim()
      : String(aliases || '').trim();

    const nameParts = cleanFullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(-1)[0] : '';

    const statusWeryfikacjiMap = {
      active: 'Aktywny',
      final_semester: 'Ostatni semestr',
      graduate: 'Absolwent',
      guest: 'Gosc',
      resigned: 'Nieaktywny',
      inactive: 'Nieaktywny',
      archived: 'Archiwum',
      pending: 'Oczekuje'
    };
    const canonicalStatusWeryfikacji = statusWeryfikacjiMap[status] || status;

    const cleanStartYear = String(startYear || '').trim();
    const cleanStartSemester = Number(startSemester) || 1;
    const cleanStudyCycle = String(studyCycle || 'licencjat');

    const saveFn = onSaveMember || onSave;
    if (typeof saveFn === 'function') {
      saveFn({
        ...member,
        fullName: cleanFullName,
        imieNazwisko: cleanFullName,
        firstName,
        lastName,
        email: cleanEmailVal,
        index: cleanIdx,
        cleanIndex: cleanIdx,
        nrIndeksu: cleanIdx,
        phone: cleanPhoneVal,
        telefon: cleanPhoneVal,
        field: cleanFieldVal,
        kierunek: cleanFieldVal,
        year: cleanYearVal,
        startYear: cleanStartYear,
        start_year: cleanStartYear,
        startSemester: cleanStartSemester,
        start_semester: cleanStartSemester,
        studyCycle: cleanStudyCycle,
        study_cycle: cleanStudyCycle,
        currentSemester: semesterProgression.currentSemester,
        current_semester: semesterProgression.currentSemester,
        academicStatus: semesterProgression.academicStatus,
        academic_status: semesterProgression.academicStatus,
        aliases: cleanAliases,
        aliasy: cleanAliases,
        status,
        statusWeryfikacji: canonicalStatusWeryfikacji,
        isArchived: status === 'archived',
        isBlacklisted: status === 'archived',
        mailingConsent,
        zgodaNaMailing: mailingConsent ? 'Zgoda na mailing' : 'Brak zgody',
        consent: mailingConsent,
        zgoda: mailingConsent,
        consentStatus: mailingConsent ? 'Zgody OK' : 'Brak zgody',
        notatki: notes,
        notes: notes,
      });
    } else {
      console.error('Brak przekazanej funkcji zapisu (onSaveMember / onSave) w propsach!');
    }
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto pt-4 pb-10 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-[96vw] xl:max-w-[1500px] my-auto sm:my-2 overflow-hidden flex flex-col transition-all">
        
        {/* ── Top Header Bar ── */}
        <div className="px-6 py-3.5 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
              {fullName ? fullName.slice(0, 2).toUpperCase() : <User size={18} strokeWidth={2.2} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {fullName || 'Szczegóły Członka Koła'}
                </h2>
                {index && (
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0">
                    #{index}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                  status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  status === 'final_semester' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                  status === 'graduate' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                  status === 'guest' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                  status === 'resigned' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <VectorRingIndicator color={status === 'active' ? 'emerald' : status === 'final_semester' ? 'blue' : status === 'graduate' ? 'purple' : status === 'guest' ? 'purple' : status === 'resigned' ? 'slate' : 'amber'} size={11} />
                  <span>{
                    status === 'active' ? 'Członek Aktywny' :
                    status === 'final_semester' ? 'Ostatni semestr' :
                    status === 'graduate' ? 'Absolwent' :
                    status === 'guest' ? 'Wolny Słuchacz' :
                    status === 'resigned' ? 'Rezygnacja' : 'Oczekuje'
                  }</span>
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs font-mono shrink-0"
                  title={`Bilans punktów za aktywny rok akademicki: Spotkania: ${freqData?.meetingPoints ?? 0} pkt | Funkcyjne (zarząd): +${freqData?.tenurePoints ?? totalTenurePoints ?? 0} pkt${(freqData?.meritPoints ?? 0) > 0 ? ` | Dorobek: +${freqData.meritPoints} pkt` : ''}`}
                >
                  <Zap size={13} strokeWidth={2.2} className="text-amber-500 shrink-0" />
                  <span>Bilans: {freqData?.totalPoints ?? ((freqData?.meetingPoints ?? 0) + (totalTenurePoints ?? 0))} pkt</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {field || 'Psychologia'} {year ? `• Rok ${year}` : ''} {semesterProgression?.semesterLabel ? `• ${semesterProgression.semesterLabel}` : ''} {currentOrg?.name ? `• ${currentOrg.name}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
            title="Zamknij okno (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── 3-Column Split Workspace (4-4-4 Layout on large screens) ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200/80 overflow-y-auto max-h-[calc(90vh-70px)]">
          
          {/* ══════════════════════════════════════════════════════════════════
              LEFT COLUMN (4/12): Formularz danych członka (Edycja)
          ══════════════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-4 p-5 space-y-3.5 bg-white">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Edit3 size={13} strokeWidth={2.2} />
                </span>
                <span>Dane i ustawienia profilu</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">Edycja rekordu</span>
            </div>

            {/* Audit Dates Metadata Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5 text-[11px] text-slate-600">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                  <Clock size={12} className="text-indigo-600" />
                  <span>Wpływ zgłoszenia:</span>
                </span>
                <strong className="font-mono text-slate-800">{dataWplywu}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  <span>Weryfikacja w CRM:</span>
                </span>
                <strong className="font-mono text-slate-800">{dataWeryfikacji}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                  <RefreshCw size={12} className="text-amber-600" />
                  <span>Ostatnia modyfikacja:</span>
                </span>
                <strong className="font-mono text-slate-800">{dataAktualizacji}</strong>
              </div>
            </div>

            {/* Form */}
            <form id="edit-member-form" onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="edit-member-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
                  Imię i Nazwisko
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="edit-member-fullname"
                    name="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    onKeyDown={e => e.stopPropagation()}
                    className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 outline-none font-medium"
                    placeholder="np. Anna Nowak"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="edit-member-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Adres E-mail
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="edit-member-email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      className={`w-full pl-8.5 pr-3 py-1.5 rounded-xl border text-xs focus:ring-2 outline-none font-medium ${
                        isDuplicateEmail ? 'border-amber-400 bg-amber-50/40 focus:ring-amber-300' : 'border-slate-200 focus:ring-indigo-300'
                      }`}
                      placeholder="student@gmail.com"
                    />
                  </div>
                  {isDuplicateEmail && (
                    <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                      ⚠️ Email zajęty
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="edit-member-index" className="block text-xs font-semibold text-slate-700 mb-1">
                    Numer Indeksu {!index && <span className="text-amber-600 font-normal">*</span>}
                  </label>
                  <div className="relative">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="edit-member-index"
                      name="index"
                      type="text"
                      value={index}
                      onChange={e => setIndex(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => e.stopPropagation()}
                      className={`w-full pl-8.5 pr-3 py-1.5 rounded-xl border font-mono text-xs focus:ring-2 outline-none font-medium ${
                        isDuplicateIndex ? 'border-amber-400 bg-amber-50/40 focus:ring-amber-300' : 'border-slate-200 focus:ring-indigo-300'
                      }`}
                      placeholder="np. 15998"
                    />
                  </div>
                  {isDuplicateIndex && (
                    <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                      ⚠️ Indeks zajęty
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="edit-member-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Telefon
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="edit-member-phone"
                      name="phone"
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 outline-none font-mono"
                      placeholder="+48 500 000 000"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-member-alias" className="block text-xs font-semibold text-slate-700 mb-1">
                    Aliasy Meet / Nickname
                  </label>
                  <div className="relative">
                    <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="edit-member-alias"
                      name="aliases"
                      type="text"
                      value={aliases}
                      onChange={e => setAliases(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 outline-none font-medium"
                      placeholder="Jan K., jankow"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="edit-member-field" className="block text-xs font-semibold text-slate-700 mb-1">
                    Kierunek studiów
                  </label>
                  <div className="relative">
                    <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="edit-member-field"
                      name="field"
                      type="text"
                      value={field}
                      onChange={e => setField(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 outline-none font-medium"
                      placeholder="Psychologia"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-member-year" className="block text-xs font-semibold text-slate-700 mb-1">
                    Rok studiów (Deklarowany)
                  </label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="edit-member-year"
                      name="year"
                      type="text"
                      value={year}
                      onChange={e => setYear(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 outline-none font-medium"
                      placeholder="np. Rok 2"
                    />
                  </div>
                </div>
              </div>

              {/* ── Baza Akademicka: Cykl studiów & Semestry ────────────────────────── */}
              <div className="p-3 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-blue-50/70 rounded-2xl border border-indigo-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap size={15} className="text-indigo-600" />
                    <span>Cykl studiów & Śledzenie semestrów</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 font-bold">
                    {semesterProgression.semesterLabel}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Cykl studiów */}
                  <div>
                    <label htmlFor="edit-member-cycle" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Cykl kształcenia:
                    </label>
                    <select
                      id="edit-member-cycle"
                      name="studyCycle"
                      value={studyCycle}
                      onChange={e => setStudyCycle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-indigo-300 outline-none"
                    >
                      <option value="licencjat">Licencjat (6 semestrów / 3 lata)</option>
                      <option value="jednolite_mgr">Jednolite mgr (10 semestrów / 5 lat)</option>
                      <option value="magisterskie">Magisterskie II st. (4 semestry / 2 lata)</option>
                    </select>
                  </div>

                  {/* Rok rozpoczęcia studiów */}
                  <div>
                    <label htmlFor="edit-member-start-year" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Rok startowy studiów:
                    </label>
                    <input
                      id="edit-member-start-year"
                      name="startYear"
                      type="text"
                      value={startYear}
                      onChange={e => setStartYear(e.target.value)}
                      placeholder="np. 2024/2025"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-300 outline-none"
                    />
                  </div>

                  {/* Semestr startowy */}
                  <div>
                    <label htmlFor="edit-member-start-sem" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Semestr początkowy:
                    </label>
                    <select
                      id="edit-member-start-sem"
                      name="startSemester"
                      value={startSemester}
                      onChange={e => setStartSemester(Number(e.target.value) || 1)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-indigo-300 outline-none"
                    >
                      <option value={1}>Semestr 1 (Zimowy - październik)</option>
                      <option value={2}>Semestr 2 (Letni - marzec)</option>
                    </select>
                  </div>
                </div>

                {/* Status akademicki i szybkie oznaczanie */}
                <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-indigo-100/80 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <span>Aktualny status:</span>
                    <strong className="text-slate-800 font-bold">
                      Semestr {semesterProgression.currentSemester} / {semesterProgression.maxSemesters} ({semesterProgression.academicStatus})
                    </strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {semesterProgression.isFinalSemester && status !== 'final_semester' && (
                      <button
                        type="button"
                        onClick={() => setStatus('final_semester')}
                        className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Ustaw status członka na Ostatni semestr (kończący studia licencjackie)"
                      >
                        <Clock size={12} className="text-blue-700" />
                        <span>Oznacz jako: Ostatni semestr</span>
                      </button>
                    )}

                    {semesterProgression.isGraduate && status !== 'graduate' && (
                      <button
                        type="button"
                        onClick={() => setStatus('graduate')}
                        className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Ustaw status członka na Absolwent (ukończony 6. semestr licencjatu)"
                      >
                        <GraduationCap size={12} className="text-purple-700" />
                        <span>Oznacz jako: Absolwent</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label htmlFor="edit-member-status" className="block text-xs font-bold text-slate-700 mb-1">
                    Status członkostwa
                  </label>
                  <select
                    id="edit-member-status"
                    name="status"
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none transition-all cursor-pointer shadow-2xs ${
                      status === 'active'
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 focus:ring-2 focus:ring-emerald-400/20'
                        : status === 'final_semester'
                        ? 'bg-blue-50/80 border-blue-300 text-blue-900 focus:ring-2 focus:ring-blue-400/20'
                        : status === 'graduate'
                        ? 'bg-purple-50/80 border-purple-300 text-purple-900 focus:ring-2 focus:ring-purple-400/20'
                        : status === 'guest'
                        ? 'bg-purple-50/80 border-purple-300 text-purple-900 focus:ring-2 focus:ring-purple-400/20'
                        : status === 'resigned'
                        ? 'bg-slate-100 border-slate-300 text-slate-700 focus:ring-2 focus:ring-slate-400/20'
                        : status === 'pending'
                        ? 'bg-amber-50/80 border-amber-300 text-amber-900 focus:ring-2 focus:ring-amber-400/20'
                        : 'bg-rose-50/80 border-rose-300 text-rose-900 focus:ring-2 focus:ring-rose-400/20'
                    }`}
                  >
                    <option value="active">Członek Aktywny</option>
                    <option value="final_semester">Ostatni semestr (kończący studia)</option>
                    <option value="graduate">Absolwent (ukończony cykl)</option>
                    <option value="guest">Wolny Słuchacz (Gość)</option>
                    <option value="resigned">Rezygnacja (Nieaktywny)</option>
                    <option value="pending">Oczekujący (Kwarantanna)</option>
                    <option value="archived">Zarchiwizowany (Archiwum)</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label htmlFor="edit-member-mailing" className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      id="edit-member-mailing"
                      name="mailingConsent"
                      type="checkbox"
                      checked={mailingConsent}
                      onChange={e => setMailingConsent(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-300 border-slate-300 cursor-pointer"
                    />
                    <span className="font-semibold text-xs">Zgoda na e-mail</span>
                  </label>
                </div>
              </div>

              {/* Szczegółowe dane dociągane na żądanie (Shallow Fetching on-demand: /api/member-details) */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="edit-member-notes" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Notatki i indywidualne uwagi</span>
                    {loadingDetails && (
                      <span className="text-[10px] text-indigo-600 font-normal animate-pulse flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> dociąganie szczegółów...
                      </span>
                    )}
                  </label>
                  {memberDetails && !loadingDetails && (
                    <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ✓ Szczegóły zsynchronizowane
                    </span>
                  )}
                </div>
                <textarea
                  id="edit-member-notes"
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 outline-none font-medium resize-none placeholder-slate-400 bg-white"
                  placeholder="Wpisz indywidualne uwagi lub notatki..."
                />
                {memberDetails?.odpowiedziAnkiet && (
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <span className="font-semibold text-slate-800 block text-[11px]">Odpowiedzi z ankiety rekrutacyjnej:</span>
                    <pre className="text-[10px] text-slate-500 whitespace-pre-wrap font-mono max-h-24 overflow-y-auto">
                      {typeof memberDetails.odpowiedziAnkiet === 'object'
                        ? JSON.stringify(memberDetails.odpowiedziAnkiet, null, 2)
                        : String(memberDetails.odpowiedziAnkiet)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action buttons pinned at bottom of left column */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-2"
                >
                  <Check size={16} strokeWidth={2.2} />
                  <span>Zapisz zmiany</span>
                </button>
              </div>
            </form>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              MIDDLE COLUMN (4/12): Karta Frekwencji + Skalowalna Oś Spotkań
          ══════════════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-4 p-5 space-y-4 bg-slate-50/40">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <BarChart3 size={14} strokeWidth={2.2} />
                </span>
                <span>Frekwencja i Zaangażowanie</span>
              </h3>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isCertEligible
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}>
                {isCertEligible ? '✓ Kwalifikacja' : 'W toku (brakuje)'}
              </span>
            </div>

            {/* ── Summary Stats Header Card ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Frekwencja roczna:</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                      {freqPercent}%
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${engagement.color}`}>
                      <VectorRingIndicator color={engagement.ringColor || 'emerald'} size={11} />
                      <span>{engagement.label}</span>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold text-slate-400">Mianownik bazowy:</span>
                  <p className="text-xs font-bold text-slate-700 font-mono">
                    {freqData.presentMandatory} / {freqData.mandatoryTotal} spotkań
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 flex">
                  <div
                    className={`h-full transition-all duration-300 ${
                      freqPercent >= 75 ? 'bg-emerald-500' : freqPercent >= 50 ? 'bg-teal-500' : freqPercent >= 25 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, freqPercent))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 font-medium">
                  <span>Próg zaświadczenia: {attendanceConfig?.minPassingPercent || 50}%</span>
                  <span>100% ({freqData.mandatoryTotal || 12}/{freqData.mandatoryTotal || 12})</span>
                </div>
              </div>

              {/* 4 Metric Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
                <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-xl p-1.5 text-center">
                  <span className="block text-[9px] font-bold text-emerald-700 uppercase">Zaliczone</span>
                  <span className="text-sm font-black text-emerald-900 font-mono">
                    {freqData.totalAttended}
                  </span>
                </div>
                <div className="bg-slate-100/70 border border-slate-200/70 rounded-xl p-1.5 text-center">
                  <span className="block text-[9px] font-bold text-slate-600 uppercase">Wymagane</span>
                  <span className="text-sm font-black text-slate-900 font-mono">
                    {freqData.mandatoryTotal}
                  </span>
                </div>
                <div className="bg-rose-50/70 border border-rose-200/70 rounded-xl p-1.5 text-center">
                  <span className="block text-[9px] font-bold text-rose-700 uppercase">Nieobecności</span>
                  <span className="text-sm font-black text-rose-900 font-mono">
                    {freqData.absent}
                  </span>
                </div>
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-1.5 text-center">
                  <span className="block text-[9px] font-bold text-amber-800 uppercase">Punkty ogółem</span>
                  <span className="text-sm font-black text-amber-950 font-mono flex items-center justify-center gap-1">
                    <Zap size={12} strokeWidth={2.2} className="text-amber-500 shrink-0" />
                    <span>{freqData?.totalPoints ?? ((freqData?.meetingPoints ?? 0) + (totalTenurePoints ?? 0))}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── Historia Ról i Funkcji w Kole ── */}
            <div className="bg-white border border-amber-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Award size={14} className="text-amber-600" />
                  <span>Historia ról i funkcji w Kole ({memberTenures.length})</span>
                </span>
                {totalTenurePoints > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                    <Zap size={11} strokeWidth={2.2} className="shrink-0" />
                    <span>Punkty funkcyjne: +{totalTenurePoints} pkt</span>
                  </span>
                )}
              </div>

              {memberTenures.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-1 text-center">
                  Brak zarejestrowanych ról zarządowych dla tego członka.
                </p>
              ) : (
                <div className="space-y-1.5 pt-0.5 max-h-40 overflow-y-auto pr-1">
                  {memberTenures.map(t => (
                    <div
                      key={t.id || `${t.roleName}_${t.startDate}`}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 pr-1">
                        <span className="text-xs font-bold text-slate-900 block truncate">
                          {t.roleName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] mt-0.5 flex-wrap">
                          {t.isActive ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <VectorRingIndicator color="emerald" size={10} />
                              <span>W trakcie (od {t.startDate || '—'})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-semibold bg-slate-200/80 text-slate-700 border border-slate-300">
                              <VectorRingIndicator color="slate" size={10} />
                              <span>{t.startDate || '—'} do {t.endDate || '—'}</span>
                            </span>
                          )}
                          <span className="text-slate-400">
                            • {t.monthsInScope || 0} mies. w tym roku ({t.lifetimeMonths || 0} mies. łącznie)
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-indigo-700 font-mono bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200 inline-block">
                          +{t.calculatedPoints} pkt
                        </span>
                        {(t.lifetimePoints || 0) > (t.calculatedPoints || 0) && (
                          <span className="block text-[9px] text-slate-400 font-medium mt-0.5" title="Suma punktów od początku pełnienia roli">
                            +{t.lifetimePoints} pkt łącznie
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Scalable Timeline Grid (Elastyczna siatka kafelków spotkań) ── */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-indigo-600" />
                  <span>Oś czasu spotkań w roku ({auditedMeetings.length}):</span>
                </span>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Obecny</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Nieobecny</span>
                </div>
              </div>

              {/* Elastyczna, zwarta siatka kafelków rosnąca swobodnie w dół */}
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 pt-1 max-h-72 overflow-y-auto pr-1">
                {auditedMeetings.map(m => {
                  const isAtt = m.isAttended;
                  const isMand = m.isEligibleMandatory;
                  const typeId = m.typeId || 'mandatory';
                  const code = String(m.code || m.id || '').replace(/[\[\]]/g, '');

                  let tileStyle = 'bg-slate-100 text-slate-500 border-slate-200';
                  let tileTooltip = '';
                  if (isAtt) {
                    tileStyle = 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold';
                    tileTooltip = `${m.title || code} (${m.date || 'Brak daty'}) - Zaliczona (obecność potwierdzona)`;
                  } else if (isMand) {
                    tileStyle = 'bg-rose-50 text-rose-700 border-rose-200 font-semibold';
                    tileTooltip = `${m.title || code} (${m.date || 'Brak daty'}) - Nieobecność (spotkanie obowiązkowe)`;
                  } else if (typeId === 'internal') {
                    tileStyle = 'bg-blue-50 text-blue-700 border-blue-200 font-medium';
                    tileTooltip = `${m.title || code} (${m.date || 'Brak daty'}) - Wewnętrzne Zarządu (nie obniża frekwencji)`;
                  } else if (typeId === 'trigger_warning') {
                    tileStyle = 'bg-orange-50 text-orange-700 border-orange-200 font-medium';
                    tileTooltip = `${m.title || code} (${m.date || 'Brak daty'}) - Trigger Warning (nie obniża frekwencji)`;
                  } else if (typeId === 'optional') {
                    tileStyle = 'bg-amber-50 text-amber-700 border-amber-200 font-medium';
                    tileTooltip = `${m.title || code} (${m.date || 'Brak daty'}) - Nieobowiązkowe (nie obniża frekwencji)`;
                  } else {
                    tileStyle = 'bg-slate-100 text-slate-500 border-slate-200 font-medium';
                    tileTooltip = `${m.title || code} (${m.date || 'Brak daty'}) - Brak listy w bazie (nie obniża frekwencji)`;
                  }

                  return (
                    <div
                      key={m.id || m.code}
                      className={`px-1.5 py-1.5 rounded-lg border text-center text-xs transition cursor-default flex flex-col items-center justify-center hover:scale-105 ${tileStyle}`}
                      title={tileTooltip}
                    >
                      <span className="font-mono text-[10px] font-bold leading-none">{code}</span>
                      <span className="text-[8px] opacity-90 mt-0.5">{isAtt ? '✓' : isMand ? '✕' : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* ══════════════════════════════════════════════════════════════════
              RIGHT COLUMN (4/12): Pojemna, niezależnie przewijana Historia Obecności
          ══════════════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-4 p-5 space-y-3 bg-white flex flex-col">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 shrink-0">
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileCheck2 size={15} className="text-indigo-600" />
                <span>Historia spotkań studenta</span>
              </span>
              
              {/* Filter pills */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setAttendanceFilter('all')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    attendanceFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Wszystkie ({auditedMeetings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceFilter('attended')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    attendanceFilter === 'attended' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Zaliczone ({freqData.totalAttended})
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceFilter('absent')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    attendanceFilter === 'absent' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Braki ({freqData.absent})
                </button>
              </div>
            </div>

            {/* Independently scrollable list h-[72vh] */}
            <div className="h-[68vh] xl:h-[73vh] overflow-y-auto pr-1 space-y-2 custom-scrollbar flex-1">
              {filteredAuditedMeetings.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-medium">
                  Brak spotkań w wybranej kategorii.
                </div>
              ) : (
                filteredAuditedMeetings.map(m => {
                  const isAtt = m.isAttended;
                  const cleanCode = String(m.code || m.id || '').replace(/[\[\]]/g, '');

                  return (
                    <div
                      key={m.id || m.code}
                      className={`p-2.5 rounded-2xl border transition flex flex-col gap-1.5 ${
                        isAtt
                          ? 'bg-emerald-50/50 border-emerald-200/80 hover:bg-emerald-50/80'
                          : 'bg-white border-slate-200/80 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="font-mono text-xs font-bold text-indigo-950 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200">
                            {cleanCode}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${m.typeConfig.badgeClass}`}>
                            {m.typeConfig.label}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {isAtt ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle size={14} strokeWidth={2.2} className="text-emerald-700" />
                              <span>Zaliczona</span>
                            </span>
                          ) : m.isEligibleMandatory ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle size={14} strokeWidth={2.2} className="text-rose-500" />
                              <span>Nieobecność</span>
                            </span>
                          ) : m.typeId === 'internal' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200" title="Spotkanie wewnętrzne zarządu - nie obniża frekwencji">
                              <span>Zarząd (nie obniża %)</span>
                            </span>
                          ) : m.typeId === 'trigger_warning' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200" title="Tematyka wrażliwa - wyłączona z obowiązku">
                              <span>TW (nie obniża %)</span>
                            </span>
                          ) : m.typeId === 'optional' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200" title="Spotkanie otwarte / fakultatywne - nie obniża frekwencji">
                              <span>Nieobowiązkowe</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200" title="Brak zarejestrowanej listy obecności - nie obniża frekwencji">
                              <span>Brak listy</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <p className="text-xs font-bold text-slate-900 leading-snug">
                        {m.title || 'Spotkanie merytoryczne koła'}
                      </p>

                      {/* Footer Info: Date & Meet Duration */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} strokeWidth={2.2} className="text-slate-400 shrink-0" />
                          <span>{m.date || m.dataSpotkania || 'Brak daty'}</span>
                        </span>
                        {isAtt && (
                          <span className="font-mono font-bold text-emerald-700 flex items-center gap-1">
                            <Timer size={12} strokeWidth={2.2} className="shrink-0" />
                            <span>Czas na Meet: {m.durationStr}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
