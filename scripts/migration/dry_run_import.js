// ============================================================================
// IRONPULSE — Supabase Migration Step 5B: DRY-RUN IMPORT TRANSFORMER
// ----------------------------------------------------------------------------
// READ-ONLY against Firebase (admin-read REST via Firebase CLI OAuth token).
// NEVER connects to Supabase. NEVER writes to Firebase. Produces sanitized
// deterministic manifests under migration-output/ (safe / manual-review /
// quarantine / summaries).
//
// Rules source of truth: docs/FIREBASE_IMPORT_RULES.md
// Schema source of truth: supabase/migrations/0001_initial_schema.sql
//
// ID / FK model (STEP 7A — see docs/SUPABASE_DATA_IMPORT_AUTH_MAPPING.md):
//   - profiles.id = auth.users.id (LIVE UUID from auth_id_mapper.js's
//     firebase-to-supabase-id-map.json — NEVER the deterministic placeholder
//     below; the dry-run keeps detUuid() only so artifacts are deterministic).
//   - profiles.firebase_uid = original Firebase UID (unique, NOT NULL).
//   - members.id / trainers.id = detUuid(legacy doc id) — member/trainer refs
//     in UUID FK columns (attendance.member_id/trainer_id, payments.member_id,
//     diet/workout/progress member_id, members.trainer_id, ...) resolve here;
//     raw Firebase doc ids are NEVER written into uuid columns.
//   - All other user refs are TEXT FKs → profiles(firebase_uid) by approved
//     DDL (owner_uid, auth_uid, created_by, user_id, actor_uid, ...) — values
//     stay as Firebase UIDs, identity-validated against the approved set.
//
// Usage:
//   node scripts/migration/dry_run_import.js [--out migration-output] [--project ironpulse-32f31]
//
// Guards: aborts when FIREBASE_EMULATOR, SUPABASE_SERVICE_ROLE_KEY or
// FIREBASE_SERVICE_ACCOUNT are set in the environment.
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, readFileSync as rf } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT_DEFAULT = join(ROOT, 'migration-output');

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const OUT = args.includes('--out') ? arg('--out', OUT_DEFAULT) : OUT_DEFAULT;

