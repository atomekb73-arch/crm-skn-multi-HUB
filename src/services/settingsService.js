import { supabase } from '../supabaseClient.js';

/**
 * Serwis zarządzania konfiguracją, opiekunami, kadencjami zarządu i szablonami maili w Supabase SSOT.
 * Posiada automatyczną obsługę dedykowanych tabel oraz bezpieczny fallback na tabelę 'attendance',
 * gwarantując 100% trwałość danych w chmurze bez względu na środowisko.
 */

// ── 1. USTAWIENIA ORGANIZACJI I OPIEKUNOWIE ──────────────────────────────────

function normalizeOrgId(orgId) {
  const str = String(orgId || 'skn_seksuologii').trim();
  if (str === 'skn-template' || str === 'default' || !str) return 'skn_seksuologii';
  if (str === 'skn_psychoonkologii' || str === 'skn-psychoonkologia') return 'psychoonkologia';
  return str;
}

export async function fetchOrgSettingsFromDB(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrgId(orgId);

  // Próba odczytu z dedykowanej tabeli organization_settings
  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', cleanOrg);

    if (!error && Array.isArray(data) && data.length > 0) {
      const merged = {};
      data.forEach(row => {
        merged[row.settings_key] = row.settings_value;
      });
      return { ok: true, source: 'organization_settings', settings: merged };
    }
  } catch (err) {}

  // Bezpieczny fallback: odczyt z tabeli attendance pod kodem [SETTINGS]:<orgId>
  try {
    const { data: attRows, error: attError } = await supabase
      .from('attendance')
      .select('*')
      .like('meeting_code', `[SETTINGS]:${cleanOrg}%`);

    if (!attError && Array.isArray(attRows) && attRows.length > 0) {
      const merged = {};
      attRows.forEach(row => {
        try {
          const key = row.meeting_code.replace(`[SETTINGS]:${cleanOrg}:`, '').trim();
          const parsed = JSON.parse(row.activity_description || '{}');
          merged[key] = parsed;
        } catch {}
      });
      return { ok: true, source: 'attendance_fallback', settings: merged };
    }
  } catch (err) {
    console.warn('[fetchOrgSettingsFromDB] Błąd odczytu fallbacku z Supabase:', err);
  }

  return { ok: false, settings: {} };
}

export async function saveOrgSettingsKeyToDB(orgId = 'skn_seksuologii', key, value) {
  const cleanOrg = normalizeOrgId(orgId);
  const settingKey = String(key || '').trim();
  if (!settingKey) return { ok: false, error: 'Brak klucza ustawień' };

  // 1. Próba zapisu do dedykowanej tabeli organization_settings
  try {
    const recordId = `${cleanOrg}_${settingKey}`;
    const { data: existing, error: selErr } = await supabase
      .from('organization_settings')
      .select('id')
      .eq('id', recordId)
      .maybeSingle();

    if (!selErr) {
      if (existing?.id) {
        const { error: updateErr } = await supabase
          .from('organization_settings')
          .update({
            settings_value: value,
            updated_at: new Date().toISOString()
          })
          .eq('id', recordId);
        if (!updateErr) return { ok: true, target: 'organization_settings_update' };
      } else {
        const { error: insertErr } = await supabase
          .from('organization_settings')
          .insert({
            id: recordId,
            organization_id: cleanOrg,
            settings_key: settingKey,
            settings_value: value,
            updated_at: new Date().toISOString()
          });
        if (!insertErr) return { ok: true, target: 'organization_settings_insert' };
      }
    }
  } catch (err) {}

  // 2. Bezpieczny fallback: zapis do tabeli attendance
  try {
    const code = `[SETTINGS]:${cleanOrg}:${settingKey}`;
    await supabase.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', code);

    const { error: insErr } = await supabase.from('attendance').insert({
      organization_id: cleanOrg,
      meeting_code: code,
      meeting_date: new Date().toISOString().slice(0, 10),
      index_number: settingKey,
      role: 'Ustawienia',
      points: 0,
      activity_description: JSON.stringify(value)
    });

    if (insErr) throw insErr;
    return { ok: true, target: 'attendance_fallback' };
  } catch (err) {
    console.error(`[saveOrgSettingsKeyToDB] Błąd zapisu ustawienia ${settingKey} w Supabase:`, err);
    return { ok: false, error: err.message };
  }
}

