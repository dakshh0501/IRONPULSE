// src/services/firestoreService.js

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import {
  setDoc
} from 'firebase/firestore'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  firebaseConfig,
  auth
} from '../firebase'
import { db } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'

// Secondary auth instance for creating trainer accounts
// so the admin stays logged in on the main auth instance
const secondaryApp = initializeApp(firebaseConfig, 'secondary')
const secondaryAuth = getAuth(secondaryApp)

// Default gym ID for single-gym mode (pre-multi-tenant migration)
export const DEFAULT_GYM_ID = 'default'

// ─────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────

// Add new member
export async function addMember(memberData) {

  const { password, ...cleanData } = memberData

  let user

  try {
    if (cleanData.email && password) {
      const authResult =
        await createUserWithEmailAndPassword(
          secondaryAuth,
          cleanData.email,
          password
        )
      user = authResult.user
      await secondaryAuth.signOut()

      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          email: user.email,
          name: cleanData.name || '',
          role: 'member',
          gymId: cleanData.gymId || DEFAULT_GYM_ID,
          createdAt: serverTimestamp(),
        }
      )
    }

    const docRef = await addDoc(
      collection(db, 'members'),
      {
        ...cleanData,
        gymId: cleanData.gymId || DEFAULT_GYM_ID,
        authUid: user?.uid || cleanData.authUid || null,
        status: cleanData.status || 'Active',
        plan: cleanData.plan || 'Monthly',
        amountPaid: Number(cleanData.amountPaid) || 0,
        checkins: Number(cleanData.checkins) || 0,
        createdAt: serverTimestamp(),
      }
    )

    return { id: docRef.id, authUid: user?.uid || null }
  } catch (error) {
    if (user) {
      try { await user.delete() } catch (cleanupErr) {
        console.error('Failed to cleanup auth user:', cleanupErr)
      }
    }
    throw error
  }
}

// Realtime members listener
export function subscribeToMembers(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'members'), where('gymId', '==', gymId))
    : collection(db, 'members')

  return onSnapshot(
    ref,

    (snapshot) => {

      const members =
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))

      callback(members)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (members):`, error.message); if (onError) onError(error, 'members')
    }
  )
}

// Update member
export async function updateMember(
  memberId,
  updatedData
) {

  const memberRef =
    doc(db, 'members', memberId)

  const updateFields = { ...updatedData }

  // Keep numeric values safe — only include when provided
  if (updatedData.amountPaid !== undefined) {
    updateFields.amountPaid =
      Number(updatedData.amountPaid) || 0
  }

  if (updatedData.checkins !== undefined) {
    updateFields.checkins =
      Number(updatedData.checkins) || 0
  }

  await updateDoc(memberRef, updateFields)
}

// Delete member
export async function deleteMember(memberId) {

  const memberRef =
    doc(db, 'members', memberId)

  const memberSnap =
    await getDoc(memberRef)

  if (!memberSnap.exists()) {
    return
  }

  const memberData =
    memberSnap.data()

  const authUid =
    memberData.authUid

  // Clean up Storage photo if present
  if (memberData.storagePath) {
    try {
      const { deleteMemberPhoto } = await import('./storageService')
      await deleteMemberPhoto(memberData.storagePath)
    } catch (_) {}
  } else if (memberData.photoUrl) {
    try {
      const { deleteMemberPhoto } = await import('./storageService')
      await deleteMemberPhoto(`members/${memberId}/profile.webp`)
    } catch (_) {}
  }

  await deleteDoc(memberRef)

  if (authUid) {

    const userRef =
      doc(db, 'users', authUid)

    await deleteDoc(userRef)

    // Delete Firebase Auth user via Cloud Function (Admin SDK required)
    try {
      const functions = getFunctions()
      const deleteUserFn = httpsCallable(functions, 'deleteAuthUser')
      await deleteUserFn({ uid: authUid })
    } catch (cfErr) {
      console.error('deleteMember: failed to delete Auth user (non-blocking):', cfErr)
      throw new Error('Member deleted but Auth account cleanup failed. Contact support.')
    }
  }
}
// ─────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────

// Add payment
export async function addPayment(paymentData) {

  const docRef = await addDoc(
    collection(db, 'payments'),
    {
      ...paymentData,
      gymId: paymentData.gymId || DEFAULT_GYM_ID,

      amount:
        Number(paymentData.amount) || 0,

      status:
        paymentData.status || 'Paid',

      plan:
        paymentData.plan || 'Monthly',

      createdAt:
        serverTimestamp(),
    }
  )

  return docRef.id
}

// Realtime payments listener
export function subscribeToPayments(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'payments'), where('gymId', '==', gymId))
    : collection(db, 'payments')

  return onSnapshot(
    ref,

    (snapshot) => {

      const payments =
  snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }))
      callback(payments)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (payments):`, error.message); if (onError) onError(error, 'payments')
    }
  )
}

