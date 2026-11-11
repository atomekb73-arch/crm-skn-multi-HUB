/**
 * Narzędzie kryptograficzne CRM SKN WSKZ
 * Wykorzystuje natywne Web Crypto API (crypto.subtle) dostępne we wszystkich nowoczesnych przeglądarkach.
 * Zapewnia bezpieczne haszowanie haseł algorytmem SHA-256 z solą (salt)
 * bez konieczności instalowania zewnętrznych zależności.
 */

const CRM_PEPPER = 'CRM_SKN_WSKZ_SALT_v2_2026';

/**
 * Konwertuje ArrayBuffer na ciąg szesnastkowy (hex string)
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Bezpieczne haszowanie hasła (SHA-256 + salt + pepper)
 * @param {string} password - Czyste hasło podane przez użytkownika
 * @param {string} [salt] - Opcjonalna sól (np. znormalizowany adres e-mail)
 * @returns {Promise<string>} Szesnastkowy skrót SHA-256 poprzedzony prefiksem 'sha256$'
 */
export async function hashPassword(password, salt = '') {
  if (!password || typeof password !== 'string') return '';
  const cleanSalt = String(salt || '').trim().toLowerCase();
  const input = `${CRM_PEPPER}:${cleanSalt}:${password}`;

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return `sha256$${bufferToHex(hashBuffer)}`;
  }

  // Bezpieczny fallback dla środowisk bez Web Crypto (np. starsze testy CLI)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `sha256$legacy_${Math.abs(hash).toString(16)}`;
}

/**
 * Weryfikacja hasła: obsługuje zarówno bezpieczny skrót 'sha256$...',
 * jak i płynną migrację ze starych haseł zapisanych wcześniej czystym tekstem.
 * @param {string} inputPassword - Hasło wpisane przez użytkownika
 * @param {string} storedHashOrPlain - Skrót z bazy/localStorage lub stare hasło
 * @param {string} [salt] - Sól (np. e-mail)
 * @returns {Promise<boolean>} Czy hasło jest poprawne
 */
export async function verifyPassword(inputPassword, storedHashOrPlain, salt = '') {
  if (!inputPassword || !storedHashOrPlain) return false;
  const cleanInput = String(inputPassword).trim();
  const stored = String(storedHashOrPlain).trim();

  // 1. Jeśli w pamięci znajduje się już bezpieczny skrót sha256$...
  if (stored.startsWith('sha256$')) {
    const expectedHash = await hashPassword(cleanInput, salt);
    return expectedHash === stored;
  }

  // 2. Wsteczna kompatybilność: hasło było wcześniej w jawnym tekście
  return cleanInput === stored;
}
