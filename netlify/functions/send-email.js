/**
 * InvOps — Admin User Management Function
 * POST /.netlify/functions/admin-user
 *
 * Requires service role key (never put this in the browser).
 * Environment variables needed in Netlify:
 *   SUPABASE_URL               your project URL
 *   SUPABASE_SERVICE_ROLE_KEY  from Supabase → Settings → API → service_role
 *   SUPABASE_ANON_KEY          from Supabase → Settings → API → anon/public
 *
 * Body (JSON):
 *   action  — 'create' | 'update' | 'delete' | 'list'
 *   + action-specific fields (see below)
 *
 * All requests must include: Authorization: Bearer <access_token>
 * The caller must have role = 'admin' in the profiles table.
 */

const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function ok(data)  { return { statusCode: 200, headers: CORS, body: JSON.stringify(data) }; }
function err(code, msg) { return { statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return err(405, 'Method Not Allowed');

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return err(500, 'Supabase service role not configured');

  // ── Verify caller is authenticated ──
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return err(401, 'Missing Authorization header');

  const token = authHeader.slice(7);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return err(401, 'Invalid or expired token');

  // ── Verify caller is admin ──
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (!callerProfile || callerProfile.role !== 'admin') return err(403, 'Admin access required');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON body'); }

  const { action } = body;

  try {
    // ── LIST USERS ──────────────────────────────────────────────────────────
    if (action === 'list') {
      const { data: profiles, error: pErr } = await admin
        .from('profiles')
        .select('*')
        .order('created_at');
      if (pErr) return err(500, pErr.message);
      return ok({ users: profiles || [] });
    }

    // ── CREATE USER ─────────────────────────────────────────────────────────
    if (action === 'create') {
      const { email, password, name, role='staff', status='Active', department='', custom_perms=[] } = body;
      if (!email || !password || !name) return err(400, 'email, password and name are required');

      // Create auth user
      const { data: authData, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,          // skip email verification for admin-created users
        user_metadata: { name, role }
      });
      if (createErr) return err(400, createErr.message);

      // Upsert profile (trigger may have already created it)
      const { error: profErr } = await admin.from('profiles').upsert({
        id: authData.user.id,
        email,
        name,
        role,
        status,
        department: department || null,
        custom_perms
      });
      if (profErr) {
        // Try to clean up the auth user if profile failed
        await admin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        return err(500, profErr.message);
      }

      return ok({ userId: authData.user.id, email });
    }

    // ── UPDATE USER ─────────────────────────────────────────────────────────
    if (action === 'update') {
      const { userId, email, password, name, role, status, department, custom_perms } = body;
      if (!userId) return err(400, 'userId is required');

      // Update auth (email / password)
      const authUpdates = {};
      if (email)    authUpdates.email    = email;
      if (password) authUpdates.password = password;
      if (name)     authUpdates.user_metadata = { name, role };
      if (Object.keys(authUpdates).length) {
        const { error: upErr } = await admin.auth.admin.updateUserById(userId, authUpdates);
        if (upErr) return err(400, upErr.message);
      }

      // Update profile
      const profileUpdates = {};
      if (email        !== undefined) profileUpdates.email        = email;
      if (name         !== undefined) profileUpdates.name         = name;
      if (role         !== undefined) profileUpdates.role         = role;
      if (status       !== undefined) profileUpdates.status       = status;
      if (department   !== undefined) profileUpdates.department   = department;
      if (custom_perms !== undefined) profileUpdates.custom_perms = custom_perms;

      if (Object.keys(profileUpdates).length) {
        const { error: profErr } = await admin.from('profiles').update(profileUpdates).eq('id', userId);
        if (profErr) return err(500, profErr.message);
      }

      return ok({ success: true });
    }

    // ── DELETE USER ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { userId } = body;
      if (!userId) return err(400, 'userId is required');

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return err(400, delErr.message);
      return ok({ success: true });
    }

    return err(400, `Unknown action: ${action}`);

  } catch (e) {
    console.error('admin-user error:', e);
    return err(500, e.message);
  }
};
