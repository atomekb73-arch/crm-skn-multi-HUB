/**
 * System dynamicznej tematyzacji kolorystycznej (Tenant Branding System)
 * Studenckie Koło Naukowe Seksuologii WSKZ (skn_seksuologii) vs Koło Naukowe Zachowań Ryzykowych i Uzależnień (uzaleznienia)
 */

export const TENANT_THEMES = {
  skn_seksuologii: {
    id: 'skn_seksuologii',
    name: 'Pastelowy Błękit & Indygo (Seksuologia)',
    orgShortName: 'SKN Seksuologii',
    badgeText: 'SEKS',
    colorKey: 'indigo',

    // Tło zewnętrzne aplikacji (backdrop) - elegancki pastelowy błękit
    backdropGradientClass: 'from-slate-50 via-sky-50/40 to-indigo-50/50',
    backdropStyle: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #f0f9ff 45%, #eef2ff 100%)',
    },
    
    // Header Avatar & Badge
    headerBadgeGradient: 'bg-gradient-to-br from-indigo-600 via-sky-600 to-indigo-700 shadow-indigo-500/25',
    headerTagBadge: 'bg-sky-50 text-indigo-700 border-indigo-200/90',
    headerHoverTitle: 'group-hover:text-indigo-600',
    headerHoverIcon: 'group-hover:text-indigo-600',

    // Primary Action Button (Odśwież, Zatwierdź itp.)
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs shadow-indigo-600/20 focus:ring-indigo-500',
    primaryBtnOutline: 'border-indigo-300 text-indigo-700 hover:bg-indigo-50',

    // Nawigacja i Aktywne zakładki
    navActiveTabIcon: 'text-indigo-600',
    navActiveSubtabText: 'text-indigo-950',
    navActiveIndicator: 'bg-indigo-600',
    navBadge: 'bg-indigo-600 text-white',

    // Dropdown wyboru organizacji
    dropdownSelectedClass: 'bg-indigo-50/90 text-indigo-950 font-bold border-indigo-200 shadow-xs',
    dropdownSelectedIcon: 'text-indigo-600',

    // Akcenty kart i wskaźników
    accentRing: 'focus:ring-indigo-500',
    accentBorder: 'border-indigo-200',
    accentSoftBg: 'bg-indigo-50/70',
    accentText: 'text-indigo-700',

    // Zmienne CSS
    cssVars: {
      '--tenant-primary': '#4f46e5',
      '--tenant-primary-hover': '#4338ca',
      '--tenant-primary-light': '#eef2ff',
      '--tenant-primary-border': '#c7d2fe',
      '--tenant-accent': '#0284c7',
      '--tenant-backdrop-from': '#f8fafc',
      '--tenant-backdrop-via': '#f0f9ff',
      '--tenant-backdrop-to': '#eef2ff',
    },
  },

  uzaleznienia: {
    id: 'uzaleznienia',
    name: 'Szałwiowa Mięta & Prestiżowy Szmaragd (Uzależnienia)',
    orgShortName: 'SKN Uzależnień',
    badgeText: 'UZAL',
    colorKey: 'teal',

    // Tło zewnętrzne aplikacji (backdrop) - prestiżowy odcień szałwiowo-miętowy
    backdropGradientClass: 'from-slate-50 via-emerald-50/45 to-teal-50/55',
    backdropStyle: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #ecfdf5 45%, #f0fdfa 100%)',
    },

    // Header Avatar & Badge
    headerBadgeGradient: 'bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-700 shadow-teal-500/25',
    headerTagBadge: 'bg-teal-50 text-teal-800 border-teal-200/90',
    headerHoverTitle: 'group-hover:text-teal-600',
    headerHoverIcon: 'group-hover:text-teal-600',

    // Primary Action Button (Odśwież, Zatwierdź itp.)
    primaryBtn: 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-xs shadow-teal-600/20 focus:ring-teal-500',
    primaryBtnOutline: 'border-teal-300 text-teal-800 hover:bg-teal-50',

    // Nawigacja i Aktywne zakładki
    navActiveTabIcon: 'text-teal-600',
    navActiveSubtabText: 'text-teal-950',
    navActiveIndicator: 'bg-teal-600',
    navBadge: 'bg-teal-600 text-white',

    // Dropdown wyboru organizacji
    dropdownSelectedClass: 'bg-teal-50/90 text-teal-950 font-bold border-teal-200 shadow-xs',
    dropdownSelectedIcon: 'text-teal-600',

    // Akcenty kart i wskaźników
    accentRing: 'focus:ring-teal-500',
    accentBorder: 'border-teal-200',
    accentSoftBg: 'bg-teal-50/70',
    accentText: 'text-teal-800',

    // Zmienne CSS
    cssVars: {
      '--tenant-primary': '#0d9488',
      '--tenant-primary-hover': '#0f766e',
      '--tenant-primary-light': '#f0fdfa',
      '--tenant-primary-border': '#99f6e4',
      '--tenant-accent': '#059669',
      '--tenant-backdrop-from': '#f8fafc',
      '--tenant-backdrop-via': '#ecfdf5',
      '--tenant-backdrop-to': '#f0fdfa',
    },
  },

  psychoonkologia: {
    id: 'psychoonkologia',
    name: 'Pudrowy Róż & Szlachetny Rubin (Psychoonkologia)',
    orgShortName: 'SKN Psychoonkologii',
    badgeText: 'PSYCHO',
    colorKey: 'rose',

    // Tło zewnętrzne aplikacji (backdrop) - elegancki pudrowy róż
    backdropGradientClass: 'from-slate-50 via-rose-50/40 to-pink-50/50',
    backdropStyle: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #fff1f2 45%, #fdf2f8 100%)',
    },

    // Header Avatar & Badge
    headerBadgeGradient: 'bg-gradient-to-br from-rose-600 via-pink-600 to-rose-700 shadow-rose-500/25',
    headerTagBadge: 'bg-rose-50 text-rose-800 border-rose-200/90',
    headerHoverTitle: 'group-hover:text-rose-600',
    headerHoverIcon: 'group-hover:text-rose-600',

    // Primary Action Button
    primaryBtn: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs shadow-rose-600/20 focus:ring-rose-500',
    primaryBtnOutline: 'border-rose-300 text-rose-800 hover:bg-rose-50',

    // Nawigacja i Aktywne zakładki
    navActiveTabIcon: 'text-rose-600',
    navActiveSubtabText: 'text-rose-950',
    navActiveIndicator: 'bg-rose-600',
    navBadge: 'bg-rose-600 text-white',

    // Dropdown wyboru organizacji
    dropdownSelectedClass: 'bg-rose-50/90 text-rose-950 font-bold border-rose-200 shadow-xs',
    dropdownSelectedIcon: 'text-rose-600',

    // Akcenty kart i wskaźników
    accentRing: 'focus:ring-rose-500',
    accentBorder: 'border-rose-200',
    accentSoftBg: 'bg-rose-50/70',
    accentText: 'text-rose-800',

    // Zmienne CSS
    cssVars: {
      '--tenant-primary': '#e11d48',
      '--tenant-primary-hover': '#be123c',
      '--tenant-primary-light': '#fff1f2',
      '--tenant-primary-border': '#fecdd3',
      '--tenant-accent': '#db2777',
      '--tenant-backdrop-from': '#f8fafc',
      '--tenant-backdrop-via': '#fff1f2',
      '--tenant-backdrop-to': '#fdf2f8',
    },
  },
};

