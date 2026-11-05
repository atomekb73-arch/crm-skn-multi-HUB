import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { showToast } from '../utils/toast';
import {
  getOrgKey,
  getOrgStorage,
  setOrgStorage,
  removeOrgStorage,
  clearOrgWorkspace,
  restoreLegacyMeetingData,
  getCorrespondenceLog,
  addCorrespondenceEntry,
  updateCorrespondenceEntry,
  deleteCorrespondenceEntry,
  getMeetingsTrash,
  addMeetingToTrash,
  restoreMeetingFromTrash,
  permanentlyDeleteMeetingFromTrash,
  getCustomMeetings,
  saveCustomMeeting,
  deleteCustomMeeting,
  getMeetingOverrides,
  saveMeetingOverride,
} from '../utils/storage';
import { fetchOrgSettingsFromDB } from '../services/settingsService';
import { getTenantTheme, applyTenantThemeToDom } from '../theme/tenantTheme';
import { useAuth } from './AuthContext';

export const DEFAULT_ORGS = [
  {
    id: 'skn_seksuologii',
    name: 'Studenckie Koło Naukowe Seksuologii WSKZ',
    shortName: 'SKN Seksuologii',
    tag: 'SKN-SEKS',
    faculty: 'Instytut Psychologii WSKZ',
    unit: 'Instytut Psychologii WSKZ',
    academicYear: '2026/2027',
    sheetId: '1hNCTDi08_ttX8wI04FVh7MCgs2T4w92KdRgfK7pCiq0k',
    calendarKey: 'ks9aiux4jiza1ronpd',
    calendarId: 'ks9aiux4jiza1ronpd',
    teamupApiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    teamupToken: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    subcalendarId: '14518766',
    subcalendarName: '10 💚 SKN Seksuologii',
    description: 'Studenckie Koło Naukowe Seksuologii WSKZ - Oficjalna ewidencja i harmonogram',
    color: 'indigo',
    isDefault: true,
    supervisors: [
      {
        id: 'sup_skupinska',
        academicTitle: 'mgr',
        name: 'Ewa Skupińska',
        fullName: 'mgr Ewa Skupińska',
        affiliation: 'Instytut Psychologii WSKZ',
        role: 'Opiekun Naukowy Koła',
        email: 'ewa.skupinska@wskz.pl',
        isActive: true,
      },
      {
        id: 'sup_dziekan',
        academicTitle: 'mgr',
        name: 'Martyna Dziekan',
        fullName: 'mgr Martyna Dziekan',
        affiliation: 'Instytut Psychologii WSKZ',
        role: 'Opiekun Naukowy Koła',
        email: 'martyna.dziekan@wskz.pl',
        isActive: true,
      },
    ],
  },
  {
    id: 'uzaleznienia',
    name: 'Studenckie Koło Naukowe Zachowań Ryzykowych i Uzależnień',
    shortName: 'SKN Uzależnień',
    tag: 'SKN-UZAL',
    faculty: 'Instytut Psychologii WSKZ',
    unit: 'Instytut Psychologii WSKZ',
    academicYear: '2026/2027',
    sheetId: '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y',
    calendarKey: 'ks9aiux4jiza1ronpd',
    calendarId: 'ks9aiux4jiza1ronpd',
    teamupApiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    teamupToken: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    subcalendarId: '15520561',
    subcalendarName: '05 🏷️ SKN Psychologii Zachowań Ryzykownych i Uzależnień',
    description: 'Studenckie Koło Naukowe Zachowań Ryzykowych i Uzależnień WSKZ',
    color: 'teal',
    isDefault: false,
    supervisors: [
      {
        id: 'sup_pietrzak',
        academicTitle: 'mgr',
        name: 'Sławomir Pietrzak',
        fullName: 'mgr Sławomir Pietrzak',
        affiliation: 'Instytut Psychologii WSKZ',
        role: 'Opiekun Koła Naukowego',
        email: 'slawomir.pietrzak@wskz.pl',
        isActive: true,
      },
    ],
  },
  {
    id: 'psychoonkologia',
    name: 'Studenckie Koło Naukowe Psychoonkologii WSKZ',
    shortName: 'SKN Psychoonkologii',
    tag: 'SKN-ONKO',
    badgeText: 'ONKO',
    faculty: 'Instytut Psychologii WSKZ',
    unit: 'Instytut Psychologii WSKZ',
    academicYear: '2026/2027',
    sheetId: '1Omb7RbsMeiUs8IlXuKDAteXyd8lnkAXehX1nhofOTAY',
    calendarKey: 'ks9aiux4jiza1ronpd',
    calendarId: 'ks9aiux4jiza1ronpd',
    teamupApiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    teamupToken: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
    subcalendarId: '15520558',
    subcalendarName: '07 🎗️ SKN Psychoonkologii',
    description: 'Studenckie Koło Naukowe Psychoonkologii WSKZ - Oficjalna ewidencja i harmonogram',
    color: 'purple',
    isDefault: false,
    supervisors: [
      {
        id: 'sup_skupinska_psycho',
        academicTitle: 'mgr',
        name: 'Ewa Skupińska',
        fullName: 'mgr Ewa Skupińska',
        affiliation: 'Instytut Psychologii WSKZ',
        role: 'Opiekun Naukowy Koła',
        email: 'ewa.skupinska@wskz.pl',
        isActive: true,
      },
      {
        id: 'sup_dziekan_psycho',
        academicTitle: 'mgr',
        name: 'Martyna Dziekan',
        fullName: 'mgr Martyna Dziekan',
        affiliation: 'Instytut Psychologii WSKZ',
        role: 'Opiekun Naukowy Koła',
        email: 'martyna.dziekan@wskz.pl',
        isActive: true,
      },
    ],
  },
];

