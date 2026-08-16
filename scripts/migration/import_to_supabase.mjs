// ============================================================================
// IRONPULSE — Supabase Migration Step 7B: STAGED DATA IMPORTER
// ----------------------------------------------------------------------------
// Executes the APPROVED import plan (docs/FIREBASE_IMPORT_DECISIONS.md +
// FIREBASE_IMPORT_APPROVAL_SUMMARY.md, signed 2026-08-14) against Supabase.
//
// - Firebase: READ-ONLY (admin-read REST via Firebase CLI OAuth token).
// - Supabase: writes ONLY via PostgREST service-role (credentials from the
//   temp cred file, never from env/repo, never printed).
// - Manifests are masked; real email/phone are re-read from Firebase at
//   import time (per FIREBASE_IMPORT_RULES.md §2).
// - Each stage = ONE atomic multi-row request (statement-level rollback on
//   failure); idempotent (skips rows whose PK already exists); stops with
//   exit 1 on FK/uniqueness violations.
// - RLS is bypassed by service_role (never disabled, never modified).
//
// Usage:
//   node scripts/migration/import_to_supabase.mjs --creds <temp-cred-file>
//       [--project ironpulse-32f31] [--simulate]
// ============================================================================

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MIG = join(ROOT, 'migration-output');

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const credsPath = argVal('--creds');
const project = argVal('--project') || 'ironpulse-32f31';
const SIMULATE = args.includes('--simulate');

// --- Guards: never run against emulator / never mix env creds ---------------
for (const v of ['FIREBASE_EMULATOR', 'FIREBASE_SERVICE_ACCOUNT']) {
  if (process.env[v]) {
    console.error(`REFUSING TO RUN: ${v} is set in the environment.`);
    process.exit(3);
  }
}
if (!credsPath || !readFileSync(credsPath, 'utf8').includes('SUPABASE_SECRET_KEY')) {
  console.error('FATAL: --creds <path> required (temp supabase-cred.env with SUPABASE_URL + SUPABASE_SECRET_KEY)');
  process.exit(3);
}

// --- Credentials (file only; never printed) ---------------------------------
const creds = {};
for (const line of readFileSync(credsPath, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) creds[m[1]] = m[2];
}
const SUPABASE_URL = creds.SUPABASE_URL;
const KEY = creds.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_SECRET_KEY missing from cred file');
  process.exit(3);
}

// --- Helpers (mirror dry_run_import.js) --------------------------------------
function maskEmail(e) {
  if (e == null || typeof e !== 'string') return e;
  const at = e.indexOf('@');
  if (at <= 0) return '(invalid)';
  return `${e[0]}***${e.slice(at)}`;
}
function maskPhone(p) {
  if (p == null || typeof p !== 'string') return p;
  const digits = p.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${p.slice(0, 2)}***${p.slice(-3)}`;
}

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
  if ('geoPointValue' in f) return f.geoPointValue;
  if ('bytesValue' in f) return '<bytes>';
  return '<unknown>';
}
function convFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = convValue(v);
  return out;
}

async function listDocs(access, projectId, col) {
  const out = [];
  let token = '';
  for (let i = 0; i < 100; i++) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
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

// --- PostgREST bulk insert requires identical keys per request. Any key that
// is null in ANY row is dropped from ALL rows (NOT NULL DEFAULT columns such
// as created_at/updated_at take their DB default; nullable columns stay NULL).
function normalizeRows(table, rows) {
  if (!rows.length) return rows;
  const keys = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  if (NOT_NULL_UPDATED_AT.has(table)) keys.delete('updated_at');
  const drop = new Set();
  for (const k of keys) {
    if (rows.some((r) => r[k] === null || r[k] === undefined)) drop.add(k);
  }
  return rows.map((r) => {
    const out = {};
    for (const k of keys) if (!drop.has(k)) out[k] = r[k];
    return out;
  });
}

// --- Supabase PostgREST client -------------------------------------------------
async function pg(method, table, pathExtra = '', body = null, extraHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${pathExtra}`;
  const headers = {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    accept: 'application/json',
    'content-type': 'application/json',
    prefer: 'return=minimal',
    ...extraHeaders,
  };
  const res = await fetch(url, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  if (res.status >= 400) {
    const text = await res.text().catch(() => '');
    throw new Error(`POSTGREST ${method} ${table} -> ${res.status}: ${text.slice(0, 1200)}`);
  }
  return res;
}

async function existingPks(table, pk) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${pk}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
  });
  if (res.status === 404) return new Set();
  if (!res.ok) throw new Error(`PK read failed for ${table}: ${res.status}`);
  const rows = await res.json();
  return new Set(rows.map((r) => String(r[pk])));
}

