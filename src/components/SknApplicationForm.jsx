import React, { useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  GraduationCap,
  Lock,
  MessageSquare,
  VideoOff,
  FileCheck,
  Sparkles,
  Check,
  RotateCcw,
  X,
} from 'lucide-react';

// Wyrażenie regularne dla numeru indeksu: dokładnie 4 lub 5 cyfr, bez wiodącego zera
const INDEX_REGEX = /^[1-9][0-9]{3,4}$/;

// Standardowy wzorzec poprawnej struktury adresu e-mail
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Oficjalne kierunki studiów w Instytucie Psychologii WSKZ
const RECRUITMENT_STUDY_FIELDS = [
  'Psychologia',
  'Psychologia w biznesie',
];

// Słownik najczęstszych literówek w domenach pocztowych
const DOMAIN_TYPOS = {
  'gail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.pl': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmaii.com': 'gmail.com',
  'interi.pl': 'interia.pl',
  'interia.con': 'interia.pl',
  'itneria.pl': 'interia.pl',
  'wp.con': 'wp.pl',
  'wpp.pl': 'wp.pl',
  'wp.pll': 'wp.pl',
  'onet.con': 'onet.pl',
  'onett.pl': 'onet.pl',
  'o2.con': 'o2.pl',
  'op.con': 'op.pl',
  'wskz.con': 'wskz.pl',
  'wskz.pll': 'wskz.pl',
  'student.wskz.con': 'student.wskz.pl',
  'yahoo.con': 'yahoo.com',
  'hotmail.con': 'hotmail.com',
  'outlook.con': 'outlook.com',
};

