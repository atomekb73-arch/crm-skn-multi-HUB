import React, { useState } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Key,
  ArrowLeft,
  UserCheck,
  GraduationCap,
} from 'lucide-react';
import { useAuth, DEFAULT_STARTER_PASSWORD } from '../context/AuthContext';

export default function LoginScreen({ onOpenPublicForm }) {
  const { checkEmailStatus, refreshRemoteAccess, activateAccount, loginWithPassword } = useAuth();

  // Step state: 'email' | 'password' | 'activate'
  const [step, setStep] = useState('email');

  // Input fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Feedback
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Validation rules for new password during first-time activation
  const hasMinLength = newPassword.length >= 8;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isNotStarterPassword = newPassword !== DEFAULT_STARTER_PASSWORD && newPassword !== 'Start2026!';
  const isActivationValid = hasMinLength && passwordsMatch && isNotStarterPassword;

  // STEP 1: Verify Email
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError('Wprowadź adres e-mail.');
      return;
    }

    setLoading(true);
    try {
      // Pobierz aktualne uprawnienia z Supabase (SSOT) – działa z dowolnego urządzenia,
      // niezależnie od zawartości localStorage tej przeglądarki
      if (typeof refreshRemoteAccess === 'function') {
        await refreshRemoteAccess(cleanEmail);
      }

      const res = checkEmailStatus(cleanEmail);

      if (!res.authorized) {
        setError(res.error || 'Brak uprawnień dostępu. Twój adres nie został dodany przez zarząd koła.');
        setVerifiedUser(null);
        return;
      }

      setVerifiedUser(res.user);

      // Przejdź do kroku hasła dostępowego (użytkownik podaje hasło startowe StartCRM2026! lub swoje hasło stałe)
      setStep('password');
      setPassword('');
    } catch (err) {
      setError('Wystąpił nieoczekiwany błąd podczas sprawdzania adresu e-mail.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2A: Submit Existing Password
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = loginWithPassword(email.trim(), password);
      if (!res.success) {
        if (res.requiresActivation) {
          setStep('activate');
        } else {
          setError(res.error || 'Nieprawidłowe hasło dostępowe.');
        }
      }
      // On success, AuthContext automatically updates isAuthenticated = true and opens CRM
    } catch (err) {
      setError('Wystąpił nieoczekiwany błąd podczas logowania.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2B: First-Time Account Activation & Set Password
  const handleActivationSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!hasMinLength) {
      setError('Hasło musi zawierać co najmniej 8 znaków.');
      return;
    }
    if (!passwordsMatch) {
      setError('Podane hasła nie są identyczne.');
      return;
    }

    setLoading(true);
    try {
      const res = activateAccount(email.trim(), newPassword, confirmPassword, verifiedUser);
      if (!res.success) {
        setError(res.error || 'Nie udało się zapisać hasła.');
      }
      // On success, AuthContext automatically sets session and unlocks CRM
    } catch (err) {
      setError('Wystąpił błąd podczas aktywacji konta.');
    } finally {
      setLoading(false);
    }
  };

  // Reset to email step
  const handleResetToEmail = () => {
    setStep('email');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-slate-100 flex items-center justify-center p-3 sm:p-4 md:p-6 font-sans relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-900/60 border border-purple-500/30 text-purple-200 text-xs font-semibold backdrop-blur-md shadow-inner">
            <GraduationCap size={16} strokeWidth={2.2} className="text-purple-300 shrink-0" />
            <span>Studenckie Koło Naukowe WSKZ</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            System Ewidencji & CRM
          </h1>
          <p className="text-xs text-purple-200/70 max-w-xs mx-auto leading-relaxed">
            Dostęp autoryzowany wyłącznie dla członków zarządu, opiekunów naukowych oraz uprawnionych koordynatorów.
          </p>
        </div>

        {/* Dynamic Card Container */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl border border-white/20 text-slate-900 space-y-5 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Top Status Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                step === 'activate' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {step === 'activate' ? <Key size={20} /> : <ShieldCheck size={20} />}
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {step === 'email' && 'Autoryzacja Dostępowa'}
                  {step === 'password' && 'Logowanie do Systemu'}
                  {step === 'activate' && 'Pierwsze Logowanie'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {step === 'email' && 'Wprowadź identyfikator lub uczelniany adres e-mail'}
                  {step === 'password' && 'Podaj kod dostępu do systemu'}
                  {step === 'activate' && 'Nadaj swój kod dostępu'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
              step === 'activate' ? 'bg-amber-100 text-amber-800 font-mono' : 'bg-slate-100 text-slate-600 font-mono'
            }`}>
              {step === 'activate' ? 'Aktywacja' : '2026/2027'}
            </span>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in zoom-in-95 duration-150">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <p className="font-bold">Odmowa dostępu</p>
                <p className="text-[11px] text-rose-700 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 1: IDENTIFIER / EMAIL INPUT ──────────────── */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} autoComplete="off" className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="skn_user_login" className="block text-xs font-bold text-slate-700">
                  Identyfikator Zarządu / E-mail
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="skn_user_login"
                    name="skn_user_login"
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    data-lpignore="true"
                    spellCheck="false"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="np. zarzad@wskz.pl lub identyfikator"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none transition font-medium text-slate-800"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 hover:from-purple-800 hover:to-indigo-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {loading ? (
                  <span>Weryfikacja uprawnień…</span>
                ) : (
                  <>
                    <span>Dalej</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ──────────────── STEP 2A: RETURNING USER LOGIN ──────────────── */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} autoComplete="off" className="space-y-4">
              {/* Account Pill */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-800 truncate">{verifiedUser?.name}</p>
                  <p className="text-[11px] text-slate-500 font-mono truncate">{email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleResetToEmail}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline shrink-0 cursor-pointer"
                >
                  Zmień
                </button>
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="app_access_code" className="block text-xs font-bold text-slate-700">
                    Hasło dostępu
                  </label>
                  <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                    Startowe: StartCRM2026!
                  </span>
                </div>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="app_access_code"
                    name="app_access_code"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Wpisz hasło stałe lub startowe (StartCRM2026!)..."
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none transition font-medium text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Przy pierwszym logowaniu hasłem startowym system poprosi o nadanie własnego hasła stałego.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 hover:from-purple-800 hover:to-indigo-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 active:scale-[0.99]"
              >
                {loading ? (
                  <span>Logowanie…</span>
                ) : (
                  <>
                    <span>Zaloguj do systemu CRM</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetToEmail}
                className="w-full py-1 text-xs text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Wróć do wyboru konta</span>
              </button>
            </form>
          )}

          {/* ──────────────── STEP 2B: FIRST-TIME ACTIVATION FORM ──────────────── */}
          {step === 'activate' && (
            <form onSubmit={handleActivationSubmit} autoComplete="off" className="space-y-4">
              
              {/* Account welcome banner */}
              <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                    <Sparkles size={13} strokeWidth={2.2} className="text-indigo-600 shrink-0" />
                    <span>Weryfikacja pierwszego logowania</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleResetToEmail}
                    className="text-[10px] font-semibold text-indigo-800 hover:text-indigo-950 underline cursor-pointer"
                  >
                    Zmień e-mail
                  </button>
                </div>
                <p className="text-xs font-bold text-indigo-950">
                  Witaj, {verifiedUser?.name || 'Użytkowniku'}!
                </p>
                <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                  Podano prawidłowe hasło startowe (<span className="font-mono font-bold text-indigo-700 bg-white/70 px-1 py-0.5 rounded border border-indigo-200">StartCRM2026!</span>). Ze względów bezpieczeństwa musisz teraz ustanowić swoje własne, unikalne hasło stałe.
                </p>
              </div>

              {/* Warning Alert - No Auto Recovery Mechanism */}
              <div className="p-3 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-amber-950">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-left">
                  <p className="text-xs font-bold text-amber-950">
                    Ważne ostrzeżenie o bezpieczeństwie
                  </p>
                  <p className="text-xs font-semibold text-amber-900 leading-snug">
                    Zapamiętaj swoje nowe hasło – obecnie brak mechanizmu automatycznego odzyskiwania dostępu.
                  </p>
                  <p className="text-[10px] text-amber-800/80 leading-normal">
                    W razie utraty nowego hasła zresetowanie konta będzie możliwe wyłącznie przez kontakt z Administratorem Głównym Koła.
                  </p>
                </div>
              </div>

              {/* New Password field */}
              <div className="space-y-1.5">
                <label htmlFor="app_access_code_new" className="block text-xs font-bold text-slate-700">
                  Nowe hasło stałe
                </label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="app_access_code_new"
                    name="app_access_code_new"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Wpisz nowe hasło (min. 8 znaków)..."
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition font-medium text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password field */}
              <div className="space-y-1.5">
                <label htmlFor="app_access_code_confirm" className="block text-xs font-bold text-slate-700">
                  Powtórz nowe hasło stałe
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="app_access_code_confirm"
                    name="app_access_code_confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Powtórz dokładnie to samo hasło..."
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition font-medium text-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Real-time Checklist */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5 text-[11px]">
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

                <div className="flex items-center gap-2">
                  {newPassword && newPassword !== DEFAULT_STARTER_PASSWORD ? (
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300" />
                  )}
                  <span className={newPassword && newPassword !== DEFAULT_STARTER_PASSWORD ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                    Różne od hasła startowego ({DEFAULT_STARTER_PASSWORD})
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !isActivationValid}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {loading ? (
                  <span>Zapisywanie nowego hasła…</span>
                ) : (
                  <>
                    <span>Zapisz hasło stałe i zaloguj do CRM</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetToEmail}
                className="w-full py-1 text-xs text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Wróć do wyboru konta</span>
              </button>
            </form>
          )}

        </div>

        {/* Public application declaration link for candidates */}
        <div className="text-center">
          <button
            type="button"
            onClick={onOpenPublicForm || (() => { window.location.search = '?form=rekrutacja'; })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-purple-100 hover:text-white text-xs font-semibold backdrop-blur-md transition-all shadow-md hover:shadow-lg border border-white/20 cursor-pointer"
          >
            <span>Kandydat do Koła? Złóż Deklarację Członkowską online</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-purple-200/60 space-y-1">
          <p className="font-medium">
            Wewnętrzny system ewidencyjny SKN WSKZ • Dostęp autoryzowany wyłącznie dla Członków Zarządu
          </p>
          <p className="text-[10px] text-purple-200/40">Wydział Psychologii WSKZ • Bezpieczne połączenie szyfrowane</p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('crm_skn_auth_session');
                  localStorage.removeItem('crm_skn_auth_user');
                  localStorage.removeItem('skn_user_passwords');
                  localStorage.removeItem('skn_user_first_login_status');
                } catch {}
                window.location.reload();
              }}
              className="text-[10px] text-purple-300/40 hover:text-purple-200 underline transition cursor-pointer"
            >
              Wyczyść zapisaną sesję i odśwież
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
