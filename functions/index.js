// functions/index.js
//
// Firebase Cloud Functions for IRONPULSE PhonePe payment integration.
// All sensitive operations (checksum generation, PhonePe API calls) happen here — never in the browser.

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
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
// CASHFREE SECRETS (managed via Firebase CLI)
// ─────────────────────────────────────────────
// Set with: firebase functions:secrets:set CASHFREE_CLIENT_ID
//           firebase functions:secrets:set CASHFREE_CLIENT_SECRET
//           firebase functions:secrets:set CASHFREE_MODE   (optional: 'sandbox'|'production', default 'sandbox')

const CASHFREE_CLIENT_ID = defineSecret('CASHFREE_CLIENT_ID')
const CASHFREE_CLIENT_SECRET = defineSecret('CASHFREE_CLIENT_SECRET')
const CASHFREE_MODE = defineSecret('CASHFREE_MODE')

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
      // Upgrade: apply the new plan from the payment attempt, recalculate dates + amounts,
      // extending from the current expiry if still active.
      const newPlan = attempt.plan || sub.plan
      const duration = PLAN_DURATIONS[newPlan] || 30
      const currentExpiry = sub.expiryDate ? new Date(sub.expiryDate) : null
      const expiryBase = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now
      const expiryDate = new Date(expiryBase)
      expiryDate.setDate(expiryDate.getDate() + duration)
      const graceEnd = new Date(expiryDate)
      graceEnd.setDate(graceEnd.getDate() + 5)

      updateFields.status = 'active'
      updateFields.plan = newPlan
      updateFields.planType = newPlan
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

    // ── Sync gym subscription field ─────────────────────
    if (attempt.gymId) {
      const gymRef = db.collection('gyms').doc(attempt.gymId)
      const gymSnap = await transaction.get(gymRef)
      if (gymSnap.exists) {
        const gymData = gymSnap.data()
        const existingSub = gymData.subscription || {}
        const newExpiry = updateFields.expiryDate || existingSub.expiryDate
        transaction.update(gymRef, {
          'subscription.planId': updateFields.planType || existingSub.planType,
          'subscription.planName': updateFields.plan || existingSub.planName,
          'subscription.planType': updateFields.planType || existingSub.planType,
          'subscription.status': updateFields.status || 'active',
          'subscription.paymentStatus': 'paid',
          'subscription.startDate': updateFields.startDate || existingSub.startDate || now.toISOString().split('T')[0],
          'subscription.expiryDate': newExpiry || existingSub.expiryDate,
          'subscription.amount': (attempt.finalAmount || 0) / 100,
          'subscription.currency': 'INR',
          'subscription.renewalCount': (existingSub.renewalCount || 0) + (attempt.type === 'renewal' ? 1 : 0),
          'subscription.lastPaymentId': attempt.paymentId || '',
          'subscription.lastTransactionId': phonePeTransactionId || attempt.phonePeTransactionId || '',
          'subscription.updatedAt': now.toISOString(),
        })

        // ── Create subscription history record ────────
        const historyRef = db.collection('subscriptionHistory').doc()
        transaction.set(historyRef, {
          gymId: attempt.gymId,
          planId: updateFields.planType || existingSub.planType || '',
          planName: updateFields.plan || existingSub.planName || '',
          amount: (attempt.finalAmount || 0) / 100,
          currency: 'INR',
          status: updateFields.status || 'active',
          paymentId: attempt.paymentId || '',
          transactionId: phonePeTransactionId || attempt.phonePeTransactionId || '',
          startDate: updateFields.startDate || existingSub.startDate || '',
          expiryDate: newExpiry || existingSub.expiryDate || '',
          createdAt: now.toISOString(),
          createdBy: 'system',
          action: attempt.type === 'renewal' ? 'renewed' : attempt.type === 'upgrade' ? 'upgraded' : 'activated',
        })
      }
    }

  }).catch(err => {
    console.error('fulfillSubscriptionPayment: transaction failed', attempt.subscriptionId, err)
    throw err
  })

  // ── Payment success notifications (fire-and-forget, outside transaction) ──
  // Completes the production flow: payments → subscriptionHistory → gym
  // subscription → notifications → invoice. Single shared choke point — both
  // PhonePe and Cashfree get it with zero duplicated fulfillment logic.
  notifyPaymentSuccess(attempt).catch(err => {
    console.error('fulfillSubscriptionPayment: payment notification failed', err)
  })

  // ── Issue referral reward (non-blocking, outside transaction) ──
  if (!attempt.gymId) {
    issueReferralReward(attempt, phonePeTransactionId).catch(err => {
      console.error('fulfillSubscriptionPayment: issueReferralReward failed', err)
    })
  }
}

/**
 * Create a payment record within a Firestore transaction.
 * Ensures atomicity with subscription fulfillment.
 */
async function createPaymentRecordInTransaction(transaction, attempt, phonePeTransactionId) {
  if (!attempt.paymentId) return

  // Use paymentId as the document key for natural idempotency:
  // if two callers race, the second transaction.set overwrites with the same data.
  const paymentRef = db.collection('payments').doc(attempt.paymentId)
  const existing = await transaction.get(paymentRef)
  if (existing.exists) return

  // Look up gym name for display
  let gymName = ''
  if (attempt.gymId) {
    const gymSnap = await db.collection('gyms').doc(attempt.gymId).get()
    if (gymSnap.exists) {
      gymName = gymSnap.data().gymName || gymSnap.data().name || ''
    }
  }

  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const initials = gymName ? gymName.substring(0, 2).toUpperCase() : 'IP'

  // Generate a unique invoice number
  const datePart = dateStr.replace(/-/g, '')
  const randPart = crypto.randomBytes(2).toString('hex').toUpperCase()
  const invoiceNo = `INV-${datePart}-${randPart}`

  // Convert paise to rupees for consistent payment collection storage
  const finalAmountRupees = Number((Number(attempt.finalAmount) / 100).toFixed(2)) || 0

  const paymentRecord = {
    invoiceNo,
    gymId: attempt.gymId || 'default',
    memberId: attempt.subscriptionId || '',
    authUid: attempt.authUid || '',
    member: gymName || 'Subscription',
    memberName: gymName || 'Subscription',
    plan: attempt.plan || 'Standard',
    amount: finalAmountRupees,
    paid: finalAmountRupees,
    status: 'Paid',
    method: attempt.paymentMethod || 'PhonePe',
    paymentGateway: attempt.paymentGateway || 'PhonePe',
    due: dateStr,
    paidOn: dateStr,
    avatar: initials,
    paymentId: attempt.paymentId,
    transactionId: phonePeTransactionId || attempt.phonePeTransactionId || null,
    subscriptionId: attempt.subscriptionId || null,
    paymentType: attempt.type || 'new',
    createdAt: new Date().toISOString(),
  }

  transaction.set(paymentRef, paymentRecord)

}

