import { supabase, getSupabaseForOrg } from '../supabaseClient.js';
import {
  GLOBAL_SUPERADMIN_EMAIL,
  normalizeOrgId,
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

const ACTIVE_CRM_ORG_IDS = ['skn_seksuologii', 'uzaleznienia', 'psychoonkologia'];
const REGISTRY_HOST_ORG_ID = 'skn_seksuologii';

function normalizeRbacRole(rawRole, email = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return 'superadmin';
  const r = String(rawRole || '').trim().toLowerCase();
  if (
    [
      'admin',
      'club_admin',
      'board',
      'zarzad',
      'coordinator',
      'moderator',
      'administrator koła',
    ].includes(r) ||
    r.includes('admin') ||
    r.includes('przewodnicz') ||
    r.includes('zarząd') ||
    r.includes('zarzad')
  ) {
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

async function readOrgSettingsRow(orgId) {
  const cleanOrg = normalizeOrgId(orgId);
  const client = getSupabaseForOrg(cleanOrg);
  const { data, error } = await client
    .from('organization_settings')
    .select('id, organization_id, settings')
    .eq('organization_id', cleanOrg)
    .limit(1);

  if (error) {
    throw error;
  }
  const row = data?.[0] || null;
  const settings = row?.settings && typeof row.settings === 'object' ? { ...row.settings } : {};
  return { row, settings };
}

async function writeOrgSettingsRow(orgId, nextSettings, existingRowId = null) {
  const cleanOrg = normalizeOrgId(orgId);
  const client = getSupabaseForOrg(cleanOrg);
  const nowIso = new Date().toISOString();

  if (existingRowId) {
    const { error } = await client
      .from('organization_settings')
      .update({
        settings: nextSettings,
        updated_at: nowIso,
      })
      .eq('id', existingRowId);
    if (error) throw error;
  } else {
    const { error } = await client
      .from('organization_settings')
      .insert({
        organization_id: cleanOrg,
        settings: nextSettings,
        updated_at: nowIso,
      });
    if (error) throw error;
  }
}

/**
 * Buduje zunifikowaną listę wszystkich użytkowników RBAC bezpośrednio z Supabase
 * (organization_settings.settings + club_memberships + user_profiles),
 * gwarantując 100% zgodność pomiędzy "Panel Administratora (RBAC)" a "Audyt & Kill Switch".
 */
export async function fetchRbacUsers() {
  const usersMap = new Map();

  const [orgSettingsRes, membershipsRes] = await Promise.all([
    supabase
      .from('organization_settings')
      .select('id, organization_id, settings, updated_at')
      .then((r) => r)
      .catch(() => ({ data: [], error: true })),
    supabase
      .from('club_memberships')
      .select('id, club_id, email, member_name, role, role_label, active, source, updated_at')
      .then((r) => r)
      .catch(() => ({ data: [], error: true })),
  ]);

  const orgRows = Array.isArray(orgSettingsRes?.data) ? orgSettingsRes.data : [];
  const memberships = Array.isArray(membershipsRes?.data) ? membershipsRes.data : [];

  const deletedEmails = new Set();
  const revokedByOrg = new Map();
  const firstLoginByEmail = new Map();
  const passwordHashByEmail = new Map();
  const registryByEmail = new Map();

  for (const row of orgRows) {
    const orgId = normalizeOrgId(row.organization_id);
    if (!orgId || orgId === 'test') continue;
    const s = row.settings && typeof row.settings === 'object' ? row.settings : {};

    // Usunięci użytkownicy (kosz w RBAC)
    if (s.rbac_deleted_users && typeof s.rbac_deleted_users === 'object') {
      for (const [rawEmail, entry] of Object.entries(s.rbac_deleted_users)) {
        const em = String(rawEmail || '').trim().toLowerCase();
        if (em && em !== GLOBAL_SUPERADMIN_EMAIL && entry && entry.deleted !== false) {
          deletedEmails.add(em);
        }
      }
    }

    // Zablokowane dostępy (Kill Switch / odebrane koła)
    const revSet = new Set();
    if (s.revoked_access && typeof s.revoked_access === 'object') {
      for (const [rawEmail, revEntry] of Object.entries(s.revoked_access)) {
        const em = String(rawEmail || '').trim().toLowerCase();
        if (em && em !== GLOBAL_SUPERADMIN_EMAIL && revEntry && revEntry.active === false) {
          revSet.add(em);
        }
      }
    }
    revokedByOrg.set(orgId, revSet);

    // Status pierwszego logowania (wymagana zmiana hasła)
    if (s.user_first_login_status && typeof s.user_first_login_status === 'object') {
      for (const [rawEmail, val] of Object.entries(s.user_first_login_status)) {
        const em = String(rawEmail || '').trim().toLowerCase();
        if (em && val === true) {
          firstLoginByEmail.set(em, true);
        } else if (em && val === false && !firstLoginByEmail.has(em)) {
          firstLoginByEmail.set(em, false);
        }
      }
    }

    if (s.user_passwords && typeof s.user_passwords === 'object') {
      for (const [rawEmail, hash] of Object.entries(s.user_passwords)) {
        const em = String(rawEmail || '').trim().toLowerCase();
        if (em && hash) {
          passwordHashByEmail.set(em, hash);
        }
      }
    }

    // Rejestr kont utworzonych/edytowanych w Panelu RBAC
    if (s.rbac_users_registry && typeof s.rbac_users_registry === 'object') {
      for (const [rawEmail, regUser] of Object.entries(s.rbac_users_registry)) {
        const em = String(rawEmail || regUser?.email || '').trim().toLowerCase();
        if (!em || em === GLOBAL_SUPERADMIN_EMAIL) continue;
        registryByEmail.set(em, regUser);
      }
    }
  }

  const ensureUser = (rawEmail, fallbackName = '', defaultRole = 'user') => {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || deletedEmails.has(email)) return null;
    const isProtected = email === GLOBAL_SUPERADMIN_EMAIL;
    if (!usersMap.has(email)) {
      const reg = registryByEmail.get(email);
      const hasFirstLogin = firstLoginByEmail.get(email);
      const mustChange = isProtected
        ? false
        : reg?.mustChangePassword !== undefined
          ? Boolean(reg.mustChangePassword) && !passwordHashByEmail.has(email)
          : Boolean(hasFirstLogin);

      usersMap.set(email, {
        id: reg?.id || `rbac-${email}`,
        email,
        name:
          reg?.name ||
          fallbackName ||
          (isProtected ? 'Super Admin' : email.split('@')[0]),
        role: isProtected
          ? 'superadmin'
          : reg?.role
            ? normalizeRbacRole(reg.role, email)
            : normalizeRbacRole(defaultRole, email),
        mustChangePassword: mustChange,
        isActive: isProtected ? true : reg?.isActive !== undefined ? Boolean(reg.isActive) : true,
        clubs: isProtected ? ['*'] : [],
        isProtected,
        updatedAt: reg?.updatedAt || null,
        source: reg ? 'rbac_registry' : 'organization_settings',
      });
    } else if (fallbackName) {
      const existing = usersMap.get(email);
      if (
        !existing.name ||
        existing.name === existing.email ||
        existing.name === existing.email.split('@')[0]
      ) {
        existing.name = fallbackName;
      }
    }
    return usersMap.get(email);
  };

  const addClubToUser = (userObj, clubId) => {
    if (!userObj || userObj.isProtected) return;
    const norm = normalizeOrgId(clubId);
    if (!norm || norm === 'test' || norm === '*' || !ALL_WSKZ_ORGANIZATION_IDS.includes(norm)) {
      return;
    }
    if (revokedByOrg.get(norm)?.has(userObj.email)) {
      return;
    }
    if (!userObj.clubs.includes(norm)) {
      userObj.clubs.push(norm);
    }
  };

  // 1. Najpierw wczytaj użytkowników z rejestru RBAC (obsługuje wszystkie 17 kół WSKZ)
  for (const [email, reg] of registryByEmail.entries()) {
    if (deletedEmails.has(email)) continue;
    const u = ensureUser(email, reg?.name, reg?.role || 'user');
    if (!u) continue;
    const regClubs = sanitizeClubs(reg?.clubs || [], email);
    for (const cid of regClubs) {
      addClubToUser(u, cid);
    }
  }

  // 2. Wczytaj z organization_settings (board, supervisors, access_users, revoked_access)
  for (const row of orgRows) {
    const orgId = normalizeOrgId(row.organization_id);
    if (!orgId || orgId === 'test' || !ALL_WSKZ_ORGANIZATION_IDS.includes(orgId)) continue;
    const s = row.settings && typeof row.settings === 'object' ? row.settings : {};
    const revSet = revokedByOrg.get(orgId) || new Set();

    // A) Zarząd koła (domyślnie rola Admin, chyba że nadpisano w rejestrze RBAC)
    const board = Array.isArray(s.board) ? s.board : [];
    for (const b of board) {
      const email = String(b?.memberEmail || b?.email || '').trim().toLowerCase();
      if (!email || deletedEmails.has(email)) continue;
      const isPastTenure = b?.isActive === false || (b?.endDate && String(b.endDate).trim() !== '' && b?.endDate < new Date().toISOString().slice(0, 10));
      if (isPastTenure) continue;
      const bName = b?.memberName || b?.fullName || b?.name || '';
      const isRevoked = b.accessRevoked === true || revSet.has(email);
      const u = ensureUser(email, bName, 'admin');
      if (!u) continue;
      if (!registryByEmail.has(email) && !u.isProtected) {
        u.role = 'admin';
      }
      if (!isRevoked) {
        addClubToUser(u, orgId);
      }
    }

    // B) Opiekunowie koła (domyślnie rola User)
    const supervisors = Array.isArray(s.supervisors) ? s.supervisors : [];
    for (const sup of supervisors) {
      const email = String(sup?.email || sup?.memberEmail || '').trim().toLowerCase();
      if (!email || deletedEmails.has(email)) continue;
      if (sup?.isActive === false) continue;
      const supName = sup?.name || sup?.fullName || sup?.memberName || '';
      const isRevoked = sup.accessRevoked === true || revSet.has(email);
      const u = ensureUser(email, supName, 'user');
      if (!u) continue;
      if (!isRevoked) {
        addClubToUser(u, orgId);
      }
    }

    // C) Ustawienia i dostęp (access_users)
    const accessUsers = Array.isArray(s.access_users) ? s.access_users : [];
    for (const au of accessUsers) {
      const email = String(au?.email || '').trim().toLowerCase();
      if (!email || deletedEmails.has(email)) continue;
      const isRevoked = au.active === false || revSet.has(email);
      const inferredRole = normalizeRbacRole(au.rbacRole || au.role_code || au.role, email);
      const u = ensureUser(email, au.name, inferredRole);
      if (!u) continue;
      if (!registryByEmail.has(email) && !u.isProtected && inferredRole === 'admin') {
        u.role = 'admin';
      }
      if (!isRevoked) {
        addClubToUser(u, orgId);
      }
    }

    // D) Osoby zablokowane w Kill Switchu (revoked_access), jeśli nie zostały usunięte koszem
    if (s.revoked_access && typeof s.revoked_access === 'object') {
      for (const [rawEmail, revEntry] of Object.entries(s.revoked_access)) {
        const email = String(rawEmail || '').trim().toLowerCase();
        if (!email || email === GLOBAL_SUPERADMIN_EMAIL || deletedEmails.has(email)) continue;
        if (revEntry && revEntry.active === false) {
          ensureUser(email, revEntry.name || email.split('@')[0], 'user');
        }
      }
    }
  }

  // 3. Uzupełnij z tabeli club_memberships (z poszanowaniem revoked_access i rbac_deleted_users)
  for (const m of memberships) {
    const email = String(m?.email || '').trim().toLowerCase();
    const clubId = normalizeOrgId(m?.club_id);
    if (!email || !clubId || clubId === 'test' || deletedEmails.has(email)) continue;
    if (clubId === '*' && email !== GLOBAL_SUPERADMIN_EMAIL) continue;

    const inferredRole = normalizeRbacRole(m.role, email);
    const u = ensureUser(email, m.member_name, inferredRole);
    if (!u) continue;

    const isRevoked = m.active === false || revokedByOrg.get(clubId)?.has(email);
    if (!isRevoked) {
      // Jeśli użytkownik miał już zapisany zestaw kół w rejestrze RBAC i dane koło zostało mu tam odznaczone, nie nadpisujemy
      const reg = registryByEmail.get(email);
      if (!reg || !Array.isArray(reg.clubs) || reg.clubs.includes(clubId)) {
        addClubToUser(u, clubId);
      }
    }
  }

  // 4. Przelicz ostateczny status aktywności (jeśli użytkownik nie ma żadnych aktywnych kół -> Zablokowane)
  for (const u of usersMap.values()) {
    if (u.isProtected) {
      u.role = 'superadmin';
      u.clubs = ['*'];
      u.isActive = true;
      u.mustChangePassword = false;
    } else if (u.clubs.length === 0) {
      u.isActive = false;
    }
  }

  // 5. Zagwarantuj obecność chronionego konta Superadministratora na samej górze
  if (!usersMap.has(GLOBAL_SUPERADMIN_EMAIL)) {
    usersMap.set(GLOBAL_SUPERADMIN_EMAIL, {
      id: 'superadmin-root',
      email: GLOBAL_SUPERADMIN_EMAIL,
      name: 'Super Admin',
      role: 'superadmin',
      mustChangePassword: false,
      isActive: true,
      clubs: ['*'],
      isProtected: true,
      source: 'system_root',
    });
  } else {
    const sa = usersMap.get(GLOBAL_SUPERADMIN_EMAIL);
    sa.role = 'superadmin';
    sa.clubs = ['*'];
    sa.isActive = true;
    sa.mustChangePassword = false;
    sa.isProtected = true;
  }

  const users = Array.from(usersMap.values()).sort((a, b) => {
    if (a.isProtected && !b.isProtected) return -1;
    if (!a.isProtected && b.isProtected) return 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (a.name || a.email).localeCompare(b.name || b.email, 'pl');
  });

  return {
    users,
    dbTablesReady: true,
    serviceRoleConfigured: true,
    fallbackMode: false,
  };
}

/**
 * Zapisuje zmiany użytkownika RBAC bezpośrednio do organization_settings.settings
 * z użyciem nagłówka x-organization-id (zgodnie z polityką RLS).
 */
async function syncRbacUserToOrganizationSettings({
  actorEmail,
  email,
  name,
  role,
  clubs,
  isActive = true,
  resetStarterPassword = false,
}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return;

  const cleanClubs = sanitizeClubs(clubs, cleanEmail);
  const cleanRole = normalizeRbacRole(role, cleanEmail);
  const displayName = String(name || '').trim() || cleanEmail.split('@')[0];
  const isClubAdmin = cleanRole === 'admin';
  const legacyRole = isClubAdmin ? 'CLUB_ADMIN' : 'VIEWER';
  const legacyRoleLabel = isClubAdmin ? 'Administrator koła' : 'Członek zarządu (Odczyt)';
  const nowIso = new Date().toISOString();

  // 1. Zaktualizuj główny rejestr RBAC w kole hostującym (skn_seksuologii)
  try {
    const { row, settings } = await readOrgSettingsRow(REGISTRY_HOST_ORG_ID);
    const registry =
      settings.rbac_users_registry && typeof settings.rbac_users_registry === 'object'
        ? { ...settings.rbac_users_registry }
        : {};
    const deletedMap =
      settings.rbac_deleted_users && typeof settings.rbac_deleted_users === 'object'
        ? { ...settings.rbac_deleted_users }
        : {};

    delete deletedMap[cleanEmail];

    const prevEntry = registry[cleanEmail] || {};
    registry[cleanEmail] = {
      id: prevEntry.id || `rbac-${cleanEmail}`,
      email: cleanEmail,
      name: displayName,
      role: cleanRole,
      clubs: cleanClubs,
      isActive: Boolean(isActive && cleanClubs.length > 0),
      mustChangePassword: resetStarterPassword
        ? true
        : prevEntry.mustChangePassword !== undefined
          ? Boolean(prevEntry.mustChangePassword)
          : false,
      updatedAt: nowIso,
      updatedBy: actorEmail || GLOBAL_SUPERADMIN_EMAIL,
    };

    settings.rbac_users_registry = registry;
    settings.rbac_deleted_users = deletedMap;

    await writeOrgSettingsRow(REGISTRY_HOST_ORG_ID, settings, row?.id);
  } catch (err) {
    console.warn('[adminUsersService] Registry update error:', err);
  }

  // 2. Zsynchronizuj ustawienia każdego aktywnego koła w bazie (skn_seksuologii, uzaleznienia, psychoonkologia)
  for (const orgId of ACTIVE_CRM_ORG_IDS) {
    const assigned = cleanClubs.includes(orgId) && Boolean(isActive);
    try {
      const { row, settings } = await readOrgSettingsRow(orgId);

      // A) access_users
      const existingAccess = Array.isArray(settings.access_users) ? settings.access_users : [];
      const filteredAccess = existingAccess.filter(
        (u) => String(u?.email || '').trim().toLowerCase() !== cleanEmail
      );
      if (assigned) {
        filteredAccess.push({
          id: cleanEmail,
          email: cleanEmail,
          name: displayName,
          role: legacyRoleLabel,
          role_code: legacyRole,
          rbacRole: cleanRole,
          addedAt: nowIso,
        });
      }
      settings.access_users = filteredAccess;

      // B) revoked_access (jeśli koło nie jest przypisane, blokujemy ewentualne stare wpisy z club_memberships/board)
      const revokedMap =
        settings.revoked_access && typeof settings.revoked_access === 'object'
          ? { ...settings.revoked_access }
          : {};
      if (assigned) {
        delete revokedMap[cleanEmail];
      } else {
        revokedMap[cleanEmail] = {
          email: cleanEmail,
          name: displayName,
          active: false,
          revokedAt: nowIso,
          revokedBy: actorEmail || GLOBAL_SUPERADMIN_EMAIL,
          reason: 'RBAC_UNASSIGNED',
        };
      }
      settings.revoked_access = revokedMap;

      // C) Zaktualizuj flagę accessRevoked w Zarządzie / Opiekunach, jeśli tam figuruje
      if (Array.isArray(settings.board)) {
        settings.board = settings.board.map((b) =>
          String(b?.email || '').trim().toLowerCase() === cleanEmail
            ? { ...b, name: displayName || b.name, accessRevoked: !assigned }
            : b
        );
      }
      if (Array.isArray(settings.supervisors)) {
        settings.supervisors = settings.supervisors.map((sup) =>
          String(sup?.email || '').trim().toLowerCase() === cleanEmail
            ? { ...sup, name: displayName || sup.name, accessRevoked: !assigned }
            : sup
        );
      }

      // D) Hasło startowe i wymuszenie zmiany hasła przy 1. logowaniu
      if (resetStarterPassword && assigned) {
        const flMap =
          settings.user_first_login_status && typeof settings.user_first_login_status === 'object'
            ? { ...settings.user_first_login_status }
            : {};
        flMap[cleanEmail] = true;
        settings.user_first_login_status = flMap;

        if (settings.user_passwords && typeof settings.user_passwords === 'object') {
          const pwdMap = { ...settings.user_passwords };
          delete pwdMap[cleanEmail];
          settings.user_passwords = pwdMap;
        }
      }

      await writeOrgSettingsRow(orgId, settings, row?.id);
    } catch (err) {
      console.warn(`[adminUsersService] Sync org (${orgId}) error:`, err);
    }
  }
}

export async function createRbacUser({ actorEmail, name, email, role, clubs }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Podaj prawidłowy adres e-mail użytkownika.');
  }
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    throw new Error('Konto Superadministratora już istnieje i jest chronione.');
  }
  const cleanClubs = sanitizeClubs(clubs, cleanEmail);
  if (cleanClubs.length === 0) {
    throw new Error('Wybierz co najmniej jedno koło naukowe dla nowego użytkownika.');
  }
  const cleanRole = normalizeRbacRole(role, cleanEmail);

  await syncRbacUserToOrganizationSettings({
    actorEmail,
    email: cleanEmail,
    name,
    role: cleanRole,
    clubs: cleanClubs,
    isActive: true,
    resetStarterPassword: true,
  });

  return await fetchRbacUsers(actorEmail);
}

