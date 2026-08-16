// src/services/authService.js
// Auth service — Supabase Auth (GoTrue) is the identity backend: sessions,
// sign-in, email verification, password reset, recovery, reauth. Profiles
// come from the Supabase `profiles` table (Step 4 of the 8B contract).
//
// COMPATIBILITY NOTES (documented, Step 8B-10):
//   - signUp() provisions the Supabase auth account only; the profiles
//     row, referral directory row, and (for gym owners) the gyms row are
//     created at FIRST SIGN-IN (profiles insert-self policy allows it;
//     guards block role/gym_id updates later, so provisioning inserts the
//     full row in one shot).
//   - approveUser()/rejectUser() operate on the Supabase profiles row and
//     succeed only for super admins (guard_profiles_update semantics).

import { supabase } from '../lib/supabase'
import { getAppUrl } from '../utils/appUrl'
import { generateReferralCode } from '../utils/referralCode'
import { PENDING_REFERRAL_KEY } from './referralService'

export const authProvider = import.meta.env.VITE_AUTH_PROVIDER || 'supabase'

// ─────────────────────────────────────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────────────────────────────────────

/** GoTrue user → application user shape (firebase-compatible fields). */
export function adaptSupabaseUser(user) {
  if (!user) return null
  const meta = user.user_metadata || {}
  return {
    uid: user.id,
    email: user.email || '',
    emailVerified: !!(user.email_confirmed_at || user.confirmed_at),
    displayName: meta.name || meta.full_name || meta.ownerName || '',
    photoURL: meta.avatar_url || meta.photo_url || null,
    phoneNumber: user.phone || null,
    metadata: {
      creationTime: user.created_at || null,
      lastSignInTime: user.last_sign_in_at || user.created_at || null,
    },
    providerId: 'supabase',
  }
}

/** Supabase profiles row → application user profile shape. */
export function mapProfileRow(r) {
  if (!r) return null
  return {
    uid: r.id,
    id: r.id,
    email: r.email || '',
    name: r.name || '',
    role: r.role,
    gymId: r.gym_id,
    referralCode: r.referral_code || '',
    referredBy: r.referred_by || '',
    isSuperAdmin: !!r.is_super_admin,
    accountDisabled: !!r.account_disabled,
    disabledReason: r.disabled_reason || '',
    photoURL: r.photo_url || '',
    createdAt: r.created_at || '',
    firebaseUid: r.firebase_uid || null,
    _source: 'supabase',
  }
}

/** Parse GoTrue link tokens from the current URL (hash or query). */
export function getUrlTokenParams() {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    return {
      token_hash: hash.get('token_hash') || query.get('token_hash') || '',
      type: hash.get('type') || query.get('type') || '',
    }
  } catch {
    return { token_hash: '', type: '' }
  }
}

/**
 * Detect a password-recovery callback in the CURRENT URL. Two link formats
 * exist (both carry `type=recovery`):
 *   1. `token_hash` + `type=recovery` — the app exchanges the token itself
 *      via verifyOtp (completeRecoveryLink).
 *   2. `access_token`/`code` + `type=recovery` — an implicit-grant or PKCE
 *      callback. supabase-js (detectSessionInUrl, default on) auto-detects
 *      these, establishes the session, fires PASSWORD_RECOVERY and strips
 *      the URL — the app must NOT call verifyOtp for these.
 */
export function isRecoveryCallbackInUrl() {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    const type = hash.get('type') || query.get('type')
    if (type !== 'recovery') return false
    return !!(hash.get('token_hash') || query.get('token_hash') ||
              hash.get('access_token') || query.get('access_token') ||
              hash.get('code') || query.get('code'))
  } catch {
    return false
  }
}

/**
 * Recovery-window marker (sessionStorage). The SDK strips the recovery
 * callback from the URL after processing, so a refresh mid-recovery would
 * otherwise look like a normal login and redirect to the dashboard before
 * the new password is set. The marker survives reloads in the same tab and
 * is cleared by finishRecovery()/sign-out.
 */
export const RECOVERY_MARKER_KEY = 'ironpulse-recovery-active'

export function markRecoveryActive() {
  try { sessionStorage.setItem(RECOVERY_MARKER_KEY, '1') } catch { /* storage unavailable */ }
}

export function clearRecoveryMarker() {
  try { sessionStorage.removeItem(RECOVERY_MARKER_KEY) } catch { /* storage unavailable */ }
}

