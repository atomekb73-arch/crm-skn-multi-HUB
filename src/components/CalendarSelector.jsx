import React from 'react';
import { Lock } from 'lucide-react';
import { useOrg } from '../context/OrgContext';
import { getWskzOrgById } from '../config/wskzRegistry';

export const DEFAULT_CALENDAR_SUB_ID = '14518766';
export const DEFAULT_CALENDAR_SUB_NAME = '10 💚 SKN Seksuologii';

/**
 * CalendarSelector - Widok operacyjny stałego przypisania podkalendarza Teamup do instancji koła.
 * Podkalendarz jest zablokowany (read-only) per koło, co uniemożliwia przypadkowe
 * przełączanie się na podkalendarze innych kół w codziennej pracy.
 */
export default function CalendarSelector({
  selectedSubcalendar,
  onSubcalendarChange,
  subcalendars = [],
  className = '',
}) {
  const { currentOrg } = useOrg();
  const regOrg = getWskzOrgById(currentOrg?.id);

  const orgSubId = String(regOrg?.subcalendarId || currentOrg?.subcalendarId || DEFAULT_CALENDAR_SUB_ID).trim();
  const orgSubName = currentOrg?.subcalendarName || (
    currentOrg?.id === 'uzaleznienia'
      ? '05 🏷️ SKN Psychologii Zachowań Ryzykownych i Uzależnień'
      : currentOrg?.id === 'psychoonkologia'
        ? '07 🎗️ SKN Psychoonkologii'
        : DEFAULT_CALENDAR_SUB_NAME
  );

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-700 shadow-2xs select-none max-w-[340px] truncate ${className}`}
      title={`Dedykowany podkalendarz Teamup przypisany na stałe do ${currentOrg?.shortName || currentOrg?.name || 'koła'} (ID: ${orgSubId})`}
    >
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Kalendarz:</span>
      <span className="font-bold text-slate-800 truncate">{orgSubName}</span>
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded-md shrink-0">
        <Lock size={10} className="text-slate-500" />
        <span>Stały</span>
      </span>
    </div>
  );
}
