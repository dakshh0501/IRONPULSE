# Supabase Service Migration Plan

**Task**: Step 8A (documentation-only) — plan the service-layer migration of the IRONPULSE React app from Firebase to Supabase.
**Status**: PLANNED (no code changed, no deployment, no switchover performed)
**Scope**: `src/services/*` (14 top-level + 12 `ai/` + 7 `whatsapp/` = 33 service files), 2 contexts, direct-usage pages.
**Target**: Supabase project `osfhojfqytmqsqcmzvlf` (project name IRONPULSE). Existing scaffold `src/lib/supabase.js` (anon-key client, currently unimported) is the single integration point.
**Constraint**: Firebase remains fully operational until a later execution task. This document is the implementation contract; no Firebase feature is removed here.

---

## 0. Migration Architecture Summary

| Firebase construct | Supabase replacement |
|---|---|
| `firebase/app` `initializeApp` (×2: primary + `secondary` app in firestoreService) | single `createClient` in `src/lib/supabase.js`; admin-created user flows use `supabase.auth.admin` (needs service_role) or an Edge Function |
| `firebase/auth` (GoTrue-equivalent: email/password, email verification, password reset) | `supabase.auth` (GoTrue): `signInWithPassword`, `signUp`, `signOut`, `resetPasswordForEmail`, `onAuthStateChange`, `verifyOtp`, `updateUser` |
| `firebase/firestore` doc ops (240 call lines, 21 files) | `supabase.from(table)` `select/insert/update/delete` + RPC for atomic/analytic ops |
| `onSnapshot` realtime (59 listeners) | `supabase.channel(...).on('postgres_changes', ...)` per table with RLS; client-side order/filter/limit (or RPC-backed views) |
| `serverTimestamp()` (≈50 sites) | `now()` default in DDL; client `new Date().toISOString()`; or RPC params |
| `increment()` / `arrayUnion()` | RPC `UPDATE ... SET col = col + n` / `col \|\| jsonb_build_array(...)` or `jsonb` append; plain update with read-back where acceptable |
| `writeBatch` / `runTransaction` | single `UPDATE ... WHERE id = ...` atomic per statement; multi-table via RPC transaction |
| `firebase/storage` (5 ops in storageService) | Supabase Storage buckets + policies; `getPublicUrl` for public bucket |
| `firebase/functions` httpsCallable (9 callable + 1 onRequest + 1 trigger in `functions/index.js`) | Supabase Edge Functions (Deno, secrets via `--secret`) or keep Firebase Functions as documented exception |
| Firestore rules (RBAC: `isStaff()`, `inCallersGym()`, role gates) | Postgres RLS policies in `0002_rls.sql` (already deployed) |

**Schema facts** (from `supabase/migrations/0001_initial_schema.sql`, migration reports):
- `profiles.id` = `auth.users.id` (uuid PK); `profiles.firebase_uid` TEXT unique NOT NULL — text FKs used app-wide.
- Multi-tenant via `gym_id` on all gym-scoped tables (existing composite indexes).
- RLS enabled; anon reads rejected (verified during import verification).

---

## 1. Service-by-Service Plan (priority order)

### P1 — `src/services/authService.js` (FIRST IMPLEMENTATION TARGET)

**Why first**: every context and page derives `currentUser.uid`, role gates, and emailVerified checks from this layer; all 32 other services depend on its output shape.

**Current behavior** (28 doc ops + 12 auth API calls):
- `signUp()` — 4-step: `createUserWithEmailAndPassword` → `sendEmailVerification` (ActionCodeSettings) → `setDoc(users/{uid})` + `writeBatch` (gyms doc first, then users + referralCodes, rule-compliant ordering, full rollback) → `signOut`.
- `signIn()` — `signInWithEmailAndPassword`, then reads `users/{uid}` doc, gates on `emailVerified` + role.
- `resetPassword()`, `sendVerificationEmail()`, `verifyEmailWithCode()` (applyActionCode), `onAuthChanged()` (onAuthStateChanged + users doc read), `recoverUserProfile()` (both member/gym-owner branches), `approveUser()`, `rejectUser()`, `getPendingUsers()`, `deleteAuthUser()` (httpsCallable → `functions/index.js:2212`).
- Imports: `firebase/auth` (12 APIs), `firebase/firestore` (serverTimestamp, doc ops), `firebase/functions` (httpsCallable deleteAuthUser), `firebaseConfig` from `src/firebase.js`.

