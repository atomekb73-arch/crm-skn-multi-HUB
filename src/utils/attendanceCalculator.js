import { getAcademicScope, isEwidencjaInAcademicScope } from './academicScope.js';
import { isMemberAttendedIndexed, buildAttendanceIndex, precompileMeetings } from './attendanceIndexer.js';
import { getMeetingStatusInfo } from './meetingTypes.js';
import { isCertificateEligible } from './helpers.js';
import { getOrgKey } from './storage.js';

/**
 * Silnik dynamicznego wyliczania obecności i frekwencji członka
 * na podstawie listy spotkań przypadających na wybrany zakres akademicki.
 *
 * @param {Object} member - obiekt członka koła (nrIndeksu, email, fullName, aliasy)
 * @param {Array} allMeetings - pełna lista spotkań (z kalendarza / bazy)
 * @param {Object|string} activeScope - aktywny zakres dat { startDate, endDate, yearPrefix, id } lub klucz roku
 * @param {Array} [ewidencjaList] - opcjonalna lista wpisów z ewidencji Google Sheets (SSOT)
 * @param {Object} [options] - opcjonalne prekompilowane struktury { attendanceIndex, eligibleMeetings, scopedEwidencja }
 * @returns {Object} { attendedCount, missedCount, totalCount, attendanceRate, canIssueCertificate, label, present, absent, freq }
 */
