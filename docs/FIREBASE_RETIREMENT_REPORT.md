# Firebase Client Retirement — Final Report

**Status:** COMPLETE (client-side)
**Date:** 2026-08-16
**Scope:** src/ + build config + env templates. Server-side (Firebase Functions/firestore.rules) retained as rollback window; see §7.

## 1. What was removed

### Firebase client SDK — 100% eliminated from the browser bundle
- `src/firebase.js` — **deleted**. Previously the module-initialization entry (init + null sentinels + env check). Zero importers remain.
- `src/main.jsx` — removed side-effect `import './firebase'`.
- `vite.config.js` — removed the `firebase` manualChunk entry (was emitting a 1-byte empty chunk).
- `package.json` — `firebase` dependency **uninstalled**. (`@firebase/rules-unit-testing` devDep retained — used by legacy Firestore rules test files `firestore.rules.test.cjs`, `firestore.referral-heal.test.cjs`.)
- `.env` / `.env.example` / `.env.production.example` — removed all `VITE_FIREBASE_*` vars and stale Firebase comments (Supabase block + provider notes updated).

### Firebase rollback branches stripped (all files, Step 2)
| File | Notes |
|------|-------|
| `src/services/authService.js` | All 16 `if (isFirebaseMode)` branches removed (signUp, signIn, logOut, resetPassword, getUserProfile, subscribeToAuthState, reloadUser, resendVerificationEmail, verifyEmailWithCode, updatePassword, changePassword, changeEmail, approveUser, rejectUser, getPendingUsers, getGymOwnerPending). `recoverUserProfile` (Firestore-bound only) reduced to a supabase-mode no-op stub. Unused params `_`-prefixed. |
| `src/services/firestoreService.js` | Already complete (prior step). |
| `src/services/referralService.js` | Already complete (prior step). |
| `src/services/paymentService.js` | Already complete (prior step). |
| `src/services/deviceService.js` | Already complete (prior step). |
| `src/services/notificationService.js` | Already complete (prior step). |
| `src/services/ai/conversationService.js` | Already complete (prior step). |
| `src/context/AppContext.jsx` | Already complete (prior step). |
| `src/services/attendanceService.js` | Already complete (prior step). |
| `src/services/reportService.js` | Already complete (prior step). |
| `src/services/subscriptionService.js` | Complete this session. |
| `src/services/cashfreeService.js` | Complete this session. |
| `src/services/licenseHistoryService.js` | Complete this session. |
| `src/services/storageService.js` | Complete this session. |
| `src/services/supportService.js` | Complete this session. |
| `src/services/referralCode.js` | Complete this session (manual — 3 Firebase-only helpers reduced to no-ops). |
| `src/utils/license.js` | Complete this session (manual — supabase-only license key check). |
| `src/services/securityService.js` | Complete this session (manual — supabase-only get_security_metrics RPC). |
| `src/pages/gym/...` / components | `GymOwners.jsx`, `Subscriptions.jsx` (superadmin), `MemberModal.jsx`, `Settings.jsx`, `LicenseKeys.jsx`, `ChatPanel.jsx` — firebase branches/imports removed. |

Transform tooling: `C:\Users\daksh\AppData\Local\Temp\opencode\s82\` (`transform-referral.cjs` v1, `transform-v2.cjs` v2; all pre-edit `.bak` backups retained).

## 2. Verification evidence

### Build
- `npm run build` — 0 errors, 0 warnings.

### Bundle audit (dist)
- Zero `firebase*` chunks in `dist/assets` (previously `firebase-BkpP728X.js`, 385,807 bytes).
- Zero matches for `firebase/app|firebase/auth|firebase/firestore|firebase/storage|firebase/functions|initializeApp|getFirestore|getAuth(|getStorage(|getFunctions(` across `dist/assets`.

### Source audit (src)
- Zero matches for `isFirebaseMode`, `firebase/app|auth|firestore|storage|functions`, `initializeApp`, `getFirestore`, `getAuth(`, `getStorage(`, `getFunctions(`, `httpsCallable`, `onSnapshot`, `updateDoc(`, `setDoc(`, `addDoc(`, `deleteDoc(` — remaining hits are only comments/docstrings and the legitimate `firebase_uid` column name.
- `src/services/*.transformed` temp artifacts deleted.

### ESLint
- `authService.js`, `main.jsx`, `vite.config.js` — 0 errors, 0 warnings (unused `role`/`email`/`uid` params `_`-prefixed).

### Smoke suites (all rebuilt from current source)
| Suite | Result |
|-------|--------|
| s8b (auth) | 56/56 |
| s8c (data plane) | 101/101 |
| s8e (write paths) | 73/73 (T7e updated: numeric messageCount delta replaces Firestore increment sentinel) |
| s8f (storage) | 35/35 |
| s8g (payments) | 77/77 |
| s9a (cutover audit) | 13/13 |
| s8d (realtime) | 96/100 = exact pre-existing recorded harness baseline (T02/T24/T25/T32); smoke-rt 31/31 |

## 3. Production bugs caught during this step
- `T7e`: `conversationService.supabaseUpdateConversation` now resolves numeric message-count deltas via read-then-set (replaces the Firestore `increment()` object sentinel that would otherwise be written to the DB). ChatPanel passes a plain `delta` number.

## 4. Deployment
- Client-only: `firebase deploy --only hosting` (or Vercel). No schema/RLS/Edge Function changes required.

## 5. Remaining Firebase surface (intentional)
- `functions/index.js` + `functions/package.json` — legacy Cloud Functions, retained as the 30-day provider-webhook rollback receiver (Step 8G/9B cutover plan).
- `firestore.rules` + `firebase.json` — server-side legacy, retained with functions for the rollback window.
- Root test files (`firestore.rules.test.cjs`, `firestore.referral-heal.test.cjs`, `probe.cjs`, `probe2.cjs`) + `scripts/migration/*` — dev/test-only Firebase tooling.
- `@firebase/rules-unit-testing` devDependency — used by the rules test files.
- `public/sw.js:51` — network-first SW cache-bypass regex for old Firebase hostnames (harmless, inert).
- `firebase_uid` column in Supabase `profiles` — data-plane column name, not an SDK reference.

## 6. Rollback
Rebuild with `VITE_AUTH_PROVIDER=firebase` is **no longer possible** — rollback branches were deleted, not folded. Prior verified bundle (`dist/` from the last 9A build) + legacy Firebase Functions remain the rollback path.