for (const v of ['FIREBASE_EMULATOR', 'SUPABASE_SERVICE_ROLE_KEY', 'FIREBASE_SERVICE_ACCOUNT']) {
  if (process.env[v]) {
    console.error(`REFUSING TO RUN: ${v} is set in the environment. Dry-run must stay read-only.`);
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------
function detUuid(legacyId) {
  const h = createHash('sha256').update(`IRONPULSE:${legacyId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const b = h.subarray(0, 16);
  return `${b.toString('hex', 0, 4)}-${b.toString('hex', 4, 6)}-${b.toString('hex', 6, 8)}-${b.toString('hex', 8, 10)}-${b.toString('hex', 10, 16)}`;
}

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

const DENY_KEY = /(password|passwd|salt|hash|secret|token|credential|api[-_ ]?key|private[-_ ]?key)/i;

function scrubValue(v, path = '') {
  if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, path));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (DENY_KEY.test(k)) continue;
      if (typeof val === 'string' && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(val)) {
        out[k] = maskEmail(val);
        continue;
      }
      out[k] = scrubValue(val, `${path}.${k}`);
    }
    return out;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Firebase read-only access (same pattern as migration_inventory_report.js)
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
  if (!body.access_token) throw new Error(`token exchange failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
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

async function listDocs(access, project, col) {
  const out = [];
  let token = '';
  for (let i = 0; i < 100; i++) {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${col}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
    const body = await res.json();
    if (body.error) throw new Error(`${col}: ${body.error.code} ${body.error.message}`);
    for (const d of body.documents || []) {
      out.push({ id: d.name.split('/').pop(), createTime: d.createTime || null, updateTime: d.updateTime || null, fields: convFields(d.fields) });
    }
    token = body.nextPageToken;
    if (!token) break;
  }
  return out;
}

const COLLECTIONS = [
  'users', 'gyms', 'subscriptions', 'subscriptionHistory', 'paymentAttempts', 'members',
  'trainers', 'plans', 'planTemplates', 'dietPlans', 'workoutPlans', 'progressLogs',
  'payments', 'attendance', 'notifications', 'supportTickets', 'featureRequests',
  'contactMessages', 'settings', 'whatsappLogs', 'whatsappCampaigns', 'licensedDevices',
  'licenseHistory', 'referralCodes', 'referrals', 'rewardLedger', 'discountCoupons',
  'referralAuditLogs', 'auditLog', 'aiConversations', 'generatedReports',
];

const TABLE = {
  users: 'profiles', gyms: 'gyms', subscriptions: 'subscriptions',
  subscriptionHistory: 'subscription_history', paymentAttempts: 'payment_attempts',
  members: 'members', trainers: 'trainers', plans: 'plans', planTemplates: 'plan_templates',
  dietPlans: 'diet_plans', workoutPlans: 'workout_plans', progressLogs: 'progress_logs',
  payments: 'payments', attendance: 'attendance', notifications: 'notifications',
  supportTickets: 'support_tickets', featureRequests: 'feature_requests',
  contactMessages: 'contact_messages', settings: 'settings', whatsappLogs: 'whatsapp_logs',
  whatsappCampaigns: 'whatsapp_campaigns', licensedDevices: 'licensed_devices',
  licenseHistory: 'license_history', referralCodes: 'referral_codes', referrals: 'referrals',
  rewardLedger: 'reward_ledger', discountCoupons: 'discount_coupons',
  referralAuditLogs: 'referral_audit_logs', auditLog: 'audit_log',
  aiConversations: 'ai_conversations', aiConversationMessages: 'ai_conversation_messages',
  generatedReports: 'generated_reports',
};

const USER_ROLES = new Set(['super_admin', 'gym_admin', 'trainer', 'member', 'pending', 'gym_owner_pending', 'rejected', 'gym_owner', 'admin']);
const APPROVAL_STATUS = new Set(['pending', 'approved', 'rejected', 'suspended']);
const SUB_STATUS = new Set(['trial', 'active', 'expired', 'suspended', 'cancelled']);
const SUB_PAY_STATUS = new Set(['pending', 'paid']);
const NOTIF_PRIORITY = new Set(['normal', 'high', 'low']);
const ATT_METHOD = new Set(['Auto', 'Manual', 'reception', 'QR']);
const CONTACT_STATUS = new Set(['New', 'Read']);
const MSG_ROLE = new Set(['user', 'assistant', 'system']);
const CANONICAL_PLANS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass'];

function parseDurationToMinutes(s) {
  if (s == null) return { ok: false, reason: 'missing duration' };
  const t = String(s).trim();
  const m = /^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|month|months|y|year|years)?$/i.exec(t);
  if (!m) return { ok: false, reason: `unparseable duration '${t}'` };
  const n = Number(m[1]);
  const unit = (m[2] || '').toLowerCase();
  const factors = { '': 1, min: 1, mins: 1, minute: 1, minutes: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, d: 1440, day: 1440, days: 1440, w: 10080, week: 10080, weeks: 10080, month: 43200, months: 43200, y: 525600, year: 525600, years: 525600 };
  return { ok: true, minutes: Math.round(n * (factors[unit] ?? 1)) };
}

function toDate(v) {
  if (v == null) return null;
  const s = String(v);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

// ---------------------------------------------------------------------------
// Transformers — each returns { bucket, reasons[], record (sanitized), missing[], unresolved[], transformed[] }
// ---------------------------------------------------------------------------
function transformUser(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  if (f.email == null || String(f.email).trim() === '') missing.push('email');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(f.email || ''))) missing.push('invalid-email');
  if (f.role == null) missing.push('role');
  if (f.role != null && !USER_ROLES.has(String(f.role))) missing.push(`role-unknown:${f.role}`);
  const role = String(f.role || '');

  let gymId = null;
  const rawGym = f.gymId != null ? String(f.gymId) : null;
  if (rawGym) {
    if (ctx.gymsById.has(rawGym)) {
      gymId = rawGym;
    } else if (rawGym === 'default') {
      transformed.push(`gymId: sentinel 'default' has no gym doc — resolved via gym.ownerUid or NULL`);
    } else if (role === 'super_admin') {
      transformed.push(`gymId: '${rawGym}' not resolvable (cosmetic on super_admin) → NULL`);
    } else {
      unresolved.push('gymId');
      reasons.push(`gymId '${rawGym}' has no gym doc`);
    }
  } else {
    reasons.push('no gymId field');
  }
  if (gymId == null && role === 'gym_owner') {
    const backfill = ctx.ownerGymsByUid.get(d.id);
    if (backfill && backfill.length === 1) {
      gymId = backfill[0];
      transformed.push('gymId: backfilled from gym.ownerUid (authoritative owner→gym link)');
    } else if (backfill && backfill.length > 1) {
      reasons.push(`multiple gyms claim this ownerUid (${backfill.join(', ')}) — owner gym ambiguous`);
    }
  }

  let bucket = 'safe';
  if (missing.length) bucket = 'blocking';
  else if (role === 'rejected') { bucket = 'manual'; reasons.push('rejected account (decision: import as disabled or exclude)'); }
  else if (role === 'gym_owner_pending') { bucket = 'manual'; reasons.push('approval pending (decision: provision or wait)'); }
  else if (role === 'gym_owner' && gymId === null) { bucket = 'manual'; reasons.push('owner gym unresolved'); }
  else if ((role === 'member' || role === 'trainer') && gymId === null) { bucket = 'manual'; reasons.push('unresolved gym for member/trainer'); }

  const record = {
    id: detUuid(d.id),
    firebase_uid: d.id,
    email: maskEmail(f.email),
    phone: maskPhone(f.phone),
    name: f.name ?? null,
    photo_url: f.photoUrl ?? f.photo_url ?? null,
    role: role || null,
    is_super_admin: role === 'super_admin',
    gym_id: gymId,
    referral_code: f.referralCode ?? f.referral_code ?? null,
    referred_by: f.referredBy ?? f.referred_by ?? null,
    account_disabled: role === 'rejected',
    disabled_reason: null,
    disabled_at: null,
    referral_code_generated_at: f.referralCodeGeneratedAt ?? null,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  if (f.email != null && record.email === '(invalid)') record.email = null;
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformGym(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const owner = f.ownerUid != null ? ctx.usersById.get(String(f.ownerUid)) : null;
  let bucket = 'safe';
  if (!owner) {
    bucket = 'quarantine';
    reasons.push('ownerUid has no users doc — no owner invented; quarantine record prepared');
    unresolved.push('ownerUid');
  } else if (owner.fields.role === 'rejected') {
    bucket = 'manual';
    reasons.push('owner account role=rejected (decision: import gym as inactive / keep owner link)');
  }
  if (f.gymId == null) transformed.push('gymId: doc-id fallback (R-GYMID-DOCID)');
  if (f.status != null) transformed.push('status: mapped to null (field absent in source)');
  const record = {
    id: d.id,
    gym_name: f.gymName ?? f.gym_name ?? null,
    owner_name: f.ownerName ?? null,
    email: maskEmail(f.email),
    phone: maskPhone(f.phone),
    owner_uid: owner ? String(f.ownerUid) : null,
    status: null,
    approval_status: APPROVAL_STATUS.has(String(f.approvalStatus)) ? String(f.approvalStatus) : null,
    approval_reviewed_at: null,
    approved_at: f.approvedAt ?? null,
    rejected_reason: f.rejectedReason ?? null,
    documents: {},
    subscription: f.subscription && typeof f.subscription === 'object' && !Array.isArray(f.subscription) ? scrubValue(f.subscription) : {},
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  if (!record.approval_status) missing.push('approvalStatus');
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformSubscription(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  let bucket = 'safe';
  const gymId = String(f.gymId || '');
  if (!ctx.gymsById.has(gymId)) { bucket = 'manual'; unresolved.push('gymId'); reasons.push(`gymId '${gymId}' has no gym doc`); }
  if (f.status != null && !SUB_STATUS.has(String(f.status))) { bucket = 'manual'; reasons.push(`status '${f.status}' not in subscription_status enum`); }
  if (f.paymentStatus != null && !SUB_PAY_STATUS.has(String(f.paymentStatus))) { bucket = 'manual'; reasons.push(`paymentStatus '${f.paymentStatus}' not in subscription_payment_status enum`); }
  const record = {
    id: detUuid(d.id),
    gym_id: gymId || null,
    plan: f.plan ?? null,
    plan_name: f.planName ?? null,
    plan_type: f.planType ?? null,
    amount: f.amount != null ? Number(f.amount) : null,
    currency: f.currency ?? 'INR',
    status: f.status ?? null,
    payment_status: f.paymentStatus ?? null,
    payment_method: f.paymentMethod ?? null,
    transaction_id: f.transactionId ?? f.transaction_id ?? null,
    paid_at: f.paidAt ?? null,
    expiry_date: toDate(f.expiryDate),
    started_at: f.startDate ?? f.startedAt ?? null,
    cancelled_at: f.cancelledAt ?? null,
    license_key: f.licenseKey ?? f.license_key ?? null,
    pending_payment_type: f.pendingPaymentType ?? null,
    created_by: f.createdBy ?? null,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  if (f.expiryDate != null && record.expiry_date == null) { transformed.push('expiryDate: unparseable'); bucket = 'manual'; reasons.push('expiryDate unparseable'); }
  if (record.license_key != null) transformed.push('licenseKey preserved');
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformSubscriptionHistory(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  let bucket = 'safe';
  const gymId = String(f.gymId || '');
  if (!ctx.gymsById.has(gymId)) { bucket = 'manual'; unresolved.push('gymId'); reasons.push(`gymId '${gymId}' has no gym doc`); }
  const linked = ctx.subsByGym.get(gymId);
  const subId = linked && linked.length === 1 ? detUuid(linked[0]) : null;
  if (linked && linked.length > 1) transformed.push('subscription_id: multiple candidates, left NULL');
  const record = {
    id: detUuid(d.id),
    gym_id: gymId || null,
    subscription_id: subId,
    action: f.action ?? null,
    actor_uid: f.actorUid ?? f.actor ?? null,
    changes: f.changes && typeof f.changes === 'object' ? scrubValue(f.changes) : {},
    created_at: f.createdAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformMember(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  if ('password' in f || 'passwordHash' in f || 'passwordSalt' in f) reasons.push('field with sensitive name detected in source and stripped — never migrated');
  const gymId = f.gymId != null ? (ctx.gymsById.has(String(f.gymId)) ? String(f.gymId) : null) : null;
  if (gymId == null) { missing.push('gymId'); reasons.push('no resolvable gymId (members.gym_id NOT NULL)'); }
  const authUid = f.authUid != null && ctx.usersById.has(String(f.authUid)) ? String(f.authUid) : null;
  if (f.authUid != null && !authUid) { unresolved.push('authUid'); reasons.push('authUid has no users doc'); }
  let weight = null;
  if (f.weight != null) {
    const w = Number(f.weight);
    weight = Number.isFinite(w) ? w : null;
    if (weight == null) { missing.push('weight'); reasons.push(`weight '${f.weight}' not numeric`); }
  }
  let bucket = 'quarantine';
  if (!reasons.length) bucket = 'safe';
  const record = {
    id: detUuid(d.id),
    legacy_id: d.id,
    auth_uid: authUid,
    gym_id: gymId,
    name: f.name ?? null,
    email: maskEmail(f.email),
    phone: maskPhone(f.phone),
    contact: f.contact ?? null,
    age: f.age != null ? Number(f.age) : null,
    weight,
    height: f.height != null ? Number(f.height) : null,
    gender: f.gender ?? null,
    plan: f.plan ?? null,
    plan_price: f.planPrice != null ? Number(f.planPrice) : null,
    amount_paid: f.amountPaid != null ? Number(f.amountPaid) : 0,
    balance_due: f.balanceDue != null ? Number(f.balanceDue) : 0,
    payment_status: f.paymentStatus ?? 'Paid',
    status: f.status ?? null,
    checkins: f.checkins != null ? Number(f.checkins) : 0,
    trainer_id: f.trainerId != null && ctx.trainersById.has(String(f.trainerId)) ? detUuid(String(f.trainerId)) : null,
    trainer_auth_uid: f.trainerAuthUid ?? null,
    avatar: f.avatar ?? null,
    color: f.color ?? null,
    photo_url: f.photoUrl ?? null,
    storage_path: f.storagePath ?? null,
    expiry: toDate(f.expiry),
    notes: f.notes ?? null,
    join_date: toDate(f.join),
    referred_by: f.referredBy ?? null,
    created_by: null,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  if (f.weight != null && weight != null && String(f.weight) !== String(weight)) transformed.push('weight: coerced to numeric');
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformTrainer(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const gymId = f.gymId != null ? (ctx.gymsById.has(String(f.gymId)) ? String(f.gymId) : null) : null;
  if (gymId == null) { missing.push('gymId'); reasons.push('no resolvable gymId (trainers.gym_id NOT NULL)'); }
  const authUid = f.authUid != null && ctx.usersById.has(String(f.authUid)) ? String(f.authUid) : null;
  if (f.authUid != null && !authUid) { unresolved.push('authUid'); reasons.push('authUid has no users doc'); }
  let bucket = 'safe';
  if (missing.length || unresolved.length) bucket = 'manual';
  if (!reasons.length && f.name == null) { missing.push('name'); bucket = 'manual'; reasons.push('name required'); }
  const record = {
    id: detUuid(d.id),
    legacy_id: d.id,
    auth_uid: authUid,
    gym_id: gymId,
    name: f.name ?? null,
    email: maskEmail(f.email),
    phone: maskPhone(f.phone),
    specialty: f.specialty ?? null,
    rating: f.rating != null ? Number(f.rating) : null,
    clients: f.clients != null ? Number(f.clients) : 0,
    bio: f.bio ?? null,
    experience: f.experience ?? null,
    avatar: f.avatar ?? null,
    color: f.color ?? null,
    created_by: null,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformPlan(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const name = f.name != null ? String(f.name) : null;
  let bucket = 'safe';
  if (!CANONICAL_PLANS.includes(name)) { bucket = 'manual'; reasons.push(`plan name '${name}' has no consumer evidence — MANUAL_REVIEW (no semantic mapping without evidence)`); }
  const gymId = f.gymId != null ? String(f.gymId) : null;
  if (gymId == null) {
    bucket = 'quarantine';
    missing.push('gymId');
    reasons.push('missing gymId (plans.gym_id NOT NULL, no safe fallback)');
  } else if (gymId === 'default') {
    if (bucket !== 'quarantine') bucket = 'manual';
    transformed.push('gym_id: sentinel \'default\' → tenant decision required');
    reasons.push(`gymId 'default' sentinel has no gym doc — tenant decision required`);
  } else if (!ctx.gymsById.has(gymId)) {
    if (bucket !== 'quarantine') bucket = 'manual';
    unresolved.push('gymId');
    reasons.push(`gymId '${gymId}' has no gym doc`);
  }
  const dur = parseDurationToMinutes(f.duration);
  if (!dur.ok) { bucket = 'manual'; reasons.push(dur.reason); }
  const duration = dur.ok ? dur.minutes : null;
  if (dur.ok && f.duration != null && String(f.duration) !== String(duration)) transformed.push('duration: coerced to minutes');
  const durationDays = f.durationDays != null ? Number(f.durationDays) : (dur.ok ? Math.round(duration / 1440) : null);
  const record = {
    id: detUuid(d.id),
    gym_id: gymId && gymId !== 'default' && ctx.gymsById.has(gymId) ? gymId : null,
    name,
    price: f.price != null ? Number(f.price) : null,
    duration,
    duration_days: durationDays,
    description: f.description ?? null,
    active: f.active == null ? true : !!f.active,
    sort_order: f.order != null ? Number(f.order) : 0,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformAttendance(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const memberId = f.memberId != null ? String(f.memberId) : null;
  const memberLink = memberId && (ctx.membersByAuth.get(memberId) || ctx.membersById.get(memberId));
  const userLink = memberId && ctx.usersById.get(memberId);
  if (!memberId) missing.push('memberId');
  if (f.gymId == null) missing.push('gymId');
  if (!memberLink && !userLink) { unresolved.push('memberId'); reasons.push('memberId resolves to no member/users doc — not DERIVABLE'); }
  let bucket = 'quarantine';
  if (memberLink && ctx.gymsById.has(String(f.gymId))) bucket = 'safe';
  const record = {
    id: detUuid(d.id),
    gym_id: f.gymId != null && ctx.gymsById.has(String(f.gymId)) ? String(f.gymId) : null,
    member_id: memberLink ? detUuid(memberLink) : null,
    auth_uid: memberId && userLink ? memberId : null,
    member_name: f.memberName ?? null,
    avatar: f.avatar ?? null,
    color: f.color ?? null,
    plan: f.plan ?? null,
    trainer_id: f.trainerId != null && ctx.trainersById.has(String(f.trainerId)) ? detUuid(String(f.trainerId)) : null,
    trainer_auth_uid: f.trainerAuthUid ?? null,
    trainer_name: f.trainerName ?? null,
    date: f.date != null ? toDate(f.date) : null,
    time: f.time ?? null,
    method: f.method != null && ATT_METHOD.has(String(f.method)) ? String(f.method) : 'Manual',
    duration: f.duration != null ? Number(f.duration) : 90,
    created_at: f.createdAt ?? f.timestamp ?? null,
  };
  if (f.method == null) transformed.push('method: defaulted to Manual (DDL default)');
  if (f.duration == null) transformed.push('duration: defaulted to 90 (DDL default)');
  if (f.date == null) missing.push('date');
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformNotification(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const userId = f.userId != null ? String(f.userId) : null;
  let bucket = 'safe';
  if (!userId || !ctx.usersById.has(userId)) {
    bucket = 'quarantine';
    unresolved.push('userId');
    reasons.push('userId missing or has no users doc (notifications.user_id NOT NULL)');
  }
  if (f.priority != null && !NOTIF_PRIORITY.has(String(f.priority))) { bucket = 'manual'; reasons.push(`priority '${f.priority}' not in notification_priority enum`); }
  const gymId = f.gymId != null ? String(f.gymId) : null;
  if (gymId && gymId === 'default') transformed.push('gymId: sentinel \'default\' → NULL (R-SENTINEL-NULL, nullable FK)');
  const record = {
    id: detUuid(d.id),
    user_id: userId && ctx.usersById.has(userId) ? userId : null,
    gym_id: gymId && gymId !== 'default' && ctx.gymsById.has(gymId) ? gymId : null,
    role: f.role ?? null,
    title: f.title ?? null,
    message: f.message ?? null,
    type: f.type ?? null,
    subtype: f.subtype ?? null,
    priority: f.priority ?? 'normal',
    icon: f.icon ?? null,
    action_url: f.actionUrl ?? null,
    related_document_id: f.relatedDocumentId ?? null,
    page: f.page ?? null,
    tab: f.tab ?? null,
    contact_id: f.contactId ?? null,
    target_role: f.targetRole ?? null,
    read: f.read == null ? false : !!f.read,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformSetting(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const bareId = d.id.includes(':') ? d.id.split(':').slice(1).join(':') : d.id;
  const idGymId = d.id.includes(':') ? d.id.split(':')[0] : null;
  let gymId = f.gymId != null ? String(f.gymId) : (idGymId || 'default');
  if (bareId === 'platform') {
    gymId = 'platform';
    transformed.push('gym_id: doc_id \'platform\' → \'platform\' (guard_settings_gym exempt, consumed by PlatformSettings.jsx)');
  } else if (gymId !== 'platform' && !ctx.gymsById.has(gymId)) {
    transformed.push(`gym_id: '${gymId}' fails guard_settings_gym (tenant decision, not an ID break)`);
    reasons.push(`settings.gym_id '${gymId}' fails guard_settings_gym (not 'platform', no gym doc) — tenant decision required`);
  }
  const data = scrubValue({ ...f });
  delete data.gymId;
  const record = {
    gym_id: gymId,
    doc_id: bareId,
    data,
    updated_at: f.updatedAt ?? null,
  };
  return { bucket: reasons.length ? 'manual' : 'safe', reasons, record, missing, unresolved, transformed };
}

function transformLicenseHistory(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const gymId = String(f.gymId || '');
  let bucket = 'safe';
  if (!ctx.gymsById.has(gymId)) { bucket = 'manual'; unresolved.push('gymId'); reasons.push(`gymId '${gymId}' has no gym doc`); }
  const record = {
    id: detUuid(d.id),
    gym_id: gymId || null,
    device_id: f.deviceId ?? null,
    action: f.action ?? null,
    performed_by: f.performedBy ?? null,
    created_at: f.createdAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformReferralCode(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const code = String(d.id || f.code || '');
  let bucket = 'safe';
  if (!/^IP-[A-Z0-9]{6}$/.test(code)) { bucket = 'manual'; reasons.push(`code '${code}' fails format check`); }
  const referrer = f.referrerUid != null ? String(f.referrerUid) : null;
  if (!referrer || !ctx.usersById.has(referrer)) { bucket = 'manual'; unresolved.push('referrerUid'); reasons.push('referrerUid missing or no users doc'); }
  const record = { code, referrer_uid: referrer, created_at: f.createdAt ?? null };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformConversation(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const userId = f.userId != null ? String(f.userId) : null;
  let bucket = 'safe';
  if (!userId || !ctx.usersById.has(userId)) { bucket = 'quarantine'; unresolved.push('userId'); reasons.push('userId missing or no users doc (ai_conversations.user_id NOT NULL)'); }
  const gymId = f.gymId != null ? String(f.gymId) : null;
  if (gymId && gymId === 'default') transformed.push('gymId: sentinel \'default\' → NULL (R-SENTINEL-NULL)');
  const record = {
    id: detUuid(d.id),
    user_id: userId && ctx.usersById.has(userId) ? userId : null,
    gym_id: gymId && gymId !== 'default' && ctx.gymsById.has(gymId) ? gymId : null,
    role: f.role ?? null,
    title: f.title ?? null,
    pinned: f.pinned == null ? false : !!f.pinned,
    archived: f.archived == null ? false : !!f.archived,
    deleted: f.deleted == null ? false : !!f.deleted,
    deleted_at: f.deletedAt ?? null,
    last_message: f.lastMessage ?? null,
    message_count: f.messageCount != null ? Number(f.messageCount) : 0,
    created_at: f.createdAt ?? null,
    updated_at: f.updatedAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformMessage(d, ctx) {
  const f = d.fields;
  const reasons = [];
  const missing = [];
  const unresolved = [];
  const transformed = [];
  const convId = ctx.convByMsgId.get(d.id);
  let bucket = 'safe';
  if (!convId) { bucket = 'quarantine'; unresolved.push('conversationId'); reasons.push('parent conversation missing'); }
  if (f.role != null && !MSG_ROLE.has(String(f.role))) { bucket = 'manual'; reasons.push(`role '${f.role}' not in (user,assistant,system)`); }
  if (f.content == null) missing.push('content');
  const record = {
    id: detUuid(d.id),
    conversation_id: convId ? detUuid(convId) : null,
    role: f.role ?? null,
    content: f.content ?? null,
    metadata: f.metadata && typeof f.metadata === 'object' ? scrubValue(f.metadata) : {},
    created_at: f.createdAt ?? null,
  };
  return { bucket, reasons, record, missing, unresolved, transformed };
}

function transformContactMessage(d) {
  const f = d.fields;
  const record = {
    id: detUuid(d.id),
    name: f.name ?? null,
    email: maskEmail(f.email),
    message: f.message ?? null,
    status: CONTACT_STATUS.has(String(f.status)) ? String(f.status) : 'New',
    created_at: f.createdAt ?? null,
  };
  const transformed = [];
  if (f.status != null && !CONTACT_STATUS.has(String(f.status))) transformed.push('status: defaulted to New (enum)');
  return { bucket: 'safe', reasons: [], record, missing: [], unresolved: [], transformed };
}

const TRANSFORMERS = {
  users: transformUser,
  gyms: transformGym,
  subscriptions: transformSubscription,
  subscriptionHistory: transformSubscriptionHistory,
  members: transformMember,
  trainers: transformTrainer,
  plans: transformPlan,
  attendance: transformAttendance,
  notifications: transformNotification,
  settings: transformSetting,
  licenseHistory: transformLicenseHistory,
  referralCodes: transformReferralCode,
  aiConversations: transformConversation,
  aiConversationMessages: transformMessage,
  contactMessages: transformContactMessage,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const project = args.includes('--project') ? arg('--project', 'ironpulse-32f31') : 'ironpulse-32f31';
  const access = await getAccessToken();
  console.log(`[dry-run] project=${project} out=${OUT}`);
  console.log('[dry-run] fetching collections (READ-ONLY)...');

  const data = {};
  for (const col of COLLECTIONS) data[col] = await listDocs(access, project, col);
  const messages = [];
  for (const conv of data.aiConversations) {
    const rows = await listDocs(access, project, `aiConversations/${conv.id}/messages`);
    messages.push(...rows.map((m) => ({ ...m, _convId: conv.id })));
  }
  data.aiConversationMessages = messages;
  console.log(`[dry-run] fetched ${COLLECTIONS.length} collections + messages subcollection`);

  const ctx = {
    gymsById: new Map(data.gyms.map((g) => [g.id, g])),
    usersById: new Map(data.users.map((u) => [u.id, u])),
    membersById: new Map(data.members.map((m) => [m.id, m])),
    membersByAuth: new Map(data.members.filter((m) => m.fields.authUid).map((m) => [String(m.fields.authUid), m.id])),
    trainersById: new Map(data.trainers.map((t) => [t.id, t])),
    subsByGym: new Map(),
    ownerGymsByUid: new Map(),
    convByMsgId: new Map(data.aiConversationMessages.filter((m) => m._convId).map((m) => [m.id, m._convId])),
  };
  for (const g of data.gyms) {
    if (g.fields.ownerUid == null) continue;
    const k = String(g.fields.ownerUid);
    ctx.ownerGymsByUid.set(k, [...(ctx.ownerGymsByUid.get(k) || []), g.id]);
  }
  for (const s of data.subscriptions) {
    const k = String(s.fields.gymId || '');
    ctx.subsByGym.set(k, [...(ctx.subsByGym.get(k) || []), s.id]);
  }

  const summary = {};
  const buckets = { safe: [], manual: [], quarantine: [] };
  const transformCols = [...COLLECTIONS, 'aiConversationMessages'];
  for (const col of transformCols) {
    const docs = data[col] || [];
    const t = TRANSFORMERS[col];
    if (!t) {
      summary[col] = { table: TABLE[col], sourceCount: docs.length, safeImport: 0, manualReview: 0, quarantine: 0, missingRequired: 0, unresolvedRefs: 0, transformedFields: 0, note: 'no transformer (empty source or unsupported)' };
      continue;
    }
    const counts = { safeImport: 0, manualReview: 0, quarantine: 0, missingRequired: 0, unresolvedRefs: 0, unresolvedImportable: 0, transformedFields: 0 };
    for (const d of docs) {
      const r = t(d, ctx);
      const key = r.bucket === 'safe' ? 'safeImport' : r.bucket === 'manual' ? 'manualReview' : 'quarantine';
      counts[key]++;
      counts.missingRequired += r.missing.length;
      counts.unresolvedRefs += r.unresolved.length;
      counts.unresolvedImportable += key !== 'quarantine' ? r.unresolved.length : 0;
      counts.transformedFields += r.transformed.length;
      buckets[key === 'safeImport' ? 'safe' : key === 'manualReview' ? 'manual' : 'quarantine'].push({
        table: TABLE[col],
        legacyId: d.id,
        reasons: r.reasons,
        missing: r.missing,
        unresolved: r.unresolved,
        transformed: r.transformed,
        record: scrubValue(r.record),
      });
    }
    summary[col] = { table: TABLE[col], sourceCount: docs.length, ...counts };
  }

  // deterministic identifier collision checks
  const det = {
    referralCodes: { codes: data.referralCodes.map((d) => d.id || d.fields.code), duplicates: 0 },
    paymentIds: { ids: data.payments.map((d) => d.fields.paymentId).filter(Boolean), duplicates: 0 },
    invoiceNos: { ids: data.payments.map((d) => d.fields.invoiceNo).filter(Boolean), duplicates: 0 },
    licenseKeys: { ids: data.subscriptions.map((d) => d.fields.licenseKey).filter(Boolean), duplicates: 0 },
    referralReferredUid: { ids: data.referrals.map((d) => d.fields.referredUid).filter(Boolean), duplicates: 0 },
    firebaseUids: { ids: data.users.map((d) => d.id), duplicates: 0 },
    gymIds: { ids: data.gyms.map((d) => d.id), duplicates: 0 },
  };
  for (const k of Object.keys(det)) {
    const seen = new Set();
    for (const v of det[k].ids || det[k].codes || []) {
      if (seen.has(v)) det[k].duplicates++;
      seen.add(v);
    }
  }

  // write artifacts
  const dirs = { safe: join(OUT, 'safe'), manual: join(OUT, 'manual-review'), quarantine: join(OUT, 'quarantine'), sums: join(OUT, 'summaries') };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });

  const byTable = (list) => list.reduce((m, r) => { (m[r.table] ||= []).push(r); return m; }, {});
  for (const [key, list] of Object.entries(buckets)) {
    const grouped = byTable(list);
    for (const [table, rows] of Object.entries(grouped)) writeFileSync(join(dirs[key], `${table}.json`), JSON.stringify(rows, null, 2));
  }

  const quarantineManifest = buckets.quarantine.filter((r) => r.table === 'attendance').map((r) => ({
    sourceDocumentId: r.legacyId,
    reason: r.reasons.join('; '),
    possibleParentMatches: [],
    recommendedAction: 're-attach to a real member by name/date evidence, or exclude as unattachable legacy/test data (30 rows also lack date/time)',
  }));
  writeFileSync(join(dirs.sums, 'attendance-quarantine-manifest.json'), JSON.stringify(quarantineManifest, null, 2));

  const authClassification = buckets.safe.filter((r) => r.table === 'profiles').map((r) => ({ firebaseUid: r.legacyId, classification: 'SAFE_AUTH_PROVISION' }))
    .concat(buckets.manual.filter((r) => r.table === 'profiles').map((r) => ({ firebaseUid: r.legacyId, classification: 'MANUAL_REVIEW', reasons: r.reasons })))
    .concat(buckets.quarantine.filter((r) => r.table === 'profiles').map((r) => ({ firebaseUid: r.legacyId, classification: 'BLOCKING', reasons: r.reasons })));
  writeFileSync(join(dirs.sums, 'user-auth-classification.json'), JSON.stringify(authClassification, null, 2));
  writeFileSync(join(dirs.sums, 'deterministic-identifiers.json'), JSON.stringify(det, null, 2));
  writeFileSync(join(dirs.sums, 'summary.json'), JSON.stringify(summary, null, 2));

  // gates
  const gateA = scanForCredentials();
  const gateB = Object.values(summary).reduce((n, s) => n + (s.unresolvedImportable || 0), 0);
  const gateC = buckets.quarantine.filter((r) => r.table === 'gyms').length + buckets.manual.filter((r) => r.table === 'gyms').length;
  const gateD = buckets.manual.filter((r) => r.table === 'plans' && r.reasons.some((x) => x.includes('plan name'))).length + buckets.quarantine.filter((r) => r.table === 'plans' && r.reasons.some((x) => x.includes('plan name'))).length;
  const gateE = quarantineManifest.length;
  const gateF = Object.values(det).reduce((n, v) => n + v.duplicates, 0);
  const gateG = Object.values(summary).filter((s) => s.sourceCount !== (s.safeImport || 0) + (s.manualReview || 0) + (s.quarantine || 0)).length;
  const gates = {
    'GATE A — no sensitive-value leakage (deny-list scan of all artifacts)': gateA.length ? 'RED' : 'GREEN',
    'GATE B — all canonical IDs resolvable (0 unresolved refs in safe+manual rows)': gateB === 0 ? 'GREEN' : `RED (${gateB} unresolved refs)`,
    'GATE C — all required gym relationships valid': gateC === 0 ? 'GREEN' : `RED (${gateC} gyms need owner/tenant decisions)`,
    'GATE D — plan vocabulary approved': gateD === 0 ? 'GREEN' : `RED (${gateD} plan names need mapping decisions)`,
    'GATE E — attendance orphan policy approved': gateE === 49 ? 'REVIEW REQUIRED (policy: quarantine all 49 until owner decision)' : `RED (${gateE}/49 quarantined)`,
    'GATE F — deterministic identifiers collision-free': gateF === 0 ? 'GREEN' : `RED (${gateF} collisions)`,
    'GATE G — import row counts reconciled': gateG === 0 ? 'GREEN' : `RED (${gateG} collections unreconciled)`,
  };

  const totalSafe = buckets.safe.length;
  const totalManual = buckets.manual.length;
  const totalQuarantine = buckets.quarantine.length;

  writeFileSync(join(dirs.sums, 'gates.json'), JSON.stringify({ gates, gateA: { scannedFiles: gateA }, totals: { safe: totalSafe, manualReview: totalManual, quarantine: totalQuarantine } }, null, 2));

  console.log('\n===== DRY-RUN SUMMARY =====');
  console.log(`total records       : ${totalSafe + totalManual + totalQuarantine}`);
  console.log(`  SAFE_IMPORT       : ${totalSafe}`);
  console.log(`  MANUAL_REVIEW     : ${totalManual}`);
  console.log(`  QUARANTINE        : ${totalQuarantine}`);
  console.log('\nper-collection:');
  for (const [col, s] of Object.entries(summary)) {
    console.log(`  ${col.padEnd(24)} src=${String(s.sourceCount).padStart(3)} safe=${String(s.safeImport).padStart(3)} manual=${String(s.manualReview).padStart(3)} quarantine=${String(s.quarantine).padStart(3)}`);
  }
  console.log('\ngates:');
  for (const [k, v] of Object.entries(gates)) console.log(`  ${k} : ${v}`);
  console.log(`\nartifacts written under: ${OUT}`);
  console.log('NO DATA WAS WRITTEN TO FIREBASE OR SUPABASE. READ-ONLY RUN COMPLETE.');
}

function scanForCredentials() {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && p.endsWith('.json')) {
        const text = rf(p, 'utf8');
        if (DENY_KEY.test(text)) found.push(p);
        if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) found.push(`${p} (unmasked email)`);
      }
    }
  };
  walk(OUT);
  return found;
}

main().catch((e) => {
  console.error(`FATAL: ${e?.message || e}`);
  console.error(e?.stack || '');
  process.exit(1);
});