import { getAcademicYearFromDate } from './helpers.js';

/**
 * Normalizuje identyfikator koła naukowego na kanoniczny format tenanta.
 */
export function normalizeDorobekOrgId(orgId = 'skn_seksuologii') {
  const str = String(orgId || 'skn_seksuologii').trim().toLowerCase();
  if (!str || str === 'skn-template' || str === 'default' || str === 'skn-seksuologia' || str === 'skn_seksuologia') {
    return 'skn_seksuologii';
  }
  if (str === 'skn_psychoonkologii' || str === 'skn-psychoonkologia') return 'psychoonkologia';
  if (str === 'skn_uzaleznien' || str === 'sknu') return 'uzaleznienia';
  return str;
}

/**
 * Generuje deterministyczny, poprawny UUID v4 na podstawie dowolnego ciągu znaków.
 * Zapewnia spójność klucza głównego `attendance.id` (UUID) podczas operacji `upsert` w Supabase.
 */
export function deterministicUuidFromSeed(seed = '') {
  const input = String(seed || 'dorobek-seed');
  const fnv32 = (str, init) => {
    let h = init >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Dodatkowy avalanche (Murmur3 finalizer)
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  };

  const p1 = fnv32(`p1:${input}`, 0x811c9dc5);
  const p2 = fnv32(`p2:${input}`, 0x9e3779b9);
  const p3 = fnv32(`p3:${input}`, 0x85ebca6b);
  const p4 = fnv32(`p4:${input}`, 0xc2b2ae35);

  const bytes = new Uint8Array(16);
  const parts = [p1, p2, p3, p4];
  for (let i = 0; i < 4; i++) {
    bytes[i * 4] = (parts[i] >>> 24) & 0xff;
    bytes[i * 4 + 1] = (parts[i] >>> 16) & 0xff;
    bytes[i * 4 + 2] = (parts[i] >>> 8) & 0xff;
    bytes[i * 4 + 3] = parts[i] & 0xff;
  }

  // RFC 4122 version 4 & variant 10xx
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generuje nowy unikalny UUID dla nowo tworzonego wpisu dorobku.
 */
export function generateDorobekUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const tpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return tpl.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normText(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Wyznacza znormalizowany klucz biznesowy wpisu dorobku naukowego:
 * `organization_id + typ + znormalizowany tytuł + autor/lider + rok akademicki`.
 */
export function getDorobekBusinessKey(item, orgId = null) {
  if (!item || typeof item !== 'object') return '';
  const cleanOrg = normalizeDorobekOrgId(item.organization_id || item.orgId || orgId);
  const type = normText(item.type || item.category || item.kategoria || 'Project');
  const title = normText(item.title || item.opis || '');
  if (!title) return '';

  const authorOrLead = normText(
    item.leadResearcher ||
    item.authors ||
    item.speakers ||
    item.author ||
    item.imieNazwisko ||
    item.nrIndeksu ||
    ''
  );

  let acadYear = String(item.academicYear || item.rokAkademicki || '')
    .replace(/[\[\]]/g, '')
    .trim()
    .toLowerCase();

  if (!acadYear) {
    const rawDate = item.date || item.data || item.dataPublikacji || item.publicationDate;
    if (rawDate) {
      try {
        const acad = getAcademicYearFromDate(rawDate);
        if (acad?.short) acadYear = String(acad.short).toLowerCase();
      } catch {}
    }
  }
  if (!acadYear && item.year) {
    acadYear = String(item.year).trim().toLowerCase();
  }

  return `${cleanOrg}::${type}::${title}::${authorOrLead}::${acadYear}`;
}

/**
 * Zwraca deterministyczny UUID wiersza tabeli `attendance` w Supabase dla danego wpisu dorobku.
 */
export function getDorobekRowUuid(orgId, item) {
  const cleanOrg = normalizeDorobekOrgId(item?.organization_id || item?.orgId || orgId);
  const rawId = String(item?.id || '').trim();
  const bizKey = getDorobekBusinessKey(item, cleanOrg);
  // Jeśli mamy biznesowy klucz, preferujemy spójne ID lub deterministyczny klucz
  const stableId = rawId && !rawId.startsWith('res_row_') ? rawId : (bizKey || rawId || generateDorobekUuid());
  return deterministicUuidFromSeed(`${cleanOrg}::dorobek::${stableId}`);
}

/**
 * Usuwa duplikaty wpisów w module Dorobek & Badania zarówno po unikalnym `id`,
 * jak i po znormalizowanym kluczu biznesowym (`organization_id + typ + tytuł + autor/lider + rok akademicki`).
 */
export function deduplicateDorobek(list = [], orgId = null) {
  if (!Array.isArray(list) || list.length === 0) return [];

  const seenIds = new Set();
  const seenBusinessKeys = new Set();
  const result = [];

  for (const rawItem of list) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const cleanOrg = normalizeDorobekOrgId(rawItem.organization_id || rawItem.orgId || orgId);
    if (orgId && cleanOrg !== normalizeDorobekOrgId(orgId)) continue;

    const rawId = String(rawItem.id || '').trim();
    const bizKey = getDorobekBusinessKey(rawItem, cleanOrg);
    const idKey = rawId ? `${cleanOrg}::id::${rawId.toLowerCase()}` : '';

    if (idKey && seenIds.has(idKey)) continue;
    if (bizKey && seenBusinessKeys.has(bizKey)) continue;

    if (idKey) seenIds.add(idKey);
    if (bizKey) seenBusinessKeys.add(bizKey);

    const stableId = rawId || (bizKey ? deterministicUuidFromSeed(bizKey) : generateDorobekUuid());
    result.push({
      ...rawItem,
      id: stableId,
      organization_id: cleanOrg,
      orgId: cleanOrg,
    });
  }

  return result;
}