// --- Load approved profile mapping ---------------------------------------------
const idMap = JSON.parse(readFileSync(join(MIG, 'summaries', 'firebase-to-supabase-id-map.json'), 'utf8'));
const approved = new Map(); // firebase_uid -> auth_uuid
for (const m of idMap.mappings || []) {
  if (m.firebase_uid && m.auth_uuid) approved.set(m.firebase_uid, m.auth_uuid);
}

// --- Load manifests --------------------------------------------------------------
const readManifest = (file) => JSON.parse(readFileSync(join(MIG, file), 'utf8'));
const safe = {
  gyms: readManifest('safe/gyms.json'),
  profiles: readManifest('safe/profiles.json'),
  plans: readManifest('safe/plans.json'),
  settings: readManifest('safe/settings.json'),
  subscriptions: readManifest('safe/subscriptions.json'),
  subscriptionHistory: readManifest('safe/subscription_history.json'),
  notifications: readManifest('safe/notifications.json'),
  licenseHistory: readManifest('safe/license_history.json'),
  referralCodes: readManifest('safe/referral_codes.json'),
  aiConversations: readManifest('safe/ai_conversations.json'),
  aiConversationMessages: readManifest('safe/ai_conversation_messages.json'),
  contactMessages: readManifest('safe/contact_messages.json'),
};
const manual = {
  gyms: readManifest('manual-review/gyms.json'),
  profiles: readManifest('manual-review/profiles.json'),
};

const quarantineGymIds = new Set(readManifest('quarantine/gyms.json').map((r) => r.record.id));

// --- Firebase read-only PII (skipped in --simulate) -----------------------------
let usersFb = new Map();
let gymsFb = new Map();
let contactsFb = new Map();
let access = null;
if (!SIMULATE) {
  access = await getAccessToken();
  console.log(`[import] Firebase read-only fetch (project=${project})...`);
  for (const d of await listDocs(access, project, 'users')) usersFb.set(d.id, d.fields);
  for (const d of await listDocs(access, project, 'gyms')) gymsFb.set(d.id, d.fields);
  for (const d of await listDocs(access, project, 'contactMessages')) contactsFb.set(d.id, d.fields);
  console.log(`[import] fetched users=${usersFb.size} gyms=${gymsFb.size} contactMessages=${contactsFb.size}`);
}

const realEmail = (map, id) => (map.get(id) && (map.get(id).email != null ? String(map.get(id).email) : null)) ?? null;
const realPhone = (map, id) => (map.get(id) && (map.get(id).phone != null ? String(map.get(id).phone) : null)) ?? null;

// --- Build stage rows (approved manifest rows + live PII + documented FK nulling)
// NOTE: tables with `updated_at timestamptz NOT NULL default now()` must NOT
// receive explicit null — strip the key so the DB default applies.
const NOT_NULL_UPDATED_AT = new Set(['gyms', 'profiles', 'plans', 'settings', 'notifications', 'subscriptions', 'ai_conversations']);
const stripNullUpdatedAt = (table, row) => {
  if (NOT_NULL_UPDATED_AT.has(table) && row.updated_at == null) {
    const { updated_at, ...rest } = row;
    return rest;
  }
  return row;
};
const stages = [];

