import { useState, useEffect, useCallback, useRef, startTransition } from 'react';

export const CACHE_KEYS = {
  FORMS_REGISTRY: 'CACHE_FORMS_REGISTRY',
  TEAMUP_EVENTS: 'CACHE_TEAMUP_EVENTS',
  TEAMUP_SUBCALENDARS: 'CACHE_TEAMUP_SUBCALENDARS',
  APP_STATE_SNAPSHOT: 'CACHE_APP_STATE_SNAPSHOT',
  CRM_CACHE_DATA: 'CRM_CACHE_DATA',
};

/**
 * Odczytuje dane z pamięci podręcznej localStorage (lub zapasowo z sessionStorage) (0ms synchronicznie).
 */
export function readSWRData(cacheKey) {
  if (typeof window === 'undefined') return null;
  try {
    let cached = null;
    if (window.localStorage) {
      cached = localStorage.getItem(cacheKey);
    }
    if (!cached && window.sessionStorage) {
      cached = sessionStorage.getItem(cacheKey);
    }
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed;
    }
    return { data: parsed, timestamp: 0 };
  } catch (e) {
    console.warn(`[SWR] Błąd odczytu cache (${cacheKey}):`, e);
    return null;
  }
}

/**
 * Zapisuje dane wraz ze znacznikiem czasu w pamięci podręcznej localStorage z obsługą QuotaExceededError.
 */
export function writeSWRData(cacheKey, data) {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({
      data,
      timestamp: Date.now(),
    });
    localStorage.setItem(cacheKey, payload);
  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22 || err.number === -2147024882) {
      console.warn('[SWR] Przepełnienie localStorage! Czyszczenie starych migawek...');
      // Usuń ciężkie, przestarzałe migawki
      try {
        localStorage.removeItem('CACHE_APP_STATE_SNAPSHOT');
        localStorage.removeItem('CACHE_APP_STATE_SNAPSHOT_skn-template');
        localStorage.removeItem('CACHE_FORMS_REGISTRY');
        localStorage.removeItem('CRM_CACHE_DATA');

        // Usuń stare klucze snapshotów / backupów z localStorage
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.includes('CACHE_APP_STATE_SNAPSHOT') || k.includes('_snap_') || k.includes('snapshot'))) {
            localStorage.removeItem(k);
          }
        }
      } catch (cleanErr) {
        console.warn('[SWR] Błąd podczas czyszczenia starych kluczy:', cleanErr);
      }

      // Spróbuj zapisać do sessionStorage (który ma osobny limit)
      try {
        if (window.sessionStorage) {
          sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
        }
      } catch (sessionErr) {
        console.error('[SWR] sessionStorage również przepełniony:', sessionErr);
      }
    } else {
      console.error('[SWR] Błąd zapisu cache:', err);
    }
  }
}

/**
 * Uniwersalny hook Stale-While-Revalidate (SWR):
 * 1. Natychmiastowy odczyt z localStorage (0ms, isLoading = false gdy dane w cache).
 * 2. Cichy fetch w tle (isRefreshing = true).
 * 3. Pasywna aktualizacja stanu tylko w przypadku zmiany danych (brak migania UI).
 */
