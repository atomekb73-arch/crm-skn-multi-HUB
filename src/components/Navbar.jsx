import React, { startTransition } from 'react';
import { useOrg } from '../context/OrgContext';
import {
  Users,
  Calendar,
  FileText,
  GraduationCap,
  Microscope,
  Settings,
  ShieldAlert,
  FolderKanban,
  Wrench,
  Sparkles,
  FolderOpen,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';

const ResearchIcon = Microscope || GraduationCap;

const MAIN_TABS = [
  { id: 'members',       label: 'Członkowie',            icon: Users,        aliases: ['management', 'quarantine'] },
  { id: 'meetings',      label: 'Spotkania',             icon: Calendar,     aliases: [] },
  { id: 'documentation', label: 'Dokumentacja',          icon: FileText,     aliases: ['reports', 'documents', 'repository'] },
  { id: 'research',      label: 'Dorobek & Badania',    icon: ResearchIcon, aliases: [] },
  { id: 'settings_tools',label: 'Ustawienia & Narzędzia',icon: Settings,     aliases: ['settings', 'tools'] },
];

export default function Navbar({
  activeTab = 'members',
  setActiveTab = () => {},
  pendingCount = 0,
  membersSubTab = 'management',
  setMembersSubTab = () => {},
  documentationSubTab = 'reports',
  setDocumentationSubTab = () => {},
  settingsToolsSubTab = 'settings',
  setSettingsToolsSubTab = () => {},
  membersMetrics = null,
}) {
  const { theme } = useOrg();

  // Check if main tab is active, considering legacy tab ID aliases
  const isMainTabActive = (tab) => {
    if (activeTab === tab.id) return true;
    if (tab.aliases && tab.aliases.includes(activeTab)) return true;
    return false;
  };

  // Safe non-blocking handler for main tab click (React 18 Concurrent)
  const handleMainTabClick = (tabId) => {
    startTransition(() => {
      setActiveTab(tabId);
      if (tabId === 'members') setMembersSubTab('management');
      if (tabId === 'documentation' && !documentationSubTab) setDocumentationSubTab('reports');
      if (tabId === 'settings_tools' && !settingsToolsSubTab) setSettingsToolsSubTab('settings');
    });
  };

  // Determine current active main tab for rendering sub-bars
  const currentTab = activeTab === 'management' || activeTab === 'quarantine' ? 'members'
    : activeTab === 'reports' || activeTab === 'documents' || activeTab === 'repository' ? 'documentation'
    : activeTab === 'settings' || activeTab === 'tools' ? 'settings_tools'
    : activeTab;

  return (
    <div className="space-y-2.5 sm:space-y-3 print:hidden w-full max-w-full overflow-x-hidden">
      {/* ── Main 5 Condensed Navigation Bar with Touch Scroll & Edge Gradient ── */}
      <div className="relative w-full max-w-full group">
        <div
          tabIndex={0}
          role="region"
          aria-label="Główne menu zakładek systemu CRM"
          className="w-full max-w-full flex items-center gap-1 sm:gap-1.5 justify-start overflow-x-auto whitespace-nowrap py-1 px-1.5 sm:px-2 bg-slate-200/90 rounded-2xl border border-slate-300 shadow-xs h-11 min-h-[44px] shrink-0 scrollbar-none scroll-smooth touch-pan-x focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
        >
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = isMainTabActive(tab);
            return (
              <button
                key={tab.id}
                onClick={() => handleMainTabClick(tab.id)}
                className={`group flex items-center gap-2 text-xs md:text-sm px-3 sm:px-3.5 py-1.5 rounded-xl transition-colors duration-150 whitespace-nowrap cursor-pointer font-semibold shrink-0 ${
                  isActive
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-300'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-slate-300/70'
                }`}
              >
                <Icon
                  size={16}
                  className={`transition-colors shrink-0 w-4 h-4 ${
                    isActive ? (theme?.navActiveTabIcon || 'text-indigo-600') : 'text-slate-600 group-hover:text-slate-900'
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        {/* Delikatny gradient krawędziowy dla urządzeń mobilnych sygnalizujący przewijanie */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-200 to-transparent rounded-r-2xl sm:hidden" />
      </div>

      {/* ── Sub-Navigation Bars per Main Tab ──────────────────────────────── */}

      {/* Sub-bar for Członkowie with inline compact metrics */}
      {currentTab === 'members' && (
        <div className="flex items-center justify-between gap-2 sm:gap-3 w-full max-w-full flex-wrap min-h-[40px] animate-in fade-in duration-150">
          <div className="relative max-w-full flex items-center">
            <div className="flex items-center gap-1 bg-slate-200/90 p-1 rounded-xl w-fit max-w-full overflow-x-auto whitespace-nowrap border border-slate-300 shrink-0 shadow-2xs h-9 min-h-[36px] scrollbar-none scroll-smooth touch-auto">
              <button
                onClick={() => {
                  startTransition(() => {
                    setActiveTab('members');
                    setMembersSubTab('management');
                  });
                }}
                className={`group px-3 py-1 rounded-lg text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5 font-semibold shrink-0 ${
                  membersSubTab === 'management' || activeTab === 'management'
                    ? `bg-white ${theme?.navActiveSubtabText || 'text-indigo-950'} shadow-xs border border-slate-300/80`
                    : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
                }`}
              >
                <Users size={13} className={`w-3.5 h-3.5 shrink-0 ${membersSubTab === 'management' || activeTab === 'management' ? (theme?.navActiveTabIcon || 'text-indigo-600') : 'text-slate-600 group-hover:text-slate-900'}`} />
                <span className="md:hidden">Główna lista</span>
                <span className="hidden md:inline">Główna lista członków</span>
              </button>

              <button
                onClick={() => {
                  startTransition(() => {
                    setActiveTab('members');
                    setMembersSubTab('quarantine');
                  });
                }}
                className={`group px-3 py-1 rounded-lg text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5 font-semibold shrink-0 ${
                  membersSubTab === 'quarantine' || activeTab === 'quarantine'
                    ? 'bg-white text-amber-950 shadow-xs border border-slate-300/80'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
                }`}
              >
                <ShieldAlert size={13} className={`w-3.5 h-3.5 shrink-0 ${membersSubTab === 'quarantine' || activeTab === 'quarantine' ? 'text-amber-600' : 'text-slate-600 group-hover:text-slate-900'}`} />
                <span className="md:hidden">Kwarantanna</span>
                <span className="hidden md:inline">Kwarantanna & Zgłoszenia</span>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[11px] font-semibold leading-none text-white bg-amber-500 rounded-full select-none translate-y-[1px]">
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile Action Buttons (< md / 768px): Directly beside Kwarantanna */}
            <div className="flex md:hidden items-center gap-1 shrink-0 ml-1.5">
              <button
                type="button"
                onClick={() => {
                  if (membersSubTab === 'quarantine' || activeTab === 'quarantine') {
                    window.dispatchEvent(new CustomEvent('crm:export-quarantine-xlsx'));
                  } else {
                    window.dispatchEvent(new CustomEvent('crm:export-main-xlsx'));
                  }
                }}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center justify-center gap-1 h-9 min-h-[36px] shrink-0"
                title="Pobierz zestawienie do pliku Excel (.xlsx)"
              >
                <FileSpreadsheet size={15} />
                <span className="text-[11px] font-bold">XLSX</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-2.5 py-1 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center justify-center gap-1 h-9 min-h-[36px] shrink-0"
                title="Drukuj wykaz"
              >
                <Printer size={15} />
                <span className="text-[11px] font-bold">Drukuj</span>
              </button>
            </div>
          </div>

          {/* Compact Metric Badges in single row */}
          {membersMetrics && (
            <div className="relative max-w-full sm:ml-auto">
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap max-w-full py-0.5 scrollbar-none scroll-smooth touch-auto sm:ml-auto h-9 min-h-[36px]">
                {/* 1) Aktywni */}
                <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 h-9 min-h-[36px] shadow-2xs shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-bold text-xs text-slate-900 font-mono">{membersMetrics.activeCount}</span>
                  <span className="text-slate-800 font-semibold text-[11px] whitespace-nowrap">
                    <span className="md:hidden">Aktywni</span>
                    <span className="hidden md:inline">Aktywni członkowie</span>
                  </span>
                </div>

                {/* 2) Archiwum */}
                <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 h-9 min-h-[36px] shadow-2xs shrink-0" title="Liczba zarchiwizowanych zgłoszeń i wpisów">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-bold text-xs text-slate-900 font-mono">{membersMetrics.archivedCount ?? 0}</span>
                  <span className="text-slate-800 font-semibold text-[11px] whitespace-nowrap">
                    Archiwum
                  </span>
                </div>

                {/* 3) Spotkania */}
                <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 h-9 min-h-[36px] shadow-2xs shrink-0" title="Łączna liczba zarejestrowanych spotkań koła">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                  <span className="font-bold text-xs text-slate-900 font-mono">{membersMetrics.meetingsCount ?? 0}</span>
                  <span className="text-slate-800 font-semibold text-[11px] whitespace-nowrap">
                    Spotkania
                  </span>
                </div>

                {/* 4) Frekwencja */}
                <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 h-9 min-h-[36px] shadow-2xs shrink-0">
                  <span className="font-bold text-xs text-slate-900 font-mono">{isNaN(membersMetrics.avgFreq) ? 0 : membersMetrics.avgFreq}%</span>
                  <span className="text-slate-800 font-semibold text-[11px] whitespace-nowrap">
                    <span className="md:hidden">Średnia</span>
                    <span className="hidden md:inline">Średnia frekwencja</span>
                  </span>
                </div>

                {/* 5) Zaświadczenia */}
                <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 h-9 min-h-[36px] shadow-2xs shrink-0">
                  <span className="font-bold text-xs text-slate-900 font-mono">{membersMetrics.certReady}</span>
                  <span className="text-slate-800 font-semibold text-[11px] whitespace-nowrap">
                    <span className="md:hidden">Zaświadczenia</span>
                    <span className="hidden md:inline">Gotowe zaświadczenia</span>
                  </span>
                </div>

                {/* 6) Mailing */}
                <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 h-9 min-h-[36px] shadow-2xs shrink-0">
                  <span className="font-bold text-xs text-slate-900 font-mono">{membersMetrics.mailingConsentsCount}</span>
                  <span className="text-slate-800 font-semibold text-[11px] whitespace-nowrap">
                    <span className="md:hidden">Mailing</span>
                    <span className="hidden md:inline">Zgody na mailing</span>
                  </span>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-100 to-transparent rounded-r-xl sm:hidden" />
            </div>
          )}
        </div>
      )}

      {/* Sub-bar for Dokumentacja */}
      {currentTab === 'documentation' && (
        <div className="relative max-w-full">
          <div className="flex items-center gap-1 bg-slate-200/90 p-1 rounded-xl w-fit max-w-full overflow-x-auto whitespace-nowrap border border-slate-300 shadow-2xs animate-in fade-in duration-150 h-9 min-h-[36px] scrollbar-none scroll-smooth touch-pan-x">
            <button
              onClick={() => {
                startTransition(() => {
                  setActiveTab('documentation');
                  setDocumentationSubTab('reports');
                });
              }}
              className={`group px-3 py-1 rounded-lg text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5 font-semibold shrink-0 ${
                documentationSubTab === 'reports' || activeTab === 'reports'
                  ? `bg-white ${theme?.navActiveSubtabText || 'text-indigo-950'} shadow-xs border border-slate-300/80`
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <FileText size={13} className={`w-3.5 h-3.5 shrink-0 ${documentationSubTab === 'reports' || activeTab === 'reports' ? (theme?.navActiveTabIcon || 'text-indigo-600') : 'text-slate-600 group-hover:text-slate-900'}`} />
              <span>Certyfikaty & Sprawozdania</span>
            </button>

            <button
              onClick={() => {
                startTransition(() => {
                  setActiveTab('documentation');
                  setDocumentationSubTab('documents');
                });
              }}
              className={`group px-3 py-1 rounded-lg text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5 font-semibold shrink-0 ${
                documentationSubTab === 'documents' || activeTab === 'documents' || activeTab === 'repository'
                  ? `bg-white ${theme?.navActiveSubtabText || 'text-indigo-950'} shadow-xs border border-slate-300/80`
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <FolderKanban size={13} className={`w-3.5 h-3.5 shrink-0 ${documentationSubTab === 'documents' || activeTab === 'documents' || activeTab === 'repository' ? (theme?.navActiveTabIcon || 'text-indigo-600') : 'text-slate-600 group-hover:text-slate-900'}`} />
              <span>Rejestr Uchwał & Statut</span>
            </button>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-200 to-transparent rounded-r-xl sm:hidden" />
        </div>
      )}

      {/* Sub-bar for Ustawienia & Narzędzia */}
      {currentTab === 'settings_tools' && (
        <div className="relative max-w-full">
          <div className="flex items-center gap-1 bg-slate-200/90 p-1 rounded-xl w-fit max-w-full overflow-x-auto whitespace-nowrap border border-slate-300 shadow-2xs animate-in fade-in duration-150 h-9 min-h-[36px] scrollbar-none scroll-smooth touch-pan-x">
            <button
              onClick={() => {
                startTransition(() => {
                  setActiveTab('settings_tools');
                  setSettingsToolsSubTab('settings');
                });
              }}
              className={`group px-3 py-1 rounded-lg text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5 font-semibold shrink-0 ${
                settingsToolsSubTab === 'settings' || activeTab === 'settings'
                  ? `bg-white ${theme?.navActiveSubtabText || 'text-indigo-950'} shadow-xs border border-slate-300/80`
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Settings size={13} className={`w-3.5 h-3.5 shrink-0 ${settingsToolsSubTab === 'settings' || activeTab === 'settings' ? (theme?.navActiveTabIcon || 'text-indigo-600') : 'text-slate-600 group-hover:text-slate-900'}`} />
              <span>Konfiguracja Koła</span>
            </button>

            <button
              onClick={() => {
                startTransition(() => {
                  setActiveTab('settings_tools');
                  setSettingsToolsSubTab('tools');
                });
              }}
              className={`group px-3 py-1 rounded-lg text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5 font-semibold shrink-0 ${
                settingsToolsSubTab === 'tools' || activeTab === 'tools'
                  ? `bg-white ${theme?.navActiveSubtabText || 'text-indigo-950'} shadow-xs border border-slate-300/80`
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Wrench size={13} className={`w-3.5 h-3.5 shrink-0 ${settingsToolsSubTab === 'tools' || activeTab === 'tools' ? (theme?.navActiveTabIcon || 'text-indigo-600') : 'text-slate-600 group-hover:text-slate-900'}`} />
              <span>Narzędzia & Mailing</span>
            </button>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-200 to-transparent rounded-r-xl sm:hidden" />
        </div>
      )}
    </div>
  );
}

