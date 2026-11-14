import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldBan,
  Search,
  RefreshCw,
  X,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  Building2,
  Hash,
  Mail,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  GLOBAL_SUPERADMIN_EMAIL,
  fetchGlobalAccessMatrix,
  revokeUserClubAccess,
  restoreUserClubAccess,
} from '../services/settingsService';
import { WSKZ_ORGANIZATIONS } from '../config/wskzRegistry';
import AdminPanelPage from './AdminPanelPage';

export default function SuperAdminPanel({ isOpen, onClose, onPermissionsChanged }) {
  const { user, isSuperAdmin, hasFullAccess } = useAuth();
  const actorEmail = String(user?.email || '').trim().toLowerCase();
  const isAuthorizedSuperadmin = Boolean((isSuperAdmin || hasFullAccess) && actorEmail === GLOBAL_SUPERADMIN_EMAIL);

  const [activeTab, setActiveTab] = useState('rbac');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clubFilter, setClubFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [busyKey, setBusyKey] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Szybkie nadawanie dostępu z poziomu Superadmina
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantName, setGrantName] = useState('');
  const [grantOrgId, setGrantOrgId] = useState('skn_seksuologii');
  const [grantRole, setGrantRole] = useState('ADMIN');
  const [grantBusy, setGrantBusy] = useState(false);

  const activeClubs = useMemo(
    () => WSKZ_ORGANIZATIONS.filter(o => o.hasActiveCrm),
    []
  );

  const loadMatrix = useCallback(async () => {
    if (!isAuthorizedSuperadmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGlobalAccessMatrix(actorEmail);
      setMatrix(data);
    } catch (err) {
      setError(err?.message || 'Nie udało się pobrać globalnej macierzy dostępów.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorizedSuperadmin, actorEmail]);

  useEffect(() => {
    if (isOpen && isAuthorizedSuperadmin) {
      loadMatrix();
    }
  }, [isOpen, isAuthorizedSuperadmin, loadMatrix]);

  const handleRevoke = async (assignment) => {
    if (!isAuthorizedSuperadmin || !assignment) return;
    if (assignment.isProtectedSuperadmin || assignment.email === GLOBAL_SUPERADMIN_EMAIL) return;

    const confirmText = `Czy na pewno odebrać dostęp użytkownika ${assignment.email} do koła ${assignment.clubShortName}?\n\nSesja tego użytkownika dla tego koła zostanie zablokowana w Supabase.`;
    if (!window.confirm(confirmText)) return;

    setBusyKey(assignment.key);
    setActionFeedback(null);
    try {
      const res = await revokeUserClubAccess({
        orgId: assignment.orgId,
        email: assignment.email,
        memberName: assignment.name,
        role: assignment.primaryRole,
        actorEmail,
      });
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: res.error || 'Błąd odbierania dostępu.' });
      } else {
        setActionFeedback({
          type: 'success',
          text: `Zablokowano dostęp: ${assignment.email} → ${assignment.clubShortName}.`,
        });
        await loadMatrix();
        onPermissionsChanged?.();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestore = async (assignment) => {
    if (!isAuthorizedSuperadmin || !assignment) return;
    setBusyKey(assignment.key);
    setActionFeedback(null);
    try {
      const res = await restoreUserClubAccess({
        orgId: assignment.orgId,
        email: assignment.email,
        memberName: assignment.name,
        role: 'ADMIN',
        roleLabel: assignment.primaryRole || 'Dostęp przywrócony (Superadmin)',
        actorEmail,
      });
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: res.error || 'Nie udało się przywrócić dostępu.' });
      } else {
        setActionFeedback({
          type: 'success',
          text: `Przywrócono dostęp: ${assignment.email} → ${assignment.clubShortName}.`,
        });
        await loadMatrix();
        onPermissionsChanged?.();
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleGrantSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthorizedSuperadmin || !grantEmail.trim()) return;
    setGrantBusy(true);
    setActionFeedback(null);
    try {
      const roleLabels = {
        ADMIN: 'Dostęp pełny koła (Superadmin)',
        COORDINATOR: 'Dostęp zarządu (Superadmin)',
        VIEWER: 'Tylko odczyt (Superadmin)',
      };
      const res = await restoreUserClubAccess({
        orgId: grantOrgId,
        email: grantEmail.trim().toLowerCase(),
        memberName: grantName.trim(),
        role: grantRole,
        roleLabel: roleLabels[grantRole] || 'Dostęp koła',
        actorEmail,
      });
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: res.error || 'Nie udało się nadać dostępu.' });
      } else {
        setActionFeedback({
          type: 'success',
          text: `Nadano uprawnienia: ${grantEmail.trim().toLowerCase()} → ${grantOrgId}.`,
        });
        setGrantEmail('');
        setGrantName('');
        setShowGrantForm(false);
        await loadMatrix();
        onPermissionsChanged?.();
      }
    } finally {
      setGrantBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!matrix?.users) return [];
    const q = searchQuery.trim().toLowerCase();
    return matrix.users.filter(u => {
      if (q) {
        const hay = `${u.name || ''} ${u.email || ''} ${u.indexNumber || ''} ${(u.assignments || []).map(a => `${a.clubName} ${a.primaryRole} ${a.primarySource}`).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (clubFilter !== 'ALL') {
        if (u.isGlobalSuperadmin) return true;
        const matchesClub = (u.assignments || []).some(a => a.orgId === clubFilter);
        if (!matchesClub) return false;
      }

      if (statusFilter === 'ACTIVE') {
        return u.isGlobalSuperadmin || (u.assignments || []).some(a => a.status === 'active');
      }
      if (statusFilter === 'BLOCKED') {
        return (u.assignments || []).some(a => a.status === 'blocked');
      }
      if (statusFilter === 'INACTIVE') {
        return (u.assignments || []).some(a => a.status === 'inactive');
      }
      return true;
    });
  }, [matrix, searchQuery, clubFilter, statusFilter]);

  // Twarda blokada renderowania w DOM dla każdego konta innego niż atomekb73@gmail.com
  if (!isAuthorizedSuperadmin || !isOpen) {
    return null;
  }

  const stats = matrix?.stats || { totalUsers: 0, activeAssignments: 0, blockedAssignments: 0, anomalyCount: 0 };
  const anomalies = matrix?.anomalies || [];

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-7xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white px-5 py-4 flex items-center justify-between gap-4 border-b border-indigo-500/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Panel Administratora (RBAC) &amp; Izolacja Dostępów
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400/20 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
                  Wyłącznie {GLOBAL_SUPERADMIN_EMAIL}
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5 truncate">
                Zarządzanie kontami RBAC, przypisaniami do kół naukowych WSKZ, audyt anomalii i Kill Switch
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeTab === 'audit' && (
              <button
                type="button"
                onClick={loadMatrix}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Odśwież audyt</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition cursor-pointer"
              aria-label="Zamknij Panel Administratora"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('rbac')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'rbac'
                ? 'bg-indigo-500 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <UserPlus size={13} />
            <span>Panel Administratora (RBAC)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShieldAlert size={13} />
            <span>Audyt Anomalii &amp; Kill Switch</span>
            {stats.anomalyCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {stats.anomalyCount}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/70">
          {activeTab === 'rbac' ? (
            <AdminPanelPage
              onPermissionsChanged={() => {
                loadMatrix();
                onPermissionsChanged?.();
              }}
            />
          ) : (
            <>
          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Konta z rekordem</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalUsers}</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-emerald-200/80 shadow-2xs">
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Aktywne przypisania</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{stats.activeAssignments}</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-rose-200/80 shadow-2xs">
              <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Zablokowane (Kill Switch)</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{stats.blockedAssignments}</p>
            </div>
            <div className={`rounded-2xl p-3.5 border shadow-2xs ${
              stats.anomalyCount === 0
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-amber-50/80 border-amber-300'
            }`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${
                stats.anomalyCount === 0 ? 'text-emerald-700' : 'text-amber-800'
              }`}>
                Spójność izolacji kół
              </p>
              <div className="flex items-center gap-2 mt-1">
                {stats.anomalyCount === 0 ? (
                  <>
                    <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                    <span className="text-sm font-extrabold text-emerald-800">100% Spójna</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                    <span className="text-xl font-black text-amber-900">{stats.anomalyCount} uwag</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Feedback / Error Banner */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
              <ShieldAlert size={16} className="shrink-0 text-rose-600" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {actionFeedback && (
            <div className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              actionFeedback.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <span>{actionFeedback.text}</span>
              <button type="button" onClick={() => setActionFeedback(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Isolation Consistency Indicator Details */}
          {anomalies.length > 0 && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider">
                    Wykryte niezgodności / rekordy wymagające uwagi ({anomalies.length})
                  </h3>
                </div>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {anomalies.map(a => (
                  <div key={a.id} className="bg-white/90 border border-amber-200/80 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{a.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{a.description}</p>
                    </div>
                    {a.severity === 'high' && (
                      <button
                        type="button"
                        onClick={() => handleRevoke({
                          key: `${a.orgId}::${a.email}`,
                          orgId: a.orgId,
                          email: a.email,
                          clubShortName: a.orgId,
                          name: a.email,
                          primaryRole: 'Sierocy dostęp',
                        })}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer transition"
                      >
                        <ShieldBan size={12} />
                        <span>Zablokuj teraz</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar: Search, Filters & Grant Access */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Szukaj po imieniu, e-mailu, nr indeksu lub kole..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                  />
                </div>
                <select
                  value={clubFilter}
                  onChange={(e) => setClubFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="ALL">Wszystkie koła</option>
                  {activeClubs.map(c => (
                    <option key={c.orgId} value={c.orgId}>{c.shortName}</option>
                  ))}
                  <option value="test">Środowisko testowe (test)</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="ALL">Wszystkie statusy</option>
                  <option value="ACTIVE">Tylko aktywne</option>
                  <option value="BLOCKED">Tylko zablokowane</option>
                  <option value="INACTIVE">Nieaktywne / wygasłe</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowGrantForm(v => !v)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
              >
                <UserPlus size={14} />
                <span>{showGrantForm ? 'Ukryj formularz' : 'Nadaj dostęp do koła'}</span>
              </button>
            </div>

            {showGrantForm && (
              <form onSubmit={handleGrantSubmit} className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">E-mail użytkownika</label>
                  <input
                    type="email"
                    required
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="np. student@wskz.pl"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Imię i nazwisko</label>
                  <input
                    type="text"
                    value={grantName}
                    onChange={(e) => setGrantName(e.target.value)}
                    placeholder="Opcjonalnie"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Koło naukowe</label>
                  <select
                    value={grantOrgId}
                    onChange={(e) => setGrantOrgId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {activeClubs.map(c => (
                      <option key={c.orgId} value={c.orgId}>{c.shortName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Poziom uprawnień</label>
                  <select
                    value={grantRole}
                    onChange={(e) => setGrantRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="ADMIN">ADMIN (Pełny dostęp koła)</option>
                    <option value="COORDINATOR">COORDINATOR (Zarząd / Opiekun)</option>
                    <option value="VIEWER">VIEWER (Tylko odczyt)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={grantBusy}
                  className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {grantBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>Zapisz dostęp</span>
                </button>
              </form>
            )}
          </div>

          {/* Global Access Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {loading && !matrix ? (
              <div className="p-10 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Loader2 size={24} className="animate-spin text-indigo-600" />
                <p className="text-xs font-semibold">Skanowanie uprawnień we wszystkich kołach naukowych…</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Brak użytkowników spełniających wybrane kryteria wyszukiwania.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Użytkownik & Nr indeksu</th>
                      <th className="py-3 px-4">Przypisane koła naukowe, role i źródło nadania</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredUsers.map(u => (
                      <tr key={u.email} className={u.isGlobalSuperadmin ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}>
                        <td className="py-3.5 px-4 align-top w-72">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900">{u.name || u.email}</span>
                              {u.isGlobalSuperadmin && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold">
                                  <Sparkles size={10} />
                                  SUPERADMIN GLOBALNY
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                              <Mail size={11} className="shrink-0 text-slate-400" />
                              <span className="break-all">{u.email}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Hash size={11} className="shrink-0 text-slate-400" />
                              <span>Indeks: </span>
                              <span className="font-mono font-bold text-slate-700">
                                {u.indexNumber || '—'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          {u.isGlobalSuperadmin ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {activeClubs.map(c => (
                                  <span
                                    key={c.orgId}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200"
                                  >
                                    <Building2 size={11} />
                                    {c.shortName}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[11px] text-amber-800 font-medium">
                                Pełny dostęp globalny (wszystkie koła i konfiguracja nadrzędna) • Konto chronione przed blokadą
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {(u.assignments || []).map(a => {
                                const isBusy = busyKey === a.key;
                                const isBlocked = a.status === 'blocked';
                                const isActive = a.status === 'active';
                                return (
                                  <div
                                    key={a.key}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-2xl border ${
                                      isBlocked
                                        ? 'bg-rose-50/70 border-rose-200'
                                        : isActive
                                        ? 'bg-white border-slate-200 shadow-2xs'
                                        : 'bg-slate-50 border-slate-200/70 opacity-75'
                                    }`}
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                          <Building2 size={11} />
                                          {a.clubShortName}
                                        </span>
                                        <span className="font-bold text-slate-800 text-xs">{a.primaryRole}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                                          isBlocked
                                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                            : isActive
                                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                            : 'bg-slate-200 text-slate-600'
                                        }`}>
                                          {isBlocked ? 'Zablokowany' : isActive ? 'Aktywny' : 'Nieaktywny'}
                                        </span>
                                      </div>

                                      <p className="text-[11px] text-slate-500">
                                        Źródło: <span className="font-semibold text-slate-700">{(a.sourceLabels || []).join(' + ') || a.primarySource}</span>
                                        {a.revokedInfo?.revokedAt && (
                                          <span className="text-rose-700 font-medium">
                                            {' '}• Zablokowano {String(a.revokedInfo.revokedAt).slice(0, 10)}
                                          </span>
                                        )}
                                      </p>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-1.5">
                                      {isBlocked ? (
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => handleRestore(a)}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                                        >
                                          {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                                          <span>Przywróć dostęp</span>
                                        </button>
                                      ) : isActive && a.orgId !== 'test' ? (
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => handleRevoke(a)}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                                        >
                                          {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                                          <span>Odbierz dostęp</span>
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
