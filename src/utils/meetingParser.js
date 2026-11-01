/**
 * meetingParser.js - Centralny moduł parsowania i dopasowywania uczestników spotkań (Google Meet)
 *
 * Zapewnia ścisłe reguły Waterfall Matching:
 * 1. Zgodność 1:1 Imię + Nazwisko (exact match, case & diacritics insensitive, prosta i odwrócona kolejność)
 * 2. Zgodność 1:1 z którymkolwiek wpisem w polu `aliasy` (kolumna J) danego członka
 * 3. Zgodność z numerem indeksu lub adresem e-mail
 * 4. Brak dopasowania -> Gość zewnętrzny (BEZWZGLĘDNY zakaz dopasowywania po samym nazwisku)
 * 5. Ścisłe dopasowanie Opiekunów (brak fałszywych dopasowań częściowych/substringów)
 */

import {
  normalizeDiacritics,
  getStoredSupervisors,
  DEFAULT_FACULTY_SUPERVISORS,
  isFacultySupervisor,
  isMonikaLyniewska,
} from './specialRoles.js';
import { normalizeStudentIndex } from './helpers.js';

export { normalizeStudentIndex };

/**
 * Czyści i normalizuje imię/nazwisko (usuwa tytuły naukowe, interpunkcję, wielokrotne spacje).
 */
export function normalizePersonName(str) {
  if (!str) return '';
  let clean = String(str)
    // Usuń techniczne prefiksy
    .replace(/^\[SPEAKER\]:\s*/i, '')
    .replace(/^\[SPEAKER\]\s*/i, '')
    .replace(/^\[GOŚĆ\]:\s*/i, '')
    .replace(/^\[GOŚĆ\]\s*/i, '')
    .replace(/^\[GOSC\]:\s*/i, '')
    .replace(/^\[GOSC\]\s*/i, '')
    .replace(/^\[PRELEGENT\]:\s*/i, '')
    .replace(/^\[PRELEGENT\]\s*/i, '')
    // Usuń tytuły naukowe (dr, hab., prof., mgr, lek., inż., itp.)
    .replace(/\b(dr\s+hab\.|dr\s+n\.\s*med\.|prof\.\s*zw\.|dr|hab\.|prof\.|mgr\s+inż\.|mgr|lek\.|inż\.)\b/gi, ' ')
    // Usuń nawiasy i ich zawartość z indeksami / rolami np. (34327), (Gość)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    // Normalizacja znaków diakrytycznych
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Usuń znaki niealfanumeryczne poza spacjami
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .trim();

  // Zwiń wielokrotne białe znaki
  return clean.replace(/\s+/g, ' ');
}

/**
 * Parsuje pole aliasów (string oddzielony przecinkami, średnikami lub nową linią, albo tablicę).
 */
export function parseAliasesList(aliasesField) {
  if (!aliasesField) return [];
  if (Array.isArray(aliasesField)) {
    return aliasesField.map(a => String(a).trim()).filter(Boolean);
  }
  return String(aliasesField)
    .split(/[,;\n\r]+/)
    .map(a => a.trim())
    .filter(Boolean);
}

/**
 * Normalizuje numer indeksu (same cyfry).
 */
export function normalizeIndexNumber(index) {
  return normalizeStudentIndex(index);
}

/**
 * Ścisłe dopasowanie Opiekuna Koła Naukowego (Case: Ewa Skupińska vs Barbara Kupińska).
 * Eliminuje częściowe dopasowania rozmyte i podciągi.
 */
export function matchSupervisorExact(query, customSupervisors = null) {
  if (!query) return null;
  const qNorm = normalizePersonName(query);
  if (!qNorm || qNorm.length < 3) return null;

  let list = Array.isArray(customSupervisors) && customSupervisors.length > 0
    ? customSupervisors
    : getStoredSupervisors();

  if (!Array.isArray(list) || list.length === 0) {
    list = DEFAULT_FACULTY_SUPERVISORS;
  }

  const combinedList = [...list];
  for (const defSup of DEFAULT_FACULTY_SUPERVISORS) {
    if (!combinedList.some(s => normalizePersonName(s.name || s.fullName) === normalizePersonName(defSup.name))) {
      combinedList.push(defSup);
    }
  }

  for (const sup of combinedList) {
    if (sup.isActive === false) continue;

    // 1. Zgodność e-mail
    if (sup.email && normalizeDiacritics(sup.email).toLowerCase().trim() === normalizeDiacritics(query).toLowerCase().trim()) {
      return sup;
    }

    // 2. Zgodność 1:1 Imię + Nazwisko
    const supNorm = normalizePersonName(sup.name || sup.fullName);
    if (!supNorm) continue;

    if (qNorm === supNorm) return sup;

    // Odwrócona kolejność (Nazwisko Imię vs Imię Nazwisko)
    const supTokens = supNorm.split(' ').filter(Boolean);
    if (supTokens.length >= 2) {
      const reversedSup = [...supTokens].reverse().join(' ');
      if (qNorm === reversedSup) return sup;
    }

    // 3. Zgodność z aliasami opiekuna
    const supAliases = parseAliasesList(sup.aliases);
    for (const alias of supAliases) {
      const aliasNorm = normalizePersonName(alias);
      if (aliasNorm && (qNorm === aliasNorm || qNorm === aliasNorm.split(' ').reverse().join(' '))) {
        return sup;
      }
    }
  }

  return null;
}

/**
 * Główna funkcja Waterfall Matching dla członka koła.
 *
 * Priorytet:
 * 0. Sprawdzenie jawnych numerów indeksu (pojedynczy lub lista rozdzielona przecinkami/spacjami)
 * 1. Zgodność 1:1 Imię + Nazwisko (exact match, case-insensitive)
 * 2. Zgodność 1:1 z którymkolwiek wpisem w polu Aliasy (kolumna J) danego członka
 * 3. Zgodność z globalną mapą aliasów (aliasesMap)
 * 4. Zgodność po numerze indeksu (jeśli przekazano lub wyekstrahowano z zapytania)
 * 5. Zgodność po e-mailu
 * 6. Brak dopasowania -> null (Gość zewnętrzny; zakaz dopasowywania po samym nazwisku)
 */
