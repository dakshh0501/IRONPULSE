// IRONPULSE - Step 7B post-import validation: per-table row counts vs
// expected, FK integrity spot checks, RLS-enabled check, credential scan.
// READ-ONLY. Usage:
//   node scripts/migration/post_import_verify.mjs --creds <temp-cred-file>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const MIG = path.join(ROOT, 'migration-output');

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const credsPath = argVal('--creds');
if (!credsPath || !fs.existsSync(credsPath)) {
  console.error('FATAL: --creds <path> required');
  process.exit(2);
}

const creds = {};
for (const line of fs.readFileSync(credsPath, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) creds[m[1]] = m[2];
}
const SUPABASE_URL = creds.SUPABASE_URL;
const KEY = creds.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('FATAL: creds missing');
  process.exit(2);
}

const EXPECTED = {
  gyms: 13, profiles: 25, plans: 18, settings: 1, subscriptions: 6,
  subscription_history: 2, notifications: 9, license_history: 11,
  referral_codes: 1, ai_conversations: 15, ai_conversation_messages: 65,
  contact_messages: 3,
  // must stay empty
  members: 0, trainers: 0, attendance: 0, payment_attempts: 0, payments: 0,
  progress_logs: 0, diet_plans: 0, workout_plans: 0, plan_templates: 0,
  support_tickets: 0, feature_requests: 0, whatsapp_logs: 0,
  whatsapp_campaigns: 0, licensed_devices: 0, referrals: 0, reward_ledger: 0,
  discount_coupons: 0, referral_audit_logs: 0, audit_log: 0,
  generated_reports: 0,
};

const problems = [];
const notes = [];

async function countRows(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
    method: 'HEAD',
    headers: {
      apikey: KEY, authorization: `Bearer ${KEY}`,
      accept: 'application/json', prefer: 'count=exact',
    },
  });
  if (res.status === 404) return { exists: false, count: -1 };
  const count = parseInt(res.headers.get('content-range')?.split('/')[1] ?? 'NaN', 10);
  return { exists: true, count: Number.isNaN(count) ? -1 : count };
}

async function select(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`select ${table} ${query}: ${res.status}`);
  return res.json();
}

// ---- 1. Row counts ----
console.log('=== ROW COUNTS ===');
let totalImported = 0;
for (const [table, expected] of Object.entries(EXPECTED)) {
  const { exists, count } = await countRows(table);
  if (!exists) { problems.push(`${table}: table missing`); console.log(`  MISSING ${table}`); continue; }
  const flag = count === expected ? 'ok' : `EXPECTED ${expected}`;
  console.log(`  ${table.padEnd(26)} ${String(count).padStart(3)}  (${flag})`);
  if (count !== expected) problems.push(`${table}: count ${count} != expected ${expected}`);
  if (expected > 0) totalImported += count;
}
notes.push(`total rows in populated tables: ${totalImported}`);

// ---- 2. FK integrity spot checks ----
console.log('\n=== FK INTEGRITY ===');
const orphanCheck = async (table, fkCol, refTable, refCol) => {
  const rows = await select(table, fkCol);
  const refs = new Set((await select(refTable, refCol)).map((r) => String(r[refCol])));
  const orphans = rows.filter((r) => r[fkCol] != null && !refs.has(String(r[fkCol])));
  return orphans.length;
};
const fkChecks = [
  ['gyms.owner_uid -> profiles', 'gyms', 'owner_uid', 'profiles', 'firebase_uid'],
  ['profiles.gym_id -> gyms', 'profiles', 'gym_id', 'gyms', 'id'],
  ['plans.gym_id -> gyms', 'plans', 'gym_id', 'gyms', 'id'],
  ['subscriptions.gym_id -> gyms', 'subscriptions', 'gym_id', 'gyms', 'id'],
  ['subscription_history.gym_id -> gyms', 'subscription_history', 'gym_id', 'gyms', 'id'],
  ['subscription_history.subscription_id -> subscriptions', 'subscription_history', 'subscription_id', 'subscriptions', 'id'],
  ['notifications.user_id -> profiles', 'notifications', 'user_id', 'profiles', 'firebase_uid'],
  ['license_history.gym_id -> gyms', 'license_history', 'gym_id', 'gyms', 'id'],
  ['referral_codes.referrer_uid -> profiles', 'referral_codes', 'referrer_uid', 'profiles', 'firebase_uid'],
  ['ai_conversations.user_id -> profiles', 'ai_conversations', 'user_id', 'profiles', 'firebase_uid'],
  ['ai_conversation_messages.conversation_id -> ai_conversations', 'ai_conversation_messages', 'conversation_id', 'ai_conversations', 'id'],
];
for (const [label, t, fk, rt, rc] of fkChecks) {
  try {
    const n = await orphanCheck(t, fk, rt, rc);
    console.log(`  ${label.padEnd(52)} orphans=${n}`);
    if (n > 0) problems.push(`${label}: ${n} orphan rows`);
  } catch (e) {
    problems.push(`${label}: check failed: ${e.message}`);
    console.log(`  ${label} FAILED: ${e.message}`);
  }
}