/**
 * Send payment-success notifications after a gateway payment is fulfilled.
 * Fire-and-forget (never breaks the payment flow); deduplicated per attempt
 * (single-field query on relatedDocumentId == attempt.paymentId, which is
 * unique per attempt — no composite index needed) so concurrent webhook +
 * verify calls never double-notify. Mirrors the referral notification
 * pattern in issueReferralReward (schema + gym admin / super admin routing).
 */
async function notifyPaymentSuccess(attempt) {
  if (!attempt.gymId || !attempt.paymentId) return

  const existing = await db.collection('notifications')
    .where('relatedDocumentId', '==', attempt.paymentId)
    .limit(1)
    .get()
  if (!existing.empty) return

  const amountRupees = Number((Number(attempt.finalAmount || 0) / 100).toFixed(2))
  const planName = attempt.plan || 'Subscription'
  const now = new Date()
  const base = {
    gymId: attempt.gymId,
    type: 'subscription',
    subtype: 'sub_payment_success',
    priority: 'high',
    icon: '💳',
    actionUrl: '/subscriptions',
    relatedDocumentId: attempt.paymentId,
    read: false,
    createdAt: now.toISOString(),
  }

  const notifPromises = []

  // Gym admins / owners of the gym
  try {
    const adminSnap = await db.collection('users')
      .where('gymId', '==', attempt.gymId)
      .where('role', 'in', ['admin', 'gym_admin', 'gym_owner'])
      .get()
    adminSnap.forEach(doc => {
      const u = doc.data()
      notifPromises.push(
        db.collection('notifications').add({
          ...base,
          userId: u.uid || doc.id,
          role: u.role || 'admin',
          title: 'Payment Received',
          message: `Payment of ₹${amountRupees} for ${planName} subscription was received successfully.`,
        }).catch(err => console.error('notifyPaymentSuccess: gym admin notification error', err))
      )
    })
  } catch (notifErr) {
    console.error('notifyPaymentSuccess: gym admin query error', notifErr)
  }

  // Platform super admins (low priority)
  try {
    const superAdminSnap = await db.collection('users').where('role', '==', 'super_admin').get()
    superAdminSnap.forEach(doc => {
      const u = doc.data()
      notifPromises.push(
        db.collection('notifications').add({
          ...base,
          gymId: 'platform',
          userId: u.uid || doc.id,
          role: 'super_admin',
          title: 'Gym Payment Received',
          message: `Payment of ₹${amountRupees} received from gym ${attempt.gymId} (${planName}).`,
          priority: 'low',
        }).catch(err => console.error('notifyPaymentSuccess: super admin notification error', err))
      )
    })
  } catch (notifErr) {
    console.error('notifyPaymentSuccess: super admin query error', notifErr)
  }

  await Promise.all(notifPromises)
}

/**
 * Issue referral reward after a successful first subscription payment.
 * Called from fulfillSubscriptionPayment for member-level payment attempts.
 *
 * Flow:
 *   1️⃣ Check referral     — does the referred user have a referredBy code?
 *   2️⃣ Check first payment — is this the first successful payment for this user?
 *   3️⃣ Check reward        — has a reward already been issued for this referral?
 *   4️⃣ Create referral     — write referral record (status=Qualified)
 *   5️⃣ Issue reward        — create wallet/discount record
 *   6️⃣ Update referral     — set status=Rewarded, rewardIssued=true
 *   7️⃣ Commit              — all writes complete
 */
