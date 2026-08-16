// IRONPULSE - Step 7B pre-flight: FK integrity verification of approved
// manifests against the 25 approved auth profiles and the imported gym set.
// READ-ONLY: no Firebase reads, no Supabase writes. Runs on masked manifests.
// Usage: node scripts/migration/preflight_fk_check.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const MIG = path.join(ROOT, 'migration-output');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(MIG, rel), 'utf8'));
}

function detUuid(legacyId) {
  const hex = crypto.createHash('sha256').update(String(legacyId)).digest('hex');
  return (
    hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' + hex.slice(20, 32)
  );
}

function norm(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === 'default' ? null : s;
}

const problems = [];
const notes = [];

function check(label, cond, detail) {
  if (!cond) problems.push(`${label}: ${detail}`);
  else notes.push(`${label}: ok`);
}

// ---- Load id-map (authoritative approved set = all mappings) ----
const idMap = readJson('summaries/firebase-to-supabase-id-map.json');
const approved = new Map(); // firebase_uid -> auth_uuid
for (const m of idMap.mappings || []) {
  if (m.firebase_uid && m.auth_uuid) approved.set(m.firebase_uid, m.auth_uuid);
}
console.log(`[id-map] approved mappings: ${approved.size} (expected 25)`);
check('id-map count = 25', approved.size === 25, `got ${approved.size}`);

// ---- Gym sets ----
const safeGyms = readJson('safe/gyms.json');
const manualGyms = readJson('manual-review/gyms.json');
const quarantineGyms = readJson('quarantine/gyms.json');
const importedGyms = new Set();
for (const g of [...safeGyms, ...manualGyms]) importedGyms.add(g.record.id);
const quarantineGymIds = new Set(quarantineGyms.map(g => g.record.id));
console.log(`[gyms] safe=${safeGyms.length} manual=${manualGyms.length} quarantine=${quarantineGyms.length}`);
notes.push(`gyms: imported=${[...importedGyms].join(', ')}`);
notes.push(`gyms: quarantine=${[...quarantineGymIds].join(', ')}`);

// Gym owner_uid must be approved-profile or NULL (legacy-only owner -> NULL)
const gymOwnerNulled = [];
for (const g of [...safeGyms, ...manualGyms]) {
  const ou = norm(g.record.owner_uid);
  if (ou && !approved.has(ou)) {
    gymOwnerNulled.push(`${g.record.id}: owner ${ou} legacy-only -> owner_uid NULL (nullable FK, documented)`);
  }
}
notes.push(`gyms owner_uid: ${gymOwnerNulled.length} nulled (${gymOwnerNulled.join('; ') || 'none'})`);

// ---- Profiles (safe + manual): 25 approved imported; 10 legacy-only excluded ----
const safeProfiles = readJson('safe/profiles.json');
const manualProfiles = readJson('manual-review/profiles.json');
const profileRows = [...safeProfiles, ...manualProfiles];
const legacyOnly = [];
const profileMiss = [];
const importedProfiles = [];
for (const p of profileRows) {
  const uid = p.record.firebase_uid;
  if (!approved.has(uid)) {
    legacyOnly.push(`${p.legacyId}`);
    continue;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(approved.get(uid))) {
    profileMiss.push(`${uid}: auth_uuid invalid`);
  }
  importedProfiles.push(uid);
}
check('profiles approved-set membership', profileMiss.length === 0, profileMiss.join('; '));
check('legacy-only exclusions = 10', legacyOnly.length === 10, `got ${legacyOnly.length}: ${legacyOnly.join(', ')}`);
notes.push(`profiles: importable=${importedProfiles.length} (safe=${safeProfiles.length}, manual-approved=${importedProfiles.length - safeProfiles.length}); excluded legacy-only=${legacyOnly.length}`);
// every approved uid must appear exactly once
const uidCount = new Map();
for (const p of profileRows) {
  if (approved.has(p.record.firebase_uid)) uidCount.set(p.record.firebase_uid, (uidCount.get(p.record.firebase_uid) || 0) + 1);
}
const dupUids = [...uidCount.entries()].filter(([, c]) => c !== 1);
check('profiles exactly-once', dupUids.length === 0, dupUids.map(([u, c]) => `${u} x${c}`).join('; '));
const missingProfiles = [...approved.keys()].filter(u => !uidCount.has(u));
check('all 25 approved have a manifest row', missingProfiles.length === 0,
  `approved but no profile manifest row: ${missingProfiles.join(', ')}`);