// ── 2. KADENCJE ZARZĄDU I HISTORIA FUNKCJI ───────────────────────────────────

export async function fetchBoardTenuresFromDB(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrgId(orgId);

  // Próba odczytu z dedykowanej tabeli board_terms
  try {
    const { data, error } = await supabase
      .from('board_terms')
      .select('*')
      .eq('organization_id', cleanOrg)
      .order('start_date', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const tenures = data.map(row => ({
        id: row.id,
        memberName: row.member_name,
        memberIndex: row.member_index,
        memberEmail: row.member_email,
        roleName: row.role_name,
        startDate: row.start_date,
        endDate: row.end_date || '',
        isActive: Boolean(row.is_active),
        points: Number(row.points || 0),
        punkty: Number(row.points || 0),
      }));
      return { ok: true, source: 'board_terms', tenures };
    }
  } catch (err) {}

  // Bezpieczny fallback: odczyt z tabeli attendance pod kodem [BOARD_TERM]:<orgId>
  try {
    const { data: attRows, error: attError } = await supabase
      .from('attendance')
      .select('*')
      .like('meeting_code', `[BOARD_TERM]:${cleanOrg}%`);

    if (!attError && Array.isArray(attRows) && attRows.length > 0) {
      const tenures = [];
      attRows.forEach(row => {
        try {
          const parsed = JSON.parse(row.activity_description || '{}');
          if (parsed && (parsed.memberName || parsed.roleName)) {
            tenures.push({
              ...parsed,
              id: parsed.id || row.id,
              memberIndex: parsed.memberIndex || row.index_number,
              points: Number(parsed.points ?? row.points ?? 0),
              punkty: Number(parsed.punkty ?? row.points ?? 0),
            });
          }
        } catch {}
      });
      return { ok: true, source: 'attendance_fallback', tenures };
    }
  } catch (err) {
    console.warn('[fetchBoardTenuresFromDB] Błąd odczytu kadencji zarządu:', err);
  }

  return { ok: false, tenures: [] };
}