// Update payment
export async function updatePayment(
  paymentId,
  updatedData
) {

  const paymentRef =
    doc(db, 'payments', paymentId)

  const { amount, ...rest } = updatedData
  const updateFields = { ...rest }
  if (amount !== undefined) updateFields.amount = Number(amount) || 0
  await updateDoc(paymentRef, updateFields)
}

// Delete payment
export async function deletePayment(paymentId) {

  const paymentRef =
    doc(db, 'payments', paymentId)

  await deleteDoc(paymentRef)
}
// ─────────────────────────────────────────────
// TRAINERS
// ─────────────────────────────────────────────

// Add trainer
export async function addTrainer(trainerData) {

  const p = Math.random().toString(36).slice(2, 8)
  const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')[Math.floor(Math.random() * 26)]
  const password = p + s + '1!'

  let user

  try {
    const authResult =
      await createUserWithEmailAndPassword(
    secondaryAuth,
    trainerData.email,
    password
      )

    user = authResult.user

    await secondaryAuth.signOut()

    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        name: trainerData.name,
        email: trainerData.email,
        role: 'trainer',
        gymId: trainerData.gymId || DEFAULT_GYM_ID,
        createdAt: serverTimestamp(),
      }
    )

    const docRef = await addDoc(
      collection(db, 'trainers'),
      {
        ...trainerData,
        gymId: trainerData.gymId || DEFAULT_GYM_ID,
        authUid: user.uid,
        createdAt: serverTimestamp(),
      }
    )

    return { id: docRef.id, password }
  } catch (error) {
    // Cleanup: delete the auth user if Firestore write failed
    if (user) {
      try {
        await user.delete()
      } catch (cleanupErr) {
        console.error('Failed to cleanup auth user:', cleanupErr)
      }
    }
    throw error
  }
}