async function issueReferralReward(attempt, phonePeTransactionId) {
  try {
    // ─── 1️⃣ CHECK REFERRAL ────────────────────────────────
    // Uses referredUid as referral doc ID for natural idempotency
    // Only process member-level payments (skip gym subscription payments)
    if (!attempt.subscriptionId || attempt.gymId) return

    // Derive the referred user's authUid:
    //   - From the attempt directly (authUid / referredUid) OR
    //   - Look up the member doc from the subscriptionId
    let referredUid = attempt.authUid || attempt.referredUid || ''
    if (!referredUid && attempt.subscriptionId) {
      try {
        const memberSnap = await db.collection('members').doc(attempt.subscriptionId).get()
        if (memberSnap.exists) {
          referredUid = memberSnap.data().authUid || ''
        }
      } catch (_) {}
    }
    if (!referredUid) return

    const referredUserSnap = await db.collection('users').doc(referredUid).get()
    if (!referredUserSnap.exists) return

    const referredUser = referredUserSnap.data()
    const referralCode = referredUser.referredBy || ''
    if (!referralCode) return

    const referrerSnap = await db.collection('users').where('referralCode', '==', referralCode).get()
    if (referrerSnap.empty) return
    const referrer = referrerSnap.docs[0].data()
    const referrerUid = referrer.uid

    // Anti-fraud: cannot refer yourself
    if (referrerUid === referredUid) return

    // ─── 2️⃣ CHECK FIRST PAYMENT ────────────────────────────
    // Count existing paid payment records for this user to verify it's their first
    const paymentQuery = await db.collection('payments')
      .where('authUid', '==', referredUid)
      .where('status', '==', 'Paid')
      .get()
    // If they already have at least one paid record (not counting this one), skip
    if (paymentQuery.size > 1) return

    // ─── 3️⃣ CHECK REWARD NOT ALREADY ISSUED ────────────────
    // A Pending referral (created by onReferralSignup at signup) is allowed —
    // the transactions below upgrade it to Rewarded, preserving createdAt.
    // Only an already-issued (Rewarded) referral blocks a second reward.
    const existingRefSnap = await db.collection('referrals')
      .where('referredUid', '==', referredUid)
      .get()
    if (!existingRefSnap.empty) {
      const hasRewarded = existingRefSnap.docs.some(d => d.data().status === 'Rewarded')
      if (hasRewarded) return
    }

    // ─── 4️⃣ LOAD REFERRAL SETTINGS ─────────────────────────
    const settingsSnap = await db.collection('settings').doc('referralSettings').get()
    const settings = settingsSnap.exists ? settingsSnap.data() : {}
    if (settings.enabled === false) return

    const rewardAmount = Number(settings.rewardAmount) || 100
    const rewardMode = settings.rewardMode || 'Wallet'

    // ─── 5️⃣ ANTI-FRAUD CHECKS ───────────────────────────────

    // a) Referrer's user doc exists and isn't deleted
    if (referrer.status === 'deleted' || referrer.deleted === true) {
      console.error('issueReferralReward: anti-fraud (a) referrer deleted', { referrerUid })
      return
    }

    // b) Referred user's membership is not cancelled
    try {
      const memberDoc = await db.collection('members').doc(attempt.subscriptionId).get()
      const memberData = memberDoc.exists ? memberDoc.data() : null
      if (memberData && (memberData.status === 'cancelled' || memberData.membershipStatus === 'cancelled')) {
        console.error('issueReferralReward: anti-fraud (b) membership cancelled', { subscriptionId: attempt.subscriptionId })
        return
      }
    } catch (memErr) {
      console.error('issueReferralReward: anti-fraud (b) membership lookup error', memErr)
    }

    // c) Campaign hasn't expired
    if (settings.expiryDate) {
      const expiry = new Date(settings.expiryDate)
      if (expiry < new Date()) {
        console.error('issueReferralReward: anti-fraud (c) campaign expired', { expiryDate: settings.expiryDate })
        return
      }
    }

    // d) Referrer hasn't hit max rewards
    if (settings.maxRewardsPerUser) {
      const maxRewards = Number(settings.maxRewardsPerUser)
      try {
        const rewardedRefSnap = await db.collection('referrals')
          .where('referrerUid', '==', referrerUid)
          .where('status', '==', 'Rewarded')
          .get()
        if (rewardedRefSnap.size >= maxRewards) {
          console.error('issueReferralReward: anti-fraud (d) max rewards reached', { referrerUid, count: rewardedRefSnap.size, max: maxRewards })
          return
        }
      } catch (countErr) {
        console.error('issueReferralReward: anti-fraud (d) count error', countErr)
      }
    }

    // e) Not a second payment — exclude the current transaction
    try {
      const allPayments = await db.collection('payments')
        .where('authUid', '==', referredUid)
        .where('status', '==', 'Paid')
        .get()
      let otherCount = allPayments.size
      if (attempt.paymentId) {
        const hasCurrent = allPayments.docs.some(d => d.data().paymentId === attempt.paymentId)
        if (hasCurrent) otherCount = Math.max(0, otherCount - 1)
      }
      if (otherCount >= 1) {
        console.error('issueReferralReward: anti-fraud (e) second payment', { referredUid, otherCount })
        return
      }
    } catch (payErr) {
      console.error('issueReferralReward: anti-fraud (e) payment count error', payErr)
    }

    // f) Payment attempt wasn't refunded
    try {
      if (attempt.paymentId) {
        const attemptRefundQuery = await db.collection('paymentAttempts')
          .where('paymentId', '==', attempt.paymentId)
          .limit(1)
          .get()
        if (!attemptRefundQuery.empty) {
          const pa = attemptRefundQuery.docs[0].data()
          if (pa.status === 'refunded' || pa.phonePeState === 'REFUNDED') {
            console.error('issueReferralReward: anti-fraud (f) payment refunded', { paymentId: attempt.paymentId })
            return
          }
        }
      }
    } catch (refundErr) {
      console.error('issueReferralReward: anti-fraud (f) refund check error', refundErr)
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 2 — ATOMIC TRANSACTION (referral + reward creation)
    // Uses referredUid as doc ID for natural idempotency:
    //   if a referral doc already exists for this user, the set() is a no-op.
    // ════════════════════════════════════════════════════════════

    const now = new Date()
    const gymId = referredUser.gymId || 'default'

    const referralData = {
      referrerUid,
      referredUid,
      referralCode,
      gymId,
      status: 'Rewarded',
      rewardType: rewardMode,
      rewardValue: rewardAmount,
      rewardIssued: true,
      firstPaymentId: attempt.paymentId || '',
      createdAt: now.toISOString(),
      qualifiedAt: now.toISOString(),
      rewardedAt: now.toISOString(),
      paymentId: attempt.paymentId || '',
    }

    if (rewardMode === 'Discount') {
      const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase()
      const couponCode = `REF-${referredUid.slice(0, 4).toUpperCase()}-${randomPart}`
      const couponExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      const couponId = db.collection('discountCoupons').doc().id

      referralData.rewardRef = couponId
      referralData.couponCode = couponCode

      await db.runTransaction(async (transaction) => {
        const referralRef = db.collection('referrals').doc(referredUid)
        const existing = await transaction.get(referralRef)
        if (existing.exists && existing.data().status === 'Rewarded') return
        if (existing.exists && existing.data().createdAt) referralData.createdAt = existing.data().createdAt
        transaction.set(referralRef, referralData)
        transaction.set(db.collection('discountCoupons').doc(couponId), {
          code: couponCode,
          type: 'referral',
          rewardValue: rewardAmount,
          referrerUid,
          referredUid,
          userId: referredUid,
          referralId: referredUid,
          gymId,
          status: 'active',
          expiryDate: couponExpiry,
          minSubscription: settings.minimumSubscription || null,
          usedAt: null,
          usedBy: null,
          createdAt: now.toISOString(),
        })
      })
    } else if (rewardMode === 'Extension') {
      const extensionDays = Number(settings.extensionDays) || 30
      const rewardId = db.collection('rewardLedger').doc().id

      referralData.rewardRef = rewardId

      await db.runTransaction(async (transaction) => {
        const referralRef = db.collection('referrals').doc(referredUid)
        const existing = await transaction.get(referralRef)
        if (existing.exists && existing.data().status === 'Rewarded') return
        if (existing.exists && existing.data().createdAt) referralData.createdAt = existing.data().createdAt
        transaction.set(referralRef, referralData)
        transaction.set(db.collection('rewardLedger').doc(rewardId), {
          type: 'membership_extension',
          rewardType: rewardMode,
          rewardValue: rewardAmount,
          extensionDays,
          referrerUid,
          referredUid,
          userId: referredUid,
          referralId: referredUid,
          gymId,
          status: 'pending',
          issuedAt: now.toISOString(),
          description: `Membership extension of ${extensionDays} days from referral reward`,
        })
      })
    } else {
      // Default: Wallet mode
      const rewardId = db.collection('rewardLedger').doc().id

      referralData.rewardRef = rewardId

      await db.runTransaction(async (transaction) => {
        const referralRef = db.collection('referrals').doc(referredUid)
        const existing = await transaction.get(referralRef)
        if (existing.exists && existing.data().status === 'Rewarded') return
        if (existing.exists && existing.data().createdAt) referralData.createdAt = existing.data().createdAt
        transaction.set(referralRef, referralData)
        transaction.set(db.collection('rewardLedger').doc(rewardId), {
          type: 'wallet_credit',
          rewardType: rewardMode,
          rewardValue: rewardAmount,
          referrerUid,
          referredUid,
          userId: referredUid,
          gymId,
          status: 'available',
          issuedAt: now.toISOString(),
          description: `Referral reward of ₹${rewardAmount} credited to wallet`,
        })
      })
    }

    // ════════════════════════════════════════════════════════════
    // PHASE 3 — NOTIFICATIONS (fire-and-forget, outside transaction)
    // ════════════════════════════════════════════════════════════

    const notifPromises = []

    // a) Referrer
    notifPromises.push(
      db.collection('notifications').add({
        userId: referrerUid,
        gymId,
        role: 'member',
        title: 'Referral Reward Earned!',
        message: `You earned ₹${rewardAmount} referral reward! A new member used your code.`,
        type: 'referral',
        subtype: 'referral_earned',
        priority: 'high',
        icon: '🎉',
        actionUrl: '/referral',
        relatedDocumentId: referredUid,
        read: false,
        createdAt: now.toISOString(),
      }).catch(err => console.error('issueReferralReward: referrer notification error', err))
    )

    // b) Referred user
    notifPromises.push(
      db.collection('notifications').add({
        userId: referredUid,
        gymId,
        role: 'member',
        title: 'You Qualified for a Referral!',
        message: 'Your referral qualified for a reward! Welcome to the community.',
        type: 'referral',
        subtype: 'referral_qualified',
        priority: 'normal',
        icon: '🎉',
        actionUrl: '/referral',
        relatedDocumentId: referredUid,
        read: false,
        createdAt: now.toISOString(),
      }).catch(err => console.error('issueReferralReward: referred user notification error', err))
    )

    // c) Gym admins
    try {
      const adminSnap = await db.collection('users')
        .where('gymId', '==', gymId)
        .where('role', 'in', ['admin', 'gym_admin', 'gym_owner', 'super_admin'])
        .get()
      adminSnap.forEach(doc => {
        const u = doc.data()
        notifPromises.push(
          db.collection('notifications').add({
            userId: u.uid || doc.id,
            gymId,
            role: u.role || 'admin',
            title: 'Referral Reward Issued',
            message: `A referral reward of ₹${rewardAmount} was issued for referred user.`,
            type: 'referral',
            subtype: 'referral_rewarded',
            priority: 'normal',
            icon: '🎉',
            actionUrl: '/referral',
            relatedDocumentId: referredUid,
            read: false,
            createdAt: now.toISOString(),
          }).catch(err => console.error('issueReferralReward: gym admin notification error', err))
        )
      })
    } catch (notifErr) {
      console.error('issueReferralReward: gym admin query error', notifErr)
    }

    // d) Super admins
    try {
      const superAdminSnap = await db.collection('users')
        .where('role', '==', 'super_admin')
        .get()
      superAdminSnap.forEach(doc => {
        const u = doc.data()
        notifPromises.push(
          db.collection('notifications').add({
            userId: u.uid || doc.id,
            gymId: 'platform',
            role: 'super_admin',
            title: 'Referral Reward Issued',
            message: `Referral reward of ₹${rewardAmount} issued for referred user.`,
            type: 'referral',
            subtype: 'referral_rewarded',
            priority: 'low',
            icon: '🎉',
            actionUrl: '/referral',
            relatedDocumentId: referredUid,
            read: false,
            createdAt: now.toISOString(),
          }).catch(err => console.error('issueReferralReward: super admin notification error', err))
        )
      })
    } catch (notifErr) {
      console.error('issueReferralReward: super admin query error', notifErr)
    }

    if (notifPromises.length > 0) {
      await Promise.allSettled(notifPromises)
    }

  } catch (err) {
    console.error('issueReferralReward: error', err)
  }
}

// ─────────────────────────────────────────────
// REFERRAL SIGNUP TRIGGER (server-side)
// ─────────────────────────────────────────────
// Creates the Pending referral record + notifications + audit entry when a new
// user signs up with a referredBy code. This MUST run server-side: signUp()
// signs the user out before returning, so every client-side referral write was
// permission-denied (the old AuthContext block silently failed every time).
//
// Idempotent by construction: doc ID = referred user's auth UID — the same key
// issueReferralReward uses — so a retry/duplicate run never double-creates.
exports.onReferralSignup = onDocumentCreated('users/{uid}', async (event) => {
  const uid = event.params.uid
  const user = event.data.data() || {}
  const referralCode = (user.referredBy || '').trim().toUpperCase()
  if (!referralCode || !/^IP-[A-Z0-9]{6}$/.test(referralCode)) return null

  // Gym-owner signups never qualify for member-level rewards
  // (issueReferralReward only processes member payments) — skip to keep the
  // pending list clean.
  if (user.role === 'gym_owner_pending' || user.role === 'gym_owner') return null

  try {
    const referrerSnap = await db.collection('users')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get()
    if (referrerSnap.empty) return null
    const referrer = referrerSnap.docs[0].data()
    const referrerUid = referrer.uid || referrerSnap.docs[0].id
    // Anti-fraud: cannot refer yourself
    if (referrerUid === uid) return null

    // Idempotency: never overwrite an existing referral for this user
    // (including one already upgraded to Rewarded by issueReferralReward).
    const existingRef = await db.collection('referrals').doc(uid).get()
    if (existingRef.exists) return null

    const gymId = user.gymId || referrer.gymId || 'default'
    const now = new Date().toISOString()

    await db.collection('referrals').doc(uid).set({
      referrerUid,
      referredUid: uid,
      referralCode,
      gymId,
      referredName: user.name || '',
      status: 'Pending',
      rewardType: '',
      rewardValue: 0,
      rewardIssued: false,
      firstPaymentId: '',
      expiresAt: null,
      createdAt: now,
      qualifiedAt: null,
      rewardedAt: null,
    })

    // Notifications (referrer + referred user) — fire-and-forget
    await db.collection('notifications').add({
      userId: referrerUid,
      gymId,
      role: 'member',
      title: 'Referral Registered!',
      message: `${user.name || 'Someone'} signed up using your referral code!`,
      type: 'referral',
      subtype: 'referral_registered',
      priority: 'normal',
      icon: '📋',
      actionUrl: '/referral',
      relatedDocumentId: uid,
      read: false,
      createdAt: now,
    }).catch(err => console.error('onReferralSignup: referrer notification error', err))

    await db.collection('notifications').add({
      userId: uid,
      gymId,
      role: 'member',
      title: 'Referral Applied',
      message: 'Your referral code was applied! Welcome aboard.',
      type: 'referral',
      subtype: 'referral_applied',
      priority: 'normal',
      icon: '✅',
      actionUrl: '',
      relatedDocumentId: uid,
      read: false,
      createdAt: now,
    }).catch(err => console.error('onReferralSignup: referred user notification error', err))

    // Audit entry (non-blocking)
    try {
      await db.collection('referralAuditLogs').add({
        timestamp: now,
        createdAt: now,
        action: 'REFERRAL_CREATED',
        performedBy: uid,
        targetUid: referrerUid,
        referralId: uid,
        metadata: { referralCode, referredName: user.name || '' },
      })
    } catch (auditErr) {
      console.error('onReferralSignup: audit log error', auditErr)
    }

    return null
  } catch (err) {
    console.error('onReferralSignup: error', err)
    return null
  }
})

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
// CASHFREE CONFIGURATION (server-side only)
// ─────────────────────────────────────────────

/**
 * Load Cashfree config from Firebase Secret Manager.
 * Mode (sandbox vs production) is selected server-side via the
 * CASHFREE_MODE secret — never exposed to the client.
 */
function loadCashfreeConfig() {
  const clientId = process.env.CASHFREE_CLIENT_ID || ''
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET || ''
  const mode = process.env.CASHFREE_MODE === 'production' ? 'production' : 'sandbox'

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    mode,
    apiVersion: '2023-08-01',
    baseUrl: mode === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg',
  }
}