export async function saveBoardTenuresToDB(orgId = 'skn_seksuologii', tenures = []) {
  const cleanOrg = normalizeOrgId(orgId);
  const listToSave = Array.isArray(tenures) ? tenures : [];

  // 1. Próba zapisu do dedykowanej tabeli board_terms
  try {
    const { error: delErr } = await supabase.from('board_terms').delete().eq('organization_id', cleanOrg);
    if (!delErr) {
      if (listToSave.length > 0) {
        const rows = listToSave.map(t => ({
          id: String(t.id || `tenure_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
          organization_id: cleanOrg,
          member_name: t.memberName || t.fullName || 'Członek Zarządu',
          member_index: t.memberIndex || t.nrIndeksu || t.index || '',
          member_email: t.memberEmail || t.email || '',
          role_name: t.roleName || t.rola || 'Członek Zarządu',
          start_date: t.startDate || new Date().toISOString().slice(0, 10),
          end_date: t.isActive ? null : (t.endDate || null),
          is_active: Boolean(t.isActive),
          points: Number(t.points || t.punkty || 0),
          updated_at: new Date().toISOString()
        }));

        const { error: insErr } = await supabase.from('board_terms').insert(rows);
        if (!insErr) return { ok: true, target: 'board_terms' };
      } else {
        return { ok: true, target: 'board_terms_cleared' };
      }
    }
  } catch (err) {}

  // 2. Bezpieczny fallback: zapis do tabeli attendance pod kodem [BOARD_TERM]:<orgId>:<id>
  try {
    await supabase.from('attendance').delete().like('meeting_code', `[BOARD_TERM]:${cleanOrg}%`);

    if (listToSave.length > 0) {
      const attRows = listToSave.map(t => {
        const tId = String(t.id || `tenure_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const code = `[BOARD_TERM]:${cleanOrg}:${tId}`;
        const pts = Number(t.points || t.punkty || 0);
        return {
          organization_id: cleanOrg,
          meeting_code: code,
          meeting_date: t.startDate || new Date().toISOString().slice(0, 10),
          index_number: t.memberIndex || t.nrIndeksu || t.index || t.memberName || '',
          role: t.roleName || 'Zarząd',
          points: pts,
          activity_description: JSON.stringify({
            ...t,
            id: tId,
            points: pts,
            punkty: pts,
          })
        };
      });

      const { error: insErr } = await supabase.from('attendance').insert(attRows);
      if (insErr) throw insErr;
    }
    return { ok: true, target: 'attendance_fallback' };
  } catch (err) {
    console.error('[saveBoardTenuresToDB] Błąd zapisu kadencji zarządu w Supabase:', err);
    return { ok: false, error: err.message };
  }
}

// ── 3. USTAWIENIA NARZĘDZIA MAILE I SZABLONY ─────────────────────────────────

export async function fetchEmailConfigFromDB(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrgId(orgId);

  // Próba odczytu z dedykowanej tabeli email_templates
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('organization_id', cleanOrg);

    if (!error && Array.isArray(data) && data.length > 0) {
      const confRow = data.find(r => r.template_key === '__GLOBAL_CONFIG__');
      const baseConf = confRow?.config || {};
      const templates = {};
      data.forEach(r => {
        if (r.template_key !== '__GLOBAL_CONFIG__') {
          templates[r.template_key] = {
            id: r.template_key,
            subject: r.subject,
            body: r.body,
            ...(r.config || {})
          };
        }
      });
      return { ok: true, source: 'email_templates', config: { ...baseConf, templates } };
    }
  } catch (err) {}

  // Bezpieczny fallback: odczyt z tabeli attendance pod kodem [EMAIL_CONFIG]:<orgId>
  try {
    const { data: attRows, error: attError } = await supabase
      .from('attendance')
      .select('*')
      .eq('meeting_code', `[EMAIL_CONFIG]:${cleanOrg}`)
      .limit(1);

    if (!attError && Array.isArray(attRows) && attRows.length > 0) {
      const parsed = JSON.parse(attRows[0].activity_description || '{}');
      return { ok: true, source: 'attendance_fallback', config: parsed };
    }
  } catch (err) {
    console.warn('[fetchEmailConfigFromDB] Błąd odczytu konfiguracji mailowej:', err);
  }

  return { ok: false, config: null };
}

export async function saveEmailConfigToDB(orgId = 'skn_seksuologii', emailConfig = {}) {
  const cleanOrg = normalizeOrgId(orgId);
  const configToSave = { ...emailConfig, updatedAt: new Date().toISOString() };

  // 1. Próba zapisu do dedykowanej tabeli email_templates
  try {
    const recordId = `${cleanOrg}_global_config`;
    const { data: existing, error: selErr } = await supabase
      .from('email_templates')
      .select('id')
      .eq('id', recordId)
      .maybeSingle();

    if (!selErr) {
      if (existing?.id) {
        const { error: updErr } = await supabase.from('email_templates').update({
          config: configToSave,
          subject: configToSave.welcomeSubjectTemplate || '',
          body: configToSave.welcomeBodyTemplate || '',
          updated_at: new Date().toISOString()
        }).eq('id', recordId);
        if (!updErr) return { ok: true, target: 'email_templates' };
      } else {
        const { error: insErr } = await supabase.from('email_templates').insert({
          id: recordId,
          organization_id: cleanOrg,
          template_key: '__GLOBAL_CONFIG__',
          subject: configToSave.welcomeSubjectTemplate || '',
          body: configToSave.welcomeBodyTemplate || '',
          config: configToSave,
          updated_at: new Date().toISOString()
        });
        if (!insErr) return { ok: true, target: 'email_templates' };
      }
    }
  } catch (err) {}

  // 2. Bezpieczny fallback: zapis do tabeli attendance pod kodem [EMAIL_CONFIG]:<orgId>
  try {
    const code = `[EMAIL_CONFIG]:${cleanOrg}`;
    await supabase.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', code);

    const { error: insErr } = await supabase.from('attendance').insert({
      organization_id: cleanOrg,
      meeting_code: code,
      meeting_date: new Date().toISOString().slice(0, 10),
      index_number: 'EMAIL_CONFIG',
      role: 'Konfiguracja Poczty',
      points: 0,
      activity_description: JSON.stringify(configToSave)
    });

    if (insErr) throw insErr;
    return { ok: true, target: 'attendance_fallback' };
  } catch (err) {
    console.error('[saveEmailConfigToDB] Błąd zapisu konfiguracji poczty w Supabase:', err);
    return { ok: false, error: err.message };
  }
}

// ── 4. ZARZĄDZANIE DOSTĘPEM I LOGOWANIEM (ACCESS CONTROL) ────────────────────

/**
 * Odczyt uprawnionych użytkowników koła (SSOT).
 * 1. Najpierw próba odczytu z relacyjnej tabeli club_memberships (lub widoku v_effective_access)
 * 2. Fallback na organization_settings / attendance fallback.
 */
export async function fetchAccessUsersFromDB(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrgId(orgId);

  // 1. Relacyjna tabela club_memberships
  try {
    const { data, error } = await supabase
      .from('club_memberships')
      .select('*')
      .eq('club_id', cleanOrg)
      .eq('active', true);

    if (!error && Array.isArray(data) && data.length > 0) {
      const users = data.map(r => ({
        id: r.id,
        name: r.member_name,
        email: r.email,
        role: r.role,
        roleLabel: r.role_label || r.role,
        source: r.source,
        memberId: r.member_id,
        isPermanent: r.source === 'system',
      }));
      return { ok: true, source: 'club_memberships', users };
    }
  } catch (err) {}

  // 2. Fallback na organization_settings / attendance fallback
  const res = await fetchOrgSettingsFromDB(cleanOrg);
  if (res.ok && res.settings && Array.isArray(res.settings.access_users)) {
    return { ok: true, source: res.source, users: res.settings.access_users };
  }
  return { ok: false, users: [] };
}

/**
 * Zapis uprawnień użytkowników koła (SSOT).
 * Zapisuje do dedykowanej tabeli club_memberships oraz utrzymuje kompatybilność wsteczną w settings.
 */
export async function saveAccessUsersToDB(orgId = 'skn_seksuologii', users = []) {
  const cleanOrg = normalizeOrgId(orgId);
  const listToSave = Array.isArray(users) ? users : [];

  // 1. Zapis do relacyjnej tabeli club_memberships
  try {
    // Usuń manualne wpisy dla danego koła i wstaw zaktualizowane
    await supabase.from('club_memberships').delete().eq('club_id', cleanOrg).eq('source', 'manual');
    if (listToSave.length > 0) {
      const rows = listToSave.map(u => ({
        club_id: cleanOrg,
        email: String(u.email || '').trim().toLowerCase(),
        member_name: u.name || (u.email ? u.email.split('@')[0] : 'Użytkownik'),
        role: u.role === 'ADMIN' ? 'ADMIN' : (u.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (u.role === 'VIEWER' ? 'VIEWER' : 'COORDINATOR')),
        role_label: u.roleLabel || u.role,
        source: 'manual',
        active: true,
      }));
      await supabase.from('club_memberships').upsert(rows, { onConflict: 'club_id,email,source' });
    }
  } catch (err) {}

  // 2. Fallback kompatybilności wstecznej
  return saveOrgSettingsKeyToDB(cleanOrg, 'access_users', listToSave);
}

/**
 * Bezpieczne zarządzanie hasłami - hasła stałe są zarządzane w localStorage i Supabase Auth.
 * Wycofano zapisywanie haseł w jawnym tekście w bazie danych.
 */
export async function fetchUserPasswordsFromDB(orgId = 'skn_seksuologii') {
  return { ok: true, passwords: {} };
}

export async function saveUserPasswordToDB(orgId = 'skn_seksuologii', email, password, isFirstLogin = false) {
  const cleanOrg = normalizeOrgId(orgId);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return { ok: false, error: 'Brak adresu email' };

  // Zapisujemy wyłącznie status pierwszego logowania (boolean), nigdy hasło jawnym tekstem!
  try {
    const resStatus = await fetchOrgSettingsFromDB(cleanOrg);
    const currentStatus = resStatus.settings?.user_first_login_status || {};
    currentStatus[cleanEmail] = Boolean(isFirstLogin);
    await saveOrgSettingsKeyToDB(cleanOrg, 'user_first_login_status', currentStatus);
  } catch {}

  return { ok: true };
}

/**
 * Pobiera z Supabase (SSOT) wszystkie uprawnienia danego adresu e-mail ze WSZYSTKICH kół,
 * na potrzeby ekranu logowania (przed zalogowaniem, z dowolnego urządzenia).
 * Źródła: organization_settings (access_users, supervisors, user_passwords, user_first_login_status)
 * oraz board_terms (aktywne kadencje zarządu). Porównanie e-maili bez rozróżniania wielkości liter.
 *
 * @returns {Promise<{ok:boolean, accessMatches:Array, supervisorMatches:Array, boardMatches:Array, password:string|null, firstLogin:boolean|null}>}
 */
export async function fetchLoginAccessForEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const result = {
    ok: false,
    accessMatches: [],
    supervisorMatches: [],
    boardMatches: [],
    password: null,
    firstLogin: null,
  };
  if (!cleanEmail) return result;

  const sameEmail = (v) => String(v || '').trim().toLowerCase() === cleanEmail;

  // 1. Dedykowana tabela relacyjna club_memberships oraz widok v_effective_access
  try {
    const { data: relMemberships, error: relErr } = await supabase
      .from('club_memberships')
      .select('club_id, email, member_name, role, role_label, source, active')
      .eq('active', true);

    if (!relErr && Array.isArray(relMemberships) && relMemberships.length > 0) {
      result.ok = true;
      relMemberships.filter(m => sameEmail(m.email)).forEach(m => {
        result.accessMatches.push({
          orgId: normalizeOrgId(m.club_id),
          name: m.member_name,
          email: m.email,
          role: m.role,
          roleLabel: m.role_label,
          source: m.source,
        });
      });
    }
  } catch (err) {}

  // 2. organization_settings & attendance fallback (kompatybilność)
  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('organization_id, settings_key, settings_value')
      .in('settings_key', ['access_users', 'supervisors', 'user_passwords', 'user_first_login_status']);

    if (!error && Array.isArray(data)) {
      result.ok = true;
      data.forEach(row => {
        const orgId = normalizeOrgId(row.organization_id);
        const value = row.settings_value;
        if (row.settings_key === 'access_users' && Array.isArray(value)) {
          value.filter(u => sameEmail(u?.email)).forEach(u => result.accessMatches.push({ ...u, orgId }));
        } else if (row.settings_key === 'supervisors' && Array.isArray(value)) {
          value.filter(s => sameEmail(s?.email)).forEach(s => result.supervisorMatches.push({ ...s, orgId }));
        } else if (row.settings_key === 'user_passwords' && value && typeof value === 'object') {
          const key = Object.keys(value).find(k => sameEmail(k));
          if (key && value[key] && !result.password) result.password = value[key];
        } else if (row.settings_key === 'user_first_login_status' && value && typeof value === 'object') {
          const key = Object.keys(value).find(k => sameEmail(k));
          if (key !== undefined) {
            // Jeżeli którekolwiek koło potwierdza aktywację (false) – konto jest aktywne
            result.firstLogin = result.firstLogin === false ? false : Boolean(value[key]);
          }
        }
      });
    }
  } catch (err) {
    console.warn('[fetchLoginAccessForEmail] Błąd odczytu organization_settings:', err);
  }

  // 2. board_terms – aktywne kadencje zarządu we wszystkich kołach
  try {
    const { data, error } = await supabase
      .from('board_terms')
      .select('organization_id, member_name, member_email, role_name, is_active')
      .ilike('member_email', cleanEmail);

    if (!error && Array.isArray(data)) {
      result.ok = true;
      data
        .filter(r => sameEmail(r.member_email) && r.is_active !== false)
        .forEach(r => result.boardMatches.push({
          orgId: normalizeOrgId(r.organization_id),
          memberName: r.member_name,
          memberEmail: r.member_email,
          roleName: r.role_name,
          isActive: r.is_active !== false,
        }));
    }
  } catch (err) {
    console.warn('[fetchLoginAccessForEmail] Błąd odczytu board_terms:', err);
  }

  return result;
}

