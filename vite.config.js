import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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

function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const GAS_URL = process.env.VITE_GAS_API_URL || process.env.VITE_GAS_URL || process.env.GAS_URL || process.env.VITE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyemfBSsfNQwurJkaO-IU3RgSxFM9rh2K6bVwQiCwWv1NIb2EsktHHihDpgfzT9kV4l/exec';

        // 1. Endpoint /api/member-details?id=...
        if (rawUrl.startsWith('/api/member-details')) {
          try {
            const url = new URL(rawUrl, 'http://localhost');
            const memberId = url.searchParams.get('id') || url.searchParams.get('nrIndeksu') || url.searchParams.get('index');
            const bypassCache = url.searchParams.get('bypassCache') === 'true' || url.searchParams.get('bypass') === 'true';

            if (!memberId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Brak wymaganego parametru id (lub nrIndeksu)' }));
              return;
            }

            if (bypassCache) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            } else {
              res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
            }

            const fallbackUrl = `${GAS_URL}?action=pobierz_dane`;
            const fallbackRes = await fetch(fallbackUrl);
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
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                status: 'success',
                id: memberId,
                member: found,
                details: {
                  notatki: found.notatki || found.notes || '',
                  odpowiedziAnkiet: found.odpowiedziAnkiet || found.rawSurveyJson || found.surveyResponses || null,
                  historiaLogow: found.historiaLogow || found.logs || [],
                  roleZarzadowe: found.roleZarzadowe || [],
                }
              }));
              return;
            }

            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Nie znaleziono członka o podanym identyfikatorze' }));
            return;
          } catch (err) {
            console.error('[vercelApiDevPlugin member-details] Error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Błąd pobierania szczegółów członka' }));
            return;
          }
        }

        // 2. Endpoint /api/data i /api/get-data
        if (rawUrl.startsWith('/api/data') || rawUrl.startsWith('/api/get-data')) {
          try {
            const url = new URL(rawUrl, 'http://localhost');
            const bypassCache = url.searchParams.get('bypassCache') === 'true' || url.searchParams.get('bypass') === 'true';
            const sheetType = url.searchParams.get('sheetType') || url.searchParams.get('type') || 'all';
            const action = url.searchParams.get('action') || 'pobierz_dane';

            if (bypassCache) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            } else {
              res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const upstream = await fetch(GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body
                  });
                  const json = await upstream.json().catch(() => ({ status: 'success' }));
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(json));
                } catch {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Proxy error' }));
                }
              });
              return;
            }

            const targetParams = new URLSearchParams(url.searchParams);
            targetParams.set('action', action);
            targetParams.set('type', sheetType);
            targetParams.set('bypass', String(bypassCache));

            const upstream = await fetch(`${GAS_URL}?${targetParams.toString()}`);
            const data = await upstream.json();

            // Shallow Fetching: Odchudzenie listy członków w widoku tabeli
            if (data && Array.isArray(data.czlonkowie)) {
              data.czlonkowie = data.czlonkowie.map((m, idx) => sanitizeShallowMember(m, idx)).filter(Boolean);
            }
            if (data && Array.isArray(data.members)) {
              data.members = data.members.map((m, idx) => sanitizeShallowMember(m, idx)).filter(Boolean);
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (err) {
            console.error('[vercelApiDevPlugin] Error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Błąd pobierania danych z backendu' }));
          }
          return;
        }
        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    plugins: [
      react(),
      tailwindcss(),
      vercelApiDevPlugin(),
    ],

    build: {
      // 1. Source maps wyłączone na produkcji (brak podglądu struktury kodu w F12)
      sourcemap: false,
      emptyOutDir: true,
      // 2. Zaawansowana obfuskacja i minifikacja kodu produkcyjnego przez Terser
      minify: isProd ? 'terser' : 'esbuild',
      terserOptions: isProd ? {
        compress: {
          drop_console: true,        // usuwa wszelkie console.log z produkcji
          drop_debugger: true,       // usuwa instrukcje debugger
          pure_funcs: ['console.info', 'console.debug', 'console.warn'],
          passes: 2,                 // dwuetapowa kompresja dla maksymalnej optymalizacji
        },
        mangle: {
          toplevel: true,            // zamiana nazw zmiennych i funkcji na poziomie głównym
          eval: true,
        },
        format: {
          comments: false,           // całkowite usunięcie komentarzy i licencji z kodu
        },
      } : undefined,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/xlsx')) {
              return 'xlsx';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'icons';
            }
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react-vendor';
            }
          }
        }
      }
    },

    server: {
      port: 5175,
      proxy: {
        '/api-teamup': {
          target: 'https://api.teamup.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api-teamup/, ''),
          headers: {
            'Teamup-Token': process.env.VITE_TEAMUP_API_KEY || process.env.VITE_TEAMUP_TOKEN || '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112'
          }
        }
      }
    }
  }
})
