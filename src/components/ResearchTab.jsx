import React, { useState, useEffect, useMemo, useRef } from 'react';
import { showToast } from '../utils/toast';
import {
  Microscope,
  BookOpen,
  Award,
  Plus,
  Search,
  Printer,
  ExternalLink,
  Edit3,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  Building,
  Calendar,
  Layers,
  BarChart2,
  GraduationCap,
  FileSpreadsheet,
  CloudUpload,
  RefreshCw,
  Archive,
  Lightbulb,
  FileText,
  Check,
  Filter,
} from 'lucide-react';
import { VectorRingIndicator } from './VectorIcons';
import { useOrg } from '../context/OrgContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import { saveResearchToGAS, saveResearchItemToGAS, fetchResearchFromDB } from '../services/googleSheets';
import { initialMembers as seedMembers } from '../data/seedMembers';

const isProjectLike = (type) =>
  type === 'Project' || type === 'EducationalProject' || type === 'InterClubInitiative';

export default function ResearchTab({ members = [] }) {
  const { currentOrg, getStorageKey } = useOrg();
  const currentOrgCleanId = (currentOrg?.id === 'skn-template' ? 'skn_seksuologii' : currentOrg?.id) || 'skn_seksuologii';
  const { academicYear } = useAcademicYear();
  const researchStorageKey = getStorageKey('research');

  // Available members list (from prop or tenant-scoped localStorage fallback)
  const availableMembers = useMemo(() => {
    if (Array.isArray(members) && members.length > 0) return members;
    try {
      const key = getStorageKey ? getStorageKey('members') : `crm_${currentOrgCleanId}_members`;
      const raw = localStorage.getItem(key) || (getStorageKey ? localStorage.getItem(getStorageKey('crm_members')) : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  }, [members, getStorageKey, currentOrgCleanId]);

  // State for achievements / research items (strict tenant isolation - no cross-org leak)
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(researchStorageKey);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(i => !i.organization_id || i.organization_id === currentOrgCleanId);
        }
      }
    } catch (e) {
      console.error('Błąd odczytu dorobku z storage:', e);
    }
    return [];
  });

  const [isLoadingResearch, setIsLoadingResearch] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Sync state & strictly fetch research items filtered by organization_id from Supabase
  useEffect(() => {
    let isCancelled = false;

    // 1. Natychmiastowy odczyt z izolowanego klucza w localStorage
    try {
      const saved = localStorage.getItem(researchStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(i => !i.organization_id || i.organization_id === currentOrgCleanId);
          setItems(filtered);
        } else {
          setItems([]);
        }
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }

    // 2. Twarde pobranie z Supabase z warunkiem .eq('organization_id', currentOrgCleanId)
    async function loadRemoteResearch() {
      setIsLoadingResearch(true);
      try {
        const remoteItems = await fetchResearchFromDB(currentOrgCleanId);
        if (isCancelled) return;
        setItems(remoteItems);
        try {
          localStorage.setItem(researchStorageKey, JSON.stringify(remoteItems));
        } catch {}
      } catch (err) {
        console.warn('[ResearchTab] Błąd pobierania dorobku z bazy Supabase:', err);
      } finally {
        if (!isCancelled) setIsLoadingResearch(false);
      }
    }

    loadRemoteResearch();

    return () => {
      isCancelled = true;
    };
  }, [currentOrgCleanId, researchStorageKey]);

  // Save items to localStorage and sync to Supabase with strict organization_id tagging
  const saveItems = (newItems) => {
    const stampedItems = (newItems || []).map(item => ({
      ...item,
      organization_id: currentOrgCleanId,
      orgId: currentOrgCleanId,
    }));

    setItems(stampedItems);
    try {
      localStorage.setItem(researchStorageKey, JSON.stringify(stampedItems));
      localStorage.setItem(`crm_pending_research_sync_${currentOrgCleanId}`, 'true');
    } catch (e) {
      console.error('Błąd zapisu dorobku:', e);
    }
    console.log('[Supabase] Zapisuję dorobek w bazie Supabase dla organizacji:', currentOrgCleanId);
    saveResearchToGAS(stampedItems, currentOrgCleanId)
      .then(() => {
        try { localStorage.removeItem(`crm_pending_research_sync_${currentOrgCleanId}`); } catch {}
      })
      .catch((err) => {
        console.warn('Cicha synchronizacja dorobku z Supabase nie powiodła się:', err);
      });
  };

  const handleSyncToSheets = async () => {
    setIsSyncing(true);
    setSyncSuccess(false);
    console.log('[Supabase] Wysyłam żądanie zapisu dorobku do bazy Supabase dla:', currentOrgCleanId);
    try {
      await saveResearchToGAS(items, currentOrgCleanId);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 4000);
      showToast('Pomyślnie zapisano wykaz dorobku w bazie Supabase!');
    } catch (err) {
      console.error('Błąd zapisu w bazie Supabase:', err);
      showToast('Wystąpił błąd podczas zapisu w bazie Supabase.');
    } finally {
      setIsSyncing(false);
    }
  };

  // UI States
  const [activeSubTab, setActiveSubTab] = useState('All'); // 'All' | 'Publication' | 'Conference' | 'Project'

  // ── Resizable Sidebar State (clamped min/max, persistent in localStorage) ──
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_research_sidebar_width');
      if (saved) return saved;
    }
    return '260px';
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarContainerRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const screenWidth = window.innerWidth;
      const containerLeft = sidebarContainerRef.current ? sidebarContainerRef.current.getBoundingClientRect().left : 0;
      const newWidthPx = containerLeft > 0 ? (e.clientX - containerLeft) : e.clientX;

      const minAllowed = Math.max(200, screenWidth * 0.12);
      const maxAllowed = Math.min(420, screenWidth * 0.35);

      if (newWidthPx >= minAllowed && newWidthPx <= maxAllowed) {
        setSidebarWidth(`${newWidthPx}px`);
      } else if (newWidthPx < minAllowed) {
        setSidebarWidth(`${minAllowed}px`);
      } else if (newWidthPx > maxAllowed) {
        setSidebarWidth(`${maxAllowed}px`);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = 'default';
        document.body.style.removeProperty('user-select');
        localStorage.setItem('crm_research_sidebar_width', sidebarWidth);
      }
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('All'); // 'All' | 'W toku' | 'Zakończony' | 'Zawieszony'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isPrintPreview, setIsPrintPreview] = useState(false);
  const [customMemberInput, setCustomMemberInput] = useState('');

  // Modal Form State
  const [formState, setFormState] = useState({
    type: 'Publication',
    title: '',
    authors: '',
    speakers: '',
    venue: '',
    conferenceName: '',
    form: 'Referat (Wystąpienie ustne)',
    points: 20,
    year: '2026',
    date: new Date().toISOString().split('T')[0],
    methodology: '',
    sampleSize: '',
    leadResearcher: '',
    teamMembers: '',
    summary: '',
    link: '',
    status: 'W toku',
    description: '',
  });

  // Parsowanie i zarządzanie listą członków zespołu (hybrydowe tagi)
  const currentTeamTags = useMemo(() => {
    if (!formState.teamMembers) return [];
    return String(formState.teamMembers)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }, [formState.teamMembers]);

  const handleAddTeamTag = (name) => {
    const clean = (name || '').trim();
    if (!clean) return;
    if (!currentTeamTags.includes(clean)) {
      const updated = [...currentTeamTags, clean].join(', ');
      setFormState((prev) => ({ ...prev, teamMembers: updated }));
    }
    setCustomMemberInput('');
  };

  const handleRemoveTeamTag = (tagToRemove) => {
    const updated = currentTeamTags.filter((t) => t !== tagToRemove).join(', ');
    setFormState((prev) => ({ ...prev, teamMembers: updated }));
  };

  // Calculated Metrics
  const metrics = useMemo(() => {
    const totalPoints = items
      .filter((i) => i.type === 'Publication')
      .reduce((acc, i) => acc + (Number(i.points) || 0), 0);
    const conferencesCount = items.filter((i) => i.type === 'Conference').length;
    const projectsCount = items.filter((i) => isProjectLike(i.type)).length;
    const totalSample = items
      .filter((i) => isProjectLike(i.type))
      .reduce((acc, i) => acc + (Number(i.sampleSize) || 0), 0);

    return { totalPoints, conferencesCount, projectsCount, totalSample };
  }, [items]);

  // Liczniki projektów i inicjatyw wg statusów
  const projectCounts = useMemo(() => {
    const allProj = items.filter((i) => isProjectLike(i.type));
    const inProgress = allProj.filter((i) => (i.status || '').toLowerCase().includes('toku')).length;
    const completed = allProj.filter((i) => {
      const s = (i.status || '').toLowerCase();
      return s.includes('zakończ') || s.includes('opublikowane');
    }).length;
    const suspended = allProj.filter((i) => {
      const s = (i.status || '').toLowerCase();
      return s.includes('zawiesz') || s.includes('archiwum');
    }).length;

    return {
      all: allProj.length,
      inProgress,
      completed,
      suspended,
    };
  }, [items]);

  // Filtered Items (uwzględnia podzakładkę, filtr statusu projektu oraz wyszukiwarkę)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesTab =
        activeSubTab === 'All' ||
        item.type === activeSubTab ||
        (activeSubTab === 'Project' && isProjectLike(item.type));

      // Filtr statusu dla projektów badawczych i inicjatyw
      if (activeSubTab === 'Project' && projectStatusFilter !== 'All') {
        const itemStatus = (item.status || '').toLowerCase();
        if (projectStatusFilter === 'W toku' && !itemStatus.includes('toku')) return false;
        if (projectStatusFilter === 'Zakończony' && (!itemStatus.includes('zakończ') && !itemStatus.includes('opublikowane'))) return false;
        if (projectStatusFilter === 'Zawieszony' && (!itemStatus.includes('zawiesz') && !itemStatus.includes('archiwum'))) return false;
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (item.title || '').toLowerCase().includes(q) ||
        (item.authors || item.speakers || item.leadResearcher || item.teamMembers || '').toLowerCase().includes(q) ||
        (item.venue || item.conferenceName || item.methodology || item.summary || item.description || '').toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [items, activeSubTab, projectStatusFilter, searchQuery]);

  // Handle open modal for new item
  const handleOpenAddModal = (type = 'Publication') => {
    setEditingItem(null);
    setCustomMemberInput('');
    setFormState({
      type,
      title: '',
      authors: '',
      speakers: '',
      venue: '',
      conferenceName: '',
      form: 'Referat (Wystąpienie ustne)',
      points: 40,
      year: '2026',
      date: new Date().toISOString().split('T')[0],
      methodology: '',
      sampleSize: isProjectLike(type) ? '' : 100,
      leadResearcher: '',
      teamMembers: '',
      summary: '',
      link: '',
      status: 'W toku',
      description: '',
    });
    setIsModalOpen(true);
  };

  // Handle open modal for edit
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setCustomMemberInput('');
    setFormState({
      type: item.type || 'Publication',
      title: item.title || '',
      authors: item.authors || '',
      speakers: item.speakers || '',
      venue: item.venue || '',
      conferenceName: item.conferenceName || '',
      form: item.form || 'Referat (Wystąpienie ustne)',
      points: item.points || 0,
      year: item.year || '2026',
      date: item.date || '',
      methodology: item.methodology || '',
      sampleSize: item.sampleSize !== undefined && item.sampleSize !== null ? item.sampleSize : '',
      leadResearcher: item.leadResearcher || '',
      teamMembers: item.teamMembers || '',
      summary: item.summary || item.conclusions || '',
      link: item.link || '',
      status: item.status || 'W toku',
      description: item.description || '',
    });
    setIsModalOpen(true);
  };

  const [isSavingModal, setIsSavingModal] = useState(false);

  // Handle Save (Form submit with GAS sync and loading state)
  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!formState.title.trim()) {
      showToast('Wpisz tytuł osiągnięcia / projektu!');
      return;
    }

    setIsSavingModal(true);

    // 1. Ekstrakcja lub inteligentne dopasowanie numeru indeksu (Fallback Matcher)
    const personField = String(
      formState.speakers || formState.authors || formState.leadResearcher || ''
    ).trim();

    // A. Próba znalezienia indeksu w tekście (w nawiasie, z # lub jako ciąg 4-7 cyfr)
    const regexMatch = personField.match(/(?:#|\b)(\d{4,7})\b/);
    let finalIndex = regexMatch ? regexMatch[1] : '';

    // B. Inteligentne dopasowanie po nazwisku z tablicy członków koła (Fallback Matcher)
    if (!finalIndex && personField) {
      const cleanSearchName = personField.replace(/\s*\(.*?\)/g, '').toLowerCase().trim();
      const matchedMember = (availableMembers || []).find((m) => {
        const mFullName = String(m?.fullName || m?.imieNazwisko || '').toLowerCase().trim();
        const mFirstLast = `${m?.firstName || m?.imie || ''} ${m?.lastName || m?.nazwisko || ''}`.toLowerCase().trim();
        const mLastFirst = `${m?.lastName || m?.nazwisko || ''} ${m?.firstName || m?.imie || ''}`.toLowerCase().trim();
        return (
          (mFullName && (mFullName === cleanSearchName || cleanSearchName.includes(mFullName) || mFullName.includes(cleanSearchName))) ||
          (mFirstLast && (mFirstLast === cleanSearchName || cleanSearchName.includes(mFirstLast) || mFirstLast.includes(cleanSearchName))) ||
          (mLastFirst && (mLastFirst === cleanSearchName || cleanSearchName.includes(mLastFirst) || mLastFirst.includes(cleanSearchName)))
        );
      });

      if (matchedMember) {
        finalIndex = String(matchedMember?.index || matchedMember?.nrIndeksu || matchedMember?.cleanIndex || '').replace(/\D/g, '').replace(/^0+/, '');
      }
    }

    let itemToSave = null;
    let updatedList = [];

    if (editingItem) {
      itemToSave = {
        ...editingItem,
        ...formState,
        organization_id: currentOrgCleanId,
        orgId: currentOrgCleanId,
        sampleSize: formState.sampleSize === '' ? 0 : Number(formState.sampleSize),
        studentIndex: finalIndex || editingItem?.studentIndex || '',
        nrIndeksu: finalIndex || editingItem?.nrIndeksu || '',
      };
      updatedList = items.map((i) => (i.id === editingItem.id ? itemToSave : i));
    } else {
      itemToSave = {
        id: `res_${Date.now()}`,
        organization_id: currentOrgCleanId,
        orgId: currentOrgCleanId,
        createdAt: new Date().toLocaleString('pl-PL'),
        ...formState,
        sampleSize: formState.sampleSize === '' ? 0 : Number(formState.sampleSize),
        studentIndex: finalIndex || '',
        nrIndeksu: finalIndex || '',
      };
      updatedList = [itemToSave, ...items];
    }

    // 1. Zapis lokalny (state + localStorage) pod kluczem aktywnego koła
    saveItems(updatedList);

    // 2. Bezpośrednia wysyłka do Supabase dla aktywnej organizacji
    try {
      console.log('[ResearchTab] Wysyłam żądanie zapisu dorobku do bazy Supabase...', currentOrgCleanId, itemToSave);
      await saveResearchItemToGAS(itemToSave, updatedList, currentOrgCleanId);
      setIsModalOpen(false);
      showToast('Osiągnięcie zostało pomyślnie zapisane w bazie koła naukowego!');
    } catch (err) {
      console.error('Błąd zapisu do bazy Supabase:', err);
      setIsModalOpen(false);
      showToast('Osiągnięcie zostało zapisane lokalnie. Synchronizacja z bazą zakończy się po odzyskaniu połączenia.');
    } finally {
      setIsSavingModal(false);
    }
  };

  // Handle Delete
  const handleDeleteItem = (id) => {
    const updated = items.filter((i) => i.id !== id);
    saveItems(updated);
    showToast('Pozycja dorobku naukowego została usunięta.');
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 pb-12 font-sans animate-in fade-in duration-200 print:p-0 print:space-y-4">
      {/* ── HEADER BAR ────────────────────────────────────────────────────────── */}
      <div className="bg-white px-3.5 sm:px-4 md:px-6 py-3 min-h-[64px] rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center min-w-0">
          <div className="w-11 h-11 min-w-[44px] rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center mr-4 shrink-0 shadow-2xs">
            <Microscope className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-tight text-slate-900 tracking-tight truncate">
                Dorobek Naukowy & Projekty Badawcze
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                {currentOrg?.shortName || currentOrg?.name || 'SKN'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-normal mt-0.5 truncate">
              Rejestracja publikacji, referatów konferencyjnych i projektów badawczych dla Dziekanatu i PKA.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(items || []).length > 0 && (
            <button
              type="button"
              onClick={() => {
                saveItems([]);
                showToast('Wyczyszczono listę dorobku naukowego.');
              }}
              className="h-9 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Wyczyść wszystkie wpisy dorobku"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Wyczyść listę</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncToSheets}
            disabled={isSyncing}
            className={`h-9 px-3.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer ${
              syncSuccess
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Zapisz i zsynchronizuj cały wykaz dorobku z arkuszem Google Rejestr_Dorobku"
          >
            {isSyncing ? (
              <RefreshCw size={14} className="animate-spin text-emerald-600" />
            ) : syncSuccess ? (
              <CheckCircle2 size={14} className="text-emerald-600" />
            ) : (
              <CloudUpload size={14} className="text-indigo-600" />
            )}
            <span>{isSyncing ? 'Zapisywanie...' : syncSuccess ? 'Zapisano w Sheets' : 'Zapisz w Google Sheets'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Printer size={14} />
            <span>Drukuj Wykaz (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal('Publication')}
            className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} className="w-4 h-4 shrink-0" />
            <span>Dodaj Osiągnięcie</span>
          </button>
        </div>
      </div>

      {/* ── DEDYKOWANY KONTENER DRUKU A4 (WYKAZ DOROBKU I BADAŃ) ─────────────── */}
      <div
        id="research-print-container"
        className="hidden print:block print-dorobek-report font-sans text-black p-6 bg-white w-full doc-a4-multipage box-border"
        style={{ width: '100%', boxSizing: 'border-box' }}
      >
        {/* Nagłówek Formalny Raportu */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 text-center">
          <h1 className="text-base font-bold uppercase tracking-tight text-slate-900">
            WYŻSZA SZKOŁA KSZTAŁCENIA ZAWODOWEGO • {(currentOrg?.unit || 'WYDZIAŁ NAUK SPOŁECZNYCH').toUpperCase()}
          </h1>
          <h2 className="text-xl font-extrabold uppercase mt-1 text-slate-950">
            Wykaz Dorobku Naukowego i Badań
          </h2>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            {currentOrg?.name || 'Studenckie Koło Naukowe'} • Rok Akademicki {academicYear}
          </p>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-4 px-2 pt-2 border-t border-slate-200">
            <span><strong>Data wygenerowania:</strong> {new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span><strong>Liczba pozycji:</strong> {(filteredItems || []).length}</span>
            <span><strong>Łączne punkty MEiN:</strong> {metrics?.totalPoints || 0} pkt</span>
          </div>
        </div>

        {/* Tabela Wykazu Osiągnięć */}
        {(filteredItems || []).length === 0 ? (
          <div className="text-center py-8 text-slate-500 italic text-sm border border-slate-200 rounded-lg">
            Brak zarejestrowanych pozycji dorobku naukowego w wybranym zestawieniu.
          </div>
        ) : (
          <table
            className="w-full text-left border-collapse border border-slate-300 text-xs table-fixed"
            style={{ tableLayout: 'fixed', width: '100%' }}
          >
            <thead>
              <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-bold">
                <th className="py-2.5 px-2 border-r border-slate-300 text-center" style={{ width: '5%' }}>Lp.</th>
                <th className="py-2.5 px-3 border-r border-slate-300" style={{ width: '15%' }}>Kategoria</th>
                <th className="py-2.5 px-3 border-r border-slate-300" style={{ width: '32%' }}>Tytuł Osiągnięcia / Projektu</th>
                <th className="py-2.5 px-3 border-r border-slate-300" style={{ width: '23%' }}>Autorzy / Prelegenci / Kierownik</th>
                <th className="py-2.5 px-3 border-r border-slate-300" style={{ width: '15%' }}>Miejsce / Konferencja / Wydawnictwo</th>
                <th className="py-2.5 px-2 text-center" style={{ width: '10%' }}>Punkty / Status</th>
              </tr>
            </thead>
            <tbody>
              {(filteredItems || []).map((item, idx) => {
                const itemTypeLabel =
                  item?.type === 'Publication'
                    ? 'Publikacja naukowa'
                    : item?.type === 'Conference'
                    ? `Referat (${item?.form || 'Wystąpienie'})`
                    : item?.type === 'Project'
                    ? 'Projekt badawczy'
                    : item?.type === 'EducationalProject'
                    ? 'Projekt edukacyjny / społeczny'
                    : item?.type === 'InterClubInitiative'
                    ? 'Inicjatywa międzyklubowa'
                    : item?.type || 'Osiągnięcie';

                const authorsOrTeam =
                  isProjectLike(item?.type) && (item?.leadResearcher || item?.teamMembers)
                    ? `Kierownik/Lider: ${item?.leadResearcher || '—'}${item?.teamMembers ? ` | Zespół: ${item.teamMembers}` : ''}`
                    : item?.authors || item?.speakers || item?.leadResearcher || '—';

                const venueOrConf =
                  item?.type === 'Publication'
                    ? `${item?.venue || '—'} (${item?.year || ''})`
                    : item?.type === 'Conference'
                    ? `${item?.conferenceName || '—'} (${item?.date || ''})`
                    : isProjectLike(item?.type)
                    ? `${Boolean(item?.sampleSize) && Number(item?.sampleSize) > 0 ? `Zasięg/Próba N=${item.sampleSize} • ` : ''}${item?.methodology || 'Działania projektowe'}`
                    : '—';

                const pointsOrStatus =
                  item?.type === 'Publication'
                    ? `${item?.points || 0} pkt MEiN`
                    : isProjectLike(item?.type)
                    ? `Status: ${item?.status || 'W toku'}`
                    : `${item?.status || 'Wystąpienie'}`;

                return (
                  <tr
                    key={item?.id || idx}
                    className="border-b border-slate-200 print-item-row break-inside-avoid align-top"
                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                  >
                    <td className="py-2 px-2 border-r border-slate-200 text-center font-mono font-semibold text-slate-600 align-top">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2.5 border-r border-slate-200 font-semibold text-slate-800 break-words align-top">
                      {itemTypeLabel}
                    </td>
                    <td className="py-2 px-2.5 border-r border-slate-200 font-bold text-slate-900 break-words align-top">
                      {item?.title || '—'}
                      {item?.description && (
                        <span className="block font-normal text-[11px] text-slate-600 mt-0.5 italic break-words">
                          {item.description}
                        </span>
                      )}
                      {isProjectLike(item?.type) && item?.summary && (
                        <span className="block font-normal text-[10.5px] text-slate-700 bg-slate-50 border border-slate-200 p-1.5 rounded mt-1 break-words">
                          <strong>Podsumowanie / Baza wiedzy:</strong> {item.summary}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 border-r border-slate-200 text-slate-800 break-words align-top">
                      {authorsOrTeam}
                    </td>
                    <td className="py-2 px-2.5 border-r border-slate-200 text-slate-700 break-words align-top">
                      {venueOrConf}
                    </td>
                    <td className="py-2 px-2 text-center font-semibold text-slate-900 break-words align-top">
                      {pointsOrStatus}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Sekcja Podpisów Formalnych */}
        <div
          className="mt-12 pt-6 border-t border-slate-300 flex justify-between items-end text-xs text-slate-700 print-item-row signatures-block signature-block"
          style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
        >
          <div className="text-center w-56">
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-semibold">Podpis Przewodniczącego SKN</p>
          </div>
          <div className="text-center w-56">
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-semibold">Podpis Opiekuna Naukowego</p>
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN MASTER-DETAIL LAYOUT WITH RESIZABLE SIDEBAR ──────────── */}
      <div className="flex flex-col lg:flex-row items-stretch gap-0 w-full min-h-[calc(100vh-230px)] print:hidden">
        
        {/* ── LEFT SIDEBAR: PIONOWY PANEL PODSUMOWAŃ I NAWIGACJI ─────────────── */}
        <div
          ref={sidebarContainerRef}
          className="w-full lg:shrink-0 flex flex-col space-y-3 pr-0 lg:pr-3 pb-4 lg:pb-0 print:hidden"
          style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : '100%' }}
        >
          {/* Section Header */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Dorobek Naukowy & Badania SKN
            </div>

            {/* Vertical Stats / Quick Filters */}
            <div className="space-y-1.5">
              {/* All Items Tile */}
              <button
                type="button"
                onClick={() => setActiveSubTab('All')}
                className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                  activeSubTab === 'All'
                    ? 'bg-indigo-50/90 border-2 border-indigo-500 text-indigo-950 shadow-xs'
                    : 'bg-white hover:bg-indigo-50/40 text-slate-700 border border-slate-200/80 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                    activeSubTab === 'All' ? 'bg-indigo-200/80 text-indigo-800' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={`block text-xs font-semibold leading-tight truncate ${
                      activeSubTab === 'All' ? 'text-indigo-950' : 'text-slate-800'
                    }`}>
                      Wszystkie osiągnięcia
                    </span>
                    <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                      activeSubTab === 'All' ? 'text-indigo-700' : 'text-slate-400'
                    }`}>
                      Cały dorobek SKN
                    </span>
                  </div>
                </div>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                  activeSubTab === 'All' ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300' : 'bg-slate-100 text-slate-600'
                }`}>
                  {items.length}
                </span>
              </button>

              {/* 1. Publikacje naukowe */}
              <button
                type="button"
                onClick={() => setActiveSubTab('Publication')}
                className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                  activeSubTab === 'Publication'
                    ? 'bg-indigo-50/90 border-2 border-indigo-500 text-indigo-950 shadow-xs'
                    : 'bg-white hover:bg-indigo-50/40 text-slate-700 border border-slate-200/80 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                    activeSubTab === 'Publication' ? 'bg-indigo-200/80 text-indigo-800' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={`block text-xs font-semibold leading-tight truncate ${
                      activeSubTab === 'Publication' ? 'text-indigo-950' : 'text-slate-800'
                    }`}>
                      Publikacje naukowe
                    </span>
                    <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                      activeSubTab === 'Publication' ? 'text-indigo-700' : 'text-slate-400'
                    }`}>
                      Artykuły i monografie
                    </span>
                  </div>
                </div>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                  activeSubTab === 'Publication'
                    ? 'bg-indigo-200 text-indigo-900 font-bold border border-indigo-300'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {items.filter((i) => i.type === 'Publication').length}
                </span>
              </button>

              {/* 2. Wystąpienia & Referaty */}
              <button
                type="button"
                onClick={() => setActiveSubTab('Conference')}
                className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                  activeSubTab === 'Conference'
                    ? 'bg-amber-50/90 border-2 border-amber-500 text-amber-950 shadow-xs'
                    : 'bg-white hover:bg-amber-50/40 text-slate-700 border border-slate-200/80 hover:border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                    activeSubTab === 'Conference' ? 'bg-amber-200/80 text-amber-800' : 'bg-amber-50 text-amber-600'
                  }`}>
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={`block text-xs font-semibold leading-tight truncate ${
                      activeSubTab === 'Conference' ? 'text-amber-950' : 'text-slate-800'
                    }`}>
                      Wystąpienia & Referaty
                    </span>
                    <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                      activeSubTab === 'Conference' ? 'text-amber-700' : 'text-slate-400'
                    }`}>
                      Konferencje i sympozja
                    </span>
                  </div>
                </div>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                  activeSubTab === 'Conference'
                    ? 'bg-amber-200 text-amber-900 font-bold border border-amber-300'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {metrics.conferencesCount}
                </span>
              </button>

              {/* 3. Projekty badawcze */}
              <button
                type="button"
                onClick={() => setActiveSubTab('Project')}
                className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                  activeSubTab === 'Project'
                    ? 'bg-sky-50/90 border-2 border-sky-500 text-sky-950 shadow-xs'
                    : 'bg-white hover:bg-sky-50/40 text-slate-700 border border-slate-200/80 hover:border-sky-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                    activeSubTab === 'Project' ? 'bg-sky-200/80 text-sky-800' : 'bg-sky-50 text-sky-600'
                  }`}>
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={`block text-xs font-semibold leading-tight truncate ${
                      activeSubTab === 'Project' ? 'text-sky-950' : 'text-slate-800'
                    }`}>
                      Projekty badawcze
                    </span>
                    <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                      activeSubTab === 'Project' ? 'text-sky-700' : 'text-slate-400'
                    }`}>
                      Badania empiryczne
                    </span>
                  </div>
                </div>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                  activeSubTab === 'Project'
                    ? 'bg-sky-200 text-sky-900 font-bold border border-sky-300'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {metrics.projectsCount}
                </span>
              </button>
            </div>
          </div>

          {/* 4. Łączne punkty MEiN / MNiSW - Static Metric Box */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between select-none">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100/90 text-emerald-800 shrink-0 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 leading-tight block truncate">
                    Łączne Punkty MEiN
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium leading-tight truncate block mt-0.5">
                    Ewaluacja dorobku
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-base font-extrabold text-emerald-800 block leading-tight">
                  {metrics.totalPoints}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  PKT
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RESIZER HANDLE ──────────────────────────────────────────────────── */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className={`hidden lg:flex items-center justify-center w-[5px] shrink-0 cursor-col-resize select-none z-10 transition-colors duration-150 self-stretch my-0.5 rounded-full group print:hidden ${
            isResizing
              ? 'bg-emerald-500 shadow-xs'
              : 'hover:bg-emerald-400 bg-transparent hover:shadow-xs'
          }`}
          style={{
            width: '5px',
            cursor: 'col-resize',
            backgroundColor: isResizing ? '#10b981' : 'transparent',
            transition: 'background-color 0.15s ease',
            flexShrink: 0,
            userSelect: 'none',
            zIndex: 10,
          }}
          title="Przeciągnij krawędź, aby dostosować szerokość panelu bocznego"
        >
          <div className={`w-[1px] h-8 rounded-full transition-colors ${
            isResizing ? 'bg-white' : 'bg-slate-300 group-hover:bg-emerald-200'
          }`} />
        </div>

        {/* ── RIGHT MAIN WORKSPACE: REJESTR DOROBKU ────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full pl-0 lg:pl-3 space-y-3 print:pl-0">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 print:border-none print:shadow-none print:p-0">
            
            {/* Top Toolbar (Filters, Search, Actions) */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 print:hidden">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('All')}
                  className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                    activeSubTab === 'All'
                      ? 'bg-indigo-50/90 text-indigo-950 border-2 border-indigo-500 shadow-xs'
                      : 'bg-transparent text-slate-600 hover:bg-indigo-50/50 hover:text-indigo-900'
                  }`}
                >
                  <span>Wszystkie</span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                    activeSubTab === 'All'
                      ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {items.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('Publication')}
                  className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                    activeSubTab === 'Publication'
                      ? 'bg-indigo-50/90 text-indigo-950 border-2 border-indigo-500 shadow-xs'
                      : 'bg-transparent text-slate-600 hover:bg-indigo-50/50 hover:text-indigo-900'
                  }`}
                >
                  <span>Publikacje</span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                    activeSubTab === 'Publication'
                      ? 'bg-indigo-200 text-indigo-900 font-bold border border-indigo-300'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {items.filter((i) => i.type === 'Publication').length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('Conference')}
                  className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                    activeSubTab === 'Conference'
                      ? 'bg-amber-50/90 text-amber-950 border-2 border-amber-500 shadow-xs'
                      : 'bg-transparent text-slate-600 hover:bg-amber-50/50 hover:text-amber-900'
                  }`}
                >
                  <span>Konferencje</span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                    activeSubTab === 'Conference'
                      ? 'bg-amber-200 text-amber-900 font-bold border border-amber-300'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {metrics.conferencesCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('Project')}
                  className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                    activeSubTab === 'Project'
                      ? 'bg-sky-50/90 text-sky-950 border-2 border-sky-500 shadow-xs'
                      : 'bg-transparent text-slate-600 hover:bg-sky-50/50 hover:text-sky-900'
                  }`}
                >
                  <span>Projekty Badawcze</span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                    activeSubTab === 'Project'
                      ? 'bg-sky-200 text-sky-900 font-bold border border-sky-300'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {metrics.projectsCount}
                  </span>
                </button>
              </div>

              {/* Search & Actions */}
              <div className="flex items-center gap-2 flex-1 lg:max-w-md justify-end">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="research-search-input"
                    name="researchSearch"
                    aria-label="Szukaj osiągnięcia naukowego po tytule lub autorze"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Szukaj po tytule, autorze..."
                    className="w-full h-9 pl-8 pr-7 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddModal(activeSubTab === 'All' ? 'Publication' : activeSubTab)}
                  className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Plus size={16} strokeWidth={2.5} className="w-4 h-4 shrink-0" />
                  <span>Dodaj</span>
                </button>
              </div>
            </div>

            {/* Szybkie filtrowanie statusów projektów badawczych */}
            {activeSubTab === 'Project' && (
              <div className="flex flex-wrap items-center gap-2 p-2.5 bg-sky-50/60 rounded-xl border border-sky-100/80 mb-1">
                <span className="text-[11px] font-bold text-sky-950 flex items-center gap-1.5 mr-1">
                  <Filter size={13} className="text-sky-700 shrink-0" strokeWidth={2.2} />
                  <span>Status projektu:</span>
                </span>

                <button
                  type="button"
                  onClick={() => setProjectStatusFilter('All')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    projectStatusFilter === 'All'
                      ? 'bg-white text-slate-900 border border-slate-300 shadow-xs'
                      : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span>Wszystkie</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-bold">
                    {projectCounts.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectStatusFilter('W toku')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    projectStatusFilter === 'W toku'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-50 text-blue-800 hover:bg-blue-100/80 border border-blue-200'
                  }`}
                >
                  <VectorRingIndicator ringColor="blue" />
                  <span>W toku</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    projectStatusFilter === 'W toku' ? 'bg-blue-700 text-blue-100' : 'bg-blue-200/70 text-blue-900'
                  }`}>
                    {projectCounts.inProgress}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectStatusFilter('Zakończony')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    projectStatusFilter === 'Zakończony'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200'
                  }`}
                >
                  <VectorRingIndicator ringColor="emerald" />
                  <span>Zakończone</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    projectStatusFilter === 'Zakończony' ? 'bg-emerald-700 text-emerald-100' : 'bg-emerald-200/70 text-emerald-900'
                  }`}>
                    {projectCounts.completed}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectStatusFilter('Zawieszony')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    projectStatusFilter === 'Zawieszony'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100/80 border border-amber-200'
                  }`}
                >
                  <VectorRingIndicator ringColor="amber" />
                  <span>Zawieszone / Archiwum pomysłów</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    projectStatusFilter === 'Zawieszony' ? 'bg-amber-700 text-amber-100' : 'bg-amber-200/70 text-amber-900'
                  }`}>
                    {projectCounts.suspended}
                  </span>
                </button>
              </div>
            )}

            {/* Full Items List / Table */}
            <div className="space-y-2.5 pt-1">
              {isLoadingResearch ? (
                <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-emerald-600" />
                  <span className="text-xs font-semibold">Pobieranie dorobku koła z bazy Supabase...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
                  Brak pozycji dorobku naukowego w wybranym filtrze dla tego koła.
                </div>
              ) : (
                filteredItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3.5 sm:p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 print:border-slate-300 print:shadow-none print:py-2"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>

                        {item.type === 'Publication' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <BookOpen size={12} strokeWidth={2.2} className="shrink-0" />
                            <span>Publikacja</span>
                          </span>
                        )}

                        {item.type === 'Conference' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Award size={12} strokeWidth={2.2} className="shrink-0" />
                            <span>Referat / Konferencja</span>
                          </span>
                        )}

                        {item.type === 'Project' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            <Microscope size={12} strokeWidth={2.2} className="shrink-0" />
                            <span>Projekt Badawczy</span>
                          </span>
                        )}

                        {item.type === 'EducationalProject' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            <GraduationCap size={12} strokeWidth={2.2} className="shrink-0" />
                            <span>Projekt Edukacyjny / Społeczny</span>
                          </span>
                        )}

                        {item.type === 'InterClubInitiative' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <Users size={12} strokeWidth={2.2} className="shrink-0" />
                            <span>Inicjatywa Międzyklubowa</span>
                          </span>
                        )}

                        {isProjectLike(item.type) ? (
                          (() => {
                            const st = (item.status || '').toLowerCase();
                            if (st.includes('toku')) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  <VectorRingIndicator ringColor="blue" />
                                  <span>W toku</span>
                                </span>
                              );
                            }
                            if (st.includes('zakończ') || st.includes('opublikowane')) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <VectorRingIndicator ringColor="emerald" />
                                  <span>Zakończony</span>
                                </span>
                              );
                            }
                            if (st.includes('zawiesz') || st.includes('archiwum')) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  <VectorRingIndicator ringColor="amber" />
                                  <span>Zawieszony / Archiwum</span>
                                </span>
                              );
                            }
                            return (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                                {item.status}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                            {item.status}
                          </span>
                        )}
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-snug">
                        {item.title}
                      </h3>

                      {/* Context Details */}
                      <div className="text-[11.5px] text-slate-600 space-y-0.5">
                        {item.type === 'Publication' && (
                          <p>
                            <strong>Autorzy:</strong> {item.authors} • <strong>Wydawnictwo/Czasopismo:</strong>{' '}
                            {item.venue} ({item.year}) •{' '}
                            <strong className="text-purple-700">{item.points} pkt MEiN</strong>
                          </p>
                        )}

                        {item.type === 'Conference' && (
                          <p>
                            <strong>Prelegenci:</strong> {item.speakers || item.authors} •{' '}
                            <strong>Konferencja:</strong> {item.conferenceName} ({item.date}) •{' '}
                            <span className="font-semibold text-amber-800">{item.form}</span>
                          </p>
                        )}

                        {isProjectLike(item.type) && (
                          <div className="space-y-1">
                            <p>
                              <strong>
                                {item.type === 'InterClubInitiative'
                                  ? 'Koordynator / Koło wiodące:'
                                  : 'Kierownik / Lider:'}
                              </strong>{' '}
                              {item.leadResearcher || item.authors || '—'}
                              {item.methodology && (
                                <> • <strong>Forma działań / Metodyka:</strong> {item.methodology}</>
                              )}
                              {Boolean(item.sampleSize) && Number(item.sampleSize) > 0 && (
                                <> • <strong className="text-blue-700">
                                  {item.type === 'Project' ? `Próba N = ${item.sampleSize}` : `Zasięg / Uczestnicy: ~${item.sampleSize}`}
                                </strong></>
                              )}
                            </p>
                            {item.teamMembers && (
                              <p className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <Users size={12} className="text-sky-600 shrink-0" strokeWidth={2.2} />
                                <span><strong>Zespół / Partnerzy:</strong> {item.teamMembers}</span>
                              </p>
                            )}
                            {item.summary && (
                              <div className={`mt-2 p-2.5 rounded-xl text-[11px] border leading-relaxed flex items-start gap-2 ${
                                (item.status || '').toLowerCase().includes('zawiesz') || (item.status || '').toLowerCase().includes('archiwum')
                                  ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                                  : 'bg-sky-50/60 border-sky-200 text-sky-950'
                              }`}>
                                <Lightbulb size={13} className={`shrink-0 mt-0.5 ${
                                  (item.status || '').toLowerCase().includes('zawiesz') || (item.status || '').toLowerCase().includes('archiwum')
                                    ? 'text-amber-600'
                                    : 'text-sky-600'
                                }`} strokeWidth={2.2} />
                                <div>
                                  <span className="font-bold block mb-0.5">
                                    {(item.status || '').toLowerCase().includes('zawiesz') || (item.status || '').toLowerCase().includes('archiwum')
                                      ? 'Baza wiedzy / Wnioski i notatki na przyszłość:'
                                      : 'Podsumowanie i wnioski z projektu:'}
                                  </span>
                                  <span className="whitespace-pre-line">{item.summary}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {item.description && (
                          <p className="text-[11px] text-slate-500 italic mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 print:hidden">
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink size={12} />
                          <span>DOI / Link</span>
                        </a>
                      )}

                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer"
                        title="Edytuj pozycję"
                      >
                        <Edit3 size={13} />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Usuń pozycję"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL: ADD / EDIT RESEARCH ITEM ──────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden font-sans">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Microscope size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {editingItem ? 'Edycja Dorobku Naukowego' : 'Nowe Osiągnięcie / Projekt'}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[11px] text-slate-400">{currentOrg.name}</p>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      {currentOrg.tag || currentOrgCleanId}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-4 sm:p-6 space-y-4">
              <datalist id="members-autocomplete-list">
                {availableMembers.map((m, idx) => {
                  const fullName = m.fullName || (m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : (m.imie && m.nazwisko ? `${m.imie} ${m.nazwisko}` : m.name)) || '';
                  const memberIndex = m.nrIndeksu || m.cleanIndex || m.index || m.albumNumber || m.studentIndex || '';
                  const label = memberIndex ? `${fullName} (#${memberIndex})` : fullName;
                  return (
                    <option key={m.id || idx} value={label}>
                      {label}
                    </option>
                  );
                })}
              </datalist>

              <div>
                <label htmlFor="research-type-select" className="text-xs font-bold text-slate-700 block mb-1">Typ Osiągnięcia:</label>
                <select
                  id="research-type-select"
                  name="researchType"
                  value={formState.type}
                  onChange={(e) => setFormState({ ...formState, type: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans focus:outline-none focus:border-emerald-500"
                >
                  <option value="Publication">Publikacja Naukowo-Dydaktyczna</option>
                  <option value="Conference">Wystąpienie Konferencyjne</option>
                  <option value="Project">Projekt Badawczy (Badawczo-Ankietowy)</option>
                  <option value="EducationalProject">Projekt Edukacyjny / Społeczny</option>
                  <option value="InterClubInitiative">Inicjatywa Międzyklubowa</option>
                </select>
              </div>

              <div>
                <label htmlFor="research-title-input" className="text-xs font-bold text-slate-700 block mb-1">Tytuł Osiągnięcia / Projektu:</label>
                <input
                  id="research-title-input"
                  name="researchTitle"
                  type="text"
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  placeholder="Wpisz pełny tytuł artykułu, referatu lub badania..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {formState.type === 'Publication' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="research-authors-input" className="text-xs font-bold text-slate-700 block mb-1">Autorzy:</label>
                      <input
                        id="research-authors-input"
                        name="researchAuthors"
                        type="text"
                        list="members-autocomplete-list"
                        value={formState.authors}
                        onChange={(e) => setFormState({ ...formState, authors: e.target.value })}
                        placeholder="np. Jan Kowalski (#123456) lub wybierz z listy..."
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="research-points-input" className="text-xs font-bold text-slate-700 block mb-1">Punkty MEiN:</label>
                      <input
                        id="research-points-input"
                        name="researchPoints"
                        type="number"
                        value={formState.points}
                        onChange={(e) => setFormState({ ...formState, points: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="research-venue-input" className="text-xs font-bold text-slate-700 block mb-1">Czasopismo / Wydawnictwo:</label>
                    <input
                      id="research-venue-input"
                      name="researchVenue"
                      type="text"
                      value={formState.venue}
                      onChange={(e) => setFormState({ ...formState, venue: e.target.value })}
                      placeholder="np. Przegląd Seksuologiczny WSKZ (Vol. 12/2026)"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}

              {formState.type === 'Conference' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="research-speakers-input" className="text-xs font-bold text-slate-700 block mb-1">Prelegenci:</label>
                      <input
                        id="research-speakers-input"
                        name="researchSpeakers"
                        type="text"
                        list="members-autocomplete-list"
                        value={formState.speakers}
                        onChange={(e) => setFormState({ ...formState, speakers: e.target.value })}
                        placeholder="np. Jan Kowalski (#123456) lub wybierz z listy..."
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="research-form-select" className="text-xs font-bold text-slate-700 block mb-1">Forma wystąpienia:</label>
                      <select
                        id="research-form-select"
                        name="researchForm"
                        value={formState.form}
                        onChange={(e) => setFormState({ ...formState, form: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Referat (Wystąpienie ustne)">Referat (Wystąpienie ustne)</option>
                        <option value="Poster (Sesja plakatowa)">Poster (Sesja plakatowa)</option>
                        <option value="Warsztat Naukowy">Warsztat Naukowy</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="research-conference-name-input" className="text-xs font-bold text-slate-700 block mb-1">Nazwa Konferencji:</label>
                    <input
                      id="research-conference-name-input"
                      name="researchConferenceName"
                      type="text"
                      value={formState.conferenceName}
                      onChange={(e) => setFormState({ ...formState, conferenceName: e.target.value })}
                      placeholder="np. I Ogólnopolska Konferencja Profilaktyki Uzależnień WSKZ"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}

              {isProjectLike(formState.type) && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="research-lead-researcher-input" className="text-xs font-bold text-slate-700 block mb-1">
                        {formState.type === 'InterClubInitiative'
                          ? 'Koordynator / Koło wiodące:'
                          : formState.type === 'EducationalProject'
                          ? 'Lider Projektu / Koordynator:'
                          : 'Kierownik Projektu Badawczego:'}
                      </label>
                      <input
                        id="research-lead-researcher-input"
                        name="researchLeadResearcher"
                        type="text"
                        list="members-autocomplete-list"
                        value={formState.leadResearcher}
                        onChange={(e) => setFormState({ ...formState, leadResearcher: e.target.value })}
                        placeholder="np. Jan Kowalski (#12345) lub nazwa koła..."
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="research-team-quick-select" className="text-xs font-bold text-slate-700 block mb-1">
                        Szybki wybór członka Koła do zespołu:
                      </label>
                      <select
                        id="research-team-quick-select"
                        name="researchTeamQuickSelect"
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddTeamTag(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-sans focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="" disabled>
                          + Wybierz członka Koła z listy...
                        </option>
                        {availableMembers.map((m, idx) => {
                          const fullName = m.fullName || (m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : (m.imie && m.nazwisko ? `${m.imie} ${m.nazwisko}` : m.name)) || '';
                          const memberIndex = m.nrIndeksu || m.cleanIndex || m.index || m.albumNumber || m.studentIndex || '';
                          const label = memberIndex ? `${fullName} (#${memberIndex})` : fullName;
                          return (
                            <option key={m.id || idx} value={label}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* Hybrydowe pole „Zespół / Grupa członków” */}
                  <div className="space-y-1.5 p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Users size={13} className="text-indigo-600" />
                        <span>Zespół / Grupa członków & Partnerzy inicjatywy:</span>
                      </span>
                      <span className="text-[10.5px] text-slate-400 font-normal">
                        Wybór z listy lub wpis „z ręki”
                      </span>
                    </label>

                    {/* Wizualne tagi / chipy dodanych uczestników */}
                    {currentTeamTags.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 py-1">
                        {currentTeamTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 shadow-2xs animate-in fade-in"
                          >
                            <span className="max-w-[240px] truncate" title={tag}>{tag}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTeamTag(tag)}
                              className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-0.5 rounded"
                              title="Usuń z zespołu"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic py-0.5">
                        Brak przypisanych członków zespołu. Wybierz osobę z listy powyżej lub dopisz dowolną osobę / koło poniżej.
                      </p>
                    )}

                    {/* Pole do wpisywania „z ręki” (np. SKN Psychologii Klinicznej) */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <div className="relative flex-1">
                        <input
                          id="research-custom-member-input"
                          name="researchCustomMemberInput"
                          type="text"
                          list="members-autocomplete-list"
                          value={customMemberInput}
                          onChange={(e) => setCustomMemberInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTeamTag(customMemberInput);
                            }
                          }}
                          placeholder="Wpisz osobę lub inne koło naukowe (np. SKN Psychologii Klinicznej)..."
                          className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddTeamTag(customMemberInput)}
                        disabled={!customMemberInput.trim()}
                        className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-800 text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0 flex items-center gap-1"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        <span>Dodaj</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="research-methodology-input" className="text-xs font-bold text-slate-700 block mb-1">
                        Forma działań / Narzędzia / Metodyka:
                      </label>
                      <input
                        id="research-methodology-input"
                        name="researchMethodology"
                        type="text"
                        value={formState.methodology}
                        onChange={(e) => setFormState({ ...formState, methodology: e.target.value })}
                        placeholder={
                          formState.type === 'EducationalProject'
                            ? 'np. Cykl warsztatów, Webinary, Kampania w social media'
                            : formState.type === 'InterClubInitiative'
                            ? 'np. Debata międzykołowa, Seminarium wspólne, Okrągły stół'
                            : 'np. Ankieta CAWI, Skala PSS-10, Analiza SPSS'
                        }
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="research-sample-size-input" className="text-xs font-bold text-slate-700 block mb-1">
                        {formState.type === 'Project'
                          ? 'Liczebność próby (N) [opcjonalnie]:'
                          : 'Grupa docelowa / Zasięg (opcjonalnie):'}
                      </label>
                      <input
                        id="research-sample-size-input"
                        name="researchSampleSize"
                        type="number"
                        min="0"
                        value={formState.sampleSize !== undefined && formState.sampleSize !== null ? formState.sampleSize : ''}
                        onChange={(e) => setFormState({ ...formState, sampleSize: e.target.value === '' ? '' : Number(e.target.value) })}
                        placeholder={
                          formState.type === 'Project'
                            ? 'np. 100 (lub puste)'
                            : 'np. 350 uczestników (lub puste)'
                        }
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Wybór statusu projektu / inicjatywy z wektorowymi znacznikami */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Status Projektu / Inicjatywy:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, status: 'W toku' })}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                          (formState.status || '').toLowerCase().includes('toku')
                            ? 'bg-blue-50 border-blue-400 text-blue-950 ring-2 ring-blue-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <VectorRingIndicator ringColor="blue" />
                          <span className="text-xs font-bold">W toku</span>
                        </div>
                        <span className="text-[10px] text-slate-500">Inicjatywa w trakcie realizacji</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, status: 'Zakończony' })}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                          (formState.status || '').toLowerCase().includes('zakończ') || (formState.status || '').toLowerCase().includes('opublikowane')
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-2 ring-emerald-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <VectorRingIndicator ringColor="emerald" />
                          <span className="text-xs font-bold">Zakończony</span>
                        </div>
                        <span className="text-[10px] text-slate-500">Projekt pomyślnie zrealizowany</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, status: 'Zawieszony / Archiwum pomysłów' })}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                          (formState.status || '').toLowerCase().includes('zawiesz') || (formState.status || '').toLowerCase().includes('archiwum')
                            ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <VectorRingIndicator ringColor="amber" />
                          <span className="text-xs font-bold leading-tight">Zawieszony</span>
                        </div>
                        <span className="text-[10px] text-slate-500">Archiwum pomysłów / baza wiedzy</span>
                      </button>
                    </div>
                  </div>

                  {/* Podsumowanie i wnioski badawcze (Baza wiedzy) */}
                  <div>
                    <label htmlFor="research-summary-textarea" className="text-xs font-bold text-slate-700 block mb-1">
                      Podsumowanie / Wnioski / Baza wiedzy na przyszłość:
                    </label>
                    <textarea
                      id="research-summary-textarea"
                      name="researchSummary"
                      rows={2}
                      value={formState.summary}
                      onChange={(e) => setFormState({ ...formState, summary: e.target.value })}
                      placeholder="Krótkie podsumowanie zebranych wniosków lub przyczyny odłożenia w czasie (cenna baza wiedzy dla kolejnych roczników Koła)..."
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans resize-none focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="research-link-input" className="text-xs font-bold text-slate-700 block mb-1">
                      Link do materiałów / ankiety / wydarzenia (opcjonalnie):
                    </label>
                    <input
                      id="research-link-input"
                      name="researchLink"
                      type="url"
                      value={formState.link}
                      onChange={(e) => setFormState({ ...formState, link: e.target.value })}
                      placeholder="https://..."
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}

              {!isProjectLike(formState.type) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="research-status-select" className="text-xs font-bold text-slate-700 block mb-1">Status Realizacji:</label>
                    <select
                      id="research-status-select"
                      name="researchStatus"
                      value={formState.status}
                      onChange={(e) => setFormState({ ...formState, status: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="W toku">◯ W toku</option>
                      <option value="Zakończone">◯ Zakończone</option>
                      <option value="Opublikowane">◯ Opublikowane</option>
                      <option value="W recenzji">◯ W recenzji</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="research-link-input" className="text-xs font-bold text-slate-700 block mb-1">Link DOI / Publikacja:</label>
                    <input
                      id="research-link-input"
                      name="researchLink"
                      type="url"
                      value={formState.link}
                      onChange={(e) => setFormState({ ...formState, link: e.target.value })}
                      placeholder="https://doi.org/10.1234/..."
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="research-description-textarea" className="text-xs font-bold text-slate-700 block mb-1">Opis / Notatka:</label>
                <textarea
                  id="research-description-textarea"
                  name="researchDescription"
                  rows={2}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Krótki opis celu naukowego i wniosków..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans resize-none focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSavingModal}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isSavingModal ? 'bg-emerald-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isSavingModal && <RefreshCw size={14} className="animate-spin text-white" />}
                  <span>{isSavingModal ? 'Zapisywanie...' : 'Zapisz Osiągnięcie'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
