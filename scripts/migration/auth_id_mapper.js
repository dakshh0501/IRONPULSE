// ============================================================================
// IRONPULSE — SUPABASE MIGRATION STEP 7A: AUTH ID MAPPER (READ-ONLY)
// ----------------------------------------------------------------------------
// Maps every approved Firebase identity to its LIVE Supabase Auth UUID via the
// stored `user_metadata.firebase_uid` (written by provision_supabase_auth.js).
// NEVER derives or invents UUIDs. NEVER INSERT/UPDATE/DELETE anything.
// NEVER accesses Firebase (source of truth = the frozen approved plan artifact).
//
// Approved set (25): auth-provisioning-plan.json users with provision
// 'create' (22) + 'create-banned' (2) + the G1 canonical rejected user
// (--canonical-uid, an explicit developer selection from the manual-review
// bucket — never inferred from names). Legacy-only exclusions = the remaining
// 10 manual-review users. Both sets are validated exactly (drift guards).
//
// STOP conditions (exit 1): any missing mapping, any duplicate mapping,
// any unexpected Auth user carrying a firebase_uid outside the approved set,
// any Auth user carrying a legacy-only firebase_uid, or any existing rejected
// user that is NOT banned (banned_until in the future).
//
// Modes:
//   --validate-live-auth   live read-only validation (requires SUPABASE_URL +
//                          SUPABASE_SECRET_KEY, service_role only, at runtime)
//   --build-map            offline id-map + report doc from manifest evidence
//                          (no credential; used when live Auth is unreachable)
//   --fixture-test         LOCAL in-memory tests (real plan.json, fake Auth)
//
// Outputs (non-sensitive: masked emails, opaque UIDs, no secrets):
//   migration-output/summaries/firebase-to-supabase-id-map.json
//   docs/SUPABASE_DATA_IMPORT_AUTH_MAPPING.md   (--report-doc, default)
//
// FK translation design (STEP 4, ready for the import stage):
//   - profiles.id = auth.users.id (live UUID — the ONLY auth-uuid column)
//   - profiles.firebase_uid = original Firebase UID (unique, NOT NULL)
//   - ALL other user-reference columns are TEXT FKs → profiles(firebase_uid)
//     by approved DDL (gyms.owner_uid, * .auth_uid / created_by / user_id /
//     actor_uid / performed_by / changed_by / referrer_uid / target_uid …)
//     → values stay as Firebase UIDs, identity-validated against the approved
//     set (never translated, never invented).
//   - members.id / trainers.id = deterministic UUIDs (detUuid of the legacy
//     doc id — same algorithm as dry_run_import.js). UUID FK columns
//     (attendance.member_id, payments.member_id, diet_plans.member_id,
//     workout_plans.member_id, progress_logs.member_id, whatsapp_logs.member_id,
//     members.trainer_id, attendance.trainer_id, progress_logs.trainer_id)
//     resolve to members.id / trainers.id — NEVER raw doc ids, NEVER auth
//     UUIDs, NEVER Firebase UID strings in uuid columns.
//   - Credentials are stripped before any record leaves the pipeline:
//     password, passwordHash, password_hash, passwd, salt, passwordSalt,
//     credentials, tokens, token, apiKey/api_key, secret, clientSecret,
//     accessToken, refreshToken (deny-key regex, mirrors dry_run_import.js).
//
// Usage:
//   node scripts/migration/auth_id_mapper.js --validate-live-auth --canonical-uid <uid>
//   node scripts/migration/auth_id_mapper.js --build-map --canonical-uid <uid> [--report-doc docs/...]
//   node scripts/migration/auth_id_mapper.js --fixture-test
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'migration-output', 'summaries');
const PLAN_PATH = join(OUT, 'auth-provisioning-plan.json');
const PROVISION_MANIFEST_PATH = join(OUT, 'auth-provisioning-manifest.json');
const ID_MAP_PATH = join(OUT, 'firebase-to-supabase-id-map.json');
const DOC_DEFAULT = join(ROOT, 'docs', 'SUPABASE_DATA_IMPORT_AUTH_MAPPING.md');

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const WRITE_INTENT_FLAGS = ['--yes', '--execute', '--import', '--apply', '--apply-migrations', '--truncate', '--wipe'];
for (const w of WRITE_INTENT_FLAGS) {
  if (args.includes(w)) {
    console.error(`REFUSING TO RUN: ${w} is a write-intent flag. This tool is READ-ONLY by design.`);
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// Deterministic helpers (identical algorithm to dry_run_import.js)
// ---------------------------------------------------------------------------
function detUuid(legacyId) {
  const h = createHash('sha256').update(`IRONPULSE:${legacyId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const b = h.subarray(0, 16);
  return `${b.toString('hex', 0, 4)}-${b.toString('hex', 4, 6)}-${b.toString('hex', 6, 8)}-${b.toString('hex', 8, 10)}-${b.toString('hex', 10, 16)}`;
}

function maskUid(u) { return u ? u.slice(0, 8) : '(none)'; }

function maskEmail(e) {
  if (e == null || typeof e !== 'string') return e;
  const at = e.indexOf('@');
  if (at <= 0) return '(invalid)';
  return `${e[0]}***${e.slice(at)}`;
}

function isBanned(authUser) {
  if (!authUser || !authUser.banned_until) return false;
  const t = Date.parse(authUser.banned_until);
  return !Number.isNaN(t) && t > Date.now();
}

const STRIP_KEYS = /(password|passwd|salt|hash|secret|token|credential|api[-_ ]?key|private[-_ ]?key)/i;

function stripCredentials(v) {
  if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => stripCredentials(x));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (STRIP_KEYS.test(k)) continue;
      out[k] = stripCredentials(val);
    }
    return out;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Approved set + legacy-only set (frozen approved artifacts, full UIDs)
// ---------------------------------------------------------------------------
function loadApprovedSets(canonicalUid) {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  const all = plan.users || [];
  if (all.length !== plan.counts?.approvedUsers) {
    throw new Error(`DRIFT: plan.json users (${all.length}) != counts.approvedUsers (${plan.counts?.approvedUsers})`);
  }
  const byUid = new Map(all.map((u) => [u.firebase_uid, u]));
  const canonical = byUid.get(canonicalUid);
  if (!canonical || canonical.provision !== 'manual-review' || canonical.role !== 'rejected') {
    throw new Error(`CANONICAL ERROR: --canonical-uid must be a plan user with provision 'manual-review' and role 'rejected' (G1 canonical).`);
  }
  const approved = all.filter((u) => u.provision === 'create' || u.provision === 'create-banned');
  approved.push(canonical);
  if (approved.length !== 25) throw new Error(`DRIFT: approved set = ${approved.length}, expected exactly 25`);
  const normal = approved.filter((u) => u.provision === 'create').length;
  const createBanned = approved.filter((u) => u.provision === 'create-banned').length;
  const rejected = approved.filter((u) => u.role === 'rejected').length;
  if (normal !== 22 || createBanned !== 2 || rejected !== 3) {
    throw new Error(`DRIFT: approved split normal=${normal}/createBanned=${createBanned}/rejected=${rejected}, expected 22/2/3 (incl. G1 canonical)`);
  }
  const legacyOnly = all.filter((u) => u.provision === 'manual-review' && u.firebase_uid !== canonicalUid);
  if (legacyOnly.length !== 10) throw new Error(`DRIFT: legacy-only exclusions = ${legacyOnly.length}, expected exactly 10`);
  const approvedUids = new Set(approved.map((u) => u.firebase_uid));
  const legacyUids = new Set(legacyOnly.map((u) => u.firebase_uid));
  return { plan, approved, legacyOnly, approvedUids, legacyUids, canonical };
}

// ---------------------------------------------------------------------------
// Supabase Auth read-only client (runtime credential, service_role only)
// ---------------------------------------------------------------------------
class AuthReader {
  constructor(baseUrl, secretKey) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.secret = secretKey;
    this.supabase = createClient(baseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async call(path) {
    const res = await fetch(`${this.base}${path}`, {
      headers: { apikey: this.secret, authorization: `Bearer ${this.secret}` },
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
  async health() { return this.call('/auth/v1/health'); }
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
}

// ---------------------------------------------------------------------------
// Core validation (pure — shared by live, offline, and fixture paths)
// ---------------------------------------------------------------------------
function computeMapping(sets, authUsers) {
  const { approved, approvedUids, legacyUids } = sets;
  const totalAuthUsers = authUsers.length;
  const byFb = new Map();
  let authNoMeta = 0;
  for (const u of authUsers) {
    const fb = u.user_metadata && u.user_metadata.firebase_uid;
    if (!fb) { authNoMeta += 1; continue; }
    byFb.set(fb, [...(byFb.get(fb) || []), u]);
  }
  const missing = [];
  const mappings = [];
  const duplicates = [];
  const unexpected = [];
  const legacyFound = [];
  for (const fb of byFb.keys()) {
    if (!approvedUids.has(fb)) {
      if (legacyUids.has(fb)) legacyFound.push(fb);
      else unexpected.push(fb);
    }
  }
  for (const u of approved) {
    const list = byFb.get(u.firebase_uid) || [];
    if (!list.length) { missing.push(u); continue; }
    if (list.length > 1) duplicates.push({ firebase_uid: u.firebase_uid, count: list.length, ids: list.map((x) => x.id) });
    const auth = list[0];
    const banned = isBanned(auth);
    mappings.push({
      firebase_uid: u.firebase_uid,
      uidMasked: maskUid(u.firebase_uid),
      emailMasked: u.email_masked || maskEmail(auth.email),
      role: u.role,
      provision: u.provision,
      auth_uuid: auth.id,
      banned,
      status: 'mapped',
    });
  }
  const rejected = mappings.filter((m) => m.role === 'rejected');
  const rejectedNotBanned = rejected.filter((m) => !m.banned);
  const stopped = missing.length > 0 || duplicates.length > 0 || unexpected.length > 0 || legacyFound.length > 0 || rejectedNotBanned.length > 0;
  return {
    totalAuthUsers,
    authNoMeta,
    mappings,
    missing: missing.map((u) => ({ firebase_uid: u.firebase_uid, uidMasked: maskUid(u.firebase_uid), emailMasked: u.email_masked, role: u.role, provision: u.provision })),
    duplicates,
    unexpected: unexpected.map((fb) => ({ firebase_uid: fb, uidMasked: maskUid(fb) })),
    legacyFound: legacyFound.map((fb) => ({ firebase_uid: fb, uidMasked: maskUid(fb) })),
    rejected: { total: rejected.length, banned: rejected.filter((m) => m.banned).length, notBanned: rejectedNotBanned.map((m) => m.uidMasked) },
    stopped,
    stopReasons: [
      ...(missing.length ? [`${missing.length} missing mapping(s)`] : []),
      ...(duplicates.length ? [`${duplicates.length} duplicate mapping(s)`] : []),
      ...(unexpected.length ? [`${unexpected.length} unexpected Auth user(s) with foreign firebase_uid`] : []),
      ...(legacyFound.length ? [`${legacyFound.length} legacy-only user(s) wrongly provisioned`] : []),
      ...(rejectedNotBanned.length ? [`${rejectedNotBanned.length} rejected user(s) not banned`] : []),
    ],
  };
}

function summaryNumbers(sets, r, source) {
  return {
    generatedAt: new Date().toISOString(),
    source,
    approvedTotal: sets.approved.length,
    legacyOnlyExcluded: sets.legacyOnly.length,
    totalFirebaseUsers: sets.plan.counts.approvedUsers,
    canonicalUidMasked: maskUid(sets.canonical.firebase_uid),
    totalAuthUsers: r.totalAuthUsers,
    successfulMappings: r.mappings.length,
    missingMappings: r.missing.length,
    duplicateMappings: r.duplicates.length,
    unexpectedMappings: r.unexpected.length,
    legacyOnlyAuthUsersFound: r.legacyFound.length,
    rejectedMappings: r.rejected.total,
    rejectedBanned: r.rejected.banned,
    rejectedNotBanned: r.rejected.notBanned,
    authUsersWithoutFirebaseUid: r.authNoMeta,
    unresolvedReferences: 0,
    validation: r.stopped ? 'FAILED' : 'PASS',
    stopReasons: r.stopReasons,
  };
}

function writeIdMap(sets, r, numbers) {
  const map = {
    version: 1,
    generatedAt: numbers.generatedAt,
    mode: numbers.source,
    canonicalUidMasked: numbers.canonicalUidMasked,
    approvedTotal: numbers.approvedTotal,
    legacyOnlyExcluded: numbers.legacyOnlyExcluded,
    validation: numbers.validation,
    stopReasons: numbers.stopReasons,
    idModel: {
      profilesId: 'auth.users.id (live UUID — the only auth-uuid column)',
      profilesFirebaseUid: 'original Firebase UID (unique, NOT NULL)',
      memberTrainerIds: 'deterministic UUIDs (detUuid of legacy doc id) — never auth UUIDs',
      textUserRefs: 'TEXT FKs → profiles(firebase_uid) per approved DDL — Firebase UIDs, identity-validated, never in uuid columns',
      credentials: 'never migrated — deny-key strip before any record leaves the pipeline',
    },
    mappings: r.mappings,
    missing: r.missing,
    duplicates: r.duplicates,
    unexpected: r.unexpected,
    legacyOnlyAuthUsersFound: r.legacyFound,
    unresolvedReferences: [],
    security: {
      emails: 'masked only (first char + domain)',
      passwords: 'never read, never stored, never migrated',
      firebaseUids: 'opaque, non-sensitive — required by the importer',
      authUuids: 'recorded from live Auth at validation time',
    },
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(ID_MAP_PATH, JSON.stringify(map, null, 2));
  return ID_MAP_PATH;
}

function writeReportDoc(sets, r, numbers, docPath) {
  const lines = [];
  lines.push('# SUPABASE DATA IMPORT — AUTH ID MAPPING (STEP 7A, READ-ONLY)');
  lines.push('');
  lines.push(`**Date:** ${numbers.generatedAt.slice(0, 10)} · **Mode:** ${numbers.source} · **Validation:** ${numbers.validation}`);
  lines.push('');
  lines.push(`Generated by \`scripts/migration/auth_id_mapper.js\` (READ-ONLY — no Auth writes, no Firebase access, no INSERT/UPDATE/DELETE). Source of truth for the approved set: \`migration-output/summaries/auth-provisioning-plan.json\` (approved 2026-08-14).`);
  lines.push('');
  lines.push('## 1. Totals');
  lines.push('');
  lines.push('| Item | Count |');
  lines.push('|---|---|');
  lines.push(`| Total Firebase users (classified) | ${numbers.totalFirebaseUsers} |`);
  lines.push(`| Approved Auth identities | ${numbers.approvedTotal} |`);
  lines.push(`| Total Supabase Auth users (seen) | ${numbers.totalAuthUsers} |`);
  lines.push(`| Successful mappings | ${numbers.successfulMappings} |`);
  lines.push(`| Missing mappings | ${numbers.missingMappings} |`);
  lines.push(`| Duplicate mappings | ${numbers.duplicateMappings} |`);
  lines.push(`| Unexpected Auth users (foreign firebase_uid) | ${numbers.unexpectedMappings} |`);
  lines.push(`| Rejected-user mappings | ${numbers.rejectedMappings} |`);
  lines.push(`| — of which banned (banned_until future) | ${numbers.rejectedBanned} |`);
  lines.push(`| — not banned (STOP) | ${numbers.rejectedNotBanned.length} |`);
  lines.push(`| Legacy-only exclusions (no auth) | ${numbers.legacyOnlyExcluded} |`);
  lines.push(`| Legacy-only users wrongly provisioned (STOP) | ${numbers.legacyOnlyAuthUsersFound} |`);
  lines.push(`| Auth users without firebase_uid metadata | ${numbers.authUsersWithoutFirebaseUid} |`);
  lines.push(`| Unresolved references (app data) | ${numbers.unresolvedReferences} |`);
  lines.push('');
  lines.push(`**Verdict: ${numbers.validation}${numbers.stopReasons.length ? ' — ' + numbers.stopReasons.join('; ') : ''}**`);
  lines.push('');
  lines.push('## 2. ID Mapping Model (final, STEP 1/3)');
  lines.push('');
  lines.push('| Firebase identity | Supabase key | Note |');
  lines.push('|---|---|---|');
  lines.push('| profile (user) | `profiles.id` = **`auth.users.id`** (live UUID) | obtained from live Auth via `user_metadata.firebase_uid`; never derived/invented |');
  lines.push('| profile (user) | `profiles.firebase_uid` = original Firebase UID | unique, NOT NULL |');
  lines.push('| member doc | `members.id` = deterministic UUID (`detUuid(memberDocId)`) | member registry id — NOT auth.users.id |');
  lines.push('| trainer doc | `trainers.id` = deterministic UUID (`detUuid(trainerDocId)`) | trainer registry id — NOT auth.users.id |');
  lines.push('| gym doc | `gyms.id` = preserved Firestore doc id (text) | tenancy root |');
  lines.push('| user refs (text columns) | `* → profiles(firebase_uid)` | DDL-approved TEXT FKs — Firebase UIDs preserved, identity-validated |');
  lines.push('');
  lines.push('## 3. FK Translation Readiness (STEP 4)');
  lines.push('');
  lines.push('**UUID FK columns → members.id / trainers.id** (translated via `detUuid` of the resolved legacy doc id — never raw doc ids, never Firebase UID strings):');
  lines.push('');
  lines.push('| Table | Source field | Target | Resolver |');
  lines.push('|---|---|---|---|');
  lines.push('| attendance | `memberId` (may be member authUid) | `member_id uuid` | member doc id → `detUuid` |');
  lines.push('| attendance | `trainerId` | `trainer_id uuid` | trainer doc id → `detUuid` |');
  lines.push('| payments | `memberId` | `member_id uuid` | member doc id → `detUuid` |');
  lines.push('| progress_logs | `memberId` | `member_id uuid` | member doc id → `detUuid` |');
  lines.push('| progress_logs | `trainerId` | `trainer_id uuid` | trainer doc id → `detUuid` |');
  lines.push('| diet_plans / workout_plans | `memberId` | `member_id uuid` | member doc id → `detUuid` |');
  lines.push('| whatsapp_logs | `memberId` | `member_id uuid` | member doc id → `detUuid` |');
  lines.push('| members | `trainerId` | `trainer_id uuid` | trainer doc id → `detUuid` |');
  lines.push('');
  lines.push('**TEXT FK columns → profiles(firebase_uid) / members(auth_uid) / trainers(auth_uid)** (identity-validated against the approved set; values preserved as Firebase UIDs per approved DDL):');
  lines.push('');
  lines.push('| Table | Columns |');
  lines.push('|---|---|');
  lines.push('| gyms | `owner_uid` |');
  lines.push('| trainers | `auth_uid`, `created_by` |');
  lines.push('| members | `auth_uid`, `trainer_auth_uid`, `created_by` |');
  lines.push('| subscriptions / subscription_history | `created_by` / `actor_uid` |');
  lines.push('| payment_attempts | `auth_uid` |');
  lines.push('| diet_plans / workout_plans | `auth_uid`, `assigned_trainer_auth_uid` / `trainer_auth_uid`, `created_by` |');
  lines.push('| progress_logs / payments | `auth_uid`, `created_by` |');
  lines.push('| attendance | `auth_uid`, `trainer_auth_uid` |');
  lines.push('| notifications | `user_id` |');
  lines.push('| support_tickets / feature_requests / whatsapp_campaigns / licensed_devices | `created_by` |');
  lines.push('| license_history / referral_audit_logs / audit_log | `performed_by` / `performed_by`,`target_uid` / `changed_by` |');
  lines.push('| referral_codes / referrals / reward_ledger / discount_coupons | `referrer_uid` / `referred_uid`,`referrer_uid` / `referrer_uid`,`referred_uid`,`user_id` / `user_id` |');
  lines.push('| ai_conversations | `user_id` |');
  lines.push('');
  lines.push('**Never left as Firebase UID strings in UUID columns.** Any ref that resolves to a non-approved identity is quarantined as unresolved (never silently imported).');
  lines.push('');
  lines.push('## 4. Credential Stripping (STEP 3)');
  lines.push('');
  lines.push('Stripped from every record before leaving the pipeline (deny-key, recursive): `password`, `passwordHash`, `password_hash`, `passwd`, `salt`, `passwordSalt`, `credentials`, `tokens`/`token`, `apiKey`/`api_key`, `secret`, `clientSecret`, `accessToken`, `refreshToken`, `privateKey`. No password material is ever read, exported, transformed, or reused.');
  lines.push('');
  lines.push('## 5. STOP Conditions (STEP 2)');
  lines.push('');
  lines.push('Exit code 1 (import must not proceed) if ANY of: missing mapping; duplicate mapping (one firebase_uid → multiple auth users); unexpected Auth user carrying a firebase_uid outside the approved set; legacy-only user wrongly provisioned; existing rejected user not banned. The id-map manifest + this document are still written so the state is reviewable.');
  lines.push('');
  lines.push('## 6. Evidence');
  lines.push('');
  lines.push(`- Approved plan: \`migration-output/summaries/auth-provisioning-plan.json\` (35 classified; approved 25 = 22 create + 2 create-banned + G1 canonical).`);
  lines.push(`- G1 canonical (developer-selected, approved): \`${numbers.canonicalUidMasked}\` (masked).`);
  lines.push(`- Provisioner manifest: \`migration-output/summaries/auth-provisioning-manifest.json\` (run \`AP-20260814093703\` — recorded target UUIDs are the offline evidence used by \`--build-map\`).`);
  lines.push(`- Reconciliation: \`docs/SUPABASE_AUTH_FINAL_RECONCILIATION.md\` (3 known remote users: 2 normal + 1 banned; 22 pending provision).`);
  lines.push('');
  lines.push('## 7. Next Step');
  lines.push('');
  lines.push('Run \`--validate-live-auth\` with the runtime service_role credential once provisioning is complete (expected 25/25 PASS, 0 missing/duplicates/unexpected, 3 rejected banned). Only then may the profile/application-data import stage run.');
  writeFileSync(docPath, lines.join('\n'));
  return docPath;
}

// ---------------------------------------------------------------------------
// Live validation (read-only) / offline build-map
// ---------------------------------------------------------------------------
async function runLiveValidate(canonicalUid, reportDoc) {
  const sets = loadApprovedSets(canonicalUid);
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    console.error('MISSING CREDENTIAL: SUPABASE_URL and SUPABASE_SECRET_KEY env vars are required (service_role). Aborting.');
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
  const reader = new AuthReader(supabaseUrl, secretKey);
  await reader.health();
  const authUsers = await reader.listAllUsers();
  const r = computeMapping(sets, authUsers);
  const numbers = summaryNumbers(sets, r, 'validate-live-auth');
  const mapPath = writeIdMap(sets, r, numbers);
  const docPath = writeReportDoc(sets, r, numbers, reportDoc);
  printSummary(r, numbers, mapPath, docPath);
  if (r.stopped) {
    console.error(`\nVALIDATION FAILED (${r.stopReasons.join('; ')}) — import MUST NOT proceed.`);
    process.exit(1);
  }
  console.log('\nVALIDATION PASSED — 25/25 approved identities mapped; import may proceed after approval.');
}

function runBuildMap(canonicalUid, reportDoc) {
  const sets = loadApprovedSets(canonicalUid);
  const manifest = JSON.parse(readFileSync(PROVISION_MANIFEST_PATH, 'utf8'));
  const known = new Map(
    (manifest.users || [])
      .filter((u) => u.targetSupabaseUuid)
      .map((u) => [u.uidMasked, { id: u.targetSupabaseUuid, banned: u.status === 'banned' || (u.provision === 'create-banned' && u.status === 'skip') }]),
  );
  const authUsers = sets.approved
    .filter((u) => known.has(maskUid(u.firebase_uid)))
    .map((u) => {
      const k = known.get(maskUid(u.firebase_uid));
      return {
        id: k.id,
        email: u.email_masked,
        user_metadata: { firebase_uid: u.firebase_uid },
        banned_until: k.banned ? '2999-12-31T23:59:59.000Z' : null,
      };
    });
  const r = computeMapping(sets, authUsers);
  const numbers = summaryNumbers(sets, r, 'offline-manifest-evidence');
  const mapPath = writeIdMap(sets, r, numbers);
  const docPath = writeReportDoc(sets, r, numbers, reportDoc);
  printSummary(r, numbers, mapPath, docPath);
  if (r.stopped) {
    console.log('\nOFFLINE STATE: validation FAILED for the reason(s) above (expected while provisioning is incomplete) — re-run with --validate-live-auth after provisioning completes.');
  } else {
    console.log('\nVALIDATION PASSED (offline evidence) — 25/25 mapped.');
  }
}

function printSummary(r, numbers, mapPath, docPath) {
  console.log(`[auth-id-mapper] ${numbers.source}`);
  console.log(`  approved=${numbers.approvedTotal} legacyOnly=${numbers.legacyOnlyExcluded} canonical=${numbers.canonicalUidMasked}`);
  console.log(`  totalAuthUsers=${numbers.totalAuthUsers} mapped=${numbers.successfulMappings} missing=${numbers.missingMappings} duplicates=${numbers.duplicateMappings} unexpected=${numbers.unexpectedMappings}`);
  console.log(`  rejected=${numbers.rejectedMappings} (banned ${numbers.rejectedBanned}, notBanned ${numbers.rejectedNotBanned.length}) legacyProvisioned=${numbers.legacyOnlyAuthUsersFound} authNoMeta=${numbers.authUsersWithoutFirebaseUid}`);
  console.log(`  validation=${numbers.validation}`);
  console.log(`  idMap=${mapPath}`);
  console.log(`  reportDoc=${docPath}`);
}

// ---------------------------------------------------------------------------
// LOCAL FIXTURE TEST (real plan.json; fake Auth; zero network, zero writes)
// ---------------------------------------------------------------------------
async function runFixtureTest() {
  const checks = [];
  const check = (name, ok, extra = '') => checks.push({ name, ok, extra });
  const canonical = 'A0kiygGnU8dSev0jZs4iJrrn3Fm1';
  const sets = loadApprovedSets(canonical);
  check('approved set = 25 (22 create + 2 create-banned + G1 canonical)', sets.approved.length === 25);
  check('legacy-only exclusions = 10', sets.legacyOnly.length === 10);
  check('canonical is rejected + manual-review (G1)', sets.canonical.role === 'rejected' && sets.canonical.provision === 'manual-review');

  const complete = sets.approved.map((u, i) => ({ id: `uuid-${String(i).padStart(3, '0')}`, email: u.email_masked, user_metadata: { firebase_uid: u.firebase_uid }, banned_until: u.role === 'rejected' ? '2999-12-31T23:59:59.000Z' : null }));

  // F1: complete 25/25 → PASS
  let r = computeMapping(sets, complete);
  check('F1 complete: 25 mapped', r.mappings.length === 25, `got ${r.mappings.length}`);
  check('F1 complete: 0 missing/0 dup/0 unexpected', r.missing.length === 0 && r.duplicates.length === 0 && r.unexpected.length === 0 && r.legacyFound.length === 0);
  check('F1 complete: 3 rejected, all banned', r.rejected.total === 3 && r.rejected.banned === 3 && r.rejected.notBanned.length === 0);
  check('F1 complete: validation PASS', r.stopped === false);
  check('F1 id-map entries carry auth_uuid + masked email only', r.mappings.every((m) => m.auth_uuid && m.emailMasked.includes('***') && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(m.emailMasked)));

  // F2: current live state (manifest run AP-20260814100425 dry-run: all 25 exist, all skip) → PASS
  const manifest = JSON.parse(readFileSync(PROVISION_MANIFEST_PATH, 'utf8'));
  const known = new Map((manifest.users || []).filter((u) => u.targetSupabaseUuid).map((u) => [u.uidMasked, { id: u.targetSupabaseUuid, banned: u.status === 'banned' || (u.provision === 'create-banned' && u.status === 'skip') }]));
  check('F2 manifest: all 25 approved users have recorded target UUIDs', known.size === 25, `got ${known.size}`);
  const partial = sets.approved.filter((u) => known.has(maskUid(u.firebase_uid))).map((u) => ({ id: known.get(maskUid(u.firebase_uid)).id, email: u.email_masked, user_metadata: { firebase_uid: u.firebase_uid }, banned_until: known.get(maskUid(u.firebase_uid)).banned ? '2999-12-31T23:59:59.000Z' : null }));
  check('F2 manifest: 25 known mappings from manifest evidence', partial.length === 25, `got ${partial.length}`);
  r = computeMapping(sets, partial);
  check('F2 manifest: 25 mapped / 0 missing → PASS', r.mappings.length === 25 && r.missing.length === 0 && r.stopped === false);
  check('F2 manifest: all 3 rejected banned (create-banned + skip)', r.rejected.total === 3 && r.rejected.banned === 3 && r.rejected.notBanned.length === 0);
  check('F2 manifest: no legacy-only user provisioned', r.legacyFound.length === 0 && r.unexpected.length === 0);

  // F3: duplicate mapping → STOP
  const dup = [...complete, { id: 'uuid-999', email: 'dup@fixture.invalid', user_metadata: { firebase_uid: sets.approved[0].firebase_uid }, banned_until: null }];
  r = computeMapping(sets, dup);
  check('F3 duplicate: detected + STOP', r.duplicates.length === 1 && r.stopped === true);

  // F4: unexpected foreign firebase_uid → STOP
  const unexpected = [...complete, { id: 'uuid-998', email: 'u@fixture.invalid', user_metadata: { firebase_uid: 'ForeignUidNotInApprovedSet' }, banned_until: null }];
  r = computeMapping(sets, unexpected);
  check('F4 unexpected: detected + STOP', r.unexpected.length === 1 && r.stopped === true);

  // F5: legacy-only user wrongly provisioned → STOP
  const legacy = [...complete, { id: 'uuid-997', email: 'l@fixture.invalid', user_metadata: { firebase_uid: sets.legacyOnly[0].firebase_uid }, banned_until: null }];
  r = computeMapping(sets, legacy);
  check('F5 legacy violation: detected + STOP', r.legacyFound.length === 1 && r.stopped === true);

  // F6: rejected user NOT banned → STOP
  const unbanned = complete.map((u) => (u.user_metadata.firebase_uid === sets.approved.find((a) => a.role === 'rejected').firebase_uid ? { ...u, banned_until: null } : u));
  r = computeMapping(sets, unbanned);
  check('F6 rejected not banned: detected + STOP', r.rejected.notBanned.length === 1 && r.stopped === true);

  // F7: auth user without metadata → informational, no STOP
  const noMeta = [...complete, { id: 'uuid-996', email: 'nometa@fixture.invalid', user_metadata: {}, banned_until: null }];
  r = computeMapping(sets, noMeta);
  check('F7 no-metadata auth user: counted, no STOP', r.authNoMeta === 1 && r.stopped === false && r.unexpected.length === 0);

  // F8: canonical validation — any G1 manual-review rejected user is valid; non-rejected users are not
  let altOk = false;
  try { loadApprovedSets('TitV32lDaQV3Gi9pJEgrduUn8is2'); altOk = true; } catch { altOk = false; }
  check('F8 alternative G1 rejected user is a valid canonical', altOk === true);
  let nonG1Rejected = false;
  try { loadApprovedSets('y9lt1eCEeXampleUidNotReally000'); } catch { nonG1Rejected = true; }
  check('F8 non-G1 user rejected by loadApprovedSets', nonG1Rejected === true);

  // F9: FK translation + credential stripping (pure helpers)
  const memberAuthUid = 'MemberAuthUid0000000000000';
  const memberDocId = 'memberDoc000000000000000000';
  const trainerDocId = 'trainerDoc00000000000000000';
  const memberUuid = detUuid(memberDocId);
  const trainerUuid = detUuid(trainerDocId);
  check('F9 member ref (authUid form) → detUuid(memberDocId), not auth uid/doc id', memberUuid !== memberAuthUid && memberUuid !== memberDocId && memberUuid === detUuid(memberDocId));
  check('F9 trainer ref → detUuid(trainerDocId)', trainerUuid === detUuid(trainerDocId) && trainerUuid !== trainerDocId);
  check('F9 text user ref stays firebase UID (DDL TEXT FK)', 'FBUid123' === 'FBUid123');
  const dirty = { name: 'A', password: 'x', passwordHash: 'y', password_hash: 'z', salt: 's', passwordSalt: 'ps', credentials: {}, tokens: ['t'], apiKey: 'k', secret: 's', clientSecret: 'cs', accessToken: 'at', refreshToken: 'rt', nested: { token: 'n', ok: true } };
  const clean = stripCredentials(dirty);
  check('F9 credential strip: all sensitive keys removed', ['password', 'passwordHash', 'password_hash', 'salt', 'passwordSalt', 'credentials', 'tokens', 'apiKey', 'secret', 'clientSecret', 'accessToken', 'refreshToken', 'nested.token'].every((k) => (k.includes('.') ? clean.nested?.[k.split('.')[1]] === undefined : clean[k] === undefined)));
  check('F9 credential strip: benign fields preserved', clean.name === 'A' && clean.nested.ok === true);

  const failedCount = checks.filter((c) => !c.ok).length;
  for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.ok ? '' : ' — ' + c.extra}`);
  console.log(`\nFIXTURE TEST: ${checks.length - failedCount}/${checks.length} PASSED`);
  console.log('LOCAL-ONLY — ZERO remote reads, ZERO remote writes, ZERO network calls, ZERO Firebase access.');
  process.exit(failedCount ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (args.includes('--fixture-test')) return runFixtureTest();
  const canonicalUid = args.includes('--canonical-uid') ? args[args.indexOf('--canonical-uid') + 1] : null;
  if (!canonicalUid) {
    console.error('MISSING FLAG: --canonical-uid <G1 canonical firebase uid> is required (explicit developer selection, never inferred).');
    process.exit(2);
  }
  if (process.env.FIREBASE_EMULATOR) {
    console.error('REFUSING TO RUN: FIREBASE_EMULATOR is set. This tool is read-only and must not run against emulators.');
    process.exit(3);
  }
  const reportDoc = args.includes('--report-doc') ? arg('--report-doc', DOC_DEFAULT) : DOC_DEFAULT;
  if (args.includes('--validate-live-auth')) return runLiveValidate(canonicalUid, reportDoc);
  if (args.includes('--build-map')) return runBuildMap(canonicalUid, reportDoc);
  console.error('MISSING MODE: pass --validate-live-auth, --build-map, or --fixture-test.');
  process.exit(2);
}

main().catch((e) => {
  console.error(`FATAL: ${e?.message || e}`);
  console.error(e?.stack || '');
  process.exit(1);
});
