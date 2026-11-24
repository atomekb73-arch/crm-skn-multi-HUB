import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus,
  Users,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Heart,
  KeyRound,
  RefreshCw,
  Search,
  Lock,
  Trash2,
  Edit3,
  CheckCircle2,
  Loader2,
  X,
  User,
  Mail,
  Info,
  GraduationCap,
  Brain,
  Puzzle,
  Armchair,
  Flame,
  Dna,
  Ribbon,
  Zap,
  Leaf,
  Sparkles,
  HelpCircle,
  Target,
  Rocket,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GLOBAL_SUPERADMIN_EMAIL } from '../services/settingsService';
import {
  ALL_WSKZ_RBAC_ORGANIZATIONS,
  RBAC_STARTER_PASSWORD,
  fetchRbacUsers,
  createRbacUser,
  updateRbacUser,
  deleteRbacUser,
} from '../services/adminUsersService';

const ORG_ICONS = {
  Building2,
  Users,
  GraduationCap,
  Brain,
  Puzzle,
  Armchair,
  Search,
  Flame,
  Dna,
  Ribbon,
  Zap,
  Leaf,
  Heart,
  Sparkles,
  HelpCircle,
  Target,
  Rocket,
};

function getInitials(name, email) {
  const cleanName = String(name || '').trim();
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  const cleanEmail = String(email || '').trim();
  if (cleanEmail) {
    const userPart = cleanEmail.split('@')[0];
    return userPart.slice(0, 2).toUpperCase();
  }
  return '??';
}

function formatPillCode(code) {
  if (!code) return '';
  if (code.length > 7) {
    return `${code.slice(0, 6)}...`;
  }
  return code;
}

