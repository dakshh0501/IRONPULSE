import { generateLicenseKey } from '../utils/license'
import { subscribeRealtime } from './realtimeService'

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

// Supabase subscription_history row → Firestore-shaped record
function mapHistoryRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id || '',
    subscriptionId: r.subscription_id || '',
    action: r.action || '',
    actorUid: r.actor_uid || '',
    changes: r.changes || {},
    createdAt: r.created_at || null,
  }
}

// Supabase gyms row → Firestore-shaped gym doc (subscription jsonb)
function mapGymRowForSubscription(r) {
  return {
    id: r.id,
    subscription: r.subscription || {},
    updatedAt: r.updated_at || null,
  }
}

export function subscribeToGymSubscription(gymId, callback) {
  if (!gymId) return () => {}
  return subscribeRealtime({
      table: 'gyms',
      filter: [['id', 'eq', gymId]],
      limit: 1,
      keyFn: (r) => (r ? r.id : null),
      mapRow: mapGymRowForSubscription,
      onChange: (rows) => callback((rows[0] && rows[0].subscription) || null),
      onError: (e) => console.error('[Supabase] gymSubscription realtime error:', e.message),
      label: 'gymSubscription',
    })
}

export function subscribeToSubscriptionHistory(gymId, callback) {
  if (!gymId) return () => {}
  return subscribeRealtime({
      table: 'subscription_history',
      filter: [['gym_id', gymId]],
      orderBy: { column: 'created_at', ascending: false },
      limit: 200,
      mapRow: mapHistoryRow,
      onChange: callback,
      onError: (e) => console.error('[Supabase] subscriptionHistory realtime error:', e.message),
      label: 'subscriptionHistory',
    })
}

async function updateGymSubscription(gymId, updates) {
  if (!gymId) throw new Error('gymId required')
  return supabaseUpdateGymSubscription(gymId, updates)
}

async function addHistoryRecord(record) {
  return supabaseAddHistoryRecord(record)
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

// Supabase branch: read the current gym subscription jsonb (one-shot).
// Used by renew/upgrade/downgrade to compute renewalCount and expiry math.
async function supabaseGetGymSubscription(gymId) {
  const client = await getSupabaseClient()
  const { data: gym, error } = await client
    .from('gyms')
    .select('subscription')
    .eq('id', gymId)
    .maybeSingle()
  if (error) throw mapSupabaseError(error, 'Failed to load subscription')
  return (gym && gym.subscription) || {}
}

// Supabase branch: single-statement atomic jsonb merge via the
// update_gym_subscription RPC (super-admin only, mirrors gyms RLS).
// License-key auto-provisioning happens client-side after an atomic read;
// concurrent double-activation without a key is not possible in practice
// (single super-admin operator in supabase mode — see report §4).
async function supabaseUpdateGymSubscription(gymId, updates) {
  const client = await getSupabaseClient()
  const payload = { ...updates }
  if (payload.status === 'active' || payload.status === 'trial') {
    const existing = await supabaseGetGymSubscription(gymId)
    if (existing && !existing.licenseKey) {
      payload.licenseKey = generateLicenseKey()
      payload.licenseStatus = 'active'
      payload.generatedAt = new Date().toISOString()
    }
  }
  if (payload.planType) {
    payload.deviceLimit = getDeviceLimit(payload.planType)
  }
  payload.updatedAt = new Date().toISOString()
  const { error } = await client.rpc('update_gym_subscription', {
    p_gym_id: gymId,
    p_updates: payload,
  })
  if (error) throw mapSupabaseError(error, 'Failed to update subscription')
}

// Supabase branch: subscription_history has no plan/amount columns — pack the
// Firestore-shaped flat record into `changes` jsonb (matches mapHistoryRow).
// RLS: insert super-only (documented 8C difference).
async function supabaseAddHistoryRecord(record) {
  const client = await getSupabaseClient()
  const { error } = await client.from('subscription_history').insert({
    gym_id: record.gymId,
    action: record.action || 'action',
    actor_uid: record.createdBy || null,
    changes: { ...record, createdAt: new Date().toISOString() },
  })
  if (error) throw mapSupabaseError(error, 'Failed to record subscription history')
}

export async function activateSubscription(gymId, planName, planType, amount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
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
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
  const duration = daysMap[planType] || 30

  const current = await supabaseGetGymSubscription(gymId)
  const renewalCount = (current.renewalCount || 0) + 1
  const base = current.expiryDate ? new Date(Math.max(new Date(current.expiryDate).getTime(), now.getTime())) : now
  const expiry = new Date(base)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    planName,
    planType,
    status: 'active',
    paymentStatus: planType === 'trial' ? 'paid' : 'pending',
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
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
  const duration = daysMap[newPlanType] || 30

  const current = await supabaseGetGymSubscription(gymId)
  const base = current.expiryDate ? new Date(Math.max(new Date(current.expiryDate).getTime(), now.getTime())) : now
  const expiry = new Date(base)
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
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
  const duration = daysMap[newPlanType] || 30

  const current = await supabaseGetGymSubscription(gymId)
  const base = current.expiryDate ? new Date(Math.max(new Date(current.expiryDate).getTime(), now.getTime())) : now
  const expiry = new Date(base)
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
  const current = await supabaseGetGymSubscription(gymId)
  await updateGymSubscription(gymId, {
    expiryDate: newExpiryDate,
    status: 'active',
    planId: current.planType || '',
    planName: current.planName || current.planId || '',
    amount: current.amount != null ? current.amount : 0,
  })

  await addHistoryRecord({
    gymId,
    planId: current.planType || '',
    planName: current.planName || current.planId || '',
    amount: current.amount != null ? current.amount : 0,
    currency: 'INR',
    status: 'active', paymentId: '', transactionId: '',
    startDate: '', expiryDate: newExpiryDate, createdBy: actorUid || '',
    action: 'extended',
  })
}

// Reactivate a suspended/expired subscription back to 'active'. Extends from
// the later of the current expiry (if still in the future) and today, by one
// billing interval of the existing plan — matching renewSubscription's date
// math and the AppContext inline reactivate behavior, plus history.
export async function reactivateSubscription(gymId, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }

  const current = await supabaseGetGymSubscription(gymId)
  const planType = current.planType || 'monthly'
  const duration = daysMap[planType] || 30
  const base = current.expiryDate ? new Date(Math.max(new Date(current.expiryDate).getTime(), now.getTime())) : now
  const expiry = new Date(base)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    status: 'active',
    licenseStatus: 'active',
    expiryDate: expiry.toISOString(),
    cancelledAt: null,
    planId: planType,
    planType,
  })

  await addHistoryRecord({
    gymId,
    planId: planType,
    planName: current.planName || '',
    amount: Number(current.amount) || 0,
    currency: 'INR',
    status: 'active',
    paymentId: '',
    transactionId: '',
    startDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    createdBy: actorUid || '',
    action: 'reactivated',
  })
}

// NOTE: partial billing period proration is not handled.
// Upgrading mid-cycle charges the full new-plan amount without crediting
// the remaining value of the current plan. Full proration would require a
// Cloud Function integrated with the payment gateway.
export async function changePlan(gymId, planName, planType, amount, actorUid) {
  const now = new Date()
  const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
  const duration = daysMap[planType] || 30
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + duration)

  await updateGymSubscription(gymId, {
    planId: planType,
    planName,
    planType,
    status: 'active',
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
