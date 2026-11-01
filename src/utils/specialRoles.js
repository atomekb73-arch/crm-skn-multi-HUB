// ─── Special Roles & Faculty Supervisors (Clean Template) ───────────────────

export const DEFAULT_FACULTY_SUPERVISORS = [
  {
    id: 'sup_ewa_skupinska',
    name: 'Ewa Skupińska',
    fullName: 'dr Ewa Skupińska',
    academicTitle: 'dr',
    email: '',
    role: 'Opiekun Koła',
    isActive: true,
    aliases: ['Ewa Skupińska', 'dr Ewa Skupińska', 'Skupińska Ewa', 'dr hab. Ewa Skupińska', 'prof. Ewa Skupińska', 'Ewa Skupinska', 'dr Ewa Skupinska'],
  },
  {
    id: 'sup_martyna_dziekan',
    name: 'Martyna Dziekan',
    fullName: 'dr Martyna Dziekan',
    academicTitle: 'dr',
    email: '',
    role: 'Opiekun Koła',
    isActive: true,
    aliases: ['Martyna Dziekan', 'dr Martyna Dziekan', 'Dziekan Martyna', 'Martyna Dziekan-Kowalska', 'dr Martyna Dziekan-Kowalska'],
  },
];

export const FACULTY_SUPERVISORS = DEFAULT_FACULTY_SUPERVISORS;

