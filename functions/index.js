// functions/index.js
//
// Firebase Cloud Functions for IRONPULSE PhonePe payment integration.
// All sensitive operations (checksum generation, PhonePe API calls) happen here — never in the browser.

const { onCall, onRequest } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { defineSecret } = require('firebase-functions/params')
const crypto = require('crypto')

initializeApp()

const db = getFirestore()

// ─────────────────────────────────────────────
// PHONEPE SECRETS (managed via Firebase CLI)
// ─────────────────────────────────────────────
// Set with: firebase functions:secrets:set PHONEPE_MERCHANT_ID
//           firebase functions:secrets:set PHONEPE_SALT_KEY
//           firebase functions:secrets:set PHONEPE_SALT_INDEX

const PHONEPE_MERCHANT_ID = defineSecret('PHONEPE_MERCHANT_ID')
const PHONEPE_SALT_KEY = defineSecret('PHONEPE_SALT_KEY')
const PHONEPE_SALT_INDEX = defineSecret('PHONEPE_SALT_INDEX')

// ─────────────────────────────────────────────
// PHONEPE CONFIGURATION (server-side only)
// ─────────────────────────────────────────────

const VALID_STATUSES = ['pending', 'success', 'failed', 'cancelled']

// ─────────────────────────────────────────────
// PLAN DURATIONS & AMOUNTS (mirrors client)
// ─────────────────────────────────────────────

const PLAN_DURATIONS = { Trial: 7, Standard: 30, Premium: 30, Quarterly: 90, Annual: 365, Lifetime: 9999, 'Day Pass': 1 }
const PLAN_AMOUNTS = { Trial: 0, Standard: 9999, Premium: 19999, Quarterly: 29999, Annual: 99999, Lifetime: 499999, 'Day Pass': 99 }
const PLAN_ORDER = { 'Trial': 0, 'Day Pass': 1, 'Standard': 2, 'Premium': 3, 'Quarterly': 4, 'Annual': 5, 'Lifetime': 6 }

// ─────────────────────────────────────────────
// SUBSCRIPTION FULFILLMENT (server-side)
// ─────────────────────────────────────────────

/**
 * Fulfill a subscription after successful payment.
 * Called from verifyPayment (client-initiated) and phonePeCallback (webhook).
 *
 * Updates the subscription document with:
 * - paymentStatus: 'paid'
 * - paymentMethod: 'PhonePe'
 * - transactionId (PhonePe tx ID)
 * - paidAt (server timestamp)
 * - status: 'active'
 *
 * For renewal type: dates are already pre-set by the client.
 * For upgrade type: applies the new plan, recalculates dates and amounts.
 * For new type: activates the subscription.
 */
