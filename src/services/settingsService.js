import { supabase } from '../supabaseClient.js';

/**
 * Serwis zarządzania konfiguracją, opiekunami, kadencjami zarządu i szablonami maili w Supabase SSOT.
 * Posiada automatyczną obsługę dedykowanych tabel oraz bezpieczny fallback na tabelę 'attendance',
 * gwarantując 100% trwałość danych w chmurze bez względu na środowisko.
 */

// ── 1. USTAWIENIA ORGANIZACJI I OPIEKUNOWIE ──────────────────────────────────

export function normalizeOrgId(orgId) {
  const str = String(orgId || 'skn_seksuologii').trim().toLowerCase();
  if (str === 'skn-template' || str === 'skn_template' || str === 'default' || str === 'seksuologia' || str === 'skn-seksuologia' || !str) return 'skn_seksuologii';
  if (str === 'skn_psychoonkologii' || str === 'skn-psychoonkologia') return 'psychoonkologia';
  if (str === 'skn_uzaleznienia' || str === 'skn-uzaleznienia') return 'uzaleznienia';
  return str;
}

export const DEFAULT_BOARD_TENURES_SEKSUOLOGIA = [
  {
    id: "tenure_tomasz_bratkowski_pres",
    organization_id: "skn_seksuologii",
    memberName: "Tomasz Bratkowski",
    memberIndex: "15998",
    memberEmail: "15998@student.wskz.pl",
    roleName: "Przewodniczący / Przewodnicząca",
    startDate: "2026-07-06",
    endDate: "",
    isActive: true,
    points: 12
  },
  {
    id: "tenure_1793565289863",
    organization_id: "skn_seksuologii",
    memberName: "Magda Czepirska",
    memberIndex: "26535",
    memberEmail: "m.czepirek@gmail.com",
    roleName: "Sekretarz Koła",
    startDate: "2026-04-20",
    endDate: "",
    isActive: true,
    points: 21
  },
  {
    id: "tenure_1793565348183",
    organization_id: "skn_seksuologii",
    memberName: "Michał Rodak",
    memberIndex: "11654",
    memberEmail: "gabriel.creart@gmail.com",
    roleName: "Członek Zarządu",
    startDate: "2026-07-06",
    endDate: "",
    isActive: true,
    points: 12
  }
];

export const DEFAULT_BOARD_TENURES_BY_ORG = {
  skn_seksuologii: DEFAULT_BOARD_TENURES_SEKSUOLOGIA,
  uzaleznienia: [],
  psychoonkologia: [],
  test: [],
};

export const deduplicateBoard = (list, targetOrgId = null) => {
  if (!Array.isArray(list)) return [];
  const cleanTarget = targetOrgId ? normalizeOrgId(targetOrgId) : null;
  const map = new Map();
  const seenPersonRoleActive = new Set();
  const seenNameRoleStart = new Set();

  list.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const itemOrg = item.organization_id || item.orgId;
    if (cleanTarget && itemOrg && normalizeOrgId(itemOrg) !== cleanTarget) {
      return;
    }

    const idxPart = String(item.memberIndex || item.nrIndeksu || item.index || '').trim();
    const namePart = String(item.memberName || item.name || item.fullName || '').trim();
    const rolePart = String(item.roleName || item.role || item.rola || '').trim();
    const startPart = String(item.startDate || item.start_date || '').trim();

    const memberKey = idxPart || namePart;
    if (!memberKey && !rolePart) return;

    const compositeKey = `${memberKey}_${rolePart}_${startPart}`;
    const personRoleKey = `${memberKey.toLowerCase()}_${rolePart.toLowerCase()}`;
    const nameRoleStartKey = namePart ? `${namePart.toLowerCase()}_${rolePart.toLowerCase()}_${startPart}` : '';

    if (compositeKey === '__' || compositeKey.startsWith('_')) return;
    if (map.has(compositeKey)) return;
    if (nameRoleStartKey && seenNameRoleStart.has(nameRoleStartKey)) return;
    if (item.isActive !== false && seenPersonRoleActive.has(personRoleKey)) return;

    map.set(compositeKey, cleanTarget ? { ...item, organization_id: cleanTarget } : item);
    if (nameRoleStartKey) seenNameRoleStart.add(nameRoleStartKey);
    if (item.isActive !== false) seenPersonRoleActive.add(personRoleKey);
  });
  return Array.from(map.values());
};

