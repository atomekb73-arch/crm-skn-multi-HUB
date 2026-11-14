import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  LogOut,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth, DEFAULT_STARTER_PASSWORD } from '../context/AuthContext';

export default function ChangePasswordPage() {
  const { user, completeMandatoryPasswordChange, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cleanNew = newPassword.trim();
  const cleanConfirm = confirmPassword.trim();
  const hasMinLength = cleanNew.length >= 8;
  const passwordsMatch = cleanNew.length > 0 && cleanNew === cleanConfirm;
  const isNotStarter =
    Boolean(cleanNew) &&
    cleanNew !== DEFAULT_STARTER_PASSWORD &&
    cleanNew !== 'Start2026!' &&
    cleanNew !== 'StartCRM2026!';
  const canSubmit = hasMinLength && passwordsMatch && isNotStarter && !isSubmitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      setError('Spełnij wszystkie wymagania dotyczące nowego hasła.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await completeMandatoryPasswordChange(cleanNew, cleanConfirm);
      if (!res?.success) {
        setError(res?.error || 'Nie udało się zapisać nowego hasła.');
      }
    } catch (err) {
      setError(err?.message || 'Wystąpił nieoczekiwany błąd podczas zmiany hasła.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Nagłówek bezpieczeństwa */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shrink-0">
              <ShieldAlert size={24} className="text-white" />
            </div>
            <div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 mb-1">
                Wymagane zabezpieczenie konta
              </span>
              <h1 className="text-lg font-extrabold tracking-tight leading-tight">
                Ustaw nowe hasło stałe
              </h1>
            </div>
          </div>
          <p className="text-xs text-white/90 mt-3 leading-relaxed">
            Zalogowano z użyciem hasła startowego lub po resecie administratora. Aby odblokować dostęp do systemu CRM SKN Multi-Hub, nadaj własne hasło.
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-5">
          {/* Informacja o koncie */}
          <div className="px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Zalogowany użytkownik
              </p>
              <p className="text-xs font-bold text-slate-900 truncate">
                {user?.name || user?.email}
              </p>
              <p className="text-[11px] text-slate-500 font-mono truncate">{user?.email}</p>
            </div>
            <span className="shrink-0 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
              Wymaga zmiany
            </span>
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-snug font-medium">{error}</p>
            </div>
          )}

          {/* Nowe hasło */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Nowe hasło stałe
            </label>
            <div className="relative">
              <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 znaków..."
                autoFocus
                className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-mono text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Powtórz nowe hasło */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Powtórz nowe hasło
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Wpisz ponownie nowe hasło..."
                className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-mono text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Lista kontrolna wymagań */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-[11px]">
            <div className="flex items-center gap-2">
              {hasMinLength ? (
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              ) : (
                <XCircle size={14} className="text-slate-300 shrink-0" />
              )}
              <span className={hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                Co najmniej 8 znaków
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isNotStarter ? (
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              ) : (
                <XCircle size={14} className="text-slate-300 shrink-0" />
              )}
              <span className={isNotStarter ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                Różne od hasła startowego
              </span>
            </div>
            <div className="flex items-center gap-2">
              {passwordsMatch ? (
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              ) : (
                <XCircle size={14} className="text-slate-300 shrink-0" />
              )}
              <span className={passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                Wprowadzone hasła są identyczne
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Zapisywanie hasła...</span>
                </>
              ) : (
                <>
                  <KeyRound size={15} />
                  <span>Zapisz hasło i przejdź do CRM</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut size={14} />
              <span>Wyloguj i wróć do ekranu logowania</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
