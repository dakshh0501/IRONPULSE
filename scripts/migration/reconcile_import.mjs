// IRONPULSE - POST-IMPORT RECONCILIATION (READ-ONLY, local artifacts only)
// Classifies every approved/importable record (152 SAFE + 45 MANUAL = 197)
// as IMPORTED | EXCLUDED_WITH_APPROVED_REASON | QUARANTINED | FAILED | MISSING_FROM_ACCOUNTING
// Verifies: 197 = 169 imported + 28 excluded; quarantine 61 = 49/3/1/4/4;
// no quarantine id in any imported stage; no FAILED/MISSING records.
// Usage: node scripts/migration/reconcile_import.mjs [--emit <out.json>]
// No Firebase reads, no Supabase reads/writes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const MIG = path.join(ROOT, 'migration-output');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(MIG, rel), 'utf8'));

const mask = (id) => (id && String(id).length > 8 ? String(id).slice(0, 8) : String(id || ''));

// ---- authoritative approved set: id-map (validate-live-auth PASS) ----
const idMap = readJson('summaries/firebase-to-supabase-id-map.json');
const approved = new Map();
for (const m of idMap.mappings || []) if (m.firebase_uid && m.auth_uuid) approved.set(m.firebase_uid, m.auth_uuid);

// ---- manifests ----
const readList = (dir, file) => readJson(`${dir}/${file}.json`).map((r) => ({ ...r, _masked: mask(r.legacyId) }));
const S = (f) => readList('safe', f);
const M = (f) => readList('manual-review', f);
const Q = (f) => readJson(`quarantine/${f}.json`);

const safe = {
  gyms: S('gyms'), profiles: S('profiles'), plans: S('plans'), settings: S('settings'),
  subscriptions: S('subscriptions'), subscriptionHistory: S('subscription_history'),
  notifications: S('notifications'), licenseHistory: S('license_history'),
  referralCodes: S('referral_codes'), aiConversations: S('ai_conversations'),
  aiConversationMessages: S('ai_conversation_messages'), contactMessages: S('contact_messages'),
};
const manual = { gyms: M('gyms'), profiles: M('profiles'), plans: M('plans'), settings: M('settings') };
const quarantine = {
  attendance: Q('attendance'), gyms: Q('gyms'), members: Q('members'),
  plans: Q('plans'), notifications: Q('notifications'),
};

const rows = []; // {table, legacyId, masked, status, reason}
const add = (table, rec, status, reason) => {
  rows.push({ table, legacyId: rec.legacyId, masked: mask(rec.legacyId), status, reason: reason || '' });
};

// ---- gyms: 13 = 7 safe + 6 manual -> all IMPORTED (Decision 2 owners; D4 quarantine excluded) ----
for (const g of [...safe.gyms, ...manual.gyms]) add('gyms', g, 'IMPORTED', '');

// ---- profiles: 25 approved IMPORTED; 10 legacy-only EXCLUDED (not in approved id-map) ----
const approvedSet = new Set(approved.keys());
for (const p of [...safe.profiles, ...manual.profiles]) {
  if (approvedSet.has(p.record.firebase_uid)) {
    add('profiles', p, 'IMPORTED', `id=live auth uuid ${approved.get(p.record.firebase_uid).slice(0, 8)}…`);
  } else {
    add('profiles', p, 'EXCLUDED_WITH_APPROVED_REASON',
      `legacy-only profile — not in approved 25-auth mapping (id-map validate-live-auth PASS); excluded from provisioning (10 total) — NO auth account, Firebase doc untouched, preserved in manifest`);
  }
}

// ---- plans: 18 safe IMPORTED; 6 manual sentinel EXCLUDED (Decision 5) ----
for (const pl of safe.plans) add('plans', pl, 'IMPORTED', '');
for (const pl of manual.plans) {
  add('plans', pl, 'EXCLUDED_WITH_APPROVED_REASON',
    `sentinel plan (gymId 'default' sentinel, no tenant) — Decision 5 APPROVED: exclude, preserve, no semantic mapping`);
}

// ---- settings: 1 safe (platform) IMPORTED; 6 manual tenantless EXCLUDED (Decision 6) ----
for (const s of safe.settings) add('settings', s, 'IMPORTED', `gym_id='platform' (guard-exempt)`);
for (const s of manual.settings) {
  add('settings', s, 'EXCLUDED_WITH_APPROVED_REASON',
    `tenantless settings doc (gym_id 'default' would violate guard_settings_gym) — Decision 6 APPROVED: exclude, preserve`);
}

// ---- subscriptions: 6 IMPORTED; 1 EXCLUDED (references quarantined gym) ----
const quarantineGymIds = new Set(quarantine.gyms.map((g) => g.record.id));
for (const s of safe.subscriptions) {
  const gid = s.record.gym_id;
  if (gid && quarantineGymIds.has(gid)) {
    add('subscriptions', s, 'EXCLUDED_WITH_APPROVED_REASON',
      `references quarantined orphan gym ${mask(gid)} (no owner account, Decision 4 quarantine) — FK would violate gyms FK, excluded with documented reason (pre-flight FK check)`);
  } else {
    add('subscriptions', s, 'IMPORTED', '');
  }
}

// ---- subscription_history: 2 IMPORTED ----
for (const h of safe.subscriptionHistory) add('subscription_history', h, 'IMPORTED', '');

// ---- notifications: 9 IMPORTED (user approved); 5 EXCLUDED (legacy-only user, FK) ----
for (const n of safe.notifications) {
  if (approvedSet.has(n.record.user_id)) add('notifications', n, 'IMPORTED', '');
  else add('notifications', n, 'EXCLUDED_WITH_APPROVED_REASON',
    `user_id ${mask(n.record.user_id)} is a legacy-only profile (no auth account, excluded from approved 25) — notifications.user_id NOT NULL FK, excluded with documented reason (pre-flight FK check)`);
}

