import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '../../src/utils/crypto.js';

const GLOBAL_SUPERADMIN_EMAIL = 'atomekb73@gmail.com';
const STARTER_PASSWORD = process.env.CRM_STARTER_PASSWORD || 'Start2026!';
const PRODUCTION_CLUB_IDS = ['skn_seksuologii', 'uzaleznienia', 'psychoonkologia'];
const VALID_ROLES = ['superadmin', 'admin', 'user'];

function normalizeOrgId(raw) {
  if (!raw) return '';
  const cleaned = String(raw).trim().toLowerCase();
  if (!cleaned) return '';
  if (
    cleaned === 'skn-template' ||
    cleaned === 'default' ||
    cleaned === 'skn-seksuologia' ||
    cleaned === 'skn-seksuologii'
  ) {
    return 'skn_seksuologii';
  }
  if (
    cleaned === 'skn-uzaleznien' ||
    cleaned === 'skn-zachowan-ryzykownych' ||
    cleaned === 'skn-psychologii-zachowan-ryzykownych'
  ) {
    return 'uzaleznienia';
  }
  if (cleaned === 'skn-psychoonkologii') {
    return 'psychoonkologia';
  }
  return cleaned;
}

function normalizeRbacRole(rawRole, email = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return 'superadmin';
  const r = String(rawRole || '').trim().toLowerCase();
  if (['admin', 'club_admin', 'board', 'zarzad', 'coordinator'].includes(r)) {
    return 'admin';
  }
  return 'user';
}

function sanitizeClubs(rawClubs, email = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) {
    return ['*'];
  }
  const list = Array.isArray(rawClubs) ? rawClubs : [];
  const valid = new Set();
  for (const club of list) {
    const norm = normalizeOrgId(club);
    if (norm && norm !== 'test' && norm !== '*' && PRODUCTION_CLUB_IDS.includes(norm)) {
      valid.add(norm);
    }
  }
  return Array.from(valid);
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Actor-Email, X-Admin-Email'
  );
  res.setHeader('Cache-Control', 'no-store');
}

function getSupabaseClients() {
  const url = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || (!serviceKey && !anonKey)) {
    return { adminClient: null, anonClient: null, hasServiceRole: false };
  }

  const adminClient = serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const anonClient = anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  return { adminClient, anonClient, hasServiceRole: Boolean(serviceKey) };
}

async function authorizeSuperadmin(req, client) {
  const authHeader = String(req.headers?.authorization || '').trim();
  const actorHeader = String(
    req.headers?.['x-actor-email'] || req.headers?.['x-admin-email'] || ''
  )
    .trim()
    .toLowerCase();

  if (authHeader.toLowerCase().startsWith('bearer ') && client) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const { data, error } = await client.auth.getUser(token);
        if (error || !data?.user?.email) {
          return { ok: false, status: 401, error: 'Nieprawidłowy token sesji administratora.' };
        }
        const jwtEmail = data.user.email.trim().toLowerCase();
        if (jwtEmail !== GLOBAL_SUPERADMIN_EMAIL) {
          return {
            ok: false,
            status: 403,
            error: 'Brak uprawnień: Panel Administratora RBAC jest dostępny wyłącznie dla atomekb73@gmail.com.',
          };
        }
        return { ok: true, email: jwtEmail };
      } catch {
        return { ok: false, status: 401, error: 'Błąd weryfikacji sesji.' };
      }
    }
  }

  if (actorHeader !== GLOBAL_SUPERADMIN_EMAIL) {
    return {
      ok: false,
      status: 403,
      error: 'Brak uprawnień: wymagane konto Superadministratora (atomekb73@gmail.com).',
    };
  }

  return { ok: true, email: actorHeader };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

