import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export const DEFAULT_POINT_WEIGHTS = {
  OB_ONLINE: { id: 'OB_ONLINE', label: 'Obecność na spotkaniu Online', points: 1, icon: '' },
  OB_STACJO: { id: 'OB_STACJO', label: 'Obecność Stacjonarna', points: 2, icon: '' },
  DYSKUSJA: { id: 'DYSKUSJA', label: 'Aktywna dyskusja na spotkaniu', points: 1, icon: '' },
  PREZENTACJA: { id: 'PREZENTACJA', label: 'Prezentacja merytoryczna w Kole', points: 5, icon: '' },
  POSTER: { id: 'POSTER', label: 'Prezentacja posteru naukowego', points: 3, icon: '' },
  EDU_VIDEO_PDF: { id: 'EDU_VIDEO_PDF', label: 'Materiały EDU (filmy / poradniki)', points: 8, icon: '' },
  BADANIA: { id: 'BADANIA', label: 'Udział w badaniach / zbieranie danych', points: 5, icon: '' },
  ORG_LOGIST: { id: 'ORG_LOGIST', label: 'Organizacja wydarzeń / logistyka', points: 5, icon: '' },
  ZARZAD_MIES: { id: 'ZARZAD_MIES', label: 'Zarząd Koła (pkt/miesiąc)', points: 3, icon: '' },
  SM_MODER_MIES: { id: 'SM_MODER_MIES', label: 'Moderacja Social Media / Grup (pkt/miesiąc)', points: 5, icon: '' },
  IT_SYSTEMY: { id: 'IT_SYSTEMY', label: 'Koordynacja IT / Systemów CRM', points: 5, icon: '' },
  KONF_BIER: { id: 'KONF_BIER', label: 'Konferencja bierna Stacjonarna', points: 3, icon: '' },
  CONF_BIERNA_ONLINE: { id: 'CONF_BIERNA_ONLINE', label: 'Konferencja bierna Online', points: 2, icon: '' },
  KONF_AKTYW: { id: 'KONF_AKTYW', label: 'Wystąpienie na konferencji', points: 10, icon: '' },
};

export const ENGAGEMENT_SCALE = [
  { min: 90, max: 100, label: 'Lider', icon: '', ringColor: 'emerald', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotColor: 'bg-emerald-500' },
  { min: 75, max: 89, label: 'Bardzo aktywny', icon: '', ringColor: 'teal', color: 'bg-teal-50 text-teal-700 border-teal-200', dotColor: 'bg-teal-500' },
  { min: 50, max: 74, label: 'Bezpieczny brzeg', icon: '', ringColor: 'amber', color: 'bg-amber-50 text-amber-700 border-amber-200', dotColor: 'bg-amber-500' },
  { min: 25, max: 49, label: 'Niższa aktywność', icon: '', ringColor: 'slate', color: 'bg-stone-100 text-stone-700 border-stone-200', dotColor: 'bg-stone-400' },
  { min: 0, max: 24, label: 'Wymaga uzupełnienia', icon: '', ringColor: 'slate', color: 'bg-slate-100 text-slate-600 border-slate-200', dotColor: 'bg-slate-400' },
];

export function getEngagementScaleLevel(freq) {
  const f = typeof freq === 'number' && !isNaN(freq) ? Math.min(100, Math.max(0, Math.round(freq))) : 0;
  return ENGAGEMENT_SCALE.find(level => f >= level.min && f <= level.max) || ENGAGEMENT_SCALE[ENGAGEMENT_SCALE.length - 1];
}

export function evaluateCertificateEligibility(freq, absences = 0) {
  const f = typeof freq === 'number' && !isNaN(freq) ? freq : 0;
  const abs = typeof absences === 'number' && !isNaN(absences) ? absences : 0;

  const meetsFreq = f >= 50;
  const meetsAbsences = abs <= 5;
  const canIssue = meetsFreq && meetsAbsences;

  return {
    canIssue,
    label: canIssue ? 'Można wydać' : 'Sprawdź frekwencję',
    color: canIssue
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : 'bg-rose-50 text-rose-700 border-rose-200',
    reason: !meetsFreq
      ? `Frekwencja poniżej 50% (${f}%)`
      : !meetsAbsences
      ? `Zbyt wiele nieobecności (${abs} > 5)`
      : 'Spełniono wymogi frekwencji i obecności',
  };
}

export const DEFAULT_ATTENDANCE_CONFIG = {
  calcMode: 'DYNAMIC_MANDATORY', // 'DYNAMIC_MANDATORY' | 'FIXED_TARGET' | 'ALL_VERIFIED'
  fixedTarget: 10,
  minPassingPercent: 50,
  zeroAttendanceDisplay: 'PERCENT_ZERO', // 'PERCENT_ZERO' | 'NEUTRAL_DASH'
};

