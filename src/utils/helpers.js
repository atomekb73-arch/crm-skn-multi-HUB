// ─── Attendance / frequency helpers ─────────────────────────────────────────

/**
 * Normalizuje identyfikator indeksu studenta (same cyfry, bez zbędnych białych znaków).
 */
export function normalizeStudentIndex(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '').trim();
}

/**
 * Ujednolicona weryfikacja uprawnienia do Certyfikatu Koła (SSOT).
 */
export function isCertificateEligible(stats, settings = {}) {
  const minPercent = settings.minAttendanceThreshold !== undefined
    ? Number(settings.minAttendanceThreshold)
    : (settings.minPassingPercent !== undefined ? Number(settings.minPassingPercent) : 70);
  const minCount = settings.minAttendanceCount !== undefined
    ? Number(settings.minAttendanceCount)
    : (settings.minAttended !== undefined ? Number(settings.minAttended) : 3);

  const percent = Number(stats?.attendancePercent ?? stats?.frekwencjaProcent ?? stats?.freq ?? stats?.attendanceRate ?? 0);
  const count = Number(stats?.attendedMandatoryCount ?? stats?.attendedCount ?? stats?.obecnosci ?? stats?.present ?? 0);

  return percent >= minPercent && count >= minCount;
}

export function parsePercent(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    return val <= 1 ? Math.round(val * 100) : Math.round(val);
  }
  const cleaned = String(val).replace('%', '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

export function calcFrequency(present, absent) {
  const p = typeof present === 'number' && !isNaN(present) ? present : 0;
  const a = typeof absent === 'number' && !isNaN(absent) ? absent : 0;
  const total = p + a;
  if (total === 0) return 0;
  const res = Math.round((p / total) * 100);
  return isNaN(res) ? 0 : res;
}

export function getFrequencyBadge(freq) {
  const f = typeof freq === 'number' && !isNaN(freq) ? freq : 0;
  if (f >= 90) return { label: 'Lider',               dotColor: 'bg-emerald-500', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (f >= 75) return { label: 'Bardzo aktywny',      dotColor: 'bg-teal-500',    color: 'bg-teal-50 text-teal-700 border-teal-200' };
  if (f >= 50) return { label: 'Bezpieczny brzeg',    dotColor: 'bg-amber-500',   color: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (f >= 25) return { label: 'Niższa aktywność',    dotColor: 'bg-stone-500',   color: 'bg-stone-100 text-stone-700 border-stone-300' };
  return            { label: 'Wymaga uzupełnienia', dotColor: 'bg-slate-500',   color: 'bg-slate-100 text-slate-700 border-slate-300' };
}

export function getCertificateStatus(freq, absences = 0, options = {}) {
  const f = typeof freq === 'number' && !isNaN(freq) ? freq : 0;
  const abs = typeof absences === 'number' && !isNaN(absences) ? absences : 0;
  const canIssue = typeof options === 'object' && options.canIssue !== undefined
    ? Boolean(options.canIssue)
    : isCertificateEligible({ freq: f, attendedCount: Math.max(0, 12 - abs) }, options);

  return canIssue
    ? { canIssue: true,  label: 'Można wydać', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : { canIssue: false, label: 'W toku',      color: 'bg-slate-100 text-slate-700 border-slate-300' };
}

/**
 * Zwraca stabilny, unikalny klucz identyfikacyjny rekordu (przede wszystkim znormalizowany e-mail,
 * a w przypadku braku e-maila: znormalizowany numer indeksu).
 */
export function getRecordKey(item) {
  if (!item) return '';
  const email = String(item.email || item.mail || '').trim().toLowerCase();
  if (email && email.includes('@')) return email;

  const rawIndex = String(item.index || item.indexNumber || '').replace(/\D/g, '').replace(/^0+/, '').trim();
  if (rawIndex) return `idx_${rawIndex}`;

  if (item.memberKey) return String(item.memberKey).trim().toLowerCase();
  if (item.id) return String(item.id).trim().toLowerCase();
  return '';
}

// ─── SMART MAIL PARSER & DUPLICATE DETECTOR ─────────────────────────────────

function parseDateStringToISO(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const clean = dateStr.trim();

  // 1. Direct YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // 2. DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 3. Polish text month (np. "24 sierpnia 2026", "15 maja 2026 r.")
  const monthsPL = {
    stycz: '01', luty: '02', luteg: '02', marc: '03',
    kwiet: '04', maj: '05', czerw: '06', lipc: '07',
    sierp: '08', wrzes: '09', wrześ: '09', paźdz: '10', pazdz: '10',
    listop: '11', grudz: '12'
  };

  const plTextMatch = clean.match(/(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i);
  if (plTextMatch) {
    const day = plTextMatch[1].padStart(2, '0');
    const monthWord = plTextMatch[2].toLowerCase();
    const year = plTextMatch[3];

    let foundMonth = '01';
    for (const [key, num] of Object.entries(monthsPL)) {
      if (monthWord.startsWith(key)) {
        foundMonth = num;
        break;
      }
    }
    return `${year}-${foundMonth}-${day}`;
  }

  // 4. Try Standard JS Date parse
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {}

  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalizes subject string for duplicate and topic matching
 */
export function normalizeSubject(subj) {
  if (!subj) return '';
  return subj
    .toLowerCase()
    .replace(/^(?:re|fwd|odp|fw|odpowiedź|dotyczy)\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses raw pasted email header + body text or office registry note into structured metadata.
 */
export function parseRawEmailText(rawText, orgTag = 'SKN-SEKS') {
  if (!rawText || typeof rawText !== 'string') {
    return {
      id: '',
      sygnatura: '',
      sender: 'mgr Martyna Dziekan (Opiekun Naukowy SKN)',
      nadawca: 'mgr Martyna Dziekan (Opiekun Naukowy SKN)',
      recipient: 'Zarząd Koła Naukowego Seksuologii',
      odbiorca: 'Zarząd Koła Naukowego Seksuologii',
      date: '2026-03-17',
      dataWplywu: '2026-03-17',
      subject: '',
      przedmiot: '',
      summary: '',
      streszczenie: '',
      tresc: '',
      direction: 'IN',
      kierunek: 'IN',
      status: 'W toku',
      senderRole: 'Opiekun Naukowy SKN',
    };
  }

  const text = rawText.trim();

  // 1. Extract Sygnatura Kancelaryjna / Signature
  const sigMatch = text.match(/(?:^|\n)(?:Sygnatura(?:\s*kancelaryjna)?|Nr\s*pisma|Znak\s*sprawy|Sygn)\s*[:\-]\s*([A-Z0-9\/\-_\.]+)/i);
  const extractedSignature = sigMatch ? sigMatch[1].trim() : '';

  // 2. Extract Data Wpływu / Nadania / Date
  const dateLineMatch = text.match(/(?:^|\n)(?:Data\s*wpływu(?:\s*\/\s*nadania)?|Data\s*nadania|Data\s*wpływu|Data\s*pisma|Data|Date|Wysłano|Sent|Otrzymano)\s*[:\-]\s*([^\n\r]+)/i);
  let dateStr = '';
  if (dateLineMatch) {
    dateStr = parseDateStringToISO(dateLineMatch[1]);
  } else {
    const standaloneDateMatch = text.match(/\b(\d{4}[-.]\d{2}[-.]\d{2}|\d{1,2}[-.]\d{1,2}[-.]\d{4})\b/);
    if (standaloneDateMatch) {
      dateStr = parseDateStringToISO(standaloneDateMatch[1]);
    }
  }

  // 3. Extract Kierunek pisma / Direction
  const dirMatch = text.match(/(?:^|\n)(?:Kierunek(?:\s*pisma)?|Typ\s*pisma|Kierunek)\s*[:\-]\s*([^\n\r]+)/i);
  let direction = 'IN';
  let explicitDirection = false;
  if (dirMatch) {
    const dStr = dirMatch[1].trim().toUpperCase();
    if (dStr.includes('OUT') || dStr.includes('WYCHODZ')) {
      direction = 'OUT';
      explicitDirection = true;
    } else if (dStr.includes('IN') || dStr.includes('PRZYCHODZ')) {
      direction = 'IN';
      explicitDirection = true;
    }
  }

  // 4. Extract Nadawca / Wnioskodawca / Od / From
  const fromMatch = text.match(/(?:^|\n)(?:Nadawca\s*\/\s*Wnioskodawca|Nadawca|Wnioskodawca|Od|From|Wysłane przez|Sender)\s*[:\-]\s*([^\n\r]+)/i);
  let sender = fromMatch ? fromMatch[1].trim() : '';

  // 5. Extract Odbiorca / DW / Do / To / Adresat
  const toMatch = text.match(/(?:^|\n)(?:Odbiorca\s*\/\s*DW|Odbiorca|Adresat|Do|To|Recipient|DW|CC)\s*[:\-]\s*([^\n\r]+)/i);
  let recipient = toMatch ? toMatch[1].trim() : '';

  // 6. Extract Temat sprawy / Przedmiot / Subject
  const subjectMatch = text.match(/(?:^|\n)(?:Temat\s*sprawy|Przedmiot\s*sprawy|Temat|Przedmiot|Subject|Dotyczy|Tytuł|Subj)\s*[:\-]\s*([^\n\r]+)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : '';

  // 7. Extract Status sprawy
  const statusMatch = text.match(/(?:^|\n)(?:Status\s*sprawy|Status)\s*[:\-]\s*([^\n\r]+)/i);
  let status = 'W toku';
  if (statusMatch) {
    const rawStatus = statusMatch[1].trim().toLowerCase();
    if (rawStatus.includes('zakończ') || rawStatus.includes('zamknięt') || rawStatus.includes('zrealizowan')) {
      status = 'Zakończone';
    } else if (rawStatus.includes('zatwierdz') || rawStatus.includes('przyjęt') || rawStatus.includes('pozytywn')) {
      status = 'Zatwierdzone';
    } else if (rawStatus.includes('weryfik') || rawStatus.includes('sprawdz') || rawStatus.includes('analiz')) {
      status = 'Weryfikacja';
    } else if (rawStatus.includes('w toku') || rawStatus.includes('otwart') || rawStatus.includes('oczekuj')) {
      status = 'W toku';
    }
  }

  // 8. Extract Treść / Streszczenie pisma
  let summary = '';
  const summaryBlockMatch = text.match(/(?:^|\n)(?:Streszczenie\s*\/\s*treść|Treść\s*\/\s*streszczenie|Streszczenie|Treść|Summary|Body|Opis\s*sprawy|Opis)\s*[:\-]\s*([\s\S]+)/i);
  if (summaryBlockMatch) {
    let rawSummary = summaryBlockMatch[1];
    const nextHeaderMatch = rawSummary.search(/(?:^|\n)(?:Status(?:\s*sprawy)?|Cytat|Link(?:\s*do.*)?|Załącznik(?:i)?|Data\s*aktualizacji|Uwagi|Podpis)\s*[:\-]/i);
    if (nextHeaderMatch !== -1) {
      rawSummary = rawSummary.slice(0, nextHeaderMatch);
    }
    summary = rawSummary.trim();
  }

  if (!summary) {
    const headerLinesRegex = /^(?:Pozycja\s*\d+|Sygnatura(?:\s*kancelaryjna)?|Nr\s*pisma|Znak\s*sprawy|Data(?:\s*wpływu|\s*nadania|\s*pisma)?|Date|Wysłano|Sent|Otrzymano|Od|From|Do|To|Nadawca(?:\s*\/\s*Wnioskodawca)?|Wnioskodawca|Odbiorca(?:\s*\/\s*DW)?|Adresat|Temat(?:\s*sprawy)?|Przedmiot(?:\s*sprawy)?|Subject|Dotyczy|Tytuł|Kierunek(?:\s*pisma)?|Status(?:\s*sprawy)?|CC|DW|BCC|UDW)\s*[:\-].*$/gmi;
    const positionLineRegex = /^Pozycja\s*\d+.*$/gmi;
    summary = text
      .replace(headerLinesRegex, '')
      .replace(positionLineRegex, '')
      .trim();
  }

  // 9. Direction & Role inference if not explicitly given
  const lowerSender = sender.toLowerCase();
  const lowerTag = (orgTag || 'skn-seks').toLowerCase();

  const isMartynaDziekan = lowerSender.includes('martyna dziekan') || lowerSender.includes('martynadziekan');
  let senderRole = 'Inny';

  if (isMartynaDziekan) {
    senderRole = 'Opiekun Naukowy SKN';
    if (!explicitDirection) direction = 'IN';
    if (!sender.includes('Martyna Dziekan')) {
      sender = 'mgr Martyna Dziekan (Opiekun Naukowy SKN)';
    } else if (!sender.includes('Opiekun Naukowy')) {
      sender = `${sender} (Opiekun Naukowy SKN)`;
    }
  } else if (
    lowerSender.includes('zarząd') ||
    lowerSender.includes(lowerTag) ||
    lowerSender.includes('student.wskz.pl') ||
    lowerSender.includes('skn.')
  ) {
    if (!explicitDirection) direction = 'OUT';
    senderRole = 'Zarząd Koła';
  } else if (lowerSender.includes('dziekanat') || lowerSender.includes('władze uczelni') || lowerSender.includes('rektor')) {
    senderRole = 'Dziekanat / Władze Uczelni';
  }

  const finalSender = sender || (direction === 'OUT' ? 'Zarząd Koła Naukowego Seksuologii' : 'mgr Martyna Dziekan (Opiekun Naukowy SKN)');
  const finalRecipient = recipient || (direction === 'IN' ? 'Zarząd Koła Naukowego Seksuologii' : 'mgr Martyna Dziekan (Opiekun Naukowy SKN)');
  const finalDate = dateStr || '2026-03-17';

  return {
    id: extractedSignature,
    sygnatura: extractedSignature,
    date: finalDate,
    dataWplywu: finalDate,
    sender: finalSender,
    nadawca: finalSender,
    recipient: finalRecipient,
    odbiorca: finalRecipient,
    subject: subject,
    przedmiot: subject,
    summary: summary,
    streszczenie: summary,
    tresc: summary,
    direction,
    kierunek: direction,
    status,
    senderRole,
  };
}

/** Alias for parseRawEmailText */
export const parseEmailOrText = parseRawEmailText;

/**
 * Checks for possible duplicate correspondence based on normalized subject and date.
 */
export function checkDuplicateCorrespondence(newEntry, existingList = []) {
  if (!newEntry || !Array.isArray(existingList) || existingList.length === 0) {
    return { isDuplicate: false, matchedEntry: null };
  }

  const normSubject = normalizeSubject(newEntry.subject);
  if (!normSubject || normSubject.length < 4) {
    return { isDuplicate: false, matchedEntry: null };
  }

  const match = existingList.find((item) => {
    if (!item) return false;
    const itemNormSubject = normalizeSubject(item.subject);
    const subjectMatch = itemNormSubject.includes(normSubject) || normSubject.includes(itemNormSubject);
    const dateMatch = item.date === newEntry.date;
    const sameDirection = item.direction === newEntry.direction;

    return subjectMatch && (dateMatch || sameDirection);
  });

  return {
    isDuplicate: !!match,
    matchedEntry: match || null,
  };
}

/**
 * Zwraca pełny rok akademicki (np. "2026/2027") oraz skrót (np. "26/27") dla podanej daty.
 * Reguła: rok akademicki zaczyna się 1 października (miesiąc indeksowany od 0 -> miesiąc 9).
 */
export function getAcademicYearFromDate(dateInput) {
  let d = null;
  if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Obsługa polskiego formatu DD.MM.YYYY lub DD/MM/YYYY z opcjonalną godziną
    const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmyMatch) {
      d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    } else {
      d = new Date(trimmed);
    }
  } else if (typeof dateInput === 'number') {
    d = new Date(dateInput);
  }

  // Domyślnie bieżąca data systemu, gdy brak poprawnej daty
  if (!d || isNaN(d.getTime())) {
    d = new Date();
  }

  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = styczeń, 9 = październik

  let startYear;
  if (month >= 9) {
    // Październik, listopad, grudzień -> początek roku akademickiego
    startYear = year;
  } else {
    // Styczeń - wrzesień -> kontynuacja roku rozpoczętego w poprzednim roku kalendarzowym
    startYear = year - 1;
  }

  const endYear = startYear + 1;
  const shortStart = String(startYear).slice(-2);
  const shortEnd = String(endYear).slice(-2);

  return {
    full: `${startYear}/${endYear}`,
    short: `${shortStart}/${shortEnd}`,
    startYear,
    endYear
  };
}



