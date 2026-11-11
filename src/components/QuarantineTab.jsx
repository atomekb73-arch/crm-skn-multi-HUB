import { useState, useMemo, useEffect, startTransition } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { showToast } from '../utils/toast';
import {
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Archive,
  RotateCcw,
  CheckSquare,
  Square,
  X,
  Inbox,
  Pencil,
  Filter,
  UserX,
  Mail,
  Send,
  Loader2,
  UserPlus,
  Database,
  AlertCircle,
  Zap,
  FileSpreadsheet,
  Printer,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import { formatPhone, formatEmail } from '../utils/rodoMasking';
import EditMemberModal from './EditMemberModal';
import WelcomeMailModal from './WelcomeMailModal';
import { getAliasesFromStorage, saveAliasesToStorage } from '../utils/storage';
import { initialMembers as seedMembers } from '../data/seedMembers';
import { exportArrayToXlsx } from '../utils/exportToExcel';
import { getAcademicYearFromDate } from '../utils/helpers';
import { getCurrentAcademicYear } from '../utils/academicYear';

function ConsentBadge({ status, ok: propOk }) {
  const ok = propOk !== undefined ? Boolean(propOk) : (status === 'Zgody OK' || status === true);
  const label = status || (ok ? 'Zgody OK' : 'Brak zgód');
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
      ok ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
    }`}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {label}
    </span>
  );
}

function DuplicateBadge({ isDuplicate, existsInManagement, isResignation }) {
  if (isResignation) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs"
        title="Wykryto formalną adnotację REZYGNACJA w zgłoszeniu"
      >
        <UserX size={11} className="text-rose-700" />
        Rezygnacja
      </span>
    );
  }
  if (existsInManagement) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
        title="Osoba o tym samym adresie e-mail lub numerze indeksu znajduje się już na liście Aktywnych Członków w Zarządzaniu"
      >
        <AlertTriangle size={11} className="text-rose-600" />
        ⚠️ Duplikat (Istnieje w Zarządzaniu)
      </span>
    );
  }
  if (isDuplicate) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-help"
        title="Wykryto wielokrotne zgłoszenie tego samego indeksu lub adresu e-mail"
      >
        <AlertTriangle size={11} className="text-amber-600" />
        ⚠️ Duplikat formularza
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
      title="Wniosek unikalny – brak wcześniejszych zgłoszeń w bazie"
    >
      <CheckCircle2 size={11} className="text-emerald-600" />
      ✓ Unikalne
    </span>
  );
}

function formatSubmissionDate(rawTs) {
  if (!rawTs) return '—';

  if (rawTs instanceof Date && !isNaN(rawTs.getTime())) {
    return rawTs.toISOString().split('T')[0];
  }

  const str = String(rawTs).trim();
  if (!str) return '—';

  // 1. Obsługa ISO string z T (np. 2026-10-31T20:14:55.357+00:00)
  if (str.includes('T')) {
    const [datePart] = str.split('T');
    if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }

  // 2. Obsługa stringów z datą i czasem po spacji (np. "2026-10-31 20:14:55" lub "31.10.2026 20:14")
  const spaceParts = str.split(/[\s,]+/);
  if (spaceParts.length >= 1) {
    const candidate = spaceParts[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      return candidate;
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(candidate)) {
      const [d, m, y] = candidate.split('.');
      return `${y}-${m}-${d}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(candidate)) {
      const [d, m, y] = candidate.split('/');
      return `${y}-${m}-${d}`;
    }
  }

  // 3. Fallback przez Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return str;
}

function splitTimestamp(rawTs) {
  return { date: formatSubmissionDate(rawTs), time: '' };
}