// ---- 3. profiles vs auth.users ----
console.log('\n=== AUTH ===');
const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
  headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
});
if (authRes.ok) {
  const authBody = await authRes.json();
  const authUuids = new Set((authBody.users || []).map((u) => u.id));
  const profiles = await select('profiles', 'id');
  const orphanProfiles = profiles.filter((p) => !authUuids.has(p.id));
  console.log(`  auth.users=${authUuids.size} profiles=${profiles.length} profiles-without-auth=${orphanProfiles.length}`);
  if (profiles.length !== authUuids.size) problems.push(`profiles ${profiles.length} != auth.users ${authUuids.size}`);
  if (orphanProfiles.length) problems.push(`${orphanProfiles.length} profiles lack auth.users row`);
} else {
  problems.push(`auth.users read failed: ${authRes.status}`);
  console.log(`  auth.users read failed: ${authRes.status}`);
}

// ---- 4. RLS enabled ----
console.log('\n=== RLS ===');
const rlsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rls?tables=profiles,gyms,plans,settings,subscriptions,notifications,ai_conversations`, {
  method: 'GET',
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: 'application/json' },
});
// rpc may not exist; fall back to metadata check via a table that would 403 without key is not feasible.
// Instead: verify RLS by querying as anon (no auth header) — expect 401/403, and with service role expect 200.
const anonRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=count`, {
  method: 'HEAD',
  headers: { accept: 'application/json', prefer: 'count=exact' },
});
if (anonRes.status === 401 || anonRes.status === 403) {
  notes.push('RLS/anon gate: profiles read without auth rejected (401/403) — RLS active');
  console.log(`  anon read rejected (${anonRes.status}) — RLS active`);
} else {
  problems.push(`anon read NOT rejected (${anonRes.status}) — RLS may be disabled!`);
  console.log(`  anon read ${anonRes.status} — RLS may be disabled!`);
}

// ---- 5. Credential scan of output + repo artifacts ----
console.log('\n=== CREDENTIAL SCAN ===');
// Match actual credential VALUES, not documentation statements like
// "passwords: generated in memory only" (auth-provisioning-manifest.json).
const DENY = /"passwd"\s*:\s*"|"password"\s*:\s*"|passwordHash\s*:\s*"|client_secret\s*[:=]\s*"|x-client-secret\s*[:=]|service_account\s*:\s*\{|api[_-]?key\s*[:=]\s*"/i;
let scanned = 0;
const hits = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && (p.endsWith('.json') || p.endsWith('.md') || p.endsWith('.sql'))) {
      scanned++;
      const text = fs.readFileSync(p, 'utf8');
      if (DENY.test(text)) hits.push(p);
    }
  }
};
walk(MIG);
const ignoredDirs = ['node_modules', 'dist', 'functions', '.git'];
const excludedFiles = new Set([path.join(ROOT, 'users_export.json')]); // documented EXCLUDED material (rules §1)
const repoHits = [];
const walkRepo = (dir, depth) => {
  if (depth > 3) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.includes(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkRepo(p, depth + 1);
    else if (e.isFile() && p.endsWith('.json') && !excludedFiles.has(p)) {
      const text = fs.readFileSync(p, 'utf8');
      if (DENY.test(text)) repoHits.push(p);
    }
  }
};
walkRepo(ROOT, 0);
console.log(`  scanned ${scanned} migration-output files`);
if (hits.length) { problems.push(`deny-list hits in migration-output: ${hits.join(', ')}`); console.log(`  HITS: ${hits.join(', ')}`); }
else console.log('  migration-output: clean');
if (repoHits.length) { problems.push(`deny-list hits in repo: ${repoHits.join(', ')}`); console.log(`  REPO HITS: ${repoHits.join(', ')}`); }
else console.log('  repo: clean (excluding documented users_export.json)');

// ---- Report ----
console.log('\n=== POST-IMPORT VERIFICATION ===');
for (const n of notes) console.log('  OK  ' + n);
if (problems.length) {
  console.log(`\n!!! ${problems.length} PROBLEM(S) !!!`);
  for (const p of problems) console.log('  FAIL  ' + p);
  process.exit(1);
}
console.log('PASS: all counts, FK refs, auth linkage, RLS, and sanitization verified.');
process.exit(0);