import { doc, getDoc, updateDoc, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const HISTORY_COLLECTION = 'subscriptionHistory'

function getDeviceLimit(planType) {
  switch (planType?.toLowerCase()) {
    case 'trial': return 1
    case 'monthly': case 'standard': return 2
    case 'pro': case 'quarterly': return 5
    case 'premium': case 'yearly': case 'annual': return 10
    case 'enterprise': case 'lifetime': return 9999
    default: return 2
  }
}

export function subscribeToGymSubscription(gymId, callback) {
  if (!gymId) return () => {}
  const unsub = onSnapshot(doc(db, 'gyms', gymId), (snap) => {
    if (snap.exists()) {
      callback(snap.data().subscription || null)
    }
  })
  return unsub
}

export function subscribeToSubscriptionHistory(gymId, callback) {
  if (!gymId) return () => {}
  const q = query(
    collection(db, HISTORY_COLLECTION),
    where('gymId', '==', gymId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

async function updateGymSubscription(gymId, updates) {
  if (!gymId) throw new Error('gymId required')
  const gymRef = doc(db, 'gyms', gymId)

  // Use dot-notation field paths for atomic partial updates.
  // This avoids the read-then-write race condition: updateDoc only
  // touches the specified fields; all other subscription fields are
  // preserved server-side (no stale spread from a prior getDoc).
  const fieldUpdates = {}
  if (updates.planType) {
    fieldUpdates['subscription.deviceLimit'] = getDeviceLimit(updates.planType)
  }
  for (const [key, value] of Object.entries(updates)) {
    fieldUpdates[`subscription.${key}`] = value
  }
  fieldUpdates['subscription.updatedAt'] = serverTimestamp()
  fieldUpdates.subscriptionId = gymId
  if (updates.status) {
    fieldUpdates.subscriptionStatus = updates.status
  }
  fieldUpdates.updatedAt = serverTimestamp()

  await updateDoc(gymRef, fieldUpdates)
}

async function addHistoryRecord(record) {
  await addDoc(collection(db, HISTORY_COLLECTION), {
    ...record,
    createdAt: serverTimestamp(),
  })
}

export async function activateSubscription(gymId, planName, planType, amount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365 }
  const duration = daysMap[planType] || 30
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    planId: planType,
    planName,
    planType,
    status: planType === 'trial' ? 'trial' : 'active',
    paymentStatus: 'paid',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    amount,
    currency: 'INR',
    renewalCount: 0,
    trialUsed: planType === 'trial',
    lastPaymentId: '',
    lastTransactionId: '',
  })

  await addHistoryRecord({
    gymId,
    planId: planType,
    planName,
    amount,
    currency: 'INR',
    status: planType === 'trial' ? 'trial' : 'active',
    paymentId: '',
    transactionId: '',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    createdBy: actorUid || '',
    action: 'activated',
  })
}

export async function suspendSubscription(gymId, actorUid) {
  await updateGymSubscription(gymId, { status: 'suspended' })
  await addHistoryRecord({
    gymId, planId: '', planName: '', amount: 0, currency: 'INR',
    status: 'suspended', paymentId: '', transactionId: '',
    startDate: '', expiryDate: '', createdBy: actorUid || '',
    action: 'suspended',
  })
}

export async function expireSubscription(gymId, actorUid) {
  await updateGymSubscription(gymId, { status: 'expired' })
  await addHistoryRecord({
    gymId, planId: '', planName: '', amount: 0, currency: 'INR',
    status: 'expired', paymentId: '', transactionId: '',
    startDate: '', expiryDate: '', createdBy: actorUid || '',
    action: 'expired',
  })
}

export async function renewSubscription(gymId, planName, planType, amount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365 }
  const duration = daysMap[planType] || 30
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + duration)

  const gymSnap = await getDoc(doc(db, 'gyms', gymId))
  const current = gymSnap.data()?.subscription || {}
  const renewalCount = (current.renewalCount || 0) + 1

  await updateGymSubscription(gymId, {
    planName,
    planType,
    status: 'active',
    paymentStatus: planType === 'trial' ? 'paid' : 'pending',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    amount,
    renewalCount,
    lastPaymentId: '',
    lastTransactionId: '',
  })

  await addHistoryRecord({
    gymId,
    planId: planType,
    planName,
    amount,
    currency: 'INR',
    status: 'active',
    paymentId: '',
    transactionId: '',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    createdBy: actorUid || '',
    action: 'renewed',
  })
}

