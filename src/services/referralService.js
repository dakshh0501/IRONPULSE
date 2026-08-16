import { DEFAULT_GYM_ID } from './firestoreService'
import { validateReferralCodeFormat, generateReferralCode } from '../utils/referralCode'
import { subscribeRealtime } from './realtimeService'

export const REFERRAL_SETTINGS_ID = 'referralSettings'


// Supabase referrals row → Firestore-shaped referral
function mapReferralRow(r) {
  return {
    id: r.referred_uid || r.id,
    referredUid: r.referred_uid || '',
    referrerUid: r.referrer_uid || '',
    referralCode: r.referral_code || '',
    gymId: r.gym_id || '',
    referredName: r.referred_name || '',
    status: r.status || 'Pending',
    rewardType: r.reward_type || '',
    rewardValue: r.reward_value != null ? Number(r.reward_value) : 0,
    rewardIssued: Boolean(r.reward_issued),
    firstPaymentId: r.first_payment_id || '',
    expiresAt: r.expires_at || null,
    qualifiedAt: r.qualified_at || null,
    rewardedAt: r.rewarded_at || null,
    rewardRef: r.reward_ref || '',
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

// Supabase reward_ledger row → Firestore-shaped ledger item
function mapRewardLedgerRow(r) {
  return {
    id: r.id,
    type: r.type || '',
    rewardType: r.reward_type || '',
    rewardValue: r.reward_value != null ? Number(r.reward_value) : 0,
    extensionDays: r.extension_days || 0,
    referrerUid: r.referrer_uid || '',
    referredUid: r.referred_uid || '',
    userId: r.user_id || '',
    referralId: r.referral_id || '',
    gymId: r.gym_id || '',
    status: r.status || 'pending',
    issuedAt: r.issued_at || null,
    description: r.description || '',
    rewardRef: r.reward_ref || '',
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

// Supabase discount_coupons row → Firestore-shaped coupon
function mapDiscountCouponRow(r) {
  return {
    id: r.id,
    userId: r.user_id || '',
    gymId: r.gym_id || '',
    code: r.code || '',
    status: r.status || 'available',
    value: r.value != null ? Number(r.value) : 0,
    createdAt: r.created_at || null,
    usedAt: r.used_at || null,
  }
}

function referralSubscribe({ table, filter, orderBy, limitN, mapRow, label, callback, onError }) {
  return subscribeRealtime({
    table,
    filter,
    orderBy,
    limit: limitN,
    mapRow,
    onChange: callback,
    onError: (e) => {
      console.error(`[Supabase] ${label} realtime error:`, e.message)
      if (onError) onError(e, label)
    },
    label,
  })
}

// Key under which the signup referral code is parked locally until the
// approved member's first authenticated session can process it.
export const PENDING_REFERRAL_KEY = 'ironpulse-pending-referral'

const REFERRAL_STATUSES = ['Pending', 'Qualified', 'Rewarded', 'Rejected']

// ── DEV-ONLY DIAGNOSTIC LOGGING ───────────────
// Dead code in production builds (Vite replaces import.meta.env.DEV with
// false). Enable with VITE_REFERRAL_LOGGING=true in .env while running
// `npm run dev`. Logs collection paths, doc IDs and error codes — never
// credentials, emails or password material.
const REFERRAL_DEV_LOGGING =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.DEV === true &&
  import.meta.env?.VITE_REFERRAL_LOGGING === 'true'

function refDevLog(action, meta) {
  if (!REFERRAL_DEV_LOGGING) return
  console.warn(`[REFERRAL:dev] ${action}`, meta)
}

export function validateReferralStatus(status) {
  return REFERRAL_STATUSES.includes(status)
}

// ── SETTINGS ─────────────────────────────────────

export async function getReferralSettings() {
  return supabaseGetReferralSettings()
}

export function subscribeToReferralSettings(callback, onError) {
  return subscribeRealtime({
      table: 'settings',
      filter: [['gym_id', 'platform'], ['doc_id', REFERRAL_SETTINGS_ID]],
      limit: 1,
      keyFn: (r) => (r ? `${r.gym_id}:${r.doc_id}` : null),
      mapRow: (r) => r.data,
      onChange: (rows) => callback(rows[0] || null),
      onError: (e) => {
        console.error('[Supabase] referralSettings realtime error:', e.message)
        if (onError) onError(e, 'referralSettings')
      },
      label: 'referralSettings',
    })
}

export async function updateReferralSettings(data, changedBy) {
  return supabaseUpdateReferralSettings(data, changedBy)
}

// ── CRUD ─────────────────────────────────────────

export async function createReferral(referralData) {
  return supabaseCreateReferral(referralData)
}

export async function updateReferral(referralId, data) {
  return supabaseUpdateReferral(referralId, data)
}

export async function getReferralById(referralId) {
  return supabaseGetReferralById(referralId)
}

export async function deleteReferral(referralId) {
  return supabaseDeleteReferral(referralId)
}

// ── SUBSCRIPTIONS ────────────────────────────────

export function subscribeToMyReferrals(referrerUid, callback, onError) {
  if (!referrerUid) return () => {}
  return referralSubscribe({
      table: 'referrals',
      filter: [['referrer_uid', referrerUid]],
      orderBy: { column: 'created_at', ascending: false },
      limitN: 500,
      mapRow: mapReferralRow,
      label: 'myReferrals',
      callback,
      onError,
    })
}

export function subscribeToGymReferrals(gymId, callback, onError) {
  if (!gymId) return () => {}
  return referralSubscribe({
      table: 'referrals',
      filter: [['gym_id', gymId]],
      orderBy: { column: 'created_at', ascending: false },
      limitN: 500,
      mapRow: mapReferralRow,
      label: 'gymReferrals',
      callback,
      onError,
    })
}

export function subscribeToAllReferrals(callback, onError) {
  return referralSubscribe({
      table: 'referrals',
      filter: [],
      orderBy: { column: 'created_at', ascending: false },
      limitN: 1000,
      mapRow: mapReferralRow,
      label: 'allReferrals',
      callback,
      onError,
    })
}

// ── STATS ────────────────────────────────────────

export function getReferralStats(referrals) {
  const total = referrals.length
  const pending = referrals.filter(r => r.status === 'Pending').length
  const qualified = referrals.filter(r => r.status === 'Qualified').length
  const rewarded = referrals.filter(r => r.status === 'Rewarded').length
  const rejected = referrals.filter(r => r.status === 'Rejected').length
  const rewardsEarned = referrals
    .filter(r => r.status === 'Rewarded' && r.rewardIssued)
    .reduce((sum, r) => sum + (Number(r.rewardValue) || 0), 0)
  const conversionRate = total > 0 ? ((rewarded / total) * 100).toFixed(1) : '0.0'
  const rewardCost = referrals
    .filter(r => r.status === 'Rewarded')
    .reduce((sum, r) => sum + (Number(r.rewardValue) || 0), 0)
  return { total, pending, qualified, rewarded, rejected, rewardsEarned, conversionRate, rewardCost }
}

export function getTopReferrers(referrals, users) {
  const counts = {}
  referrals.forEach(r => {
    if (r.status === 'Rewarded') {
      counts[r.referrerUid] = (counts[r.referrerUid] || 0) + 1
    }
  })
  return Object.entries(counts)
    .map(([uid, count]) => {
      const user = users.find(u => u.uid === uid) || {}
      return {
        uid,
        name: user.name || 'Unknown',
        count,
        rewards: referrals
          .filter(r => r.referrerUid === uid && r.status === 'Rewarded')
          .reduce((sum, r) => sum + (Number(r.rewardValue) || 0), 0),
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

export function checkReferralFraud(referral) {
  const flags = []
  if (referral.referrerUid === referral.referredUid) {
    flags.push('SELF_REFERRAL')
  }
  if (referral.status === 'Rewarded' && referral.rewardIssued) {
    flags.push('DUPLICATE_REWARD')
  }
  if (referral.status === 'Rejected') {
    flags.push('REJECTED')
  }
  if (!referral.referralCode || !referral.referralCode.startsWith('IP-')) {
    flags.push('INVALID_CODE')
  }
  return flags
}

// ── REWARD ENGINE ────────────────────────────────

export async function getRewardLedger(userId) {
  return supabaseGetRewardLedger(userId)
}

export function subscribeToRewardLedger(userId, callback, onError) {
  if (!userId) return () => {}
  return referralSubscribe({
      table: 'reward_ledger',
      filter: [['referrer_uid', userId]],
      orderBy: { column: 'issued_at', ascending: false },
      limitN: 500,
      mapRow: mapRewardLedgerRow,
      label: 'rewardLedger',
      callback,
      onError,
    })
}

export function subscribeToGymRewardLedger(gymId, callback, onError) {
  if (!gymId) return () => {}
  return referralSubscribe({
      table: 'reward_ledger',
      filter: [['gym_id', gymId]],
      orderBy: { column: 'issued_at', ascending: false },
      limitN: 500,
      mapRow: mapRewardLedgerRow,
      label: 'gymRewardLedger',
      callback,
      onError,
    })
}

// ── DISCOUNT COUPONS ─────────────────────────────

export function subscribeToMyDiscountCoupons(userId, callback, onError) {
  if (!userId) return () => {}
  return referralSubscribe({
      table: 'discount_coupons',
      filter: [['user_id', userId]],
      orderBy: { column: 'created_at', ascending: false },
      limitN: 500,
      mapRow: mapDiscountCouponRow,
      label: 'discountCoupons',
      callback,
      onError,
    })
}

export function subscribeToGymDiscountCoupons(gymId, callback, onError) {
  if (!gymId) return () => {}
  return referralSubscribe({
      table: 'discount_coupons',
      filter: [['gym_id', gymId]],
      orderBy: { column: 'created_at', ascending: false },
      limitN: 500,
      mapRow: mapDiscountCouponRow,
      label: 'gymDiscountCoupons',
      callback,
      onError,
    })
}

export async function getDiscountCoupon(couponCode) {
  return supabaseGetDiscountCoupon(couponCode)
}

export async function redeemDiscountCoupon(couponId) {
  return supabaseRedeemDiscountCoupon(couponId)
}

// ── REFERRAL LINK UTILS ──────────────────────────

const APP_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) || (typeof window !== 'undefined' ? window.location.origin : '')

export function buildReferralLink(referralCode) {
  if (!referralCode) return ''
  return `${APP_URL}/signup?ref=${referralCode}`
}

// ── DUPLICATE REFERRAL CHECK ─────────────────────

export async function hasPendingReferral(referredUid) {
  return supabaseHasPendingReferral(referredUid)
}

// ─────────────────────────────────────────────
// SPARK REFERRAL REGISTRATION (Sprint 81A-Spark)
// ─────────────────────────────────────────────
// SpaceX-compatible alternative to the onReferralSignup Cloud Function:
// the referred member's OWN client session creates the Pending referral,
// the two notifications and the audit entry — atomically and idempotently.
//
// Why this works on Spark:
//   • The users read rule denies members a `users` lookup — so referrer
//     resolution goes through the new `referralCodes/{code}` directory
//     instead (created by each code's owner at signup / login).
//   • The referrals create rule already allows an authenticated user to
//     create the doc whose referredUid == their own uid.
//   • The referral doc ID is the referred user's auth uid — the same
//     deterministic key the Cloud Function used — so a refresh, a retry or
//     a second tab can never create a duplicate row. The existence read
//     inside the transaction makes notification/audit creation
//     one-shot-only, and all four writes commit atomically or not at all.

let processingInFlight = false

export function clearPendingReferralStorage() {
  try { localStorage.removeItem(PENDING_REFERRAL_KEY) } catch (e) { /* non-blocking */ }
}

// Directory entry each code owner maintains for their own code.
export async function ensureOwnReferralCodeMapping(userId, referralCode) {
  return supabaseEnsureOwnReferralCodeMapping(userId, referralCode)
}

// ─────────────────────────────────────────────
// LOGIN-TIME SELF-HEAL (Sprint 81E)
// ─────────────────────────────────────────────
// Every approved eligible user must ALWAYS own a referral code + a
// referralCodes/{code} directory entry. Runs on every authenticated session
// (login AND refresh) — idempotent by construction:
//   • Code present  → converge the directory entry (create if absent).
//   • Code missing  → generate PURE-LOCALLY (crypto-random, NO users query —
//     the users read rule denies non-staff collection queries) and write:
//       1) users/{uid}.referralCode        — own-user update rule allows the
//          one-time set while the current value is null/'' (first writer wins;
//          a concurrent second writer is denied by the same rule).
//       2) referralCodes/{code}            — create rule requires the caller's
//          OWN users doc to carry exactly this code (satisfied after step 1
//          commits; a denied step 2 means the entry already exists).
//   • Trainer     → never generated (trainers are staff, not referrers —
//     matches backfillMissingReferralCodes which skips the role).
// NEVER throws — referral healing must never block the session.
export async function ensureSelfReferralCode({ uid, referralCode, role } = {}) {
  return supabaseEnsureSelfReferralCode({ uid, referralCode, role })
}

// Resolve a referral code to its owner via the directory collection.
export async function resolveReferralCode(code) {
  if (!validateReferralCodeFormat(code)) {
    console.warn('[Referral] resolveReferralCode SKIP: invalid format', { code })
    return null
  }
  return supabaseResolveReferralCode(code)
}

/**
 * Spark-compatible referral registration. Call ONCE per established
 * authenticated session (first login after approval).
 *
 * Returns { created: boolean, reason?: string } — never throws for
 * expected outcomes (invalid code, self referral, already registered).
 */
export async function processPendingReferral({ referredUid, referredName, referralCode, gymId }) {
  if (!referredUid || !referralCode) {
    console.warn('[Referral] processPendingReferral SKIP: no-code', { referredUid, hasCode: !!referralCode })
    return { created: false, reason: 'no-code' }
  }
  const code = String(referralCode).trim().toUpperCase()
  if (!validateReferralCodeFormat(code)) {
    console.warn('[Referral] processPendingReferral SKIP: invalid-format', { referredUid, code })
    return { created: false, reason: 'invalid-format' }
  }
  if (processingInFlight) {
    console.warn('[Referral] processPendingReferral SKIP: in-flight (another run active)', { referredUid, code })
    return { created: false, reason: 'in-flight' }
  }

  return supabaseProcessPendingReferral({ referredUid, referredName, referralCode: code, gymId })
}

// ── EXPIRY CHECK ─────────────────────────────────

export function isReferralExpired(referral) {
  if (!referral.expiresAt) return false
  const expiresAt = referral.expiresAt?.seconds
    ? new Date(referral.expiresAt.seconds * 1000)
    : new Date(referral.expiresAt)
  return expiresAt < new Date()
}

// ── SHARE MESSAGE ────────────────────────────────

export function buildShareMessage(template, referralCode, referralLink) {
  if (!template) {
    return `Join me on IRONPULSE Gym Management!\n\nUse my referral link:\n${referralLink}\n\nOr enter my referral code during signup:\n${referralCode}`
  }
  return template
    .replace(/\{\{LINK\}\}/g, referralLink)
    .replace(/\{\{CODE\}\}/g, referralCode)
}

export function getShareMessageTemplate(settings) {
  return settings?.shareMessage || ''
}

// ── REFERRAL AUDIT LOG ───────────────────────────

export async function logReferralAudit({ action, performedBy, targetUid, referralId, metadata }) {
  refDevLog('audit', { collection: 'referralAuditLogs', action, performedBy, targetUid })
  // DOCUMENTED_EXCEPTION: referral_audit_logs has select-only RLS; audit
  // trail is Firebase-only in supabase mode (see FIREBASE_WRITE_PATH_AUDIT.md).
  return
}

// ============================================================================
// SUPABASE DATA PLANE (Step 8E)
// ============================================================================
let _supabaseClient = null
async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient
  const m = await import('../lib/supabase')
  _supabaseClient = m.supabase
  return _supabaseClient
}

function mapSupabaseError(err, fallbackMsg) {
  const msg = (err && (err.message || err.details || err.hint)) || String(err || fallbackMsg || 'Supabase error')
  const codeStr = msg + ' ' + (err && err.code ? String(err.code) : '')
  const code =
    /42501|42502|42504|permission denied|row-level security|new row violates/i.test(codeStr) ? 'permission-denied'
    : /23505|duplicate key|already exists/i.test(codeStr) ? 'already-exists'
    : /PGRST116|404|not found/i.test(codeStr) ? 'not-found'
    : /network|fetch failed|ECONN|timeout|Failed to fetch/i.test(codeStr) ? 'unavailable'
    : /22P02|22007|23514|invalid input|invalid enum|violates check/i.test(codeStr) ? 'invalid-argument'
    : /23503|foreign key/i.test(codeStr) ? 'foreign-key-violation'
    : undefined
  const error = new Error(msg)
  if (code) error.code = code
  return error
}

async function supabaseGetReferralSettings() {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('settings')
    .select('data')
    .eq('gym_id', 'platform')
    .eq('doc_id', REFERRAL_SETTINGS_ID)
    .maybeSingle()
  if (error) {
    console.error('referralService: getReferralSettings error:', error)
    return null
  }
  return data ? data.data : null
}

async function supabaseUpdateReferralSettings(data, changedBy) {
  const client = await getSupabaseClient()
  const existing = await supabaseGetReferralSettings()
  const merged = {
    ...(existing || {}),
    ...data,
    updatedAt: new Date().toISOString(),
  }
  const { error } = await client
    .from('settings')
    .upsert(
      { gym_id: 'platform', doc_id: REFERRAL_SETTINGS_ID, data: merged },
      { onConflict: 'gym_id,doc_id' }
    )
  if (error) {
    const mapped = mapSupabaseError(error, 'Failed to update referral settings')
    console.error('referralService: updateReferralSettings error:', mapped)
    throw mapped
  }
  // audit_log skip — DOCUMENTED_EXCEPTION (select-only RLS).
  void changedBy
}

async function supabaseCreateReferral(referralData) {
  const client = await getSupabaseClient()
  const { data: row, error } = await client.from('referrals').insert({
    referred_uid: referralData.referredUid || '',
    referrer_uid: referralData.referrerUid || '',
    referral_code: referralData.referralCode || '',
    gym_id: referralData.gymId || DEFAULT_GYM_ID,
    status: 'Pending',
    reward_type: referralData.rewardType || '',
    reward_value: Number(referralData.rewardValue) || 0,
    reward_issued: false,
    first_payment_id: referralData.firstPaymentId || '',
    expires_at: referralData.expiresAt || null,
    qualified_at: null,
    rewarded_at: null,
  }).select('referred_uid').single()
  if (error) throw mapSupabaseError(error, 'Failed to create referral')
  return row.referred_uid
}

// RLS: referrals update is RPC-only (update_referral_status).
async function supabaseUpdateReferral(referralId, data) {
  const client = await getSupabaseClient()
  const { error } = await client.rpc('update_referral_status', {
    p_referred_uid: referralId,
    p_status: data.status || 'Pending',
  })
  if (error) throw mapSupabaseError(error, 'Failed to update referral')
}

async function supabaseGetReferralById(referralId) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('referrals')
    .select('*')
    .eq('referred_uid', referralId)
    .maybeSingle()
  if (error || !data) return null
  return mapReferralRow(data)
}

async function supabaseDeleteReferral(referralId) {
  const client = await getSupabaseClient()
  const { error } = await client.rpc('delete_referral', { p_referred_uid: referralId })
  if (error) throw mapSupabaseError(error, 'Failed to delete referral')
}

async function supabaseGetRewardLedger(userId) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('reward_ledger')
    .select('*')
    .eq('referrer_uid', userId)
    .order('issued_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('referralService: getRewardLedger error:', error)
    return []
  }
  return (data || []).map(mapRewardLedgerRow)
}

async function supabaseGetDiscountCoupon(couponCode) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('discount_coupons')
    .select('*')
    .eq('code', couponCode)
    .limit(1)
  if (error) {
    console.error('referralService: getDiscountCoupon error:', error)
    return null
  }
  if (!data || !data.length) return null
  return mapDiscountCouponRow(data[0])
}

async function supabaseRedeemDiscountCoupon(couponId) {
  const client = await getSupabaseClient()
  const { error } = await client.rpc('redeem_discount_coupon', { p_coupon_id: couponId })
  if (error) throw mapSupabaseError(error, 'Failed to redeem coupon')
}

async function supabaseResolveReferralCode(code) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('referral_codes')
    .select('referrer_uid, created_at')
    .eq('code', code.toUpperCase())
    .maybeSingle()
  if (error || !data) return null
  return { referrerUid: data.referrer_uid || '', createdAt: data.created_at || null }
}

// Supabase Spark-compatible registration: ONE atomic INSERT keyed on the
// PK referred_uid (23505 = already-registered). No transaction emulation.
// Notification side-writes are best-effort (member sessions cannot insert
// notifications — staff-only RLS) and the audit trail is Firebase-only.
async function supabaseProcessPendingReferral({ referredUid, referredName, referralCode, gymId }) {
  const code = referralCode
  const resolved = await resolveReferralCode(code)
  if (!resolved || !resolved.referrerUid) {
    return { created: false, reason: 'invalid-code' }
  }
  if (resolved.referrerUid === referredUid) {
    return { created: false, reason: 'self-referral' }
  }

  processingInFlight = true
  try {
    const referralGymId = gymId || DEFAULT_GYM_ID
    const client = await getSupabaseClient()
    const { error: insErr } = await client.from('referrals').insert({
      referred_uid: referredUid,
      referrer_uid: resolved.referrerUid,
      referral_code: code,
      gym_id: referralGymId,
      referred_name: referredName || '',
      status: 'Pending',
      reward_type: '',
      reward_value: 0,
      reward_issued: false,
      first_payment_id: '',
      expires_at: null,
      qualified_at: null,
      rewarded_at: null,
    })
    if (insErr) {
      if (mapSupabaseError(insErr).code === 'already-exists') {
        return { created: false, reason: 'already-registered' }
      }
      console.error('[Referral] supabase processPendingReferral ERROR:', insErr.message)
      return { created: false, reason: 'error' }
    }

    // Best-effort notification side-writes (RLS: staff-only insert — member
    // sessions will be denied; never fail the registration for it).
    try {
      await client.from('notifications').insert([
        {
          user_id: resolved.referrerUid,
          gym_id: referralGymId,
          role: 'member',
          title: 'Referral Registered!',
          message: `${referredName || 'Someone'} signed up using your referral code!`,
          type: 'referral',
          subtype: 'referral_registered',
          priority: 'normal',
          icon: '📋',
          action_url: '/referral',
          related_document_id: referredUid,
          read: false,
        },
        {
          user_id: referredUid,
          gym_id: referralGymId,
          role: 'member',
          title: 'Referral Applied',
          message: 'Your referral code was applied! Welcome aboard.',
          type: 'referral',
          subtype: 'referral_applied',
          priority: 'normal',
          icon: '✅',
          action_url: '',
          related_document_id: referredUid,
          read: false,
        },
      ])
    } catch (e) {
      console.warn('[Referral] supabase notification side-writes skipped (non-blocking):', e.message)
    }

    clearPendingReferralStorage()
    return { created: true }
  } catch (err) {
    console.error('[Referral] supabase processPendingReferral ERROR — no referral row was created:', err.message)
    return { created: false, reason: 'error' }
  } finally {
    processingInFlight = false
  }
}

async function supabaseHasPendingReferral(referredUid) {
  if (!referredUid) return false
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('referrals')
    .select('referred_uid')
    .eq('referred_uid', referredUid)
    .eq('status', 'Pending')
    .limit(1)
  if (error) {
    console.warn('[Referral] supabase hasPendingReferral error (non-blocking):', error.message)
    return false
  }
  return !!(data && data.length)
}

// Supabase referral_codes directory: converge the owner mapping for a code.
// Insert is best-effort (owner-code-match RLS); never throws.
async function supabaseEnsureOwnReferralCodeMapping(userId, referralCode) {
  if (!userId || !validateReferralCodeFormat(referralCode)) return false
  const client = await getSupabaseClient()
  const code = referralCode.toUpperCase()
  const { data: existing, error: selErr } = await client
    .from('referral_codes')
    .select('referrer_uid')
    .eq('code', code)
    .maybeSingle()
  if (selErr) {
    console.warn('[Referral] supabase mapping lookup failed (non-blocking):', selErr.message)
    return false
  }
  if (existing) {
    const owned = existing.referrer_uid === userId
    if (!owned) {
      console.warn('[Referral] supabase mapping CONFLICT:', { code, owner: existing.referrer_uid, caller: userId })
    }
    return owned
  }
  const { error: insErr } = await client.from('referral_codes').insert({
    code,
    referrer_uid: userId,
  })
  if (insErr) {
    console.warn('[Referral] supabase mapping create failed (non-blocking):', insErr.message)
    return false
  }
  return true
}

// Supabase self-heal: profiles carry referral_code (provisioned at first
// sign-in); converge the directory entry, or generate + persist when missing.
// Never throws — referral healing must never block the session.
async function supabaseEnsureSelfReferralCode({ uid, referralCode, role } = {}) {
  if (!uid) {
    console.warn('[Referral] supabase ensureSelfReferralCode SKIP: no uid')
    return { code: '', created: false }
  }
  const existing = typeof referralCode === 'string' ? referralCode.trim().toUpperCase() : ''
  if (validateReferralCodeFormat(existing)) {
    const mapped = await supabaseEnsureOwnReferralCodeMapping(uid, existing)
    console.warn('[Referral] supabase ensureSelfReferralCode: existing code', { uid, code: existing, mappingOk: mapped })
    return { code: existing, created: false }
  }
  if (role === 'trainer') {
    console.warn('[Referral] supabase ensureSelfReferralCode SKIP: trainer role (staff, no referral codes by design)', { uid })
    return { code: '', created: false }
  }
  const code = generateReferralCode()
  try {
    const client = await getSupabaseClient()
    const { error: updErr } = await client
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', uid)
      .is('referral_code', null)
    if (updErr) {
      console.warn('[Referral] supabase ensureSelfReferralCode update failed (non-blocking):', updErr.message)
      return { code: '', created: false }
    }
    await supabaseEnsureOwnReferralCodeMapping(uid, code)
    console.warn('[Referral] supabase ensureSelfReferralCode GENERATED:', { uid, code })
    return { code, created: true }
  } catch (err) {
    console.warn('[Referral] supabase ensureSelfReferralCode failed (non-blocking):', { code: err.code, message: err.message, uid })
    return { code: '', created: false }
  }
}
