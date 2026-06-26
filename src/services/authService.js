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
import { auth, db, firebaseConfig } from '../firebase'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Secondary auth instance for creating trainer accounts and gym owner accounts
// so the admin stays logged in on the main auth instance
const secondaryApp = initializeApp(firebaseConfig, 'secondary')
const secondaryAuth = getAuth(secondaryApp)

export async function signUp({ name, email, password, gymData, role }) {
  let userUid = null
  let authUser = null

  try {
    // 1. Create Firebase Auth account using secondaryAuth
    const authResult = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    authUser = authResult.user
    userUid = authUser.uid

    // 2. Create user document with role parameter
    const userData = {
      uid: userUid,
      email: user.email,
      name: name || '',
      role: role || 'pending', // default 'pending' if not specified
      gymId: gymData?.gymId || 'default',
      createdAt: serverTimestamp(),
    }

    await setDoc(doc(db, 'users', userUid), userData)

    // 3. Create gym document if role is gym_owner_pending
    if (role === 'gym_owner_pending') {
      await addGym(gymData, userUid)
    }

    // 4. Clean up secondary auth - admin stays logged in on main instance
    await secondaryAuth.signOut()

    return { uid: userUid, email }

  } catch (err) {
    // Cleanup: if auth creation succeeded but Firestore failed, delete auth user
    if (authUser) {
      try {
        await authUser.delete()
      } catch (cleanupErr) {
        console.error('Failed to cleanup auth user:', cleanupErr)
      }
    }
    throw err
  }
}

export async function signIn(email, password) {
  try {
    // 1. Authenticate with Firebase
    const result = await signInWithEmailAndPassword(auth, email, password)
    const user = result.user

    console.log('[AUDIT] signIn authenticated UID:', user.uid)
    console.log('[AUDIT] signIn auth.providerId:', user.providerData?.[0]?.providerId)
    console.log('[AUDIT] signIn db._firestoreClient?', !!db?._firestoreClient)
    console.log('[AUDIT] signIn Firestore projectId:', db?._databaseId?.projectId || db?.app?.options?.projectId)
    console.log('[AUDIT] signIn Firestore database:', db?._databaseId?.database)

    // 2. Get role from /users/{uid}
    const userRef = doc(db, 'users', user.uid)
    console.log('[AUDIT] signIn reading doc path:', userRef.path)

    let userDoc = await getDoc(userRef)
    console.log('[AUDIT] signIn getDoc.exists():', userDoc.exists())
    if (!userDoc.exists()) {
      console.log('[AUDIT] signIn first getDoc returned !exists() — attempting recovery')
      const recovered = await recoverUserProfile(user.uid, user.email)
      console.log('[AUDIT] signIn recoverUserProfile returned:', recovered ? 'recovered' : 'null')
      if (recovered) {
        userDoc = await getDoc(doc(db, 'users', user.uid))
        console.log('[AUDIT] signIn second getDoc.exists():', userDoc.exists())
      }
    }

    if (!userDoc || !userDoc.exists()) {
      console.log('[AUDIT] signIn: throwing "User profile not found" after all recovery attempts')
      await signOut(auth)
      throw new Error('User profile not found')
    }

    const role = userDoc.data().role
    console.log('[AUDIT] signIn role:', role)

    // 3. If pending or gym_owner_pending, immediately sign out
    if (role === 'pending' || role === 'gym_owner_pending') {
      await signOut(auth)
      throw new Error('pending')
    }

    return { user, role }
  } catch (err) {
    console.log('[AUDIT] signIn error:', err.code || err.name, err.message)
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
    console.log('[AUDIT] getUserProfile path:', ref.path)
    const snap = await getDoc(ref)
    console.log('[AUDIT] getUserProfile exists():', snap.exists())
    if (snap.exists()) return snap.data()

    console.log('[AUDIT] getUserProfile: doc not found, attempting recovery')
    const recovered = await recoverUserProfile(uid, null)
    console.log('[AUDIT] getUserProfile recovery result:', recovered ? 'recovered' : 'null')
    return recovered
  } catch (err) {
    console.error('[AUDIT] getUserProfile error:', err.code || err.name, err.message, err.stack)
    return null
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

    await updateDoc(doc(db, 'users', uid), { role: newRole })

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

/**
 * Check if a given uid has a super admin document.
 * Returns `true` if superAdmins/{uid} exists, false otherwise.
 * This is a lightweight read — no profile fields are duplicated.
 */
export async function isSuperAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'superAdmins', uid))
    return snap.exists()
  } catch (err) {
    console.error('isSuperAdmin error:', err)
    return false
  }
}

export async function getPendingUsers() {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'pending')
    )
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
