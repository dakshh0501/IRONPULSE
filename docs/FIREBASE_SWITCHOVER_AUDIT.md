# Firebase Switchover Audit — IRONPULSE → Supabase

**Task**: Step 8A (documentation-only). Audit of every Firebase dependency + cutover design for switching to Supabase project `osfhojfqytmqsqcmzvlf` (IRONPULSE).
**Status**: AUDIT COMPLETE — PLAN READY. No code changed, no deployment, no switchover (per mandate).
**Date**: 2026-08-14. Companion doc: `docs/SUPABASE_SERVICE_MIGRATION_PLAN.md` (service-by-service plan).

---

## Step 1 — Firebase Dependency Scan (complete)

### 1.1 Module import sites (26 files import Firebase SDKs directly)

| Module | Files importing |
|---|---|
| `firebase/app` | `src/firebase.js:5` (initializeApp), `src/services/firestoreService.js:27` (initializeApp secondary app) |
| `firebase/auth` | `src/firebase.js:7`, `src/services/authService.js:15`, `src/services/firestoreService.js:23,28` (+ dynamic import in `Settings.jsx:301,669`) |
| `firebase/firestore` | `src/firebase.js:6` + 24 files: AppContext.jsx:78, ChatPanel.jsx:22, ai/conversationService.js:42, utils/referralCode.js:1, utils/license.js:1, paymentService.js:19, cashfreeService.js (via functions), MemberModal.jsx:2, authService.js:16,30, attendanceService.js:9, firestoreService.js:18,26, deviceService.js:14, licenseHistoryService.js:1, securityService.js:1, notificationService.js:15, reportService.js:1, subscriptionService.js:1, Settings.jsx:7, referralService.js:17, Support.jsx:4, superadmin/LicenseKeys.jsx:3, superadmin/GymOwners.jsx:2, superadmin/ReferralManagement.jsx:11, superadmin/Subscriptions.jsx:4 |
| `firebase/storage` | `src/firebase.js:8`, `src/services/storageService.js:1` |
| `firebase/functions` | `src/firebase.js:9`, authService.js:32, paymentService.js:20, cashfreeService.js:14, firestoreService.js:34, superadmin/GymOwners.jsx:3 |

**Services (33)**: 14 top-level (`attendanceService`, `authService`, `biometricService`, `cashfreeService`, `deviceService`, `firestoreService`, `licenseHistoryService`, `notificationService`, `paymentService`, `referralService`, `reportService`, `securityService`, `storageService`, `subscriptionService`) + 12 `ai/` (actionBus, actionEngine, aiService, chatExporter, commandParser, conversationService, insightEngine, planGenerator, planTemplates, reportGenerator, providers/groqProvider, providers/geminiProvider(removed)) + 7 `whatsapp/` (automationEngine, campaignEngine, campaignTemplates, messageTemplates, whatsappService, providers/baseProvider, metaProvider, mockProvider, twilioProvider).
**Zero-Firebase services (safe)**: biometricService, all ai/ except conversationService, all whatsapp/ (whatsappService delegates to firestoreService), planTemplates, insightEngine, reportGenerator, commandParser, actionBus/actionEngine, groqProvider, chatExporter.

### 1.2 Firestore document operations — 240 call lines across 21 files

| File | ops | File | ops |
|---|---|---|---|
| firestoreService.js | 98 | referralService.js | 18 |
| authService.js | 28 | deviceService.js | 14 |
| superadmin/GymOwners.jsx | 15 | AppContext.jsx | 12 |
| notificationService.js | 9 | paymentService.js | 6 |
| superadmin/LicenseKeys.jsx | 5 | superadmin/Subscriptions.jsx | 5 |
| ai/conversationService.js | 5 | subscriptionService.js | 5 |
| utils/referralCode.js | 4 | Support.jsx | 3 |
| reportService.js | 3 | securityService.js | 3 |
| attendanceService.js | 2 | MemberModal.jsx | 1 |
| licenseHistoryService.js | 1 | superadmin/ReferralManagement.jsx | 1 |
| Settings.jsx | 1 | utils/license.js | 1 |

