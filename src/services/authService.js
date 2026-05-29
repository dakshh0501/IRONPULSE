// src/services/authService.js
// All Firebase Auth operations. Import these in AuthContext — never call firebase/auth directly from components.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

// ─── Sign Up ────────────────────────────────────────────────────────────────
// Creates auth user + writes profile doc to /users/{uid}
export async function signUp({
    name,
    email,
    password,
    role = 'member'
  }) {

  // Prevent frontend admin creation
  const safeRole =
    ['member', 'trainer'].includes(role)
      ? role
      : 'member'
  const { user } = await createUserWithEmailAndPassword(auth, email, password)

  // Set display name on the Auth profile
  await updateProfile(user, { displayName: name })

  // Write user doc to Firestore
  await setDoc(doc(db, 'users', user.uid), {
    uid:       user.uid,
    name,
    email,
    role: safeRole,                        // 'admin' | 'trainer' | 'member'
    joinDate:  serverTimestamp(),
    plan:  safeRole === 'member' ? 'monthly' : null,
    phone:     '',
    avatarUrl: '',
  })

  // Link member account to existing member record
if (safeRole === 'member') {
  const q = query(
    collection(db, 'members'),
    where('email', '==', email)
  )

  const snap = await getDocs(q)

  if (!snap.empty) {
    const memberDoc = snap.docs[0]

    await updateDoc(memberDoc.ref, {
      authUid: user.uid,
    })
  }
}

  return user
}

// ─── Sign In ─────────────────────────────────────────────────────────────────
// Returns { user, role } so the caller can redirect immediately
export async function signIn(email, password) {
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  const role = await getUserRole(user.uid)
  return { user, role }
}

// ─── Sign Out ────────────────────────────────────────────────────────────────
export async function logOut() {
  await signOut(auth)
}

// ─── Password Reset ──────────────────────────────────────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email)
}

// ─── Get Role from Firestore ─────────────────────────────────────────────────
// Called once on login + on auth state restore
export async function getUserRole(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) {return 'member'}
  return snap.data().role   // 'admin' | 'trainer' | 'member'
}

// ─── Get Full User Profile ───────────────────────────────────────────────────
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return snap.data()
}

// ─── Auth State Observer ─────────────────────────────────────────────────────
// Pass a callback — fires on login, logout, and page refresh (persistent session)
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback)   // returns unsubscribe function
}