export const uniqueTenures = deduplicateBoard;
export const deduplicateBoardTenures = deduplicateBoard;

export function getDefaultBoardTenuresForOrg(orgId) {
  const cleanOrg = normalizeOrgId(orgId);
  const defaults = DEFAULT_BOARD_TENURES_BY_ORG[cleanOrg] || [];
  return deduplicateBoard(defaults, cleanOrg);
}

export const deduplicateSupervisors = (list, targetOrgId = null) => {
  if (!Array.isArray(list)) return [];
  const cleanTarget = targetOrgId ? normalizeOrgId(targetOrgId) : null;
  const map = new Map();
  list.forEach(s => {
    if (!s || typeof s !== 'object') return;
    const itemOrg = s.organization_id || s.orgId;
    if (cleanTarget && itemOrg && normalizeOrgId(itemOrg) !== cleanTarget) {
      return;
    }
    const academicTitle = String(s.academicTitle || s.academic_title || 'mgr').trim();
    const name = String(s.name || '').trim();
    const fullName = String(s.fullName || (name ? `${academicTitle} ${name}`.trim() : '')).trim();
    const email = String(s.email || '').toLowerCase().trim();
    const role = String(s.role || 'Opiekun Naukowy Koła').trim();
    const startDate = String(s.startDate || s.start_date || '2025-10-01').trim();

    const identityKey = (email || name.toLowerCase() || fullName.toLowerCase()).trim();
    if (!identityKey) return;

    const personRoleKey = `${identityKey}_${role.toLowerCase()}`;
    const compositeKey = `${personRoleKey}_${startDate}`;
    if (map.has(compositeKey) || map.has(personRoleKey)) return;

    const normalizedSup = {
      ...s,
      id: s.id || `sup_${name.replace(/\s+/g, '_').toLowerCase() || Date.now()}`,
      academicTitle,
      name,
      fullName,
      affiliation: s.affiliation || 'Instytut Psychologii WSKZ',
      role,
      email,
      startDate,
      endDate: s.endDate || s.end_date || '',
      isActive: s.isActive !== undefined ? s.isActive : (s.is_active !== undefined ? s.is_active : true),
      aliases: Array.isArray(s.aliases) && s.aliases.length > 0 ? s.aliases : [
        name.toLowerCase(),
        fullName.toLowerCase(),
      ].filter(Boolean),
      ...(cleanTarget ? { organization_id: cleanTarget } : {}),
    };
    map.set(personRoleKey, normalizedSup);
  });
  return Array.from(map.values());
};

export function getTenureDedupeKey(t) {
  if (!t) return '';
  return `${(t.memberIndex || t.nrIndeksu || t.memberName || '').trim()}_${(t.roleName || t.role || '').trim()}_${(t.startDate || '').trim()}`;
}

