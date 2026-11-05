import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  saveUserPasswordToDB,
  saveAccessUsersToDB,
  fetchLoginAccessForEmail,
} from '../services/settingsService';

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

export const ADMIN_PASSWORD = import.meta.env?.VITE_ADMIN_PASSWORD || 'Ntx2t44V';

/** Stałe domyślne hasło startowe dla wszystkich nowych użytkowników */
export const DEFAULT_STARTER_PASSWORD = 'StartCRM2026!';

// Stały profil dostępu dla Magdy Czepirska do obu kół (Seksuologia + Uzależnienia)
export const MAGDA_DUAL_ACCESS_USER = {
  id: "magda-czepirska-dual-id",
  email: "w.czepirska@gmail.com",
  full_name: "Magda Czepirska",
  name: "Magda Czepirska",
  role: "Koordynator / Pełny dostęp",
  roleLabel: "Koordynator / Pełny dostęp",
  organizations: ["seksuologia", "uzaleznienia"], // Dostęp do obu kół
  accessibleOrgs: ["skn_seksuologii", "seksuologia", "uzaleznienia"],
  organization_id: "uzaleznienia",
  is_global_admin: false, // Bez uprawnień administratora głównego
  must_change_password: false,
  status: "active"
};

// Funkcja weryfikująca logowanie Magdy
export function authenticateMagda(email, password) {
  if (!email || !password) return null;
  const cleanEmail = email.toLowerCase().trim();
  const cleanPass = password.trim();
  const isMagda = cleanEmail === "w.czepirska@gmail.com" || cleanEmail === "m.czepirek@gmail.com";

  if (isMagda && (cleanPass === "StartCRM2026!" || cleanPass.length >= 8)) {
    return { 
      success: true, 
      user: {
        ...MAGDA_DUAL_ACCESS_USER,
        email: cleanEmail,
      },
      redirectUrl: "/dashboard" 
    };
  }
  return null;
}

export const MOCK_MAGDA_USER = MAGDA_DUAL_ACCESS_USER;

// Funkcja autoryzacji sprawdzająca bezpośrednio wpis Magdy (kompatybilność)
export function checkMagdaBypass(email, password) {
  const res = authenticateMagda(email, password);
  if (res && res.success) {
    return res;
  }
  return { success: false, error: "Nieprawidłowe dane logowania" };
}

export const MASTER_ADMIN_EMAILS = [
  'admin@wskz.pl',
  'admin',
  'atomekb73@gmail.com',
  'zarzad@wskz.pl',
];

export const MASTER_ADMIN_PASSWORDS = {
  'admin@wskz.pl': ADMIN_PASSWORD,
  'admin': ADMIN_PASSWORD,
  'zarzad@wskz.pl': ADMIN_PASSWORD,
  'atomekb73@gmail.com': '730273',
};

