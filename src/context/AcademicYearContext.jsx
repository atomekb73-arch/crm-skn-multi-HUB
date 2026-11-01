import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  getAcademicYearKey,
  ACADEMIC_YEARS,
  getCurrentAcademicYear,
  getAcademicYearOptions,
  formatAcademicYearLabel,
  getAcademicScope,
} from '../utils/academicYear';

const AcademicYearContext = createContext(null);

const STORAGE_KEY_SESSION = 'crm_skn_academic_year_session';
const STORAGE_KEY_LOCAL = 'crm_skn_academic_year';

export function AcademicYearProvider({ children }) {
  // Automatycznie wyliczany bieżący rok akademicki na podstawie aktualnej daty systemu
  const currentAcademicYear = useMemo(() => getCurrentAcademicYear(), []);
  const academicYearOptions = useMemo(() => getAcademicYearOptions(2, 1), []);

  const [academicYear, setAcademicYearState] = useState(() => {
    try {
      const fromSession = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (fromSession) return fromSession;

      const fromLocal = localStorage.getItem(STORAGE_KEY_LOCAL);
      if (fromLocal) return fromLocal;
    } catch {}
    return currentAcademicYear;
  });

  const [customStartDate, setCustomStartDate] = useState(() => {
    const [start] = currentAcademicYear.split('/');
    return `${start}-10-01`;
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const [, end] = currentAcademicYear.split('/');
    return `${end}-09-30`;
  });

  const setAcademicYear = useCallback((newYear) => {
    if (!newYear) return;
    const cleanYear = getAcademicYearKey(newYear);
    setAcademicYearState(cleanYear);
    try {
      sessionStorage.setItem(STORAGE_KEY_SESSION, cleanYear);
      localStorage.setItem(STORAGE_KEY_LOCAL, cleanYear);
    } catch {}
  }, []);

  const getRangeForYear = useCallback((yr = academicYear, cStart = customStartDate, cEnd = customEndDate) => {
    return getAcademicScope(yr, cStart, cEnd);
  }, [academicYear, customStartDate, customEndDate]);

  const currentScope = useMemo(() => {
    return getRangeForYear(academicYear, customStartDate, customEndDate);
  }, [academicYear, customStartDate, customEndDate, getRangeForYear]);

  const value = useMemo(() => ({
    academicYear,
    setAcademicYear,
    currentAcademicYear,
    academicYearOptions,
    formatAcademicYearLabel,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getRangeForYear,
    currentScope,
  }), [
    academicYear,
    setAcademicYear,
    currentAcademicYear,
    academicYearOptions,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getRangeForYear,
    currentScope,
  ]);

  return (
    <AcademicYearContext.Provider value={value}>
      {children}
    </AcademicYearContext.Provider>
  );
}

export function useAcademicYear() {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return ctx;
}