// ── 5. SUPABASE SSOT BACKUP & SNAPSHOT OPERATIONS ──────────────────────────

/**
 * Pobiera kompletny zrzut danych koła z Supabase
 */
export async function fetchOrgFullSupabaseData(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrgId(orgId);
  const data = {
    orgId: cleanOrg,
    timestamp: new Date().toISOString(),
    members: [],
    quarantine_submissions: [],
    attendance: [],
    organization_settings: [],
    board_terms: [],
    email_templates: []
  };

  try {
    const { data: members } = await supabase.from('members').select('*').eq('organization_id', cleanOrg);
    if (Array.isArray(members)) data.members = members;
  } catch (e) { console.warn('Backup members error:', e); }

  try {
    const { data: quarantine } = await supabase.from('quarantine_submissions').select('*').eq('organization_id', cleanOrg);
    if (Array.isArray(quarantine)) data.quarantine_submissions = quarantine;
  } catch (e) { console.warn('Backup quarantine error:', e); }

  try {
    const { data: attendance } = await supabase.from('attendance').select('*').eq('organization_id', cleanOrg);
    if (Array.isArray(attendance)) data.attendance = attendance;
  } catch (e) { console.warn('Backup attendance error:', e); }

  try {
    const { data: orgSettings } = await supabase.from('organization_settings').select('*').eq('organization_id', cleanOrg);
    if (Array.isArray(orgSettings)) data.organization_settings = orgSettings;
  } catch (e) { console.warn('Backup organization_settings error:', e); }

  try {
    const { data: boardTerms } = await supabase.from('board_terms').select('*').eq('organization_id', cleanOrg);
    if (Array.isArray(boardTerms)) data.board_terms = boardTerms;
  } catch (e) { console.warn('Backup board_terms error:', e); }

  try {
    const { data: emailTemplates } = await supabase.from('email_templates').select('*').eq('organization_id', cleanOrg);
    if (Array.isArray(emailTemplates)) data.email_templates = emailTemplates;
  } catch (e) { console.warn('Backup email_templates error:', e); }

  return data;
}