// Subscribe realtime trainers
export function subscribeToTrainers(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'trainers'), where('gymId', '==', gymId))
    : collection(db, 'trainers')

  return onSnapshot(
    ref,
    (snapshot) => {

      const trainers =
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))

      callback(trainers)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (trainers):`, error.message); if (onError) onError(error, 'trainers')
    }
  )
}

// Update trainer
export async function updateTrainer(
  trainerId,
  updatedData
) {

  const trainerRef =
    doc(db, 'trainers', trainerId)

  await updateDoc(
    trainerRef,
    updatedData
  )
}

// Delete trainer
export async function deleteTrainer(
  trainerId
) {

  const trainerRef =
    doc(db, 'trainers', trainerId)

  const trainerSnap =
    await getDoc(trainerRef)

  if (!trainerSnap.exists()) {
    return
  }

  const trainerData =
    trainerSnap.data()

  const authUid =
    trainerData.authUid

  // Nullify trainer references on assigned members
  try {
    const membersRef = collection(db, 'members')
    const q = query(membersRef, where('trainerId', '==', trainerId))
    const snap = await getDocs(q)
    const updates = snap.docs.map(d =>
      updateDoc(doc(db, 'members', d.id), { trainerId: '', trainerName: '' })
    )
    if (updates.length > 0) await Promise.allSettled(updates)
  } catch (mErr) {
    console.error('deleteTrainer: failed to cleanup member trainer refs:', mErr)
  }

  await deleteDoc(trainerRef)

  if (authUid) {

    const userRef =
      doc(db, 'users', authUid)

    await deleteDoc(userRef)

    // Delete Firebase Auth user via Cloud Function (Admin SDK required)
    try {
      const functions = getFunctions()
      const deleteUserFn = httpsCallable(functions, 'deleteAuthUser')
      await deleteUserFn({ uid: authUid })
    } catch (cfErr) {
      console.error('deleteTrainer: failed to delete Auth user (non-blocking):', cfErr)
    }
  }
}

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// SUPPORT TICKETS
// ─────────────────────────────────────────────

export async function addSupportTicket(ticketData) {
  const docRef = await addDoc(
    collection(db, 'supportTickets'),
    {
      ...ticketData,
      gymId: ticketData.gymId || DEFAULT_GYM_ID,
      status: ticketData.status || 'Open',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

export function subscribeToSupportTickets(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'supportTickets'), where('gymId', '==', gymId))
    : collection(db, 'supportTickets')

  return onSnapshot(ref, (snapshot) => {
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(tickets)
  }, (error) => {
    console.error(`[Firestore] Subscription error (supportTickets):`, error.message); if (onError) onError(error, 'supportTickets')
  })
}

// ─────────────────────────────────────────────
// FEATURE REQUESTS
// ─────────────────────────────────────────────

export async function addFeatureRequest(requestData) {
  const docRef = await addDoc(
    collection(db, 'featureRequests'),
    {
      ...requestData,
      gymId: requestData.gymId || DEFAULT_GYM_ID,
      status: requestData.status || 'Under Review',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

export function subscribeToFeatureRequests(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'featureRequests'), where('gymId', '==', gymId))
    : collection(db, 'featureRequests')

  return onSnapshot(ref, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(requests)
  }, (error) => {
    console.error(`[Firestore] Subscription error (featureRequests):`, error.message); if (onError) onError(error, 'featureRequests')
  })
}

// Read settings document from /settings/{docId}
// In multi-tenant mode, settings scoped to gymId use docId = `${gymId}:${docId}`
export async function getSettings(docId = 'gym', gymId) {
  const settingsDocId = gymId ? `${gymId}:${docId}` : docId
  const snap = await getDoc(doc(db, 'settings', settingsDocId))
  return snap.exists() ? snap.data() : null
}

// Write (merge) settings document to /settings/{docId}
// In multi-tenant mode, settings scoped to gymId use docId = `${gymId}:${docId}`
export async function saveSettings(docId = 'gym', data, gymId) {
  const settingsDocId = gymId ? `${gymId}:${docId}` : docId
  await setDoc(doc(db, 'settings', settingsDocId), { ...data, gymId: gymId || DEFAULT_GYM_ID }, { merge: true })
}

// ── Global Billing ────────────────────────────────────────────
// Single global billing document at /settings/billing (no gymId prefix)
export async function getGlobalBilling() {
  return getSettings('billing')
}

// Apply discount to an original amount
// Returns { originalAmount, discountType, discountValue, finalAmount }
function applyDiscount(originalAmount, discountType, discountValue) {
  const orig = Number(originalAmount) || 0
  const type = discountType || 'none'
  const val = Number(discountValue) || 0
  let final = orig

  if (type === 'percentage' && val > 0 && val <= 100) {
    final = Math.round(orig - (orig * val / 100))
  } else if (type === 'fixed' && val > 0) {
    final = Math.max(0, orig - val)
  }

  return {
    originalAmount: orig,
    discountType: type,
    discountValue: val,
    finalAmount: final,
  }
}

// ─────────────────────────────────────────────
// PROGRESS LOGS
// ─────────────────────────────────────────────

export function subscribeToProgressLogs(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'progressLogs'), where('gymId', '==', gymId))
    : collection(db, 'progressLogs')

  return onSnapshot(
    ref,
    (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
      callback(logs)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (progressLogs):`, error.message); if (onError) onError(error, 'progressLogs')
    }
  )
}

