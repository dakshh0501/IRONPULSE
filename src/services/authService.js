// src/services/authService.js
// Minimal, single-responsibility auth service
// No secondary auth complexity
// Only 4 functions: signup, signin, logout, subscribe

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth'
import { serverTimestamp } from 'firebase/firestore'
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { addGym } from './firestoreService'

export async function signUp({ name, email, password, gymData, role }) {
  let authUser = null

  // ───── Step 1: createUserWithEmailAndPassword (Auth API, not Firestore) ─────
  try {
    const authResult = await createUserWithEmailAndPassword(auth, email, password)
    authUser = authResult.user
  } catch (e) {
    console.error('[SIGNUP AUTH] createUserWithEmailAndPassword', '', e.code, e.message, e)
    throw e
  }

  // ───── Step 2: setDoc(users/{uid}) ─────
  const userData = {
    uid: authUser.uid,
    email: authUser.email,
    name: name || '',
    role: role || 'pending',
    gymId: gymData?.gymId || 'default',
    createdAt: serverTimestamp(),
  }

  try {
    await setDoc(doc(db, 'users', authUser.uid), userData)
  } catch (e) {
    console.error('[SIGNUP FIRESTORE] setDoc(users) FAILED', {
      operation: 'setDoc',
      collection: 'users',
      path: `users/${authUser.uid}`,
      code: e.code,
      message: e.message,
      error: e,
    })
    throw e
  }

  // ───── Step 3: addDoc(gyms) via addGym() ─────
  if (role === 'gym_owner_pending') {
    try {
      await addGym(gymData, authUser.uid)
    } catch (e) {
      console.error('[SIGNUP FIRESTORE] addGym FAILED', {
        operation: 'addDoc',
        collection: 'gyms',
        code: e.code,
        message: e.message,
        error: e,
      })
      throw e
    }
  }

  // ───── Step 4: signOut (Auth API, not Firestore) ─────
  try {
    await signOut(auth)
  } catch (e) {
    console.error('[SIGNUP AUTH] signOut FAILED', e.code, e.message, e)
    throw e
  }

  return { uid: authUser.uid, email }
}

export async function signIn(email, password) {
  try {
    // 1. Authenticate with Firebase
    const result = await signInWithEmailAndPassword(auth, email, password)
    const user = result.user

    // 2. Get role from /users/{uid}
    const userRef = doc(db, 'users', user.uid)

    let userDoc = await getDoc(userRef)
    if (!userDoc.exists()) {
      const recovered = await recoverUserProfile(user.uid, user.email)
      if (recovered) {
        userDoc = await getDoc(doc(db, 'users', user.uid))
      }
    }

    if (!userDoc || !userDoc.exists()) {
      await signOut(auth)
      throw new Error('User profile not found')
    }

    const role = userDoc.data().role

    // 3. If pending, gym_owner_pending, or rejected, immediately sign out
    if (role === 'pending' || role === 'gym_owner_pending' || role === 'rejected') {
      await signOut(auth)
      throw new Error('pending')
    }

    return { user, role }
  } catch (err) {
    throw err
  }
}

export async function logOut() {
  try {
    await signOut(auth)
  } catch (err) {
    throw err
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (err) {
    throw err
  }
}

/**
 * Recover a missing users/{uid} document by searching companion collections.
 *
 * Strategy (in order):
 *   1. Query `members` for authUid == uid  → role: 'member'
 *   2. Query `trainers` for authUid == uid  → role: 'trainer'
 *   3. Query `gyms`    for ownerUid == uid  → role: derived from approvalStatus
 *
 * Unrecoverable roles (no companion collection exists):
 *   - admin    → deliberate; admin accounts are never auto-recovered
 *   - pending  → login is blocked anyway by the role check
 *
 * This handles both document-ID strategies used by the app:
 *   - addMember() / addTrainer() → auto-generated doc ID + authUid field
 *   - approveUser()              → Auth UID as doc ID + authUid field
 * The same query covers both because both store authUid.
 */
export async function recoverUserProfile(uid, email) {
  try {
    // ── 1. Try members (most common for this app) ──
    const membersSnap = await getDocs(query(
      collection(db, 'members'),
      where('authUid', '==', uid)
    ))
    if (!membersSnap.empty) {
      const m = membersSnap.docs[0].data()
      const userData = {
        uid,
        email: email || m.email || '',
        name: m.name || '',
        role: 'member',
        gymId: m.gymId || 'default',
        createdAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'users', uid), userData)
      return userData
    }

    // ── 2. Try trainers ──
    const trainersSnap = await getDocs(query(
      collection(db, 'trainers'),
      where('authUid', '==', uid)
    ))
    if (!trainersSnap.empty) {
      const t = trainersSnap.docs[0].data()
      const userData = {
        uid,
        email: email || t.email || '',
        name: t.name || '',
        role: 'trainer',
        gymId: t.gymId || 'default',
        createdAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'users', uid), userData)
      return userData
    }

    // ── 3. Try gym owners (gyms collection stores ownerUid) ──
    const gymsSnap = await getDocs(query(
      collection(db, 'gyms'),
      where('ownerUid', '==', uid)
    ))
    if (!gymsSnap.empty) {
      const g = gymsSnap.docs[0].data()
      const status = g.approvalStatus || 'pending'
      // Map approvalStatus back to the user's role
      const role = status === 'approved'  ? 'gym_owner'
                 : status === 'suspended' ? 'gym_owner'  // suspension is at gym level, not user level
                 : status === 'rejected'  ? 'rejected'
                 : status === 'pending'   ? 'gym_owner_pending'
                                          : 'gym_owner_pending'
      const userData = {
        uid,
        email: email || g.email || '',
        name: g.ownerName || g.name || '',
        role,
        gymId: g.gymId || g.id || 'default',
        createdAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'users', uid), userData)
      return userData
    }

    // Not found in any companion collection — cannot recover.
    // Roles without a recoverable source: admin, pending
    return null
  } catch (err) {
    console.error('recoverUserProfile error:', err)
    return null
  }
}

