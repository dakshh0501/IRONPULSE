// src/context/AuthContext.jsx
// Clean, minimal auth context
// Single source of truth for auth state
// No duplicate logic, no role defaults

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { addDoc, collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import {
  subscribeToAuthState,
  signUp,
  signIn,
  logOut,
  resetPassword,
  getUserProfile,
  reloadUser,
  resendVerificationEmail,
} from '../services/authService'
import { getSettings } from '../services/firestoreService'
import { createReferral, hasPendingReferral, isReferralExpired, logReferralAudit } from '../services/referralService'
import { generateUniqueReferralCode } from '../utils/referralCode'
import { applyAccentColor, DEFAULT_ACCENT } from '../utils/theme'
import { getEffectiveRole } from '../utils/rbac'
import {
  isBiometricAvailable,
  verifyBiometric,
  isBiometricLoginEnabled,
  setBiometricLoginEnabled,
  getBiometricTypeName,
  clearBiometricCache,
} from '../services/biometricService'

const AuthContext = createContext(null)

function isLocalhost() {
  try {
    const host = window.location.hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

// Loads the gym-wide accent color from Firestore and applies it.
// Falls back to the default on any failure (e.g. not yet signed in).
async function loadAndApplyAccent(gymId) {
  try {
    const theme = await getSettings('theme', gymId)
    applyAccentColor(theme?.accentColor || DEFAULT_ACCENT)
  } catch (err) {
    console.error('AuthContext: Failed to load theme:', err)
    applyAccentColor(DEFAULT_ACCENT)
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null) // Firebase user
  const [userProfile, setUserProfile] = useState(null) // /users/{uid} doc
  const [role, setRole] = useState(null)               // 'admin' | 'trainer' | 'member' | 'gym_owner_pending'
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [biometricEnabled, setBiometricEnabledState] = useState(() => isBiometricLoginEnabled())
  const [biometricGate, setBiometricGate] = useState(false)
  const [biometricType, setBiometricType] = useState(null)
  const signingUpRef = useRef(false)

  // ─────────────────────────────────────────────────────────────
  // ACCENT: apply the safe default immediately on mount so the
  // public landing/auth page never flashes the wrong color while
  // we wait to find out if anyone is logged in.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    applyAccentColor(DEFAULT_ACCENT)
  }, [])

  // ─────────────────────────────────────────────────────────────
  // SUBSCRIPTION: Listen to Firebase Auth state
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthLoading(false)
          return
        }

        // ── SIGNUP GUARD ──────────────────────────────────────────
        // If register() is in progress, the users/{uid} doc hasn't been
        // written yet.  Skip the profile check — signUp() will write the
        // doc and sign out, letting this handler clean up normally.
        if (signingUpRef.current) {
          setAuthLoading(false)
          return
        }

        // Retry profile fetch up to 3 times with 1s delay for transient Firestore errors
        // (e.g. app resume from Recents on Android where Firestore reconnects slowly)
        let profile = null
        let profileError = null
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            profile = await getUserProfile(firebaseUser.uid, firebaseUser.email)
            profileError = null
            break
          } catch (err) {
            profileError = err
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 1000))
            }
          }
        }

        if (profileError && !profile) {
          // All retries exhausted — Firestore is unavailable.
          // Keep the user logged in, show error, set authLoading=false so app renders.
          // The user will see auth-related UI and can retry manually.
          console.error('[AUDIT] All getUserProfile retries exhausted. Keeping user signed in.')
          setCurrentUser(firebaseUser)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthError('Unable to load profile. Check your network connection.')
          setAuthLoading(false)
          return
        }

        if (!profile) {
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthError('Account profile not found.')
          setAuthLoading(false)
          return
        }

        if (profile.role === 'rejected') {
          if (isLocalhost()) {
            await logOut()
            setCurrentUser(null)
            setUserProfile(null)
            setRole(null)
            setIsSuperAdmin(false)
            setAuthError('')
            setAuthLoading(false)
            window.location.replace('/auth')
            return
          }
          setCurrentUser(firebaseUser)
          setUserProfile(profile)
          setRole('rejected')
          setIsSuperAdmin(false)
          setAuthError('Your account has been rejected.')
          setAuthLoading(false)
          return
        }

        if (profile.role === 'gym_owner_pending') {
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthError('Your gym registration is awaiting admin approval.')
          setAuthLoading(false)
          return
        }

        if (profile.role === 'pending') {
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthError('Your account is awaiting admin approval.')
          setAuthLoading(false)
          return
        }

        // Auto-generate referralCode if missing
        if (!profile.referralCode) {
          try {
            const code = await generateUniqueReferralCode()
            await setDoc(doc(db, 'users', firebaseUser.uid), { referralCode: code }, { merge: true })
            profile = { ...profile, referralCode: code }
          } catch (err) {
            console.warn('[AUTH] Failed to generate referral code:', err)
          }
        }

        // Approved — set state
        setCurrentUser(firebaseUser)
        setUserProfile(profile)
        setRole(profile.role)
        setAuthError('')
        if (firebaseUser.emailVerified) setNeedsVerification(false)

        // Super admin check: stored directly on the user doc as isSuperAdmin.
        setIsSuperAdmin(profile.role === 'admin' && profile.isSuperAdmin === true)

        // Load on login / load on refresh — gym-wide accent applies
        // to admin, trainer, and member alike.
        // Only attempt Firestore read when gymId is available (super_admin has none)
        if (profile?.gymId) await loadAndApplyAccent(profile.gymId)
      } catch (err) {
        // Catch-all: unexpected error in the handler itself (not Firestore).
        // Do NOT sign out — keep state and log.
        console.error('[AUDIT] Auth subscription UNEXPECTED error:', err)
      }
      setAuthLoading(false)
    })

    return unsubscribe
  }, [])

  // ─────────────────────────────────────────────────────────────
  // REGISTER: Creates user with pending/gym_owner_pending/membership role
  // ─────────────────────────────────────────────────────────────
  async function register({ name, email, password, gymName, phone, referredBy }) {
    setAuthError('')

    signingUpRef.current = true
    try {
      const gymData = { gymName, ownerName: name, email, phone }
      const signUpResult = await signUp({ name, email, password, gymData, role: 'gym_owner_pending', referredBy })

      // Fire-and-forget referral record + notifications
      if (referredBy && signUpResult?.uid) {
        try {
          // Check for duplicate pending referral
          const alreadyReferred = await hasPendingReferral(signUpResult.uid)
          if (alreadyReferred) {
            logReferralAudit({
              action: 'DUPLICATE_REFERRAL_BLOCKED',
              performedBy: signUpResult.uid,
              targetUid: signUpResult.uid,
              metadata: { referralCode: referredBy, email },
            }).catch(() => {})
            console.warn('[AuthContext] Duplicate referral blocked for:', signUpResult.uid)
          } else {
            const refQ = query(collection(db, 'users'), where('referralCode', '==', referredBy))
            const refSnap = await getDocs(refQ)
            if (!refSnap.empty) {
              const referrer = refSnap.docs[0].data()

              // Self-referral check
              if (referrer.uid === signUpResult.uid) {
                logReferralAudit({
                  action: 'SELF_REFERRAL_BLOCKED',
                  performedBy: signUpResult.uid,
                  targetUid: signUpResult.uid,
                  metadata: { referralCode: referredBy, email },
                }).catch(() => {})
              } else {
                // Expiry check on referrer's campaign (if any)
                const referrerHasExpired = referrer.expiresAt
                  ? (referrer.expiresAt?.seconds
                    ? new Date(referrer.expiresAt.seconds * 1000)
                    : new Date(referrer.expiresAt)) < new Date()
                  : false

                if (referrerHasExpired) {
                  logReferralAudit({
                    action: 'EXPIRED_REFERRAL_BLOCKED',
                    performedBy: signUpResult.uid,
                    targetUid: referrer.uid,
                    metadata: { referralCode: referredBy, email, expiresAt: referrer.expiresAt },
                  }).catch(() => {})
                  console.warn('[AuthContext] Expired referral blocked:', referredBy)
                } else {
                  // Create referral record in Firestore
                  createReferral({
                    referrerUid: referrer.uid,
                    referredUid: signUpResult.uid,
                    referralCode: referredBy,
                    gymId: referrer.gymId || 'default',
                    referredName: name || '',
                    rewardValue: 0,
                    rewardType: '',
                  }).then(() => {
                    logReferralAudit({
                      action: 'REFERRAL_CREATED',
                      performedBy: signUpResult.uid,
                      targetUid: referrer.uid,
                      metadata: { referralCode: referredBy, referredName: name },
                    }).catch(() => {})
                  }).catch(() => {})

                  const notifPromises = [
                    addDoc(collection(db, 'notifications'), {
                      userId: referrer.uid,
                      gymId: referrer.gymId || 'default',
                      role: 'member',
                      title: 'Referral Registered!',
                      message: `${name || 'Someone'} signed up using your referral code!`,
                      type: 'referral',
                      subtype: 'referral_registered',
                      priority: 'normal',
                      icon: '📋',
                      actionUrl: '/referral',
                      relatedDocumentId: '',
                      read: false,
                      createdAt: new Date().toISOString(),
                    }).catch(() => {}),
                    addDoc(collection(db, 'notifications'), {
                      userId: signUpResult.uid,
                      gymId: referrer.gymId || 'default',
                      role: 'member',
                      title: 'Referral Applied',
                      message: `Your referral code was applied! Welcome aboard.`,
                      type: 'referral',
                      subtype: 'referral_applied',
                      priority: 'normal',
                      icon: '✅',
                      actionUrl: '',
                      relatedDocumentId: '',
                      read: false,
                      createdAt: new Date().toISOString(),
                    }).catch(() => {}),
                  ]
                  await Promise.allSettled(notifPromises)
                }
              }
            }
          }
        } catch (notifErr) {
          console.error('[AuthContext] referral processing error:', notifErr)
        }
      }

      return { email }
    } catch (err) {
      const msg = friendlyError(err.code || err.message)
      setAuthError(msg)
      throw err
    } finally {
      signingUpRef.current = false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LOGIN: Returns role on success, throws on pending/error
  // ─────────────────────────────────────────────────────────────
  async function login(email, password) {
    setAuthError('')
    try {
      const { user, role: userRole } = await signIn(email, password)
      let profile
      try {
        profile = await getUserProfile(user.uid, user.email)
      } catch (profileErr) {
        await logOut()
        setAuthError('Unable to load profile. Check your network connection.')
        throw new Error('Unable to load profile.')
      }

      setCurrentUser(user)
      setUserProfile(profile)
      setRole(userRole)

      // Super admin check in the login path (belt-and-suspenders with
      // the auth subscription listener above).
      setIsSuperAdmin(userRole === 'admin' && profile.isSuperAdmin === true)

      // Belt-and-suspenders: apply accent here too in case this path
      // resolves before the subscription listener above does.
      await loadAndApplyAccent(profile?.gymId)

      return userRole
    } catch (err) {
      if (err.message === 'email-not-verified') {
        setNeedsVerification(true)
        setAuthError('Please verify your email before signing in.')
        throw err
      }
      const msg = err.message === 'pending' || err.message === 'gym_owner_pending'
        ? 'Your account is awaiting admin approval.'
        : err.message === 'rejected'
        ? 'Your account has been rejected.'
        : friendlyError(err.code || err.message)
      setAuthError(msg)
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────
  async function logout() {
    try {
      await logOut()
    } finally {
      setCurrentUser(null)
      setUserProfile(null)
      setRole(null)
      setIsSuperAdmin(false)
      setNeedsVerification(false)
      setBiometricGate(false)
      setAuthError('')
      applyAccentColor(DEFAULT_ACCENT) // reset to default on sign-out
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PASSWORD RESET
  // ─────────────────────────────────────────────────────────────
  async function sendPasswordReset(email) {
    setAuthError('')
    try {
      await resetPassword(email)
    } catch (err) {
      if (err.code === 'auth/user-not-found') return
      const msg = friendlyError(err.code)
      setAuthError(msg)
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────────
  // EMAIL VERIFICATION HELPERS
  // ─────────────────────────────────────────────────────────────
  async function sendVerificationEmail(user) {
    try {
      await resendVerificationEmail(user)
    } catch (err) {
      const msg = friendlyError(err.code)
      setAuthError(msg)
      throw err
    }
  }

  async function refreshEmailStatus(user) {
    try {
      return await reloadUser(user)
    } catch (err) {
      console.error('Failed to refresh email status:', err)
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE USER PROFILE IN MEMORY
  // ─────────────────────────────────────────────────────────────
  function updateUserProfile(updates) {
    setUserProfile(prev => prev ? { ...prev, ...updates } : prev)
  }

  // ─────────────────────────────────────────────────────────────
  // Friendly error messages
  // ─────────────────────────────────────────────────────────────
  function friendlyError(code) {
    const map = {
      'auth/user-not-found':                    'No account found with this email.',
      'auth/wrong-password':                    'Incorrect password.',
      'auth/invalid-credential':                'Incorrect email or password.',
      'auth/email-already-in-use':              'This email is already registered.',
      'auth/weak-password':                     'Password must be at least 6 characters.',
      'auth/invalid-email':                     'Enter a valid email address.',
      'auth/too-many-requests':                 'Too many attempts. Please try again later.',
      'auth/network-request-failed':            'Check your internet connection.',
      'auth/operation-not-allowed':             'This sign-in method is not enabled. Contact support.',
      'auth/user-disabled':                     'This account has been disabled. Contact support.',
      'auth/internal-error':                    'Authentication service error. Please try again.',
      'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method.',
      'auth/requires-recent-login':             'Please log out and log in again before making this change.',
      'auth/invalid-verification-code':         'Invalid verification code. Please try again.',
      'auth/invalid-verification-id':           'Invalid verification ID. Please request a new code.',
      'auth/missing-phone-number':              'Please enter a phone number.',
      'auth/invalid-phone-number':              'Please enter a valid phone number.',
      'auth/quota-exceeded':                    'SMS quota exceeded. Please try again later.',
      'auth/app-not-authorized':                'This app is not authorized. Contact support.',
      'auth/credential-already-in-use':         'This credential is already linked to another account.',
      'auth/expired-action-code':               'This action link has expired. Please try again.',
      'auth/invalid-action-code':               'This action link is invalid. Please try again.',
      'auth/missing-email':                     'Please enter an email address.',
      'auth/provider-already-linked':           'This account is already linked to this provider.',
      'auth/timeout':                           'Request timed out. Please try again.',
      'auth/invalid-persistence-type':          'Session persistence error. Please restart the app.',
      'auth/web-context-cancelled':             'Sign-in was cancelled.',
      'auth/web-storage-unsupported':           'Session storage is not supported. Please update your browser.',
      'auth/claims-too-large':                  'Account data is too large. Contact support.',
      'auth/id-token-expired':                  'Your session has expired. Please log in again.',
      'auth/id-token-revoked':                  'Your session has been revoked. Please log in again.',
      'auth/invalid-continue-uri':              'Invalid continue URL. Contact support.',
      'auth/unauthorized-continue-uri':         'Unauthorized continue URL. Contact support.',
      'auth/invalid-tenant-id':                 'Invalid tenant. Contact support.',
      'auth/tenant-id-mismatch':                'Tenant mismatch. Contact support.',
      'auth/user-token-expired':                'Your session has expired. Please log in again.',
      'auth/user-mismatch':                     'User does not match the requested account.',
      'auth/no-such-provider':                  'No such sign-in provider. Contact support.',
      'auth/admin-restricted-operation':        'This operation is restricted to admins only.',
      'auth/cancelled-popup-request':           'Sign-in popup was cancelled.',
      'auth/popup-blocked':                     'Sign-in popup was blocked by your browser.',
      'auth/popup-closed-by-user':              'Sign-in popup was closed before completing.',
      'auth/unauthorized-domain':               'This domain is not authorized. Contact support.',
      'auth/unsupported-first-factor':          'This sign-in method is not supported.',
      'auth/email-change-needs-verification':   'Please verify your new email address.',
    }
    return map[code] || `Something went wrong. Please try again. (${code || 'unknown'})`
  }

  // ─────────────────────────────────────────────────────────────
  // BIOMETRIC: Check availability on mount
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    isBiometricAvailable().then(result => {
      if (result.isAvailable) {
        setBiometricType(result.biometryType)
      }
    }).catch(() => {})
  }, [])

  // ── Biometric gate: when session restores via persistence and
  // biometric is enabled, show gate before rendering app content.
  useEffect(() => {
    if (currentUser && role && biometricEnabled && !['pending','rejected','gym_owner_pending'].includes(role) && currentUser.emailVerified) {
      setBiometricGate(true)
    } else {
      setBiometricGate(false)
    }
  }, [currentUser, role, biometricEnabled])

  async function enableBiometric() {
    const available = await isBiometricAvailable()
    if (!available.isAvailable) {
      throw new Error('Biometric authentication is not available on this device.')
    }
    await verifyBiometric({
      reason: 'Enable biometric login',
      title: 'Enable Biometric Login',
      subtitle: 'Verify your identity',
      description: 'Authenticate to enable biometric login for faster access.',
    })
    setBiometricLoginEnabled(true)
    setBiometricEnabledState(true)
    setBiometricType(available.biometryType)
  }

  function disableBiometric() {
    setBiometricLoginEnabled(false)
    setBiometricEnabledState(false)
    setBiometricGate(false)
    clearBiometricCache()
  }

  async function verifyBiometricGate() {
    await verifyBiometric({
      reason: 'Unlock IRONPULSE',
      title: 'Biometric Unlock',
      subtitle: 'Quick access',
      description: 'Authenticate to unlock the app.',
    })
    setBiometricGate(false)
  }

  // ── Derived gymId ───────────────────────────────────────────
  // Read from userProfile (set on the /users/{uid} doc during sign-up
  // or admin-creation), falling back to 'default' for single-gym mode.
  const userGymId = userProfile?.gymId || (currentUser ? 'default' : null)

  // ── Normalized RBAC role ─────────────────────────────────────
  // Reads isSuperAdmin from the user doc (no extra Firestore query).
  //   admin + isSuperAdmin → super_admin
  //   admin + !isSuperAdmin → gym_admin
  //   gym_owner → gym_admin
  const effectiveRole = getEffectiveRole({ ...userProfile, isSuperAdmin })

  // ── Super Admin consistency guard ───────────────────────────
  // Defensive programming: if effectiveRole and raw isSuperAdmin
  // ever disagree (data corruption, logic bug), demote safely to
  // gym_admin instead of granting incorrect elevated access.
  useEffect(() => {
    if (effectiveRole === 'super_admin' && isSuperAdmin !== true) {
      console.error('[CRITICAL] super_admin effectiveRole without isSuperAdmin=true — demoting to gym_admin')
      setIsSuperAdmin(false)
    }
    if (isSuperAdmin === true && role !== 'admin') {
      console.error('[CRITICAL] isSuperAdmin=true on non-admin role — reverting')
      setIsSuperAdmin(false)
    }
  }, [effectiveRole, isSuperAdmin, role])

  // ─────────────────────────────────────────────────────────────
  // Context value
  // ─────────────────────────────────────────────────────────────
  const value = {
    currentUser,
    userProfile,
    role,
    effectiveRole,
    authLoading,
    authError,
    needsVerification,
    userGymId,
    isLoggedIn:     !!currentUser && role !== 'pending' && role !== 'rejected' && currentUser.emailVerified,
    isAdmin:        role === 'admin',
    isSuperAdmin,
    isGymAdmin:     effectiveRole === 'gym_admin',
    isTrainer:      role === 'trainer',
    isMember:       role === 'member',
    login,
    register,
    logout,
    sendPasswordReset,
    sendVerificationEmail,
    refreshEmailStatus,
    setAuthError,
    updateUserProfile,
    biometricEnabled,
    biometricGate,
    biometricType,
    enableBiometric,
    disableBiometric,
    verifyBiometricGate,
    getBiometricTypeName,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}