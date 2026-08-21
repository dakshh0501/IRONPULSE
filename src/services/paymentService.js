// src/services/paymentService.js
//
// Reusable PaymentService for PhonePe integration.
// All sensitive operations (checksum generation, PhonePe API calls) are handled by Cloud Functions.
// This file only contains Firestore persistence and Cloud Function calls.

import { subscribeRealtime } from './realtimeService'
import { PLAN_AMOUNTS, isValidPaidPlan } from '../constants/plans'


/** Lazy supabase client (supabase mode only — never imported in firebase builds) */
async function getSupabaseClient() {
  const mod = await import('../lib/supabase')
  return mod.supabase
}

// Supabase payment_attempts row → Firestore-shaped attempt
function mapPaymentAttemptRow(r) {
  return {
    id: r.id,
    paymentId: r.payment_id || '',
    gymId: r.gym_id || '',
    subscriptionId: r.subscription_id || '',
    type: r.type || '',
    plan: r.plan || '',
    originalAmount: r.original_amount != null ? Number(r.original_amount) : 0,
    discountAmount: r.discount_amount != null ? Number(r.discount_amount) : 0,
    finalAmount: r.final_amount != null ? Number(r.final_amount) : 0,
    currency: r.currency || 'INR',
    name: r.name || '',
    email: r.email || '',
    phone: r.phone || '',
    redirectUrl: r.redirect_url || '',
    status: r.status || 'pending',
    paymentMethod: r.payment_method || '',
    paymentGateway: r.payment_gateway || '',
    transactionId: r.transaction_id || null,
    merchantTransactionId: r.phonepe_transaction_id || r.transaction_id || null,
    phonePeState: r.order_status || '',
    phonePeTransactionId: r.phonepe_transaction_id || '',
    cashfreeOrderId: r.cashfree_order_id || '',
    paymentSessionId: r.payment_session_id || '',
    orderStatus: r.order_status || '',
    authUid: r.auth_uid || '',
    expiresAt: r.expires_at || null,
    invoiceNo: r.invoice_no || '',
    errorMessage: r.error_message || '',
    rawResponse: r.raw_response || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

// ─────────────────────────────────────────────
// PAYMENT REQUEST BUILDERS
// ─────────────────────────────────────────────

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
 * Returns a structured object ready for persistence.
 * Does NOT make any API calls.
 *
 * STRICT plan validation — there are deliberately NO silent fallbacks:
 * a missing, Trial, or unrecognized plan THROWS instead of defaulting to
 * 'Standard', and the amounts are taken from the canonical PLAN_AMOUNTS
 * source (caller-supplied amounts are ignored so a request can never
 * carry a manipulated price).
 *
 * @param {Object} params
 * @param {string} params.type - 'new' | 'renewal' | 'upgrade'
 * @param {string} params.gymId
 * @param {string} [params.subscriptionId]
 * @param {string} params.plan - canonical payable plan (e.g. 'Standard', 'Premium')
 * @param {string} [params.currency] - e.g. 'INR'
 * @param {string} [params.paymentMethod] - e.g. 'UPI', 'Card'
 * @throws {Error} when plan is missing, 'Trial', or not a payable PLAN_AMOUNTS key
 */
export function buildPaymentRequest({
  type,
  gymId,
  subscriptionId,
  plan,
  currency,
  paymentMethod,
}) {
  if (!isValidPaidPlan(plan)) {
    throw new Error(`Cannot initiate checkout: invalid or non-payable plan "${plan}"`)
  }
  // Canonical pricing from the single authoritative source (paise).
  const canonicalAmount = PLAN_AMOUNTS[plan]
  const paymentId = generatePaymentId()
  const now = new Date()

  return {
    paymentId,
    gymId: gymId || 'default',
    subscriptionId: subscriptionId || null,
    type,
    plan,
    originalAmount: canonicalAmount,
    discountAmount: 0,
    finalAmount: canonicalAmount,
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
 * Build a typed payment request.
 * @param {'new'|'renewal'|'upgrade'} type
 */
export function buildTypedPayment(type, params) {
  return buildPaymentRequest({ ...params, type })
}

/** @deprecated Use buildTypedPayment('new', params) */
export function buildNewSubscriptionPayment(params) { return buildTypedPayment('new', params) }
/** @deprecated Use buildTypedPayment('renewal', params) */
export function buildRenewalPayment(params) { return buildTypedPayment('renewal', params) }
/** @deprecated Use buildTypedPayment('upgrade', params) */
export function buildUpgradePayment(params) { return buildTypedPayment('upgrade', params) }

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
 * @param {string} params.authUid - paying member's authUid (for referral tracking)
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
  authUid,
  redirectUrl,
  callbackUrl,
}) {
    // Supabase mode: the phonepe-pay Edge Function loads secrets server-side
    // (Step 8G). Same contract: { attemptId, redirectUrl, error }.
    try {
      const supabase = await getSupabaseClient()
      const { data, error } = await supabase.functions.invoke('phonepe-pay', {
        body: {
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
          authUid,
          redirectUrl,
          callbackUrl,
        },
      })
      if (error) {
        return { attemptId: null, redirectUrl: null, error: error.message || 'Failed to initiate payment' }
      }
      return data || { attemptId: null, redirectUrl: null, error: 'Empty response from payment service' }
    } catch (err) {
      console.error('phonepe-pay Edge Function error:', err)
      return { attemptId: null, redirectUrl: null, error: err.message || 'Failed to initiate payment' }
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
    // Supabase mode: phonepe-verify Edge Function (Step 8G).
    try {
      const supabase = await getSupabaseClient()
      const { data, error } = await supabase.functions.invoke('phonepe-verify', {
        body: { attemptId },
      })
      if (error) {
        return { status: null, error: error.message || 'Failed to verify payment' }
      }
      return data || { status: null, error: 'Empty response from payment service' }
    } catch (err) {
      console.error('phonepe-verify Edge Function error:', err)
      return { status: null, error: err.message || 'Failed to verify payment' }
    }
}

// NOTE: PhonePe callback URLs (webhooks) are unreachable from localhost.
// In development, payment status must be polled via refreshPaymentStatus.
// In production, ensure the callback URL is a public HTTPS endpoint.

// ─────────────────────────────────────────────
// FIRESTORE PERSISTENCE — paymentAttempts collection
// ─────────────────────────────────────────────

/**
 * Persist a payment attempt to Firestore.
 * @param {Object} paymentRequest - from buildPaymentRequest()
 * @returns {string} the Firestore document ID
 */
export async function savePaymentAttempt(paymentRequest) {
    // Payment attempts are owned by the payment Cloud Functions
    // (createPayment/verifyPayment/cashfreeWebhook). Supabase mode must never
    // write them client-side — the createPayment callable persists attempts
    // server-side. BACKEND_FUNCTION_REQUIRED (documented boundary).
    throw new Error('savePaymentAttempt is Cloud-Function-owned (supabase mode): use initiatePayment() instead')
}

/**
 * Update a payment attempt (e.g. status change after webhook callback).
 * @param {string} docId - Firestore document ID
 * @param {Object} updates - fields to update
 */
export async function updatePaymentAttempt(docId, updates) {
    // See savePaymentAttempt — attempts are updated by the payment Cloud
    // Functions (verifyPayment/phonePeCallback/cashfreeWebhook) server-side.
    throw new Error('updatePaymentAttempt is Cloud-Function-owned (supabase mode): status updates happen server-side')
}

/**
 * Read a single payment attempt by Firestore doc ID / supabase uuid.
 */
export async function getPaymentAttempt(docId) {
    // Read-only exception (documented in Step 8E): attempts are
    // Cloud-Function-owned, but the client may read them for display.
    const supabase = await getSupabaseClient()
    const { data } = await supabase.from('payment_attempts').select('*').eq('id', docId).maybeSingle()
    return data ? mapPaymentAttemptRow(data) : null
}

/**
 * Subscribe to payment attempts in real-time.
 * Filters by gymId when provided.
 * @param {Function} callback
 * @param {string} [gymId]
 * @returns {Function} unsubscribe
 */
export function subscribeToPaymentAttempts(callback, gymId, onError) {
    return subscribeRealtime({
      table: 'payment_attempts',
      filter: [['gym_id', gymId]],
      limit: 500,
      mapRow: mapPaymentAttemptRow,
      onChange: callback,
      onError: (e) => {
        console.error(`[Supabase] paymentAttempts realtime error:`, e.message)
        if (onError) onError(e, 'paymentAttempts')
      },
      label: 'paymentAttempts',
    })
}

/**
 * Find pending payment attempts for a subscription.
 * Useful for checking if a payment is already in progress.
 */
export async function getPendingAttemptsForSubscription(subscriptionId, gymId) {
    // Supabase mode: pending-attempt detection is handled server-side by the
    // payment Cloud Functions (createPayment returns an existing attempt id).
    return []
}

/**
 * Cleanup expired payment attempts (30-min TTL).
 * Sets status to 'expired' for any pending attempts where expiresAt < now.
 * Recommended: call on app mount and/or via periodic Cloud Function.
 * Filters client-side to avoid requiring a composite index.
 */
export async function cleanupExpiredPaymentAttempts() {
  return 0
}