async function syncMembershipAndSettings(client, { email, name, role, clubs, isActive, resetStarterPassword }) {
  if (!client || !email) return;
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === GLOBAL_SUPERADMIN_EMAIL) return;

  const isClubAdmin = role === 'admin';
  const legacyRole = isClubAdmin ? 'CLUB_ADMIN' : 'VIEWER';
  const legacyRoleLabel = isClubAdmin ? 'Administrator koła' : 'Użytkownik koła';

  // 1. Synchronizacja club_memberships dla wszystkich kół produkcyjnych
  for (const clubId of PRODUCTION_CLUB_IDS) {
    const assigned = clubs.includes(clubId);
    const shouldBeActive = Boolean(isActive && assigned);

    const { data: existingRows } = await client
      .from('club_memberships')
      .select('id, active')
      .eq('club_id', clubId)
      .ilike('email', cleanEmail)
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      await client
        .from('club_memberships')
        .update({
          member_name: name || cleanEmail.split('@')[0],
          role: legacyRole,
          role_label: legacyRoleLabel,
          active: shouldBeActive,
          source: 'rbac_admin_panel',
          granted_by: GLOBAL_SUPERADMIN_EMAIL,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRows[0].id);
    } else if (assigned && isActive) {
      await client.from('club_memberships').insert({
        club_id: clubId,
        email: cleanEmail,
        member_name: name || cleanEmail.split('@')[0],
        role: legacyRole,
        role_label: legacyRoleLabel,
        source: 'rbac_admin_panel',
        active: true,
        granted_by: GLOBAL_SUPERADMIN_EMAIL,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 2. Synchronizacja organization_settings (access_users, user_first_login_status, user_passwords)
  for (const clubId of PRODUCTION_CLUB_IDS) {
    const assigned = clubs.includes(clubId);
    const { data: settingsRows } = await client
      .from('organization_settings')
      .select('id, settings_key, settings_value')
      .eq('organization_id', clubId)
      .in('settings_key', ['access_users', 'user_first_login_status', 'user_passwords']);

    const byKey = {};
    for (const row of settingsRows || []) {
      byKey[row.settings_key] = row;
    }

    // access_users
    const existingAccess = Array.isArray(byKey.access_users?.settings_value)
      ? byKey.access_users.settings_value
      : [];
    const filteredAccess = existingAccess.filter(
      (u) => String(u?.email || '').trim().toLowerCase() !== cleanEmail
    );
    if (assigned && isActive) {
      filteredAccess.push({
        id: cleanEmail,
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        role: isClubAdmin ? 'Administrator koła' : 'Członek zarządu (Odczyt)',
        role_code: isClubAdmin ? 'CLUB_ADMIN' : 'VIEWER',
        rbacRole: role,
        addedAt: new Date().toISOString(),
      });
    }
    if (assigned || existingAccess.length !== filteredAccess.length) {
      await client.from('organization_settings').upsert(
        {
          id: `${clubId}__access_users`,
          organization_id: clubId,
          settings_key: 'access_users',
          settings_value: filteredAccess,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,settings_key' }
      );
    }

    // user_first_login_status & user_passwords przy tworzeniu / resecie hasła
    if (resetStarterPassword && assigned) {
      const flMap = { ...(byKey.user_first_login_status?.settings_value || {}) };
      flMap[cleanEmail] = true;
      await client.from('organization_settings').upsert(
        {
          id: `${clubId}__user_first_login_status`,
          organization_id: clubId,
          settings_key: 'user_first_login_status',
          settings_value: flMap,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,settings_key' }
      );

      const pwdMap = { ...(byKey.user_passwords?.settings_value || {}) };
      delete pwdMap[cleanEmail];
      await client.from('organization_settings').upsert(
        {
          id: `${clubId}__user_passwords`,
          organization_id: clubId,
          settings_key: 'user_passwords',
          settings_value: pwdMap,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,settings_key' }
      );
    }
  }
}

async function listUsers(client, hasServiceRole) {
  let dbTablesReady = true;
  const usersMap = new Map();

  // 1. Pobierz z user_profiles + user_organization_access (jeśli migracja została uruchomiona)
  const { data: profiles, error: profilesError } = await client
    .from('user_profiles')
    .select('id, auth_user_id, email, name, role, must_change_password, is_active, created_at, updated_at, last_login_at')
    .order('created_at', { ascending: true });

  if (profilesError) {
    dbTablesReady = false;
  } else {
    const { data: orgAccess } = await client
      .from('user_organization_access')
      .select('user_id, organization_id, role');

    const clubsByUserId = new Map();
    for (const row of orgAccess || []) {
      const uid = row.user_id;
      const orgId = row.organization_id === '*' ? '*' : normalizeOrgId(row.organization_id);
      if (!orgId || orgId === 'test') continue;
      if (!clubsByUserId.has(uid)) clubsByUserId.set(uid, new Set());
      clubsByUserId.get(uid).add(orgId);
    }

    for (const p of profiles || []) {
      const email = String(p.email || '').trim().toLowerCase();
      if (!email) continue;
      const isProtected = email === GLOBAL_SUPERADMIN_EMAIL;
      const rawClubs = Array.from(clubsByUserId.get(p.id) || []);
      const clubs = isProtected
        ? ['*']
        : rawClubs.filter((c) => PRODUCTION_CLUB_IDS.includes(c));

      usersMap.set(email, {
        id: p.id,
        authUserId: p.auth_user_id || null,
        email,
        name: p.name || (isProtected ? 'Tomasz Bratkowski (Superadmin)' : email.split('@')[0]),
        role: isProtected ? 'superadmin' : normalizeRbacRole(p.role, email),
        mustChangePassword: isProtected ? false : Boolean(p.must_change_password),
        isActive: isProtected ? true : p.is_active !== false,
        clubs,
        isProtected,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        lastLoginAt: p.last_login_at,
        source: 'user_profiles',
      });
    }
  }

  // 2. Uzupełnij o aktywnych użytkowników z club_memberships oraz organization_settings
  const { data: memberships } = await client
    .from('club_memberships')
    .select('id, club_id, email, member_name, role, active, updated_at');

  for (const m of memberships || []) {
    const email = String(m.email || '').trim().toLowerCase();
    const clubId = normalizeOrgId(m.club_id);
    if (!email || !clubId || clubId === 'test') continue;
    if (clubId === '*' && email !== GLOBAL_SUPERADMIN_EMAIL) continue;

    if (!usersMap.has(email)) {
      const isProtected = email === GLOBAL_SUPERADMIN_EMAIL;
      usersMap.set(email, {
        id: m.id,
        authUserId: null,
        email,
        name: m.member_name || email.split('@')[0],
        role: isProtected ? 'superadmin' : normalizeRbacRole(m.role, email),
        mustChangePassword: false,
        isActive: isProtected ? true : Boolean(m.active),
        clubs: isProtected ? ['*'] : m.active && PRODUCTION_CLUB_IDS.includes(clubId) ? [clubId] : [],
        isProtected,
        createdAt: null,
        updatedAt: m.updated_at,
        lastLoginAt: null,
        source: 'club_memberships',
      });
    } else {
      const existing = usersMap.get(email);
      if (!existing.isProtected && m.active && PRODUCTION_CLUB_IDS.includes(clubId) && !existing.clubs.includes(clubId)) {
        existing.clubs.push(clubId);
      }
    }
  }

  // Zagwarantuj obecność chronionego konta Superadministratora
  if (!usersMap.has(GLOBAL_SUPERADMIN_EMAIL)) {
    usersMap.set(GLOBAL_SUPERADMIN_EMAIL, {
      id: 'superadmin-root',
      authUserId: null,
      email: GLOBAL_SUPERADMIN_EMAIL,
      name: 'Tomasz Bratkowski (Superadmin)',
      role: 'superadmin',
      mustChangePassword: false,
      isActive: true,
      clubs: ['*'],
      isProtected: true,
      createdAt: null,
      updatedAt: null,
      lastLoginAt: null,
      source: 'system_root',
    });
  }

  const users = Array.from(usersMap.values()).sort((a, b) => {
    if (a.isProtected && !b.isProtected) return -1;
    if (!a.isProtected && b.isProtected) return 1;
    return a.email.localeCompare(b.email, 'pl');
  });

  return { users, dbTablesReady, serviceRoleConfigured: hasServiceRole };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { adminClient, anonClient, hasServiceRole } = getSupabaseClients();
  const db = adminClient || anonClient;

  if (!db) {
    return res.status(500).json({ error: 'Brak konfiguracji Supabase po stronie serwera.' });
  }

  const authCheck = await authorizeSuperadmin(req, adminClient || anonClient);
  if (!authCheck.ok) {
    return res.status(authCheck.status).json({ error: authCheck.error });
  }

  try {
    if (req.method === 'GET') {
      const result = await listUsers(db, hasServiceRole);
      return res.status(200).json(result);
    }

    const body = parseBody(req);

    if (req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim() || email.split('@')[0];
      const requestedRole = String(body.role || '').trim().toLowerCase();
      const role = normalizeRbacRole(body.role, email);
      const clubs = sanitizeClubs(body.clubs, email);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Podaj prawidłowy adres e-mail użytkownika.' });
      }
      if (email === GLOBAL_SUPERADMIN_EMAIL) {
        return res.status(400).json({ error: 'Konto Superadministratora już istnieje i jest chronione.' });
      }
      if (requestedRole === 'superadmin' || requestedRole === 'super_admin' || !VALID_ROLES.includes(role) || role === 'superadmin') {
        return res.status(400).json({ error: 'Nieprawidłowa rola. Rola Super Admin jest zastrzeżona — wybierz Admin lub User.' });
      }
      if (clubs.length === 0) {
        return res.status(400).json({ error: 'Przypisz użytkownikowi co najmniej jedno koło naukowe.' });
      }

      const starterHash = await hashPassword(STARTER_PASSWORD, email);
      let authUserId = null;

      if (adminClient) {
        const { data: createdAuth, error: authError } = await adminClient.auth.admin.createUser({
          email,
          password: STARTER_PASSWORD,
          email_confirm: true,
          user_metadata: { name, role, must_change_password: true },
        });
        if (!authError && createdAuth?.user?.id) {
          authUserId = createdAuth.user.id;
        } else if (authError && /already|exists|registered/i.test(authError.message || '')) {
          const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          const matched = (listData?.users || []).find(
            (u) => String(u.email || '').toLowerCase() === email
          );
          if (matched?.id) {
            authUserId = matched.id;
            await adminClient.auth.admin.updateUserById(authUserId, {
              password: STARTER_PASSWORD,
              ban_duration: 'none',
              user_metadata: { name, role, must_change_password: true },
            });
          }
        }
      }

      const { data: profile, error: upsertErr } = await db
        .from('user_profiles')
        .upsert(
          {
            ...(authUserId ? { auth_user_id: authUserId } : {}),
            email,
            name,
            role,
            password_hash: starterHash,
            must_change_password: true,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        )
        .select('id, email, name, role, must_change_password, is_active')
        .single();

      if (upsertErr && upsertErr.code !== 'PGRST205') {
        return res.status(500).json({
          error: `Błąd zapisu profilu w bazie: ${upsertErr.message}`,
          requiresServiceRole: !hasServiceRole,
        });
      }

      if (profile?.id) {
        await db.from('user_organization_access').delete().eq('user_id', profile.id);
        await db.from('user_organization_access').insert(
          clubs.map((orgId) => ({
            user_id: profile.id,
            organization_id: orgId,
            role,
          }))
        );
      }

      await syncMembershipAndSettings(db, {
        email,
        name,
        role,
        clubs,
        isActive: true,
        resetStarterPassword: true,
      });

      const listResult = await listUsers(db, hasServiceRole);
      return res.status(201).json({
        success: true,
        starterPassword: STARTER_PASSWORD,
        user: listResult.users.find((u) => u.email === email) || {
          email,
          name,
          role,
          clubs,
          mustChangePassword: true,
          isActive: true,
        },
        users: listResult.users,
      });
    }

    if (req.method === 'PUT') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: 'Brak adresu e-mail użytkownika.' });
      }
      if (email === GLOBAL_SUPERADMIN_EMAIL) {
        return res.status(403).json({
          error: 'Konto Superadministratora (atomekb73@gmail.com) jest chronione przed edycją roli, blokadą i resetem.',
        });
      }

      const action = String(body.action || 'update').trim().toLowerCase();

      const { data: existingProfile } = await db
        .from('user_profiles')
        .select('id, auth_user_id, email, name, role, is_active')
        .ilike('email', email)
        .maybeSingle();

      if (action === 'reset_password') {
        const starterHash = await hashPassword(STARTER_PASSWORD, email);
        if (adminClient && existingProfile?.auth_user_id) {
          await adminClient.auth.admin.updateUserById(existingProfile.auth_user_id, {
            password: STARTER_PASSWORD,
            user_metadata: {
              name: existingProfile.name,
              role: existingProfile.role,
              must_change_password: true,
            },
          });
        }
        if (existingProfile?.id) {
          await db
            .from('user_profiles')
            .update({
              password_hash: starterHash,
              must_change_password: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingProfile.id);
        }

        // Wyzeruj hasło i przywróć wymuszenie zmiany w organization_settings
        for (const clubId of PRODUCTION_CLUB_IDS) {
          const { data: settingsRows } = await db
            .from('organization_settings')
            .select('settings_key, settings_value')
            .eq('organization_id', clubId)
            .in('settings_key', ['user_first_login_status', 'user_passwords']);

          const byKey = {};
          for (const row of settingsRows || []) byKey[row.settings_key] = row.settings_value;

          const flMap = { ...(byKey.user_first_login_status || {}), [email]: true };
          await db.from('organization_settings').upsert(
            {
              id: `${clubId}__user_first_login_status`,
              organization_id: clubId,
              settings_key: 'user_first_login_status',
              settings_value: flMap,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id,settings_key' }
          );

          if (byKey.user_passwords && byKey.user_passwords[email]) {
            const pwdMap = { ...byKey.user_passwords };
            delete pwdMap[email];
            await db.from('organization_settings').upsert(
              {
                id: `${clubId}__user_passwords`,
                organization_id: clubId,
                settings_key: 'user_passwords',
                settings_value: pwdMap,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'organization_id,settings_key' }
            );
          }
        }

        const listResult = await listUsers(db, hasServiceRole);
        return res.status(200).json({
          success: true,
          message: `Hasło dla ${email} zostało zresetowane do hasła startowego.`,
          users: listResult.users,
        });
      }

      if (action === 'toggle_active') {
        const nextActive = Boolean(body.isActive);
        if (adminClient && existingProfile?.auth_user_id) {
          await adminClient.auth.admin.updateUserById(existingProfile.auth_user_id, {
            ban_duration: nextActive ? 'none' : '876000h',
          });
        }
        if (existingProfile?.id) {
          await db
            .from('user_profiles')
            .update({ is_active: nextActive, updated_at: new Date().toISOString() })
            .eq('id', existingProfile.id);
        }
        await db
          .from('club_memberships')
          .update({ active: nextActive, updated_at: new Date().toISOString() })
          .ilike('email', email);

        const listResult = await listUsers(db, hasServiceRole);
        return res.status(200).json({ success: true, users: listResult.users });
      }

      // Standardowa edycja: name, role, clubs
      const name = String(body.name || existingProfile?.name || email.split('@')[0]).trim();
      const requestedRole = String(body.role || '').trim().toLowerCase();
      const role = normalizeRbacRole(body.role || existingProfile?.role, email);
      const clubs = sanitizeClubs(body.clubs, email);

      if (requestedRole === 'superadmin' || requestedRole === 'super_admin' || role === 'superadmin') {
        return res.status(400).json({ error: 'Rola Super Admin jest zastrzeżona.' });
      }
      if (clubs.length === 0) {
        return res.status(400).json({ error: 'Użytkownik musi być przypisany do co najmniej jednego koła.' });
      }

      const isActive = body.isActive !== undefined ? Boolean(body.isActive) : existingProfile?.is_active !== false;

      if (existingProfile?.id) {
        await db
          .from('user_profiles')
          .update({ name, role, is_active: isActive, updated_at: new Date().toISOString() })
          .eq('id', existingProfile.id);

        await db.from('user_organization_access').delete().eq('user_id', existingProfile.id);
        await db.from('user_organization_access').insert(
          clubs.map((orgId) => ({
            user_id: existingProfile.id,
            organization_id: orgId,
            role,
          }))
        );
      } else {
        const { data: created } = await db
          .from('user_profiles')
          .upsert(
            {
              email,
              name,
              role,
              must_change_password: false,
              is_active: isActive,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'email' }
          )
          .select('id')
          .maybeSingle();

        if (created?.id) {
          await db.from('user_organization_access').delete().eq('user_id', created.id);
          await db.from('user_organization_access').insert(
            clubs.map((orgId) => ({
              user_id: created.id,
              organization_id: orgId,
              role,
            }))
          );
        }
      }

      await syncMembershipAndSettings(db, {
        email,
        name,
        role,
        clubs,
        isActive,
        resetStarterPassword: false,
      });

      const listResult = await listUsers(db, hasServiceRole);
      return res.status(200).json({ success: true, users: listResult.users });
    }

    if (req.method === 'DELETE') {
      const email = String(body.email || req.query?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: 'Brak adresu e-mail użytkownika do usunięcia.' });
      }
      if (email === GLOBAL_SUPERADMIN_EMAIL) {
        return res.status(403).json({
          error: 'Konto Superadministratora (atomekb73@gmail.com) jest chronione i nie może zostać usunięte.',
        });
      }

      const { data: existingProfile } = await db
        .from('user_profiles')
        .select('id, auth_user_id')
        .ilike('email', email)
        .maybeSingle();

      if (adminClient && existingProfile?.auth_user_id) {
        await adminClient.auth.admin.deleteUser(existingProfile.auth_user_id);
      }
      if (existingProfile?.id) {
        await db.from('user_organization_access').delete().eq('user_id', existingProfile.id);
        await db.from('user_profiles').delete().eq('id', existingProfile.id);
      }

      await syncMembershipAndSettings(db, {
        email,
        name: '',
        role: 'user',
        clubs: [],
        isActive: false,
        resetStarterPassword: false,
      });

      const listResult = await listUsers(db, hasServiceRole);
      return res.status(200).json({ success: true, users: listResult.users });
    }

    return res.status(405).json({ error: `Metoda ${req.method} nie jest obsługiwana.` });
  } catch (err) {
    console.error('[api/admin/users] Error:', err);
    return res.status(500).json({
      error: err?.message || 'Wewnętrzny błąd serwera podczas zarządzania kontami.',
    });
  }
}
