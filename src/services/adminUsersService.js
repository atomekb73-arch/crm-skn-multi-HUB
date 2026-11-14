import { supabase } from '../supabaseClient.js';
import { hashPassword } from '../utils/crypto.js';
import {
  GLOBAL_SUPERADMIN_EMAIL,
  normalizeOrgId,
  fetchGlobalAccessMatrix,
} from './settingsService.js';

export const RBAC_STARTER_PASSWORD = 'Start2026!';

export const ALL_WSKZ_RBAC_ORGANIZATIONS = [
  {
    id: 'biuro_dziekana',
    code: 'DZIEKANAT',
    name: 'Biuro Dziekana WSKZ',
    displayName: 'Biuro Dziekana',
    icon: 'Building2',
    color: '#1E293B',
    bgLight: '#F1F5F9',
  },
  {
    id: 'samorzad_studencki',
    code: 'SAMORZĄD',
    name: 'Samorząd Studentów WSKZ',
    displayName: 'Samorząd Studentów',
    icon: 'Users',
    color: '#0284C7',
    bgLight: '#E0F2FE',
  },
  {
    id: 'wydarzenia_ogolne',
    code: 'OGÓLNE',
    name: 'Wydarzenia Ogólnowydziałowe',
    displayName: 'Wydarzenia Ogólne',
    icon: 'GraduationCap',
    color: '#334155',
    bgLight: '#F8FAFC',
  },
  {
    id: 'skn_psychologii_klinicznej',
    code: 'KLINICZNA',
    name: '01 SKN Psychologii Klinicznej',
    displayName: '01 SKN Psychologii Klinicznej',
    icon: 'Brain',
    color: '#6D28D9',
    bgLight: '#EDE9FE',
  },
  {
    id: 'skn_psychotraumatologii',
    code: 'INTEGRUM',
    name: '02 SKN Psychotraumatologii - Integrum',
    displayName: '02 SKN Psychotraumatologii',
    icon: 'Puzzle',
    color: '#BE185D',
    bgLight: '#FCE7F3',
  },
  {
    id: 'skn_psychoterapii',
    code: 'TERAPII',
    name: '03 SKN Psychoterapii',
    displayName: '03 SKN Psychoterapii',
    icon: 'Armchair',
    color: '#DB2777',
    bgLight: '#FDF2F8',
  },
  {
    id: 'skn_psychologii_kryminalnej',
    code: 'KRYMINALNA',
    name: '04 SKN Psychologii Kryminalnej',
    displayName: '04 SKN Psychologii Kryminalnej',
    icon: 'Search',
    color: '#B45309',
    bgLight: '#FEF3C7',
  },
  {
    id: 'uzaleznienia',
    code: 'UZALEŻNIEŃ',
    name: '05 SKN Psychologii Zachowań Ryzykownych i Uzależnień',
    displayName: '05 SKN Zachowań Ryzykownych',
    icon: 'Flame',
    color: '#C2410C',
    bgLight: '#FFEDD5',
  },
  {
    id: 'skn_spolecznej_ewolucyjnej',
    code: 'EWOLUCYJNA',
    name: '06 SKN Psychologii Społecznej i Ewolucyjnej',
    displayName: '06 SKN Społecznej i Ewolucyjnej',
    icon: 'Dna',
    color: '#D97706',
    bgLight: '#FEF3C7',
  },
  {
    id: 'psychoonkologia',
    code: 'ONKOLOGIA',
    name: '07 SKN Psychoonkologii',
    displayName: '07 SKN Psychoonkologii',
    icon: 'Ribbon',
    color: '#0284C7',
    bgLight: '#E0F2FE',
  },
  {
    id: 'skn_psychofizjologii',
    code: 'FIZJOLOGIA',
    name: '08 SKN Psychofizjologii',
    displayName: '08 SKN Psychofizjologii',
    icon: 'Zap',
    color: '#0D9488',
    bgLight: '#CCFBF1',
  },
  {
    id: 'skn_zdrowia_srodowiska',
    code: 'ZDROWIA',
    name: '09 SKN Psychologii Zdrowia i Środowiska',
    displayName: '09 SKN Zdrowia i Środowiska',
    icon: 'Leaf',
    color: '#059669',
    bgLight: '#D1FAE5',
  },
  {
    id: 'skn_seksuologii',
    code: 'SEKSUOLOGIA',
    name: '10 SKN Seksuologii',
    displayName: '10 SKN Seksuologii',
    icon: 'Heart',
    color: '#16A34A',
    bgLight: '#DCFCE7',
  },
  {
    id: 'skn_rozwoju_dzieci',
    code: 'ROZWOJU',
    name: '11 SKN Psychologii Rozwoju Dzieci i Młodzieży',
    displayName: '11 SKN Rozwoju Dzieci',
    icon: 'Sparkles',
    color: '#A21CAF',
    bgLight: '#FAE8FF',
  },
  {
    id: 'skn_krytycznego_myslenia',
    code: 'MYŚLENIA',
    name: '12 SKN Warsztat Krytycznego Myślenia',
    displayName: '12 SKN Krytycznego Myślenia',
    icon: 'HelpCircle',
    color: '#7E22CE',
    bgLight: '#F3E8FF',
  },
  {
    id: 'skn_reklamy_pr',
    code: 'REKLAMY',
    name: '13 SKN Reklamy, PR i Marketingu',
    displayName: '13 SKN Reklamy i Marketingu',
    icon: 'Target',
    color: '#E11D48',
    bgLight: '#FFE4E6',
  },
  {
    id: 'skn_startupow',
    code: 'STARTUP',
    name: '14 SKN Nowoczesnego Zarządzania i Start-upów',
    displayName: '14 SKN Start-upów',
    icon: 'Rocket',
    color: '#0D9488',
    bgLight: '#CCFBF1',
  },
];

