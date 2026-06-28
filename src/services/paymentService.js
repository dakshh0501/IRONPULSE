// src/services/paymentService.js
//
// Reusable PaymentService for PhonePe integration.
// All sensitive operations (checksum generation, PhonePe API calls) are handled by Cloud Functions.
// This file only contains Firestore persistence and Cloud Function calls.

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  getDoc,
  getDocs,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase'

// ─────────────────────────────────────────────
// CLOUD FUNCTIONS CLIENT
// ─────────────────────────────────────────────

const functions = getFunctions()
const createPaymentFn = httpsCallable(functions, 'createPayment')
const verifyPaymentFn = httpsCallable(functions, 'verifyPayment')

// ─────────────────────────────────────────────
// PAYMENT REQUEST BUILDERS
// ─────────────────────────────────────────────

const VALID_STATUSES = ['pending', 'success', 'failed', 'cancelled']

/**
 * Generate a unique payment ID for tracking.
 * Format: IP-{timestamp}-{random4}
 */
function generatePaymentId() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `IP-${ts}-${rand}`
}

/**
 * Build a payment request object for PhonePe integration.
 * Returns a structured object ready for Firestore persistence.
 * Does NOT make any API calls.
 *
 * @param {Object} params
 * @param {string} params.type - 'new' | 'renewal' | 'upgrade'
 * @param {string} params.gymId
 * @param {string} params.subscriptionId
 * @param {string} params.plan - plan name (e.g. 'Standard', 'Premium')
 * @param {number} params.originalAmount - amount before discount (paise)
 * @param {number} params.discountAmount - discount applied (paise)
 * @param {number} params.finalAmount - amount after discount (paise)
 * @param {string} params.currency - e.g. 'INR'
 * @param {string} params.paymentMethod - e.g. 'UPI', 'Card'
 */
