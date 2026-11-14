import { supabase, getSupabaseForOrg, fetchAllTenantRows } from '../supabaseClient.js';
import { WSKZ_ORGANIZATIONS } from '../config/wskzRegistry.js';
import { deduplicateDorobek, getDorobekRowUuid } from '../utils/dorobek.js';

export const GLOBAL_SUPERADMIN_EMAIL = 'atomekb73@gmail.com';

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
      affiliation: (s.affiliation || 'Wydział Psychologii WSKZ')
        .replace(/Instytut Psychologii/g, 'Wydział Psychologii')
        .replace(/INSTYTUT PSYCHOLOGII/g, 'WYDZIAŁ PSYCHOLOGII')
        .replace(/Instytucie Psychologii/g, 'Wydziale Psychologii')
        .replace(/Instytutu Psychologii/g, 'Wydziału Psychologii'),
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
  const orgClient = getSupabaseForOrg(cleanOrg);

  // 1. Próba odczytu z tabeli organization_settings (kolumna JSONB 'settings')
  try {
    const { data, error } = await orgClient
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
  const orgClient = getSupabaseForOrg(cleanOrg);
  const settingKey = String(key || '').trim();
  if (!settingKey) return { ok: false, error: 'Brak klucza ustawień' };

  const cleanValue = settingKey === 'supervisors'
    ? deduplicateSupervisors(Array.isArray(value) ? value : [], cleanOrg)
    : settingKey === 'board'
    ? deduplicateBoard(Array.isArray(value) ? value : [], cleanOrg)
    : value;

  // 1. Zapis do dedykowanej tabeli organization_settings (obiekt JSONB w kolumnie 'settings')
  try {
    const { data: existing, error: selErr } = await orgClient
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
      const { error: updateErr } = await orgClient
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
      const { error: insertErr } = await orgClient
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
    await orgClient.from('attendance').delete().eq('organization_id', cleanOrg).eq('meeting_code', code);

    const { error: insErr } = await orgClient.from('attendance').insert({
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
  const orgClient = getSupabaseForOrg(cleanOrg);
  // Zastosuj ścisłą deduplikację listy przed jakimkolwiek zapisem i oznacz organization_id
  const listToSave = deduplicateBoard(Array.isArray(tenures) ? tenures : [], cleanOrg);

  // 1. Zapis do organization_settings pod kluczem 'board'
  try {
    const { data: existing, error: selErr } = await orgClient
      .from('organization_settings')
      .select('id, settings')
      .eq('organization_id', cleanOrg)
      .maybeSingle();

    if (!selErr && existing?.id) {
      const currentSettings = (existing.settings && typeof existing.settings === 'object') ? existing.settings : {};
      await orgClient
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
      await orgClient
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
    await orgClient.from('attendance').delete().eq('organization_id', cleanOrg).like('meeting_code', `[BOARD_TERM]:${cleanOrg}%`);

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

      const { error: insErr } = await orgClient.from('attendance').insert(attRows);
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
  const orgClient = getSupabaseForOrg(cleanOrg);
  const listToSave = Array.isArray(users) ? users : [];

  // 1. Zapis do relacyjnej tabeli club_memberships (może być zablokowany dla anon po security hardening)
  try {
    await orgClient.from('club_memberships').delete().eq('club_id', cleanOrg).eq('source', 'manual');
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
      await orgClient.from('club_memberships').upsert(rows, { onConflict: 'club_id,email,source' });
    }
  } catch (err) {}

  // 2. Zapis SSOT w organization_settings.settings.access_users
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
    revokedOrgs: [],
    password: null,
    firstLogin: null,
  };
  if (!cleanEmail) return result;

  const sameEmail = (v) => String(v || '').trim().toLowerCase() === cleanEmail;
  const revokedByOrg = new Map();
  const markRevoked = (orgId, targetEmail) => {
    const o = normalizeOrgId(orgId);
    const e = String(targetEmail || '').trim().toLowerCase();
    if (!o || !e) return;
    if (!revokedByOrg.has(o)) revokedByOrg.set(o, new Set());
    revokedByOrg.get(o).add(e);
  };
  const isEntryRevoked = (orgId) => {
    if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return false;
    const o = normalizeOrgId(orgId);
    return Boolean(revokedByOrg.get(o)?.has(cleanEmail) || revokedByOrg.get('*')?.has(cleanEmail));
  };
  const isValidProductionOrg = (orgId) => {
    const o = normalizeOrgId(orgId);
    return Boolean(o && o !== 'test');
  };

  // 1. Dedykowany widok v_effective_access lub relacyjna tabela club_memberships
  try {
    const { data: effData, error: effErr } = await supabase
      .from('v_effective_access')
      .select('club_id, email, member_name, role, role_label, source, active')
      .eq('active', true)
      .ilike('email', cleanEmail);

    if (!effErr && Array.isArray(effData) && effData.length > 0) {
      result.ok = true;
      effData.forEach(m => {
        const mOrg = normalizeOrgId(m.club_id);
        if (!sameEmail(m.email) || !isValidProductionOrg(mOrg)) return;
        result.accessMatches.push({
          orgId: mOrg,
          name: m.member_name,
          email: cleanEmail,
          role: m.role,
          roleLabel: m.role_label,
          source: m.source || 'v_effective_access',
        });
      });
    } else {
      const { data: relMemberships, error: relErr } = await supabase
        .from('club_memberships')
        .select('club_id, email, member_name, role, role_label, source, active')
        .eq('active', true)
        .ilike('email', cleanEmail);

      if (!relErr && Array.isArray(relMemberships) && relMemberships.length > 0) {
        result.ok = true;
        relMemberships.forEach(m => {
          const mOrg = normalizeOrgId(m.club_id);
          if (!sameEmail(m.email) || !isValidProductionOrg(mOrg)) return;
          result.accessMatches.push({
            orgId: mOrg,
            name: m.member_name,
            email: cleanEmail,
            role: m.role,
            roleLabel: m.role_label,
            source: m.source || 'club_memberships',
          });
        });
      }
    }
  } catch (err) {}

  // 2. organization_settings (SSOT dla każdego koła: access_users, supervisors, board, revoked_access)
  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*');

    if (!error && Array.isArray(data)) {
      result.ok = true;
      data.forEach(row => {
        const orgId = normalizeOrgId(row.organization_id);
        if (!isValidProductionOrg(orgId)) return;
        const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};

        // Kill Switch: lista zablokowanych kont per koło
        if (Array.isArray(settings.revoked_access)) {
          settings.revoked_access.forEach(item => {
            const revEmail = typeof item === 'string' ? item : item?.email;
            if (revEmail && item?.active !== true) {
              markRevoked(orgId, revEmail);
            }
          });
        }

        // a) Z kolumny JSONB settings
        if (Array.isArray(settings.access_users)) {
          settings.access_users
            .filter(u => sameEmail(u?.email) && u?.active !== false && u?.isActive !== false && u?.status !== 'revoked' && u?.status !== 'blocked')
            .forEach(u => result.accessMatches.push({ ...u, orgId, source: u.source || 'access_users' }));
        }
        if (Array.isArray(settings.supervisors)) {
          settings.supervisors
            .filter(s => sameEmail(s?.email) && s?.isActive !== false && s?.status !== 'revoked')
            .forEach(s => result.supervisorMatches.push({ ...s, orgId, source: 'supervisors' }));
        }
        if (Array.isArray(settings.board)) {
          settings.board
            .filter(b => sameEmail(b?.memberEmail || b?.email) && b.isActive !== false && b.accessRevoked !== true)
            .forEach(b => {
              result.boardMatches.push({
                orgId,
                memberName: b.memberName || b.name || b.fullName,
                memberEmail: b.memberEmail || b.email,
                roleName: b.roleName || b.role || b.rola,
                isActive: b.isActive !== false,
                source: 'board',
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
        if (row.settings_key === 'revoked_access' && Array.isArray(value)) {
          value.forEach(item => {
            const revEmail = typeof item === 'string' ? item : item?.email;
            if (revEmail && item?.active !== true) markRevoked(orgId, revEmail);
          });
        } else if (row.settings_key === 'access_users' && Array.isArray(value)) {
          value
            .filter(u => sameEmail(u?.email) && u?.active !== false && u?.isActive !== false && u?.status !== 'revoked')
            .forEach(u => result.accessMatches.push({ ...u, orgId, source: u.source || 'access_users' }));
        } else if (row.settings_key === 'supervisors' && Array.isArray(value)) {
          value
            .filter(s => sameEmail(s?.email) && s?.isActive !== false)
            .forEach(s => result.supervisorMatches.push({ ...s, orgId, source: 'supervisors' }));
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

  // 3. board_terms – aktywne kadencje zarządu we wszystkich kołach
  try {
    const { data, error } = await supabase
      .from('board_terms')
      .select('organization_id, member_name, member_email, role_name, is_active')
      .ilike('member_email', cleanEmail);

    if (!error && Array.isArray(data)) {
      result.ok = true;
      data
        .filter(r => sameEmail(r.member_email) && r.is_active !== false && isValidProductionOrg(r.organization_id))
        .forEach(r => result.boardMatches.push({
          orgId: normalizeOrgId(r.organization_id),
          memberName: r.member_name,
          memberEmail: r.member_email,
          roleName: r.role_name,
          isActive: r.is_active !== false,
          source: 'board_terms',
        }));
    }
  } catch (err) {
    console.warn('[fetchLoginAccessForEmail] Błąd odczytu board_terms:', err);
  }

  // Egzekwuj Kill Switch (odfiltruj cofnięte dostępy per organizacja)
  const revokedList = [];
  revokedByOrg.forEach((set, org) => {
    if (cleanEmail !== GLOBAL_SUPERADMIN_EMAIL && set.has(cleanEmail)) {
      revokedList.push(org);
    }
  });
  result.revokedOrgs = revokedList;
  if (revokedList.length > 0) {
    result.accessMatches = result.accessMatches.filter(m => !isEntryRevoked(m.orgId));
    result.supervisorMatches = result.supervisorMatches.filter(m => !isEntryRevoked(m.orgId));
    result.boardMatches = result.boardMatches.filter(m => !isEntryRevoked(m.orgId));
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

  // 3. Attendance (z deduplikacją wpisów [DOROBEK]%)
  if (Array.isArray(backupPayload.attendance) && backupPayload.attendance.length > 0) {
    const nonDorobekRows = [];
    const rawDorobekItems = [];
    for (const a of backupPayload.attendance) {
      if (String(a?.meeting_code || '').trim().startsWith('[DOROBEK]')) {
        try {
          const parsed = JSON.parse(a.activity_description || '{}');
          rawDorobekItems.push({ row: a, parsed: { ...parsed, organization_id: cleanOrg, date: parsed.date || a.meeting_date } });
        } catch {
          nonDorobekRows.push({ ...a, organization_id: cleanOrg });
        }
      } else {
        nonDorobekRows.push({ ...a, organization_id: cleanOrg });
      }
    }
    const dedupedItems = deduplicateDorobek(rawDorobekItems.map(x => x.parsed), cleanOrg);
    const dedupedDorobekRows = dedupedItems.map((item, idx) => ({
      id: getDorobekRowUuid(cleanOrg, item),
      organization_id: cleanOrg,
      meeting_code: `[DOROBEK] #${idx + 1}`,
      meeting_date: String(item.date || new Date().toISOString().slice(0, 10)).split('T')[0],
      index_number: String(item.nrIndeksu || item.studentIndex || '15998'),
      role: String(item.type || item.category || 'Project'),
      points: Number(item.points ?? item.punkty ?? 0) || 0,
      activity_description: JSON.stringify(item),
    }));
    const rowsToRestore = [...nonDorobekRows, ...dedupedDorobekRows];
    await supabase.from('attendance').delete().eq('organization_id', cleanOrg);
    const { error } = await supabase.from('attendance').insert(rowsToRestore);
    if (!error) results.attendance = rowsToRestore.length;
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

// ── 6. SUPERADMIN AUDIT MATRIX & KILL SWITCH (TYLKO atomekb73@gmail.com) ──────

const SUPERADMIN_FORBIDDEN_ERROR = 'Brak uprawnień Superadministratora. Operacja zastrzeżona wyłącznie dla konta atomekb73@gmail.com.';

const isAllowedSuperadminActor = (actorEmail) =>
  String(actorEmail || '').trim().toLowerCase() === GLOBAL_SUPERADMIN_EMAIL;

const resolveClubMeta = (orgId) => {
  const clean = normalizeOrgId(orgId);
  const found = WSKZ_ORGANIZATIONS.find(o => normalizeOrgId(o.orgId) === clean);
  if (found) return found;
  return {
    orgId: clean,
    name: clean === 'test' ? 'Środowisko Testowe (anomaly)' : clean,
    shortName: clean,
    code: clean.toUpperCase(),
    color: '#64748B',
    bgLight: '#F1F5F9',
    hasActiveCrm: false,
  };
};

/**
 * Pobiera globalną macierz wszystkich uprawnień w systemie across all clubs
 * oraz weryfikuje spójność izolacji między kołami.
 */
export async function fetchGlobalAccessMatrix(actorEmail) {
  if (!isAllowedSuperadminActor(actorEmail)) {
    throw new Error(SUPERADMIN_FORBIDDEN_ERROR);
  }

  const activeClubIds = WSKZ_ORGANIZATIONS.filter(o => o.hasActiveCrm).map(o => normalizeOrgId(o.orgId));

  const [
    effRes,
    membershipsRes,
    orgSettingsRes,
    boardTermsRes,
    ...membersPerClubRes
  ] = await Promise.all([
    supabase.from('v_effective_access').select('*').then(r => r).catch(() => ({ data: null, error: true })),
    supabase.from('club_memberships').select('*').then(r => r).catch(() => ({ data: null, error: true })),
    supabase.from('organization_settings').select('*').then(r => r).catch(() => ({ data: null, error: true })),
    supabase.from('board_terms').select('*').then(r => r).catch(() => ({ data: null, error: true })),
    ...activeClubIds.map(orgId =>
      fetchAllTenantRows('members', orgId, {
        select: 'organization_id, first_name, last_name, full_name, email, index_number, nr_indeksu, role, status',
      }).catch(() => ({ data: [], error: true }))
    ),
  ]);

  // Zbuduj słownik członków (po e-mailu i po imieniu+nazwisku) w celu pobrania numeru indeksu
  const memberByEmail = new Map();
  const memberByName = new Map();
  const normalizeSimpleName = (v) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  membersPerClubRes.forEach(res => {
    (res?.data || []).forEach(m => {
      const em = String(m.email || '').trim().toLowerCase();
      const idx = String(m.index_number || m.nr_indeksu || '').trim();
      const fullName = String(m.full_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()).trim();
      const orgId = normalizeOrgId(m.organization_id);
      if (em) {
        const prev = memberByEmail.get(em);
        if (!prev || (!prev.indexNumber && idx)) {
          memberByEmail.set(em, { fullName: fullName || prev?.fullName || '', indexNumber: idx || prev?.indexNumber || '', orgId });
        }
      }
      const nmKey = normalizeSimpleName(fullName);
      if (nmKey && idx && !memberByName.has(nmKey)) {
        memberByName.set(nmKey, { fullName, indexNumber: idx, email: em, orgId });
      }
    });
  });

  // Mapa przypisań (orgId::email) -> szczegóły
  const assignmentMap = new Map();
  const anomalies = [];
  const orgBoardsMap = new Map();
  const orgSupervisorsMap = new Map();
  const orgAccessUsersMap = new Map();
  const orgRevokedMap = new Map();

  const ensureSet = (map, orgId) => {
    if (!map.has(orgId)) map.set(orgId, new Set());
    return map.get(orgId);
  };

  const upsertAssignment = ({
    orgId,
    email,
    name = '',
    indexNumber = '',
    role = '',
    roleLabel = '',
    sourceKey = '',
    sourceLabel = '',
    isActive = true,
    revokedInfo = null,
    addedAt = '',
  }) => {
    const cleanOrg = normalizeOrgId(orgId);
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanOrg) return;

    const key = `${cleanOrg}::${cleanEmail}`;
    const clubMeta = resolveClubMeta(cleanOrg);
    const existing = assignmentMap.get(key) || {
      key,
      orgId: cleanOrg,
      clubName: clubMeta.name,
      clubShortName: clubMeta.shortName || clubMeta.name,
      clubCode: clubMeta.code,
      clubColor: clubMeta.color,
      hasActiveCrm: clubMeta.hasActiveCrm !== false,
      email: cleanEmail,
      name: '',
      indexNumber: '',
      roles: [],
      roleLabel: '',
      sources: [],
      sourceLabels: [],
      hasActiveSource: false,
      isBlocked: false,
      revokedInfo: null,
      addedAt: '',
    };

    const memberMatch = memberByEmail.get(cleanEmail) || (name ? memberByName.get(normalizeSimpleName(name)) : null);
    if (!existing.name) {
      existing.name = String(name || memberMatch?.fullName || '').trim();
    } else if (name && existing.name.includes('@')) {
      existing.name = String(name).trim();
    }
    if (!existing.indexNumber) {
      existing.indexNumber = String(indexNumber || memberMatch?.indexNumber || '').trim();
    }
    if (role && !existing.roles.includes(role)) existing.roles.push(role);
    if (roleLabel && !existing.roleLabel) existing.roleLabel = roleLabel;
    if (sourceKey && !existing.sources.includes(sourceKey)) existing.sources.push(sourceKey);
    if (sourceLabel && !existing.sourceLabels.includes(sourceLabel)) existing.sourceLabels.push(sourceLabel);
    if (isActive) existing.hasActiveSource = true;
    if (revokedInfo) {
      existing.isBlocked = true;
      existing.revokedInfo = revokedInfo;
    }
    if (addedAt && !existing.addedAt) existing.addedAt = addedAt;

    assignmentMap.set(key, existing);
  };

  // A) organization_settings
  (orgSettingsRes?.data || []).forEach(row => {
    const orgId = normalizeOrgId(row.organization_id);
    const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};

    if (Array.isArray(settings.revoked_access)) {
      settings.revoked_access.forEach(item => {
        const em = String(typeof item === 'string' ? item : item?.email || '').trim().toLowerCase();
        if (!em || item?.active === true) return;
        ensureSet(orgRevokedMap, orgId).add(em);
        upsertAssignment({
          orgId,
          email: em,
          name: item?.memberName || '',
          role: item?.previousRole || '',
          roleLabel: item?.previousRole || 'Dostęp cofnięty',
          sourceKey: 'revoked_access',
          sourceLabel: 'Kill Switch (Superadmin)',
          isActive: false,
          revokedInfo: typeof item === 'object' ? item : { email: em },
        });
      });
    }

    if (Array.isArray(settings.board)) {
      settings.board.forEach(b => {
        const em = String(b?.memberEmail || b?.email || '').trim().toLowerCase();
        if (!em) return;
        const active = b.isActive !== false && b.accessRevoked !== true;
        if (active) ensureSet(orgBoardsMap, orgId).add(em);
        upsertAssignment({
          orgId,
          email: em,
          name: b.memberName || b.name || b.fullName || '',
          indexNumber: b.memberIndex || '',
          role: b.roleName || 'Zarząd Koła',
          roleLabel: b.roleName || 'Zarząd Koła',
          sourceKey: 'board',
          sourceLabel: 'Zarząd Koła (Kadencja)',
          isActive: active,
          addedAt: b.startDate || '',
        });
      });
    }

    if (Array.isArray(settings.supervisors)) {
      settings.supervisors.forEach(s => {
        const em = String(s?.email || '').trim().toLowerCase();
        if (!em) return;
        const active = s.isActive !== false && s.status !== 'revoked';
        if (active) ensureSet(orgSupervisorsMap, orgId).add(em);
        upsertAssignment({
          orgId,
          email: em,
          name: s.fullName || s.name || '',
          role: s.role || 'Opiekun Naukowy Koła',
          roleLabel: s.role || 'Opiekun Naukowy Koła',
          sourceKey: 'supervisors',
          sourceLabel: 'Opiekun Naukowy',
          isActive: active,
          addedAt: s.startDate || '',
        });
      });
    }

    if (Array.isArray(settings.access_users)) {
      settings.access_users.forEach(u => {
        const em = String(u?.email || '').trim().toLowerCase();
        if (!em) return;
        const active = u?.active !== false && u?.isActive !== false && u?.status !== 'revoked' && u?.status !== 'blocked';
        if (active) ensureSet(orgAccessUsersMap, orgId).add(em);
        const isSuperadminGrant = u?.grantedBy === GLOBAL_SUPERADMIN_EMAIL || u?.source === 'superadmin';
        upsertAssignment({
          orgId,
          email: em,
          name: u.name || '',
          role: u.role || 'ADMIN',
          roleLabel: u.roleLabel || u.role || 'Ustawienia koła',
          sourceKey: isSuperadminGrant ? 'superadmin' : 'access_users',
          sourceLabel: isSuperadminGrant ? 'Nadane przez Superadmina' : 'Dodane w Ustawieniach koła',
          isActive: active,
          addedAt: u.addedAt || '',
        });
      });
    }
  });

  // B) board_terms
  (boardTermsRes?.data || []).forEach(b => {
    const orgId = normalizeOrgId(b.organization_id);
    const em = String(b.member_email || '').trim().toLowerCase();
    if (!em) return;
    const active = b.is_active !== false;
    if (active) ensureSet(orgBoardsMap, orgId).add(em);
    upsertAssignment({
      orgId,
      email: em,
      name: b.member_name || '',
      role: b.role_name || 'Zarząd Koła',
      roleLabel: b.role_name || 'Zarząd Koła',
      sourceKey: 'board_terms',
      sourceLabel: 'Zarząd Koła (board_terms)',
      isActive: active,
    });
  });

  // C) club_memberships & v_effective_access
  const relRows = [
    ...((membershipsRes?.data || []).map(r => ({ ...r, _fromView: false }))),
    ...((effRes?.data || []).map(r => ({ ...r, _fromView: true }))),
  ];

  relRows.forEach(r => {
    const orgId = normalizeOrgId(r.club_id);
    const em = String(r.email || '').trim().toLowerCase();
    if (!em || !orgId) return;
    const active = r.active !== false;
    const srcLabel =
      r.source === 'manual'
        ? 'Dodane w Ustawieniach (club_memberships)'
        : r.source === 'board_terms'
        ? 'Zarząd Koła (v_effective_access)'
        : r._fromView
        ? 'v_effective_access'
        : 'club_memberships';

    upsertAssignment({
      orgId,
      email: em,
      name: r.member_name || '',
      role: r.role || '',
      roleLabel: r.role_label || r.role || '',
      sourceKey: r._fromView ? 'v_effective_access' : 'club_memberships',
      sourceLabel: srcLabel,
      isActive: active,
    });
  });

  // Analiza spójności izolacji
  const pushAnomaly = (anomaly) => {
    if (!anomaly?.id || anomalies.some(a => a.id === anomaly.id)) return;
    anomalies.push(anomaly);
  };

  relRows.forEach(r => {
    const orgId = normalizeOrgId(r.club_id);
    const em = String(r.email || '').trim().toLowerCase();
    if (!em || !orgId) return;
    if (orgId === 'test' && r.active !== false) {
      pushAnomaly({
        id: `test_org_${em}`,
        severity: 'warning',
        orgId,
        email: em,
        title: `Wpis testowy w club_memberships (${em})`,
        description: `Konto ${em} ma aktywny rekord w nielive'owej organizacji "test". Warstwa logowania CRM odrzuca ten rekord automatycznie.`,
      });
    }
  });

  assignmentMap.forEach(item => {
    if (item.email === GLOBAL_SUPERADMIN_EMAIL) return;
    if (item.orgId === 'test') return;

    const inBoard = orgBoardsMap.get(item.orgId)?.has(item.email);
    const inSup = orgSupervisorsMap.get(item.orgId)?.has(item.email);
    const inExplicitAccess = orgAccessUsersMap.get(item.orgId)?.has(item.email);
    const isRevoked = orgRevokedMap.get(item.orgId)?.has(item.email) || item.isBlocked;

    if (!isRevoked && item.hasActiveSource && !inBoard && !inSup && !inExplicitAccess) {
      pushAnomaly({
        id: `orphan_${item.orgId}_${item.email}`,
        severity: 'high',
        orgId: item.orgId,
        email: item.email,
        title: `Sierocy dostęp w ${item.clubShortName}: ${item.email}`,
        description: `Użytkownik ma aktywny wpis w club_memberships/v_effective_access dla "${item.clubShortName}", mimo że nie figuruje w aktywnym Zarządzie, wśród Opiekunów ani w "Ustawienia i dostęp" tego koła. Możesz użyć Kill Switcha poniżej.`,
      });
    }

    if (isRevoked && (item.sources.includes('club_memberships') || item.sources.includes('v_effective_access'))) {
      pushAnomaly({
        id: `revoked_still_in_cm_${item.orgId}_${item.email}`,
        severity: 'info',
        orgId: item.orgId,
        email: item.email,
        title: `Zablokowane konto (${item.email}) wciąż istnieje w club_memberships`,
        description: `Dostęp w CRM dla ${item.clubShortName} jest zablokowany przez Kill Switch (revoked_access), ale rekord club_memberships wymaga uruchomienia migracji SQL dla usunięcia z widoku SQL.`,
      });
    }
  });

  // Grupowanie na macierz użytkowników + listę płaskich przypisań
  const assignments = Array.from(assignmentMap.values()).map(item => {
    const isProtectedSuperadmin = item.email === GLOBAL_SUPERADMIN_EMAIL;
    const status = isProtectedSuperadmin
      ? 'superadmin'
      : item.isBlocked || orgRevokedMap.get(item.orgId)?.has(item.email)
      ? 'blocked'
      : item.hasActiveSource
      ? 'active'
      : 'inactive';

    return {
      ...item,
      status,
      isProtectedSuperadmin,
      primaryRole: item.roleLabel || item.roles[0] || 'Dostęp CRM',
      primarySource: item.sourceLabels[0] || 'System',
    };
  });

  const userMap = new Map();
  // Zawsze dołącz głównego Superadmina na górę listy
  userMap.set(GLOBAL_SUPERADMIN_EMAIL, {
    email: GLOBAL_SUPERADMIN_EMAIL,
    name: memberByEmail.get(GLOBAL_SUPERADMIN_EMAIL)?.fullName || 'Tomasz Bratkowski',
    indexNumber: memberByEmail.get(GLOBAL_SUPERADMIN_EMAIL)?.indexNumber || '15998',
    isGlobalSuperadmin: true,
    clubs: activeClubIds.map(id => resolveClubMeta(id)),
    assignments: [],
    hasBlocked: false,
    hasActive: true,
  });

  assignments.forEach(a => {
    const existing = userMap.get(a.email) || {
      email: a.email,
      name: a.name || a.email.split('@')[0],
      indexNumber: a.indexNumber || '',
      isGlobalSuperadmin: a.email === GLOBAL_SUPERADMIN_EMAIL,
      clubs: [],
      assignments: [],
      hasBlocked: false,
      hasActive: false,
    };
    if (!existing.name || existing.name.includes('@')) {
      if (a.name) existing.name = a.name;
    }
    if (!existing.indexNumber && a.indexNumber) {
      existing.indexNumber = a.indexNumber;
    }
    existing.assignments.push(a);
    if (a.status === 'active' || a.status === 'superadmin') {
      existing.hasActive = true;
      if (!existing.clubs.some(c => c.orgId === a.orgId)) {
        existing.clubs.push(resolveClubMeta(a.orgId));
      }
    }
    if (a.status === 'blocked') {
      existing.hasBlocked = true;
    }
    userMap.set(a.email, existing);
  });

  const users = Array.from(userMap.values()).sort((a, b) => {
    if (a.isGlobalSuperadmin) return -1;
    if (b.isGlobalSuperadmin) return 1;
    if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
    return (a.name || a.email).localeCompare(b.name || b.email, 'pl');
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    users,
    assignments,
    anomalies,
    stats: {
      totalUsers: users.length,
      activeAssignments: assignments.filter(a => a.status === 'active' || a.status === 'superadmin').length,
      blockedAssignments: assignments.filter(a => a.status === 'blocked').length,
      anomalyCount: anomalies.length,
    },
  };
}

/**
 * Natychmiastowy Kill Switch Superadmina — odbiera dostęp konkretnego użytkownika do wskazanego koła.
 * Zapisuje blokadę w organization_settings.settings.revoked_access (chronionym per x-organization-id),
 * dezaktywuje wpisy w access_users / board / board_terms / club_memberships.
 */
export async function revokeUserClubAccess({ orgId, email, memberName = '', role = '', actorEmail }) {
  if (!isAllowedSuperadminActor(actorEmail)) {
    return { ok: false, error: SUPERADMIN_FORBIDDEN_ERROR };
  }
  const cleanOrg = normalizeOrgId(orgId);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanOrg || !cleanEmail) {
    return { ok: false, error: 'Brak wymaganego identyfikatora koła lub adresu e-mail.' };
  }
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    return { ok: false, error: 'Nie można odebrać dostępu głównemu kontu Superadministratora.' };
  }

  const orgClient = getSupabaseForOrg(cleanOrg);
  const nowIso = new Date().toISOString();

  // 1. Zaktualizuj organization_settings (revoked_access + usunięcie z access_users + dezaktywacja w board)
  const { data: existing, error: selErr } = await orgClient
    .from('organization_settings')
    .select('id, settings')
    .eq('organization_id', cleanOrg)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message || 'Błąd odczytu ustawień koła w Supabase.' };
  }

  const currentSettings = existing?.settings && typeof existing.settings === 'object' ? existing.settings : {};
  const prevRevoked = Array.isArray(currentSettings.revoked_access) ? currentSettings.revoked_access : [];
  const prevAccessUsers = Array.isArray(currentSettings.access_users) ? currentSettings.access_users : [];
  const prevBoard = Array.isArray(currentSettings.board) ? currentSettings.board : [];
  const prevSups = Array.isArray(currentSettings.supervisors) ? currentSettings.supervisors : [];

  const nextAccessUsers = prevAccessUsers.filter(u => String(u?.email || '').trim().toLowerCase() !== cleanEmail);
  const nextBoard = prevBoard.map(b => {
    const bEmail = String(b?.memberEmail || b?.email || '').trim().toLowerCase();
    return bEmail === cleanEmail ? { ...b, isActive: false, accessRevoked: true } : b;
  });
  const nextSups = prevSups.map(s => {
    const sEmail = String(s?.email || '').trim().toLowerCase();
    return sEmail === cleanEmail ? { ...s, isActive: false } : s;
  });

  const revocationEntry = {
    email: cleanEmail,
    memberName: memberName || cleanEmail.split('@')[0],
    previousRole: role || '',
    revokedAt: nowIso,
    revokedBy: GLOBAL_SUPERADMIN_EMAIL,
    active: false,
  };

  const nextRevoked = [
    ...prevRevoked.filter(item => String(typeof item === 'string' ? item : item?.email || '').trim().toLowerCase() !== cleanEmail),
    revocationEntry,
  ];

  const nextSettings = {
    ...currentSettings,
    access_users: nextAccessUsers,
    board: nextBoard,
    supervisors: nextSups,
    revoked_access: nextRevoked,
  };

  if (existing?.id) {
    const { error: updErr } = await orgClient
      .from('organization_settings')
      .update({ settings: nextSettings, updated_at: nowIso })
      .eq('id', existing.id);
    if (updErr) {
      return { ok: false, error: updErr.message || 'Nie udało się zapisać blokady dostępu w Supabase.' };
    }
  } else {
    const { error: insErr } = await orgClient
      .from('organization_settings')
      .insert({ organization_id: cleanOrg, settings: nextSettings, updated_at: nowIso });
    if (insErr) {
      return { ok: false, error: insErr.message || 'Nie udało się utworzyć wpisu blokady w Supabase.' };
    }
  }

  // 2. Próba aktualizacji board_terms i club_memberships (best-effort w zależności od uprawnień RLS)
  try {
    await orgClient
      .from('board_terms')
      .update({ is_active: false })
      .eq('organization_id', cleanOrg)
      .ilike('member_email', cleanEmail);
  } catch {}
  try {
    await orgClient
      .from('club_memberships')
      .update({ active: false })
      .eq('club_id', cleanOrg)
      .ilike('email', cleanEmail);
  } catch {}

  return { ok: true, orgId: cleanOrg, email: cleanEmail, revokedAt: nowIso };
}

/**
 * Przywraca dostęp użytkownika do koła z poziomu Panelu Superadmina.
 */
export async function restoreUserClubAccess({ orgId, email, memberName = '', role = 'ADMIN', roleLabel = '', actorEmail }) {
  if (!isAllowedSuperadminActor(actorEmail)) {
    return { ok: false, error: SUPERADMIN_FORBIDDEN_ERROR };
  }
  const cleanOrg = normalizeOrgId(orgId);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanOrg || !cleanEmail) {
    return { ok: false, error: 'Brak wymaganego identyfikatora koła lub adresu e-mail.' };
  }

  const orgClient = getSupabaseForOrg(cleanOrg);
  const nowIso = new Date().toISOString();

  const { data: existing, error: selErr } = await orgClient
    .from('organization_settings')
    .select('id, settings')
    .eq('organization_id', cleanOrg)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message || 'Błąd odczytu ustawień koła w Supabase.' };
  }

  const currentSettings = existing?.settings && typeof existing.settings === 'object' ? existing.settings : {};
  const prevRevoked = Array.isArray(currentSettings.revoked_access) ? currentSettings.revoked_access : [];
  const prevEntry = prevRevoked.find(item => String(typeof item === 'string' ? item : item?.email || '').trim().toLowerCase() === cleanEmail);
  const nextRevoked = prevRevoked.filter(item => String(typeof item === 'string' ? item : item?.email || '').trim().toLowerCase() !== cleanEmail);

  const prevAccessUsers = Array.isArray(currentSettings.access_users) ? currentSettings.access_users : [];
  const prevBoard = Array.isArray(currentSettings.board) ? currentSettings.board : [];
  const hasActiveBoard = prevBoard.some(b => String(b?.memberEmail || b?.email || '').trim().toLowerCase() === cleanEmail && b.isActive !== false && !b.accessRevoked);

  // Przywróć flagę w zarządzie jeśli wcześniej była wyłączona przez accessRevoked
  let restoredViaBoard = false;
  const nextBoard = prevBoard.map(b => {
    const bEmail = String(b?.memberEmail || b?.email || '').trim().toLowerCase();
    if (bEmail === cleanEmail && b.accessRevoked) {
      restoredViaBoard = true;
      return { ...b, isActive: true, accessRevoked: false };
    }
    return b;
  });

  // Jeśli użytkownik nie ma aktywnej funkcji w zarządzie ani nie jest już w access_users, dodaj jawne uprawnienie
  const normalizedRole = role && ['ADMIN', 'COORDINATOR', 'VIEWER'].includes(role) ? role : 'ADMIN';
  let nextAccessUsers = [...prevAccessUsers];
  if (!hasActiveBoard && !restoredViaBoard && !nextAccessUsers.some(u => String(u?.email || '').trim().toLowerCase() === cleanEmail)) {
    nextAccessUsers.push({
      id: `usr_sa_${Date.now()}`,
      name: memberName || (typeof prevEntry === 'object' ? prevEntry?.memberName : '') || cleanEmail.split('@')[0],
      email: cleanEmail,
      role: normalizedRole,
      roleLabel: roleLabel || (normalizedRole === 'VIEWER' ? 'Tylko odczyt' : normalizedRole === 'COORDINATOR' ? 'Dostęp zarządu' : 'Dostęp pełny koła'),
      addedAt: nowIso.slice(0, 10),
      grantedBy: GLOBAL_SUPERADMIN_EMAIL,
      source: 'superadmin',
      isPermanent: false,
    });
  }

  const nextSettings = {
    ...currentSettings,
    revoked_access: nextRevoked,
    board: nextBoard,
    access_users: nextAccessUsers,
  };

  if (existing?.id) {
    const { error: updErr } = await orgClient
      .from('organization_settings')
      .update({ settings: nextSettings, updated_at: nowIso })
      .eq('id', existing.id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insErr } = await orgClient
      .from('organization_settings')
      .insert({ organization_id: cleanOrg, settings: nextSettings, updated_at: nowIso });
    if (insErr) return { ok: false, error: insErr.message };
  }

  try {
    await orgClient
      .from('club_memberships')
      .update({ active: true })
      .eq('club_id', cleanOrg)
      .ilike('email', cleanEmail);
  } catch {}

  return { ok: true, orgId: cleanOrg, email: cleanEmail };
}
