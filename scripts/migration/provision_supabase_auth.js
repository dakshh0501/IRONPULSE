// ============================================================================
// IRONPULSE — STEP 6C: SUPABASE AUTH PROVISIONER (EXECUTION-READY)
// ----------------------------------------------------------------------------
// Creates EXACTLY the approved Supabase Auth users:
//   - 22 normal users (recovery/verification flow)
//   - 3 rejected users (create + ban — approved disabled/banned semantics)
// per docs/SUPABASE_AUTH_PROVISIONING_PLAN.md (approved 2026-08-14,
// duplicate-email decisions G1/G2/G3 approved) and
// docs/SUPABASE_AUTH_DUPLICATE_EMAIL_DECISIONS.md.
//
// BAN FIX (6C-FIX, 2026-08-14): the previous raw endpoint
//   PUT /auth/v1/admin/users/{id}/ban            → HTTP 404
// is replaced with the supported Supabase Admin SDK method:
//   supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })
// (wire-equivalent: PUT /auth/v1/admin/users/{id} with { ban_duration }).
// After every ban (create-banned or resume-'ban'), the user is re-fetched
// via getUserById and the ban state is VERIFIED (banned_until in the future).
// Idempotent resume: existing users with matching firebase_uid metadata are
// never re-created — a rejected user that exists but is not yet banned is
// simply banned in place (status 'ban').
//
// RECOVERY FIX (6C-FIX2, 2026-08-14): user CREATION is fully separated from
// recovery-email DELIVERY. A created user is NEVER rolled back because
// recovery delivery failed. Recovery-delivery failure is classified
// RECOVERY_DELIVERY_FAILED (recovery:'delivery-failed') and the run
// continues. This fixes the observed production failure for A4EI9QVE
// (trainer@gym.com): user creation succeeded, but GoTrue's mailer-side
// validation (internal/mailer/validateclient → ErrorCodeEmailAddressInvalid,
// "Email address %q is invalid"; Supabase: example/test domains are not
// supported) rejected the address at the /auth/v1/recover endpoint.
// An email rejected at CREATION time is classified MANUAL_REVIEW (no user
// created, no fabricated address) and the run continues. Never deletes,
// never overwrites unrelated fields, creation stays idempotent.
//
// SOURCE (read-only): Firebase `users` + `gyms` collections (Firebase CLI
// refresh token, same pattern as dry_run_import.js).
// TARGET (writes): Supabase GoTrue Admin API only.
//
// SAFETY:
//   - Requires SUPABASE_URL + SUPABASE_SECRET_KEY at runtime (env only).
//   - Refuses publishable keys. Never logs credentials/bodies/passwords;
//     emails are masked in console output and manifests.
//   - Pre-flight: URL sanity, credential check, full existing-user listing,
//     per-email conflict detection. ANY conflict => STOP before any create.
//   - Idempotent: existing user with matching firebase_uid metadata => skip
//     (or ban-in-place for rejected). Never deletes. Never overwrites
//     unrelated metadata (ban update touches ban_duration only).
//   - Temporary passwords generated in memory only, never stored/logged.
//   - Firebase password hashes/salts are NEVER migrated.
//   - firebase_uid preserved in user_metadata (and later profiles.firebase_uid);
//     the Firebase UID is NEVER used as auth.users.id.
//   - No recovery links for banned/rejected users.
//   - Fail-fast ONLY on hard create/ban/verify errors; recovery-delivery
//     failures and manual-review classifications never stop the run.
//   - --dry-run performs read-only remote checks and creates ZERO users.
//   - --fixture-test runs a LOCAL in-memory test of the ban/recovery/
//     idempotency logic (no network, no env credentials, zero remote writes).
//   - --resend-recovery (with --yes) re-attempts recovery delivery for
//     existing-correct normal users (skip entries); never bans/unbans,
//     never creates or deletes anything.
//   - --yes required for real execution.
//
// Usage:
//   node scripts/migration/provision_supabase_auth.js --fixture-test
//   node scripts/migration/provision_supabase_auth.js --dry-run
//   node scripts/migration/provision_supabase_auth.js --yes [--resend-recovery] [--canonical-uid <uid>] [--project <fb-project>]
//
// Env:
//   SUPABASE_URL           https://<ref>.supabase.co            (required)
//   SUPABASE_SECRET_KEY    service_role key (server-side only)   (required)
//   SUPABASE_EXPECTED_REF  expected project ref                  (optional)
//   SEND_RECOVERY          'false' to skip recovery emails       (optional, default true)
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const BAN_DURATION = '876000h';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'migration-output', 'summaries');

if (process.env.FIREBASE_EMULATOR) {
  console.error('REFUSING TO RUN: FIREBASE_EMULATOR set. This tool targets production projects only.');
  process.exit(3);
}

// ---------------------------------------------------------------------------
// Firebase read-only access (source of truth for identities)
// ---------------------------------------------------------------------------
function loadToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN) return process.env.FIREBASE_ACCESS_TOKEN;
  if (process.env.FIREBASE_TOKEN) return process.env.FIREBASE_TOKEN;
  const cfg = JSON.parse(readFileSync(join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
  return cfg.tokens && cfg.tokens.refresh_token;
}

async function getAccessToken() {
  const candidate = loadToken();
  if (candidate.startsWith('ya29.')) return candidate;
  const form = new URLSearchParams();
  form.set('refresh_token', candidate);
  form.set('client_id', '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com');
  form.set('client_secret', 'j9iVZfS8kkCEFUPaAeJV0sAi');
  form.set('grant_type', 'refresh_token');
  const res = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`token exchange failed: ${res.status}`);
  return body.access_token;
}

