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
    name: 'Delikatna Lawenda & Wrzosowy Fiolet (Psychoonkologia)',
    orgShortName: 'SKN Psychoonkologii',
    badgeText: 'ONKO',
    colorKey: 'purple',

    // Tło zewnętrzne aplikacji (backdrop) - delikatny, pastelowy odcień fioletu (lawendowy/wrzosowy)
    backdropGradientClass: 'from-slate-50 via-purple-50/40 to-violet-50/50',
    backdropStyle: {
      background: 'linear-gradient(135deg, #fbfaff 0%, #f6f3ff 45%, #ede9fe 100%)',
    },

    // Header Avatar & Badge - nasycony, elegancki wrzos z wyraźnym białym napisem ONKO
    headerBadgeGradient: 'bg-gradient-to-br from-purple-700 via-violet-700 to-indigo-800 shadow-purple-500/25',
    headerTagBadge: 'bg-purple-50 text-purple-900 border-purple-200/90 font-bold',
    headerHoverTitle: 'group-hover:text-purple-700',
    headerHoverIcon: 'group-hover:text-purple-700',

    // Primary Action Button (Odśwież dane, Zatwierdź, Dodaj ręcznie)
    primaryBtn: 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-xs shadow-purple-600/20 focus:ring-purple-500',
    primaryBtnOutline: 'border-purple-300 text-purple-900 hover:bg-purple-50',

    // Nawigacja i Aktywne zakładki
    navActiveTabBorder: 'border-purple-300 ring-1 ring-purple-200/50',
    navActiveTabIcon: 'text-purple-600',
    navActiveSubtabText: 'text-purple-950 font-bold',
    navActiveIndicator: 'bg-purple-600',
    navBadge: 'bg-purple-600 text-white',

    // Kontenery widżetów, statystyk i filtrów (bardzo jasny, pastelowy odcień fioletu)
    widgetCardBg: 'bg-white/95 border-purple-200',
    statDotColor: 'bg-purple-500',
    statIconColor: 'text-purple-600',
    filterBarBg: 'bg-purple-50/40 border-purple-200/70',

    // Dropdown wyboru organizacji
    dropdownSelectedClass: 'bg-purple-50/90 text-purple-950 font-bold border-purple-200 shadow-xs',
    dropdownSelectedIcon: 'text-purple-600',

    // Akcenty kart i wskaźników
    accentRing: 'focus:ring-purple-500',
    accentBorder: 'border-purple-200',
    accentSoftBg: 'bg-purple-50/70',
    accentText: 'text-purple-900',

    // Zmienne CSS
    cssVars: {
      '--tenant-primary': '#7c3aed',
      '--tenant-primary-hover': '#6d28d9',
      '--tenant-primary-light': '#f5f3ff',
      '--tenant-primary-border': '#ddd6fe',
      '--tenant-accent': '#8b5cf6',
      '--tenant-backdrop-from': '#fbfaff',
      '--tenant-backdrop-via': '#f6f3ff',
      '--tenant-backdrop-to': '#ede9fe',
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

  if (cleanId === 'psychoonkologia' || cleanId === 'skn_psychoonkologii' || cleanId === 'skn-psychoonkologia' || cleanId.includes('psycho') || cleanId.includes('onko')) {
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