**Target Supabase API**:
| Current | Target |
|---|---|
| `createUserWithEmailAndPassword(auth, e, p)` | `supabase.auth.signUp({ email, password })` — NOTE GoTrue auto-confirm config: must set email confirmation ON (matches Firebase gating) |
| `sendEmailVerification` + `applyActionCode` | GoTrue OTP email; `supabase.auth.verifyOtp({ type: 'email', token })`; configure redirect template |
| `signInWithEmailAndPassword` | `supabase.auth.signInWithPassword({ email, password })` |
| `onAuthStateChanged` | `supabase.auth.onAuthStateChange` |
| `sendPasswordResetEmail` | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` |
| `signOut` | `supabase.auth.signOut()` |
| `auth.currentUser.emailVerified` | GoTrue has no `emailVerified` field — derive from `user.email_confirmed_at != null` (GoTrue metadata) or drop the gate |
| `reauthenticateWithCredential` / `updatePassword` / `updateEmail` (Settings.jsx dynamic import) | `supabase.auth.updateUser({ password })` / `{ email }` (re-auth = recent login or re-login; document UX change) |
| `getAuth()` secondary app (firestoreService admin-created member/trainer) | **Blocked without service_role**: use `supabase.auth.admin.createUser` via Edge Function (server-side, secret) OR retain secondary Firebase app for provisioning only during transition |
| `httpsCallable('deleteAuthUser')` | Edge Function `delete-user` (admin.deleteUser) |

**Special concerns**: 4-step signup atomicity → GoTrue `signUp` may auto-sign-in (config `sign_in_on_confirm`); step ordering + rollback must be preserved; pending-approval role flow (`pending`/`gym_owner_pending`) unchanged conceptually; `users` table equivalent = `profiles` (already RLS-scoped); `referralCodes` mapping writes move to `referral_codes` table.

**Test plan**: port with same exported signatures; AuthContext must keep `currentUser`, `userProfile`, `role`, `emailVerified`-equivalent shape (add adapter mapping `auth.getUser().user`); full signup→verify→approve→signin cycle smoke; regression: pending reject → `/rejected`, verify-email page.

---

### P2 — `src/services/firestoreService.js` (98 doc ops — largest file)

**Current behavior**: 24 onSnapshot subscriptions + 98 doc-op lines; collections written: members, trainers, payments, plans, progressLogs, dietPlans, workoutPlans, supportTickets, featureRequests, settings, notifications, gyms, subscriptions, subscriptionHistory, whatsappLogs, whatsappCampaigns, aiConversations(+messages), referralCodes, referralAuditLogs, rewardLedger, discountCoupons, licensedDevices, licenseHistory, paymentAttempts, generatedReports, contactMessages. Includes `addMember`/`addTrainer` secondary-auth provisioning, `backfill*` migrations, `subscribeToPlatformSettings`, `getGlobalBilling`, stat increments, `migrateDefaultPlans`.

**Target**:
- One table adapter module `src/lib/tables.js` mapping Firestore collection names → Supabase table names + column remap (camelCase → snake_case) + `firebase_uid` string-key handling.
- `subscribeToX(callback)` → `supabase.channel('x-'+gymId).on('postgres_changes', { event: '*', schema: 'public', table: 'x', filter: `gym_id=eq.${gymId}` }, cb)` + initial `select()`. **Key change**: all server-side `orderBy/limit/where` semantics move client-side (list capped by RPC or `select` limit).
- `addDoc` → `insert(...).select().single()`; `updateDoc` → `update(...).eq('id', id)`; `deleteDoc` → `delete().eq('id', id)`; doc IDs become uuid PKs (imported data preserved via existing `id` columns).
- `serverTimestamp` → `new Date().toISOString()` or rely on DDL `default now()`; `increment` → RPC `bump_whatsapp_stats`.
- `writeBatch`/`runTransaction` → RPC transactions (see §3 RPC inventory).
- Secondary-auth `addMember`/`addTrainer` → admin-create via Edge Function (P1 dependency).

**Test plan**: per-collection CRUD parity harness (Node, RLS-enforcing mock); subscription parity (insert/update/delete events deliver); settings composite keys (`gym_id || ':' || doc_id` mapping — see Sprint 81D scoping).

---

### P3 — `src/services/paymentService.js` + `src/services/cashfreeService.js` (payment orchestration)

**Current**: 2 callables each (createPayment/verifyPayment, createCashfreeOrder/verifyCashfreePayment) + paymentAttempts doc ops; all gateway secrets server-side in `functions/index.js` (PhonePe salt, Cashfree client secret via Secret Manager); webhooks `phonePeCallback`/`cashfreeWebhook`; `fulfillSubscriptionPayment` shared fulfillment (subscription + gym dot-paths + subscriptionHistory + payments record + notifications).

**Target**:
- Edge Functions `payment-create`, `payment-verify`, `cashfree-order`, `cashfree-verify`, `payment-callback` (webhook) with Deno secrets; keep identical request/response contracts so client call sites (`paymentService.js:28-29`, `cashfreeService.js:46-53`) only swap `httpsCallable` → `functions.invoke`.
- Option B (documented): keep `functions/` deployed as-is during transition (still out-of-scope for removal) and only re-point the client; documented as acceptable interim since Firebase Functions remain hosted.
- SQL: `payment_attempts` table (exists), `payments` table (exists); `fulfillSubscriptionPayment` SQL port = RPC `fulfill_payment` (transaction).

**Special concerns**: 30-min expiry check, invoiceNo generation, idempotent `paymentId` dedup, webhook raw-body HMAC — all port 1:1 into Edge Function or RPC; secrets never enter the client.

---

### P4 — `src/services/attendanceService.js` (4 listeners, 18 query ops)

**Current**: `addAttendance`, `getAttendanceByDate`, `subscribeAttendance` (gymId + date desc + time desc), `subscribeMyAttendance` (authUid), `subscribeMyTrainerAttendance` (trainerAuthUid), `checkInMember`-adjacent writes.
**Target**: table `attendance` (exists, 49 quarantined rows restored = 49 rows in target); channel per (gymId, listener role) with RLS policies `isOwnAttendance`-equivalent (`member_id == auth.uid()`); client-side sort on `date`/`time` (or RPC `attendance_recent(gym_id, n)` returning pre-ordered rows).
**Test plan**: check-in write → realtime echo; member-scoped filter; trainer-scoped filter; 0-orphan FK guarantee (`member_id` references profiles).

---

### P5 — `src/services/notificationService.js` (2 listeners, 9 doc ops)

**Current**: `subscribeToNotifications` (userId, orderBy createdAt desc, limit 30), CRUD + markRead/markAllRead; 26 notification types; `relatedDocumentId` dedup.
**Target**: table `notifications` (exists, 9 imported + 4 quarantined); RLS `user_id == auth.uid()`; mark-all-read → RPC `mark_all_notifications_read(user_id)` (single UPDATE); realtime channel per user.
**Test plan**: notification create → realtime; mark-read; mark-all-read; dedup by `related_document_id`.

---

### P6 — `src/services/storageService.js` (5 storage ops)

**Current**: `uploadMemberPhoto`/`uploadGymLogo` (`ref` + `uploadBytesResumable` + `getDownloadURL`) + `deleteMemberPhoto` (`deleteObject`); consumers MemberModal.jsx, Settings.jsx, firestoreService.js (dynamic import).
**Target**: Supabase Storage bucket `gym-assets` (public read; authed write with path ownership policy); `uploadBytesResumable` → `supabase.storage.from('gym-assets').upload(path, file, { upsert: true })`; `getDownloadURL` → `getPublicUrl(...).data.publicUrl`; `deleteObject` → `.remove([path])`; path scheme `{gymId}/{type}/{uid}.{ext}` mirrored so policy = RLS on bucket.
**Test plan**: upload/list/download/delete; path-ownership denial for cross-gym uid; URL stability for previously-persisted Firebase `gs://` URLs (documented data migration: regenerate public URLs post-cutover).

