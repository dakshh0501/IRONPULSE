# Production Auth Verification & Approval Routing Fix Report

Date: 2026-08-17
Scope: `https://ironpulse-liart.vercel.app` — Identity Toolkit HTTP 400 (Firebase retirement) + email-verification / approval-pending routing bug.
Build: 0 errors, 0 warnings. ESLint: 0 NEW findings. Smokes: s8b 56/56, s8p 27/27 (regression).

## Issue 1 — identitytoolkit.googleapis.com HTTP 400 (root cause)

Source, local `dist/`, and the live Vercel deployment are ALL clean of Identity Toolkit / Firebase SDK:

- `src/` scan: zero Firebase SDK imports (only `firebase_uid`/`firebaseUid` DB column names remain; `package.json` carries `firebase-functions ^7.2.5` for the legacy `functions/` folder — never shipped to the browser).
- Local `dist/` (entry `index-B76GMJox.js` after this build): 0 matches for `identitytoolkit`, `accounts:signInWithPassword`, `VITE_FIREBASE`, `firebaseConfig`, `firebase/app`, `firebase/auth`. Remaining `firebase` strings are inert: `firebase_uid` column names, Google Fonts `googleapis.com/css2`, UI copy mentioning "Firebase" as a word (Security page tooltips, Landing marketing text), and the SW navigation regex.
- Live deployment (entry `index-DZvN7GmL.js` + Auth/VerifyEmail/vendor/web/Checkout/PaymentStatus chunks): 0 `identitytoolkit`, 0 Firebase SDK refs, 99 supabase refs.

**Root cause**: the 400 originates client-side or from the now-replaced deployment:

1. Per the AGENTS.md Step 8S audit, Vercel previously served the Firebase-era bundle (`index-Cf9AhdBu.js` + `firebase-vV65taRE.js`). Those chunks are gone from Vercel (old URLs now return the SPA fallback), but any browser that loaded the old deployment initialized Firebase Auth and called `identitytoolkit.googleapis.com/accounts:signInWithPassword` — which now returns 400 because the Firebase project/API key no longer exists.
2. The PWA service worker (`public/sw.js`) uses `cacheFirst` for static assets with cache names `ironpulse-v2`/`ironpulse-static-v2` and only deletes caches whose names do NOT match v2 — so clients that cached the Firebase-era bundle during the old deployment keep running it indefinitely (cache never expires).

**Remediation (deployment-level)**: bumped SW cache names to `ironpulse-v3`/`ironpulse-static-v3` (`public/sw.js`) so the next SW activation purges stale Firebase-era caches from clients. Removed the stale `dns-prefetch` to `firestore.googleapis.com` from `index.html` (a leftover Firebase string in shipped HTML). No client can fetch Identity Toolkit code after the redeploy.

## Issue 2 — Email verification / approval-pending routing (root cause)

Legacy backup (`IRONPULSE.backup/src/context/AuthContext.jsx:208`) had `isLoggedIn: !!currentUser && role !== 'pending'` — it did NOT exclude `gym_owner_pending` or `rejected`. In the old Firebase-era deployment, a just-verified gym owner got `currentUser` set → `isLoggedIn` true → PublicRoute flashed them into the dashboard → the role gate then signed them out with "Your gym registration is awaiting admin approval." — the exact reported production UX (dashboard flash → bounce to login).

**Current source** (Supabase era) already implements the correct state machine — no dashboard flash is possible: the auth subscription gates all pending roles (`['pending','gym_owner_pending','rejected']`) before `currentUser` is ever set, signs out, and sets `authError`; `authLoading` guards renders meanwhile. Email verification ≠ approval by construction: approval state comes ONLY from the DB (`profiles.role`, written by provisioning at first sign-in, admin changes it via approval).

**Fixes applied (hardening + UX routing by actual account state):**

| File | Change |
|------|--------|
| `src/context/AuthContext.jsx:670` | `isLoggedIn` now also excludes `gym_owner_pending` (was missing) — email verification can never grant dashboard access to an unapproved account. |
| `src/App.jsx:248` | `ProtectedRoute` now treats `gym_owner_pending` like `pending` → `/auth` (defense-in-depth; approval state can never reach the app shell). |
| `src/components/Auth.jsx` (verify-done branch) | Post-confirmation screen now renders the `authError` banner — a pending gym owner confirming their email immediately sees "Your gym registration is awaiting admin approval." instead of a bare "Email Verified" screen (explicit approval-pending state; no dashboard, no bounce). |

**Resulting state machine (verified by trace):**
- Email not verified → GoTrue blocks sign-in → "verify email" screen on `/auth` (no account state assumed).
- Verified + approval pending → sign-out + "Your gym registration is awaiting admin approval." on `/auth` (from DB role, never from email state).
- Verified + approved (`gym_admin` etc.) → dashboard.
- Rejected (`account_disabled`) → "This account has been disabled. Contact support."
- Password recovery (Step 8P flow) untouched — s8p 27/27.

## Verification

- `npm run build` 0 errors, 0 warnings (8.60s; entry `index-B76GMJox.js`, 12 `gym_owner_pending` markers present; SW v3 names present; firestore dns-prefetch absent).
- `dist/` scan clean (matrix above); `index.html` references only the new entry.
- ESLint on 3 changed JS files: 21 findings — byte-identical to the pre-change baseline (verified via `git stash` comparison), 0 NEW.
- Smokes rebuilt from current source: s8b **56/56** (0 firebase shim calls), s8p **27/27** (password recovery regression).

## Files changed

`src/context/AuthContext.jsx`, `src/App.jsx`, `src/components/Auth.jsx`, `public/sw.js`, `index.html` — 5 files, +11/−5 lines.

## Required actions

1. **Vercel redeploy (hosting only)** — production currently serves an older Supabase-era build (`index-DZvN7GmL.js`); the fixes + SW cache bump go live only after `vercel --prod` (or the project's deploy flow).
2. **Supabase Dashboard**: Redirect URLs must include `https://ironpulse-liart.vercel.app/auth` (GoTrue email-confirmation/recovery targets) — operator-side.
3. After redeploy, verify in a browser that previously showed the 400: hard-refresh / re-register SW → old `ironpulse-static-v2` caches purged, no identitytoolkit requests in the Network tab.

## Remaining Firebase references (non-blocking, by design)

- `firebase-functions ^7.2.5` in `package.json` + legacy `functions/` folder — server-side rollback path only, never shipped to the browser.
- Inert UI copy mentioning "Firebase" (Security page disabled-tooltip labels, Landing "Firebase Auth" marketing line, Members modal tip, Settings About tab) — cosmetic text, no functional reference; intentionally untouched (out of scope).
- `firebase_uid` DB column name (profiles identity mapping) — schema, unchanged.
- SW navigation regex matching `firebaseio|googleapis` hosts — inert (no code calls those hosts anymore).
- Out-of-scope security note: a GROQ API key is inlined in the `groqProvider` chunk in `dist/` (pre-existing; recommend rotating the key and moving to an env-only/bounded proxy).