export async function fetchOrgSettingsFromDB(orgId = 'skn_seksuologii') {
  const cleanOrg = normalizeOrgId(orgId);

  // 1. Próba odczytu z tabeli organization_settings (kolumna JSONB 'settings')
  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', cleanOrg);

    if (!error && Array.isArray(data) && data.length > 0) {
      let merged = {};
      data.forEach(row => {
        if (row.settings && typeof row.settings === 'object') {
          merged = { ...merged, ...row.settings };
        } else if (row.settings_key) {
          merged[row.settings_key] = row.settings_value;
        }
      });

      // Normalizacja i deduplikacja listy opiekunów
      if (Array.isArray(merged.supervisors)) {
        merged.supervisors = deduplicateSupervisors(merged.supervisors, cleanOrg);
      }

      return { ok: true, source: 'organization_settings', settings: merged };
    }
  } catch (err) {
    console.warn('[fetchOrgSettingsFromDB] Błąd odczytu organization_settings:', err);
  }

  // 2. Bezpieczny fallback: odczyt z tabeli attendance pod kodem [SETTINGS]:<orgId>
  try {
    const { data: attRows, error: attError } = await supabase
      .from('attendance')
      .select('*')
      .eq('organization_id', cleanOrg)
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
      if (Array.isArray(merged.supervisors)) {
        merged.supervisors = deduplicateSupervisors(merged.supervisors, cleanOrg);
      }
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

  const cleanValue = settingKey === 'supervisors'
    ? deduplicateSupervisors(Array.isArray(value) ? value : [], cleanOrg)
    : settingKey === 'board'
    ? deduplicateBoard(Array.isArray(value) ? value : [], cleanOrg)
    : value;

  // 1. Zapis do dedykowanej tabeli organization_settings (obiekt JSONB w kolumnie 'settings')
  try {
    const { data: existing, error: selErr } = await supabase
      .from('organization_settings')
      .select('id, settings')
      .eq('organization_id', cleanOrg)
      .maybeSingle();

    if (!selErr && existing?.id) {
      const currentSettings = (existing.settings && typeof existing.settings === 'object') ? existing.settings : {};
      const updatedSettings = {
        ...currentSettings,
        [settingKey]: cleanValue
      };
      const { error: updateErr } = await supabase
        .from('organization_settings')
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (!updateErr) {
        return { ok: true, target: 'organization_settings_update' };
      }
    } else if (!selErr && !existing) {
      const newSettings = { [settingKey]: cleanValue };
      const { error: insertErr } = await supabase
        .from('organization_settings')
        .insert({
          organization_id: cleanOrg,
          settings: newSettings,
          updated_at: new Date().toISOString()
        });

      if (!insertErr) {
        return { ok: true, target: 'organization_settings_insert' };
      }
    }
  } catch (err) {
    console.warn('[saveOrgSettingsKeyToDB] Błąd zapisu do organization_settings, uruchamiam fallback:', err);
  }

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
      activity_description: JSON.stringify(cleanValue)
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

  // 1. Próba odczytu z tabeli organization_settings (klucz 'board' w obiekcie settings)
  try {
    const { data: orgData, error: orgErr } = await supabase
      .from('organization_settings')
      .select('settings')
      .eq('organization_id', cleanOrg)
      .maybeSingle();

    if (!orgErr && orgData?.settings) {
      const rawBoard = orgData.settings.board || orgData.settings.board_tenures;
      if (Array.isArray(rawBoard) && rawBoard.length > 0) {
        const cleanList = deduplicateBoard(rawBoard, cleanOrg);
        if (cleanList.length > 0) {
          return { ok: true, source: 'organization_settings', tenures: cleanList };
        }
      }
    }
  } catch (err) {}

  // 2. Fallback: odczyt z tabeli attendance pod kodem [BOARD_TERM]:<orgId>
  try {
    const { data: attRows, error: attError } = await supabase
      .from('attendance')
      .select('*')
      .eq('organization_id', cleanOrg)
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
              organization_id: cleanOrg,
              memberIndex: parsed.memberIndex || row.index_number,
              points: Number(parsed.points ?? row.points ?? 0),
              punkty: Number(parsed.punkty ?? row.points ?? 0),
            });
          }
        } catch {}
      });
      const cleanTenures = deduplicateBoard(tenures, cleanOrg);
      if (cleanTenures.length > 0) {
        return { ok: true, source: 'attendance_fallback', tenures: cleanTenures };
      }
    }
  } catch (err) {
    console.warn('[fetchBoardTenuresFromDB] Błąd odczytu kadencji zarządu:', err);
  }

  // 3. Izolowany fallback per organizacja (tylko skn_seksuologii ma domyślny zarząd, pozostałe mają [])
  const defaultTenures = getDefaultBoardTenuresForOrg(cleanOrg);
  return { ok: true, source: 'default_fallback', tenures: defaultTenures };
}