export function subscribeToMyProgressLogs(callback, authUid, onError) {
  if (!authUid) return () => {}
  const ref = query(collection(db, 'progressLogs'), where('authUid', '==', authUid))
  return onSnapshot(
    ref,
    (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
      callback(logs)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myProgressLogs):`, error.message); if (onError) onError(error, 'myProgressLogs')
    }
  )
}

export async function addProgressLog(logData) {
  const docRef = await addDoc(
    collection(db, 'progressLogs'),
    {
      ...logData,
      gymId: logData.gymId || DEFAULT_GYM_ID,
      weight: Number(logData.weight) || 0,
      bodyFat: Number(logData.bodyFat) || 0,
      bmi: Number(logData.bmi) || 0,
      muscle: Number(logData.muscle) || 0,
      bench: Number(logData.bench) || 0,
      squat: Number(logData.squat) || 0,
      deadlift: Number(logData.deadlift) || 0,
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

export async function updateProgressLog(logId, updatedData) {
  await updateDoc(doc(db, 'progressLogs', logId), {
    ...updatedData,
    weight: Number(updatedData.weight) || 0,
    bodyFat: Number(updatedData.bodyFat) || 0,
    bmi: Number(updatedData.bmi) || 0,
    muscle: Number(updatedData.muscle) || 0,
    bench: Number(updatedData.bench) || 0,
    squat: Number(updatedData.squat) || 0,
    deadlift: Number(updatedData.deadlift) || 0,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteProgressLog(logId) {
  await deleteDoc(doc(db, 'progressLogs', logId))
}

// ─────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────

// Realtime plans listener (global — shared across gyms)
export function subscribeToPlans(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'plans'), where('gymId', '==', gymId))
    : collection(db, 'plans')

  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (plans):`, error.message); if (onError) onError(error, 'plans')
    }
  )
}

// Add plan
export async function addPlan(planData) {
  const docRef = await addDoc(
    collection(db, 'plans'),
    {
      ...planData,
      gymId: planData.gymId || DEFAULT_GYM_ID,
      active: planData.active !== undefined ? planData.active : true,
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

// Update plan
export async function updatePlan(planId, updatedData) {
  await updateDoc(doc(db, 'plans', planId), updatedData)
}

// Delete plan
export async function deletePlan(planId) {
  await deleteDoc(doc(db, 'plans', planId))
}

// Migrate default plans if collection is empty (per gym)
export async function migrateDefaultPlans(gymId) {
  const targetGymId = gymId || DEFAULT_GYM_ID
  const q = query(collection(db, 'plans'), where('gymId', '==', targetGymId))
  const snapshot = await getDocs(q)
  if (!snapshot.empty) return false

  const defaults = [
    { name: 'Trial', price: 499, duration: '7 Days', durationDays: 7, description: 'Short-term trial membership, no commitment', active: true, order: 1 },
    { name: 'Standard', price: 1499, duration: '1 Month', durationDays: 30, description: 'Regular monthly membership with full gym access', active: true, order: 2 },
    { name: 'Premium', price: 2999, duration: '1 Month', durationDays: 30, description: 'Premium with unlimited trainer access and perks', active: true, order: 3 },
    { name: 'Quarterly', price: 3999, duration: '3 Months', durationDays: 90, description: '3-month commitment with discounted rate', active: true, order: 4 },
    { name: 'Annual', price: 12999, duration: '12 Months', durationDays: 365, description: '12-month membership, best value for money', active: true, order: 5 },
    { name: 'Day Pass', price: 199, duration: '1 Day', durationDays: 1, description: 'Single-day access pass', active: true, order: 6 },
  ]

  for (const plan of defaults) {
    await addDoc(collection(db, 'plans'), { ...plan, gymId: targetGymId, createdAt: serverTimestamp() })
  }
  return true
}

// ─────────────────────────────────────────────
// DIET PLANS
// ─────────────────────────────────────────────

export function subscribeToDietPlans(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'dietPlans'), where('gymId', '==', gymId))
    : collection(db, 'dietPlans')

  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (dietPlans):`, error.message); if (onError) onError(error, 'dietPlans')
    }
  )
}

export async function addDietPlan(planData) {
  const docRef = await addDoc(
    collection(db, 'dietPlans'),
    { ...planData, gymId: planData.gymId || DEFAULT_GYM_ID, createdAt: serverTimestamp() }
  )
  return docRef.id
}

export async function updateDietPlan(planId, updatedData) {
  await updateDoc(doc(db, 'dietPlans', planId), updatedData)
}

export async function deleteDietPlan(planId) {
  await deleteDoc(doc(db, 'dietPlans', planId))
}

// ─────────────────────────────────────────────
// WORKOUT PLANS
// ─────────────────────────────────────────────

export function subscribeToWorkoutPlans(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'workoutPlans'), where('gymId', '==', gymId))
    : collection(db, 'workoutPlans')

  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (workoutPlans):`, error.message); if (onError) onError(error, 'workoutPlans')
    }
  )
}

