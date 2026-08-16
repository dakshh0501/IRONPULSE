// phonepe-callback — replaces the phonePeCallback Cloud Function (functions/index.js:1425)
// HTTP webhook Edge Function (deploy with --no-verify-jwt — PhonePe sends no JWT).
// Verifies the X-VERIFY checksum over the decoded response, updates the attempt,
// and on success calls the shared fulfill_payment RPC. Always 200s (never leaks
// processing state to the caller, never triggers PhonePe retries).

import { json, base64ToString, phonePeCallbackChecksum, timingSafeEqualStr, mapPhonePeState } from '../_shared/helpers.ts'
import { adminClient } from '../_shared/db.ts'

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ success: true }) // 200 — never expose errors to the caller
  }

  const responseB64 = typeof body.response === 'string' ? body.response : ''
  if (!responseB64) return json({ success: true }) // missing response — 200 no-op

  let decodedJson: string
  let callbackData: Record<string, unknown>
  try {
    decodedJson = base64ToString(responseB64)
    callbackData = JSON.parse(decodedJson) as Record<string, unknown>
  } catch {
    return json({ success: true })
  }

  const merchantTransactionId = String(callbackData.merchantTransactionId || '')
  const transactionId = callbackData.transactionId || null
  const state = String(callbackData.state || '')
  const responseCode = callbackData.responseCode || null
  const amount = callbackData.amount ?? null

  if (!merchantTransactionId) return json({ success: true }) // 200 no-op

  const config = (() => {
    try {
      const merchantId = Deno.env.get('PHONEPE_MERCHANT_ID') || ''
      const saltKey = Deno.env.get('PHONEPE_SALT_KEY') || ''
      const saltIndex = Deno.env.get('PHONEPE_SALT_INDEX') || ''
      if (!merchantId || !saltKey || !saltIndex) return null
      return { merchantId, saltKey, saltIndex }
    } catch {
      return null
    }
  })()
  if (!config) return json({ success: true })

  // X-VERIFY header: {checksum}###{saltIndex}
  const xVerify = req.headers.get('x-verify') || ''
  const [receivedChecksum, headerSaltIdx] = xVerify.split('###')
  if (!receivedChecksum) return json({ success: true })

  const expectedHash = await phonePeCallbackChecksum(decodedJson, config.merchantId, merchantTransactionId, config.saltKey)
  const expectedChecksum = `${expectedHash}###${headerSaltIdx || config.saltIndex}`

  // Compare the FULL header (checksum + salt index) — the raw hash alone never
  // matches the expected value which includes the `###{saltIndex}` suffix.
  if (!timingSafeEqualStr(xVerify, expectedChecksum)) {
    return json({ success: true }) // checksum mismatch — 200 no-op
  }

  const db = adminClient()

  // Find the attempt by merchantTransactionId
  const { data: attempts } = await db
    .from('payment_attempts')
    .select('*')
    .eq('merchant_transaction_id', merchantTransactionId)
    .limit(1)
  if (!attempts || attempts.length === 0) return json({ success: true }) // 200 no-op

  const attempt = attempts[0]

  // Amount verification (paise parity with attempt.final_amount)
  if (amount != null && attempt.final_amount != null && Number(amount) !== Number(attempt.final_amount)) {
    return json({ success: true })
  }

  // 30-minute expiry
  if (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now()) {
    await db.from('payment_attempts').update({ status: 'cancelled', error_message: 'Payment attempt expired' }).eq('id', attempt.id)
    return json({ success: true })
  }

  if (attempt.status !== 'pending') return json({ success: true }) // idempotent

  const newStatus = mapPhonePeState(state)

  if (newStatus === 'success') {
    // fulfill_payment owns the status transition atomically (see phonepe-verify).
    // Pre-writing `status: 'success'` would trip the RPC's `<> 'pending'` guard.
    const { error: fulfillError } = await db.rpc('fulfill_payment', {
      p_attempt_id: attempt.id,
      p_transaction_id: transactionId || null,
    })
    if (fulfillError) console.error('phonepe-callback: fulfill_payment failed', fulfillError)
    // Metadata-only write (status owned by fulfill_payment)
    await db
      .from('payment_attempts')
      .update({
        phonepe_state: state,
        phonepe_transaction_id: transactionId || null,
        response_code: responseCode || null,
        callback_amount: amount != null ? Number(amount) : null,
      })
      .eq('id', attempt.id)
  } else if (newStatus !== attempt.status) {
    await db
      .from('payment_attempts')
      .update({
        status: newStatus,
        phonepe_state: state,
        phonepe_transaction_id: transactionId || null,
        response_code: responseCode || null,
        callback_amount: amount != null ? Number(amount) : null,
      })
      .eq('id', attempt.id)
  }

  return json({ success: true })
}

Deno.serve(handler)