export const ALL_WSKZ_ORGANIZATION_IDS = ALL_WSKZ_RBAC_ORGANIZATIONS.map((o) => o.id);

export const PRODUCTION_CRM_ORGANIZATIONS = ALL_WSKZ_RBAC_ORGANIZATIONS;

export const PRODUCTION_CLUB_IDS = ALL_WSKZ_ORGANIZATION_IDS;

function normalizeRbacRole(rawRole, email = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return 'superadmin';
  const r = String(rawRole || '').trim().toLowerCase();
  if (['admin', 'club_admin', 'board', 'zarzad', 'coordinator'].includes(r)) {
    return 'admin';
  }
  return 'user';
}

function sanitizeClubs(rawClubs, email = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return ['*'];
  const list = Array.isArray(rawClubs) ? rawClubs : [];
  const valid = new Set();
  for (const club of list) {
    const norm = normalizeOrgId(club);
    if (norm && norm !== 'test' && norm !== '*' && ALL_WSKZ_ORGANIZATION_IDS.includes(norm)) {
      valid.add(norm);
    }
  }
  return Array.from(valid);
}

async function getAuthHeaders(actorEmail) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Actor-Email': String(actorEmail || '').trim().toLowerCase(),
  };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Brak sesji Supabase Auth — korzystamy z nagłówka X-Actor-Email
  }
  return headers;
}

