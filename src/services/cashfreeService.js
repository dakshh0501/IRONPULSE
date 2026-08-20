// src/services/cashfreeService.js
//
// Cashfree Payment Gateway integration (v3 JS SDK).
//
// Order creation, status verification, and webhook processing all run
// server-side in Cloud Functions (createCashfreeOrder / verifyCashfreePayment
// / cashfreeWebhook) — mirroring the PhonePe flow in functions/index.js.
//
// SECURITY: the browser NEVER holds the Cashfree secret, never calls the
// Cashfree REST API, and never creates orders. It only receives the
// payment_session_id from the Cloud Function and opens the Cashfree v3 SDK
// checkout modal.


const API_VERSION = '2023-08-01'


/** Lazy supabase client (supabase mode only) */
async function getSupabaseClient() {
  const mod = await import('../lib/supabase')
  return mod.supabase
}

export function getCashfreeMode() {
  return import.meta.env.VITE_CASHFREE_MODE === 'production' ? 'production' : 'sandbox'
}

export function getCashfreeConfig() {
  // Cashfree's App ID IS the public client identifier (the same value used
  // as x-client-id) — the two env names are aliases for ONE public credential.
  // Prefer VITE_CASHFREE_APP_ID; accept VITE_CASHFREE_CLIENT_ID for backward
  // compatibility. The secret (CASHFREE_CLIENT_SECRET) is NEVER in the browser.
  const canonicalId = import.meta.env.VITE_CASHFREE_APP_ID || import.meta.env.VITE_CASHFREE_CLIENT_ID || ''
  return {
    mode: getCashfreeMode(),
    appId: canonicalId,
    clientId: canonicalId,
    apiVersion: API_VERSION,
  }
}

// Configured = the canonical PUBLIC Cashfree client id is present. The SDK
// and order API need this single public credential (non-secret); the secret
// lives ONLY server-side (Edge Function secrets).
export function isCashfreeConfigured() {
  const cfg = getCashfreeConfig()
  return !!cfg.clientId
}

/**
 * Create a Cashfree order server-side.
 * @param {Object} params — mirrors the PhonePe initiatePayment params:
 *   { type, gymId, subscriptionId, plan, originalAmount, discountAmount,
 *     finalAmount, currency, name, email, phone, redirectUrl, authUid }
 * @returns {Promise<{attemptId, redirectUrl, paymentSessionId, orderId, error}>}
 */
export async function createCashfreeOrder(params) {
    // Supabase mode: cashfree-order Edge Function (Step 8G). Same contract.
    const supabase = await getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('cashfree-order', { body: params })
    if (error) return { attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: error.message || 'Failed to create Cashfree order' }
    return data || { attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Empty response from payment service' }
}

/**
 * Verify a Cashfree order server-side (mirrors refreshPaymentStatus).
 * @param {string} attemptId — paymentAttempts doc id
 * @returns {Promise<{status: 'pending'|'success'|'failed'|'cancelled', error}>}
 */
export async function verifyCashfreePayment(attemptId) {
    // Supabase mode: cashfree-verify Edge Function (Step 8G).
    const supabase = await getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('cashfree-verify', { body: { attemptId } })
    if (error) return { status: null, error: error.message || 'Failed to verify payment' }
    return data || { status: null, error: 'Empty response from payment service' }
}

// Lazy Cashfree SDK singleton (loaded only on first checkout)
let cashfreePromise = null
async function getCashfreeSdk() {
  if (!cashfreePromise) {
    cashfreePromise = (async () => {
      const { load } = await import('@cashfreepayments/cashfree-js')
      const { appId, clientId, mode } = getCashfreeConfig()
      return load({
        mode,
        env: { CASHFREE_APP_ID: appId, CASHFREE_CLIENT_ID: clientId },
      })
    })()
  }
  return cashfreePromise
}

/**
 * Collect a payment with the Cashfree modal checkout.
 * 1. Calls createCashfreeOrder (Cloud Function) — the server creates the
 *    order and returns the payment_session_id (browser never touches the API).
 * 2. Opens the Cashfree v3 SDK modal with the payment_session_id.
 * 3. Navigates to /payment-status?attemptId=...&order_id=... when done.
 *
 * @param {Object} params — same shape as createCashfreeOrder params
 * @returns {Promise<{ok: boolean, error?: string, orderId?: string}>}
 */
export async function handleCollectPayment(params) {
  if (!isCashfreeConfigured()) {
    return { ok: false, error: 'Cashfree is not configured on this deployment.' }
  }

  try {
    const result = await createCashfreeOrder(params)
    if (result.error) {
      return { ok: false, error: result.error }
    }
    if (!result.paymentSessionId) {
      return { ok: false, error: 'Cashfree did not return a payment session id.' }
    }

    const cashfree = await getCashfreeSdk()
    await cashfree.checkout({
      paymentSessionId: result.paymentSessionId,
      redirectTarget: '_modal',
    })

    // Modal resolved (or was redirected) — verify authoritatively on the
    // status page. The attemptId lets the status page re-verify via the
    // Cloud Function (never the raw Cashfree API).
    const orderId = result.orderId || ''
    window.location.href = `${window.location.origin}/payment-status?attemptId=${encodeURIComponent(result.attemptId || '')}&order_id=${encodeURIComponent(orderId)}&source=cashfree`
    return { ok: true, orderId }
  } catch (err) {
    return { ok: false, error: err.message || 'Cashfree checkout failed.' }
  }
}