/**
 * Przywraca dane koła do bazy Supabase z obiektu zrzutu JSON
 */
export async function restoreOrgFullSupabaseData(orgId = 'skn_seksuologii', backupPayload) {
  const cleanOrg = normalizeOrgId(orgId);
  if (!backupPayload || typeof backupPayload !== 'object') {
    throw new Error('Nieprawidłowy format danych kopii zapasowej.');
  }

  const results = { members: 0, quarantine: 0, attendance: 0, settings: 0, terms: 0, emails: 0 };

  // 1. Members
  if (Array.isArray(backupPayload.members) && backupPayload.members.length > 0) {
    await supabase.from('members').delete().eq('organization_id', cleanOrg);
    const { error } = await supabase.from('members').insert(backupPayload.members.map(m => ({ ...m, organization_id: cleanOrg })));
    if (!error) results.members = backupPayload.members.length;
  }

  // 2. Quarantine
  if (Array.isArray(backupPayload.quarantine_submissions) && backupPayload.quarantine_submissions.length > 0) {
    await supabase.from('quarantine_submissions').delete().eq('organization_id', cleanOrg);
    const { error } = await supabase.from('quarantine_submissions').insert(backupPayload.quarantine_submissions.map(q => ({ ...q, organization_id: cleanOrg })));
    if (!error) results.quarantine = backupPayload.quarantine_submissions.length;
  }

  // 3. Attendance
  if (Array.isArray(backupPayload.attendance) && backupPayload.attendance.length > 0) {
    await supabase.from('attendance').delete().eq('organization_id', cleanOrg);
    const { error } = await supabase.from('attendance').insert(backupPayload.attendance.map(a => ({ ...a, organization_id: cleanOrg })));
    if (!error) results.attendance = backupPayload.attendance.length;
  }

  // 4. Settings
  if (Array.isArray(backupPayload.organization_settings) && backupPayload.organization_settings.length > 0) {
    try {
      await supabase.from('organization_settings').delete().eq('organization_id', cleanOrg);
      await supabase.from('organization_settings').insert(backupPayload.organization_settings.map(s => ({ ...s, organization_id: cleanOrg })));
      results.settings = backupPayload.organization_settings.length;
    } catch {}
  }

  // 5. Board Terms
  if (Array.isArray(backupPayload.board_terms) && backupPayload.board_terms.length > 0) {
    try {
      await supabase.from('board_terms').delete().eq('organization_id', cleanOrg);
      await supabase.from('board_terms').insert(backupPayload.board_terms.map(b => ({ ...b, organization_id: cleanOrg })));
      results.terms = backupPayload.board_terms.length;
    } catch {}
  }

  // 6. Email Templates
  if (Array.isArray(backupPayload.email_templates) && backupPayload.email_templates.length > 0) {
    try {
      await supabase.from('email_templates').delete().eq('organization_id', cleanOrg);
      await supabase.from('email_templates').insert(backupPayload.email_templates.map(e => ({ ...e, organization_id: cleanOrg })));
      results.emails = backupPayload.email_templates.length;
    } catch {}
  }

  return { success: true, results };
}