export async function updateRbacUser({ actorEmail, email, name, role, clubs, isActive }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Brak adresu e-mail użytkownika.');
  }
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    throw new Error('Konto Superadministratora jest chronione.');
  }
  const cleanClubs = sanitizeClubs(clubs, cleanEmail);
  if (cleanClubs.length === 0) {
    throw new Error('Użytkownik musi mieć przypisane co najmniej jedno koło naukowe.');
  }
  const cleanRole = normalizeRbacRole(role, cleanEmail);

  await syncRbacUserToOrganizationSettings({
    actorEmail,
    email: cleanEmail,
    name,
    role: cleanRole,
    clubs: cleanClubs,
    isActive: isActive !== false,
    resetStarterPassword: false,
  });

  return await fetchRbacUsers(actorEmail);
}

export async function resetRbacUserPassword({ actorEmail, email }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    throw new Error('Nie można zresetować hasła dla tego konta.');
  }

  for (const orgId of ACTIVE_CRM_ORG_IDS) {
    try {
      const { row, settings } = await readOrgSettingsRow(orgId);
      const flMap =
        settings.user_first_login_status && typeof settings.user_first_login_status === 'object'
          ? { ...settings.user_first_login_status }
          : {};
      flMap[cleanEmail] = true;
      settings.user_first_login_status = flMap;

      if (settings.user_passwords && typeof settings.user_passwords === 'object') {
        const pwdMap = { ...settings.user_passwords };
        delete pwdMap[cleanEmail];
        settings.user_passwords = pwdMap;
      }

      if (
        orgId === REGISTRY_HOST_ORG_ID &&
        settings.rbac_users_registry &&
        settings.rbac_users_registry[cleanEmail]
      ) {
        settings.rbac_users_registry = {
          ...settings.rbac_users_registry,
          [cleanEmail]: {
            ...settings.rbac_users_registry[cleanEmail],
            mustChangePassword: true,
            updatedAt: new Date().toISOString(),
          },
        };
      }

      await writeOrgSettingsRow(orgId, settings, row?.id);
    } catch (err) {
      console.warn(`[adminUsersService] Reset password (${orgId}) error:`, err);
    }
  }

  return await fetchRbacUsers(actorEmail);
}

