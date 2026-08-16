# SUPABASE PRODUCTION CUTOVER READINESS — Step 9A Final Audit Report

Project: IRONPULSE (Supabase project `osfhojfqytmqsqcmzvlf`, Firebase project `ironpulse-32f31`)
Date: 2026-08-15
Scope: Final cutover readiness audit — NO production traffic changes were made in this step.

---

## VERDICT: READY_FOR_FINAL_PAYMENT_VALIDATION

The application code is cutover-ready. All Firebase runtime activity in Supabase-mode
builds is eliminated or provably inert, all unexpected cross-provider references are
fixed, and every audit dimension passes. The ONLY remaining gate is external operator
credentials (payment secrets + Cashfree client id), not code.

Preconditions still required before LIVE cutover (all external, none code):
1. `supabase secrets set PHONEPE_MERCHANT_ID PHONEPE_SALT_KEY PHONEPE_SALT_INDEX
   CASHFREE_CLIENT_ID CASHFREE_CLIENT_SECRET CASHFREE_MODE` (see Step 6).
2. Final sandbox payment validation (Step 6.2) and provider-side webhook test events.
3. `supabase db push` for migrations 0006/0007/0008 (includes the new
   `get_security_metrics` authenticated grant).
4. `supabase functions deploy` (phonepe-pay/phonepe-verify/cashfree-order/cashfree-verify
   + phonepe-callback/cashfree-webhook `--no-verify-jwt`).
5. Hosting deploy of the audited bundle (`npm run build` output, STEP 9 evidence).

---

## STEP 1 — Firebase Reference Audit

Method: source-level grep matrix of all Firebase SDK imports (`firebase/app`,
`firebase/auth`, `firebase/firestore`, `firebase/storage`, `firebase/functions`) plus an
AST-style usage scan (guard-window scanner) across all 25 SDK-importing files; every
flagged site manually verified against its branch context. Classification:

| Class | Meaning | Count |
|---|---|---|
| ROLLBACK_ONLY | Reference lives inside a `IS_FIREBASE_MODE`-folded branch (dead in supabase builds) | 90+ sites across 18 files |
| SERVER_LEGACY | Legacy `functions/` Cloud Functions (Firebase deployment, rollback path only) | `functions/index.js` (kept, not deleted) |
| DOCUMENTED_EXCEPTION | SDK module present in supabase build but provably inert (no init, no network, no API calls) | firebase SDK chunk (see U0) |
| UNEXPECTED | Would execute in supabase mode | 5 found → 5 fixed |

### U0 (fixed this step) — `src/firebase.js` startup initialization
Before: `firebase.js` was statically imported by 18 modules and initialized the SDK at
module load in ALL builds (env-missing `throw`, `initializeApp`, `getFirestore/getAuth/
getStorage/getFunctions`, `setPersistence`). In supabase builds the env-throw and init
calls were constant-folded dead, but the module was still a startup liability and its
imports pinned the SDK chunk into the bundle graph.
Fix: `firebase.js` rewritten mode-conditional with the same foldable pattern as
authService/firestoreService — `const IS_FIREBASE_MODE = (import.meta.env
.VITE_AUTH_PROVIDER || 'supabase') === 'firebase'`; exports `firebaseConfig/db/auth/
storage/functions = null` sentinels in supabase mode; env-check, app init and
persistence setup run only inside `if (IS_FIREBASE_MODE)`.
Verified in dist: env-throw, `getFirestore/getAuth/getStorage/getFunctions` calls and
`setPersistence` are GONE from the firebase chunk; only SDK definitions remain.

### U1 (fixed) — `src/services/paymentService.js` module-level `getFunctions()`
`const functions = getFunctions()` ran at module import → `getApp()` threw
("no Firebase App") in supabase mode → Subscriptions/Checkout/PaymentStatus pages
would crash. Fix: lazy `getFirebaseFunctions()` (guarded by the folded const) +
`getCreatePaymentFn()`/`getVerifyPaymentFn()`; call sites switched.