(+ `getDoc/getDocs/addDoc/setDoc/updateDoc/deleteDoc/writeBatch/runTransaction` imports; raw token matches incl. imports ≈394.)

### 1.3 Realtime listeners — 59 `onSnapshot` sites across 11 files

| File | listeners | File | listeners |
|---|---|---|---|
| firestoreService.js | 24 | referralService.js | 9 |
| ai/conversationService.js | 5 | attendanceService.js | 4 |
| deviceService.js | 3 | licenseHistoryService.js | 3 |
| subscriptionService.js | 3 | AppContext.jsx | 2 |
| notificationService.js | 2 | paymentService.js | 2 |
| reportService.js | 2 | | |

AppContext wires ~20 role-gated subscriptions on top (members/trainers/payments/plans/attendance/gymSettings/progressLogs/dietPlans/workoutPlans/subscriptions/platformSettings/notifications/referrals/rewardLedger/discountCoupons/whatsappLogs/supportTickets/featureRequests/myMember/myProgressLogs).

### 1.4 Query constructs — 282 `collection/query/where/orderBy/limit` lines across 17 files

Heaviest: firestoreService.js 81, referralService.js 43, deviceService.js 24, conversationService.js 22, attendanceService.js 18, authService.js 18, notificationService.js 17, paymentService.js 11, reportService.js 11, licenseHistoryService.js 10.

### 1.5 Storage — 5 operations, 1 file

`storageService.js`: `uploadBytesResumable` ×2 (member photo, gym logo), `getDownloadURL` ×2, `deleteObject` ×1. Consumers: `MemberModal.jsx:5`, `Settings.jsx:9`, `firestoreService.js:301,306` (dynamic `deleteMemberPhoto`).

### 1.6 Cloud Functions — 10 exports in `functions/index.js`

| Export | Type | Role |
|---|---|---|
| `createPayment` (:1082) | onCall | PhonePe order (secrets via Secret Manager) |
| `verifyPayment` (:1309) | onCall | PhonePe status verify |
| `phonePeCallback` (:1425) | onRequest | PhonePe webhook (raw-body HMAC) |
| `createCashfreeOrder` (:1579) | onCall | Cashfree order |
| `verifyCashfreePayment` (:1798) | onCall | Cashfree status verify |
| `cashfreeWebhook` (:1903) | onRequest | Cashfree webhook (raw-body HMAC, replay guard) |
| `backfillMissingProfiles` (:2082) | onCall | profiles migration |
| `deleteAuthUser` (:2212) | onCall | orphan Auth cleanup (used client-side ×5: authService:499, firestoreService:390,678, GymOwners.jsx:389) |
| `getSecurityMetrics` (:2246) | onCall | platform metrics |
| `onReferralSignup` (:732) | onDocumentCreated trigger | referral registration (Blaze-only) |

Client callables: paymentService.js:28-29 (createPayment, verifyPayment), cashfreeService.js:46-53 (createCashfreeOrder, verifyCashfreePayment).

### 1.7 Auth APIs (≈26 call sites)

`createUserWithEmailAndPassword` ×3 (authService:42, firestoreService:60,495 secondary-auth), `signInWithEmailAndPassword` (authService:179), `signOut` ×5, `sendPasswordResetEmail` (authService:231), `sendEmailVerification` ×3 (authService:58,391, firestoreService:68,505), `onAuthStateChanged` (authService:377), `applyActionCode` (authService:406), `reload` (authService:409), `reauthenticateWithCredential`/`updatePassword`/`updateEmail` (Settings.jsx:301-304,669-675 dynamic), `browserLocalPersistence/setPersistence` (firebase.js:52-58, Capacitor requirement), `EmailAuthProvider` (Settings.jsx). `currentUser.uid` flows through AppContext into every subscription.

### 1.8 Sentinels & atomic ops

