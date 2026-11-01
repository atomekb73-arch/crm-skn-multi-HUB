import { calculateMemberStats } from './meetingTypes.js';
import { ACTIVITY_WEIGHTS } from './activityWeights.js';

/**
 * Kalkulator punktów dorobku członka Koła Naukowego.
 * Oblicza łączną sumę punktów ze wszystkich form aktywności oraz kadencji w zarządzie.
 */
export function calculateMemberPoints(member, ewidencjaList = [], meetings = [], customMeetingTypes = {}, attendanceConfig = {}, boardTenures = null) {
  if (!member) return 0;
  const stats = calculateMemberStats(member, ewidencjaList, meetings, customMeetingTypes, attendanceConfig, boardTenures);
  return stats?.points ?? stats?.totalPoints ?? stats?.punkty ?? 0;
}

/**
 * Oblicza punkty z pojedynczej kadencji w zarządzie (zarówno aktywnej, jak i archiwalnej).
 */
export function calculateBoardTenurePoints(tenure) {
  if (!tenure || !tenure.startDate) return 0;
  const start = new Date(tenure.startDate);
  const end = (tenure.isActive || !tenure.endDate) ? new Date() : new Date(tenure.endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

  const diffTime = Math.max(0, end.getTime() - start.getTime());
  const months = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.4375)));

  const roleName = String(tenure.roleName || tenure.role || '');
  let ptsPerMonth = 3;
  if (roleName.includes('Badań')) ptsPerMonth = 4;
  else if (roleName.includes('IT') || roleName.includes('Social') || roleName.includes('CRM')) ptsPerMonth = 5;

  return months * ptsPerMonth;
}

/**
 * Oblicza czas trwania wydarzenia w dniach (np. piątek - niedziela = 3 dni).
 */