// ---- Plans: gym_id must be imported gym ----
const safePlans = readJson('safe/plans.json');
const planMiss = [];
for (const pl of safePlans) {
  const gid = norm(pl.record.gym_id);
  if (!gid || !importedGyms.has(gid)) planMiss.push(`${pl.legacyId} -> ${gid}`);
}
check('safe/plans gym refs', planMiss.length === 0, planMiss.join('; '));
notes.push(`plans: safe=${safePlans.length} importable`);

// ---- Settings: only platform ----
const safeSettings = readJson('safe/settings.json');
const settingsMiss = [];
for (const s of safeSettings) {
  const gid = norm(s.record.gym_id);
  if (gid !== 'platform') settingsMiss.push(`(${gid}, ${s.record.doc_id})`);
}
check('safe/settings platform-only', settingsMiss.length === 0, settingsMiss.join('; '));
notes.push(`settings: safe=${safeSettings.length} (platform)`);

// ---- Subscriptions: gym imported (quarantined gym -> must exclude) ----
const safeSubs = readJson('safe/subscriptions.json');
const subExcluded = [];
const subMiss = [];
const subIds = new Set();
for (const s of safeSubs) {
  subIds.add(s.record.id);
  const gid = norm(s.record.gym_id);
  if (!gid || !importedGyms.has(gid)) {
    if (gid && quarantineGymIds.has(gid)) subExcluded.push(`${s.legacyId} -> quarantined gym ${gid} (EXCLUDE)`);
    else subMiss.push(`${s.legacyId} -> ${gid}`);
  }
  const cb = norm(s.record.created_by);
  if (cb && !approved.has(cb)) subMiss.push(`${s.legacyId}: created_by ${cb} legacy-only`);
}
check('safe/subscriptions gym refs', subMiss.length === 0, subMiss.join('; '));
check('safe/subscriptions created_by refs', subMiss.length === 0, subMiss.join('; '));
notes.push(`subscriptions: safe=${safeSubs.length}, FK-excluded=${subExcluded.length} (${subExcluded.join('; ') || 'none'}), importable=${safeSubs.length - subExcluded.length}`);

// ---- Subscription history ----
const safeSubHist = readJson('safe/subscription_history.json');
const shMiss = [];
for (const h of safeSubHist) {
  const gid = norm(h.record.gym_id);
  if (!gid || !importedGyms.has(gid)) shMiss.push(`${h.legacyId} -> ${gid}`);
  const au = norm(h.record.actor_uid);
  if (au && !approved.has(au)) shMiss.push(`${h.legacyId}: actor ${au} legacy-only`);
  const sid = norm(h.record.subscription_id);
  if (sid && !subIds.has(sid)) shMiss.push(`${h.legacyId}: subscription_id ${sid} not in imported set`);
}
check('safe/subscription_history refs', shMiss.length === 0, shMiss.join('; '));
notes.push(`subscription_history: ${safeSubHist.length}`);

// ---- Notifications: user_id NOT NULL must be approved ----
const safeNotifs = readJson('safe/notifications.json');
const notifExcluded = [];
const notifMiss = [];
for (const n of safeNotifs) {
  const uid = norm(n.record.user_id);
  if (!uid || !approved.has(uid)) {
    if (uid && !approved.has(uid)) notifExcluded.push(`${n.legacyId}: user ${uid} legacy-only (EXCLUDE)`);
    else notifMiss.push(`${n.legacyId}: user_id missing`);
    continue;
  }
  const gid = norm(n.record.gym_id);
  if (gid && !importedGyms.has(gid)) notifMiss.push(`${n.legacyId} -> gym ${gid}`);
}
check('safe/notifications user refs', notifMiss.length === 0, notifMiss.join('; '));
check('safe/notifications gym refs', notifMiss.length === 0, notifMiss.join('; '));
notes.push(`notifications: safe=${safeNotifs.length}, FK-excluded=${notifExcluded.length} (${notifExcluded.join('; ') || 'none'}), importable=${safeNotifs.length - notifExcluded.length}`);

// ---- License history: gym imported; performed_by sentinel -> NULL ----
const safeLic = readJson('safe/license_history.json');
const licMiss = [];
const licSentinel = [];
for (const l of safeLic) {
  const gid = norm(l.record.gym_id);
  if (!gid || !importedGyms.has(gid)) licMiss.push(`${l.legacyId} -> ${gid}`);
  const pb = norm(l.record.performed_by);
  if (pb && !approved.has(pb)) licSentinel.push(`${l.legacyId}: performed_by '${pb}' -> NULL on import`);
}
check('safe/license_history gym refs', licMiss.length === 0, licMiss.join('; '));
notes.push(`license_history: ${safeLic.length}, sentinel performed_by nulled=${licSentinel.length} (${licSentinel.join('; ') || 'none'})`);