const OrgContext = createContext(null);

const safeGetStorage = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`Błąd odczytu ${key} z localStorage:`, e);
    return fallback;
  }
};

export function OrgProvider({ children }) {
  // Load saved organizations or use defaults, ensuring both clubs are available
  const [organizations, setOrganizations] = useState(() => {
    try {
      const parsed = safeGetStorage('crm_skn_organizations', null);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const mapped = parsed.map((o) => {
          if (
            !o.name ||
            o.id === 'skn-template' ||
            o.id === 'skn_seksuologii' ||
            o.name === 'Studenckie Koło Naukowe' ||
            o.name === 'Studenckie Koło Naukowe WSKZ' ||
            o.name.includes('Seksuolog')
          ) {
            return {
              ...DEFAULT_ORGS[0],
              ...o,
              id: 'skn_seksuologii',
              name: 'Studenckie Koło Naukowe Seksuologii WSKZ',
              shortName: 'SKN Seksuologii',
              tag: 'SKN-SEKS',
              subcalendarId: o.subcalendarId || '14518766',
            };
          }
          if (o.id === 'uzaleznienia' || o.name?.includes('Uzależn') || o.name?.includes('Ryzykow')) {
            return {
              ...DEFAULT_ORGS[1],
              ...o,
              id: 'uzaleznienia',
              calendarKey: 'ks9aiux4jiza1ronpd',
              calendarId: 'ks9aiux4jiza1ronpd',
              subcalendarId: '15520561',
              teamupApiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
              teamupToken: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
              subcalendarName: '05 🏷️ SKN Psychologii Zachowań Ryzykownych i Uzależnień',
            };
          }
          if (o.id === 'psychoonkologia' || o.id === 'skn_psychoonkologii' || o.name?.includes('Psychoonkol')) {
            return {
              ...DEFAULT_ORGS[2],
              ...o,
              id: 'psychoonkologia',
              tag: 'SKN-ONKO',
              badgeText: 'ONKO',
              color: 'purple',
              calendarKey: 'ks9aiux4jiza1ronpd',
              calendarId: 'ks9aiux4jiza1ronpd',
              subcalendarId: '15520558',
              teamupApiKey: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
              teamupToken: '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112',
              subcalendarName: '07 🎗️ SKN Psychoonkologii',
            };
          }
          return o;
        });

        // Ensure uzaleznienia exists in the list
        if (!mapped.some(o => o.id === 'uzaleznienia')) {
          mapped.push(DEFAULT_ORGS[1]);
        }
        // Ensure psychoonkologia exists in the list
        if (!mapped.some(o => o.id === 'psychoonkologia')) {
          mapped.push(DEFAULT_ORGS[2]);
        }
        return mapped;
      }
    } catch (err) {
      console.error('Błąd odczytu crm_skn_organizations z localStorage:', err);
    }
    return DEFAULT_ORGS;
  });

  // Current active organization ID
  const [currentOrgId, setCurrentOrgIdState] = useState(() => {
    try {
      const savedId = localStorage.getItem('crm_skn_current_org_id');
      if (savedId) {
        if (savedId === 'skn-template') return 'skn_seksuologii';
        return savedId;
      }
    } catch {}
    return 'skn_seksuologii';
  });

  // Save organizations to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('crm_skn_organizations', JSON.stringify(organizations));
    } catch (err) {
      console.error('Błąd zapisu crm_skn_organizations:', err);
    }
  }, [organizations]);

  // Restore legacy meeting and attendance data upon org switch
  useEffect(() => {
    if (currentOrgId) {
      restoreLegacyMeetingData(currentOrgId);
    }
  }, [currentOrgId]);

  // Dynamiczne wczytywanie konfiguracji Teamup i parametrów z bazy Supabase SSOT
  useEffect(() => {
    let isCancelled = false;
    async function loadRemoteOrgSettings() {
      try {
        const res = await fetchOrgSettingsFromDB(currentOrgId);
        if (isCancelled || !res || !res.ok || !res.settings) return;

        const teamupConf = res.settings.teamup || res.settings.general;
        if (teamupConf && (teamupConf.subcalendarId || teamupConf.calendarId)) {
          setOrganizations(prev => prev.map(o => {
            if (o.id !== currentOrgId) return o;
            return {
              ...o,
              calendarKey: teamupConf.calendarId || o.calendarKey,
              calendarId: teamupConf.calendarId || o.calendarId,
              subcalendarId: String(teamupConf.subcalendarId || o.subcalendarId).trim(),
              teamupApiKey: teamupConf.apiKey || teamupConf.teamupApiKey || o.teamupApiKey,
              teamupToken: teamupConf.apiKey || teamupConf.teamupApiKey || o.teamupToken,
              subcalendarName: teamupConf.subcalendarName || o.subcalendarName,
            };
          }));
        }
      } catch (err) {
        console.warn('[OrgContext] Błąd wczytywania ustawień organizacji z Supabase:', err);
      }
    }
    loadRemoteOrgSettings();
    return () => { isCancelled = true; };
  }, [currentOrgId]);

  // Current organization object
  const currentOrg = useMemo(() => {
    return organizations.find(o => o.id === currentOrgId) || organizations[0] || DEFAULT_ORGS[0];
  }, [organizations, currentOrgId]);

  // Dynamiczny motyw organizacji (Tenant Branding Theme)
  const theme = useMemo(() => getTenantTheme(currentOrg), [currentOrg]);

  // Aplikacja atrybutów oraz zmiennych CSS do DOM
  useEffect(() => {
    applyTenantThemeToDom(theme);
  }, [theme]);

  // Switch active organization
  const switchOrg = useCallback((orgId) => {
    if (!orgId) return;
    const cleanId = orgId === 'skn-template' ? 'skn_seksuologii' : orgId;
    setCurrentOrgIdState(cleanId);
    try {
      localStorage.setItem('crm_skn_current_org_id', cleanId);
    } catch {}
  }, []);

  // Izolacja tenantów po zalogowaniu: jeżeli aktywne koło nie należy do uprawnień użytkownika,
  // przełącz na pierwsze dostępne koło (np. Psychoonkologia dla osób dodanych tylko tam).
  const { isAuthenticated, canAccessOrg } = useAuth();
  useEffect(() => {
    if (!isAuthenticated || typeof canAccessOrg !== 'function') return;
    if (canAccessOrg(currentOrgId)) return;
    const firstAllowed = organizations.find(o => canAccessOrg(o.id));
    if (firstAllowed && firstAllowed.id !== currentOrgId) {
      switchOrg(firstAllowed.id);
    }
  }, [isAuthenticated, canAccessOrg, currentOrgId, organizations, switchOrg]);

  // Helper to construct organization-isolated localStorage keys
  const getStorageKey = useCallback((baseKey) => {
    return getOrgKey(currentOrg.id, baseKey);
  }, [currentOrg.id]);

  // Add new organization
  const addOrganization = useCallback((orgData) => {
    const rawName = (orgData.name || 'Nowe Koło').trim();
    const slug = (orgData.shortName || rawName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || `org_${Date.now()}`;

    let id = slug;
    let counter = 1;
    while (organizations.some(o => o.id === id)) {
      id = `${slug}_${counter++}`;
    }

    const newOrg = {
      id,
      name: rawName,
      shortName: (orgData.shortName || rawName).trim(),
      tag: (orgData.tag || 'WSKZ').trim(),
      unit: (orgData.unit || 'Wydział Psychologii WSKZ').trim(),
      sheetId: (orgData.sheetId || '').trim(),
      calendarKey: (orgData.calendarKey || 'ks9aiux4jiza1ronpd').trim(),
      subcalendarId: (orgData.subcalendarId || 'all').trim(),
      subcalendarName: (orgData.subcalendarName || '').trim(),
      description: (orgData.description || '').trim(),
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    setOrganizations(prev => [...prev, newOrg]);
    switchOrg(newOrg.id);
    return newOrg;
  }, [organizations, switchOrg]);

  // Update existing organization
  const updateOrganization = useCallback((id, updatedData) => {
    setOrganizations(prev =>
      prev.map(o => {
        if (o.id !== id) return o;
        return {
          ...o,
          ...updatedData,
          id: o.id, // ID is immutable
          isDefault: o.isDefault,
        };
      })
    );
  }, []);

  // Delete organization (cannot delete default orgs)
  const deleteOrganization = useCallback((id) => {
    if (id === 'skn-template' || id === 'skn_seksuologii' || id === 'uzaleznienia' || id === 'psychoonkologia') {
      showToast('Nie można usunąć oficjalnego Koła Naukowego WSKZ.');
      return false;
    }

    // Clean up workspace storage
    clearOrgWorkspace(id);

    setOrganizations(prev => prev.filter(o => o.id !== id));
    if (currentOrgId === id) {
      switchOrg('skn_seksuologii');
    }
    return true;
  }, [currentOrgId, switchOrg]);

  const value = useMemo(() => ({
    currentOrg,
    currentOrgId,
    theme,
    organizations,
    switchOrg,
    addOrganization,
    updateOrganization,
    deleteOrganization,
    getStorageKey,
    getOrgStorage: (key, def) => getOrgStorage(currentOrg.id, key, def),
    setOrgStorage: (key, val) => setOrgStorage(currentOrg.id, key, val),
    removeOrgStorage: (key) => removeOrgStorage(currentOrg.id, key),
    clearOrgWorkspace: () => clearOrgWorkspace(currentOrg.id),
    getCorrespondenceLog: () => getCorrespondenceLog(currentOrg.id),
    addCorrespondenceEntry: (entry) => addCorrespondenceEntry(currentOrg.id, entry),
    updateCorrespondenceEntry: (id, fields) => updateCorrespondenceEntry(currentOrg.id, id, fields),
    deleteCorrespondenceEntry: (id) => deleteCorrespondenceEntry(currentOrg.id, id),
    getMeetingsTrash: () => getMeetingsTrash(currentOrg.id),
    addMeetingToTrash: (meeting) => addMeetingToTrash(currentOrg.id, meeting),
    restoreMeetingFromTrash: (meetingId) => restoreMeetingFromTrash(currentOrg.id, meetingId),
    permanentlyDeleteMeetingFromTrash: (meetingId) => permanentlyDeleteMeetingFromTrash(currentOrg.id, meetingId),
    getCustomMeetings: () => getCustomMeetings(currentOrg.id),
    saveCustomMeeting: (meeting) => saveCustomMeeting(currentOrg.id, meeting),
    deleteCustomMeeting: (meetingId) => deleteCustomMeeting(currentOrg.id, meetingId),
    getMeetingOverrides: () => getMeetingOverrides(currentOrg.id),
    saveMeetingOverride: (meetingId, overrides) => saveMeetingOverride(currentOrg.id, meetingId, overrides),
  }), [
    currentOrg,
    currentOrgId,
    theme,
    organizations,
    switchOrg,
    addOrganization,
    updateOrganization,
    deleteOrganization,
    getStorageKey,
  ]);

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return ctx;
}

export const useOrgContext = useOrg;