/**
 * Generate a unique Cashfree order id.
 * Format: CF{timestamp}{random8} (alphanumeric, max 50 chars).
 */
function generateCashfreeOrderId() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `CF-${ts}-${rand}`.substring(0, 50)
}

/**
 * Cashfree REST API headers (secret stays server-side).
 */
function cashfreeHeaders(config) {
  return {
    'x-client-id': config.clientId,
    'x-client-secret': config.clientSecret,
    'x-api-version': config.apiVersion,
    'Content-Type': 'application/json',
  }
}

/**
 * Map a Cashfree order_status (Orders API) or payment_status (webhook)
 * to our canonical status: pending | success | failed | cancelled.
 */
function mapCashfreeOrderStatus(orderStatus) {
  switch (String(orderStatus || '').toUpperCase()) {
    case 'PAID':
    case 'SUCCESS':
      return 'success'
    case 'ACTIVE':
    case 'PENDING':
    case 'INITIALIZED':
      return 'pending'
    case 'CANCELLED':
    case 'USER_DROPPED':
      return 'cancelled'
    case 'FAILED':
    case 'EXPIRED':
    default:
      return 'failed'
  }
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
  if (updates.cashfreeOrderId !== undefined) allowed.cashfreeOrderId = updates.cashfreeOrderId
  if (updates.paymentSessionId !== undefined) allowed.paymentSessionId = updates.paymentSessionId
  if (updates.orderStatus !== undefined) allowed.orderStatus = updates.orderStatus
  if (updates.cashfreeTransactionId !== undefined) allowed.cashfreeTransactionId = updates.cashfreeTransactionId

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
  try {
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
    authUid,
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

  // Verify caller has an authorized role
  const callerDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!callerDoc.exists) {
    return { attemptId: null, redirectUrl: null, error: 'Caller profile not found' }
  }
  const callerRole = callerDoc.data().role
  if (!['super_admin', 'gym_admin', 'gym_owner', 'admin'].includes(callerRole)) {
    return { attemptId: null, redirectUrl: null, error: 'Insufficient permissions: only admins and gym owners can initiate payments' }
  }

  // Verify caller has access to this gym (gym ownership validation)
  if (callerRole !== 'super_admin') {
    const callerGymId = callerDoc.data().gymId
    if (!callerGymId || callerGymId !== gymId) {
      return { attemptId: null, redirectUrl: null, error: 'Access denied: you do not own this gym' }
    }
  }
  // super_admin can create payments for any gym

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

  // 6. Save attempt to Firestore (status: pending, with 30-minute expiry)
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
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
    authUid: authUid || null,
    status: 'pending',
    merchantTransactionId,
    transactionId: null,
    redirectUrl: null,
    expiresAt,
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
      }).catch(err => console.error('createPayment: failed to update attempt with error state:', err))

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
    }).catch(err => console.error('createPayment: failed to update attempt with success state:', err))

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
    }).catch(err => console.error('createPayment: failed to update attempt on fetch error:', err))

    return {
      attemptId,
      redirectUrl: null,
      error: fetchError.message || 'Failed to call PhonePe API',
    }
  }
  } catch (topErr) {
    console.error('createPayment: unhandled error', topErr)
    return { attemptId: null, redirectUrl: null, error: topErr.message || 'Internal server error' }
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
  try {
  if (!request.auth) {
    return { status: null, error: 'Authentication required' }
  }

  // Verify caller has sufficient role
  const callerDoc = await db.collection('users').doc(request.auth.uid).get()
  const callerRole = callerDoc.exists ? callerDoc.data().role : null
  if (!['super_admin', 'gym_admin', 'gym_owner', 'admin', 'trainer'].includes(callerRole)) {
    return { status: null, error: 'Insufficient permissions' }
  }

  const { attemptId } = request.data
  if (!attemptId) {
    return { status: null, error: 'attemptId is required' }
  }

  const attempt = await getPaymentAttempt(attemptId)
  if (!attempt) return { status: null, error: 'Payment attempt not found' }
  if (attempt.status !== 'pending') return { status: attempt.status, error: null }

  // Check if the payment attempt has expired (30-minute timeout)
  if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
    await updatePaymentAttempt(attemptId, {
      status: 'cancelled',
      errorMessage: 'Payment attempt expired (30-minute timeout)',
    }).catch(err => console.error('verifyPayment: failed to expire stale attempt:', err))
    return { status: 'cancelled', error: 'Payment attempt expired' }
  }

  // Verify caller belongs to the same gym as the payment attempt
  if (callerRole !== 'super_admin' && callerDoc.data().gymId && attempt.gymId && callerDoc.data().gymId !== attempt.gymId) {
    return { status: null, error: 'Cross-gym payment verification denied' }
  }

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
      }).catch(err => console.error('verifyPayment: failed to update attempt status:', err))

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
  } catch (topErr) {
    console.error('verifyPayment: unhandled error', topErr)
    return { status: null, error: topErr.message || 'Internal server error' }
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
      const responseString = decodedJson + '/pg/v1/status/' + config.merchantId + '/' + merchantTransactionId + config.saltKey
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

      // Check if the payment attempt has expired (30-minute timeout)
      if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
        await attemptDoc.ref.update({
          status: 'cancelled',
          errorMessage: 'Payment attempt expired',
          updatedAt: new Date().toISOString(),
        }).catch(err => console.error('phonePeCallback: failed to expire stale attempt:', err))
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

      res.status(200).json({ success: true })
    } catch (error) {
      console.error('PhonePe callback error:', error)
      // Return 200 to prevent PhonePe from retrying — never expose error details to caller
      res.status(200).json({ success: true })
    }
  })

