# SUPABASE AUTH MIGRATION REPORT — Step 8B

Date: 2026-08-15
Scope: `src/services/authService.js` — Firebase Auth → Supabase Auth (GoTrue)
Status: COMPLETE — build ✅ 0 errors / 0 warnings, smoke ✅ 56/56, Step 14 validated

---

## 1. What changed

| File | Change |
|------|--------|
| `src/services/authService.js` | Full rewrite: dual-provider auth service. **Supabase (GoTrue) is the active backend** (default). The legacy Firebase implementation is retained behind an explicit build-time switch `VITE_AUTH_PROVIDER=firebase` (operator rollback ONLY — never a runtime/silent fallback). New Supabase implementations for every exported function; 4 new exports added. |
| `src/context/AuthContext.jsx` | Disabled-account gate in the auth subscription handler AND login path (Step 6: disabled/banned respected); `recoveryInProgress` state (ref-backed) + `startRecovery()`/`finishRecovery()`; recovery gate skips profile loading/role sign-outs during the GoTrue recovery callback; referral self-heal/registration blocks skipped in Supabase mode (Firestore-bound, rule-denied for anonymous sessions — documented boundary); friendly error added for `auth/email-not-verified`. |
| `src/components/Auth.jsx` | Auth-link handling extended: GoTrue `token_hash`+`type` links (query AND hash fragment) — `type=email` (verification), `type=email_change` (email confirmation), `type=recovery` (password reset → new **"Set New Password"** form mode `reset-new` with `completeRecoveryLink` + `updatePassword` wiring); legacy Firebase `oobCode` links still processed. Recovery flow sets `startRecovery()` BEFORE the token exchange so PublicRoute/subscription gates never redirect or sign the mid-recovery session out. |
| `src/App.jsx` | `PublicRoute` respects `recoveryInProgress` (keeps the auth page visible while the recovery session exists but the new password is not yet set). |
| `src/pages/Settings.jsx` | `savePassword` → `authService.changePassword` (reauth probe + update); email change → `authService.changeEmail`; profile-doc email sync is now best-effort (non-fatal). Removed both dynamic `firebase/auth` imports + unused `getAppUrl` import. |
| `.env.example` / `.env.production.example` | `VITE_AUTH_PROVIDER=supabase` documented (`supabase` default | `firebase` legacy rollback). |

## 2. Firebase Auth operations removed from authService.js

| Firebase API | Supabase equivalent (Step 2 mapping) |
|--------------|--------------------------------------|
| `createUserWithEmailAndPassword` | `supabase.auth.signUp({ email, password, options })` — email confirmation required; no session at signup |
| `signInWithEmailAndPassword` | `supabase.auth.signInWithPassword` + role gates (pending/gym_owner_pending/rejected) + disabled gate + email-confirmed gate |
| `signOut` | `supabase.auth.signOut()` |
| `sendPasswordResetEmail` | `supabase.auth.resetPasswordForEmail(email, { redirectTo: getAppUrl() + '/auth' })` |
| `sendEmailVerification` | `supabase.auth.resend({ type: 'email', ... })` — links carry `?token_hash&type=email` |
| `onAuthStateChanged` | `supabase.auth.onAuthStateChange` — SDK-persisted session restoration (no manual token storage), unsubscribe via `data.subscription.unsubscribe()` |
| `reload` | `supabase.auth.getUser()` → refreshed adapted user |
| `applyActionCode` | `supabase.auth.verifyOtp({ type, token_hash })` — types: email / email_change / recovery |
| (Firestore `users/{uid}` + `referralCodes` + `gyms` signup artifacts) | Provisioned in Supabase at first sign-in: `profiles` row → `referral_codes` row → `gyms` row (see §5) |

**New exports (API-compat superset):** `completeRecoveryLink(tokenHash)` (Step 7 — recovery callback), `updatePassword(newPassword)` (Step 7), `changePassword(current, next)` / `changeEmail(current, next)` (Step 9 — reauth), plus helpers `authProvider`, `adaptSupabaseUser`, `mapProfileRow`, `getUrlTokenParams`, `mapSupabaseAuthError`, `provisionProfile`.

