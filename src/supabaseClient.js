import { createClient } from '@supabase/supabase-js'

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = (
  getEnv('VITE_SUPABASE_URL') ||
  getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  getEnv('REACT_APP_SUPABASE_URL') ||
  ''
).trim();

const supabaseAnonKey = (
  getEnv('VITE_SUPABASE_ANON_KEY') ||
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  getEnv('REACT_APP_SUPABASE_ANON_KEY') ||
  ''
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[SupabaseClient] Brak skonfigurowanych zmiennych VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY w .env')
  throw new Error('Brak skonfigurowanych zmiennych środowiskowych Supabase w pliku .env')
}

/**
 * Sprawdza, czy podany ciąg znaków jest prawidłowym identyfikatorem UUID (wersje 1-5).
 * Zapobiega błędom składniowym PostgreSQL 22P02 i HTTP 400 przy zapytaniach .eq('id', ...).
 */
export function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Zwraca aktualnie aktywny identyfikator organizacji (tenant) dla nagłówków RLS / telemetrii.
 */
export function getActiveTenantHeaderId() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const id =
        localStorage.getItem('crm_skn_current_org_id') ||
        localStorage.getItem('crm_active_org_id') ||
        'skn_seksuologii';
      if (id === 'skn-template' || id === 'default' || id === 'skn-seksuologia') {
        return 'skn_seksuologii';
      }
      return id.trim();
    } catch {}
  }
  return 'skn_seksuologii';
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      if (!headers.has('x-organization-id')) {
        headers.set('x-organization-id', getActiveTenantHeaderId());
      }
      return fetch(url, { ...options, headers });
    },
  },
})

/**
 * Pobiera wszystkie rekordy dla wskazanego tenanta (organization_id) z obsługą stronicowania powyżej limitu 1000 rekordów PostgREST.
 */
export async function fetchAllTenantRows(table, orgId, options = {}) {
  const cleanOrg = !orgId || orgId === 'skn-template' || orgId === 'default' ? 'skn_seksuologii' : String(orgId).trim();
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    let query = supabase
      .from(table)
      .select(options.select || '*')
      .eq('organization_id', cleanOrg);

    if (options.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending !== false });
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      return { data: allRows.length > 0 ? allRows : null, error };
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    allRows = allRows.concat(data);
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return { data: allRows, error: null };
}
