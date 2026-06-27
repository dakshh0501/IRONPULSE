// src/firebase.js
// Minimal Firebase config
// Single app instance only

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize Firebase app
const app = initializeApp(firebaseConfig)

// Export instances
export const db = getFirestore(app)
export const auth = getAuth(app)

// Explicitly set persistence to local (IndexedDB) — required for Capacitor
// WebView on Android where IndexedDB must persist across app restarts.
// Set synchronously on init to ensure persistence is configured before any
// auth operation. Catch and log any failure to avoid unhandled rejection.
;(async () => {
  try {
    await setPersistence(auth, browserLocalPersistence)
  } catch (err) {
    console.error('[AUDIT] setPersistence failed:', err?.code || err?.name, err?.message)
  }
})()

export const storage = getStorage(app)
export const functions = getFunctions(app)