async function callAdminApi(method, actorEmail, body = null) {
  const headers = await getAuthHeaders(actorEmail);
  const res = await fetch('/api/admin/users', {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Zwrócono HTML lub 404 (np. lokalne `vite dev` bez Vercel Functions)
    const err = new Error('API_UNAVAILABLE');
    err.code = 'API_UNAVAILABLE';
    err.status = res.status;
    throw err;
  }

  const payload = await res.json();
  if (!res.ok) {
    const err = new Error(payload?.error || `Błąd serwera (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function fallbackFetchRbacUsers(actorEmail) {
  const usersMap = new Map();
  let dbTablesReady = true;

  // 1. Próba odczytu z tabel RBAC (user_profiles + user_organization_access)
  try {
    const { data: profiles, error: pErr } = await supabase
      .from('user_profiles')
      .select('id, email, name, role, must_change_password, is_active, created_at, updated_at, last_login_at')
      .order('created_at', { ascending: true });

    if (pErr) {
      dbTablesReady = false;
    } else {
      const { data: orgAccess } = await supabase
        .from('user_organization_access')
        .select('user_id, organization_id, role');

      const clubsByUser = new Map();
      for (const row of orgAccess || []) {
        const orgId = row.organization_id === '*' ? '*' : normalizeOrgId(row.organization_id);
        if (!orgId || orgId === 'test') continue;
        if (!clubsByUser.has(row.user_id)) clubsByUser.set(row.user_id, new Set());
        clubsByUser.get(row.user_id).add(orgId);
      }

      for (const p of profiles || []) {
        const email = String(p.email || '').trim().toLowerCase();
        if (!email) continue;
        const isProtected = email === GLOBAL_SUPERADMIN_EMAIL;
        const rawClubs = Array.from(clubsByUser.get(p.id) || []);
        const clubs = isProtected ? ['*'] : rawClubs.filter((c) => PRODUCTION_CLUB_IDS.includes(c));
        usersMap.set(email, {
          id: p.id,
          email,
          name: p.name || email.split('@')[0],
          role: isProtected ? 'superadmin' : normalizeRbacRole(p.role, email),
          mustChangePassword: isProtected ? false : Boolean(p.must_change_password),
          isActive: isProtected ? true : p.is_active !== false,
          clubs,
          isProtected,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          lastLoginAt: p.last_login_at,
          source: 'user_profiles',
        });
      }
    }
  } catch {
    dbTablesReady = false;
  }

  // 2. Połączenie z globalną macierzą dostępów CRM (club_memberships + organization_settings)
  try {
    const matrix = await fetchGlobalAccessMatrix(actorEmail);
    for (const row of matrix?.users || []) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email) continue;
      const isProtected = email === GLOBAL_SUPERADMIN_EMAIL;
      const validClubs = isProtected
        ? ['*']
        : (row.clubs || [])
            .filter((c) => c.active !== false)
            .map((c) => normalizeOrgId(c.clubId))
            .filter((id) => PRODUCTION_CLUB_IDS.includes(id));

      if (!usersMap.has(email)) {
        const hasAdmin = (row.clubs || []).some(
          (c) => c.active !== false && String(c.role || '').toUpperCase().includes('ADMIN')
        );
        usersMap.set(email, {
          id: `crm-${email}`,
          email,
          name: row.name || email.split('@')[0],
          role: isProtected ? 'superadmin' : hasAdmin ? 'admin' : 'user',
          mustChangePassword: false,
          isActive: isProtected ? true : validClubs.length > 0 && row.status !== 'revoked',
          clubs: validClubs,
          isProtected,
          source: 'club_memberships',
        });
      } else {
        const existing = usersMap.get(email);
        if (!existing.isProtected) {
          for (const cid of validClubs) {
            if (!existing.clubs.includes(cid)) existing.clubs.push(cid);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[adminUsersService] Fallback matrix fetch error:', e);
  }

  if (!usersMap.has(GLOBAL_SUPERADMIN_EMAIL)) {
    usersMap.set(GLOBAL_SUPERADMIN_EMAIL, {
      id: 'superadmin-root',
      email: GLOBAL_SUPERADMIN_EMAIL,
      name: 'Tomasz Bratkowski (Superadmin)',
      role: 'superadmin',
      mustChangePassword: false,
      isActive: true,
      clubs: ['*'],
      isProtected: true,
      source: 'system_root',
    });
  }

  const users = Array.from(usersMap.values()).sort((a, b) => {
    if (a.isProtected && !b.isProtected) return -1;
    if (!a.isProtected && b.isProtected) return 1;
    return a.email.localeCompare(b.email, 'pl');
  });

  return {
    users,
    dbTablesReady,
    serviceRoleConfigured: false,
    fallbackMode: true,
  };
}

async function fallbackSyncClubSettings({ actorEmail, email, name, role, clubs, isActive, resetStarterPassword }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const isClubAdmin = role === 'admin';
  const legacyRole = isClubAdmin ? 'CLUB_ADMIN' : 'VIEWER';
  const legacyRoleLabel = isClubAdmin ? 'Administrator koła' : 'Użytkownik koła';

  for (const clubId of PRODUCTION_CLUB_IDS) {
    const assigned = clubs.includes(clubId);
    const shouldBeActive = Boolean(isActive && assigned);

    try {
      const { data: existing } = await supabase
        .from('club_memberships')
        .select('id')
        .eq('club_id', clubId)
        .ilike('email', cleanEmail)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('club_memberships')
          .update({
            member_name: name || cleanEmail.split('@')[0],
            role: legacyRole,
            role_label: legacyRoleLabel,
            active: shouldBeActive,
            source: 'rbac_admin_panel',
            granted_by: actorEmail || GLOBAL_SUPERADMIN_EMAIL,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing[0].id);
      } else if (assigned && isActive) {
        await supabase.from('club_memberships').insert({
          club_id: clubId,
          email: cleanEmail,
          member_name: name || cleanEmail.split('@')[0],
          role: legacyRole,
          role_label: legacyRoleLabel,
          source: 'rbac_admin_panel',
          active: true,
          granted_by: actorEmail || GLOBAL_SUPERADMIN_EMAIL,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[adminUsersService] Fallback club_memberships (${clubId}) error:`, e);
    }

    try {
      const { data: settingsRows } = await supabase
        .from('organization_settings')
        .select('settings_key, settings_value')
        .eq('organization_id', clubId)
        .in('settings_key', ['access_users', 'user_first_login_status', 'user_passwords']);

      const byKey = {};
      for (const r of settingsRows || []) byKey[r.settings_key] = r.settings_value;

      const curUsers = Array.isArray(byKey.access_users) ? byKey.access_users : [];
      const nextUsers = curUsers.filter(
        (u) => String(u?.email || '').trim().toLowerCase() !== cleanEmail
      );
      if (assigned && isActive) {
        nextUsers.push({
          id: cleanEmail,
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          role: isClubAdmin ? 'Administrator koła' : 'Członek zarządu (Odczyt)',
          role_code: legacyRole,
          rbacRole: role,
          addedAt: new Date().toISOString(),
        });
      }
      if (assigned || curUsers.length !== nextUsers.length) {
        await supabase.from('organization_settings').upsert(
          {
            id: `${clubId}__access_users`,
            organization_id: clubId,
            settings_key: 'access_users',
            settings_value: nextUsers,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,settings_key' }
        );
      }

      if (resetStarterPassword && assigned) {
        const flMap = { ...(byKey.user_first_login_status || {}), [cleanEmail]: true };
        await supabase.from('organization_settings').upsert(
          {
            id: `${clubId}__user_first_login_status`,
            organization_id: clubId,
            settings_key: 'user_first_login_status',
            settings_value: flMap,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,settings_key' }
        );

        const pwdMap = { ...(byKey.user_passwords || {}) };
        delete pwdMap[cleanEmail];
        await supabase.from('organization_settings').upsert(
          {
            id: `${clubId}__user_passwords`,
            organization_id: clubId,
            settings_key: 'user_passwords',
            settings_value: pwdMap,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,settings_key' }
        );
      }
    } catch (e) {
      console.warn(`[adminUsersService] Fallback organization_settings (${clubId}) error:`, e);
    }
  }
}

export async function fetchRbacUsers(actorEmail) {
  try {
    return await callAdminApi('GET', actorEmail);
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE' || err.status === 404 || err.status === 500) {
      return await fallbackFetchRbacUsers(actorEmail);
    }
    throw err;
  }
}

export async function createRbacUser({ actorEmail, name, email, role, clubs }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanClubs = sanitizeClubs(clubs, cleanEmail);
  const cleanRole = normalizeRbacRole(role, cleanEmail);
  try {
    return await callAdminApi('POST', actorEmail, {
      name,
      email: cleanEmail,
      role: cleanRole,
      clubs: cleanClubs,
    });
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE' || err.status === 404) {
      const starterHash = await hashPassword(RBAC_STARTER_PASSWORD, cleanEmail);
      await supabase
        .from('user_profiles')
        .upsert(
          {
            email: cleanEmail,
            name: String(name || '').trim() || cleanEmail.split('@')[0],
            role: cleanRole,
            password_hash: starterHash,
            must_change_password: true,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        );
      await fallbackSyncClubSettings({
        actorEmail,
        email: cleanEmail,
        name,
        role: cleanRole,
        clubs: cleanClubs,
        isActive: true,
        resetStarterPassword: true,
      });
      return await fallbackFetchRbacUsers(actorEmail);
    }
    throw err;
  }
}

export async function updateRbacUser({ actorEmail, email, name, role, clubs, isActive }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanClubs = sanitizeClubs(clubs, cleanEmail);
  const cleanRole = normalizeRbacRole(role, cleanEmail);
  try {
    return await callAdminApi('PUT', actorEmail, {
      action: 'update',
      email: cleanEmail,
      name,
      role: cleanRole,
      clubs: cleanClubs,
      ...(isActive !== undefined ? { isActive } : {}),
    });
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE' || err.status === 404) {
      await fallbackSyncClubSettings({
        actorEmail,
        email: cleanEmail,
        name,
        role: cleanRole,
        clubs: cleanClubs,
        isActive: isActive !== false,
        resetStarterPassword: false,
      });
      return await fallbackFetchRbacUsers(actorEmail);
    }
    throw err;
  }
}

export async function resetRbacUserPassword({ actorEmail, email }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  try {
    return await callAdminApi('PUT', actorEmail, {
      action: 'reset_password',
      email: cleanEmail,
    });
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE' || err.status === 404) {
      for (const clubId of PRODUCTION_CLUB_IDS) {
        const { data: settingsRows } = await supabase
          .from('organization_settings')
          .select('settings_key, settings_value')
          .eq('organization_id', clubId)
          .in('settings_key', ['user_first_login_status', 'user_passwords']);

        const byKey = {};
        for (const r of settingsRows || []) byKey[r.settings_key] = r.settings_value;

        await supabase.from('organization_settings').upsert(
          {
            id: `${clubId}__user_first_login_status`,
            organization_id: clubId,
            settings_key: 'user_first_login_status',
            settings_value: { ...(byKey.user_first_login_status || {}), [cleanEmail]: true },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,settings_key' }
        );

        if (byKey.user_passwords?.[cleanEmail]) {
          const pwdMap = { ...byKey.user_passwords };
          delete pwdMap[cleanEmail];
          await supabase.from('organization_settings').upsert(
            {
              id: `${clubId}__user_passwords`,
              organization_id: clubId,
              settings_key: 'user_passwords',
              settings_value: pwdMap,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id,settings_key' }
          );
        }
      }
      return await fallbackFetchRbacUsers(actorEmail);
    }
    throw err;
  }
}

export async function toggleRbacUserActive({ actorEmail, email, isActive }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  try {
    return await callAdminApi('PUT', actorEmail, {
      action: 'toggle_active',
      email: cleanEmail,
      isActive: Boolean(isActive),
    });
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE' || err.status === 404) {
      await supabase
        .from('club_memberships')
        .update({ active: Boolean(isActive), updated_at: new Date().toISOString() })
        .ilike('email', cleanEmail);
      return await fallbackFetchRbacUsers(actorEmail);
    }
    throw err;
  }
}

export async function deleteRbacUser({ actorEmail, email }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  try {
    return await callAdminApi('DELETE', actorEmail, { email: cleanEmail });
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE' || err.status === 404) {
      await fallbackSyncClubSettings({
        actorEmail,
        email: cleanEmail,
        name: '',
        role: 'user',
        clubs: [],
        isActive: false,
        resetStarterPassword: false,
      });
      return await fallbackFetchRbacUsers(actorEmail);
    }
    throw err;
  }
}