// ─────────────────────────────────────────────
// CASHFREE PAYMENTS (mirrors PhonePe patterns)
// ─────────────────────────────────────────────

/**
 * createCashfreeOrder — Callable Cloud Function.
 *
 * Mirrors createPayment (PhonePe):
 * - Same validation, role checks, gym ownership validation, pending
 *   payment detection, paymentAttempts persistence, and error shape.
 * - Loads Cashfree config from Firebase Secret Manager (never client-side).
 * - Returns { attemptId, redirectUrl, paymentSessionId, orderId, error }.
 *   redirectUrl is null by design: the browser opens the Cashfree v3 SDK
 *   modal with paymentSessionId instead of navigating away.
 */
exports.createCashfreeOrder = onCall({
  secrets: [CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_MODE],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (request) => {
  try {
  // Verify authentication
  if (!request.auth) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'Authentication required' }
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
    name,
    email,
    phone,
    redirectUrl,
    authUid,
  } = request.data

  // ── Reuse PhonePe validation logic ──
  if (!finalAmount || Number(finalAmount) <= 0) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'Invalid amount: finalAmount must be positive' }
  }
  if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'Invalid phone number: must be 10 digits' }
  }
  if (!redirectUrl) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'redirectUrl is required' }
  }
  if (type === 'renewal' || type === 'upgrade') {
    if (!subscriptionId) {
      return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'subscriptionId is required for renewal/upgrade' }
    }
  }
  if (!gymId) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'gymId is required' }
  }

  // ── Reuse role checks ──
  const callerDoc = await db.collection('users').doc(request.auth.uid).get()
  if (!callerDoc.exists) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'Caller profile not found' }
  }
  const callerRole = callerDoc.data().role
  if (!['super_admin', 'gym_admin', 'gym_owner', 'admin'].includes(callerRole)) {
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'Insufficient permissions: only admins and gym owners can initiate payments' }
  }

  // ── Reuse gym ownership validation ──
  if (callerRole !== 'super_admin') {
    const callerGymId = callerDoc.data().gymId
    if (!callerGymId || callerGymId !== gymId) {
      return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: 'Access denied: you do not own this gym' }
    }
  }

  // 1. Load Cashfree config (server-side only)
  const config = loadCashfreeConfig()
  if (!config) {
    return {
      attemptId: null,
      redirectUrl: null,
      paymentSessionId: null,
      error: 'Cashfree is not configured. Set the CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET secrets.',
    }
  }

  // 2. ── Reuse pending payment detection (idempotency) ──
  if (subscriptionId) {
    const existingAttempts = await db.collection('paymentAttempts')
      .where('subscriptionId', '==', subscriptionId)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
    if (!existingAttempts.empty) {
      const existing = existingAttempts.docs[0].data()
      if (existing.cashfreeOrderId) {
        return {
          attemptId: existingAttempts.docs[0].id,
          redirectUrl: null,
          paymentSessionId: existing.paymentSessionId || null,
          orderId: existing.cashfreeOrderId,
          error: null,
        }
      }
    }
  }

  // 3. Generate order id server-side (mirrors generateMerchantTransactionId)
  const orderId = generateCashfreeOrderId()

  // 4. Build Cashfree order payload (amount converted paise → rupees)
  const orderAmount = Number((Number(finalAmount) / 100).toFixed(2))
  const customerId = (authUid || request.auth.uid || gymId || 'guest').substring(0, 50)
  const payload = {
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
      // attemptId embedded so the redirect back to the app can verify
      // server-side without exposing any gateway credentials
      return_url: `${redirectUrl}?attemptId={__ATTEMPT__}&order_id={order_id}`,
    },
  }

  // 5. Generate payment tracking ID (same format as PhonePe)
  const paymentId = `IP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`

  // 6. Save attempt to Firestore (status: pending, 30-minute expiry)
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
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
    paymentMethod: 'Cashfree',
    paymentGateway: 'Cashfree',
    authUid: authUid || request.auth.uid || null,
    status: 'pending',
    cashfreeOrderId: orderId,
    orderStatus: 'INITIALIZED',
    paymentSessionId: null,
    cashfreeTransactionId: null,
    transactionId: null,
    redirectUrl: null,
    expiresAt,
  })

  // Embed the real attemptId in the return_url now that it exists
  payload.order_meta.return_url = payload.order_meta.return_url.replace('{__ATTEMPT__}', attemptId)

  // 7. Call Cashfree Orders API (server-side)
  try {
    const response = await fetch(`${config.baseUrl}/orders`, {
      method: 'POST',
      headers: cashfreeHeaders(config),
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok || !data.payment_session_id) {
      await updatePaymentAttempt(attemptId, {
        status: 'failed',
        orderStatus: data.order_status || 'FAILED',
        errorMessage: data.message || data.code || `HTTP ${response.status}`,
        rawResponse: data,
      }).catch(err => console.error('createCashfreeOrder: failed to update attempt with error state:', err))

      return {
        attemptId,
        redirectUrl: null,
        paymentSessionId: null,
        error: data.message || data.code || `Cashfree API error: HTTP ${response.status}`,
      }
    }

    // 8. Update attempt with success
    await updatePaymentAttempt(attemptId, {
      orderStatus: data.order_status || 'ACTIVE',
      paymentSessionId: data.payment_session_id,
      rawResponse: data,
    }).catch(err => console.error('createCashfreeOrder: failed to update attempt with success state:', err))

    return {
      attemptId,
      redirectUrl: null,
      paymentSessionId: data.payment_session_id,
      orderId,
      error: null,
    }
  } catch (fetchError) {
    await updatePaymentAttempt(attemptId, {
      status: 'failed',
      errorMessage: fetchError.message || 'Network request failed',
      rawResponse: null,
    }).catch(err => console.error('createCashfreeOrder: failed to update attempt on fetch error:', err))

    return {
      attemptId,
      redirectUrl: null,
      paymentSessionId: null,
      error: fetchError.message || 'Failed to call Cashfree API',
    }
  }
  } catch (topErr) {
    console.error('createCashfreeOrder: unhandled error', topErr)
    return { attemptId: null, redirectUrl: null, paymentSessionId: null, error: topErr.message || 'Internal server error' }
  }
})