### U2 (fixed) — `src/services/cashfreeService.js` module-level `getFunctions()`
Same crash pattern (Checkout page import). Fixed identically (lazy + guarded).

### U3 (fixed) — `src/services/securityService.js` Firebase-only
`fetchSecurityMetrics()` called raw `getDocs(collection(db,...))` for super_admin in
supabase mode → crash (null `db`). Fix: supabase branch invoking the super-admin RPC
`get_security_metrics()` (0006_rpc.sql); new migration `0008_rpc_grant_security_metrics.sql`
grants `execute ... to authenticated` (the in-function `is_super_admin()` gate remains the
authorization boundary; the browser client is the anon-key client + user JWT).

### U4 (fixed) — `src/utils/license.js` Firebase-only `generateUniqueLicenseKey()`
Called from `approveGymOwner` (AppContext, supabase mode too) and LicenseKeys →
crash. Fix: supabase branch querying `gyms` with the jsonb path filter
`.eq('subscription->>licenseKey', key)`; failure falls back to a pure-random key
(non-blocking).

### U5 (fixed) — `src/pages/superadmin/Subscriptions.jsx` unguarded mirror block
`handleAction` wrote the Firestore mirror (`getDoc(doc(db,...))` + `updateSubscription`)
unconditionally → crash after every subscription action in supabase mode (the action
itself had already succeeded server-side). Fix: mirror block wrapped in
`if (IS_FIREBASE_MODE)`; supabase mode relies on the lifecycle RPCs which already
maintain the `subscriptions` row.

### Verified-safe (false positives from the scan, guarded in context)
firestoreService `getSecondaryAuth()` (lazy, firebase-branch callers only), deleteMember/
deleteTrainer `deleteAuthUser` httpsCallable (firebase branches; supabase branches
early-return), GymOwners `handleDelete` cascade (supabase early-return at function head),
Subscriptions `handleDeleteSub` (guarded at 703), LicenseKeys `serverTimestamp()`
sentinels (converted by `licensePatch` in supabase mode — same class as the ChatPanel
`increment()` sentinel handled in `supabaseUpdateConversation`), subscriptionService
(dual-provider at function head), supportService/reportService/storageService (supabase
branches or comments), ChatPanel `increment(delta)` (sentinel only — converted
read-then-set in supabase).

### Residual (DOCUMENTED_EXCEPTION): the dormant firebase SDK chunk
After U0–U5, no module-level or reachable Firebase call remains, but the bundle still
emits `assets/firebase-FusQFP5G.js` (~413 kB, gzip 99 kB) because `firebase.js` keeps
static SDK imports (top-level ESM imports cannot be conditionally compiled; the SDK
modules are treated as side-effectful by rollup, and the `firebase` manualChunk keeps
them in their own chunk). It is loaded but inert: contains zero `getFirestore/getAuth/
getStorage/getFunctions` call sites, zero app init, zero network activity — proven by
the chunk scan and the s9a/s8g zero-call counters. Removing the manualChunk merges the
SDK INTO the entry (890 kB entry — worse startup). Accepted: rollback-mode correctness
(Firebase rebuild must keep synchronous `db` init) outweighs the ~99 kB gzip dormant load.
Elimination would require async/top-level-await init, which would break the sync
Firebase rollback path.

---

## STEP 2 — Mixed-Backend Audit

Goal: prove a supabase build cannot read-Firebase/write-Supabase (or vice versa) and
cannot silently mix providers.

