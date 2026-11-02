import React, { useState } from 'react';
import { showToast } from '../utils/toast';
import {
  X,
  Plus,
  Building2,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Pencil,
  RotateCcw,
  Check,
  Globe,
  Tag,
  ExternalLink,
  Shield,
  Layers,
} from 'lucide-react';
import { useOrg } from '../context/OrgContext';
import { testSheetConnection, extractSheetId } from '../services/googleSheets';

export default function SettingsModal({ isOpen, onClose }) {
  const {
    organizations,
    currentOrg,
    currentOrgId,
    switchOrg,
    addOrganization,
    updateOrganization,
    deleteOrganization,
  } = useOrg();

  const [view, setView] = useState('list'); // 'list' | 'add' | 'edit'
  const [editingOrgId, setEditingOrgId] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    tag: 'WSKZ',
    sheetId: '',
    calendarKey: 'ks9aiux4jiza1ronpd',
    subcalendarName: '',
    description: '',
  });

  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      shortName: '',
      tag: 'WSKZ',
      sheetId: '',
      calendarKey: 'ks9aiux4jiza1ronpd',
      subcalendarName: '',
      description: '',
    });
    setTestResult(null);
    setFormError('');
    setView('add');
  };

  const handleOpenEdit = (org) => {
    setEditingOrgId(org.id);
    setFormData({
      name: org.name || '',
      shortName: org.shortName || '',
      tag: org.tag || 'WSKZ',
      sheetId: org.sheetId || '',
      calendarKey: org.calendarKey || 'ks9aiux4jiza1ronpd',
      subcalendarName: org.subcalendarName || '',
      description: org.description || '',
    });
    setTestResult(null);
    setFormError('');
    setView('edit');
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await testSheetConnection(formData.sheetId.trim());
      if (res.ok) {
        setTestResult({ ok: true, message: `Połączono pomyślnie z bazą Supabase (${res.rowCount} rekordów)!` });
      } else {
        setTestResult({
          ok: false,
          error: res.error || 'Nie udało się połączyć z bazą Supabase.'
        });
      }
    } catch (err) {
      console.error('Test connection failed:', err);
      setTestResult({
        ok: false,
        error: 'Nie udało się połączyć z bazą Supabase.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Nazwa koła naukowego jest wymagana');
      return;
    }
    if (!formData.sheetId.trim()) {
      setFormError('ID lub link do Arkusza Google jest wymagany');
      return;
    }

    const cleanSheetId = extractSheetId(formData.sheetId);

    if (view === 'add') {
      const addedOrg = addOrganization({
        ...formData,
        sheetId: cleanSheetId,
      });
      if (addedOrg?.id) {
        switchOrg(addedOrg.id);
      }
      if (onClose) onClose();
    } else if (view === 'edit' && editingOrgId) {
      updateOrganization(editingOrgId, {
        ...formData,
        sheetId: cleanSheetId,
      });
      setView('list');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Centrum Zarządzania Kołami</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 rounded-full">
                  Multi-Tenant
                </span>
              </h2>
              <p className="text-xs text-slate-300">Konfiguracja niezależnych przestrzeni roboczych, arkuszy i kalendarzy</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-4 md:p-6 overflow-y-auto space-y-4 sm:space-y-6">

          {/* VIEW: LIST OF ORGANIZATIONS */}
          {view === 'list' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Skonfigurowane Koła Naukowe ({organizations.length})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Wybierz aktywne koło lub dodaj nową organizację z osobnym arkuszem</p>
                </div>

                <button
                  onClick={handleOpenAdd}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Dodaj nowe koło</span>
                </button>
              </div>

              {/* Organization Cards */}
              <div className="space-y-3">
                {organizations.map(org => {
                  const isActive = org.id === currentOrgId;

                  return (
                    <div
                      key={org.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50/40 shadow-sm ring-2 ring-indigo-200/70'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{org.name}</span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                              {org.tag || 'WSKZ'}
                            </span>
                            {org.isDefault && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Domyślne
                              </span>
                            )}
                            {isActive && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-2xs">
                                <Check size={11} />
                                Aktywne
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <FileSpreadsheet size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate max-w-[200px]" title={org.sheetId}>Arkusz: {org.sheetId.slice(0, 16)}...</span>
                            </span>
                            {org.subcalendarName && (
                              <span className="flex items-center gap-1">
                                <Calendar size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate max-w-[180px]">{org.subcalendarName}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {!isActive && (
                            <button
                              onClick={() => switchOrg(org.id)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white text-xs font-semibold transition cursor-pointer"
                            >
                              Przełącz
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenEdit(org)}
                            className="p-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                            title="Edytuj parametry koła"
                          >
                            <Pencil size={14} />
                          </button>

                          {!org.isDefault && (
                            <button
                              onClick={() => {
                                deleteOrganization(org.id);
                                showToast(`Koło "${org.name}" zostało usunięte.`);
                              }}
                              className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="Usuń koło naukowe"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Information Note */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Shield size={14} className="text-indigo-600" />
                  <span>Izolacja danych i bezpieczeństwo</span>
                </div>
                <p className="leading-relaxed">
                  Każde koło posiada odizolowaną pamięć podręczną (localStorage). Wszystkie ręczne archiwizacje, duplikaty, kategoryzacje spotkań oraz statusy członków są zapisywane z unikalnym prefiksem organizacji i nigdy się nie mieszają.
                </p>
              </div>
            </div>
          )}

          {/* VIEW: ADD OR EDIT ORGANIZATION FORM */}
          {(view === 'add' || view === 'edit') && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">
                  {view === 'add' ? '➕ Dodaj nowe koło naukowe' : `✏️ Edycja: ${formData.name || 'Koło'}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Wróć do listy
                </button>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pełna nazwa koła naukowego *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="np. Koło Naukowe Psychoterapii i Psychologii Klinicznej"
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Skrócona nazwa (w nagłówku)
                  </label>
                  <input
                    type="text"
                    value={formData.shortName}
                    onChange={e => setFormData({ ...formData, shortName: e.target.value })}
                    placeholder="np. KN Psychoterapii"
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jednostka / Uczelnia (Tag)
                  </label>
                  <input
                    type="text"
                    value={formData.tag}
                    onChange={e => setFormData({ ...formData, tag: e.target.value })}
                    placeholder="np. WSKZ"
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ID Arkusza Google lub Link do Arkusza *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={formData.sheetId}
                      onChange={e => {
                        setFormData({ ...formData, sheetId: e.target.value });
                        setTestResult(null);
                      }}
                      placeholder="np. 1EnAbs-UGlGeiWbM91gbXJGPTNWJarbkttY8KeM6HkhI"
                      className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing || !formData.sheetId}
                      className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {testing ? 'Testowanie…' : 'Testuj połączenie'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Arkusz musi mieć udostępniony podgląd dla każdego posiadającego link oraz zakładkę o nazwie <strong>Zarządzanie</strong>.
                  </p>
                </div>

                {/* Test connection feedback */}
                {testResult && (
                  <div className={`sm:col-span-2 p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    testResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {testResult.ok ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                    )}
                    <span>{testResult.ok ? testResult.message : `Błąd połączenia: ${testResult.error}`}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Klucz kalendarza Teamup
                  </label>
                  <input
                    type="text"
                    value={formData.calendarKey}
                    onChange={e => setFormData({ ...formData, calendarKey: e.target.value })}
                    placeholder="np. ks9aiux4jiza1ronpd"
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nazwa podkalendarza
                  </label>
                  <input
                    type="text"
                    value={formData.subcalendarName}
                    onChange={e => setFormData({ ...formData, subcalendarName: e.target.value })}
                    placeholder="np. SKN Seksuologii"
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Krótki opis / notatka
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Opcjonalny opis koła..."
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                >
                  Anuluj
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  {view === 'add' ? 'Dodaj i aktywuj koło' : 'Zapisz zmiany'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
