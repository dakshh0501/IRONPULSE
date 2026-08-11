import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  setDoc,
  runTransaction,
} from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_GYM_ID } from './firestoreService'
import { validateReferralCodeFormat, generateReferralCode } from '../utils/referralCode'

export const REFERRAL_SETTINGS_ID = 'referralSettings'

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
  refDevLog('read settings', { collection: 'settings', path: `settings/${REFERRAL_SETTINGS_ID}` })
  try {
    const snap = await getDoc(doc(db, 'settings', REFERRAL_SETTINGS_ID))
    return snap.exists() ? snap.data() : null
  } catch (err) {
    console.error('referralService: getReferralSettings error:', err)
    refDevLog('read settings FAILED', { collection: 'settings', path: `settings/${REFERRAL_SETTINGS_ID}`, code: err.code, message: err.message })
    return null
  }
}

export function subscribeToReferralSettings(callback, onError) {
  return onSnapshot(
    doc(db, 'settings', REFERRAL_SETTINGS_ID),
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null)
    },
    (error) => {
      console.error('[ReferralService] Subscription error (referralSettings):', error.message)
      if (onError) onError(error, 'referralSettings')
    }
  )
}

export async function updateReferralSettings(data, changedBy) {
  try {
    const payload = { ...data, updatedAt: serverTimestamp() }
    await setDoc(doc(db, 'settings', REFERRAL_SETTINGS_ID), payload, { merge: true })

    // Audit log
    const auditData = {
      action: 'update_referral_settings',
      changedBy: changedBy || 'unknown',
      changes: data,
      previousValues: {},
      timestamp: new Date().toISOString(),
    }
    try {
      const prevSnap = await getDoc(doc(db, 'settings', REFERRAL_SETTINGS_ID))
      if (prevSnap.exists()) {
        auditData.previousValues = prevSnap.data()
      }
    } catch (_) {}
    await addDoc(collection(db, 'auditLog'), auditData)
  } catch (err) {
    console.error('referralService: updateReferralSettings error:', err)
    throw err
  }
}

// ── CRUD ─────────────────────────────────────────

export async function createReferral(referralData) {
  refDevLog('create', {
    collection: 'referrals',
    referrerUid: referralData.referrerUid,
    referredUid: referralData.referredUid,
    gymId: referralData.gymId,
    status: 'Pending',
  })
  try {
    const docRef = await addDoc(collection(db, 'referrals'), {
      referrerUid: referralData.referrerUid || '',
      referredUid: referralData.referredUid || '',
      referralCode: referralData.referralCode || '',
      gymId: referralData.gymId || DEFAULT_GYM_ID,
      status: 'Pending',
      rewardType: referralData.rewardType || '',
      rewardValue: Number(referralData.rewardValue) || 0,
      rewardIssued: false,
      firstPaymentId: referralData.firstPaymentId || '',
      expiresAt: referralData.expiresAt || null,
      createdAt: serverTimestamp(),
      qualifiedAt: null,
      rewardedAt: null,
    })
    return docRef.id
  } catch (err) {
    console.error('referralService: createReferral error:', err)
    refDevLog('create FAILED', { collection: 'referrals', code: err.code, message: err.message })
    throw err
  }
}

export async function updateReferral(referralId, data) {
  refDevLog('update', { collection: 'referrals', path: `referrals/${referralId}` })
  try {
    await updateDoc(doc(db, 'referrals', referralId), data)
  } catch (err) {
    console.error('referralService: updateReferral error:', err)
    refDevLog('update FAILED', { collection: 'referrals', path: `referrals/${referralId}`, code: err.code, message: err.message })
    throw err
  }
}

export async function getReferralById(referralId) {
  const snap = await getDoc(doc(db, 'referrals', referralId))
  return snap.exists() ? { id: referralId, ...snap.data() } : null
}

export async function deleteReferral(referralId) {
  await deleteDoc(doc(db, 'referrals', referralId))
}

// ── SUBSCRIPTIONS ────────────────────────────────

export function subscribeToMyReferrals(referrerUid, callback, onError) {
  if (!referrerUid) return () => {}
  const q = query(
    collection(db, 'referrals'),
    where('referrerUid', '==', referrerUid),
    orderBy('createdAt', 'desc'),
    limit(500)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const referrals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(referrals)
    },
    (error) => {
      console.error('[ReferralService] Subscription error (myReferrals):', error.message)
      if (onError) onError(error, 'myReferrals')
    }
  )
}