/**
 * verifyCashfreePayment — Callable Cloud Function.
 *
 * Mirrors verifyPayment (PhonePe):
 * - Same auth/role/expiry/cross-gym checks and attempt status short-circuit.
 * - Queries the Cashfree Orders API server-side and maps the status.
 * - On success calls fulfillSubscriptionPayment() — NO duplicated logic.
 * Returns { status, error }.
 */
exports.verifyCashfreePayment = onCall({
  secrets: [CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_MODE],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (request) => {
  try {
  if (!request.auth) {
    return { status: null, error: 'Authentication required' }
  }

  // Verify caller has sufficient role (same list as verifyPayment)
  const callerDoc = await db.collection('users').doc(request.auth.uid).get()
  const callerRole = callerDoc.exists ? callerDoc.data().role : null
  if (!['super_admin', 'gym_admin', 'gym_owner', 'admin', 'trainer'].includes(callerRole)) {
    return { status: null, error: 'Insufficient permissions' }
  }

  const { attemptId } = request.data
  if (!attemptId) {
    return { status: null, error: 'attemptId is required' }
  }

  const attempt = await getPaymentAttempt(attemptId)
  if (!attempt) return { status: null, error: 'Payment attempt not found' }
  if (attempt.status !== 'pending') return { status: attempt.status, error: null }

  // Check if the payment attempt has expired (30-minute timeout)
  if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
    await updatePaymentAttempt(attemptId, {
      status: 'cancelled',
      errorMessage: 'Payment attempt expired (30-minute timeout)',
    }).catch(err => console.error('verifyCashfreePayment: failed to expire stale attempt:', err))
    return { status: 'cancelled', error: 'Payment attempt expired' }
  }

  // Verify caller belongs to the same gym as the payment attempt
  if (callerRole !== 'super_admin' && callerDoc.data().gymId && attempt.gymId && callerDoc.data().gymId !== attempt.gymId) {
    return { status: null, error: 'Cross-gym payment verification denied' }
  }

  const config = loadCashfreeConfig()
  if (!config) {
    return { status: attempt.status, error: 'Cashfree not configured' }
  }

  const orderId = attempt.cashfreeOrderId
  if (!orderId) {
    return { status: attempt.status, error: 'Cashfree order id missing on attempt' }
  }

  try {
    const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: cashfreeHeaders(config),
    })

    const data = await response.json()

    if (!response.ok) {
      return { status: attempt.status, error: data.message || data.code || `HTTP ${response.status}` }
    }

    const newStatus = mapCashfreeOrderStatus(data.order_status)
    const cashfreeTransactionId = data?.payment?.payment_id || null

    if (newStatus !== attempt.status) {
      await updatePaymentAttempt(attemptId, {
        status: newStatus,
        orderStatus: data.order_status,
        cashfreeTransactionId,
        rawResponse: data,
      }).catch(err => console.error('verifyCashfreePayment: failed to update attempt status:', err))

      // Fulfill subscription on successful payment — shared logic
      if (newStatus === 'success') {
        await fulfillSubscriptionPayment(attempt, cashfreeTransactionId).catch(err => {
          console.error('verifyCashfreePayment: failed to fulfill subscription', attempt.subscriptionId, err)
        })
      }
    }

    return { status: newStatus, error: null }
  } catch (fetchError) {
    return { status: attempt.status, error: fetchError.message || 'Network request failed' }
  }
  } catch (topErr) {
    console.error('verifyCashfreePayment: unhandled error', topErr)
    return { status: null, error: topErr.message || 'Internal server error' }
  }
})