export default function SknApplicationForm({ orgId: propOrgId = null }) {
  const orgCtx = typeof useOrg === 'function' ? useOrg() : null;

  // Rozpoznawanie organizacji: prop -> query params -> currentOrg w kontekście -> localStorage -> default 'uzaleznienia'
  const targetOrgId = useMemo(() => {
    if (propOrgId) return propOrgId;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlOrg = params.get('org') || params.get('organization_id') || params.get('kolo') || params.get('tenant');
      if (urlOrg) {
        const clean = urlOrg.toLowerCase();
        if (clean.includes('psycho')) return 'psychoonkologia';
        if (clean.includes('uzalez') || clean === 'sknu') return 'uzaleznienia';
        if (clean.includes('seks')) return 'skn_seksuologii';
        return clean;
      }
      if (window.location.hash) {
        const hash = window.location.hash.toLowerCase();
        if (hash.includes('psycho')) return 'psychoonkologia';
        if (hash.includes('uzalez') || hash.includes('sknu')) return 'uzaleznienia';
        if (hash.includes('seks')) return 'skn_seksuologii';
      }
    }
    if (orgCtx?.currentOrg?.id) {
      return orgCtx.currentOrg.id;
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('crm_active_org_id') : null;
    if (saved) return saved;

    // Domyślna organizacja dla formularza rekrutacyjnego
    return 'uzaleznienia';
  }, [propOrgId, orgCtx?.currentOrg?.id]);

  const isUzaleznienia = targetOrgId === 'uzaleznienia' || targetOrgId === 'sknu';
  const isPsychoonkologia = targetOrgId === 'psychoonkologia' || targetOrgId?.includes('psycho');

  // Nazwy i etykiety formalne organizacji
  const orgLine1 = 'Studenckie Koło Naukowe';
  const orgLine2 = isUzaleznienia
    ? 'Zachowań Ryzykowych i Uzależnień'
    : isPsychoonkologia
      ? 'Psychoonkologii WSKZ'
      : 'Seksuologii WSKZ';
  const orgFullName = `${orgLine1} ${orgLine2}`;
  const orgGenitive = isUzaleznienia
    ? 'Studenckiego Koła Naukowego Zachowań Ryzykowych i Uzależnień'
    : isPsychoonkologia
      ? 'Studenckiego Koła Naukowego Psychoonkologii WSKZ'
      : 'Studenckiego Koła Naukowego Seksuologii WSKZ';
  const orgBoardName = isUzaleznienia
    ? 'Zarząd Koła Naukowego Zachowań Ryzykowych i Uzależnień'
    : isPsychoonkologia
      ? 'Zarząd Koła Naukowego Psychoonkologii'
      : 'Zarząd SKN Seksuologii';

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    index_number: '',
    field_of_study: 'Psychologia',
    study_year: 'Rok 1, Semestr 1',
    consent_secret: false,
    consent_discussion: false,
    consent_no_recording: false,
    consent_materials: false,
  });

  const [touched, setTouched] = useState({
    full_name: false,
    email: false,
    index_number: false,
  });

  const [status, setStatus] = useState({ loading: false, success: false, error: null });
  const [archivalModal, setArchivalModal] = useState({
    isOpen: false,
    matchedRecord: null,
  });

  // 1. Walidacja numeru indeksu (4-5 cyfr, bez wiodącego 0)
  const indexError = useMemo(() => {
    const val = formData.index_number.trim();
    if (!val) return 'Numer indeksu jest wymagany.';
    if (/^0/.test(val)) {
      return 'Numer indeksu nie może rozpoczynać się od cyfry 0.';
    }
    if (!/^[0-9]+$/.test(val)) {
      return 'Numer indeksu może składać się wyłącznie z cyfr.';
    }
    if (val.length < 4 || val.length > 5) {
      return 'Numer indeksu musi mieć dokładnie 4 lub 5 cyfr (np. 1234 lub 12345).';
    }
    if (!INDEX_REGEX.test(val)) {
      return 'Numer indeksu musi mieć 4 lub 5 cyfr i nie może zaczynać się od zera.';
    }
    return null;
  }, [formData.index_number]);

  // 2. Walidacja struktury adresu e-mail
  const emailError = useMemo(() => {
    const val = formData.email.trim();
    if (!val) return 'Adres e-mail jest wymagany.';
    if (!EMAIL_REGEX.test(val)) {
      return 'Wprowadź prawidłowy adres e-mail (np. imie.nazwisko@student.wskz.pl).';
    }
    return null;
  }, [formData.email]);

  // 3. Sprawdzanie literówek w domenie i generowanie sugestii
  const emailTypoSuggestion = useMemo(() => {
    const val = formData.email.trim().toLowerCase();
    if (!val.includes('@')) return null;

    const parts = val.split('@');
    if (parts.length !== 2) return null;

    const [user, domain] = parts;
    const correctedDomain = DOMAIN_TYPOS[domain];
    if (correctedDomain && correctedDomain !== domain) {
      return `${user}@${correctedDomain}`;
    }
    return null;
  }, [formData.email]);

  // 4. Walidacja imienia i nazwiska
  const fullNameError = useMemo(() => {
    const val = formData.full_name.trim();
    if (!val) return 'Imię i nazwisko jest wymagane.';
    const words = val.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      return 'Wprowadź pełne imię i nazwisko (np. Anna Kowalska).';
    }
    return null;
  }, [formData.full_name]);

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const applyEmailSuggestion = (suggested) => {
    setFormData(prev => ({ ...prev, email: suggested }));
  };

  // Sprawdzenie, czy dany status oznacza rezygnację lub archiwum (Soft Check)
  const isArchivalOrResigned = (statusStr) => {
    if (!statusStr) return false;
    const s = String(statusStr).toLowerCase();
    return s.includes('rezygnacj') || s.includes('archiw');
  };

  // Sprawdzenie, czy status wskazuje na aktywnego lub oczekującego członka
  const isActiveOrPending = (statusStr) => {
    if (!statusStr) return true;
    const s = String(statusStr).toLowerCase();
    if (isArchivalOrResigned(s)) return false;
    if (s.includes('odrzucon')) return false;
    return true;
  };

  // Właściwa funkcja zapisu zgłoszenia do tabeli kwarantanny w Supabase
  const executeSubmission = async ({ isReactivation = false, previousStatus = null } = {}) => {
    setStatus({ loading: true, success: false, error: null });

    try {
      const payload = {
        organization_id: targetOrgId,
        submission_date: new Date().toISOString(),
        full_name: formData.full_name.trim(),
        email: formData.email.trim().toLowerCase(),
        index_number: formData.index_number.trim(),
        field_of_study: formData.field_of_study || 'Psychologia',
        study_year: formData.study_year || 'Rok 1, Semestr 1',
        consents_ok: true,
        decision_status: 'Oczekuje',
        academic_year: '2026/2027',
        custom_fields: isReactivation
          ? {
              reactivation: true,
              reactivation_date: new Date().toISOString(),
              previous_status: previousStatus || archivalModal.matchedRecord?.status || 'Rezygnacja / Archiwum',
              notes: 'Zgłoszenie powrotne po rezygnacji/archiwum (potwierdzone przez kandydata)',
            }
          : {},
      };

      console.log('[SknApplicationForm] Wysyłanie rekordu do Supabase quarantine_submissions:', payload);

      const { data, error, status: resStatus, statusText } = await supabase
        .from('quarantine_submissions')
        .insert([payload])
        .select();

      if (error) {
        console.error('Błąd Supabase:', error);
        throw error;
      }

      console.log('[SknApplicationForm] Rekord pomyślnie zapisany w bazie Supabase:', { resStatus, statusText, data });

      setArchivalModal({ isOpen: false, matchedRecord: null });
      setStatus({ loading: false, success: true, error: null });
      setFormData({
        full_name: '',
        email: '',
        index_number: '',
        field_of_study: 'Psychologia',
        study_year: 'Rok 1, Semestr 1',
        consent_secret: false,
        consent_discussion: false,
        consent_no_recording: false,
        consent_materials: false,
      });
      setTouched({
        full_name: false,
        email: false,
        index_number: false,
      });
    } catch (err) {
      console.error('Błąd Supabase:', err);
      const codePart = err?.code ? `[Kod błędu: ${err.code}] ` : '';
      const msgPart = err?.message || err?.details || (typeof err === 'string' ? err : 'Wystąpił błąd podczas zapisywania w bazie Supabase.');
      const hintPart = err?.hint ? ` (${err.hint})` : '';
      const formattedError = `${codePart}${msgPart}${hintPart}`;

      setStatus({
        loading: false,
        success: false,
        error: formattedError,
      });
      throw err;
    }
  };

  // Potwierdzenie powrotu po rezygnacji (kliknięcie „Tak, wyślij deklarację”)
  const handleConfirmReactivation = async () => {
    try {
      await executeSubmission({
        isReactivation: true,
        previousStatus: archivalModal.matchedRecord?.status,
      });
    } catch (err) {
      console.error('Błąd Supabase podczas reaktywacji:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Oznacz wszystkie pola jako dotknięte, aby uwidocznić ewentualne błędy
    setTouched({
      full_name: true,
      email: true,
      index_number: true,
    });

    // Weryfikacja poprawności numeru indeksu
    if (indexError) {
      setStatus({
        loading: false,
        success: false,
        error: indexError
      });
      return;
    }

    // Weryfikacja poprawności adresu e-mail
    if (emailError) {
      setStatus({
        loading: false,
        success: false,
        error: emailError
      });
      return;
    }

    // Weryfikacja imienia i nazwiska
    if (fullNameError) {
      setStatus({
        loading: false,
        success: false,
        error: fullNameError
      });
      return;
    }

    // Walidacja kompletu oświadczeń
    if (!formData.consent_secret || !formData.consent_discussion || !formData.consent_no_recording || !formData.consent_materials) {
      setStatus({
        loading: false,
        success: false,
        error: 'Musisz zaakceptować wszystkie wymagane oświadczenia i zgody formalne, aby dołączyć do Koła.'
      });
      return;
    }

    setStatus({ loading: true, success: false, error: null });

    const cleanIndex = formData.index_number.trim();
    const cleanEmail = formData.email.trim().toLowerCase();

    try {
      // 1. Sprawdzanie istnienia danych w tabeli kwarantanny oraz w tabeli członków Supabase dla TEJ organizacji
      const [quarantineRes, membersRes] = await Promise.all([
        supabase
          .from('quarantine_submissions')
          .select('id, index_number, email, decision_status, submission_date, full_name, organization_id')
          .eq('organization_id', targetOrgId)
          .or(`index_number.eq.${cleanIndex},email.ilike.${cleanEmail}`),
        supabase
          .from('members')
          .select('id, index_number, email, activity_status, full_name, organization_id')
          .eq('organization_id', targetOrgId)
          .or(`index_number.eq.${cleanIndex},email.ilike.${cleanEmail}`)
      ]);

      if (quarantineRes.error) {
        console.warn('Uwaga przy zapytaniu kwarantanny Supabase:', quarantineRes.error);
      }
      if (membersRes.error) {
        console.warn('Uwaga przy zapytaniu bazy members Supabase:', membersRes.error);
      }

      // Sprawdzenie lokalnej pamięci podręcznej członków (cache CRM offline / sesja)
      let localMatching = [];
      try {
        const localKeys = [
          `crm_czlonkowie_${targetOrgId}`,
          `crm_members_${targetOrgId}`,
          'crm_czlonkowie',
          'crm_members',
        ];
        for (const k of localKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              const matched = arr.filter(m => {
                const matchOrg = !m.organization_id || m.organization_id === targetOrgId;
                const matchIdx = m.index_number && String(m.index_number).trim() === cleanIndex;
                const matchMail = m.email && String(m.email).trim().toLowerCase() === cleanEmail;
                return matchOrg && (matchIdx || matchMail);
              });
              if (matched.length > 0) {
                localMatching = [...localMatching, ...matched.map(m => ({
                  source: 'Pamięć lokalna CRM',
                  status: m.status || m.membership_status || m.activity_status || 'Aktywny',
                  index_number: m.index_number,
                  email: m.email,
                  full_name: m.full_name || m.name,
                }))];
              }
            }
          }
        }
      } catch (errLocal) {
        console.warn('Błąd odczytu lokalnej bazy członków:', errLocal);
      }

      const qRecords = (quarantineRes.data || []).map(r => ({
        source: 'Kwarantanna zgłoszeń',
        status: r.decision_status || 'Oczekuje',
        index_number: r.index_number,
        email: r.email,
        full_name: r.full_name,
        raw: r
      }));

      const mRecords = (membersRes.data || []).map(r => ({
        source: 'Baza członków Koła',
        status: r.activity_status || 'Aktywny',
        index_number: r.index_number,
        email: r.email,
        full_name: r.full_name,
        raw: r
      }));

      const allMatches = [...qRecords, ...mRecords, ...localMatching];

      // 2. Obsługa aktywnego duplikatu:
      // Jeśli dany indeks/e-mail już istnieje i jest aktywny (lub oczekuje), zablokować wysyłkę
      const activeMatch = allMatches.find(m => isActiveOrPending(m.status));
      if (activeMatch) {
        setStatus({
          loading: false,
          success: false,
          error: 'Konto z tym numerem indeksu lub adresem e-mail już istnieje w systemie.'
        });
        return;
      }

      // 3. Obsługa powrotu po rezygnacji (Soft Check):
      // Jeśli system wykryje, że osoba o takim indeksie/e-mailu istnieje, ale ma status Rezygnacja lub Archiwum
      const archivalMatch = allMatches.find(m => isArchivalOrResigned(m.status));
      if (archivalMatch) {
        setStatus({ loading: false, success: false, error: null });
        setArchivalModal({
          isOpen: true,
          matchedRecord: archivalMatch
        });
        return;
      }

      // 4. Jeśli brak duplikatów - wysyłamy nowe zgłoszenie do kwarantanny
      await executeSubmission({ isReactivation: false });

    } catch (err) {
      console.error('Błąd Supabase:', err);
      const codePart = err?.code ? `[Kod błędu: ${err.code}] ` : '';
      const msgPart = err?.message || err?.details || (typeof err === 'string' ? err : 'Wystąpił błąd podczas przesyłania formularza. Spróbuj ponownie.');
      const hintPart = err?.hint ? ` (${err.hint})` : '';
      setStatus({
        loading: false,
        success: false,
        error: `${codePart}${msgPart}${hintPart}`,
      });
    }
  };

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden py-6 sm:py-12 md:py-16 px-3 sm:px-6 lg:px-8 flex items-center justify-center font-sans relative ${
      isUzaleznienia
        ? 'bg-[#f0f6f4] bg-gradient-to-b from-[#f4f8f6] via-[#edf5f2] to-[#e4efeb] selection:bg-teal-600 selection:text-white'
        : 'bg-[#eef4f8] bg-gradient-to-b from-[#f1f6fa] via-[#eef4f8] to-[#e4eef6] selection:bg-indigo-600 selection:text-white'
    }`}>
      <div className={`max-w-3xl w-full bg-white rounded-[24px] sm:rounded-[32px] shadow-2xl overflow-hidden p-4 sm:p-8 md:p-12 transition-all relative ${
        isUzaleznienia
          ? 'shadow-teal-950/10 border border-teal-100/90 ring-1 ring-teal-900/5'
          : 'shadow-sky-950/10 border border-sky-100/90 ring-1 ring-slate-900/5'
      }`}>

        {/* Nagłówek */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="mb-3.5">
            <span className={`inline-block px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wider uppercase shadow-2xs whitespace-nowrap ${
              isUzaleznienia
                ? 'bg-teal-50 text-teal-800 border border-teal-200/90'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
            }`}>
              Oficjalna rekrutacja • Rok akademicki 2026/2027
            </span>
          </div>

          <div className="space-y-1">
            <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight leading-tight">
              {orgLine1}
            </h1>
            <h2 className={`text-xl sm:text-3xl md:text-4xl lg:text-[34px] font-black tracking-tight leading-tight ${
              isUzaleznienia ? 'text-teal-950' : 'text-slate-950'
            }`}>
              {orgLine2}
            </h2>
          </div>

          <p className="mt-4 text-slate-700 font-semibold text-xs sm:text-sm md:text-base tracking-tight">
            Oficjalna Deklaracja Członkowska oraz Oświadczenia Formalne dla Studentów Psychologii WSKZ
          </p>
        </div>

        {status.success ? (
          <div className={`border rounded-3xl p-10 sm:p-12 text-center animate-in zoom-in-95 duration-200 shadow-xl space-y-5 ${
            isUzaleznienia
              ? 'bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/50 border-teal-200 text-teal-950 shadow-teal-500/10'
              : 'bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/50 border-emerald-200 text-emerald-900 shadow-emerald-500/10'
          }`}>
            <div className={`w-20 h-20 text-white rounded-3xl flex items-center justify-center mx-auto shadow-lg ${
              isUzaleznienia
                ? 'bg-gradient-to-tr from-teal-500 to-emerald-600 shadow-teal-500/30'
                : 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-emerald-500/30'
            }`}>
              <CheckCircle2 size={44} strokeWidth={2.3} />
            </div>
            <div className="space-y-2">
              <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                isUzaleznienia
                  ? 'bg-teal-100 text-teal-800 border-teal-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                Zgłoszenie zarejestrowane
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Deklaracja została pomyślnie przyjęta!
              </h3>
            </div>
            <p className="text-slate-600 max-w-md mx-auto text-sm leading-relaxed">
              Twoje zgłoszenie trafiło do systemu kwarantanny i oczekuje na weryfikację przez {orgBoardName}. Oficjalne potwierdzenie otrzymasz drogą mailową.
            </p>
            <div className="pt-3 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setStatus({ loading: false, success: false, error: null })}
                className={`px-6 py-3 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer inline-flex items-center gap-2 ${
                  isUzaleznienia
                    ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                }`}
              >
                <span>Złóż kolejną deklarację</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-8">

            {/* Główny baner błędu */}
            {status.error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3.5 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-in fade-in shadow-2xs">
                <AlertCircle size={18} className="shrink-0 text-rose-600" />
                <span>{status.error}</span>
              </div>
            )}

            {/* Dane Osobowe */}
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-black flex items-center gap-2">
                  <GraduationCap size={16} className="text-indigo-600" />
                  <span>1. Dane kandydata / studenta</span>
                </h2>
                <span className="text-[11px] text-slate-500 font-medium">* Pola wymagane</span>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                
                {/* Imię i Nazwisko */}
                <div>
                  <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-2">
                    Imię i Nazwisko *
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    required
                    value={formData.full_name}
                    onChange={handleChange}
                    onBlur={() => handleBlur('full_name')}
                    placeholder="np. Anna Kowalska"
                    className={`w-full px-4 py-3.5 rounded-2xl border text-slate-900 text-sm font-medium transition-all duration-200 shadow-2xs outline-none ${
                      touched.full_name && fullNameError
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:bg-white focus:ring-4 focus:ring-rose-400/25 focus:shadow-lg focus:shadow-rose-500/10'
                        : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-400/25 focus:shadow-lg focus:shadow-indigo-500/15'
                    }`}
                  />
                  {touched.full_name && fullNameError && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                      <AlertCircle size={13} className="shrink-0 text-rose-500" />
                      <span>{fullNameError}</span>
                    </div>
                  )}
                </div>

                {/* Adres E-mail z filtrem literówek */}
                <div>
                  <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-2">
                    Adres E-mail *
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={() => handleBlur('email')}
                    placeholder="nazwa@student.wskz.pl"
                    className={`w-full px-4 py-3.5 rounded-2xl border text-slate-900 text-sm font-medium transition-all duration-200 shadow-2xs outline-none ${
                      touched.email && emailError
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:bg-white focus:ring-4 focus:ring-rose-400/25 focus:shadow-lg focus:shadow-rose-500/10'
                        : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-400/25 focus:shadow-lg focus:shadow-indigo-500/15'
                    }`}
                  />

                  {/* Komunikat błędu e-mail */}
                  {touched.email && emailError && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                      <AlertCircle size={13} className="shrink-0 text-rose-500" />
                      <span>{emailError}</span>
                    </div>
                  )}

                  {/* Inteligentna sugestia literówki w domenie */}
                  {emailTypoSuggestion && (
                    <div className="mt-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={14} className="shrink-0 text-amber-600" />
                        <span>Czy miałeś na myśli: <strong className="font-semibold text-amber-950">{emailTypoSuggestion}</strong>?</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyEmailSuggestion(emailTypoSuggestion)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span>Popraw</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Numer Indeksu z rygorystyczną walidacją 4-5 cyfr bez 0 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-black uppercase tracking-wider">
                      Numer Indeksu *
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">
                      4 lub 5 cyfr (np. 12345)
                    </span>
                  </div>
                  <input
                    type="text"
                    name="index_number"
                    required
                    maxLength={5}
                    value={formData.index_number}
                    onChange={handleChange}
                    onBlur={() => handleBlur('index_number')}
                    placeholder="np. 12345"
                    className={`w-full px-4 py-3.5 rounded-2xl border text-slate-900 font-mono text-sm transition-all duration-200 shadow-2xs outline-none ${
                      touched.index_number && indexError
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:bg-white focus:ring-4 focus:ring-rose-400/25 focus:shadow-lg focus:shadow-rose-500/10'
                        : formData.index_number && !indexError
                        ? 'border-emerald-400 bg-emerald-50/30 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-400/25 focus:shadow-lg focus:shadow-emerald-500/10'
                        : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-400/25 focus:shadow-lg focus:shadow-indigo-500/15'
                    }`}
                  />
                  {/* Komunikat o błędzie formatu indeksu */}
                  {touched.index_number && indexError ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                      <AlertCircle size={13} className="shrink-0 text-rose-500" />
                      <span>{indexError}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Oficjalny numer albumu/indeksu bez wiodącego zera.
                    </p>
                  )}
                </div>

                {/* Kierunek i Rok/Semestr Studiów */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-2">
                      Kierunek Studiów *
                    </label>
                    <select
                      name="field_of_study"
                      value={formData.field_of_study}
                      onChange={handleChange}
                      className={`w-full px-4 py-3.5 rounded-2xl border text-black text-sm font-semibold transition-all duration-200 shadow-2xs outline-none cursor-pointer ${
                        isUzaleznienia
                          ? 'border-slate-300 bg-slate-50/50 hover:border-teal-400 focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-400/25 focus:shadow-lg focus:shadow-teal-500/15'
                          : 'border-slate-300 bg-slate-50/50 hover:border-indigo-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-400/25 focus:shadow-lg focus:shadow-indigo-500/15'
                      }`}
                    >
                      {RECRUITMENT_STUDY_FIELDS.map(field => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Wybierz kierunek studiów w Instytucie Psychologii WSKZ.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-2">
                      Rok / Semestr *
                    </label>
                    <select
                      name="study_year"
                      value={formData.study_year}
                      onChange={handleChange}
                      className="w-full px-4 py-3.5 rounded-2xl border border-slate-300 bg-slate-50/50 hover:border-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-400/25 focus:shadow-lg focus:shadow-indigo-500/15 text-black text-sm font-semibold transition-all duration-200 shadow-2xs outline-none cursor-pointer"
                    >
                      <option value="Rok 1, Semestr 1">Rok 1, Semestr 1</option>
                      <option value="Rok 1, Semestr 2">Rok 1, Semestr 2</option>
                      <option value="Rok 2, Semestr 3">Rok 2, Semestr 3</option>
                      <option value="Rok 2, Semestr 4">Rok 2, Semestr 4</option>
                      <option value="Rok 3, Semestr 5">Rok 3, Semestr 5</option>
                      <option value="Rok 3, Semestr 6">Rok 3, Semestr 6</option>
                      <option value="Rok 4, Semestr 7">Rok 4, Semestr 7</option>
                      <option value="Rok 4, Semestr 8">Rok 4, Semestr 8</option>
                      <option value="Rok 5, Semestr 9">Rok 5, Semestr 9</option>
                      <option value="Rok 5, Semestr 10">Rok 5, Semestr 10</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Wybierz swój aktualny semestr nauki na kierunku Psychologia.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Oświadczenia i Zgody Formalne */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-black flex items-center gap-2">
                  <ShieldCheck size={16} className={isUzaleznienia ? 'text-teal-600' : 'text-indigo-600'} />
                  <span>2. Oświadczenia formalne i regulaminowe (Wszystkie wymagane)</span>
                </h2>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                  isUzaleznienia
                    ? 'text-teal-800 bg-teal-50 border-teal-200'
                    : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                }`}>
                  Wymóg członkostwa
                </span>
              </div>

              {/* Zgoda 1: Poufność */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, consent_secret: !prev.consent_secret }))}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex items-start gap-4 cursor-pointer select-none ${
                  formData.consent_secret
                    ? isUzaleznienia
                      ? 'bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-teal-50/70 border-teal-300 ring-2 ring-teal-200/70 shadow-md shadow-teal-100/50'
                      : 'bg-gradient-to-r from-indigo-50/90 via-purple-50/40 to-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200/70 shadow-md shadow-indigo-100/50'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                  formData.consent_secret
                    ? isUzaleznienia
                      ? 'bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/30'
                      : 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-slate-100 text-slate-500 border border-slate-200/80'
                }`}>
                  <Lock size={24} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm tracking-tight mb-1">
                    Klauzula Poufności i Dyskrecji
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Zobowiązuję się do zachowania bezwzględnej tajemnicy w odniesieniu do wszelkich informacji o charakterze wrażliwym, przypadków klinicznych, opisów pacjentów oraz dyskusji prowadzonych podczas spotkań i warsztatów {orgGenitive}.
                  </p>
                </div>
                <div className="pt-1 shrink-0">
                  <div className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all ${
                    formData.consent_secret
                      ? isUzaleznienia
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-indigo-600 text-white shadow-xs'
                      : isUzaleznienia
                        ? 'border-2 border-slate-300 bg-white hover:border-teal-400'
                        : 'border-2 border-slate-300 bg-white hover:border-indigo-400'
                  }`}>
                    {formData.consent_secret && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              </div>

              {/* Zgoda 2: Aktywne uczestnictwo */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, consent_discussion: !prev.consent_discussion }))}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex items-start gap-4 cursor-pointer select-none ${
                  formData.consent_discussion
                    ? isUzaleznienia
                      ? 'bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-teal-50/70 border-teal-300 ring-2 ring-teal-200/70 shadow-md shadow-teal-100/50'
                      : 'bg-gradient-to-r from-indigo-50/90 via-purple-50/40 to-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200/70 shadow-md shadow-indigo-100/50'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                  formData.consent_discussion
                    ? isUzaleznienia
                      ? 'bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/30'
                      : 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-slate-100 text-slate-500 border border-slate-200/80'
                }`}>
                  <MessageSquare size={24} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm tracking-tight mb-1">
                    Aktywne Uczestnictwo i Zaangażowanie
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Deklaruję gotowość do regularnego i aktywnego udziału w spotkaniach, dyskusjach merytorycznych, badaniach naukowych lub pracach organizacyjnych prowadzonych przez Koło w roku akademickim 2026/2027.
                  </p>
                </div>
                <div className="pt-1 shrink-0">
                  <div className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all ${
                    formData.consent_discussion
                      ? isUzaleznienia
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-indigo-600 text-white shadow-xs'
                      : isUzaleznienia
                        ? 'border-2 border-slate-300 bg-white hover:border-teal-400'
                        : 'border-2 border-slate-300 bg-white hover:border-indigo-400'
                  }`}>
                    {formData.consent_discussion && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              </div>

              {/* Zgoda 3: Zakaz nagrywania */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, consent_no_recording: !prev.consent_no_recording }))}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex items-start gap-4 cursor-pointer select-none ${
                  formData.consent_no_recording
                    ? isUzaleznienia
                      ? 'bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-teal-50/70 border-teal-300 ring-2 ring-teal-200/70 shadow-md shadow-teal-100/50'
                      : 'bg-gradient-to-r from-indigo-50/90 via-purple-50/40 to-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200/70 shadow-md shadow-indigo-100/50'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                  formData.consent_no_recording
                    ? isUzaleznienia
                      ? 'bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/30'
                      : 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-slate-100 text-slate-500 border border-slate-200/80'
                }`}>
                  <VideoOff size={24} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm tracking-tight mb-1">
                    Bezwzględny Zakaz Rejestracji Dźwięku i Obrazu
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Oświadczam, że nie będę rejestrować (audio/video), fotografować ani rozpowszechniać materiałów, prezentacji ani wypowiedzi uczestników i prelegentów ze spotkań Koła bez wyraźnej, pisemnej zgody Zarządu i autorów.
                  </p>
                </div>
                <div className="pt-1 shrink-0">
                  <div className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all ${
                    formData.consent_no_recording
                      ? isUzaleznienia
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-indigo-600 text-white shadow-xs'
                      : isUzaleznienia
                        ? 'border-2 border-slate-300 bg-white hover:border-teal-400'
                        : 'border-2 border-slate-300 bg-white hover:border-indigo-400'
                  }`}>
                    {formData.consent_no_recording && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              </div>

              {/* Zgoda 4: Przetwarzanie danych i regulamin */}
              <div
                onClick={() => setFormData(prev => ({ ...prev, consent_materials: !prev.consent_materials }))}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex items-start gap-4 cursor-pointer select-none ${
                  formData.consent_materials
                    ? isUzaleznienia
                      ? 'bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-teal-50/70 border-teal-300 ring-2 ring-teal-200/70 shadow-md shadow-teal-100/50'
                      : 'bg-gradient-to-r from-indigo-50/90 via-purple-50/40 to-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200/70 shadow-md shadow-indigo-100/50'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                  formData.consent_materials
                    ? isUzaleznienia
                      ? 'bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/30'
                      : 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-slate-100 text-slate-500 border border-slate-200/80'
                }`}>
                  <FileCheck size={24} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm tracking-tight mb-1">
                    Zgoda na Przetwarzanie Danych i Regulamin Koła
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Wyrażam zgodę na przetwarzanie moich danych osobowych (imię, nazwisko, nr indeksu, e-mail) w celach ewidencji członkowskiej, komunikacji organizacyjnej oraz sprawozdawczości {orgGenitive}, zgodnie z regulaminem Koła i RODO.
                  </p>
                </div>
                <div className="pt-1 shrink-0">
                  <div className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all ${
                    formData.consent_materials
                      ? isUzaleznienia
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-indigo-600 text-white shadow-xs'
                      : isUzaleznienia
                        ? 'border-2 border-slate-300 bg-white hover:border-teal-400'
                        : 'border-2 border-slate-300 bg-white hover:border-indigo-400'
                  }`}>
                    {formData.consent_materials && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              </div>
            </div>

            {/* Przycisk wysyłki (Ekskluzywny styl Premium) */}
            <div className="pt-4 sm:pt-6">
              <button
                type="submit"
                disabled={status.loading || (touched.index_number && Boolean(indexError)) || (touched.email && Boolean(emailError))}
                className={`w-full py-4 px-8 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2.5 text-base tracking-wide cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                  isUzaleznienia
                    ? 'bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 shadow-xl shadow-teal-600/25 hover:shadow-teal-600/35'
                    : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/35'
                }`}
              >
                {status.loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Weryfikacja i rejestracja deklaracji...</span>
                  </>
                ) : (
                  <>
                    <Send size={20} strokeWidth={2.2} />
                    <span>Złóż Oficjalną Deklarację Członkowską</span>
                  </>
                )}
              </button>
              <p className="text-xs text-center text-slate-400 mt-3 leading-relaxed">
                Wysłane zgłoszenie zostanie zweryfikowane przez {orgBoardName}. Status rozpatrzenia otrzymasz drogą mailową.
              </p>
            </div>

          </form>
        )}



        {/* Modal: Obsługa powrotu po rezygnacji / archiwum (Soft Check) */}
        {archivalModal.isOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-indigo-100 p-6 sm:p-7 relative text-left animate-in zoom-in-95 duration-200">
              
              <button
                type="button"
                onClick={() => setArchivalModal({ isOpen: false, matchedRecord: null })}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg cursor-pointer"
                aria-label="Zamknij"
              >
                <X size={18} />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-4 shadow-xs">
                <RotateCcw size={22} strokeWidth={2.2} />
              </div>

              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Wykryto archiwalne konto
              </h3>

              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Wykryliśmy Twoje archiwalne konto w systemie (status:{' '}
                <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  {archivalModal.matchedRecord?.status || 'Rezygnacja / Archiwum'}
                </span>
                ).
              </p>

              <p className="text-xs font-semibold text-slate-800 mt-3 leading-relaxed">
                Wykryliśmy Twoje archiwalne konto w systemie. Czy chcesz wysłać nową deklarację i ubiegać się o ponowne przyjęcie do Koła?
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                <div>
                  <span className="text-slate-400 font-medium">Kandydat:</span>{' '}
                  <strong className="text-slate-800">{formData.full_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Nr indeksu:</span>{' '}
                  <strong className="text-slate-800 font-mono">{formData.index_number}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Adres e-mail:</span>{' '}
                  <strong className="text-slate-800">{formData.email}</strong>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setArchivalModal({ isOpen: false, matchedRecord: null })}
                  disabled={status.loading}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReactivation}
                  disabled={status.loading}
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isUzaleznienia
                      ? 'bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200'
                  }`}
                >
                  {status.loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Wysyłanie...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} strokeWidth={2.2} />
                      <span>Tak, wyślij deklarację</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
