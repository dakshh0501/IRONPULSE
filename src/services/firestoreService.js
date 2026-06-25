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
export function subscribeToMembers(callback, gymId) {
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

  await deleteDoc(memberRef)

  if (authUid) {

    const userRef =
      doc(db, 'users', authUid)

    await deleteDoc(userRef)
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
export function subscribeToPayments(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'payments'), where('gymId', '==', gymId))
    : collection(db, 'payments')

  return onSnapshot(
    ref,

    (snapshot) => {

      const payments =
  snapshot.docs.map(doc => ({
    firestoreId: doc.id,
    ...doc.data(),
  }))
      callback(payments)
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

  const password = 'Trainer@123'

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

    return docRef.id
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
export function subscribeToTrainers(callback, gymId) {
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

  await deleteDoc(trainerRef)

  if (authUid) {

    const userRef =
      doc(db, 'users', authUid)

    await deleteDoc(userRef)
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

export function subscribeToSupportTickets(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'supportTickets'), where('gymId', '==', gymId))
    : collection(db, 'supportTickets')

  return onSnapshot(ref, (snapshot) => {
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(tickets)
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

export function subscribeToFeatureRequests(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'featureRequests'), where('gymId', '==', gymId))
    : collection(db, 'featureRequests')

  return onSnapshot(ref, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(requests)
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

// ─────────────────────────────────────────────
// PROGRESS LOGS
// ─────────────────────────────────────────────

export function subscribeToProgressLogs(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'progressLogs'), where('gymId', '==', gymId))
    : collection(db, 'progressLogs')

  return onSnapshot(
    ref,
    (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(logs)
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

// ─────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────

// Realtime plans listener (global — shared across gyms)
export function subscribeToPlans(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'plans'), where('gymId', '==', gymId))
    : collection(db, 'plans')

  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
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

export function subscribeToDietPlans(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'dietPlans'), where('gymId', '==', gymId))
    : collection(db, 'dietPlans')

  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
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

export function subscribeToWorkoutPlans(callback, gymId) {
  const ref = gymId
    ? query(collection(db, 'workoutPlans'), where('gymId', '==', gymId))
    : collection(db, 'workoutPlans')

  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
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

export function subscribeToGyms(callback) {
  return onSnapshot(
    collection(db, 'gyms'),
    (snapshot) => {
      const gyms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(gyms)
    }
  )
}

export async function addGym(gymData, ownerUid) {
  const docRef = await addDoc(
    collection(db, 'gyms'),
    {
      ...gymData,
      ownerUid,
      approvalStatus: 'pending',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
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

export function subscribeToSubscriptions(callback) {
  return onSnapshot(
    collection(db, 'subscriptions'),
    (snapshot) => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(subs)
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
function calculateSubscriptionDates(plan) {
  const now = new Date();
  let startDate, expiryDate, graceEndDate, isLifetime = false;

  switch (plan) {
    case 'Trial':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 7));
      graceEndDate = new Date(now.setDate(now.getDate() + 3));
      break;
    case 'Standard':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 30));
      graceEndDate = new Date(now.setDate(now.getDate() + 5));
      break;
    case 'Premium':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 30));
      graceEndDate = new Date(now.setDate(now.getDate() + 5));
      break;
    case 'Quarterly':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 90));
      graceEndDate = new Date(now.setDate(now.getDate() + 7));
      break;
    case 'Annual':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 365));
      graceEndDate = new Date(now.setDate(now.getDate() + 10));
      break;
    case 'Lifetime':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 9999));
      graceEndDate = new Date(now.setDate(now.getDate() + 0));
      isLifetime = true;
      break;
    case 'Day Pass':
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 1));
      graceEndDate = new Date(now.setDate(now.getDate() + 1));
      break;
    default:
      startDate = now;
      expiryDate = new Date(now.setDate(now.getDate() + 30));
      graceEndDate = new Date(now.setDate(now.getDate() + 5));
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
function calculateSubscriptionAmount(plan) {
  const planPrices = {
    'Trial': 0,
    'Standard': 9999, // ₹99.99 in paise
    'Premium': 19999, // ₹199.99 in paise
    'Quarterly': 29999, // ₹299.99 in paise
    'Annual': 99999, // ₹999.99 in paise
    'Lifetime': 499999, // ₹4999.99 in paise
    'Day Pass': 99, // ₹0.99 in paise
  };

  return planPrices[plan] || planPrices['Standard'];
}

export async function addSubscription(subData) {
  const today = new Date();
  const docRef = await addDoc(
    collection(db, 'subscriptions'),
    {
      ...subData,
      gymId: subData.gymId || 'default',
      planType: subData.plan || 'Standard',
      status: subData.status || 'trial',
      paymentStatus: subData.paymentStatus || 'pending',
      paymentMethod: subData.paymentMethod || 'Not Set',
      paymentCurrency: subData.paymentCurrency || 'INR',
      currency: subData.currency || subData.paymentCurrency || 'INR',
      transactionId: subData.transactionId || null,
      amount: subData.amount || calculateSubscriptionAmount(subData.plan || 'Standard'),
      paidAt: subData.paidAt || (subData.paymentStatus === 'paid' || subData.status === 'active' ? serverTimestamp() : null),
      autoRenew: subData.autoRenew !== undefined ? subData.autoRenew : true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...calculateSubscriptionDates(subData.plan || 'Standard'),
    }
  )
  return docRef.id
}

export async function updateSubscription(subId, updatedData) {
  const updateFields = { ...updatedData, updatedAt: serverTimestamp() }
  
  // If plan is being updated, recalculate dates and amount
  if (updatedData.plan) {
    const plan = updatedData.plan;
    const now = new Date();
    const dates = calculateSubscriptionDates(plan);
    Object.assign(updateFields, dates);
    
    // Update amount based on new plan
    if (!updateFields.amount || updatedData.plan) {
      updateFields.amount = calculateSubscriptionAmount(plan);
    }
    
    // Update status based on plan and existing status
    if (updateFields.status === 'trial') {
      updateFields.status = 'active';
      updateFields.paymentStatus = 'paid';
      updateFields.paidAt = serverTimestamp();
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
    console.log(`Migrated ${updates.length} subscription documents`)
    return { migrated: updates.length, total: snapshot.size }
  }

  console.log('No subscription documents needed migration')
  return { migrated: 0, total: snapshot.size }
}