**Preserved exports (same signatures):** `signUp`, `signIn`, `logOut`, `resetPassword`, `recoverUserProfile` (Firestore-bound — Supabase-mode no-op returning null; unused), `getUserProfile`, `subscribeToAuthState`, `reloadUser`, `resendVerificationEmail`, `verifyEmailWithCode(oobCode, tokenType)`, `approveUser`, `rejectUser`, `getPendingUsers`, `getGymOwnerPending`, `approveGymOwner` (deprecated throw), `rejectGymOwner` (deprecated throw).

## 3. Session behavior (Step 3)

- Supabase sessions are managed entirely by the GoTrue client (localStorage persistence) — **no manual token storage anywhere** in the app.
- `subscribeToAuthState` maps GoTrue users to the application user shape via `adaptSupabaseUser`: `{ uid: user.id, email, emailVerified: !!email_confirmed_at || !!confirmed_at, displayName, photoURL, phoneNumber, metadata: { creationTime, lastSignInTime } }` — the same shape the old Firebase subscription produced, so `AuthContext`/`ProtectedRoute`/`VerifyEmail` required zero changes to their expectations.
- Restore-on-refresh: GoTrue emits `INITIAL_SESSION` on subscribe when a persisted session exists (single callback — no duplicate listeners; cleanup returns the unsubscribe function).

## 4. Profile / role behavior (Step 4)

- `getUserProfile(uid)` reads `profiles` (`profiles.id = auth.users.id`) and maps the row to the legacy profile shape: `{ uid, email, name, role, gymId: gym_id, referralCode: referral_code, referredBy: referred_by, isSuperAdmin, accountDisabled, photoURL, createdAt, firebaseUid }`.
- **Role semantics preserved:** `role` from the profiles row drives `AuthContext`/`rbac` exactly as before; pending/gym_owner_pending/rejected gates in `signIn` behave identically (sign out + distinct error, mapped by `AuthContext.login`).
- **Provisioning at first sign-in** (no `handle_new_user` trigger exists; profiles insert-self policy needs a session): `provisionProfile()` inserts the full profiles row in one shot (role/gym_id/referral_code are NOT user-writable after insert per `guard_profiles_update`), then the `referral_codes/{code}` directory row (policy requires `profiles.referral_code = code` already set → order matters), then — for gym-owner signups — the `gyms` row with `owner_uid = auth_firebase_uid()` + `approval_status: 'pending'` (policy-compliant). All idempotent via PK 23505 catch → re-select. Supabase-native users store `firebase_uid = own id` (self-reference convention — the column is NOT NULL UNIQUE).
- Referral code: generated locally (`generateReferralCode`, pure crypto — no `users` query, never rule-denied); `referredBy` captured from signup metadata + localStorage park.

## 5. Signup (Step 5)

- `signUp()` → GoTrue signup with `emailRedirectTo: ${getAppUrl()}/auth?verified=true` and `user_metadata` stashing `{ name, phone, gymName, ownerName, referredBy }`.
- **Compatibility boundary (documented):** the old Firestore signup artifacts (`gyms/{id}`, `users/{uid}`, `referralCodes/{code}`) require an authenticated Firebase session, which Supabase-native users do not have. These are now created in Supabase at first sign-in (§4). This is temporary until the firestoreService migration (Step 10).

## 6. Disabled / banned accounts (Step 6)

- `profiles.account_disabled` checked in THREE places: `signIn` (sign out + throw `code: 'auth/user-disabled'`), the AuthContext subscription handler, and the AuthContext login path (belt-and-suspenders). Disabled users never enter the application.

## 7. Password reset / recovery (Step 7)