export default function AdminPanelPage({ onPermissionsChanged, onClose, onOpenAudit }) {
  const { user, isSuperAdmin, hasFullAccess } = useAuth();
  const actorEmail = String(user?.email || '').trim().toLowerCase();
  const isAuthorizedSuperadmin = Boolean(
    user &&
    actorEmail === GLOBAL_SUPERADMIN_EMAIL &&
    (isSuperAdmin || hasFullAccess)
  );

  // Stan listy użytkowników
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Stan formularza (Kolumna Lewa + Środkowa)
  const [editingEmail, setEditingEmail] = useState(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('user');
  const [selectedClubs, setSelectedClubs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const clubMap = useMemo(() => {
    const map = new Map();
    for (const org of ALL_WSKZ_RBAC_ORGANIZATIONS) {
      map.set(org.id, org);
    }
    return map;
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isAuthorizedSuperadmin) return;
    setLoading(true);
    try {
      const data = await fetchRbacUsers(actorEmail);
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Nie udało się pobrać listy użytkowników RBAC.',
      });
    } finally {
      setLoading(false);
    }
  }, [isAuthorizedSuperadmin, actorEmail]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const resetForm = () => {
    setEditingEmail(null);
    setFormName('');
    setFormEmail('');
    setFormRole('user');
    setSelectedClubs([]);
  };

  const handleToggleClub = (clubId) => {
    setSelectedClubs((prev) =>
      prev.includes(clubId) ? prev.filter((id) => id !== clubId) : [...prev, clubId]
    );
  };

  const handleSelectAllClubs = () => {
    setSelectedClubs(ALL_WSKZ_RBAC_ORGANIZATIONS.map((o) => o.id));
  };

  const handleDeselectAllClubs = () => {
    setSelectedClubs([]);
  };

  const handleStartEdit = (u) => {
    if (!u || u.isProtected || u.email === GLOBAL_SUPERADMIN_EMAIL) return;
    setEditingEmail(u.email);
    setFormName(u.name || '');
    setFormEmail(u.email || '');
    setFormRole(u.role === 'admin' ? 'admin' : 'user');
    setSelectedClubs(
      (u.clubs || []).filter((id) => clubMap.has(id))
    );
    setFeedback(null);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!isAuthorizedSuperadmin) return;
    setFeedback(null);

    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanName = formName.trim();

    if (!editingEmail && (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
      setFeedback({ type: 'error', text: 'Podaj prawidłowy adres e-mail użytkownika.' });
      return;
    }
    if (!editingEmail && cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
      setFeedback({ type: 'error', text: 'Konto Superadministratora już istnieje i jest chronione.' });
      return;
    }
    if (selectedClubs.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Wybierz w lewej kolumnie co najmniej jedno koło naukowe dla tego konta.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = editingEmail
        ? await updateRbacUser({
            actorEmail,
            email: editingEmail,
            name: cleanName || editingEmail.split('@')[0],
            role: formRole,
            clubs: selectedClubs,
          })
        : await createRbacUser({
            actorEmail,
            name: cleanName || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: formRole,
            clubs: selectedClubs,
          });

      if (Array.isArray(res?.users)) {
        setUsers(res.users);
      } else {
        await loadUsers();
      }

      setFeedback({
        type: 'success',
        text: editingEmail
          ? `Zaktualizowano uprawnienia dla ${editingEmail}.`
          : `Utworzono konto ${cleanEmail} z hasłem startowym "${RBAC_STARTER_PASSWORD}".`,
      });
      resetForm();
      onPermissionsChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Wystąpił błąd podczas zapisywania konta użytkownika.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!isAuthorizedSuperadmin || !u || u.isProtected || u.email === GLOBAL_SUPERADMIN_EMAIL) return;
    const confirmDelete = window.confirm(`Czy na pewno usunąć konto użytkownika ${u.email}?`);
    if (!confirmDelete) return;

    setFeedback(null);
    try {
      const res = await deleteRbacUser({ actorEmail, email: u.email });
      if (Array.isArray(res?.users)) setUsers(res.users);
      else await loadUsers();
      if (editingEmail === u.email) resetForm();
      setFeedback({
        type: 'success',
        text: `Usunięto konto użytkownika ${u.email}.`,
      });
      onPermissionsChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || `Błąd usuwania konta ${u.email}.`,
      });
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const clubNames = (u.clubs || [])
        .map((cid) => {
          const org = clubMap.get(cid);
          return `${cid} ${org?.name || ''} ${org?.code || ''}`;
        })
        .join(' ');
      const hay = `${u.name || ''} ${u.email || ''} ${u.role || ''} ${clubNames}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, searchQuery, clubMap]);

  if (!isAuthorizedSuperadmin) {
    return (
      <div className="p-8 bg-white rounded-3xl border border-rose-200 text-center space-y-2">
        <ShieldAlert size={36} className="text-rose-500 mx-auto" />
        <h3 className="text-base font-extrabold text-slate-900">Brak dostępu</h3>
        <p className="text-xs text-slate-600">
          Panel Administratora (RBAC) jest dostępny wyłącznie dla Superadministratora ({GLOBAL_SUPERADMIN_EMAIL}).
        </p>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-6">
      {/* ── Top Header Card (wzorowany 1:1 na Generatorze Formularzy) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Panel Administratora (RBAC)</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Zarządzanie kontami użytkowników i przypisaniami do kół naukowych WSKZ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {onOpenAudit && (
            <button
              type="button"
              onClick={onOpenAudit}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition cursor-pointer shadow-2xs"
            >
              <ShieldAlert size={14} className="text-amber-500" />
              <span>Audyt &amp; Kill Switch</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
            >
              <span>← Powrót do aplikacji</span>
            </button>
          )}
        </div>
      </div>

      {/* Komunikat o wyniku operacji */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-2 shadow-2xs ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer text-slate-500 hover:text-slate-800"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Główny układ 3-kolumnowy (asymetryczny na desktopie, 1-kolumnowy na mobile/tablet) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,1.35fr)_340px_minmax(520px,1.95fr)] xl:grid-cols-[minmax(400px,1.35fr)_340px_minmax(620px,2.05fr)] gap-6 items-start">
        {/* LEWA KOLUMNA: Przypisane Koła */}
        <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Building2 size={16} className="text-indigo-600" />
            <span>Przypisane Koła ({selectedClubs.length})</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={handleSelectAllClubs}
              className="text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
            >
              Zaznacz wszystkie
            </button>
            <button
              type="button"
              onClick={handleDeselectAllClubs}
              className="text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
            >
              Odznacz
            </button>
          </div>

          <div className="space-y-1 mt-3 max-h-[580px] overflow-y-auto pr-1">
            {ALL_WSKZ_RBAC_ORGANIZATIONS.map((org) => {
              const isSelected = selectedClubs.includes(org.id);
              const IconComp = ORG_ICONS[org.icon] || Building2;
              return (
                <label
                  key={org.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-xl cursor-pointer transition select-none ${
                    isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleClub(org.id)}
                      className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: org.bgLight, color: org.color }}
                    >
                      <IconComp size={14} />
                    </div>
                    <span className="text-xs font-medium text-slate-700 leading-snug xl:whitespace-nowrap" title={org.name}>
                      {org.displayName || org.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 bg-slate-100 text-slate-600 border border-slate-200/60">
                    {org.code}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ŚRODKOWA KOLUMNA: Dodaj Nowego Użytkownika / Edycja */}
        <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm pb-3 border-b border-slate-100">
            <UserPlus size={16} className="text-indigo-600" />
            <span>{editingEmail ? 'Edytuj Użytkownika' : 'Dodaj Nowego Użytkownika'}</span>
          </div>

          <form onSubmit={handleSubmitForm} autoComplete="off">
            <div className="mt-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                IMIĘ I NAZWISKO / NAZWA
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="np. Jan Kowalski"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                ADRES E-MAIL *
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  disabled={Boolean(editingEmail)}
                  placeholder="uzytkownik@wskz.pl"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </div>

            {editingEmail && (
              <div className="mt-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  ROLA W SYSTEMIE
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="user">User — użytkownik przypisanych kół</option>
                  <option value="admin">Admin — administrator przypisanych kół</option>
                </select>
              </div>
            )}

            {!editingEmail && (
              <div className="mt-4 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-800 flex items-start gap-2">
                <Info size={15} className="shrink-0 text-amber-600 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  Hasło startowe: <strong className="font-bold">{RBAC_STARTER_PASSWORD}</strong>. Zmiana hasła wymagana przy 1. logowaniu.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserPlus size={14} />
              )}
              <span>{editingEmail ? 'Zapisz Zmiany' : 'Utwórz Konto Użytkownika'}</span>
            </button>

            {editingEmail && (
              <button
                type="button"
                onClick={resetForm}
                className="mt-2 w-full py-2 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition cursor-pointer"
              >
                Anuluj edycję
              </button>
            )}
          </form>
        </div>

        {/* PRAWA KOLUMNA: Zarejestrowani Użytkownicy */}
        <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-indigo-600" />
              <span className="text-slate-900 font-bold text-sm">Zarejestrowani Użytkownicy</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                {filteredUsers.length}
              </span>
            </div>
            <button
              type="button"
              onClick={loadUsers}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
              title="Odśwież listę"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="mt-3 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj po nazwisku, e-mailu, lub kole..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div className="overflow-x-auto mt-4 max-h-[540px] overflow-y-auto">
            {loading && users.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <Loader2 size={20} className="animate-spin text-indigo-500" />
                <span>Ładowanie kont...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Brak zarejestrowanych użytkowników.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-3 font-semibold">UŻYTKOWNIK</th>
                    <th className="pb-3 font-semibold">ROLA</th>
                    <th className="pb-3 font-semibold">STATUS</th>
                    <th className="pb-3 font-semibold">PRZYPISANE KOŁA</th>
                    <th className="pb-3 font-semibold text-right">AKCJE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.map((u) => {
                    const isProtected = u.isProtected || u.email === GLOBAL_SUPERADMIN_EMAIL;
                    return (
                      <tr key={u.email} className="hover:bg-slate-50/70 transition">
                        {/* UŻYTKOWNIK */}
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 border border-slate-200/60">
                              {getInitials(u.name, u.email)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 leading-tight" title={u.name || u.email}>
                                {u.name || u.email}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 leading-tight mt-0.5 break-all">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* ROLA */}
                        <td className="py-3 px-2 whitespace-nowrap">
                          {u.role === 'superadmin' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700">
                              Super Admin
                            </span>
                          ) : u.role === 'admin' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                              User
                            </span>
                          )}
                        </td>

                        {/* STATUS */}
                        <td className="py-3 px-2 whitespace-nowrap">
                          {!u.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700">
                              <Lock size={10} />
                              <span>Zablokowane</span>
                            </span>
                          ) : u.mustChangePassword ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">
                              <KeyRound size={10} className="text-amber-500" />
                              <span>Wymaga zmiany</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">
                              <KeyRound size={10} className="text-emerald-500" />
                              <span>Aktywne</span>
                            </span>
                          )}
                        </td>

                        {/* PRZYPISANE KOŁA */}
                        <td className="py-3 px-2">
                          {isProtected || u.clubs?.includes('*') || (u.clubs || []).length >= 14 ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-900 text-white tracking-wider whitespace-nowrap">
                              WSZYSTKIE (*)
                            </span>
                          ) : (u.clubs || []).length === 0 ? (
                            <span className="text-[11px] text-slate-400">Brak</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto pr-1">
                              {u.clubs.map((cid) => {
                                const org = clubMap.get(cid);
                                if (!org) return null;
                                const IconComp = ORG_ICONS[org.icon] || Building2;
                                return (
                                  <span
                                    key={cid}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border w-fit whitespace-nowrap"
                                    style={{
                                      backgroundColor: org.bgLight,
                                      color: org.color,
                                      borderColor: `${org.color}35`,
                                    }}
                                  >
                                    <IconComp size={10} />
                                    <span>{formatPillCode(org.code || org.displayName)}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* AKCJE */}
                        <td className="py-3 pl-2 text-right whitespace-nowrap">
                          {isProtected ? (
                            <span className="text-xs text-slate-400 font-normal">Chronione</span>
                          ) : (
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(u)}
                                title="Edytuj użytkownika"
                                className="p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                title="Usuń użytkownika"
                                className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