export default function QuarantineTab({
  members = [],
  quarantine = [],
  archivedQuarantine = [],
  meetings = [],
  academicYear = getCurrentAcademicYear(),
  onApprove,
  onBulkApprove,
  onArchive,
  onBulkArchive,
  onRestoreArchive,
  onBulkRestoreArchive,
  onPermanentDeleteArchive,
  onSaveMember,
  onAddMember,
  pendingSyncCount = 0,
  onBatchSyncMembers,
}) {
  const { currentOrg } = useOrg() || {};
  const [viewMode, setViewMode] = useState('pending'); // 'pending' | 'archive'
  const [dupeFilter, setDupeFilter] = useState('all'); // 'all' | 'unique' | 'dupes'
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Kopiowanie publicznego linku do formularza dedykowanego dla bieżącego koła
  const handleCopyFormLink = async () => {
    const orgId = currentOrg?.id || 'skn_seksuologii';
    const url = `${window.location.origin}${window.location.pathname}?form=rekrutacja&org=${encodeURIComponent(orgId)}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedLink(true);
      showToast(`Skopiowano link rekrutacyjny dla: ${currentOrg?.shortName || currentOrg?.name || orgId}`);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch (err) {
      console.error('Błąd kopiowania linku do schowka:', err);
    }
  };

  // Modals state
  const [archiveModalEntry, setArchiveModalEntry] = useState(null);
  const [deleteModalEntry, setDeleteModalEntry] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [welcomeMailMember, setWelcomeMailMember] = useState(null);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [newMemberForm, setNewMemberForm] = useState({
    fullName: '',
    index: '',
    email: '',
    phone: '',
    field: 'Psychologia',
    year: '',
    meetAlias: '',
    status: 'active',
    mailingConsent: true,
  });

  // Approval Loading State
  const [approvingIds, setApprovingIds] = useState(new Set());
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

  // ── Ochrona RODO (Privacy by Default & Dynamic Masking - Art. 25 RODO) ─────
  const [rodoProtected, setRodoProtected] = useState(true);
  const [unmaskedContactIds, setUnmaskedContactIds] = useState(() => new Set());
  const [copiedFieldId, setCopiedFieldId] = useState(null);

  const isContactProtected = (contactId) => {
    if (!rodoProtected) return false;
    return !unmaskedContactIds.has(contactId);
  };

  const toggleUnmaskContact = (contactId) => {
    setUnmaskedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const handleCopyText = (text, id) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(String(text));
      setCopiedFieldId(id);
      setTimeout(() => {
        setCopiedFieldId(prev => (prev === id ? null : prev));
      }, 2000);
    } catch (err) {
      console.warn('Nie udało się skopiować tekstu do schowka:', err);
    }
  };

  // Walidacja w czasie rzeczywistym duplikatów dla formularza ręcznego dodawania członka
  const duplicateIndexFound = useMemo(() => {
    const rawIdx = (newMemberForm.index || '').trim();
    const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;
    if (!cleanIdx) return null;

    return (members || []).find(m => {
      const mIdx = String(m.index || m.cleanIndex || m.nrIndeksu || '').replace(/\D/g, '').replace(/^0+/, '').trim();
      return mIdx && mIdx === cleanIdx;
    }) || null;
  }, [newMemberForm.index, members]);

  const duplicateEmailFound = useMemo(() => {
    const cleanEmail = (newMemberForm.email || '').toLowerCase().trim();
    if (!cleanEmail) return null;

    return (members || []).find(m => {
      const mEmail = String(m.email || '').toLowerCase().trim();
      return mEmail && mEmail === cleanEmail;
    }) || null;
  }, [newMemberForm.email, members]);


  // 1. Zbuduj zbiór referencyjny z aktywnych członków Zarządzania (Tryb Tylko do Odczytu)
  const managementKeys = useMemo(() => {
    const emails = new Set();
    const indexes = new Set();

    (members || []).forEach(m => {
      if (m.isArchived || m.status === 'archived') return;
      if (m.email) {
        emails.add(m.email.toLowerCase().trim());
      }
      const rawIdx = String(m.index || '').replace(/\D/g, '').replace(/^0+/, '').trim();
      if (rawIdx) {
        indexes.add(rawIdx);
      }
    });

    return { emails, indexes };
  }, [members]);

  // 2. Weryfikacja duplikatów względem Zarządzania i wewnątrz Kwarantanny (wykluczenie zatwierdzonych członków)
  const evaluatedQuarantine = useMemo(() => {
    const seenEmails = new Set();
    const seenIndexes = new Set();

    return quarantine
      .filter(q => {
        const cleanEmail = q.email ? q.email.toLowerCase().trim() : '';
        const cleanIdx = q.index ? String(q.index).replace(/\D/g, '').replace(/^0+/, '').trim() : '';
        const existsInManagement =
          (cleanEmail && managementKeys.emails.has(cleanEmail)) ||
          (cleanIdx && managementKeys.indexes.has(cleanIdx));
        const isApproved = q.statusWeryfikacji === 'Zatwierdzony' || q.status === 'active' || q.isApproved;
        return !existsInManagement && !isApproved;
      })
      .map(q => {
        const cleanEmail = q.email ? q.email.toLowerCase().trim() : '';
        const cleanIdx = q.index ? String(q.index).replace(/\D/g, '').replace(/^0+/, '').trim() : '';

        const isInternalDupe =
          (cleanEmail && seenEmails.has(cleanEmail)) ||
          (cleanIdx && seenIndexes.has(cleanIdx));

        if (cleanEmail) seenEmails.add(cleanEmail);
        if (cleanIdx) seenIndexes.add(cleanIdx);

        const isDupe = Boolean(q.isDuplicate || isInternalDupe);
        const textForResign = `${q.fullName || ''} ${q.firstName || ''} ${q.lastName || ''} ${q.field || ''} ${q.year || ''} ${q.notes || ''}`.toLowerCase();
        const isResignation = Boolean(q.isResignation || /rezygnacja|rezygn/i.test(textForResign));

        const dateVal = q.timestamp || q.dataWplywu || q.dataWplyniecia || q.date;
        const acadYear = getAcademicYearFromDate(dateVal);

        return {
          ...q,
          isDuplicate: isDupe,
          existsInManagement: false,
          isResignation,
          academicYear: q.academicYear || acadYear.full,
          academicYearShort: q.academicYearShort || acadYear.short,
          academicYearCode: `[${acadYear.short}]`,
          academicYearStart: acadYear.startYear,
        };
      });
  }, [quarantine, managementKeys]);

  const [academicYearFilter, setAcademicYearFilter] = useState(() => academicYear || '2026/2027');

  useEffect(() => {
    if (academicYear) {
      setAcademicYearFilter(academicYear);
    }
  }, [academicYear]);

  const availableYears = useMemo(() => {
    const cur = getCurrentAcademicYear();
    const [start] = cur.split('/').map(Number);
    const prev = `${start - 1}/${start}`;
    const years = new Set([cur, prev]);
    evaluatedQuarantine.forEach(q => {
      if (q.academicYear) years.add(q.academicYear);
    });
    return Array.from(years).sort().reverse();
  }, [evaluatedQuarantine]);

  const pendingCount = evaluatedQuarantine.length;
  const archiveCount = archivedQuarantine.length;

  const duplicateCount = useMemo(
    () => evaluatedQuarantine.filter(q => q.isDuplicate).length,
    [evaluatedQuarantine]
  );

  const resignationCount = useMemo(
    () => evaluatedQuarantine.filter(q => q.isResignation).length,
    [evaluatedQuarantine]
  );

  const validPendingCount = useMemo(
    () => evaluatedQuarantine.filter(q => !q.isDuplicate && !q.isResignation).length,
    [evaluatedQuarantine]
  );

  const filteredQuarantine = useMemo(() => {
    let list = evaluatedQuarantine;
    if (academicYearFilter !== 'all') {
      list = list.filter(q => {
        const qFull = q.academicYear || '';
        const qShort = q.academicYearShort || '';
        return (
          qFull === academicYearFilter ||
          qShort === academicYearFilter ||
          (academicYearFilter === '2026/2027' && (qShort === '26/27' || qFull === '2026/2027')) ||
          (academicYearFilter === '2025/2026' && (qShort === '25/26' || qFull === '2025/2026')) ||
          (academicYearFilter === '26/27' && (qShort === '26/27' || qFull === '2026/2027')) ||
          (academicYearFilter === '25/26' && (qShort === '25/26' || qFull === '2025/2026'))
        );
      });
    }
    if (dupeFilter === 'unique') {
      return list.filter(q => !q.isDuplicate && !q.isResignation);
    }
    if (dupeFilter === 'dupes') {
      return list.filter(q => q.isDuplicate);
    }
    if (dupeFilter === 'resignations') {
      return list.filter(q => q.isResignation);
    }
    return list;
  }, [evaluatedQuarantine, dupeFilter, academicYearFilter]);

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedQuarantine = useMemo(() => {
    if (!sortConfig.key) return filteredQuarantine;
    return [...filteredQuarantine].sort((a, b) => {
      const key = sortConfig.key;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;

      if (key === 'fullName') {
        const aVal = String(a.fullName || '').toLowerCase();
        const bVal = String(b.fullName || '').toLowerCase();
        return aVal.localeCompare(bVal, 'pl') * dir;
      }

      if (key === 'index') {
        const aNum = parseInt(a.index, 10) || 0;
        const bNum = parseInt(b.index, 10) || 0;
        return (aNum - bNum) * dir;
      }

      if (key === 'isDuplicate') {
        const aVal = a.isDuplicate ? 1 : 0;
        const bVal = b.isDuplicate ? 1 : 0;
        return (aVal - bVal) * dir;
      }

      const aVal = String(a[key] || '').toLowerCase();
      const bVal = String(b[key] || '').toLowerCase();
      return aVal.localeCompare(bVal, 'pl') * dir;
    });
  }, [filteredQuarantine, sortConfig]);

  const renderSortIcon = (colKey) => {
    if (sortConfig.key !== colKey) {
      return <ArrowUpDown size={11} className="text-slate-300 opacity-60 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'asc'
      ? <ChevronUp size={12} className="text-indigo-600 font-bold" />
      : <ChevronDown size={12} className="text-indigo-600 font-bold" />;
  };

  const toggleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectArchiveRow = (id) => {
    setSelectedArchiveIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllValid = () => {
    const validIds = evaluatedQuarantine.filter(q => !q.isDuplicate).map(q => q.id);
    const allSelected = validIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !validIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...validIds])));
    }
  };

  const toggleSelectAllArchive = () => {
    if (selectedArchiveIds.length === archivedQuarantine.length) {
      setSelectedArchiveIds([]);
    } else {
      setSelectedArchiveIds(archivedQuarantine.map(a => a.id));
    }
  };

  const allValidSelected = useMemo(() => {
    const validIds = evaluatedQuarantine.filter(q => !q.isDuplicate).map(q => q.id);
    if (validIds.length === 0) return false;
    return validIds.every(id => selectedIds.includes(id));
  }, [evaluatedQuarantine, selectedIds]);

  const handleSingleApprove = async (id) => {
    setApprovingIds(prev => new Set([...prev, id]));
    try {
      if (onApprove) {
        await onApprove(id);
      }
    } finally {
      setApprovingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBulkApproveClick = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkApproving(true);
    try {
      if (onBulkApprove) {
        await onBulkApprove(selectedIds);
      }
      setSelectedIds([]);
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleBulkArchiveClick = () => {
    if (selectedIds.length === 0) return;
    onBulkArchive(selectedIds);
    setSelectedIds([]);
  };

  const handleArchiveAllDuplicates = () => {
    const duplicateIds = evaluatedQuarantine.filter(q => q.isDuplicate).map(q => q.id);
    if (duplicateIds.length === 0) return;
    onBulkArchive(duplicateIds, 'duplicate');
    setSelectedIds(prev => prev.filter(id => !duplicateIds.includes(id)));
  };

  const handleArchiveAllResignations = () => {
    const resignationIds = evaluatedQuarantine.filter(q => q.isResignation).map(q => q.id);
    if (resignationIds.length === 0) return;
    onBulkArchive(resignationIds, 'resignation');
    setSelectedIds(prev => prev.filter(id => !resignationIds.includes(id)));
  };

  const handleConfirmSingleArchive = () => {
    if (!archiveModalEntry) return;
    onArchive(archiveModalEntry.id);
    setArchiveModalEntry(null);
  };

  const handleConfirmSingleDelete = () => {
    if (!deleteModalEntry) return;
    onPermanentDeleteArchive(deleteModalEntry);
    setSelectedArchiveIds(prev => prev.filter(id => id !== deleteModalEntry.id));
    setDeleteModalEntry(null);
  };

  // ── Handler: Zapis nowego członka dodanego ręcznie ─────────────────────────
  const handleSaveNewMember = async (e) => {
    if (e) e.preventDefault();
    if (isAddingMember) return;
    setAddMemberError('');

    const cleanName = String(newMemberForm?.fullName || '').trim();
    const rawIdx = String(newMemberForm?.index || '').trim();
    const cleanIdx = rawIdx.replace(/\D/g, '').replace(/^0+/, '') || rawIdx;

    if (!cleanName) {
      setAddMemberError('Pole Imię i Nazwisko jest wymagane.');
      return;
    }
    if (!cleanIdx) {
      setAddMemberError('Pole Numer Indeksu jest wymagane.');
      return;
    }

    const cleanEmail = String(newMemberForm?.email || '').toLowerCase().trim();

    // 1. Walidacja unikalności numeru indeksu w aktualnej bazie członków
    const existingByIndex = (members || []).find(m => {
      const mIdx = String(m.index || m.cleanIndex || m.nrIndeksu || '').replace(/\D/g, '').replace(/^0+/, '').trim();
      return mIdx && mIdx === cleanIdx;
    });

    if (existingByIndex) {
      const name = existingByIndex.imieNazwisko || existingByIndex.fullName || existingByIndex.firstName || 'Student';
      setAddMemberError(`⚠️ Ten numer indeksu (${cleanIdx}) znajduje się już w bazie danych! Należy do: ${name} (indeks: ${existingByIndex.index || cleanIdx}).`);
      return;
    }

    // 2. Walidacja unikalności adresu email w aktualnej bazie członków
    if (cleanEmail) {
      const existingByEmail = (members || []).find(m => {
        const mEmail = String(m.email || '').toLowerCase().trim();
        return mEmail && mEmail === cleanEmail;
      });

      if (existingByEmail) {
        const name = existingByEmail.imieNazwisko || existingByEmail.fullName || existingByEmail.firstName || 'Student';
        setAddMemberError(`⚠️ Ten adres e-mail (${cleanEmail}) znajduje się już w bazie danych! Należy do: ${name} (indeks: ${existingByEmail.index || existingByEmail.cleanIndex || 'Brak'}).`);
        return;
      }
    }

    setIsAddingMember(true);
    try {
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      const email = String(newMemberForm?.email || '').trim();
      const phone = String(newMemberForm?.phone || '').trim();
      const field = String(newMemberForm?.field || 'Psychologia').trim();
      const year = String(newMemberForm?.year || '').trim();
      const rawAliases = newMemberForm?.meetAlias || newMemberForm?.aliases || '';
      const meetAlias = Array.isArray(rawAliases) ? rawAliases.join(', ').trim() : String(rawAliases || '').trim();
      const status = newMemberForm?.status || 'active';
      const mailingConsent = Boolean(newMemberForm?.mailingConsent);

      const newMemberObj = {
        id: `manual_${cleanIdx}_${Date.now()}`,
        memberKey: `idx_${cleanIdx}`,
        fullName: cleanName,
        imieNazwisko: cleanName,
        name: cleanName,
        firstName,
        lastName,
        index: cleanIdx,
        cleanIndex: cleanIdx,
        nrIndeksu: cleanIdx,
        email,
        phone,
        telefon: phone,
        field,
        kierunek: field && year ? `${field} (${year})` : (field || year),
        year,
        status,
        mailingConsent,
        zgodaMailing: mailingConsent ? 'Zgoda na mailing' : 'Brak zgody',
        zgodaNaMailing: mailingConsent ? 'Zgoda na mailing' : 'Brak zgody',
        consentStatus: mailingConsent ? 'Zgody OK' : 'Brak zgody',
        aliases: meetAlias ? [meetAlias] : [],
        timestamp: new Date().toISOString().slice(0, 10),
        fromSheet: 'Rejestr_Zgloszen',
        points: 0,
        present: 0,
        absent: 0,
        attendancePercent: 0,
        certStatus: 'W toku'
      };

      // 1. Zapisz alias Google Meet jeśli podano
      if (meetAlias) {
        const currentAliases = getAliasesFromStorage() || {};
        currentAliases[meetAlias] = cleanIdx;
        saveAliasesToStorage(currentAliases);
      }

      // 2. Dodaj do stanu CRM i zsynchronizuj atomowo z chmurą
      if (onAddMember) {
        await onAddMember(newMemberObj);
      } else if (onSaveMember) {
        await onSaveMember(newMemberObj);
      }

      // 3. Reset formularza i zamknięcie modala
      setNewMemberForm({
        fullName: '',
        index: '',
        email: '',
        phone: '',
        field: 'Psychologia',
        year: '',
        meetAlias: '',
        status: 'active',
        mailingConsent: true,
      });
      setShowAddMemberModal(false);
    } catch (err) {
      console.error("Błąd podczas dodawania członka:", err);
      setAddMemberError(`Wystąpił błąd: ${err.message || err}`);
    } finally {
      setIsAddingMember(false);
    }
  };

  const formatYear = (field, year) => {
    const f = field || '';
    const y = year || '';
    if (f && y) return `${f} (${y})`;
    if (f) return f;
    if (y) return y;
    return '—';
  };

  // ── Eksport listy zgłoszeń / kwarantanny do pliku Excel (.xlsx) ──────────
  const handleExportQuarantineXlsx = () => {
    const quarantineList = viewMode === 'archive' ? archivedQuarantine : sortedQuarantine;
    const exportData = (Array.isArray(quarantineList) ? quarantineList : []).map((item, idx) => {
      const formattedTs = item?.dataWplyniecia ? formatSubmissionDate(item.dataWplyniecia) : formatSubmissionDate(item?.timestamp || item?.dataWplywu);
      const fullName = item?.studentNazwisko || item?.imieNazwisko || item?.fullName || `${item?.firstName || ''} ${item?.lastName || ''}`.trim() || 'Brak danych';
      const zgodyOk = item?.zgodyOk !== undefined ? Boolean(item.zgodyOk) : (item?.zgody || item?.consentStatus === 'Zgody OK');
      const weryfikacjaLabel = item?.weryfikacja || (
        item?.isResignation
          ? 'Rezygnacja'
          : item?.existsInManagement
          ? 'Duplikat (Istnieje w Zarządzaniu)'
          : item?.isDuplicate
          ? 'Duplikat formularza'
          : 'Unikalne'
      );

      const fieldVal = item?.field || item?.kierunek;
      const yearVal = item?.year || item?.rokStudiow;

      const dateVal = item?.timestamp || item?.dataWplywu || item?.dataWplyniecia || item?.date;
      const acad = (item?.academicYearShort && item?.academicYear)
        ? { full: item.academicYear, short: item.academicYearShort }
        : getAcademicYearFromDate(dateVal);

      return {
        "Lp.": idx + 1,
        "Data wpłynięcia": formattedTs,
        "Rok akademicki": acad.full,
        "Rocznik": `[${acad.short}]`,
        "Student / Imię i Nazwisko": fullName,
        "Adres e-mail": item?.email || '',
        "Numer Indeksu": item?.nrIndeksu || item?.index || item?.cleanIndex || '',
        "Kierunek / Rok": item?.kierunekRok || formatYear(fieldVal, yearVal),
        "Zgody": zgodyOk ? "Zgody OK" : "Brak zgód",
        "Weryfikacja": weryfikacjaLabel
      };
    });
    exportArrayToXlsx(exportData, `SKN_Zgloszenia_Kwarantanna_${new Date().toISOString().slice(0, 10)}`);
  };

  useEffect(() => {
    const handleTriggerExport = () => {
      handleExportQuarantineXlsx();
    };
    window.addEventListener('crm:export-quarantine-xlsx', handleTriggerExport);
    return () => window.removeEventListener('crm:export-quarantine-xlsx', handleTriggerExport);
  }, [handleExportQuarantineXlsx]);

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 sm:space-y-6 relative printable-area">

      {/* ── Official Printable Header for Quarantine (Visible ONLY during print) ── */}
      <div className="hidden print:block mb-3 pb-2 border-b-2 border-slate-900 font-sans">
        <div className="flex items-baseline justify-between">
          <h1 className="text-sm font-bold text-slate-950 uppercase tracking-tight">
            KOŁO NAUKOWE SEKSUOLOGII, WSKZ – WYKAZ ZGŁOSZEŃ (KWARANTANNA)
          </h1>
          <div className="text-[9.5px] text-slate-900 font-bold font-mono">
            Liczba zgłoszeń: {viewMode === 'archive' ? archivedQuarantine.length : sortedQuarantine.length}
          </div>
        </div>
        <div className="text-[9px] text-slate-600 font-medium mt-1">
          Wykaz zgłoszeń rekrutacyjnych | Stan na dzień: {new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      </div>

      {/* ── Edit Member Modal ────────────────────────────────────────────── */}
      <EditMemberModal
        member={editingMember}
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
        allMembers={members}
        meetings={meetings}
        onSave={(updated) => {
          if (onSaveMember) onSaveMember(updated);
        }}
      />

      {/* ── Welcome & Notification Mail Modal ─────────────────────────────── */}
      {Boolean(welcomeMailMember) && (
        <WelcomeMailModal
          key={welcomeMailMember?.id || welcomeMailMember?.nrIndeksu || 'welcome-modal'}
          isOpen={Boolean(welcomeMailMember)}
          onClose={() => setWelcomeMailMember(null)}
          member={welcomeMailMember}
          members={members}
          onApproveMember={(id) => {
            if (onApprove) onApprove(id);
            setWelcomeMailMember(null);
          }}
        />
      )}

      {/* ── Single Archive Confirmation Modal ──────────────────────────────── */}
      {archiveModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Archive size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Odrzucić i przenieść zgłoszenie do Archiwum?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Wniosek kandydata <strong className="font-semibold text-slate-800">{archiveModalEntry.fullName || archiveModalEntry.firstName || 'Kandydat'}</strong> (nr indeksu: <strong className="font-mono text-slate-800">{archiveModalEntry.index || archiveModalEntry.cleanIndex || archiveModalEntry.nrIndeksu || 'Brak'}</strong>) zostanie odrzucony i przeniesiony do podzakładki <strong>Archiwum / Odrzucone</strong>. Decyzja zostanie zarejestrowana w bazie Supabase.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchiveModalEntry(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleArchive}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Odrzuć i przenieś do archiwum
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Permanent Delete Confirmation Modal ────────────────────────────── */}
      {deleteModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Trwale usunąć zgłoszenie?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Rekord studenta <strong className="font-semibold text-slate-800">{deleteModalEntry.fullName || deleteModalEntry.firstName}</strong> zostanie trwale usunięty z bazy archiwum. Ta operacja jest nieodwracalna.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteModalEntry(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleConfirmSingleDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Trwale usuń
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Ręczne dodanie nowego członka koła ──────────────────────── */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-4 sm:p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ręczne dodanie nowego członka koła</h3>
                  <p className="text-[11px] text-slate-500">Zarejestruj studenta bezpośrednio w bazie Supabase CRM</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNewMember} className="space-y-3.5">
              {addMemberError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>{addMemberError}</span>
                </div>
              )}

              {/* ⚠️ Real-time Duplicate Warning Banner for Index */}
              {duplicateIndexFound && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="leading-snug">
                      <span className="font-bold">Ten numer indeksu znajduje się już w bazie danych!</span>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Należy do: <strong className="font-bold text-amber-950">{duplicateIndexFound.imieNazwisko || duplicateIndexFound.fullName || duplicateIndexFound.firstName}</strong> (indeks: <span className="font-mono font-bold text-amber-950">{duplicateIndexFound.index || duplicateIndexFound.cleanIndex || duplicateIndexFound.nrIndeksu}</span>, email: <span className="text-amber-900">{duplicateIndexFound.email || 'Brak'}</span>).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMemberModal(false);
                        setEditingMember(duplicateIndexFound);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                    >
                      <Pencil size={11} />
                      <span>Przejdź do edycji tego studenta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMemberForm(prev => ({ ...prev, index: '' }))}
                      className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-[11px] transition-colors border border-amber-300 cursor-pointer"
                    >
                      Popraw dane
                    </button>
                  </div>
                </div>
              )}

              {/* ⚠️ Real-time Duplicate Warning Banner for Email */}
              {!duplicateIndexFound && duplicateEmailFound && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="leading-snug">
                      <span className="font-bold">Ten adres e-mail znajduje się już w bazie danych!</span>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Należy do: <strong className="font-bold text-amber-950">{duplicateEmailFound.imieNazwisko || duplicateEmailFound.fullName || duplicateEmailFound.firstName}</strong> (indeks: <span className="font-mono font-bold text-amber-950">{duplicateEmailFound.index || duplicateEmailFound.cleanIndex || duplicateEmailFound.nrIndeksu || 'Brak'}</span>, email: <span className="text-amber-900">{duplicateEmailFound.email}</span>).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMemberModal(false);
                        setEditingMember(duplicateEmailFound);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                    >
                      <Pencil size={11} />
                      <span>Przejdź do edycji tego studenta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMemberForm(prev => ({ ...prev, email: '' }))}
                      className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-[11px] transition-colors border border-amber-300 cursor-pointer"
                    >
                      Popraw dane
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Imię i Nazwisko */}
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="manual-member-fullname-input" className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Imię i Nazwisko <span className="text-rose-600">*</span></span>
                  </label>
                  <input
                    id="manual-member-fullname-input"
                    name="newMemberFullName"
                    type="text"
                    required
                    placeholder="np. Jan Kowalski"
                    value={newMemberForm.fullName}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Nr Indeksu */}
                <div className="space-y-1">
                  <label htmlFor="manual-member-index-input" className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Nr Indeksu <span className="text-rose-600">*</span></span>
                    {duplicateIndexFound && (
                      <span className="text-[10px] font-bold text-amber-700">⚠️ Duplikat indeksu</span>
                    )}
                  </label>
                  <input
                    id="manual-member-index-input"
                    name="newMemberIndex"
                    type="text"
                    required
                    placeholder="np. 12345"
                    value={newMemberForm.index}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, index: e.target.value })}
                    className={`w-full px-3 py-2 text-xs font-mono rounded-xl border transition-colors focus:outline-none focus:ring-2 ${
                      duplicateIndexFound
                        ? 'border-amber-400 bg-amber-50/40 text-amber-950 focus:ring-amber-500/20 focus:border-amber-500'
                        : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* Adres Email */}
                <div className="space-y-1">
                  <label htmlFor="manual-member-email-input" className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Adres Email</span>
                    {duplicateEmailFound && (
                      <span className="text-[10px] font-bold text-amber-700">⚠️ Duplikat adresu email</span>
                    )}
                  </label>
                  <input
                    id="manual-member-email-input"
                    name="newMemberEmail"
                    type="email"
                    placeholder="student@example.com"
                    value={newMemberForm.email}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition-colors focus:outline-none focus:ring-2 ${
                      duplicateEmailFound
                        ? 'border-amber-400 bg-amber-50/40 text-amber-950 focus:ring-amber-500/20 focus:border-amber-500'
                        : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* Telefon */}
                <div className="space-y-1">
                  <label htmlFor="manual-member-phone-input" className="text-xs font-bold text-slate-700">Numer Telefonu</label>
                  <input
                    id="manual-member-phone-input"
                    name="newMemberPhone"
                    type="tel"
                    placeholder="+48 123 456 789"
                    value={newMemberForm.phone}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Kierunek */}
                <div className="space-y-1">
                  <label htmlFor="manual-member-field-input" className="text-xs font-bold text-slate-700">Kierunek studiów</label>
                  <input
                    id="manual-member-field-input"
                    name="newMemberField"
                    type="text"
                    placeholder="Psychologia"
                    value={newMemberForm.field}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, field: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Rok / Semestr */}
                <div className="space-y-1">
                  <label htmlFor="manual-member-year-input" className="text-xs font-bold text-slate-700">Rok / Semestr</label>
                  <input
                    id="manual-member-year-input"
                    name="newMemberYear"
                    type="text"
                    placeholder="np. Rok 2, semestr 4"
                    value={newMemberForm.year}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, year: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Alias Google Meet */}
                <div className="space-y-1">
                  <label htmlFor="manual-member-meet-alias-input" className="text-xs font-bold text-slate-700">Pseudonim / Alias Google Meet</label>
                  <input
                    id="manual-member-meet-alias-input"
                    name="newMemberMeetAlias"
                    type="text"
                    placeholder="np. Janek K."
                    value={newMemberForm.meetAlias}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, meetAlias: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Status początkowy */}
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="manual-member-status-select" className="text-xs font-bold text-slate-700">Status początkowy</label>
                  <select
                    id="manual-member-status-select"
                    name="newMemberStatus"
                    value={newMemberForm.status}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, status: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="active">Aktywny (Zatwierdzony członek koła)</option>
                    <option value="guest">Gość (Wolny słuchacz)</option>
                    <option value="resigned">Nieaktywny / Rezygnacja</option>
                  </select>
                </div>

                {/* Zgoda na mailing */}
                <div className="sm:col-span-2 pt-1">
                  <label htmlFor="manual-member-mailing-consent-check" className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      id="manual-member-mailing-consent-check"
                      name="newMemberMailingConsent"
                      type="checkbox"
                      checked={newMemberForm.mailingConsent}
                      onChange={(e) => setNewMemberForm({ ...newMemberForm, mailingConsent: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span className="font-medium">Wyrażona zgoda na komunikację mailingową</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isAddingMember}
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isAddingMember || Boolean(duplicateIndexFound) || Boolean(duplicateEmailFound)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  title={
                    duplicateIndexFound || duplicateEmailFound
                      ? 'Popraw zduplikowane dane przed zapisem'
                      : 'Zapisz nowego członka koła'
                  }
                >
                  {isAddingMember ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Zapisywanie do rejestru...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>Zapisz członka koła</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ── Header View Switcher Tabs ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden no-print">
        
        {/* Primary View Mode Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => startTransition(() => setViewMode('pending'))}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'pending'
                ? 'bg-white text-purple-950 shadow-xs border border-purple-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Inbox size={15} strokeWidth={2.2} />
            <span>Oczekujące zgłoszenia ({pendingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => startTransition(() => setViewMode('archive'))}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'archive'
                ? 'bg-white text-amber-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive size={15} strokeWidth={2.2} />
            <span>Archiwum / Odrzucone ({archiveCount})</span>
          </button>
        </div>

        {/* Global Action Tools: Ręczne dodanie członka oraz link do formularza */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyFormLink}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              copiedLink
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs'
                : 'bg-white hover:bg-purple-50/50 text-purple-800 border border-purple-200 shadow-2xs'
            }`}
            title={`Skopiuj dedykowany link do formularza rekrutacyjnego dla: ${currentOrg?.name || currentOrg?.id || 'SKN'}`}
          >
            {copiedLink ? (
              <>
                <Check size={15} strokeWidth={2.5} className="shrink-0 text-emerald-600 animate-in zoom-in-75 duration-150" />
                <span className="font-bold text-emerald-800">Skopiowano link ({currentOrg?.shortName || currentOrg?.tag || 'SKN'})!</span>
              </>
            ) : (
              <>
                <FileSpreadsheet size={15} strokeWidth={2.2} className="shrink-0 text-purple-600" />
                <span>Kopiuj link rekrutacji ({currentOrg?.shortName || currentOrg?.tag || 'SKN'})</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowAddMemberModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer"
            title="Dodaj ręcznie nowego członka bezpośrednio do bazy CRM i Rejestru Zgłoszeń"
          >
            <UserPlus size={16} strokeWidth={2.2} className="w-4 h-4 shrink-0" />
            <span>Dodaj członka ręcznie</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-3 print:hidden no-print">

        {/* Pending Filters & Action Tools */}
        {viewMode === 'pending' ? (
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Duplicate Filter Segment */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => startTransition(() => setDupeFilter('all'))}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  dupeFilter === 'all' ? 'bg-white text-slate-800 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Wszystkie ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => setDupeFilter('unique'))}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  dupeFilter === 'unique' ? 'bg-white text-emerald-700 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Unikalne ({validPendingCount})
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => setDupeFilter('dupes'))}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  dupeFilter === 'dupes' ? 'bg-white text-amber-700 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Duplikaty ({duplicateCount})
              </button>
              {resignationCount > 0 && (
                <button
                  type="button"
                  onClick={() => startTransition(() => setDupeFilter('resignations'))}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    dupeFilter === 'resignations' ? 'bg-white text-rose-700 font-bold shadow-2xs' : 'text-slate-500 hover:text-rose-700'
                  }`}
                >
                  Rezygnacje ({resignationCount})
                </button>
              )}
            </div>

            {/* Academic Year Filter Segment */}
            <div className="inline-flex items-center bg-purple-50/70 p-1 rounded-xl border border-purple-200/60 text-xs font-medium">
              <button
                type="button"
                onClick={() => startTransition(() => setAcademicYearFilter('all'))}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  academicYearFilter === 'all'
                    ? 'bg-white text-purple-950 font-bold shadow-2xs'
                    : 'text-purple-700 hover:text-purple-950'
                }`}
              >
                Wszystkie lata akademickie
              </button>
              {availableYears.map(yr => {
                const countForYear = evaluatedQuarantine.filter(q =>
                  q.academicYear === yr ||
                  (yr === '2026/2027' && (q.academicYearShort === '26/27' || q.academicYear === '2026/2027')) ||
                  (yr === '2025/2026' && (q.academicYearShort === '25/26' || q.academicYear === '2025/2026'))
                ).length;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => startTransition(() => setAcademicYearFilter(yr))}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                      academicYearFilter === yr
                        ? 'bg-white text-indigo-950 font-bold shadow-2xs'
                        : 'text-indigo-600 hover:text-indigo-950'
                    }`}
                    title={`Filtruj do roku akademickiego ${yr}`}
                  >
                    {yr} ({countForYear})
                  </button>
                );
              })}
            </div>

            {/* Select All Valid */}
            {validPendingCount > 0 && (
              <button
                onClick={toggleSelectAllValid}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-colors border border-indigo-200/60"
              >
                {allValidSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{allValidSelected ? 'Odznacz wszystkie poprawne' : 'Zaznacz wszystkie poprawne'}</span>
              </button>
            )}

            {/* Quick Bulk Archive Duplicates Button */}
            {duplicateCount > 0 && (
              <button
                onClick={handleArchiveAllDuplicates}
                className="text-xs font-semibold text-rose-800 hover:text-rose-950 flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors border border-rose-200 shadow-2xs cursor-pointer"
                title="Przenieś wszystkie wykryte duplikaty do Archiwum Kwarantanny jednym kliknięciem"
              >
                <Archive size={14} strokeWidth={2.2} className="text-rose-600" />
                <span>Przenieś wszystkie duplikaty ({duplicateCount}) do Archiwum</span>
              </button>
            )}

            {/* Quick Bulk Archive Resignations Button */}
            {resignationCount > 0 && (
              <button
                onClick={handleArchiveAllResignations}
                className="text-xs font-semibold text-rose-900 hover:text-rose-950 flex items-center gap-1.5 bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-xl transition-colors border border-rose-300 shadow-2xs cursor-pointer font-bold"
                title="Przenieś wszystkie zgłoszenia z wykrytą rezygnacją do Archiwum jednym kliknięciem"
              >
                <UserX size={14} strokeWidth={2.2} className="text-rose-700" />
                <span>Przenieś rezygnacje ({resignationCount}) do Archiwum</span>
              </button>
            )}
          </div>
        ) : (
          <div className="text-xs font-semibold text-slate-500">
            Archiwum i odrzucone zgłoszenia ({archiveCount})
          </div>
        )}

        {/* Export XLSX & Print Quarantine Buttons (Hidden on Mobile < md, Full on Desktop >= md) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto w-auto">
          {/* Przycisk Ochrony RODO (Privacy by Default) */}
          <button
            type="button"
            onClick={() => {
              setRodoProtected(!rodoProtected);
              setUnmaskedContactIds(new Set());
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer shrink-0 ${
              rodoProtected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs hover:bg-amber-100'
            }`}
            title={rodoProtected ? "Kliknij, aby tymczasowo odkryć pełne dane kontaktowe" : "Kliknij, aby ponownie zamaskować dane"}
          >
            {rodoProtected ? (
              <>
                <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">🔒 Ochrona RODO: Aktywna</span>
                <span className="sm:hidden">🔒 RODO</span>
              </>
            ) : (
              <>
                <Eye size={14} className="text-amber-600 shrink-0" />
                <span className="hidden sm:inline">👁 Odkryj dane (RODO wyłączone)</span>
                <span className="sm:hidden">👁 Odkryte</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportQuarantineXlsx}
            className="p-2 sm:px-3.5 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl sm:rounded-lg shadow-sm transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[36px] sm:min-w-0 h-9 sm:h-auto"
            title="Pobierz listę zgłoszeń do pliku Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span className="hidden sm:inline">Eksportuj XLSX</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="p-2 sm:px-3.5 sm:py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl sm:rounded-lg shadow-sm transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[36px] sm:min-w-0 h-9 sm:h-auto"
            title="Drukuj wykaz zgłoszeń / kwarantanny"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Drukuj zgłoszenia</span>
          </button>
        </div>
      </div>

      {/* ── MODE 1: PENDING QUARANTINE VIEW ───────────────────────────────── */}
      {viewMode === 'pending' && (
        <>
          {/* Bulk Actions Bar */}
          {selectedIds.length >= 1 && (
            <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white rounded-xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 border border-purple-700/50 print:hidden no-print">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="bg-purple-500/30 border border-purple-400/40 text-purple-200 px-2.5 py-1 rounded-full font-bold">
                  Zaznaczono: {selectedIds.length}
                </span>
                <span className="text-slate-300">gotowe do przetworzenia</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkApproveClick}
                  disabled={isBulkApproving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm transition-all border border-purple-400/40"
                >
                  {isBulkApproving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  <span>{isBulkApproving ? 'Zapisywanie...' : `Zatwierdź zaznaczone (${selectedIds.length}) do Zarządzania`}</span>
                </button>

                <button
                  onClick={handleBulkArchiveClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700"
                >
                  <Archive size={13} />
                  Przenieś zaznaczone do Archiwum
                </button>

                <button
                  onClick={() => setSelectedIds([])}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                  title="Odznacz"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="printable-area bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden print:border-none print:shadow-none print:rounded-none">
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabela zgłoszeń i kwarantanny kandydatów"
              className="table-wrapper w-full overflow-x-auto block touch-auto focus:outline-none focus:ring-1 focus:ring-purple-400/50 print:overflow-visible"
            >
              <table className="print-table w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left select-none">
                    {/* 1. Checkbox (Screen) / Lp. (Print: 6%) */}
                    <th className="w-8 sm:w-10 px-1 sm:px-2 py-2.5 text-center print:w-[6%] print:text-center">
                      <input
                        type="checkbox"
                        checked={allValidSelected}
                        onChange={toggleSelectAllValid}
                        className="accent-purple-600 focus:ring-purple-500 w-4 h-4 rounded border-slate-300 cursor-pointer align-middle print:hidden no-print"
                        title="Zaznacz wszystkie poprawne (bez duplikatów)"
                      />
                      <span className="hidden print:inline font-mono">Lp.</span>
                    </th>

                    {/* 2. Data wpłynięcia (Print: 14%) */}
                    <th
                      onClick={() => handleSort('timestamp')}
                      className="hidden md:table-cell w-32 px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:bg-slate-100/80 transition-colors group print:table-cell print:w-[14%] print:min-w-0"
                    >
                      <div className="flex items-center gap-1">
                        <span>Data wpłynięcia</span>
                        <span className="print:hidden no-print">{renderSortIcon('timestamp')}</span>
                      </div>
                    </th>

                    {/* 3. Student / E-mail (Print: 40%) */}
                    <th
                      onClick={() => handleSort('fullName')}
                      className="px-2 sm:px-4 min-w-0 sm:min-w-[200px] py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:bg-slate-100/80 transition-colors group print:w-[40%] print:min-w-0"
                    >
                      <div className="flex items-center gap-1">
                        <span>Student / E-mail</span>
                        <span className="print:hidden no-print">{renderSortIcon('fullName')}</span>
                      </div>
                    </th>

                    {/* 4. Nr Indeksu (Print: 15%) */}
                    <th
                      onClick={() => handleSort('index')}
                      className="w-16 sm:w-28 px-1 sm:px-2 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:bg-slate-100/80 transition-colors group print:w-[15%] print:min-w-0 print:text-center"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Indeks</span>
                        <span className="print:hidden no-print">{renderSortIcon('index')}</span>
                      </div>
                    </th>

                    {/* 5. Kierunek / Rok (Print: 25%) */}
                    <th
                      onClick={() => handleSort('field')}
                      className="hidden lg:table-cell px-3 min-w-[160px] py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:bg-slate-100/80 transition-colors group print:table-cell print:w-[25%] print:min-w-0"
                    >
                      <div className="flex items-center gap-1">
                        <span>Kierunek / Rok</span>
                        <span className="print:hidden no-print">{renderSortIcon('field')}</span>
                      </div>
                    </th>

                    {/* Hidden on Print: Zgody */}
                    <th className="hidden xl:table-cell w-28 px-2 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide print:hidden no-print">
                      Zgody
                    </th>

                    {/* Hidden on Print: Weryfikacja */}
                    <th
                      onClick={() => handleSort('isDuplicate')}
                      className="hidden sm:table-cell w-28 sm:w-32 px-2 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:bg-slate-100/80 transition-colors group print:hidden no-print"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Weryfikacja</span>
                        {renderSortIcon('isDuplicate')}
                      </div>
                    </th>

                    {/* Hidden on Print: Akcja */}
                    <th className="w-24 sm:w-48 px-2 sm:px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right whitespace-nowrap print:hidden no-print">
                      Akcja
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedQuarantine.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                        <UserCheck size={32} className="mx-auto mb-2 text-slate-300 print:hidden" />
                        {dupeFilter === 'dupes'
                          ? 'Brak duplikatów w Kwarantannie'
                          : dupeFilter === 'unique'
                          ? 'Brak unikalnych zgłoszeń w Kwarantannie'
                          : 'Wszystkie zgłoszenia zostały przetworzone'}
                      </td>
                    </tr>
                  )}
                  {sortedQuarantine.map((q, idx) => {
                    const name = q.fullName || q.imieNazwisko || `${q.firstName || ''} ${q.lastName || ''}`.trim() || 'Brak danych';
                    const ts = splitTimestamp(q.timestamp || q.dataWplywu);
                    const isSelected = selectedIds.includes(q.id);

                    return (
                      <tr
                        key={q.id}
                        style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                        className={`hover:bg-slate-50/70 transition-colors print:bg-white print:break-inside-avoid ${
                          isSelected ? 'bg-purple-50/60' : q.isDuplicate ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* 1. Checkbox (Screen) / Lp. (Print: 6%) */}
                        <td className="w-8 sm:w-10 px-1 sm:px-2 py-2.5 text-center align-middle print:w-[6%] print:text-center print:font-mono">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(q.id)}
                            className="accent-purple-600 focus:ring-purple-500 w-4 h-4 rounded border-slate-300 cursor-pointer align-middle print:hidden no-print"
                          />
                          <span className="hidden print:inline font-mono">{idx + 1}</span>
                        </td>

                        {/* 2. Data wpłynięcia (Print: 14%) */}
                        <td className="hidden md:table-cell px-3 py-2.5 align-middle text-left whitespace-nowrap print:table-cell print:w-[14%] print:min-w-0 print:whitespace-normal">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-700 text-xs leading-tight font-mono print:text-[8pt] print:text-slate-900">
                              {formatSubmissionDate(q.timestamp || q.dataWplywu)}
                            </span>
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                              {q.academicYear || '2026/2027'}
                            </span>
                          </div>
                        </td>

                        {/* 3. Student / E-mail (Print: 40%) */}
                        <td className="px-2 sm:px-4 py-2.5 align-middle text-left min-w-0 sm:min-w-[200px] print:w-[40%] print:min-w-0 print:whitespace-normal">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs truncate print:whitespace-normal print:overflow-visible print:text-[8pt] print:text-slate-900" title={name}>
                            <span>{name}</span>
                            <button
                              onClick={() => setEditingMember(q)}
                              className="text-slate-400 hover:text-purple-600 p-0.5 rounded transition print:hidden no-print"
                              title="Edytuj dane studenta"
                            >
                              <Pencil size={13} strokeWidth={2.2} />
                            </button>
                          </div>
                          {/* Dane kontaktowe (E-mail i Telefon) z dynamicznym maskowaniem RODO */}
                          {(q.email || q.phone || q.telefon) && (
                            <div className="print-subtext hidden sm:flex items-center gap-2 mt-0.5 flex-wrap print:whitespace-normal print:overflow-visible">
                              {q.email && (
                                <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-normal">
                                  <a
                                    href={`mailto:${q.email}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="hover:text-purple-700 hover:underline transition-colors"
                                    title={isContactProtected(q.id) ? "Adres e-mail zamaskowany (RODO). Kliknij oko, aby podejrzeć." : q.email}
                                  >
                                    {formatEmail(q.email, isContactProtected(q.id))}
                                  </a>
                                  {rodoProtected && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleUnmaskContact(q.id);
                                      }}
                                      title={isContactProtected(q.id) ? "Odkryj dane tego kandydata" : "Zamaskuj dane tego kandydata"}
                                      className="p-0.5 text-slate-400 hover:text-purple-700 transition cursor-pointer print:hidden no-print"
                                    >
                                      {isContactProtected(q.id) ? <Eye size={12} /> : <EyeOff size={12} className="text-amber-600" />}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyText(q.email, `q_email_${q.id}`);
                                    }}
                                    title="Kopiuj pełny e-mail do schowka"
                                    className="p-0.5 text-slate-400 hover:text-slate-700 transition cursor-pointer print:hidden no-print"
                                  >
                                    {copiedFieldId === `q_email_${q.id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                  </button>
                                </div>
                              )}

                              {(q.phone || q.telefon) && (
                                <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                                  {q.email && <span className="text-slate-300 print:hidden">·</span>}
                                  <a
                                    href={`tel:${String(q.phone || q.telefon).replace(/\s+/g, '')}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="hover:text-purple-700 hover:underline transition-colors"
                                    title={isContactProtected(q.id) ? "Numer telefonu zamaskowany (RODO). Kliknij oko, aby podejrzeć." : (q.phone || q.telefon)}
                                  >
                                    {formatPhone(q.phone || q.telefon, isContactProtected(q.id))}
                                  </a>
                                  {rodoProtected && !q.email && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleUnmaskContact(q.id);
                                      }}
                                      title={isContactProtected(q.id) ? "Odkryj dane tego kandydata" : "Zamaskuj dane tego kandydata"}
                                      className="p-0.5 text-slate-400 hover:text-purple-700 transition cursor-pointer print:hidden no-print"
                                    >
                                      {isContactProtected(q.id) ? <Eye size={12} /> : <EyeOff size={12} className="text-amber-600" />}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyText(q.phone || q.telefon, `q_phone_${q.id}`);
                                    }}
                                    title="Kopiuj pełny numer telefonu do schowka"
                                    className="p-0.5 text-slate-400 hover:text-slate-700 transition cursor-pointer print:hidden no-print"
                                  >
                                    {copiedFieldId === `q_phone_${q.id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Nr Indeksu (Print: 15%) */}
                        <td className="w-16 sm:w-28 px-1 sm:px-2 py-2.5 text-slate-700 font-mono font-medium text-xs align-middle text-center print:w-[15%] print:min-w-0 print:text-center print:font-bold print:text-slate-900">
                          {(q.index || q.nrIndeksu || q.cleanIndex) ? (
                            (q.index || q.nrIndeksu || q.cleanIndex)
                          ) : (
                            <>
                              <button
                                onClick={() => setEditingMember(q)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors shadow-2xs print:hidden no-print"
                                title="Brak numeru indeksu! Kliknij, aby uzupełnić."
                              >
                                <AlertTriangle size={12} strokeWidth={2.2} className="text-amber-600" /> Brak (Uzupełnij)
                              </button>
                              <span className="hidden print:inline">—</span>
                            </>
                          )}
                        </td>

                        {/* 5. Kierunek / Rok (Print: 25%) */}
                        <td className="hidden lg:table-cell px-3 py-2.5 text-xs text-slate-600 whitespace-normal break-words leading-snug align-middle text-left min-w-[160px] print:table-cell print:w-[25%] print:min-w-0 print:text-[8pt] print:text-slate-900">
                          <div className="font-medium text-slate-900 print:text-[8pt]">{q.field || q.kierunek || '—'}</div>
                          {(q.year || q.rokStudiow) && (
                            <div className="print-subtext text-[11px] text-slate-500 mt-0.5">{q.year || q.rokStudiow}</div>
                          )}
                        </td>

                        {/* Hidden on Print: Zgody */}
                        <td className="hidden xl:table-cell px-2 py-2.5 align-middle text-center print:hidden no-print">
                          <ConsentBadge status={q.consentStatus} ok={q.zgodyOk || q.zgody || q.consentStatus === 'Zgody OK'} />
                        </td>

                        {/* Hidden on Print: Weryfikacja */}
                        <td className="hidden sm:table-cell px-2 py-2.5 align-middle text-center print:hidden no-print">
                          <DuplicateBadge isDuplicate={q.isDuplicate} existsInManagement={q.existsInManagement} isResignation={q.isResignation} />
                        </td>

                        {/* Hidden on Print: Akcja */}
                        <td className="px-2 sm:px-3 py-2.5 align-middle text-right whitespace-nowrap w-24 sm:w-56 print:hidden no-print">
                          <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                            <button
                              onClick={() => setEditingMember(q)}
                              className="p-1.5 text-slate-500 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition cursor-pointer"
                              title="Edytuj dane weryfikacyjne"
                            >
                              <Pencil size={15} strokeWidth={2.2} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setWelcomeMailMember(q)}
                              className="inline-flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200/80 text-xs font-semibold p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg shadow-2xs transition cursor-pointer"
                              title="Wyślij powitanie / potwierdzenie i zarejestruj w Ewidencja_Poczty"
                            >
                              <Mail size={15} strokeWidth={2.2} className="text-purple-600" />
                              <span className="hidden md:inline">Powitanie</span>
                            </button>

                            {(() => {
                              const isApproving = approvingIds.has(q.id);
                              return (
                                <button
                                  onClick={() => handleSingleApprove(q.id)}
                                  disabled={isApproving}
                                  className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg shadow-xs transition cursor-pointer"
                                  title="Zatwierdź studenta do widoku Zarządzania"
                                >
                                  {isApproving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} strokeWidth={2.2} />}
                                  <span className="hidden sm:inline">{isApproving ? 'Zapisywanie...' : 'Zatwierdź'}</span>
                                </button>
                              );
                            })()}

                            <button
                              type="button"
                              onClick={() => setArchiveModalEntry(q)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="Odrzuć wniosek i przenieś do Archiwum"
                            >
                              <Trash2 size={16} strokeWidth={2.2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── MODE 2: ARCHIVE TABLE VIEW ────────────────────────────────────── */}
      {viewMode === 'archive' && (
        <div className="space-y-3 printable-area">
          {/* Archive Bulk Bar */}
          {selectedArchiveIds.length >= 1 && (
            <div className="bg-slate-900 text-white rounded-xl p-3 shadow-lg flex items-center justify-between gap-3 text-xs print:hidden no-print">
              <span className="font-semibold text-amber-400">
                Zaznaczono w archiwum: {selectedArchiveIds.length}
              </span>
              <button
                onClick={() => {
                  onBulkRestoreArchive(selectedArchiveIds);
                  setSelectedArchiveIds([]);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold transition-all"
              >
                <RotateCcw size={13} />
                Przywróć zaznaczone ({selectedArchiveIds.length}) do Kwarantanny
              </button>
            </div>
          )}

          <div className="printable-area bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabela zarchiwizowanych zgłoszeń"
              className="table-wrapper w-full overflow-x-auto block touch-auto focus:outline-none focus:ring-1 focus:ring-indigo-400/50 print:overflow-visible"
            >
              <table className="print-table w-full text-sm table-fixed border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left select-none">
                  <th className="w-8 sm:w-10 px-1 sm:px-3 py-2.5 text-center print:w-[6%] print:text-center">
                    <input
                      type="checkbox"
                      checked={selectedArchiveIds.length > 0 && selectedArchiveIds.length === archivedQuarantine.length}
                      onChange={toggleSelectAllArchive}
                      className="accent-amber-600 focus:ring-amber-500 w-4 h-4 rounded border-slate-300 cursor-pointer print:hidden no-print"
                    />
                    <span className="hidden print:inline font-mono">Lp.</span>
                  </th>
                  <th className="hidden md:table-cell w-32 px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase print:table-cell print:w-[14%] print:min-w-0">Data wpłynięcia</th>
                  <th className="w-auto min-w-0 px-2 sm:px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase print:w-[40%] print:min-w-0">Student / E-mail</th>
                  <th className="w-16 sm:w-28 px-1 sm:px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase text-center print:w-[15%] print:min-w-0 print:text-center">Indeks</th>
                  <th className="hidden lg:table-cell w-44 px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase print:table-cell print:w-[25%] print:min-w-0">Kierunek / Rok</th>
                  <th className="w-20 sm:w-36 px-2 sm:px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase text-right print:hidden no-print">Akcja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedQuarantine.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      <Archive size={32} className="mx-auto mb-2 text-slate-300 print:hidden" />
                      Archiwum jest puste
                    </td>
                  </tr>
                )}
                {archivedQuarantine.map((a, idx) => {
                  const ts = splitTimestamp(a.timestamp);
                  const isSel = selectedArchiveIds.includes(a.id);
                  return (
                    <tr
                      key={a.id}
                      style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                      className="hover:bg-slate-50/70 transition-colors bg-slate-50/30 print:bg-white print:break-inside-avoid"
                    >
                      <td className="w-8 sm:w-10 px-1 sm:px-3 py-2.5 text-center align-middle print:w-[6%] print:text-center print:font-mono">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelectArchiveRow(a.id)}
                          className="accent-amber-600 focus:ring-amber-500 w-4 h-4 rounded border-slate-300 cursor-pointer print:hidden no-print"
                        />
                        <span className="hidden print:inline font-mono">{idx + 1}</span>
                      </td>
                      <td className="hidden md:table-cell px-3 py-2.5 align-middle text-left whitespace-nowrap print:table-cell print:w-[14%] print:min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs text-slate-600">{ts.date}</span>
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                            {a.academicYear || '2026/2027'}
                          </span>
                        </div>
                      </td>
                      <td className="w-auto min-w-0 px-2 sm:px-3 py-2.5 align-middle text-left print:w-[40%] print:min-w-0 print:whitespace-normal">
                        <div className="font-semibold text-slate-800 text-xs truncate print:whitespace-normal print:overflow-visible print:text-[8pt]">{a.fullName}</div>
                        {(a.email || a.phone || a.telefon) && (
                          <div className="print-subtext hidden sm:flex items-center gap-2 mt-0.5 flex-wrap print:whitespace-normal print:overflow-visible">
                            {a.email && (
                              <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-normal">
                                <span>{formatEmail(a.email, isContactProtected(a.id))}</span>
                                {rodoProtected && (
                                  <button
                                    type="button"
                                    onClick={() => toggleUnmaskContact(a.id)}
                                    title={isContactProtected(a.id) ? "Odkryj dane tego zgłoszenia" : "Zamaskuj dane tego zgłoszenia"}
                                    className="p-0.5 text-slate-400 hover:text-amber-700 transition cursor-pointer print:hidden no-print"
                                  >
                                    {isContactProtected(a.id) ? <Eye size={12} /> : <EyeOff size={12} className="text-amber-600" />}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(a.email, `arch_email_${a.id}`)}
                                  title="Kopiuj pełny e-mail"
                                  className="p-0.5 text-slate-400 hover:text-slate-700 transition cursor-pointer print:hidden no-print"
                                >
                                  {copiedFieldId === `arch_email_${a.id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="w-16 sm:w-28 px-1 sm:px-3 py-2.5 font-mono text-xs text-slate-600 align-middle text-center print:w-[15%] print:min-w-0 print:text-center">{a.index || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-xs text-slate-600 align-middle print:table-cell print:w-[25%] print:min-w-0 print:whitespace-normal">{a.kierunekRok || formatYear(a.field || a.kierunek, a.year || a.rokStudiow)}</td>
                      <td className="w-20 sm:w-36 px-2 sm:px-3 py-2.5 text-right align-middle whitespace-nowrap print:hidden no-print">
                        <div className="inline-flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => {
                              onRestoreArchive(a);
                              setSelectedArchiveIds(prev => prev.filter(id => id !== a.id));
                            }}
                            className="inline-flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 transition-colors cursor-pointer"
                            title="Przywróć zgłoszenie z archiwum"
                          >
                            <RotateCcw size={14} strokeWidth={2.2} />
                            <span className="hidden sm:inline">Przywróć</span>
                          </button>
                          <button
                            onClick={() => {
                              onPermanentDeleteArchive(a);
                              setSelectedArchiveIds(prev => prev.filter(id => id !== a.id));
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            title="Trwale usuń z bazy danych"
                          >
                            <Trash2 size={16} strokeWidth={2.2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