export function matchMemberExact(query, members = [], aliasesMap = {}) {
  if (!query) return null;
  if (!Array.isArray(members) || members.length === 0) return null;

  const rawStr = String(query)
    .replace(/^\[SPEAKER\]:\s*/i, '')
    .replace(/^\[SPEAKER\]\s*/i, '')
    .replace(/^\[GOŚĆ\]:\s*/i, '')
    .replace(/^\[GOŚĆ\]\s*/i, '')
    .replace(/^\[GOSC\]:\s*/i, '')
    .replace(/^\[GOSC\]\s*/i, '')
    .replace(/^\[CZŁONEK KOŁA\]:\s*/i, '')
    .replace(/^\[CZŁONEK KOŁA\]\s*/i, '')
    .replace(/^\[CZLONEK KOLA\]:\s*/i, '')
    .replace(/^\[CZLONEK KOLA\]\s*/i, '')
    .replace(/^\[CZŁONEK\]:\s*/i, '')
    .replace(/^\[CZŁONEK\]\s*/i, '')
    .replace(/^\[OPIEKUN\]:\s*/i, '')
    .replace(/^\[OPIEKUN\]\s*/i, '')
    .replace(/^Indeks:\s*/i, '')
    .replace(/^Nr:\s*/i, '')
    .replace(/^nr\s+indeksu:\s*/i, '')
    .trim();

  const qNorm = normalizePersonName(rawStr);

  // ── PRIORYTET 0: Sprawdzenie jawnych numerów indeksu (pojedynczy lub lista rozdzielona przecinkami/spacjami) ──
  const allExtractedIndexes = (rawStr.match(/\b\d{3,6}\b/g) || []).map(normalizeIndexNumber).filter(Boolean);
  if (allExtractedIndexes.length > 0) {
    for (const singleIdx of allExtractedIndexes) {
      const byIdx = members.find(m => normalizeIndexNumber(m.index || m.nrIndeksu) === singleIdx);
      if (byIdx) return byIdx;
    }
  }

  // ── PRIORYTET 1: Zgodność 1:1 Imię + Nazwisko (exact match) ──────────────────
  if (qNorm && qNorm.includes(' ')) {
    for (const m of members) {
      if (!m) continue;
      const mFullNorm = normalizePersonName(
        m.fullName || m.imieNazwisko || m.name || `${m.firstName || m.imie || ''} ${m.lastName || m.nazwisko || ''}`
      );
      if (!mFullNorm) continue;

      if (qNorm === mFullNorm) return m;

      // Sprawdź odwróconą kolejność: "Litwińska Ewa" vs "Ewa Litwińska"
      const mTokens = mFullNorm.split(' ').filter(Boolean);
      if (mTokens.length >= 2) {
        const mReversed = [...mTokens].reverse().join(' ');
        if (qNorm === mReversed) return m;
      }

      // Sprawdź bezpośrednio firstName i lastName jeśli podane osobno
      const fn = normalizeDiacritics(m.firstName || m.imie || '').toLowerCase().trim();
      const ln = normalizeDiacritics(m.lastName || m.nazwisko || '').toLowerCase().trim();
      if (fn && ln) {
        if (qNorm === `${fn} ${ln}` || qNorm === `${ln} ${fn}`) return m;
      }
    }
  }

  // ── PRIORYTET 2: Zgodność 1:1 z polem Aliasy danego członka (Kolumna J) ────────
  // (Case: Ewa Utratna posiadająca w aliasach "Ewa Litwińska")
  if (qNorm) {
    for (const m of members) {
      if (!m) continue;
      const memberAliases = parseAliasesList(m.aliases || m.aliasy || m.alias || m.meetAlias);
      for (const alias of memberAliases) {
        const aNorm = normalizePersonName(alias);
        if (!aNorm) continue;

        if (qNorm === aNorm) return m;

        // Odwrócona kolejność aliasu
        const aTokens = aNorm.split(' ').filter(Boolean);
        if (aTokens.length >= 2 && qNorm === [...aTokens].reverse().join(' ')) {
          return m;
        }
      }
    }
  }

  // ── PRIORYTET 3: Globalna mapa aliasów z pamięci lokalnej (aliasesMap) ─────────
  if (aliasesMap && typeof aliasesMap === 'object') {
    const rawKey = normalizeDiacritics(rawStr).toLowerCase().trim();
    const mappedTarget = aliasesMap[rawKey] || aliasesMap[qNorm];
    if (mappedTarget) {
      const targetStr = String(mappedTarget).trim();
      const targetIdx = normalizeIndexNumber(targetStr);
      const matchByAlias = members.find(m => {
        if (!m) return false;
        if (targetIdx && normalizeIndexNumber(m.index || m.nrIndeksu) === targetIdx) return true;
        if (m.id === targetStr) return true;
        const mFull = normalizePersonName(m.fullName || `${m.firstName} ${m.lastName}`);
        return mFull === normalizePersonName(targetStr);
      });
      if (matchByAlias) return matchByAlias;
    }
  }

  // ── PRIORYTET 4: Dopasowanie po indeksie zawartym w tekście ───────────────────
  const qCleanIdx = normalizeIndexNumber(rawStr.match(/\b(\d{3,6})\b/)?.[1] || '');
  if (qCleanIdx) {
    const byEmbeddedIdx = members.find(m => normalizeIndexNumber(m.index || m.nrIndeksu) === qCleanIdx);
    if (byEmbeddedIdx) return byEmbeddedIdx;
  }

  // ── PRIORYTET 5: Dopasowanie po pełnym adresie e-mail ─────────────────────────
  const emailMatch = rawStr.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
  if (emailMatch) {
    const qEmail = emailMatch[1].toLowerCase().trim();
    const byEmail = members.find(m => m.email && m.email.toLowerCase().trim() === qEmail);
    if (byEmail) return byEmail;
  }

  // ── BRAK DOPASOWANIA ─────────────────────────────────────────────────────────
  return null;
}

/**
 * Pomocnicze dopasowanie opiekuna po nazwisku lub identyfikatorze.
 */