export function calculateEventDays(startDateStr, endDateStr) {
  if (!startDateStr) return 1;
  if (!endDateStr || endDateStr <= startDateStr) return 1;

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 1;

  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

/**
 * Oblicza punkty za udział w wydarzeniu (konferencje, delegacje, spotkania stacjonarne/online, udział bierny).
 * Formuła:
 * 1. Baza dzienna = (dni_obecności || 1) * waga_wybranego_trybu (stacjonarnie/online).
 * 2. Dodatkowe aktywności merytoryczne (wystąpienie, poster, dyskusja itp.) naliczane są JEDNORAZOWO (nie mnożone przez dni).
 */
export function calculateEventPoints(event, customWeights = {}, participantOrDays = null) {
  const breakdown = calculateEventPointsBreakdown(event, customWeights, participantOrDays);
  return breakdown.totalPoints;
}

/**
 * Zwraca szczegółowe rozbicie matematyczne punktów za wydarzenie:
 * - totalPoints: łączna suma punktów
 * - basePoints: suma punktów bazowych dziennych
 * - baseRate: stawka dzienna (np. 3 lub 2 pkt/dzień)
 * - daysAttended: liczba dni obecności
 * - isParticipantOnline: czy tryb bazowy uczestnika to online
 * - oneTimePoints: suma punktów za jednorazowe aktywności merytoryczne
 * - oneTimeDetails: tablica szczegółów aktywności jednorazowych
 * - displayText: czytelny ciąg matematyczny, np. "+19 pkt (3 dni × 3 pkt stacj. + 10 pkt wystąpienie)"
 */
export function calculateEventPointsBreakdown(event, customWeights = {}, participantOrDays = null) {
  if (!event) {
    return {
      totalPoints: 0,
      basePoints: 0,
      baseRate: 0,
      daysAttended: 1,
      isParticipantOnline: false,
      isConferenceOrDelegation: false,
      oneTimePoints: 0,
      oneTimeDetails: [],
      displayText: '0 pkt',
    };
  }

  const startDate = event.startDate || event.date;
  const endDate = event.endDate;
  const totalDays = calculateEventDays(startDate, endDate);

  let daysAttended = totalDays;
  let participantObj = null;

  if (typeof participantOrDays === 'number' && participantOrDays > 0) {
    daysAttended = Math.min(totalDays, participantOrDays);
  } else if (typeof participantOrDays === 'object' && participantOrDays !== null) {
    participantObj = participantOrDays;
    if (typeof participantOrDays.daysAttended === 'number' && participantOrDays.daysAttended > 0) {
      daysAttended = Math.min(totalDays, participantOrDays.daysAttended);
    }
  }

  const meetingTypeStr = String(event.meetingType || event.type || event.customType || event.category || '').toLowerCase();
  const isConferenceOrDelegation = meetingTypeStr.includes('conference') || meetingTypeStr.includes('konf') || meetingTypeStr.includes('delegac') || totalDays > 1;

  // Rozszerzona, bezpieczna detekcja formy spotkania
  const loc = String(event.location || '').toLowerCase();
  const notes = String(event.notes || event.description || '').toLowerCase();
  const title = String(event.title || event.name || '').toLowerCase();
  const mode = String(event.eventMode || event.mode || event.forma || '').toLowerCase();

  // Wykrywanie jawnych przesłanek spotkania stacjonarnego
  const isExplicitStacjo = mode.includes('stacj') || 
                           loc.includes('sala') || 
                           loc.includes('kampus') || 
                           loc.includes('budynek') || 
                           loc.includes('warszaw') || 
                           loc.includes('wrocław') ||
                           loc.includes('wroclaw') ||
                           loc.includes('zielona góra') ||
                           loc.includes('zielona gora') ||
                           loc.includes('stacjon');

  // Wykrywanie przesłanek online (Google Meet, Zoom, Teams, linki)
  const isExplicitOnline = mode.includes('online') || 
                           loc.includes('meet') || 
                           loc.includes('online') || 
                           loc.includes('zoom') || 
                           loc.includes('teams') || 
                           notes.includes('meet.google.com') ||
                           title.includes('online');

  // DOMYŚLNA ZASADA KOŁA:
  // Spotkanie jest ONLINE (1 pkt), chyba że jawnie oznaczono je jako stacjonarne
  const isEventOnlineDefault = isExplicitOnline || !isExplicitStacjo;

  const activities = Array.isArray(participantObj?.activities) ? participantObj.activities : [];

  // Sprawdź czy uczestnik zaznaczył w popoverze własny tryb udziału biernego
  const hasPassiveOnline = activities.includes('CONF_BIERNA_ONLINE') || activities.includes('OB_ONLINE');
  const hasPassiveStacjo = activities.includes('KONF_BIER') || activities.includes('OB_STACJO');

  let isParticipantOnline = isEventOnlineDefault;
  if (hasPassiveOnline && !hasPassiveStacjo) {
    isParticipantOnline = true;
  } else if (hasPassiveStacjo && !hasPassiveOnline) {
    isParticipantOnline = false;
  }

  // ── 1. PUNKTY BAZOWE DZIENNE (Mnożone przez dni obecności) ─────────────────
  let baseRate = 1;
  if (isConferenceOrDelegation) {
    baseRate = isParticipantOnline
      ? (customWeights.CONF_BIERNA_ONLINE?.points ?? customWeights.KONF_BIER_ONLINE?.points ?? 2)
      : (customWeights.KONF_BIER?.points ?? 3);
  } else {
    baseRate = isParticipantOnline
      ? (customWeights.OB_ONLINE?.points ?? 1)
      : (customWeights.OB_STACJO?.points ?? 2);
  }

  const basePoints = daysAttended * baseRate;

  // ── 2. DODATKOWE AKTYWNOŚCI MERYTORYCZNE (Naliczane jednorazowo, NIE mnożone przez dni) ──
  const basePassiveActivityIds = ['KONF_BIER', 'CONF_BIERNA_ONLINE', 'OB_STACJO', 'OB_ONLINE'];
  let oneTimePoints = 0;
  const oneTimeDetails = [];

  const MERIT_ACTIVITY_LABELS = {
    KONF_AKTYW: 'wystąpienie',
    PREZENTACJA: 'referat',
    POSTER: 'poster',
    DYSKUSJA: 'dyskusja',
    BADANIA: 'badania',
    EDU_VIDEO_PDF: 'materiały edukacyjne',
    ORG_LOGIST: 'obsługa org.',
  };

  const DEFAULT_WEIGHTS = {
    KONF_AKTYW: ACTIVITY_WEIGHTS.KONF_AKTYW ?? 10,
    PREZENTACJA: ACTIVITY_WEIGHTS.PREZENTACJA ?? 5,
    POSTER: ACTIVITY_WEIGHTS.POSTER ?? 3,
    DYSKUSJA: ACTIVITY_WEIGHTS.DYSKUSJA ?? 1,
    BADANIA: ACTIVITY_WEIGHTS.BADANIA ?? 5,
    EDU_VIDEO_PDF: ACTIVITY_WEIGHTS.EDU_VIDEO_PDF ?? 8,
    ORG_LOGIST: ACTIVITY_WEIGHTS.ORG_LOGIST ?? 5,
  };

  activities.forEach(actId => {
    if (!basePassiveActivityIds.includes(actId)) {
      const pts = customWeights[actId]?.points ?? DEFAULT_WEIGHTS[actId] ?? 0;
      if (pts > 0) {
        oneTimePoints += pts;
        const label = customWeights[actId]?.label || MERIT_ACTIVITY_LABELS[actId] || actId.toLowerCase();
        oneTimeDetails.push({ id: actId, points: pts, label });
      }
    }
  });

  const totalPoints = basePoints + oneTimePoints;

  // ── 3. FORMULOWANIE CZYTELNEGO OPISU MATEMATYCZNEGO ─────────────
  const modeLabel = isParticipantOnline ? 'online' : 'stacj.';
  const daysText = `${daysAttended} ${daysAttended === 1 ? 'dzień' : 'dni'}`;
  const basePartStr = `${daysText} × ${baseRate} pkt ${modeLabel}`;

  let displayText = `+${totalPoints} pkt (${basePartStr})`;
  if (oneTimePoints > 0) {
    const extraParts = oneTimeDetails.map(d => `${d.points} pkt ${d.label}`).join(' + ');
    displayText = `+${totalPoints} pkt (${basePartStr} + ${extraParts})`;
  }

  return {
    totalPoints,
    basePoints,
    baseRate,
    daysAttended,
    isParticipantOnline,
    isConferenceOrDelegation,
    oneTimePoints,
    oneTimeDetails,
    displayText,
  };
}
