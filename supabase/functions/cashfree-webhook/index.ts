// cashfree-webhook — replaces the cashfreeWebhook Cloud Function (functions/index.js:1903)
// HTTP webhook Edge Function (deploy with --no-verify-jwt).
// Verifies x-webhook-signature = base64(HMAC-SHA256(clientSecret,
// x-webhook-timestamp + rawBody)) byte-exact over the wire bytes with a
// timing-safe compare; rejects stale timestamps (>5 min). Invalid events are
// acknowledged with 200 and NOT processed (fail-closed, no retry leak).

import { json, hmacSha256Base64, timingSafeEqualStr, mapCashfreeOrderStatus } from '../_shared/helpers.ts'
import { adminClient } from '../_shared/db.ts'

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const config = (() => {
    const clientId = Deno.env.get('CASHFREE_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('CASHFREE_CLIENT_SECRET') || ''
    if (!clientId || !clientSecret) return null
    return { clientId, clientSecret }
  })()
  if (!config) return json({ success: true })

  // Raw wire bytes FIRST — the HMAC covers the exact body as received.
  const rawBytes = new Uint8Array(await req.arrayBuffer())

  const receivedSignature = req.headers.get('x-webhook-signature') || ''
  if (!receivedSignature) return json({ success: true })

  const timestamp = req.headers.get('x-webhook-timestamp') || ''
  if (!timestamp) return json({ success: true })

  // Replay protection: reject events older than 5 minutes
  const tsMs = new Date(timestamp).getTime()
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    return json({ success: true })
  }

  if (rawBytes.length === 0) return json({ success: true })

  // Cashfree spec: signStr = x-webhook-timestamp + rawBody
  const message = new Uint8Array(timestamp.length + rawBytes.length)
  new TextEncoder().encodeInto(timestamp, message.subarray(0, timestamp.length))
  message.set(rawBytes, timestamp.length)

  const expectedSignature = await hmacSha256Base64(config.clientSecret, message)
  if (!timingSafeEqualStr(receivedSignature, expectedSignature)) {
    return json({ success: true }) // signature mismatch — ack, don't process
  }

  // Parse JSON from the raw bytes (never re-serialize)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(new TextDecoder().decode(rawBytes)) as Record<string, unknown>
  } catch {
    return json({ success: true })
  }

  // v2 payload: body.data is a base64-encoded event object
  let eventData: Record<string, unknown> = body
  if (typeof body.data === 'string') {
    try {
      const bin = atob(body.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      eventData = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    } catch {
      return json({ success: true })
    }
  }

  const orderObj = (eventData.order || {}) as Record<string, unknown>
  const paymentObj = (eventData.payment || {}) as Record<string, unknown>
  const orderId = String(orderObj.order_id || body.order_id || '')
  if (!orderId) return json({ success: true })

  const db = adminClient()

  const { data: attempts } = await db
    .from('payment_attempts')
    .select('*')
    .eq('cashfree_order_id', orderId)
    .limit(1)
  if (!attempts || attempts.length === 0) return json({ success: true })

  const attempt = attempts[0]

  // Amount verification (webhook order_amount is in rupees; attempt in paise)
  const orderAmount = orderObj.order_amount ?? body.order_amount
  if (orderAmount != null && attempt.final_amount != null &&
      Number(orderAmount) !== Number((Number(attempt.final_amount) / 100).toFixed(2))) {
    return json({ success: true })
  }

  // 30-minute expiry
  if (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now()) {
    await db.from('payment_attempts').update({ status: 'cancelled', error_message: 'Payment attempt expired' }).eq('id', attempt.id)
    return json({ success: true })
  }

  if (attempt.status !== 'pending') return json({ success: true }) // idempotent

  const paymentStatus = String(paymentObj.payment_status || '')
  const newStatus = mapCashfreeOrderStatus(paymentStatus || 'FAILED')
  const cashfreeTransactionId = paymentObj.payment_id || attempt.cashfree_transaction_id || null

  if (newStatus === 'success') {
    // fulfill_payment owns the status transition atomically (see phonepe-verify).
    const { error: fulfillError } = await db.rpc('fulfill_payment', {
      p_attempt_id: attempt.id,
      p_transaction_id: cashfreeTransactionId,
    })
    if (fulfillError) console.error('cashfree-webhook: fulfill_payment failed', fulfillError)
    // Metadata-only write (status owned by fulfill_payment)
    await db
      .from('payment_attempts')
      .update({
        order_status: paymentStatus,
        cashfree_transaction_id: cashfreeTransactionId,
        callback_amount: paymentObj.payment_amount != null ? Number(paymentObj.payment_amount) : null,
        raw_response: eventData,
      })
      .eq('id', attempt.id)
  } else if (newStatus !== attempt.status) {
    await db
      .from('payment_attempts')
      .update({
        status: newStatus,
        order_status: paymentStatus,
        cashfree_transaction_id: cashfreeTransactionId,
        callback_amount: paymentObj.payment_amount != null ? Number(paymentObj.payment_amount) : null,
        raw_response: eventData,
      })
      .eq('id', attempt.id)
  }

  return json({ success: true })
}

Deno.serve(handler)