export async function upgradePlan(gymId, newPlanName, newPlanType, newAmount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365 }
  const duration = daysMap[newPlanType] || 30
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    planId: newPlanType,
    planName: newPlanName,
    planType: newPlanType,
    status: 'active',
    expiryDate: expiry.toISOString(),
    amount: newAmount,
  })

  await addHistoryRecord({
    gymId,
    planId: newPlanType,
    planName: newPlanName,
    amount: newAmount,
    currency: 'INR',
    status: 'active',
    paymentId: '',
    transactionId: '',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    createdBy: actorUid || '',
    action: 'upgraded',
  })
}

// delegates to changePlan (identical logic, different action label)
export async function downgradePlan(gymId, newPlanName, newPlanType, newAmount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365 }
  const duration = daysMap[newPlanType] || 30
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    planId: newPlanType,
    planName: newPlanName,
    planType: newPlanType,
    status: 'active',
    expiryDate: expiry.toISOString(),
    amount: newAmount,
  })

  await addHistoryRecord({
    gymId,
    planId: newPlanType,
    planName: newPlanName,
    amount: newAmount,
    currency: 'INR',
    status: 'active',
    paymentId: '',
    transactionId: '',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    createdBy: actorUid || '',
    action: 'downgraded',
  })
}

export async function assignTrial(gymId, trialDays, actorUid) {
  const now = new Date()
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + trialDays)

  await updateGymSubscription(gymId, {
    planId: 'trial',
    planName: 'Trial',
    planType: 'trial',
    status: 'trial',
    paymentStatus: 'paid',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    amount: 0,
    currency: 'INR',
    renewalCount: 0,
    trialUsed: true,
    lastPaymentId: '',
    lastTransactionId: '',
  })

  await addHistoryRecord({
    gymId,
    planId: 'trial',
    planName: 'Trial',
    amount: 0,
    currency: 'INR',
    status: 'trial',
    paymentId: '',
    transactionId: '',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    createdBy: actorUid || '',
    action: 'trial_started',
  })
}

export async function extendExpiry(gymId, newExpiryDate, actorUid) {
  await updateGymSubscription(gymId, {
    expiryDate: newExpiryDate,
    status: 'active',
  })

  await addHistoryRecord({
    gymId, planId: '', planName: '', amount: 0, currency: 'INR',
    status: 'active', paymentId: '', transactionId: '',
    startDate: '', expiryDate: newExpiryDate, createdBy: actorUid || '',
    action: 'extended',
  })
}

// NOTE: partial billing period proration is not handled.
// Upgrading mid-cycle charges the full new-plan amount without crediting
// the remaining value of the current plan. Full proration would require a
// Cloud Function integrated with the payment gateway.
export async function changePlan(gymId, planName, planType, amount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365 }
  const duration = daysMap[planType] || 30
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    planId: planType,
    planName,
    planType,
    expiryDate: expiry.toISOString(),
    amount,
  })

  await addHistoryRecord({
    gymId, planId: planType, planName, amount, currency: 'INR',
    status: 'active', paymentId: '', transactionId: '',
    startDate: now.toISOString(), expiryDate: expiry.toISOString(),
    createdBy: actorUid || '', action: 'plan_changed',
  })
}

export function checkAutoExpiry(subscription) {
  if (!subscription || !subscription.expiryDate) return subscription
  if (subscription.status === 'suspended' || subscription.status === 'expired') return subscription
  const now = new Date()
  const expiry = new Date(subscription.expiryDate)
  if (now > expiry) {
    return { ...subscription, status: 'expired' }
  }
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  const threeDaysFromNow = new Date()
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  const oneDayFromNow = new Date()
  oneDayFromNow.setDate(oneDayFromNow.getDate() + 1)

  let proximity = ''
  if (expiry <= oneDayFromNow) proximity = 'expiring_today'
  else if (expiry <= threeDaysFromNow) proximity = 'expiring_3days'
  else if (expiry <= sevenDaysFromNow) proximity = 'expiring_7days'

  if (proximity) {
    return { ...subscription, _expiryProximity: proximity }
  }
  return subscription
}
