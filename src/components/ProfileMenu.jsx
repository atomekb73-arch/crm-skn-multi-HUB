import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  ChevronDown,
  Building2,
  Settings,
  LogOut,
  CheckCircle2,
  Shield,
  Layers,
  Sparkles,
  UserCheck,
  Check,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useAuth, ROLES, DEMO_ACCOUNTS } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';

export default function ProfileMenu({ onOpenSettings }) {
  const { user, isSuperAdmin, canAccessOrg, switchDemoAccount, logout, changeUserPassword } = useAuth();
  const { currentOrg, organizations, switchOrg } = useOrg();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showDemoSelector, setShowDemoSelector] = useState(false);
  const menuRef = useRef(null);

  // Change password modal state
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changeError, setChangeError] = useState(null);
  const [changeSuccess, setChangeSuccess] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation rules
  const hasMinLength = newPassword.length >= 8;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isNotStarterPassword =
    newPassword.length > 0 &&
    newPassword !== 'Start2026!' &&
    newPassword !== 'wskz2026' &&
    newPassword !== 'skn2026';
  const isFormValid = currentPassword.trim().length > 0 && hasMinLength && passwordsMatch && isNotStarterPassword;

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOpenChangePassword = () => {
    setIsOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangeError(null);
    setChangeSuccess(null);
    setIsChangePasswordOpen(true);
  };

  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangeError(null);
    setChangeSuccess(null);
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setChangeError(null);
    setChangeSuccess(null);

    if (!currentPassword.trim()) {
      setChangeError('Wprowadź aktualne hasło.');
      return;
    }
    if (!hasMinLength) {
      setChangeError('Nowe hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    if (!passwordsMatch) {
      setChangeError('Wprowadzone hasła nie są identyczne.');
      return;
    }
    if (!isNotStarterPassword) {
      setChangeError('Nowe hasło nie może być hasłem startowym.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = changeUserPassword(currentPassword, newPassword, confirmPassword);
      if (!res.success) {
        setChangeError(res.error || 'Nie udało się zmienić hasła.');
      } else {
        setChangeSuccess('Hasło zostało pomyślnie zmienione!');
        setTimeout(() => {
          handleCloseChangePassword();
        }, 1800);
      }
    } catch (err) {
      setChangeError('Wystąpił nieoczekiwany błąd podczas zmiany hasła.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <button
        onClick={() => switchDemoAccount(DEMO_ACCOUNTS[0])}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
      >
        <User size={13} />
        <span>Zaloguj przez Google</span>
      </button>
    );
  }

  const roleConfig = ROLES[user.role] || ROLES.VIEWER;
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  // Filter organizations accessible by this user
  const accessibleOrganizations = organizations.filter(org => canAccessOrg(org.id));

  return (
    <>
      <div className="relative" ref={menuRef}>
        {/* Profile Trigger Button */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className="flex items-center gap-2.5 p-1.5 pr-3 rounded-2xl border border-slate-200/80 bg-white hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs cursor-pointer group"
        >
          {/* Avatar / Initials */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-violet-500 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {/* Name */}
          <div className="text-left hidden sm:block min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition truncate max-w-[130px]">
                {user.name}
              </span>
            </div>
          </div>

          <ChevronDown size={14} className="text-slate-400 group-hover:text-indigo-600 transition shrink-0 ml-0.5" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100">
            
            {/* User Info Header Card */}
            <div className="p-3 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-xs text-white truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-300 font-mono truncate">{user.email}</p>
                </div>
              </div>
            </div>

            {/* Section 1: Active Organization Selector */}
            <div className="space-y-1 mb-2">
              <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Building2 size={11} className="text-indigo-600" />
                  <span>Aktywne Koło Naukowe</span>
                </span>
                <span className="text-[9px] font-medium text-slate-400">
                  {accessibleOrganizations.length} dostępne
                </span>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {accessibleOrganizations.map(org => {
                  const isSelected = org.id === currentOrg.id;
                  return (
                    <button
                      key={org.id}
                      onClick={() => {
                        switchOrg(org.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/80 shadow-2xs'
                          : 'text-slate-700 hover:bg-slate-50 hover:border-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-semibold">{org.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{org.tag || 'WSKZ'}</p>
                      </div>
                      {isSelected && <CheckCircle2 size={15} className="text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 my-1" />

            {/* Section 2: Super-Admin Settings */}
            {isSuperAdmin && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  if (onOpenSettings) onOpenSettings();
                }}
                className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer"
              >
                <Settings size={14} className="text-indigo-600" />
                <span>Konfiguracja Koła & Arkusze Google</span>
              </button>
            )}

            {/* Section 3: Change Password */}
            <button
              onClick={handleOpenChangePassword}
              className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer"
            >
              <KeyRound size={14} className="text-amber-500" />
              <span>Zmień hasło</span>
            </button>

            {/* Section 4: Demo Persona Switcher (Allows live testing) */}
            <div className="py-1">
              <button
                onClick={() => setShowDemoSelector(prev => !prev)}
                className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-500" />
                  <span>Przełącz profil demonstracyjny</span>
                </span>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showDemoSelector ? 'rotate-180' : ''}`} />
              </button>

              {showDemoSelector && (
                <div className="p-1.5 bg-slate-50 rounded-2xl mt-1 space-y-1 border border-slate-200/60">
                  {DEMO_ACCOUNTS.map(acc => {
                    const isCurrent = user.email === acc.email;
                    return (
                      <button
                        key={acc.email}
                        onClick={() => {
                          switchDemoAccount(acc);
                          setShowDemoSelector(false);
                          setIsOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded-xl text-[11px] transition cursor-pointer ${
                          isCurrent
                            ? 'bg-white font-bold text-indigo-700 shadow-2xs border border-indigo-100'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold truncate">{acc.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{acc.description}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 my-1" />

            {/* Section 5: Logout */}
            <button
              onClick={() => {
                logout();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            >
              <LogOut size={14} />
              <span>Wyloguj</span>
            </button>

          </div>
        )}
      </div>

      {/* ── MODAL: Zmień hasło ──────────────────────────────────────────────── */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Zmień hasło dostępowe</h3>
                  <p className="text-[11px] text-slate-500">Zaktualizuj swoje hasło do systemu CRM</p>
                </div>
              </div>
              <button
                onClick={handleCloseChangePassword}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Account Info */}
            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Zalogowane konto</p>
                <p className="text-xs font-bold text-slate-800 font-mono">{user.email}</p>
              </div>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                {user.role === 'SUPER_ADMIN' ? 'Administrator' : 'Użytkownik'}
              </span>
            </div>

            {/* Feedback Alerts */}
            {changeError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <p className="font-bold">Błąd zmiany hasła</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">{changeError}</p>
                </div>
              </div>
            )}

            {changeSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <p className="font-bold">Sukces!</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">{changeSuccess}</p>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleChangePasswordSubmit} autoComplete="off" className="space-y-4">
              
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Aktualne hasło
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    name="profile_current_code"
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    autoComplete="current-password"
                    data-lpignore="true"
                    spellCheck="false"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Wprowadź dotychczasowe hasło..."
                    className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 outline-none transition font-medium text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Nowe hasło
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    name="profile_new_code"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 znaków..."
                    className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 outline-none transition font-medium text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Powtórz nowe hasło
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    name="profile_confirm_code"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Wpisz ponownie nowe hasło..."
                    className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 outline-none transition font-medium text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Real-time Checklist */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1 text-[11px]">
                <div className="flex items-center gap-2">
                  {hasMinLength ? (
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300" />
                  )}
                  <span className={hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                    Co najmniej 8 znaków
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {passwordsMatch ? (
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300" />
                  )}
                  <span className={passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                    Hasła są identyczne
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseChangePassword}
                  className="w-1/2 py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  className="w-1/2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs shadow-sm hover:shadow transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span>Zapisywanie…</span>
                  ) : (
                    <>
                      <span>Zapisz hasło</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
    </>
  );
}
