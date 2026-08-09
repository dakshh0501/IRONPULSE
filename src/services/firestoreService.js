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
  where,
  limit,
  orderBy,
  increment
} from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
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
import { generateUniqueReferralCode } from '../utils/referralCode'

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
      try { await sendEmailVerification(user) } catch (e) {
        console.warn('sendEmailVerification non-fatal:', e)
      }
      try { await secondaryAuth.signOut() } catch (e) {
        console.warn('secondaryAuth signOut non-fatal:', e)
      }

      let referralCode = ''
      try {
        referralCode = await generateUniqueReferralCode()
      } catch (e) {
        console.warn('Failed to generate referral code (non-blocking):', e)
      }

      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          email: user.email,
          name: cleanData.name || '',
          role: 'member',
          gymId: cleanData.gymId || DEFAULT_GYM_ID,
          referralCode,
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
      try { await deleteDoc(doc(db, 'users', user.uid)) } catch (cleanupErr) {
        console.error('Failed to cleanup users doc:', cleanupErr)
      }
      try { await user.delete() } catch (cleanupErr) {
        console.error('Failed to cleanup auth user:', cleanupErr)
      }
    }
    throw error
  }
}

// Trainer-scoped members subscription (trainer role — only assigned members)
export function subscribeToMyMembers(trainerAuthUid, callback, gymId, onError) {
  if (!trainerAuthUid) { console.warn('[Firestore] subscribeToMyMembers called without trainerAuthUid'); return () => {} }
  const ref = gymId
    ? query(collection(db, 'members'), where('gymId', '==', gymId), where('trainerAuthUid', '==', trainerAuthUid), limit(2000))
    : query(collection(db, 'members'), where('trainerAuthUid', '==', trainerAuthUid), limit(2000))
  return onSnapshot(
    ref,
    (snapshot) => {
      const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(members)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myMembers):`, error.message); if (onError) onError(error, 'myMembers')
    }
  )
}

// Backfill trainerAuthUid on existing member docs (one-time migration)
export async function backfillTrainerAuthUid(gymId) {
  if (!gymId) return 0
  let updated = 0
  try {
    const q = query(collection(db, 'members'), where('gymId', '==', gymId))
    const snap = await getDocs(q)
    const batches = []
    snap.forEach(d => {
      const data = d.data()
      if (data.trainerId && !data.trainerAuthUid) {
        batches.push({ ref: d.ref, trainerId: data.trainerId })
      }
    })
    for (const batch of batches) {
      const trainerDoc = await getDoc(doc(db, 'trainers', batch.trainerId))
      if (trainerDoc.exists()) {
        const authUid = trainerDoc.data().authUid
        if (authUid) {
          await updateDoc(batch.ref, { trainerAuthUid: authUid })
          updated++
        }
      }
    }
  } catch (e) {
    console.error('[Firestore] backfillTrainerAuthUid error:', e)
  }
  return updated
}

// Realtime members listener
export function subscribeToMembers(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'members'), where('gymId', '==', gymId), limit(2000))
    : query(collection(db, 'members'), limit(2000))

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

// Member self-subscription (member role - own record only)
export function subscribeToMyMember(authUid, callback, onError) {
  if (!authUid) return () => {}
  const q = query(collection(db, 'members'), where('authUid', '==', authUid), limit(2000))
  return onSnapshot(
    q,
    (snapshot) => {
      const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(members)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myMember):`, error.message); if (onError) onError(error, 'myMember')
    }
  )
}