export function isRecoveryMarkerActive() {
  try { return sessionStorage.getItem(RECOVERY_MARKER_KEY) === '1' } catch { return false }
}

/** True while a recovery callback is present in the URL or the marker is set. */
export function isRecoveryActive() {
  return isRecoveryCallbackInUrl() || isRecoveryMarkerActive()
}

/** Supabase error → application error shape (firebase-style `code`). */
const SUPABASE_TO_FIREBASE_CODE = {
  invalid_credentials: 'auth/invalid-credential',
  email_not_confirmed: 'auth/email-not-verified',
  user_not_found: 'auth/user-not-found',
  user_already_exists: 'auth/email-already-in-use',
  email_exists: 'auth/email-already-in-use',
  weak_password: 'auth/weak-password',
  invalid_email: 'auth/invalid-email',
  email_address_invalid: 'auth/invalid-email',
  over_request_rate_limit: 'auth/too-many-requests',
  over_email_send_rate_limit: 'auth/too-many-requests',
  invalid_otp: 'auth/invalid-action-code',
  invalid_token: 'auth/invalid-action-code',
  otp_expired: 'auth/expired-action-code',
  expired_otp: 'auth/expired-action-code',
  token_expired: 'auth/expired-action-code',
  user_disabled: 'auth/user-disabled',
  session_not_found: 'auth/user-token-expired',
  refresh_token_not_found: 'auth/user-token-expired',
}

export function mapSupabaseAuthError(error) {
  const raw = error?.code || error?.name || ''
  const msg = error?.message || ''
  let code
  if (SUPABASE_TO_FIREBASE_CODE[raw]) {
    code = SUPABASE_TO_FIREBASE_CODE[raw]
  } else if (!raw && /fetch|network|ECONN|timed out/i.test(msg)) {
    code = 'auth/network-request-failed'
  } else {
    code = raw ? `auth/${raw.replace(/^auth\//, '')}` : 'auth/internal-error'
  }
  const e = new Error(error?.message || 'Authentication error')
  e.code = code
  e.supabaseError = error || null
  return e
}

/**
 * First sign-in provisioning for Supabase-native users (Step 8B-4).
 * Inserts the profiles row (insert-self policy), the referral directory row
 * (owner-code-match policy), and — for gym-owner signups — the gyms row
 * (owner_uid = auth_firebase_uid() + approval_status 'pending'). All inserts
 * happen in one pass because role/gym_id are NOT user-writable after insert
 * (guard_profiles_update), so the full row must be correct on creation.
 */
export async function provisionProfile(user) {
  if (!user) return null
  const meta = user.user_metadata || {}
  const parkedCode =
    (typeof localStorage !== 'undefined' ? localStorage.getItem(PENDING_REFERRAL_KEY) : null) || ''
  const isGymOwner = !!(meta.gymName || meta.ownerName)
  const role = isGymOwner ? 'gym_owner_pending' : meta.role || 'pending'
  const referralCode = generateReferralCode()
  const gymId = isGymOwner ? `gym-${Date.now()}` : meta.gymId || 'default'

  const row = {
    id: user.id,
    firebase_uid: user.id, // Supabase-native identity (self-reference convention)
    email: user.email || '',
    phone: meta.phone || null,
    name: meta.name || meta.ownerName || '',
    photo_url: null,
    role,
    is_super_admin: false,
    gym_id: gymId,
    referral_code: referralCode,
    referred_by: meta.referredBy || parkedCode || null,
    account_disabled: false,
  }

  const { data, error } = await supabase.from('profiles').insert(row).select().single()
  if (error) {
    // PK conflict (23505) = concurrent provisioning already won — re-read.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('profiles').select('*').eq('id', user.id).maybeSingle()
      return existing ? mapProfileRow(existing) : null
    }
    throw error
  }

  try {
    await supabase.from('referral_codes').insert({
      code: referralCode,
      referrer_uid: user.id,
    })
  } catch (e) {
    console.warn('[AUTH] referral_codes directory insert deferred/failed (non-blocking):', e?.message || e)
  }

  if (isGymOwner) {
    try {
      await supabase.from('gyms').insert({
        id: gymId,
        gym_name: meta.gymName || '',
        owner_name: meta.ownerName || meta.name || '',
        email: user.email || '',
        phone: meta.phone || null,
        owner_uid: user.id,
        approval_status: 'pending',
      })
      console.warn('[AUTH][supabase] Gym registered (approval pending):', { gymId, role })
    } catch (e) {
      console.warn('[AUTH] gyms insert failed (approval visibility requires the firestoreService migration):', e?.message || e)
    }
  }

  return mapProfileRow(data)
}

