// src/services/firestoreService.js

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'

import { db } from '../firebase'

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

  await deleteDoc(memberRef)
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
          id: doc.id,
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

  await updateDoc(paymentRef, {
    ...updatedData,

    amount:
      Number(updatedData.amount) || 0,
  })
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

  const docRef = await addDoc(
    collection(db, 'trainers'),
    {
      ...trainerData,
      createdAt: serverTimestamp(),
    }
  )

  return docRef.id
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

  await deleteDoc(trainerRef)
}