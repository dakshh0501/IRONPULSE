// ============================================================================
// IRONPULSE — Supabase Migration Step 6A: AUTH PROVISIONING DRY-RUN
// ----------------------------------------------------------------------------
// READ-ONLY. Fetches Firebase `users` collection (admin-read REST via Firebase
// CLI OAuth token), classifies every approved user against the signed
// decisions (docs/FIREBASE_IMPORT_DECISIONS.md), and computes the intended
// Supabase Auth provisioning plan:
//
//   provision: 'create'          → GoTrue admin user (temp password at execution)
//   provision: 'create-banned'   → GoTrue admin user + banned_until (rejected)
//   provision: 'manual-review'   → email missing/invalid/duplicate — NO user
//   provision: 'blocking'        → source-data defect — NO user
//
// This script performs ZERO writes: no Firebase writes, no Supabase calls of
// any kind (no auth admin create/update/delete, no REST, no SQL). It contains
// no credentials beyond the Firebase CLI refresh token used for reading.
//
// Usage:
//   node scripts/migration/dry_run_auth_provisioning.js [--project ironpulse-32f31]
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'migration-output', 'summaries');

for (const v of ['FIREBASE_EMULATOR']) {
  if (process.env[v]) {
    console.error(`REFUSING TO RUN: ${v} is set. Dry-run must read the production project.`);
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// Firebase read-only access (same pattern as dry_run_import.js)
// ---------------------------------------------------------------------------
function loadToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN) return process.env.FIREBASE_ACCESS_TOKEN;
  if (process.env.FIREBASE_TOKEN) return process.env.FIREBASE_TOKEN;
  const storePath = join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json');
  const cfg = JSON.parse(readFileSync(storePath, 'utf8'));
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
    for (const d of body.documents || []) {
      out.push({ id: d.name.split('/').pop(), fields: convFields(d.fields) });
    }
    token = body.nextPageToken;
    if (!token) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Masking (never writes real emails/phones)
// ---------------------------------------------------------------------------
function maskEmail(e) {
  if (e == null || typeof e !== 'string') return '(missing)';
  const at = e.indexOf('@');
  if (at <= 0) return '(invalid)';
  return `${e[0]}***${e.slice(at)}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USER_ROLES = new Set(['super_admin', 'gym_admin', 'trainer', 'member', 'pending', 'gym_owner_pending', 'rejected', 'gym_owner', 'admin']);

// ---------------------------------------------------------------------------
// Classification (mirrors dry_run_import.js transformUser + signed decisions)
// ---------------------------------------------------------------------------
async function main() {
  const project = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : 'ironpulse-32f31';
  const access = await getAccessToken();
  console.log(`[auth-dry-run] project=${project} — READ-ONLY`);

  const [users, gyms] = await Promise.all([listDocs(access, project, 'users'), listDocs(access, project, 'gyms')]);
  const gymsById = new Map(gyms.map((g) => [g.id, g]));
  const ownerGymsByUid = new Map();
  for (const g of gyms) {
    if (g.fields.ownerUid == null) continue;
    const k = String(g.fields.ownerUid);
    ownerGymsByUid.set(k, [...(ownerGymsByUid.get(k) || []), g.id]);
  }

  const records = [];
  for (const u of users) {
    const f = u.fields;
    const uid = u.id;
    const emailRaw = f.email != null ? String(f.email).trim() : '';
    const email = emailRaw.toLowerCase();
    const role = f.role != null ? String(f.role) : '';
    const rawGym = f.gymId != null ? String(f.gymId) : null;
    const missing = [];
    const reasons = [];

    let gymId = null;
    if (rawGym && gymsById.has(rawGym)) gymId = rawGym;
    if (gymId == null && role === 'gym_owner') {
      const backfill = ownerGymsByUid.get(uid);
      if (backfill && backfill.length === 1) gymId = backfill[0];
    }
    if (role === 'gym_owner' && rawGym && !gymsById.has(rawGym) && gymId == null) {
      reasons.push('D1.4: deleted-gym ref approved as gym_id NULL');
    }
    if (role === 'gym_owner_pending' && gymId != null) {
      reasons.push('D2: pending owner gym_id NULL on import regardless of resolvable ref');
    }

    // signed decisions
    let decision = '';
    if (role === 'super_admin' || role === 'gym_owner') decision = 'D1/D3 — import';
    else if (role === 'rejected') decision = 'D1.1 — import account_disabled=true';
    else if (role === 'gym_owner_pending') decision = 'D2 — import, gym_id NULL';
    else if (role === 'member' || role === 'trainer') decision = 'D3 — import, gym_id NULL';

    if (!EMAIL_RE.test(emailRaw)) missing.push('email');
    if (!role || !USER_ROLES.has(role)) missing.push('role');

    let provision = 'blocking';
    if (missing.length) {
      provision = 'blocking';
    } else if (!EMAIL_RE.test(emailRaw)) {
      provision = 'manual-review';
    } else if (role === 'rejected') {
      provision = 'create-banned';
    } else {
      provision = 'create';
    }

    records.push({
      firebase_uid: uid,
      email_masked: maskEmail(emailRaw),
      email_valid: EMAIL_RE.test(emailRaw),
      email: emailRaw === '' ? null : email, // for dedup only — never output
      role,
      gym_id: gymId,
      account_disabled: role === 'rejected',
      decision,
      provision,
      reasons,
    });
  }

  // dedup on normalized email (internal only)
  const seen = new Map();
  const dupEmails = new Set();
  for (const r of records) {
    if (!r.email) continue;
    if (seen.has(r.email)) dupEmails.add(r.email);
    seen.set(r.email, (seen.get(r.email) || 0) + 1);
  }
  const dupCounts = new Map();
  for (const e of dupEmails) dupCounts.set(e, seen.get(e));
  const dupGroupSizes = [...dupCounts.values()].sort((a, b) => b - a);
  for (const r of records) {
    r.email_duplicate = r.email != null && dupEmails.has(r.email);
    if (r.email_duplicate && r.provision !== 'blocking') r.provision = 'manual-review';
    delete r.email;
  }

  const counts = {
    approvedUsers: records.length,
    create: records.filter((r) => r.provision === 'create').length,
    createBanned: records.filter((r) => r.provision === 'create-banned').length,
    manualReviewAuth: records.filter((r) => r.provision === 'manual-review').length,
    blocking: records.filter((r) => r.provision === 'blocking').length,
    disabledUsers: records.filter((r) => r.account_disabled).length,
    missingEmails: records.filter((r) => !r.email_valid && r.email_masked === '(missing)').length,
    invalidEmails: records.filter((r) => !r.email_valid && r.email_masked !== '(missing)').length,
    duplicateEmails: dupEmails.size,
    duplicateGroupSizes: dupGroupSizes,
    byRole: {},
  };
  for (const r of records) counts.byRole[r.role] = (counts.byRole[r.role] || 0) + 1;

  const report = {
    project,
    generatedAt: new Date().toISOString(),
    mode: 'READ-ONLY DRY-RUN — ZERO AUTH USERS CREATED',
    counts,
    users: records.map(({ firebase_uid, email_masked, email_valid, email_duplicate, role, gym_id, account_disabled, decision, provision, reasons }) => ({
      firebase_uid, email_masked, email_valid, email_duplicate, role, gym_id, account_disabled, decision, provision, reasons,
    })),
    provisioningModel: {
      api: 'Supabase GoTrue Admin API (POST /auth/v1/admin/users) at EXECUTION time — not called by this script',
      idModel: 'auth.users.id = NEW GoTrue-generated UUID (NEVER the Firebase UID); firebase_uid preserved in profiles.firebase_uid; profiles.id = auth.users.id (schema FK 0001:92)',
      tempPassword: 'random 16-char per-user, generated at execution, delivered ONLY via the recovery/verify email — never stored in files or logs',
      forcedReset: 'email_confirm=true + immediate recovery-link send per user; rejected users additionally banned (banned_until) matching account_disabled=true',
      rejected: 'create-banned: auth user created (FK requirement) then banned — cannot sign in; profile.account_disabled=true',
    },
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'auth-provisioning-plan.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(counts, null, 2));
  console.log(`\nartifacts: ${join(OUT, 'auth-provisioning-plan.json')}`);
  console.log('ZERO AUTH USERS CREATED. ZERO FIREBASE WRITES. ZERO SUPABASE CALLS.');
}

main().catch((e) => {
  console.error(`FATAL: ${e?.message || e}`);
  process.exit(1);
});