export async function addWorkoutPlan(planData) {
  const docRef = await addDoc(
    collection(db, 'workoutPlans'),
    { ...planData, gymId: planData.gymId || DEFAULT_GYM_ID, createdAt: serverTimestamp() }
  )
  return docRef.id
}

export async function updateWorkoutPlan(planId, updatedData) {
  await updateDoc(doc(db, 'workoutPlans', planId), updatedData)
}

export async function deleteWorkoutPlan(planId) {
  await deleteDoc(doc(db, 'workoutPlans', planId))
}

// ─────────────────────────────────────────────
// BACKFILL: populate memberId/authUid on existing dietPlans/workoutPlans
// Call once after schema update to backfill legacy records.
// ─────────────────────────────────────────────

export async function backfillOwnershipFields() {
  // Build member name → { id, authUid } map
  const memberSnap = await getDocs(collection(db, 'members'))
  const memberMap = {}
  memberSnap.forEach(d => {
    const data = d.data()
    memberMap[data.name] = { id: d.id, authUid: data.authUid }
  })

  const results = { updated: 0, unmatched: 0, unmatchedNames: [] }

  // Backfill dietPlans (field: assignedMember)
  const dietSnap = await getDocs(collection(db, 'dietPlans'))
  for (const docSnap of dietSnap.docs) {
    const data = docSnap.data()
    if (data.memberId && data.authUid) continue
    const entry = memberMap[data.assignedMember]
    if (entry) {
      await updateDoc(doc(db, 'dietPlans', docSnap.id), {
        memberId: entry.id,
        authUid: entry.authUid
      })
      results.updated++
    } else if (data.assignedMember) {
      results.unmatched++
      results.unmatchedNames.push(`dietPlans/${docSnap.id} → "${data.assignedMember}"`)
    }
  }

  // Backfill workoutPlans (field: member)
  const workoutSnap = await getDocs(collection(db, 'workoutPlans'))
  for (const docSnap of workoutSnap.docs) {
    const data = docSnap.data()
    if (data.memberId && data.authUid) continue
    const entry = memberMap[data.member]
    if (entry) {
      await updateDoc(doc(db, 'workoutPlans', docSnap.id), {
        memberId: entry.id,
        authUid: entry.authUid
      })
      results.updated++
    } else if (data.member) {
      results.unmatched++
      results.unmatchedNames.push(`workoutPlans/${docSnap.id} → "${data.member}"`)
    }
  }

  return results
}

// ─────────────────────────────────────────────
// GYMS (global collection — one doc per gym)
// ─────────────────────────────────────────────

export function subscribeToGyms(callback, onError) {
  return onSnapshot(
    collection(db, 'gyms'),
    (snapshot) => {
      const gyms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(gyms)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (gyms):`, error.message); if (onError) onError(error, 'gyms')
    }
  )
}

export async function addGym(gymData, ownerUid) {
  const data = {
    ...gymData,
    ownerUid,
    approvalStatus: 'pending',
    createdAt: serverTimestamp(),
  }
  try {
    const docRef = await addDoc(collection(db, 'gyms'), data)
    return docRef.id
  } catch (e) {
    console.error('addGym error:', e)
    throw e
  }
}

export async function updateGym(gymId, updatedData) {
  await updateDoc(doc(db, 'gyms', gymId), updatedData)
}

export async function deleteGym(gymId) {
  await deleteDoc(doc(db, 'gyms', gymId))
}

// ─────────────────────────────────────────────
// SUBSCRIPTIONS (global collection — billing per gym)
// ─────────────────────────────────────────────

export function subscribeToSubscriptions(callback, onError) {
  return onSnapshot(
    collection(db, 'subscriptions'),
    (snapshot) => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(subs)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (subscriptions):`, error.message); if (onError) onError(error, 'subscriptions')
    }
  )
}

