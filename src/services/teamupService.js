import { readSWRData, writeSWRData, CACHE_KEYS } from '../hooks/useCachedData.js';
import { getAcademicYearFromDate } from '../utils/helpers.js';

const DEFAULT_CALENDAR_ID = 'ks9aiux4jiza1ronpd';
const DEFAULT_API_TOKEN = '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112';

const TEAMUP_CALENDAR_ID = import.meta.env?.VITE_TEAMUP_CALENDAR_ID || DEFAULT_CALENDAR_ID;
const TEAMUP_TOKEN = import.meta.env?.VITE_TEAMUP_API_KEY || import.meta.env?.VITE_TEAMUP_TOKEN || DEFAULT_API_TOKEN;

export const DEFAULT_SUBCALENDAR_ID = import.meta.env?.VITE_TEAMUP_SUB_CALENDAR_ID || import.meta.env?.VITE_SUBCALENDAR_ID || '14518766';

export function getCachedTeamupSubcalendars() {
  const cached = readSWRData(CACHE_KEYS.TEAMUP_SUBCALENDARS);
  return cached?.data || [{ id: DEFAULT_SUBCALENDAR_ID, name: '10 💚 SKN Seksuologii' }];
}

export function getCachedTeamupEvents(subcalendarId = DEFAULT_SUBCALENDAR_ID, yearPrefix = '26/27') {
  const targetSubId = String(subcalendarId || DEFAULT_SUBCALENDAR_ID || '').trim();
  const scoped = readSWRData(`${CACHE_KEYS.TEAMUP_EVENTS}_${targetSubId}_${yearPrefix}`);
  if (scoped?.data && Array.isArray(scoped.data) && scoped.data.length > 0) {
    return scoped.data;
  }
  const globalCached = readSWRData(CACHE_KEYS.TEAMUP_EVENTS);
  if (globalCached?.data && Array.isArray(globalCached.data)) {
    return globalCached.data;
  }
  return null;
}

export async function fetchTeamupSubcalendars(customCalendarId = null, customToken = null, targetSubcalendarId = null) {
  const calId = String(customCalendarId || TEAMUP_CALENDAR_ID || DEFAULT_CALENDAR_ID).trim();
  const token = String(customToken || TEAMUP_TOKEN || DEFAULT_API_TOKEN).trim();
  const subIdToFind = String(targetSubcalendarId || DEFAULT_SUBCALENDAR_ID || '14518766').trim();
  const defaultSub = {
    id: subIdToFind,
    name: subIdToFind === '15520561'
      ? '05 🏷️ SKN Psychologii Zachowań Ryzykownych i Uzależnień'
      : '10 💚 SKN Seksuologii'
  };

  if (!token || !calId) {
    return [defaultSub];
  }

  const urlsToTry = [
    `/api-teamup/${calId}/subcalendars`,
    `https://api.teamup.com/${calId}/subcalendars`
  ];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        headers: {
          'Teamup-Token': token,
        },
      });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const data = JSON.parse(text);
          if (data && Array.isArray(data.subcalendars) && data.subcalendars.length > 0) {
            const targetSub = data.subcalendars.find(s => String(s.id) === subIdToFind)
              || data.subcalendars.find(s => String(s.name || '').includes('Uzależn') && subIdToFind === '15520561')
              || data.subcalendars.find(s => String(s.name || '').includes('Seksuolog'))
              || data.subcalendars[0];

            if (targetSub) {
              const result = [{ id: String(targetSub.id), name: targetSub.name || defaultSub.name }];
              writeSWRData(`${CACHE_KEYS.TEAMUP_SUBCALENDARS}_${calId}_${subIdToFind}`, result);
              return result;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Błąd pobierania podkalendarzy z url:', url, err);
    }
  }

  return [defaultSub];
}