`serverTimestamp` ≈50 sites (authService 11, firestoreService 30+, referralService 8, deviceService 6, paymentService 3, notificationService 1, subscriptionService 3, AppContext 1, Support 3, LicenseKeys 5, GymOwners 4, conversationService 5, referralCode 1); `increment` ×2 (ChatPanel:449 messageCount, firestoreService:1660 campaign stats); `arrayUnion` ×3 (Support.jsx:711,721,733); `writeBatch` (firestoreService, deviceService, GymOwners:2, Subscriptions:2, authService signup); `runTransaction` (subscriptionService, referralService processPendingReferral, firestoreService). No `arrayRemove`, no `Timestamp`/`GeoPoint`/`FieldValue` sentinels beyond sanitizer duck-typing (conversationService:55-56).

### 1.9 Severity/risk classification (per file)

| Severity | Files |
|---|---|
| HIGH (auth/tenant security) | authService.js, firestoreService.js (secondary-auth + rules-coupled writes), AppContext.jsx (direct ops), utils/referralCode.js, Settings.jsx (updateDoc + reauth), functions/index.js (secrets + webhooks) |
| MEDIUM (realtime/complex queries) | attendanceService, subscriptionService, notificationService, referralService, ai/conversationService, deviceService, reportService, paymentService, cashfreeService |
| LOW (simple CRUD) | licenseHistoryService, securityService, storageService, Support.jsx, LicenseKeys.jsx, ReferralManagement.jsx, superadmin/Subscriptions.jsx, GymOwners.jsx (cascade writeBatch), MemberModal.jsx, ChatPanel.jsx (increment), utils/license.js |
| NONE (zero Firebase) | biometricService, all ai/ except conversationService, all whatsapp/ providers + engines, planGenerator/planTemplates, groqProvider, chatExporter, insightEngine, reportGenerator, commandParser, actionBus, actionEngine |

---

## Step 4 — Direct Usage Audit (bypasses service layer; HIGH priority)

12 files touch Firebase SDKs without going through a service module — each must be routed through services during execution:
1. `src/context/AppContext.jsx:78` — imports `firebase/firestore` directly; 12 doc ops (215-326, 1563) + `serverTimestamp` (1568) + 2 fallback onSnapshots (485).
2. `src/utils/license.js:18` — `collection/query/where/getDocs`.
3. `src/utils/referralCode.js:1,23,41,59,65,67` — doc ops + serverTimestamp.
4. `src/pages/Settings.jsx:247` — `updateDoc(users/{uid})`; `:301-304,669-675` — dynamic `firebase/auth` reauth/updatePassword/updateEmail.
5. `src/pages/Support.jsx:710-734` — `updateDoc` + `arrayUnion` + serverTimestamp.
6. `src/pages/superadmin/GymOwners.jsx` — 15 ops incl. cascade `writeBatch` + httpsCallable deleteAuthUser (:389).
7. `src/pages/superadmin/LicenseKeys.jsx` — 5 updateDoc (574-677).
8. `src/pages/superadmin/Subscriptions.jsx` — 5 ops incl. writeBatch.
9. `src/pages/superadmin/ReferralManagement.jsx` — 1 updateDoc.
10. `src/components/MemberModal.jsx` — 1 updateDoc.
11. `src/components/ai/ChatPanel.jsx:449` — `increment`.
12. `src/main.jsx:6` — side-effect `import './firebase'` (init + Capacitor persistence).

## Step 5 — Auth Design (Supabase)

- GoTrue email/password + OTP email verification replacing `applyActionCode`/`sendEmailVerification`; `emailVerified` gate re-derived from `user.email_confirmed_at`.
- Pending-approval model (`pending`/`gym_owner_pending`/`rejected`) stays in `profiles.role`; `firebase_uid` column retained as cross-reference (25 mapped users, 3 banned).
- Admin-created member/trainer accounts: secondary-app pattern replaced by `supabase.auth.admin.createUser` via Edge Function (service_role server-side only) — Spark-safe alternative documented.
- Signup atomicity (gyms doc → users+referralCodes batch → signOut, Sprint 79F/81A-Spark semantics) reimplemented as: RPC `create_gym_owner` + GoTrue `signUp` ordering.
- Referral self-heal + `processPendingReferral` (Sprint 81E/81H) preserved via RPC `register_referral` and `referral_codes` table (1 imported row).
- No biometry change (WebAuthn, zero Firebase).

