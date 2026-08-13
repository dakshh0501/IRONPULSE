// src/services/authService.js
// Minimal, single-responsibility auth service
// No secondary auth complexity
// Only 4 functions: signup, signin, logout, subscribe

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  reload,
  applyActionCode,
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
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { addGym } from './firestoreService'
import { generateReferralCode } from '../utils/referralCode'
import { getAppUrl } from '../utils/appUrl'

export async function signUp({ name, email, password, gymData, role, referredBy }) {
  let authUser = null

  // ───── Step 1: createUserWithEmailAndPassword (Auth API, not Firestore) ─────
  try {
    const authResult = await createUserWithEmailAndPassword(auth, email, password)
    authUser = authResult.user
  } catch (e) {
    console.error('[SIGNUP AUTH] createUserWithEmailAndPassword', '', e.code, e.message, e)
    // auth/email-already-in-use: no Auth/Firestore resource was created or
    // rolled back here — surface the original error for a clean retry path.
    throw e
  }

  // ───── Step 1.5: sendEmailVerification ─────
  try {
    const appUrl = getAppUrl()
    const actionCodeSettings = {
      url: `${appUrl}/auth?verified=true`,
      handleCodeInApp: true,
    }
    await sendEmailVerification(authUser, actionCodeSettings)
  } catch (e) {
    // Non-fatal: email verification is best-effort. Auth account exists.
    console.error('[SIGNUP AUTH] sendEmailVerification failed:', e.code, e.message)
  }

  // ───── Step 2 (gym owners): create the gym FIRST ─────
  // The users/{uid} doc must reference the real gym doc ID from the very
  // first create — the own-user update rule forbids changing gymId, so the
  // old flow (create users with 'default' gymId, then updateDoc gymId) was
  // permission-denied and rolled back while leaving an orphaned gym doc.
  let gymDocId = null
  if (role === 'gym_owner_pending') {
    try {
      gymDocId = await addGym(gymData, authUser.uid)
    } catch (e) {
      console.error('[SIGNUP FIRESTORE] addGym FAILED', {
        operation: 'addDoc',
        collection: 'gyms',
        code: e.code,
        message: e.message,
        error: e,
      })
      // Rollback: gym was never created — only the Auth user needs cleanup
      try { await authUser.delete() } catch (cleanupErr) {
        console.error('[SIGNUP ROLLBACK] Failed to delete orphaned Auth user:', cleanupErr)
      }
      throw e
    }
  }

  // ───── Step 3: batch write — users/{uid} + own referralCodes directory ─────
  // Referral code is generated locally (crypto-random, IP- + 6 chars) with NO
  // uniqueness query: the users collection read rule denies non-staff roles
  // (pending/gym_owner_pending), and the uniqueness check used to fail there.
  // Collision odds are ~1 in 2.2 billion per draw; the staff-side post-approval
  // autogen (AuthContext) still backfills any empty codes.
  //
  // The referralCodes/{code} directory entry (referrerUid -> owner) is written
  // in the SAME atomic batch as the users doc so Spark clients can resolve this
  // code post-approval WITHOUT the users read rule (Sprint 81A-Spark).
  const referralCode = generateReferralCode()
  console.warn('[Referral] signUp: referral code generated + referredBy captured', {
    role,
    collection: 'users', docId: authUser.uid,
    referralCode,
    referredBy: referredBy || '(none)',
  })

  const userData = {
    uid: authUser.uid,
    email: authUser.email,
    name: name || '',
    role: role || 'pending',
    gymId: gymDocId || gymData?.gymId || 'default',
    referralCode: referralCode || '',
    referredBy: referredBy || '',
    createdAt: serverTimestamp(),
  }

  try {
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', authUser.uid), userData)
    if (referralCode) {
      batch.set(doc(db, 'referralCodes', referralCode), {
        referrerUid: authUser.uid,
        createdAt: serverTimestamp(),
      })
    }
    await batch.commit()
    console.warn('[Referral] signUp: batch WROTE OK', {
      documents: [`users/${authUser.uid}`, `referralCodes/${referralCode}`],
      fields: { referralCode, referredBy: referredBy || '' },
    })
  } catch (e) {
    console.error('[SIGNUP FIRESTORE] setDoc(users) FAILED', {
      operation: 'setDoc',
      collection: 'users',
      path: `users/${authUser.uid}`,
      code: e.code,
      message: e.message,
      error: e,
    })
    // Rollback — remove EVERY resource created in this attempt (gym doc,
    // users doc, referralCodes entry, Auth user) so a retry starts clean
    // with no orphans.
    if (gymDocId) {
      try { await deleteDoc(doc(db, 'gyms', gymDocId)) } catch (cleanupErr) {
        console.error('[SIGNUP ROLLBACK] Failed to delete orphaned gyms doc:', cleanupErr)
      }
    }
    if (referralCode) {
      try { await deleteDoc(doc(db, 'referralCodes', referralCode)) } catch (cleanupErr) {
        console.error('[SIGNUP ROLLBACK] Failed to delete orphaned referralCodes doc:', cleanupErr)
      }
    }
    try { await deleteDoc(doc(db, 'users', authUser.uid)) } catch (cleanupErr) {
      console.error('[SIGNUP ROLLBACK] Failed to delete orphaned users doc:', cleanupErr)
    }
    try { await authUser.delete() } catch (cleanupErr) {
      console.error('[SIGNUP ROLLBACK] Failed to delete orphaned Auth user:', cleanupErr)
    }
    throw e
  }

  // ───── Step 4: signOut (Auth API, not Firestore) ─────
  // Best-effort: the account is fully created at this point; a local signOut
  // failure must not surface as a failed signup (retry would hit
  // auth/email-already-in-use on a completed account).
  try {
    await signOut(auth)
  } catch (e) {
    console.warn('[SIGNUP AUTH] signOut FAILED (account already created):', e.code, e.message)
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
      throw new Error(role) // distinct error per role
    }

    // 4. Verify email — all approved roles must have a verified email
    if (!user.emailVerified) {
      throw new Error('email-not-verified')
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
    // handleCodeInApp:false — the Firebase-hosted action page performs the
    // reset, then redirects to the app's /auth page (continue URL must be in
    // the Firebase console Authorized Domains list).
    const appUrl = getAppUrl()
    await sendPasswordResetEmail(auth, email, {
      url: `${appUrl}/auth`,
      handleCodeInApp: false,
    })
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
      // Local generation with no uniqueness query: the users read rule denies
      // this lookup for non-staff roles (same reason signUp generates locally).
      const code = generateReferralCode()
      const userData = {
        uid,
        email: email || m.email || '',
        name: m.name || '',
        role: 'member',
        gymId: m.gymId || 'default',
        referralCode: code,
        createdAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'users', uid), userData)
      // Referral directory entry (Sprint 81A-Spark) — best-effort, converges
      // at next login if this fails.
      try {
        await setDoc(doc(db, 'referralCodes', code), {
          referrerUid: uid,
          createdAt: serverTimestamp(),
        }, { merge: true })
      } catch (mappingErr) {
        console.warn('recoverUserProfile: referralCodes mapping failed (non-blocking):', mappingErr.code || mappingErr.message)
      }
      return userData
    }

    // ── 2. Try trainers (no referral code) ──
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
      const code = generateReferralCode()
      const userData = {
        uid,
        email: email || g.email || '',
        name: g.ownerName || g.name || '',
        role,
        gymId: g.gymId || g.id || 'default',
        referralCode: code,
        createdAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'users', uid), userData)
      // Referral directory entry (Sprint 81E — mirrors the member branch) —
      // best-effort, converges at next login if this fails.
      try {
        await setDoc(doc(db, 'referralCodes', code), {
          referrerUid: uid,
          createdAt: serverTimestamp(),
        }, { merge: true })
      } catch (mappingErr) {
        console.warn('recoverUserProfile: referralCodes mapping failed (non-blocking):', mappingErr.code || mappingErr.message)
      }
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