- Request: `resetPasswordForEmail(email, { redirectTo: getAppUrl() + '/auth' })` — anti-enumeration (unknown emails produce no error).
- Link lands on `/auth` with `#type=recovery&token_hash=...` → Auth.jsx detects it, calls `startRecovery()`, then `completeRecoveryLink(token)` (`verifyOtp({ type: 'recovery' })` → recovery session), then the "Set New Password" form calls `updatePassword(newPassword)` (`updateUser({ password })`). After success `finishRecovery()` lets the session proceed to the dashboard; failures keep the recovery gate so the user can retry. Expired/invalid tokens map to `auth/expired-action-code` / `auth/invalid-action-code` with the existing friendly messages.

## 8. Email verification (Step 8)

- Links carry `token_hash`+`type=email` (or `type=email_change`) in query or hash → `verifyEmailWithCode` calls `verifyOtp` (no Firebase `applyActionCode` anywhere in the Supabase path).
- `reloadUser` re-reads the GoTrue user for `email_confirmed_at` → `emailVerified` — the `/verify-email` page and `refreshEmailStatus` work unchanged.
- **Documented difference:** GoTrue `verifyOtp(type: email)` establishes a session for a previously-unconfirmed user (auto-login after verification), whereas Firebase required a separate sign-in. The UI already says "You can now sign in" — behavior is compatible.

## 9. Reauthentication (Step 9)

- GoTrue has no `reauthenticate` API. Closest safe equivalent implemented: a `signInWithPassword` probe with the current password before the sensitive update (`changePassword` / `changeEmail`); wrong current password surfaces `code: 'auth/wrong-password'` → "Current password is incorrect" in Settings (existing catch code intact).
- **Documented difference:** the probe replaces the session tokens of the same user (identity unchanged; no other tab is affected beyond a fresh token).

## 10. Admin / secondary auth (Step 10 — temporary compatibility boundary)

- No browser-side service key exists (verified: zero `service_role` in `.env`/src). Admin provisioning (staff creating members/trainers) is **not** re-implemented against GoTrue — `firestoreService.js` secondary-auth (Firebase) remains untouched and OUT OF SCOPE per the task. Staff-created accounts are Firebase-only and cannot sign in via Supabase until the firestoreService migration.
- `approveUser`/`rejectUser` operate on Supabase `profiles` rows (super-admin-only per `guard_profiles_update`); gym-admin approval flows remain Firestore-bound until that migration. No consumers exist today (grep-verified).
- **Data-plane boundary:** Firestore reads/writes (AppContext listeners, settings, referrals, payments…) require a Firebase session; Supabase-authenticated users have none, so data screens are empty/unavailable until the firestoreService migration (next task). Operators may keep serving Firebase-auth builds (`VITE_AUTH_PROVIDER=firebase`) during the transition — explicit, not silent.

## 11. Error handling

`mapSupabaseAuthError` maps GoTrue error codes to the Firebase-style `auth/*` codes the app already understands (`invalid_credentials`→`auth/invalid-credential`, `email_not_confirmed`→`auth/email-not-verified`, `weak_password`→`auth/weak-password`, `otp_expired`/`token_expired`→`auth/expired-action-code`, `invalid_otp`→`auth/invalid-action-code`, `over_*_rate_limit`→`auth/too-many-requests`, `user_already_exists`→`auth/email-already-in-use`, `session_not_found`→`auth/user-token-expired`, network errors→`auth/network-request-failed`, …). `AuthContext.friendlyError` gains `auth/email-not-verified`.

## 12. Tests (Step 13) — smoke 56/56