export function getStoredSupervisors(orgId = 'seksuologia') {
  if (typeof window === 'undefined') return DEFAULT_FACULTY_SUPERVISORS;
  try {
    const key = `crm_skn_${orgId || 'seksuologia'}_supervisors`;
    const saved = localStorage.getItem(key) ||
                  localStorage.getItem('skn_supervisors_config') ||
                  localStorage.getItem('crm_supervisors_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_FACULTY_SUPERVISORS;
}

export const PARTICIPANT_ROLES = {
  member: {
    id: 'member',
    label: 'Członek koła',
    icon: '',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Student / aktywny członek koła (wliczany do frekwencji)',
    isStudent: true,
  },
  supervisor: {
    id: 'supervisor',
    label: 'Opiekun Koła',
    icon: '',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold',
    description: 'Oficjalny Opiekun Koła Naukowego (protokół)',
    isStudent: false,
  },
  speaker: {
    id: 'speaker',
    label: 'Prelegent / Gość Specjalny',
    icon: '',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 font-bold',
    description: 'Prowadzący spotkanie / prelegent gościnny',
    isStudent: false,
  },
  guest: {
    id: 'guest',
    label: 'Gość zewnętrzny',
    icon: '',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Uczestnik otwarty / gość spoza koła',
    isStudent: false,
  },
};

/**
 * Usuwa polskie znaki diakrytyczne i normalizuje tekst
 */
export function normalizeDiacritics(str) {
  if (!str) return '';
  return String(str)
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Mapowania niestandardowych wpisów na profile studentów
 */
export const CUSTOM_MAPPINGS = [];

/**
 * Pomocnicza funkcja sprawdzania niestandardowych mapowań
 */
export function isMonikaLyniewska(nameOrEmailOrIndex) {
  if (!nameOrEmailOrIndex) return false;
  const s = String(nameOrEmailOrIndex).toLowerCase();
  return s.includes('34327') || s.includes('lyniewska') || s.includes('łyniewska');
}

/**
 * Zwraca dopasowany profil z CUSTOM_MAPPINGS jeśli istnieje
 */
export function getCustomMappedMember(nameOrEmailOrIndex) {
  if (!nameOrEmailOrIndex) return null;
  const matchObj = CUSTOM_MAPPINGS.find(m => m && typeof m.match === 'function' && m.match(nameOrEmailOrIndex));
  return matchObj ? matchObj.member : null;
}

/**
 * Znajduje pasującego opiekuna na podstawie imienia, nazwiska, aliasu lub e-maila
 * Eliminuje częściowe dopasowania rozmyte (np. Ewa Skupińska vs Barbara Kupińska).
 */
export function findMatchingSupervisor(nameOrEmail, customSupervisors = null) {
  if (!nameOrEmail) return null;
  const raw = String(nameOrEmail)
    .replace(/^\[SPEAKER\]:\s*/i, '')
    .replace(/^\[GOŚĆ\]:\s*/i, '')
    .replace(/^\[GOSC\]:\s*/i, '')
    .replace(/^\[PRELEGENT\]:\s*/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();

  const norm = normalizeDiacritics(raw)
    .replace(/\b(dr\s+hab\.|dr\s+n\.\s*med\.|prof\.\s*zw\.|dr|hab\.|prof\.|mgr\s+inż\.|mgr|lek\.|inż\.)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!norm || norm.length < 3) return null;

  let list = Array.isArray(customSupervisors) && customSupervisors.length > 0
    ? customSupervisors
    : getStoredSupervisors();

  if (!Array.isArray(list) || list.length === 0) {
    list = DEFAULT_FACULTY_SUPERVISORS;
  }

  const combinedList = [...list];
  for (const defSup of DEFAULT_FACULTY_SUPERVISORS) {
    if (!combinedList.some(s => normalizeDiacritics(s.name || s.fullName) === normalizeDiacritics(defSup.name))) {
      combinedList.push(defSup);
    }
  }

  return combinedList.find(sup => {
    if (sup.isActive === false) return false;

    // 1. Zgodność e-mail
    if (sup.email && normalizeDiacritics(sup.email).toLowerCase().trim() === normalizeDiacritics(nameOrEmail).toLowerCase().trim()) {
      return true;
    }

    // 2. Ścisła zgodność 1:1 Imię + Nazwisko (oba kierunki)
    const supNorm = normalizeDiacritics(sup.name || sup.fullName)
      .replace(/\b(dr\s+hab\.|dr\s+n\.\s*med\.|prof\.\s*zw\.|dr|hab\.|prof\.|mgr\s+inż\.|mgr|lek\.|inż\.)\b/gi, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (supNorm) {
      if (norm === supNorm) return true;
      const supTokens = supNorm.split(' ').filter(Boolean);
      if (supTokens.length >= 2 && norm === [...supTokens].reverse().join(' ')) return true;
    }

    // 3. Ścisła zgodność z aliasami opiekuna
    if (Array.isArray(sup.aliases) || typeof sup.aliases === 'string') {
      const aliasesList = Array.isArray(sup.aliases)
        ? sup.aliases
        : String(sup.aliases).split(/[,;\n\r]+/).map(a => a.trim()).filter(Boolean);

      for (const alias of aliasesList) {
        const aliasNorm = normalizeDiacritics(alias)
          .replace(/\b(dr\s+hab\.|dr\s+n\.\s*med\.|prof\.\s*zw\.|dr|hab\.|prof\.|mgr\s+inż\.|mgr|lek\.|inż\.)\b/gi, ' ')
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (aliasNorm) {
          if (norm === aliasNorm) return true;
          const aTokens = aliasNorm.split(' ').filter(Boolean);
          if (aTokens.length >= 2 && norm === [...aTokens].reverse().join(' ')) return true;
        }
      }
    }

    return false;
  }) || null;
}

/**
 * Sprawdza, czy dana nazwa lub e-mail odpowiada oficjalnemu opiekunowi koła
 */
export function isFacultySupervisor(nameOrEmail, customSupervisors = null) {
  return findMatchingSupervisor(nameOrEmail, customSupervisors) != null;
}

/**
 * Automatyczne wykrycie roli uczestnika
 */
export function detectParticipantRole(rawName, member = null, customSupervisors = null) {
  if (!rawName) return 'member';
  const norm = normalizeDiacritics(rawName);
  if (norm.includes('[speaker]') || norm.includes('speaker:') || norm.includes('[prelegent]') || norm.includes('prelegent:') || norm.includes('gosc specjalny') || norm.includes('prelegent')) {
    return 'speaker';
  }
  if (norm.includes('[gosc]') || norm.includes('gosc:') || norm.startsWith('gosc ') || norm.includes('wolny sluchacz') || norm.includes('(gosc)')) {
    return 'guest';
  }
  if (isFacultySupervisor(rawName, customSupervisors) || (member && isFacultySupervisor(member.fullName, customSupervisors))) {
    return 'supervisor';
  }
  if (member) {
    return 'member';
  }
  return 'member';
}

/**
 * Sprawdza, czy rekord członka ma status historyczny / archiwalny / zrezygnowany
 */
export function isFormerMemberRecord(member) {
  if (!member) return false;
  const s = String(member.status || '').toLowerCase();
  const sw = String(member.statusWeryfikacji || '').toLowerCase();
  return Boolean(
    member.isFormerMember ||
    member.isArchived ||
    member.isHistorical ||
    member.isManual ||
    s === 'resigned' ||
    s === 'archived' ||
    s === 'nieaktywny' ||
    s === 'były' ||
    s === 'byly' ||
    sw === 'nieaktywny' ||
    sw === 'archiwum' ||
    sw === 'były' ||
    sw === 'byly'
  );
}