export const findMatchingSupervisor = (nameOrId, supervisorsList = []) => {
  if (!nameOrId) return null;
  const clean = String(nameOrId).toLowerCase().trim();
  const list = Array.isArray(supervisorsList) && supervisorsList.length > 0
    ? supervisorsList
    : (getStoredSupervisors() || DEFAULT_FACULTY_SUPERVISORS);

  return (list || []).find(s => {
    if (!s) return false;
    const sName = String(s.imieNazwisko || s.name || s.fullName || "").toLowerCase().trim();
    const sId = String(s.nrIndeksu || s.id || "").trim();
    return (sName && (sName === clean || normalizeDiacritics(sName) === normalizeDiacritics(clean))) || (sId && sId === clean);
  }) || null;
};

/**
 * Czyste parsowanie pojedynczego rekordu obecności (z bazy GAS, listy confirmedIndexes lub logu Meet).
 * Usuwa zniekształcenia typu "Indeks: [TAG]: Nazwisko", rozpoznaje opiekunów, prelegentów i członków.
 */
export function resolveParticipantFromSavedIndex(rawIdx, members = [], customSupervisors = null, i = 0) {
  let rawStr = '';
  let candidateObj = null;

  if (rawIdx && typeof rawIdx === 'object') {
    candidateObj = rawIdx;
    rawStr = String(
      rawIdx.fullName ||
      rawIdx.full_name ||
      rawIdx.imieNazwisko ||
      rawIdx.rawName ||
      rawIdx.name ||
      rawIdx.index_number ||
      rawIdx.nrIndeksu ||
      rawIdx.index ||
      ''
    ).trim();
    if (rawStr === '[object Object]') rawStr = '';
    if (!rawStr && (rawIdx.index_number || rawIdx.nrIndeksu || rawIdx.index)) {
      rawStr = String(rawIdx.index_number || rawIdx.nrIndeksu || rawIdx.index).trim();
    }
  } else {
    rawStr = String(rawIdx || '').trim();
  }

  if (!rawStr || rawStr === '[object Object]') return null;

  const isExplicitSpeaker = rawStr.includes('[SPEAKER]') || rawStr.toLowerCase().includes('[speaker]') || rawStr.toLowerCase().includes('[prelegent]');
  const isExplicitGuest = !isExplicitSpeaker && (rawStr.includes('[GOŚĆ]') || rawStr.toLowerCase().includes('[gość]') || rawStr.includes('[GOSC]') || rawStr.toLowerCase().includes('[gosc]'));
  const isExplicitSup = !isExplicitSpeaker && (rawStr.includes('[OPIEKUN]') || rawStr.toLowerCase().includes('[opiekun]') || isFacultySupervisor(rawStr, customSupervisors));

  let cleanText = rawStr
    .replace(/^\[SPEAKER\]:\s*/i, '')
    .replace(/^\[SPEAKER\]\s*/i, '')
    .replace(/^\[GOŚĆ\]:\s*/i, '')
    .replace(/^\[GOŚĆ\]\s*/i, '')
    .replace(/^\[GOSC\]:\s*/i, '')
    .replace(/^\[GOSC\]\s*/i, '')
    .replace(/^\[CZŁONEK KOŁA\]:\s*/i, '')
    .replace(/^\[CZŁONEK KOŁA\]\s*/i, '')
    .replace(/^\[CZLONEK KOLA\]:\s*/i, '')
    .replace(/^\[CZLONEK KOLA\]\s*/i, '')
    .replace(/^\[CZŁONEK\]:\s*/i, '')
    .replace(/^\[CZŁONEK\]\s*/i, '')
    .replace(/^\[OPIEKUN\]:\s*/i, '')
    .replace(/^\[OPIEKUN\]\s*/i, '')
    .replace(/^Indeks:\s*/i, '')
    .replace(/^Nr:\s*/i, '')
    .replace(/^nr\s+indeksu:\s*/i, '')
    .trim();

  // 1. Opiekun Koła
  if (isExplicitSup || isFacultySupervisor(cleanText, customSupervisors)) {
    const supObj = matchSupervisorExact(cleanText, customSupervisors) || findMatchingSupervisor(cleanText, customSupervisors);
    const supName = String(supObj ? (supObj.fullName || `${supObj.academicTitle || 'mgr'} ${supObj.name}`) : (cleanText || 'Opiekun Koła')).trim();
    return {
      id: `p_saved_sup_${i}_${Date.now()}`,
      rawName: supName,
      fullName: supName,
      name: supName,
      nrIndeksu: '',
      index: '',
      joinTime: '18:00',
      durationStr: '60 min',
      durationMinutes: 60,
      timeMinutes: 60,
      punkty: 1,
      aktywnosc: 'Obecność',
      member: null,
      role: 'supervisor',
      roleDisplay: 'Opiekun',
      rola: 'Opiekun',
      isSupervisor: true,
      isSpeaker: false,
      isGuest: false,
      isExternalGuest: false,
      isEligible: true,
      manualApproved: true,
      hasManualOverride: true,
      status: 'supervisor',
    };
  }

  // 2. Prelegent
  if (isExplicitSpeaker) {
    const spkName = String(cleanText || 'Prelegent').trim();
    return {
      id: `p_saved_spk_${i}_${Date.now()}`,
      rawName: spkName.startsWith('[SPEAKER]') ? spkName : `[SPEAKER]: ${spkName}`,
      fullName: spkName,
      name: spkName,
      nrIndeksu: '[SPEAKER]',
      index: '[SPEAKER]',
      joinTime: '18:00',
      durationStr: '60 min',
      durationMinutes: 60,
      timeMinutes: 60,
      punkty: 1,
      aktywnosc: 'Prelekcja',
      member: null,
      role: 'speaker',
      roleDisplay: 'Prelegent',
      rola: 'Prelegent',
      isSpeaker: true,
      isSupervisor: false,
      isGuest: false,
      isExternalGuest: false,
      isEligible: true,
      manualApproved: true,
      hasManualOverride: true,
      status: 'speaker',
    };
  }

  // 3. Gość zewnętrzny
  if (isExplicitGuest) {
    const gstName = String(cleanText || 'Gość zewnętrzny').trim();
    return {
      id: `p_saved_gst_${i}_${Date.now()}`,
      rawName: gstName.startsWith('[GOŚĆ]') ? gstName : `[GOŚĆ]: ${gstName}`,
      fullName: gstName,
      name: gstName,
      nrIndeksu: '',
      index: '',
      joinTime: '18:00',
      durationStr: '60 min',
      durationMinutes: 60,
      timeMinutes: 60,
      punkty: 1,
      aktywnosc: 'Obecność',
      member: null,
      role: 'guest',
      roleDisplay: 'Gość',
      rola: 'Gość',
      isGuest: true,
      isExternalGuest: true,
      isSupervisor: false,
      isSpeaker: false,
      isEligible: true,
      manualApproved: true,
      hasManualOverride: true,
      status: 'guest',
    };
  }

  // 4. Dopasowanie studenta (po indeksie, wielu indeksach lub nazwisku)
  const lookupCandidate = candidateObj?.index || candidateObj?.nrIndeksu || candidateObj?.index_number || cleanText;
  const matchedMember = candidateObj?.member || matchMemberExact(lookupCandidate, members) || matchMemberExact(cleanText, members);
  if (matchedMember) {
    const memName = String(matchedMember.fullName || `${matchedMember.firstName || ''} ${matchedMember.lastName || ''}`).trim();
    const memIndex = String(matchedMember.index || matchedMember.nrIndeksu || '').trim();
    return {
      id: `p_saved_mem_${i}_${memIndex || i}`,
      rawName: memName,
      fullName: memName,
      name: memName,
      joinTime: candidateObj?.joinTime || '18:00',
      durationStr: candidateObj?.durationStr || '60 min',
      durationMinutes: candidateObj?.durationMinutes || 60,
      timeMinutes: candidateObj?.timeMinutes || 60,
      punkty: Number(candidateObj?.punkty ?? candidateObj?.points ?? 1),
      aktywnosc: candidateObj?.opisAktywnosci || candidateObj?.aktywnosc || 'Obecność',
      member: matchedMember,
      nrIndeksu: memIndex,
      index: memIndex,
      role: 'member',
      roleDisplay: 'Członek koła',
      rola: 'Członek koła',
      isGuest: false,
      isExternalGuest: false,
      isSupervisor: false,
      isSpeaker: false,
      isEligible: true,
      manualApproved: true,
      hasManualOverride: false,
      status: 'approved',
    };
  }

  // 5. Monika Łyniewska
  if (isMonikaLyniewska(cleanText) || isMonikaLyniewska(lookupCandidate)) {
    return {
      id: `p_saved_monika_${i}`,
      rawName: 'Monika Łyniewska',
      fullName: 'Monika Łyniewska',
      name: 'Monika Łyniewska',
      joinTime: '18:00',
      durationStr: '60 min',
      durationMinutes: 60,
      timeMinutes: 60,
      punkty: 1,
      aktywnosc: 'Obecność',
      member: { fullName: 'Monika Łyniewska', index: '34327', nrIndeksu: '34327', email: '34327@student.wskz.pl', status: 'active', statusWeryfikacji: 'Zatwierdzony' },
      nrIndeksu: '34327',
      index: '34327',
      role: 'member',
      roleDisplay: 'Członek koła',
      rola: 'Członek koła',
      isGuest: false,
      isExternalGuest: false,
      isSupervisor: false,
      isSpeaker: false,
      isEligible: true,
      manualApproved: true,
      hasManualOverride: true,
      status: 'approved',
    };
  }

  // 6. Nierozpoznany rekord - zachowaj czystą nazwę bez "Indeks: "
  const rawCleanStr = String(cleanText || '').trim();
  const fallbackName = (rawCleanStr === '[object Object]' || !rawCleanStr)
    ? String(candidateObj?.index || candidateObj?.nrIndeksu || candidateObj?.index_number || 'Uczestnik').trim()
    : rawCleanStr;
  return {
    id: `p_saved_unmatched_${i}_${Date.now()}`,
    rawName: fallbackName,
    fullName: fallbackName,
    name: fallbackName,
    joinTime: '18:00',
    durationStr: '60 min',
    durationMinutes: 60,
    timeMinutes: 60,
    punkty: 1,
    aktywnosc: 'Obecność',
    member: null,
    nrIndeksu: /^\d{3,6}$/.test(fallbackName) ? fallbackName : '',
    index: /^\d{3,6}$/.test(fallbackName) ? fallbackName : '',
    role: 'guest',
    roleDisplay: 'Gość',
    rola: 'Gość',
    isGuest: true,
    isExternalGuest: true,
    isSupervisor: false,
    isSpeaker: false,
    isEligible: true,
    manualApproved: true,
    hasManualOverride: false,
    status: 'guest',
  };
}

