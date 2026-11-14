// ─── Activity Options & Authoritative Official Members Master Registry ────────
import { getMeetingStatusInfo } from './meetingTypes.js';
import { ACTIVITY_WEIGHTS, ACTIVITY_WEIGHTS_METADATA, getActivityWeight } from './activityWeights.js';
import { normalizeStudentIndex } from './helpers.js';
import { getMeetingAttendanceStorageKeys } from './storage.js';

export { normalizeStudentIndex };

export const ACTIVITY_OPTIONS = [
  { id: 'PREZENTACJA', label: 'Prezentacja merytoryczna / Referat', icon: '', points: ACTIVITY_WEIGHTS.PREZENTACJA },
  { id: 'DYSKUSJA', label: 'Aktywna dyskusja / Pytania', icon: '', points: ACTIVITY_WEIGHTS.DYSKUSJA },
  { id: 'KONF_BIER', label: 'Udział bierny / Konferencja Stacjonarna', icon: '', points: ACTIVITY_WEIGHTS.KONF_BIER },
  { id: 'CONF_BIERNA_ONLINE', label: 'Konferencja bierna Online', icon: '', points: ACTIVITY_WEIGHTS.CONF_BIERNA_ONLINE },
  { id: 'POSTER', label: 'Prezentacja posteru naukowego', icon: '', points: ACTIVITY_WEIGHTS.POSTER },
  { id: 'ORG_LOGIST', label: 'Pomoc organizacyjna / Obsługa techniczna', icon: '', points: ACTIVITY_WEIGHTS.ORG_LOGIST },
  { id: 'BADANIA', label: 'Udział w badaniach / Zbieranie danych', icon: '', points: ACTIVITY_WEIGHTS.BADANIA },
  { id: 'EDU_VIDEO_PDF', label: 'Materiały Edukacyjne / Video PDF', icon: '', points: ACTIVITY_WEIGHTS.EDU_VIDEO_PDF },
  { id: 'KONF_AKTYW', label: 'Wystąpienie na konferencji', icon: '', points: ACTIVITY_WEIGHTS.KONF_AKTYW },
  { id: 'OB_STACJO', label: 'Obecność Stacjonarna', icon: '', points: ACTIVITY_WEIGHTS.OB_STACJO },
];

/**
 * Autorytatywny rejestr członków (Czysty szablon)
 */
export const OFFICIAL_MEMBERS_MASTER_REGISTRY = {};

export const activityRegistry = OFFICIAL_MEMBERS_MASTER_REGISTRY;

/**
 * Zwraca bezpieczne statystyki członka na podstawie numeru indeksu
 */
export const getMemberStats = (indexNumber) => {
  if (!indexNumber) {
    return { points: 0, freq: 0, attended: 0, absences: 12, present: 0, absent: 12 };
  }
  const cleanIdx = normalizeStudentIndex(indexNumber);
  const rec = OFFICIAL_MEMBERS_MASTER_REGISTRY[cleanIdx] || OFFICIAL_MEMBERS_MASTER_REGISTRY[String(indexNumber)];
  if (!rec) {
    return { points: 0, freq: 0, attended: 0, absences: 12, present: 0, absent: 12 };
  }
  const freq = typeof rec.freq === 'number' ? rec.freq : (typeof rec.attendancePercent === 'number' ? rec.attendancePercent : 0);
  const attended = typeof rec.attended === 'number' ? rec.attended : (typeof rec.present === 'number' ? rec.present : 0);
  const absences = typeof rec.absences === 'number' ? rec.absences : (typeof rec.absent === 'number' ? rec.absent : Math.max(0, 12 - attended));
  const points = typeof rec.points === 'number' ? rec.points : 0;
  return {
    ...rec,
    points,
    freq,
    attended,
    absences,
    present: attended,
    absent: absences,
  };
};

/**
 * Sprawdza czy rekord z bazy oficjalnej istnieje dla danego indeksu / nazwiska
 */
export function getOfficialMemberRecord(memberOrIndex) {
  if (!memberOrIndex) return null;
  const rawIdx = typeof memberOrIndex === 'object' ? (memberOrIndex.index || memberOrIndex.nrIndeksu) : memberOrIndex;
  const cleanIdx = normalizeStudentIndex(rawIdx);
  if (cleanIdx && OFFICIAL_MEMBERS_MASTER_REGISTRY[cleanIdx]) {
    return OFFICIAL_MEMBERS_MASTER_REGISTRY[cleanIdx];
  }
  const rawStr = String(rawIdx || '').trim();
  if (rawStr && OFFICIAL_MEMBERS_MASTER_REGISTRY[rawStr]) {
    return OFFICIAL_MEMBERS_MASTER_REGISTRY[rawStr];
  }
  return null;
}

/**
 * Oblicza łączną sumę punktów dla danego członka, łącząc:
 * 1. Punkty startowe z oficjalnej bazy (OFFICIAL_MEMBERS_MASTER_REGISTRY)
 * 2. Punkty przypisane w sesji (z local storage - crm_attendance_*)
 */
export function calculateTotalMemberPoints(member, meetings = [], weights = {}, orgId = null) {
  if (!member) return 0;
  const cleanIdx = normalizeStudentIndex(member.index || member.nrIndeksu);
  const cleanOrgId = orgId || member?.organization_id || (typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : 'skn_seksuologii');
  let pts = 0;

  // 1. Sprawdź czy jest wpis w oficjalnym rejestrze
  const official = getOfficialMemberRecord(member);
  if (official && typeof official.points === 'number') {
    pts = official.points;
  }

  // 2. Dodaj punkty z nowo przypisanych w sesji aktywności ze spotkań (localStorage z pełną izolacją per koło)
  if (typeof window !== 'undefined') {
    meetings.forEach(m => {
      const statusInfo = getMeetingStatusInfo(m);
      if (statusInfo.isUpcoming && !statusInfo.isCompleted) return;
      const keys = getMeetingAttendanceStorageKeys(cleanOrgId, m);
      for (const meetingKey of keys) {
        try {
          const savedRaw = localStorage.getItem(meetingKey);
          if (savedRaw) {
            const savedData = JSON.parse(savedRaw);
            const attendees = savedData.attendees || [];
            const matched = attendees.find(att => {
              const attIdx = normalizeStudentIndex(att.member?.index || att.index);
              if (cleanIdx && attIdx === cleanIdx) return true;
              if (member.fullName && att.rawName && att.rawName.toLowerCase().includes(member.lastName?.toLowerCase() || '')) return true;
              return false;
            });

            if (matched) {
              const activities = Array.isArray(matched.activities) ? matched.activities : [];
              activities.forEach(actId => {
                const w = getActivityWeight(actId, weights, 0);
                pts += w;
              });
              break; // znaleziono dane w pierwszym pasującym kluczu
            }
          }
        } catch {}
      }
    });
  }

  return pts;
}

export const HISTORICAL_MEMBER_ACTIVITIES = {};

export const getMemberPointsSum = calculateTotalMemberPoints;

export default OFFICIAL_MEMBERS_MASTER_REGISTRY;