export async function getUserProfile(uid, email) {
  try {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return snap.data()
    }

    const recovered = await recoverUserProfile(uid, email || null)
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

export async function reloadUser(user) {
  await reload(user)
  return user.emailVerified
}

export async function resendVerificationEmail(user) {
  const appUrl = getAppUrl()
  const actionCodeSettings = {
    url: `${appUrl}/auth?verified=true`,
    handleCodeInApp: true,
  }
  await sendEmailVerification(user, actionCodeSettings)
}

/**
 * Complete an email verification link (handleCodeInApp flow).
 *
 * With `handleCodeInApp: true` the verification email link opens the app
 * instead of the Firebase-hosted page — clicking the link alone does NOT
 * verify the email. The app MUST apply the oobCode via applyActionCode,
 * otherwise `emailVerified` stays false and login is blocked forever by
 * the 'email-not-verified' check in signIn().
 */
export async function verifyEmailWithCode(oobCode) {
  if (!oobCode) throw new Error('Missing verification code')
  try {
    await applyActionCode(auth, oobCode)
    // Refresh the local user so emailVerified reflects the change immediately
    try {
      if (auth.currentUser) await reload(auth.currentUser)
    } catch (reloadErr) {
      console.warn('verifyEmailWithCode: reload after applyActionCode failed (non-fatal):', reloadErr.code || reloadErr.message)
    }
    return true
  } catch (err) {
    // Log and rethrow deliberately — the caller (Auth page) needs both the
    // meaningful log AND the original Firebase error code to render the
    // correct user-facing message (expired vs invalid vs network).
    console.error('[AUTH] verifyEmailWithCode failed:', err.code || err.name, err.message || err)
    throw err
  }
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
    constraints.push(limit(500))
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