// ─────────────────────────────────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────────────────────────────────
export async function signUp({ name, email, password, gymData, _role, referredBy }) {
  // ───── SUPABASE MODE (active) ─────
  // Step 1: GoTrue signup. Email confirmation is required in the project
  // config, so no session is created here — the confirmation link redirects
  // back to /auth (emailRedirectTo) carrying `?token_hash=...&type=email`.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth?verified=true`,
      data: {
        name: name || '',
        phone: gymData?.phone || '',
        gymName: gymData?.gymName || '',
        ownerName: gymData?.ownerName || '',
        referredBy: referredBy || '',
      },
    },
  })
  if (error) throw mapSupabaseAuthError(error)

  const authUser = data?.user
  if (!authUser) throw new Error('Signup failed — no user returned')

  console.warn('[AUTH][supabase] signUp OK (confirmation pending):', {
    uid: authUser.id,
    email,
    confirmation: authUser.email_confirmed_at ? 'confirmed' : 'pending',
  })

  // Step 2: COMPATIBILITY BOUNDARY — the Firestore signup artifacts (gyms doc,
  // users/{uid} doc, referralCodes directory) require an authenticated
  // Firebase session, which Supabase-native users do not have. Those rows are
  // provisioned in Supabase at first sign-in (profiles + referral directory +
  // gyms row) — see getUserProfile()/provisionProfile().
  return { uid: authUser.id, email }
}

// ─────────────────────────────────────────────────────────────────────────
// SIGN IN
// ─────────────────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  // ───── SUPABASE MODE (active) ─────
  const { data, error } = await supabase.auth.signInWithPassword({
    email: (email || '').trim(),
    password,
  })
  if (error) {
    // GoTrue rejects unconfirmed sign-ins before returning a session.
    if (error.code === 'email_not_confirmed') throw new Error('email-not-verified')
    throw mapSupabaseAuthError(error)
  }

  const user = adaptSupabaseUser(data.user)
  const profile = await getUserProfile(user.uid, user.email)

  if (!profile) {
    await supabase.auth.signOut()
    throw new Error('User profile not found')
  }

  const role = profile.role

  // Pending/rejected semantics preserved: sign out and surface a distinct
  // error message per role (AuthContext.login maps these).
  if (role === 'pending' || role === 'gym_owner_pending' || role === 'rejected') {
    await supabase.auth.signOut()
    throw new Error(role)
  }

  // Disabled accounts must never enter the application (Step 8B-6).
  if (profile.accountDisabled) {
    await supabase.auth.signOut()
    const err = new Error('This account has been disabled.')
    err.code = 'auth/user-disabled'
    throw err
  }

  return { user, role }
}

// ─────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────
export async function logOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────
// PASSWORD RESET (request)
// ─────────────────────────────────────────────────────────────────────────
export async function resetPassword(email) {
  // GoTrue recovery link → app (recovery callback handled in Auth.jsx via
  // completeRecoveryLink + updatePassword). Unknown emails are not revealed
  // (anti-enumeration, mirrors Sprint 81I).
  const { error } = await supabase.auth.resetPasswordForEmail((email || '').trim(), {
    redirectTo: `${getAppUrl()}/auth`,
  })
  if (error) throw mapSupabaseAuthError(error)
}

// ─────────────────────────────────────────────────────────────────────────
// PROFILE LOADING (Step 8B-4)
// ─────────────────────────────────────────────────────────────────────────
export async function getUserProfile(uid, _email) {
  // ───── SUPABASE MODE (active) ─────
  // 1. Resolve profiles where profiles.id = auth.users.id.
  const { data: row, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle()
  if (error) {
    console.error('[AUDIT] getUserProfile SUPABASE ERROR:', error.code || error.name, error.message)
    throw error
  }
  if (row) return mapProfileRow(row)

  // 2. Missing → first sign-in provisioning (insert-self policy).
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  } catch (e) {
    console.warn('[AUDIT] getUserProfile getUser failed:', e?.message || e)
  }
  if (!user || user.id !== uid) {
    console.warn('[AUDIT] getUserProfile: provisioning skipped (no session for uid)', { uid })
    throw new Error('User profile not found')
  }

  const provisioned = await provisionProfile(user)
  if (!provisioned) throw new Error('User profile not found')
  return provisioned
}