export function subscribeToGymReferrals(gymId, callback, onError) {
  if (!gymId) return () => {}
  const q = query(
    collection(db, 'referrals'),
    where('gymId', '==', gymId),
    orderBy('createdAt', 'desc'),
    limit(500)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const referrals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(referrals)
    },
    (error) => {
      console.error('[ReferralService] Subscription error (gymReferrals):', error.message)
      if (onError) onError(error, 'gymReferrals')
    }
  )
}

export function subscribeToAllReferrals(callback, onError) {
  const q = query(collection(db, 'referrals'), orderBy('createdAt', 'desc'), limit(1000))
  return onSnapshot(
    q,
    (snapshot) => {
      const referrals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(referrals)
    },
    (error) => {
      console.error('[ReferralService] Subscription error (allReferrals):', error.message)
      if (onError) onError(error, 'allReferrals')
    }
  )
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
  try {
    const q = query(
      collection(db, 'rewardLedger'),
      where('referrerUid', '==', userId)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('referralService: getRewardLedger error:', err)
    return []
  }
}

export function subscribeToRewardLedger(userId, callback, onError) {
  if (!userId) return () => {}
  const q = query(
    collection(db, 'rewardLedger'),
    where('referrerUid', '==', userId),
    orderBy('issuedAt', 'desc'),
    limit(500)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(items)
    },
    (error) => {
      console.error('[ReferralService] rewardLedger subscription error:', error.message)
      if (onError) onError(error, 'rewardLedger')
    }
  )
}

export function subscribeToGymRewardLedger(gymId, callback, onError) {
  if (!gymId) return () => {}
  const q = query(
    collection(db, 'rewardLedger'),
    where('gymId', '==', gymId),
    orderBy('issuedAt', 'desc'),
    limit(500)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(items)
    },
    (error) => {
      console.error('[ReferralService] gym rewardLedger subscription error:', error.message)
      if (onError) onError(error, 'rewardLedger')
    }
  )
}

// ── DISCOUNT COUPONS ─────────────────────────────

export function subscribeToMyDiscountCoupons(userId, callback, onError) {
  if (!userId) return () => {}
  const q = query(
    collection(db, 'discountCoupons'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(500)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(items)
    },
    (error) => {
      console.error('[ReferralService] discountCoupons subscription error:', error.message)
      if (onError) onError(error, 'discountCoupons')
    }
  )
}

export function subscribeToGymDiscountCoupons(gymId, callback, onError) {
  if (!gymId) return () => {}
  const q = query(
    collection(db, 'discountCoupons'),
    where('gymId', '==', gymId),
    orderBy('createdAt', 'desc'),
    limit(500)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(items)
    },
    (error) => {
      console.error('[ReferralService] gym discountCoupons subscription error:', error.message)
      if (onError) onError(error, 'discountCoupons')
    }
  )
}

export async function getDiscountCoupon(couponCode) {
  try {
    const q = query(collection(db, 'discountCoupons'), where('code', '==', couponCode), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() }
  } catch (err) {
    console.error('referralService: getDiscountCoupon error:', err)
    return null
  }
}

export async function redeemDiscountCoupon(couponId) {
  await updateDoc(doc(db, 'discountCoupons', couponId), {
    status: 'redeemed',
    redeemedAt: serverTimestamp(),
  })
}

// ── REFERRAL LINK UTILS ──────────────────────────

const APP_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) || (typeof window !== 'undefined' ? window.location.origin : '')

export function buildReferralLink(referralCode) {
  if (!referralCode) return ''
  return `${APP_URL}/signup?ref=${referralCode}`
}

// ── DUPLICATE REFERRAL CHECK ─────────────────────

export async function hasPendingReferral(referredUid) {
  if (!referredUid) return false
  const q = query(
    collection(db, 'referrals'),
    where('referredUid', '==', referredUid),
    where('status', '==', 'Pending'),
    limit(1)
  )
  const snap = await getDocs(q)
  return !snap.empty
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
  if (!userId || !validateReferralCodeFormat(referralCode)) return false
  const ref = doc(db, 'referralCodes', referralCode)
  try {
    const snap = await getDoc(ref)
    if (snap.exists()) return snap.data().referrerUid === userId
    await setDoc(ref, {
      referrerUid: userId,
      createdAt: serverTimestamp(),
    }, { merge: true })
    return true
  } catch (err) {
    console.warn('[ReferralService] ensureOwnReferralCodeMapping failed (non-blocking):', err.code || err.message)
    return false
  }
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
  if (!uid) return { code: '', created: false }
  const existing = typeof referralCode === 'string' ? referralCode.trim() : ''
  if (validateReferralCodeFormat(existing)) {
    await ensureOwnReferralCodeMapping(uid, existing).catch(() => {})
    return { code: existing, created: false }
  }
  if (role === 'trainer') return { code: '', created: false }
  const code = generateReferralCode()
  try {
    await updateDoc(doc(db, 'users', uid), {
      referralCode: code,
      referralCodeGeneratedAt: serverTimestamp(),
    })
    await ensureOwnReferralCodeMapping(uid, code)
    return { code, created: true }
  } catch (err) {
    console.warn('[ReferralService] ensureSelfReferralCode failed (non-blocking):', err.code || err.message)
    return { code: '', created: false }
  }
}