export async function toggleRbacUserActive({ actorEmail, email, isActive }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    throw new Error('Konto Superadministratora jest chronione.');
  }

  const current = await fetchRbacUsers(actorEmail);
  const existing = (current.users || []).find((u) => u.email === cleanEmail);
  const clubs = existing?.clubs?.length ? existing.clubs : ['skn_seksuologii'];

  await syncRbacUserToOrganizationSettings({
    actorEmail,
    email: cleanEmail,
    name: existing?.name || cleanEmail.split('@')[0],
    role: existing?.role || 'user',
    clubs: isActive ? clubs : [],
    isActive: Boolean(isActive),
    resetStarterPassword: false,
  });

  return await fetchRbacUsers(actorEmail);
}

export async function deleteRbacUser({ actorEmail, email }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Brak adresu e-mail użytkownika do usunięcia.');
  }
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    throw new Error('Konto Superadministratora jest chronione i nie może zostać usunięte.');
  }

  const nowIso = new Date().toISOString();

  // 1. Oznacz jako usunięte w głównym rejestrze i usuń z rbac_users_registry
  try {
    const { row, settings } = await readOrgSettingsRow(REGISTRY_HOST_ORG_ID);
    const registry =
      settings.rbac_users_registry && typeof settings.rbac_users_registry === 'object'
        ? { ...settings.rbac_users_registry }
        : {};
    delete registry[cleanEmail];
    settings.rbac_users_registry = registry;

    const deletedMap =
      settings.rbac_deleted_users && typeof settings.rbac_deleted_users === 'object'
        ? { ...settings.rbac_deleted_users }
        : {};
    deletedMap[cleanEmail] = {
      email: cleanEmail,
      deleted: true,
      deletedAt: nowIso,
      deletedBy: actorEmail || GLOBAL_SUPERADMIN_EMAIL,
    };
    settings.rbac_deleted_users = deletedMap;

    await writeOrgSettingsRow(REGISTRY_HOST_ORG_ID, settings, row?.id);
  } catch (err) {
    console.warn('[adminUsersService] Delete from registry error:', err);
  }

  // 2. Wyczyść uprawnienia we wszystkich aktywnych kołach i zablokuj w revoked_access
  for (const orgId of ACTIVE_CRM_ORG_IDS) {
    try {
      const { row, settings } = await readOrgSettingsRow(orgId);

      if (Array.isArray(settings.access_users)) {
        settings.access_users = settings.access_users.filter(
          (u) => String(u?.email || '').trim().toLowerCase() !== cleanEmail
        );
      }
      if (Array.isArray(settings.board)) {
        settings.board = settings.board.map((b) =>
          String(b?.email || '').trim().toLowerCase() === cleanEmail
            ? { ...b, accessRevoked: true }
            : b
        );
      }
      if (Array.isArray(settings.supervisors)) {
        settings.supervisors = settings.supervisors.map((sup) =>
          String(sup?.email || '').trim().toLowerCase() === cleanEmail
            ? { ...sup, accessRevoked: true }
            : sup
        );
      }

      const revokedMap =
        settings.revoked_access && typeof settings.revoked_access === 'object'
          ? { ...settings.revoked_access }
          : {};
      revokedMap[cleanEmail] = {
        email: cleanEmail,
        active: false,
        revokedAt: nowIso,
        revokedBy: actorEmail || GLOBAL_SUPERADMIN_EMAIL,
        reason: 'RBAC_DELETED',
      };
      settings.revoked_access = revokedMap;

      await writeOrgSettingsRow(orgId, settings, row?.id);
    } catch (err) {
      console.warn(`[adminUsersService] Delete cleanup (${orgId}) error:`, err);
    }
  }

  return await fetchRbacUsers(actorEmail);
}

