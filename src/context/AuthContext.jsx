import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  saveUserPasswordToDB,
  saveAccessUsersToDB,
  fetchLoginAccessForEmail,
  GLOBAL_SUPERADMIN_EMAIL,
} from '../services/settingsService';
import { hashPassword, verifyPassword } from '../utils/crypto';
import {
  fetchRbacLoginProfile,
  syncRbacPasswordChangeInDb,
  PRODUCTION_CLUB_IDS,
} from '../services/adminUsersService';

export const ROLES = {
  SUPER_ADMIN: {
    id: 'SUPER_ADMIN',
    label: '',
    badgeClass: 'hidden',
    description: 'Pełny dostęp do konfiguracji i ustawień',
  },
  'Dostęp pełny': {
    id: 'Dostęp pełny',
    label: 'Dostęp pełny',
    badgeClass: 'hidden',
    description: 'Pełny dostęp do konfiguracji i ustawień',
  },
  'Koordynator / Pełny dostęp': {
    id: 'Koordynator / Pełny dostęp',
    label: 'Koordynator / Pełny dostęp',
    badgeClass: 'hidden',
    description: 'Koordynator z pełnym dostępem operacyjnym do koła',
  },
  COORDINATOR: {
    id: 'COORDINATOR',
    label: '',
    badgeClass: 'hidden',
    description: 'Dostęp operacyjny',
  },
  VIEWER: {
    id: 'VIEWER',
    label: '',
    badgeClass: 'hidden',
    description: 'Dostęp do ewidencji',
  },
};

export const ADMIN_PASSWORD = import.meta.env?.VITE_ADMIN_PASSWORD || '';

/** Stałe domyślne hasło startowe dla wszystkich nowych użytkowników */
export const DEFAULT_STARTER_PASSWORD = 'Start2026!';

export const MASTER_ADMIN_EMAILS = [
  GLOBAL_SUPERADMIN_EMAIL,
];

export const MASTER_ADMIN_PASSWORDS = {};

// Brak statycznie zakodowanych kont przekrojowych — jedynym źródłem uprawnień per koło jest Supabase SSOT.
export const DEFAULT_AUTHORIZED_ACCOUNTS = [];

export const STARTER_PASSWORDS = {};

export const ACCESS_PASSWORDS = [
  DEFAULT_STARTER_PASSWORD,
  import.meta.env?.VITE_ACCESS_PASSWORD,
  import.meta.env?.VITE_ADMIN_PASSWORD,
].filter(Boolean);

export const DEFAULT_USER = null;

// Wyłączone konta demonstracyjne w produkcji / izolacji wielokołowej
export const DEMO_ACCOUNTS = [];

const AuthContext = createContext(null);

// ── Uprawnienia z Supabase (SSOT) dla ekranu logowania ─────────────────────────
// Cache wyników zapytań do Supabase per e-mail (wypełniany asynchronicznie przez refreshRemoteAccess,
// odczytywany synchronicznie przez checkEmailStatus / loginWithPassword).
const remoteAccessCache = new Map();
const REMOTE_ACCESS_TIMEOUT_MS = 6000;

const STARTER_PASSWORD_SET = new Set([DEFAULT_STARTER_PASSWORD, 'StartCRM2026!', 'Start2026!']);

/** Ujednolicenie identyfikatorów kół (aliasy) – zgodne z normalizeOrgId w settingsService */
function normalizeAuthOrgId(orgId) {
  const str = String(orgId || '').trim().toLowerCase();
  if (!str || str === '*') return str;
  if (str === 'skn-template' || str === 'skn_template' || str === 'default' || str === 'seksuologia' || str === 'skn-seksuologia') return 'skn_seksuologii';
  if (str === 'skn_psychoonkologii' || str === 'skn-psychoonkologia') return 'psychoonkologia';
  if (str === 'skn_pdim' || str === 'skn-pdim' || str === 'pdim' || str === 'skn-dzieci-i-mlodziezy') return 'skn_dzieci_i_mlodziezy';
  if (str === 'skn_uzaleznienia' || str === 'skn-uzaleznienia') return 'uzaleznienia';
  return str;
}

/** Odczyt JSON z localStorage bez wyjątków */
function readStorageJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Zbiera wpisy z localStorage ze wszystkich kół dla kluczy pasujących do wzorca.
 * @param {RegExp} pattern – wzorzec z grupą przechwytującą identyfikator koła (lub bez grupy = brak koła)
 * @returns {Array<{orgId: string|null, list: Array}>}
 */
function collectLocalLists(pattern) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key && key.match(pattern);
      if (!m) continue;
      const list = readStorageJson(key);
      if (Array.isArray(list)) {
        out.push({ orgId: m[1] ? normalizeAuthOrgId(m[1]) : null, list, key });
      }
    }
  } catch {}
  return out;
}

/**
 * Pobiera z Supabase aktualne uprawnienia adresu e-mail (wszystkie koła) i zapisuje je w cache.
 * Wywoływane przed weryfikacją e-maila na ekranie logowania – działa z dowolnego urządzenia.
 */
export async function refreshRemoteAccess(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    const cached = {
      ok: true,
      accessMatches: [{ orgId: 'skn_seksuologii', name: 'Tomasz Bratkowski (Superadmin)', email: cleanEmail, role: 'SUPER_ADMIN', source: 'superadmin' }],
      supervisorMatches: [],
      boardMatches: [],
      revokedOrgs: [],
      rbacProfile: {
        id: 'superadmin-root',
        email: cleanEmail,
        name: 'Tomasz Bratkowski (Superadmin)',
        role: 'superadmin',
        mustChangePassword: false,
        isActive: true,
        clubs: ['*'],
      },
    };
    remoteAccessCache.set(cleanEmail, cached);
    return cached;
  }

  try {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), REMOTE_ACCESS_TIMEOUT_MS));
    const [res, rbacProfile] = await Promise.all([
      Promise.race([fetchLoginAccessForEmail(cleanEmail), timeout]),
      Promise.race([fetchRbacLoginProfile(cleanEmail), timeout]),
    ]);
    if ((res && res.ok) || rbacProfile) {
      const merged = {
        ...(res || { ok: true, accessMatches: [], supervisorMatches: [], boardMatches: [], revokedOrgs: [] }),
        ok: true,
        rbacProfile: rbacProfile || null,
      };
      remoteAccessCache.set(cleanEmail, merged);
      return merged;
    }
  } catch (err) {
    console.warn('[AuthContext] Nie udało się pobrać uprawnień z Supabase:', err);
  }
  return remoteAccessCache.get(cleanEmail) || null;
}

