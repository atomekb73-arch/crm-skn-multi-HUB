import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus,
  Users,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Heart,
  HeartHandshake,
  KeyRound,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  Trash2,
  Edit3,
  Copy,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GLOBAL_SUPERADMIN_EMAIL } from '../services/settingsService';
import {
  PRODUCTION_CRM_ORGANIZATIONS,
  RBAC_STARTER_PASSWORD,
  fetchRbacUsers,
  createRbacUser,
  updateRbacUser,
  resetRbacUserPassword,
  toggleRbacUserActive,
  deleteRbacUser,
} from '../services/adminUsersService';

const ORG_ICONS = {
  Heart,
  ShieldAlert,
  HeartHandshake,
  Building2,
};

function renderClubIcon(iconName, color) {
  const IconComp = ORG_ICONS[iconName] || Building2;
  return <IconComp size={15} style={{ color }} className="shrink-0" />;
}

export default function AdminPanelPage({ onPermissionsChanged }) {
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
  const [meta, setMeta] = useState({
    dbTablesReady: true,
    serviceRoleConfigured: true,
    fallbackMode: false,
  });

  // Stan formularza (Kolumna Lewa + Środkowa)
  const [editingEmail, setEditingEmail] = useState(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('user');
  const [selectedClubs, setSelectedClubs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [copiedStarter, setCopiedStarter] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState(null);
  const [pendingDeleteEmail, setPendingDeleteEmail] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const clubMap = useMemo(() => {
    const map = new Map();
    for (const org of PRODUCTION_CRM_ORGANIZATIONS) {
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
      setMeta({
        dbTablesReady: data?.dbTablesReady !== false,
        serviceRoleConfigured: Boolean(data?.serviceRoleConfigured),
        fallbackMode: Boolean(data?.fallbackMode),
      });
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
    setSelectedClubs(PRODUCTION_CRM_ORGANIZATIONS.map((o) => o.id));
  };

  const handleDeselectAllClubs = () => {
    setSelectedClubs([]);
  };

  const handleCopyStarter = async () => {
    try {
      await navigator.clipboard.writeText(RBAC_STARTER_PASSWORD);
      setCopiedStarter(true);
      setTimeout(() => setCopiedStarter(false), 1800);
    } catch {
      // ignore clipboard fallback
    }
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
          ? `Zaktualizowano uprawnienia i przypisane koła dla ${editingEmail}.`
          : `Utworzono konto ${cleanEmail} z hasłem startowym "${RBAC_STARTER_PASSWORD}" (zmiana wymuszona przy 1. logowaniu).`,
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

  const handleResetPassword = async (u) => {
    if (!isAuthorizedSuperadmin || !u || u.isProtected) return;
    setBusyActionKey(`reset:${u.email}`);
    setFeedback(null);
    try {
      const res = await resetRbacUserPassword({ actorEmail, email: u.email });
      if (Array.isArray(res?.users)) setUsers(res.users);
      else await loadUsers();
      setFeedback({
        type: 'success',
        text: `Zresetowano hasło dla ${u.email} do hasła startowego "${RBAC_STARTER_PASSWORD}". Wymuszono zmianę przy kolejnym logowaniu.`,
      });
      onPermissionsChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || `Błąd resetu hasła dla ${u.email}.`,
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleToggleActive = async (u) => {
    if (!isAuthorizedSuperadmin || !u || u.isProtected) return;
    const nextActive = !u.isActive;
    setBusyActionKey(`toggle:${u.email}`);
    setFeedback(null);
    try {
      const res = await toggleRbacUserActive({
        actorEmail,
        email: u.email,
        isActive: nextActive,
      });
      if (Array.isArray(res?.users)) setUsers(res.users);
      else await loadUsers();
      setFeedback({
        type: 'success',
        text: nextActive
          ? `Odblokowano konto ${u.email}.`
          : `Zablokowano dostęp do CRM dla konta ${u.email}.`,
      });
      onPermissionsChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || `Nie udało się zmienić statusu konta ${u.email}.`,
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!isAuthorizedSuperadmin || !u || u.isProtected) return;
    setBusyActionKey(`delete:${u.email}`);
    setPendingDeleteEmail(null);
    setFeedback(null);
    try {
      const res = await deleteRbacUser({ actorEmail, email: u.email });
      if (Array.isArray(res?.users)) setUsers(res.users);
      else await loadUsers();
      if (editingEmail === u.email) resetForm();
      setFeedback({
        type: 'success',
        text: `Usunięto konto i odebrano wszystkie uprawnienia dla ${u.email}.`,
      });
      onPermissionsChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.message || `Błąd usuwania użytkownika ${u.email}.`,
      });
    } finally {
      setBusyActionKey(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const clubNames = (u.clubs || [])
        .map((id) => clubMap.get(id)?.name || clubMap.get(id)?.shortName || id)
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
    <div className="space-y-4">
      {/* Ostrzeżenie konfiguracyjne widoczne wyłącznie dla Superadmina, jeśli nie wdrożono jeszcze migracji / service_role */}
      {(!meta.dbTablesReady || !meta.serviceRoleConfigured) && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Tryb kompatybilności konfiguracji RBAC</p>
            <p className="text-[11px] leading-relaxed text-amber-800">
              {!meta.dbTablesReady &&
                'Tabele RBAC (user_profiles / user_organization_access) nie zostały jeszcze utworzone w Supabase — uruchom migrację supabase/migrations/20261114_rbac_admin_panel_v2.sql w SQL Editor. '}
              {!meta.serviceRoleConfigured &&
                'Aby zarządzać również kontami Supabase Auth (auth.users), dodaj zmienną środowiskową SUPABASE_SERVICE_ROLE_KEY w ustawieniach Vercel. '}
              Operacje na przypisaniach kół i wymuszaniu hasła są jednocześnie synchronizowane z club_memberships i organization_settings.
            </p>
          </div>
        </div>
      )}

      {/* Komunikat wyniku operacji */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-2 ${
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
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Główny układ 3-kolumnowy */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEWA KOLUMNA: Przypisane Koła (wyłącznie 3 aktywne koła produkcyjne CRM) */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Building2 size={15} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">Przypisane Koła</h3>
                <p className="text-[10px] text-slate-500">
                  Wybrano {selectedClubs.length} z {PRODUCTION_CRM_ORGANIZATIONS.length}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectAllClubs}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition cursor-pointer"
            >
              <CheckSquare size={12} />
              <span>Zaznacz wszystkie</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAllClubs}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
            >
              <Square size={12} />
              <span>Odznacz</span>
            </button>
          </div>

          <div className="space-y-2">
            {PRODUCTION_CRM_ORGANIZATIONS.map((org) => {
              const checked = selectedClubs.includes(org.id);
              return (
                <label
                  key={org.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                    checked
                      ? 'border-indigo-300 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleClub(org.id)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: org.bgLight,
                      borderColor: `${org.color}33`,
                    }}
                  >
                    {renderClubIcon(org.icon, org.color)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 leading-snug">
                        {org.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wide"
                        style={{
                          backgroundColor: org.bgLight,
                          color: org.color,
                        }}
                      >
                        {org.code || org.shortName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 truncate">
                        {org.id}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* ŚRODKOWA KOLUMNA: Dodaj Nowego Użytkownika / Edycja Konta */}
        <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <UserPlus size={15} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">
                  {editingEmail ? 'Edytuj Konto Użytkownika' : 'Dodaj Nowego Użytkownika'}
                </h3>
                <p className="text-[10px] text-slate-500">
                  {editingEmail ? editingEmail : 'Nadaj dostęp do wybranych kół naukowych'}
                </p>
              </div>
            </div>
            {editingEmail && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Anuluj
              </button>
            )}
          </div>

          <form onSubmit={handleSubmitForm} autoComplete="off" className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Imię i nazwisko
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="np. Anna Kowalska"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Adres e-mail
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={Boolean(editingEmail)}
                placeholder="uzytkownik@wskz.pl"
                required
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Rola w systemie (RBAC)
              </label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                <option value="user">User — użytkownik przypisanych kół</option>
                <option value="admin">Admin — administrator przypisanych kół</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Zarówno User, jak i Admin widzą wyłącznie koła zaznaczone po lewej stronie. Rola Super Admin jest zastrzeżona.
              </p>
            </div>

            {/* Informacja o haśle startowym (wyłącznie tutaj w Panelu Admina!) */}
            {!editingEmail && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-amber-900">
                    <KeyRound size={13} className="text-amber-600" />
                    Hasło startowe:
                    <code className="px-1.5 py-0.5 rounded bg-white border border-amber-300 font-mono text-amber-950">
                      {RBAC_STARTER_PASSWORD}
                    </code>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyStarter}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-[10px] font-bold text-amber-800 transition cursor-pointer"
                  >
                    {copiedStarter ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedStarter ? 'Skopiowano' : 'Kopiuj'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-amber-800 leading-snug">
                  Przy pierwszym logowaniu system automatycznie wymusi zmianę tego hasła na własne hasło stałe użytkownika.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || selectedClubs.length === 0}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Zapisywanie...</span>
                </>
              ) : editingEmail ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>Zapisz Zmiany Konta</span>
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  <span>Utwórz Konto Użytkownika</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* PRAWA KOLUMNA: Zarejestrowani Użytkownicy */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Users size={14} />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold text-slate-900">
                    Zarejestrowani Użytkownicy
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700">
                    {users.length}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={loadUsers}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                <span>Odśwież</span>
              </button>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj po nazwisku, e-mailu lub kole..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            {loading && users.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <Loader2 size={20} className="animate-spin text-indigo-500" />
                <span>Ładowanie kont RBAC...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Brak użytkowników pasujących do wyszukiwania.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Użytkownik</th>
                    <th className="py-2.5 px-2">Rola</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Przypisane Koła</th>
                    <th className="py-2.5 px-3 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.map((u) => {
                    const isProtected = u.isProtected || u.email === GLOBAL_SUPERADMIN_EMAIL;
                    const isEditingThis = editingEmail === u.email;
                    const isConfirmingDelete = pendingDeleteEmail === u.email;

                    return (
                      <tr
                        key={u.email}
                        className={`align-top transition ${
                          isProtected
                            ? 'bg-amber-50/30'
                            : isEditingThis
                            ? 'bg-indigo-50/50'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 leading-snug">
                            {u.name || u.email}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 break-all">
                            {u.email}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap">
                          {u.role === 'superadmin' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                              <ShieldCheck size={10} />
                              Super Admin
                            </span>
                          ) : u.role === 'admin' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              User
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap">
                          {!u.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              Zablokowane
                            </span>
                          ) : u.mustChangePassword ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Wymaga zmiany
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              Aktywne
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-2">
                          {isProtected || u.clubs?.includes('*') ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-900 text-amber-300 border border-amber-400/40">
                              WSZYSTKIE (*)
                            </span>
                          ) : (u.clubs || []).length === 0 ? (
                            <span className="text-[10px] font-semibold text-rose-600">
                              Brak kół
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {u.clubs.map((cid) => {
                                const org = clubMap.get(cid);
                                return (
                                  <span
                                    key={cid}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border"
                                    style={{
                                      backgroundColor: org?.bgLight || '#f1f5f9',
                                      color: org?.color || '#334155',
                                      borderColor: `${org?.color || '#cbd5e1'}44`,
                                    }}
                                  >
                                    {org?.code || org?.shortName || cid}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {isProtected ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                              <Lock size={10} />
                              Chronione
                            </span>
                          ) : isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                disabled={busyActionKey === `delete:${u.email}`}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Potwierdź
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteEmail(null)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                              >
                                Anuluj
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(u)}
                                title="Edytuj koła / rolę / imię"
                                className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition cursor-pointer"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResetPassword(u)}
                                disabled={busyActionKey === `reset:${u.email}`}
                                title={`Resetuj hasło do startowego (${RBAC_STARTER_PASSWORD})`}
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition cursor-pointer disabled:opacity-50"
                              >
                                {busyActionKey === `reset:${u.email}` ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <KeyRound size={13} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(u)}
                                disabled={busyActionKey === `toggle:${u.email}`}
                                title={u.isActive ? 'Zablokuj konto' : 'Odblokuj konto'}
                                className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-50 ${
                                  u.isActive
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {busyActionKey === `toggle:${u.email}` ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : u.isActive ? (
                                  <Lock size={13} />
                                ) : (
                                  <Unlock size={13} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteEmail(u.email)}
                                title="Usuń konto użytkownika"
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                              >
                                <Trash2 size={13} />
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
