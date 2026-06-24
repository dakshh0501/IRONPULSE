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
  createUserWithEmailAndPassword
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

// ─────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────

// Add new member
export async function addMember(memberData) {

  const docRef = await addDoc(
    collection(db, 'members'),
    {
      ...memberData,

      // Safe defaults
      status:
        memberData.status || 'Active',

      plan:
        memberData.plan || 'Monthly',

      amountPaid:
        Number(memberData.amountPaid) || 0,

      checkins:
        Number(memberData.checkins) || 0,

      createdAt:
        serverTimestamp(),
    }
  )

  return docRef.id
}

// Realtime members listener
export function subscribeToMembers(callback) {

  return onSnapshot(
    collection(db, 'members'),

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

  await updateDoc(memberRef, {
    ...updatedData,

    // Keep numeric values safe
    amountPaid:
      Number(updatedData.amountPaid) || 0,

    checkins:
      Number(updatedData.checkins) || 0,
  })
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
export function subscribeToPayments(callback) {

  return onSnapshot(
    collection(db, 'payments'),

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
        createdAt: serverTimestamp(),
      }
    )

    const docRef = await addDoc(
      collection(db, 'trainers'),
      {
        ...trainerData,
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
export function subscribeToTrainers(callback) {

  return onSnapshot(
    collection(db, 'trainers'),
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
      status: ticketData.status || 'Open',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

// ─────────────────────────────────────────────
// FEATURE REQUESTS
// ─────────────────────────────────────────────

export async function addFeatureRequest(requestData) {
  const docRef = await addDoc(
    collection(db, 'featureRequests'),
    {
      ...requestData,
      status: requestData.status || 'Under Review',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

// Read settings document from /settings/{docId}
export async function getSettings(docId = 'gym') {
  const snap = await getDoc(doc(db, 'settings', docId))
  return snap.exists() ? snap.data() : null
}

// Write (merge) settings document to /settings/{docId}
export async function saveSettings(docId = 'gym', data) {
  await setDoc(doc(db, 'settings', docId), data, { merge: true })
}

// ─────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────

// Realtime plans listener
export function subscribeToPlans(callback) {
  return onSnapshot(
    collection(db, 'plans'),
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

// Migrate default plans if collection is empty
export async function migrateDefaultPlans() {
  const snapshot = await getDocs(collection(db, 'plans'))
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
    await addDoc(collection(db, 'plans'), { ...plan, createdAt: serverTimestamp() })
  }
  return true
}