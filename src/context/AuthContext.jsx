// src/context/AuthContext.jsx
// Clean, minimal auth context
// Single source of truth for auth state
// No duplicate logic, no role defaults

import { createContext, useContext, useEffect, useState } from 'react'
import {
  subscribeToAuthState,
  signUp,
  signIn,
  logOut,
  resetPassword,
  getUserProfile,
} from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null) // Firebase user
  const [userProfile, setUserProfile] = useState(null) // /users/{uid} doc
  const [role, setRole] = useState(null) // 'admin' | 'trainer' | 'member' | 'pending'
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  // ─────────────────────────────────────────────────────────────
  // SUBSCRIPTION: Listen to Firebase Auth state
  // When user logs in/out, check their /users/{uid} for role
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
  setCurrentUser(null)
  setUserProfile(null)
  setRole(null)

  // DON'T clear authError here

  setAuthLoading(false)
  return
}

        // User is logged in — fetch their profile
        const profile = await getUserProfile(firebaseUser.uid)

        if (!profile) {
          // Profile doesn't exist (shouldn't happen)
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setAuthError('Account profile not found.')
          setAuthLoading(false)
          return
        }

        // ← THIS SHOULD NOT HAPPEN in normal flow
        // (signIn already checks for pending)
        // But as a safety check:
        if (profile.role === 'pending') {
          await logOut()
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
          setAuthError('Your account is awaiting admin approval.')
          setAuthLoading(false)
          return
        }

        // User is approved — set auth state
        setCurrentUser(firebaseUser)
        setUserProfile(profile)
        setRole(profile.role)
        setAuthError('')
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
  // REGISTER: Create new account (always pending)
  // ─────────────────────────────────────────────────────────────
  async function register({ name, email, password }) {
    setAuthError('')
    try {
      await signUp({ name, email, password })
      return 'pending' // Signal to UI to show pending screen
    } catch (err) {
      const msg = friendlyError(err.code || err.message)
      setAuthError(msg)
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LOGIN: Authenticate user
  // Returns role if successful, throws if pending/error
  // ─────────────────────────────────────────────────────────────
  async function login(email, password) {
    setAuthError('')
    try {
      const { user, role: userRole } = await signIn(email, password)

const profile = await getUserProfile(user.uid)

setCurrentUser(user)
setUserProfile(profile)
setRole(userRole)

return userRole
    } catch (err) {
      let msg = err.message
      if (err.message === 'pending') {
        msg = 'Your account is awaiting admin approval.'
      } else {
        msg = friendlyError(err.code || err.message)
      }
      setAuthError(msg)
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LOGOUT: Sign out
  // ─────────────────────────────────────────────────────────────
  async function logout() {
    try {
      await logOut()
    } finally {
      setCurrentUser(null)
      setUserProfile(null)
      setRole(null)
      setAuthError('')
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
  // Helper: Turn Firebase error codes into friendly messages
  // ─────────────────────────────────────────────────────────────
  function friendlyError(code) {
    const map = {
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/email-already-in-use': 'This email is already registered.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Please enter a valid email.',
      'auth/too-many-requests': 'Too many attempts. Please wait.',
      'auth/network-request-failed': 'Network error. Check your connection.',
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
    isLoggedIn: !!currentUser && role !== 'pending',
    isAdmin: role === 'admin',
    isTrainer: role === 'trainer',
    isMember: role === 'member',
    login,
    register,
    logout,
    sendPasswordReset,
    setAuthError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}