export function calculateMemberAttendance(member, allMeetings = [], activeScope = null, ewidencjaList = null, options = {}) {
  if (!member) {
    return {
      attendedCount: 0,
      missedCount: 0,
      totalCount: 0,
      attendanceRate: 0,
      canIssueCertificate: false,
      label: '0 / 0',
      present: 0,
      absent: 0,
      freq: 0,
      displayRate: '0%',
      eligibleMeetings: [],
    };
  }

  // Normalizacja aktywnego zakresu
  let resolvedScope = activeScope;
  if (!resolvedScope || typeof resolvedScope === 'string') {
    resolvedScope = getAcademicScope(resolvedScope || '2026/2027');
  }

  // 1. Sprawdź, czy przekazano prekompilowane spotkania mianownika w options
  const passedEligible = options?.eligibleMeetings;
  const passedMandatory = options?.mandatoryMeetings || passedEligible;
  const passedBonus = options?.bonusMeetings || [];
  const passedIndex = options?.attendanceIndex;
  const customMeetingTypes = options?.customMeetingTypes || {};

  let mandatoryMeetings = passedMandatory;
  let bonusMeetings = passedBonus;

  if (!mandatoryMeetings) {
    const now = new Date();
    const mandatory = [];
    const bonus = [];

    (Array.isArray(allMeetings) ? allMeetings : []).forEach(meeting => {
      if (!meeting) return;
      const rawDate = meeting.start_dt || meeting.data || meeting.date;
      if (!rawDate) return;

      const dateStr = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();

      // a) Zakres dat
      const inRange = (!resolvedScope.startDate || dateStr >= resolvedScope.startDate) &&
                      (!resolvedScope.endDate || dateStr <= resolvedScope.endDate);

      // b) Czy spotkanie się odbyło (SSOT: obecność > czas kalendarzowy)
      const meetStatus = getMeetingStatusInfo(meeting);
      const isPast = meetStatus.isCompleted || (
        !meetStatus.isUpcoming && (
          new Date(dateStr) <= now ||
          (meeting.status && String(meeting.status).includes('Zakończone')) ||
          (meeting.attendanceCount && Number(meeting.attendanceCount) > 0)
        )
      );

      if (!inRange || !isPast) return;

      // c) Manual override
      if (meeting.countsInFrequency === false || meeting.includeInFrequency === false || meeting.wliczajDoFrekwencji === false) {
        bonus.push(meeting);
        return;
      }
      if (meeting.countsInFrequency === true || meeting.includeInFrequency === true || meeting.wliczajDoFrekwencji === true) {
        mandatory.push(meeting);
        return;
      }

      // d) Reguły typów
      const title = (meeting.title || '').toLowerCase();
      const rawCharakter = String(meeting.charakter || meeting.type || '').toLowerCase();
      const isInternal = title.includes('inauguracja') || title.includes('wewnętrzn') || title.includes('wewnetrzn') || title.includes('zarząd') || title.includes('zarzad');
      const isOptional = title.includes('otwart') || title.includes('warsztat') || title.includes('dyskusyjn') || title.includes('dodatkow') || title.includes('trigger') || title.includes('trauma');

      if (isInternal || isOptional || rawCharakter.includes('zarząd') || rawCharakter.includes('nieobowiązkow') || rawCharakter.includes('trigger')) {
        bonus.push(meeting);
      } else {
        mandatory.push(meeting);
      }
    });

    mandatoryMeetings = precompileMeetings(mandatory);
    bonusMeetings = precompileMeetings(bonus);
  }

  const totalMandatory = mandatoryMeetings.length;
  const eligibleMeetings = mandatoryMeetings;
  const totalEligible = eligibleMeetings ? eligibleMeetings.length : 0;

  // SZYBKA ŚCIEŻKA (FAST PATH O(M) z indeksem Hash Map):
  if (passedIndex) {
    let mandatoryAttended = 0;
    for (let i = 0; i < mandatoryMeetings.length; i++) {
      if (isMemberAttendedIndexed(member, mandatoryMeetings[i], passedIndex)) {
        mandatoryAttended++;
      }
    }

    let bonusAttended = 0;
    for (let i = 0; i < bonusMeetings.length; i++) {
      if (isMemberAttendedIndexed(member, bonusMeetings[i], passedIndex)) {
        bonusAttended++;
      }
    }

    const totalAttended = mandatoryAttended + bonusAttended;
    const missedCount = Math.max(0, totalMandatory - mandatoryAttended);
    const attendanceRate = totalMandatory > 0
      ? Math.min(100, Math.round((mandatoryAttended / totalMandatory) * 100))
      : 0;
    const canIssueCertificate = isCertificateEligible({
      attendancePercent: attendanceRate,
      attendedMandatoryCount: mandatoryAttended,
    }, options?.settings || {});

    return {
      attendedCount: mandatoryAttended,
      missedCount,
      totalCount: totalMandatory,
      attendanceRate,
      canIssueCertificate,
      label: `${mandatoryAttended} / ${missedCount}`,
      present: mandatoryAttended,
      absent: missedCount,
      presentMandatory: mandatoryAttended,
      mandatoryTotal: totalMandatory,
      mandatoryAttended,
      bonusAttended,
      totalAttended,
      freq: attendanceRate,
      displayRate: `${attendanceRate}%`,
      eligibleMeetings,
    };
  }

  // Normalizacja identyfikatorów studenta dla wolnej ścieżki
  const rawIdx = String(member.nrIndeksu || member.index || member.cleanIndex || member.indexNumber || '').trim();
  const cleanIdxDigits = rawIdx.replace(/\D/g, '').replace(/^0+/, '').trim();
  const rawEmail = String(member.email || '').trim().toLowerCase();
  const rawFullName = String(member.fullName || member.name || `${member.firstName || ''} ${member.lastName || ''}`).trim().toLowerCase();
  const rawAliases = String(member.aliasy || member.aliases || member.alias || '').trim().toLowerCase();

  // Pobranie ewidencji (opcjonalnie z parametru options.scopedEwidencja, parametru lub localStorage)
  let scopedEwidencja = options?.scopedEwidencja || null;
  if (!scopedEwidencja) {
    let activeEwidencja = Array.isArray(ewidencjaList) ? ewidencjaList : null;
    if (!activeEwidencja && typeof window !== 'undefined' && window.localStorage) {
      try {
        const orgId = options?.organization_id || options?.orgId || member?.organization_id || (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : 'skn_seksuologii');
        const orgKey = orgId ? getOrgKey(orgId, 'crm_ewidencja') : null;
        const raw = (orgKey ? localStorage.getItem(orgKey) : null) || (orgId ? localStorage.getItem(`${orgId}_crm_ewidencja`) : null) || (orgId ? localStorage.getItem(`crm_ewidencja_${orgId}`) : null);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) activeEwidencja = parsed;
        }
      } catch {}
    }
    if (!activeEwidencja) activeEwidencja = [];
    scopedEwidencja = activeEwidencja.filter(e => isEwidencjaInAcademicScope(e, resolvedScope, allMeetings));
  }

  // 3. Zlicz obecności danego członka w wyselekcjonowanych spotkaniach
  let attendedCount = 0;

  eligibleMeetings.forEach(meeting => {
    const attendees = meeting.listaObecnosci || meeting.attendees || meeting.participantRecords || [];

    // a) Sprawdź w liście obecności spotkania
    let wasPresent = attendees.some(att => {
      if (!att) return false;
      if (typeof att === 'object') {
        const attIdx = String(att.nrIndeksu || att.index || att.member?.index || att.member?.nrIndeksu || '').replace(/\D/g, '').replace(/^0+/, '').trim();
        const attEmail = String(att.email || att.member?.email || '').trim().toLowerCase();
        const attName = String(att.name || att.fullName || att.rawName || att.member?.fullName || '').trim().toLowerCase();

        const isApproved = att.manualApproved !== undefined
          ? Boolean(att.manualApproved)
          : (att.status === 'approved' || att.status === 'Zaliczona' || att.status === 'Zaliczono' || att.isEligible !== false);

        if (!isApproved) return false;
        if (cleanIdxDigits && attIdx && cleanIdxDigits === attIdx) return true;
        if (rawEmail && attEmail && rawEmail === attEmail) return true;
        if (rawFullName && attName && (rawFullName === attName || attName.includes(rawFullName) || rawFullName.includes(attName))) return true;
        return false;
      }

      // Prosty string w tablicy (np. indeks lub email)
      const str = String(att).trim();
      const cleanStr = str.replace(/\D/g, '').replace(/^0+/, '').trim();
      if (cleanIdxDigits && cleanStr && cleanIdxDigits === cleanStr) return true;
      if (rawEmail && str.toLowerCase() === rawEmail) return true;
      return false;
    });

    // b) Sprawdź w centralnej ewidencji Google Sheets (scoped)
    if (!wasPresent && scopedEwidencja.length > 0) {
      const mCode = String(meeting.code || meeting.id || '').replace(/[\[\]]/g, '').trim().toUpperCase();
      const mDate = String(meeting.date || (meeting.start_dt ? meeting.start_dt.split('T')[0] : '')).trim();

      wasPresent = scopedEwidencja.some(e => {
        const eIdx = String(e.nrIndeksu || e.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
        const eEmail = String(e.email || '').trim().toLowerCase();
        const eName = String(e.name || e.fullName || '').trim().toLowerCase();

        let studentMatched = false;
        if (cleanIdxDigits && eIdx && cleanIdxDigits === eIdx) studentMatched = true;
        else if (rawEmail && eEmail && rawEmail === eEmail) studentMatched = true;
        else if (rawFullName && eName && (rawFullName === eName || eName.includes(rawFullName))) studentMatched = true;
        else if (rawAliases && (eIdx && rawAliases.includes(eIdx) || eName && rawAliases.includes(eName))) studentMatched = true;

        if (!studentMatched) return false;

        const eCode = String(e.kodSpotkania || e.meetingCode || '').replace(/[\[\]]/g, '').trim().toUpperCase();
        if (mCode && eCode && mCode === eCode) return true;
        if (mDate && e.dataSpotkania && String(e.dataSpotkania).trim() === mDate) return true;

        return false;
      });
    }

    if (wasPresent) {
      attendedCount++;
    }
  });

  const missedCount = Math.max(0, totalEligible - attendedCount);
  const attendanceRate = totalEligible > 0 ? Math.min(100, Math.round((attendedCount / totalEligible) * 100)) : 0;
  const canIssueCertificate = isCertificateEligible({
    attendancePercent: attendanceRate,
    attendedMandatoryCount: attendedCount,
  }, options?.settings || {});

  return {
    attendedCount,
    missedCount,
    totalCount: totalEligible,
    attendanceRate,
    canIssueCertificate,
    label: `${attendedCount} / ${missedCount}`,
    // Aliasy dla spójności z resztą aplikacji:
    present: attendedCount,
    absent: missedCount,
    freq: attendanceRate,
    displayRate: `${attendanceRate}%`,
    eligibleMeetings,
  };
}

export default calculateMemberAttendance;
