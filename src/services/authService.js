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
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

// ─────────────────────────────────────────────────────────────
// SIGNUP: Create Firebase Auth user + Firestore /users/{uid}
// Role is ALWAYS 'pending' - no exceptions
// ─────────────────────────────────────────────────────────────
export async function signUp({ name, email, password }) {
  try {
    // 1. Create Firebase Auth account
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const user = result.user

    // 2. Create /users/{uid} document with role: 'pending'
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      name: name || '',
      role: 'pending', // ← ALWAYS pending
      createdAt: serverTimestamp(),
      })

    return { uid: user.uid, email: user.email }
  } catch (err) {
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// SIGNIN: Authenticate user + check role from /users/{uid}
// Returns: { user, role }
// ─────────────────────────────────────────────────────────────
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

    // 3. If pending, immediately sign out
    if (role === 'pending') {
      await signOut(auth)
      throw new Error('pending')
    }

    return { user, role }
  } catch (err) {
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// LOGOUT: Sign out from Firebase
// ─────────────────────────────────────────────────────────────
export async function logOut() {
  try {
    await signOut(auth)
  } catch (err) {
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// PASSWORD RESET: Send reset email
// ─────────────────────────────────────────────────────────────
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (err) {
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// GET USER PROFILE: Read /users/{uid} document
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// SUBSCRIBE TO AUTH: Real-time auth state listener
// ─────────────────────────────────────────────────────────────
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Approve a pending user
// Updates /users/{uid}.role from 'pending' to 'member'|'trainer'
// ─────────────────────────────────────────────────────────────
export async function approveUser(uid, newRole) {
  try {
    if (!['member', 'trainer'].includes(newRole)) {
      throw new Error('Invalid role')
    }
    await updateDoc(doc(db, 'users', uid), { role: newRole })
  } catch (err) {
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Get all pending users
// ─────────────────────────────────────────────────────────────
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