# Supabase Password Recovery Fix (Step 8P)

**Status:** COMPLETE — build 0 errors/0 warnings, eslint 0 NEW, smoke 27/27 + s8b regression 56/56.

## Root Cause (confirmed)

supabase-js 2.112.3 (`src/lib/supabase.js`, PKCE flow default) has
`detectSessionInUrl: true` by default. GoTrue password-reset links arrive at
the app in one of two formats:

1. `#access_token=...&type=recovery` (implicit grant)
2. `#code=...&type=recovery` (PKCE)

The SDK auto-detects either callback on page load, establishes the session,
fires a `PASSWORD_RECOVERY` event, and strips the callback from the URL
(`window.location.hash = ''`). The app only ever handled
`token_hash&type=recovery` (the verifyOtp path), so:

- `startRecovery()` never ran for SDK-handled links → `recoveryInProgress`
  stayed false → the recovery session looked like a normal login →
  `PublicRoute` redirected straight to the Dashboard, with the password reset
  form never shown ("link broken" symptom).
- On refresh after the SDK stripped the URL, the app had no way to know a
  recovery was in progress → same redirect.

Second latent bug: `USER_UPDATED` fires **before** `updateUser()` resolves, and
the old gate skipped profile loading entirely while `recoveryInProgressRef`
was true → after `finishRecovery()` no session state had been loaded → the
user was stuck on "Processing your reset link…".

## Fix

### `src/services/authService.js`
- `isRecoveryCallbackInUrl()` — detects a `type=recovery` callback in the
  current URL (hash or query, `token_hash`/`access_token`/`code` formats).
- `RECOVERY_MARKER_KEY = 'ironpulse-recovery-active'` +
  `markRecoveryActive()` / `clearRecoveryMarker()` / `isRecoveryMarkerActive()`
  — sessionStorage marker that survives reloads after the SDK strips the URL.
- `isRecoveryActive()` — URL callback OR marker (gate + refresh detection).
- `subscribeToAuthState` now forwards the GoTrue event:
  `callback(user, event)` — `PASSWORD_RECOVERY` is how the subscription
  handler learns about SDK-handled recovery callbacks.

### `src/context/AuthContext.jsx`
- Subscription handler signature `(firebaseUser, authEvent)`; computes
  `recoveryActive = event === 'PASSWORD_RECOVERY' || recoveryInProgressRef.current || isRecoveryActive()`
  and idempotently arms the gate (`startRecovery()`) if active.
- `!firebaseUser` branch now clears the marker (SIGNED_OUT ends recovery).
- Relaxed gate during recovery: the profile is STILL loaded/normalized (so
  routing works the moment recovery completes) but the role sign-outs
  (rejected / gym_owner_pending / pending) and disabled-account sign-out are
  skipped — they would destroy the recovery session before the password can
  be set. A disabled account mid-recovery stays on the auth page with the
  disabled message, but the password update still completes.
- `startRecovery()` sets the marker; `finishRecovery()` clears it.

### `src/components/Auth.jsx`
- Mode initializer now returns `'reset-new'` for:
  - `token_hash` + `type=recovery` (existing verifyOtp path),
  - `type=recovery` without `token_hash` (SDK-handled implicit/PKCE callback),
  - `isRecoveryActive()` (refresh mid-recovery via marker).
- `recoveryReady` initial state: `true` when there is no `token_hash` (SDK
  callbacks and marker refreshes already have a session; verifyOtp links need
  the exchange first).
- Link-processing effect: the recovery branch handles both formats (verifyOtp
  only when `token_hash` present), always `startRecovery()` before the token
  exchange, cleans the fragment via `history.replaceState`, and on failure
  exits recovery with a user-facing message.
- `handleSubmit` `reset-new` success: `updatePassword` → `finishRecovery()` →
  clear fields → `setMode('login')` (PublicRoute takes over to the Dashboard
  for approved accounts).
- Expired/invalid-session error codes exit recovery:
  `auth/expired-action-code`, `auth/invalid-action-code`,
  `auth/user-token-expired`, `auth/session-expired`, `auth/invalid-jwt`,
  **`auth/invalid_jwt`** (GoTrue raw-code passthrough — found by smoke),
  `auth/internal-error` → best-effort `logout()` + `finishRecovery()` +
  login screen + "This reset link has expired or is invalid. Request a new
  one."
- `auth/weak-password` keeps the gate armed so the user can retry on the same
  page.
- "Back to Sign In" now signs out of the recovery session (clears session +
  marker) before releasing the gate.

### `src/App.jsx`
- `ProtectedRoute` adds: `if (recoveryInProgress) return <Navigate to="/auth" replace />`
  — the recovery session can never reach the app shell.

## Verification

- Smoke suite (real bundled `authService.js` + rules-modeled FakeGoTrue,
  `C:\Users\daksh\AppData\Local\Temp\opencode\s8p\`): **27/27** — forgot
  request redirect URL, link parsing (all 4 formats + negative), SDK callback
  → PASSWORD_RECOVERY + URL strip, dashboard redirect blocked mid-recovery,
  reset-new screen for all formats + marker refresh, mismatch/short-password
  validation without updateUser calls, USER_UPDATED-before-resolve ordering,
  gate/marker cleared, dashboard reachable after completion, logout, new
  password works / old password rejected, normal login unaffected, zero
  Firebase in bundle, refresh-mid-recovery, dead session → expired message,
  weak-password retry, token_hash E2E, SIGNED_OUT drops marker.
- s8b auth regression: **56/56**, Firebase shim calls 0.
- `npm run build`: 0 errors, 0 warnings. Dist entry contains
  `ironpulse-recovery-active`; zero firebase API references.
- eslint on 4 changed files: 0 NEW (remaining findings are the documented
  pre-existing baseline).

## Deployment

Client-only: `firebase deploy --only hosting` (or Vercel).

## Operator action (required)

In the Supabase Dashboard (Authentication → URL Configuration), ensure the
"Redirect URLs" list includes the app's `/auth` path (e.g.
`https://your-app.example/auth`). Without it, GoTrue rejects the recovery
redirect target.