---

### P7 — `src/services/subscriptionService.js` (3 listeners, 5 doc ops, runTransaction)

**Current**: gym platform subscription lifecycle (activate/suspend/expire/renew/upgrade/downgrade/reactivate/assignTrial/extend/changePlan) writing `gyms/{gymId}.subscription` + `subscriptions` + `subscriptionHistory`; `getGlobalBilling` from `settings/billing`.
**Target**: tables `gyms` (13 rows), `subscriptions` (6), `subscription_history` (2); lifecycle ops → RPC `subscription_lifecycle` (single transaction, mirrors `fulfillSubscriptionPayment`); billing defaults → `settings` row `('platform', 'billing')` composite key.
**Test plan**: each lifecycle op parity + transaction rollback; billing read unchanged for superadmin.

---

### P8 — Remaining services (tiered, same pattern)

| Service | Notes |
|---|---|
| `deviceService.js` (14 doc ops, 3 listeners) | `licensed_devices` table (11 license_history rows exist; licensedDevices emptied); device-registration validation stays client-side + RLS |
| `licenseHistoryService.js` (3 listeners) | `license_history` table (11 imported rows) |
| `referralService.js` (18 doc ops, 9 listeners) | `referral_codes` (1 row), `referrals`, `referral_audit_logs`, `reward_ledger`, `discount_coupons`; processPendingReferral transaction → RPC `register_referral`; self-heal path pure-local |
| `reportService.js` (2 listeners) | `generated_reports` table |
| `securityService.js` (3 doc ops) | `settings` composite keys (ip whitelist/rate limit/2FA/audit log) |
| `ai/conversationService.js` (5 listeners, 22 query ops) | `ai_conversations` (15) + `ai_conversation_messages` (65); messages immutable transcript; `increment` messageCount → RPC or client count; sanitizer stays (JSON-compatible) |
| `ai/` remaining (aiService, commandParser, insightEngine, planGenerator, reportGenerator, actionBus/Engine, providers/groqProvider, chatExporter) | **Zero Firebase imports** — no change (verified: no firebase strings) |
| `whatsapp/` (whatsappService, automationEngine, campaignEngine, campaignTemplates, messageTemplates, providers/*) | Zero Firebase imports in 6 of 7 (whatsappService facade delegates to firestoreService) — only firestoreService's `whatsappLogs`/`whatsappCampaigns` writes migrate (P2) |
| `biometricService.js` | Zero Firebase (WebAuthn/local) — no change |

---

## 2. Direct-Usage Files (bypass service layer — must route through services during migration)

| File | Firebase usage | Action |
|---|---|---|
| `src/context/AppContext.jsx` | line 78 imports firestore directly; 12 doc ops (215-326, 1563), 2 onSnapshot fallback listeners, `serverTimestamp` | refactor onto P2 service methods |
| `src/context/AuthContext.jsx` | uses authService only (clean) | no change beyond P1 |
| `src/utils/license.js` | `collection/query/where/getDocs` (line 18) | move to deviceService (P8) |
| `src/utils/referralCode.js` | direct doc ops + `serverTimestamp` (lines 23/41/59/65/67) | keep pure generator; doc ops → referralService |
| `src/pages/Settings.jsx` | `updateDoc(users/{uid})` (247) + dynamic `firebase/auth` reauth/updatePassword/updateEmail (301-304, 669-675) | route via authService + new profile RPC |
| `src/pages/Support.jsx` | `updateDoc` + `arrayUnion` (710-734) | RPC `append_ticket_thread` (jsonb append) |
| `src/pages/superadmin/GymOwners.jsx` | 15 doc ops, `writeBatch`, `httpsCallable deleteAuthUser` | RPC `cascade_delete_gym` + Edge Function delete-user |
| `src/pages/superadmin/LicenseKeys.jsx` | 5 updateDoc + serverTimestamp | via subscriptionService/deviceService |
| `src/pages/superadmin/Subscriptions.jsx` | 5 doc ops + writeBatch + getDocs | via subscriptionService |
| `src/pages/superadmin/ReferralManagement.jsx` | 1 updateDoc | via referralService |
| `src/components/MemberModal.jsx` | 1 updateDoc | via P2 |
| `src/components/ai/ChatPanel.jsx` | `increment` (line 449) | via conversationService RPC |

---

## 3. SQL/RPC Inventory (new — must be written in execution task)

- `bump_whatsapp_stats(campaign_id, field, by)` — replaces `increment`.
- `append_ticket_thread(ticket_id, replies_delta jsonb)` — replaces `arrayUnion` on supportTickets.
- `register_referral(...)` — atomic referral + 2 notifications + audit (replaces runTransaction).
- `fulfill_payment(...)` — replaces `fulfillSubscriptionPayment` transaction.
- `subscription_lifecycle(action, gym_id, plan, ...)` — replaces 10 lifecycle service functions.
- `mark_all_notifications_read(user_id)`.
- `attendance_recent(gym_id, n)` / `attendance_for_member(uid, n)` — pre-ordered reads replacing `orderBy+limit` listeners.
- `cascade_delete_gym(gym_id)` — superadmin full-wipe (Sprint 81B parity).
- `users_profile_read(uid)` — replaces `users/{uid}` doc read (profiles table already serves this).

## 4. RLS/Realtime/Auth/Storage Dependency Summary

- **RLS**: all tables already `enable row level security` (`0002_rls.sql`); policies must be extended for new columns used by client filters (e.g., `gym_id` exists on gym-scoped tables; `user_id` on notifications) — verified present for imported data (0 orphan FK rows at import verification).
- **Realtime**: enable `supabase_realtime` publication for: members, trainers, payments, plans, attendance, notifications, progress_logs, diet_plans, workout_plans, gyms, subscriptions, settings, support_tickets, feature_requests, whatsapp_logs, whatsapp_campaigns, ai_conversations, ai_conversation_messages, referrals, reward_ledger, discount_coupons, licensed_devices, license_history, payment_attempts, generated_reports. (List matches the 59-listener inventory.)
- **Auth**: GoTrue email confirmation ON; redirect templates for verify + reset; `profiles.firebase_uid` retained as stable cross-reference during transition.
- **Storage**: bucket `gym-assets` public-read + authed path-policy writes.

## 5. Cutover & Test Sequence (execution task, phase-by-phase)

1. **Phase A** — Edge/RPC backend: RPC inventory + Edge Functions for auth-admin + payments; deploy to Supabase (no client change).
2. **Phase B** — `src/lib/supabase.js` import wiring + `src/lib/tables.js` adapter.
3. **Phase C** — P1 authService port; dual-auth dev mode (`VITE_AUTH_PROVIDER=supabase|firebase` flag) until parity smoke passes.
4. **Phase D** — P2 firestoreService port (largest; per-collection parity).
5. **Phase E** — P3–P7 service ports.
6. **Phase F** — direct-usage files routed through services (§2 list).
7. **Phase G** — storage bucket + asset URL migration; 59 listeners → realtime channels; rollback-ready.
8. **Phase H** — switch `src/firebase.js` init off (env flag `VITE_FIREBASE_DISABLED`), final regression (Sprint 81A-J regression suites), deploy.

**Rollback**: keep Firebase env vars + `src/firebase.js` intact; flip `VITE_AUTH_PROVIDER`/`VITE_FIREBASE_DISABLED` back; Firestore rules unchanged; dual-write not needed (single-writer per phase).

## 6. Out of Scope (this task)

- Storage/Functions/Realtime migration execution, Firebase removal, production switchover, dual-write sync, asset URL rewrite — all later execution tasks (per Step 8A mandate).