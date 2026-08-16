#!/usr/bin/env node
/**
 * IRONPULSE — Firestore Migration Inventory & Validation (READ-ONLY)
 * -------------------------------------------------------------------
 * Step 5A: inventory every production collection/subcollection identified in
 * docs/SUPABASE_MIGRATION_SCHEMA.md + docs/SUPABASE_DDL_SPEC.md and produce a
 * migration-quality audit.
 *
 * GUARANTEES
 *  - Performs ONLY GET / listCollectionIds / runQuery-style reads against
 *    Firestore. No writes to Firebase, no writes to Supabase, no local data
 *    mutation. The script refuses to start if an API key / token flag that
 *    implies write intent is present.
 *  - Never logs or persists sensitive field values (emails, phones,
 *    passwords, tokens, raw API keys). IDs (document IDs, Firebase UIDs,
 *    referral codes) are persisted because the mapping report requires them;
 *    they are not credentials.
 *
 * AUTH (one of, in order):
 *   1. env FIREBASE_ACCESS_TOKEN         (already-issued access token)
 *   2. env FIREBASE_TOKEN                (Firebase CLI-style refresh token)
 *   3. default: refresh token cached by `firebase login` in
 *      ~/.config/configstore/firebase-tools.json
 *   Client id/secret default to the public firebase-tools OAuth client
 *   (overridable via FIREBASE_CLIENT_ID / FIREBASE_CLIENT_SECRET).
 *
 * USAGE
 *   node supabase/scripts/migration_inventory_report.js [--project <id>] [--out <dir>] [--auth-export <path>]
 *
 * OUTPUT
 *   <out>/migration_inventory_report.json   (full audit artifact)
 *   console summary (counts only — no sensitive values)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DEFAULT = join(SCRIPT_DIR, '.inventory-output');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    project: get('--project', null),
    out: get('--out', OUT_DEFAULT),
    authExport: get('--auth-export', join(process.cwd(), 'users_export.json')),
  };
}
const ARGS = parseArgs();

// ---------------------------------------------------------------------------
// Project id resolution (from existing .env config, no other source)
// ---------------------------------------------------------------------------
function readEnvProjectId() {
  try {
    const envPath = join(process.cwd(), '.env');
    if (!existsSync(envPath)) return null;
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const l of lines) {
      const m = l.match(/^\s*VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^"'\s]+)/);
      if (m) return m[1];
    }
  } catch { /* ignore */ }
  return null;
}
const PROJECT = ARGS.project || process.env.VITE_FIREBASE_PROJECT_ID || readEnvProjectId();
if (!PROJECT) {
  console.error('FATAL: no project id. Pass --project <id>, VITE_FIREBASE_PROJECT_ID, or .env VITE_FIREBASE_PROJECT_ID.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function getAccessToken() {
  const direct = process.env.FIREBASE_ACCESS_TOKEN;
  if (direct) return direct;

  let refreshToken = process.env.FIREBASE_TOKEN;
  if (!refreshToken) {
    const cfgPath = join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json');
    if (existsSync(cfgPath)) {
      try {
        const c = JSON.parse(readFileSync(cfgPath, 'utf8'));
        refreshToken = c.tokens?.refresh_token;
      } catch { /* ignore */ }
    }
  }
  if (!refreshToken) {
    console.error('FATAL: no credentials. Set FIREBASE_ACCESS_TOKEN / FIREBASE_TOKEN or run `firebase login`.');
    process.exit(2);
  }

  const clientId = process.env.FIREBASE_CLIENT_ID || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
  const clientSecret = process.env.FIREBASE_CLIENT_SECRET || 'j9iVZfS8kkCEFUPaAeJV0sAi';
  const form = new URLSearchParams();
  form.set('refresh_token', refreshToken);
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);
  form.set('grant_type', 'refresh_token');
  const res = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await res.json();
  if (!res.ok || typeof body.access_token !== 'string') {
    console.error(`FATAL: token refresh failed (${res.status} ${body.error || ''})`);
    process.exit(2);
  }
  return body.access_token;
}

// ---------------------------------------------------------------------------
// Firestore REST client (read-only surface)
// ---------------------------------------------------------------------------
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(PROJECT)}/databases/(default)/documents`;

class FirestoreReader {
  constructor(token) { this.token = token; }

  async listCollectionIds() {
    const ids = [];
    let pageToken = '';
    do {
      const res = await fetch(`${FS_BASE}:listCollectionIds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ pageSize: 300, pageToken: pageToken || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`listCollectionIds ${res.status}: ${body.error?.message || ''}`);
      ids.push(...(body.collectionIds || []));
      pageToken = body.nextPageToken || '';
    } while (pageToken);
    return ids;
  }

  async listAll(collectionPath) {
    const docs = [];
    let pageToken = '';
    do {
      const url = `${FS_BASE}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}` } });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 404) return { docs: [], error: null }; // collection does not exist
        throw new Error(`list ${collectionPath} ${res.status}: ${body.error?.message || ''}`);
      }
      docs.push(...(body.documents || []).map((d) => ({
        id: d.name.split('/').pop(),
        createTime: d.createTime || null,
        updateTime: d.updateTime || null,
        fields: d.fields || {},
      })));
      pageToken = body.nextPageToken || '';
    } while (pageToken);
    return { docs, error: null };
  }
}

// ---------------------------------------------------------------------------
// Proto → JS conversion (timestamps → ISO strings; no lossy rewriting)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Value type classifier (for field-type audits)
// ---------------------------------------------------------------------------
function typeOf(v) {
  if (v === undefined) return 'missing';
  if (v === null) return 'null';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return 'timestamp';
    return 'string';
  }
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return 'other';
}
const IS_TIMESTAMP_FIELD = /(?:createdat|updatedat|paidat|issuedat|qualifiedat|rewardedat|expiresat|usedat|lastseen|sentat|deletedat|reviewedat|approvedat|generatedat|startedat|cancelledat|timestamp|referralcodegeneratedat|lastsignedinat)$/i;
const IS_NUMERIC_FIELD = /(?:amount|paid|price|balance|duration|weight|bodyfat|bmi|muscle|bench|squat|deadlift|rating|clients|checkins|attempts|votes|messagecount|calories|protein|carbs|fat|days|extensiondays|value|count|total|finalamount|originalamount|discountamount|discountvalue|size)$/i;
const IS_BOOLEAN_FIELD = /^(?:active|read|pinned|archived|deleted|test|rewardissued|autorenew|islifetime|emailverified|issuperadmin|accountdisabled|reward_issued)$/i;
const IS_ARRAY_FIELD = /^(?:meals|exercises|versions|replies|internalnotes|attachments|provideruserinfo)$/i;
const IS_OBJECT_FIELD = /^(?:subscription|documents|changes|previousvalues|metadata|rawresponse|audience|schedule|stats|data)$/i;

function expectedTypeFor(field, collection) {
  if (collection === 'planTemplates' && field === 'plan') return 'object';
  if (IS_TIMESTAMP_FIELD.test(field)) return 'timestamp';
  if (IS_NUMERIC_FIELD.test(field)) return 'number';
  if (IS_BOOLEAN_FIELD.test(field)) return 'boolean';
  if (IS_ARRAY_FIELD.test(field)) return 'array';
  if (IS_OBJECT_FIELD.test(field)) return 'object';
  return null;
}

