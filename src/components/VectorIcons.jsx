import React from 'react';
import {
  Monitor,
  Building2,
  MessageSquare,
  Presentation,
  LayoutTemplate,
  BookOpen,
  FlaskConical,
  ClipboardCheck,
  Laptop,
  Ticket,
  Trophy,
  Landmark,
  Share2,
  Cpu,
  FileText,
  Wrench,
  Award,
  GraduationCap,
  Mic,
  User,
  Users,
} from 'lucide-react';

/**
 * Czyste, pogrubione ikony wektorowe (Outline SVG) dla Konfiguracji Wag Punktowych (Activity Weights)
 */
export function ActivityWeightIcon({ code, size = 18, className = '' }) {
  const normalizedCode = String(code || '').toUpperCase().trim();
  const baseClass = `shrink-0 ${className}`.trim();

  switch (normalizedCode) {
    case 'OB_ONLINE':
    case 'SPOTKANIE_ONLINE':
      return <Monitor size={size} strokeWidth={2.2} className={`text-indigo-600 ${baseClass}`} />;
    case 'OB_STACJO':
    case 'SPOTKANIE_STACJONARNE':
      return <Building2 size={size} strokeWidth={2.2} className={`text-emerald-600 ${baseClass}`} />;
    case 'DYSKUSJA':
      return <MessageSquare size={size} strokeWidth={2.2} className={`text-sky-600 ${baseClass}`} />;
    case 'PREZENTACJA':
      return <Presentation size={size} strokeWidth={2.2} className={`text-purple-600 ${baseClass}`} />;
    case 'POSTER':
      return <LayoutTemplate size={size} strokeWidth={2.2} className={`text-amber-600 ${baseClass}`} />;
    case 'EDU_VIDEO_PDF':
      return <BookOpen size={size} strokeWidth={2.2} className={`text-indigo-600 ${baseClass}`} />;
    case 'BADANIA':
    case 'BADANIA_PROJEKT':
      return <FlaskConical size={size} strokeWidth={2.2} className={`text-teal-600 ${baseClass}`} />;
    case 'ORG_LOGIST':
      return <ClipboardCheck size={size} strokeWidth={2.2} className={`text-orange-600 ${baseClass}`} />;
    case 'CONF_BIERNA_ONLINE':
      return <Laptop size={size} strokeWidth={2.2} className={`text-blue-600 ${baseClass}`} />;
    case 'KONF_BIER':
    case 'CONF_BIERNA_STACJONARNA':
      return <Ticket size={size} strokeWidth={2.2} className={`text-violet-600 ${baseClass}`} />;
    case 'KONF_AKTYW':
    case 'CONF_CZYNNA':
      return <Trophy size={size} strokeWidth={2.2} className={`text-amber-600 ${baseClass}`} />;
    case 'ZARZAD_MIES':
    case 'LIDER_SEKCJI_MIES':
    case 'KOMISJA_REWIZYJNA_MIES':
      return <Landmark size={size} strokeWidth={2.2} className={`text-indigo-700 ${baseClass}`} />;
    case 'SM_MODER_MIES':
      return <Share2 size={size} strokeWidth={2.2} className={`text-rose-600 ${baseClass}`} />;
    case 'IT_SYSTEMY':
      return <Cpu size={size} strokeWidth={2.2} className={`text-slate-700 ${baseClass}`} />;
    case 'PUBLIKACJA_ARTYKUL':
      return <FileText size={size} strokeWidth={2.2} className={`text-purple-700 ${baseClass}`} />;
    case 'WARSZTAT_PROWADZENIE':
      return <Wrench size={size} strokeWidth={2.2} className={`text-emerald-700 ${baseClass}`} />;
    default:
      return <Award size={size} strokeWidth={2.2} className={`text-indigo-600 ${baseClass}`} />;
  }
}

/**
 * Wektorowy obrys kółka (Outline Ring) zastępujący bitmapowe kropki emoji (🟢 🟡 🔴 🔵 🟣 ⚪)
 */
export function VectorRingIndicator({ color = 'emerald', size = 12, className = '' }) {
  const colorMap = {
    emerald: 'text-emerald-500',
    green: 'text-emerald-500',
    teal: 'text-teal-500',
    amber: 'text-amber-500',
    yellow: 'text-amber-500',
    orange: 'text-orange-500',
    rose: 'text-rose-500',
    red: 'text-rose-500',
    indigo: 'text-indigo-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    violet: 'text-violet-500',
    slate: 'text-slate-400',
  };
  const strokeClass = colorMap[color] || 'text-emerald-500';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={`inline-block shrink-0 ${strokeClass} ${className}`.trim()}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="3.5" />
    </svg>
  );
}

/**
 * Wektorowa ikona roli uczestnika spotkania (Członek, Opiekun Koła, Prelegent, Gość)
 */
export function ParticipantRoleVectorIcon({ role, size = 14, className = '' }) {
  switch (role) {
    case 'supervisor':
      return <GraduationCap size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-indigo-600 ${className}`.trim()} />;
    case 'speaker':
      return <Mic size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-purple-600 ${className}`.trim()} />;
    case 'guest':
      return <User size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-slate-600 ${className}`.trim()} />;
    case 'member':
    default:
      return <VectorRingIndicator color="emerald" size={size - 1} className={className} />;
  }
}

/**
 * Wektorowa ikona roli w Zarządzie Koła (ReportsTab)
 */
export function BoardRoleVectorIcon({ roleId, size = 15, className = '' }) {
  const id = String(roleId || '').toLowerCase();
  if (id.includes('chairman')) {
    return <Landmark size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-indigo-600 ${className}`.trim()} />;
  }
  if (id.includes('secretary')) {
    return <ClipboardCheck size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-emerald-600 ${className}`.trim()} />;
  }
  if (id.includes('coordinator')) {
    return <FlaskConical size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-teal-600 ${className}`.trim()} />;
  }
  return <Users size={size} strokeWidth={2.2} className={`inline-block shrink-0 text-indigo-600 ${className}`.trim()} />;
}
