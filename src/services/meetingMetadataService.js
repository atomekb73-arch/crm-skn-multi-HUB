import { supabase, fetchAllTenantRows } from '../supabaseClient';
import { getOrgKey } from '../utils/storage';

/**
 * Normalizuje identyfikator spotkania do stabilnego klucza w tabeli meeting_metadata
 */
export function getNormalizedMeetingKey(meeting) {
  if (!meeting) return '';
  if (typeof meeting === 'string') return meeting.trim();
  return String(meeting.id || meeting.code || meeting.date || '').trim();
}

/**
 * Pobiera z Supabase wszystkie rekordy meeting_metadata dla danego koła
 * z automatycznym zapisem i fallbackiem do localStorage.
 */
export async function fetchMeetingMetadata(orgId = 'skn_seksuologii') {
  const cleanOrg = String(orgId || 'skn_seksuologii').trim().toLowerCase();
  const localKey = getOrgKey(cleanOrg, 'crm_meeting_metadata');

  try {
    const { data, error } = await fetchAllTenantRows('meeting_metadata', cleanOrg);
    if (!error && Array.isArray(data)) {
      const map = {};
      data.forEach(row => {
        if (row.meeting_key) {
          map[row.meeting_key] = row;
        }
      });
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(localKey, JSON.stringify(map));
        } catch {}
      }
      return map;
    }
  } catch (err) {
    console.warn('[fetchMeetingMetadata] Błąd pobierania z Supabase, używam fallbacku z localStorage:', err);
  }

  // Fallback do localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return {};
}

/**
 * Zapisuje lub aktualizuje metadane pojedynczego spotkania w Supabase i localStorage.
 */
export async function saveMeetingMetadataToSupabase(metadataItem) {
  if (!metadataItem || !metadataItem.organization_id || !metadataItem.meeting_key) {
    return null;
  }

  const cleanOrg = String(metadataItem.organization_id).trim().toLowerCase();
  const meetingKey = String(metadataItem.meeting_key).trim();
  const recordId = metadataItem.id || `${cleanOrg}_${meetingKey}`;

  const payload = {
    id: recordId,
    organization_id: cleanOrg,
    meeting_key: meetingKey,
    title: String(metadataItem.title || '').trim(),
    meeting_date: metadataItem.meeting_date || null,
    meeting_type: metadataItem.meeting_type || 'mandatory',
    total_participants: Number(metadataItem.total_participants ?? 0),
    co_organizers: Array.isArray(metadataItem.co_organizers) ? metadataItem.co_organizers : [],
    custom_payload: metadataItem.custom_payload && typeof metadataItem.custom_payload === 'object' ? metadataItem.custom_payload : {},
    updated_at: new Date().toISOString(),
  };

  // 1. Zapis w localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const localKey = getOrgKey(cleanOrg, 'crm_meeting_metadata');
      const raw = localStorage.getItem(localKey);
      const map = raw ? JSON.parse(raw) : {};
      map[meetingKey] = { ...(map[meetingKey] || {}), ...payload };
      localStorage.setItem(localKey, JSON.stringify(map));
    } catch (e) {
      console.warn('[saveMeetingMetadataToSupabase] Błąd zapisu do localStorage:', e);
    }
  }

  // 2. Zapis w Supabase (upsert)
  try {
    const { data, error } = await supabase
      .from('meeting_metadata')
      .upsert(payload, { onConflict: 'organization_id,meeting_key' })
      .select();

    if (error) {
      console.warn('[saveMeetingMetadataToSupabase] Błąd upsert w Supabase:', error);
    }
    return data ? data[0] : payload;
  } catch (err) {
    console.warn('[saveMeetingMetadataToSupabase] Wyjątek podczas zapisu w Supabase:', err);
    return payload;
  }
}
