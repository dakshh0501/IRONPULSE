// phonepe-verify — replaces the verifyPayment Cloud Function (functions/index.js:1309)
// Callable Edge Function. Checks the PhonePe payment status server-side,
// updates the attempt, and on success calls the shared fulfill_payment RPC
// (atomic — webhook + verify races are resolved by the row lock).

import { json, loadPhonePeConfig, getPhonePeApiEndpoint, phonePeStatusChecksum, mapPhonePeState } from '../_shared/helpers.ts'
import { adminClient } from '../_shared/db.ts'
import { authenticateCaller, isPaymentViewer } from '../_shared/auth.ts'

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { caller, error: authError } = await authenticateCaller(req)
  if (authError || !caller) return json({ status: null, error: authError || 'Authentication required' })

  if (!isPaymentViewer(caller.role)) return json({ status: null, error: 'Insufficient permissions' })

  let body: { attemptId?: string }
  try {
    body = (await req.json()) as { attemptId?: string }
  } catch {
    return json({ status: null, error: 'Invalid request body' })
  }
  const attemptId = String(body.attemptId || '')
  if (!attemptId) return json({ status: null, error: 'attemptId is required' })

  const db = adminClient()

  const { data: attempt } = await db.from('payment_attempts').select('*').eq('id', attemptId).maybeSingle()
  if (!attempt) return json({ status: null, error: 'Payment attempt not found' })
  if (attempt.status !== 'pending') return json({ status: attempt.status, error: null })

  // 30-minute expiry
  if (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now()) {
    await db.from('payment_attempts').update({ status: 'cancelled', error_message: 'Payment attempt expired (30-minute timeout)' }).eq('id', attemptId)
    return json({ status: 'cancelled', error: 'Payment attempt expired' })
  }

  // Cross-gym check
  if (!caller.isSuperAdmin && caller.gymId && attempt.gym_id && caller.gymId !== attempt.gym_id) {
    return json({ status: null, error: 'Cross-gym payment verification denied' })
  }

  const config = loadPhonePeConfig()
  if (!config) return json({ status: attempt.status, error: 'PhonePe not configured' })

  const merchantTransactionId = attempt.merchant_transaction_id || attempt.merchantTransactionId || ''
  if (!merchantTransactionId) return json({ status: attempt.status, error: 'Merchant transaction id missing on attempt' })

  const endpoints = getPhonePeApiEndpoint(config.merchantId)
  const statusUrl = endpoints.status(config.merchantId, merchantTransactionId)
  const checksum = await phonePeStatusChecksum(config.merchantId, merchantTransactionId, config.saltKey, config.saltIndex)

  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': config.merchantId,
      },
    })
    const resData = await response.json()

    if (!response.ok || !resData.success) {
      return json({ status: attempt.status, error: resData.message || `HTTP ${response.status}` })
    }

    const state = resData?.data?.state || null
    const phonePeTransactionId = resData?.data?.transactionId || null
    const newStatus = mapPhonePeState(state)

    if (newStatus === 'success') {
      // fulfill_payment owns the status transition atomically (row lock +
      // `status <> 'pending'` guard). Pre-writing status here would make the
      // RPC see a non-pending attempt and skip fulfillment.
      const { data: fulfillData, error: fulfillError } = await db.rpc('fulfill_payment', {
        p_attempt_id: attemptId,
        p_transaction_id: phonePeTransactionId,
      })
      if (fulfillError) console.error('phonepe-verify: fulfill_payment failed', fulfillError)
      // Metadata-only write (status stays owned by fulfill_payment)
      await db
        .from('payment_attempts')
        .update({ phonepe_state: state, phonepe_transaction_id: phonePeTransactionId })
        .eq('id', attemptId)
      const resolvedStatus =
        fulfillData?.ok === true || fulfillData?.already === true ? 'success' : fulfillData?.status || newStatus
      return json({ status: resolvedStatus, error: null })
    }

    if (newStatus !== attempt.status) {
      await db
        .from('payment_attempts')
        .update({ status: newStatus, phonepe_state: state, phonepe_transaction_id: phonePeTransactionId })
        .eq('id', attemptId)
    }

    return json({ status: newStatus, error: null })
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : 'Network request failed'
    return json({ status: attempt.status, error: message })
  }
}

Deno.serve(handler)
