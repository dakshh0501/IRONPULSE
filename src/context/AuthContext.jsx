// src/context/AuthContext.jsx
// Clean, minimal auth context
// Single source of truth for auth state
// No duplicate logic, no role defaults

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  subscribeToAuthState,
  signUp,
  signIn,
  logOut,
  resetPassword,
  getUserProfile,
  reloadUser,
  resendVerificationEmail,
  authProvider,
  isRecoveryActive,
  markRecoveryActive,
  clearRecoveryMarker,
} from '../services/authService'

// Build-time auth provider. When Supabase is active, the Firestore-bound
// referral helpers below are skipped (anonymous sessions are rule-denied
// until the firestoreService migration) — documented compatibility boundary.
const SUPABASE_ACTIVE = authProvider === 'supabase'
import { getSettings } from '../services/firestoreService'
import {
  processPendingReferral,
  ensureSelfReferralCode,
  PENDING_REFERRAL_KEY,
} from '../services/referralService'
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

// Normalizes super-admin identity on a fetched user profile.
// Either signal (role 'super_admin' OR isSuperAdmin=true) means the
// account is a platform super admin — both fields are set consistently
// so minor Firestore field mismatches can never demote or break the session.
function normalizeProfile(profile) {
  if (!profile) return profile
  if (profile.isSuperAdmin === true || profile.role === 'super_admin') {
    return { ...profile, role: 'super_admin', isSuperAdmin: true }
  }
  return profile
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
  // Password-recovery callback flow: while true, PublicRoute must NOT
  // redirect an authenticated user away from /auth (the GoTrue recovery
  // session is established before the new password is set). The ref is set
  // synchronously so the auth subscription gate can rely on it without a
  // render cycle.
  const [recoveryInProgress, setRecoveryInProgress] = useState(false)
  const recoveryInProgressRef = useRef(false)

  function startRecovery() {
    recoveryInProgressRef.current = true
    setRecoveryInProgress(true)
    markRecoveryActive()
  }

  function finishRecovery() {
    recoveryInProgressRef.current = false
    setRecoveryInProgress(false)
    clearRecoveryMarker()
  }

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
    const unsubscribe = subscribeToAuthState(async (firebaseUser, authEvent) => {
      try {
        if (!firebaseUser) {
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthLoading(false)
          // A sign-out ends any recovery window — drop the refresh marker so
          // a later reload can never re-enter recovery mode.
          clearRecoveryMarker()
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

        // ── PASSWORD-RECOVERY GATE ────────────────────────────────
        // True during a GoTrue recovery callback: the session exists but the
        // new password is not set yet. Detected three ways:
        //   1. PASSWORD_RECOVERY event — SDK-detected implicit/PKCE callback
        //      link (the SDK establishes the session and strips the URL), or
        //      verifyOtp({ type: 'recovery' }) in the token_hash flow.
        //   2. recoveryInProgressRef — startRecovery() called by Auth.jsx
        //      BEFORE the token exchange (token_hash links).
        //   3. isRecoveryActive() — recovery callback still in the URL, or
        //      the sessionStorage marker (refresh mid-recovery, URL already
        //      stripped by the SDK).
        // While active, the profile is STILL loaded (so routing works the
        // moment finishRecovery() clears the gate) but the role sign-outs
        // (pending/rejected/disabled) are skipped — they would kill the
        // recovery session before the password can be changed. The auth page
        // stays visible until finishRecovery().
        const recoveryActive =
          authEvent === 'PASSWORD_RECOVERY' ||
          recoveryInProgressRef.current ||
          isRecoveryActive()

        // Belt-and-suspenders: keep the gate armed (state + sessionStorage
        // marker) even if Auth.jsx's URL-based detection already consumed
        // the callback (SDK strips the URL async) before startRecovery ran.
        if (recoveryActive && !recoveryInProgressRef.current) startRecovery()

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

        // Normalize super-admin identity on the fetched profile: either
        // signal (role 'super_admin' OR isSuperAdmin=true) means platform
        // super admin — set both consistently so effectiveRole never
        // demotes to gym_admin and no session is reverted.
        profile = normalizeProfile(profile)

        // Disabled accounts must never enter the application (Step 8B-6).
        // Mid-recovery the account can still finish its password update, but
        // no app state is set — the user stays on the auth page.
        if (profile?.accountDisabled) {
          if (!recoveryActive) await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthError('This account has been disabled. Contact support.')
          setAuthLoading(false)
          return
        }

        if (profileError && !profile) {
          // All retries exhausted — data plane unavailable.
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
          if (recoveryActive) {
            // Recovery session without a profile (e.g. provisioning failed on
            // a network hiccup): keep the gate so the password can still be
            // set; the session is reprocessed once recovery completes.
            setAuthLoading(false)
            return
          }
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setIsSuperAdmin(false)
          setAuthError('Account profile not found.')
          setAuthLoading(false)
          return
        }

        // Role gates apply to normal sessions only — during recovery the
        // pending/rejected/gym_owner_pending sign-outs would destroy the
        // session before the new password is set.
        if (!recoveryActive) {
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
        }

        // ── REFERRAL SELF-HEAL (Sprint 81E) ──────────────────────────
        // Every approved eligible role must OWN a referral code + directory
        // entry — guaranteed idempotently on login AND refresh: code present
        // → only the missing referralCodes/{code} mapping is converged; code
        // missing → generated pure-locally (no users query — Spark-safe for
        // members) and written under the one-time-set rule. Trainers are
        // excluded by design (staff, not referrers). Never blocks the session.
        //
        // SUPABASE MODE: both helpers are Firestore-bound; anonymous sessions
        // are rule-denied until the firestoreService migration, so they are
        // skipped. Supabase profiles carry referralCode/referredBy on the row
        // itself (provisioned at first sign-in) — referral registration
        // resumes when the referrals collection migrates (documented boundary).
        if (!SUPABASE_ACTIVE) {
          const healed = await ensureSelfReferralCode({
            uid: firebaseUser.uid,
            referralCode: profile.referralCode,
            role: profile.role,
          })
          if (healed.code && !profile.referralCode) {
            profile = { ...profile, referralCode: healed.code }
          }

          // ── SPARK REFERRAL REGISTRATION (Sprint 81A-Spark) ─────────────
          // Once an authenticated, approved session exists, resolve the
          // signup-time referral code (profile.referredBy is immutable per the
          // users update rule; localStorage is the pre-approval cache parked by
          // register()). Idempotent + atomic in the service — a refresh, a
          // second tab or a re-login can never duplicate the referral row.
          // Fire-and-forget: referral processing must never block the session.
          if (profile.role === 'member') {
            const parkedCode = (typeof localStorage !== 'undefined' ? localStorage.getItem(PENDING_REFERRAL_KEY) : null) || ''
            const pendingCode = profile.referredBy || parkedCode || ''
            if (pendingCode) {
              console.warn('[Referral] login trigger: member session processing pending referral', {
                uid: firebaseUser.uid,
                codeSource: profile.referredBy ? 'users.referredBy' : (parkedCode ? 'localStorage' : '(none)'),
                code: pendingCode,
              })
              processPendingReferral({
                referredUid: firebaseUser.uid,
                referredName: profile.name || '',
                referralCode: pendingCode,
                gymId: profile.gymId || 'default',
              }).then(
                (res) => console.warn('[Referral] login trigger result:', res),
                (err) => console.warn('[Referral] login trigger threw (service never throws):', err?.message || err)
              )
            } else {
              console.warn('[Referral] login trigger SKIP: member session has no pending code', {
                uid: firebaseUser.uid, usersReferredBy: profile.referredBy || '(empty)', parkedCode: parkedCode || '(none)',
              })
            }
          } else {
            console.warn('[Referral] login trigger SKIP: role not member (referral registration runs for members only)', {
              uid: firebaseUser.uid, role: profile.role,
            })
          }
        }

        // Approved — set state
        setCurrentUser(firebaseUser)
        setUserProfile(profile)
        setRole(profile.role)
        setAuthError('')
        if (firebaseUser.emailVerified) setNeedsVerification(false)

        // Super admin check: stored directly on the user doc as isSuperAdmin.
        // normalizeProfile() above already forced both fields for super admins.
        setIsSuperAdmin(profile.isSuperAdmin === true)

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

    // Park the referral code locally until the approved member's first
    // authenticated session processes it (Spark: no Cloud Functions).
    // The durable copy lives on users/{uid}.referredBy (written by signUp);
    // processing clears this park so it never lingers across accounts.
    if (referredBy) {
      try { localStorage.setItem(PENDING_REFERRAL_KEY, referredBy) } catch (_) {}
    } else {
      try { localStorage.removeItem(PENDING_REFERRAL_KEY) } catch (_) {}
    }

    signingUpRef.current = true
    try {
      const gymData = { gymName, ownerName: name, email, phone }
      await signUp({ name, email, password, gymData, role: 'gym_owner_pending', referredBy })

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

      // Same normalization as the auth subscription listener: role
      // 'super_admin' OR isSuperAdmin=true → both set consistently.
      profile = normalizeProfile(profile)

      // Disabled accounts must never enter the application (Step 8B-6).
      // Belt-and-suspenders with the subscription listener + signIn gate.
      if (profile?.accountDisabled) {
        await logOut()
        setAuthError('This account has been disabled. Contact support.')
        throw new Error('auth/user-disabled')
      }

      setCurrentUser(user)
      setUserProfile(profile)
      setRole(profile.role)

      // Super admin check in the login path (belt-and-suspenders with
      // the auth subscription listener above).
      setIsSuperAdmin(profile.isSuperAdmin === true)

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
      'auth/email-not-verified':                'Please verify your email before signing in.',
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

  // ─────────────────────────────────────────────────────────────
  // PASSWORD RECOVERY (GoTrue link callback)
  // Auth.jsx calls startRecovery() before completing a recovery link and
  // finishRecovery() after the new password is set, so PublicRoute never
  // redirects the mid-recovery session away. (startRecovery/finishRecovery
  // are defined with the recoveryInProgress state above — ref-backed so the
  // auth subscription gate sees them synchronously.)
  // ─────────────────────────────────────────────────────────────

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
    recoveryInProgress,
    startRecovery,
    finishRecovery,
    userGymId,
    isLoggedIn:     !!currentUser && role !== 'pending' && role !== 'gym_owner_pending' && role !== 'rejected' && currentUser.emailVerified,
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