// phonepe-pay — replaces the createPayment Cloud Function (functions/index.js:1082)
// Callable Edge Function (verify_jwt on). Loads PhonePe secrets server-side,
// generates the checksum, persists the attempt, calls the PhonePe /pg/v1/pay API.
// Returns { attemptId, redirectUrl, error }.

import {
  json,
  loadPhonePeConfig,
  validatePhonePeConfig,
  generateMerchantTransactionId,
  generatePaymentId,
  getPhonePeApiEndpoint,
  phonePeChecksum,
  bytesToBase64,
  type JsonRecord,
} from '../_shared/helpers.ts'
import { adminClient } from '../_shared/db.ts'
import { authenticateCaller, isPaymentInitiator } from '../_shared/auth.ts'

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { caller, error: authError } = await authenticateCaller(req)
  if (authError || !caller) return json({ attemptId: null, redirectUrl: null, error: authError || 'Authentication required' })

  let data: JsonRecord
  try {
    data = (await req.json()) as JsonRecord
  } catch {
    return json({ attemptId: null, redirectUrl: null, error: 'Invalid request body' })
  }

  const type = String(data.type || 'new')
  const gymId = String(data.gymId || '')
  const subscriptionId = String(data.subscriptionId || '') || null
  const plan = String(data.plan || 'Standard')
  const originalAmount = Number(data.originalAmount) || 0
  const discountAmount = Number(data.discountAmount) || 0
  const finalAmount = Number(data.finalAmount) || 0
  const currency = String(data.currency || 'INR')
  const paymentMethod = String(data.paymentMethod || 'UPI')
  const name = String(data.name || '')
  const email = String(data.email || '')
  const phone = String(data.phone || '')
  const redirectUrl = String(data.redirectUrl || '')
  const callbackUrl = String(data.callbackUrl || '')
  const authUid = String(data.authUid || '') || null

  // ── validation (createPayment parity) ──
  if (!finalAmount || finalAmount <= 0) {
    return json({ attemptId: null, redirectUrl: null, error: 'Invalid amount: finalAmount must be positive' })
  }
  if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
    return json({ attemptId: null, redirectUrl: null, error: 'Invalid phone number: must be 10 digits' })
  }
  if (!redirectUrl) return json({ attemptId: null, redirectUrl: null, error: 'redirectUrl is required' })
  if ((type === 'renewal' || type === 'upgrade') && !subscriptionId) {
    return json({ attemptId: null, redirectUrl: null, error: 'subscriptionId is required for renewal/upgrade' })
  }
  if (!gymId) return json({ attemptId: null, redirectUrl: null, error: 'gymId is required' })
  if (callbackUrl && !/^https?:\/\//.test(callbackUrl)) {
    return json({ attemptId: null, redirectUrl: null, error: 'callbackUrl must be a valid HTTP/HTTPS URL' })
  }

  // ── role + gym ownership (createPayment parity) ──
  if (!isPaymentInitiator(caller.role)) {
    return json({ attemptId: null, redirectUrl: null, error: 'Insufficient permissions: only admins and gym owners can initiate payments' })
  }
  if (!caller.isSuperAdmin && (!caller.gymId || caller.gymId !== gymId)) {
    return json({ attemptId: null, redirectUrl: null, error: 'Access denied: you do not own this gym' })
  }

  // ── PhonePe config (server-side secrets only) ──
  const config = loadPhonePeConfig()
  if (!config) {
    return json({ attemptId: null, redirectUrl: null, error: 'PhonePe is not configured. Please set Merchant ID, Salt Key, and Salt Index in Billing Settings.' })
  }
  const validation = validatePhonePeConfig(config)
  if (!validation.valid) {
    return json({ attemptId: null, redirectUrl: null, error: `PhonePe config errors: ${validation.errors.join(', ')}` })
  }

  const db = adminClient()

  // ── pending-attempt idempotency (createPayment parity) ──
  if (subscriptionId) {
    const { data: existing } = await db
      .from('payment_attempts')
      .select('id, redirect_url')
      .eq('subscription_id', subscriptionId)
      .eq('status', 'pending')
      .limit(1)
    if (existing && existing.length > 0) {
      return json({ attemptId: existing[0].id, redirectUrl: existing[0].redirect_url, error: null })
    }
  }

  // ── payload + checksum ──
  const merchantTransactionId = generateMerchantTransactionId()
  const payload = {
    merchantId: config.merchantId,
    merchantTransactionId,
    merchantUserId: merchantTransactionId,
    name: name || '',
    mobileNumber: phone || '',
    amount: Math.round(finalAmount),
    redirectUrl: redirectUrl || '',
    redirectMode: 'REDIRECT',
    callbackUrl: callbackUrl || '',
    paymentInstrument: { type: 'PAY_PAGE' },
  }
  const base64Payload = bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))
  const checksum = await phonePeChecksum(base64Payload, '/pg/v1/pay', config.saltKey, config.saltIndex)

  const paymentId = generatePaymentId()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  // ── persist attempt (pending) ──
  const { data: attemptRow, error: insertError } = await db
    .from('payment_attempts')
    .insert({
      payment_id: paymentId,
      gym_id: gymId,
      subscription_id: subscriptionId,
      type,
      plan,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      currency,
      name: name || null,
      email: email || null,
      phone: phone || null,
      redirect_url: null,
      status: 'pending',
      payment_method: paymentMethod,
      payment_gateway: 'PhonePe',
      merchant_transaction_id: merchantTransactionId,
      transaction_id: null,
      auth_uid: authUid,
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (insertError || !attemptRow) {
    return json({ attemptId: null, redirectUrl: null, error: 'Failed to save payment attempt' })
  }
  const attemptId = attemptRow.id

  // ── call PhonePe (server-side) ──
  const endpoints = getPhonePeApiEndpoint(config.merchantId)
  try {
    const response = await fetch(endpoints.pay, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': config.merchantId,
      },
      body: JSON.stringify({ request: base64Payload }),
    })
    const resData = await response.json()

    if (!response.ok || !resData.success) {
      await db
        .from('payment_attempts')
        .update({
          status: 'failed',
          error_message: resData.message || `HTTP ${response.status}`,
          raw_response: resData,
        })
        .eq('id', attemptId)
      return json({ attemptId, redirectUrl: null, error: resData.message || `PhonePe API error: HTTP ${response.status}` })
    }

    const payRedirectUrl = resData?.data?.paymentInstrument?.redirectInfo?.url || null
    const transactionId = resData?.data?.transactionId || null
    await db
      .from('payment_attempts')
      .update({
        merchant_transaction_id: merchantTransactionId,
        transaction_id: transactionId,
        redirect_url: payRedirectUrl,
        phonepe_state: 'PENDING',
        raw_response: resData,
      })
      .eq('id', attemptId)

    return json({ attemptId, redirectUrl: payRedirectUrl, error: null })
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : 'Network request failed'
    await db
      .from('payment_attempts')
      .update({ status: 'failed', error_message: message })
      .eq('id', attemptId)
    return json({ attemptId, redirectUrl: null, error: message })
  }
}

Deno.serve(handler)
