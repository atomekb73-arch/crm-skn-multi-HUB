/**
 * Narzędzia Ochrony RODO - Privacy by Default & Dynamic Masking (Art. 25 RODO)
 *
 * ZASADA ARCHITEKTONICZNA:
 * 1. Model i stan (state, localStorage, Supabase) przechowują wyłącznie 100% pełne,
 *    prawdziwe dane (brak na stałe wpisanych kropek ••• ani uszkodzonych ciągów).
 * 2. Maskowanie zachodzi w locie wyłącznie w warstwie prezentacji JSX.
 * 3. Kopiowanie do schowka zawsze operuje na oryginalnym, pełnym tekście z modelu.
 */

/**
 * Dynamiczne maskowanie numeru telefonu w locie.
 * @param {string|null|undefined} phone - Pełny numer telefonu (np. "+48 501 273 366" lub "501273366")
 * @param {boolean} isProtected - Czy maskowanie ma być aktywne
 * @returns {string} Zamaskowany numer lub pełna wartość (albo "—" w razie braku)
 */
export function formatPhone(phone, isProtected) {
  if (!phone || phone === '—' || String(phone).trim() === '') return '—';
  if (!isProtected) return String(phone);
  
  const cleaned = String(phone).trim();
  // Pokazuje np. "+48 501 ••• •••" lub pierwsze 6-7 cyfr, a resztę kropkuje
  const matched = cleaned.match(/^(\+?\d{2,3}\s?\d{3})/);
  if (matched) {
    return `${matched[1]} ••• •••`;
  }
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)} ••• •••` : '••••••';
}

/**
 * Dynamiczne maskowanie adresu e-mail w locie.
 * @param {string|null|undefined} email - Pełny adres e-mail (np. "jan.kowalski@wskz.pl")
 * @param {boolean} isProtected - Czy maskowanie ma być aktywne
 * @returns {string} Zamaskowany e-mail lub pełna wartość (albo "—" w razie braku)
 */
export function formatEmail(email, isProtected) {
  if (!email || email === '—' || String(email).trim() === '') return '—';
  if (!isProtected) return String(email);
  
  const str = String(email).trim();
  const [user, domain] = str.split('@');
  if (!domain) return '•••••@••••';
  const visiblePrefix = user.length > 2 ? user.slice(0, 2) : user.slice(0, 1);
  return `${visiblePrefix}•••••@${domain}`;
}
