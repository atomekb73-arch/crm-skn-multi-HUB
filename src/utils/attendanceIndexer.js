/**
 * attendanceIndexer.js
 * Centralny moduł indeksowania obecności i ewidencji w strukturach Map / Set O(1)
 * Eliminuje wielokrotne przeszukiwanie tablic O(N * M * E) i parsowanie localStorage.
 */

import { normalizeStudentIndex } from './helpers.js';
export { normalizeStudentIndex };

/**
 * Normalizuje email
 */
export function normalizeStudentEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

/**
 * Normalizuje imię i nazwisko
 */
export function normalizeStudentName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalizuje kod spotkania (np. "[M01]" -> "M01", "25/26 M01" -> "M01")
 */
export function normalizeMeetingKeys(meetingOrEntry) {
  if (!meetingOrEntry) return [];
  const keys = new Set();

  const add = (val) => {
    if (!val) return;
    const str = String(val).trim();
    if (!str) return;
    keys.add(str);
    keys.add(str.toUpperCase());
    const clean = str.replace(/[\[\]]/g, '').trim().toUpperCase();
    if (clean) {
      keys.add(clean);
      const noYear = clean.replace(/^(25\/26|26\/27)\s*/i, '').trim();
      if (noYear) keys.add(noYear);
    }
  };

  add(meetingOrEntry.id);
  add(meetingOrEntry.meetingId);
  add(meetingOrEntry.idSpotkania);
  add(meetingOrEntry.code);
  add(meetingOrEntry.meetingCode);
  add(meetingOrEntry.kodSpotkania);

  const rawDate = meetingOrEntry.date || meetingOrEntry.dataSpotkania || meetingOrEntry.data || meetingOrEntry.start_dt;
  if (rawDate) {
    const dStr = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).trim();
    if (dStr) keys.add(dStr);
  }

  return Array.from(keys);
}

/**
 * Buduje zindeksowaną strukturę obecności z ewidencji Google Sheets w czasie O(E)
 * Pozwala na sprawdzanie obecności w czasie O(1)
 *
 * @param {Array} rawEwidencja - surowa tablica ewidencji (np. z crm_ewidencja)
 * @returns {Object} { indexByStudentIndex, indexByEmail, indexByName }
 */
export function buildAttendanceIndex(rawEwidencja = []) {
  const indexByStudentIndex = new Map(); // Map<cleanIndex, Set<meetingKey>>
  const indexByEmail = new Map();        // Map<email, Set<meetingKey>>
  const indexByName = new Map();         // Map<normalizedName, Set<meetingKey>>

  if (!Array.isArray(rawEwidencja) || rawEwidencja.length === 0) {
    return { indexByStudentIndex, indexByEmail, indexByName };
  }

  for (let i = 0; i < rawEwidencja.length; i++) {
    const entry = rawEwidencja[i];
    if (!entry) continue;

    const meetingKeys = normalizeMeetingKeys(entry);
    if (meetingKeys.length === 0) continue;

    // 1. Indeks po numerze albumu (pełnym i znormalizowanym)
    const rawIdx = entry.nrIndeksu || entry.index || entry.cleanIndex;
    const cleanIdx = normalizeStudentIndex(rawIdx);
    if (cleanIdx) {
      if (!indexByStudentIndex.has(cleanIdx)) {
        indexByStudentIndex.set(cleanIdx, new Set());
      }
      const set = indexByStudentIndex.get(cleanIdx);
      for (let k = 0; k < meetingKeys.length; k++) set.add(meetingKeys[k]);
    }
    if (rawIdx && String(rawIdx).trim() !== cleanIdx) {
      const rIdx = String(rawIdx).trim();
      if (!indexByStudentIndex.has(rIdx)) {
        indexByStudentIndex.set(rIdx, new Set());
      }
      const set = indexByStudentIndex.get(rIdx);
      for (let k = 0; k < meetingKeys.length; k++) set.add(meetingKeys[k]);
    }

    // 2. Indeks po adresie e-mail
    const email = normalizeStudentEmail(entry.email);
    if (email) {
      if (!indexByEmail.has(email)) {
        indexByEmail.set(email, new Set());
      }
      const set = indexByEmail.get(email);
      for (let k = 0; k < meetingKeys.length; k++) set.add(meetingKeys[k]);
    }

    // 3. Indeks po imieniu i nazwisku
    const name = normalizeStudentName(entry.imieNazwisko || entry.fullName || entry.name);
    if (name) {
      if (!indexByName.has(name)) {
        indexByName.set(name, new Set());
      }
      const set = indexByName.get(name);
      for (let k = 0; k < meetingKeys.length; k++) set.add(meetingKeys[k]);
    }
  }

  return { indexByStudentIndex, indexByEmail, indexByName };
}

/**
 * Sprawdza w czasie O(1), czy student był obecny na danym spotkaniu
 * na podstawie zindeksowanej struktury ewidencji oraz listy uczestników spotkania.
 *
 * @param {Object} member - obiekt członka koła
 * @param {Object} meeting - obiekt spotkania (z prekompilowanym attendeesIndex lub surową listą)
 * @param {Object} attendanceIndex - wynik buildAttendanceIndex
 * @returns {boolean}
 */