/**
 * cashfreeWebhook — Raw HTTP Cloud Function.
 *
 * Mirrors phonePeCallback:
 * - Verifies the x-webhook-signature HMAC over the EXACT raw request body
 *   (req.rawBody — the wire bytes before JSON parsing) per the Cashfree
 *   spec: signStr = x-webhook-timestamp + rawBody,
 *   signature = base64( HMAC-SHA256( clientSecret, signStr ) ).
 *   Invalid signatures are rejected (not processed) but always
 *   acknowledged with HTTP 200 so Cashfree never retries.
 * - Idempotent: already-fulfilled attempts short-circuit to success.
 * - Updates the payment attempt, then calls fulfillSubscriptionPayment()
 *   on success — shared fulfillment, zero duplicated subscription logic.
 */
exports.cashfreeWebhook = onRequest({
  secrets: [CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_MODE],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      const config = loadCashfreeConfig()
      if (!config) {
        console.error('Cashfree webhook: config not loaded')
        res.status(200).json({ success: true })
        return
      }

      const receivedSignature = req.headers['x-webhook-signature'] || ''
      if (!receivedSignature) {
        console.error('Cashfree webhook: missing x-webhook-signature')
        res.status(200).json({ success: true })
        return
      }

      // The signing timestamp is REQUIRED — it is part of the signed message.
      const timestamp = req.headers['x-webhook-timestamp'] || ''
      if (!timestamp) {
        console.error('Cashfree webhook: missing x-webhook-timestamp')
        res.status(200).json({ success: true })
        return
      }

      // Reject stale events (replay protection)
      const tsMs = new Date(timestamp).getTime()
      if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
        console.error('Cashfree webhook: stale or invalid timestamp', timestamp)
        res.status(200).json({ success: true })
        return
      }

      // Verify the HMAC over the EXACT raw wire bytes. req.rawBody is the
      // body BEFORE the JSON parser ran (firebase-functions v2 populates it
      // alongside req.body) — re-serializing the parsed JSON would change
      // whitespace/key order and break the digest, so it is never used here.
      if (!req.rawBody || req.rawBody.length === 0) {
        console.error('Cashfree webhook: raw body unavailable')
        res.status(200).json({ success: true })
        return
      }

      // Cashfree spec:
      //   signStr   = x-webhook-timestamp + rawBody
      //   signature = base64( HMAC-SHA256( clientSecret, signStr ) )
      // Verified byte-exact via Buffer.concat (no string re-encoding).
      const message = Buffer.concat([Buffer.from(timestamp), req.rawBody])
      const expectedSignature = crypto
        .createHmac('sha256', config.clientSecret)
        .update(message)
        .digest('base64')

      // Timing-safe comparison (constant-time, avoids length side channels)
      const receivedBuffer = Buffer.from(receivedSignature)
      const expectedBuffer = Buffer.from(expectedSignature)
      const signatureValid = receivedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(receivedBuffer, expectedBuffer)

      if (!signatureValid) {
        console.error('Cashfree webhook: signature mismatch')
        res.status(200).json({ success: true })
        return
      }

      // Decode v2 payload: body.data is a base64-encoded event object
      const body = req.body || {}
      let eventData = body
      if (typeof body.data === 'string') {
        try {
          eventData = JSON.parse(Buffer.from(body.data, 'base64').toString('utf-8'))
        } catch (parseErr) {
          console.error('Cashfree webhook: failed to decode payload', parseErr)
          res.status(200).json({ success: true })
          return
        }
      }

      const orderId = eventData?.order?.order_id || body.order_id || ''
      if (!orderId) {
        console.error('Cashfree webhook: missing order_id')
        res.status(200).json({ success: true })
        return
      }

      // Find the payment attempt by cashfreeOrderId
      const q = await db.collection('paymentAttempts')
        .where('cashfreeOrderId', '==', orderId)
        .limit(1)
        .get()

      if (q.empty) {
        console.error('Cashfree webhook: attempt not found for', orderId)
        res.status(200).json({ success: true })
        return
      }

      const attemptDoc = q.docs[0]
      const attempt = attemptDoc.data()

      // Amount verification (webhook order_amount is in rupees)
      const orderAmount = eventData?.order?.order_amount ?? body.order_amount
      if (orderAmount != null && attempt.finalAmount &&
          Number(orderAmount) !== Number((Number(attempt.finalAmount) / 100).toFixed(2))) {
        console.error('Cashfree webhook: amount mismatch', { orderId, received: orderAmount, expected: attempt.finalAmount })
        res.status(200).json({ success: true })
        return
      }

      // Check if the payment attempt has expired (30-minute timeout)
      if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
        await attemptDoc.ref.update({
          status: 'cancelled',
          errorMessage: 'Payment attempt expired',
          updatedAt: new Date().toISOString(),
        }).catch(err => console.error('cashfreeWebhook: failed to expire stale attempt:', err))
        res.status(200).json({ success: true })
        return
      }

      if (attempt.status !== 'pending') {
        // Already processed — idempotent
        res.status(200).json({ success: true })
        return
      }

      // Map Cashfree payment_status to our status
      const paymentStatus = eventData?.payment?.payment_status || ''
      const newStatus = mapCashfreeOrderStatus(paymentStatus || 'FAILED')
      const cashfreeTransactionId = eventData?.payment?.payment_id || attempt.cashfreeTransactionId || null

      // Update Firestore
      await attemptDoc.ref.update({
        status: newStatus,
        orderStatus: paymentStatus,
        cashfreeTransactionId,
        callbackAmount: eventData?.payment?.payment_amount ?? null,
        rawResponse: eventData,
        updatedAt: new Date().toISOString(),
      })

      // Fulfill subscription on successful payment — shared logic
      if (newStatus === 'success') {
        await fulfillSubscriptionPayment({ ...attempt, id: attemptDoc.id }, cashfreeTransactionId).catch(err => {
          console.error('cashfreeWebhook: failed to fulfill subscription', attempt.subscriptionId, err)
        })
      }

      res.status(200).json({ success: true })
    } catch (error) {
      console.error('Cashfree webhook error:', error)
      // Return 200 to prevent Cashfree from retrying — never expose error details to caller
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
              name: g.ownerName || g.gymName || '',
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

// ─────────────────────────────────────────────
// AUTH USER CLEANUP (Admin SDK)
// ─────────────────────────────────────────────

/**
 * deleteAuthUser — Callable Cloud Function.
 *
 * Deletes a Firebase Auth user by UID via Admin SDK.
 * Only admins can invoke. Solves orphan Auth user problem:
 * client-side SDK cannot delete other users.
 */
exports.deleteAuthUser = onCall({
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  if (!request.auth) {
    return { success: false, error: 'Authentication required' }
  }

  const callerRef = await db.collection('users').doc(request.auth.uid).get()
  if (!callerRef.exists || callerRef.data().role !== 'admin') {
    return { success: false, error: 'Admin role required' }
  }

  const { uid } = request.data
  if (!uid) {
    return { success: false, error: 'uid is required' }
  }

  try {
    await getAuth().deleteUser(uid)
    return { success: true, error: null }
  } catch (err) {
    console.error('deleteAuthUser: failed', uid, err.code || err.name, err.message)
    if (err.code === 'auth/user-not-found') {
      return { success: true, error: null }
    }
    return { success: false, error: err.message }
  }
})

// ─────────────────────────────────────────────
// SECURITY METRICS (Admin SDK)
// ─────────────────────────────────────────────

exports.getSecurityMetrics = onCall(async (request) => {
  try {
    if (!request.auth) {
      return { error: 'Authentication required', metrics: null }
    }

    const callerDoc = await db.collection('users').doc(request.auth.uid).get()
    if (!callerDoc.exists) {
      return { error: 'Caller profile not found', metrics: null }
    }
    const caller = callerDoc.data()
    const role = caller.role
    const isSuperAdmin = role === 'super_admin' || (role === 'admin' && caller.isSuperAdmin)
    if (!isSuperAdmin) {
      return { error: 'Insufficient permissions: super_admin only', metrics: null }
    }

    const [
      gymsSnap,
      usersSnap,
      activeSubsSnap,
      activeLicensesSnap,
      devicesSnap,
    ] = await Promise.all([
      db.collection('gyms').get(),
      db.collection('users').get(),
      db.collection('gyms').where('subscription.status', '==', 'active').get(),
      db.collection('gyms').where('subscription.licenseStatus', '==', 'active').get(),
      db.collection('licensedDevices').get(),
    ])

    let authUserCount = 0
    try {
      const listResult = await getAuth().listUsers(1000)
      authUserCount = listResult.users.length
    } catch (err) {
      console.error('getSecurityMetrics: listUsers failed', err.message)
    }

    return {
      error: null,
      metrics: {
        totalGyms: gymsSnap.size,
        totalUsers: usersSnap.size,
        activeSubscriptions: activeSubsSnap.size,
        activeLicenses: activeLicensesSnap.size,
        totalDevices: devicesSnap.size,
        authUserCount,
        platformStatus: 'operational',
      },
    }
  } catch (err) {
    console.error('getSecurityMetrics: unhandled error', err)
    return { error: err.message || 'Internal server error', metrics: null }
  }
})
