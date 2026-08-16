// cashfree-verify — replaces the verifyCashfreePayment Cloud Function (functions/index.js:1798)
// Callable Edge Function. Queries the Cashfree Orders API server-side, maps the
// status, and on success calls the shared fulfill_payment RPC.

import { json, loadCashfreeConfig, cashfreeHeaders, mapCashfreeOrderStatus } from '../_shared/helpers.ts'
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

  const config = loadCashfreeConfig()
  if (!config) return json({ status: attempt.status, error: 'Cashfree not configured' })

  const orderId = attempt.cashfree_order_id
  if (!orderId) return json({ status: attempt.status, error: 'Cashfree order id missing on attempt' })

  try {
    const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: cashfreeHeaders(config),
    })
    const resData = await response.json()

    if (!response.ok) {
      return json({ status: attempt.status, error: resData.message || resData.code || `HTTP ${response.status}` })
    }

    const newStatus = mapCashfreeOrderStatus(resData.order_status)
    const cashfreeTransactionId = resData?.payment?.payment_id || null

    if (newStatus === 'success') {
      // fulfill_payment owns the status transition atomically (see phonepe-verify).
      const { data: fulfillData, error: fulfillError } = await db.rpc('fulfill_payment', {
        p_attempt_id: attemptId,
        p_transaction_id: cashfreeTransactionId,
      })
      if (fulfillError) console.error('cashfree-verify: fulfill_payment failed', fulfillError)
      // Metadata-only write (status owned by fulfill_payment)
      await db
        .from('payment_attempts')
        .update({
          order_status: resData.order_status,
          cashfree_transaction_id: cashfreeTransactionId,
          raw_response: resData,
        })
        .eq('id', attemptId)
      const resolvedStatus =
        fulfillData?.ok === true || fulfillData?.already === true ? 'success' : fulfillData?.status || newStatus
      return json({ status: resolvedStatus, error: null })
    }

    if (newStatus !== attempt.status) {
      await db
        .from('payment_attempts')
        .update({
          status: newStatus,
          order_status: resData.order_status,
          cashfree_transaction_id: cashfreeTransactionId,
          raw_response: resData,
        })
        .eq('id', attemptId)
    }

    return json({ status: newStatus, error: null })
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : 'Network request failed'
    return json({ status: attempt.status, error: message })
  }
}

Deno.serve(handler)