export async function fetchTeamupEvents({
  startDate = '2026-10-01',
  endDate = '2027-09-30',
  subcalendarId = DEFAULT_SUBCALENDAR_ID,
  yearPrefix = '26/27',
  calendarId = null,
  token = null,
  bypassCache = false,
  force = false,
} = {}) {
  const isBypass = Boolean(bypassCache || force);
  const calId = String(calendarId || TEAMUP_CALENDAR_ID || DEFAULT_CALENDAR_ID).trim();
  const apiToken = String(token || TEAMUP_TOKEN || DEFAULT_API_TOKEN).trim();
  const targetSubId = String(subcalendarId || DEFAULT_SUBCALENDAR_ID || '').trim();

  if (!apiToken || !calId) {
    return isBypass ? [] : (getCachedTeamupEvents(targetSubId, yearPrefix) || []);
  }

  // Jeśli nie wymuszono bypassCache/force, spróbuj najpierw odczytać cache
  if (!isBypass) {
    const cached = getCachedTeamupEvents(targetSubId, yearPrefix);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      // Sprawdź czy wydarzenia w cache pasują do zakresu dat
      const validCached = cached.filter(evt => {
        const d = evt.date || (evt.start_dt ? evt.start_dt.split('T')[0] : '');
        return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      });
      if (validCached.length > 0) {
        return validCached;
      }
    }
  }

  try {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });

    if (targetSubId) {
      params.append('subcalendarId[]', targetSubId);
    }

    if (isBypass) {
      params.append('_t', Date.now().toString());
    }

    const urlsToTry = [
      `/api-teamup/${calId}/events?${params.toString()}`,
      `https://api.teamup.com/${calId}/events?${params.toString()}`,
    ];

    let eventsData = null;

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          headers: {
            'Teamup-Token': apiToken,
            ...(isBypass ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } : {})
          },
        });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().startsWith('{')) {
            const data = JSON.parse(text);
            if (data && data.events) {
              eventsData = data;
              break;
            }
          }
        }
      } catch (e) {
        console.warn('Błąd podczas próby pobrania wydarzeń z', url, e);
      }
    }

    if (!eventsData || !eventsData.events) {
      return bypassCache ? [] : (getCachedTeamupEvents(targetSubId, yearPrefix) || []);
    }

    const data = eventsData;

    // Ścisłe filtrowanie: wyklucz zdarzenia z innych podkalendarzy oraz spoza zadanego zakresu dat
    const rawEvents = data.events || [];
    const events = rawEvents.filter(evt => {
      if (targetSubId) {
        const subIdMatches = String(evt.subcalendar_id) === String(targetSubId);
        const subIdsMatches = Array.isArray(evt.subcalendar_ids) && evt.subcalendar_ids.some(id => String(id) === String(targetSubId));
        if (!subIdMatches && !subIdsMatches) return false;
      }
      const evtDate = evt.start_dt ? evt.start_dt.split('T')[0] : (evt.startDate || '');
      if (startDate && evtDate && evtDate < startDate) return false;
      if (endDate && evtDate && evtDate > endDate) return false;
      return true;
    });

    console.log('[Teamup] Pobrane wydarzenia Teamup (subcalendar: ' + targetSubId + ', ' + startDate + ' do ' + endDate + '):', events);

    // Sort chronologically by start date
    const sorted = [...events].sort(
      (a, b) => new Date(a.start_dt || a.startDate) - new Date(b.start_dt || b.startDate)
    );

    const mappedEvents = sorted.map((evt, idx) => {
      const codeNum = String(idx + 1).padStart(2, '0');
      const startDateObj = evt.start_dt ? new Date(evt.start_dt) : null;
      const formattedDate = startDateObj
        ? startDateObj.toLocaleString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : evt.start_dt || '';

      const isUpcoming = startDateObj ? startDateObj >= new Date() : false;
      const rawDate = evt.start_dt || evt.startDate;
      const acadYear = getAcademicYearFromDate(rawDate);
      const effectivePrefix = yearPrefix || acadYear.short;

      return {
        id: evt.id || `M${codeNum}`,
        code: `[${effectivePrefix}] M${codeNum}`,
        title: evt.title || 'Spotkanie',
        start_dt: evt.start_dt,
        end_dt: evt.end_dt,
        date: evt.start_dt ? evt.start_dt.split('T')[0] : '',
        formattedDate,
        location: evt.location || '',
        notes: evt.notes || '',
        who: evt.who || '', // Prowadzący
        attendees: [],
        subcalendar_id: evt.subcalendar_id,
        isUpcoming,
        isLive: true,
        academicYear: acadYear.full,
        academicYearShort: acadYear.short,
        academicYearCode: `[${acadYear.short}]`,
      };
    });

    writeSWRData(`${CACHE_KEYS.TEAMUP_EVENTS}_${targetSubId}_${yearPrefix}`, mappedEvents);
    if (!isBypass || yearPrefix === '26/27') {
      writeSWRData(CACHE_KEYS.TEAMUP_EVENTS, mappedEvents);
    }

    try {
      if (yearPrefix === '26/27' || (!yearPrefix && startDate?.startsWith('2026'))) {
        localStorage.setItem('CRM_TEAMUP_MEETINGS_2026_2027', JSON.stringify({
          data: mappedEvents,
          timestamp: Date.now()
        }));
      }
    } catch (e) {
      console.warn('Błąd zapisu CRM_TEAMUP_MEETINGS_2026_2027 w localStorage:', e);
    }

    return mappedEvents;
  } catch (err) {
    console.error('Wyjątek podczas pobierania z Teamup API:', err);
    return getCachedTeamupEvents(targetSubId, yearPrefix) || [];
  }
}