/**
 * Zapis hasła stałego w Supabase dla każdego koła, do którego użytkownik ma dostęp
 * (dzięki temu logowanie działa z dowolnego urządzenia). Dla kont globalnych – aktywne koło.
 */
async function persistPasswordToSupabase(cleanEmail, passwordHash, userData = null, oldPasswordHash = null) {
  const orgs = (userData?.clubs || userData?.accessibleOrgs || userData?.organizations || [])
    .filter(o => o && o !== '*' && o !== 'test')
    .map(normalizeAuthOrgId);
  if (orgs.length === 0) {
    const current = (typeof window !== 'undefined'
      ? (localStorage.getItem('crm_skn_current_org_id') || localStorage.getItem('crm_active_org_id'))
      : null) || 'skn_seksuologii';
    orgs.push(normalizeAuthOrgId(current));
  }
  await Promise.all([
    ...Array.from(new Set(orgs)).map(orgId =>
      saveUserPasswordToDB(orgId, cleanEmail, passwordHash, false).catch(console.warn)
    ),
    syncRbacPasswordChangeInDb(cleanEmail, passwordHash, oldPasswordHash).catch(console.warn),
  ]);
  remoteAccessCache.delete(cleanEmail);
}

/** Usunięcie hasła tymczasowego z wpisów uprawnień (per koło, lokalnie i w Supabase) */
function clearTempPasswordInAccessLists(cleanEmail) {
  collectLocalLists(/^skn_access_users_(.+)$/).forEach(({ orgId, list, key }) => {
    if (!list.some(u => (u?.email || '').toLowerCase() === cleanEmail)) return;
    const updated = list.map(u => ((u?.email || '').toLowerCase() === cleanEmail
      ? { ...u, isFirstLogin: false, tempPassword: null }
      : u));
    try { localStorage.setItem(key, JSON.stringify(updated)); } catch {}
    saveAccessUsersToDB(orgId, updated).catch(console.warn);
  });
}

/** Pobierz zapisane hasło (lub hash) użytkownika */
export function getUserStoredPassword(email) {
  if (!email) return null;
  const clean = email.toLowerCase().trim();
  if (MASTER_ADMIN_PASSWORDS[clean]) {
    return MASTER_ADMIN_PASSWORDS[clean];
  }
  try {
    const raw = localStorage.getItem('skn_user_passwords');
    if (raw) {
      const passwords = JSON.parse(raw);
      if (passwords && passwords[clean]) {
        return passwords[clean];
      }
    }
  } catch {}
  return null;
}

/** Sprawdź czy użytkownik loguje się po raz pierwszy */
export function getUserFirstLoginStatus(email, userRecord = null) {
  if (!email) return true;
  const cleanEmail = email.toLowerCase().trim();

  // Konto nadrzędne atomekb73@gmail.com / Master Admin ma stały bezpośredni dostęp bez wymuszenia zmiany hasła
  if (MASTER_ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail)) {
    return false;
  }

  try {
    const raw = localStorage.getItem('skn_user_first_login_status');
    if (raw) {
      const statusMap = JSON.parse(raw);
      if (statusMap && cleanEmail in statusMap) {
        return !!statusMap[cleanEmail];
      }
    }
  } catch {}

  // Jeśli użytkownik ma już zapisane własne, unikalne hasło (inne niż hasło startowe), to nie jest pierwsze logowanie
  try {
    const rawPass = localStorage.getItem('skn_user_passwords');
    if (rawPass) {
      const passwords = JSON.parse(rawPass);
      if (passwords && passwords[cleanEmail] && passwords[cleanEmail] !== DEFAULT_STARTER_PASSWORD && passwords[cleanEmail] !== 'Start2026!') {
        return false;
      }
    }
  } catch {}

  // Jeśli rekord użytkownika ma jawnie isFirstLogin: false i brak przypisanego tempPassword
  if (userRecord && userRecord.isFirstLogin === false && !userRecord.tempPassword) {
    return false;
  }

  // Domyślnie nowe konta wymagają zmiany hasła przy pierwszym wejściu
  return true;
}

/** Prosty dekoder JWT Payload dla Google OAuth 2.0 Identity Services */
function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Błąd dekodowania JWT:', e);
    return null;
  }
}