// Resolve a referral code to its owner via the directory collection.
export async function resolveReferralCode(code) {
  if (!validateReferralCodeFormat(code)) return null
  try {
    const snap = await getDoc(doc(db, 'referralCodes', code.toUpperCase()))
    if (!snap.exists()) return null
    return { referrerUid: snap.data().referrerUid || '', createdAt: snap.data().createdAt || null }
  } catch (err) {
    console.error('referralService: resolveReferralCode error:', err)
    return null
  }
}

/**
 * Spark-compatible referral registration. Call ONCE per established
 * authenticated session (first login after approval).
 *
 * Returns { created: boolean, reason?: string } — never throws for
 * expected outcomes (invalid code, self referral, already registered).
 */
export async function processPendingReferral({ referredUid, referredName, referralCode, gymId }) {
  if (!referredUid || !referralCode) return { created: false, reason: 'no-code' }
  const code = String(referralCode).trim().toUpperCase()
  if (!validateReferralCodeFormat(code)) return { created: false, reason: 'invalid-format' }
  if (processingInFlight) return { created: false, reason: 'in-flight' }

  const resolved = await resolveReferralCode(code)
  if (!resolved || !resolved.referrerUid) return { created: false, reason: 'invalid-code' }
  if (resolved.referrerUid === referredUid) return { created: false, reason: 'self-referral' }

  processingInFlight = true
  try {
    const ref = doc(db, 'referrals', referredUid)
    const notifReferrer = doc(db, 'notifications', `ref-registered-${resolved.referrerUid}-${referredUid}`)
    const notifReferred = doc(db, 'notifications', `ref-applied-${referredUid}`)
    const auditRef = doc(db, 'referralAuditLogs', `ref-created-${referredUid}`)
    const now = new Date().toISOString()
    const referralGymId = gymId || DEFAULT_GYM_ID

    const outcome = await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref)
      if (existing.exists()) return 'already-registered'
      tx.set(ref, {
        referrerUid: resolved.referrerUid,
        referredUid,
        referralCode: code,
        gymId: referralGymId,
        referredName: referredName || '',
        status: 'Pending',
        rewardType: '',
        rewardValue: 0,
        rewardIssued: false,
        firstPaymentId: '',
        expiresAt: null,
        createdAt: now,
        qualifiedAt: null,
        rewardedAt: null,
      })
      tx.set(notifReferrer, {
        userId: resolved.referrerUid,
        gymId: referralGymId,
        role: 'member',
        title: 'Referral Registered!',
        message: `${referredName || 'Someone'} signed up using your referral code!`,
        type: 'referral',
        subtype: 'referral_registered',
        priority: 'normal',
        icon: '📋',
        actionUrl: '/referral',
        relatedDocumentId: referredUid,
        read: false,
        createdAt: now,
      })
      tx.set(notifReferred, {
        userId: referredUid,
        gymId: referralGymId,
        role: 'member',
        title: 'Referral Applied',
        message: 'Your referral code was applied! Welcome aboard.',
        type: 'referral',
        subtype: 'referral_applied',
        priority: 'normal',
        icon: '✅',
        actionUrl: '',
        relatedDocumentId: referredUid,
        read: false,
        createdAt: now,
      })
      tx.set(auditRef, {
        timestamp: now,
        createdAt: now,
        action: 'REFERRAL_CREATED',
        performedBy: referredUid,
        targetUid: resolved.referrerUid,
        referralId: referredUid,
        metadata: { referralCode: code, referredName: referredName || '' },
      })
      return 'created'
    })

    if (outcome === 'created') clearPendingReferralStorage()
    return { created: outcome === 'created', reason: outcome === 'created' ? undefined : outcome }
  } catch (err) {
    console.error('referralService: processPendingReferral error:', err)
    return { created: false, reason: 'error' }
  } finally {
    processingInFlight = false
  }
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
  try {
    await addDoc(collection(db, 'referralAuditLogs'), {
      timestamp: serverTimestamp(),
      action,
      performedBy: performedBy || '',
      targetUid: targetUid || '',
      referralId: referralId || '',
      metadata: metadata || {},
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[ReferralService] Audit log error (non-blocking):', err)
    refDevLog('audit FAILED', { collection: 'referralAuditLogs', action, code: err.code, message: err.message })
  }
}