/**
 * Parsuje czas trwania z różnych formatów (np. "01:30:00", "45 min", 60).
 */
export function parseDurationToMinutes(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') {
    if (val > 0 && val < 1) return Math.round(val * 24 * 60);
    return Math.round(val);
  }
  const str = String(val).trim();
  if (!str) return 0;

  const hmsMatch = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    return Math.round(parseInt(hmsMatch[1], 10) * 60 + parseInt(hmsMatch[2], 10) + parseInt(hmsMatch[3], 10) / 60);
  }

  const msMatch = str.match(/^(\d{1,3}):(\d{2})$/);
  if (msMatch) {
    return Math.round(parseInt(msMatch[1], 10) + parseInt(msMatch[2], 10) / 60);
  }

  let total = 0;
  let matched = false;
  const hoursMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(?:h|godz|godz\.|godzin|godziny|hr|hrs|hours?)/i);
  if (hoursMatch) {
    const hVal = parseFloat(hoursMatch[1].replace(',', '.'));
    total += Math.round(hVal * 60);
    matched = true;
  }
  const minsMatch = str.match(/(\d+)\s*(?:m|min|min\.|minut|minuty|minutes?)/i);
  if (minsMatch) {
    total += parseInt(minsMatch[1], 10);
    matched = true;
  }
  if (matched) return total;

  const num = parseFloat(str.replace(',', '.'));
  return !isNaN(num) ? Math.round(num) : 0;
}