function sanitizeSessionUser(rawUser) {
  if (!rawUser || !rawUser.email) return null;
  const cleanEmail = String(rawUser.email).toLowerCase().trim();
  const isGlobalSuperadmin = cleanEmail === GLOBAL_SUPERADMIN_EMAIL;
  if (isGlobalSuperadmin) {
    return {
      ...rawUser,
      email: cleanEmail,
      role: 'SUPER_ADMIN',
      rbacRole: 'superadmin',
      is_global_admin: true,
      mustChangePassword: false,
      clubs: ['*'],
      accessibleOrgs: ['*'],
      organizations: ['*'],
    };
  }
  const rawOrgs = Array.isArray(rawUser.clubs)
    ? rawUser.clubs
    : Array.isArray(rawUser.accessibleOrgs)
    ? rawUser.accessibleOrgs
    : Array.isArray(rawUser.organizations)
    ? rawUser.organizations
    : [];
  const filteredOrgs = Array.from(new Set(
    rawOrgs
      .map(o => normalizeAuthOrgId(o))
      .filter(o => o && o !== '*' && o !== 'test' && PRODUCTION_CLUB_IDS.includes(o))
  ));
  if (filteredOrgs.length === 0) {
    return null;
  }
  const derivedRbacRole =
    rawUser.rbacRole === 'admin' ||
    rawUser.role === 'ADMIN' ||
    rawUser.isClubAdmin
      ? 'admin'
      : 'user';

  return {
    ...rawUser,
    email: cleanEmail,
    role: rawUser.role === 'SUPER_ADMIN' ? 'ADMIN' : (rawUser.role || (derivedRbacRole === 'admin' ? 'ADMIN' : 'USER')),
    rbacRole: derivedRbacRole,
    is_global_admin: false,
    mustChangePassword: Boolean(rawUser.mustChangePassword),
    clubs: filteredOrgs,
    accessibleOrgs: filteredOrgs,
    organizations: filteredOrgs,
    organization_id: filteredOrgs[0],
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const session = localStorage.getItem('crm_skn_auth_session');
      const saved = localStorage.getItem('crm_skn_auth_user');
      if (session && saved) {
        const parsed = sanitizeSessionUser(JSON.parse(saved));
        if (parsed && parsed.email) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const session = localStorage.getItem('crm_skn_auth_session');
      const saved = localStorage.getItem('crm_skn_auth_user');
      if (!session || !saved) return false;
      return Boolean(sanitizeSessionUser(JSON.parse(saved)));
    } catch {
      return false;
    }
  });

  const [authNotice, setAuthNotice] = useState(() => {
    try {
      return sessionStorage.getItem('skn_auth_revoked_notice') || null;
    } catch {
      return null;
    }
  });

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
    try {
      sessionStorage.removeItem('skn_auth_revoked_notice');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (user && isAuthenticated) {
        localStorage.setItem('crm_skn_auth_user', JSON.stringify(user));
        localStorage.setItem('crm_skn_auth_session', JSON.stringify({
          email: user.email,
          name: user.name,
          role: user.role,
          timestamp: Date.now(),
        }));
      } else if (!isAuthenticated) {
        localStorage.removeItem('crm_skn_auth_user');
        localStorage.removeItem('crm_skn_auth_session');
      }
    } catch (err) {
      console.error('Błąd zapisu sesji auth:', err);
    }
  }, [user, isAuthenticated]);

  const isMasterUser = useMemo(() => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    if (!userEmail || user?.is_global_admin === false) return false;
    return userEmail === GLOBAL_SUPERADMIN_EMAIL;
  }, [user]);

  /** Pełny przekrojowy dostęp wyłącznie dla Superadministratora (atomekb73@gmail.com) */
  const hasFullAccess = useMemo(() => {
    if (!user || !isAuthenticated) return false;
    return isMasterUser && user?.rbacRole === 'superadmin';
  }, [user, isAuthenticated, isMasterUser]);

  /** Ścisła weryfikacja czy zalogowany użytkownik ma uprawnienia do danego koła (zero wycieku między kołami) */
  const canAccessOrg = useCallback((orgId) => {
    if (!user || !isAuthenticated) return false;
    if (hasFullAccess || isMasterUser) return true;
    const cleanTarget = normalizeAuthOrgId(orgId);
    if (!cleanTarget || cleanTarget === '*' || cleanTarget === 'test') return false;
    const allowedOrgs = user.clubs || user.organizations || user.accessibleOrgs || [];
    if (!Array.isArray(allowedOrgs) || allowedOrgs.length === 0) return false;
    return allowedOrgs.some(o => {
      const norm = normalizeAuthOrgId(o);
      return Boolean(norm && norm !== '*' && norm === cleanTarget);
    });
  }, [user, isAuthenticated, isMasterUser, hasFullAccess]);

  /** Superadministrator globalny (wyłącznie atomekb73@gmail.com) */
  const isSuperAdmin = isMasterUser;

  /** Administrator konkretnego koła (Zarząd / Przewodniczący / Sekretarz / ADMIN) */
  const isClubAdmin = Boolean(
    isSuperAdmin ||
    user?.isClubAdmin ||
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'Dostęp pełny' ||
    user?.role === 'Koordynator / Pełny dostęp'
  );

  const canAdminOrg = useCallback((orgId) => {
    if (isSuperAdmin) return true;
    if (!canAccessOrg(orgId)) return false;
    const cleanTarget = normalizeAuthOrgId(orgId);
    const orgRole = user?.rolePerOrg?.[cleanTarget];
    if (orgRole) {
      return ['ADMIN', 'SUPER_ADMIN', 'Dostęp pełny', 'Koordynator / Pełny dostęp'].includes(orgRole);
    }
    return isClubAdmin;
  }, [isSuperAdmin, canAccessOrg, user, isClubAdmin]);

  const isCoordinator = user?.role === 'COORDINATOR' || 
                        user?.role === 'ADMIN' ||
                        user?.role === 'Koordynator / Pełny dostęp' || 
                        user?.role === 'Dostęp pełny' || 
                        isClubAdmin ||
                        isSuperAdmin;
  const isViewer = user?.role === 'VIEWER';

  /** Sprawdzenie uprawnień adresu e-mail i stanu hasła (ścisła izolacja per koło) */
  const checkEmailStatus = useCallback((inputEmail) => {
    if (!inputEmail || !inputEmail.trim()) {
      return { authorized: false, error: 'Wprowadź adres e-mail.' };
    }

    const cleanEmail = inputEmail.trim().toLowerCase();

    // 1. Wyłącznie atomekb73@gmail.com posiada globalny status Superadministratora
    const isMaster = cleanEmail === GLOBAL_SUPERADMIN_EMAIL;

    // Źródła uprawnień (Supabase SSOT ma bezwzględny priorytet nad localStorage)
    const remote = remoteAccessCache.get(cleanEmail) || null;
    const rbacProfile = remote?.rbacProfile || null;

    if (!isMaster && rbacProfile && rbacProfile.isActive === false) {
      return {
        authorized: false,
        revoked: true,
        error: 'Twoje konto zostało zablokowane przez Superadministratora.',
      };
    }

    const sameEmail = (v) => String(v || '').trim().toLowerCase() === cleanEmail;
    const revokedSet = new Set((remote?.revokedOrgs || []).map(o => normalizeAuthOrgId(o)));

    const collectMatches = (lists, emailOf, extraFilter = () => true) => {
      const found = [];
      lists.forEach(({ orgId, list }) => {
        const cleanOrgId = orgId ? normalizeAuthOrgId(orgId) : null;
        if (!cleanOrgId || cleanOrgId === '*' || cleanOrgId === 'test' || revokedSet.has(cleanOrgId)) return;
        list.forEach(item => {
          if (item && sameEmail(emailOf(item)) && extraFilter(item)) {
            found.push({ ...item, orgId: cleanOrgId });
          }
        });
      });
      return found;
    };

    const useRemoteOnly = Boolean(remote && remote.ok);

    const accessMatches = useRemoteOnly
      ? (remote.accessMatches || []).filter(m => m?.orgId && m.orgId !== 'test' && !revokedSet.has(normalizeAuthOrgId(m.orgId)))
      : collectMatches(collectLocalLists(/^skn_access_users_(.+)$/), u => u.email, u => u?.active !== false && u?.status !== 'revoked');

    const supervisorMatches = useRemoteOnly
      ? (remote.supervisorMatches || []).filter(m => m?.orgId && m.orgId !== 'test' && !revokedSet.has(normalizeAuthOrgId(m.orgId)))
      : collectMatches(collectLocalLists(/^crm_skn_(.+)_supervisors$/), s => s.email, s => s?.isActive !== false);

    const boardMatches = useRemoteOnly
      ? (remote.boardMatches || []).filter(m => m?.orgId && m.orgId !== 'test' && !revokedSet.has(normalizeAuthOrgId(m.orgId)))
      : collectMatches(collectLocalLists(/^skn_board_tenures_(.+)$/), t => t.memberEmail || t.email, t => t.isActive !== false);

    // Najsilniejsza rola wśród wpisów ręcznych (ADMIN > pełny dostęp > koordynator > odczyt)
    const accessRank = (u) => {
      const r = String(u?.role || '');
      if (r === 'ADMIN' || r === 'SUPER_ADMIN') return 4;
      if (r === 'Dostęp pełny' || r === 'Koordynator / Pełny dostęp' || r === 'MODERATOR') return 3;
      if (r === 'COORDINATOR') return 2;
      if (r === 'VIEWER') return 1;
      return 2;
    };
    const accessMatch = [...accessMatches].sort((a, b) => accessRank(b) - accessRank(a))[0] || null;

    const supervisorMatch = supervisorMatches[0] || null;

    const isBoardAdminRole = (t) => {
      const roleStr = String(t?.roleName || t?.role || '').toLowerCase();
      return roleStr.includes('sekretarz') || roleStr.includes('przewodnicz');
    };
    const boardMatch = boardMatches.find(isBoardAdminRole) || boardMatches[0] || null;

    const hasRbacClubs = Boolean(rbacProfile && Array.isArray(rbacProfile.clubs) && rbacProfile.clubs.length > 0);

    if (!isMaster && !hasRbacClubs && !accessMatch && !supervisorMatch && !boardMatch) {
      const wasRevoked = revokedSet.size > 0;
      return {
        authorized: false,
        revoked: wasRevoked,
        error: wasRevoked
          ? 'Dostęp do systemu CRM został zablokowany lub cofnięty przez Superadministratora.'
          : 'Brak uprawnień dostępu. Twój adres nie należy do aktywnego zarządu żadnego koła ani nie został dodany w jego ustawieniach.',
      };
    }

    // 1b. Ścisłe ustalenie listy kół (wyłącznie jawne przypisania per organization_id; wildcard '*' wyłącznie dla Superadmina)
    const orgSet = new Set();
    const rolePerOrg = {};
    const recordOrgRole = (rawOrg, newRole) => {
      const o = normalizeAuthOrgId(rawOrg);
      if (!o || o === '*' || o === 'test' || revokedSet.has(o)) return;
      if (!PRODUCTION_CLUB_IDS.includes(o)) return;
      orgSet.add(o);
      const prev = rolePerOrg[o];
      const rank = { ADMIN: 4, 'Dostęp pełny': 3, 'Koordynator / Pełny dostęp': 3, COORDINATOR: 2, VIEWER: 1 };
      if (!prev || (rank[newRole] || 0) > (rank[prev] || 0)) {
        rolePerOrg[o] = newRole;
      }
    };

    boardMatches.forEach(b => recordOrgRole(b.orgId, isBoardAdminRole(b) ? 'ADMIN' : 'COORDINATOR'));
    accessMatches.forEach(u => recordOrgRole(u.orgId, u.role === 'VIEWER' ? 'VIEWER' : (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN' ? 'ADMIN' : (u.role || 'COORDINATOR'))));
    supervisorMatches.forEach(s => recordOrgRole(s.orgId, 'COORDINATOR'));
    if (rbacProfile && Array.isArray(rbacProfile.clubs)) {
      const rbacMappedRole = rbacProfile.role === 'admin' ? 'ADMIN' : 'VIEWER';
      rbacProfile.clubs.forEach(c => recordOrgRole(c, rbacMappedRole));
    }

    if (!isMaster && orgSet.size === 0) {
      return {
        authorized: false,
        revoked: revokedSet.size > 0,
        error: 'Brak aktywnego przypisania do żadnego koła naukowego.',
      };
    }

    // 2. Utwórz profil użytkownika z uwzględnieniem ścisłej izolacji koła
    let role = 'COORDINATOR';
    let rbacRole = 'user';
    let name = rbacProfile?.name || cleanEmail.split('@')[0];
    const accessibleOrgs = isMaster ? ['*'] : Array.from(orgSet);
    let inheritedRole = null;
    let isClubAdminFlag = false;

    if (isMaster) {
      role = 'SUPER_ADMIN';
      rbacRole = 'superadmin';
      name = 'Tomasz Bratkowski (Superadmin)';
      isClubAdminFlag = true;
    } else if (rbacProfile || boardMatch || accessMatch) {
      const hasAnyAdmin = rbacProfile?.role === 'admin' || Object.values(rolePerOrg).includes('ADMIN');
      role = hasAnyAdmin ? 'ADMIN' : (accessMatch?.role === 'VIEWER' || rbacProfile?.role === 'user' ? 'VIEWER' : 'COORDINATOR');
      rbacRole = hasAnyAdmin ? 'admin' : 'user';
      isClubAdminFlag = hasAnyAdmin || ['ADMIN', 'SUPER_ADMIN', 'Dostęp pełny', 'Koordynator / Pełny dostęp'].includes(accessMatch?.role);
      name = rbacProfile?.name || boardMatch?.memberName || boardMatch?.name || accessMatch?.name || cleanEmail.split('@')[0];
      if (boardMatch) inheritedRole = boardMatch.roleName || 'Członek Zarządu';
    } else if (supervisorMatch) {
      role = 'COORDINATOR';
      rbacRole = 'user';
      name = supervisorMatch.name || supervisorMatch.fullName || 'Opiekun Naukowy';
      inheritedRole = 'Opiekun Naukowy Koła';
    }

    // 3. Stan aktywacji konta: jeśli user_profiles.must_change_password === true lub firstLogin === true, wymuszamy zmianę
    const remotePassword = remote?.password || null;
    const forcedByRbac = !isMaster && rbacProfile?.mustChangePassword === true;
    const activated = Boolean(
      !forcedByRbac && (
        remote?.firstLogin === false ||
        rbacProfile?.mustChangePassword === false ||
        (remotePassword && !STARTER_PASSWORD_SET.has(remotePassword)) ||
        getUserFirstLoginStatus(cleanEmail, null) === false
      )
    );

    const tempPass = activated ? null : (accessMatch?.tempPassword || null);

    const isFirstLogin = !isMaster && (
      forcedByRbac ||
      (!activated && Boolean(tempPass || accessMatch?.isFirstLogin || getUserFirstLoginStatus(cleanEmail, accessMatch)))
    );

    const authUser = {
      email: cleanEmail,
      name,
      role,
      rbacRole,
      is_global_admin: isMaster,
      isClubAdmin: isClubAdminFlag,
      mustChangePassword: isFirstLogin,
      rolePerOrg,
      clubs: accessibleOrgs,
      accessibleOrgs,
      organizations: accessibleOrgs,
      organization_id: accessibleOrgs[0] !== '*' ? accessibleOrgs[0] : undefined,
      inheritedRole,
      loggedAt: new Date().toISOString(),
    };

    const storedPass = getUserStoredPassword(cleanEmail);
    const hasPassword = Boolean(storedPass || tempPass || remotePassword);

    return {
      authorized: true,
      hasPassword,
      isFirstLogin,
      mustChangePassword: isFirstLogin,
      activated,
      remotePassword,
      tempPassword: tempPass,
      user: authUser,
    };
  }, []);

  /** Aktywacja nowego konta na pierwszym logowaniu i nadanie własnego hasła (SHA-256 z solą) */
  const activateAccount = useCallback(async (email, newPassword, confirmPassword, userData = null) => {
    if (!email || !newPassword || !confirmPassword) {
      return { success: false, error: 'Wypełnij wszystkie pola formularza.' };
    }

    const cleanEmail = email.trim().toLowerCase();

    // Zabezpieczenie kont SUPER_ADMIN / ADMIN: nie mogą być aktywowane/zmieniane bez weryfikacji
    const isAdminAccount = MASTER_ADMIN_PASSWORDS[cleanEmail] || DEFAULT_AUTHORIZED_ACCOUNTS.some(u => u.email.toLowerCase() === cleanEmail && (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN'));
    if (isAdminAccount && !STARTER_PASSWORDS[cleanEmail]) {
      return { success: false, error: 'Konto administratora wymaga standardowego logowania hasłem lub kontaktu z Zarządem.' };
    }
    const p1 = newPassword.trim();
    const p2 = confirmPassword.trim();

    if (p1.length < 8) {
      return { success: false, error: 'Hasło musi zawierać co najmniej 8 znaków.' };
    }

    if (p1 !== p2) {
      return { success: false, error: 'Wprowadzone hasła nie są identyczne.' };
    }

    const isStarter = [
      DEFAULT_STARTER_PASSWORD,
      'StartCRM2026!',
      'Start2026!',
      'Psycho2026!',
      'Psychoonkologia2026!',
      'wskz2026',
      'skn2026',
    ].filter(Boolean).includes(p1);

    if (isStarter) {
      return { success: false, error: 'Nowe hasło nie może być takie samo jak hasło tymczasowe. Wybierz inne, bezpieczne hasło stałe.' };
    }

    try {
      // 1. Zapisz nowe hasło jako bezpieczny skrót SHA-256 z solą (nigdy jawnym tekstem!)
      let passwords = {};
      try {
        const rawPass = localStorage.getItem('skn_user_passwords');
        if (rawPass) passwords = JSON.parse(rawPass);
      } catch {}
      const hashed = await hashPassword(p1, cleanEmail);
      passwords[cleanEmail] = hashed;
      localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));

      // Zapis statusu aktywacji w tle (do Supabase przekazujemy wyłącznie skrót, nigdy hasło jawne)
      persistPasswordToSupabase(cleanEmail, hashed, userData);

      // 2. Oznacz isFirstLogin jako false
      let statusMap = {};
      try {
        const rawStatus = localStorage.getItem('skn_user_first_login_status');
        if (rawStatus) statusMap = JSON.parse(rawStatus);
      } catch {}
      statusMap[cleanEmail] = false;
      localStorage.setItem('skn_user_first_login_status', JSON.stringify(statusMap));

      // 3. Zaktualizuj rekordy uprawnień (per koło) i usuń hasło tymczasowe
      clearTempPasswordInAccessLists(cleanEmail);
      try {
        const rawUsers = localStorage.getItem('skn_access_users');
        if (rawUsers) {
          const accessUsers = JSON.parse(rawUsers);
          if (Array.isArray(accessUsers)) {
            const updatedUsers = accessUsers.map(u => {
              if ((u?.email || '').toLowerCase() === cleanEmail) {
                return { ...u, isFirstLogin: false, tempPassword: null };
              }
              return u;
            });
            localStorage.setItem('skn_access_users', JSON.stringify(updatedUsers));
          }
        }
      } catch {}

      // 4. Utwórz profil (wyłącznie ze zweryfikowanych uprawnień, nigdy wildcard ['*'] dla zwykłych kont)
      const verified = userData || checkEmailStatus(cleanEmail)?.user;
      const authUser = sanitizeSessionUser({ ...verified, mustChangePassword: false });
      if (!authUser) {
        return { success: false, error: 'Brak aktywnych uprawnie\u0144 do kt\u00f3regokolwiek ko\u0142a naukowego.' };
      }

      setUser(authUser);
      setIsAuthenticated(true);

      localStorage.setItem('crm_skn_auth_session', JSON.stringify({
        email: cleanEmail,
        name: authUser.name,
        role: authUser.role,
        timestamp: Date.now(),
      }));
      localStorage.setItem('crm_skn_auth_user', JSON.stringify(authUser));

      return { success: true, user: authUser };
    } catch (e) {
      console.error('Błąd aktywacji konta:', e);
      return { success: false, error: 'Wystąpił błąd podczas zapisywania hasła.' };
    }
  }, []);

  /** Logowanie z hasłem z bezpieczną weryfikacją skrótu SHA-256 */
  const loginWithPassword = useCallback(async (inputEmail, inputPassword) => {
    if (!inputEmail || !inputPassword) {
      return { success: false, error: 'Wypełnij wszystkie pola formularza.' };
    }

    const cleanEmail = inputEmail.trim().toLowerCase();
    const cleanPassword = inputPassword.trim();

    const status = checkEmailStatus(cleanEmail);
    if (!status.authorized) {
      return { success: false, error: status.error };
    }

    if (!status.hasPassword) {
      return {
        success: false,
        requiresActivation: true,
        user: status.user,
        error: 'Konto nie posiada jeszcze nadanego hasła. Uzupełnij formularz aktywacji.',
      };
    }

    const storedPasswordOrHash = getUserStoredPassword(cleanEmail);
    const tempPassword = status.tempPassword || null;
    const isMasterOrBoard = cleanEmail === GLOBAL_SUPERADMIN_EMAIL;

    const isStarterPassword = STARTER_PASSWORD_SET.has(cleanPassword);
    // Po aktywacji konta hasło startowe przestaje działać
    if (status.activated && isStarterPassword && !isMasterOrBoard) {
      return { success: false, error: 'Konto zostało już aktywowane. Zaloguj się swoim hasłem stałym.' };
    }

    // Bezpieczna weryfikacja hasła (skrót SHA-256 lub migracja ze starych haseł jawnych)
    let isPasswordValid = false;
    if (storedPasswordOrHash) {
      isPasswordValid = await verifyPassword(cleanPassword, storedPasswordOrHash, cleanEmail);
      // Płynna migracja: jeśli hasło było w starym formacie jawnym i pasuje, zmigruj do SHA-256
      if (isPasswordValid && !storedPasswordOrHash.startsWith('sha256$')) {
        try {
          const passwords = readStorageJson('skn_user_passwords') || {};
          passwords[cleanEmail] = await hashPassword(cleanPassword, cleanEmail);
          localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));
        } catch {}
      }
    }

    if (!isPasswordValid && status.remotePassword) {
      isPasswordValid = await verifyPassword(cleanPassword, status.remotePassword, cleanEmail);
    }

    if (!isPasswordValid && tempPassword) {
      isPasswordValid = await verifyPassword(cleanPassword, tempPassword, cleanEmail);
    }

    if (!isPasswordValid && isStarterPassword && !status.activated) {
      isPasswordValid = true;
    }

    if (!isPasswordValid && isMasterOrBoard && ADMIN_PASSWORD && cleanPassword === ADMIN_PASSWORD) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      return { success: false, error: 'Nieprawidłowe hasło dostępowe.' };
    }

    // Jeśli hasło zostało potwierdzone zdalnie, utrwal lokalnie bezpieczny hash (nie jawne hasło!)
    if (status.remotePassword && isPasswordValid && !isStarterPassword) {
      try {
        const passwords = readStorageJson('skn_user_passwords') || {};
        passwords[cleanEmail] = await hashPassword(cleanPassword, cleanEmail);
        localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));
        const statusMap = readStorageJson('skn_user_first_login_status') || {};
        statusMap[cleanEmail] = false;
        localStorage.setItem('skn_user_first_login_status', JSON.stringify(statusMap));
      } catch {}
    }

    // Wymuszenie zmiany hasła przy pierwszym logowaniu lub gdy podano hasło startowe Start2026!
    const isStarterMatch = isStarterPassword;
    const requiresFirstChange = !isMaster && (
      isStarterMatch ||
      (tempPassword && cleanPassword === tempPassword) ||
      status.isFirstLogin ||
      status.mustChangePassword
    );

    const sessionUser = sanitizeSessionUser({
      ...status.user,
      mustChangePassword: requiresFirstChange,
    });
    if (!sessionUser) {
      return { success: false, error: 'Brak aktywnego przypisania do żadnego koła naukowego.' };
    }

    setUser(sessionUser);
    setIsAuthenticated(true);

    try {
      localStorage.setItem('crm_skn_auth_session', JSON.stringify({
        email: cleanEmail,
        name: sessionUser.name,
        role: sessionUser.role,
        mustChangePassword: requiresFirstChange,
        timestamp: Date.now(),
      }));
      localStorage.setItem('crm_skn_auth_user', JSON.stringify(sessionUser));
    } catch (e) {
      console.warn('Błąd zapisu sesji:', e);
    }

    return {
      success: true,
      mustChangePassword: requiresFirstChange,
      user: sessionUser,
    };
  }, [checkEmailStatus]);

  /** Logowanie z weryfikacją adresu e-mail i hasła (kompatybilność wsteczna) */
  const loginWithCredentials = useCallback((inputEmail, inputPassword) => {
    return loginWithPassword(inputEmail, inputPassword);
  }, [loginWithPassword]);

  /** Zmiana hasła przy pierwszym logowaniu lub na żądanie */
  const changePassword = useCallback(async (email, newPassword, confirmPassword, userData = null) => {
    if (!email || !newPassword || !confirmPassword) {
      return { success: false, error: 'Wypełnij wszystkie pola formularza.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const p1 = newPassword.trim();
    const p2 = confirmPassword.trim();

    if (p1.length < 8) {
      return { success: false, error: 'Nowe hasło musi zawierać co najmniej 8 znaków.' };
    }

    if (p1 !== p2) {
      return { success: false, error: 'Wprowadzone hasła nie są identyczne.' };
    }

    const isStarter = [
      DEFAULT_STARTER_PASSWORD,
      'StartCRM2026!',
      'Start2026!',
      'Psycho2026!',
      'Psychoonkologia2026!',
      'wskz2026',
      'skn2026',
      STARTER_PASSWORDS[cleanEmail],
    ].filter(Boolean).includes(p1);

    if (isStarter) {
      return { success: false, error: 'Nowe hasło nie może być takie samo jak hasło startowe. Wybierz inne, bezpieczne hasło stałe.' };
    }

    try {
      // 1. Zapisz nowe hasło jako bezpieczny skrót SHA-256 z solą
      let passwords = {};
      try {
        const rawPass = localStorage.getItem('skn_user_passwords');
        if (rawPass) passwords = JSON.parse(rawPass);
      } catch {}
      const oldHash = passwords[cleanEmail] || null;
      const hashed = await hashPassword(p1, cleanEmail);
      passwords[cleanEmail] = hashed;
      localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));

      // Zapis nowego hasła w Supabase SSOT (logowanie z dowolnego urządzenia)
      await persistPasswordToSupabase(cleanEmail, hashed, userData, oldHash);

      // 2. Oznacz isFirstLogin / mustChangePassword jako false
      let statusMap = {};
      try {
        const rawStatus = localStorage.getItem('skn_user_first_login_status');
        if (rawStatus) statusMap = JSON.parse(rawStatus);
      } catch {}
      statusMap[cleanEmail] = false;
      localStorage.setItem('skn_user_first_login_status', JSON.stringify(statusMap));

      clearTempPasswordInAccessLists(cleanEmail);

      // 3. Zaktualizuj rekord w skn_access_users jeśli istnieje
      try {
        const rawUsers = localStorage.getItem('skn_access_users');
        if (rawUsers) {
          const accessUsers = JSON.parse(rawUsers);
          if (Array.isArray(accessUsers)) {
            const updatedUsers = accessUsers.map(u => {
              if ((u?.email || '').toLowerCase() === cleanEmail) {
                return { ...u, isFirstLogin: false, tempPassword: null };
              }
              return u;
            });
            localStorage.setItem('skn_access_users', JSON.stringify(updatedUsers));
          }
        }
      } catch {}

      // 4. Utwórz obiekt zautoryzowanego użytkownika ze ścisłą izolacją kół
      const verified = userData || checkEmailStatus(cleanEmail)?.user;
      const authUser = sanitizeSessionUser({ ...verified, mustChangePassword: false });
      if (!authUser) {
        return { success: false, error: 'Brak aktywnych uprawnień do któregokolwiek koła naukowego.' };
      }

      setUser(authUser);
      setIsAuthenticated(true);

      localStorage.setItem('crm_skn_auth_session', JSON.stringify({
        email: cleanEmail,
        name: authUser.name,
        role: authUser.role,
        mustChangePassword: false,
        timestamp: Date.now(),
      }));
      localStorage.setItem('crm_skn_auth_user', JSON.stringify(authUser));

      return { success: true, user: authUser };
    } catch (e) {
      console.error('Błąd podczas zapisywania nowego hasła:', e);
      return { success: false, error: 'Wystąpił błąd podczas zapisywania hasła.' };
    }
  }, [checkEmailStatus]);

  /** Obowiązkowa zmiana hasła przy pierwszym logowaniu (ChangePasswordPage) */
  const completeMandatoryPasswordChange = useCallback(async (newPassword, confirmPassword) => {
    if (!user || !user.email) {
      return { success: false, error: 'Brak aktywnej sesji użytkownika.' };
    }
    return await changePassword(user.email, newPassword, confirmPassword, user);
  }, [user, changePassword]);

  /** Logowanie za pomocą Google OAuth 2.0 z pełną weryfikacją uprawnień w Supabase */
  const loginWithGoogle = useCallback(async (credentialResponse) => {
    if (!credentialResponse?.credential) {
      console.error('Brak tokenu w odpowiedzi Google OAuth');
      return { success: false, error: 'Brak tokenu Google OAuth.' };
    }

    const payload = parseJwtPayload(credentialResponse.credential);
    if (!payload || !payload.email) {
      console.error('Nieprawidłowy payload Google OAuth');
      return { success: false, error: 'Nieprawidłowy token Google OAuth.' };
    }

    const email = payload.email.toLowerCase().trim();
    await refreshRemoteAccess(email);
    const status = checkEmailStatus(email);
    if (!status.authorized || !status.user) {
      return { success: false, error: status.error || 'Brak uprawnień dostępu do systemu CRM.' };
    }

    const newUser = sanitizeSessionUser({
      ...status.user,
      name: payload.name || payload.given_name || status.user.name,
      avatarUrl: payload.picture || '',
      token: credentialResponse.credential,
    });

    if (!newUser) {
      return { success: false, error: 'Brak przypisania do żadnego koła naukowego.' };
    }

    setUser(newUser);
    setIsAuthenticated(true);
    return { success: true, user: newUser };
  }, [checkEmailStatus]);

  /** Przełączanie profili demonstracyjnych zostało zablokowane ze względów bezpieczeństwa */
  const switchDemoAccount = useCallback(() => {
    console.warn('[AuthContext] Przełączanie profili demonstracyjnych zostało trwale wyłączone ze względów bezpieczeństwa izolacji kół.');
  }, []);

  /** Zmiana hasła przez zalogowanego użytkownika (z weryfikacją aktualnego hasła) */
  const changeUserPassword = useCallback(async (currentPassword, newPassword, confirmPassword) => {
    if (!user || !user.email) {
      return { success: false, error: 'Brak aktywnej sesji użytkownika.' };
    }

    const cleanEmail = user.email.trim().toLowerCase();
    const curPass = (currentPassword || '').trim();
    const p1 = (newPassword || '').trim();
    const p2 = (confirmPassword || '').trim();

    if (!curPass || !p1 || !p2) {
      return { success: false, error: 'Wypełnij wszystkie pola formularza.' };
    }

    // 1. Weryfikacja aktualnego hasła
    const customPass = getUserStoredPassword(cleanEmail);
    let isCurrentValid = false;

    if (customPass) {
      isCurrentValid = await verifyPassword(curPass, customPass, cleanEmail);
    } else {
      await refreshRemoteAccess(cleanEmail);
      const status = checkEmailStatus(cleanEmail);
      if (status.remotePassword) {
        isCurrentValid = await verifyPassword(curPass, status.remotePassword, cleanEmail);
      } else {
        let accessUsers = [];
        try {
          const savedUsers = localStorage.getItem('skn_access_users');
          if (savedUsers) accessUsers = JSON.parse(savedUsers);
        } catch {}
        const accessMatch = (Array.isArray(accessUsers) ? accessUsers : DEFAULT_AUTHORIZED_ACCOUNTS)
          .find(u => (u?.email || '').toLowerCase() === cleanEmail);

        const allowedTempPasswords = [
          STARTER_PASSWORDS[cleanEmail],
          accessMatch?.tempPassword,
          ...ACCESS_PASSWORDS,
          'Start2026!',
          'StartCRM2026!',
        ].filter(Boolean);
        isCurrentValid = allowedTempPasswords.some(p => p && p.trim() === curPass);
      }
    }

    if (!isCurrentValid) {
      return { success: false, error: 'Wprowadzone dotychczasowe hasło jest nieprawidłowe.' };
    }

    // 2. Wywołaj właściwą procedurę zmiany hasła
    return await changePassword(cleanEmail, p1, p2, user);
  }, [user, changePassword, checkEmailStatus]);

  /** Wylogowanie */
  const logout = useCallback((noticeMessage = null) => {
    setUser(null);
    setIsAuthenticated(false);
    if (noticeMessage && typeof noticeMessage === 'string') {
      setAuthNotice(noticeMessage);
      try {
        sessionStorage.setItem('skn_auth_revoked_notice', noticeMessage);
      } catch {}
    }
    try {
      localStorage.removeItem('crm_skn_auth_session');
      localStorage.removeItem('crm_skn_auth_user');
      localStorage.removeItem('crm_psychoonkologia_auth_session');
      localStorage.removeItem('crm_psychoonkologia_auth_user');
      localStorage.removeItem('crm_auth_user');
    } catch {}
  }, []);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const lastRevalidateRef = useRef(0);
  const isRevalidatingRef = useRef(false);

  /**
   * Natychmiastowa rewalidacja sesji wobec Supabase SSOT (Kill Switch + izolacja kół).
   * Odświeża listę dozwolonych kół po powrocie do karty, na żądanie i cyklicznie.
   */
  const revalidateSessionAccess = useCallback(async (force = false) => {
    const currentUser = userRef.current;
    if (!isAuthenticated || !currentUser?.email) return { valid: false };

    const now = Date.now();
    if (!force && (isRevalidatingRef.current || (now - lastRevalidateRef.current < 20000))) {
      return { valid: true, skipped: true };
    }
    isRevalidatingRef.current = true;
    lastRevalidateRef.current = now;

    try {
      const cleanEmail = String(currentUser.email).toLowerCase().trim();
      const remote = await refreshRemoteAccess(cleanEmail);
      // Jeżeli Supabase chwilowo nie odpowiedział, zachowaj lokalny stan (ale bez wildcard dla zwykłych kont)
      if (!remote || !remote.ok) return { valid: true, offlineFallback: true };

      const status = checkEmailStatus(cleanEmail);
      if (!status.authorized || !status.user) {
        const msg = status.error || 'Twój dostęp do systemu CRM został cofnięty przez Superadministratora.';
        logout(msg);
        return { valid: false, revoked: true, error: msg };
      }

      const sanitizedNext = sanitizeSessionUser({
        ...currentUser,
        ...status.user,
        avatarUrl: currentUser.avatarUrl || '',
        loggedAt: currentUser.loggedAt || status.user.loggedAt,
      });

      if (!sanitizedNext) {
        const msg = 'Brak aktywnego dostępu do któregokolwiek koła naukowego.';
        logout(msg);
        return { valid: false, revoked: true, error: msg };
      }

      const prevOrgs = JSON.stringify(currentUser.accessibleOrgs || []);
      const nextOrgs = JSON.stringify(sanitizedNext.accessibleOrgs || []);
      const prevRoles = JSON.stringify(currentUser.rolePerOrg || {});
      const nextRoles = JSON.stringify(sanitizedNext.rolePerOrg || {});
      const hasChanged =
        prevOrgs !== nextOrgs ||
        prevRoles !== nextRoles ||
        currentUser.role !== sanitizedNext.role ||
        currentUser.rbacRole !== sanitizedNext.rbacRole ||
        Boolean(currentUser.mustChangePassword) !== Boolean(sanitizedNext.mustChangePassword) ||
        currentUser.is_global_admin !== sanitizedNext.is_global_admin;

      if (hasChanged) {
        setUser(sanitizedNext);
      }

      return { valid: true, user: sanitizedNext };
    } finally {
      isRevalidatingRef.current = false;
    }
  }, [isAuthenticated, checkEmailStatus, logout]);

  useEffect(() => {
    if (!isAuthenticated || !user?.email || typeof window === 'undefined') return undefined;

    revalidateSessionAccess();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      revalidateSessionAccess();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    const interval = setInterval(() => {
      revalidateSessionAccess();
    }, 60000);

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      clearInterval(interval);
    };
  }, [isAuthenticated, user?.email, revalidateSessionAccess]);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isSuperAdmin,
    hasFullAccess,
    isClubAdmin,
    canAdminOrg,
    isCoordinator,
    isViewer,
    canAccessOrg,
    checkEmailStatus,
    refreshRemoteAccess,
    revalidateSessionAccess,
    activateAccount,
    loginWithPassword,
    loginWithCredentials,
    changePassword,
    changeUserPassword,
    completeMandatoryPasswordChange,
    loginWithGoogle,
    switchDemoAccount,
    logout,
    authNotice,
    clearAuthNotice,
    setUser,
  }), [
    user,
    isAuthenticated,
    isSuperAdmin,
    hasFullAccess,
    isClubAdmin,
    canAdminOrg,
    isCoordinator,
    isViewer,
    canAccessOrg,
    checkEmailStatus,
    revalidateSessionAccess,
    activateAccount,
    loginWithPassword,
    loginWithCredentials,
    changePassword,
    changeUserPassword,
    completeMandatoryPasswordChange,
    loginWithGoogle,
    switchDemoAccount,
    logout,
    authNotice,
    clearAuthNotice,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