## Step 6 — Realtime Design

- 59 onSnapshot listeners → `supabase.channel(...).on('postgres_changes', ...)` with RLS-filtered tables; `supabase_realtime` publication enabled for the 25 tables in plan §4.
- Server-side `orderBy/limit/where` → RPC-backed pre-ordered reads (`attendance_recent`, `notifications_recent`) or client-side sort for small sets; composite filters stay RLS-side (`gym_id=eq.<gymId>`).
- AppContext's ~20 role-gated subscriptions map 1:1 to channels; member/trainer scoping via `auth.uid()` in RLS (mirrors Sprint 69A/70A scoped listeners).

## Step 7 — Storage Design

- Bucket `gym-assets` (public read, authed write, path ownership `{gymId}/{type}/{uid}`); 5 ops in storageService port 1:1.
- URL migration: previously-persisted Firebase `gs://`/`firebasestorage.googleapis.com` URLs regenerated via `getPublicUrl` post-cutover (documented data migration in execution).

## Step 8 — Functions/Payments Design

- 10 functions → Supabase Edge Functions (Deno) with identical contracts; secrets via `supabase secrets set` (CASHFREE_CLIENT_ID/SECRET/MODE, PhonePe salt key, merchant IDs).
- Webhooks (phonePeCallback, cashfreeWebhook) → Edge Function `payment-callback` with raw-body HMAC + replay guard parity (Sprint 81J-FINAL behavior).
- Client call sites unchanged in shape (`functions.invoke` mirrors `httpsCallable`).
- Interim option (documented): keep `functions/` deployed during transition; only client re-pointing.

## Step 9 — Cutover Plan (Phases A–H) & Rollback

See `docs/SUPABASE_SERVICE_MIGRATION_PLAN.md` §5 — Phases A (backend RPC/Edge), B (client wiring + tables adapter), C (authService — FIRST TARGET), D (firestoreService), E (P3–P7), F (direct-usage files), G (storage + realtime channels), H (firebase init off + regression). Rollback: env-flag flip (`VITE_AUTH_PROVIDER`, `VITE_FIREBASE_DISABLED`), Firestore rules and Firebase env untouched until final acceptance.

## Step 10 — Final Report (audit numbers)

- **Total Firebase references**: 26 files import Firebase SDKs (incl. `src/firebase.js` central init + `src/main.jsx` side-effect); `firebase` string appears in 25 src files.
- **Total direct Firebase calls**: ~240 Firestore doc-op call lines (+394 raw token matches) + 282 query-construct lines + 59 onSnapshot sites + 5 storage ops + ≈26 auth API calls + 7 httpsCallable sites.
- **Service count**: 33 service files (25 Firestore-coupled via firestoreService; 8 fully Firebase-free).
- **Realtime listener count**: 59 direct `onSnapshot` sites + ~20 role-gated AppContext subscriptions on top.
- **Storage operation count**: 5 (uploadBytesResumable ×2, getDownloadURL ×2, deleteObject ×1).
- **Function count**: 10 Cloud Functions (7 callable, 2 webhooks, 1 trigger).
- **Highest-risk areas**: (1) auth flow incl. secondary-auth provisioning + email verification gating; (2) firestoreService 98-op surface + writeBatch/runTransaction atomicity; (3) payments backend secrets/webhooks (PhonePe + Cashfree); (4) 59 realtime listeners with server-side query semantics; (5) 12 direct-usage files bypassing services; (6) sentinel ops (serverTimestamp/increment/arrayUnion).
- **Exact first implementation target**: `src/services/authService.js` port to GoTrue (P1) — every other service and both contexts depend on its `currentUser`/role/verified semantics; followed by `firestoreService.js` (P2).
- **Build**: PASS — 0 errors, 0 warnings (verified after audit; no source changes made).