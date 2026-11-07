import React, { useState, useEffect, useMemo, useRef } from 'react';
import { showToast } from '../utils/toast';
import {
  FolderKanban,
  FileText,
  ExternalLink,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Archive,
  Edit3,
  Trash2,
  X,
  FileCheck,
  HardDrive,
  Calendar,
  ShieldCheck,
  Download,
  FolderOpen,
  Link,
  Sparkles,
  Mail,
  Send,
  Inbox,
  AlertTriangle,
  Printer,
  Copy,
  Check,
  Eye,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  Zap,
} from 'lucide-react';
import { useOrg } from '../context/OrgContext';
import {
  getCorrespondenceLog,
  addCorrespondenceEntry,
  updateCorrespondenceEntry,
  deleteCorrespondenceEntry,
  sanitizeCorrespondenceEntries,
  setOrgStorage,
} from '../utils/storage';
import {
  parseRawEmailText,
  checkDuplicateCorrespondence,
} from '../utils/helpers';
import {
  fetchMailRegistryFromSheet,
  formatCorrespondenceForSheet,
  MAIL_REGISTRY_TAB,
  registerCorrespondenceToGAS,
  batchRegisterCorrespondenceToGAS,
  updateCorrespondenceStatusInGAS,
  deleteCorrespondenceFromGAS,
  registerDocumentActToGAS,
  batchRegisterDocumentActsToGAS,
  deleteDocumentActFromGAS,
} from '../services/googleSheets';
import {
  OfficialCorrespondenceProtocolTemplate,
  getOrgMetadata,
  getActiveSupervisors,
  formatSupervisorName,
} from './DocumentTemplates';
import { getStoredSupervisors } from '../utils/specialRoles';
import { useSettings } from '../context/SettingsContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import { getCurrentAcademicYear } from '../utils/academicYear';
import WelcomeMailModal from './WelcomeMailModal';

export function extractGoogleDriveFileId(url) {
  if (!url) return null;
  const str = String(url).trim();
  const fileMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const docMatch = str.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return docMatch[1];
  const sheetMatch = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) return sheetMatch[1];
  const idMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  const directMatch = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (directMatch) return directMatch[1];
  const folderMatch = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return null;
}

