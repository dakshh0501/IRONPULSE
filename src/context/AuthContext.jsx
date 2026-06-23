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
} from '../services/authService'
import { getSettings } from '../services/firestoreService'
import { applyAccentColor, DEFAULT_ACCENT } from '../utils/theme'

const AuthContext = createContext(null)

// Loads the gym-wide accent color from Firestore and applies it.
// Falls back to the default on any failure (e.g. not yet signed in).
async function loadAndApplyAccent() {
  try {
    const theme = await getSettings('theme')
    applyAccentColor(theme?.accentColor || DEFAULT_ACCENT)
  } catch (err) {
    console.error('Failed to load theme:', err)
    applyAccentColor(DEFAULT_ACCENT)
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null) // Firebase user
  const [userProfile, setUserProfile] = useState(null) // /users/{uid} doc
  const [role, setRole] = useState(null)               // 'admin' | 'trainer' | 'member'
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
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
          setAuthLoading(false)
          return
        }

        const profile = await getUserProfile(firebaseUser.uid)

        if (!profile) {
          if (!signingUpRef.current) {
            await logOut()
            setCurrentUser(null)
            setUserProfile(null)
            setRole(null)
            setAuthError('Account profile not found.')
            setAuthLoading(false)
          }
          return
        }

        if (profile.role === 'pending') {
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setAuthError('Your account is awaiting admin approval.')
          setAuthLoading(false)
          return
        }

        // Approved — set state
        setCurrentUser(firebaseUser)
        setUserProfile(profile)
        setRole(profile.role)
        setAuthError('')

        // Load on login / load on refresh — gym-wide accent applies
        // to admin, trainer, and member alike.
        await loadAndApplyAccent()
      } catch (err) {
        console.error('Auth subscription error:', err)
        setCurrentUser(null)
        setUserProfile(null)
        setRole(null)
      }
      setAuthLoading(false)
    })

    return unsubscribe
  }, [])

  // ─────────────────────────────────────────────────────────────
  // REGISTER: Always creates pending account
  // ─────────────────────────────────────────────────────────────
  async function register({ name, email, password }) {
    setAuthError('')
    signingUpRef.current = true
    try {
      await signUp({ name, email, password })
      return 'pending'
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
      const profile = await getUserProfile(user.uid)
      setCurrentUser(user)
      setUserProfile(profile)
      setRole(userRole)

      // Belt-and-suspenders: apply accent here too in case this path
      // resolves before the subscription listener above does.
      await loadAndApplyAccent()

      return userRole
    } catch (err) {
      const msg = err.message === 'pending'
        ? 'Your account is awaiting admin approval.'
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
      const msg = friendlyError(err.code)
      setAuthError(msg)
      throw err
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
      'auth/user-not-found':          'No account found with this email.',
      'auth/wrong-password':          'Incorrect password.',
      'auth/invalid-credential':      'Incorrect email or password.',
      'auth/email-already-in-use':    'This email is already registered.',
      'auth/weak-password':           'Password must be at least 6 characters.',
      'auth/invalid-email':           'Please enter a valid email.',
      'auth/too-many-requests':       'Too many attempts. Please wait.',
      'auth/network-request-failed':  'Network error. Check your connection.',
    }
    return map[code] || 'Something went wrong. Please try again.'
  }

  // ─────────────────────────────────────────────────────────────
  // Context value
  // ─────────────────────────────────────────────────────────────
  const value = {
    currentUser,
    userProfile,
    role,
    authLoading,
    authError,
    isLoggedIn:  !!currentUser && role !== 'pending',
    isAdmin:     role === 'admin',
    isTrainer:   role === 'trainer',
    isMember:    role === 'member',
    login,
    register,
    logout,
    sendPasswordReset,
    setAuthError,
    updateUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}