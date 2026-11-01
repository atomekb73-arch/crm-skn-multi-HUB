import React, { useState, useEffect, useMemo } from 'react';
import { showToast } from '../utils/toast';
import {
  Mail,
  Send,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  User,
  Hash,
  BookOpen,
  Calendar,
  Layers,
  FileText,
  Eye,
  PenLine,
  AtSign,
  ArrowRight,
  Globe,
  UserCheck,
  Award,
  PenTool,
} from 'lucide-react';
import { useOrg } from '../context/OrgContext';
import {
  getEmailConfig,
  getCorrespondenceLog,
  addCorrespondenceEntry,
} from '../utils/storage';
import { fetchEmailConfigFromDB } from '../services/settingsService';

const EMAIL_TEMPLATES = {
  welcome: {
    id: 'welcome',
    name: 'Powitanie & Potwierdzenie',
    icon: UserCheck,
    badge: 'Kwarantanna / Nowy członek',
    subject: 'Potwierdzenie przyjęcia zgłoszenia i powitanie w {ORGANIZACJA}',
    body: `Dzień dobry {IMIE},

Z radością informujemy, że Twoje zgłoszenie do {ORGANIZACJA} na rok akademicki {ROK_AKADEMICKI} zostało pomyślnie zweryfikowane i przyjęte!

Twoje dane ewidencyjne w systemie CRM:
• Imię i nazwisko: {IMIE_NAZWISKO}
• Kierunek: {KIERUNEK} ({ROK})
• Numer indeksu: {INDEKS}

Najważniejsze informacje organizacyjne:
1. Harmonogram spotkań, sesji seminaryjnych oraz warsztatów merytorycznych dostępny jest w kalendarzu koła.
2. Udział w spotkaniach i aktywność naukowa są na bieżąco ewidencjonowane w systemie CRM.
3. W razie jakichkolwiek pytań zachęcamy do kontaktu mailowego z Zarządem Koła.

Serdecznie witamy w naszym zespole i życzymy owocnej pracy naukowej!

{PODPIS}`,
  },
  meeting: {
    id: 'meeting',
    name: 'Zaproszenie na spotkanie',
    icon: Calendar,
    badge: 'Seminaria / Journal Club',
    subject: 'Zaproszenie na spotkanie naukowe {ORGANIZACJA}',
    body: `Dzień dobry {IMIE},

Serdecznie zapraszamy do udziału w najbliższym spotkaniu naukowym {ORGANIZACJA}.

Szczegóły spotkania:
• Data i godzina: [Wpisz datę i godzinę spotkania]
• Temat przewodni: [Wpisz temat wystąpienia/seminarium]
• Prowadzący / Prelegenci: [Wpisz prelegentów]
• Link do spotkania (Google Meet / Sala): [Wklej link]

Przypominamy, że obecność jest ewidencjonowana na podstawie aktywnego udziału i generuje punkty aktywności naukowej.

Do zobaczenia na spotkaniu!

{PODPIS}`,
  },
  certificate: {
    id: 'certificate',
    name: 'Informacja o zaświadczeniu',
    icon: Award,
    badge: 'Certyfikacja & Oceny',
    subject: 'Informacja o statusie członkowskim i zaświadczeniu – {ORGANIZACJA}',
    body: `Dzień dobry {IMIE},

Informujemy, że Twoje podsumowanie aktywności naukowej w {ORGANIZACJA} za bieżący okres zostało zaktualizowane w systemie CRM.

• Student: {IMIE_NAZWISKO} (indeks: {INDEKS})
• Status: Aktywny Członek Koła Naukowego

Oficjalne zaświadczenia z podpisami Opiekunów Naukowych oraz Zarządu Koła są generowane zgodnie z regulaminem działalności.

W razie pytań dotyczących punktacji lub dokumentacji prosimy o kontakt zwrotny.

{PODPIS}`,
  },
  custom: {
    id: 'custom',
    name: 'Własna wiadomość',
    icon: PenTool,
    badge: 'Niestandardowa korespondencja',
    subject: 'Wiadomość od Zarządu {ORGANIZACJA}',
    body: `Dzień dobry {IMIE},

[Wpisz treść wiadomości...]

{PODPIS}`,
  },
};

