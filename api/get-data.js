/**
 * Vercel Serverless / Edge Caching API Route (/api/get-data)
 *
 * Zapewnia szybkie buforowanie brzegowe (Vercel Edge Network)
 * z obsługą nagłówka Cache-Control stale-while-revalidate,
 * parametru wymuszonego odświeżenia (?bypassCache=true) oraz
 * płytkiego pobierania (Shallow Fetching) dla głównego widoku tabeli.
 */

// Endpoint migracyjny - wycofany na rzecz Supabase SSOT.
// W przypadku braku skonfigurowanej zmiennej środowiskowej GAS_URL endpoint zwraca HTTP 410 (Gone).

/**
 * Filtruje i odchudza obiekt członka pod widok tabeli:
 * Pomija: pełną historię logów, surowe JSON-y odpowiedzi ze starych ankiet, rozbudowane notatki wieloakapitowe.
 * Zwraca wyłącznie: id, imieNazwisko, email, nrIndeksu, kierunekRok, status, frekwencja, punkty, zgodaMailing.
 */
function sanitizeShallowMember(m, index) {
  if (!m) return null;
  const id = m.id || `gas_m_${index + 1}`;
  const imieNazwisko = m.imieNazwisko || m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.name || '';
  const email = m.email ? String(m.email).toLowerCase().trim() : '';
  const nrIndeksu = m.nrIndeksu || m.index || m.cleanIndex || '';
  const kierunekRok = m.kierunekRok || m.kierunek || m.field || '';
  const status = m.status || m.statusWeryfikacji || 'active';
  const frekwencja = m.frekwencja || m.attendancePercent || 0;
  const punkty = m.punkty || m.points || 0;
  const zgodaMailing = m.zgodaMailing || m.zgodaNaMailing || (m.mailingConsent ? 'Zgoda na mailing' : 'Brak zgody');

  return {
    id,
    imieNazwisko,
    fullName: imieNazwisko,
    name: imieNazwisko,
    email,
    nrIndeksu,
    cleanIndex: nrIndeksu,
    index: nrIndeksu,
    kierunekRok,
    kierunek: kierunekRok,
    field: kierunekRok,
    status,
    statusWeryfikacji: m.statusWeryfikacji || (status === 'active' ? 'Zatwierdzony' : status),
    frekwencja,
    punkty,
    points: punkty,
    zgodaMailing,
    mailingConsent: Boolean(m.mailingConsent ?? (zgodaMailing === 'Zgoda na mailing' || zgodaMailing === true)),
    dataWplywu: m.dataWplywu || '',
    dataWeryfikacji: m.dataWeryfikacji || '',
    aliasy: m.aliasy || m.aliases || '',
    aliases: m.aliasy || m.aliases || '',
    phone: m.phone || m.telefon || '',
  };
}

export default async function handler(req, res) {
  // Bezpieczna obsługa CORS: zezwalaj tylko na wywołania z tej samej domeny, Vercel lub localhost
  const origin = req.headers.origin;
  const host = req.headers.host;
  const isAllowedOrigin = !origin ||
    (host && origin.includes(host)) ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.endsWith('.vercel.app') ||
    origin.endsWith('.wskz.pl');

  if (origin && isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (origin && !isAllowedOrigin) {
    return res.status(403).json({ error: 'Niedozwolone źródło żądania (CORS policy)' });
  }

  const query = req.query || {};
  const bypassCache = query.bypassCache === 'true' || query.bypass === 'true';
  const sheetType = query.sheetType || query.type || 'all';
  const action = query.action || 'pobierz_dane';

  // 1. Sprawdzenie czy wymuszono odświeżenie (omijamy cache)
  if (bypassCache) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  } else {
    // 2. Nagłówki Edge Cache: serwuj z Edge przez 60s, rewaliduj w tle przez kolejne 120s
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );
  }

  const GAS_URL = process.env.VITE_GAS_URL || process.env.GAS_URL || process.env.VITE_APPS_SCRIPT_URL;

  if (!GAS_URL) {
    return res.status(410).json({
      error: 'Endpoint wycofany (HTTP 410 Gone). Baza danych CRM została w pełni zmigrowana do Supabase SSOT.',
    });
  }

  // Obsługa opcjonalnych zapytań POST (proxy do Apps Script)
  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
      const postBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      const postResponse = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: postBody,
      });
      const postData = await postResponse.json().catch(() => ({ status: 'success' }));
      return res.status(200).json(postData);
    } catch (postErr) {
      console.error('Edge Proxy POST Error:', postErr);
      return res.status(500).json({ error: 'Błąd zapisu danych do backendu' });
    }
  }

  try {
    const params = new URLSearchParams();
    params.set('action', action);
    params.set('type', sheetType);
    params.set('bypass', String(bypassCache));
    if (query.sheetName) params.set('sheetName', query.sheetName);
    if (query.sheetId) params.set('sheetId', query.sheetId);

    const targetUrl = `${GAS_URL}?${params.toString()}`;
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`Upstream GAS HTTP ${response.status}`);
    }

    const data = await response.json();

    // Shallow payload optimization: Odchudzenie listy członków z ciężkich pól
    if (data && Array.isArray(data.czlonkowie)) {
      data.czlonkowie = data.czlonkowie.map((m, idx) => sanitizeShallowMember(m, idx)).filter(Boolean);
    }
    if (data && Array.isArray(data.members)) {
      data.members = data.members.map((m, idx) => sanitizeShallowMember(m, idx)).filter(Boolean);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Edge Proxy Error:', error);
    return res.status(500).json({ error: 'Błąd pobierania danych z backendu' });
  }
}