// ─────────────────────────────────────────────────────────────────────────
// AUTH STATE SUBSCRIPTION (Step 8B-3)
// ─────────────────────────────────────────────────────────────────────────
export function subscribeToAuthState(callback) {
  // GoTrue fires INITIAL_SESSION on subscribe when a persisted session exists
  // (startup restoration — handled by the SDK's storage, no manual tokens).
  // Recovery callbacks fire PASSWORD_RECOVERY (SDK-detected implicit/PKCE
  // links) or SIGNED_IN (verifyOtp exchanges) — the event is forwarded so
  // AuthContext can gate role handling until the new password is set.
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ? adaptSupabaseUser(session.user) : null, event)
  })
  return () => data.subscription.unsubscribe()
}

// ─────────────────────────────────────────────────────────────────────────
// EMAIL VERIFICATION (Step 8B-8)
// ─────────────────────────────────────────────────────────────────────────
export async function reloadUser(user) {
  try {
    const { data } = await supabase.auth.getUser()
    const fresh = data?.user ? adaptSupabaseUser(data.user) : null
    if (user && fresh) Object.assign(user, fresh)
    return fresh ? fresh.emailVerified : (user?.emailVerified ?? false)
  } catch (err) {
    console.warn('reloadUser: refresh failed (non-fatal):', err?.message || err)
    return user?.emailVerified ?? false
  }
}

export async function resendVerificationEmail(user) {
  const { error } = await supabase.auth.resend({
    type: 'email',
    email: user?.email || '',
    options: { emailRedirectTo: `${getAppUrl()}/auth?verified=true` },
  })
  if (error) throw mapSupabaseAuthError(error)
}

/**
 * Complete an email verification / email-change link (GoTrue flow).
 * The link from the confirmation email carries `?token_hash=...&type=email`
 * (or `#token_hash=` hash form). verifyOtp exchanges the token for a session.
 * `type` defaults to 'email'; callers with an email_change link pass the type.
 */
export async function verifyEmailWithCode(oobCode, tokenType = 'email') {
  const { token_hash, type } = getUrlTokenParams()
  const token = token_hash || oobCode
  const t = type || tokenType || 'email'
  if (!token) throw new Error('Missing verification code')
  const { error } = await supabase.auth.verifyOtp({ type: t, token_hash: token })
  if (error) {
    console.error('[AUTH] verifyEmailWithCode failed:', error.code || error.name, error.message || error)
    throw mapSupabaseAuthError(error)
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// PASSWORD RECOVERY CALLBACK + UPDATE (Step 8B-7)
// ─────────────────────────────────────────────────────────────────────────
/**
 * Complete a recovery link (`?token_hash=...&type=recovery`). Establishes the
 * recovery session so updatePassword() can set the new password. Callers must
 * hold `recoveryInProgress` in AuthContext so public routes do not redirect
 * before the new password is set.
 */
export async function completeRecoveryLink(tokenHash) {
  const { token_hash } = getUrlTokenParams()
  const token = token_hash || tokenHash
  if (!token) throw new Error('Missing recovery code')
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: token })
  if (error) {
    console.error('[AUTH] completeRecoveryLink failed:', error.code || error.name, error.message || error)
    throw mapSupabaseAuthError(error)
  }
  return true
}

/** Set a new password with an active session (recovery flow, settings). */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw mapSupabaseAuthError(error)
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// REAUTHENTICATION (Step 8B-9)
// GoTrue has no reauthenticate API — the safe equivalent is a
// signInWithPassword probe with the current password before the sensitive
// update. Security intent preserved (credential verified before change);
// documented difference: the probe replaces the session tokens of the SAME
// user (harmless in this app; other tabs share the same identity).
// ─────────────────────────────────────────────────────────────────────────
async function supabaseReauthProbe(currentPassword) {
  const { data } = await supabase.auth.getUser()
  const email = data?.user?.email
  if (!email) {
    const err = new Error('No email on this account. Set an email first.')
    err.code = 'auth/missing-email'
    throw err
  }
  const probe = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (probe.error) {
    const isWrongPw =
      probe.error.code === 'invalid_credentials' ||
      /invalid login credentials/i.test(probe.error.message || '')
    const err = isWrongPw
      ? new Error('Current password is incorrect')
      : mapSupabaseAuthError(probe.error)
    if (isWrongPw) err.code = 'auth/wrong-password'
    throw err
  }
  return email
}