// Member self-payments subscription (member role - own records only)
export function subscribeToMyPayments(authUid, callback, gymId, onError) {
  if (!authUid) return () => {}
  const q = gymId
    ? query(collection(db, 'payments'), where('gymId', '==', gymId), where('authUid', '==', authUid), limit(2000))
    : query(collection(db, 'payments'), where('authUid', '==', authUid), limit(2000))
  return onSnapshot(
    q,
    (snapshot) => {
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(payments)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myPayments):`, error.message); if (onError) onError(error, 'myPayments')
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

  const memberName = memberData.name

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

  // Clean up orphaned documents in related collections
  const cleanupQueries = []

  // Attendance records — always try both authUid (primary) and memberId (fallback)
  const attendanceQuery = authUid
    ? query(collection(db, 'attendance'), where('memberId', '==', authUid))
    : query(collection(db, 'attendance'), where('memberId', '==', memberId))
  cleanupQueries.push(
    getDocs(attendanceQuery)
      .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
      .catch(() => {})
  )
  if (authUid) {
    // Notifications use userId = authUid
    cleanupQueries.push(
      getDocs(query(collection(db, 'notifications'), where('userId', '==', authUid)))
        .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
        .catch(() => {})
    )
  }
  // Payments use memberId = doc ID or authUid; match both
  cleanupQueries.push(
    getDocs(query(collection(db, 'payments'), where('memberId', '==', memberId)))
      .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
      .catch(() => {})
  )
  // ProgressLogs use memberId = doc ID
  cleanupQueries.push(
    getDocs(query(collection(db, 'progressLogs'), where('memberId', '==', memberId)))
      .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
      .catch(() => {})
  )
  // DietPlans use memberId = doc ID
  cleanupQueries.push(
    getDocs(query(collection(db, 'dietPlans'), where('memberId', '==', memberId)))
      .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
      .catch(() => {})
  )
  // WorkoutPlans use memberId = doc ID
  cleanupQueries.push(
    getDocs(query(collection(db, 'workoutPlans'), where('memberId', '==', memberId)))
      .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
      .catch(() => {})
  )
  // Also match by memberName as fallback
  if (memberName) {
    cleanupQueries.push(
      getDocs(query(collection(db, 'dietPlans'), where('assignedMember', '==', memberName)))
        .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
        .catch(() => {})
    )
    cleanupQueries.push(
      getDocs(query(collection(db, 'workoutPlans'), where('assignedMember', '==', memberName)))
        .then(snap => Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref))))
        .catch(() => {})
    )
  }
  // Nullify trainer references on this member's attendance records
  if (memberName) {
    cleanupQueries.push(
      getDocs(query(collection(db, 'attendance'), where('memberName', '==', memberName)))
        .then(snap => Promise.allSettled(snap.docs.map(d => updateDoc(d.ref, { trainerId: '', trainerName: '' }))))
        .catch(() => {})
    )
  }
  await Promise.allSettled(cleanupQueries)

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
    ? query(collection(db, 'payments'), where('gymId', '==', gymId), limit(2000))
    : query(collection(db, 'payments'), limit(2000))

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

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const array = new Uint32Array(8)
  crypto.getRandomValues(array)
  let p = ''
  for (let i = 0; i < 8; i++) p += chars[array[i] % chars.length]
  const s = upper[array[0] % upper.length]
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

    try { await sendEmailVerification(user) } catch (e) {
      console.warn('sendEmailVerification non-fatal:', e)
    }
    try { await secondaryAuth.signOut() } catch (e) {
      console.warn('secondaryAuth signOut non-fatal:', e)
    }

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
    if (user) {
      try { await deleteDoc(doc(db, 'users', user.uid)) } catch (cleanupErr) {
        console.error('Failed to cleanup users doc:', cleanupErr)
      }
      try { await user.delete() } catch (cleanupErr) {
        console.error('Failed to cleanup auth user:', cleanupErr)
      }
    }
    throw error
  }
}

// Subscribe realtime trainers
export function subscribeToTrainers(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'trainers'), where('gymId', '==', gymId), limit(500))
    : query(collection(db, 'trainers'), limit(500))

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

  // Nullify trainer references on diet plans (matched by trainer name)
  if (trainerData.name) {
    try {
      const dietQ = query(collection(db, 'dietPlans'), where('assignedTrainer', '==', trainerData.name))
      const dietSnap = await getDocs(dietQ)
      const dietUpdates = dietSnap.docs.map(d => updateDoc(doc(db, 'dietPlans', d.id), { assignedTrainer: '' }))
      if (dietUpdates.length > 0) await Promise.allSettled(dietUpdates)
    } catch (dErr) {
      console.error('deleteTrainer: failed to cleanup diet plan refs:', dErr)
    }

    try {
      const workoutQ = query(collection(db, 'workoutPlans'), where('trainer', '==', trainerData.name))
      const workoutSnap = await getDocs(workoutQ)
      const workoutUpdates = workoutSnap.docs.map(d => updateDoc(doc(db, 'workoutPlans', d.id), { trainer: '' }))
      if (workoutUpdates.length > 0) await Promise.allSettled(workoutUpdates)
    } catch (wErr) {
      console.error('deleteTrainer: failed to cleanup workout plan refs:', wErr)
    }
  }

  // Nullify trainer references on attendance records
  try {
    const attQ = query(collection(db, 'attendance'), where('trainerId', '==', trainerId))
    const attSnap = await getDocs(attQ)
    const attUpdates = attSnap.docs.map(d => updateDoc(doc(db, 'attendance', d.id), { trainerId: '', trainerName: '' }))
    if (attUpdates.length > 0) await Promise.allSettled(attUpdates)
  } catch (aErr) {
    console.error('deleteTrainer: failed to cleanup attendance refs:', aErr)
  }

  // Nullify trainer references on progress logs
  try {
    const progQ = query(collection(db, 'progressLogs'), where('trainerId', '==', trainerId))
    const progSnap = await getDocs(progQ)
    const progUpdates = progSnap.docs.map(d => updateDoc(doc(db, 'progressLogs', d.id), { trainerId: '', trainerName: '' }))
    if (progUpdates.length > 0) await Promise.allSettled(progUpdates)
  } catch (pErr) {
    console.error('deleteTrainer: failed to cleanup progress log refs:', pErr)
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
      createdBy: ticketData.createdBy || '',
      status: ticketData.status || 'Open',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

export function subscribeToSupportTickets(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'supportTickets'), where('gymId', '==', gymId), limit(500))
    : query(collection(db, 'supportTickets'), limit(500))

  return onSnapshot(ref, (snapshot) => {
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(tickets)
  }, (error) => {
    console.error(`[Firestore] Subscription error (supportTickets):`, error.message); if (onError) onError(error, 'supportTickets')
  })
}

// ─────────────────────────────────────────────
// CONTACT MESSAGES (Landing page)
// ─────────────────────────────────────────────

export async function addContactMessage(msgData) {
  const docRef = await addDoc(
    collection(db, 'contactMessages'),
    {
      ...msgData,
      status: 'New',
      createdAt: serverTimestamp(),
    }
  )
  const contactId = docRef.id
  try {
    await addDoc(collection(db, 'notifications'), {
      title: 'New Contact Message',
      message: `${msgData.name || 'Someone'} submitted a contact enquiry.`,
      type: 'contact',
      subtype: 'contact_message',
      priority: 'normal',
      icon: '✉️',
      targetRole: 'super_admin',
      userId: '',
      gymId: 'default',
      role: '',
      page: 'support',
      tab: 'messages',
      contactId,
      actionUrl: '/support?tab=messages',
      relatedDocumentId: contactId,
      read: false,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[Firestore] Failed to create notification for contact message:', e)
  }
  return contactId
}

export function subscribeToContactMessages(callback, onError) {
  const ref = query(collection(db, 'contactMessages'), where('status', 'in', ['New', 'Read']), limit(500))
  return onSnapshot(ref, (snapshot) => {
    const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(msgs)
  }, (error) => {
    console.error(`[Firestore] Subscription error (contactMessages):`, error.message); if (onError) onError(error, 'contactMessages')
  })
}

export async function updateContactMessage(msgId, data) {
  await updateDoc(doc(db, 'contactMessages', msgId), data)
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
      createdBy: requestData.createdBy || '',
      status: requestData.status || 'Under Review',
      createdAt: serverTimestamp(),
    }
  )
  return docRef.id
}

export function subscribeToFeatureRequests(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'featureRequests'), where('gymId', '==', gymId), limit(500))
    : query(collection(db, 'featureRequests'), limit(500))

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
    ? query(collection(db, 'progressLogs'), where('gymId', '==', gymId), limit(1000))
    : query(collection(db, 'progressLogs'), limit(1000))

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
  const ref = query(collection(db, 'progressLogs'), where('authUid', '==', authUid), limit(500))
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
    ? query(collection(db, 'plans'), where('gymId', '==', gymId), limit(1000))
    : query(collection(db, 'plans'), limit(1000))

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
    ? query(collection(db, 'dietPlans'), where('gymId', '==', gymId), limit(1000))
    : query(collection(db, 'dietPlans'), limit(1000))

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

// Member-scoped diet plans subscription (own assigned plans)
export function subscribeToMyAssignedDietPlans(authUid, callback, gymId, onError) {
  if (!authUid) return () => {}
  const ref = gymId
    ? query(collection(db, 'dietPlans'), where('gymId', '==', gymId), where('authUid', '==', authUid), limit(500))
    : query(collection(db, 'dietPlans'), where('authUid', '==', authUid), limit(500))
  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myAssignedDietPlans):`, error.message); if (onError) onError(error, 'myAssignedDietPlans')
    }
  )
}