/**
 * Zwraca bezpieczny obiekt motywu na podstawie obiektu organizacji lub jej ID
 */
export function getTenantTheme(orgOrId) {
  const orgId = typeof orgOrId === 'string'
    ? orgOrId
    : (orgOrId?.id || '');

  const cleanId = String(orgId || '').trim().toLowerCase();

  if (cleanId === 'uzaleznienia' || cleanId === 'sknu' || cleanId.includes('uzalez')) {
    return TENANT_THEMES.uzaleznienia;
  }

  if (cleanId === 'psychoonkologia' || cleanId === 'skn_psychoonkologii' || cleanId === 'skn-psychoonkologia' || cleanId.includes('psycho')) {
    return TENANT_THEMES.psychoonkologia;
  }

  // Domyślny motyw Seksuologii (lub dopasowanie bezpośrednie)
  return TENANT_THEMES.skn_seksuologii;
}

/**
 * Aplikuje zmienne CSS i atrybuty data-tenant na poziomie dokumentu DOM
 */
export function applyTenantThemeToDom(theme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const targetId = theme.id || 'skn_seksuologii';

  // Ustawienie atrybutu data-tenant
  root.setAttribute('data-tenant', targetId);

  // Ustawienie zmiennych CSS
  if (theme.cssVars) {
    Object.entries(theme.cssVars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  }
}
