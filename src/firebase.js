// src/firebase.js
// Minimal Firebase config
// Single app instance only

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

const REQUIRED_ENV_VARS = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missingVars = Object.entries(REQUIRED_ENV_VARS)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}. ` +
    'Create a .env file in the project root with these values. ' +
    'See .env.example for the required format.'
  )
}

export const firebaseConfig = {
  apiKey: REQUIRED_ENV_VARS.VITE_FIREBASE_API_KEY,
  authDomain: REQUIRED_ENV_VARS.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: REQUIRED_ENV_VARS.VITE_FIREBASE_PROJECT_ID,
  storageBucket: REQUIRED_ENV_VARS.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: REQUIRED_ENV_VARS.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: REQUIRED_ENV_VARS.VITE_FIREBASE_APP_ID,
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