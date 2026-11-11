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
 * Rozdziela ciąg zawierający potencjalnie wiele adresów e-mail (np. po przecinku, średniku, ukośniku, spacjach).
 * @param {string|null|undefined} emailStr
 * @returns {string[]} Tablica pojedynczych adresów e-mail
 */
export function splitEmails(emailStr) {
  if (!emailStr || emailStr === '—') return [];
  const str = String(emailStr).trim();
  const rawParts = str.split(/[,;/\n|]+/);
  const emails = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Przypadek rozdzielenia spacją dwóch adresów z @
    if (trimmed.includes(' ') && trimmed.includes('@')) {
      const sub = trimmed.split(/\s+/).filter(Boolean);
      emails.push(...sub);
    } else {
      emails.push(trimmed);
    }
  }

  return emails.length > 0 ? emails : [str];
}

/**
 * Maskuje pojedynczy adres e-mail (pokazuje pierwsze 2 znaki nazwy użytkownika i domenę).
 * @param {string} singleEmail
 * @param {boolean} isProtected
 * @returns {string}
 */
export function maskSingleEmail(singleEmail, isProtected) {
  const str = String(singleEmail || '').trim();
  if (!str || str === '—') return '—';
  if (!isProtected) return str;

  const atIndex = str.indexOf('@');
  if (atIndex === -1) {
    const prefix = str.length > 2 ? str.slice(0, 2) : str.slice(0, 1);
    return `${prefix}•••••`;
  }

  const user = str.slice(0, atIndex).trim();
  const visiblePrefix = user.length > 2 ? user.slice(0, 2) : (user.length > 0 ? user.slice(0, 1) : '');
  // Zgodnie z wytyczną RODO: ukrywamy również domenę po znaku @
  return `${visiblePrefix}•••••@•••••`;
}

/**
 * Dynamiczne maskowanie adresu lub adresów e-mail w locie.
 * Prawidłowo obsługuje pojedyncze i wielokrotne adresy e-mail dla jednej osoby.
 * @param {string|null|undefined} email - Pojedynczy lub wielokrotny e-mail (np. "jan@wskz.pl, jan@gmail.com")
 * @param {boolean} isProtected - Czy maskowanie ma być aktywne
 * @returns {string} Zamaskowany e-mail lub pełna wartość (albo "—" w razie braku)
 */
export function formatEmail(email, isProtected) {
  if (!email || email === '—' || String(email).trim() === '') return '—';
  if (!isProtected) return String(email).trim();

  const list = splitEmails(email);
  if (list.length <= 1) {
    return maskSingleEmail(list[0] || email, isProtected);
  }

  return list.map((e) => maskSingleEmail(e, isProtected)).join(', ');
}

/**
 * Maskuje pojedynczy numer telefonu (pokazuje dokładnie pierwsze 3 znaki).
 * @param {string} singlePhone
 * @param {boolean} isProtected
 * @returns {string}
 */
export function maskSinglePhone(singlePhone, isProtected) {
  const cleaned = String(singlePhone || '').trim();
  if (!cleaned || cleaned === '—') return '—';
  if (!isProtected) return cleaned;

  // Pokazuje dokładnie pierwsze 3 znaki numeru (np. "501 ••• •••" lub "+48 ••• •••")
  const prefix = cleaned.slice(0, 3);
  return `${prefix} ••• •••`;
}

/**
 * Dynamiczne maskowanie numeru telefonu w locie.
 * Skrócone zgodnie z wytyczną RODO do pierwszych 3 znaków.
 * @param {string|null|undefined} phone - Pełny numer telefonu (np. "501 273 366" lub "+48 501 273 366")
 * @param {boolean} isProtected - Czy maskowanie ma być aktywne
 * @returns {string} Zamaskowany numer lub pełna wartość (albo "—" w razie braku)
 */
export function formatPhone(phone, isProtected) {
  if (!phone || phone === '—' || String(phone).trim() === '') return '—';
  if (!isProtected) return String(phone).trim();

  const parts = String(phone).split(/[,;/]+/);
  if (parts.length <= 1) {
    return maskSinglePhone(parts[0] || phone, isProtected);
  }

  return parts.map((p) => maskSinglePhone(p, isProtected)).join(', ');
}