let _hasRbacRpc = true;

/**
 * Pobiera profil RBAC użytkownika podczas logowania (RPC get_rbac_login_profile).
 * Jeśli tabela / RPC nie zostały jeszcze zmigrowane, zwraca null bez powtarzania błędów w konsoli.
 */
export async function fetchRbacLoginProfile(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    return {
      id: 'superadmin-root',
      email: cleanEmail,
      name: 'Tomasz Bratkowski (Superadmin)',
      role: 'superadmin',
      mustChangePassword: false,
      isActive: true,
      clubs: ['*'],
    };
  }

  if (!_hasRbacRpc) return null;

  try {
    const { data, error } = await supabase.rpc('get_rbac_login_profile', {
      p_email: cleanEmail,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.message?.includes('Could not find') || error.code === '42883') {
        _hasRbacRpc = false;
      }
      return null;
    }
    if (data) {
      const clubs = cleanEmail === GLOBAL_SUPERADMIN_EMAIL
        ? ['*']
        : (Array.isArray(data.clubs) ? data.clubs : [])
            .map((c) => normalizeOrgId(c))
            .filter((c) => PRODUCTION_CLUB_IDS.includes(c));

      return {
        id: data.id,
        email: cleanEmail,
        name: data.name || cleanEmail.split('@')[0],
        role: cleanEmail === GLOBAL_SUPERADMIN_EMAIL ? 'superadmin' : normalizeRbacRole(data.role, cleanEmail),
        mustChangePassword: cleanEmail === GLOBAL_SUPERADMIN_EMAIL ? false : Boolean(data.must_change_password),
        isActive: cleanEmail === GLOBAL_SUPERADMIN_EMAIL ? true : data.is_active !== false,
        clubs,
      };
    }
  } catch {
    _hasRbacRpc = false;
  }
  return null;
}

/**
 * Aktualizuje status obowiązkowej zmiany hasła i nowy hash hasła w user_profiles.
 */
export async function syncRbacPasswordChangeInDb(email, newPasswordHash, oldPasswordHash = null) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !newPasswordHash) return false;
  try {
    const { data, error } = await supabase.rpc('complete_rbac_password_change', {
      p_email: cleanEmail,
      p_new_password_hash: newPasswordHash,
      p_old_password_hash: oldPasswordHash,
    });
    return !error && Boolean(data);
  } catch {
    return false;
  }
}
