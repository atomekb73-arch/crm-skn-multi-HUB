import { fetchAllTenantRows } from '../supabaseClient.js';
import { fetchMeetingMetadata } from './meetingMetadataService.js';
import { WSKZ_ORGANIZATIONS, getWskzOrgById, getWskzOrgBySubcalendarId, isSubcalendarExcluded } from '../config/wskzRegistry.js';
import { fetchTeamupEvents } from './teamupService.js';
import { getAutoMeetingType } from '../utils/meetingTypes.js';
import { getOrgKey, getOrgStorage, getMeetingAttendanceStorageKeys } from '../utils/storage.js';

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
        yearPrefix: null,
      });
    }
  } catch (err) {
    console.warn('[interClubReport] Błąd pobierania zdarzeń z Teamup:', err);
  }

  // 3. Pobieranie metadanych (meeting_metadata lub fallback [MEETING_META] w attendance) z Supabase + localStorage
  const metadataMap = {}; // klucz: `${orgId}__${meeting_key}`
  try {
    const metaResults = await Promise.allSettled(
      activeOrgIds.map(async (orgId) => ({
        orgId,
        orgMap: await fetchMeetingMetadata(orgId),
      }))
    );

    metaResults.forEach((res) => {
      if (res.status === 'fulfilled' && res.value?.orgMap) {
        const { orgId, orgMap } = res.value;
        Object.entries(orgMap).forEach(([meetingKey, row]) => {
          if (!row) return;
          const k = `${orgId}__${String(row.meeting_key || meetingKey || '').trim()}`;
          metadataMap[k] = row;
        });
      }
    });
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

  // 4. Pobieranie obecności z Supabase (attendance) dla każdego koła z właściwym nagłówkiem tenant + bezpieczny fallback localStorage
  // Ważne: prefiks roku akademickiego ([25/26], [26/27]) i data spotkania muszą być ściśle respektowane,
  // aby nie łączyć uczestników z różnych lat akademickich (np. M04 z 25/26 i M04 z 26/27).
  const attendanceCountMap = {}; // klucze z Supabase: DATE / CODE_DATE / FULLCODE (z rokiem)
  const localAttendanceCountMap = {}; // zapasowy cache z localStorage używany WYŁĄCZNIE gdy brak danych z Supabase (=== 0)
  const YEAR_PREFIX_RE = /^\[?\d{2}\/\d{2}\]?/;
  const SYSTEM_PREFIX_RE = /^\[(?:SETTINGS|DOROBEK|BOARD_TERM|KORESPONDENCJA|MEETING_META|EMAIL_CONFIG|ACCESS_USER|DOKUMENT|OPIEKUN)\]/i;
  try {
    const attResults = await Promise.allSettled(
      activeOrgIds.map(async (orgId) => {
        const { data, error } = await fetchAllTenantRows(
          'attendance',
          orgId,
          { select: 'organization_id, meeting_code, meeting_date, index_number, role' }
        );
        if (error) {
          console.warn(`[interClubReport] Błąd pobierania attendance dla ${orgId}:`, error);
        }
        return { orgId, rows: Array.isArray(data) ? data : [] };
      })
    );

    const uniqueAttendees = {};
    attResults.forEach((res) => {
      if (res.status !== 'fulfilled') return;
      const dbAtt = res.value?.rows || [];
      dbAtt.forEach(row => {
        const rawCode = String(row.meeting_code || '').trim();
        if (!rawCode || SYSTEM_PREFIX_RE.test(rawCode)) return;
        const org = String(row.organization_id || res.value.orgId || '').trim().toLowerCase();
        const code = rawCode.toUpperCase();
        const cleanCode = code.replace(/^\[.*?\]\s*/, '').trim();
        const meetingDate = row.meeting_date ? String(row.meeting_date).trim().slice(0, 10) : '';
        const idx = String(row.index_number || '').trim();
        if (!idx) return;

        const addKey = (k) => {
          if (!k) return;
          if (!uniqueAttendees[k]) uniqueAttendees[k] = new Set();
          uniqueAttendees[k].add(idx);
        };

        if (meetingDate) {
          addKey(`${org}__DATE__${meetingDate}`);
          if (cleanCode) {
            addKey(`${org}__CODE_DATE__${cleanCode}__${meetingDate}`);
          }
          addKey(`${org}__CODE_DATE__${code}__${meetingDate}`);
        }

        // Pełny kod bez daty indeksujemy WYŁĄCZNIE wtedy, gdy zawiera jawny prefiks roku (np. [26/27] M04)
        if (YEAR_PREFIX_RE.test(code)) {
          addKey(`${org}__FULLCODE__${code}`);
          addKey(`${org}__FULLCODE__${code.replace(/\s+/g, '')}`);
        }
      });
    });

    Object.entries(uniqueAttendees).forEach(([k, set]) => {
      attendanceCountMap[k] = set.size;
    });
  } catch (err) {
    console.warn('[interClubReport] Błąd pobierania attendance z Supabase:', err);
  }

  // Opcjonalny bufor z localStorage (wyłącznie jako fallback przy braku wpisów w Supabase, z twardą weryfikacją daty/roku)
  const overridesByOrg = {};
  const customTypesByOrg = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    activeOrgIds.forEach(orgId => {
      try {
        const mergedOverrides = {};
        const o1 = getOrgStorage(orgId, 'meeting_overrides', null);
        if (o1 && typeof o1 === 'object') Object.assign(mergedOverrides, o1);
        const rawO2 = localStorage.getItem(`crm_meeting_overrides_${orgId}`);
        if (rawO2) {
          const o2 = JSON.parse(rawO2);
          if (o2 && typeof o2 === 'object') Object.assign(mergedOverrides, o2);
        }
        overridesByOrg[orgId] = mergedOverrides;
      } catch {
        overridesByOrg[orgId] = {};
      }

      try {
        const mergedTypes = {};
        const rawGlobal = localStorage.getItem('crm_meeting_types');
        if (rawGlobal) Object.assign(mergedTypes, JSON.parse(rawGlobal) || {});
        const rawSkn = localStorage.getItem('crm_skn_crm_meeting_types');
        if (rawSkn) Object.assign(mergedTypes, JSON.parse(rawSkn) || {});
        const tOrg = getOrgStorage(orgId, 'crm_meeting_types', null);
        if (tOrg && typeof tOrg === 'object') Object.assign(mergedTypes, tOrg);
        customTypesByOrg[orgId] = mergedTypes;
      } catch {
        customTypesByOrg[orgId] = {};
      }

      try {
        const rawEw = localStorage.getItem(getOrgKey(orgId, 'crm_ewidencja')) ||
          localStorage.getItem(`crm_ewidencja_${orgId}`) ||
          localStorage.getItem(`${orgId}_crm_ewidencja`) ||
          localStorage.getItem('crm_ewidencja');
        if (rawEw) {
          const parsedEw = JSON.parse(rawEw);
          if (Array.isArray(parsedEw)) {
            const tempSet = {};
            parsedEw.forEach(item => {
              const code = String(item.kodSpotkania || item.meetingCode || '').trim().toUpperCase();
              const cleanCode = code.replace(/^\[.*?\]\s*/, '').trim();
              const rawItemDate = String(item.dataSpotkania || item.date || '').trim();
              const itemDate = /^\d{4}-\d{2}-\d{2}/.test(rawItemDate) ? rawItemDate.slice(0, 10) : '';
              const hasYearPrefix = YEAR_PREFIX_RE.test(code);
              const idx = String(item.nrIndeksu || item.index || item.name || '').trim();
              if (!idx || (!itemDate && !hasYearPrefix)) return;

              const addEw = (k) => {
                if (!k) return;
                if (!tempSet[k]) tempSet[k] = new Set();
                tempSet[k].add(idx);
              };
              if (itemDate) {
                addEw(`${orgId}__DATE__${itemDate}`);
                if (cleanCode) addEw(`${orgId}__CODE_DATE__${cleanCode}__${itemDate}`);
              }
              if (hasYearPrefix) {
                addEw(`${orgId}__FULLCODE__${code}`);
                addEw(`${orgId}__FULLCODE__${code.replace(/\s+/g, '')}`);
              }
            });
            Object.entries(tempSet).forEach(([k, s]) => {
              if (!localAttendanceCountMap[k] || localAttendanceCountMap[k] < s.size) {
                localAttendanceCountMap[k] = s.size;
              }
            });
          }
        }

        // Skanowanie bezpośrednich rekordów obecności w localStorage (wymaga daty lub ID spotkania)
        for (let i = 0; i < localStorage.length; i++) {
          const lk = localStorage.key(i);
          if (lk && lk.includes('attendance') && lk.includes(orgId)) {
            try {
              const val = JSON.parse(localStorage.getItem(lk) || '{}');
              const confirmedCount = val?.confirmedCount ||
                (Array.isArray(val?.confirmedIndexes) ? val.confirmedIndexes.length : (Array.isArray(val?.attendees) ? val.attendees.length : 0));
              if (confirmedCount > 0) {
                const mCode = String(val?.meetingCode || val?.code || '').trim().toUpperCase();
                const cleanMCode = mCode.replace(/^\[.*?\]\s*/, '').trim();
                const rawMDate = String(val?.meetingDate || val?.date || '').trim();
                const mDate = /^\d{4}-\d{2}-\d{2}/.test(rawMDate) ? rawMDate.slice(0, 10) : '';
                const mId = String(val?.meetingId || val?.id || '').trim();

                const setMaxLocal = (k, count) => {
                  if (k && (!localAttendanceCountMap[k] || localAttendanceCountMap[k] < count)) {
                    localAttendanceCountMap[k] = count;
                  }
                };

                if (mId) setMaxLocal(`${orgId}__ID__${mId}`, confirmedCount);
                if (mDate) {
                  setMaxLocal(`${orgId}__DATE__${mDate}`, confirmedCount);
                  if (cleanMCode) setMaxLocal(`${orgId}__CODE_DATE__${cleanMCode}__${mDate}`, confirmedCount);
                }
                if (mCode && YEAR_PREFIX_RE.test(mCode)) {
                  setMaxLocal(`${orgId}__FULLCODE__${mCode}`, confirmedCount);
                  setMaxLocal(`${orgId}__FULLCODE__${mCode.replace(/\s+/g, '')}`, confirmedCount);
                }
              }
            } catch {}
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

    // Szukamy pasujących metadanych z meeting_metadata (z weryfikacją daty przy dopasowaniu innym niż po ID)
    const metaCandidateKeys = [
      `${primaryOrgId}__${evt.id}`,
      evt.code ? `${primaryOrgId}__${evt.code}` : null,
      `${primaryOrgId}__${rawDate}`,
    ].filter(Boolean);
    let matchedMeta = null;
    for (const mk of metaCandidateKeys) {
      const candidate = metadataMap[mk];
      if (!candidate) continue;
      if (mk !== `${primaryOrgId}__${evt.id}` && candidate.meeting_date && String(candidate.meeting_date).slice(0, 10) !== rawDate) {
        continue;
      }
      matchedMeta = candidate;
      break;
    }
    if (!matchedMeta && evt.code) {
      const strippedCode = String(evt.code).replace(/^\[.*?\]\s*/, '').trim();
      const candidate = metadataMap[`${primaryOrgId}__${strippedCode}`];
      if (candidate && (!candidate.meeting_date || String(candidate.meeting_date).slice(0, 10) === rawDate)) {
        matchedMeta = candidate;
      }
    }

    const coOrgsFromMeta = Array.isArray(matchedMeta?.co_organizers) ? matchedMeta.co_organizers : [];
    const allCoOrgIds = Array.from(new Set([...coOrgsFromTeamup, ...coOrgsFromMeta])).filter(id => id !== primaryOrgId);

    // Ustalanie kategorii: 'project' (Sekcja B) vs 'substantive' (Sekcja A)
    const orgOverrides = overridesByOrg[primaryOrgId] || {};
    const orgTypes = customTypesByOrg[primaryOrgId] || {};
    const localOverride = (evt.id && orgOverrides[evt.id]) || (evt.code && orgOverrides[evt.code]) || null;
    const localTypeOverride =
      (evt.id && orgTypes[evt.id]) ||
      (evt.code && orgTypes[evt.code]) ||
      localOverride?.customType ||
      localOverride?.meetingType ||
      localOverride?.type ||
      localOverride?.category ||
      null;

    const metaPayload = matchedMeta?.custom_payload && typeof matchedMeta.custom_payload === 'object'
      ? matchedMeta.custom_payload
      : {};
    const explicitlyExcludedFromDenominator =
      metaPayload.includeInFrequency === false ||
      metaPayload.countsInFrequency === false ||
      metaPayload.includeInDenominator === false ||
      metaPayload.countsTowardsDenominator === false ||
      metaPayload.wliczajDoFrekwencji === false ||
      localOverride?.includeInFrequency === false ||
      localOverride?.countsInFrequency === false ||
      localOverride?.includeInDenominator === false ||
      localOverride?.countsTowardsDenominator === false ||
      localOverride?.wliczajDoFrekwencji === false;

    const detectedType = localTypeOverride || matchedMeta?.meeting_type || getAutoMeetingType(evt);
    const detectedTypeLower = String(detectedType || '').toLowerCase();
    const titleLower = (evt.title || '').toLowerCase();

    const isProjectType = ['project', 'projektowe', 'techniczne', 'robocze'].includes(detectedTypeLower);
    const isProjectTitle =
      titleLower.includes('🔒') ||
      titleLower.includes('spotkanie robocze') ||
      titleLower.includes('robocz') ||
      titleLower.includes('zamkni') ||
      titleLower.includes('grupa projektowa') ||
      titleLower.includes('grupy projektowej') ||
      titleLower.includes('zespół projektowy') ||
      titleLower.includes('zespołu projektowego') ||
      (titleLower.includes('projekt') && (titleLower.includes('grup') || titleLower.includes('zesp') || titleLower.includes('techniczn')));

    const isProject = isProjectType || isProjectTitle || explicitlyExcludedFromDenominator;
    const reportCategory = isProject ? 'project' : 'substantive';

    // Frekwencja pojedynczego spotkania: Math.max(unikalni uczestnicy z ewidencji, ręczne total_participants, evtAttendeesCount)
    // Nigdy nie sumujemy uczestników z bazy z ręczną liczbą całkowitą (z gośćmi).
    const rawCode = String(evt.code || '').trim().toUpperCase();
    const cleanCode = rawCode.replace(/^\[.*?\]\s*/, '').trim();
    const evtHasYearPrefix = YEAR_PREFIX_RE.test(rawCode);
    const checkOrgs = Array.from(new Set([primaryOrgId, ...allCoOrgIds, ...activeOrgIds]));

    let uniqueAttendanceCount = 0;
    for (const orgToCheck of checkOrgs) {
      // 1a. Dopasowanie po kodzie + dokładnej dacie
      if (cleanCode && rawDate) {
        const c1 = attendanceCountMap[`${orgToCheck}__CODE_DATE__${cleanCode}__${rawDate}`] || 0;
        const c2 = rawCode ? (attendanceCountMap[`${orgToCheck}__CODE_DATE__${rawCode}__${rawDate}`] || 0) : 0;
        if (Math.max(c1, c2) > uniqueAttendanceCount) uniqueAttendanceCount = Math.max(c1, c2);
      }
      // 1b. Dopasowanie po pełnym kodzie z rokiem akademickim (np. [26/27] M04)
      if (evtHasYearPrefix) {
        const c3 = attendanceCountMap[`${orgToCheck}__FULLCODE__${rawCode}`] || 0;
        const c4 = attendanceCountMap[`${orgToCheck}__FULLCODE__${rawCode.replace(/\s+/g, '')}`] || 0;
        if (Math.max(c3, c4) > uniqueAttendanceCount) uniqueAttendanceCount = Math.max(c3, c4);
      }
    }
    // 1c. Fallback po samej dokładnej dacie (obsługuje np. M05 gdy ewidencja w bazie ma inny kod na ten sam dzień)
    if (uniqueAttendanceCount === 0 && rawDate) {
      for (const orgToCheck of checkOrgs) {
        const cDate = attendanceCountMap[`${orgToCheck}__DATE__${rawDate}`] || 0;
        if (cDate > uniqueAttendanceCount) uniqueAttendanceCount = cDate;
      }
    }

    // 2. Fallback do localStorage WYŁĄCZNIE gdy brak obecności w Supabase (uniqueAttendanceCount === 0)
    if (uniqueAttendanceCount === 0) {
      for (const orgToCheck of checkOrgs) {
        const specificKeys = [
          evt.id ? `${orgToCheck}__ID__${evt.id}` : null,
          cleanCode && rawDate ? `${orgToCheck}__CODE_DATE__${cleanCode}__${rawDate}` : null,
          evtHasYearPrefix ? `${orgToCheck}__FULLCODE__${rawCode}` : null,
          evtHasYearPrefix ? `${orgToCheck}__FULLCODE__${rawCode.replace(/\s+/g, '')}` : null,
        ].filter(Boolean);
        for (const lk of specificKeys) {
          const lc = localAttendanceCountMap[lk] || 0;
          if (lc > uniqueAttendanceCount) uniqueAttendanceCount = lc;
        }
        if (uniqueAttendanceCount === 0 && rawDate) {
          const lcDate = localAttendanceCountMap[`${orgToCheck}__DATE__${rawDate}`] || 0;
          if (lcDate > uniqueAttendanceCount) uniqueAttendanceCount = lcDate;
        }
      }

      if (uniqueAttendanceCount === 0 && typeof window !== 'undefined' && window.localStorage) {
        try {
          for (const orgToCheck of checkOrgs) {
            const storageKeys = getMeetingAttendanceStorageKeys(orgToCheck, evt);
            for (const sk of storageKeys) {
              const raw = localStorage.getItem(sk);
              if (!raw) continue;
              const parsed = JSON.parse(raw);
              if (!parsed || typeof parsed !== 'object') continue;
              const parsedDate = String(parsed?.meetingDate || parsed?.date || '').trim().slice(0, 10);
              if (parsedDate && parsedDate !== rawDate) continue;
              if (!parsedDate) {
                const hasEventId = evt.id && sk.includes(String(evt.id));
                const hasFullYearCode = evtHasYearPrefix && sk.toUpperCase().includes(rawCode);
                if (!hasEventId && !hasFullYearCode) continue;
              }
              const c = parsed?.confirmedCount ||
                (Array.isArray(parsed?.confirmedIndexes) ? parsed.confirmedIndexes.length : (Array.isArray(parsed?.attendees) ? parsed.attendees.length : 0));
              if (c > uniqueAttendanceCount) uniqueAttendanceCount = c;
            }
          }
        } catch {}
      }
    }

    const manualTotal = matchedMeta && Number(matchedMeta.total_participants) > 0
      ? Number(matchedMeta.total_participants)
      : 0;

    // Sprawdzenie evt.total_participants / evt.attendeesCount / evt.attendees / evt.participantRecords
    const evtAttendeesCount = evt.total_participants || evt.totalParticipants || evt.attendeesCount ||
      (Array.isArray(evt.attendees) ? evt.attendees.length : 0) ||
      (Array.isArray(evt.participantRecords) ? evt.participantRecords.length : 0) ||
      (Array.isArray(evt.listaObecnosci) ? evt.listaObecnosci.length : 0);

    const totalParticipants = Math.max(uniqueAttendanceCount, manualTotal, Number(evtAttendeesCount) || 0);

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

  const projectTotalAttendees = projectMeetings.reduce((sum, m) => sum + (Number(m.totalParticipants) || 0), 0);
  const projectAvgAttendees = projectMeetings.length > 0
    ? Math.round(projectTotalAttendees / projectMeetings.length)
    : 0;

  const totalAllAttendees = substantiveTotalAttendees + projectTotalAttendees;
  const totalAllMeetingsCount = substantiveMeetings.length + projectMeetings.length;
  const totalAllAvgAttendees = totalAllMeetingsCount > 0
    ? Math.round(totalAllAttendees / totalAllMeetingsCount)
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
      projectTotalAttendees,
      projectAvgAttendees,
      totalAllAttendees,
      totalAllAvgAttendees,
      jointEventsCount,
    },
    byOrgStats,
  };
}