// 1) gyms — all 13 (7 safe + 6 manual). Circular FK (gyms.owner_uid ->
// profiles, profiles.gym_id -> gyms): insert with owner_uid NULL, then the
// backfill stage patches approved owners after profiles exist.
const gymRows = [...safe.gyms, ...manual.gyms].map((r) => {
  const row = { ...r.record };
  row.owner_uid = null;
  row.email = realEmail(gymsFb, r.legacyId);
  row.phone = realPhone(gymsFb, r.legacyId);
  return stripNullUpdatedAt('gyms', row);
});
stages.push({ name: 'gyms', table: 'gyms', pk: 'id', rows: gymRows });

// 2) profiles — 25 approved; id = LIVE auth UUID; real email/phone from Firebase
const profileRows = [...safe.profiles, ...manual.profiles]
  .filter((r) => approved.has(r.record.firebase_uid))
  .map((r) => stripNullUpdatedAt('profiles', {
    ...r.record,
    id: approved.get(r.record.firebase_uid),
    email: realEmail(usersFb, r.legacyId),
    phone: realPhone(usersFb, r.legacyId),
  }));
{
  const emails = profileRows.map((p) => p.email).filter(Boolean);
  const dupes = emails.filter((e, i) => emails.indexOf(e) !== i);
  if (dupes.length) throw new Error(`duplicate email among approved profiles: ${dupes.map(maskEmail).join(', ')}`);
}
stages.push({ name: 'profiles', table: 'profiles', pk: 'id', rows: profileRows });

// 3) gyms.owner_uid backfill (profiles exist now; circular FK two-phase)
const ownerBackfill = [...safe.gyms, ...manual.gyms]
  .map((r) => ({ id: r.record.id, owner_uid: r.record.owner_uid }))
  .filter((g) => g.owner_uid && approved.has(g.owner_uid));
stages.push({ name: 'gyms.owner_uid (backfill)', table: 'gyms', pk: 'id', rows: ownerBackfill, patch: true });

// 4) plans — 18 safe
stages.push({ name: 'plans', table: 'plans', pk: 'id', rows: safe.plans.map((r) => stripNullUpdatedAt('plans', r.record)) });

// 5) settings — 1 (platform)
stages.push({ name: 'settings', table: 'settings', pk: 'doc_id', pk2: 'gym_id', rows: safe.settings.map((r) => stripNullUpdatedAt('settings', r.record)) });

// 6) subscriptions — exclude the one referencing a quarantined gym
const subRows = safe.subscriptions
  .filter((r) => !(r.record.gym_id && quarantineGymIds.has(r.record.gym_id)))
  .map((r) => stripNullUpdatedAt('subscriptions', r.record));
stages.push({ name: 'subscriptions', table: 'subscriptions', pk: 'id', rows: subRows });

// 7) subscription_history — 2
stages.push({ name: 'subscription_history', table: 'subscription_history', pk: 'id', rows: safe.subscriptionHistory.map((r) => r.record) });

// 8) notifications — exclude rows whose user_id is NOT an approved profile
const notifRows = safe.notifications.filter((r) => approved.has(r.record.user_id)).map((r) => stripNullUpdatedAt('notifications', r.record));
stages.push({ name: 'notifications', table: 'notifications', pk: 'id', rows: notifRows });

// 9) license_history — 11; performed_by sentinel ('system'/'gym_admin'/'super_admin') -> NULL
const licRows = safe.licenseHistory.map((r) => {
  const row = { ...r.record };
  if (row.performed_by && !approved.has(row.performed_by)) row.performed_by = null;
  return row;
});
stages.push({ name: 'license_history', table: 'license_history', pk: 'id', rows: licRows });

// 10) referral_codes — 1
stages.push({ name: 'referral_codes', table: 'referral_codes', pk: 'code', rows: safe.referralCodes.map((r) => r.record) });