export function isMemberAttendedIndexed(member, meeting, attendanceIndex = null) {
  if (!member || !meeting) return false;

  const cleanIdx = normalizeStudentIndex(member.nrIndeksu || member.index || member.cleanIndex || member.indexNumber);
  const rawIdx = String(member.nrIndeksu || member.index || member.cleanIndex || '').trim();
  const email = normalizeStudentEmail(member.email);
  const fullName = normalizeStudentName(member.fullName || member.name || `${member.firstName || ''} ${member.lastName || ''}`);

  // 1. Sprawdź w zindeksowanych uczestnikach samego spotkania (meeting.attendeesIndex)
  if (meeting._attendeesIndex) {
    if (cleanIdx && meeting._attendeesIndex.indexes.has(cleanIdx)) return true;
    if (rawIdx && meeting._attendeesIndex.indexes.has(rawIdx)) return true;
    if (email && meeting._attendeesIndex.emails.has(email)) return true;
    if (fullName && meeting._attendeesIndex.names.has(fullName)) return true;
  } else {
    // Fallback: sprawdź w meeting.listaObecnosci / attendees / participantRecords
    const attendees = meeting.listaObecnosci || meeting.attendees || meeting.participantRecords;
    if (Array.isArray(attendees) && attendees.length > 0) {
      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i];
        if (!att) continue;
        if (typeof att === 'object') {
          const isApproved = att.manualApproved !== undefined
            ? Boolean(att.manualApproved)
            : (att.status === 'approved' || att.status === 'Zaliczona' || att.status === 'Zaliczono' || att.isEligible !== false);
          if (!isApproved) continue;

          const aIdx = normalizeStudentIndex(att.nrIndeksu || att.index || att.member?.index || att.member?.nrIndeksu);
          if (cleanIdx && aIdx && cleanIdx === aIdx) return true;

          const aEmail = normalizeStudentEmail(att.email || att.member?.email);
          if (email && aEmail && email === aEmail) return true;

          const aName = normalizeStudentName(att.name || att.fullName || att.rawName || att.member?.fullName);
          if (fullName && aName && (fullName === aName || aName.includes(fullName) || fullName.includes(aName))) return true;
        } else {
          const str = String(att).trim();
          const cleanStr = normalizeStudentIndex(str);
          if (cleanIdx && cleanStr && cleanIdx === cleanStr) return true;
          if (email && str.toLowerCase() === email) return true;
        }
      }
    }
  }

  // 2. Sprawdź w zindeksowanej ewidencji Google Sheets (attendanceIndex) O(1)
  if (attendanceIndex) {
    const meetingKeys = meeting._keys || normalizeMeetingKeys(meeting);

    // Sprawdź po numerze indeksu
    if (cleanIdx && attendanceIndex.indexByStudentIndex?.has(cleanIdx)) {
      const studentMeetings = attendanceIndex.indexByStudentIndex.get(cleanIdx);
      for (let k = 0; k < meetingKeys.length; k++) {
        if (studentMeetings.has(meetingKeys[k])) return true;
      }
    }
    if (rawIdx && attendanceIndex.indexByStudentIndex?.has(rawIdx)) {
      const studentMeetings = attendanceIndex.indexByStudentIndex.get(rawIdx);
      for (let k = 0; k < meetingKeys.length; k++) {
        if (studentMeetings.has(meetingKeys[k])) return true;
      }
    }

    // Sprawdź po emailu
    if (email && attendanceIndex.indexByEmail?.has(email)) {
      const studentMeetings = attendanceIndex.indexByEmail.get(email);
      for (let k = 0; k < meetingKeys.length; k++) {
        if (studentMeetings.has(meetingKeys[k])) return true;
      }
    }

    // Sprawdź po imieniu i nazwisku
    if (fullName && attendanceIndex.indexByName?.has(fullName)) {
      const studentMeetings = attendanceIndex.indexByName.get(fullName);
      for (let k = 0; k < meetingKeys.length; k++) {
        if (studentMeetings.has(meetingKeys[k])) return true;
      }
    }
  }

  return false;
}

/**
 * Prekompiluje spotkania dla widoku, dodając zindeksowane zbiory Set dla O(1) wyszukiwania
 *
 * @param {Array} meetings - lista spotkań
 * @returns {Array} spotkania wzbogacone o _keys i _attendeesIndex
 */
export function precompileMeetings(meetings = []) {
  if (!Array.isArray(meetings)) return [];

  return meetings.map(meeting => {
    if (!meeting) return meeting;

    const keys = normalizeMeetingKeys(meeting);
    const attendeesSet = {
      indexes: new Set(),
      emails: new Set(),
      names: new Set(),
    };

    const attendees = meeting.listaObecnosci || meeting.attendees || meeting.participantRecords;
    if (Array.isArray(attendees) && attendees.length > 0) {
      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i];
        if (!att) continue;
        if (typeof att === 'object') {
          const isApproved = att.manualApproved !== undefined
            ? Boolean(att.manualApproved)
            : (att.status === 'approved' || att.status === 'Zaliczona' || att.status === 'Zaliczono' || att.isEligible !== false);
          if (!isApproved) continue;

          const aIdx = normalizeStudentIndex(att.nrIndeksu || att.index || att.member?.index || att.member?.nrIndeksu);
          if (aIdx) attendeesSet.indexes.add(aIdx);
          const rawAIdx = String(att.nrIndeksu || att.index || att.member?.index || '').trim();
          if (rawAIdx) attendeesSet.indexes.add(rawAIdx);

          const aEmail = normalizeStudentEmail(att.email || att.member?.email);
          if (aEmail) attendeesSet.emails.add(aEmail);

          const aName = normalizeStudentName(att.name || att.fullName || att.rawName || att.member?.fullName);
          if (aName) attendeesSet.names.add(aName);
        } else {
          const str = String(att).trim();
          const cleanStr = normalizeStudentIndex(str);
          if (cleanStr) attendeesSet.indexes.add(cleanStr);
          if (str.includes('@')) attendeesSet.emails.add(str.toLowerCase());
          else attendeesSet.names.add(str.toLowerCase());
        }
      }
    }

    return {
      ...meeting,
      _keys: keys,
      _keysSet: new Set(keys),
      _attendeesIndex: attendeesSet,
    };
  });
}