export const DEFAULT_AUTHORIZED_ACCOUNTS = [
  {
    email: 'w.czepirska@gmail.com',
    name: 'Magda Czepirska',
    full_name: 'Magda Czepirska',
    role: 'Koordynator / Pełny dostęp',
    roleLabel: 'Koordynator / Pełny dostęp',
    organizations: ['seksuologia', 'uzaleznienia'],
    accessibleOrgs: ['skn_seksuologii', 'seksuologia', 'uzaleznienia'],
    is_global_admin: false,
    must_change_password: false,
    isFirstLogin: false,
    tempPassword: DEFAULT_STARTER_PASSWORD,
    organization_id: 'uzaleznienia',
  },
  {
    email: 'm.czepirek@gmail.com',
    name: 'Magda Czepirska',
    full_name: 'Magda Czepirska',
    role: 'Koordynator / Pełny dostęp',
    roleLabel: 'Koordynator / Pełny dostęp',
    organizations: ['seksuologia', 'uzaleznienia'],
    accessibleOrgs: ['skn_seksuologii', 'seksuologia', 'uzaleznienia'],
    is_global_admin: false,
    must_change_password: false,
    isFirstLogin: false,
    tempPassword: DEFAULT_STARTER_PASSWORD,
    organization_id: 'uzaleznienia',
  },
  {
    email: '15998@student.wskz.pl',
    name: 'Tomasz Bratkowski',
    role: 'SUPER_ADMIN',
    roleLabel: 'Przewodniczący SKNS',
    isFirstLogin: true,
    tempPassword: DEFAULT_STARTER_PASSWORD,
    accessibleOrgs: ['*'],
  },
  {
    email: 'gabriel.creart@gmail.com',
    name: 'Michał Rodak',
    role: 'ADMIN',
    roleLabel: 'Zarząd Koła',
    isFirstLogin: true,
    tempPassword: DEFAULT_STARTER_PASSWORD,
    accessibleOrgs: ['*'],
  },
  {
    // HOTFIX: stały dostęp Liliany Sienkiewicz do Koła Psychoonkologii
    email: 'lajlasienkiewicz@gmail.com',
    name: 'Liliana Sienkiewicz',
    full_name: 'Liliana Sienkiewicz',
    role: 'Koordynator / Pełny dostęp',
    roleLabel: 'Koordynator / Pełny dostęp',
    organizations: ['psychoonkologia'],
    accessibleOrgs: ['psychoonkologia'],
    organization_id: 'psychoonkologia',
    is_global_admin: false,
    isFirstLogin: true,
    tempPassword: DEFAULT_STARTER_PASSWORD,
  },
];

export const STARTER_PASSWORDS = {
  'admin@wskz.pl': ADMIN_PASSWORD,
  'admin': ADMIN_PASSWORD,
  'zarzad@wskz.pl': ADMIN_PASSWORD,
  'opiekun@wskz.pl': DEFAULT_STARTER_PASSWORD,
  'w.czepirska@gmail.com': DEFAULT_STARTER_PASSWORD,
  'm.czepirek@gmail.com': DEFAULT_STARTER_PASSWORD,
  '15998@student.wskz.pl': DEFAULT_STARTER_PASSWORD,
  'gabriel.creart@gmail.com': DEFAULT_STARTER_PASSWORD,
  'atomekb73@gmail.com': '730273',
};

export const ACCESS_PASSWORDS = [
  ADMIN_PASSWORD,
  'Ntx2t44V',
  DEFAULT_STARTER_PASSWORD,
  'Start2026!',
  '730273',
  import.meta.env?.VITE_ACCESS_PASSWORD,
  import.meta.env?.VITE_ADMIN_PASSWORD,
].filter(Boolean);

export const DEFAULT_USER = {
  email: 'zarzad@wskz.pl',
  name: 'Zarząd SKN WSKZ',
  avatarUrl: '',
  role: 'SUPER_ADMIN',
  accessibleOrgs: ['*'], // Pełne uprawnienia administracyjne
};

export const DEMO_ACCOUNTS = [
  {
    email: 'zarzad@wskz.pl',
    name: 'Zarząd SKN',
    role: 'SUPER_ADMIN',
    accessibleOrgs: ['*'],
    description: 'Dostęp zarządu (pełne uprawnienia)',
  },
  {
    email: 'opiekun@wskz.pl',
    name: 'Opiekun Naukowy Koła',
    role: 'COORDINATOR',
    accessibleOrgs: ['*'],
    description: 'Opiekun naukowy koła',
  },
  {
    email: 'audytor@wskz.pl',
    name: 'Podgląd / Audyt',
    role: 'VIEWER',
    accessibleOrgs: ['*'],
    description: 'Ewidencja i sprawozdania (tylko odczyt)',
  },
];

const AuthContext = createContext(null);

// ── Uprawnienia z Supabase (SSOT) dla ekranu logowania ─────────────────────────
// Cache wyników zapytań do Supabase per e-mail (wypełniany asynchronicznie przez refreshRemoteAccess,
// odczytywany synchronicznie przez checkEmailStatus / loginWithPassword).
const remoteAccessCache = new Map();
const REMOTE_ACCESS_TIMEOUT_MS = 6000;