/**
 * Parsuje pojedynczy wiersz CSV/TSV z uwzględnieniem cudzysłowów.
 */
export function parseCSVRow(rowStr, delimiter = null) {
  if (!rowStr) return [];
  const str = String(rowStr).trim();
  if (!str) return [];

  let sep = delimiter;
  if (!sep) {
    if (str.includes('\t')) sep = '\t';
    else if (str.includes(';')) sep = ';';
    else sep = ',';
  }

  const result = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      if (inQuotes && str[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === sep && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Sprawdza, czy linia reprezentuje metadane Google Meet lub nagłówek tabeli.
 */
export function isMetadataOrHeaderLine(line) {
  if (!line || typeof line !== 'string') return true;
  
  // Oczyszczenie z BOM, cudzysłowów i białych znaków
  const clean = line.replace(/^\uFEFF/, '').replace(/^["']|["']$/g, '').trim();
  if (!clean) return true;

  const lower = clean.toLowerCase();

  // 1. Linie metadanych Google Meet (zaczynające się od gwiazdki lub zawierające znaczniki systemowe)
  if (clean.startsWith('*')) return true;
  if (lower.startsWith('meet –') || lower.startsWith('meet -')) return true;
  if (lower.includes('meeting code:') || lower.includes('kod spotkania:')) return true;
  if (lower.includes('created on') || lower.includes('utworzono:')) return true;
  if (lower.includes('ended on') || lower.includes('zakończono:')) return true;

  // 2. Nagłówki kolumn CSV z rozszerzeń Meet
  if (lower.includes('full name') && (lower.includes('first seen') || lower.includes('time in call'))) return true;
  if (lower.includes('imię i nazwisko') && lower.includes('czas')) return true;
  if (lower === 'full name' || lower === '"full name"' || lower === 'imię i nazwisko' || lower === 'uczestnik' || lower === 'lp.') return true;

  return false;
}

/**
 * Parsuje pojedynczy wiersz logu obecności z Google Meet i dopasowuje uczestnika.
 */
export function parseMeetParticipantLine(rawLine, {
  members = [],
  supervisors = [],
  aliasesMap = {},
  minDurationThreshold = 15,
  lineIndex = 0,
} = {}) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const line = rawLine.replace(/^\uFEFF/, '').trim();
  if (!line) return null;

  // Ignoruj metadane i nagłówki
  if (isMetadataOrHeaderLine(line)) {
    return null;
  }

  let rawName = line;
  let joinTime = '18:00';
  let durationMinutes = 60;
  let durationStr = '60 min';
  let extractedIdx = '';

  // 1. Format CSV w cudzysłowach: "Imię Nazwisko","Godzina","Czas trwania"
  if (line.includes('","') || (line.startsWith('"') && line.includes(','))) {
    const cleanLine = line.replace(/^"/, '').replace(/"$/, '');
    const parts = cleanLine.split(/","|",\s*"/);
    if (parts.length >= 1) rawName = parts[0].trim();
    if (parts.length >= 2) {
      const tMatch = parts[1].match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (tMatch) joinTime = tMatch[1];
    }
    if (parts.length >= 3) {
      durationStr = parts[2].trim();
      durationMinutes = parseDurationToMinutes(durationStr) || 60;
    }
  }
  // 2. Format z datą/godziną: "Imię Nazwisko 2026-06-16 18:21:10 01:37:44..."
  else if (line.includes('2026-') || line.includes('2025-') || line.includes('Zgodny') || line.includes('Sprawdź')) {
    const idxMatch = line.match(/(?:Zgodny\s*✔️?\s*|indeks[:\s]*|nr[:\s]*)(\d{3,6})/i) || line.match(/\b(\d{4,6})\b$/);
    if (idxMatch) extractedIdx = idxMatch[1];

    const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      rawName = line.substring(0, dateMatch.index).trim();
      const afterDate = line.substring(dateMatch.index + dateMatch[0].length).trim();
      const timeMatch = afterDate.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (timeMatch) joinTime = timeMatch[1];
      const durMatch = afterDate.match(/\s+(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2}|\d+\s*min)/i);
      if (durMatch) {
        durationStr = durMatch[1];
        durationMinutes = parseDurationToMinutes(durMatch[1]) || 60;
      }
    } else {
      rawName = line.split(/\s{2,}|\t/)[0].trim();
    }
  }
  // 3. Format TSV / Średnik
  else if (line.includes('\t') || line.includes(';')) {
    const sep = line.includes('\t') ? '\t' : ';';
    const parts = line.split(sep).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 1) rawName = parts[0];
    if (parts.length >= 2) {
      const dur = parseDurationToMinutes(parts[1]);
      if (dur > 0) {
        durationStr = parts[1];
        durationMinutes = dur;
      } else {
        joinTime = parts[1];
      }
    }
    if (parts.length >= 3) {
      durationStr = parts[2];
      durationMinutes = parseDurationToMinutes(parts[2]) || 60;
    }
  }

  // Oczyszczenie nazwy
  rawName = rawName
    .replace(/^"/, '')
    .replace(/"$/, '')
    .replace(/\d{4}-\d{2}-\d{2}.*$/, '')
    .replace(/Zgodny.*$/, '')
    .replace(/Sprawdź opis.*$/, '')
    .trim();

  if (!rawName || rawName.length < 2 || isMetadataOrHeaderLine(rawName)) return null;

  // ── Określenie Roli i Dopasowania Uczestnika ─────────────────────────────────

  const isExplicitSpeaker = rawName.toLowerCase().includes('[speaker]') ||
                            rawName.toLowerCase().includes('[prelegent]') ||
                            rawName.toLowerCase().startsWith('prelegent:') ||
                            line.toLowerCase().includes('[speaker]') ||
                            line.toLowerCase().includes('[prelegent]');

  const isExplicitGuestMarker = !isExplicitSpeaker && (
    rawName.toLowerCase().includes('[gość]') ||
    rawName.toLowerCase().includes('[gosc]') ||
    line.toLowerCase().includes('[gość]') ||
    line.toLowerCase().includes('[gosc]')
  );

  // 1. Sprawdź Opiekuna Koła (ścisłe dopasowanie bez fuzzy matchingu)
  const matchedSupervisor = !isExplicitSpeaker ? matchSupervisorExact(rawName, supervisors) : null;
  const isSupervisor = Boolean(matchedSupervisor);

  // 2. Sprawdź Członka Koła (Waterfall Matching)
  const matchedMember = (!isExplicitSpeaker && !isSupervisor && !isExplicitGuestMarker)
    ? matchMemberExact(extractedIdx ? `${rawName} (${extractedIdx})` : rawName, members, aliasesMap)
    : null;

  const isMember = Boolean(matchedMember);
  const isGuest = !isExplicitSpeaker && !isSupervisor && !isMember;

  // Określenie roli
  let role = 'guest';
  let roleDisplay = 'Gość';
  if (isExplicitSpeaker) {
    role = 'speaker';
    roleDisplay = 'Prelegent';
  } else if (isSupervisor) {
    role = 'supervisor';
    roleDisplay = 'Opiekun';
  } else if (isMember) {
    role = 'member';
    roleDisplay = 'Członek koła';
  }

  const isEligible = isExplicitSpeaker || isSupervisor || isGuest || (durationMinutes >= minDurationThreshold);
  const manualApproved = isExplicitSpeaker || isSupervisor || isGuest || isEligible;

  let status = 'approved';
  if (role === 'supervisor') status = 'supervisor';
  else if (role === 'speaker') status = 'speaker';
  else if (role === 'guest') status = 'guest';
  else if (!isEligible) status = 'rejected_short_time';

  // Sformatowana nazwa wyświetlana
  let cleanName = rawName
    .replace(/^\[SPEAKER\]:\s*/i, '')
    .replace(/^\[GOŚĆ\]:\s*/i, '')
    .replace(/^\[GOSC\]:\s*/i, '')
    .trim();

  let finalDisplayName = cleanName;
  if (matchedSupervisor) {
    finalDisplayName = matchedSupervisor.fullName || `${matchedSupervisor.academicTitle || 'mgr'} ${matchedSupervisor.name}`;
  } else if (matchedMember) {
    finalDisplayName = matchedMember.fullName || matchedMember.name || `${matchedMember.firstName} ${matchedMember.lastName}`;
  }

  let formattedRawName = finalDisplayName;
  if (role === 'speaker') {
    formattedRawName = finalDisplayName.startsWith('[SPEAKER]') ? finalDisplayName : `[SPEAKER]: ${finalDisplayName}`;
  } else if (role === 'guest') {
    formattedRawName = finalDisplayName.startsWith('[GOŚĆ]') ? finalDisplayName : `[GOŚĆ]: ${finalDisplayName}`;
  }

  return {
    id: `att-${lineIndex}-${Date.now()}`,
    name: String(finalDisplayName || rawName || 'Uczestnik').trim(),
    fullName: String(finalDisplayName || rawName || 'Uczestnik').trim(),
    rawName: String(formattedRawName || finalDisplayName || rawName).trim(),
    rawMeetName: String(rawName || '').trim(),
    nrIndeksu: String(matchedMember ? (matchedMember.nrIndeksu || matchedMember.index) : (isExplicitSpeaker ? '[SPEAKER]' : (extractedIdx || ''))).trim(),
    index: String(matchedMember ? (matchedMember.index || matchedMember.nrIndeksu) : (isExplicitSpeaker ? '[SPEAKER]' : (extractedIdx || ''))).trim(),
    role: String(role || 'member'),
    roleDisplay: String(roleDisplay || 'Członek koła'),
    rola: String(roleDisplay || 'Członek koła'),
    punkty: 1,
    aktywnosc: 'Obecność',
    timeMinutes: Number(durationMinutes) || 0,
    duration: Number(durationMinutes) || 0,
    durationMinutes: Number(durationMinutes) || 0,
    durationStr: String(durationStr || `${durationMinutes} min`),
    joinTime: String(joinTime || '18:00'),
    isSpeaker: Boolean(role === 'speaker'),
    isSupervisor: Boolean(role === 'supervisor'),
    isGuest: Boolean(role === 'guest'),
    isExternalGuest: Boolean(role === 'guest'),
    isEligible: Boolean(isEligible),
    manualApproved: Boolean(manualApproved),
    hasManualOverride: Boolean(role === 'speaker' || role === 'supervisor'),
    status: String(status || 'approved'),
    member: matchedMember,
    supervisor: matchedSupervisor,
  };
}

/**
 * Główna funkcja przetwarzająca pełny tekst/plik CSV obecności ze spotkania Google Meet.
 */
export function parseAttendanceInput(rawText, {
  members = [],
  supervisors = [],
  aliasesMap = {},
  minDurationThreshold = 15,
} = {}) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return { parsedList: [], matched: [], unmatched: [] };
  }

  const lines = rawText.split(/\r?\n/).map(l => l.replace(/^\uFEFF/, ''));
  const parsedList = [];
  const seenNames = new Set();
  const matched = [];
  const unmatched = [];

  // Wykrywanie nagłówka CSV (przeszukiwanie do 15 wierszy z pominięciem metadanych Google Meet)
  let headerIndex = -1;
  let delimiter = ',';
  let colMap = null;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const l = lines[i].trim();
    if (!l) continue;

    const clean = l.replace(/^["']|["']$/g, '').trim();
    const lower = clean.toLowerCase();

    // Jeśli to linia metadanych (np. * Meeting code: ...), idź dalej
    if (clean.startsWith('*') || lower.startsWith('meet –') || lower.startsWith('meet -') || lower.includes('meeting code:') || lower.includes('created on') || lower.includes('ended on')) {
      continue;
    }

    if (
      lower.includes('full name') ||
      lower.includes('imię i nazwisko') ||
      lower.includes('imie i nazwisko') ||
      lower.includes('imię') ||
      lower.includes('czas trwania') ||
      lower.includes('duration') ||
      lower.includes('time in call') ||
      lower.includes('first seen')
    ) {
      headerIndex = i;
      if (l.includes('\t')) delimiter = '\t';
      else if (l.includes(';')) delimiter = ';';
      else delimiter = ',';

      const headers = parseCSVRow(l, delimiter).map(h => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));
      colMap = {
        name: headers.findIndex(h => h.includes('imię i nazwisko') || h.includes('imie i nazwisko') || h.includes('full name') || (h.includes('nazwisko') && h.includes('imię')) || h === 'name' || h === 'uczestnik'),
        firstName: headers.findIndex(h => h === 'first name' || h === 'imię' || h === 'imie'),
        lastName: headers.findIndex(h => h === 'last name' || h === 'nazwisko'),
        duration: headers.findIndex(h => h.includes('czas trwania') || h.includes('duration') || h.includes('time in call') || h === 'czas'),
        joinTime: headers.findIndex(h => h.includes('godzina dołączenia') || h.includes('godzina dolaczenia') || h.includes('first seen') || h.includes('joined') || h.includes('dołączenie')),
        leaveTime: headers.findIndex(h => h.includes('godzina opuszczenia') || h.includes('last seen') || h.includes('left') || h.includes('opuszczenie')),
        email: headers.findIndex(h => h.includes('e-mail') || h.includes('email') || h.includes('poczta')),
      };
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (i === headerIndex) continue;
    let line = lines[i].trim();
    if (!line || isMetadataOrHeaderLine(line)) continue;

    let name = '';
    let email = '';
    let durationMinutes = 60;
    let durationStr = '60 min';
    let joinTime = '18:00';
    let extractedIdx = '';

    // Parsowanie wg mapy kolumn CSV
    if (colMap && colMap.name !== -1) {
      const row = parseCSVRow(line, delimiter);
      if (row.length === 0) continue;

      if (colMap.name !== -1 && row[colMap.name]) {
        name = row[colMap.name];
      } else if (colMap.firstName !== -1 && colMap.lastName !== -1) {
        name = `${row[colMap.firstName] || ''} ${row[colMap.lastName] || ''}`.trim();
      }

      if (colMap.email !== -1 && row[colMap.email]) {
        email = row[colMap.email].trim();
      }

      if (colMap.duration !== -1 && row[colMap.duration]) {
        durationStr = row[colMap.duration].trim();
        durationMinutes = parseDurationToMinutes(durationStr) || 60;
      }

      if (colMap.joinTime !== -1 && row[colMap.joinTime]) {
        const tMatch = row[colMap.joinTime].match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        if (tMatch) joinTime = tMatch[1];
      }
    }

    // Jeśli brak nazwy z kolumn, użyj ogólnych reguł
    if (!name) {
      // 1. Format CSV w cudzysłowach: "Imię Nazwisko","Godzina","Czas"
      if (line.includes('","') || (line.startsWith('"') && line.includes(',')) || line.includes('";"')) {
        const sep = line.includes('";"') ? ';' : ',';
        const row = parseCSVRow(line, sep);
        if (row.length >= 1) name = row[0];
        if (row.length >= 2) {
          const tMatch = row[1].match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
          if (tMatch) joinTime = tMatch[1];
        }
        if (row.length >= 3) {
          durationStr = row[2];
          durationMinutes = parseDurationToMinutes(row[2]) || 60;
        }
        for (const col of row) {
          const em = col.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
          if (em) { email = em[1]; break; }
        }
      }
      // 2. Format z datą/godziną: "Imię Nazwisko 2026-06-16..."
      else if (line.includes('2026-') || line.includes('2025-') || line.includes('Zgodny') || line.includes('Sprawdź')) {
        const idxMatch = line.match(/(?:Zgodny\s*✔️?\s*|indeks[:\s]*|nr[:\s]*)(\d{3,6})/i) || line.match(/\b(\d{4,6})\b$/);
        if (idxMatch) extractedIdx = idxMatch[1];

        const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          name = line.substring(0, dateMatch.index).trim();
          const afterDate = line.substring(dateMatch.index + dateMatch[0].length).trim();
          const timeMatch = afterDate.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
          if (timeMatch) joinTime = timeMatch[1];
          const durMatch = afterDate.match(/\s+(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2}|\d+\s*(?:godz|min|h))/i);
          if (durMatch) {
            durationStr = durMatch[1];
            durationMinutes = parseDurationToMinutes(durMatch[1]) || 60;
          }
        } else {
          name = line.split(/\s{2,}|\t/)[0].trim();
        }
      }
      // 3. Format TSV / Średnik
      else if (line.includes('\t') || line.includes(';')) {
        const sep = line.includes('\t') ? '\t' : ';';
        const parts = line.split(sep).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 1) name = parts[0];
        if (parts.length >= 2) {
          const dur = parseDurationToMinutes(parts[1]);
          if (dur > 0) {
            durationStr = parts[1];
            durationMinutes = dur;
          } else {
            joinTime = parts[1];
          }
        }
        if (parts.length >= 3) {
          const dur = parseDurationToMinutes(parts[2]);
          if (dur > 0) {
            durationStr = parts[2];
            durationMinutes = dur;
          }
        }
      } else {
        name = line.replace(/["\t]/g, ' ').split(/\s{2,}/)[0].trim();
      }
    }

    name = name.replace(/^"/, '').replace(/"$/, '').trim();
    if (!name || name.length < 2) continue;

    if (!email) {
      const em = line.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
      if (em) email = em[1].toLowerCase().trim();
    }

    const dedupeKey = (email || name).toLowerCase();
    if (seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);

    const isSpeaker = name.toLowerCase().includes('[speaker]') ||
                      name.toLowerCase().includes('[prelegent]') ||
                      name.toLowerCase().startsWith('prelegent:') ||
                      line.toLowerCase().includes('[speaker]') ||
                      line.toLowerCase().includes('[prelegent]');

    const matchedSup = !isSpeaker ? (matchSupervisorExact(name, supervisors) || (email ? matchSupervisorExact(email, supervisors) : null)) : null;
    const isSup = Boolean(matchedSup);

    const isExplicitGuest = !isSpeaker && !isSup && (
      name.toLowerCase().includes('[gość]') ||
      name.toLowerCase().includes('[gosc]') ||
      line.toLowerCase().includes('[gość]') ||
      line.toLowerCase().includes('[gosc]')
    );

    let matchedMember = null;
    if (!isSpeaker && !isSup && !isExplicitGuest) {
      matchedMember = matchMemberExact(extractedIdx ? `${name} (${extractedIdx})` : name, members, aliasesMap);
      if (!matchedMember && email) {
        matchedMember = members.find(m => m.email && m.email.toLowerCase().trim() === email.toLowerCase().trim());
      }
    }

    const isMonika = !isSpeaker && !isSup && !matchedMember && (isMonikaLyniewska(name) || (extractedIdx === '34327'));
    const isMemberInDB = Boolean(matchedMember || isMonika);

    const role = isSpeaker ? 'speaker' : (isSup ? 'supervisor' : (isMemberInDB ? 'member' : 'guest'));
    const roleDisplay = isSpeaker ? 'Prelegent' : (isSup ? 'Opiekun' : (isMemberInDB ? 'Członek koła' : 'Gość'));

    const isEligible = isSpeaker || isSup || (role === 'guest') || (durationMinutes >= (minDurationThreshold || 15));
    const manualApproved = isSpeaker || isSup || (role === 'guest') || isEligible;
    const status = isSpeaker ? 'speaker' : (isSup ? 'supervisor' : (role === 'guest' ? 'guest' : (isEligible ? 'approved' : 'short_time')));

    const memberObj = (isSpeaker || isSup) ? null : (isMemberInDB ? (matchedMember || (isMonika ? { fullName: 'Monika Łyniewska', index: '34327', email: '34327@student.wskz.pl' } : null)) : null);
    const cleanDisplayName = isSpeaker ? name.replace(/^\[SPEAKER\]:\s*/i, '').replace(/^\[PRELEGENT\]:\s*/i, '').trim() : name;
    const supervisorDisplayName = matchedSup ? (matchedSup.fullName || `${matchedSup.academicTitle || 'mgr'} ${matchedSup.name}`) : name;
    const finalDisplayName = isSup ? supervisorDisplayName : (memberObj ? (memberObj.fullName || memberObj.name || memberObj.imieNazwisko || `${memberObj.firstName} ${memberObj.lastName}`) : cleanDisplayName);

    let formattedRawName = finalDisplayName;
    if (role === 'speaker') {
      formattedRawName = finalDisplayName.startsWith('[SPEAKER]') ? finalDisplayName : `[SPEAKER]: ${finalDisplayName}`;
    } else if (role === 'guest') {
      formattedRawName = finalDisplayName.startsWith('[GOŚĆ]') ? finalDisplayName : `[GOŚĆ]: ${finalDisplayName}`;
    }

    const entry = {
      id: `att-${i}-${Date.now()}`,
      nrIndeksu: String(memberObj ? (memberObj.nrIndeksu || memberObj.index) : (isSpeaker ? '[SPEAKER]' : (isMonika ? '34327' : (extractedIdx || '')))).trim(),
      index: String(memberObj ? (memberObj.index || memberObj.nrIndeksu) : (isSpeaker ? '[SPEAKER]' : (extractedIdx || ''))).trim(),
      name: String(finalDisplayName || name || 'Uczestnik').trim(),
      fullName: String(finalDisplayName || name || 'Uczestnik').trim(),
      rawName: String(formattedRawName || finalDisplayName || name).trim(),
      rawMeetName: String(name || '').trim(),
      email: String(email || memberObj?.email || '').trim(),
      timeMinutes: Number(durationMinutes) || 0,
      duration: Number(durationMinutes) || 0,
      durationMinutes: Number(durationMinutes) || 0,
      durationStr: String(durationStr || `${durationMinutes} min`),
      joinTime: String(joinTime || '18:00'),
      role: String(role || 'member'),
      roleDisplay: String(roleDisplay || 'Członek koła'),
      rola: String(roleDisplay || 'Członek koła'),
      punkty: 1,
      aktywnosc: 'Obecność',
      opisAktywnosci: 'Obecność na spotkaniu',
      isSpeaker: Boolean(role === 'speaker'),
      isSupervisor: Boolean(role === 'supervisor'),
      isGuest: Boolean(role === 'guest'),
      isExternalGuest: Boolean(role === 'guest'),
      isEligible: Boolean(isEligible),
      manualApproved: Boolean(manualApproved),
      hasManualOverride: Boolean(role === 'speaker' || role === 'supervisor'),
      status: String(status || 'approved'),
      isFromBase: Boolean(isMemberInDB),
      member: memberObj ? {
        id: String(memberObj.id || memberObj.index || ''),
        index: String(memberObj.index || memberObj.nrIndeksu || ''),
        nrIndeksu: String(memberObj.nrIndeksu || memberObj.index || ''),
        fullName: String(memberObj.fullName || `${memberObj.firstName || ''} ${memberObj.lastName || ''}`).trim(),
        firstName: String(memberObj.firstName || ''),
        lastName: String(memberObj.lastName || ''),
        email: String(memberObj.email || ''),
        field: String(memberObj.field || memberObj.kierunek || ''),
        status: String(memberObj.status || 'active'),
        statusWeryfikacji: String(memberObj.statusWeryfikacji || 'Zatwierdzony')
      } : null,
      supervisor: matchedSup ? {
        id: String(matchedSup.id || ''),
        name: String(matchedSup.name || ''),
        fullName: String(matchedSup.fullName || `${matchedSup.academicTitle || 'mgr'} ${matchedSup.name || ''}`).trim(),
        academicTitle: String(matchedSup.academicTitle || 'mgr'),
        email: String(matchedSup.email || '')
      } : null,
    };

    parsedList.push(entry);
    if (matchedMember) matched.push(matchedMember);
    else if (!isSpeaker && !isSup) unmatched.push(name);
  }

  return { parsedList, matched, unmatched };
}

export default {
  isMetadataOrHeaderLine,
  normalizePersonName,
  parseAliasesList,
  normalizeIndexNumber,
  matchSupervisorExact,
  findMatchingSupervisor,
  matchMemberExact,
  parseDurationToMinutes,
  parseCSVRow,
  parseMeetParticipantLine,
  parseAttendanceInput,
  resolveParticipantFromSavedIndex,
};