// Check if a subscription already exists for a given gymId
export async function getSubscriptionByGymId(gymId) {
  const q = query(collection(db, 'subscriptions'), where('gymId', '==', gymId))
  const snap = await getDocs(q)
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// Calculate subscription dates based on plan
function calculateSubscriptionDates(plan, billingSettings) {
  const trialDays = billingSettings?.trialDays || 7;
  const gracePeriod = billingSettings?.gracePeriod || 5;
  let isLifetime = false;

  function addDays(d, n) { return new Date(d.getTime() + n * 86400000) }

  const base = new Date()
  let startDate = base
  let expiryDate, graceEndDate

  switch (plan) {
    case 'Trial':
      expiryDate = addDays(base, trialDays)
      graceEndDate = addDays(base, trialDays + gracePeriod)
      break;
    case 'Standard':
      expiryDate = addDays(base, 30)
      graceEndDate = addDays(base, 30 + gracePeriod)
      break;
    case 'Premium':
      expiryDate = addDays(base, 30)
      graceEndDate = addDays(base, 30 + gracePeriod)
      break;
    case 'Quarterly':
      expiryDate = addDays(base, 90)
      graceEndDate = addDays(base, 90 + gracePeriod)
      break;
    case 'Annual':
      expiryDate = addDays(base, 365)
      graceEndDate = addDays(base, 365 + gracePeriod)
      break;
    case 'Lifetime':
      expiryDate = addDays(base, 9999)
      graceEndDate = base
      isLifetime = true
      break;
    case 'Day Pass':
      expiryDate = addDays(base, 1)
      graceEndDate = addDays(base, 1)
      break;
    default:
      expiryDate = addDays(base, 30)
      graceEndDate = addDays(base, 30 + gracePeriod)
  }

  const daysRemaining = isLifetime ? 9999 : Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

  return {
    startDate: startDate.toISOString().split('T')[0],
    expiryDate: expiryDate.toISOString().split('T')[0],
    graceEndDate: graceEndDate.toISOString().split('T')[0],
    daysRemaining,
    isLifetime,
  };
}

// Calculate subscription amount based on plan
// When billingSettings provided, returns { originalAmount, finalAmount }
// When no billingSettings, returns raw paise value (backward compat)
function calculateSubscriptionAmount(plan, billingSettings) {
  if (billingSettings) {
    const planAmounts = {
      'Trial':     0,
      'Standard':  billingSettings.monthlyPrice || 9999,
      'Premium':   billingSettings.yearlyPrice || 19999,
      'Quarterly': billingSettings.halfYearlyPrice || 29999,
      'Annual':    billingSettings.yearlyPrice || 99999,
      'Lifetime':  billingSettings.lifetimePrice || 499999,
      'Day Pass':  99,
    };
    return planAmounts[plan] || planAmounts['Standard'];
  }

  const planPrices = {
    'Trial': 0,
    'Standard': 9999,
    'Premium': 19999,
    'Quarterly': 29999,
    'Annual': 99999,
    'Lifetime': 499999,
    'Day Pass': 99,
  };

  return planPrices[plan] || planPrices['Standard'];
}

export async function addSubscription(subData, billingSettings) {
  // Read global billing if not passed explicitly
  const billing = billingSettings || await getGlobalBilling()
  const baseAmount = calculateSubscriptionAmount(subData.plan || 'Standard', billing)
  const discount = applyDiscount(baseAmount, subData.discountType, subData.discountValue)

  const docRef = await addDoc(
    collection(db, 'subscriptions'),
    {
      ...subData,
      gymId: subData.gymId || 'default',
      planType: subData.plan || 'Standard',
      status: subData.status || 'trial',
      paymentStatus: subData.paymentStatus || 'pending',
      paymentMethod: subData.paymentMethod || 'Not Set',
      paymentCurrency: subData.paymentCurrency || (billing?.currency || 'INR'),
      currency: subData.currency || subData.paymentCurrency || (billing?.currency || 'INR'),
      transactionId: subData.transactionId || null,
      amount: subData.amount || discount.finalAmount,
      originalAmount: discount.originalAmount,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      finalAmount: discount.finalAmount,
      paidAt: subData.paidAt || (subData.paymentStatus === 'paid' || subData.status === 'active' ? serverTimestamp() : null),
      autoRenew: subData.autoRenew !== undefined ? subData.autoRenew : true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...calculateSubscriptionDates(subData.plan || 'Standard', billing),
    }
  )
  return docRef.id
}

export async function updateSubscription(subId, updatedData, billingSettings) {
  const updateFields = { ...updatedData, updatedAt: serverTimestamp() }
  
  // If plan is being updated, only recalculate if plan actually changed
  if (updatedData.plan) {
    const existingSnap = await getDoc(doc(db, 'subscriptions', subId))
    const existingData = existingSnap.exists() ? existingSnap.data() : {}
    const planChanged = existingData.plan !== updatedData.plan
    
    if (planChanged) {
      const billing = billingSettings || await getGlobalBilling()
      const plan = updatedData.plan;
      const dates = calculateSubscriptionDates(plan, billing);
      Object.assign(updateFields, dates);
      
      // Recalculate amount with discount
      const baseAmount = calculateSubscriptionAmount(plan, billing)
      const discount = applyDiscount(baseAmount, updatedData.discountType, updatedData.discountValue)
      updateFields.amount = updatedData.amount || discount.finalAmount
      updateFields.originalAmount = discount.originalAmount
      updateFields.discountType = discount.discountType
      updateFields.discountValue = discount.discountValue
      updateFields.finalAmount = discount.finalAmount
      
      // Update status based on plan and existing status
      if (updateFields.status === 'trial') {
        updateFields.status = 'active';
        updateFields.paymentStatus = 'paid';
        updateFields.paidAt = serverTimestamp();
      }
    }
  }
  
  // If payment status is being updated to 'paid', set paidAt if not already set
  if (updatedData.paymentStatus === 'paid' && !updateFields.paidAt) {
    updateFields.paidAt = serverTimestamp();
  }
  
  await updateDoc(doc(db, 'subscriptions', subId), updateFields);
}

export async function deleteSubscription(subId) {
  await deleteDoc(doc(db, 'subscriptions', subId))
}

// Migration: Backfill missing fields on existing subscription documents
export async function migrateSubscriptions() {
  const snapshot = await getDocs(collection(db, 'subscriptions'))
  const updates = []

  snapshot.forEach(doc => {
    const data = doc.data()
    const needsUpdate = {}

    // Ensure all required fields exist
    if (!data.gymId) needsUpdate.gymId = 'default'
    if (!data.planType) needsUpdate.planType = data.plan || 'Standard'
    if (!data.status) needsUpdate.status = 'active'
    if (!data.startDate) {
      needsUpdate.startDate = new Date().toISOString().split('T')[0]
    }
    if (!data.expiryDate) {
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + 30)
      needsUpdate.expiryDate = expiry.toISOString().split('T')[0]
    }
    if (!data.graceEndDate) {
      const graceEnd = new Date()
      graceEnd.setDate(graceEnd.getDate() + 5)
      needsUpdate.graceEndDate = graceEnd.toISOString().split('T')[0]
    }
    if (data.daysRemaining === undefined) {
      const expiry = new Date(data.expiryDate || new Date())
      const today = new Date()
      needsUpdate.daysRemaining = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    }
    if (data.isLifetime === undefined) needsUpdate.isLifetime = false
    if (!data.paymentStatus) needsUpdate.paymentStatus = data.status === 'active' ? 'paid' : 'pending'
    if (!data.paymentMethod) needsUpdate.paymentMethod = 'Not Set'
    if (!data.paymentCurrency) needsUpdate.paymentCurrency = 'INR'
    if (!data.currency) needsUpdate.currency = data.paymentCurrency || 'INR'
    if (data.transactionId === undefined) needsUpdate.transactionId = null
    if (!data.amount) needsUpdate.amount = calculateSubscriptionAmount(data.planType || data.plan || 'Standard')
    if (!data.paidAt && (data.paymentStatus === 'paid' || data.status === 'active')) needsUpdate.paidAt = serverTimestamp()
    if (data.autoRenew === undefined) needsUpdate.autoRenew = true
    if (!data.createdAt) needsUpdate.createdAt = serverTimestamp()
    needsUpdate.updatedAt = serverTimestamp()

    if (Object.keys(needsUpdate).length > 0) {
      updates.push(updateDoc(doc(db, 'subscriptions', doc.id), needsUpdate))
    }
  })

  if (updates.length > 0) {
    await Promise.allSettled(updates)
    return { migrated: updates.length, total: snapshot.size }
  }

  return { migrated: 0, total: snapshot.size }
}

// ── superAdmins collection removed ──────────────────────────
// isSuperAdmin is now a boolean field on the user document.
// See AuthContext.jsx and rbac.js for the new approach.
// ───────────────────────────────────────────────────────────