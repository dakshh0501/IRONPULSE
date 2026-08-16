// IRONPULSE - Step 7B pre-flight: verify Supabase application tables exist and
// are empty before import. READ-ONLY. Credentials are read from the temp env
// file (never printed, never written to the repo).
// Usage:
//   node scripts/migration/supabase_table_status.mjs --creds <path-to-cred-file>

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const credsPath = argVal('--creds');
if (!credsPath || !fs.existsSync(credsPath)) {
  console.error('FATAL: --creds <path> required (temp supabase-cred.env)');
  process.exit(2);
}

const creds = {};
for (const line of fs.readFileSync(credsPath, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) creds[m[1]] = m[2];
}
const SUPABASE_URL = creds.SUPABASE_URL;
const SUPABASE_SECRET_KEY = creds.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_SECRET_KEY missing from cred file');
  process.exit(2);
}

const APP_TABLES = [
  'profiles', 'gyms', 'plans', 'plan_templates', 'settings', 'subscriptions',
  'subscription_history', 'payment_attempts', 'members', 'trainers',
  'diet_plans', 'workout_plans', 'progress_logs', 'payments', 'attendance',
  'notifications', 'support_tickets', 'support_ticket_replies',
  'support_ticket_notes', 'support_ticket_attachments', 'feature_requests',
  'contact_messages', 'whatsapp_campaigns', 'whatsapp_logs', 'licensed_devices',
  'license_history', 'referral_codes', 'referrals', 'reward_ledger',
  'discount_coupons', 'referral_audit_logs', 'audit_log', 'ai_conversations',
  'ai_conversation_messages', 'generated_reports',
];

const AUTH_EXPECTED = 25;

async function countRows(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=count`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      accept: 'application/json',
      prefer: 'count=exact',
    },
  });
  if (res.status === 404) return { exists: false, count: -1 };
  const count = parseInt(res.headers.get('content-range')?.split('/')[1] ?? 'NaN', 10);
  return { exists: true, count: Number.isNaN(count) ? -1 : count };
}

async function countAuthUsers() {
  // auth.users is not exposed via PostgREST by default; check via the
  // GoTrue admin REST endpoint (service_role can list users).
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    },
  });
  if (!res.ok) return { ok: false, status: res.status, count: -1 };
  const body = await res.json();
  return { ok: true, count: body?.users?.length ?? -1 };
}

const results = [];
let problems = 0;
for (const table of APP_TABLES) {
  const r = await countRows(table);
  results.push({ table, ...r });
  if (!r.exists) { problems++; console.log(`  MISSING  ${table}`); }
  else if (r.count !== 0) { problems++; console.log(`  NON-EMPTY ${table}: ${r.count} rows`); }
  else console.log(`  empty    ${table}`);
}

const auth = await countAuthUsers();
console.log(`\n[auth.users] ${auth.ok ? `${auth.count} users (expected ${AUTH_EXPECTED})` : `unreadable (status ${auth.status})`}`);
if (auth.ok && auth.count !== AUTH_EXPECTED) {
  problems++;
  console.log(`  !! auth.users count ${auth.count} != ${AUTH_EXPECTED}`);
}

console.log(`\n${problems === 0 ? 'PASS: all app tables exist and are empty.' : `FAIL: ${problems} problem(s) found.`}`);
process.exit(problems === 0 ? 0 : 1);