// Trainer-scoped diet plans subscription
export function subscribeToMyDietPlans(trainerAuthUid, callback, gymId, onError) {
  if (!trainerAuthUid) { console.warn('[Firestore] subscribeToMyDietPlans called without trainerAuthUid'); return () => {} }
  const ref = gymId
    ? query(collection(db, 'dietPlans'), where('gymId', '==', gymId), where('assignedTrainerAuthUid', '==', trainerAuthUid), limit(500))
    : query(collection(db, 'dietPlans'), where('assignedTrainerAuthUid', '==', trainerAuthUid), limit(500))
  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myDietPlans):`, error.message); if (onError) onError(error, 'myDietPlans')
    }
  )
}

export async function addDietPlan(planData) {
  const docRef = await addDoc(
    collection(db, 'dietPlans'),
    { ...planData, gymId: planData.gymId || DEFAULT_GYM_ID, createdAt: serverTimestamp(), versions: [] }
  )
  return docRef.id
}

// Version snapshot helper (Sprint 78B — req 7): compact previous
// state kept on the SAME document, never a separate collection.
function snapshotPlan(plan) {
  if (!plan) return null
  const base = { savedAt: new Date().toISOString(), name: plan.name, goal: plan.goal }
  if (Array.isArray(plan.meals)) {
    return {
      ...base,
      calories: plan.calories,
      protein: plan.protein,
      carbs: plan.carbs,
      fat: plan.fat,
      hydration: plan.hydration,
      meals: (plan.meals || []).map(m => m?.name).filter(Boolean),
    }
  }
  return {
    ...base,
    level: plan.level,
    days: plan.days,
    duration: plan.duration,
    split: plan.split,
    exercises: (plan.exercises || []).map(e => e?.name).filter(Boolean),
  }
}

export async function updateDietPlan(planId, updatedData) {
  const prevDoc = await getDoc(doc(db, 'dietPlans', planId))
  const prevData = prevDoc.exists() ? prevDoc.data() : null
  const versions = Array.isArray(prevData?.versions) ? prevData.versions.slice(0, 4) : []
  const snap = snapshotPlan(prevData)
  if (snap) versions.push(snap)
  await updateDoc(doc(db, 'dietPlans', planId), {
    ...updatedData,
    versions: versions.slice(-5),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDietPlan(planId) {
  await deleteDoc(doc(db, 'dietPlans', planId))
}

// ─────────────────────────────────────────────
// WORKOUT PLANS
// ─────────────────────────────────────────────

export function subscribeToWorkoutPlans(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'workoutPlans'), where('gymId', '==', gymId), limit(1000))
    : query(collection(db, 'workoutPlans'), limit(1000))

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

// Member-scoped workout plans subscription (own assigned plans)
export function subscribeToMyAssignedWorkoutPlans(authUid, callback, gymId, onError) {
  if (!authUid) return () => {}
  const ref = gymId
    ? query(collection(db, 'workoutPlans'), where('gymId', '==', gymId), where('authUid', '==', authUid), limit(500))
    : query(collection(db, 'workoutPlans'), where('authUid', '==', authUid), limit(500))
  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myAssignedWorkoutPlans):`, error.message); if (onError) onError(error, 'myAssignedWorkoutPlans')
    }
  )
}