// 11) ai_conversations — 15
stages.push({ name: 'ai_conversations', table: 'ai_conversations', pk: 'id', rows: safe.aiConversations.map((r) => stripNullUpdatedAt('ai_conversations', r.record)) });

// 12) ai_conversation_messages — 65
stages.push({ name: 'ai_conversation_messages', table: 'ai_conversation_messages', pk: 'id', rows: safe.aiConversationMessages.map((r) => r.record) });

// 13) contact_messages — 3; real email from Firebase
stages.push({
  name: 'contact_messages',
  table: 'contact_messages',
  pk: 'id',
  rows: safe.contactMessages.map((r) => ({ ...r.record, email: realEmail(contactsFb, r.legacyId) })),
});

// ----------------------------------------------------------------------------------
// Plan report
// ----------------------------------------------------------------------------------
console.log('\n===== IMPORT PLAN =====');
let totalRows = 0;
for (const s of stages) {
  console.log(`  ${s.name.padEnd(28)} ${String(s.rows.length).padStart(3)} rows${s.patch ? ' (PATCH)' : ''}`);
  totalRows += s.rows.length;
}
console.log(`  TOTAL: ${totalRows}`);

if (SIMULATE) {
  console.log('\n[simulate] no writes performed. Sample rows (masked):');
  for (const s of stages) {
    if (!s.rows.length) continue;
    const sample = { ...s.rows[0] };
    if (sample.email) sample.email = maskEmail(sample.email);
    if (sample.phone) sample.phone = maskPhone(sample.phone);
    console.log(`  ${s.name}: ${JSON.stringify(sample)}`);
  }
  console.log('\nSIMULATE COMPLETE — nothing was written.');
  process.exit(0);
}

// ----------------------------------------------------------------------------------
// Execute
// ----------------------------------------------------------------------------------
console.log('\n===== EXECUTING =====');
const report = { startedAt: new Date().toISOString(), project, stages: [] };
let failed = false;
for (const s of stages) {
  const existing = s.patch ? new Set() : await existingPks(s.table, s.pk);
  const newRows = s.patch ? s.rows : s.rows.filter((r) => !existing.has(String(r[s.pk])));
  const skipCount = s.rows.length - newRows.length;
  const entry = { name: s.name, table: s.table, planned: s.rows.length, skipped: skipCount, inserted: 0, error: null };
  try {
    if (newRows.length === 0) {
      console.log(`  ${s.name.padEnd(28)} skip all (${skipCount} existing)`);
      report.stages.push(entry);
      continue;
    }
    if (s.patch) {
      for (const r of newRows) {
        await pg('PATCH', s.table, `?id=eq.${encodeURIComponent(r.id)}`, { owner_uid: r.owner_uid });
      }
      entry.inserted = newRows.length;
    } else if (s.pk2) {
      for (const r of newRows) {
        await pg('POST', s.table, '', normalizeRows(s.table, [r])[0]);
      }
      entry.inserted = newRows.length;
    } else {
      await pg('POST', s.table, '', normalizeRows(s.table, newRows));
      entry.inserted = newRows.length;
    }
    console.log(`  ${s.name.padEnd(28)} inserted=${newRows.length}${skipCount ? ` skipped=${skipCount}` : ''}`);
  } catch (e) {
    entry.error = e.message;
    failed = true;
    console.error(`  ${s.name.padEnd(28)} FAILED: ${e.message}`);
  }
  report.stages.push(entry);
  if (failed) break;
}

report.finishedAt = new Date().toISOString();
report.success = !failed;
mkdirSync(join(MIG, 'summaries'), { recursive: true });
writeFileSync(join(MIG, 'summaries', 'import-report.json'), JSON.stringify(report, null, 2));

if (failed) {
  console.error('\nIMPORT STOPPED — FK/uniqueness violation. See import-report.json. No retry performed.');
  process.exit(1);
}
console.log('\nALL STAGES COMPLETE. Report: migration-output/summaries/import-report.json');
process.exit(0);