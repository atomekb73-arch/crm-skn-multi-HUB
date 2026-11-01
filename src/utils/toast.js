/**
 * Globalny dyspozytor powiadomień Toast w aplikacji CRM.
 * Zastępuje blokujące okienka alert() i confirm() eleganckim, nieblokującym powiadomieniem w rogu ekranu.
 */
export function showToast(message) {
  if (!message) return;
  const text = typeof message === 'string' ? message : (message.message || String(message));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm-toast', { detail: text }));
  }
}

export default showToast;