async function fulfillSubscriptionPayment(attempt, phonePeTransactionId) {
  if (!attempt.subscriptionId) return

  // Use a transaction to ensure atomicity between subscription update and payment record creation
  await db.runTransaction(async (transaction) => {
    const subRef = db.collection('subscriptions').doc(attempt.subscriptionId)
    const subSnap = await transaction.get(subRef)
    if (!subSnap.exists) {
      console.error('fulfillSubscriptionPayment: subscription not found', attempt.subscriptionId)
      return
    }

    const sub = subSnap.data()
    const now = new Date()
    const updateFields = {
      paymentStatus: 'paid',
      paymentMethod: attempt.paymentMethod || 'PhonePe',
      transactionId: phonePeTransactionId || attempt.phonePeTransactionId || null,
      paidAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    if (attempt.type === 'renewal') {
      // Renewal: dates were pre-set by client (startDate, expiryDate, daysRemaining).
      // Just activate and mark paid.
      updateFields.status = 'active'
    } else if (attempt.type === 'upgrade') {
      // Upgrade: apply the new plan from the payment attempt, recalculate dates + amounts.
      const newPlan = attempt.plan || sub.plan
      const duration = PLAN_DURATIONS[newPlan] || 30
      const expiryDate = new Date(now)
      expiryDate.setDate(expiryDate.getDate() + duration)
      const graceEnd = new Date(expiryDate)
      graceEnd.setDate(graceEnd.getDate() + 5)

      updateFields.status = 'active'
      updateFields.plan = newPlan
      updateFields.planType = newPlan
      updateFields.startDate = now.toISOString().split('T')[0]
      updateFields.expiryDate = expiryDate.toISOString().split('T')[0]
      updateFields.graceEndDate = graceEnd.toISOString().split('T')[0]
      updateFields.daysRemaining = duration
      updateFields.isLifetime = newPlan === 'Lifetime'
      updateFields.amount = attempt.finalAmount || PLAN_AMOUNTS[newPlan] || 0
      updateFields.originalAmount = attempt.originalAmount || attempt.finalAmount || PLAN_AMOUNTS[newPlan] || 0
      updateFields.finalAmount = attempt.finalAmount || PLAN_AMOUNTS[newPlan] || 0
    } else {
      // New subscription: activate.
      updateFields.status = 'active'
    }

    transaction.update(subRef, updateFields)

    // ── Sync to payments collection (financial records) ──
    await createPaymentRecordInTransaction(transaction, attempt, phonePeTransactionId)

    console.log('Subscription fulfilled:', attempt.subscriptionId, attempt.type, updateFields.status)
  }).catch(err => {
    console.error('fulfillSubscriptionPayment: transaction failed', attempt.subscriptionId, err)
    throw err
  })
}

/**
 * Create a payment record within a Firestore transaction.
 * Ensures atomicity with subscription fulfillment.
 */
async function createPaymentRecordInTransaction(transaction, attempt, phonePeTransactionId) {
  if (!attempt.paymentId) return

  // Duplicate prevention: check if a payment record already exists for this attempt
  const existing = await db.collection('payments')
    .where('paymentId', '==', attempt.paymentId)
    .limit(1)
    .get()

  if (!existing.empty) {
    console.log('Payment record already exists for', attempt.paymentId)
    return
  }

  // Look up gym name for display
  let gymName = ''
  if (attempt.gymId) {
    const gymSnap = await db.collection('gyms').doc(attempt.gymId).get()
    if (gymSnap.exists) {
      gymName = gymSnap.data().name || ''
    }
  }

  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const initials = gymName ? gymName.substring(0, 2).toUpperCase() : 'IP'

  const paymentRecord = {
    gymId: attempt.gymId || 'default',
    memberId: attempt.subscriptionId || '',
    member: gymName || 'Subscription',
    memberName: gymName || 'Subscription',
    plan: attempt.plan || 'Standard',
    amount: Number(attempt.finalAmount) || 0,
    paid: Number(attempt.finalAmount) || 0,
    status: 'Paid',
    method: 'PhonePe',
    due: dateStr,
    paidOn: dateStr,
    avatar: initials,
    paymentId: attempt.paymentId,
    transactionId: phonePeTransactionId || attempt.phonePeTransactionId || null,
    subscriptionId: attempt.subscriptionId || null,
    paymentType: attempt.type || 'new',
    createdAt: new Date().toISOString(),
  }

  const paymentRef = db.collection('payments').doc()
  transaction.set(paymentRef, paymentRecord)

  console.log('Payment record created:', attempt.paymentId, attempt.plan, attempt.finalAmount)
}

// ─────────────────────────────────────────────
// PAYMENTS COLLECTION SYNC
// ─────────────────────────────────────────────

/**
 * Create a record in the `payments` collection from a successful PhonePe payment attempt.
 * This ensures revenue reports, dashboards, and payment history include PhonePe transactions.
 *
 * Uses `attempt.paymentId` for duplicate prevention — queries before creating.
 *
 * Field mapping (paymentAttempts → payments):
 *   attempt.finalAmount  → amount, paid (fully paid)
 *   attempt.plan         → plan
 *   'PhonePe'            → method
 *   attempt.gymId        → gymId
  *   attempt.subscriptionId → memberId (linking field)
  *   attempt.paymentId    → paymentId (unique key for dedup)
  *   'Paid'               → status
  */

/**
 * Load PhonePe config from Firebase Functions Secrets.
 * Secrets are automatically available via process.env when using defineSecret.
 * Only accessible via Admin SDK — never exposed to client.
 */
function loadPhonePeConfig() {
  const merchantId = process.env.PHONEPE_MERCHANT_ID || ''
  const saltKey = process.env.PHONEPE_SALT_KEY || ''
  const saltIndex = process.env.PHONEPE_SALT_INDEX || ''

  if (!merchantId || !saltKey || !saltIndex) {
    return null
  }

  return {
    merchantId,
    saltKey,
    saltIndex,
    currency: 'INR',
  }
}

/**
 * Validate PhonePe config fields.
 */
function validatePhonePeConfig(config) {
  const errors = []
  if (!config.merchantId || config.merchantId.trim() === '') errors.push('Merchant ID required')
  if (!config.saltKey || config.saltKey.trim() === '') errors.push('Salt Key required')
  if (!config.saltIndex || config.saltIndex.trim() === '') errors.push('Salt Index required')
  else if (isNaN(Number(config.saltIndex))) errors.push('Salt Index must be a number')
  return { valid: errors.length === 0, errors }
}

// ─────────────────────────────────────────────
// PHONEPE CRYPTO (server-side)
// ─────────────────────────────────────────────

/**
 * Generate PhonePe V1 payment checksum.
 * SHA-256( base64Payload + "/pg/v1/pay" + saltKey ) + "###" + saltIndex
 */
function generateChecksum(base64Payload, endpoint, saltKey, saltIndex) {
  const hash = crypto.createHash('sha256')
  hash.update(base64Payload + endpoint + saltKey)
  const hashHex = hash.digest('hex')
  return `${hashHex}###${saltIndex}`
}

/**
 * Generate PhonePe V1 status checksum.
 * SHA-256( "/pg/v1/status/" + merchantId + merchantTransactionId + saltKey ) + "###" + saltIndex
 */
function generateStatusChecksum(merchantId, merchantTransactionId, saltKey, saltIndex) {
  const endpoint = `/pg/v1/status/${merchantId}/${merchantTransactionId}`
  const hash = crypto.createHash('sha256')
  hash.update(endpoint + saltKey)
  const hashHex = hash.digest('hex')
  return `${hashHex}###${saltIndex}`
}

/**
 * Generate a unique merchantTransactionId for PhonePe.
 * Format: IP{timestamp}{random4} (alphanumeric, max 35 chars).
 */
function generateMerchantTransactionId() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  const id = `IP${ts}${rand}`
  return id.substring(0, 35)
}

