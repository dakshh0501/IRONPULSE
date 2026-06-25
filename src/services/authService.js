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

    // 2. Get role from /users/{uid}
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    if (!userDoc.exists()) {
      throw new Error('User profile not found')
    }

    const role = userDoc.data().role

    // 3. If pending or gym_owner_pending, immediately sign out
    if (role === 'pending' || role === 'gym_owner_pending') {
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

export async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return snap.data()
  } catch (err) {
    console.error('getUserProfile error:', err)
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