export async function getUserProfile(uid) {
  try {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return snap.data()
    }

    const recovered = await recoverUserProfile(uid, null)
    return recovered
  } catch (err) {
    // Firestore error (network unavailable, permission denied, etc.)
    // This is NOT "profile not found" — re-throw so caller can retry.
    console.error('[AUDIT] getUserProfile FIRESTORE ERROR:', err.code || err.name, err.message)
    throw err
  }
}

export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}

export async function approveUser(uid, newRole) {
  try {
    if (!['member', 'trainer'].includes(newRole)) {
      throw new Error('Invalid role')
    }
    const userSnap = await getDoc(doc(db, 'users', uid))
    const userData = userSnap.exists() ? userSnap.data() : {}

    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      approvedAt: serverTimestamp(),
    })

    try {
      await addDoc(collection(db, 'auditLog'), {
        action: 'role_change',
        targetUid: uid,
        newRole,
        performedBy: auth.currentUser?.uid,
        gymId: userData.gymId || null,
        timestamp: serverTimestamp(),
      })
    } catch (e) { /* non-critical */ }

    if (newRole === 'member') {
      const memberRef = doc(db, 'members', uid)
      const memberSnap = await getDoc(memberRef)
      if (!memberSnap.exists()) {
        await setDoc(memberRef, {
          authUid: uid,
          name: userData.name || '',
          email: userData.email || '',
          status: 'Active',
          gymId: userData.gymId || 'default',
          createdAt: serverTimestamp(),
        })
      }
    }

    if (newRole === 'trainer') {
      const trainerRef = doc(db, 'trainers', uid)
      const trainerSnap = await getDoc(trainerRef)
      if (!trainerSnap.exists()) {
        await setDoc(trainerRef, {
          authUid: uid,
          name: userData.name || '',
          email: userData.email || '',
          gymId: userData.gymId || 'default',
          createdAt: serverTimestamp(),
        })
      }
    }
  } catch (err) {
    throw err
  }
}

export async function rejectUser(uid) {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid))
    const userData = userSnap.exists() ? userSnap.data() : {}

    await deleteDoc(doc(db, 'users', uid))

    try {
      await addDoc(collection(db, 'auditLog'), {
        action: 'role_change',
        targetUid: uid,
        newRole: 'rejected',
        performedBy: auth.currentUser?.uid,
        gymId: userData.gymId || null,
        timestamp: serverTimestamp(),
      })
    } catch (e) { /* non-critical */ }

    const functions = getFunctions()
    const deleteUserFn = httpsCallable(functions, 'deleteAuthUser')
    await deleteUserFn({ uid })
  } catch (err) {
    console.error('rejectUser error:', err)
    throw err
  }
}

export async function getPendingUsers(gymId) {
  try {
    const constraints = [where('role', '==', 'pending')]
    if (gymId) {
      constraints.push(where('gymId', '==', gymId))
    }
    const q = query(collection(db, 'users'), ...constraints)
    const snap = await getDocs(q)
    return snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
  } catch (err) {
    console.error('getPendingUsers error:', err)
    return []
  }
}

export async function getGymOwnerPending() {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'gym_owner_pending')
    )
    const snap = await getDocs(q)
    return snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
  } catch (err) {
    console.error('getGymOwnerPending error:', err)
    return []
  }
}

/**
 * Check if an email already has a pending gym owner registration.
 * Queries both users and gyms collections. Returns true if a pending
 * registration exists, false otherwise.
 */
export async function checkPendingGymOwnerRegistration(email) {
  try {
    // Check users collection for gym_owner_pending with this email
    const usersSnap = await getDocs(query(
      collection(db, 'users'),
      where('role', '==', 'gym_owner_pending'),
      where('email', '==', email)
    ))
    if (!usersSnap.empty) return true

    // Check gyms collection for pending approval with this email
    const gymsSnap = await getDocs(query(
      collection(db, 'gyms'),
      where('approvalStatus', '==', 'pending'),
      where('email', '==', email)
    ))
    if (!gymsSnap.empty) return true

    return false
  } catch (err) {
    console.error('checkPendingGymOwnerRegistration error:', err)
    return true
  }
}

// DEPRECATED: Use AppContext.approveGymOwner(gymId) instead.
// This function is kept for backward compatibility only and will throw if called.
export async function approveGymOwner(uid) {
  throw new Error('authService.approveGymOwner is deprecated. Use AppContext.approveGymOwner(gymId) instead — it handles gym, user, and subscription updates atomically.')
}

// DEPRECATED: Use AppContext.rejectGymOwner(gymId) instead.
// This function is kept for backward compatibility only and will throw if called.
export async function rejectGymOwner(uid) {
  throw new Error('authService.rejectGymOwner is deprecated. Use AppContext.rejectGymOwner(gymId) instead — it handles gym and user updates atomically.')
}
