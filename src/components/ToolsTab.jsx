import { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Mail,
  FileText,
  ExternalLink,
  GraduationCap,
  Archive,
  UserX,
  Download,
  Send,
  CheckCircle,
  CheckCircle2,
} from 'lucide-react';
import { calculateCurrentStudyYear } from '../utils/academicYear';

const TYPE_COLOR = {
  PDF:  'bg-red-100 text-red-700',
  PPTX: 'bg-orange-100 text-orange-700',
  DOCX: 'bg-blue-100 text-blue-700',
};

export default function ToolsTab({ members, materials, meetings, onBulkMarkGraduates, onBulkArchiveGraduates }) {
  const [copied, setCopied] = useState(false);
  const [formatMode, setFormatMode] = useState('comma'); // 'comma' | 'lines'

  // 1. Aktywni członkowie (Zarządzanie, nie archiwalni, nie rezygnacja)
  const activeMembers = useMemo(
    () => (members || []).filter(m => (m.status === 'active' || !m.status) && !m.isArchived && m.status !== 'resigned' && m.status !== 'archived'),
    [members]
  );

  // 2. Aktywni członkowie posiadający ZGODĘ NA MAILING (unikalne adresy e-mail)
  const activeWithConsentMembers = useMemo(() => {
    const seenEmails = new Set();
    const result = [];

    activeMembers.forEach(m => {
      const email = (m.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) return;

      const hasConsent =
        m.zgodaNaMailing === 'Zgoda na mailing' ||
        (m.mailingConsent === true && m.zgodaNaMailing !== 'Brak zgody' && m.consentStatus !== 'Brak zgody');

      if (hasConsent && !seenEmails.has(email)) {
        seenEmails.add(email);
        result.push(m);
      }
    });

    return result;
  }, [activeMembers]);

  const commaSeparatedEmails = useMemo(
    () => activeWithConsentMembers.map(m => m.email.trim()).join(', '),
    [activeWithConsentMembers]
  );

  const linesSeparatedEmails = useMemo(
    () => activeWithConsentMembers.map(m => m.email.trim()).join('\n'),
    [activeWithConsentMembers]
  );

  const mailingListText = formatMode === 'comma' ? commaSeparatedEmails : linesSeparatedEmails;

  // Absolwenci (Auto-progresja)
  const graduates = useMemo(() => {
    return activeMembers.filter(m => {
      const info = calculateCurrentStudyYear(m.rawTimestamp || m.timestamp, m.year, m.field);
      return info.isGraduate;
    });
  }, [activeMembers]);

  function copyEmails() {
    if (!mailingListText) return;
    navigator.clipboard.writeText(mailingListText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportTxt() {
    if (!linesSeparatedEmails) return;
    const blob = new Blob([linesSeparatedEmails], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista_mailingowa_kola_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!activeWithConsentMembers.length) return;
    const header = 'Imię;Nazwisko;Email;Numer Indeksu;Kierunek;Rok Studiów\n';
    const rows = activeWithConsentMembers.map(m => {
      const fn = m.firstName || m.fullName?.split(' ')[0] || '';
      const ln = m.lastName || m.fullName?.split(' ').slice(1).join(' ') || '';
      const em = m.email || '';
      const idx = m.index || '';
      const fld = m.field || '';
      const yr = m.year || '';
      return `"${fn}";"${ln}";"${em}";"${idx}";"${fld}";"${yr}"`;
    }).join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista_czlonkow_mailing_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getMeetingTitle(meetingId) {
    return meetings.find(m => m.id === meetingId)?.title ?? meetingId;
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 sm:space-y-6">
      {/* Graduate Detection & Database Cleaning Card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 md:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <GraduationCap size={22} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Automatyczna progresja & Wykrywanie absolwentów</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Wykrywa studentów, którzy przekroczyli nominalny czas trwania studiów (5 lat dla Psychologii / 3 lata dla Licencjatu)
              </p>
            </div>
          </div>

          {graduates.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {onBulkMarkGraduates && (
                <button
                  onClick={() => onBulkMarkGraduates(graduates.map(g => g.id))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-xs cursor-pointer"
                >
                  <UserX size={14} />
                  <span>Oznacz jako Byłych ({graduates.length})</span>
                </button>
              )}
              {onBulkArchiveGraduates && (
                <button
                  onClick={() => onBulkArchiveGraduates(graduates.map(g => g.id))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 transition-all shadow-xs cursor-pointer"
                >
                  <Archive size={14} />
                  <span>Przenieś do Archiwum ({graduates.length})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {graduates.length === 0 ? (
          <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3.5 text-xs text-purple-800 flex items-center gap-2">
            <CheckCircle size={16} strokeWidth={2.2} className="text-emerald-600 shrink-0" />
            <span>Wszyscy aktywni członkowie koła mieszczą się w regulaminowym toku studiów. Brak zaległych absolwentów.</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Wykryci potencjalni absolwenci ({graduates.length}):
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {graduates.map(g => {
                const info = calculateCurrentStudyYear(g.rawTimestamp || g.timestamp, g.year, g.field);
                return (
                  <div key={g.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 truncate">{g.fullName || g.firstName}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {g.field || 'Psychologia'} • Indeks: {g.index || 'Brak'} • Zgłoszenie: {g.timestamp || 'Brak daty'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        {info.originalYear ? `Rok ${info.originalYear} ➔ Absolwent` : 'Absolwent'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Sekcja Mailing ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Mail size={18} className="text-indigo-600" />
              <span>Lista Mailingowa Koła</span>
            </h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={13} />
              <span>{activeWithConsentMembers.length} unikalnych ze zgodą</span>
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            {/* Header with info & Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Gotowa lista: {activeWithConsentMembers.length} unikalnych odbiorców
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tylko aktywni członkowie koła z potwierdzoną zgodą na mailing ({activeWithConsentMembers.length} ze {activeMembers.length} aktywnych członków).
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <button
                  onClick={copyEmails}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                    copied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Kopiuj listę adresów e-mail do schowka"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Skopiowano!' : 'Kopiuj e-maile'}</span>
                </button>

                <button
                  onClick={exportTxt}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-2xs cursor-pointer"
                  title="Pobierz listę jako plik TXT"
                >
                  <Download size={13} />
                  <span>TXT</span>
                </button>

                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-2xs cursor-pointer"
                  title="Pobierz zestawienie jako CSV"
                >
                  <Download size={13} />
                  <span>CSV</span>
                </button>

                {commaSeparatedEmails && (
                  <a
                    href={`mailto:?bcc=${encodeURIComponent(commaSeparatedEmails)}`}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors shadow-2xs"
                    title="Otwórz klienta poczty z adresami w UDW / BCC"
                  >
                    <Send size={13} />
                    <span>UDW</span>
                  </a>
                )}
              </div>
            </div>

            {/* Format Selector Toggle */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-600">Format generowania:</span>
              <div className="inline-flex p-0.5 rounded-lg bg-slate-100 text-slate-600">
                <button
                  onClick={() => setFormatMode('comma')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    formatMode === 'comma'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Przecinki (UDW / BCC)
                </button>
                <button
                  onClick={() => setFormatMode('lines')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    formatMode === 'lines'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Linia po linii
                </button>
              </div>
            </div>

            {/* Text Preview Area */}
            <div className="bg-slate-50 rounded-xl p-3 text-xs font-mono text-slate-600 break-all max-h-36 overflow-y-auto leading-relaxed border border-slate-200/80">
              {mailingListText || <span className="text-slate-300 italic">Brak aktywnych adresów ze zgodą</span>}
            </div>

            {/* Detailed Member List */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Uprawnieni odbiorcy ({activeWithConsentMembers.length}):
                </p>
                <span className="text-[11px] text-slate-400">
                  Wyłącznie status aktywny + zgoda
                </span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {activeWithConsentMembers.map((m, idx) => (
                  <div key={m.id || idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100 text-xs hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail size={12} className="text-indigo-500 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{m.fullName || `${m.firstName} ${m.lastName}`}</span>
                      <span className="text-slate-400 font-mono text-[11px] truncate">({m.email})</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.index && (
                        <span className="text-[10px] text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          #{m.index}
                        </span>
                      )}
                      <span className="text-emerald-600 text-xs font-bold" title="Zgoda na mailing aktywna">✓</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Materials */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Materiały dydaktyczne</h2>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            {materials.map(mat => (
              <div key={mat.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                <FileText size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{mat.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{getMeetingTitle(mat.meeting)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${TYPE_COLOR[mat.type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {mat.type}
                  </span>
                  <a
                    href={mat.link}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 hover:text-indigo-600"
                    target="_blank" rel="noreferrer"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