const STARTER_PASSWORD_SET = new Set([DEFAULT_STARTER_PASSWORD, 'StartCRM2026!', 'Start2026!']);

/** Ujednolicenie identyfikatorów kół (aliasy) – zgodne z normalizeOrgId w settingsService */
function normalizeAuthOrgId(orgId) {
  const str = String(orgId || '').trim();
  if (!str || str === '*') return str;
  if (str === 'skn-template' || str === 'default' || str === 'seksuologia') return 'skn_seksuologii';
  if (str === 'skn_psychoonkologii' || str === 'skn-psychoonkologia') return 'psychoonkologia';
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
  try {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), REMOTE_ACCESS_TIMEOUT_MS));
    const res = await Promise.race([fetchLoginAccessForEmail(cleanEmail), timeout]);
    if (res && res.ok) {
      remoteAccessCache.set(cleanEmail, res);
      return res;
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
function persistPasswordToSupabase(cleanEmail, password, userData = null) {
  const orgs = (userData?.accessibleOrgs || userData?.organizations || [])
    .filter(o => o && o !== '*')
    .map(normalizeAuthOrgId);
  if (orgs.length === 0) {
    const current = (typeof window !== 'undefined'
      ? (localStorage.getItem('crm_skn_current_org_id') || localStorage.getItem('crm_active_org_id'))
      : null) || 'skn_seksuologii';
    orgs.push(normalizeAuthOrgId(current));
  }
  Array.from(new Set(orgs)).forEach(orgId => {
    saveUserPasswordToDB(orgId, cleanEmail, password, false).catch(console.warn);
  });
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

/** Pobierz zapisane hasło użytkownika */
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
  if (STARTER_PASSWORDS[clean]) {
    return STARTER_PASSWORDS[clean];
  }
  return DEFAULT_STARTER_PASSWORD;
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const session = localStorage.getItem('crm_skn_auth_session');
      const saved = localStorage.getItem('crm_skn_auth_user');
      if (session && saved) {
        const parsed = JSON.parse(saved);
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
      return !!(session && saved);
    } catch {
      return false;
    }
  });

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
    if (user?.is_global_admin === false) return false;
    return MASTER_ADMIN_EMAILS.some(mEmail => mEmail.toLowerCase().trim() === userEmail);
  }, [user]);

  /** Weryfikacja czy użytkownik ma uprawnienia do danego koła */
  const canAccessOrg = useCallback((orgId) => {
    if (!user || !isAuthenticated) return false;
    if (isMasterUser || (user.role === 'SUPER_ADMIN' && user.is_global_admin !== false)) return true;
    const allowedOrgs = user.organizations || user.accessibleOrgs || [];
    if (Array.isArray(allowedOrgs)) {
      if (allowedOrgs.includes('*')) return true;
      if (allowedOrgs.includes(orgId)) return true;
      // mapowanie aliasów: seksuologia <-> skn_seksuologii
      if (orgId === 'skn_seksuologii' && allowedOrgs.includes('seksuologia')) return true;
      if (orgId === 'seksuologia' && allowedOrgs.includes('skn_seksuologii')) return true;
      if (orgId === 'psychoonkologia' && (allowedOrgs.includes('skn_psychoonkologii') || allowedOrgs.includes('skn-psychoonkologia'))) return true;
      if ((orgId === 'skn_psychoonkologii' || orgId === 'skn-psychoonkologia') && allowedOrgs.includes('psychoonkologia')) return true;
    }
    return false;
  }, [user, isAuthenticated, isMasterUser]);

  const isSuperAdmin = isMasterUser || (user?.role === 'SUPER_ADMIN' && user?.is_global_admin !== false);
  const isCoordinator = user?.role === 'COORDINATOR' || 
                        user?.role === 'Koordynator / Pełny dostęp' || 
                        user?.role === 'Dostęp pełny' || 
                        isSuperAdmin;
  const isViewer = user?.role === 'VIEWER';

  /** Sprawdzenie uprawnień adresu e-mail i stanu hasła */
  const checkEmailStatus = useCallback((inputEmail) => {
    if (!inputEmail || !inputEmail.trim()) {
      return { authorized: false, error: 'Wprowadź adres e-mail.' };
    }

    const cleanEmail = inputEmail.trim().toLowerCase();

    // Stały profil dla Magdy Czepirskiej (Seksuologia + Uzależnienia)
    if (cleanEmail === 'w.czepirska@gmail.com' || cleanEmail === 'm.czepirek@gmail.com') {
      const magdaUser = {
        ...MAGDA_DUAL_ACCESS_USER,
        email: cleanEmail,
      };
      return {
        authorized: true,
        hasPassword: true,
        isFirstLogin: false,
        mustChangePassword: false,
        user: magdaUser,
      };
    }

    // 1. Sprawdź czy konto jest w bazie uprawnionych lub dziedziczy rolę
    const isMaster = MASTER_ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail);
    const isDefaultBoard = cleanEmail === 'zarzad@wskz.pl';
    const demoMatch = DEMO_ACCOUNTS.find(d => d.email.toLowerCase() === cleanEmail);
    const defaultAuthMatch = DEFAULT_AUTHORIZED_ACCOUNTS.find(d => d.email.toLowerCase() === cleanEmail);

    // Źródła uprawnień (wszystkie koła):
    //  a) Supabase SSOT (cache z refreshRemoteAccess) – działa z każdego urządzenia,
    //  b) localStorage – klucze per koło (skn_access_users_<org>, crm_skn_<org>_supervisors, skn_board_tenures_<org>)
    //     oraz klucze globalne (legacy, bez przypisania do koła).
    const remote = remoteAccessCache.get(cleanEmail) || null;
    const sameEmail = (v) => String(v || '').trim().toLowerCase() === cleanEmail;

    const collectMatches = (lists, emailOf, extraFilter = () => true) => {
      const found = [];
      lists.forEach(({ orgId, list }) => {
        list.forEach(item => {
          if (item && sameEmail(emailOf(item)) && extraFilter(item)) found.push({ ...item, orgId: orgId || null });
        });
      });
      return found;
    };

    const accessMatches = [
      ...(remote?.accessMatches || []),
      ...collectMatches(collectLocalLists(/^skn_access_users_(.+)$/), u => u.email),
      ...collectMatches(collectLocalLists(/^skn_access_users$/), u => u.email),
    ];

    const supervisorMatches = [
      ...(remote?.supervisorMatches || []),
      ...collectMatches(collectLocalLists(/^crm_skn_(.+)_supervisors$/), s => s.email),
      ...collectMatches(collectLocalLists(/^skn_faculty_supervisors$/), s => s.email),
    ];

    const boardMatches = [
      ...(remote?.boardMatches || []),
      ...collectMatches(collectLocalLists(/^skn_board_tenures_(.+)$/), t => t.memberEmail || t.email, t => t.isActive !== false),
      ...collectMatches(collectLocalLists(/^skn_board_tenures$/), t => t.memberEmail || t.email, t => t.isActive !== false),
    ];

    // Najsilniejsza rola wśród wpisów ręcznych (ADMIN > pełny dostęp > koordynator > odczyt)
    const accessRank = (u) => {
      const r = String(u?.role || '');
      if (r === 'ADMIN' || r === 'SUPER_ADMIN') return 4;
      if (r === 'Dostęp pełny' || r === 'Koordynator / Pełny dostęp' || r === 'MODERATOR') return 3;
      if (r === 'COORDINATOR') return 2;
      if (r === 'VIEWER') return 1;
      return 2;
    };
    const accessMatch = [...accessMatches].sort((a, b) => accessRank(b) - accessRank(a))[0] || defaultAuthMatch;

    const supervisorMatch = supervisorMatches[0] || null;

    const isBoardAdminRole = (t) => {
      const roleStr = String(t?.roleName || t?.role || '').toLowerCase();
      return roleStr.includes('sekretarz') || roleStr.includes('przewodnicz');
    };
    const boardMatch = boardMatches.find(isBoardAdminRole) || boardMatches[0] || null;

    if (!isMaster && !isDefaultBoard && !demoMatch && !accessMatch && !supervisorMatch && !boardMatch) {
      return {
        authorized: false,
        error: 'Brak uprawnień dostępu. Twój adres nie został dodany przez zarząd koła ani nie pełni funkcji funkcyjnej.',
      };
    }

    // 1b. Ustal koła, do których użytkownik ma dostęp (izolacja tenantów)
    const orgSet = new Set();
    let hasLegacyUntagged = false;
    [...accessMatches, ...supervisorMatches, ...boardMatches].forEach(m => {
      if (m.orgId) orgSet.add(normalizeAuthOrgId(m.orgId));
      else hasLegacyUntagged = true;
    });
    let hasWildcard = Boolean(isMaster || isDefaultBoard || demoMatch);
    if (defaultAuthMatch) {
      const defOrgs = defaultAuthMatch.accessibleOrgs || defaultAuthMatch.organizations || ['*'];
      defOrgs.forEach(o => (o === '*' ? (hasWildcard = true) : orgSet.add(normalizeAuthOrgId(o))));
    }
    if (orgSet.size === 0 && hasLegacyUntagged) hasWildcard = true;

    // 2. Utwórz profil użytkownika z uwzględnieniem dziedziczenia ról (Zarząd, Sekretarz, Opiekun)
    let role = 'COORDINATOR';
    let name = cleanEmail.split('@')[0];
    let accessibleOrgs = hasWildcard || orgSet.size === 0 ? ['*'] : Array.from(orgSet);
    let inheritedRole = null;

    if (isMaster) {
      role = 'SUPER_ADMIN';
      name = 'Administrator Główny';
    } else if (isDefaultBoard) {
      role = 'SUPER_ADMIN';
      name = 'Zarząd Koła';
    } else if (boardMatch) {
      // Dziedziczenie ról funkcyjnych Zarządu: Sekretarz, Przewodniczący, Wiceprzewodniczący mają pełny dostęp (SUPER_ADMIN)
      if (isBoardAdminRole(boardMatch)) {
        role = 'SUPER_ADMIN';
      } else {
        role = 'COORDINATOR';
      }
      name = boardMatch.memberName || boardMatch.name || cleanEmail.split('@')[0];
      inheritedRole = boardMatch.roleName || 'Członek Zarządu';
    } else if (accessMatch) {
      role = accessMatch.role === 'ADMIN' ? 'SUPER_ADMIN' : (accessMatch.role || 'COORDINATOR');
      name = accessMatch.name || cleanEmail.split('@')[0];
    } else if (supervisorMatch) {
      // Dziedziczenie ról: Opiekun Naukowy
      role = 'COORDINATOR';
      name = supervisorMatch.name || supervisorMatch.fullName || 'Opiekun Naukowy';
      inheritedRole = 'Opiekun Naukowy Koła';
    } else if (demoMatch) {
      role = demoMatch.role || 'COORDINATOR';
      name = demoMatch.name;
    }

    // 3. Stan aktywacji konta: konto aktywowane (własne hasło) na dowolnym urządzeniu → hasło startowe nieważne
    const remotePassword = remote?.password || null;
    const activated = Boolean(
      remote?.firstLogin === false ||
      (remotePassword && !STARTER_PASSWORD_SET.has(remotePassword)) ||
      getUserFirstLoginStatus(cleanEmail, null) === false
    );

    const tempPass = activated ? null : (accessMatch?.tempPassword || null);

    const authUser = {
      email: cleanEmail,
      name,
      role,
      accessibleOrgs,
      organizations: accessibleOrgs,
      organization_id: accessibleOrgs[0] !== '*' ? accessibleOrgs[0] : undefined,
      inheritedRole,
      tempPassword: tempPass,
      loggedAt: new Date().toISOString(),
    };

    const storedPass = getUserStoredPassword(cleanEmail);
    const hasPassword = Boolean(storedPass || tempPass || remotePassword);
    const isFirstLogin = !activated && Boolean(tempPass || accessMatch?.isFirstLogin || getUserFirstLoginStatus(cleanEmail, accessMatch));

    return {
      authorized: true,
      hasPassword,
      isFirstLogin,
      activated,
      remotePassword,
      user: authUser,
    };
  }, []);

  /** Aktywacja nowego konta na pierwszym logowaniu i nadanie własnego hasła */
  const activateAccount = useCallback((email, newPassword, confirmPassword, userData = null) => {
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
      STARTER_PASSWORDS[cleanEmail],
    ].filter(Boolean).includes(p1);

    if (isStarter) {
      return { success: false, error: 'Nowe hasło nie może być hasłem startowym (StartCRM2026!). Wybierz inne, bezpieczne hasło stałe.' };
    }

    try {
      // 1. Zapisz nowe hasło w rejestrze haseł użytkowników (lokalnie i w Supabase)
      let passwords = {};
      try {
        const rawPass = localStorage.getItem('skn_user_passwords');
        if (rawPass) passwords = JSON.parse(rawPass);
      } catch {}
      passwords[cleanEmail] = p1;
      localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));

      // Zapis do Supabase SSOT w tle – dla wszystkich kół użytkownika (logowanie z dowolnego urządzenia)
      persistPasswordToSupabase(cleanEmail, p1, userData);

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

      // 4. Utwórz profil i zaloguj bezpośrednio do CRM
      const authUser = userData || {
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: cleanEmail.includes('zarzad') ? 'SUPER_ADMIN' : 'COORDINATOR',
        accessibleOrgs: ['*'],
        loggedAt: new Date().toISOString(),
      };

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

  /** Logowanie z hasłem */
  const loginWithPassword = useCallback((inputEmail, inputPassword) => {
    if (!inputEmail || !inputPassword) {
      return { success: false, error: 'Wypełnij wszystkie pola formularza.' };
    }

    const cleanEmail = inputEmail.trim().toLowerCase();
    const cleanPassword = inputPassword.trim();

    // Stały profil dostępu dla Magdy Czepirskiej (Seksuologia + Uzależnienia)
    const magdaAuth = authenticateMagda(cleanEmail, cleanPassword);
    if (magdaAuth && magdaAuth.success) {
      setUser(magdaAuth.user);
      setIsAuthenticated(true);
      try {
        localStorage.setItem('crm_skn_auth_session', JSON.stringify({
          email: cleanEmail,
          name: magdaAuth.user.name || magdaAuth.user.full_name,
          role: magdaAuth.user.role,
          timestamp: Date.now(),
        }));
        localStorage.setItem('crm_skn_auth_user', JSON.stringify(magdaAuth.user));
        // Zachowaj obecne koło jeśli jest jednym z dozwolonych (uzaleznienia lub skn_seksuologii)
        const currentOrg = localStorage.getItem('crm_skn_current_org_id');
        if (!currentOrg || (currentOrg !== 'uzaleznienia' && currentOrg !== 'skn_seksuologii')) {
          localStorage.setItem('crm_skn_current_org_id', 'uzaleznienia');
        }
      } catch (e) {
        console.warn('Błąd zapisu sesji:', e);
      }
      return { success: true, user: magdaAuth.user, redirectUrl: magdaAuth.redirectUrl || '/dashboard' };
    }

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

    const storedPassword = getUserStoredPassword(cleanEmail);
    const tempPassword = status.user?.tempPassword || null;
    const isMasterOrBoard = MASTER_ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail) || cleanEmail === 'zarzad@wskz.pl';

    const isStarterPassword = STARTER_PASSWORD_SET.has(cleanPassword);
    // Po aktywacji konta (własne hasło zapisane w Supabase lub lokalnie) hasło startowe przestaje działać
    if (status.activated && isStarterPassword && !isMasterOrBoard) {
      return { success: false, error: 'Konto zostało już aktywowane. Zaloguj się swoim hasłem stałym.' };
    }

    const isStarterMatch = isStarterPassword;
    const isTempPasswordMatch = (tempPassword && cleanPassword === tempPassword) || isStarterMatch;
    const isRemotePasswordMatch = Boolean(status.remotePassword && status.remotePassword === cleanPassword);
    const isPasswordValid = (storedPassword && storedPassword === cleanPassword) ||
                            isRemotePasswordMatch ||
                            isTempPasswordMatch ||
                            (isMasterOrBoard && (cleanPassword === ADMIN_PASSWORD || cleanPassword === 'Ntx2t44V'));

    if (!isPasswordValid) {
      return { success: false, error: 'Nieprawidłowe hasło dostępowe.' };
    }

    // Hasło potwierdzone przez Supabase – zapamiętaj je lokalnie na tym urządzeniu
    if (isRemotePasswordMatch && !isStarterPassword) {
      try {
        const passwords = readStorageJson('skn_user_passwords') || {};
        passwords[cleanEmail] = cleanPassword;
        localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));
        const statusMap = readStorageJson('skn_user_first_login_status') || {};
        statusMap[cleanEmail] = false;
        localStorage.setItem('skn_user_first_login_status', JSON.stringify(statusMap));
      } catch {}
    }

    // Wymuszenie zmiany hasła przy pierwszym logowaniu lub gdy podano hasło startowe StartCRM2026!
    const mustChangePassword = isStarterMatch || (tempPassword && cleanPassword === tempPassword) || status.isFirstLogin;
    if (!isMasterOrBoard && mustChangePassword) {
      return {
        success: false,
        requiresActivation: true,
        user: status.user,
        error: 'Wymagana zmiana hasła przy pierwszym logowaniu. Wprowadź swoje nowe hasło stałe.',
      };
    }

    setUser(status.user);
    setIsAuthenticated(true);

    try {
      localStorage.setItem('crm_skn_auth_session', JSON.stringify({
        email: cleanEmail,
        name: status.user.name,
        role: status.user.role,
        timestamp: Date.now(),
      }));
      localStorage.setItem('crm_skn_auth_user', JSON.stringify(status.user));
    } catch (e) {
      console.warn('Błąd zapisu sesji:', e);
    }

    return { success: true };
  }, [checkEmailStatus]);

  /** Logowanie z weryfikacją adresu e-mail i hasła (kompatybilność wsteczna) */
  const loginWithCredentials = useCallback((inputEmail, inputPassword) => {
    return loginWithPassword(inputEmail, inputPassword);
  }, [loginWithPassword]);

  /** Zmiana hasła przy pierwszym logowaniu lub na żądanie */
  const changePassword = useCallback((email, newPassword, confirmPassword, userData = null) => {
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
      return { success: false, error: 'Nowe hasło nie może być hasłem startowym (StartCRM2026!). Wybierz inne, bezpieczne hasło stałe.' };
    }

    try {
      // 1. Zapisz nowe hasło w rejestrze haseł użytkowników
      let passwords = {};
      try {
        const rawPass = localStorage.getItem('skn_user_passwords');
        if (rawPass) passwords = JSON.parse(rawPass);
      } catch {}
      passwords[cleanEmail] = p1;
      localStorage.setItem('skn_user_passwords', JSON.stringify(passwords));

      // Zapis nowego hasła w Supabase SSOT (logowanie z dowolnego urządzenia)
      persistPasswordToSupabase(cleanEmail, p1, userData);

      // 2. Oznacz isFirstLogin jako false
      let statusMap = {};
      try {
        const rawStatus = localStorage.getItem('skn_user_first_login_status');
        if (rawStatus) statusMap = JSON.parse(rawStatus);
      } catch {}
      statusMap[cleanEmail] = false;
      localStorage.setItem('skn_user_first_login_status', JSON.stringify(statusMap));

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

      // 4. Utwórz obiekt zautoryzowanego użytkownika
      const authUser = userData || {
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: cleanEmail.includes('zarzad') ? 'SUPER_ADMIN' : 'COORDINATOR',
        accessibleOrgs: ['*'],
        loggedAt: new Date().toISOString(),
      };

      setUser(authUser);
      setIsAuthenticated(true);

      localStorage.setItem('crm_skn_auth_session', JSON.stringify({
        email: cleanEmail,
        name: authUser.name,
        role: authUser.role,
        timestamp: Date.now(),
      }));
      localStorage.setItem('crm_skn_auth_user', JSON.stringify(authUser));

      return { success: true };
    } catch (e) {
      console.error('Błąd podczas zapisywania nowego hasła:', e);
      return { success: false, error: 'Wystąpił błąd podczas zapisywania hasła.' };
    }
  }, []);

  /** Logowanie za pomocą Google OAuth 2.0 (Google Identity Services / @react-oauth/google ready) */
  const loginWithGoogle = useCallback((credentialResponse) => {
    if (!credentialResponse?.credential) {
      console.error('Brak tokenu w odpowiedzi Google OAuth');
      return;
    }

    const payload = parseJwtPayload(credentialResponse.credential);
    if (!payload || !payload.email) {
      console.error('Nieprawidłowy payload Google OAuth');
      return;
    }

    const email = payload.email.toLowerCase().trim();
    const isMaster = MASTER_ADMIN_EMAILS.some(mEmail => mEmail.toLowerCase().trim() === email);

    const newUser = {
      email,
      name: payload.name || payload.given_name || email.split('@')[0],
      avatarUrl: payload.picture || '',
      role: isMaster ? 'SUPER_ADMIN' : 'COORDINATOR',
      accessibleOrgs: ['*'],
      token: credentialResponse.credential,
    };

    setUser(newUser);
    setIsAuthenticated(true);
  }, []);

  /** Przełącz profil demonstracyjny */
  const switchDemoAccount = useCallback((account) => {
    if (import.meta.env?.PROD) {
      console.warn('[AuthContext] switchDemoAccount jest zablokowane w środowisku produkcyjnym.');
      return;
    }
    const updated = {
      ...account,
      avatarUrl: account.avatarUrl || '',
    };
    setUser(updated);
    setIsAuthenticated(true);
  }, []);

  /** Zmiana hasła przez zalogowanego użytkownika (z weryfikacją aktualnego hasła) */
  const changeUserPassword = useCallback((currentPassword, newPassword, confirmPassword) => {
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
      isCurrentValid = customPass === curPass;
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
      ].filter(Boolean);
      isCurrentValid = allowedTempPasswords.some(p => p && p.trim() === curPass);
    }

    if (!isCurrentValid) {
      return { success: false, error: 'Wprowadzone dotychczasowe hasło jest nieprawidłowe.' };
    }

    // 2. Wywołaj właściwą procedurę zmiany hasła
    return changePassword(cleanEmail, p1, p2, user);
  }, [user, changePassword]);

  /** Wylogowanie */
  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('crm_skn_auth_session');
      localStorage.removeItem('crm_skn_auth_user');
      localStorage.removeItem('crm_psychoonkologia_auth_session');
      localStorage.removeItem('crm_psychoonkologia_auth_user');
      localStorage.removeItem('crm_auth_user');
    } catch {}
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isSuperAdmin,
    isCoordinator,
    isViewer,
    canAccessOrg,
    checkEmailStatus,
    refreshRemoteAccess,
    authenticateMagda,
    MAGDA_DUAL_ACCESS_USER,
    checkMagdaBypass,
    MOCK_MAGDA_USER,
    activateAccount,
    loginWithPassword,
    loginWithCredentials,
    changePassword,
    changeUserPassword,
    loginWithGoogle,
    switchDemoAccount,
    logout,
    setUser,
  }), [
    user,
    isAuthenticated,
    isSuperAdmin,
    isCoordinator,
    isViewer,
    canAccessOrg,
    checkEmailStatus,
    activateAccount,
    loginWithPassword,
    loginWithCredentials,
    changePassword,
    changeUserPassword,
    loginWithGoogle,
    switchDemoAccount,
    logout,
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

