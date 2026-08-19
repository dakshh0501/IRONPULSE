// src/utils/appUrl.js
// Single source of truth for the public app base URL used in auth email links
// Auth email action links (email verification, password reset).
// - Local development: always the dev server origin (http://localhost:3000)
//   so links point at the local app even when .env defines a production URL.
// - Production: VITE_APP_URL (e.g. https://ironpulse-liart.vercel.app),
//   falling back to window.location.origin when unset.

export function getAppUrl() {
  if (import.meta.env.DEV) return window.location.origin
  return import.meta.env.VITE_APP_URL || window.location.origin
}