function convValue(f) {
  if (f == null) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('referenceValue' in f) return f.referenceValue;
  if ('arrayValue' in f) return (f.arrayValue?.values || []).map(convValue);
  if ('mapValue' in f) return convFields(f.mapValue?.fields || {});
  if ('bytesValue' in f) return '<bytes>';
  return '<unknown>';
}
function convFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = convValue(v);
  return out;
}

async function listDocs(access, project, col) {
  const out = [];
  let token = '';
  for (let i = 0; i < 100; i++) {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${col}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
    const body = await res.json();
    if (body.error) throw new Error(`${col}: ${body.error.code} ${body.error.message}`);
    for (const d of body.documents || []) out.push({ id: d.name.split('/').pop(), fields: convFields(d.fields) });
    token = body.nextPageToken;
    if (!token) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Masking (manifest is non-sensitive)
// ---------------------------------------------------------------------------
function maskEmail(e) {
  if (e == null || typeof e !== 'string') return '(missing)';
  const at = e.indexOf('@');
  if (at <= 0) return '(invalid)';
  return `${e[0]}***${e.slice(at)}`;
}
const maskUid = (u) => (u ? u.slice(0, 8) : '(none)');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Mask any email-like string inside arbitrary error text (console + manifest).
const maskText = (t) => (t || '').replace(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m));

// GoTrue rejects addresses at EMAIL-SEND time (internal/mailer/validateclient
// → ErrorCodeEmailAddressInvalid "Email address %q is invalid" — Supabase
// documents this as: example/test domains are not supported) and at
// format-validation time (checkmail → "Unable to validate email address: …").
function classifyEmailError(msg) {
  const m = String(msg || '');
  if (/unable to validate email address/i.test(m)) return 'invalid-email';
  if (/email address .{0,60}(is invalid|not valid|not a valid|unsupported)/i.test(m)) return 'invalid-email';
  return null;
}

// ---------------------------------------------------------------------------
// Supabase GoTrue Admin API client (server-side only)
// ---------------------------------------------------------------------------
class GoTrueAdmin {
  constructor(baseUrl, secretKey) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.secret = secretKey;
    this.supabase = createClient(baseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async call(path, method = 'GET', body) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        apikey: this.secret,
        authorization: `Bearer ${this.secret}`,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const msg = json && json.msg ? json.msg : json && json.error_description ? json.error_description : `HTTP ${res.status}`;
      throw new Error(`${path}: ${msg}`);
    }
    return json;
  }
  health() { return this.call('/auth/v1/health'); }
  async listAllUsers() {
    const users = [];
    for (let page = 1; page <= 100; page++) {
      const body = await this.call(`/auth/v1/admin/users?per_page=200&page=${page}`);
      const list = (body && body.users) || [];
      users.push(...list);
      if (list.length < 200) break;
    }
    return users;
  }
  createUser({ email, password, emailConfirm, metadata }) {
    const payload = { email, email_confirm: emailConfirm, user_metadata: metadata };
    if (password) payload.password = password;
    return this.call('/auth/v1/admin/users', 'POST', payload);
  }
  // Supported Supabase Admin SDK method (fix for the raw /ban 404):
  // supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  async banUser(id) {
    const { data, error } = await this.supabase.auth.admin.updateUserById(id, { ban_duration: BAN_DURATION });
    if (error) throw new Error(`updateUserById ban: ${error.message}`);
    return data;
  }
  async getUser(id) {
    const { data, error } = await this.supabase.auth.admin.getUserById(id);
    if (error) throw new Error(`getUserById: ${error.message}`);
    return data ? data.user : null;
  }
  // Verify ban state via banned_until (exposed by the SDK's user object).
  async isUserBanned(id) {
    const user = await this.getUser(id);
    if (!user || !user.banned_until) return false;
    const t = Date.parse(user.banned_until);
    return !Number.isNaN(t) && t > Date.now();
  }
  sendRecovery(email) {
    return this.call('/auth/v1/recover', 'POST', { email });
  }
}

// ---------------------------------------------------------------------------
// Approved classification (mirrors Step 6A/6B; drift detection built in)
// ---------------------------------------------------------------------------
const APPROVED_GROUP_SHAPE = [
  { size: 5, roles: ['gym_owner_pending', 'gym_owner_pending', 'gym_owner_pending', 'gym_owner_pending', 'rejected'] },
  { size: 4, roles: ['rejected', 'rejected', 'rejected', 'rejected'] },
  { size: 2, roles: ['gym_owner_pending', 'rejected'] },
];