/**
 * Pobiera profil RBAC użytkownika podczas logowania bezpośrednio z organization_settings
 * (bez wywoływania nieistniejącego RPC get_rbac_login_profile, co zapobiega błędom HTTP 404 w konsoli).
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

  try {
    const { data: rows } = await supabase
      .from('organization_settings')
      .select('organization_id, settings');

    if (!Array.isArray(rows) || rows.length === 0) return null;

    let regEntry = null;
    let isDeleted = false;
    let mustChange = false;
    let hasCustomPassword = false;

    for (const row of rows) {
      const s = row.settings && typeof row.settings === 'object' ? row.settings : {};
      if (s.rbac_deleted_users?.[cleanEmail]?.deleted) {
        isDeleted = true;
      }
      if (s.rbac_users_registry?.[cleanEmail]) {
        regEntry = s.rbac_users_registry[cleanEmail];
      }
      if (s.user_first_login_status?.[cleanEmail] === true) {
        mustChange = true;
      }
      if (s.user_passwords?.[cleanEmail]) {
        hasCustomPassword = true;
      }
    }

    if (isDeleted) {
      return {
        id: `deleted-${cleanEmail}`,
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: 'user',
        mustChangePassword: false,
        isActive: false,
        clubs: [],
      };
    }

    if (regEntry) {
      const clubs = sanitizeClubs(regEntry.clubs || [], cleanEmail);
      return {
        id: regEntry.id || `rbac-${cleanEmail}`,
        email: cleanEmail,
        name: regEntry.name || cleanEmail.split('@')[0],
        role: normalizeRbacRole(regEntry.role, cleanEmail),
        mustChangePassword: hasCustomPassword ? false : Boolean(regEntry.mustChangePassword || mustChange),
        isActive: regEntry.isActive !== false && clubs.length > 0,
        clubs,
      };
    }
  } catch {
    // Bezpieczny fallback do standardowego sprawdzania w AuthContext
  }
  return null;
}

/**
 * Aktualizuje status obowiązkowej zmiany hasła w rejestrze RBAC po zmianie hasła przez użytkownika.
 */
export async function syncRbacPasswordChangeInDb(email, newPasswordHash) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !newPasswordHash) return false;
  try {
    const { row, settings } = await readOrgSettingsRow(REGISTRY_HOST_ORG_ID);
    if (settings.rbac_users_registry?.[cleanEmail]) {
      settings.rbac_users_registry = {
        ...settings.rbac_users_registry,
        [cleanEmail]: {
          ...settings.rbac_users_registry[cleanEmail],
          mustChangePassword: false,
          updatedAt: new Date().toISOString(),
        },
      };
      await writeOrgSettingsRow(REGISTRY_HOST_ORG_ID, settings, row?.id);
    }
    return true;
  } catch {
    return false;
  }
}