// Trainer-scoped workout plans subscription
export function subscribeToMyWorkoutPlans(trainerAuthUid, callback, gymId, onError) {
  if (!trainerAuthUid) { console.warn('[Firestore] subscribeToMyWorkoutPlans called without trainerAuthUid'); return () => {} }
  const ref = gymId
    ? query(collection(db, 'workoutPlans'), where('gymId', '==', gymId), where('trainerAuthUid', '==', trainerAuthUid), limit(500))
    : query(collection(db, 'workoutPlans'), where('trainerAuthUid', '==', trainerAuthUid), limit(500))
  return onSnapshot(
    ref,
    (snapshot) => {
      const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(plans)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (myWorkoutPlans):`, error.message); if (onError) onError(error, 'myWorkoutPlans')
    }
  )
}

export async function addWorkoutPlan(planData) {
  const docRef = await addDoc(
    collection(db, 'workoutPlans'),
    { ...planData, gymId: planData.gymId || DEFAULT_GYM_ID, createdAt: serverTimestamp(), versions: [] }
  )
  return docRef.id
}

export async function updateWorkoutPlan(planId, updatedData) {
  const prevDoc = await getDoc(doc(db, 'workoutPlans', planId))
  const prevData = prevDoc.exists() ? prevDoc.data() : null
  const versions = Array.isArray(prevData?.versions) ? prevData.versions.slice(0, 4) : []
  const snap = snapshotPlan(prevData)
  if (snap) versions.push(snap)
  await updateDoc(doc(db, 'workoutPlans', planId), {
    ...updatedData,
    versions: versions.slice(-5),
    updatedAt: serverTimestamp(),
  })
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
    query(collection(db, 'gyms'), limit(500)),
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
  const gymRef = doc(collection(db, 'gyms'))
  const data = {
    ...gymData,
    gymId: gymRef.id,
    ownerUid,
    approvalStatus: 'pending',
    createdAt: serverTimestamp(),
  }
  try {
    await setDoc(gymRef, data)
    return gymRef.id
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
    query(collection(db, 'subscriptions'), limit(500)),
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

// ─────────────────────────────────────────────
// PLAN TEMPLATES (Sprint 78B, req 6)
// Staff-scoped reusable plan templates. On-demand getDocs only —
// deliberately NO onSnapshot listener here.
// ─────────────────────────────────────────────
export async function savePlanTemplate({ type, name, plan, gymId }) {
  const docRef = await addDoc(
    collection(db, 'planTemplates'),
    { type, name, plan, gymId: gymId || DEFAULT_GYM_ID, createdAt: serverTimestamp() }
  )
  return docRef.id
}

export async function listPlanTemplates(type, gymId) {
  const ref = gymId
    ? query(collection(db, 'planTemplates'), where('type', '==', type), where('gymId', '==', gymId), limit(200))
    : query(collection(db, 'planTemplates'), where('type', '==', type), limit(200))
  const snapshot = await getDocs(ref)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

export async function deletePlanTemplate(templateId) {
  await deleteDoc(doc(db, 'planTemplates', templateId))
}

// ─────────────────────────────────────────────
// WHATSAPP AUTOMATION (Sprint 79A)
//   whatsappLogs — send log records (written by the engine)
//   settings/{gymId}:whatsapp — automation config (one-shot reads)
// ─────────────────────────────────────────────

export async function addWhatsappLog(record) {
  await addDoc(
    collection(db, 'whatsappLogs'),
    {
      memberId: String(record.memberId || ''),
      phone: String(record.phone || ''),
      template: String(record.template || ''),
      provider: String(record.provider || 'mock'),
      status: String(record.status || 'Queued'),
      attempts: Number(record.attempts) || 0,
      error: String(record.error || ''),
      entryId: String(record.entryId || ''),
      test: Boolean(record.test),
      gymId: record.gymId || DEFAULT_GYM_ID,
      createdAt: serverTimestamp(),
    }
  )
}

/** Single live subscription — used ONLY by AppContext (no duplicates). */
export function subscribeToWhatsappLogs(callback, gymId, onError) {
  const ref = gymId
    ? query(collection(db, 'whatsappLogs'), where('gymId', '==', gymId), orderBy('createdAt', 'desc'), limit(300))
    : query(collection(db, 'whatsappLogs'), orderBy('createdAt', 'desc'), limit(300))
  return onSnapshot(
    ref,
    (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      callback(logs)
    },
    (error) => {
      console.error(`[Firestore] Subscription error (whatsappLogs):`, error.message); if (onError) onError(error, 'whatsappLogs')
    }
  )
}

export async function getWhatsAppAutomationConfig(gymId) {
  try {
    const docRef = doc(db, 'settings', `${gymId || DEFAULT_GYM_ID}:whatsapp`)
    const snap = await getDoc(docRef)
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

export async function saveWhatsAppAutomationConfig(gymId, config) {
  await setDoc(doc(db, 'settings', `${gymId || DEFAULT_GYM_ID}:whatsapp`), config)
}

// ─────────────────────────────────────────────
// WHATSAPP CAMPAIGNS (Sprint 79B)
//   whatsappCampaigns — campaign docs, updated per run.
//   ONE-SHOT reads only (NO onSnapshot — requirement: no new
//   realtime listeners; the page refreshes on mount + actions).
// ─────────────────────────────────────────────

export async function listWhatsappCampaigns(gymId, limitN = 200) {
  try {
    const ref = gymId
      ? query(collection(db, 'whatsappCampaigns'), where('gymId', '==', gymId), orderBy('createdAt', 'desc'), limit(limitN))
      : query(collection(db, 'whatsappCampaigns'), orderBy('createdAt', 'desc'), limit(limitN))
    const snap = await getDocs(ref)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('listWhatsappCampaigns error:', err)
    return []
  }
}

export async function createWhatsappCampaign(campaign) {
  const ref = await addDoc(collection(db, 'whatsappCampaigns'), {
    ...campaign,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateWhatsappCampaign(id, patch) {
  await updateDoc(doc(db, 'whatsappCampaigns', id), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

/** Atomic stat increment (stats.sent / stats.failed). */
export async function bumpWhatsappCampaignStats(id, delta) {
  const camRef = doc(db, 'whatsappCampaigns', id)
  await updateDoc(camRef, {
    ['stats.' + delta.field]: increment(delta.by || 1),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteWhatsappCampaign(id) {
  await deleteDoc(doc(db, 'whatsappCampaigns', id))
}
// ───────────────────────────────────────────────────────────