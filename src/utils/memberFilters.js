// ─── Unified Member Status & Consent Filter Helpers ─────────────────────────────

export const isMemberActive = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  if (status === 'usuniety' || status === 'usunięty' || status === 'deleted') return false;
  if (status === 'archiwum' || status === 'archived' || status === 'odrzucony' || status === 'czarna lista' || m.isArchived) return false;
  if (status === 'gosc' || status === 'gość' || status === 'guest' || status === 'wolny słuchacz') return false;
  if (status === 'nieaktywny' || status === 'resigned' || status === 'rezygnacja' || status === 'inactive' || status === 'były' || status === 'byly') return false;
  if (status === 'absolwent' || status === 'graduate') return false;

  return (
    status === 'aktywny' ||
    status === 'zatwierdzony' ||
    status === 'active' ||
    status === 'ostatni semestr' ||
    status === 'final_semester'
  );
};

export const isMemberFinalSemester = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  return status === 'ostatni semestr' || status === 'final_semester' || status === 'last_semester' || m?.academicStatus === 'Ostatni semestr';
};

export const isMemberGraduate = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  return status === 'absolwent' || status === 'graduate' || m?.academicStatus === 'Absolwent' || Boolean(m?.isGraduate);
};

export const isMemberGuest = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  if (status === 'archiwum' || status === 'archived' || status === 'odrzucony' || status === 'czarna lista' || m.isArchived) return false;
  return status === 'gosc' || status === 'gość' || status === 'guest' || status === 'wolny słuchacz';
};

export const isMemberInactive = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  if (status === 'archiwum' || status === 'archived' || status === 'odrzucony' || status === 'czarna lista' || m.isArchived) return false;
  if (status === 'absolwent' || status === 'graduate') return false;
  return status === 'nieaktywny' || status === 'resigned' || status === 'rezygnacja' || status === 'inactive' || status === 'były' || status === 'byly';
};

export const isMemberArchived = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  return status === 'archiwum' || status === 'archived' || status === 'odrzucony' || status === 'czarna lista' || Boolean(m.isArchived);
};

export const isMemberPending = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  if (status === 'usuniety' || status === 'usunięty' || status === 'deleted') return false;
  if (status === 'archiwum' || status === 'archived' || status === 'odrzucony' || status === 'czarna lista' || m.isArchived) return false;
  if (status === 'aktywny' || status === 'zatwierdzony' || status === 'active') return false;
  if (status === 'ostatni semestr' || status === 'final_semester') return false;
  if (status === 'absolwent' || status === 'graduate') return false;
  if (status === 'gosc' || status === 'gość' || status === 'guest' || status === 'wolny słuchacz') return false;
  if (status === 'nieaktywny' || status === 'resigned' || status === 'rezygnacja' || status === 'inactive' || status === 'były' || status === 'byly') return false;

  // Rekordy z pustym statusem lub statusem oczekującym kwalifikują się do kwarantanny
  return true;
};

export const isMemberDeleted = (m) => {
  if (!m) return false;
  const status = String(m.statusWeryfikacji || m.status || '').toLowerCase().trim();
  return status === 'usuniety' || status === 'usunięty' || status === 'deleted';
};

export const hasMailingConsent = (m) => {
  if (!m) return false;
  const zgoda = String(m.zgodaNaMailing || m.zgodaMailing || '').toLowerCase().trim();
  if (zgoda === 'brak zgody' || zgoda === 'nie' || zgoda === 'false') return false;
  return (
    m.mailingConsent === true ||
    String(m.zgodaMailing || '').toUpperCase().trim() === 'TAK' ||
    String(m.zgodaNaMailing || '').toLowerCase().includes('zgoda') ||
    zgoda === 'tak' ||
    zgoda === 'true' ||
    m.consentStatus === 'Zgody OK'
  );
};