export function DocumentPreviewModal({ isOpen, onClose, documentTitle, documentCode, driveUrl }) {
  if (!isOpen) return null;
  const fileId = extractGoogleDriveFileId(driveUrl);
  const isFolder = driveUrl && driveUrl.includes('/folders/');
  const previewSrc = fileId
    ? `https://drive.google.com/file/d/${fileId}/preview`
    : (driveUrl || '');

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-150 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Eye size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-300">
                  {documentCode || 'DOKUMENT'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white truncate max-w-xl">
                {documentTitle || 'Podgląd dokumentu'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                title="Otwórz plik bezpośrednio na Dysku Google"
              >
                <span>Otwórz w pełnym oknie</span>
                <ExternalLink size={13} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Zamknij podgląd"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / Iframe */}
        <div className="flex-1 bg-slate-100 p-2 sm:p-4 overflow-hidden flex flex-col">
          {fileId && !isFolder ? (
            <iframe
              src={previewSrc}
              title={documentTitle || 'Podgląd pliku'}
              className="w-full flex-1 rounded-2xl bg-white border border-slate-200 shadow-inner"
              allow="autoplay"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-4 shadow-inner">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <HardDrive size={28} />
              </div>
              <div className="max-w-md space-y-1">
                <h4 className="text-sm font-bold text-slate-900">Katalog lub link zewnętrzny Google Drive</h4>
                <p className="text-xs text-slate-500 font-mono break-all">{driveUrl || 'Brak podanego adresu URL'}</p>
              </div>
              {driveUrl && (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-2 shadow-sm transition"
                >
                  <ExternalLink size={14} />
                  <span>Przejdź do folderu / pliku na Dysku Google</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_DOCUMENTS_SKNU = [];
const DEFAULT_DOCUMENTS_SEKSUOLOGIA = [];

const CATEGORIES = [
  'Wszystkie',
  'Uchwały Zarządu',
  'Protokoły Zebrań',
  'Regulaminy i Statut',
  'Wnioski i Granty',
];

export default function DocumentsRepositoryTab() {
  const { currentOrg, getStorageKey } = useOrg();
  const { driveFolderUrl } = useSettings();
  const { academicYear } = useAcademicYear();

  // Storage Keys for Documents & Google Drive URL
  const docsStorageKey = getStorageKey('documents');
  const gdriveStorageKey = getStorageKey('gdrive_url');

  // Documents state
  const [documents, setDocuments] = useState(() => {
    try {
      const saved = localStorage.getItem(docsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Błąd odczytu dokumentów z storage:', e);
    }

    if (currentOrg?.id === 'test') {
      return [
        {
          id: 'test-doc-01',
          code: 'UCH/SKN-TEST/01/2025',
          title: 'Uchwała Zarządu nr 1/2025 w sprawie przyjęcia planu pracy naukowej na rok 2025/2026',
          category: 'Uchwały Zarządu',
          date: '2025-10-15',
          status: 'Zatwierdzony',
          driveUrl: '',
          author: 'Zarząd Koła Naukowego',
          organization_id: 'test'
        },
        {
          id: 'test-doc-02',
          code: 'PROT/SKN-TEST/01/2025',
          title: 'Protokół z Walnego Zebrania Wyborczego Członków Koła Testowego',
          category: 'Protokoły Zebrań',
          date: '2025-10-20',
          status: 'Zatwierdzony',
          driveUrl: '',
          author: 'Piotr Wiśniewski (Sekretarz)',
          organization_id: 'test'
        },
        {
          id: 'test-doc-03',
          code: 'REG/SKN-TEST/2025',
          title: 'Regulamin Wewnętrzny i Kryteria Oceny Dorobku Naukowego Koła',
          category: 'Regulaminy i Statut',
          date: '2025-11-02',
          status: 'Obowiązujący',
          driveUrl: '',
          author: 'Zarząd i Opiekun Koła',
          organization_id: 'test'
        },
        {
          id: 'test-doc-04',
          code: 'WNIO/SKN-TEST/01/2026',
          title: 'Wniosek o dofinansowanie udziału członków w Ogólnopolskim Zjeździe Kół Naukowych',
          category: 'Wnioski i Granty',
          date: '2026-02-10',
          status: 'Rozpatrzony pozytywnie',
          driveUrl: '',
          author: 'Jan Kowalski (Przewodniczący)',
          organization_id: 'test'
        }
      ];
    }
    return [];
  });

  // Google Drive URL state
  const [gdriveUrl, setGdriveUrl] = useState(() => {
    try {
      const saved = localStorage.getItem(gdriveStorageKey);
      if (saved) return saved;
    } catch {}
    if (currentOrg.sheetId) {
      return `https://drive.google.com/drive/folders/${currentOrg.sheetId}`;
    }
    return '';
  });

  // Statut config state
  const statutConfigStorageKey = getStorageKey('statute_config');
  const [statutConfig, setStatutConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(statutConfigStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      url: currentOrg.sheetId
        ? `https://docs.google.com/spreadsheets/d/${currentOrg.sheetId}/edit`
        : '',
      status: 'W przygotowaniu',
      description: `Oficjalny regulamin określający strukturę, cele naukowe oraz prawa członków ${currentOrg.shortName || currentOrg.name}.`,
    };
  });

  // Re-sync documents when organization switches
  useEffect(() => {
    try {
      const savedDocs = localStorage.getItem(docsStorageKey);
      if (savedDocs) {
        setDocuments(JSON.parse(savedDocs));
      } else {
        setDocuments([]);
        localStorage.setItem(docsStorageKey, JSON.stringify([]));
      }

      const savedDrive = localStorage.getItem(gdriveStorageKey);
      if (savedDrive) {
        setGdriveUrl(savedDrive);
      } else {
        const defaultDrive = currentOrg.sheetId
          ? `https://drive.google.com/drive/folders/${currentOrg.sheetId}`
          : '';
        setGdriveUrl(defaultDrive);
      }

      const savedStatut = localStorage.getItem(statutConfigStorageKey);
      if (savedStatut) {
        setStatutConfig(JSON.parse(savedStatut));
      } else {
        const defaultStatutConfig = {
          url: currentOrg.sheetId
            ? `https://docs.google.com/spreadsheets/d/${currentOrg.sheetId}/edit`
            : '',
          status: currentOrg.id === 'skn-psychoonkologia' ? 'W przygotowaniu' : 'Zatwierdzony przez Władze WSKZ',
          description: `Oficjalny regulamin określający strukturę, cele naukowe oraz prawa członków ${currentOrg.shortName || currentOrg.name}.`,
        };
        setStatutConfig(defaultStatutConfig);
      }
    } catch (err) {
      console.error('Błąd przy przełączaniu koła w repozytorium:', err);
    }
  }, [currentOrg.id, currentOrg.sheetId, docsStorageKey, gdriveStorageKey, statutConfigStorageKey]);

  // Save documents state to localStorage
  const saveDocuments = (newDocs) => {
    setDocuments(newDocs);
    try {
      localStorage.setItem(docsStorageKey, JSON.stringify(newDocs));
    } catch (e) {
      console.error('Błąd zapisu dokumentów:', e);
    }
  };

  // ── Supervisors Context ───────────────────────────────────────────────────
  const { supervisors: contextSupervisors } = useSettings() || {};
  const supervisors = contextSupervisors && contextSupervisors.length > 0
    ? contextSupervisors
    : getStoredSupervisors();

  // ── Module View Switch (Repozytorium vs Dziennik Podawczy) ────────────────
  const [activeModuleTab, setActiveModuleTab] = useState('repository'); // 'repository' | 'correspondence'

  // ── Resizable Sidebar State (clamped min/max, persistent in localStorage) ──
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_docs_sidebar_width');
      if (saved) return saved;
    }
    return '270px';
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarContainerRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const screenWidth = window.innerWidth;
      const containerLeft = sidebarContainerRef.current ? sidebarContainerRef.current.getBoundingClientRect().left : 0;
      const newWidthPx = containerLeft > 0 ? (e.clientX - containerLeft) : e.clientX;

      const minAllowed = Math.max(210, screenWidth * 0.12);
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
        localStorage.setItem('crm_docs_sidebar_width', sidebarWidth);
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

  // ── Correspondence Log State ──────────────────────────────────────────────
  const [correspondenceLog, setCorrespondenceLog] = useState(() => getCorrespondenceLog(currentOrg?.id || 'skn-psychoonkologia'));
  const [correspondenceFilter, setCorrespondenceFilter] = useState('all'); // 'all' | 'IN' | 'OUT'
  const [correspondenceSearch, setCorrespondenceSearch] = useState('');
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [isWelcomeMailModalOpen, setIsWelcomeMailModalOpen] = useState(false);
  const [mailModalTab, setMailModalTab] = useState('parser'); // 'parser' | 'form'
  const [rawMailText, setRawMailText] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [viewingMailEntry, setViewingMailEntry] = useState(null);
  const [isPrintingCorrespondence, setIsPrintingCorrespondence] = useState(false);

  const [mailForm, setMailForm] = useState({
    id: '',
    direction: 'IN',
    date: '2026-03-17',
    dataWplywu: '2026-03-17',
    sender: '',
    recipient: '',
    subject: '',
    summary: '',
    status: 'W toku',
    driveLink: '',
    hash: '',
  });

  const [isSavingMail, setIsSavingMail] = useState(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [mailToast, setMailToast] = useState(null);

  const handleUpdateMailStatus = async (entryId, newStatus) => {
    const orgId = currentOrg?.id || 'skn_seksuologii';
    const now = new Date();
    const nowFormatted = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    const updated = updateCorrespondenceEntry(orgId, entryId, { status: newStatus, dataAktualizacji: nowFormatted });
    if (updated) {
      setCorrespondenceLog(updated);
      if (viewingMailEntry && viewingMailEntry.id === entryId) {
        setViewingMailEntry(prev => ({ ...prev, status: newStatus, dataAktualizacji: nowFormatted }));
      }
    }
    setMailToast({
      type: 'info',
      message: `Zaktualizowano status pisma „${entryId}” na „${newStatus}”. Zapisywanie w Google Sheets...`
    });
    try {
      await updateCorrespondenceStatusInGAS(entryId, newStatus, orgId);
      setMailToast({
        type: 'success',
        message: `Status pisma „${entryId}” (${newStatus}) został pomyślnie zaktualizowany w arkuszu Google Sheets.`
      });
    } catch (err) {
      console.warn('[GAS] Błąd synchronizacji zmiany statusu pisma:', err);
      setMailToast({
        type: 'error',
        message: `Zaktualizowano lokalnie. Błąd synchronizacji z Google Sheets: ${err.message || 'Brak połączenia'}`
      });
    } finally {
      setTimeout(() => setMailToast(null), 5000);
    }
  };

  useEffect(() => {
    if (currentOrg?.id) {
      setCorrespondenceLog(getCorrespondenceLog(currentOrg.id));
    }
  }, [currentOrg?.id]);

  const filteredCorrespondence = useMemo(() => {
    return correspondenceLog.filter((item) => {
      if (!item) return false;
      const matchesDirection = correspondenceFilter === 'all' || item.direction === correspondenceFilter;
      if (!matchesDirection) return false;

      if (!correspondenceSearch.trim()) return true;
      const q = correspondenceSearch.toLowerCase().trim();
      return (
        String(item.id || '').toLowerCase().includes(q) ||
        String(item.sender || '').toLowerCase().includes(q) ||
        String(item.recipient || '').toLowerCase().includes(q) ||
        String(item.subject || '').toLowerCase().includes(q) ||
        String(item.summary || '').toLowerCase().includes(q)
      );
    });
  }, [correspondenceLog, correspondenceFilter, correspondenceSearch]);

  const [isSyncingMailSheet, setIsSyncingMailSheet] = useState(false);
  const [mailSyncStatus, setMailSyncStatus] = useState(null);
  const [copiedSheetData, setCopiedSheetData] = useState(false);

  // ── Sync with Google Sheets dedicated tab "Dziennik_Korespondencji" ─────────
  const handleSyncMailSheet = async () => {
    setIsSyncingMailSheet(true);
    setMailSyncStatus(null);
    try {
      const res = await fetchMailRegistryFromSheet(currentOrg?.sheetId);
      if (res.ok) {
        const cleanIncoming = sanitizeCorrespondenceEntries(res.entries || []);
        const orgId = currentOrg?.id || 'skn_seksuologii';
        const current = sanitizeCorrespondenceEntries(getCorrespondenceLog(orgId));

        if (cleanIncoming.length > 0) {
          const merged = [...current];
          let addedCount = 0;
          cleanIncoming.forEach((entry) => {
            const idx = merged.findIndex((e) => e.id === entry.id || (e.hash && e.hash === entry.hash));
            if (idx === -1) {
              merged.push(entry);
              addedCount++;
            } else {
              merged[idx] = { ...merged[idx], ...entry };
            }
          });
          const cleanMerged = sanitizeCorrespondenceEntries(merged);
          setCorrespondenceLog(cleanMerged);
          setOrgStorage(orgId, 'correspondence_log', cleanMerged);
          setMailSyncStatus({
            success: true,
            message: `Pomyślnie zsynchronizowano z zakładką „${MAIL_REGISTRY_TAB}”. Pobrano ${cleanIncoming.length} pism kancelaryjnych (${addedCount} nowych).`,
          });
        } else {
          setCorrespondenceLog(current);
          setOrgStorage(orgId, 'correspondence_log', current);
          setMailSyncStatus({
            success: true,
            message: `Zakładka „${MAIL_REGISTRY_TAB}” jest aktywna (0 nowych pism zewnętrznych). Wszystkie lokalne dane kancelaryjne są zabezpieczone.`,
          });
        }
      } else {
        setMailSyncStatus({
          success: false,
          message: res.error || `Nie udało się odczytać zakładki „${MAIL_REGISTRY_TAB}”.`,
        });
      }
    } catch (err) {
      setMailSyncStatus({
        success: false,
        message: `Błąd połączenia z arkuszem: ${err.message}`,
      });
    } finally {
      setIsSyncingMailSheet(false);
      setTimeout(() => setMailSyncStatus(null), 6000);
    }
  };

  const handleCopySheetFormat = () => {
    try {
      const { tsv } = formatCorrespondenceForSheet(correspondenceLog);
      navigator.clipboard.writeText(tsv);
      setCopiedSheetData(true);
      setTimeout(() => setCopiedSheetData(false), 2500);
    } catch (e) {
      console.warn('Clipboard error:', e);
    }
  };

  const handleOpenMailModal = (entryToEdit = null) => {
    const { tag: orgTag, name: orgName } = getOrgMetadata(currentOrg);
    const activeSups = getActiveSupervisors(currentOrg?.supervisors || [], currentOrg);
    const supDefault = activeSups[0] ? `${formatSupervisorName(activeSups[0])} (Opiekun Naukowy SKN)` : 'Opiekun Naukowy SKN';
    const boardDefault = `Zarząd ${orgName}`;
    const year = '2026';
    if (entryToEdit) {
      setMailForm({
        ...entryToEdit,
        date: entryToEdit.date || entryToEdit.dataWplywu || '2026-03-17',
        dataWplywu: entryToEdit.date || entryToEdit.dataWplywu || '2026-03-17',
        driveLink: entryToEdit.driveLink || entryToEdit.driveUrl || '',
      });
      setMailModalTab('form');
      setDuplicateWarning(null);
    } else {
      const nextNum = String(correspondenceLog.length + 1).padStart(2, '0');
      const senderDefault = supDefault;
      const recipientDefault = boardDefault;
      setMailForm({
        id: `${orgTag}/DK/${year}/03/${nextNum}`,
        direction: 'IN',
        date: '2026-03-17',
        dataWplywu: '2026-03-17',
        sender: senderDefault,
        recipient: recipientDefault,
        subject: '',
        summary: '',
        status: 'W toku',
        driveLink: '',
        hash: '',
      });
      setRawMailText('');
      setMailModalTab('parser');
      setDuplicateWarning(null);
    }
    setIsMailModalOpen(true);
  };

  const handleParseMail = () => {
    if (!rawMailText.trim()) return;
    const { tag: orgTag, name: orgName } = getOrgMetadata(currentOrg);
    const activeSups = getActiveSupervisors(currentOrg?.supervisors || [], currentOrg);
    const supDefault = activeSups[0] ? `${formatSupervisorName(activeSups[0])} (Opiekun Naukowy SKN)` : 'Opiekun Naukowy SKN';
    const boardDefault = `Zarząd ${orgName}`;

    const parsed = parseRawEmailText(rawMailText, orgTag);
    const docDate = parsed.date || '2026-03-17';
    const year = docDate.slice(0, 4) || '2026';
    const month = docDate.slice(5, 7) || '03';
    const nextNum = String(correspondenceLog.length + 1).padStart(2, '0');
    const suggestedId = `${orgTag}/DK/${year}/${month}/${nextNum}`;
    const finalId = parsed.id || parsed.sygnatura || suggestedId;

    const dupCheck = checkDuplicateCorrespondence(parsed, correspondenceLog);
    if (dupCheck.isDuplicate) {
      setDuplicateWarning(dupCheck.matchedEntry);
    } else {
      setDuplicateWarning(null);
    }

    setMailForm({
      id: finalId,
      direction: parsed.direction || parsed.kierunek || 'IN',
      date: docDate,
      dataWplywu: docDate,
      sender: parsed.sender || parsed.nadawca || (parsed.direction === 'OUT' ? boardDefault : supDefault),
      recipient: parsed.recipient || parsed.odbiorca || (parsed.direction === 'IN' ? boardDefault : supDefault),
      subject: parsed.subject || parsed.przedmiot || '',
      summary: parsed.summary || parsed.tresc || parsed.streszczenie || '',
      status: parsed.status || 'W toku',
      driveLink: parsed.driveLink || '',
      hash: `${(parsed.subject || parsed.przedmiot || '').slice(0, 20)}_${docDate}`,
    });

    setMailModalTab('form');
  };

  const handleSaveMailEntry = async (e) => {
    e.preventDefault();
    if (!mailForm.id.trim() || !mailForm.subject.trim()) return;

    setIsSavingMail(true);
    const orgId = currentOrg?.id || 'skn_seksuologii';
    const now = new Date();
    const nowFormatted = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;

    const isOut = mailForm.direction === 'OUT';
    const entryToSave = {
      ...mailForm,
      sygnatura: mailForm.id.trim(),
      id: mailForm.id.trim(),
      dataWplywu: mailForm.date || mailForm.dataWplywu || '2026-03-17',
      date: mailForm.date || mailForm.dataWplywu || '2026-03-17',
      dataWyslania: mailForm.dataWyslania || (isOut ? (mailForm.date || mailForm.dataWplywu || '') : ''),
      typ: isOut ? 'Wychodzące' : 'Wchodzące',
      kierunek: mailForm.direction || (isOut ? 'OUT' : 'IN'),
      direction: mailForm.direction || (isOut ? 'OUT' : 'IN'),
      nadawca: (mailForm.sender || mailForm.nadawca || '').trim(),
      sender: (mailForm.sender || mailForm.nadawca || '').trim(),
      odbiorca: (mailForm.recipient || mailForm.odbiorca || '').trim(),
      recipient: (mailForm.recipient || mailForm.odbiorca || '').trim(),
      przedmiot: (mailForm.subject || mailForm.przedmiot || '').trim(),
      subject: (mailForm.subject || mailForm.przedmiot || '').trim(),
      tresc: (mailForm.summary || mailForm.tresc || '').trim(),
      summary: (mailForm.summary || mailForm.tresc || '').trim(),
      status: mailForm.status || 'W toku',
      lokalizacjaDrive: (mailForm.driveLink || mailForm.driveUrl || '').trim(),
      driveLink: (mailForm.driveLink || mailForm.driveUrl || '').trim(),
      dataAktualizacji: nowFormatted,
      updatedAt: now.toISOString(),
      createdAt: mailForm.createdAt || now.toISOString(),
    };

    // 1. Natychmiastowy zapis w lokalnym rejestrze
    const updated = addCorrespondenceEntry(orgId, entryToSave);
    if (updated) setCorrespondenceLog(updated);

    // 2. Bezpośrednia wysyłka do backendu Google Apps Script (10 kolumn w arkuszu Dziennik_Korespondencji)
    try {
      await registerCorrespondenceToGAS(entryToSave, orgId);
      setMailToast({
        type: 'success',
        message: `Pismo „${entryToSave.sygnatura}” zostało pomyślnie zarejestrowane i zapisane w arkuszu Google Sheets.`
      });
    } catch (err) {
      console.warn('[GAS] Błąd rejestracji pisma w GAS:', err);
      setMailToast({
        type: 'error',
        message: `Zapisano lokalnie. Błąd synchronizacji z Google Sheets: ${err.message || 'Brak połączenia'}`
      });
    } finally {
      setIsSavingMail(false);
      setIsMailModalOpen(false);
      setDuplicateWarning(null);
      setTimeout(() => setMailToast(null), 5000);
    }
  };

  const handleBatchSyncCorrespondence = async () => {
    const orgId = currentOrg?.id || 'skn_seksuologii';
    const entries = getCorrespondenceLog(orgId);
    if (!entries || entries.length === 0) {
      showToast('Brak pism w dzienniku do synchronizacji.');
      return;
    }

    setIsBatchSyncing(true);
    setBatchProgress({ current: 0, total: entries.length });
    setMailToast({
      type: 'info',
      message: `Rozpoczynam wysyłkę ${entries.length} pism do Google Sheets...`
    });

    try {
      const res = await batchRegisterCorrespondenceToGAS(entries, orgId, (prog) => {
        setBatchProgress({ current: prog.current, total: prog.total });
      });

      setMailToast({
        type: 'success',
        message: `Sukces! Przesłano ${res.count} z ${res.total} pism do arkusza Google Sheets (Dziennik Korespondencji).`
      });
    } catch (err) {
      console.error('[handleBatchSyncCorrespondence] Błąd batch sync:', err);
      setMailToast({
        type: 'error',
        message: `Wystąpił błąd podczas hurtowej synchronizacji: ${err.message || 'Błąd sieci'}`
      });
    } finally {
      setIsBatchSyncing(false);
      setTimeout(() => setMailToast(null), 7000);
    }
  };

  const handleDeleteMailEntry = async (entryId) => {
    const orgId = currentOrg?.id || 'skn_seksuologii';
    const updated = deleteCorrespondenceEntry(orgId, entryId);
    if (updated) setCorrespondenceLog(updated);
    if (viewingMailEntry && viewingMailEntry.id === entryId) {
      setViewingMailEntry(null);
    }
    showToast(`Pismo „${entryId}” zostało usunięte.`);
    setMailToast({
      type: 'info',
      message: `Usuwanie pisma „${entryId}” z rejestru i Google Sheets...`
    });
    try {
      await deleteCorrespondenceFromGAS(entryId, orgId);
      setMailToast({
        type: 'success',
        message: `Pismo „${entryId}” zostało pomyślnie usunięte z rejestru i arkusza Google Sheets.`
      });
    } catch (err) {
      console.warn('[GAS] Błąd usuwania pisma w GAS:', err);
      setMailToast({
        type: 'error',
        message: `Usunięto lokalnie. Błąd aktualizacji Google Sheets: ${err.message || 'Brak połączenia'}`
      });
    } finally {
      setTimeout(() => setMailToast(null), 5000);
    }
  };

  const handlePrintCorrespondence = () => {
    setIsPrintingCorrespondence(true);
    setTimeout(() => {
      window.print();
      setIsPrintingCorrespondence(false);
    }, 200);
  };

  // UI States
  const [selectedCategory, setSelectedCategory] = useState('Wszystkie');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingDriveModal, setIsEditingDriveModal] = useState(false);
  const [tempDriveUrl, setTempDriveUrl] = useState('');
  const [isEditingStatutModal, setIsEditingStatutModal] = useState(false);
  const [tempStatutConfig, setTempStatutConfig] = useState({
    url: '',
    status: 'Zatwierdzony przez Władze WSKZ',
    description: '',
  });
  const [editingDoc, setEditingDoc] = useState(null);
  const [previewDocModal, setPreviewDocModal] = useState(null);
  const [isBatchSyncingDocs, setIsBatchSyncingDocs] = useState(false);
  const [batchDocsProgress, setBatchDocsProgress] = useState({ current: 0, total: 0 });

  // Form State for Modal
  const [formState, setFormState] = useState({
    code: '',
    title: '',
    category: 'Uchwały Zarządu',
    date: new Date().toISOString().split('T')[0],
    driveUrl: '',
    status: 'Obowiązujący',
    description: '',
  });

  // Filtered documents list
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesCategory = selectedCategory === 'Wszystkie' || doc.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (doc.code || '').toLowerCase().includes(q) ||
        (doc.title || '').toLowerCase().includes(q) ||
        (doc.description || '').toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [documents, selectedCategory, searchQuery]);

  // Change category inside modal with dynamic code prefix suggestion
  const handleModalCategoryChange = (newCat) => {
    const orgTag = currentOrg.shortName ? currentOrg.shortName.toUpperCase().replace(/[^A-Z0-9]/g, '') : 'ORG';
    let codePrefix = 'UCHWAŁA';
    if (newCat === 'Regulaminy i Statut') codePrefix = 'REG';
    else if (newCat === 'Protokoły Zebrań') codePrefix = 'PROT';
    else if (newCat === 'Wnioski i Granty') codePrefix = 'WNIOSEK';

    const catCount = documents.filter((d) => d.category === newCat).length + (editingDoc ? 0 : 1);
    const isStandardCode = /^(UCHWAŁA|PROT|REG|WNIOSEK|STATUT)\//i.test(formState.code);

    setFormState((prev) => ({
      ...prev,
      category: newCat,
      code: isStandardCode || !prev.code
        ? `${codePrefix}/${orgTag}/${String(catCount || 1).padStart(2, '0')}/2026`
        : prev.code,
    }));
  };

  // Open modal for new document
  const handleOpenAddModal = () => {
    setEditingDoc(null);
    const orgTag = currentOrg.shortName ? currentOrg.shortName.toUpperCase().replace(/[^A-Z0-9]/g, '') : 'ORG';
    const effectiveCategory = (selectedCategory && selectedCategory !== 'Wszystkie')
      ? selectedCategory
      : 'Uchwały Zarządu';

    let codePrefix = 'UCHWAŁA';
    if (effectiveCategory === 'Regulaminy i Statut') codePrefix = 'REG';
    else if (effectiveCategory === 'Protokoły Zebrań') codePrefix = 'PROT';
    else if (effectiveCategory === 'Wnioski i Granty') codePrefix = 'WNIOSEK';

    const catCount = documents.filter((d) => d.category === effectiveCategory).length + 1;

    setFormState({
      code: `${codePrefix}/${orgTag}/${String(catCount).padStart(2, '0')}/2026`,
      title: '',
      category: effectiveCategory,
      date: new Date().toISOString().split('T')[0],
      driveUrl: '',
      status: 'Obowiązujący',
      description: '',
    });
    setIsModalOpen(true);
  };

  // Open modal for editing document
  const handleOpenEditModal = (doc) => {
    setEditingDoc(doc);
    setFormState({
      code: doc.code || '',
      title: doc.title || '',
      category: doc.category || 'Uchwały Zarządu',
      date: doc.date || '',
      driveUrl: doc.driveUrl || '',
      status: doc.status || 'Obowiązujący',
      description: doc.description || '',
    });
    setIsModalOpen(true);
  };

  // Save document from modal
  const handleSaveDocument = async (e) => {
    e.preventDefault();
    if (!formState.title.trim()) {
      showToast('Wpisz tytuł dokumentu!');
      return;
    }

    const docToSave = {
      ...(editingDoc || {}),
      ...formState,
      driveUrl: (formState.driveUrl || '').trim(),
      id: editingDoc?.id || `doc_${Date.now()}`,
      createdAt: editingDoc?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editingDoc) {
      const updated = documents.map((d) => (d.id === editingDoc.id ? docToSave : d));
      saveDocuments(updated);
    } else {
      saveDocuments([docToSave, ...documents]);
    }

    setIsModalOpen(false);
    setMailToast({
      type: 'info',
      message: `Zapisano akt „${docToSave.code}”. Zapisywanie w bazie Google Sheets...`
    });

    try {
      await registerDocumentActToGAS(docToSave, currentOrg?.id || 'skn_seksuologii');
      setMailToast({
        type: 'success',
        message: `Akt „${docToSave.code}” został pomyślnie zapisany w rejestrze i bazie Google Sheets.`
      });
    } catch (err) {
      console.warn('[GAS] Błąd zapisu aktu w GAS:', err);
      setMailToast({
        type: 'error',
        message: `Zapisano lokalnie. Błąd synchronizacji z Google Sheets: ${err.message || 'Brak połączenia'}`
      });
    } finally {
      setTimeout(() => setMailToast(null), 5000);
    }
  };

  // Delete document
  const handleDeleteDocument = async (id) => {
    const docToDelete = documents.find((d) => d.id === id);
    const docCode = docToDelete?.code || id;
    const updated = documents.filter((d) => d.id !== id);
    saveDocuments(updated);
    showToast(`Akt „${docCode}” został usunięty.`);
    setMailToast({
      type: 'info',
      message: `Usuwanie aktu „${docCode}” z bazy koła...`
    });
    try {
      await deleteDocumentActFromGAS(docCode, currentOrg?.id || 'skn_seksuologii');
      setMailToast({
        type: 'success',
        message: `Akt „${docCode}” został pomyślnie usunięty z rejestru i bazy Google Sheets.`
      });
      showToast(`Akt „${docCode}” został pomyślnie usunięty.`);
    } catch (err) {
      console.warn('[GAS] Błąd usuwania aktu w GAS:', err);
      setMailToast({
        type: 'error',
        message: `Usunięto lokalnie. Błąd usuwania z Google Sheets: ${err.message || 'Brak połączenia'}`
      });
    } finally {
      setTimeout(() => setMailToast(null), 5000);
    }
  };

  // Batch sync all documents to GAS
  const handleBatchSyncDocuments = async () => {
    const orgId = currentOrg?.id || 'skn_seksuologii';
    if (!documents || documents.length === 0) {
      showToast('Brak dokumentów w rejestrze do synchronizacji.');
      return;
    }

    setIsBatchSyncingDocs(true);
    setBatchDocsProgress({ current: 0, total: documents.length });
    setMailToast({
      type: 'info',
      message: `Rozpoczynam synchronizację ${documents.length} aktów z bazą koła...`
    });

    try {
      const res = await batchRegisterDocumentActsToGAS(documents, orgId, (prog) => {
        setBatchDocsProgress({ current: prog.current, total: prog.total });
      });

      setMailToast({
        type: 'success',
        message: `Sukces! Zsynchronizowano ${res.count} z ${res.total} aktów prawnych z bazą koła (Rejestr_Uchwal).`
      });
    } catch (err) {
      console.error('[handleBatchSyncDocuments] Błąd batch sync aktów:', err);
      setMailToast({
        type: 'error',
        message: `Wystąpił błąd podczas hurtowej synchronizacji aktów: ${err.message || 'Błąd sieci'}`
      });
    } finally {
      setIsBatchSyncingDocs(false);
      setTimeout(() => setMailToast(null), 7000);
    }
  };

  // Save updated Google Drive URL
  const handleSaveDriveUrl = (e) => {
    e.preventDefault();
    if (!tempDriveUrl.trim()) return;
    setGdriveUrl(tempDriveUrl.trim());
    try {
      localStorage.setItem(gdriveStorageKey, tempDriveUrl.trim());
    } catch {}
    setIsEditingDriveModal(false);
  };

  // Save updated Statut Config
  const handleSaveStatutConfig = (e) => {
    e.preventDefault();
    const newConfig = { ...tempStatutConfig };
    setStatutConfig(newConfig);
    try {
      localStorage.setItem(statutConfigStorageKey, JSON.stringify(newConfig));
    } catch {}
    setIsEditingStatutModal(false);
  };

  // Badge Color Helper
  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case 'Uchwały Zarządu':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Protokoły Zebrań':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Regulaminy i Statut':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Wnioski i Granty':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Obowiązujący':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'W toku':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Zastąpiony':
        return 'bg-slate-100 text-slate-600 border-slate-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 pb-12 font-sans animate-in fade-in duration-200">
      
      {/* ── HEADER BAR ────────────────────────────────────────────────────────── */}
      <div className="bg-white px-3.5 sm:px-4 md:px-6 py-3 min-h-[64px] rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center min-w-0">
          <div className="w-11 h-11 min-w-[44px] rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center mr-4 shrink-0 shadow-2xs">
            {activeModuleTab === 'repository' ? <FolderKanban className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-tight text-slate-900 tracking-tight truncate">
                {activeModuleTab === 'repository'
                  ? 'Repozytorium Dokumentów & Rejestr Uchwał'
                  : 'Elektroniczny Dziennik Podawczy & Kancelaria'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                {currentOrg.shortName || currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-normal mt-0.5 truncate">
              {activeModuleTab === 'repository'
                ? 'Oficjalna ewidencja aktów prawnych, statutów, uchwał i protokołów naukowych WSKZ.'
                : 'Ewidencja pism przychodzących i wychodzących z inteligentnym parserem e-maili i detekcją spraw.'}
            </p>
          </div>
        </div>

        {/* Global Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
          {activeModuleTab === 'repository' ? (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleBatchSyncDocuments}
                disabled={isBatchSyncingDocs || documents.length === 0}
                className="flex-1 sm:flex-none h-9 px-3 sm:px-3.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer min-h-[38px] sm:min-h-0"
                title="Prześlij wszystkie akty prawne i uchwały do bazy koła w Google Sheets"
              >
                <Zap size={14} className={isBatchSyncingDocs ? 'animate-bounce' : ''} />
                {isBatchSyncingDocs ? (
                  <span>{`Wysyłanie (${batchDocsProgress.current}/${batchDocsProgress.total})...`}</span>
                ) : (
                  <>
                    <span className="sm:hidden">Synchronizuj</span>
                    <span className="hidden sm:inline">Zsynchronizuj akty z bazą koła</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="w-full sm:w-auto h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer min-h-[38px] sm:min-h-0"
              >
                <Plus size={16} strokeWidth={2.5} className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Dodaj</span>
                <span className="hidden sm:inline">Dodaj Dokument</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleBatchSyncCorrespondence}
                disabled={isBatchSyncing || correspondenceLog.length === 0}
                className="flex-1 sm:flex-none h-9 px-3 sm:px-3.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer min-h-[38px] sm:min-h-0"
                title="Prześlij wszystkie lokalne wpisy z dziennika korespondencji do bazy koła w Google Sheets"
              >
                <Zap size={14} className={isBatchSyncing ? 'animate-bounce' : ''} />
                {isBatchSyncing ? (
                  <span>{`Wysyłanie (${batchProgress.current}/${batchProgress.total})...`}</span>
                ) : (
                  <>
                    <span className="sm:hidden">Synchronizuj</span>
                    <span className="hidden sm:inline">Zarejestruj w arkuszu</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsWelcomeMailModalOpen(true)}
                className="flex-1 sm:flex-none h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[38px] sm:min-h-0"
                title="Przygotuj i wyślij powiadomienie do studenta"
              >
                <Mail size={14} />
                <span className="sm:hidden">Mail</span>
                <span className="hidden sm:inline">Powiadomienie</span>
              </button>

              <button
                type="button"
                onClick={handlePrintCorrespondence}
                className="flex-1 sm:flex-none h-9 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer min-h-[38px] sm:min-h-0"
                title="Drukuj oficjalny Dziennik Podawczy do PDF dla Dziekanatu i PKA"
              >
                <Printer size={14} />
                <span className="sm:hidden">Drukuj</span>
                <span className="hidden sm:inline">Drukuj Dziennik (PDF)</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenMailModal()}
                className="w-full sm:w-auto h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer min-h-[38px] sm:min-h-0"
              >
                <Plus size={16} strokeWidth={2.5} className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Zarejestruj</span>
                <span className="hidden sm:inline">Zarejestruj Pismo</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── TWO-COLUMN MASTER-DETAIL LAYOUT WITH RESIZABLE SIDEBAR ──────────── */}
      <div className="flex flex-col lg:flex-row items-stretch gap-0 w-full min-h-[calc(100vh-230px)]">
        
        {/* ── LEFT SIDEBAR (Navigation, Views & Micro-Tools) ──────────────────── */}
        <div
          ref={sidebarContainerRef}
          className="w-full lg:shrink-0 flex flex-col space-y-3 pr-0 lg:pr-3 pb-4 lg:pb-0"
          style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarWidth : '100%' }}
        >
          {/* Main Module Switchers & Category Filters */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              {/* Module Switcher Header */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5">
                  Moduł Dokumentacji
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveModuleTab('repository')}
                    className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                      activeModuleTab === 'repository'
                        ? 'bg-indigo-50/90 border-2 border-indigo-500 text-indigo-950 shadow-xs'
                        : 'bg-white hover:bg-indigo-50/40 text-slate-700 border border-slate-200/80 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                        activeModuleTab === 'repository' ? 'bg-indigo-200/80 text-indigo-800' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        <FolderKanban className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`block text-xs font-semibold leading-tight truncate ${
                          activeModuleTab === 'repository' ? 'text-indigo-950' : 'text-slate-800'
                        }`}>
                          Repozytorium Aktów
                        </span>
                        <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                          activeModuleTab === 'repository' ? 'text-indigo-700' : 'text-slate-400'
                        }`}>
                          Rejestr uchwał i statut
                        </span>
                      </div>
                    </div>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                      activeModuleTab === 'repository' ? 'bg-indigo-200 text-indigo-900 font-bold border border-indigo-300' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {documents.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveModuleTab('correspondence')}
                    className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                      activeModuleTab === 'correspondence'
                        ? 'bg-teal-50/90 border-2 border-teal-500 text-teal-950 shadow-xs'
                        : 'bg-white hover:bg-teal-50/40 text-slate-700 border border-slate-200/80 hover:border-teal-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                        activeModuleTab === 'correspondence' ? 'bg-teal-200/80 text-teal-800' : 'bg-teal-50 text-teal-600'
                      }`}>
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`block text-xs font-semibold leading-tight truncate ${
                          activeModuleTab === 'correspondence' ? 'text-teal-950' : 'text-slate-800'
                        }`}>
                          Dziennik Podawczy
                        </span>
                        <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                          activeModuleTab === 'correspondence' ? 'text-teal-700' : 'text-slate-400'
                        }`}>
                          Kancelaria & korespondencja
                        </span>
                      </div>
                    </div>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                      activeModuleTab === 'correspondence' ? 'bg-teal-200 text-teal-900 font-bold border border-teal-300' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {correspondenceLog.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Contextual Filters */}
              {activeModuleTab === 'repository' ? (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5 pt-1 border-t border-slate-100">
                    Kategorie Dokumentów
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1 gap-1.5">
                    {CATEGORIES.map((cat) => {
                      const count = cat === 'Wszystkie'
                        ? documents.length
                        : documents.filter((d) => d.category === cat).length;
                      const isActive = selectedCategory === cat;

                      let icon = <Layers className="w-4 h-4" />;
                      let subtitle = 'Wszystkie zarejestrowane akty';
                      let activeCardClass = 'bg-indigo-50/90 border-2 border-indigo-500 text-indigo-950 shadow-xs';
                      let activeIconBox = 'bg-indigo-200/80 text-indigo-800';
                      let restingIconBox = 'bg-indigo-50 text-indigo-600';
                      let activeBadge = 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300';
                      let hoverClass = 'hover:bg-indigo-50/40 border-slate-200/80 hover:border-indigo-200';
                      let activeTextClass = 'text-indigo-950';
                      let activeSubtitleClass = 'text-indigo-700';

                      if (cat === 'Uchwały Zarządu') {
                        icon = <FileText className="w-4 h-4" />;
                        subtitle = 'Decyzje i regulacje wewnętrzne';
                        activeCardClass = 'bg-purple-50/90 border-2 border-purple-500 text-purple-950 shadow-xs';
                        activeIconBox = 'bg-purple-200/80 text-purple-800';
                        restingIconBox = 'bg-purple-50 text-purple-600';
                        activeBadge = 'bg-purple-200 text-purple-900 font-bold border border-purple-300';
                        hoverClass = 'hover:bg-purple-50/40 border-slate-200/80 hover:border-purple-200';
                        activeTextClass = 'text-purple-950';
                        activeSubtitleClass = 'text-purple-700';
                      } else if (cat === 'Protokoły Zebrań') {
                        icon = <FileCheck className="w-4 h-4" />;
                        subtitle = 'Seminaria i posiedzenia koła';
                        activeCardClass = 'bg-amber-50/90 border-2 border-amber-500 text-amber-950 shadow-xs';
                        activeIconBox = 'bg-amber-200/80 text-amber-800';
                        restingIconBox = 'bg-amber-50 text-amber-600';
                        activeBadge = 'bg-amber-200 text-amber-900 font-bold border border-amber-300';
                        hoverClass = 'hover:bg-amber-50/40 border-slate-200/80 hover:border-amber-200';
                        activeTextClass = 'text-amber-950';
                        activeSubtitleClass = 'text-amber-700';
                      } else if (cat === 'Regulaminy i Statut') {
                        icon = <ShieldCheck className="w-4 h-4" />;
                        subtitle = 'Akty ustrojowe i statut WSKZ';
                        activeCardClass = 'bg-teal-50/90 border-2 border-teal-500 text-teal-950 shadow-xs';
                        activeIconBox = 'bg-teal-200/80 text-teal-800';
                        restingIconBox = 'bg-teal-50 text-teal-600';
                        activeBadge = 'bg-teal-200 text-teal-900 font-bold border border-teal-300';
                        hoverClass = 'hover:bg-teal-50/40 border-slate-200/80 hover:border-teal-200';
                        activeTextClass = 'text-teal-950';
                        activeSubtitleClass = 'text-teal-700';
                      } else if (cat === 'Wnioski i Granty') {
                        icon = <Sparkles className="w-4 h-4" />;
                        subtitle = 'Dofinansowania i projekty';
                        activeCardClass = 'bg-emerald-50/90 border-2 border-emerald-500 text-emerald-950 shadow-xs';
                        activeIconBox = 'bg-emerald-200/80 text-emerald-800';
                        restingIconBox = 'bg-emerald-50 text-emerald-600';
                        activeBadge = 'bg-emerald-200 text-emerald-900 font-bold border border-emerald-300';
                        hoverClass = 'hover:bg-emerald-50/40 border-slate-200/80 hover:border-emerald-200';
                        activeTextClass = 'text-emerald-950';
                        activeSubtitleClass = 'text-emerald-700';
                      }

                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                            isActive
                              ? activeCardClass
                              : `bg-white ${hoverClass} text-slate-700 border`
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                              isActive ? activeIconBox : restingIconBox
                            }`}>
                              {icon}
                            </div>
                            <div className="min-w-0">
                              <span className={`block text-xs font-semibold leading-tight truncate ${isActive ? activeTextClass : 'text-slate-800'}`}>{cat}</span>
                              <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                                isActive ? activeSubtitleClass : 'text-slate-400'
                              }`}>
                                {subtitle}
                              </span>
                            </div>
                          </div>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                            isActive ? activeBadge : 'bg-slate-100 text-slate-600'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1.5 pt-1 border-t border-slate-100">
                    Kierunek Korespondencji
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-1.5">
                    {/* Wszystkie pisma */}
                    <button
                      type="button"
                      onClick={() => setCorrespondenceFilter('all')}
                      className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                        correspondenceFilter === 'all'
                          ? 'bg-indigo-50/90 border-2 border-indigo-500 text-indigo-950 shadow-xs'
                          : 'bg-white hover:bg-indigo-50/40 text-slate-700 border border-slate-200/80 hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                          correspondenceFilter === 'all' ? 'bg-indigo-200/80 text-indigo-800' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          <Mail className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className={`block text-xs font-semibold leading-tight truncate ${
                            correspondenceFilter === 'all' ? 'text-indigo-950' : 'text-slate-800'
                          }`}>
                            Wszystkie pisma
                          </span>
                          <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                            correspondenceFilter === 'all' ? 'text-indigo-700' : 'text-slate-400'
                          }`}>
                            Cała korespondencja SKN
                          </span>
                        </div>
                      </div>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                        correspondenceFilter === 'all' ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {correspondenceLog.length}
                      </span>
                    </button>

                    {/* Przychodzące (IN) */}
                    <button
                      type="button"
                      onClick={() => setCorrespondenceFilter('IN')}
                      className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                        correspondenceFilter === 'IN'
                          ? 'bg-emerald-50/90 border-2 border-emerald-500 text-emerald-950 shadow-xs'
                          : 'bg-white hover:bg-emerald-50/40 text-slate-700 border border-slate-200/80 hover:border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                          correspondenceFilter === 'IN' ? 'bg-emerald-200/80 text-emerald-800' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          <Inbox className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className={`block text-xs font-semibold leading-tight truncate ${
                            correspondenceFilter === 'IN' ? 'text-emerald-950' : 'text-slate-800'
                          }`}>
                            Przychodzące (IN)
                          </span>
                          <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                            correspondenceFilter === 'IN' ? 'text-emerald-700' : 'text-slate-400'
                          }`}>
                            Pisma wpływające i maile
                          </span>
                        </div>
                      </div>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                        correspondenceFilter === 'IN' ? 'bg-emerald-200 text-emerald-900 font-bold border border-emerald-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {correspondenceLog.filter((c) => c.direction === 'IN').length}
                      </span>
                    </button>

                    {/* Wychodzące (OUT) */}
                    <button
                      type="button"
                      onClick={() => setCorrespondenceFilter('OUT')}
                      className={`h-[68px] min-h-[68px] max-h-[68px] px-3.5 py-2.5 rounded-xl w-full flex items-center justify-between transition-all select-none cursor-pointer text-left ${
                        correspondenceFilter === 'OUT'
                          ? 'bg-sky-50/90 border-2 border-sky-500 text-sky-950 shadow-xs'
                          : 'bg-white hover:bg-sky-50/40 text-slate-700 border border-slate-200/80 hover:border-sky-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                          correspondenceFilter === 'OUT' ? 'bg-sky-200/80 text-sky-800' : 'bg-sky-50 text-sky-600'
                        }`}>
                          <Send className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className={`block text-xs font-semibold leading-tight truncate ${
                            correspondenceFilter === 'OUT' ? 'text-sky-950' : 'text-slate-800'
                          }`}>
                            Wychodzące (OUT)
                          </span>
                          <span className={`text-[11px] font-normal truncate block mt-0.5 ${
                            correspondenceFilter === 'OUT' ? 'text-sky-700' : 'text-slate-400'
                          }`}>
                            Pisma wysłane i wnioski
                          </span>
                        </div>
                      </div>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ml-2 ${
                        correspondenceFilter === 'OUT' ? 'bg-sky-200 text-sky-900 font-bold border border-sky-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {correspondenceLog.filter((c) => c.direction === 'OUT').length}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Utilities */}
            {activeModuleTab === 'repository' ? (
              <div className="border-t border-slate-200/80 pt-2.5 mt-2 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Zasoby Zewnętrzne
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (statutConfig.url && statutConfig.url.trim()) {
                        window.open(statutConfig.url.trim(), '_blank');
                      } else {
                        setTempStatutConfig({
                          url: statutConfig.url || '',
                          status: statutConfig.status || 'Zatwierdzony przez Władze WSKZ',
                          description: statutConfig.description || '',
                        });
                        setIsEditingStatutModal(true);
                      }
                    }}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="Otwórz Statut Koła w Google Docs/Drive"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">Statut Koła</span>
                  </button>
                  <a
                    href={gdriveUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
                    title="Otwórz folder Dysku Google"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate">Dysk Google</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-200/80 pt-2.5 mt-2 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Integracje & Arkusz
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={handleSyncMailSheet}
                    disabled={isSyncingMailSheet}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="Synchronizuj z dedykowaną zakładką arkusza Google"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 shrink-0 ${isSyncingMailSheet ? 'animate-spin' : ''}`} />
                    <span className="truncate">Synchronizuj</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySheetFormat}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="Kopiuj dane korespondencji w formacie TSV do wklejenia w arkusz"
                  >
                    {copiedSheetData ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate">{copiedSheetData ? 'Skopiowano!' : 'Kopiuj TSV'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RESIZER HANDLE ──────────────────────────────────────────────────── */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className={`hidden lg:flex items-center justify-center w-[5px] shrink-0 cursor-col-resize select-none z-10 transition-colors duration-150 self-stretch my-0.5 rounded-full group ${
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
          title="Przeciągnij krawędź, aby dostosować szerokość panelu nawigacyjnego"
        >
          <div className={`w-[1px] h-8 rounded-full transition-colors ${
            isResizing ? 'bg-white' : 'bg-slate-300 group-hover:bg-emerald-200'
          }`} />
        </div>

        {/* ── RIGHT MAIN CONTENT COLUMN (flex-1) ──────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full pl-0 lg:pl-3 space-y-3">
          
          {/* TAB 1: REPOSITORY MAIN CONTENT */}
          {activeModuleTab === 'repository' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              
              {/* Top Toolbar (Filters, Search, Actions) */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                {/* Category Tabs */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CATEGORIES.map((cat) => {
                    const count = cat === 'Wszystkie'
                      ? documents.length
                      : documents.filter((d) => d.category === cat).length;
                    const isActive = selectedCategory === cat;

                    let activeClass = 'bg-indigo-50/90 text-indigo-950 border-2 border-indigo-500 shadow-xs';
                    let activeBadge = 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300';
                    let hoverClass = 'hover:bg-indigo-50/50 hover:text-indigo-900';

                    if (cat === 'Uchwały Zarządu') {
                      activeClass = 'bg-purple-50/90 text-purple-950 border-2 border-purple-500 shadow-xs';
                      activeBadge = 'bg-purple-200 text-purple-900 font-bold border border-purple-300';
                      hoverClass = 'hover:bg-purple-50/50 hover:text-purple-900';
                    } else if (cat === 'Protokoły Zebrań') {
                      activeClass = 'bg-amber-50/90 text-amber-950 border-2 border-amber-500 shadow-xs';
                      activeBadge = 'bg-amber-200 text-amber-900 font-bold border border-amber-300';
                      hoverClass = 'hover:bg-amber-50/50 hover:text-amber-900';
                    } else if (cat === 'Regulaminy i Statut') {
                      activeClass = 'bg-teal-50/90 text-teal-950 border-2 border-teal-500 shadow-xs';
                      activeBadge = 'bg-teal-200 text-teal-900 font-bold border border-teal-300';
                      hoverClass = 'hover:bg-teal-50/50 hover:text-teal-900';
                    } else if (cat === 'Wnioski i Granty') {
                      activeClass = 'bg-emerald-50/90 text-emerald-950 border-2 border-emerald-500 shadow-xs';
                      activeBadge = 'bg-emerald-200 text-emerald-900 font-bold border border-emerald-300';
                      hoverClass = 'hover:bg-emerald-50/50 hover:text-emerald-900';
                    }

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                          isActive
                            ? activeClass
                            : `bg-transparent text-slate-600 ${hoverClass}`
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                          isActive
                            ? activeBadge
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search Box & Quick Add Button */}
                <div className="flex items-center gap-2 flex-1 lg:max-w-md justify-end">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="repository-search-input"
                      name="repositorySearch"
                      type="text"
                      aria-label="Szukaj dokumentu po sygnaturze lub tytule"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Szukaj po sygnaturze, tytule..."
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
                    onClick={handleOpenAddModal}
                    className="h-9 px-3.5 sm:px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer shrink-0 min-h-[38px] sm:min-h-0"
                  >
                    <Plus size={16} strokeWidth={2.5} className="w-4 h-4 shrink-0" />
                    <span className="sm:hidden">Dodaj</span>
                    <span className="hidden sm:inline">Dodaj Dokument</span>
                  </button>
                </div>
              </div>

              {/* Massive Documents Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela oficjalnych dokumentów i uchwał koła"
                  className="table-wrapper w-full overflow-x-auto block touch-auto focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
                >
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-40">Sygnatura / Nr</th>
                        <th className="py-2.5 px-3">Tytuł / Przedmiot Dokumentu</th>
                        <th className="py-2.5 px-3 w-36">Kategoria</th>
                        <th className="py-2.5 px-3 w-24 text-center">Data</th>
                        <th className="py-2.5 px-3 w-24 text-center">Plik</th>
                        <th className="py-2.5 px-3 w-28 text-center">Status</th>
                        <th className="py-2.5 px-3 w-20 text-center">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                            Brak dokumentów w wybranej kategorii lub filtrze wyszukiwania.
                          </td>
                        </tr>
                      ) : (
                        filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{doc.code}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{doc.title}</div>
                              {doc.description && (
                                <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-sans">
                                  {doc.description}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${getCategoryBadgeClass(
                                  doc.category
                                )}`}
                              >
                                {doc.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600 font-semibold">{doc.date}</td>
                            <td className="py-2.5 px-3 text-center">
                              {doc.driveUrl ? (
                                <div className="inline-flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDocModal({
                                      isOpen: true,
                                      documentTitle: doc.title,
                                      documentCode: doc.code,
                                      driveUrl: doc.driveUrl,
                                    })}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[10.5px] border border-indigo-200 transition-colors cursor-pointer"
                                    title="Podgląd dokumentu w oknie aplikacji"
                                  >
                                    <Eye size={11} />
                                    <span>Podgląd</span>
                                  </button>
                                  <a
                                    href={doc.driveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                                    title="Otwórz bezpośrednio na Dysku Google"
                                  >
                                    <ExternalLink size={11} />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-slate-300 font-mono text-[11px]">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${getStatusBadgeClass(
                                  doc.status
                                )}`}
                              >
                                {doc.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(doc)}
                                  className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                                  title="Edytuj dokument"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="Usuń dokument"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CORRESPONDENCE MAIN CONTENT */}
          {activeModuleTab === 'correspondence' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              
              {/* Mail Sync Banner / Alert if applicable */}
              {mailToast && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all animate-in fade-in ${
                  mailToast.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                    : (mailToast.type === 'error'
                      ? 'bg-rose-50 border-rose-300 text-rose-900 font-semibold'
                      : 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold')
                }`}>
                  <div className="flex items-center gap-2">
                    {mailToast.type === 'success' ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (mailToast.type === 'error' ? (
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                    ) : (
                      <RefreshCw size={16} className="text-indigo-600 animate-spin shrink-0" />
                    ))}
                    <span>{mailToast.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMailToast(null)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {mailSyncStatus && !mailToast && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
                  mailSyncStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="shrink-0" />
                    <span>{mailSyncStatus.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMailSyncStatus(null)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Single-Row Compact Toolbar */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                {/* Direction Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCorrespondenceFilter('all')}
                    className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                      correspondenceFilter === 'all'
                        ? 'bg-indigo-50/90 text-indigo-950 border-2 border-indigo-500 shadow-xs'
                        : 'bg-transparent text-slate-600 hover:bg-indigo-50/50 hover:text-indigo-900'
                    }`}
                  >
                    <span>Wszystkie</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                      correspondenceFilter === 'all'
                        ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {correspondenceLog.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCorrespondenceFilter('IN')}
                    className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                      correspondenceFilter === 'IN'
                        ? 'bg-emerald-50/90 text-emerald-950 border-2 border-emerald-500 shadow-xs'
                        : 'bg-transparent text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900'
                    }`}
                  >
                    <span>Przychodzące (IN)</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                      correspondenceFilter === 'IN'
                        ? 'bg-emerald-200 text-emerald-900 font-bold border border-emerald-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {correspondenceLog.filter((c) => c.direction === 'IN').length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCorrespondenceFilter('OUT')}
                    className={`h-9 px-3.5 rounded-lg text-xs font-medium transition-all flex items-center cursor-pointer ${
                      correspondenceFilter === 'OUT'
                        ? 'bg-sky-50/90 text-sky-950 border-2 border-sky-500 shadow-xs'
                        : 'bg-transparent text-slate-600 hover:bg-sky-50/50 hover:text-sky-900'
                    }`}
                  >
                    <span>Wychodzące (OUT)</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ml-2 ${
                      correspondenceFilter === 'OUT'
                        ? 'bg-sky-200 text-sky-900 font-bold border border-sky-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {correspondenceLog.filter((c) => c.direction === 'OUT').length}
                    </span>
                  </button>
                </div>

                {/* Search & Actions */}
                <div className="flex items-center gap-2 flex-1 lg:max-w-md justify-end">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="correspondence-search-input"
                      name="correspondenceSearch"
                      type="text"
                      aria-label="Szukaj w dzienniku korespondencji po sygnaturze lub temacie"
                      value={correspondenceSearch}
                      onChange={(e) => setCorrespondenceSearch(e.target.value)}
                      placeholder="Szukaj po sygnaturze, temacie..."
                      className="w-full h-9 pl-8 pr-7 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                    />
                    {correspondenceSearch && (
                      <button
                        type="button"
                        onClick={() => setCorrespondenceSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenMailModal()}
                    className="h-9 px-3.5 sm:px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 min-h-[38px] sm:min-h-0"
                    title="Zarejestruj nowe pismo lub wklej treść e-maila"
                  >
                    <Plus size={16} strokeWidth={2.5} className="w-4 h-4 shrink-0" />
                    <span className="sm:hidden">Zarejestruj</span>
                    <span className="hidden sm:inline">Zarejestruj pismo</span>
                  </button>
                </div>
              </div>

              {/* Massive Correspondence Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela elektronicznego dziennika podawczego i pism"
                  className="table-wrapper w-full overflow-x-auto block touch-auto focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
                >
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-10">Lp.</th>
                        <th className="py-2.5 px-3 w-40">Sygnatura Kanc.</th>
                        <th className="py-2.5 px-3 text-center w-24">Data</th>
                        <th className="py-2.5 px-3 text-center w-20">Kierunek</th>
                        <th className="py-2.5 px-3 w-48">Nadawca / Odbiorca</th>
                        <th className="py-2.5 px-3">Temat & Przedmiot Sprawy</th>
                        <th className="py-2.5 px-3 text-center w-24">Status</th>
                        <th className="py-2.5 px-3 text-center w-20">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCorrespondence.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                            Brak zarejestrowanych pism w wybranym filtrze. Kliknij „+ Zarejestruj”, aby dodać pismo.
                          </td>
                        </tr>
                      ) : (
                        filteredCorrespondence.map((item, idx) => {
                          const statusStr = String(item.status || 'W toku').toLowerCase();
                          let statusColor = 'bg-indigo-50 text-indigo-800 border-indigo-200';
                          if (statusStr.includes('zatwierdz') || statusStr.includes('zrealizowan') || statusStr.includes('zakończ')) {
                            statusColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                          } else if (statusStr.includes('weryfik')) {
                            statusColor = 'bg-amber-50 text-amber-800 border-amber-200';
                          } else if (statusStr.includes('odrzuc') || statusStr.includes('anulow')) {
                            statusColor = 'bg-rose-50 text-rose-800 border-rose-200';
                          }

                          return (
                            <tr
                              key={item.id || idx}
                              onClick={() => setViewingMailEntry(item)}
                              className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                              title="Kliknij wiersz, aby otworzyć panel boczny ze szczegółami sprawy"
                            >
                              <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-indigo-950 group-hover:text-indigo-600 transition-colors">
                                {item.id}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                                {item.date}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  item.direction === 'IN'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-sky-50 text-sky-800 border-sky-200'
                                }`}>
                                  {item.direction === 'IN' ? '📥 IN' : '📤 OUT'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                <div className="font-semibold text-slate-900 truncate max-w-[190px]" title={item.sender}>
                                  {item.sender}
                                </div>
                                <div className="text-[10.5px] text-slate-500 truncate max-w-[190px]" title={item.recipient}>
                                  → {item.recipient}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-800">
                                <div className="font-bold text-slate-900 group-hover:text-indigo-900 transition-colors">{item.subject}</div>
                                {item.summary && (
                                  <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-sans" title={item.summary}>
                                    {item.summary}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
                                  {item.status || 'W toku'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setViewingMailEntry(item)}
                                    className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                                    title="Podgląd w panelu bocznym"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMailModal(item)}
                                    className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100 transition cursor-pointer"
                                    title="Edytuj pismo"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMailEntry(item.id)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition cursor-pointer"
                                    title="Usuń pismo z dziennika"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: SMART MAIL INGESTION & PARSER ──────────────────────────────── */}
      {isMailModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden font-sans">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Mail size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    Inteligentny Parser Korespondencji & Rejestracja Pisma
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {currentOrg.name} • Kancelaria Koła Naukowego
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMailModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMailModalTab('parser')}
                className={`py-2 px-3 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer inline-flex items-center gap-1.5 ${
                  mailModalTab === 'parser'
                    ? 'text-indigo-600 border-indigo-600 bg-white shadow-2xs'
                    : 'text-slate-500 border-transparent hover:text-slate-900'
                }`}
              >
                <Zap size={13} strokeWidth={2.2} />
                <span>1. Wklej Treść E-mail (Smart Parser)</span>
              </button>
              <button
                type="button"
                onClick={() => setMailModalTab('form')}
                className={`py-2 px-3 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer inline-flex items-center gap-1.5 ${
                  mailModalTab === 'form'
                    ? 'text-indigo-600 border-indigo-600 bg-white shadow-2xs'
                    : 'text-slate-500 border-transparent hover:text-slate-900'
                }`}
              >
                <Edit3 size={13} strokeWidth={2.2} />
                <span>2. Formularz Kancelaryjny</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6">
              {mailModalTab === 'parser' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-xs text-indigo-900">
                    <p className="font-bold flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-600" />
                      Jak działa inteligentny parser korespondencji?
                    </p>
                    <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                      Wklej poniżej skopiowany z programu pocztowego (Gmail, Outlook, USOSweb) nagłówek i treść wiadomości.
                      System automatycznie wyodrębni <strong>Nadawcę (Od:)</strong>, <strong>Odbiorcę (Do:)</strong>, <strong>Datę</strong>, <strong>Temat</strong> oraz treść, nada kolejną sygnaturę kancelaryjną i sprawdzi duplikaty.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Wklej skopiowany e-mail (nagłówek i treść):
                    </label>
                    <textarea
                      rows={8}
                      value={rawMailText}
                      onChange={(e) => setRawMailText(e.target.value)}
                      placeholder={`Przykład:\nOd: Dziekanat WNS <dziekanat@wskz.pl>\nDo: Zarząd SKNU <sknu@student.wskz.pl>\nData: 24 sierpnia 2026 10:15\nTemat: Zatwierdzenie harmonogramu warsztatów profilaktycznych\n\nSzanowni Państwo,\nInformujemy, że wniosek Koła został pozytywnie rozpatrzony...`}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-slate-400 italic">
                      Możesz także przejść od razu do formularza ręcznego.
                    </span>
                    <button
                      type="button"
                      onClick={handleParseMail}
                      disabled={!rawMailText.trim()}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-900/20 transition cursor-pointer"
                    >
                      <Sparkles size={15} />
                      <span>Przetwórz i wyodrębnij metadane</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveMailEntry} className="space-y-4">
                  {/* Duplicate Detection Alert Banner */}
                  {duplicateWarning && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5 animate-in fade-in">
                      <div className="flex items-center gap-2 font-bold text-amber-800">
                        <AlertTriangle size={16} className="text-amber-600" />
                        <span>Wykryto potencjalny duplikat sprawy!</span>
                      </div>
                      <p className="text-[11.5px] text-amber-800 leading-relaxed">
                        W rejestrze istnieje już pismo o zbliżonym temacie i dacie: <br />
                        <strong className="font-mono">{duplicateWarning.id}</strong>: „{duplicateWarning.subject}” ({duplicateWarning.date}).
                      </p>
                      <div className="pt-1 flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setDuplicateWarning(null)}
                          className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-900 font-bold transition cursor-pointer"
                        >
                          ✓ Kontynuuj jako odpowiedź / uzupełnienie
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Row 1: Direction, Status, Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="mail-direction-select" className="text-xs font-bold text-slate-700 block mb-1">Kierunek pisma:</label>
                      <select
                        id="mail-direction-select"
                        name="mailDirection"
                        value={mailForm.direction}
                        onChange={(e) => setMailForm({ ...mailForm, direction: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="IN">📥 IN (Przychodzące)</option>
                        <option value="OUT">📤 OUT (Wychodzące)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="mail-status-select" className="text-xs font-bold text-slate-700 block mb-1">Status sprawy:</label>
                      <select
                        id="mail-status-select"
                        name="mailStatus"
                        value={mailForm.status || 'W toku'}
                        onChange={(e) => setMailForm({ ...mailForm, status: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="W toku">⏳ W toku</option>
                        <option value="Zatwierdzone">✅ Zatwierdzone</option>
                        <option value="Weryfikacja">🔍 Weryfikacja</option>
                        <option value="Zakończone">📦 Zakończone</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="mail-date-input" className="text-xs font-bold text-slate-700 block mb-1">Data wpływu/wysłania:</label>
                      <input
                        id="mail-date-input"
                        name="mailDate"
                        type="date"
                        required
                        value={mailForm.date}
                        onChange={(e) => setMailForm({ ...mailForm, date: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Row 2: Sygnatura */}
                  <div>
                    <label htmlFor="mail-id-input" className="text-xs font-bold text-slate-700 block mb-1">Sygnatura Kancelaryjna:</label>
                    <input
                      id="mail-id-input"
                      name="mailId"
                      type="text"
                      required
                      value={mailForm.id}
                      onChange={(e) => setMailForm({ ...mailForm, id: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-indigo-950 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Row 3: Nadawca i Odbiorca */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="mail-sender-input" className="text-xs font-bold text-slate-700 block mb-1">Nadawca:</label>
                      <input
                        id="mail-sender-input"
                        name="mailSender"
                        type="text"
                        required
                        value={mailForm.sender}
                        onChange={(e) => setMailForm({ ...mailForm, sender: e.target.value })}
                        placeholder="np. Dziekanat WNS <dziekanat@wskz.pl>"
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="mail-recipient-input" className="text-xs font-bold text-slate-700 block mb-1">Odbiorca / Adresat:</label>
                      <input
                        id="mail-recipient-input"
                        name="mailRecipient"
                        type="text"
                        required
                        value={mailForm.recipient}
                        onChange={(e) => setMailForm({ ...mailForm, recipient: e.target.value })}
                        placeholder="np. Zarząd Koła <sknu@student.wskz.pl>"
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Row 4: Temat */}
                  <div>
                    <label htmlFor="mail-subject-input" className="text-xs font-bold text-slate-700 block mb-1">Temat / Przedmiot Sprawy:</label>
                    <input
                      id="mail-subject-input"
                      name="mailSubject"
                      type="text"
                      required
                      value={mailForm.subject}
                      onChange={(e) => setMailForm({ ...mailForm, subject: e.target.value })}
                      placeholder="np. Zatwierdzenie wniosku o dofinansowanie"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Row 5: Treść */}
                  <div>
                    <label htmlFor="mail-summary-textarea" className="text-xs font-bold text-slate-700 block mb-1">Treść / Streszczenie Pisma:</label>
                    <textarea
                      id="mail-summary-textarea"
                      name="mailSummary"
                      rows={3}
                      value={mailForm.summary}
                      onChange={(e) => setMailForm({ ...mailForm, summary: e.target.value })}
                      placeholder="Podsumowanie treści wiadomości lub postanowienia..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 resize-none focus:outline-none focus:border-indigo-500 font-sans"
                    />
                  </div>

                  {/* Row 6: Link do skanu Google Drive */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="modal-mail-drive-link" className="text-xs font-bold text-slate-700 block">
                        Link do skanu / załącznika w Google Drive (opcjonalnie):
                      </label>
                      {driveFolderUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(driveFolderUrl, '_blank')}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors py-0.5 px-2 rounded-md hover:bg-slate-100 cursor-pointer"
                        >
                          <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                          <span>Otwórz Dysk Koła</span>
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="modal-mail-drive-link"
                        name="mailDriveLink"
                        type="url"
                        value={mailForm.driveLink || ''}
                        onChange={(e) => setMailForm({ ...mailForm, driveLink: e.target.value })}
                        placeholder={driveFolderUrl || "https://drive.google.com/file/d/..."}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    {mailForm.driveLink && extractGoogleDriveFileId(mailForm.driveLink) && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
                        <FileCheck size={12} className="shrink-0 text-indigo-600" />
                        <span>Wykryto identyfikator pliku: <strong className="font-mono">{extractGoogleDriveFileId(mailForm.driveLink)}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setMailModalTab('parser')}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      ← Wróć do wklejania maila
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMailModalOpen(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                      >
                        Anuluj
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingMail}
                        className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        {isSavingMail ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Zapisywanie w chmurze...</span>
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            <span>Zapisz w Dzienniku Podawczym</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── SLIDE-OVER DRAWER: PODGLĄD PISMA (SZUFLADA BOCZNA) ─────────────── */}
      {viewingMailEntry && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setViewingMailEntry(null)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-xl sm:max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col z-50 animate-in slide-in-from-right duration-200 font-sans">
            {/* Drawer Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                  <Mail size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold font-mono text-indigo-200 tracking-tight">
                      {viewingMailEntry.id}
                    </span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      viewingMailEntry.direction === 'IN'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    }`}>
                      {viewingMailEntry.direction === 'IN' ? '📥 PRZYCHODZĄCE (IN)' : '📤 WYCHODZĄCE (OUT)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Karta sprawy • {currentOrg?.name || 'Kancelaria Koła'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingMailEntry(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                title="Zamknij panel podglądu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs text-slate-800">
              {/* Quick Status Bar & Date */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Status selection */}
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-[11px] font-bold uppercase text-slate-500 shrink-0">
                      Status sprawy:
                    </label>
                    <select
                      value={viewingMailEntry.status || 'W toku'}
                      onChange={(e) => handleUpdateMailStatus(viewingMailEntry.id, e.target.value)}
                      className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-2xs"
                    >
                      <option value="W toku">⏳ W toku</option>
                      <option value="Zatwierdzone">✅ Zatwierdzone</option>
                      <option value="Weryfikacja">🔍 Weryfikacja</option>
                      <option value="Zakończone">📦 Zakończone</option>
                    </select>
                  </div>

                  {/* Date */}
                  <div className="flex flex-col sm:items-end text-slate-600 font-mono shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Calendar size={13} className="text-indigo-600" />
                      <span>Data wpływu: {viewingMailEntry.date || viewingMailEntry.dataWplywu || '—'}</span>
                    </div>
                    {(viewingMailEntry.dataAktualizacji || viewingMailEntry.updatedAt) && (
                      <div className="text-[10.5px] text-slate-400 font-sans">
                        Rejestracja w systemie: {viewingMailEntry.dataAktualizacji || viewingMailEntry.updatedAt}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sender & Recipient Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Inbox size={11} className="text-emerald-600" /> Nadawca:
                  </span>
                  <p className="font-semibold text-slate-900 text-xs break-words">{viewingMailEntry.sender}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Send size={11} className="text-sky-600" /> Odbiorca / Adresat:
                  </span>
                  <p className="font-semibold text-slate-900 text-xs break-words">{viewingMailEntry.recipient}</p>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Temat / Przedmiot sprawy:
                </span>
                <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <h4 className="font-bold text-sm text-slate-900 leading-snug">{viewingMailEntry.subject}</h4>
                </div>
              </div>

              {/* Summary / Full Content */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Treść / Streszczenie pisma:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`[${viewingMailEntry.id}] ${viewingMailEntry.subject}\nNadawca: ${viewingMailEntry.sender}\nOdbiorca: ${viewingMailEntry.recipient}\nData: ${viewingMailEntry.date}\nStatus: ${viewingMailEntry.status}\n\n${viewingMailEntry.summary || ''}`);
                      showToast('Skopiowano treść pisma do schowka!');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>Kopiuj</span>
                  </button>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 leading-relaxed font-sans whitespace-pre-wrap min-h-[140px] shadow-inner text-xs">
                  {viewingMailEntry.summary || 'Brak dodatkowej treści lub streszczenia pisma.'}
                </div>
              </div>

              {/* Scan / Attachment Link */}
              {(viewingMailEntry.driveLink || viewingMailEntry.driveUrl) && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCheck size={16} className="text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-emerald-950 text-xs">Dołączony skan / dokument elektroniczny</p>
                      <p className="text-[11px] text-emerald-700 truncate font-mono">{viewingMailEntry.driveLink || viewingMailEntry.driveUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDocModal({
                        isOpen: true,
                        documentTitle: viewingMailEntry.subject || viewingMailEntry.przedmiot,
                        documentCode: viewingMailEntry.id || viewingMailEntry.sygnatura,
                        driveUrl: viewingMailEntry.driveLink || viewingMailEntry.driveUrl,
                      })}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                      title="Podgląd dokumentu w aplikacji"
                    >
                      <Eye size={12} />
                      <span>Podgląd</span>
                    </button>
                    <a
                      href={viewingMailEntry.driveLink || viewingMailEntry.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 shrink-0 transition shadow-2xs"
                    >
                      <span>Dysk</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const item = viewingMailEntry;
                    setViewingMailEntry(null);
                    handleOpenMailModal(item);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-600 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Edytuj dane pisma"
                >
                  <Edit3 size={13} />
                  <span>Edytuj</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const idToDelete = viewingMailEntry.id;
                    setViewingMailEntry(null);
                    handleDeleteMailEntry(idToDelete);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-600 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Usuń pismo z rejestru"
                >
                  <Trash2 size={13} />
                  <span>Usuń</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintCorrespondence}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Eksportuj lub drukuj oficjalny dziennik do PDF"
                >
                  <Printer size={13} />
                  <span>Drukuj PDF</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingMailEntry(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer shadow-xs"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: WELCOME & NOTIFICATION MAIL ───────────────────────────────── */}
      <WelcomeMailModal
        isOpen={isWelcomeMailModalOpen}
        onClose={() => setIsWelcomeMailModalOpen(false)}
        onRegistered={() => {
          setCorrespondenceLog(getCorrespondenceLog(currentOrg?.id || 'skn-psychoonkologia'));
        }}
      />

      {/* ── PRINTABLE CORRESPONDENCE PROTOCOL ─────────────────────────────────── */}
      {isPrintingCorrespondence && (
        <div id="correspondence-print-container" className="hidden print:block fixed inset-0 bg-white z-9999 p-0 m-0">
          <OfficialCorrespondenceProtocolTemplate
            correspondenceLog={filteredCorrespondence}
            org={currentOrg}
            academicYear={academicYear || getCurrentAcademicYear()}
            supervisors={supervisors}
          />
        </div>
      )}

      {/* ── MODAL: ADD / EDIT DOCUMENT ────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-start justify-center pt-6 sm:pt-10 p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden font-sans">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {editingDoc ? 'Edycja Dokumentu / Uchwały' : 'Rejestracja Nowego Dokumentu'}
                  </h3>
                  <p className="text-[11px] text-slate-400">{currentOrg.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDocument} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-4 sm:p-6 overflow-y-auto pr-2 flex-1 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="modal-doc-category-select" className="text-xs font-bold text-slate-700 block mb-1">Kategoria Dokumentu:</label>
                    <select
                      id="modal-doc-category-select"
                      name="docCategory"
                      value={formState.category}
                      onChange={(e) => handleModalCategoryChange(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Uchwały Zarządu">Uchwały Zarządu</option>
                      <option value="Protokoły Zebrań">Protokoły Zebrań</option>
                      <option value="Regulaminy i Statut">Regulaminy i Statut</option>
                      <option value="Wnioski i Granty">Wnioski i Granty</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="modal-doc-code-input" className="text-xs font-bold text-slate-700 block mb-1">Sygnatura / Nr Aktu:</label>
                    <input
                      id="modal-doc-code-input"
                      name="docCode"
                      type="text"
                      value={formState.code}
                      onChange={(e) => setFormState({ ...formState, code: e.target.value })}
                      placeholder="np. UCHWAŁA/SKNU/01/2026"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="modal-doc-title-input" className="text-xs font-bold text-slate-700 block mb-1">Tytuł / Przedmiot Dokumentu:</label>
                  <input
                    id="modal-doc-title-input"
                    name="docTitle"
                    type="text"
                    value={formState.title}
                    onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                    placeholder="Wpisz pełny tytuł uchwały lub protokołu..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="modal-doc-date-input" className="text-xs font-bold text-slate-700 block mb-1">Data Uchwalenia / Wydania:</label>
                    <input
                      id="modal-doc-date-input"
                      name="docDate"
                      type="date"
                      value={formState.date}
                      onChange={(e) => setFormState({ ...formState, date: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="modal-doc-status-select" className="text-xs font-bold text-slate-700 block mb-1">Status Obowiązywania:</label>
                    <select
                      id="modal-doc-status-select"
                      name="docStatus"
                      value={formState.status}
                      onChange={(e) => setFormState({ ...formState, status: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Obowiązujący">🟢 Obowiązujący</option>
                      <option value="W toku">🟡 W toku</option>
                      <option value="Zastąpiony">⚪ Zastąpiony</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="modal-doc-drive-url" className="text-xs font-bold text-slate-700 block cursor-pointer">
                      Link do pliku w Google Drive:
                    </label>
                    {driveFolderUrl && (
                      <button
                        type="button"
                        onClick={() => window.open(driveFolderUrl, '_blank')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors py-0.5 px-2 rounded-md hover:bg-slate-100 cursor-pointer"
                        title="Otwórz główny folder koła na Dysku Google"
                      >
                        <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                        <span>Otwórz Dysk Koła</span>
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="modal-doc-drive-url"
                      name="docDriveUrl"
                      type="url"
                      value={formState.driveUrl}
                      onChange={(e) => setFormState({ ...formState, driveUrl: e.target.value })}
                      placeholder="Wklej bezpośredni link do dokumentu (np. https://drive.google.com/file/d/...)"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  {formState.driveUrl && extractGoogleDriveFileId(formState.driveUrl) && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
                      <FileCheck size={12} className="shrink-0 text-indigo-600" />
                      <span>Wykryto identyfikator pliku: <strong className="font-mono">{extractGoogleDriveFileId(formState.driveUrl)}</strong></span>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="modal-doc-desc-textarea" className="text-xs font-bold text-slate-700 block mb-1">Notatka / Streszczenie Aktu:</label>
                  <textarea
                    id="modal-doc-desc-textarea"
                    name="docDescription"
                    rows={7}
                    value={formState.description}
                    onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                    placeholder="Opisz szczegółowo cel aktu prawno-organizacyjnego, ramowe postanowienia lub podsumowanie ustaleń..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed text-slate-900 font-sans min-h-[160px] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!formState.driveUrl || !formState.driveUrl.trim()}
                  onClick={() => {
                    if (!formState.driveUrl || !formState.driveUrl.trim()) return;
                    setPreviewDocModal({
                      isOpen: true,
                      documentTitle: formState.title || 'Podgląd dokumentu',
                      documentCode: formState.code || 'Dokument',
                      driveUrl: formState.driveUrl.trim(),
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-50"
                  title="Podgląd podpiętego dokumentu przed zapisem"
                >
                  <Eye size={14} className="shrink-0" />
                  <span>Podgląd dokumentu</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    Zapisz w Rejestrze
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT GOOGLE DRIVE URL ─────────────────────────────────────── */}
      {isEditingDriveModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden font-sans">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <HardDrive size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Konfiguracja Dysku Google</h3>
                  <p className="text-[11px] text-slate-400">{currentOrg.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingDriveModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDriveUrl} className="p-4 sm:p-6 space-y-4">
              <div>
                <label htmlFor="edit-drive-url-input" className="text-xs font-bold text-slate-700 block mb-1">
                  Adres URL głównego folderu Google Drive koła:
                </label>
                <input
                  id="edit-drive-url-input"
                  name="tempDriveUrl"
                  type="url"
                  value={tempDriveUrl}
                  onChange={(e) => setTempDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingDriveModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Zapisz URL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT STATUTE CONFIG ───────────────────────────────────────── */}
      {isEditingStatutModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden font-sans">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Edytuj link do Statutu Koła</h3>
                  <p className="text-[11px] text-slate-400">{currentOrg.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingStatutModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStatutConfig} className="p-4 sm:p-6 space-y-4">
              <div>
                <label htmlFor="edit-statut-url-input" className="text-xs font-bold text-slate-700 block mb-1">
                  Link do pliku Statutu na Google Drive:
                </label>
                <input
                  id="edit-statut-url-input"
                  name="statutUrl"
                  type="url"
                  value={tempStatutConfig.url}
                  onChange={(e) => setTempStatutConfig({ ...tempStatutConfig, url: e.target.value })}
                  placeholder="https://docs.google.com/document/d/... lub plik Drive"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="edit-statut-status-select" className="text-xs font-bold text-slate-700 block mb-1">
                  Status zatwierdzenia:
                </label>
                <select
                  id="edit-statut-status-select"
                  name="statutStatus"
                  value={tempStatutConfig.status}
                  onChange={(e) => setTempStatutConfig({ ...tempStatutConfig, status: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans focus:outline-none focus:border-emerald-500"
                >
                  <option value="Zatwierdzony przez Władze WSKZ">🟢 Zatwierdzony przez Władze WSKZ</option>
                  <option value="W trakcie aktualizacji">🟡 W trakcie aktualizacji</option>
                  <option value="Projekt">⚪ Projekt (Wersja robocza)</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-statut-desc-textarea" className="text-xs font-bold text-slate-700 block mb-1">
                  Krótki opis / data uchwalenia:
                </label>
                <textarea
                  id="edit-statut-desc-textarea"
                  name="statutDescription"
                  rows={3}
                  value={tempStatutConfig.description}
                  onChange={(e) => setTempStatutConfig({ ...tempStatutConfig, description: e.target.value })}
                  placeholder="Wpisz opis statutu lub datę jego uchwalenia..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans resize-none focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingStatutModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Zapisz zmiany
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: IN-APP DOCUMENT PREVIEW (IFRAME & DRIVE VIEWER) ─────────── */}
      <DocumentPreviewModal
        isOpen={!!previewDocModal}
        onClose={() => setPreviewDocModal(null)}
        documentTitle={previewDocModal?.documentTitle}
        documentCode={previewDocModal?.documentCode}
        driveUrl={previewDocModal?.driveUrl}
      />
    </div>
  );
}
