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
} from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_GYM_ID } from './firestoreService'

export const REFERRAL_SETTINGS_ID = 'referralSettings'

const REFERRAL_STATUSES = ['Pending', 'Qualified', 'Rewarded', 'Rejected']

export function validateReferralStatus(status) {
  return REFERRAL_STATUSES.includes(status)
}

// ── SETTINGS ─────────────────────────────────────

export async function getReferralSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', REFERRAL_SETTINGS_ID))
    return snap.exists() ? snap.data() : null
  } catch (err) {
    console.error('referralService: getReferralSettings error:', err)
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
    throw err
  }
}

export async function updateReferral(referralId, data) {
  try {
    await updateDoc(doc(db, 'referrals', referralId), data)
  } catch (err) {
    console.error('referralService: updateReferral error:', err)
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
  const rewardCost = rewarded * (referrals.find(r => r.rewardValue)?.rewardValue || 0)
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
  }
}
