// cashfree-order — replaces the createCashfreeOrder Cloud Function (functions/index.js:1579)
// Callable Edge Function (verify_jwt on). Mirrors phonepe-pay: same validation,
// role checks, gym ownership, pending idempotency; returns
// { attemptId, redirectUrl: null, paymentSessionId, orderId, error }.
//
// SERVER-SIDE PRICE AUTHORITY: client-supplied finalAmount/originalAmount/
// discountAmount are NEVER trusted. The payable amount is derived exclusively
// from the validated plan via the authoritative plan_pricing table
// (migration 0016), with an embedded snapshot of the current test pricing as
// fallback when the table cannot be read. Missing, Trial, or unrecognized
// plans are rejected with 400 BEFORE any order or attempt row is created.

import {
  json,
  loadCashfreeConfig,
  generateCashfreeOrderId,
  generatePaymentId,
  cashfreeHeaders,
  type JsonRecord,
} from '../_shared/helpers.ts'
import { adminClient } from '../_shared/db.ts'
import type { SupabaseClient } from '../_shared/supabase.ts'
import { authenticateCaller, isPaymentInitiator } from '../_shared/auth.ts'
import { withCors } from '../_shared/cors.ts'

// Canonical payable plans (display casing matches src/constants/plans.js).
// Trial is deliberately excluded — ₹0 plans can never enter paid checkout.
const PAYABLE_PLAN_NAMES = ['Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass']

// Embedded pricing snapshot mirroring the plan_pricing seeds (migration 0016 /
// current TEST pricing: every paid tier = ₹1 = 100 paise). Used ONLY when the
// plan_pricing table cannot be read; the DB table always wins when populated.
const PLAN_PRICING_FALLBACK_PAISE: Record<string, number> = {
  'standard': 100,
  'premium': 100,
  'quarterly': 100,
  'annual': 100,
  'lifetime': 100,
  'day pass': 100,
}