import { useOrg } from './OrgContext';
import { DEFAULT_FACULTY_SUPERVISORS, getStoredSupervisors } from '../utils/specialRoles';
import { ACTIVITY_OPTIONS, HISTORICAL_MEMBER_ACTIVITIES, getMemberPointsSum } from '../utils/activityRegistry';
import { fetchOrgSettingsFromDB, saveOrgSettingsKeyToDB } from '../services/settingsService';

/**
 * Oblicza sumaryczny licznik punktów aktywności dla studenta
 */
export function calculateMemberPoints(member, meetings = [], customTypes = {}, weights = DEFAULT_POINT_WEIGHTS) {
  if (!member) return 0;
  return getMemberPointsSum(member, meetings, weights);
}

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const { currentOrg, getStorageKey, updateOrganization } = useOrg();

  const [weights, setWeights] = useState(() => {
    try {
      const saved = localStorage.getItem('crm_point_weights');
      if (saved) return { ...DEFAULT_POINT_WEIGHTS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_POINT_WEIGHTS;
  });

  const [attendanceConfig, setAttendanceConfig] = useState(() => {
    try {
      if (currentOrg) {
        const orgSaved = localStorage.getItem(getStorageKey('crm_attendance_config'));
        if (orgSaved) return { ...DEFAULT_ATTENDANCE_CONFIG, ...JSON.parse(orgSaved) };
      }
      const saved = localStorage.getItem('crm_attendance_config') || localStorage.getItem('skn_attendance_config');
      if (saved) return { ...DEFAULT_ATTENDANCE_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_ATTENDANCE_CONFIG;
  });

  const getOrgSupervisorsKey = (id) => `crm_skn_${id || 'seksuologia'}_supervisors`;

  const [supervisors, setSupervisors] = useState(() => {
    try {
      const orgId = currentOrg?.id || 'skn_seksuologii';
      const key = getOrgSupervisorsKey(orgId);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });

  const [driveFolderUrl, setDriveFolderUrl] = useState(() => {
    try {
      if (currentOrg) {
        const orgSaved = localStorage.getItem(getStorageKey('crm_drive_folder_url')) ||
                         localStorage.getItem(getStorageKey('gdrive_url')) ||
                         currentOrg?.driveFolderUrl ||
                         currentOrg?.gdriveUrl;
        if (orgSaved) return orgSaved;
      }
      return localStorage.getItem('crm_drive_folder_url') || localStorage.getItem('skn_drive_folder_url') || '';
    } catch {}
    return '';
  });

  // Re-sync supervisors, attendanceConfig and driveFolderUrl when active organization changes (with Supabase SSOT)
  useEffect(() => {
    if (currentOrg) {
      const orgId = currentOrg?.id || 'skn_seksuologii';

      // 1. Natychmiastowy reset stanu dla nowego koła (eliminacja ghost data ze starego koła)
      const key = getOrgSupervisorsKey(orgId);
      const orgSaved = localStorage.getItem(key);
      if (orgSaved) {
        try {
          const parsed = JSON.parse(orgSaved);
          setSupervisors(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSupervisors([]);
        }
      } else {
        setSupervisors([]);
      }

      try {
        const attSaved = localStorage.getItem(getStorageKey('crm_attendance_config'));
        setAttendanceConfig(attSaved ? { ...DEFAULT_ATTENDANCE_CONFIG, ...JSON.parse(attSaved) } : DEFAULT_ATTENDANCE_CONFIG);
      } catch {
        setAttendanceConfig(DEFAULT_ATTENDANCE_CONFIG);
      }

      try {
        const driveSaved = localStorage.getItem(getStorageKey('crm_drive_folder_url')) ||
                           localStorage.getItem(getStorageKey('gdrive_url')) ||
                           currentOrg?.driveFolderUrl ||
                           currentOrg?.gdriveUrl ||
                           '';
        setDriveFolderUrl(driveSaved);
      } catch {
        setDriveFolderUrl('');
      }

      // 2. Pobranie z Supabase jako Jedynego Źródła Prawdy (SSOT Revalidation)
      fetchOrgSettingsFromDB(orgId).then(res => {
        if (res.ok && res.settings) {
          const remoteSupervisors = Array.isArray(res.settings.supervisors) ? res.settings.supervisors : [];
          setSupervisors(remoteSupervisors);
          try {
            localStorage.setItem(getOrgSupervisorsKey(orgId), JSON.stringify(remoteSupervisors));
          } catch {}

          if (res.settings.attendanceConfig) {
            setAttendanceConfig(prev => ({ ...prev, ...res.settings.attendanceConfig }));
          }
          if (res.settings.weights) {
            setWeights(prev => ({ ...prev, ...res.settings.weights }));
          }
          if (res.settings.driveFolderUrl) {
            setDriveFolderUrl(res.settings.driveFolderUrl);
          }
        } else {
          // Brak rekordu w Supabase oznacza czystą listę
          setSupervisors([]);
        }
      }).catch(err => {
        console.warn('[SettingsContext] Cichy błąd odczytu ustawień z Supabase:', err);
      });
    }
  }, [currentOrg?.id, getStorageKey]);

  const updateDriveFolderUrl = useCallback((url) => {
    const cleanUrl = String(url || '').trim();
    setDriveFolderUrl(cleanUrl);
    const orgId = currentOrg?.id || 'seksuologia';
    try {
      if (currentOrg) {
        localStorage.setItem(getStorageKey('crm_drive_folder_url'), cleanUrl);
        localStorage.setItem(getStorageKey('gdrive_url'), cleanUrl);
        updateOrganization(currentOrg.id, { driveFolderUrl: cleanUrl, gdriveUrl: cleanUrl });
      }
      localStorage.setItem('crm_drive_folder_url', cleanUrl);
      localStorage.setItem('skn_drive_folder_url', cleanUrl);
    } catch {}
    saveOrgSettingsKeyToDB(orgId, 'driveFolderUrl', cleanUrl).catch(console.warn);
  }, [currentOrg, getStorageKey, updateOrganization]);

  const updateAttendanceConfig = useCallback((patch) => {
    setAttendanceConfig(prev => {
      const updated = { ...prev, ...patch };
      const orgId = currentOrg?.id || 'seksuologia';
      try {
        if (currentOrg) {
          localStorage.setItem(getStorageKey('crm_attendance_config'), JSON.stringify(updated));
        }
        localStorage.setItem('crm_attendance_config', JSON.stringify(updated));
        localStorage.setItem('skn_attendance_config', JSON.stringify(updated));
      } catch {}
      saveOrgSettingsKeyToDB(orgId, 'attendanceConfig', updated).catch(console.warn);
      return updated;
    });
  }, [currentOrg, getStorageKey]);

  const resetAttendanceConfig = useCallback(() => {
    setAttendanceConfig(DEFAULT_ATTENDANCE_CONFIG);
    const orgId = currentOrg?.id || 'seksuologia';
    try {
      if (currentOrg) {
        localStorage.removeItem(getStorageKey('crm_attendance_config'));
      }
      localStorage.removeItem('crm_attendance_config');
      localStorage.removeItem('skn_attendance_config');
    } catch {}
    saveOrgSettingsKeyToDB(orgId, 'attendanceConfig', DEFAULT_ATTENDANCE_CONFIG).catch(console.warn);
  }, [currentOrg, getStorageKey]);

  const updateWeight = useCallback((id, newPoints) => {
    setWeights(prev => {
      const updated = {
        ...prev,
        [id]: { ...prev[id], points: Number(newPoints) || 0 },
      };
      const orgId = currentOrg?.id || 'seksuologia';
      try {
        localStorage.setItem('crm_point_weights', JSON.stringify(updated));
      } catch {}
      saveOrgSettingsKeyToDB(orgId, 'weights', updated).catch(console.warn);
      return updated;
    });
  }, [currentOrg?.id]);

  const resetWeights = useCallback(() => {
    setWeights(DEFAULT_POINT_WEIGHTS);
    const orgId = currentOrg?.id || 'seksuologia';
    try {
      localStorage.removeItem('crm_point_weights');
    } catch {}
    saveOrgSettingsKeyToDB(orgId, 'weights', DEFAULT_POINT_WEIGHTS).catch(console.warn);
  }, [currentOrg?.id]);

  const saveSupervisorsList = useCallback((newList) => {
    setSupervisors(newList);
    const orgId = currentOrg?.id || 'seksuologia';
    try {
      const key = getOrgSupervisorsKey(orgId);
      const json = JSON.stringify(newList);
      localStorage.setItem(key, json);
      if (currentOrg) {
        localStorage.setItem(getStorageKey('crm_supervisors_config'), json);
        localStorage.setItem(getStorageKey('settings'), JSON.stringify({ supervisors: newList }));
        updateOrganization(currentOrg.id, { supervisors: newList });
      }
      localStorage.setItem('skn_supervisors_config', json);
    } catch {}
    saveOrgSettingsKeyToDB(orgId, 'supervisors', newList).catch(console.warn);
  }, [currentOrg, getStorageKey, updateOrganization]);

  const addSupervisor = useCallback((sup) => {
    const academicTitle = sup.academicTitle || 'mgr';
    const fullName = sup.fullName || `${academicTitle} ${sup.name}`;
    const newEntry = {
      id: sup.id || `sup_${Date.now()}`,
      academicTitle,
      name: sup.name,
      fullName,
      affiliation: sup.affiliation || 'Wydział Psychologii WSKZ',
      role: sup.role || 'Opiekun Naukowy Koła',
      email: sup.email || '',
      startDate: sup.startDate || '2025-10-01',
      endDate: sup.isActive ? '' : (sup.endDate || ''),
      isActive: sup.isActive !== undefined ? sup.isActive : true,
      aliases: [
        sup.name.toLowerCase(),
        `${academicTitle.toLowerCase()} ${sup.name.toLowerCase()}`,
        ...(sup.aliases || []),
      ],
    };
    const updated = [...supervisors.filter(s => s.id !== newEntry.id), newEntry];
    saveSupervisorsList(updated);
    return updated;
  }, [supervisors, saveSupervisorsList]);

  const updateSupervisor = useCallback((id, updatedFields) => {
    const updated = supervisors.map(s => {
      if (s.id === id) {
        const merged = { ...s, ...updatedFields };
        const academicTitle = merged.academicTitle || 'mgr';
        merged.fullName = merged.fullName || `${academicTitle} ${merged.name}`;
        return merged;
      }
      return s;
    });
    saveSupervisorsList(updated);
    return updated;
  }, [supervisors, saveSupervisorsList]);

  const deleteSupervisor = useCallback((id) => {
    const updated = supervisors.filter(s => s.id !== id);
    saveSupervisorsList(updated);
    return updated;
  }, [supervisors, saveSupervisorsList]);

  const resetSupervisors = useCallback(() => {
    saveSupervisorsList([]);
    try {
      const orgId = currentOrg?.id || 'skn_seksuologii';
      localStorage.removeItem(getOrgSupervisorsKey(orgId));
      if (currentOrg) {
        localStorage.removeItem(getStorageKey('crm_supervisors_config'));
      }
    } catch {}
  }, [currentOrg, getStorageKey, saveSupervisorsList]);

  const getActiveSupervisors = useCallback(() => {
    return supervisors.filter(s => s.isActive);
  }, [supervisors]);

  const calculatePoints = useCallback((m, meetings, customTypes) => {
    return calculateMemberPoints(m, meetings, customTypes, weights);
  }, [weights]);

  const value = useMemo(() => ({
    attendanceConfig,
    updateAttendanceConfig,
    resetAttendanceConfig,
    weights,
    updateWeight,
    resetWeights,
    supervisors,
    addSupervisor,
    updateSupervisor,
    deleteSupervisor,
    resetSupervisors,
    getActiveSupervisors,
    driveFolderUrl,
    updateDriveFolderUrl,
    setDriveFolderUrl: updateDriveFolderUrl,
    engagementScale: ENGAGEMENT_SCALE,
    getEngagementScaleLevel,
    evaluateCertificateEligibility,
    calculateMemberPoints: calculatePoints,
  }), [
    attendanceConfig,
    updateAttendanceConfig,
    resetAttendanceConfig,
    weights,
    updateWeight,
    resetWeights,
    supervisors,
    addSupervisor,
    updateSupervisor,
    deleteSupervisor,
    resetSupervisors,
    getActiveSupervisors,
    driveFolderUrl,
    updateDriveFolderUrl,
    calculatePoints,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    // Return default implementations if context is outside provider
    return {
      attendanceConfig: DEFAULT_ATTENDANCE_CONFIG,
      updateAttendanceConfig: () => {},
      resetAttendanceConfig: () => {},
      weights: DEFAULT_POINT_WEIGHTS,
      updateWeight: () => {},
      resetWeights: () => {},
      supervisors: DEFAULT_FACULTY_SUPERVISORS,
      addSupervisor: () => {},
      updateSupervisor: () => {},
      deleteSupervisor: () => {},
      resetSupervisors: () => {},
      getActiveSupervisors: () => DEFAULT_FACULTY_SUPERVISORS,
      driveFolderUrl: '',
      updateDriveFolderUrl: () => {},
      setDriveFolderUrl: () => {},
      engagementScale: ENGAGEMENT_SCALE,
      getEngagementScaleLevel,
      evaluateCertificateEligibility,
      calculateMemberPoints: (m, meetings, customTypes) => calculateMemberPoints(m, meetings, customTypes, DEFAULT_POINT_WEIGHTS),
    };
  }
  return ctx;
}