function getMemberData(m) {
  if (!m) return null;
  const rawName = (
    m.imieNazwisko ||
    m.fullName ||
    m.name ||
    `${m.firstName || ''} ${m.lastName || ''}`.trim() ||
    ''
  ).trim();
  const email = (m.email || m.mail || '').trim();
  const index = String(m.nrIndeksu || m.index || m.cleanIndex || '').trim();
  const field = (m.kierunek || m.field || m.kierunekRok?.split('/')[0]?.trim() || 'Psychologia').trim();
  const rawYear = (m.rokStudiow || m.year || m.kierunekRok?.split('/')[1]?.trim() || 'Rok 2').trim();
  const year = String(rawYear).toLowerCase().includes('rok') ? rawYear : `${rawYear} rok`;
  const academicYear = m.academicYear || m.rokAkademicki || '2026/2027';

  // First name for greeting
  const firstName = m.firstName || (rawName ? rawName.split(/\s+/)[0] : 'Studencie');
  const lastName = m.lastName || (rawName ? rawName.split(/\s+/).slice(1).join(' ') : '');

  return {
    name: rawName || 'Student',
    firstName,
    lastName,
    email,
    index: index || '—',
    field,
    year,
    academicYear,
  };
}

export default function WelcomeMailModal({
  isOpen,
  onClose,
  member = null,
  members = [],
  onRegistered = null,
  onApproveMember = null,
  initialTemplateKey = 'welcome',
}) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id || 'skn-psychoonkologia';
  const orgName = currentOrg?.name || 'Studenckie Koło Naukowe Psychoonkologii WSKZ';

  // Email configuration from storage & Supabase SSOT
  const [emailConfig, setEmailConfig] = useState(() => getEmailConfig(orgId) || {});

  useEffect(() => {
    if (isOpen) {
      setEmailConfig(getEmailConfig(orgId) || {});
      fetchEmailConfigFromDB(orgId).then(res => {
        if (res.ok && res.config) {
          setEmailConfig(prev => ({ ...prev, ...res.config }));
        }
      }).catch(console.warn);
    }
  }, [isOpen, orgId]);

  // Initial extracted recipient data
  const initialData = useMemo(() => getMemberData(member), [member]);

  // Selected recipient state
  const [selectedMember, setSelectedMember] = useState(member);
  const [customRecipientEmail, setCustomRecipientEmail] = useState(() => initialData?.email || '');
  const [customRecipientName, setCustomRecipientName] = useState(() => initialData?.name || '');
  const [customRecipientIndex, setCustomRecipientIndex] = useState(() => (initialData?.index === '—' ? '' : initialData?.index) || '');
  const [customRecipientField, setCustomRecipientField] = useState(() => initialData?.field || 'Psychologia');
  const [customRecipientYear, setCustomRecipientYear] = useState(() => initialData?.year || 'I rok');
  const [customRecipientAcademicYear, setCustomRecipientAcademicYear] = useState(() => initialData?.academicYear || '2026/2027');

  // Selected template & custom text state
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(initialTemplateKey);
  const [activeTab, setActiveTab] = useState('compose'); // 'compose' | 'preview'
  const [copiedField, setCopiedField] = useState(null);
  const [registeredEntry, setRegisteredEntry] = useState(null);
  const [approveOnSend, setApproveOnSend] = useState(true);
  const [actionFeedback, setActionFeedback] = useState(null);

  const webmailUrl = emailConfig?.webmailUrl || 'https://137.74.6.65:8080/webmail/';
  const preferredMailClient = emailConfig?.preferredMailClient || 'gmail';

  // Sync recipient when member prop changes or modal opens
  useEffect(() => {
    if (member) {
      setSelectedMember(member);
      const data = getMemberData(member);
      setCustomRecipientEmail(data.email);
      setCustomRecipientName(data.name);
      setCustomRecipientIndex(data.index === '—' ? '' : data.index);
      setCustomRecipientField(data.field);
      setCustomRecipientYear(data.year);
      setCustomRecipientAcademicYear(data.academicYear);
    } else {
      setSelectedMember(null);
      setCustomRecipientEmail('');
      setCustomRecipientName('');
      setCustomRecipientIndex('');
      setCustomRecipientField('Psychologia');
      setCustomRecipientYear('I rok');
      setCustomRecipientAcademicYear('2026/2027');
    }
    setRegisteredEntry(null);
    setCopiedField(null);
    setActionFeedback(null);
  }, [member, isOpen]);

  const recipientFullName = useMemo(() => {
    const fromMember = selectedMember ? getMemberData(selectedMember)?.name : '';
    return customRecipientName || fromMember || 'Członku Koła';
  }, [selectedMember, customRecipientName]);

  const recipientFirstName = useMemo(() => {
    const raw = recipientFullName.trim();
    if (!raw || raw === 'Członku Koła') return 'Studencie';
    return raw.split(/\s+/)[0] || 'Studencie';
  }, [recipientFullName]);

  const recipientLastName = useMemo(() => {
    const raw = recipientFullName.trim();
    if (!raw || raw === 'Członku Koła') return '';
    return raw.split(/\s+/).slice(1).join(' ') || '';
  }, [recipientFullName]);

  const recipientEmail = useMemo(() => {
    return customRecipientEmail || (selectedMember ? getMemberData(selectedMember)?.email : '') || '';
  }, [selectedMember, customRecipientEmail]);

  const recipientIndex = useMemo(() => {
    return customRecipientIndex || (selectedMember ? getMemberData(selectedMember)?.index : '') || '—';
  }, [selectedMember, customRecipientIndex]);

  const recipientField = useMemo(() => {
    return customRecipientField || (selectedMember ? getMemberData(selectedMember)?.field : '') || 'Psychologia';
  }, [selectedMember, customRecipientField]);

  const recipientYear = useMemo(() => {
    return customRecipientYear || (selectedMember ? getMemberData(selectedMember)?.year : '') || 'rok I';
  }, [selectedMember, customRecipientYear]);

  const recipientAcademicYear = useMemo(() => {
    return customRecipientAcademicYear || (selectedMember ? getMemberData(selectedMember)?.academicYear : '') || '2026/2027';
  }, [selectedMember, customRecipientAcademicYear]);

  // Replace placeholders helper
  const replaceTokens = (text) => {
    if (!text) return '';
    return text
      .replace(/{IMIE}/g, recipientFirstName || 'Studencie')
      .replace(/{IMIE_NAZWISKO}/g, recipientFullName)
      .replace(/{NAZWISKO}/g, recipientLastName || '')
      .replace(/{INDEKS}/g, recipientIndex)
      .replace(/{KIERUNEK}/g, recipientField)
      .replace(/{ROK}/g, recipientYear)
      .replace(/{ROK_AKADEMICKI}/g, recipientAcademicYear)
      .replace(/{ACADEMIC_YEAR}/g, recipientAcademicYear)
      .replace(/{ORGANIZACJA}/g, orgName)
      .replace(/{PODPIS}/g, emailConfig?.footerSignature || 'Z poważaniem,\nZarząd Koła Naukowego');
  };

  // Initial subject & body
  const [subjectText, setSubjectText] = useState(() => {
    const template = EMAIL_TEMPLATES[initialTemplateKey] || EMAIL_TEMPLATES.welcome;
    let rawSubject = template.subject;
    if (initialTemplateKey === 'welcome' && emailConfig?.welcomeSubjectTemplate) {
      rawSubject = emailConfig.welcomeSubjectTemplate;
    }
    return replaceTokens(rawSubject);
  });

  const [bodyText, setBodyText] = useState(() => {
    const template = EMAIL_TEMPLATES[initialTemplateKey] || EMAIL_TEMPLATES.welcome;
    let rawBody = template.body;
    if (initialTemplateKey === 'welcome' && emailConfig?.welcomeBodyTemplate) {
      rawBody = emailConfig.welcomeBodyTemplate;
    }
    return replaceTokens(rawBody);
  });

  // Re-generate template when template key changes, recipient changes, or modal opens
  useEffect(() => {
    const template = EMAIL_TEMPLATES[selectedTemplateKey] || EMAIL_TEMPLATES.welcome;
    let rawSubject = template.subject;
    let rawBody = template.body;

    // If using emailConfig customized welcome template and welcome template is selected
    if (selectedTemplateKey === 'welcome' && emailConfig?.welcomeSubjectTemplate) {
      rawSubject = emailConfig.welcomeSubjectTemplate;
    }
    if (selectedTemplateKey === 'welcome' && emailConfig?.welcomeBodyTemplate) {
      rawBody = emailConfig.welcomeBodyTemplate;
    }

    setSubjectText(replaceTokens(rawSubject));
    setBodyText(replaceTokens(rawBody));
  }, [
    selectedTemplateKey,
    selectedMember,
    customRecipientName,
    customRecipientEmail,
    customRecipientIndex,
    customRecipientField,
    customRecipientYear,
    customRecipientAcademicYear,
    emailConfig,
    recipientFirstName,
    recipientFullName,
    recipientLastName,
    recipientIndex,
    recipientField,
    recipientYear,
    recipientAcademicYear,
    orgName
  ]);

  if (!isOpen) return null;

  // Handlers
  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const createRegistryRecord = (channelLabel = 'Wysłano') => {
    const log = getCorrespondenceLog(orgId);
    const nextNum = String(log.length + 1).padStart(2, '0');
    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toISOString().split('T')[0];

    // Determine prefix based on org
    const orgCode = orgId.includes('seks') ? 'SEKS' : orgId.includes('uzal') || orgId.includes('sknu') ? 'SKNU' : 'PSY';
    const entryId = `KANC/${orgCode}/OUT/${nextNum}/${year}`;

    const senderFull = `${emailConfig?.senderName || 'Zarząd SKN'} <${emailConfig?.senderEmail || 'skn@wskz.pl'}>`;
    const recipientFull = `${recipientFullName} <${recipientEmail}>`;

    const newEntry = {
      id: entryId,
      date: dateStr,
      direction: 'OUT',
      sender: senderFull,
      recipient: recipientFull,
      subject: subjectText,
      summary: bodyText.slice(0, 350) + (bodyText.length > 350 ? '...' : ''),
      status: 'Zarejestrowane / Wysłane',
      fromSheet: 'Ewidencja_Poczty',
      notes: `Wygenerowano z szablonu [${EMAIL_TEMPLATES[selectedTemplateKey]?.name || 'Powiadomienie'}] w CRM (${channelLabel})`,
      createdAt: now.toISOString(),
    };

    addCorrespondenceEntry(orgId, newEntry);
    setRegisteredEntry(newEntry);
    if (onRegistered) onRegistered(newEntry);

    // If candidate from quarantine and approve option is enabled
    if (approveOnSend && onApproveMember && selectedMember?.id) {
      onApproveMember(selectedMember.id);
    }

    return newEntry;
  };

  /**
   * Wysyłka przez Gmail Web (mail.google.com)
   */
  const handleSendGmail = () => {
    if (!recipientEmail) {
      showToast('Brak adresu e-mail odbiorcy! Wpisz poprawny adres studenta.');
      return;
    }
    createRegistryRecord('Gmail Web');
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    setActionFeedback({
      type: 'success',
      message: 'Otwarto okno nowej wiadomości w Gmailu oraz zarejestrowano w Dzienniku Podawczym!'
    });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  /**
   * Wysyłka przez Poczta Koła (Webmail WSKZ Roundcube / cPanel)
   */
  const handleSendWebmail = () => {
    if (!recipientEmail) {
      showToast('Brak adresu e-mail odbiorcy! Wpisz poprawny adres studenta.');
      return;
    }
    // Copy body to clipboard for 100% paste reliability in webmail
    navigator.clipboard.writeText(bodyText);
    setCopiedField('body');
    setTimeout(() => setCopiedField(null), 3000);

    createRegistryRecord('Webmail WSKZ');

    const cleanBase = String(webmailUrl || 'https://137.74.6.65:8080/webmail/').replace(/\/$/, '');
    const webmailTargetUrl = `${cleanBase}/?_task=mail&_action=compose&_to=${encodeURIComponent(recipientEmail)}&_subject=${encodeURIComponent(subjectText)}`;
    window.open(webmailTargetUrl, '_blank', 'noopener,noreferrer');

    setActionFeedback({
      type: 'info',
      message: 'Treść wiadomości została skopiowana do schowka (Ctrl+V)! Otwieram Webmail Koła...'
    });
    setTimeout(() => setActionFeedback(null), 6000);
  };

  /**
   * Wysyłka przez systemowy klient mailto: (Outlook, Thunderbird, Poczta Windows)
   */
  const handleSendSystemMail = () => {
    if (!recipientEmail) {
      showToast('Brak adresu e-mail odbiorcy! Wpisz poprawny adres studenta.');
      return;
    }
    createRegistryRecord('Klient systemowy mailto');
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
    window.open(mailtoUrl, '_blank');
    setActionFeedback({
      type: 'success',
      message: 'Uruchomiono systemowy program pocztowy oraz zarejestrowano w Dzienniku Podawczym!'
    });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  /**
   * Rejestracja w arkuszu bez otwierania poczty
   */
  const handleRegisterOnly = () => {
    if (!recipientEmail) {
      showToast('Brak adresu e-mail odbiorcy!');
      return;
    }
    createRegistryRecord('Zarejestrowano bez otwierania poczty');
    setActionFeedback({
      type: 'success',
      message: 'Pismo zostało pomyślnie zarejestrowane w Dzienniku Podawczym!'
    });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handleOnlyRegister = handleRegisterOnly;

  /**
   * Półautomatyczne zatwierdzenie i wysłanie preferowanym kanałem
   */
  const handleConfirmAndSend = () => {
    if (preferredMailClient === 'gmail') {
      handleSendGmail();
    } else if (preferredMailClient === 'webmail') {
      handleSendWebmail();
    } else {
      handleSendSystemMail();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Dark backdrop with click-to-close */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        className="relative z-10 bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden font-sans my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Mail size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">
                  Podgląd i zatwierdzenie wysyłki wiadomości
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Ewidencja_Poczty
                </span>
              </div>
              <p className="text-xs text-indigo-200/70 mt-0.5">
                Półautomatyczna wysyłka z oficjalnego adresu koła oraz wpis do rejestru spraw
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Anuluj"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sender & Recipient Overview Bar */}
        <div className="bg-slate-100/90 border-b border-slate-200 p-3.5 px-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <AtSign size={13} />
            </div>
            <div>
              <span className="text-slate-500 font-medium">Nadawca: </span>
              <strong className="text-slate-800">{emailConfig?.senderName || 'Zarząd Koła'}</strong>{' '}
              <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 font-semibold">
                &lt;{emailConfig?.senderEmail || 'skn@wskz.pl'}&gt;
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <User size={13} />
            </div>
            <div>
              <span className="text-slate-500 font-medium">Adresat: </span>
              <strong className="text-slate-800">{recipientFullName}</strong>{' '}
              <span className="font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 font-semibold">
                &lt;{recipientEmail || 'brak adresu'}&gt;
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs inside modal */}
        <div className="px-5 pt-3 pb-0 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('compose')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'compose'
                  ? 'bg-white text-indigo-600 border-slate-200 -mb-px shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent'
              }`}
            >
              <PenLine size={14} />
              <span>Edycja & Parametry</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-indigo-600 border-slate-200 -mb-px shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent'
              }`}
            >
              <Eye size={14} />
              <span>Podgląd e-mail (Render)</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>Szablon: <strong>{EMAIL_TEMPLATES[selectedTemplateKey]?.name}</strong></span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Action Feedback Banner */}
          {actionFeedback && (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in shadow-xs ${
              actionFeedback.type === 'info'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className={actionFeedback.type === 'info' ? 'text-indigo-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                <div>{actionFeedback.message}</div>
              </div>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Success Banner */}
          {registeredEntry && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-900 flex items-center justify-between gap-3 animate-in fade-in shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <div>
                  <strong>Zatwierdzono i zarejestrowano!</strong> Sygnatura:{' '}
                  <span className="font-mono font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900">
                    {registeredEntry.id}
                  </span>{' '}
                  zapisana w karcie <strong className="font-mono text-emerald-800">Ewidencja_Poczty</strong>.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compose' ? (
            <div className="space-y-4">
              {/* Recipient Details & Switcher */}
              <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Dane Studenta / Adresata
                    </span>
                  </div>
                  {Array.isArray(members) && members.length > 0 && (
                    <div className="text-xs">
                      <select
                        value={selectedMember?.id || selectedMember?.nrIndeksu || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const found = members.find((m) => m && (m.id === val || m.nrIndeksu === val || m.memberKey === val));
                          if (found) {
                            setSelectedMember(found);
                            const data = getMemberData(found);
                            setCustomRecipientEmail(data.email);
                            setCustomRecipientName(data.name);
                            setCustomRecipientIndex(data.index === '—' ? '' : data.index);
                            setCustomRecipientField(data.field);
                            setCustomRecipientYear(data.year);
                            setCustomRecipientAcademicYear(data.academicYear);
                          }
                        }}
                        className="p-1 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium"
                      >
                        <option value="">-- Zmień studenta z bazy ({members.length}) --</option>
                        {members.filter(Boolean).map((m, idx) => {
                          const mId = m.id || m.memberKey || m.nrIndeksu || `m_${idx}`;
                          const mName = m.imieNazwisko || m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Student';
                          const mEmail = m.email || 'brak email';
                          return (
                            <option key={mId} value={mId}>
                              {mName} ({mEmail})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-1">
                    <label htmlFor="custom-recipient-name-input" className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                      Imię i Nazwisko:
                    </label>
                    <input
                      id="custom-recipient-name-input"
                      name="customRecipientName"
                      type="text"
                      value={customRecipientName}
                      onChange={(e) => setCustomRecipientName(e.target.value)}
                      placeholder="Imię i nazwisko"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label htmlFor="custom-recipient-email-input" className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                      Adres e-mail:
                    </label>
                    <input
                      id="custom-recipient-email-input"
                      name="customRecipientEmail"
                      type="email"
                      required
                      value={customRecipientEmail}
                      onChange={(e) => setCustomRecipientEmail(e.target.value)}
                      placeholder="student@student.wskz.pl"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label htmlFor="custom-recipient-index-input" className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                      Nr Indeksu:
                    </label>
                    <input
                      id="custom-recipient-index-input"
                      name="customRecipientIndex"
                      type="text"
                      value={customRecipientIndex}
                      onChange={(e) => setCustomRecipientIndex(e.target.value)}
                      placeholder="np. 34327"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Template Selector Pills */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center justify-between">
                  <span>Wybierz szablon wiadomości:</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Znaczniki {'{IMIE}'}, {'{INDEKS}'} podmieniane automatycznie
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {Object.values(EMAIL_TEMPLATES).map((tmpl) => {
                    const isSelected = selectedTemplateKey === tmpl.id;
                    const IconComponent = tmpl.icon || Mail;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedTemplateKey(tmpl.id)}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-indigo-50/90 border-indigo-400 text-indigo-950 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                            <IconComponent size={15} strokeWidth={2.2} />
                          </span>
                          <span className="text-xs font-bold leading-snug line-clamp-2">{tmpl.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{tmpl.badge}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="welcome-subject-input" className="text-xs font-bold text-slate-700">Temat wiadomości:</label>
                  <button
                    type="button"
                    onClick={() => handleCopy(subjectText, 'subject')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    {copiedField === 'subject' ? <Check size={14} strokeWidth={2.5} className="text-emerald-600 shrink-0" /> : <Copy size={14} strokeWidth={2.2} className="text-indigo-600 shrink-0" />}
                    <span>{copiedField === 'subject' ? 'Skopiowano temat!' : 'Kopiuj temat'}</span>
                  </button>
                </div>
                <input
                  id="welcome-subject-input"
                  name="welcomeSubject"
                  type="text"
                  required
                  value={subjectText}
                  onChange={(e) => setSubjectText(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Body Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="welcome-body-textarea" className="text-xs font-bold text-slate-700">Edytowalna treść wiadomości:</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(bodyText, 'body')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
                    >
                      {copiedField === 'body' ? <Check size={14} strokeWidth={2.5} className="text-emerald-600 shrink-0" /> : <Copy size={14} strokeWidth={2.2} className="text-indigo-600 shrink-0" />}
                      <span>{copiedField === 'body' ? 'Skopiowano treść!' : 'Kopiuj treść'}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  id="welcome-body-textarea"
                  name="welcomeBody"
                  rows={9}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-sans leading-relaxed focus:outline-none focus:border-indigo-500 resize-y font-normal"
                />
              </div>

              {/* Quarantine Auto-Approve Checkbox if applicable */}
              {onApproveMember && selectedMember?.id && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="autoApproveCheck"
                    checked={approveOnSend}
                    onChange={(e) => setApproveOnSend(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="autoApproveCheck" className="text-xs text-indigo-950 font-medium cursor-pointer">
                    Automatycznie zatwierdź kandydata do <strong>Zarządzania Bazy Członków</strong> po zatwierdzeniu wysyłki
                  </label>
                </div>
              )}
            </div>
          ) : (
            /* PREVIEW TAB */
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3.5">
                <div className="border-b border-slate-100 pb-3 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 w-16">Od:</span>
                    <span className="font-semibold text-slate-900">
                      {emailConfig?.senderName || 'Zarząd Koła'} &lt;{emailConfig?.senderEmail || 'skn@wskz.pl'}&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 w-16">Do:</span>
                    <span className="font-semibold text-indigo-700">
                      {recipientFullName} &lt;{recipientEmail || 'brak@email.com'}&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 w-16">Temat:</span>
                    <span className="font-bold text-slate-900">{subjectText}</span>
                  </div>
                </div>

                <div className="pt-2 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {bodyText}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 italic text-center">
                Wiadomość zostanie przygotowana do wysłania z programu pocztowego koła oraz wpisana do Dziennika Podawczego.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions (Multi-Channel Dispatch) */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 shrink-0">
          {/* Quick utility buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleCopy(`${subjectText}\n\n${bodyText}`, 'all')}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              title="Kopiuj temat i treść wiadomości"
            >
              {copiedField === 'all' ? (
                <Check size={16} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
              ) : (
                <Copy size={16} strokeWidth={2.2} className="text-slate-600 shrink-0" />
              )}
              <span>{copiedField === 'all' ? 'Skopiowano całość!' : 'Kopiuj całość'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopy(bodyText, 'body')}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              title="Kopiuj samą treść wiadomości"
            >
              {copiedField === 'body' ? (
                <Check size={16} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
              ) : (
                <Copy size={16} strokeWidth={2.2} className="text-slate-600 shrink-0" />
              )}
              <span>{copiedField === 'body' ? 'Skopiowano treść!' : 'Kopiuj treść'}</span>
            </button>

            <button
              type="button"
              onClick={handleRegisterOnly}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              title="Zarejestruj pismo w Dzienniku Podawczym bez otwierania poczty"
            >
              <FileSpreadsheet size={16} strokeWidth={2.2} className="text-slate-600 shrink-0" />
              <span>Tylko rejestruj</span>
            </button>
          </div>

          {/* Action dispatch buttons */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <X size={15} strokeWidth={2.2} className="shrink-0 text-slate-500" />
              <span>Anuluj</span>
            </button>

            {/* mailto: system client button */}
            <button
              type="button"
              onClick={handleSendSystemMail}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs ${
                preferredMailClient === 'system'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-500/20'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title="Otwórz w programie pocztowym (Outlook, Thunderbird, Poczta Windows)"
            >
              <Mail size={16} strokeWidth={2.2} className={`shrink-0 ${preferredMailClient === 'system' ? 'text-white' : 'text-slate-600'}`} />
              <span>Program (mailto)</span>
            </button>

            {/* Webmail Koła (Roundcube / WSKZ) button */}
            <button
              type="button"
              onClick={handleSendWebmail}
              className={`px-4 py-2 rounded-xl text-xs border flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs ${
                preferredMailClient === 'webmail'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 font-bold shadow-xs ring-2 ring-indigo-500/20'
                  : 'bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold'
              }`}
              title="Otwórz Webmail Koła (Roundcube WSKZ) i skopiuj treść do schowka"
            >
              <Globe size={16} strokeWidth={2.2} className={`shrink-0 ${preferredMailClient === 'webmail' ? 'text-white' : 'text-indigo-600'}`} />
              <span>Poczta Koła (Webmail)</span>
            </button>

            {/* Gmail Web Compose button */}
            <button
              type="button"
              onClick={handleSendGmail}
              className={`px-4 py-2 rounded-xl text-xs border flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs ${
                preferredMailClient === 'gmail'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 font-bold shadow-xs ring-2 ring-rose-500/20'
                  : 'bg-rose-50/90 hover:bg-rose-100 text-rose-700 border-rose-200 font-semibold'
              }`}
              title="Otwórz bezpośrednio w nowej karcie Gmaila"
            >
              <Send size={16} strokeWidth={2.2} className={`shrink-0 ${preferredMailClient === 'gmail' ? 'text-white' : 'text-rose-600'}`} />
              <span>Otwórz w Gmail</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