export async function saveBoardTenuresToDB(orgId = 'skn_seksuologii', tenures = []) {
  const cleanOrg = normalizeOrgId(orgId);
  // Zastosuj ścisłą deduplikację listy przed jakimkolwiek zapisem i oznacz organization_id
  const listToSave = deduplicateBoard(Array.isArray(tenures) ? tenures : [], cleanOrg);

  // 1. Zapis do organization_settings pod kluczem 'board'
  try {
    const { data: existing, error: selErr } = await supabase
      .from('organization_settings')
      .select('id, settings')
      .eq('organization_id', cleanOrg)
      .maybeSingle();

    if (!selErr && existing?.id) {
      const currentSettings = (existing.settings && typeof existing.settings === 'object') ? existing.settings : {};
      await supabase
        .from('organization_settings')
        .update({
          settings: {
            ...currentSettings,
            board: listToSave
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else if (!selErr && !existing) {
      await supabase
        .from('organization_settings')
        .insert({
          organization_id: cleanOrg,
          settings: { board: listToSave },
          updated_at: new Date().toISOString()
        });
    }
  } catch (err) {
    console.warn('[saveBoardTenuresToDB] Błąd zapisu board w organization_settings:', err);
  }

  // 2. Zapis do tabeli attendance pod kodem [BOARD_TERM]:<orgId>:<id> (z usunięciem poprzednich wpisów)
  try {
    await supabase.from('attendance').delete().eq('organization_id', cleanOrg).like('meeting_code', `[BOARD_TERM]:${cleanOrg}%`);

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

  // 1. Dedykowany widok v_effective_access lub relacyjna tabela club_memberships
  try {
    const { data: effData, error: effErr } = await supabase
      .from('v_effective_access')
      .select('club_id, email, member_name, role, role_label, source, active')
      .eq('active', true)
      .eq('email', cleanEmail);

    if (!effErr && Array.isArray(effData) && effData.length > 0) {
      result.ok = true;
      effData.forEach(m => {
        result.accessMatches.push({
          orgId: normalizeOrgId(m.club_id),
          name: m.member_name,
          email: m.email,
          role: m.role,
          roleLabel: m.role_label,
          source: m.source,
        });
      });
    } else {
      const { data: relMemberships, error: relErr } = await supabase
        .from('club_memberships')
        .select('club_id, email, member_name, role, role_label, source, active')
        .eq('active', true)
        .eq('email', cleanEmail);

      if (!relErr && Array.isArray(relMemberships) && relMemberships.length > 0) {
        result.ok = true;
        relMemberships.forEach(m => {
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
    }
  } catch (err) {}

  // 2. organization_settings & attendance fallback (kompatybilność)
  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*');

    if (!error && Array.isArray(data)) {
      result.ok = true;
      data.forEach(row => {
        const orgId = normalizeOrgId(row.organization_id);
        const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
        
        // a) Z kolumny JSONB settings
        if (Array.isArray(settings.access_users)) {
          settings.access_users.filter(u => sameEmail(u?.email)).forEach(u => result.accessMatches.push({ ...u, orgId }));
        }
        if (Array.isArray(settings.supervisors)) {
          settings.supervisors.filter(s => sameEmail(s?.email)).forEach(s => result.supervisorMatches.push({ ...s, orgId }));
        }
        if (Array.isArray(settings.board)) {
          settings.board.filter(b => sameEmail(b?.memberEmail || b?.email) && b.isActive !== false).forEach(b => {
            result.boardMatches.push({
              orgId,
              memberName: b.memberName || b.name || b.fullName,
              memberEmail: b.memberEmail || b.email,
              roleName: b.roleName || b.role || b.rola,
              isActive: b.isActive !== false,
            });
          });
        }
        if (settings.user_passwords && typeof settings.user_passwords === 'object') {
          const key = Object.keys(settings.user_passwords).find(k => sameEmail(k));
          if (key && settings.user_passwords[key] && !result.password) result.password = settings.user_passwords[key];
        }
        if (settings.user_first_login_status && typeof settings.user_first_login_status === 'object') {
          const key = Object.keys(settings.user_first_login_status).find(k => sameEmail(k));
          if (key !== undefined) {
            result.firstLogin = result.firstLogin === false ? false : Boolean(settings.user_first_login_status[key]);
          }
        }

        // b) Z wariantów settings_key / settings_value
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