// ---------------------------------------------------------------------------
// Masking helpers (never print sensitive values)
// ---------------------------------------------------------------------------
function maskEmail(e) {
  if (!e || typeof e !== 'string' || !e.includes('@')) return e ? `${String(e).slice(0, 2)}***` : '(none)';
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}***@${d}`;
}
function maskPhone(p) {
  if (!p || typeof p !== 'string') return '(none)';
  const digits = p.replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  return `+${digits.slice(0, 2)}***${digits.slice(-3)}`;
}
function shortId(id) {
  if (id == null) return '(none)';
  const s = String(id);
  return s.length <= 12 ? s : `${s.slice(0, 8)}...`;
}

// ---------------------------------------------------------------------------
// Enum / format vocabularies (from docs/SUPABASE_DDL_SPEC.md §3 + legacy)
// ---------------------------------------------------------------------------
const VALID_ROLES = ['super_admin', 'gym_admin', 'trainer', 'member', 'pending', 'gym_owner_pending', 'rejected'];
const LEGACY_ROLES = ['admin', 'gym_owner'];
const APPROVAL_STATUS = ['pending', 'approved', 'rejected', 'suspended'];
const SUB_STATUS = ['trial', 'active', 'expired', 'suspended', 'cancelled'];
const SUB_PAYMENT_STATUS = ['pending', 'paid'];
const INVOICE_STATUS = ['Paid', 'Partial', 'Pending', 'Overdue', 'Refunded'];
const ATTEMPT_STATUS = ['pending', 'success', 'failed', 'cancelled'];
const ATTENDANCE_METHOD = ['Auto', 'Manual', 'reception', 'QR'];
const REFERRAL_STATUS = ['Pending', 'Qualified', 'Rewarded'];
const REWARD_STATUS = ['pending', 'available', 'used'];
const COUPON_STATUS = ['available', 'active', 'used'];
const TICKET_STATUS = ['Open', 'In Progress', 'Closed', 'Resolved'];
const FEATURE_STATUS = ['Under Review', 'Planned', 'Approved', 'Declined'];
const CONTACT_STATUS = ['New', 'Read'];
const WA_LOG_STATUS = ['Queued', 'Sent', 'Failed', 'Retrying'];
const CAMPAIGN_STATUS = ['Draft', 'Scheduled', 'Running', 'Completed', 'Cancelled'];
const DEVICE_STATUS = ['active', 'revoked', 'blocked'];
const NOTIF_PRIORITY = ['normal', 'high', 'low'];
const REPORT_FORMAT = ['CSV', 'TSV', 'PDF', 'Print'];
const MEMBER_PLANS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass'];

const CODE_RE = /^IP-[A-Z0-9]{6}$/;
const INV_RE = /^INV-\d{8}-[A-Z0-9]{4}$/i;
const PAYID_RE = /^IP-[\w-]{6,40}$/;

// ---------------------------------------------------------------------------
// Required fields / gym-scoped flag per collection (schema-derived)
// ---------------------------------------------------------------------------
const COLLECTION_DEFS = {
  users:                { scope: 'global', required: ['role'], idField: 'uid' },
  gyms:                 { scope: 'global', required: ['gymName', 'ownerUid', 'approvalStatus'], idField: 'gymId' },
  subscriptions:        { scope: 'global', required: ['gymId', 'status'], idField: null },
  subscriptionHistory:  { scope: 'gym',    required: ['gymId', 'action'], idField: null },
  paymentAttempts:      { scope: 'gym',    required: ['gymId', 'paymentId', 'status'], idField: null },
  members:              { scope: 'gym',    required: ['name', 'gymId'], idField: null },
  trainers:             { scope: 'gym',    required: ['name', 'gymId'], idField: null },
  plans:                { scope: 'gym',    required: ['name', 'gymId'], idField: null },
  planTemplates:        { scope: 'gym',    required: ['type', 'name'], idField: null },
  dietPlans:            { scope: 'gym',    required: ['name', 'gymId'], idField: null },
  workoutPlans:         { scope: 'gym',    required: ['name', 'gymId'], idField: null },
  progressLogs:         { scope: 'gym',    required: ['gymId'], idField: null },
  payments:             { scope: 'gym',    required: ['gymId', 'amount'], idField: null },
  attendance:           { scope: 'gym',    required: ['gymId', 'date', 'memberId'], idField: null },
  notifications:        { scope: 'user',   required: ['userId'], idField: null },
  supportTickets:       { scope: 'gym',    required: ['gymId', 'subject'], idField: null },
  featureRequests:      { scope: 'gym',    required: ['gymId', 'title'], idField: null },
  contactMessages:      { scope: 'global', required: ['message'], idField: null },
  settings:             { scope: 'composite', required: [], idField: null },
  whatsappLogs:         { scope: 'gym',    required: ['gymId'], idField: null },
  whatsappCampaigns:    { scope: 'gym',    required: ['gymId', 'name'], idField: null },
  licensedDevices:      { scope: 'gym',    required: ['gymId', 'deviceId'], idField: null },
  licenseHistory:       { scope: 'gym',    required: ['gymId'], idField: null },
  referralCodes:        { scope: 'global', required: ['referrerUid'], idField: 'code' },
  referrals:            { scope: 'gym',    required: ['referrerUid'], idField: 'referredUid' },
  rewardLedger:         { scope: 'gym',    required: ['type'], idField: null },
  discountCoupons:      { scope: 'gym',    required: ['code'], idField: null },
  referralAuditLogs:    { scope: 'global', required: ['action'], idField: null },
  auditLog:             { scope: 'global', required: ['action'], idField: null },
  aiConversations:      { scope: 'user',   required: ['userId'], idField: null },
  generatedReports:     { scope: 'gym',    required: ['gymId', 'format'], idField: null },
};
const KNOWN_COLLECTIONS = Object.keys(COLLECTION_DEFS);

// ---------------------------------------------------------------------------
// Audit context
// ---------------------------------------------------------------------------
const ctx = {
  data: {},                 // collectionName -> array of {id, fields(converted), createTime, updateTime}
  users: {},                // uid -> user doc (converted)
  gyms: {},                 // gymId -> gym doc
  membersByDocId: {},       // member doc id -> member
  membersByAuthUid: {},     // member authUid -> member
  trainersByDocId: {},
  trainersByAuthUid: {},
  referralCodes: {},        // code -> doc
  referrals: {},            // referredUid -> doc
  conversations: {},        // conversation id -> doc
  messages: {},             // conversationId -> [docs]
  authExport: {},           // localId -> {email, disabled, emailVerified}
  errors: [],               // collection read errors
  // counters
  counts: {},
  quality: {},              // collection -> per-field issues
  refIssues: {},            // collection -> refField -> {SAFE,AMBIGUOUS,UNRESOLVED,INVALID,samples}
  roles: {},                // role -> count
  roleAliases: [],
  invalidRoles: {},
  roleGymInconsistencies: [],
  gymIssues: [],            // per-gym issue records
  planVocab: {},            // plan value -> count  (source-tagged)
  planBySource: {},
  deterministic: {},        // idKind -> issues
  orphans: {},              // collection -> orphan records
  docShape: {},             // collection -> shape summary
  blockingDocs: {},         // collection -> [doc ids]
  ambiguousDocs: {},        // collection -> [doc ids]
  safeDocs: {},             // collection -> count
};

function rec(collection, kind, docId, detail) {
  const arr = ctx[kind][collection] || (ctx[kind][collection] = []);
  if (arr.length < 200) arr.push({ doc: shortId(docId), ...detail });
  return arr.length;
}
function countRef(collection, field, status, docId, note) {
  const c = (ctx.refIssues[collection] ||= {});
  const f = (c[field] ||= { SAFE: 0, AMBIGUOUS: 0, UNRESOLVED: 0, INVALID: 0, samples: [] });
  f[status]++;
  if (f.samples.length < 10) f.samples.push({ doc: shortId(docId), note });
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------
function resolveUid(collection, field, value, docId, { allowEmpty = false } = {}) {
  if (value == null || value === '') {
    if (allowEmpty) countRef(collection, field, 'SAFE', docId, 'empty (nullable)');
    else countRef(collection, field, 'UNRESOLVED', docId, 'empty value');
    return;
  }
  if (typeof value !== 'string') {
    countRef(collection, field, 'INVALID', docId, `type ${typeof value}`);
    return;
  }
  if (ctx.users[value]) countRef(collection, field, 'SAFE', docId, 'users doc exists');
  else countRef(collection, field, 'UNRESOLVED', docId, 'no users doc');
}

function resolveMemberRef(collection, field, value, docId, { allowEmpty = true } = {}) {
  if (value == null || value === '') {
    if (allowEmpty) countRef(collection, field, 'SAFE', docId, 'empty (nullable)');
    else countRef(collection, field, 'UNRESOLVED', docId, 'empty value');
    return;
  }
  if (typeof value !== 'string') {
    countRef(collection, field, 'INVALID', docId, `type ${typeof value}`);
    return;
  }
  const byDoc = ctx.membersByDocId[value];
  const byUid = ctx.membersByAuthUid[value];
  if (byDoc && byUid && byDoc.id !== byUid.id) {
    countRef(collection, field, 'AMBIGUOUS', docId, 'matches member doc id AND different member authUid');
    return;
  }
  if (byDoc || byUid) { countRef(collection, field, 'SAFE', docId, byDoc ? 'member doc id' : 'member authUid'); return; }
  if (ctx.users[value]) countRef(collection, field, 'SAFE', docId, 'users doc (authUid, no member row)');
  else countRef(collection, field, 'UNRESOLVED', docId, 'no member/users match');
}

function resolveTrainerRef(collection, field, value, docId, { allowEmpty = true } = {}) {
  if (value == null || value === '') {
    if (allowEmpty) countRef(collection, field, 'SAFE', docId, 'empty (nullable)');
    else countRef(collection, field, 'UNRESOLVED', docId, 'empty value');
    return;
  }
  if (typeof value !== 'string') {
    countRef(collection, field, 'INVALID', docId, `type ${typeof value}`);
    return;
  }
  const byDoc = ctx.trainersByDocId[value];
  const byUid = ctx.trainersByAuthUid[value];
  if (byDoc || byUid) { countRef(collection, field, 'SAFE', docId, byDoc ? 'trainer doc id' : 'trainer authUid'); return; }
  if (ctx.users[value]) countRef(collection, field, 'SAFE', docId, 'users doc (trainer authUid)');
  else countRef(collection, field, 'UNRESOLVED', docId, 'no trainer/users match');
}

function resolveGymRef(collection, field, value, docId, { allowEmpty = true } = {}) {
  if (value == null || value === '') {
    if (allowEmpty) countRef(collection, field, 'SAFE', docId, 'empty (nullable)');
    else countRef(collection, field, 'UNRESOLVED', docId, 'empty value');
    return;
  }
  if (typeof value !== 'string') {
    countRef(collection, field, 'INVALID', docId, `type ${typeof value}`);
    return;
  }
  if (value === 'default') {
    countRef(collection, field, 'AMBIGUOUS', docId, "'default' sentinel (no gyms/default doc expected)");
    return;
  }
  if (ctx.gyms[value]) countRef(collection, field, 'SAFE', docId, 'gym doc exists');
  else countRef(collection, field, 'UNRESOLVED', docId, 'no gym doc');
}

function resolveConversationRef(value, docId) {
  if (value == null || value === '') return 'UNRESOLVED';
  return ctx.conversations[value] ? 'SAFE' : 'UNRESOLVED';
}

// ---------------------------------------------------------------------------
// Per-collection audits
// ---------------------------------------------------------------------------
function auditCommon(collection, docs) {
  const def = COLLECTION_DEFS[collection];
  const q = (ctx.quality[collection] ||= { missingRequired: 0, missingGymId: 0, idMismatch: 0, typeIssues: 0, typeIssueSamples: [], missingRequiredSamples: [], missingGymIdSamples: [] });
  let safe = 0, ambiguous = 0, blocking = 0;
  for (const d of docs) {
    let flags = [];
    const missingReq = (def.required || []).filter((f) => d.fields[f] === undefined);
    if (missingReq.length) {
      q.missingRequired++;
      if (q.missingRequiredSamples.length < 10) q.missingRequiredSamples.push({ doc: shortId(d.id), missing: missingReq });
      flags.push('missing-required');
    }
    if (def.scope === 'gym' && d.fields.gymId === undefined) {
      q.missingGymId++;
      if (q.missingGymIdSamples.length < 10) q.missingGymIdSamples.push(shortId(d.id));
      flags.push('missing-gymId');
    }
    if (def.idField && d.fields[def.idField] !== undefined && d.fields[def.idField] !== d.id) {
      q.idMismatch++;
      flags.push('id-mismatch');
    }
    // field type spot checks
    for (const [f, v] of Object.entries(d.fields)) {
      const exp = expectedTypeFor(f, collection);
      if (!exp) continue;
      const got = typeOf(v);
      const ok = got === exp || (exp === 'timestamp' && (got === 'string' || got === 'number'));
      if (!ok) {
        q.typeIssues++;
        if (q.typeIssueSamples.length < 10) q.typeIssueSamples.push({ doc: shortId(d.id), field: f, expected: exp, got });
        flags.push('type-issue');
      }
    }
    if (flags.length) {
      const kind = flags.includes('missing-required') || flags.includes('id-mismatch') ? 'blockingDocs' : 'ambiguousDocs';
      if (kind === 'blockingDocs') { blocking++; rec(collection, 'blockingDocs', d.id, { flags }); }
      else { ambiguous++; rec(collection, 'ambiguousDocs', d.id, { flags }); }
    } else safe++;
  }
  ctx.safeDocs[collection] = safe;
  return { total: docs.length, safe, ambiguous, blocking };
}

// Merge-safe quality-object initializer (auditCommon may have pre-created the
// per-collection quality object with only the common fields).
function ensureQ(collection, defaults) {
  const q = ctx.quality[collection] || (ctx.quality[collection] = {});
  for (const [k, v] of Object.entries(defaults)) if (q[k] === undefined) q[k] = v;
  return q;
}

function auditUsers(docs) {
  const out = auditCommon('users', docs);
  const q = (ctx.quality.users ||= {});
  q.referralCodeDupes = 0; q.referralCodeInvalid = 0; q.referralCodeDupSamples = [];
  const seenCodes = new Map();
  for (const d of docs) {
    ctx.users[d.id] = d.fields;
    const role = d.fields.role;
    ctx.roles[role] = (ctx.roles[role] || 0) + 1;
    if (LEGACY_ROLES.includes(role)) ctx.roleAliases.push({ role, doc: shortId(d.id) });
    if (role !== undefined && !VALID_ROLES.includes(role) && !LEGACY_ROLES.includes(role)) {
      ctx.invalidRoles[role] = (ctx.invalidRoles[role] || 0) + 1;
      if (ctx.invalidRoles[role] <= 5) (ctx.invalidRoles.samples ||= []).push(shortId(d.id));
    }
    const code = d.fields.referralCode;
    if (code && typeof code === 'string') {
      if (!CODE_RE.test(code)) { q.referralCodeInvalid++; }
      if (seenCodes.has(code)) {
        q.referralCodeDupes++;
        if (q.referralCodeDupSamples.length < 10) q.referralCodeDupSamples.push({ code, users: [shortId(seenCodes.get(code)), shortId(d.id)] });
      } else seenCodes.set(code, d.id);
    }
    // role/gym consistency
    if (d.fields.gymId === undefined && !['super_admin'].includes(role)) {
      ctx.roleGymInconsistencies.push({ doc: shortId(d.id), role, issue: 'no gymId' });
    }
  }
  return out;
}

function auditGyms(docs) {
  const out = auditCommon('gyms', docs);
  for (const d of docs) {
    ctx.gyms[d.id] = d.fields;
    const g = d.fields;
    const issues = [];
    if (g.ownerUid && !ctx.users[g.ownerUid]) issues.push('ownerUid unresolved');
    if (g.ownerUid && ctx.users[g.ownerUid] && !['gym_owner', 'gym_owner_pending', 'gym_admin', 'admin', 'pending'].includes(ctx.users[g.ownerUid].role)) {
      issues.push(`owner role=${ctx.users[g.ownerUid].role}`);
    }
    if (!APPROVAL_STATUS.includes(g.approvalStatus)) issues.push(`approvalStatus=${g.approvalStatus}`);
    if (g.subscription !== undefined) {
      if (typeof g.subscription !== 'object' || Array.isArray(g.subscription)) issues.push('subscription not object');
    }
    if (g.documents !== undefined) {
      if (typeof g.documents !== 'object' || Array.isArray(g.documents)) issues.push('documents not object');
    }
    if (issues.length) ctx.gymIssues.push({ gym: shortId(d.id), issues });
  }
  return out;
}

function auditSettings(docs) {
  // doc id = `${gymId}:${docId}` composite; also legacy bare ids
  const out = auditCommon('settings', docs);
  const q = ensureQ('settings', { parseIssues: 0, bareIds: [], composites: {}, parseSamples: [] });
  for (const d of docs) {
    const idx = d.id.indexOf(':');
    let gymId, docId;
    if (idx > 0) {
      gymId = d.id.slice(0, idx); docId = d.id.slice(idx + 1);
    } else {
      gymId = 'platform'; docId = d.id; // legacy bare global doc id
      q.bareIds.push(d.id);
    }
    const key = `${gymId}:${docId}`;
    q.composites[key] = (q.composites[key] || 0) + 1;
    if (gymId !== 'platform' && gymId !== 'default' && !ctx.gyms[gymId]) {
      q.parseIssues++;
      if (q.parseSamples.length < 10) q.parseSamples.push({ doc: shortId(d.id), gymId: shortId(gymId), docId });
    }
    const fg = d.fields.gymId;
    if (fg !== undefined && String(fg) !== gymId && String(fg) !== d.id) {
      q.parseIssues++;
      if (q.parseSamples.length < 10) q.parseSamples.push({ doc: shortId(d.id), fieldGymId: shortId(String(fg)), idGymId: shortId(gymId) });
    }
  }
  return out;
}

function auditReferralCodes(docs) {
  const out = auditCommon('referralCodes', docs);
  const q = ensureQ('referralCodes', { badFormat: 0, badFormatSamples: [], referrerMismatch: 0 });
  for (const d of docs) {
    ctx.referralCodes[d.id] = d.fields;
    if (!CODE_RE.test(d.id)) { q.badFormat++; if (q.badFormatSamples.length < 10) q.badFormatSamples.push(shortId(d.id)); }
    if (d.fields.referrerUid) {
      resolveUid('referralCodes', 'referrerUid', d.fields.referrerUid, d.id, { allowEmpty: false });
      const user = ctx.users[d.fields.referrerUid];
      if (user && user.referralCode !== undefined && user.referralCode !== d.id) {
        q.referrerMismatch++;
      }
    } else countRef('referralCodes', 'referrerUid', 'UNRESOLVED', d.id, 'missing');
  }
  return out;
}

function auditReferrals(docs) {
  const out = auditCommon('referrals', docs);
  const q = ensureQ('referrals', { idFieldMismatch: 0, idFieldMismatchSamples: [] });
  for (const d of docs) {
    ctx.referrals[d.id] = d.fields;
    if (d.fields.referredUid !== undefined && d.fields.referredUid !== d.id) {
      q.idFieldMismatch++;
      if (q.idFieldMismatchSamples.length < 10) q.idFieldMismatchSamples.push({ doc: shortId(d.id), field: shortId(String(d.fields.referredUid)) });
    }
    if (d.fields.referredUid !== undefined) resolveUid('referrals', 'referredUid', d.fields.referredUid, d.id, { allowEmpty: false });
    else countRef('referrals', 'referredUid', 'UNRESOLVED', d.id, 'missing field');
    if (d.fields.referrerUid) resolveUid('referrals', 'referrerUid', d.fields.referrerUid, d.id, { allowEmpty: false });
    else countRef('referrals', 'referrerUid', 'UNRESOLVED', d.id, 'missing field');
    if (d.fields.gymId !== undefined) resolveGymRef('referrals', 'gymId', d.fields.gymId, d.id);
    if (d.fields.status !== undefined && !REFERRAL_STATUS.includes(d.fields.status)) q.badStatus = (q.badStatus || 0) + 1;
  }
  return out;
}

function auditMembers(docs) {
  const out = auditCommon('members', docs);
  const q = ensureQ('members', { authUidDupes: 0, authUidDupSamples: [] });
  const seenAuth = new Map();
  for (const d of docs) {
    ctx.membersByDocId[d.id] = { id: d.id, ...d.fields };
    if (d.fields.gymId !== undefined) resolveGymRef('members', 'gymId', d.fields.gymId, d.id);
    if (d.fields.authUid !== undefined && d.fields.authUid !== null && d.fields.authUid !== '') {
      const au = d.fields.authUid;
      if (seenAuth.has(au)) {
        q.authUidDupes++;
        if (q.authUidDupSamples.length < 10) q.authUidDupSamples.push({ authUid: shortId(au), members: [shortId(seenAuth.get(au)), shortId(d.id)] });
      } else seenAuth.set(au, d.id);
      ctx.membersByAuthUid[au] = { id: d.id, ...d.fields };
      resolveUid('members', 'authUid', au, d.id, { allowEmpty: false });
    }
    if (d.fields.trainerAuthUid !== undefined) resolveTrainerRef('members', 'trainerAuthUid', d.fields.trainerAuthUid, d.id);
    if (d.fields.plan !== undefined) (ctx.planVocab[String(d.fields.plan)] = (ctx.planVocab[String(d.fields.plan)] || 0) + 1), (ctx.planBySource['members.plan'] ||= {})[String(d.fields.plan)] = ((ctx.planBySource['members.plan'] || {})[String(d.fields.plan)] || 0) + 1;
    if (d.fields.paymentStatus !== undefined && !INVOICE_STATUS.includes(d.fields.paymentStatus)) q.badPaymentStatus = (q.badPaymentStatus || 0) + 1;
  }
  return out;
}

function auditTrainers(docs) {
  const out = auditCommon('trainers', docs);
  const q = ensureQ('trainers', { authUidDupes: 0, authUidDupSamples: [] });
  const seenAuth = new Map();
  for (const d of docs) {
    ctx.trainersByDocId[d.id] = { id: d.id, ...d.fields };
    if (d.fields.gymId !== undefined) resolveGymRef('trainers', 'gymId', d.fields.gymId, d.id);
    if (d.fields.authUid !== undefined && d.fields.authUid !== null && d.fields.authUid !== '') {
      const au = d.fields.authUid;
      if (seenAuth.has(au)) {
        q.authUidDupes++;
        if (q.authUidDupSamples.length < 10) q.authUidDupSamples.push({ authUid: shortId(au), trainers: [shortId(seenAuth.get(au)), shortId(d.id)] });
      } else seenAuth.set(au, d.id);
      ctx.trainersByAuthUid[au] = { id: d.id, ...d.fields };
      resolveUid('trainers', 'authUid', au, d.id, { allowEmpty: false });
    }
  }
  return out;
}

function auditPlans(docs) {
  const out = auditCommon('plans', docs);
  for (const d of docs) {
    if (d.fields.gymId !== undefined) resolveGymRef('plans', 'gymId', d.fields.gymId, d.id);
    if (d.fields.name !== undefined) (ctx.planBySource['plans.name'] ||= {})[String(d.fields.name)] = ((ctx.planBySource['plans.name'] || {})[String(d.fields.name)] || 0) + 1, (ctx.planVocab[String(d.fields.name)] = (ctx.planVocab[String(d.fields.name)] || 0) + 1);
  }
  return out;
}

function auditMemberPlanRefs(collection, docs, memberField, authField, trainerField) {
  const out = auditCommon(collection, docs);
  for (const d of docs) {
    if (d.fields.gymId !== undefined) resolveGymRef(collection, 'gymId', d.fields.gymId, d.id);
    if (memberField && d.fields[memberField] !== undefined) resolveMemberRef(collection, memberField, d.fields[memberField], d.id);
    if (authField && d.fields[authField] !== undefined) resolveMemberRef(collection, authField, d.fields[authField], d.id);
    if (trainerField && d.fields[trainerField] !== undefined) resolveTrainerRef(collection, trainerField, d.fields[trainerField], d.id);
  }
  return out;
}

function auditPayments(docs) {
  const out = auditCommon('payments', docs);
  const q = ensureQ('payments', { paymentIdDupes: 0, paymentIdDupSamples: [], invoiceDupes: 0, invoiceDupSamples: [], invoiceBadFormat: 0, paymentIdBadFormat: 0 });
  const seenPay = new Map(), seenInv = new Map();
  for (const d of docs) {
    if (d.fields.gymId !== undefined) resolveGymRef('payments', 'gymId', d.fields.gymId, d.id);
    if (d.fields.memberId !== undefined) resolveMemberRef('payments', 'memberId', d.fields.memberId, d.id, { allowEmpty: true });
    if (d.fields.authUid !== undefined) resolveUid('payments', 'authUid', d.fields.authUid, d.id, { allowEmpty: true });
    const pid = d.fields.paymentId;
    if (pid !== undefined && pid !== null && pid !== '') {
      const s = String(pid);
      if (!PAYID_RE.test(s)) q.paymentIdBadFormat++;
      if (seenPay.has(s)) {
        q.paymentIdDupes++;
        if (q.paymentIdDupSamples.length < 10) q.paymentIdDupSamples.push({ paymentId: shortId(s), docs: [shortId(seenPay.get(s)), shortId(d.id)] });
      } else seenPay.set(s, d.id);
    }
    const inv = d.fields.invoiceNo;
    if (inv !== undefined && inv !== null && inv !== '') {
      const s = String(inv);
      if (!INV_RE.test(s)) q.invoiceBadFormat++;
      if (seenInv.has(s)) {
        q.invoiceDupes++;
        if (q.invoiceDupSamples.length < 10) q.invoiceDupSamples.push({ invoiceNo: s, docs: [shortId(seenInv.get(s)), shortId(d.id)] });
      } else seenInv.set(s, d.id);
    }
    if (d.fields.status !== undefined && !INVOICE_STATUS.includes(d.fields.status)) q.badStatus = (q.badStatus || 0) + 1;
    if (d.fields.plan !== undefined) (ctx.planVocab[String(d.fields.plan)] = (ctx.planVocab[String(d.fields.plan)] || 0) + 1), (ctx.planBySource['payments.plan'] ||= {})[String(d.fields.plan)] = ((ctx.planBySource['payments.plan'] || {})[String(d.fields.plan)] || 0) + 1;
  }
  return out;
}

function auditAttendance(docs) {
  const out = auditCommon('attendance', docs);
  const q = ensureQ('attendance', { badDate: 0, badTime: 0, badMethod: 0, badDuration: 0 });
  for (const d of docs) {
    if (d.fields.gymId !== undefined) resolveGymRef('attendance', 'gymId', d.fields.gymId, d.id);
    if (d.fields.memberId !== undefined) resolveMemberRef('attendance', 'memberId', d.fields.memberId, d.id, { allowEmpty: false });
    if (d.fields.trainerAuthUid !== undefined) resolveTrainerRef('attendance', 'trainerAuthUid', d.fields.trainerAuthUid, d.id);
    const date = d.fields.date;
    if (date !== undefined && typeof date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) q.badDate++;
    const time = d.fields.time;
    if (time !== undefined && typeof time === 'string' && !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) q.badTime++;
    if (d.fields.method !== undefined && !ATTENDANCE_METHOD.includes(d.fields.method)) q.badMethod++;
    if (d.fields.duration !== undefined && typeof d.fields.duration !== 'number') q.badDuration++;
    if (d.fields.plan !== undefined) (ctx.planVocab[String(d.fields.plan)] = (ctx.planVocab[String(d.fields.plan)] || 0) + 1), (ctx.planBySource['attendance.plan'] ||= {})[String(d.fields.plan)] = ((ctx.planBySource['attendance.plan'] || {})[String(d.fields.plan)] || 0) + 1;
  }
  return out;
}

function auditNotifications(docs) {
  const out = auditCommon('notifications', docs);
  const q = ctx.quality.notifications || (ctx.quality.notifications = {});
  q.missingUserButTargeted ||= 0; q.badPriority ||= 0; q.badRead ||= 0; q.types ||= {};
  for (const d of docs) {
    const uid = d.fields.userId;
    if (uid !== undefined && uid !== null && uid !== '') resolveUid('notifications', 'userId', uid, d.id, { allowEmpty: false });
    else {
      // anon/contact/rollup notifications may legitimately lack a userId
      if (d.fields.targetRole || d.fields.role === 'super_admin') q.missingUserButTargeted++;
      countRef('notifications', 'userId', 'AMBIGUOUS', d.id, 'missing userId (targeted/anon)');
    }
    if (d.fields.gymId !== undefined) resolveGymRef('notifications', 'gymId', d.fields.gymId, d.id);
    if (d.fields.priority !== undefined && !NOTIF_PRIORITY.includes(d.fields.priority)) q.badPriority++;
    if (d.fields.read !== undefined && typeof d.fields.read !== 'boolean') q.badRead++;
    if (d.fields.type !== undefined) q.types[String(d.fields.type)] = (q.types[String(d.fields.type)] || 0) + 1;
  }
  return out;
}

function auditSubscriptions(docs) {
  const out = auditCommon('subscriptions', docs);
  const q = ensureQ('subscriptions', { gymIdDupes: 0, gymIdDupSamples: [], licenseDupes: 0, licenseDupSamples: [], badStatus: 0, badPaymentStatus: 0 });
  const seenGym = new Map(), seenLicense = new Map();
  for (const d of docs) {
    const gid = d.fields.gymId;
    if (gid !== undefined) {
      resolveGymRef('subscriptions', 'gymId', gid, d.id, { allowEmpty: false });
      if (typeof gid === 'string') {
        if (seenGym.has(gid)) {
          q.gymIdDupes++;
          if (q.gymIdDupSamples.length < 10) q.gymIdDupSamples.push({ gymId: shortId(gid), docs: [shortId(seenGym.get(gid)), shortId(d.id)] });
        } else seenGym.set(gid, d.id);
      }
    } else countRef('subscriptions', 'gymId', 'UNRESOLVED', d.id, 'missing');
    if (d.fields.licenseKey !== undefined && d.fields.licenseKey !== null && d.fields.licenseKey !== '') {
      const lk = String(d.fields.licenseKey);
      if (seenLicense.has(lk)) {
        q.licenseDupes++;
        if (q.licenseDupSamples.length < 10) q.licenseDupSamples.push({ licenseKey: shortId(lk), docs: [shortId(seenLicense.get(lk)), shortId(d.id)] });
      } else seenLicense.set(lk, d.id);
    }
    if (d.fields.status !== undefined && !SUB_STATUS.includes(d.fields.status)) q.badStatus++;
    if (d.fields.paymentStatus !== undefined && !SUB_PAYMENT_STATUS.includes(d.fields.paymentStatus)) q.badPaymentStatus++;
    if (d.fields.plan !== undefined) (ctx.planVocab[String(d.fields.plan)] = (ctx.planVocab[String(d.fields.plan)] || 0) + 1), (ctx.planBySource['subscriptions.plan'] ||= {})[String(d.fields.plan)] = ((ctx.planBySource['subscriptions.plan'] || {})[String(d.fields.plan)] || 0) + 1;
    if (d.fields.planType !== undefined) (ctx.planBySource['subscriptions.planType'] ||= {})[String(d.fields.planType)] = ((ctx.planBySource['subscriptions.planType'] || {})[String(d.fields.planType)] || 0) + 1;
  }
  return out;
}

function auditSubscriptionHistory(docs) {
  const out = auditCommon('subscriptionHistory', docs);
  for (const d of docs) {
    if (d.fields.gymId !== undefined) resolveGymRef('subscriptionHistory', 'gymId', d.fields.gymId, d.id);
    if (d.fields.actorUid !== undefined) resolveUid('subscriptionHistory', 'actorUid', d.fields.actorUid, d.id, { allowEmpty: true });
    if (d.fields.subscriptionId !== undefined && d.fields.subscriptionId !== null && d.fields.subscriptionId !== '') {
      countRef('subscriptionHistory', 'subscriptionId', 'AMBIGUOUS', d.id, 'no FK target by design (mirror text id)');
    }
  }
  return out;
}

function auditPaymentAttempts(docs) {
  const out = auditCommon('paymentAttempts', docs);
  const q = ensureQ('paymentAttempts', { paymentIdDupes: 0, paymentIdDupSamples: [], badStatus: 0 });
  const seen = new Map();
  for (const d of docs) {
    if (d.fields.gymId !== undefined) resolveGymRef('paymentAttempts', 'gymId', d.fields.gymId, d.id);
    if (d.fields.authUid !== undefined) resolveUid('paymentAttempts', 'authUid', d.fields.authUid, d.id, { allowEmpty: true });
    const pid = d.fields.paymentId;
    if (pid !== undefined && pid !== null && pid !== '') {
      const s = String(pid);
      if (seen.has(s)) {
        q.paymentIdDupes++;
        if (q.paymentIdDupSamples.length < 10) q.paymentIdDupSamples.push({ paymentId: shortId(s), docs: [shortId(seen.get(s)), shortId(d.id)] });
      } else seen.set(s, d.id);
    } else countRef('paymentAttempts', 'paymentId', 'UNRESOLVED', d.id, 'missing');
    if (d.fields.status !== undefined && !ATTEMPT_STATUS.includes(d.fields.status)) q.badStatus++;
  }
  return out;
}

function auditContactMessages(docs) {
  const out = auditCommon('contactMessages', docs);
  const q = ensureQ('contactMessages', { badStatus: 0 });
  for (const d of docs) if (d.fields.status !== undefined && !CONTACT_STATUS.includes(d.fields.status)) q.badStatus++;
  return out;
}

function auditGenericEnum(collection, docs, enumField, enumSet, refs) {
  const out = auditCommon(collection, docs);
  const q = (ctx.quality[collection] ||= {});
  for (const d of docs) {
    for (const r of refs || []) {
      if (d.fields[r] !== undefined) resolveGymRef(collection, r, d.fields[r], d.id);
    }
    if (d.fields[enumField] !== undefined && !enumSet.includes(d.fields[enumField])) q[`bad${enumField}`] = (q[`bad${enumField}`] || 0) + 1;
  }
  return out;
}

function auditConversations(docs) {
  const out = auditCommon('aiConversations', docs);
  for (const d of docs) {
    ctx.conversations[d.id] = d.fields;
    if (d.fields.userId !== undefined) resolveUid('aiConversations', 'userId', d.fields.userId, d.id, { allowEmpty: false });
    if (d.fields.gymId !== undefined) resolveGymRef('aiConversations', 'gymId', d.fields.gymId, d.id);
    if (d.fields.deleted !== undefined && typeof d.fields.deleted !== 'boolean') (ctx.quality.aiConversations ||= {}).badDeleted = (ctx.quality.aiConversations.badDeleted || 0) + 1;
  }
  return out;
}

function auditConversationMessages() {
  const out = { total: 0, safe: 0, ambiguous: 0, blocking: 0 };
  const q = ensureQ('aiConversationMessages', { badRole: 0, badContent: 0, orphanConv: 0 });
  for (const [convId, msgs] of Object.entries(ctx.messages)) {
    const parentOk = !!ctx.conversations[convId];
    if (!parentOk) q.orphanConv += msgs.length;
    for (const m of msgs) {
      out.total++;
      if (!parentOk) {
        out.blocking++;
        rec('aiConversationMessages', 'blockingDocs', m.id, { conv: shortId(convId) });
        continue;
      }
      if (!['user', 'assistant', 'system'].includes(m.fields.role)) q.badRole++;
      if (typeof m.fields.content !== 'string') q.badContent++;
      out.safe++;
    }
  }
  ctx.safeDocs.aiConversationMessages = out.safe;
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic identifier audit (Step 6)
// ---------------------------------------------------------------------------
function auditDeterministic() {
  const det = ctx.deterministic;
  // referral_codes.code vs users.referralCode
  const userCodes = new Map();
  for (const [uid, u] of Object.entries(ctx.users)) {
    if (u.referralCode && typeof u.referralCode === 'string') userCodes.set(u.referralCode, uid);
  }
  const rcCollisions = [];
  for (const code of Object.keys(ctx.referralCodes)) {
    if (userCodes.has(code) && !CODE_RE.test(code)) rcCollisions.push({ code: shortId(code), note: 'invalid format' });
  }
  det.referralCodes = {
    total: Object.keys(ctx.referralCodes).length,
    invalidFormat: (ctx.quality.referralCodes?.badFormat || 0),
    duplicateValues: 0,
    directoryEntriesWithoutUserCode: Object.keys(ctx.referralCodes).filter((c) => {
      const ref = ctx.referralCodes[c]?.referrerUid;
      return !ref || !ctx.users[ref] || ctx.users[ref].referralCode !== c;
    }).length,
    userCodesWithoutDirectoryEntry: Object.keys(ctx.referralCodes).length === 0 ? 0 : [...userCodes.entries()].filter(([c]) => !ctx.referralCodes[c]).length,
    userCodeDuplicates: ctx.quality.users?.referralCodeDupes || 0,
    userCodeDuplicateSamples: ctx.quality.users?.referralCodeDupSamples || [],
    collisions: rcCollisions,
  };
  // referrals.referred_uid
  det.referrals = {
    total: Object.keys(ctx.referrals).length,
    docIdVsFieldMismatch: ctx.quality.referrals?.idFieldMismatch || 0,
    duplicateReferredUid: 0,
    duplicatePair: 0,
    badStatus: ctx.quality.referrals?.badStatus || 0,
  };
  // payment_id / invoice_no
  det.payments = {
    paymentIdDuplicates: ctx.quality.payments?.paymentIdDupes || 0,
    paymentIdDuplicateSamples: ctx.quality.payments?.paymentIdDupSamples || [],
    paymentIdBadFormat: ctx.quality.payments?.paymentIdBadFormat || 0,
    invoiceDuplicates: ctx.quality.payments?.invoiceDupes || 0,
    invoiceDuplicateSamples: ctx.quality.payments?.invoiceDupSamples || [],
    invoiceBadFormat: ctx.quality.payments?.invoiceBadFormat || 0,
  };
  det.paymentAttempts = {
    paymentIdDuplicates: ctx.quality.paymentAttempts?.paymentIdDupes || 0,
    paymentIdDuplicateSamples: ctx.quality.paymentAttempts?.paymentIdDupSamples || [],
  };
  // license_key
  const lic = new Map();
  let dup = 0; const samples = [];
  for (const g of Object.values(ctx.gyms)) {
    const lk = g.subscription?.licenseKey;
    if (lk && typeof lk === 'string') {
      if (lic.has(lk)) { dup++; if (samples.length < 10) samples.push({ licenseKey: shortId(lk), a: shortId(lic.get(lk)), b: 'gym' }); }
      else lic.set(lk, 'gym');
    }
  }
  det.licenseKey = {
    duplicatesAcrossGymsAndSubscriptions: dup,
    samples,
    gymSubscriptionsWithLicense: lic.size,
  };
  // settings composite
  det.settings = {
    docs: ctx.data.settings?.length || 0,
    composites: Object.keys(ctx.quality.settings?.composites || {}).length,
    bareIds: ctx.quality.settings?.bareIds || [],
    parseIssues: ctx.quality.settings?.parseIssues || 0,
  };
  // licensed_devices (gym_id, device_id)
  const dev = new Map(); let devDup = 0; const devSamples = [];
  for (const d of ctx.data.licensedDevices || []) {
    const gid = d.fields.gymId, did = d.fields.deviceId;
    if (gid && did) {
      const k = `${gid}|${did}`;
      if (dev.has(k)) { devDup++; if (devSamples.length < 10) devSamples.push({ gymId: shortId(gid), deviceId: shortId(did) }); }
      else dev.set(k, d.id);
    }
  }
  det.licensedDevices = { duplicateGymDevicePairs: devDup, samples: devSamples };
  // discount_coupons.code
  const cc = new Map(); let ccDup = 0; const ccSamples = [];
  for (const d of ctx.data.discountCoupons || []) {
    const c = d.fields.code;
    if (c && typeof c === 'string') {
      if (cc.has(c)) { ccDup++; if (ccSamples.length < 10) ccSamples.push({ code: shortId(c), a: shortId(cc.get(c)), b: shortId(d.id) }); }
      else cc.set(c, d.id);
    }
  }
  det.discountCoupons = { duplicateCodes: ccDup, samples: ccSamples };
  // members/trainers auth_uid
  det.members = { duplicateAuthUid: ctx.quality.members?.authUidDupes || 0, samples: ctx.quality.members?.authUidDupSamples || [] };
  det.trainers = { duplicateAuthUid: ctx.quality.trainers?.authUidDupes || 0, samples: ctx.quality.trainers?.authUidDupSamples || [] };
  det.subscriptions = { duplicateGymId: ctx.quality.subscriptions?.gymIdDupes || 0, samples: ctx.quality.subscriptions?.gymIdDupSamples || [] };
}

// ---------------------------------------------------------------------------
// Orphan audit (Step 7)
// ---------------------------------------------------------------------------
function orphanCounts() {
  const out = {};
  for (const [col, issues] of Object.entries(ctx.refIssues)) {
    const unresolved = {}, ambiguous = {};
    for (const [field, s] of Object.entries(issues)) {
      if (s.UNRESOLVED) unresolved[field] = s.UNRESOLVED;
      if (s.AMBIGUOUS) ambiguous[field] = s.AMBIGUOUS;
    }
    out[col] = { unresolved, ambiguous };
  }
  return out;
}

// ---------------------------------------------------------------------------
// gyms.documents shape analysis (Step 8)
// ---------------------------------------------------------------------------
function analyzeDocumentsShape() {
  const shape = { missing: 0, null: 0, object: 0, array: 0, string: 0, number: 0, boolean: 0, other: 0 };
  const keyTypes = {}; // key -> {object,string,array,number,boolean,null}
  const gymsWithDocs = [];
  for (const g of Object.values(ctx.gyms)) {
    const docs = g.documents;
    const t = typeOf(docs);
    shape[t === 'timestamp' ? 'other' : t] = (shape[t === 'timestamp' ? 'other' : t] || 0) + 1;
    if (typeof docs === 'object' && docs !== null && !Array.isArray(docs)) {
      gymsWithDocs.push(Object.keys(docs).length);
      for (const [k, v] of Object.entries(docs)) {
        const kt = keyTypes[k] || (keyTypes[k] = {});
        const vt = typeOf(v);
        kt[vt === 'timestamp' ? 'string' : vt] = (kt[vt === 'timestamp' ? 'string' : vt] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(keyTypes).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));
  return { shape, representativeKeys: sorted.slice(0, 25).map(([k, v]) => ({ key: k.slice(0, 40), types: v })), gymsWithDocs, totalGyms: Object.keys(ctx.gyms).length };
}

// ---------------------------------------------------------------------------
// Plan normalization proposal (Step 5)
// ---------------------------------------------------------------------------
function planNormalization() {
  const vocab = Object.entries(ctx.planVocab).sort((a, b) => b[1] - a[1]);
  const proposal = {
    canonical: MEMBER_PLANS,
    observed: vocab,
    bySource: ctx.planBySource,
    mapping: {},
    issues: { caseVariants: [], oldVariants: [], unknown: [] },
  };
  const norm = (s) => String(s).trim();
  const lower = (s) => norm(s).toLowerCase();
  const KNOWN = new Map(MEMBER_PLANS.map((p) => [p.toLowerCase(), p]));
  const OLD = { monthly: 'Standard', yearly: 'Annual', '3 month': 'Quarterly', quarterly: 'Quarterly', halfyearly: 'Annual', 'half yearly': 'Annual', '6 month': 'Annual', trial: 'Trial', daypass: 'Day Pass', 'day pass': 'Day Pass', lifetime: 'Lifetime', premium: 'Premium', standard: 'Standard', annual: 'Annual' };
  for (const [value, n] of vocab) {
    const l = lower(value);
    if (KNOWN.has(l)) { proposal.mapping[value] = KNOWN.get(l); continue; }
    if (OLD[l]) { proposal.mapping[value] = OLD[l]; proposal.issues.oldVariants.push({ value, count: n, to: OLD[l] }); continue; }
    proposal.mapping[value] = '(needs decision)';
    proposal.issues.unknown.push({ value, count: n });
  }
  // case variants: values whose lowercase maps to a canonical but text differs
  const canonSeen = new Set();
  for (const [value, n] of vocab) {
    const l = lower(value);
    if (KNOWN.has(l) && value !== KNOWN.get(l)) proposal.issues.caseVariants.push({ value, count: n, to: KNOWN.get(l) });
  }
  return proposal;
}

// ---------------------------------------------------------------------------
// Role normalization (Step 3)
// ---------------------------------------------------------------------------
function roleSummary() {
  const aliasesByRole = {};
  for (const a of ctx.roleAliases) (aliasesByRole[a.role] ||= []).push(a.doc);
  return {
    counts: ctx.roles,
    aliases: Object.fromEntries(Object.entries(aliasesByRole).map(([r, docs]) => [r, docs.length])),
    invalidRoles: Object.fromEntries(Object.entries(ctx.invalidRoles).filter(([k]) => k !== 'samples')),
    roleGymInconsistencies: ctx.roleGymInconsistencies.slice(0, 100),
    roleGymInconsistencyCount: ctx.roleGymInconsistencies.length,
  };
}

// ---------------------------------------------------------------------------
// Gym integrity (Step 4)
// ---------------------------------------------------------------------------
function gymSummary() {
  const perGym = [];
  const related = {};
  for (const g of Object.values(ctx.gyms)) {
    const gid = String(g.gymId || '');
    const members = (ctx.data.members || []).filter((d) => d.fields.gymId === gid).length;
    const trainers = (ctx.data.trainers || []).filter((d) => d.fields.gymId === gid).length;
    const users = Object.values(ctx.users).filter((u) => u.gymId === gid).length;
    const payments = (ctx.data.payments || []).filter((d) => d.fields.gymId === gid).length;
    const attendance = (ctx.data.attendance || []).filter((d) => d.fields.gymId === gid).length;
    const sub = g.subscription;
    const subKeys = sub && typeof sub === 'object' && !Array.isArray(sub) ? Object.keys(sub) : [];
    const docsShape = typeOf(g.documents);
    perGym.push({
      gymId: shortId(gid),
      approvalStatus: g.approvalStatus,
      status: g.status,
      ownerResolved: !!(g.ownerUid && ctx.users[g.ownerUid]),
      ownerRole: g.ownerUid && ctx.users[g.ownerUid] ? ctx.users[g.ownerUid].role : null,
      subscription: { present: sub !== undefined, isObject: sub !== undefined && typeof sub === 'object' && !Array.isArray(sub), keyCount: subKeys.length, keys: subKeys.slice(0, 40) },
      documents: docsShape,
      related: { users, members, trainers, payments, attendance },
    });
    related[gid] = { users, members, trainers, payments, attendance };
  }
  const ownerOrphans = Object.entries(ctx.gyms).filter(([, g]) => g.ownerUid && !ctx.users[g.ownerUid]).map(([id]) => shortId(id));
  const gymlessUsers = Object.values(ctx.users).filter((u) => u.gymId && u.gymId !== 'default' && !ctx.gyms[u.gymId]).map((u) => ({ doc: shortId(u.uid || ''), gymId: shortId(String(u.gymId)) }));
  return { gymCount: perGym.length, perGym, ownerOrphans, gymlessUsers, issues: ctx.gymIssues };
}

// ---------------------------------------------------------------------------
// UID mapping summary (Step 2)
// ---------------------------------------------------------------------------
function uidMappingSummary() {
  const authUids = new Set(Object.keys(ctx.users));
  const exportUids = new Set(Object.keys(ctx.authExport));
  const inExportNotFirestore = [...exportUids].filter((u) => !authUids.has(u));
  const inFirestoreNotExport = [...authUids].filter((u) => !exportUids.has(u));
  return {
    usersDocs: Object.keys(ctx.users).length,
    authExportUsers: exportUids.size,
    inAuthExportNotUsersDoc: inExportNotFirestore.length,
    inUsersDocNotAuthExport: inFirestoreNotExport.length,
    refs: ctx.refIssues,
  };
}

// ---------------------------------------------------------------------------
// Final bucket aggregation
// ---------------------------------------------------------------------------
function finalBuckets() {
  let safe = 0, ambiguous = 0, blocking = 0, total = 0;
  for (const [col, docs] of Object.entries(ctx.data)) {
    total += docs.length;
    safe += ctx.safeDocs[col] || 0;
    ambiguous += (ctx.ambiguousDocs[col] || []).length;
    blocking += (ctx.blockingDocs[col] || []).length;
  }
  const msgTotal = Object.values(ctx.messages).reduce((a, m) => a + m.length, 0);
  total += msgTotal;
  safe += ctx.safeDocs.aiConversationMessages || 0;
  return { total, safe, ambiguous, blocking, messageTotal: msgTotal };
}

// ---------------------------------------------------------------------------
// Auth export loader (local users_export.json — informational cross-check)
// ---------------------------------------------------------------------------
function loadAuthExport(path) {
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    for (const u of raw.users || []) {
      ctx.authExport[u.localId] = {
        email: u.email ? maskEmail(u.email) : null,
        disabled: !!u.disabled,
        emailVerified: !!u.emailVerified,
      };
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log(`IRONPULSE Firestore Inventory — READ ONLY | project=${PROJECT}`);
  console.log(`refusing to run if write-intent env flags present...`);
  const dangerous = ['FIREBASE_EMULATOR', 'SUPABASE_SERVICE_ROLE_KEY', 'FIREBASE_SERVICE_ACCOUNT'];
  for (const k of dangerous) {
    if (process.env[k] && String(process.env[k]).length) {
      console.error(`ABORT: write-capable credential env ${k} is set — this script is read-only by design.`);
      process.exit(3);
    }
  }

  const token = await getAccessToken();
  const fsr = new FirestoreReader(token);
  const started = Date.now();

  const rootIds = await fsr.listCollectionIds();
  console.log(`collections found: ${rootIds.length}`);
  const unknown = rootIds.filter((c) => !KNOWN_COLLECTIONS.includes(c));
  if (unknown.length) console.log(`  UNKNOWN collections: ${unknown.join(', ')}`);

  const targets = [...new Set([...KNOWN_COLLECTIONS, ...rootIds])];
  for (const col of targets) {
    let res;
    try {
      res = await fsr.listAll(col);
    } catch (e) {
      ctx.errors.push({ collection: col, message: String(e.message || e) });
      console.log(`  [error] ${col}: ${e.message}`);
      continue;
    }
    ctx.data[col] = res.docs.map((d) => ({
      id: d.id,
      createTime: d.createTime || null,
      updateTime: d.updateTime || null,
      fields: convFields(d.fields),
    }));
    ctx.counts[col] = res.docs.length;
    console.log(`  ${col}: ${res.docs.length}`);
  }

  // subcollection: aiConversations/{id}/messages
  for (const conv of ctx.data.aiConversations || []) {
    const res = await fsr.listAll(`aiConversations/${conv.id}/messages`);
    if (res.docs.length) ctx.messages[conv.id] = res.docs;
  }
  const msgTotal = Object.values(ctx.messages).reduce((a, m) => a + m.length, 0);
  console.log(`  aiConversationMessages: ${msgTotal}`);

  // auth export cross-check
  loadAuthExport(ARGS.authExport);

  // ---- audits (order matters: users & gyms first) ----
  const defs = COLLECTION_DEFS;
  const results = {};
  results.users = auditUsers(ctx.data.users || []);
  results.gyms = auditGyms(ctx.data.gyms || []);
  results.subscriptions = auditSubscriptions(ctx.data.subscriptions || []);
  results.subscriptionHistory = auditSubscriptionHistory(ctx.data.subscriptionHistory || []);
  results.paymentAttempts = auditPaymentAttempts(ctx.data.paymentAttempts || []);
  results.members = auditMembers(ctx.data.members || []);
  results.trainers = auditTrainers(ctx.data.trainers || []);
  results.plans = auditPlans(ctx.data.plans || []);
  results.planTemplates = auditGenericEnum('planTemplates', ctx.data.planTemplates || [], 'type', ['diet', 'workout'], ['gymId']);
  results.dietPlans = auditMemberPlanRefs('dietPlans', ctx.data.dietPlans || [], 'memberId', 'authUid', 'assignedTrainerAuthUid');
  results.workoutPlans = auditMemberPlanRefs('workoutPlans', ctx.data.workoutPlans || [], 'memberId', 'authUid', 'trainerAuthUid');
  results.progressLogs = auditMemberPlanRefs('progressLogs', ctx.data.progressLogs || [], 'memberId', 'authUid', 'trainerId');
  results.payments = auditPayments(ctx.data.payments || []);
  results.attendance = auditAttendance(ctx.data.attendance || []);
  results.notifications = auditNotifications(ctx.data.notifications || []);
  results.supportTickets = auditGenericEnum('supportTickets', ctx.data.supportTickets || [], 'status', TICKET_STATUS, ['gymId']);
  results.featureRequests = auditGenericEnum('featureRequests', ctx.data.featureRequests || [], 'status', FEATURE_STATUS, ['gymId']);
  results.contactMessages = auditContactMessages(ctx.data.contactMessages || []);
  results.settings = auditSettings(ctx.data.settings || []);
  results.whatsappLogs = auditGenericEnum('whatsappLogs', ctx.data.whatsappLogs || [], 'status', WA_LOG_STATUS, ['gymId']);
  results.whatsappCampaigns = auditGenericEnum('whatsappCampaigns', ctx.data.whatsappCampaigns || [], 'status', CAMPAIGN_STATUS, ['gymId']);
  results.licensedDevices = auditGenericEnum('licensedDevices', ctx.data.licensedDevices || [], 'status', DEVICE_STATUS, ['gymId']);
  results.licenseHistory = auditGenericEnum('licenseHistory', ctx.data.licenseHistory || [], null, [], ['gymId']);
  results.referralCodes = auditReferralCodes(ctx.data.referralCodes || []);
  results.referrals = auditReferrals(ctx.data.referrals || []);
  results.rewardLedger = auditGenericEnum('rewardLedger', ctx.data.rewardLedger || [], 'status', REWARD_STATUS, ['gymId']);
  results.discountCoupons = auditGenericEnum('discountCoupons', ctx.data.discountCoupons || [], 'status', COUPON_STATUS, ['gymId']);
  results.referralAuditLogs = auditGenericEnum('referralAuditLogs', ctx.data.referralAuditLogs || [], null, [], []);
  results.auditLog = auditGenericEnum('auditLog', ctx.data.auditLog || [], null, [], []);
  results.aiConversations = auditConversations(ctx.data.aiConversations || []);
  results.aiConversationMessages = auditConversationMessages();
  results.generatedReports = auditGenericEnum('generatedReports', ctx.data.generatedReports || [], 'format', REPORT_FORMAT, ['gymId']);

  auditDeterministic();
  const buckets = finalBuckets();
  const report = {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    readOnly: true,
    writeGuards: dangerous.filter((k) => process.env[k]).map((k) => `${k} aborted-if-set`),
    collections: ctx.counts,
    unknownCollections: unknown,
    collectionResults: results,
    uidMapping: uidMappingSummary(),
    roles: roleSummary(),
    gyms: gymSummary(),
    planNormalization: planNormalization(),
    deterministic: ctx.deterministic,
    orphans: orphanCounts(),
    documentsShape: analyzeDocumentsShape(),
    quality: ctx.quality,
    blockingDocs: ctx.blockingDocs,
    ambiguousDocs: ctx.ambiguousDocs,
    buckets,
    readErrors: ctx.errors,
  };

  mkdirSync(ARGS.out, { recursive: true });
  const outPath = join(ARGS.out, 'migration_inventory_report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nreport written: ${outPath}`);

  console.log('\n===== SUMMARY =====');
  console.log(`collections present : ${rootIds.length} (unknown: ${unknown.length || 'none'})`);
  console.log(`total documents     : ${buckets.total}`);
  console.log(`  safe              : ${buckets.safe}`);
  console.log(`  ambiguous         : ${buckets.ambiguous}`);
  console.log(`  blocking          : ${buckets.blocking}`);
  console.log(`read errors         : ${ctx.errors.length}`);
  console.log(`elapsed             : ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('(no sensitive field values were logged or persisted)');
}

main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  console.error(e?.stack || '');
  process.exit(1);
});