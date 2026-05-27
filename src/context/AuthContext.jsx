// src/context/AuthContext.jsx
// Wraps the app with live auth state. Sits ABOVE AppContext in main.jsx.
// Your existing AppContext is untouched.

import { createContext, useContext, useEffect, useState } from 'react'
import {
  subscribeToAuthState,
  getUserProfile,
  signIn,
  signUp,
  logOut,
  resetPassword,
} from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]   = useState(null)   // Firebase user object
  const [userProfile, setUserProfile]   = useState(null)   // Firestore profile doc
  const [role, setRole]                 = useState(null)   // 'admin' | 'trainer' | 'member'
  const [authLoading, setAuthLoading]   = useState(true)   // true while Firebase resolves session
  const [authError, setAuthError]       = useState('')

  // ── Persistent session: fires on every page load ──────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await getUserProfile(firebaseUser.uid)
          setCurrentUser(firebaseUser)
          setUserProfile(profile)
          setRole(profile?.role ?? null)
        } catch {
          // Profile missing — treat as logged out
          setCurrentUser(null)
          setUserProfile(null)
          setRole(null)
        }
      } else {
        setCurrentUser(null)
        setUserProfile(null)
        setRole(null)
      }
      setAuthLoading(false)
    })

    return unsubscribe   // cleanup on unmount
  }, [])

  // ── Auth actions ──────────────────────────────────────────────────────────
  async function login(email, password) {
    setAuthError('')
    try {
      const { user, role: r } = await signIn(email, password)
      setCurrentUser(user)
      setRole(r)
      const profile = await getUserProfile(user.uid)
      setUserProfile(profile)
      return r   // return role so caller can redirect
    } catch (err) {
      setAuthError(friendlyError(err.code))
      throw err
    }
  }

  async function register({ name, email, password, role: r = 'member' }) {
    setAuthError('')
    try {
      const user = await signUp({ name, email, password, role: r })
      setCurrentUser(user)
      const profile = await getUserProfile(user.uid)
      setUserProfile(profile)
      setRole(profile?.role ?? 'member')
      return profile?.role ?? 'member'
    } catch (err) {
      setAuthError(friendlyError(err.code))
      throw err
    }
  }

  async function logout() {
    try {
      await logOut()
    } finally {
      setCurrentUser(null)
      setUserProfile(null)
      setRole(null)
    }
  }

  async function sendReset(email) {
    setAuthError('')
    try {
      await resetPassword(email)
    } catch (err) {
      setAuthError(friendlyError(err.code))
      throw err
    }
  }

  // ── Helper: turn Firebase error codes into human messages ─────────────────
  function friendlyError(code) {
    const map = {
      'auth/user-not-found':       'No account found with this email.',
      'auth/wrong-password':       'Incorrect password. Try again.',
      'auth/email-already-in-use': 'This email is already registered.',
      'auth/weak-password':        'Password must be at least 6 characters.',
      'auth/invalid-email':        'Please enter a valid email address.',
      'auth/too-many-requests':    'Too many attempts. Please wait and try again.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    }
    return map[code] ?? 'Something went wrong. Please try again.'
  }

  const value = {
    currentUser,
    userProfile,
    role,
    authLoading,
    authError,
    isAdmin:   role === 'admin',
    isTrainer: role === 'trainer',
    isMember:  role === 'member',
    isLoggedIn: !!currentUser,
    login,
    register,
    logout,
    sendReset,
    setAuthError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom hook — use this in every component instead of useContext(AuthContext) directly
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}