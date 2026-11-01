/**
 * Vercel Serverless / Edge Caching API Route (/api/member-details)
 *
 * Pobiera szczegółowe dane pojedynczego członka (notatki, odpowiedzi ankiet, historia logów)
 * na żądanie przy otwarciu dedykowanego modala lub panelu bocznego.
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyemfBSsfNQwurJkaO-IU3RgSxFM9rh2K6bVwQiCwWv1NIb2EsktHHihDpgfzT9kV4l/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const memberId = query.id || query.nrIndeksu || query.index;

  if (!memberId) {
    return res.status(400).json({ error: 'Brak wymaganego parametru id (lub nrIndeksu)' });
  }

  // Edge cache: serwuj z Edge przez 60s, rewaliduj w tle przez kolejne 120s
  const bypassCache = query.bypassCache === 'true' || query.bypass === 'true';
  if (bypassCache) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  }

  const GAS_URL = process.env.VITE_GAS_URL || process.env.GAS_URL || process.env.VITE_APPS_SCRIPT_URL || DEFAULT_GAS_URL;

  try {
    const params = new URLSearchParams();
    params.set('action', 'szczegoly_czlonka');
    params.set('id', String(memberId));
    if (bypassCache) params.set('bypass', 'true');

    const targetUrl = `${GAS_URL}?${params.toString()}`;
    const response = await fetch(targetUrl);

    if (response.ok) {
      const data = await response.json();
      if (data && data.status === 'success' && data.member) {
        return res.status(200).json(data);
      }
      // Jeśli doGet z GAS zwrócił już kompletne dane (pobierzWszystkieDane zwraca czlonkowie)
      if (data && Array.isArray(data.czlonkowie)) {
        const rawList = data.czlonkowie;
        const cleanTarget = String(memberId).trim().toLowerCase();

        let found = rawList.find(m => {
          const idx = String(m.nrIndeksu || m.index || m.cleanIndex || '').trim().toLowerCase();
          const mId = String(m.id || '').trim().toLowerCase();
          const email = String(m.email || '').trim().toLowerCase();
          return idx === cleanTarget || mId === cleanTarget || email === cleanTarget;
        });

        if (!found) {
          const gasMatch = cleanTarget.match(/^gas_m_(\d+)$/i);
          if (gasMatch) {
            const idx = parseInt(gasMatch[1], 10) - 1;
            if (idx >= 0 && idx < rawList.length) {
              found = rawList[idx];
            }
          }
        }

        if (found) {
          return res.status(200).json({
            status: 'success',
            id: memberId,
            member: found,
            details: {
              notatki: found.notatki || found.notes || '',
              odpowiedziAnkiet: found.odpowiedziAnkiet || found.rawSurveyJson || found.surveyResponses || null,
              historiaLogow: found.historiaLogow || found.logs || [],
              roleZarzadowe: found.roleZarzadowe || [],
            }
          });
        }
      }
    }

    // Fallback: odpytaj tylko w razie braku czlonkowie w pierwszej odpowiedzi
    const fallbackUrl = `${GAS_URL}?action=pobierz_dane`;
    const fallbackRes = await fetch(fallbackUrl);
    if (fallbackRes.ok) {
      const fullData = await fallbackRes.json();
      const rawList = fullData.czlonkowie || [];
      const cleanTarget = String(memberId).trim().toLowerCase();

      let found = rawList.find(m => {
        const idx = String(m.nrIndeksu || m.index || m.cleanIndex || '').trim().toLowerCase();
        const mId = String(m.id || '').trim().toLowerCase();
        const email = String(m.email || '').trim().toLowerCase();
        return idx === cleanTarget || mId === cleanTarget || email === cleanTarget;
      });

      if (!found) {
        const gasMatch = cleanTarget.match(/^gas_m_(\d+)$/i);
        if (gasMatch) {
          const idx = parseInt(gasMatch[1], 10) - 1;
          if (idx >= 0 && idx < rawList.length) {
            found = rawList[idx];
          }
        }
      }

      if (found) {
        return res.status(200).json({
          status: 'success',
          id: memberId,
          member: found,
          details: {
            notatki: found.notatki || found.notes || '',
            odpowiedziAnkiet: found.odpowiedziAnkiet || found.rawSurveyJson || found.surveyResponses || null,
            historiaLogow: found.historiaLogow || found.logs || [],
            roleZarzadowe: found.roleZarzadowe || [],
          }
        });
      }
    }

    return res.status(404).json({ error: 'Nie znaleziono członka o podanym identyfikatorze' });
  } catch (error) {
    console.error('Member Details Proxy Error:', error);
    return res.status(500).json({ error: 'Błąd pobierania szczegółowych danych członka' });
  }
}
