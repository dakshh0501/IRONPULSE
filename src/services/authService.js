// src/services/authService.js

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  getAuth,
} from 'firebase/auth'
import {
  doc, setDoc, getDoc, serverTimestamp,
  collection, query, where, getDocs, updateDoc, addDoc,
} from 'firebase/firestore'
import { initializeApp } from 'firebase/app'
import { auth, db, firebaseConfig } from '../firebase'

// ─── Secondary Firebase app ───────────────────────────────────
// Used to create member Auth accounts without logging out the admin.
// initializeApp with a unique name creates an isolated auth session.
let secondaryApp  = null
let secondaryAuth = null

function getSecondaryAuth() {
  if (!secondaryAuth) {
    secondaryApp  = initializeApp(firebaseConfig, 'secondary')
    secondaryAuth = getAuth(secondaryApp)
  }
  return secondaryAuth
}

// ─── Create Member Account (admin only) ──────────────────────
// Uses secondary auth so admin session is never interrupted.
// Returns authUid to store in the member's Firestore doc.
export async function createMemberAccount({ name, email, password }) {
  const secondary = getSecondaryAuth()

  // Create Auth account in isolated secondary session
  const result = await createUserWithEmailAndPassword(secondary, email, password)
  const user   = result.user

  // Set display name
  await updateProfile(user, { displayName: name })

  // Write /users/{uid} doc with role: 'member'
  await setDoc(doc(db, 'users', user.uid), {
    uid:       user.uid,
    name,
    email,
    role:      'member',
    joinDate:  serverTimestamp(),
    plan:      'monthly',
    phone:     '',
    avatarUrl: '',
  })

  // Sign out of secondary session immediately — keeps it clean
  await signOut(secondary)

  return user.uid
}

// ─── Sign Up (self-registration) ─────────────────────────────
export async function signUp({ name, email, password, role = 'member' }) {
  const safeRole = ['member', 'trainer'].includes(role) ? role : 'member'
  let user

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    user = result.user
  } catch (err) {
    console.log('SIGNUP FIREBASE ERROR:', err.code, err.message)
    throw err
  }

  await updateProfile(user, { displayName: name })

  await setDoc(doc(db, 'users', user.uid), {
    uid:       user.uid,
    name,
    email,
    role:      safeRole,
    joinDate:  serverTimestamp(),
    plan:      safeRole === 'member' ? 'monthly' : null,
    phone:     '',
    avatarUrl: '',
  })

  if (safeRole === 'member') {
    const q    = query(collection(db, 'members'), where('email', '==', email))
    const snap = await getDocs(q)
    if (!snap.empty) {
      await updateDoc(snap.docs[0].ref, { authUid: user.uid })
    } else {
      await addDoc(collection(db, 'members'), {
        name, email,
        authUid:    user.uid,
        status:     'Active',
        plan:       'Standard',
        amountPaid: 0,
        checkins:   0,
        createdAt:  serverTimestamp(),
      })
    }
  }

  return user
}

// ─── Sign In ──────────────────────────────────────────────────
export async function signIn(email, password) {
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  const role = await getUserRole(user.uid)
  return { user, role }
}

// ─── Sign Out ─────────────────────────────────────────────────
export async function logOut() {
  await signOut(auth)
}

// ─── Password Reset ───────────────────────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email)
}

// ─── Get Role ─────────────────────────────────────────────────
export async function getUserRole(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) throw new Error('Account has been removed')
  return snap.data().role
}

// ─── Get Profile ──────────────────────────────────────────────
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return snap.data()
}

// ─── Auth State Observer ──────────────────────────────────────
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}