No test framework exists in the repo; used the established convention (temp Node harness + esbuild bundle of the REAL `authService.js` + rules-modeled fake GoTrue client; shims: `lib/supabase`, `appUrl`, `referralCode`, `referralService`, `firestoreService`, `firebase`, `firebase/auth`, `firebase/firestore`, `firebase/functions`). Harness: `C:\Users\daksh\AppData\Local\Temp\opencode\s8b\` (`build.cjs`, `shim-*.cjs`, `smoke.cjs`).

Coverage (scenarios per Step 13): S1 session restore on subscribe (+ unsubscribe cleanup), S2 successful login, S3 logout clears session, S4 SIGNED_IN/SIGNED_OUT auth-state events deliver adapted user/null, S5 profile loading, S6 role mapping, S7 disabled/rejected/pending/gym_owner_pending gates, S8 password-reset request (anti-enumeration), S9 recovery-link completion, S10 password update + re-login with new password, S11 email-verification links (confirm + invalid token), S12 reauth (changePassword/changeEmail — wrong/right current password, email_change confirmation), S13 provisioning (member metadata + gym-owner signup → confirm → login → profiles+referral_codes+gyms rows, referred_by captured), S14 malformed/no session → null callback, S15 error mapping (invalid credentials, rate limit, network), S16 signUp metadata + duplicate email, S17 approve/reject (super admin) + non-super denial, S18 pending lists, S19 reloadUser + resend, S20 recoverUserProfile no-op, S21 deprecated stubs, S22 **ZERO Firebase Auth API calls across the entire suite** (counter-instrumented `firebase/auth` shim — legacy mode is dead code in a supabase build).

No production users were created or touched.

## 13. Build & Step 14 validation

- `npm run build`: **0 errors, 0 warnings** (15.46s).
- Production bundle checks (supabase build):
  - Active path present: `signInWithPassword`, `resetPasswordForEmail`, `verifyOtp`, `email_confirmed_at`, `token_hash`, `VITE_AUTH_PROVIDER` in the authService chunk (`dist/assets/index-CkTTLCHY.js`).
  - **`isFirebaseMode` is absent from the bundle** — esbuild constant-folded `VITE_AUTH_PROVIDER=supabase` and dead-code-eliminated ALL legacy Firebase branches + imports from the supabase build. The Firebase Auth APIs that remain in the bundle belong to `firestoreService.js` secondary-auth (out of scope, documented).
  - No silent fallback: `authProvider` is a build-time constant; the only way to get Firebase behavior is an explicit `VITE_AUTH_PROVIDER=firebase` rebuild.
  - No service-role key anywhere client-side (grep: `service_role`/`SUPABASE_SERVICE` → 0 hits in src).

## 14. Known differences / risks

1. **Data-plane outage for Supabase users (HIGH — expected, temporary):** Firestore content (members, payments, plans, attendance, settings, approvals) requires a Firebase session. Until the firestoreService migration lands, Supabase-authenticated users see empty data screens. Mitigation: `VITE_AUTH_PROVIDER=firebase` builds keep the old behavior; rollback = redeploy prior commit.
2. **Imported users' passwords:** the 25 Supabase auth users were provisioned with random temp passwords (never stored) — they must use "Forgot password" to set a real password; their old Firebase passwords do NOT work against Supabase.
3. **Staff-created accounts (secondary auth):** Firebase-only until firestoreService migrates — cannot sign in via Supabase during this window.
4. **approveUser/rejectUser:** super-admin-only (RLS guard); gym-admin flows pending Firestore migration; no current consumers.
5. **Email-change semantics:** GoTrue sends an `email_change` confirmation to the new address and the OLD email stays active until confirmed (Firebase blocked the account during pending change). Settings success copy says "Check your new inbox" — accurate.
6. **Recovery + biometric:** recovery sessions are normal sessions; the biometric gate applies after login as before.
7. **Deployment needed:** none for client code (hosting deploy only). No schema/RLS/functions changes were made (all writes are policy-compliant with the existing migrations).

## 15. Files changed (final)

`src/services/authService.js`, `src/context/AuthContext.jsx`, `src/components/Auth.jsx`, `src/App.jsx`, `src/pages/Settings.jsx`, `.env.example`, `.env.production.example`, `docs/SUPABASE_AUTH_MIGRATION_REPORT.md`. Not touched (per task): `firestoreService.js`, firestore.rules, migrations, Cloud Functions, payments, routes, roles.