function classify(users, gyms) {
  const gymsById = new Map(gyms.map((g) => [g.id, g]));
  const ownerGyms = new Map();
  for (const g of gyms) {
    if (g.fields.ownerUid == null) continue;
    const k = String(g.fields.ownerUid);
    ownerGyms.set(k, [...(ownerGyms.get(k) || []), g]);
  }

  const recs = [];
  for (const u of users) {
    const f = u.fields;
    const emailRaw = f.email != null ? String(f.email).trim() : '';
    const role = f.role != null ? String(f.role) : '';
    let gymId = f.gymId != null && gymsById.has(String(f.gymId)) ? String(f.gymId) : null;
    if (gymId == null) {
      const og = ownerGyms.get(u.id);
      if (og && og.length === 1) gymId = og[0].id;
    }
    recs.push({ uid: u.id, email: emailRaw.toLowerCase(), emailRaw, role, gymId, accountDisabled: f.accountDisabled === true });
  }

  const byEmail = new Map();
  for (const r of recs) {
    if (!r.email) continue;
    byEmail.set(r.email, [...(byEmail.get(r.email) || []), r]);
  }
  const groups = [...byEmail.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);

  if (groups.length !== APPROVED_GROUP_SHAPE.length) {
    throw new Error(`DRIFT: expected ${APPROVED_GROUP_SHAPE.length} duplicate-email groups, found ${groups.length}. Re-run Step 6B analysis.`);
  }
  for (let i = 0; i < groups.length; i++) {
    const shape = APPROVED_GROUP_SHAPE[i];
    if (groups[i].length !== shape.size) throw new Error(`DRIFT: group ${i + 1} size ${groups[i].length} != approved ${shape.size}.`);
    const roles = groups[i].map((r) => r.role).sort();
    const expect = [...shape.roles].sort();
    if (JSON.stringify(roles) !== JSON.stringify(expect)) throw new Error(`DRIFT: group ${i + 1} role mix changed. Re-run Step 6B analysis.`);
  }

  const g1 = groups.find((g) => g.length === 4 && g.every((r) => r.role === 'rejected'));
  const g2 = groups.find((g) => g.length === 5);
  const g3 = groups.find((g) => g.length === 2);

  const excluded = new Set([...g2.map((r) => r.uid), ...g3.map((r) => r.uid)]);
  const canonicalG1 = new Set(g1.map((r) => r.uid));

  return { recs, groups, g1, g2, g3, excluded, canonicalG1 };
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 16; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// ---------------------------------------------------------------------------
// Shared plan logic (used by real execution AND the local fixture test)
// ---------------------------------------------------------------------------
function computeApproved(recs, excluded, canonicalG1, canonicalUid) {
  return recs.filter((r) => !excluded.has(r.uid) && !(canonicalG1.has(r.uid) && r.uid !== canonicalUid));
}

// Plan statuses:
//   'create'  — no existing user; will create (+ban for rejected)
//   'ban'     — existing user WITH matching firebase_uid metadata, rejected,
//               but NOT yet banned → apply ban in place (NO create, NO duplicate)
//   'skip'    — existing user with matching metadata, already in correct state
//   'conflict'— existing user for this email without matching firebase_uid → STOP
function buildPlan(approved, existingByEmail) {
  const plan = [];
  let conflicts = 0;
  for (const r of approved) {
    const ex = existingByEmail.get(r.email.toLowerCase());
    let status = 'create';
    let reason = '';
    let targetUuid = null;
    if (ex) {
      if (ex.user_metadata && ex.user_metadata.firebase_uid === r.uid) {
        targetUuid = ex.id;
        if (r.role === 'rejected') {
          const banned = ex.banned_until != null && !Number.isNaN(Date.parse(ex.banned_until)) && Date.parse(ex.banned_until) > Date.now();
          status = banned ? 'skip' : 'ban';
          reason = banned ? 'existing-correct (matching firebase_uid, already banned)' : 'existing matching firebase_uid but NOT banned — apply approved ban in place (no create)';
        } else {
          status = 'skip';
          reason = 'existing-correct (matching firebase_uid metadata)';
        }
      } else {
        status = 'conflict';
        conflicts += 1;
        reason = 'existing Supabase user for this email without matching firebase_uid — will not overwrite';
      }
    }
    plan.push({
      uid: r.uid,
      uidMasked: maskUid(r.uid),
      email: r.email, // memory-only; never serialized
      emailMasked: maskEmail(r.email),
      role: r.role,
      gymId: r.gymId || null,
      provision: r.role === 'rejected' ? 'create-banned' : 'create',
      status,
      reason,
      targetUuid,
      recovery: null, // 'delivered' | 'delivery-failed' | 'skipped' — set at execution
      recoveryReason: null, // 'invalid-email' | 'other'
      recoveryError: null, // masked delivery error text
    });
  }
  return { plan, conflicts };
}

// Executes one plan step. NEVER deletes. NEVER overwrites unrelated metadata.
// Phases: create → (rejected: ban+verify | normal: recovery delivery).
//   - A created user is NEVER rolled back because recovery delivery failed.
//   - Recovery-delivery failure is classified RECOVERY_DELIVERY_FAILED
//     (recovery:'delivery-failed'); the run continues.
//   - An email rejected at CREATION time (email_address_invalid) → user is
//     NOT created and classified MANUAL_REVIEW (no fabricated address); the
//     run continues.
//   - Hard failures (create/ban/verify errors other than invalid-email) →
//     status 'error' (fail-fast handled by the caller).
async function executePlanStep(p, admin, opts) {
  if (p.status === 'ban') {
    try {
      await admin.banUser(p.targetUuid);
      const ok = await admin.isUserBanned(p.targetUuid);
      if (!ok) throw new Error('ban verification failed: banned_until not set/in future');
      p.status = 'banned';
    } catch (e) {
      p.status = 'error';
      p.reason = maskText(e.message);
    }
    return p;
  }
  if (p.status === 'skip') {
    // Resume-safe: existing-correct normal users are left untouched unless the
    // operator explicitly requests --resend-recovery (no creation, no ban).
    if (p.provision === 'create' && opts.resendRecovery && opts.sendRecovery) {
      try {
        await admin.sendRecovery(p.email);
        p.recovery = 'delivered';
      } catch (e) {
        p.recovery = 'delivery-failed';
        p.recoveryReason = classifyEmailError(e.message) || 'other';
        p.recoveryError = maskText(e.message);
      }
    }
    return p;
  }
  if (p.status !== 'create') return p; // conflict untouched

  // Phase 1 — creation (idempotent; the create response is the only write)
  const pw = generateTempPassword();
  let nu = null;
  try {
    nu = await admin.createUser({
      email: p.email,
      password: pw,
      emailConfirm: true,
      metadata: { firebase_uid: p.uid, role: p.role, gym_id: p.gymId || null, migration_run: opts.runId },
    });
  } catch (e) {
    if (classifyEmailError(e.message)) {
      p.status = 'manual-review';
      p.reason = 'email rejected by Supabase Auth at creation (email_address_invalid — test/unsupported domain). MANUAL REVIEW: no user created, no fabricated address.';
      return p;
    }
    p.status = 'error';
    p.reason = maskText(e.message);
    return p;
  }
  p.targetUuid = nu.id;

  // Phase 2a — rejected users: ban + verify. Recovery is NEVER attempted.
  if (p.provision === 'create-banned') {
    try {
      await admin.banUser(nu.id);
      const ok = await admin.isUserBanned(nu.id);
      if (!ok) throw new Error('ban verification failed: banned_until not set/in future');
      p.status = 'created-banned';
    } catch (e) {
      p.status = 'error';
      p.reason = maskText(e.message);
    }
    return p;
  }

  // Phase 2b — normal users: recovery delivery is NON-FATAL (user stays
  // created even when the provider rejects the address at send time).
  if (!opts.sendRecovery) {
    p.status = 'created';
    p.recovery = 'skipped';
    return p;
  }
  try {
    await admin.sendRecovery(p.email);
    p.status = 'created';
    p.recovery = 'delivered';
  } catch (e) {
    p.status = 'created';
    p.recovery = 'delivery-failed';
    p.recoveryReason = classifyEmailError(e.message) || 'other';
    p.recoveryError = maskText(e.message);
  }
  return p;
}

// ---------------------------------------------------------------------------
// LOCAL FIXTURE TEST (no network, no env credentials, zero remote writes)
// Covers: normal valid email · recovery-delivery failure after creation
//         (RECOVERY_DELIVERY_FAILED, no rollback, run continues) ·
//         rejected/banned user · existing user resume · conflict user ·
//         manual-review invalid email (no create, run continues) ·
//         ban verification · idempotency
// ---------------------------------------------------------------------------
async function runFixtureTest() {
  const mk = (id, email, role, gymId) => ({ id, fields: { email, role, gymId, accountDisabled: role === 'rejected' ? true : false } });
  const users = [
    mk('y9lt1eCEl2fztfRSI07TMZPwmSy1', 'platform@example.com', 'super_admin', null),
    ...['HoAU21xy3eSGuErZ6d8ZtMwCLKo1', 'Q85ZtPEgQKSfNLYnjYWBwiHqb6D3', 'SGWHqTsXHGMLbLts2rTVLYkCHtX2', 'VkmrgSZIOeXstCljf468sYLdLKn1', 'clwHQsB3kaVvAGl8MsxqOqfeUK63', 'et6MpYMBGrYN1ukFid49H3NQTQi1', 'hVBdS5aYrjTRSKdEu3WmlT4Zj8x1'].map((id, i) => mk(id, `owner${i}@gym.test`, 'gym_owner', `gym${i}`)),
    mk('bRKcg3fwPLACEHOLDER01', 'faker@mrworlds.com', 'gym_owner', 'deleted-ref'),
    mk('hxTWhdxQPLACEHOLDER01', 'paker@example.com', 'gym_owner_pending', null),
    ...Array.from({ length: 7 }, (_, i) => mk(`member${i}PLACEHOLDER01`, `member${i}@gym.test`, 'member', null)),
    mk('blockedMemberPLACEHOLDER01', 'blocked@gym.invalid', 'member', null),
    mk('fvPn9yyfPLACEHOLDER01', 'member@gym.com', 'member', null),
    mk('A4EI9QVEcYgZNIdTLK1gJPKoEzB3', 'trainer@gym.com', 'trainer', null),
    mk('trainer1PLACEHOLDER01', 'trainer1@gym.test', 'trainer', null),
    mk('trainer2PLACEHOLDER01', 'trainer2@gym.test', 'trainer', null),
    mk('ArlmC1TZ0ANhCHArNPJTk9YoIbL2', 'srej@example.com', 'rejected', 'gym-1786295772301-372804'),
    mk('JeFv6yMBaihoqWTbgAmJhma62al2', 'trej@example.com', 'rejected', 'ogE7fL9i14EcAXUdV7fI'),
    mk('TitV32lDaQV3Gi9pJEgrduUn8is2', 'gdup@example.com', 'rejected', 'default'),
    mk('A0kiygGnU8dSev0jZs4iJrrn3Fm1', 'gdup@example.com', 'rejected', 'default'),
    mk('JGQdw7v1aLavo7WsS2IgIzHncjO2', 'gdup@example.com', 'rejected', 'default'),
    mk('nx0Qunp43GPMv2s4PhnghQPHIWg2', 'gdup@example.com', 'rejected', 'default'),
    mk('37WD336cPLACEHOLDER01', 'hdup1@example.com', 'gym_owner_pending', 'default'),
    mk('hnfpV7jJPLACEHOLDER01', 'hdup1@example.com', 'gym_owner_pending', 'default'),
    mk('kh9tSKzDPLACEHOLDER01', 'hdup1@example.com', 'gym_owner_pending', 'default'),
    mk('mNBFFQUHPLACEHOLDER01', 'hdup1@example.com', 'gym_owner_pending', 'default'),
    mk('Y0BzZnBPPLACEHOLDER01', 'hdup1@example.com', 'rejected', 'default'),
    mk('ZofzD9RLPLACEHOLDER01', 'hdup2@example.com', 'gym_owner_pending', 'default'),
    mk('joShucWxPLACEHOLDER01', 'hdup2@example.com', 'rejected', 'default'),
  ];
  if (users.length !== 35) throw new Error(`fixture users=${users.length} != 35`);

  const gyms = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `gym${i}`, fields: { ownerUid: users[1 + i].id, status: 'active' } })),
    { id: 'gR1', fields: { ownerUid: 'TitV32lDaQV3Gi9pJEgrduUn8is2', approvalStatus: 'rejected' } },
    { id: 'gR2', fields: { ownerUid: 'A0kiygGnU8dSev0jZs4iJrrn3Fm1', approvalStatus: 'rejected' } },
    { id: 'gR3', fields: { ownerUid: 'JGQdw7v1aLavo7WsS2IgIzHncjO2', approvalStatus: 'rejected' } },
    { id: 'gR4', fields: { ownerUid: 'nx0Qunp43GPMv2s4PhnghQPHIWg2', approvalStatus: 'rejected' } },
    { id: 'gym-1786295772301-372804', fields: { ownerUid: 'ArlmC1TZ0ANhCHArNPJTk9YoIbL2', approvalStatus: 'rejected' } },
    { id: 'ogE7fL9i14EcAXUdV7fI', fields: { ownerUid: 'JeFv6yMBaihoqWTbgAmJhma62al2', approvalStatus: 'rejected' } },
    { id: 'orphan1', fields: { ownerUid: 'nobody1' } }, { id: 'orphan2', fields: { ownerUid: 'nobody2' } }, { id: 'orphan3', fields: { ownerUid: 'nobody3' } },
  ];
  if (gyms.length !== 16) throw new Error(`fixture gyms=${gyms.length} != 16`);

  // in-memory GoTrue stand-in (same interface as GoTrueAdmin; zero network)
  // Simulates GoTrue's mailer-side validation (email_address_invalid) at the
  // /recover endpoint for @gym.com and at the admin create endpoint for
  // @gym.invalid — mirroring the real production behavior for A4EI9QVE.
  const store = new Map();
  const createEmails = [];
  let recoveryCalls = 0;
  let lastBanDuration = null;
  const createFailEmails = new Set(['blocked@gym.invalid']);
  const recoverFailEmails = new Set(['trainer@gym.com', 'member@gym.com']);
  const futureBan = () => new Date(Date.now() + 365 * 100 * 24 * 3600 * 1000).toISOString();
  const fakeAdmin = {
    async health() { return {}; },
    async listAllUsers() { return [...store.values()].map((u) => ({ ...u })); },
    async createUser({ email, emailConfirm, metadata }) {
      createEmails.push(String(email).toLowerCase());
      if (createFailEmails.has(String(email).toLowerCase())) {
        throw new Error(`POST /auth/v1/admin/users: Email address "${email}" is invalid`);
      }
      const u = { id: `fake-${createEmails.length}`, email, email_confirm: emailConfirm, user_metadata: metadata, banned_until: null };
      store.set(u.id, u);
      return u;
    },
    async banUser(id) { // wire-equivalent of updateUserById(id, { ban_duration })
      lastBanDuration = BAN_DURATION;
      const u = store.get(id);
      if (!u) throw new Error(`updateUserById: user ${id} not found`);
      u.banned_until = futureBan();
      return u;
    },
    async getUser(id) { const u = store.get(id); return u ? { ...u } : null; },
    async isUserBanned(id) {
      const u = store.get(id);
      if (!u || !u.banned_until) return false;
      const t = Date.parse(u.banned_until);
      return !Number.isNaN(t) && t > Date.now();
    },
    async sendRecovery(email) {
      if (recoverFailEmails.has(String(email).toLowerCase())) {
        throw new Error(`/auth/v1/recover: Email address "${email}" is invalid`);
      }
      recoveryCalls += 1;
      return {};
    },
  };

  // partial-run simulation: A0kiygGn created but ban FAILED (404) → unbanned;
  // one normal user already created; JeFv6yMB already correctly banned; m1
  // correct; m2 email squatted by a foreign user (conflict case).
  const preSeed = (email, firebaseUid, banned) => {
    const u = { id: `existing-${store.size}`, email, user_metadata: { firebase_uid: firebaseUid, role: 'x' }, banned_until: banned ? futureBan() : null };
    store.set(u.id, u);
    return u;
  };
  const exA0 = preSeed('gdup@example.com', 'A0kiygGnU8dSev0jZs4iJrrn3Fm1', false);
  preSeed('member0@gym.test', 'member0PLACEHOLDER01', false);
  preSeed('trej@example.com', 'JeFv6yMBaihoqWTbgAmJhma62al2', true);
  preSeed('member1@gym.test', 'foreign-uid-xxx', false); // conflict

  const canonicalUid = 'A0kiygGnU8dSev0jZs4iJrrn3Fm1';
  const { recs, canonicalG1, excluded } = classify(users, gyms);
  const approved = computeApproved(recs, excluded, canonicalG1, canonicalUid);
  const existingByEmail = new Map((await fakeAdmin.listAllUsers()).map((u) => [String(u.email).toLowerCase(), u]));
  const { plan, conflicts } = buildPlan(approved, existingByEmail);

  const byUid = (prefix) => plan.find((p) => p.uid.startsWith(prefix));
  const checks = [];
  const check = (name, ok, detail = '') => { checks.push([name, ok, detail]); console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

  check('approved count = 25', approved.length === 25, `got ${approved.length}`);
  check('normal 22 / rejected 3', approved.filter((r) => r.role === 'rejected').length === 3 && approved.filter((r) => r.role !== 'rejected').length === 22);
  check('A0kiygGn plan = ban (no duplicate create)', byUid('A0kiygGn').status === 'ban', `status=${byUid('A0kiygGn').status}`);
  check('existing unbanned rejected detected', byUid('A0kiygGn').reason.includes('NOT banned'));
  check('JeFv6yMB plan = skip (already banned)', byUid('JeFv6yMB').status === 'skip', `status=${byUid('JeFv6yMB').status}`);
  check('normal existing-correct = skip', byUid('member0').status === 'skip');
  check('foreign squatter = conflict', byUid('member1').status === 'conflict' && conflicts === 1);
  check('new rejected = create (create-banned)', byUid('ArlmC1TZ').status === 'create' && byUid('ArlmC1TZ').provision === 'create-banned');
  check('new normal = create', byUid('member2').status === 'create');
  check('A4EI9QVE-analog = create (recovery will fail at delivery)', byUid('A4EI9QVE').status === 'create' && byUid('A4EI9QVE').provision === 'create');

  // execute only non-conflict actionable steps (as the real run would)
  const expectedCreates = plan.filter((p) => p.status === 'create').length;
  const expectedRecovery = plan.filter((p) => p.status === 'create' && p.provision === 'create').length;
  const results = [];
  for (const p of plan) {
    if (p.status === 'conflict') continue;
    results.push(await executePlanStep(p, fakeAdmin, { sendRecovery: true, resendRecovery: false, runId: 'AP-FIXTURE-TEST' }));
  }
  const done = (prefix) => results.find((p) => p.uid.startsWith(prefix));

  const gdupCount = [...store.values()].filter((u) => String(u.email).toLowerCase() === 'gdup@example.com').length;
  const blockedExists = [...store.values()].some((u) => String(u.email).toLowerCase() === 'blocked@gym.invalid');
  const trainerGymExists = [...store.values()].some((u) => String(u.email).toLowerCase() === 'trainer@gym.com');
  const recoveryFailedEntries = results.filter((p) => p.recovery === 'delivery-failed');
  const manualReviewEntries = results.filter((p) => p.status === 'manual-review');

  check('new rejected → created-banned', done('ArlmC1TZ').status === 'created-banned', `status=${done('ArlmC1TZ').status}`);
  check('new normal → created', done('member2').status === 'created', `status=${done('member2').status}`);
  check('A0kiygGn ban applied in place → banned', done('A0kiygGn').status === 'banned', `status=${done('A0kiygGn').status}`);
  check('A0kiygGn NOT re-created (no duplicate)', createEmails.length === expectedCreates && gdupCount === 1 && !createEmails.includes('gdup@example.com'), `create attempts=${createEmails.length} expected=${expectedCreates}, gdup users=${gdupCount}`);
  check('JeFv6yMB untouched skip', done('JeFv6yMB').status === 'skip');
  check('ban used supported duration', lastBanDuration === '876000h', `got ${lastBanDuration}`);
  check('ban verified via banned_until', await fakeAdmin.isUserBanned(exA0.id) === true);
  check('recovery delivered to valid normal emails only', recoveryCalls === expectedRecovery - createFailEmails.size - recoverFailEmails.size, `recoveryCalls=${recoveryCalls} expected=${expectedRecovery - createFailEmails.size - recoverFailEmails.size}`);
  check('A4EI9QVE-analog created despite recovery rejection (no rollback)', done('A4EI9QVE').status === 'created' && trainerGymExists, `status=${done('A4EI9QVE').status}`);
  check('A4EI9QVE-analog classified RECOVERY_DELIVERY_FAILED', done('A4EI9QVE').recovery === 'delivery-failed' && done('A4EI9QVE').recoveryReason === 'invalid-email', `recovery=${done('A4EI9QVE').recovery} reason=${done('A4EI9QVE').recoveryReason}`);
  check('second gym.com user also classified RECOVERY_DELIVERY_FAILED', done('fvPn9yyf').recovery === 'delivery-failed', `recovery=${done('fvPn9yyf').recovery}`);
  check('recovery failure does not stop the run', recoveryFailedEntries.length === 2 && results.every((p) => p.status !== 'error'), `failed entries=${recoveryFailedEntries.length}`);
  check('creation-time invalid email → MANUAL_REVIEW, user NOT created', done('blockedMember').status === 'manual-review' && !blockedExists, `status=${done('blockedMember').status} created=${blockedExists}`);
  check('manual-review does not stop the run', manualReviewEntries.length === 1 && done('member6').status === 'created', `manualReview=${manualReviewEntries.length}`);
  check('no recovery attempted for rejected users', results.filter((p) => p.role === 'rejected').every((p) => p.recovery === null));

  const failedCount = checks.filter(([, ok]) => !ok).length;
  console.log(`\nFIXTURE TEST: ${checks.length - failedCount}/${checks.length} PASSED`);
  if (failedCount) process.exit(1);
  console.log('LOCAL-ONLY — ZERO remote users created, ZERO network calls.');
}

// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--fixture-test')) return runFixtureTest();
  const dryRun = args.includes('--dry-run');
  const confirmed = args.includes('--yes');
  const resendRecovery = args.includes('--resend-recovery');
  const canonicalFlag = args.includes('--canonical-uid') ? args[args.indexOf('--canonical-uid') + 1] : null;
  const project = args.includes('--project') ? args[args.indexOf('--project') + 1] : 'ironpulse-32f31';
  const sendRecovery = process.env.SEND_RECOVERY !== 'false';
  const runId = `AP-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

  // --- runtime credential (env only, never from files/logs) -----------------
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    console.error('MISSING CREDENTIAL: SUPABASE_URL and SUPABASE_SECRET_KEY env vars are required. Aborting.');
    process.exit(4);
  }
  if (!/^https:\/\/.+\.supabase\.co$/.test(supabaseUrl)) {
    console.error('UNSAFE URL: SUPABASE_URL must be an https *.supabase.co endpoint. Aborting.');
    process.exit(4);
  }
  if (secretKey.startsWith('sb_publishable_') || secretKey.toLowerCase().includes('publishable')) {
    console.error('REFUSED: publishable key provided for admin operations. Use the service_role key (SUPABASE_SECRET_KEY).');
    process.exit(4);
  }
  if (process.env.SUPABASE_EXPECTED_REF && !supabaseUrl.includes(process.env.SUPABASE_EXPECTED_REF)) {
    console.error(`REF MISMATCH: SUPABASE_URL does not contain expected ref ${process.env.SUPABASE_EXPECTED_REF}. Aborting.`);
    process.exit(4);
  }

  // --- source data (read-only) ----------------------------------------------
  const access = await getAccessToken();
  const [users, gyms] = await Promise.all([listDocs(access, project, 'users'), listDocs(access, project, 'gyms')]);
  const { recs, groups, canonicalG1, excluded } = classify(users, gyms);

  // canonical G1 selection: execution requires the explicit flag (never inferred from names)
  let canonicalUid = canonicalFlag;
  if (canonicalUid && !canonicalG1.has(canonicalUid)) {
    console.error('CANONICAL ERROR: --canonical-uid must be one of the 4 G1 (rejected, gym-owning) users.');
    process.exit(2);
  }
  if (!canonicalUid) {
    if (dryRun) {
      canonicalUid = [...canonicalG1][0];
      console.log(`[canonical] PROVISIONAL dry-run selection = ${maskUid(canonicalUid)} (display only; execution requires --canonical-uid)`);
    } else {
      console.error('CANONICAL REQUIRED: pass --canonical-uid <uid> selecting the G1 canonical account (never inferred from names). Aborting.');
      process.exit(2);
    }
  } else {
    console.log(`[canonical] G1 canonical = ${maskUid(canonicalUid)} (explicit developer selection)`);
  }

  // approved set: all except excluded (G2 + G3) and non-canonical G1 members
  const approved = computeApproved(recs, excluded, canonicalG1, canonicalUid);

  for (const r of approved) {
    if (!EMAIL_RE.test(r.email)) throw new Error(`DRIFT: invalid email for ${maskUid(r.uid)}. Aborting.`);
    if (!r.role) throw new Error(`DRIFT: missing role for ${maskUid(r.uid)}. Aborting.`);
  }
  const banned = approved.filter((r) => r.role === 'rejected');
  const normal = approved.filter((r) => r.role !== 'rejected');
  if (approved.length !== 25 || banned.length !== 3 || normal.length !== 22) {
    throw new Error(`DRIFT: expected 25 approved (22 normal + 3 rejected), got ${approved.length} (${normal.length} + ${banned.length}). Aborting.`);
  }

  // --- remote pre-flight (read-only) ----------------------------------------
  console.log(`[pre-flight] ${dryRun ? 'DRY-RUN — read-only remote checks, ZERO users created' : 'EXECUTION'}`);
  const admin = new GoTrueAdmin(supabaseUrl, secretKey);
  await admin.health();
  console.log('[pre-flight] GoTrue health OK');
  const existing = await admin.listAllUsers();
  console.log(`[pre-flight] existing Supabase Auth users: ${existing.length}`);

  const existingByEmail = new Map(existing.map((u) => [String(u.email || '').toLowerCase(), u]));
  const { plan, conflicts } = buildPlan(approved, existingByEmail);

  const redirectMap = canonicalUid
    ? groups.find((g) => g.length === 4).filter((r) => r.uid !== canonicalUid).map((r) => ({ gymDocId: r.gymId, ownerUid: canonicalUid }))
    : null;

  const excludedList = [...excluded].map((uid) => ({
    uidMasked: maskUid(uid),
    reason: 'duplicate-email legacy-only (G2/G3, approved Option D) — no auth, excluded from provisioning',
  }));
  for (const uid of canonicalG1) {
    if (uid !== canonicalUid) excludedList.push({ uidMasked: maskUid(uid), reason: 'G1 non-canonical (approved Option A) — legacy-only, excluded from provisioning' });
  }

  const safe = (p) => ({
    uidMasked: p.uidMasked,
    emailMasked: p.emailMasked,
    role: p.role,
    gymId: p.gymId,
    provision: p.provision,
    status: p.status,
    reason: p.reason,
    recovery: p.recovery || null,
    recoveryReason: p.recoveryReason || null,
    recoveryError: p.recoveryError || null,
    targetSupabaseUuid: p.targetUuid,
  });

  const writeManifest = () => {
    const manifest = {
      runId,
      mode: dryRun ? 'dry-run' : 'execution',
      generatedAt: new Date().toISOString(),
      project,
      targetSupabaseUrl: supabaseUrl,
      expectedCounts: { approved: approved.length, normalCreate: normal.length, bannedCreate: banned.length },
      conflictsFound: conflicts,
      canonicalG1Uid: canonicalUid ? maskUid(canonicalUid) : null,
      g1OwnerRedirectMap: redirectMap,
      users: plan.map(safe),
      excluded: excludedList,
      recoverySummary: {
        delivered: plan.filter((p) => p.recovery === 'delivered').length,
        deliveryFailed: plan.filter((p) => p.recovery === 'delivery-failed').map((p) => p.uidMasked),
        manualReview: plan.filter((p) => p.status === 'manual-review').map((p) => p.uidMasked),
      },
      security: {
        passwords: 'generated in memory only at execution time; never stored or logged',
        recoveryLinks: sendRecovery ? 'normal users only; delivered when the provider accepts the address; failures classified RECOVERY_DELIVERY_FAILED (never fatal, never rolled back); never sent to banned/rejected users' : 'disabled (SEND_RECOVERY=false)',
        firebaseUid: 'preserved in user_metadata and (later) profiles.firebase_uid; never used as auth.users.id',
        firebasePasswordHashes: 'NEVER migrated — temporary passwords only, manual credential recovery for delivery failures',
        deletedUsers: 0,
        overwrittenUsers: 0,
      },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'auth-provisioning-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`[manifest] ${join(OUT, 'auth-provisioning-manifest.json')}`);
  };

  mkdirSync(OUT, { recursive: true });

  if (conflicts > 0) {
    writeManifest();
    console.log(`[pre-flight] CONFLICTS: ${conflicts}. STOPPING — zero users will be created.`);
    for (const p of plan.filter((x) => x.status === 'conflict')) console.log(`  CONFLICT ${p.uidMasked} ${p.emailMasked} ${p.role}`);
    process.exit(dryRun ? 0 : 5);
  }

  if (dryRun) {
    writeManifest();
    console.log('\n[DRY-RUN] would create:');
    for (const p of plan) console.log(`  ${p.status.padEnd(7)} ${p.provision.padEnd(14)} ${p.uidMasked} ${p.emailMasked} ${p.role} gym=${p.gymId || 'NULL'}`);
    console.log('DRY-RUN COMPLETE. ZERO AUTH USERS CREATED. ZERO WRITES.');
    return;
  }

  if (!confirmed) {
    console.error('EXECUTION ABORTED: pass --yes to confirm real Auth provisioning. Run --dry-run first.');
    process.exit(2);
  }

  // --- execution (idempotent, never destructive) ----------------------------
  // Fail-fast ONLY on hard create/ban/verify errors. Recovery-delivery
  // failures (RECOVERY_DELIVERY_FAILED) and manual-review classifications
  // never stop the run; a created user is never rolled back.
  const createdIds = [];
  let failed = 0;
  let recoveryFailed = 0;
  let manualReview = 0;
  const opts = { sendRecovery, resendRecovery, runId };
  for (const p of plan) {
    if (p.status !== 'create' && p.status !== 'ban' && p.status !== 'skip') continue;
    await executePlanStep(p, admin, opts);
    if (p.status === 'error') {
      failed += 1;
      console.error(`  ERROR ${p.uidMasked} ${p.emailMasked}: ${p.reason}`);
      break; // fail-fast only on hard errors; rerun is idempotent
    }
    if (p.status === 'manual-review') {
      manualReview += 1;
      console.log(`  MANUAL-REVIEW ${p.uidMasked} ${p.emailMasked} ${p.role} — no user created, no fabricated address (source email preserved)`);
      continue;
    }
    if (p.status === 'created' || p.status === 'created-banned' || p.status === 'banned') {
      createdIds.push(p.uidMasked);
      if (p.recovery === 'delivery-failed') {
        recoveryFailed += 1;
        console.log(`  ${p.status.toUpperCase()} ${p.provision.padEnd(14)} ${p.uidMasked} ${p.emailMasked} ${p.role} — RECOVERY_DELIVERY_FAILED (${p.recoveryReason}): user created, manual credential setup required`);
      } else if (p.recovery === 'delivered') {
        console.log(`  ${p.status.toUpperCase()} ${p.provision.padEnd(14)} ${p.uidMasked} ${p.emailMasked} ${p.role} — recovery link sent`);
      } else {
        console.log(`  ${p.status.toUpperCase()} ${p.provision.padEnd(14)} ${p.uidMasked} ${p.emailMasked} ${p.role}`);
      }
    }
  }
  writeManifest();

  console.log(`\nRESULT: created=${createdIds.length} recoveryDeliveryFailed=${recoveryFailed} manualReview=${manualReview} failed=${failed} (run ${runId})`);
  if (failed) { console.log('Partial state possible — re-run is idempotent (skips existing-correct users, bans unbanned rejected users in place).'); process.exit(1); }
  if (recoveryFailed || manualReview) {
    console.log('Recovery-delivery failures and manual-review users require manual credential setup — see manifest recoverySummary.');
  }
  console.log('AUTH PROVISIONING COMPLETE — passwords never stored, Firebase hashes never migrated, recovery links sent where the provider accepts the address.');
}

main().catch((e) => {
  console.error(`FATAL: ${e?.message || e}`);
  process.exit(1);
});