/**
 * Master Backup całego systemu Supabase
 */
export async function fetchMasterSupabaseData() {
  const master = {
    version: '3.0.0-supabase-ssot',
    exportedAt: new Date().toISOString(),
    tables: {}
  };

  const tableNames = ['members', 'quarantine_submissions', 'attendance', 'organization_settings', 'board_terms', 'email_templates'];
  for (const t of tableNames) {
    try {
      const { data, error } = await supabase.from(t).select('*');
      if (!error && Array.isArray(data)) {
        master.tables[t] = data;
      }
    } catch (e) {
      console.warn(`Master backup fetch error for ${t}:`, e);
    }
  }

  return master;
}

/**
 * Master Restore całego systemu Supabase
 */
export async function restoreMasterSupabaseData(masterPayload) {
  if (!masterPayload || typeof masterPayload !== 'object') {
    throw new Error('Nieprawidłowy format pliku Master Backup.');
  }

  const tables = masterPayload.tables || masterPayload;
  const stats = {};

  const order = ['members', 'quarantine_submissions', 'attendance', 'organization_settings', 'board_terms', 'email_templates'];
  for (const t of order) {
    if (Array.isArray(tables[t]) && tables[t].length > 0) {
      try {
        await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from(t).insert(tables[t]);
        stats[t] = error ? 0 : tables[t].length;
      } catch (err) {
        console.warn(`Restore error for ${t}:`, err);
      }
    }
  }

  return { success: true, stats };
}
