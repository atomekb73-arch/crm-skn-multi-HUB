import { getSupabaseForOrg, fetchAllTenantRows } from '../supabaseClient';
import { getOrgKey } from '../utils/storage';

let _meetingMetadataTableMissing = false;

function isTableNotFoundError(err) {
  if (!err) return false;
  const msg = String(err.message || err.details || err.hint || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    err.status === 404 ||
    msg.includes('could not find the table') ||
    msg.includes('meeting_metadata') && msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

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
 * z automatycznym fallbackiem do tabeli attendance ([MEETING_META]) oraz localStorage.
 */
export async function fetchMeetingMetadata(orgId = 'skn_seksuologii') {
  const cleanOrg = String(orgId || 'skn_seksuologii').trim().toLowerCase();
  const localKey = getOrgKey(cleanOrg, 'crm_meeting_metadata');
  const tenantClient = getSupabaseForOrg(cleanOrg);
  const map = {};

  if (!_meetingMetadataTableMissing) {
    try {
      const { data, error } = await fetchAllTenantRows('meeting_metadata', cleanOrg);
      if (!error && Array.isArray(data)) {
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
      if (isTableNotFoundError(error)) {
        _meetingMetadataTableMissing = true;
        console.warn('[fetchMeetingMetadata] Tabela public.meeting_metadata nie istnieje w schemacie Supabase (HTTP 404). Używam bezpiecznego fallbacku w tabeli attendance ([MEETING_META]). Uruchom migrację supabase/migrations/20261114_meeting_metadata.sql.');
      } else if (error) {
        console.warn('[fetchMeetingMetadata] Błąd pobierania meeting_metadata z Supabase:', error);
      }
    } catch (err) {
      if (isTableNotFoundError(err)) {
        _meetingMetadataTableMissing = true;
      } else {
        console.warn('[fetchMeetingMetadata] Wyjątek pobierania meeting_metadata:', err);
      }
    }
  }

  // Fallback chmurowy: rekordy [MEETING_META] w tabeli attendance
  try {
    const { data: metaAttRows, error: attErr } = await tenantClient
      .from('attendance')
      .select('meeting_code, meeting_date, activity_description')
      .eq('organization_id', cleanOrg)
      .like('meeting_code', `[MEETING_META]:${cleanOrg}:%`);

    if (!attErr && Array.isArray(metaAttRows) && metaAttRows.length > 0) {
      metaAttRows.forEach(row => {
        try {
          const parsed = JSON.parse(row.activity_description || '{}');
          if (parsed && parsed.meeting_key) {
            map[parsed.meeting_key] = parsed;
          }
        } catch {}
      });
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(localKey, JSON.stringify(map));
        } catch {}
      }
      return map;
    }
  } catch (err) {
    console.warn('[fetchMeetingMetadata] Błąd fallbacku [MEETING_META] w attendance:', err);
  }

  // Fallback lokalny do localStorage
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
  const tenantClient = getSupabaseForOrg(cleanOrg);

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

  // 2. Zapis w Supabase (meeting_metadata lub fallback [MEETING_META] w attendance)
  if (!_meetingMetadataTableMissing) {
    try {
      const { data, error } = await tenantClient
        .from('meeting_metadata')
        .upsert(payload, { onConflict: 'organization_id,meeting_key' })
        .select();

      if (!error) {
        return data ? data[0] : payload;
      }
      if (isTableNotFoundError(error)) {
        _meetingMetadataTableMissing = true;
      } else {
        console.warn('[saveMeetingMetadataToSupabase] Błąd upsert w Supabase:', error);
      }
    } catch (err) {
      if (isTableNotFoundError(err)) {
        _meetingMetadataTableMissing = true;
      } else {
        console.warn('[saveMeetingMetadataToSupabase] Wyjątek podczas zapisu w Supabase:', err);
      }
    }
  }

  // Fallback chmurowy: zapis do tabeli attendance pod kluczem [MEETING_META]:orgId:meetingKey
  try {
    const metaCode = `[MEETING_META]:${cleanOrg}:${meetingKey}`;
    await tenantClient
      .from('attendance')
      .delete()
      .eq('organization_id', cleanOrg)
      .eq('meeting_code', metaCode);

    const { error: attInsErr } = await tenantClient
      .from('attendance')
      .insert({
        organization_id: cleanOrg,
        meeting_code: metaCode,
        meeting_date: payload.meeting_date || new Date().toISOString().slice(0, 10),
        index_number: meetingKey,
        role: 'METADATA',
        points: 0,
        activity_description: JSON.stringify(payload),
      });

    if (attInsErr) {
      console.warn('[saveMeetingMetadataToSupabase] Błąd zapisu fallbacku [MEETING_META] w attendance:', attInsErr);
    }
  } catch (err) {
    console.warn('[saveMeetingMetadataToSupabase] Wyjątek fallbacku [MEETING_META]:', err);
  }

  return payload;
}