// ---- Referral codes ----
const safeRefCodes = readJson('safe/referral_codes.json');
const rcMiss = [];
for (const r of safeRefCodes) {
  const ru = norm(r.record.referrer_uid);
  if (ru && !approved.has(ru)) rcMiss.push(`${r.record.code}: referrer ${ru} legacy-only`);
}
check('safe/referral_codes referrer refs', rcMiss.length === 0, rcMiss.join('; '));
notes.push(`referral_codes: ${safeRefCodes.length}`);

// ---- AI conversations ----
const safeConv = readJson('safe/ai_conversations.json');
const convIds = new Set();
const convMiss = [];
for (const c of safeConv) {
  convIds.add(c.record.id);
  const uid = norm(c.record.user_id);
  if (!uid || !approved.has(uid)) convMiss.push(`${c.legacyId}: user ${uid}`);
  const gid = norm(c.record.gym_id);
  if (gid && !importedGyms.has(gid)) convMiss.push(`${c.legacyId} -> gym ${gid}`);
}
check('safe/ai_conversations refs', convMiss.length === 0, convMiss.join('; '));
notes.push(`ai_conversations: ${safeConv.length}`);

// ---- AI conversation messages ----
const safeMsgs = readJson('safe/ai_conversation_messages.json');
const msgMiss = new Set();
for (const m of safeMsgs) {
  const cid = norm(m.record.conversation_id);
  if (!cid || !convIds.has(cid)) msgMiss.add(cid || '<missing>');
}
check('safe/ai_conversation_messages conversation refs', msgMiss.size === 0, [...msgMiss].join(', '));
notes.push(`ai_conversation_messages: ${safeMsgs.length}`);

// ---- Contact messages (no FKs) ----
const safeContact = readJson('safe/contact_messages.json');
notes.push(`contact_messages: ${safeContact.length}`);

// ---- Quarantine totals ----
const q = {
  attendance: readJson('quarantine/attendance.json').length,
  gyms: quarantineGyms.length,
  members: readJson('quarantine/members.json').length,
  plans: readJson('quarantine/plans.json').length,
  notifications: readJson('quarantine/notifications.json').length,
};
const qTotal = Object.values(q).reduce((a, b) => a + b, 0);
check('quarantine total = 61', qTotal === 61, `got ${qTotal}: ${JSON.stringify(q)}`);
check('quarantine attendance = 49', q.attendance === 49, String(q.attendance));
check('quarantine gyms = 3', q.gyms === 3, String(q.gyms));
check('quarantine members = 1', q.members === 1, String(q.members));
check('quarantine plans = 4', q.plans === 4, String(q.plans));
check('quarantine notifications = 4', q.notifications === 4, String(q.notifications));

// ---- Reconciliation (258 source docs) ----
const importedCount = importedProfiles.length + importedGyms.size + safePlans.length + safeSettings.length +
  (safeSubs.length - subExcluded.length) + safeSubHist.length +
  (safeNotifs.length - notifExcluded.length) + safeLic.length + safeRefCodes.length +
  safeConv.length + safeMsgs.length + safeContact.length;
const excludedCount = legacyOnly.length + 6 + 6 + subExcluded.length + notifExcluded.length;
// legacyOnly profiles + 6 sentinel plans + 6 tenantless settings + FK exclusions
const recTotal = importedCount + excludedCount + qTotal;
console.log(`\n[reconcile] imported=${importedCount} excluded=${excludedCount} quarantine=${qTotal} total=${recTotal} (expected 258)`);
check('reconciliation = 258', recTotal === 258, `got ${recTotal}`);
check('imported profiles = 25', importedProfiles.length === 25, `got ${importedProfiles.length}`);

// ---- Report ----
console.log('\n=== PRE-FLIGHT FK CHECK ===');
for (const n of notes) console.log('  OK  ' + n);
if (problems.length) {
  console.log(`\n!!! ${problems.length} PROBLEM(S) !!!`);
  for (const p of problems) console.log('  FAIL  ' + p);
  process.exit(1);
}
console.log('\nAll FK references resolve against approved profiles + imported gyms.');
process.exit(0);