/**
 * Determine PhonePe API endpoint (sandbox vs production).
 */
function getPhonePeApiEndpoint(merchantId) {
  const isSandbox = merchantId && merchantId.startsWith('PGTEST')
  if (isSandbox) {
    return {
      pay: 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay',
      status: (mid, mtx) => `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${mid}/${mtx}`,
    }
  }
  return {
    pay: 'https://api.phonepe.com/apis/hermes/pg/v1/pay',
    status: (mid, mtx) => `https://api.phonepe.com/apis/hermes/pg/v1/status/${mid}/${mtx}`,
  }
}

// ─────────────────────────────────────────────
// FIRESTORE PERSISTENCE
// ─────────────────────────────────────────────

/**
 * Save a payment attempt to Firestore.
 */
async function savePaymentAttempt(data) {
  const docRef = await db.collection('paymentAttempts').add({
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return docRef.id
}

/**
 * Update a payment attempt in Firestore.
 */
async function updatePaymentAttempt(docId, updates) {
  const allowed = {}
  if (updates.status !== undefined) {
    if (!VALID_STATUSES.includes(updates.status)) {
      throw new Error(`Invalid status: ${updates.status}`)
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

  allowed.updatedAt = new Date().toISOString()
  await db.collection('paymentAttempts').doc(docId).update(allowed)
}

/**
 * Read a payment attempt from Firestore.
 */
async function getPaymentAttempt(docId) {
  const snap = await db.collection('paymentAttempts').doc(docId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...snap.data() }
}

// ─────────────────────────────────────────────
// HTTP FUNCTIONS
// ─────────────────────────────────────────────

/**
 * createPayment — Callable Cloud Function.
 *
 * Receives payment params from frontend (no credentials).
 * Loads PhonePe config server-side, generates checksum, calls PhonePe API.
 * Returns { attemptId, redirectUrl, error }.
 */
exports.createPayment = onCall({ 
  secrets: [PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (request) => {
  // Verify authentication
  if (!request.auth) {
    return { attemptId: null, redirectUrl: null, error: 'Authentication required' }
  }

  const {
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
  } = request.data

  // Validate required payment parameters
  if (!finalAmount || Number(finalAmount) <= 0) {
    return { attemptId: null, redirectUrl: null, error: 'Invalid amount: finalAmount must be positive' }
  }
  if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
    return { attemptId: null, redirectUrl: null, error: 'Invalid phone number: must be 10 digits' }
  }
  if (!redirectUrl) {
    return { attemptId: null, redirectUrl: null, error: 'redirectUrl is required' }
  }
  if (type === 'renewal' || type === 'upgrade') {
    if (!subscriptionId) {
      return { attemptId: null, redirectUrl: null, error: 'subscriptionId is required for renewal/upgrade' }
    }
  }
  if (!gymId) {
    return { attemptId: null, redirectUrl: null, error: 'gymId is required' }
  }
  if (callbackUrl && !/^https?:\/\//.test(callbackUrl)) {
    return { attemptId: null, redirectUrl: null, error: 'callbackUrl must be a valid HTTP/HTTPS URL' }
  }

  // 1. Load and validate PhonePe config (server-side only)
  const config = await loadPhonePeConfig()
  if (!config || !config.merchantId || !config.saltKey || !config.saltIndex) {
    return {
      attemptId: null,
      redirectUrl: null,
      error: 'PhonePe is not configured. Please set Merchant ID, Salt Key, and Salt Index in Billing Settings.',
    }
  }

  const validation = validatePhonePeConfig(config)
  if (!validation.valid) {
    return {
      attemptId: null,
      redirectUrl: null,
      error: `PhonePe config errors: ${validation.errors.join(', ')}`,
    }
  }

  // 2. Check for existing pending payment attempt for this subscription (idempotency)
  if (subscriptionId) {
    const existingAttempts = await db.collection('paymentAttempts')
      .where('subscriptionId', '==', subscriptionId)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
    if (!existingAttempts.empty) {
      const existing = existingAttempts.docs[0].data()
      return {
        attemptId: existingAttempts.docs[0].id,
        redirectUrl: existing.redirectUrl,
        error: null,
      }
    }
  }

  // 3. Generate merchantTransactionId
  const merchantTransactionId = generateMerchantTransactionId()

  // 3. Build PhonePe payload
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

  const payloadJson = JSON.stringify(payload)
  const base64Payload = Buffer.from(payloadJson).toString('base64')

  // 4. Generate checksum (server-side)
  const checksum = generateChecksum(base64Payload, '/pg/v1/pay', config.saltKey, config.saltIndex)

  // 5. Generate payment tracking ID
  const paymentId = `IP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`

  // 6. Save attempt to Firestore (status: pending)
  const attemptId = await savePaymentAttempt({
    paymentId,
    gymId: gymId || 'default',
    subscriptionId: subscriptionId || null,
    type: type || 'new',
    plan: plan || 'Standard',
    originalAmount: Number(originalAmount) || 0,
    discountAmount: Number(discountAmount) || 0,
    finalAmount: Number(finalAmount) || 0,
    currency: currency || 'INR',
    paymentMethod: paymentMethod || 'UPI',
    paymentGateway: 'PhonePe',
    status: 'pending',
    merchantTransactionId,
    transactionId: null,
    redirectUrl: null,
  })

  // 7. Call PhonePe API (server-side)
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

    const data = await response.json()

    if (!response.ok || !data.success) {
      await updatePaymentAttempt(attemptId, {
        status: 'failed',
        errorMessage: data.message || `HTTP ${response.status}`,
        rawResponse: data,
      }).catch(() => {})

      return {
        attemptId,
        redirectUrl: null,
        error: data.message || `PhonePe API error: HTTP ${response.status}`,
      }
    }

    const payRedirectUrl = data?.data?.paymentInstrument?.redirectInfo?.url || null
    const transactionId = data?.data?.transactionId || null

    // 8. Update attempt with success
    await updatePaymentAttempt(attemptId, {
      merchantTransactionId,
      transactionId,
      redirectUrl: payRedirectUrl,
      phonePeState: 'PENDING',
      rawResponse: data,
    }).catch(() => {})

    return {
      attemptId,
      redirectUrl: payRedirectUrl,
      error: null,
    }
  } catch (fetchError) {
    await updatePaymentAttempt(attemptId, {
      status: 'failed',
      errorMessage: fetchError.message || 'Network request failed',
      rawResponse: null,
    }).catch(() => {})

    return {
      attemptId,
      redirectUrl: null,
      error: fetchError.message || 'Failed to call PhonePe API',
    }
  }
})

/**
 * verifyPayment — Callable Cloud Function.
 *
 * Receives attemptId from frontend.
 * Checks PhonePe payment status server-side, updates Firestore.
 * Returns { status, error }.
 */
exports.verifyPayment = onCall({ 
  secrets: [PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (request) => {
  if (!request.auth) {
    return { status: null, error: 'Authentication required' }
  }

  const { attemptId } = request.data
  if (!attemptId) {
    return { status: null, error: 'attemptId is required' }
  }

  const attempt = await getPaymentAttempt(attemptId)
  if (!attempt) return { status: null, error: 'Payment attempt not found' }
  if (attempt.status !== 'pending') return { status: attempt.status, error: null }

  const config = await loadPhonePeConfig()
  if (!config || !config.merchantId || !config.saltKey || !config.saltIndex) {
    return { status: attempt.status, error: 'PhonePe not configured' }
  }

  const endpoints = getPhonePeApiEndpoint(config.merchantId)
  const statusUrl = endpoints.status(config.merchantId, attempt.merchantTransactionId)

  const checksum = generateStatusChecksum(
    config.merchantId,
    attempt.merchantTransactionId,
    config.saltKey,
    config.saltIndex
  )

  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': config.merchantId,
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      return { status: attempt.status, error: data.message || `HTTP ${response.status}` }
    }

    const state = data?.data?.state || null
    const phonePeTransactionId = data?.data?.transactionId || null

    const stateMap = {
      'COMPLETED': 'success',
      'PAYMENT_SUCCESS': 'success',
      'FAILED': 'failed',
      'PAYMENT_FAILED': 'failed',
      'EXPIRED': 'cancelled',
      'PENDING': 'pending',
    }
    const newStatus = stateMap[state] || attempt.status

    if (newStatus !== attempt.status) {
      await updatePaymentAttempt(attemptId, {
        status: newStatus,
        phonePeState: state,
        phonePeTransactionId,
      }).catch(() => {})

      // Fulfill subscription on successful payment
      if (newStatus === 'success') {
        await fulfillSubscriptionPayment(attempt, phonePeTransactionId).catch(err => {
          console.error('verifyPayment: failed to fulfill subscription', attempt.subscriptionId, err)
        })
      }
    }

    return { status: newStatus, error: null }
  } catch (fetchError) {
    return { status: attempt.status, error: fetchError.message || 'Network request failed' }
  }
})

/**
 * phonePeCallback — Raw HTTP Cloud Function.
 *
 * PhonePe sends payment status updates to this webhook URL.
 * Verifies the callback checksum, updates the payment attempt in Firestore.
 * Must return 200 OK within 30 seconds or PhonePe will retry.
 */
exports.phonePeCallback = onRequest({ 
  secrets: [PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // BUGFIX: PhonePe sends the callback payload under key 'response', not 'request'
      const { response } = req.body
      if (!response) {
        res.status(400).json({ error: 'Missing response body' })
        return
      }

      // Decode base64 response body
      const decodedJson = Buffer.from(response, 'base64').toString('utf-8')
      const callbackData = JSON.parse(decodedJson)

      const { merchantTransactionId, transactionId, state, responseCode, amount } = callbackData

      if (!merchantTransactionId) {
        console.error('PhonePe callback: missing merchantTransactionId')
        res.status(200).json({ success: true })
        return
      }

      // Load PhonePe config for checksum verification
      let config
      try {
        config = await loadPhonePeConfig()
      } catch (configErr) {
        console.error('PhonePe callback: failed to load config', configErr)
        res.status(200).json({ success: true })
        return
      }
      if (!config || !config.saltKey) {
        console.error('PhonePe callback: config not loaded')
        res.status(200).json({ success: true })
        return
      }

      // Verify checksum (X-VERIFY from PhonePe header)
      const xVerify = req.headers['x-verify'] || ''
      const [receivedChecksum, saltIdx] = xVerify.split('###')

      // Build expected checksum string
      // Format: base64DecodedResponse + /pg/v1/status/ + merchantId + merchantTransactionId + saltKey
      const responseString = decodedJson + '/pg/v1/status/' + config.merchantId + merchantTransactionId + config.saltKey
      const expectedHash = crypto.createHash('sha256').update(responseString).digest('hex')
      const expectedChecksum = `${expectedHash}###${saltIdx || config.saltIndex}`

      // Compare full checksum (hash + saltIndex suffix)
      if (receivedChecksum !== expectedChecksum) {
        console.error('PhonePe callback: checksum mismatch', { received: receivedChecksum, expected: expectedChecksum })
        res.status(200).json({ success: true })
        return
      }

      // Find the payment attempt by merchantTransactionId
      const attemptsRef = db.collection('paymentAttempts')
      const q = await attemptsRef.where('merchantTransactionId', '==', merchantTransactionId).limit(1).get()

      if (q.empty) {
        console.error('PhonePe callback: attempt not found for', merchantTransactionId)
        res.status(200).json({ success: true })
        return
      }

      const attemptDoc = q.docs[0]
      const attempt = attemptDoc.data()

      // BUGFIX: amount verification moved AFTER attempt is defined
      if (amount && attempt.finalAmount && Number(amount) !== Number(attempt.finalAmount)) {
        console.error('PhonePe callback: amount mismatch', { 
          merchantTransactionId,
          received: amount, 
          expected: attempt.finalAmount 
        })
        res.status(200).json({ success: true })
        return
      }

      if (attempt.status !== 'pending') {
        // Already processed — idempotent
        res.status(200).json({ success: true })
        return
      }

      // Map PhonePe state to our status
      const stateMap = {
        'COMPLETED': 'success',
        'PAYMENT_SUCCESS': 'success',
        'FAILED': 'failed',
        'PAYMENT_FAILED': 'failed',
        'EXPIRED': 'cancelled',
        'PENDING': 'pending',
      }
      const newStatus = stateMap[state] || attempt.status

      // Update Firestore
      await attemptDoc.ref.update({
        status: newStatus,
        phonePeState: state,
        phonePeTransactionId: transactionId,
        responseCode,
        callbackAmount: amount,
        updatedAt: new Date().toISOString(),
      })

      // Fulfill subscription on successful payment
      if (newStatus === 'success') {
        await fulfillSubscriptionPayment({ ...attempt, id: attemptDoc.id }, transactionId).catch(err => {
          console.error('phonePeCallback: failed to fulfill subscription', attempt.subscriptionId, err)
        })
      }

      console.log('PhonePe callback processed:', { merchantTransactionId, state, newStatus })

      res.status(200).json({ success: true })
    } catch (error) {
      console.error('PhonePe callback error:', error)
      // Return 200 to prevent PhonePe from retrying — never expose error details to caller
      res.status(200).json({ success: true })
    }
  })

// ─────────────────────────────────────────────
// USER PROFILE BACKFILL
// ─────────────────────────────────────────────

/**
 * Backfill missing users/{uid} Firestore documents for orphaned Auth users.
 *
 * This is a safe, one-time migration.  It iterates every Firebase Auth user
 * and, for any whose `users/{uid}` Firestore document is missing, attempts
 * to recover the profile from the `members` or `trainers` collection.
 *
 * Only admin users can invoke this function.
 *
 * Response: { backfilled: number, skipped: number, errors: number }
 */
exports.backfillMissingProfiles = onCall({
  timeoutSeconds: 300,
  memory: '256MiB',
}, async (request) => {
  // Only admins can trigger a backfill
  if (!request.auth) {
    return { error: 'Authentication required', backfilled: 0, skipped: 0, errors: 0 }
  }
  const callerRef = await db.collection('users').doc(request.auth.uid).get()
  if (!callerRef.exists || callerRef.data().role !== 'admin') {
    return { error: 'Admin role required', backfilled: 0, skipped: 0, errors: 0 }
  }

  let backfilled = 0
  let skipped = 0
  let errors = 0

  try {
    // Paginate through all Auth users (1000 per page is the max)
    let nextPageToken
    do {
      const listResult = await getAuth().listUsers(1000, nextPageToken)
      nextPageToken = listResult.pageToken

      for (const authUser of listResult.users) {
        try {
          const uid = authUser.uid
          const email = authUser.email || ''

          // Check if users/{uid} already exists
          const userSnap = await db.collection('users').doc(uid).get()
          if (userSnap.exists) {
            skipped++
            continue
          }

          // Try to recover from members collection
          const membersSnap = await db.collection('members')
            .where('authUid', '==', uid)
            .limit(1)
            .get()

          if (!membersSnap.empty) {
            const m = membersSnap.docs[0].data()
            await db.collection('users').doc(uid).set({
              uid,
              email: email || m.email || '',
              name: m.name || '',
              role: 'member',
              gymId: m.gymId || 'default',
              createdAt: new Date().toISOString(),
            })
            backfilled++
            continue
          }

          // Try to recover from trainers collection
          const trainersSnap = await db.collection('trainers')
            .where('authUid', '==', uid)
            .limit(1)
            .get()

          if (!trainersSnap.empty) {
            const t = trainersSnap.docs[0].data()
            await db.collection('users').doc(uid).set({
              uid,
              email: email || t.email || '',
              name: t.name || '',
              role: 'trainer',
              gymId: t.gymId || 'default',
              createdAt: new Date().toISOString(),
            })
            backfilled++
            continue
          }

          // Try to recover from gyms collection (gym owners)
          const gymsSnap = await db.collection('gyms')
            .where('ownerUid', '==', uid)
            .limit(1)
            .get()

          if (!gymsSnap.empty) {
            const g = gymsSnap.docs[0].data()
            const status = g.approvalStatus || 'pending'
            const role = status === 'approved'  ? 'gym_owner'
                       : status === 'suspended' ? 'gym_owner'  // suspension is at gym level
                       : status === 'rejected'  ? 'rejected'
                       : status === 'pending'   ? 'gym_owner_pending'
                                                : 'gym_owner_pending'
            await db.collection('users').doc(uid).set({
              uid,
              email: email || g.email || '',
              name: g.ownerName || g.name || '',
              role,
              gymId: g.gymId || uid || 'default',
              createdAt: new Date().toISOString(),
            })
            backfilled++
            continue
          }

          // Auth user has no matching member/trainer/gym owner record.
          // Admins have no companion collection — they are never auto-recovered.
          skipped++
        } catch (userErr) {
          console.error('backfillMissingProfiles: error processing user', authUser.uid, userErr)
          errors++
        }
      }
    } while (nextPageToken)

    return { backfilled, skipped, errors, error: null }
  } catch (err) {
    console.error('backfillMissingProfiles error:', err)
    return { error: err.message, backfilled, skipped, errors }
  }
})