| Concern | Result | Evidence |
|---|---|---|
| Runtime Firebase data reads in supabase mode | NONE | s9a T13 + s8g T87: zero `firebase/firestore` calls across entire suites; bundle has no reachable `getFirestore` call |
| Runtime Firebase Functions calls | NONE | s9a T01/T02/T07: zero `getFunctions()`/`httpsCallable` at module load or runtime; dist contains no `getFunctions` string |
| Startup Firebase init | NONE | U0 fix; chunk scan: no init calls, no env-throw |
| Realtime (onSnapshot) in supabase mode | Disabled by design | `subscribe*` supabase branches do one-shot fetches + `console.warn('[REALTIME_PENDING] ...')` (Step 8C contract); s8d 96/100 baseline (4 pre-existing harness mismatches, none from this step's edits) |
| Firebase Storage in supabase mode | NONE | s8f T11/T13: zero `firebase/storage` calls; supabase `gym-images` bucket is the active plane |
| Supabase writes from Firebase-mode branches | N/A by construction | Every supabase call site is inside `if (!IS_FIREBASE_MODE)` branches; the const folds at build time |
| Cross-tenant leakage | None | s8c isolation tests (member self-scope, trainer scope, gym tenancy, cross-tenant billing); s8e RLS matrix |
| Mixed-provider build risk (auth=supabase, data=firebase) | Operator-mitigated | Documented in `.env` templates: VITE_AUTH_PROVIDER must be identical in both services; build-time constant-folding prevents runtime mixing |

---

## STEP 3 — Environment Audit

| Item | Status |
|---|---|
| `.env` (local) — `VITE_AUTH_PROVIDER=supabase` present; no `VITE_SUPABASE_SERVICE_ROLE*`; no payment secrets; no Firestore service-account JSON | PASS |
| `.env.example` / `.env.production.example` | FIXED this step: Supabase block (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) was MISSING (app throws without them) and the 8B-era "Firestore data plane still requires a Firebase session" comment was stale (8C migrated it). Now documents: publishable key only, service-role never a VITE_ var, provider-consistency warning |
| Bundle secret scan (dist) | PASS — zero occurrences of service-role keys, JWT payloads, PhonePe salt, Cashfree secrets, `cfsk_`, `PHONEPE_SALT`; the only `sb_publishable`/`sb_secret` strings are supabase-js SDK internal localStorage-prefix guards, not credentials |
| Groq key | Ships to the browser by design (client-side provider, existing documented pattern since Sprint 80C) — unchanged, note for awareness |
| Cashfree | `VITE_CASHFREE_CLIENT_ID` still unset → feature disabled by design (81J). `CASHFREE_MODE=sandbox` default |
| Firebase env vars | Present (public config) — required for the rollback path and legacy email links; not secrets |

---

## STEP 4 — Role Matrix (evidence from smokes)

| Role | Login/session | Profile/role | Gym isolation | Data CRUD | Payments | Realtime/subscribe | Storage | Auth recovery |
|---|---|---|---|---|---|---|---|---|
| super_admin | s8b ✓ | s8b ✓ | all-gyms (no filter) | s8c/s8e ✓ (incl. subscription RPCs, gym delete cascade, license, security metrics RPC s9a T10) | initiator (s8g) | s8c ✓ | s8f bypass ✓ | s8b ✓ |
| gym_owner | s8b ✓ (pending/rejected gates) | s8b ✓ | own gym | s8c/s8e ✓ | viewer (s8g T84) | s8c ✓ | s8f own-gym ✓ | s8b ✓ |
| gym_admin | s8b ✓ | s8b ✓ | own gym | s8c/s8e ✓ | initiator (s8g) | s8c ✓ | s8f own-gym ✓ | s8b ✓ |
| trainer | s8b ✓ | s8b ✓ | assigned members only (s8c trainer scope) | s8c (delete denied in Firebase rules; ALLOWED in supabase RLS — documented difference, s8c report §2) | denied initiator (s8g) | s8c ✓ | s8f staff parity ✓ | s8b ✓ |
| member | s8b ✓ | s8b ✓ | self-scope (s8c) | s8c (add/delete denied) | denied initiator (s8g T83) | s8c ✓ | s8f non-staff denied ✓ | s8b ✓ |
| pending / gym_owner_pending | s8b role-gated sign-out ✓ | s8b ✓ | n/a | s8c (no writes) | — | — | denied | s8b ✓ |
| rejected / account_disabled | s8b blocked ✓ | — | — | — | — | — | — | s8b ✓ |

Security metrics RPC: super_admin → full metrics; gym_admin/member → degraded + error
(s9a T10–T12). License generation: supabase path works, super callers (s9a T08–T09).

---

## STEP 5 — Business Flow Status

| # | Flow | Status | Evidence |
|---|---|---|---|
| 1 | Sign-up / email verification / password reset (GoTrue) | READY | s8b 56/56 |
| 2 | Login / session restore / logout / role gates | READY | s8b |
| 3 | Member CRUD (admin add → staff account boundary; member self-service) | READY | s8c 101/101 (T01–T35) |
| 4 | Trainer CRUD + scoped visibility | READY | s8c |
| 5 | Plans (membership) CRUD + default migration | READY | s8c |
| 6 | Attendance check-in + history | READY | s8c |
| 7 | Notifications (26 types; owner delete RPC) | READY | s8e (notifications insert RLS, delete_own_notification) |
| 8 | Payments DB state (payment_attempts, payments, invoice) | READY | s8g 77/77 (fulfill_payment, idempotency, invoice) |
| 9 | Subscriptions (activate/trial/renew/upgrade/downgrade/suspend/expire/extend/change + history) | READY | s8e + s8g; U5 fix removes the supabase-mode crash after actions |
| 10 | Referrals (signup trigger, codes, coupons, audit) | READY | s8e/s8g (handle_referral_signup trigger) |
| 11 | Support tickets + replies/notes/attachments (child tables) | READY | s8e |
| 12 | AI assistant + conversations (increment sentinel, pagination) | READY | s8e (conversation smoke) |
| 13 | License keys / devices / LicenseGuard | READY | s8e + s9a T08/T09 (supabase license generation) |
| 14 | WhatsApp automation + campaigns | READY | s8c (whatsappLogs/campaigns) |
| 15 | Settings (gym/notifications/theme/billing scoping) | READY | s8c T14–T20 + 81D audit |
| 16 | Storage (member photos, gym logos — `gym-images` bucket) | READY | s8f 35/35 |
| 17 | Reports (generated_reports + export) | READY | s8e (reports) |
| 18 | Security metrics (super-admin dashboard) | READY | s9a T10–T12 (new) |
| 19 | Super-admin gym delete cascade (FK) / auth-account deletion RPC | READY (documented boundary) | s8e + 8B (delete_auth_user super-only) |
| 20 | Member login self-heal (referral code) | READY | s8e |

REALTIME_PENDING (one-shot loads instead of live listeners) is the single known
functional downgrade in supabase mode — by design (Step 8C), tracked separately.

---

## STEP 6 — Payment Boundary & Blockers

Architecture (Step 8G): browser → `supabase.functions.invoke('phonepe-pay' | 'phonepe-verify'
| 'cashfree-order' | 'cashfree-verify')` → Edge Functions (service-role client, secrets
from `supabase secrets`, checksums/orders server-side) → shared `fulfill_payment` RPC
(transactional: attempt lock, payments upsert keyed by payment_id, subscription/gym
sync, history, notifications) → webhooks (`phonepe-callback`, `cashfree-webhook`,
`--no-verify-jwt`) with signature verification + replay guards.

Browser never holds: salt keys, Cashfree secrets, merchant ids, service-role keys.
Payment attempt writes are Cloud-Function-owned (`savePaymentAttempt`/
`updatePaymentAttempt` THROW in supabase mode).

### 6.1 Blocker (operator, pre-existing since 8H)
Payment secrets NOT set. `supabase secrets set PHONEPE_MERCHANT_ID PHONEPE_SALT_KEY
PHONEPE_SALT_INDEX CASHFREE_CLIENT_ID CASHFREE_CLIENT_SECRET CASHFREE_MODE=sandbox`.
Also `VITE_CASHFREE_CLIENT_ID` must be set in `.env` + Vercel to enable Cashfree UI.

### 6.2 Safe validation sequence (DO NOT change provider webhook URLs yet)
1. `supabase secrets set ...` (sandbox values).
2. Safe probes ONLY: `phonepe-verify` / `cashfree-verify` with bogus attempt IDs
   (expect clean "not found" errors — verifies routing + role gates without touching
   the merchant). NEVER invoke `phonepe-pay`/`cashfree-order` against a real merchant
   in this phase.
3. Provider-side "Test Webhook" events (PhonePe dashboard / Cashfree dashboard) →
   validate `phonepe-callback`/`cashfree-webhook` HMAC + fulfillment via
   `supabase functions logs`.
4. Only after a validated end-to-end sandbox payment, flip provider-side webhook URLs
   from the legacy Firebase Functions endpoint to the Supabase Edge Function URLs.
5. Clean up 8H fixture data (auth user `a7e1d2c3-0000-4000-8000-000000000001`, gym
   `step8h-gym`, temp `s8h-*` files) and flip
   `docs/SUPABASE_BACKEND_DEPLOYMENT_VALIDATION.md` verdict.

---

## STEP 7 — Rollback Plan

| Layer | Rollback |
|---|---|
| App build | Rebuild with `VITE_AUTH_PROVIDER=firebase` (authService + firestoreService + firebase.js all fold to the legacy path — verified pattern, no source changes needed) and redeploy hosting. Firebase env vars are already present in `.env` |
| Hosting | Previous verified bundle (pre-cutover `dist/` or previous hosting version) — instant restore |
| Webhooks | Re-point provider webhook URLs back to the legacy Firebase Functions endpoints (still deployed, unchanged) |
| Data | Supabase tables are additive (no production data migrated yet — Firestore remains the source of truth for the legacy build; 8I proved Firebase Storage was empty so no storage divergence exists) |
| Sessions | Supabase JWT sessions die with the provider switch (users re-login); legacy Firebase Auth accounts (25 imported users) remain intact |
| Migrations | 0001–0008 are additive; `supabase db push` down-migrations are NOT required for rollback (client-only switch suffices) |
| Monitoring | During cutover window: `supabase functions logs`, Edge Function metrics, payment attempts table review, super-admin security metrics |

---

## STEP 9 — Validation Evidence

| Check | Result |
|---|---|
| `npm run build` | 0 errors, 0 warnings (entry `index-ZxA6b1gK.js` 476.96 kB gzip 129 kB; inert firebase chunk 413.01 kB) |
| s9a (NEW — cutover fixes) | 13/13 |
| s8g (payment edges + client wiring) | 77/77 |
| s8c (data plane CRUD) | 101/101 |
| s8e (write-path + RPCs) | 73/73 |
| s8f (storage) | 35/35 |
| s8d (realtime semantics) | 96/100 — EXACT pre-existing baseline (T02 warn-timing, T24/T25/T32 harness mismatches; none of this step's 5 edits touch subscribe paths) |
| eslint (changed files) | 0 NEW — paymentService/cashfreeService/securityService/license/firebase.js clean; Subscriptions.jsx 6 findings all pre-existing in untouched lines (Date.now purity ×5, unused var ×1) |
| dist scans | no `getFunctions`/`httpsCallable`; no secret patterns; no Firebase init calls; `get_security_metrics` grant migration added (0008) |

---

## Residual Risks (post-audit)
1. Dormant firebase SDK chunk (~99 kB gzip) loads inert — accepted for rollback
   correctness (see STEP 1 U0 note).
2. REALTIME_PENDING — one-shot loads; dashboard "live" feels require a future
   realtime adapter (tracked separately).
3. Trainer `deleteMember` allowed in supabase RLS vs denied in Firebase rules
   (documented 8C difference) — UI still gates via `isAdmin`.
4. Gym-delete cascade in supabase does NOT delete Auth accounts/profiles
   (delete_auth_user RPC is the explicit server-side path).
5. Payment validation + webhook cutover require operator credentials (Step 6).
6. `s8d` harness mismatches predate this step; realtime re-enablement should rebuild
   the harness against the chosen adapter.