/** Change password — verifies the current password first. */
export async function changePassword(currentPassword, newPassword) {
  await supabaseReauthProbe(currentPassword)
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw mapSupabaseAuthError(error)
  return true
}

/**
 * Change email — verifies the current password first. GoTrue sends a
 * confirmation link to the NEW address (email_change OTP); the old email
 * stays active until confirmed. Firebase's verifyBeforeUpdateEmail blocked
 * the account during the pending change — documented difference: with GoTrue
 * the account keeps working with the old email until the link is clicked.
 */
export async function changeEmail(currentPassword, newEmail) {
  await supabaseReauthProbe(currentPassword)
  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) throw mapSupabaseAuthError(error)
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// RECOVER / APPROVE / REJECT / PENDING LISTS
// ─────────────────────────────────────────────────────────────────────────
/**
 * Recover a missing profile by searching companion collections.
 * Supabase-native users are provisioned from GoTrue metadata at first
 * sign-in (provisionProfile) instead, so this helper always returns null.
 */
export async function recoverUserProfile(_uid, _email) {
  console.warn('[AUTH][supabase] recoverUserProfile is Firestore-bound and unused in supabase mode.')
  return null
}

export async function approveUser(uid, newRole) {
  // ───── SUPABASE MODE ─────
  // profiles.role is not user-writable (guard_profiles_update); only a super
  // admin can promote. Gym-admin approval flows remain Firestore-bound until
  // the firestoreService migration (compatibility boundary).
  if (!['member', 'trainer'].includes(newRole)) {
    throw new Error('Invalid role')
  }
  const { data: current } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (!current) throw new Error('Profile not found')
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', uid)
  if (error) {
    console.warn('[AUTH][supabase] approveUser role update denied (super admin required until Firestore migration):', error?.message || error)
    throw mapSupabaseAuthError(error)
  }
}

export async function rejectUser(uid) {
  // ───── SUPABASE MODE ─────
  // Disable the profile row (super admin only per guard_profiles_update);
  // sign-in is blocked for account_disabled rows (see signIn).
  const { data: current } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (!current) throw new Error('Profile not found')
  const { error } = await supabase.from('profiles').update({
    account_disabled: true,
    disabled_reason: 'Rejected by admin',
    disabled_at: new Date().toISOString(),
  }).eq('id', uid)
  if (error) {
    console.warn('[AUTH][supabase] rejectUser disable denied (super admin required until Firestore migration):', error?.message || error)
    throw mapSupabaseAuthError(error)
  }
}

export async function getPendingUsers(gymId) {
  // ───── SUPABASE MODE ─────
  // profiles are staff-readable (pol_profiles_select_self_or_staff).
  try {
    let q = supabase.from('profiles').select('*').eq('role', 'pending').limit(500)
    if (gymId) q = q.eq('gym_id', gymId)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(r => ({ uid: r.id, ...mapProfileRow(r) }))
  } catch (err) {
    console.error('getPendingUsers error:', err)
    return []
  }
}

export async function getGymOwnerPending() {
  // ───── SUPABASE MODE ─────
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'gym_owner_pending')
    if (error) throw error
    return (data || []).map(r => ({ uid: r.id, ...mapProfileRow(r) }))
  } catch (err) {
    console.error('getGymOwnerPending error:', err)
    return []
  }
}

// DEPRECATED: Use AppContext.approveGymOwner(gymId) instead.
// This function is kept for backward compatibility only and will throw if called.
export async function approveGymOwner(_uid) {
  throw new Error('authService.approveGymOwner is deprecated. Use AppContext.approveGymOwner(gymId) instead — it handles gym, user, and subscription updates atomically.')
}

// DEPRECATED: Use AppContext.rejectGymOwner(gymId) instead.
// This function is kept for backward compatibility only and will throw if called.
export async function rejectGymOwner(_uid) {
  throw new Error('authService.rejectGymOwner is deprecated. Use AppContext.rejectGymOwner(gymId) instead — it handles gym and user updates atomically.')
}