/** Authoritative lowercase plan → paise map. DB (plan_pricing) wins; embedded snapshot falls back. */
async function loadPlanPricing(db: SupabaseClient): Promise<Record<string, number>> {
  try {
    const { data: rows, error } = await db.from('plan_pricing').select('plan, amount_paise')
    if (!error && Array.isArray(rows) && rows.length > 0) {
      const map: Record<string, number> = {}
      for (const row of rows as JsonRecord[]) {
        const key = String(row.plan ?? '').toLowerCase().trim()
        if (key) map[key] = Number(row.amount_paise) || 0
      }
      if (Object.keys(map).length > 0) return map
    }
  } catch {
    // table unavailable — fall through to the embedded snapshot
  }
  return { ...PLAN_PRICING_FALLBACK_PAISE }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { caller, error: authError } = await authenticateCaller(req)
  if (authError || !caller) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: authError || 'Authentication required' })
  }

  let data: JsonRecord
  try {
    data = (await req.json()) as JsonRecord
  } catch {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Invalid request body' })
  }

  const type = String(data.type || 'new')
  const gymId = String(data.gymId || '')
  const subscriptionId = String(data.subscriptionId || '') || null
  const currency = String(data.currency || 'INR')
  const name = String(data.name || '')
  const email = String(data.email || '')
  const phone = String(data.phone || '')
  const redirectUrl = String(data.redirectUrl || '')
  const authUid = String(data.authUid || '') || null

  // ── validation (createCashfreeOrder parity) ──
  // NOTE: no amount/plan checks here — plan + price are resolved and enforced
  // server-side in the dedicated block below (client amounts are never read).
  if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Invalid phone number: must be 10 digits' })
  }
  if (!redirectUrl) return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'redirectUrl is required' })
  if ((type === 'renewal' || type === 'upgrade') && !subscriptionId) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'subscriptionId is required for renewal/upgrade' })
  }
  if (!gymId) return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'gymId is required' })

  // ── SERVER-SIDE PRICE & PLAN VALIDATION ──
  // The payable amount is derived ONLY from the validated plan via the
  // authoritative plan_pricing table (migration 0016). Missing, Trial, or
  // unrecognized plans are rejected BEFORE any order or attempt is created;
  // client-supplied finalAmount/originalAmount/discountAmount are ignored.
  const db = adminClient()

  const planInput = String(data.plan ?? '').trim()
  const planCanonical = PAYABLE_PLAN_NAMES.find((p) => p.toLowerCase() === planInput.toLowerCase())
  const pricing = await loadPlanPricing(db)
  const serverAmountPaise = planCanonical ? pricing[planCanonical.toLowerCase()] : undefined

  if (!planCanonical || serverAmountPaise === undefined || serverAmountPaise <= 0) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Invalid or non-payable plan selected.' }, 400)
  }

  // Server-authoritative values — these flow into BOTH the payment attempt
  // row and the Cashfree order payload; the client cannot influence them.
  const plan = planCanonical
  const finalAmount = serverAmountPaise
  const originalAmount = serverAmountPaise
  const discountAmount = 0

  // ── role + gym ownership (parity) ──
  if (!isPaymentInitiator(caller.role)) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Insufficient permissions: only admins and gym owners can initiate payments' })
  }
  if (!caller.isSuperAdmin && (!caller.gymId || caller.gymId !== gymId)) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Access denied: you do not own this gym' })
  }

  const config = loadCashfreeConfig()
  if (!config) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Cashfree is not configured. Set the CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET secrets.' })
  }

  // ── pending idempotency (returns existing order when it has one) ──
  if (subscriptionId) {
    const { data: existing } = await db
      .from('payment_attempts')
      .select('id, payment_session_id, cashfree_order_id')
      .eq('subscription_id', subscriptionId)
      .eq('status', 'pending')
      .limit(1)
    if (existing && existing.length > 0 && existing[0].cashfree_order_id) {
      return json({
        attemptId: existing[0].id,
        redirectUrl: null,
        paymentSessionId: existing[0].payment_session_id || null,
        orderId: existing[0].cashfree_order_id,
        error: null,
      })
    }
  }

  const orderId = generateCashfreeOrderId()

  // amount paise → rupees for Cashfree
  const orderAmount = Number((Number(finalAmount) / 100).toFixed(2))
  const customerId = (authUid || caller.firebaseUid || gymId || 'guest').substring(0, 50)
  const payload: JsonRecord = {
    order_id: orderId,
    order_amount: orderAmount,
    order_currency: currency || 'INR',
    customer_details: {
      customer_id: customerId,
      customer_name: (name || 'Gym Owner').substring(0, 50),
      customer_email: email || '',
      customer_phone: phone || '',
    },
    order_meta: {
      return_url: `${redirectUrl}?attemptId={__ATTEMPT__}&order_id={order_id}`,
    },
  }

  const paymentId = generatePaymentId()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

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
      payment_method: 'Cashfree',
      payment_gateway: 'Cashfree',
      cashfree_order_id: orderId,
      order_status: 'INITIALIZED',
      payment_session_id: null,
      cashfree_transaction_id: null,
      transaction_id: null,
      auth_uid: authUid,
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (insertError || !attemptRow) {
    return json({ attemptId: null, redirectUrl: null, paymentSessionId: null, orderId: null, error: 'Failed to save payment attempt' })
  }
  const attemptId = attemptRow.id

  // Embed the real attemptId in the return_url
  const returnUrl = String(payload.order_meta.return_url).replace('{__ATTEMPT__}', attemptId)
  payload.order_meta.return_url = returnUrl

  // ── call Cashfree Orders API (server-side) ──
  try {
    const response = await fetch(`${config.baseUrl}/orders`, {
      method: 'POST',
      headers: cashfreeHeaders(config),
      body: JSON.stringify(payload),
    })
    const resData = await response.json()

    if (!response.ok || !resData.payment_session_id) {
      await db
        .from('payment_attempts')
        .update({
          status: 'failed',
          order_status: resData.order_status || 'FAILED',
          error_message: resData.message || resData.code || `HTTP ${response.status}`,
          raw_response: resData,
        })
        .eq('id', attemptId)
      return json({ attemptId, redirectUrl: null, paymentSessionId: null, orderId: null, error: resData.message || resData.code || `Cashfree API error: HTTP ${response.status}` })
    }

    await db
      .from('payment_attempts')
      .update({
        order_status: resData.order_status || 'ACTIVE',
        payment_session_id: resData.payment_session_id,
        raw_response: resData,
      })
      .eq('id', attemptId)

    return json({ attemptId, redirectUrl: null, paymentSessionId: resData.payment_session_id, orderId, error: null })
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : 'Network request failed'
    await db
      .from('payment_attempts')
      .update({ status: 'failed', error_message: message })
      .eq('id', attemptId)
    return json({ attemptId, redirectUrl: null, paymentSessionId: null, orderId: null, error: message })
  }
}

Deno.serve(withCors(handler))