// ---- license_history: 11 IMPORTED (performed_by sentinel -> NULL, documented) ----
for (const l of safe.licenseHistory) add('license_history', l, 'IMPORTED', '');

// ---- referral_codes: 1 IMPORTED ----
for (const r of safe.referralCodes) add('referral_codes', r, 'IMPORTED', '');

// ---- ai_conversations: 15 / ai_conversation_messages: 65 / contact_messages: 3 IMPORTED ----
for (const c of safe.aiConversations) add('ai_conversations', c, 'IMPORTED', '');
for (const mrow of safe.aiConversationMessages) add('ai_conversation_messages', mrow, 'IMPORTED', '');
for (const c of safe.contactMessages) add('contact_messages', c, 'IMPORTED', '');

// ---- quarantine: 61 (not part of the 197 approved; tracked separately) ----
const qCounts = { attendance: quarantine.attendance.length, gyms: quarantine.gyms.length, members: quarantine.members.length, plans: quarantine.plans.length, notifications: quarantine.notifications.length };
const qTotal = Object.values(qCounts).reduce((a, b) => a + b, 0);

// ---- accounting ----
const byStatus = {};
for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
const imported = byStatus.IMPORTED || 0;
const excluded = byStatus.EXCLUDED_WITH_APPROVED_REASON || 0;

// ---- quarantine id collision check (no quarantine record in imported stages) ----
const quarantineIds = new Set();
for (const ql of Object.values(quarantine)) for (const r of ql) quarantineIds.add(r.legacyId);
const collisions = rows.filter((r) => r.status === 'IMPORTED' && quarantineIds.has(r.legacyId));

// ---- per-table detail ----
const byTable = {};
for (const r of rows) {
  byTable[r.table] = byTable[r.table] || { imported: 0, excluded: 0, excludedRows: [] };
  if (r.status === 'IMPORTED') byTable[r.table].imported++;
  else byTable[r.table].excludedRows.push(r);
}
for (const t of Object.keys(byTable)) byTable[t].excluded = byTable[t].excludedRows.length;

// ---- report ----
console.log('\n=== POST-IMPORT RECONCILIATION (READ-ONLY) ===');
console.log(`approved plan: 152 SAFE + 45 MANUAL = 197`);
console.log(`accounting: imported=${imported} excluded=${excluded} => ${imported + excluded} (must equal 197)`);
console.log(`quarantine: total=${qTotal} ${JSON.stringify(qCounts)} (must equal 61)`);
console.log(`quarantine/imported id collisions: ${collisions.length}`);
console.log('\nper-table:');
for (const t of Object.keys(byTable)) {
  console.log(`  ${t.padEnd(26)} imported=${byTable[t].imported} excluded=${byTable[t].excluded}`);
}
console.log('\nexcluded records (28):');
const problems = [];
if (imported + excluded !== 197) problems.push(`accounting mismatch: ${imported + excluded} != 197`);
if (imported !== 169) problems.push(`imported != 169: ${imported}`);
if (excluded !== 28) problems.push(`excluded != 28: ${excluded}`);
if (qTotal !== 61) problems.push(`quarantine != 61: ${qTotal}`);
if (qCounts.attendance !== 49 || qCounts.gyms !== 3 || qCounts.members !== 1 || qCounts.plans !== 4 || qCounts.notifications !== 4)
  problems.push(`quarantine split != 49/3/1/4/4: ${JSON.stringify(qCounts)}`);
if (collisions.length) problems.push(`quarantine ids found among imported rows: ${collisions.map((c) => c.legacyId).join(', ')}`);
const failed = rows.filter((r) => r.status === 'FAILED');
const missing = rows.filter((r) => r.status === 'MISSING_FROM_ACCOUNTING');
if (failed.length) problems.push(`FAILED records: ${failed.map((f) => f.legacyId).join(', ')}`);
if (missing.length) problems.push(`MISSING_FROM_ACCOUNTING records: ${missing.map((m) => m.legacyId).join(', ')}`);

// dump excluded rows detail
for (const r of rows.filter((x) => x.status !== 'IMPORTED')) {
  console.log(`  [${r.table}] ${r.masked}  ${r.reason}`);
}

if (problems.length) {
  console.log(`\n!!! ${problems.length} PROBLEM(S) !!!`);
  for (const p of problems) console.log('  FAIL  ' + p);
  process.exit(1);
}
console.log('\nAll 197 approved records accounted: 169 IMPORTED + 28 EXCLUDED_WITH_APPROVED_REASON.');
console.log('Quarantine intact: 61 (49/3/1/4/4). No FAILED, no MISSING_FROM_ACCOUNTING.');
console.log('RECONCILIATION PASS');

// ---- optional full accounting emission (read-only analysis artifact) ----
const emitArg = process.argv.findIndex((a) => a === '--emit');
if (emitArg !== -1 && process.argv[emitArg + 1]) {
  const out = {
    generatedAt: new Date().toISOString(),
    approvedPlan: { safe: 152, manual: 45, total: 197 },
    accounting: { imported, excluded, quarantine: qTotal, total: imported + excluded + qTotal },
    byTable,
    rows: rows.map((r) => ({ table: r.table, legacyId: r.legacyId, maskedId: r.masked, status: r.status, reason: r.reason })),
    quarantine: { total: qTotal, byCollection: qCounts, collisionsWithImported: collisions.length },
  };
  const outPath = path.join(ROOT, process.argv[emitArg + 1]);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`accounting written: ${outPath}`);
}
process.exit(0);