export function useCachedFetch(cacheKey, fetcherFn, ttlMs = 5 * 60 * 1000) {
  const [cachedEntry] = useState(() => readSWRData(cacheKey));

  const [data, setData] = useState(() => (cachedEntry ? cachedEntry.data : null));
  const [lastUpdated, setLastUpdated] = useState(() =>
    cachedEntry?.timestamp ? new Date(cachedEntry.timestamp) : null
  );
  const [isLoading, setIsLoading] = useState(() => !cachedEntry?.data);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcherFn);
  fetcherRef.current = fetcherFn;

  const dataJsonRef = useRef(() => {
    try {
      return cachedEntry?.data ? JSON.stringify(cachedEntry.data) : '';
    } catch {
      return '';
    }
  });
  if (typeof dataJsonRef.current === 'function') {
    dataJsonRef.current = dataJsonRef.current();
  }

  const revalidate = useCallback(
    async (options = {}) => {
      const { force = false } = options;
      if (!fetcherRef.current) return null;

      if (!force && ttlMs > 0) {
        const currentCache = readSWRData(cacheKey);
        if (
          currentCache?.timestamp &&
          Date.now() - currentCache.timestamp < ttlMs &&
          currentCache?.data
        ) {
          // Nawet jeśli TTL jeszcze nie wygasł, wykonujemy cichą rewalidację w tle
        }
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const freshData = await fetcherRef.current();
        if (freshData !== undefined && freshData !== null) {
          let freshSerialized = '';
          try {
            freshSerialized = JSON.stringify(freshData);
          } catch {}

          const now = Date.now();
          writeSWRData(cacheKey, freshData);
          setLastUpdated(new Date(now));

          if (!freshSerialized || freshSerialized !== dataJsonRef.current) {
            dataJsonRef.current = freshSerialized;
            startTransition(() => {
              setData(freshData);
            });
          }
        }
        return freshData;
      } catch (err) {
        console.error(`[SWR] Błąd pobierania w tle (${cacheKey}):`, err);
        setError(err);
        return null;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [cacheKey, ttlMs]
  );

  useEffect(() => {
    let isMounted = true;

    // Przy zmianie klucza natychmiast wczytaj cache nowego klucza
    const existing = readSWRData(cacheKey);
    if (existing?.data) {
      try {
        dataJsonRef.current = JSON.stringify(existing.data);
      } catch {}
      setData(existing.data);
      setLastUpdated(existing.timestamp ? new Date(existing.timestamp) : null);
      setIsLoading(false);
    }

    async function execute() {
      if (!fetcherRef.current) return;
      setIsRefreshing(true);
      try {
        const freshData = await fetcherRef.current();
        if (isMounted && freshData !== undefined && freshData !== null) {
          let freshSerialized = '';
          try {
            freshSerialized = JSON.stringify(freshData);
          } catch {}

          const now = Date.now();
          writeSWRData(cacheKey, freshData);
          setLastUpdated(new Date(now));

          if (!freshSerialized || freshSerialized !== dataJsonRef.current) {
            dataJsonRef.current = freshSerialized;
            startTransition(() => {
              setData(freshData);
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error(`[SWR] Błąd pobierania w tle (${cacheKey}):`, err);
          setError(err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    execute();

    return () => {
      isMounted = false;
    };
  }, [cacheKey]);

  const mutate = useCallback(
    (updater) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          dataJsonRef.current = JSON.stringify(next);
        } catch {}
        writeSWRData(cacheKey, next);
        setLastUpdated(new Date());
        return next;
      });
    },
    [cacheKey]
  );

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    revalidate,
    mutate,
  };
}

export const useCachedData = useCachedFetch;

/**
 * Dedykowany hook obsługujący schemat odświeżania z promptu:
 * - domyślnie serwowane z Vercel Edge / lokalnego cache
 * - force = true: /api/get-data?bypassCache=true
 * - zapis pod kluczem CRM_CACHE_DATA w localStorage
 */
export function useRefreshCrmData(initialData = null) {
  const [data, setData] = useState(() => {
    if (initialData) return initialData;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const item = localStorage.getItem('CRM_CACHE_DATA');
        if (item) {
          const parsed = JSON.parse(item);
          return parsed.data || null;
        }
      } catch {}
    }
    return null;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const item = localStorage.getItem('CRM_CACHE_DATA');
        if (item) {
          const parsed = JSON.parse(item);
          return parsed.ts ? new Date(parsed.ts) : new Date();
        }
      } catch {}
    }
    return null;
  });

  const refreshData = useCallback(async (force = false) => {
    setIsRefreshing(true);
    try {
      const url = force ? '/api/get-data?bypassCache=true' : '/api/get-data';
      const res = await fetch(url);
      const fresh = await res.json();
      setData(fresh);
      const now = Date.now();
      localStorage.setItem('CRM_CACHE_DATA', JSON.stringify({ data: fresh, ts: now }));
      setLastSyncTime(new Date(now));
      return fresh;
    } catch (err) {
      console.error('Błąd odświeżania:', err);
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { data, isRefreshing, lastSyncTime, refreshData };
}

export default useCachedFetch;

