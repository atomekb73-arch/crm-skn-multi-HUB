import React, { useMemo } from 'react';
import { useOrg } from '../context/OrgContext';

export const DEFAULT_CALENDAR_SUB_ID = '14518766';
export const DEFAULT_CALENDAR_SUB_NAME = '10 💚 SKN Seksuologii';

export default function CalendarSelector({
  selectedSubcalendar,
  onSubcalendarChange,
  subcalendars = [],
  className = '',
}) {
  const { currentOrg } = useOrg();

  const orgSubId = String(currentOrg?.subcalendarId || DEFAULT_CALENDAR_SUB_ID).trim();
  const orgSubName = currentOrg?.subcalendarName || (
    currentOrg?.id === 'uzaleznienia'
      ? '05 🏷️ SKN Psychologii Zachowań Ryzykownych i Uzależnień'
      : currentOrg?.id === 'psychoonkologia'
        ? '07 🎗️ SKN Psychoonkologii'
        : DEFAULT_CALENDAR_SUB_NAME
  );

  const activeValue = String(selectedSubcalendar || orgSubId).trim();

  // Lista podkalendarzy dedykowanych dla bieżącego koła
  const availableOptions = useMemo(() => {
    const list = Array.isArray(subcalendars) && subcalendars.length > 0 ? [...subcalendars] : [];
    if (!list.some(s => String(s.id).trim() === orgSubId)) {
      list.unshift({ id: orgSubId, name: orgSubName });
    }
    return list;
  }, [subcalendars, orgSubId, orgSubName]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Podkalendarz:</span>
      <select
        value={activeValue}
        onChange={e => onSubcalendarChange && onSubcalendarChange(e.target.value)}
        className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer shadow-2xs max-w-[320px] truncate"
        title={`Podkalendarz Teamup: ${orgSubName} (ID: ${activeValue})`}
      >
        {availableOptions.map(opt => (
          <option key={opt.id} value={opt.id}>
            {opt.name || opt.id} ({opt.id})
          </option>
        ))}
      </select>
    </div>
  );
}
