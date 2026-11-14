import { supabase } from '../supabaseClient.js';
import { WSKZ_ORGANIZATIONS, getWskzOrgById, getWskzOrgBySubcalendarId, isSubcalendarExcluded } from '../config/wskzRegistry.js';
import { fetchTeamupEvents } from './teamupService.js';
import { getAutoMeetingType } from '../utils/meetingTypes.js';
import { getOrgKey } from '../utils/storage.js';

/**
 * Normalizuje tytuł spotkania do porównywania i deduplikacji wydarzeń wspólnych
 */
function normalizeTitle(title = '') {
  return String(title || '')
    .toLowerCase()
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\b(spotkanie|zebranie|warsztat|journal club)\b/gi, '')
    .replace(/[^a-z0-9ąćęłńóśźż]/gi, '')
    .trim();
}

/**
 * Pobiera dane do międzykołowego zestawienia aktywności dla Władz Uczelni.
 * Łączy Teamup API, Supabase (meeting_metadata, attendance) oraz localStorage.
 */
export async function fetchInterClubReportData({
  startDate = '2026-10-01',
  endDate = '2027-09-30',
  selectedOrgIds = [],
}) {
  const orgIdsSet = new Set(selectedOrgIds.map(id => String(id).toLowerCase().trim()));
  const targetOrgs = WSKZ_ORGANIZATIONS.filter(o => orgIdsSet.has(o.orgId.toLowerCase()));
  const selectedOrgsList = targetOrgs.length > 0 ? targetOrgs : WSKZ_ORGANIZATIONS;
  const activeOrgIds = selectedOrgsList.map(o => o.orgId);

  // 1. Zbieramy identyfikatory podkalendarzy Teamup
  const subcalendarIds = selectedOrgsList
    .map(o => o.subcalendarId)
    .filter(id => id && !isSubcalendarExcluded(id));

  // 2. Pobieranie wydarzeń z Teamup API
  let teamupEvents = [];
  try {
    if (subcalendarIds.length > 0) {
      teamupEvents = await fetchTeamupEvents({
        startDate,
        endDate,
        subcalendarIds,
        bypassCache: true,
      });
    }
  } catch (err) {
    console.warn('[interClubReport] Błąd pobierania zdarzeń z Teamup:', err);
  }

  // 3. Pobieranie metadanych (meeting_metadata) z Supabase + fallback localStorage
  const metadataMap = {}; // klucz: `${orgId}__${meeting_key}`
  try {
    const { data: dbMeta } = await supabase
      .from('meeting_metadata')
      .select('*')
      .in('organization_id', activeOrgIds);

    if (Array.isArray(dbMeta)) {
      dbMeta.forEach(row => {
        const k = `${row.organization_id}__${String(row.meeting_key || '').trim()}`;
        metadataMap[k] = row;
      });
    }
  } catch (err) {
    console.warn('[interClubReport] Błąd pobierania meeting_metadata z Supabase:', err);
  }

  // Uzupełnienie metadanych z localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    activeOrgIds.forEach(orgId => {
      try {
        const raw = localStorage.getItem(getOrgKey(orgId, 'crm_meeting_metadata'));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([meetKey, meta]) => {
              const k = `${orgId}__${meetKey}`;
              if (!metadataMap[k]) {
                metadataMap[k] = { ...meta, organization_id: orgId, meeting_key: meetKey };
              }
            });
          }
        }
      } catch {}
    });
  }

  // 4. Pobieranie obecności z Supabase (attendance) + fallback localStorage
  const attendanceCountMap = {}; // klucz: `${orgId}__${meeting_code}` -> liczba unikalnych obecnych
  try {
    const { data: dbAtt } = await supabase
      .from('attendance')
      .select('organization_id, meeting_code, index_number, role')
      .in('organization_id', activeOrgIds);

    if (Array.isArray(dbAtt)) {
      const uniqueAttendees = {};
      dbAtt.forEach(row => {
        const org = String(row.organization_id || '').trim().toLowerCase();
        const code = String(row.meeting_code || '').trim().toUpperCase();
        const cleanCode = code.replace(/^\[.*?\]\s*/, '');
        const idx = String(row.index_number || '').trim();

        const addKey = (k) => {
          if (!uniqueAttendees[k]) uniqueAttendees[k] = new Set();
          if (idx) uniqueAttendees[k].add(idx);
        };

        addKey(`${org}__${code}`);
        if (cleanCode && cleanCode !== code) addKey(`${org}__${cleanCode}`);
      });

      Object.entries(uniqueAttendees).forEach(([k, set]) => {
        attendanceCountMap[k] = set.size;
      });
    }
  } catch (err) {
    console.warn('[interClubReport] Błąd pobierania attendance z Supabase:', err);
  }

  // Fallback z localStorage crm_ewidencja
  if (typeof window !== 'undefined' && window.localStorage) {
    activeOrgIds.forEach(orgId => {
      try {
        const rawEw = localStorage.getItem(getOrgKey(orgId, 'crm_ewidencja'));
        if (rawEw) {
          const parsedEw = JSON.parse(rawEw);
          if (Array.isArray(parsedEw)) {
            const tempSet = {};
            parsedEw.forEach(item => {
              const code = String(item.kodSpotkania || '').trim().toUpperCase();
              const cleanCode = code.replace(/^\[.*?\]\s*/, '');
              const idx = String(item.nrIndeksu || item.index || '').trim();
              const addEw = (c) => {
                const k = `${orgId}__${c}`;
                if (!tempSet[k]) tempSet[k] = new Set();
                if (idx) tempSet[k].add(idx);
              };
              addEw(code);
              if (cleanCode && cleanCode !== code) addEw(cleanCode);
            });
            Object.entries(tempSet).forEach(([k, s]) => {
              if (!attendanceCountMap[k] || attendanceCountMap[k] < s.size) {
                attendanceCountMap[k] = s.size;
              }
            });
          }
        }
      } catch {}
    });
  }

  // 5. Deduplikacja i klasyfikacja wydarzeń
  const eventsByDedupKey = new Map();

  teamupEvents.forEach(evt => {
    const rawDate = evt.date || (evt.start_dt ? evt.start_dt.split('T')[0] : '');
    if (!rawDate) return;
    if (startDate && rawDate < startDate) return;
    if (endDate && rawDate > endDate) return;

    // Główny organizator po subcalendarId
    const primaryOrg = getWskzOrgBySubcalendarId(evt.subcalendar_id) || WSKZ_ORGANIZATIONS[0];
    const primaryOrgId = primaryOrg.orgId;

    // Współorganizatorzy z Teamup subcalendar_ids
    const subIds = Array.isArray(evt.subcalendar_ids) ? evt.subcalendar_ids : [evt.subcalendar_id];
    const coOrgsFromTeamup = subIds
      .map(sid => getWskzOrgBySubcalendarId(sid))
      .filter(o => o && o.orgId !== primaryOrgId)
      .map(o => o.orgId);

    // Szukamy pasujących metadanych z meeting_metadata
    const metaCandidateKeys = [
      `${primaryOrgId}__${evt.id}`,
      `${primaryOrgId}__${evt.code}`,
      `${primaryOrgId}__${rawDate}`,
      `${primaryOrgId}__${String(evt.code || '').replace(/^\[.*?\]\s*/, '')}`,
    ];
    let matchedMeta = null;
    for (const mk of metaCandidateKeys) {
      if (metadataMap[mk]) {
        matchedMeta = metadataMap[mk];
        break;
      }
    }

    const coOrgsFromMeta = Array.isArray(matchedMeta?.co_organizers) ? matchedMeta.co_organizers : [];
    const allCoOrgIds = Array.from(new Set([...coOrgsFromTeamup, ...coOrgsFromMeta])).filter(id => id !== primaryOrgId);

    // Ustalanie kategorii: 'project' (zespoły projektowe) vs 'substantive' (merytoryczne/warsztaty)
    const detectedType = matchedMeta?.meeting_type || getAutoMeetingType(evt);
    const titleLower = (evt.title || '').toLowerCase();
    const isProject = detectedType === 'project' ||
      titleLower.includes('projekt') ||
      titleLower.includes('techniczn') ||
      titleLower.includes('robocz') ||
      titleLower.includes('zarząd') ||
      titleLower.includes('zarzad');

    const reportCategory = isProject ? 'project' : 'substantive';

    // Frekwencja z gośćmi
    let totalParticipants = 0;
    if (matchedMeta && Number(matchedMeta.total_participants) > 0) {
      totalParticipants = Number(matchedMeta.total_participants);
    } else {
      // Pobierz sumę z attendanceCountMap
      const rawCode = String(evt.code || evt.id || '').toUpperCase();
      const cleanCode = rawCode.replace(/^\[.*?\]\s*/, '');
      const countPrimary = attendanceCountMap[`${primaryOrgId}__${rawCode}`] ||
        attendanceCountMap[`${primaryOrgId}__${cleanCode}`] || 0;
      totalParticipants = countPrimary;
    }

    // Klucz deduplikacji: data + znormalizowany tytuł (lub ID Teamup)
    const dedupKey = `${rawDate}___${normalizeTitle(evt.title) || evt.id}`;

    if (!eventsByDedupKey.has(dedupKey)) {
      eventsByDedupKey.set(dedupKey, {
        id: evt.id,
        code: evt.code,
        title: evt.title,
        date: rawDate,
        formattedDate: evt.formattedDate,
        speaker: evt.who || matchedMeta?.custom_payload?.speaker || 'Zarząd Koła / Zaproszony Prelegent',
        location: evt.location || 'Online (Google Meet)',
        primaryOrg,
        coOrgIds: allCoOrgIds,
        coOrgs: allCoOrgIds.map(id => getWskzOrgById(id)).filter(Boolean),
        reportCategory,
        meetingType: detectedType,
        totalParticipants,
        isJointEvent: allCoOrgIds.length > 0,
        rawEvent: evt,
      });
    } else {
      // Łączenie wydarzenia współdzielonego (scalanie współorganizatorów i zachowanie wyższej frekwencji)
      const existing = eventsByDedupKey.get(dedupKey);
      const mergedCoOrgs = Array.from(new Set([...existing.coOrgIds, ...allCoOrgIds, primaryOrgId]))
        .filter(id => id !== existing.primaryOrg.orgId);

      existing.coOrgIds = mergedCoOrgs;
      existing.coOrgs = mergedCoOrgs.map(id => getWskzOrgById(id)).filter(Boolean);
      existing.isJointEvent = mergedCoOrgs.length > 0;
      if (totalParticipants > existing.totalParticipants) {
        existing.totalParticipants = totalParticipants;
      }
    }
  });

  const allProcessedEvents = Array.from(eventsByDedupKey.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Rozdzielenie spotkań: Merytoryczne vs Projektowe
  const substantiveMeetings = allProcessedEvents.filter(e => e.reportCategory === 'substantive');
  const projectMeetings = allProcessedEvents.filter(e => e.reportCategory === 'project');

  // Statystyki ogólne
  const substantiveTotalAttendees = substantiveMeetings.reduce((sum, m) => sum + (Number(m.totalParticipants) || 0), 0);
  const substantiveAvgAttendees = substantiveMeetings.length > 0
    ? Math.round(substantiveTotalAttendees / substantiveMeetings.length)
    : 0;
  const jointEventsCount = allProcessedEvents.filter(e => e.isJointEvent).length;

  // Statystyki per koło (wszystkie 14 kół)
  const byOrgStats = selectedOrgsList.map((org, idx) => {
    const orgId = org.orgId;
    const orgSubstantive = substantiveMeetings.filter(
      m => m.primaryOrg.orgId === orgId || m.coOrgIds.includes(orgId)
    );
    const orgProject = projectMeetings.filter(
      m => m.primaryOrg.orgId === orgId || m.coOrgIds.includes(orgId)
    );
    const orgJoint = allProcessedEvents.filter(
      m => (m.primaryOrg.orgId === orgId && m.isJointEvent) || m.coOrgIds.includes(orgId)
    );
    const orgAttendees = orgSubstantive.reduce((sum, m) => sum + (Number(m.totalParticipants) || 0), 0);

    return {
      lp: idx + 1,
      org,
      substantiveCount: orgSubstantive.length,
      substantiveAttendees: orgAttendees,
      projectCount: orgProject.length,
      jointCount: orgJoint.length,
      totalActivities: orgSubstantive.length + orgProject.length,
    };
  });

  return {
    startDate,
    endDate,
    selectedOrgs: selectedOrgsList,
    allProcessedEvents,
    substantiveMeetings,
    projectMeetings,
    summaryStats: {
      totalEvents: allProcessedEvents.length,
      substantiveEventsCount: substantiveMeetings.length,
      substantiveTotalAttendees,
      substantiveAvgAttendees,
      projectEventsCount: projectMeetings.length,
      jointEventsCount,
    },
    byOrgStats,
  };
}