export function buildPaymentRequest({
  type,
  gymId,
  subscriptionId,
  plan,
  originalAmount,
  discountAmount,
  finalAmount,
  currency,
  paymentMethod,
}) {
  const paymentId = generatePaymentId()
  const now = new Date()

  return {
    paymentId,
    gymId: gymId || 'default',
    subscriptionId: subscriptionId || null,
    type,
    plan: plan || 'Standard',
    originalAmount: Number(originalAmount) || 0,
    discountAmount: Number(discountAmount) || 0,
    finalAmount: Number(finalAmount) || 0,
    currency: currency || 'INR',
    paymentMethod: paymentMethod || 'UPI',
    paymentGateway: 'PhonePe',
    status: 'pending',
    transactionId: null,
    merchantTransactionId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

/**
 * Build a payment request for a new subscription.
 */
export function buildNewSubscriptionPayment({ gymId, subscriptionId, plan, originalAmount, discountAmount, finalAmount, currency, paymentMethod }) {
  return buildPaymentRequest({
    type: 'new',
    gymId,
    subscriptionId,
    plan,
    originalAmount,
    discountAmount,
    finalAmount,
    currency,
    paymentMethod,
  })
}

/**
 * Build a payment request for a subscription renewal.
 */
export function buildRenewalPayment({ gymId, subscriptionId, plan, originalAmount, discountAmount, finalAmount, currency, paymentMethod }) {
  return buildPaymentRequest({
    type: 'renewal',
    gymId,
    subscriptionId,
    plan,
    originalAmount,
    discountAmount,
    finalAmount,
    currency,
    paymentMethod,
  })
}

/**
 * Build a payment request for a subscription upgrade.
 */
export function buildUpgradePayment({ gymId, subscriptionId, plan, originalAmount, discountAmount, finalAmount, currency, paymentMethod }) {
  return buildPaymentRequest({
    type: 'upgrade',
    gymId,
    subscriptionId,
    plan,
    originalAmount,
    discountAmount,
    finalAmount,
    currency,
    paymentMethod,
  })
}

// ─────────────────────────────────────────────
// PAYMENT ORCHESTRATION (via Cloud Functions)
// ─────────────────────────────────────────────

/**
 * Orchestrate a PhonePe payment via Cloud Function.
 * Frontend sends payment params → Cloud Function handles config, checksum, API call.
 *
 * @param {Object} params
 * @param {string} params.type - 'new' | 'renewal' | 'upgrade'
 * @param {string} params.gymId
 * @param {string} params.subscriptionId
 * @param {string} params.plan
 * @param {number} params.originalAmount - paise
 * @param {number} params.discountAmount - paise
 * @param {number} params.finalAmount - paise
 * @param {string} params.currency
 * @param {string} params.paymentMethod
 * @param {string} params.name - payer name
 * @param {string} params.email - payer email
 * @param {string} params.phone - payer phone
 * @param {string} params.redirectUrl - where to redirect after payment
 * @param {string} params.callbackUrl - webhook URL (optional)
 *
 * @returns {{ attemptId, redirectUrl, error }}
 */
export async function initiatePayment({
  type,
  gymId,
  subscriptionId,
  plan,
  originalAmount,
  discountAmount,
  finalAmount,
  currency,
  paymentMethod,
  name,
  email,
  phone,
  redirectUrl,
  callbackUrl,
}) {
  try {
    const result = await createPaymentFn({
      type,
      gymId,
      subscriptionId,
      plan,
      originalAmount,
      discountAmount,
      finalAmount,
      currency,
      paymentMethod,
      name,
      email,
      phone,
      redirectUrl,
      callbackUrl,
    })

    return result.data
  } catch (error) {
    console.error('createPayment Cloud Function error:', error)
    return {
      attemptId: null,
      redirectUrl: null,
      error: error.message || 'Failed to initiate payment',
    }
  }
}

/**
 * Re-check and update payment status via Cloud Function.
 * Frontend sends attemptId → Cloud Function handles config, checksum, PhonePe API call.
 *
 * @param {string} attemptId - Firestore document ID of the payment attempt
 * @returns {{ status, error }}
 */
export async function refreshPaymentStatus(attemptId) {
  try {
    const result = await verifyPaymentFn({ attemptId })
    return result.data
  } catch (error) {
    console.error('verifyPayment Cloud Function error:', error)
    return {
      status: null,
      error: error.message || 'Failed to verify payment',
    }
  }
}

// ─────────────────────────────────────────────
// FIRESTORE PERSISTENCE — paymentAttempts collection
// ─────────────────────────────────────────────

const COLLECTION = 'paymentAttempts'

/**
 * Persist a payment attempt to Firestore.
 * @param {Object} paymentRequest - from buildPaymentRequest()
 * @returns {string} the Firestore document ID
 */
export async function savePaymentAttempt(paymentRequest) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...paymentRequest,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

/**
 * Update a payment attempt (e.g. status change after webhook callback).
 * @param {string} docId - Firestore document ID
 * @param {Object} updates - fields to update
 */
export async function updatePaymentAttempt(docId, updates) {
  const allowed = {}
  if (updates.status !== undefined) {
    if (!VALID_STATUSES.includes(updates.status)) {
      throw new Error(`Invalid status: ${updates.status}. Must be one of: ${VALID_STATUSES.join(', ')}`)
    }
    allowed.status = updates.status
  }
  if (updates.transactionId !== undefined) allowed.transactionId = updates.transactionId
  if (updates.merchantTransactionId !== undefined) allowed.merchantTransactionId = updates.merchantTransactionId
  if (updates.redirectUrl !== undefined) allowed.redirectUrl = updates.redirectUrl
  if (updates.errorMessage !== undefined) allowed.errorMessage = updates.errorMessage
  if (updates.phonePeState !== undefined) allowed.phonePeState = updates.phonePeState
  if (updates.phonePeTransactionId !== undefined) allowed.phonePeTransactionId = updates.phonePeTransactionId
  if (updates.rawResponse !== undefined) allowed.rawResponse = updates.rawResponse

  if (Object.keys(allowed).length === 0) return

  allowed.updatedAt = serverTimestamp()
  await updateDoc(doc(db, COLLECTION, docId), allowed)
}

/**
 * Read a single payment attempt by Firestore doc ID.
 */
export async function getPaymentAttempt(docId) {
  const snap = await getDoc(doc(db, COLLECTION, docId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Subscribe to payment attempts in real-time.
 * Filters by gymId when provided.
 * @param {Function} callback
 * @param {string} [gymId]
 * @returns {Function} unsubscribe
 */
export function subscribeToPaymentAttempts(callback, gymId) {
  const ref = gymId
    ? query(collection(db, COLLECTION), where('gymId', '==', gymId))
    : collection(db, COLLECTION)

  return onSnapshot(ref, (snapshot) => {
    const attempts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(attempts)
  })
}

/**
 * Find pending payment attempts for a subscription.
 * Useful for checking if a payment is already in progress.
 */
export async function getPendingAttemptsForSubscription(subscriptionId, gymId) {
  const constraints = [
    where('subscriptionId', '==', subscriptionId),
    where('status', '==', 'pending'),
  ]
  if (gymId) {
    constraints.push(where('gymId', '==', gymId))
  }
  const q = query(collection(db, COLLECTION), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
