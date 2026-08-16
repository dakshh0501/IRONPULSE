# IRONPULSE — Firestore → Supabase Migration Schema

**Status:** Analysis-only deliverable (Step 2 of the migration plan). No code changed, no SQL executed, no Firebase/Supabase resources modified.
**Source of truth:** Actual source code read across `src/`, `functions/`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
**Date:** 2026-08-14

---

## 1. Executive Summary

IRONPULSE is a multi-tenant gym management platform currently backed by:
- **Firestore** — the single data store (30+ collections, doc IDs as logical keys, composite-key settings docs, deterministic doc IDs for referral idempotency, nested `subscription.*`/`documents.*` maps inside `gyms`, array fields with `arrayUnion`, `serverTimestamp()`, `increment()`).
- **Firebase Auth** — 7 role classes (`super_admin`, `gym_admin`, `gym_owner`, `trainer`, `member`, `pending`, `gym_owner_pending`) + legacy aliases (`admin`, `gym_owner`); secondary-auth-created member/trainer accounts; password shown once to admin at creation.
- **Firebase Storage** — 2 prefixes (`members/{memberId}/profile.webp`, `settings/gym-logo.webp`), client-side compress to webp ≤1024px ≤5MB.
- **Cloud Functions (Blaze plan)** — 10 exports: 4 callables + 2 raw webhooks (PhonePe, Cashfree) + 1 Firestore trigger (`onReferralSignup`) + 3 admin utilities. Secrets: `PHONEPE_MERCHANT_ID/SALT_KEY/SALT_INDEX`, `CASHFREE_CLIENT_ID/SECRET/MODE`.

The migration target is Supabase (PostgreSQL + PostgREST + GoTrue + Storage + realtime). Key differences that shape the schema design:

| Firestore feature used | Supabase equivalent |
|---|---|
| `onSnapshot` realtime (40+ listeners) | Supabase Realtime `postgres_changes` (channel per query, WAL-based) |
| `serverTimestamp()` | `now()` DB default |
| `increment(n)` | SQL `UPDATE ... SET x = x + n` or `UPDATE` trigger |
| `arrayUnion` / array fields | Postgres arrays or child tables (attachments/replies/meals/exercises/versions) |
| Composite doc IDs (`settings/{gymId}:{docId}`) | Separate `settings` table with `(gym_id, doc_id)` PK |
| Deterministic doc IDs (`referrals/{referredUid}`) | `referrals.referred_uid UNIQUE` — natural key |
| Nested maps (`gyms.subscription.*`, `gyms.documents.*`) | JSONB columns or child tables (recommend: JSONB — write pattern uses dot-paths `'subscription.status'`) |
| Multi-tenant filtering `where('gymId', ...)` | `gym_id` FK + RLS `gym_id = auth.uid->gym_id` |
| `runTransaction` / `writeBatch` | SQL transactions (`BEGIN/COMMIT`), advisory locks for read-then-write |
| Firestore rules | Postgres RLS policies |
| `limit(N)` capped listeners | `LIMIT N` queries |
| Client-side sort (attendance date/time desc) | `ORDER BY date DESC, time DESC` |

**Decision made in this document:** One schema per current collection (no collection-group merges). `users` maps to Supabase `auth.users` extended by a `profiles` table. Timestamps: Firestore's `createdAt` fields are a mix of `serverTimestamp()` (most collections), ISO strings (`paymentAttempts`, `attendance`, `subscriptionHistory` rows written by functions), and date-only strings (`subscription.startDate/expiryDate/graceEndDate`); all are normalized to Postgres `timestamptz` with a date-only `DATE` column where day-granularity is used.

---

## 2. Firebase Inventory

### 2.1 App / project
- Firebase project: `ironpulse-32f31` (Firestore rules compile; production hosting live).
- Client: Vite + React SPA (`src/firebase.js` exports `app`, `auth`, `db`, `storage`, `functions`, `secondaryApp`, `secondaryAuth`).
- Plans: Spark is documented as the runtime reality for rules/client (no server in prod), but `functions/` exists for Blaze.

### 2.2 Auth
- Email/password + email verification (`sendEmailVerification` with ActionCodeSettings `{url: appUrl + '/auth?verified=true', handleCodeInApp: true}`).
- Password reset (`resetPassword`, `handleCodeInApp: false`).
- Secondary auth instance (`initializeApp(firebaseConfig, 'secondary')`) used in `addMember`/`addTrainer` to create accounts while admin stays logged in.
- Admin-created member/trainer: auto-generated password returned once to the admin; `users/{uid}` doc carries `role`, `gymId`, `referralCode`, `referredBy` (immutable after set).
- Roles (see `firestore.rules` helpers + `src/utils/rbac.js`): `super_admin`, `gym_admin`, `gym_owner`, `trainer`, `member`, `pending`, `gym_owner_pending`; legacy `admin` (isSuperAdmin boolean), `gym_owner` alias, `rejected`.
- `users/{uid}` doc schema (from `authService.js`, `firestoreService.js`, Settings.jsx:247, GymOwners.jsx:394):
  - `uid` (= Auth UID, = doc ID), `email`, `name`, `role`, `gymId` (or `'default'`), `createdAt` (serverTimestamp)
  - `referralCode` (`IP-XXXXXX`, one-time settable while null/''), `referralCodeGeneratedAt` (serverTimestamp), `referredBy` (uppercase code, immutable)
  - `isSuperAdmin` (boolean, legacy), `photoURL`/`name` (Settings profile update)
  - Gym-deletion disable marks: `accountDisabled`, `disabledReason`, `disabledAt`

### 2.3 Storage
`storage.rules` allows any authenticated user read/write on two prefixes:
- `members/{memberId}/{fileName}` (actual usage: `members/{memberId}/profile.webp`)
- `settings/{fileName}` (actual usage: `settings/gym-logo.webp`)
Client-side constraints: jpeg/jpg/png/webp only, ≤5MB, compressed client-side to webp ≤1024×1024, quality 0.8.

### 2.4 Cloud Functions (`functions/index.js`, 2301 lines)
| Export | Type | Purpose | Secrets |
|---|---|---|---|
| `createPayment` | onCall | PhonePe V1 pay: server-side config, checksum, API call, saves attempt | PHONEPE_* |
| `verifyPayment` | onCall | PhonePe status check, map status, fulfill on success | PHONEPE_* |
| `phonePeCallback` | onRequest webhook | Raw-body checksum verify, update attempt, fulfill, always 200 | PHONEPE_* |
| `createCashfreeOrder` | onCall | Cashfree Orders API, saves attempt, returns paymentSessionId | CASHFREE_* |
| `verifyCashfreePayment` | onCall | Cashfree status check, map status, fulfill on success | CASHFREE_* |
| `cashfreeWebhook` | onRequest webhook | HMAC (`timestamp + rawBody`), replay guard 5 min, amount verify, fulfill, always 200 | CASHFREE_* |
| `onReferralSignup` | onDocumentCreated trigger | `users/{uid}` create → referral Pending doc + notifications + audit | — |
| `backfillMissingProfiles` | onCall | Iterate Auth users, rebuild `users/{uid}` from members/trainers/gyms | — |
| `deleteAuthUser` | onCall | Admin SDK delete of Auth user (orphan cleanup) | — |
| `getSecurityMetrics` | onCall | Platform-wide counts (gyms/users/subscriptions/licenses/devices) | — |

Shared helpers: `fulfillSubscriptionPayment` (transaction: update `subscriptions/{id}` → `payments` record via `createPaymentRecordInTransaction` → `subscriptionHistory` row → `gyms/{id}.subscription.*` dot-path sync → `notifyPaymentSuccess` → `issueReferralReward`), `savePaymentAttempt`, `updatePaymentAttempt` (whitelist), `loadPhonePeConfig`/`loadCashfreeConfig`, checksum generators, `mapCashfreeOrderStatus`, `generateCashfreeOrderId`, `generateMerchantTransactionId`.

### 2.5 Realtime usage (client)
40+ `onSnapshot` listeners (see section 9). Client-side sorting in memory (attendance), `requestIdleCallback` scheduling (AppContext subscriptions), 30s `getPendingUsers` poll (super admin only), 60s in-memory campaign check loop (no Firestore polling), WhatsApp sweep setTimeout chain at 00:05 local.

### 2.6 Indexes
39 composite indexes + 3 field overrides in `firestore.indexes.json` (see section 7).

---

## 3. Collection Inventory (current Firestore)

| # | Collection | Scope | Doc ID | Key fields (observed in code) |
|---|---|---|---|---|
| 1 | `users` | global | `{uid}` = Auth UID | uid, email, name, role, gymId, referralCode, referralCodeGeneratedAt, referredBy, isSuperAdmin, createdAt, accountDisabled, disabledReason, disabledAt, photoURL |
| 2 | `gyms` | global | auto (gymId = doc id) | gymId, ownerUid, gymName, ownerName, email, phone, approvalStatus (pending/approved/rejected/suspended), status, createdAt, `subscription.*` (nested: status, planId, planName, planType, licenseKey, licenseStatus, generatedAt, startDate, expiryDate, graceEndDate, daysRemaining, isLifetime, amount, originalAmount, discountType, discountValue, finalAmount, paymentStatus, paymentMethod, transactionId, paidAt, cancelledAt, updatedAt, renewalCount, trialUsed, lastPaymentId, lastTransactionId), `documents.*` (nested map: `{status: approved/rejected, reviewedAt}` per doc id), plus gym profile fields |
| 3 | `subscriptions` | global | auto; mirror syncs use gymId | gymId, plan, planType, status (trial/active/expired/suspended/cancelled), paymentStatus (pending/paid), paymentMethod, paymentCurrency, currency, transactionId, amount, originalAmount, discountType, discountValue, finalAmount, paidAt, autoRenew, startDate, expiryDate, graceEndDate, daysRemaining, isLifetime, createdAt, updatedAt, pendingPaymentType (renewal/upgrade) |
| 4 | `subscriptionHistory` | gym-scoped | auto | gymId, subscriptionId, action, actorUid, changes, createdAt (serverTimestamp client; ISO in functions) |
| 5 | `paymentAttempts` | gym-scoped | auto | paymentId (`IP-{ts36}-{hex4}`), gymId, subscriptionId, type (new/renewal/upgrade), plan, originalAmount, discountAmount, finalAmount, currency, paymentMethod (UPI/PhonePe/Cashfree), paymentGateway, authUid, status (pending/success/failed/cancelled), merchantTransactionId, transactionId, redirectUrl, expiresAt (ISO, 30-min), cashfreeOrderId, orderStatus, paymentSessionId, cashfreeTransactionId, phonePeState, phonePeTransactionId, responseCode, callbackAmount, errorMessage, rawResponse, createdAt/updatedAt (ISO strings) |
| 6 | `members` | gym-scoped | auto | name, email, phone, plan, planPrice, amountPaid, balanceDue, paymentStatus (Paid/Partial/Pending), status, checkins, trainerId, trainerName, trainerAuthUid, authUid, gymId, avatar, color, photoUrl, storagePath, createdAt (serverTimestamp) |
| 7 | `trainers` | gym-scoped | auto | name, email, phone, specialty, rating, clients, authUid, gymId, createdAt (serverTimestamp) |
| 8 | `plans` | gym-scoped | auto | name, price, duration, durationDays, description, active, order, gymId, createdAt; defaults seeded by `migrateDefaultPlans` |
| 9 | `planTemplates` | gym-scoped | auto | type (diet/workout), name, plan (JSON object), gymId, createdAt |
| 10 | `dietPlans` | gym-scoped | auto | name, goal, calories, protein, carbs, fat, hydration, meals[] (objects), memberId, authUid, assignedMember, assignedTrainer, assignedTrainerAuthUid, ownerType (draft/assigned), ownerId, versions[] (last 5 snapshots), gymId, createdAt, updatedAt |
| 11 | `workoutPlans` | gym-scoped | auto | name, level, days, duration, split, exercises[], memberId, authUid, member, assignedTrainer, trainer, trainerAuthUid, ownerType, ownerId, versions[], gymId, createdAt, updatedAt |
| 12 | `progressLogs` | gym-scoped | auto | memberId, memberName, trainerId, trainerName, authUid, weight, bodyFat, bmi, muscle, bench, squat, deadlift, gymId, createdAt, updatedAt (serverTimestamp) |
| 13 | `payments` | gym-scoped | auto | memberId, memberName, amount, paid, status (Paid/Partial/Pending), plan, method, gymId, authUid, createdAt (serverTimestamp); gateway-created: invoiceNo (`INV-YYYYMMDD-XXXX`), paymentId (dedup key), transactionId, paymentGateway, memberId = subscriptionId for PhonePe/Cashfree records |
| 14 | `attendance` | gym-scoped | auto | memberId (= authUid or member doc id), memberName, avatar, color, plan, trainerId, trainerName, trainerAuthUid, date (ISO date string), time (HH:MM), method (Auto/Manual/reception/QR), duration (90), gymId, createdAt (ISO string) |
| 15 | `notifications` | user-scoped + gymId | auto | userId, gymId, role, title, message, type (26 types), subtype, priority (normal/high/low), icon, actionUrl, relatedDocumentId, page, tab, contactId, targetRole, read (bool), createdAt (serverTimestamp; ISO in functions) |
| 16 | `supportTickets` | gym-scoped | auto | gymId, createdBy, status (Open/…), replies[] (arrayUnion), internalNotes[] (arrayUnion), attachments[] (arrayUnion), createdAt |
| 17 | `featureRequests` | gym-scoped | auto | gymId, createdBy, status ('Under Review'), createdAt |
| 18 | `contactMessages` | global | auto | name, email, phone, message, status (New/Read), createdAt; creates notification on create |
| 19 | `settings` | composite key | `${gymId}:${docId}` OR bare global ids | gym (`{gymId}:gym`), theme (`{gymId}:theme`), notifications (`{gymId}:notifications`), billing (`{gymId}:billing`), whatsapp (`{gymId}:whatsapp`), global: `billing`, `referralSettings`, `platform`; each doc includes `gymId` field |
| 20 | `whatsappLogs` | gym-scoped | auto | memberId, phone, template, provider (mock), status (Queued/Sent/Failed/Retrying), attempts, error, entryId, campaignId, test, gymId, createdAt |
| 21 | `whatsappCampaigns` | gym-scoped | auto | name, body, audience, schedule, status (Draft/Scheduled/Running/Completed/Cancelled), stats.sent, stats.failed (increment), nextRunAt, createdAt, updatedAt |
| 22 | `licensedDevices` | gym-scoped | auto | gymId, deviceId, deviceName, platform, appVersion, userAgent, status, createdAt (serverTimestamp) |
| 23 | `licenseHistory` | gym-scoped | auto | gymId, deviceId, action, performedBy, createdAt (serverTimestamp) |
| 24 | `referralCodes` | global directory | `{code}` deterministic | referrerUid, createdAt (serverTimestamp); read by any authed user, create = owner claim, update/delete denied |
| 25 | `referrals` | gym-scoped | `{referredUid}` deterministic | referrerUid, referredUid, referralCode, gymId, referredName, status (Pending/Qualified/Rewarded), rewardType, rewardValue, rewardIssued, firstPaymentId, expiresAt, createdAt, qualifiedAt, rewardedAt, rewardRef |
| 26 | `rewardLedger` | gym-scoped | auto | type (wallet_credit/membership_extension), rewardType, rewardValue, extensionDays, referrerUid, referredUid, userId, referralId (= referredUid), gymId, status (pending/available), issuedAt, description, rewardRef |
| 27 | `discountCoupons` | gym-scoped | auto | userId, gymId, code, status (available/active/used), createdAt |
| 28 | `referralAuditLogs` | gym-scoped | auto | timestamp, createdAt, action, performedBy, targetUid, referralId, metadata (map) |
| 29 | `auditLog` | global | auto | action, changedBy, changes, previousValues, timestamp (ISO) |
| 30 | `aiConversations` | user-scoped | auto | id, gymId, userId, role, title, createdAt, updatedAt, pinned, archived, deleted, deletedAt, lastMessage, messageCount |
| 31 | `aiConversations/{id}/messages` | subcollection | auto | role, content, createdAt, metadata (map) |
| 32 | `generatedReports` | gym-scoped | auto | gymId, userId, userName, format (CSV/TSV/PDF/Print), label, dateRange, createdAt |
| 33 | `users`-adjacent: `members`/`trainers` | (see 6,7) | — | authUid links member/trainer ↔ users |

Legacy/removed: `superAdmins` collection (removed — `isSuperAdmin` boolean on user), `cashfreeOrders` (retired Sprint 81J — server-side only), `dietPlans`/`workoutPlans` legacy name-based assignment fields kept for back-compat.

---

## 4. Collection → Table Mapping

| Firestore collection | Supabase table | Notes |
|---|---|---|
| `users` | `auth.users` (GoTrue) + `public.profiles` | `profiles.uid = auth.users.id`; role/gym_id/referral fields live in `profiles`; auth metadata holds email/name |
| `gyms` | `gyms` | `subscription` → JSONB column `subscription jsonb`; `documents` → JSONB `documents jsonb` (dot-path writes) |
| `subscriptions` | `subscriptions` | PK auto; `UNIQUE(gym_id)` for mirror semantics |
| `subscriptionHistory` | `subscription_history` | `gym_id`, `subscription_id`, `actor_uid`, `changes jsonb` |
| `paymentAttempts` | `payment_attempts` | JSONB `raw_response`; ISO-string timestamps → timestamptz |
| `members` | `members` | `auth_uid` FK → profiles.uid (nullable for legacy) |
| `trainers` | `trainers` | same |
| `plans` | `plans` | pricing |
| `planTemplates` | `plan_templates` | `plan jsonb` (nested template body) |
| `dietPlans` | `diet_plans` | `meals jsonb[]` → `meals jsonb` (array in JSONB) or child table; `versions jsonb` |
| `workoutPlans` | `workout_plans` | `exercises jsonb`; `versions jsonb` |
| `progressLogs` | `progress_logs` | numeric columns |
| `payments` | `payments` | `UNIQUE(payment_id)` for dedup (gateway) |
| `attendance` | `attendance` | `date date`, `time time`, `duration int` |
| `notifications` | `notifications` | `read bool`, indexes (user_id, created_at desc) |
| `supportTickets` | `support_tickets` + `support_ticket_replies` + `support_ticket_notes` + `support_ticket_attachments` | arrayUnion → child tables |
| `featureRequests` | `feature_requests` | |
| `contactMessages` | `contact_messages` | `status` enum |
| `settings` | `settings` | PK `(gym_id, doc_id)`; `data jsonb`; global docs use `gym_id = 'platform'` or separate `platform_settings` table — **open question (see §13)** |
| `whatsappLogs` | `whatsapp_logs` | masked phone in UI only; raw stored |
| `whatsappCampaigns` | `whatsapp_campaigns` | `stats jsonb` (sent/failed) |
| `licensedDevices` | `licensed_devices` | `UNIQUE(device_id)` semantics: queries by deviceId+gymId |
| `licenseHistory` | `license_history` | |
| `referralCodes` | `referral_codes` | PK `code` (natural key); `referrer_uid` |
| `referrals` | `referrals` | PK `referred_uid` (deterministic id); `UNIQUE(referrer_uid, referred_uid)` |
| `rewardLedger` | `reward_ledger` | |
| `discountCoupons` | `discount_coupons` | `UNIQUE(code)`; status enum |
| `referralAuditLogs` | `referral_audit_logs` | |
| `auditLog` | `audit_log` | |
| `aiConversations` | `ai_conversations` | `messages` → child table `ai_conversation_messages(conversation_id)` |
| `generatedReports` | `generated_reports` | |

---

## 5. Relationships (ER summary)

```
profiles (users) 1─N gyms (ownerUid; gym_id on profile = current gym)
gyms 1─N {members, trainers, plans, planTemplates, dietPlans, workoutPlans, progressLogs,
          payments, attendance, supportTickets, featureRequests, whatsappLogs,
          whatsappCampaigns, licensedDevices, licenseHistory, paymentAttempts,
          subscriptionHistory, referrals, rewardLedger, discountCoupons,
          referralAuditLogs, generatedReports}  (gym_id FK)
gyms 1─1 subscriptions (UNIQUE gym_id mirror; also gyms.subscription jsonb)
gyms 1─N settings (gym_id, doc_id)
members 1─N {payments (member_id | auth_uid), attendance (member_id=authUid),
             progressLogs (member_id), dietPlans/workoutPlans (member_id|authUid)}
members N─1 trainers (trainer_id / trainerAuthUid on member, attendance, plans, progressLogs)
profiles 1─N {notifications (user_id), aiConversations (user_id), discountCoupons (user_id)}
referralCodes.code 1─N referrals (referralCode) ; referrals.referredUid PK = profiles.uid
referrals 1─1 rewardLedger (referral_id = referredUid) ; referrals.rewardRef → rewardLedger
```
Note the **dual-keying anti-pattern** carried into Postgres as a constraint risk: member-related rows reference either the member doc id OR the authUid (attendance: `memberId` = authUid; payments: `memberId` = doc id, but `authUid` also present; progressLogs: `memberId` = doc id; diet/workout plans: both). Migration must add a **single canonical FK** (`member_id uuid → members.id` + `auth_uid` retained as lookup) and backfill the mixed legacy values (attendance `member_id` may hold either). Flagged in §12 and §13.

---

## 6. PK / ID Strategy

| Source | Current | Postgres target |
|---|---|---|
| Most auto docs | Firestore auto-id (20-char alphanumeric) | `uuid default gen_random_uuid()` — but keep legacy string id in a `legacy_id text UNIQUE` column for deep links/history if in-place migration; otherwise map Firestore ids → uuid at export/import |
| `users/{uid}` | Auth UID (string, 28 chars) | `profiles.uid uuid` = `auth.users.id` (Postgres uuid) — **requires auth user re-creation OR uid-preserving migration (open question §13)** |
| `gyms/{gymId}` | auto id used as `gymId` everywhere | `gyms.id uuid` + `legacy_gym_id`; or keep text id if auth UIDs preserved — RLS references gym_id heavily |
| `settings/{gymId}:{docId}` | composite string | `settings(gym_id text, doc_id text) PRIMARY KEY` — cleanest fit |
| `referralCodes/{code}` | `IP-XXXXXX` natural key | `referral_codes(code text PRIMARY KEY)` |
| `referrals/{referredUid}` | deterministic: referred user's auth uid | `referrals(referred_uid) PRIMARY KEY` (FK → profiles.uid) |
| `paymentAttempts.paymentId` | `IP-{ts36}-{hex4}` (uniqueness not enforced) | keep as `payment_id text`; add `UNIQUE` for safety |
| `payments.paymentId` (gateway records) | `IP-{ts36}-{hex4}` dedup key | `UNIQUE(payment_id)` — relied on by `createPaymentRecordInTransaction` |
| subscription keys | `gyms.subscription.licenseKey` `IRP-SEG-SEG-SEG` | keep as text; `UNIQUE(license_key)` on gyms JSONB impossible — move to `gyms.license_key text` column **or** keep in JSONB with app-level uniqueness check (current behavior: query + retry ×10) |
| `aiConversations` | auto | uuid PK; messages child table FK |

---

## 7. Index Strategy

From `firestore.indexes.json` (39 composite + 3 field overrides) — each must become a Postgres index (or be covered by a wider index):

| Firestore composite index | Postgres index |
|---|---|
| attendance (date ASC, time ASC) | `(date, time)` |
| attendance (gymId, date DESC) | `(gym_id, date DESC)` |
| attendance (date DESC, time DESC) | `(date DESC, time DESC)` |
| attendance (gymId, memberId, date DESC, time DESC) | `(gym_id, member_id, date DESC, time DESC)` |
| attendance (memberId, date DESC, time DESC) | `(member_id, date DESC, time DESC)` |
| attendance (trainerAuthUid, date ASC) | `(trainer_auth_uid, date)` |
| attendance (gymId, trainerAuthUid, date ASC) | `(gym_id, trainer_auth_uid, date)` |
| paymentAttempts (subscriptionId, status) | `(subscription_id, status)` |
| paymentAttempts (gymId, status) | `(gym_id, status)` |
| paymentAttempts (status, expiresAt) | `(status, expires_at)` |
| paymentAttempts (subscriptionId, status, gymId) | `(subscription_id, status, gym_id)` |
| subscriptions (gymId, status) | `(gym_id, status)` |
| subscriptions (gymId, paymentStatus) | `(gym_id, payment_status)` |
| notifications (userId, createdAt DESC) | `(user_id, created_at DESC)` |
| notifications (userId, gymId, createdAt DESC) | `(user_id, gym_id, created_at DESC)` |
| notifications (userId, read) | `(user_id, read)` |
| notifications (userId, read, gymId) | `(user_id, read, gym_id)` |
| notifications (targetRole, createdAt DESC) | `(target_role, created_at DESC)` |
| subscriptionHistory (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| licensedDevices (gymId, status) | `(gym_id, status)` |
| licensedDevices (deviceId, gymId) | `(device_id, gym_id)` |
| licenseHistory (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| gyms (approvalStatus, email) | `(approval_status, email)` |
| referrals (referrerUid, createdAt DESC) | `(referrer_uid, created_at DESC)` |
| referrals (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| referrals (referrerUid, status) | `(referrer_uid, status)` |
| referrals (referredUid, status) | `(referred_uid, status)` |
| rewardLedger (referrerUid, issuedAt DESC) | `(referrer_uid, issued_at DESC)` |
| rewardLedger (gymId, issuedAt DESC) | `(gym_id, issued_at DESC)` |
| discountCoupons (userId, createdAt DESC) | `(user_id, created_at DESC)` |
| discountCoupons (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| whatsappLogs (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| whatsappCampaigns (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| aiConversations (userId, deleted, updatedAt DESC) | `(user_id, deleted, updated_at DESC)` |
| generatedReports (gymId, createdAt DESC) | `(gym_id, created_at DESC)` |
| Field overrides: users.referralCode, rewardLedger.referrerUid, discountCoupons.code | `UNIQUE` or plain indexes on those columns |

Plus new indexes required by query patterns **not** in firestore.indexes.json because Firestore auto-indexes single-field `where()`:
- members `(gym_id, trainer_auth_uid)` (trainer scoping), members `(auth_uid)` (member self)
- payments `(gym_id, auth_uid)` (member self-payments), payments `(member_id)`, payments `(auth_uid)`, payments `(member_name)`
- progressLogs `(auth_uid)` (member self), progressLogs `(gym_id)` implicit
- dietPlans `(gym_id, auth_uid)`, `(gym_id, assigned_trainer_auth_uid)`; workoutPlans same (both used in realtime scoping)
- attendance `(gym_id)` + `(date >= …)` single-field used with limit
- notifications `(gym_id)` and `(user_id, gym_id)` (markAll/deleteAll)
- supportTickets/featureRequests `(gym_id)` + `(created_by)`
- planTemplates `(type, gym_id)`
- referralCodes `(code)` = PK
- users `(role)`, `(gym_id)`, `(role, gym_id)` (functions: `where('role','in',…)`, `where('gymId')`)
- gyms `subscription.status` / `subscription.licenseStatus` → **JSONB path indexes**: `CREATE INDEX ON gyms ((subscription->>'status'))` etc. (used by `getSecurityMetrics`)
- paymentAttempts `(cashfree_order_id)` (webhook lookup)
- contactMessages `(status)` (`in ['New','Read']`)
- ai_conversation_messages `(conversation_id, created_at)`

---

## 8. RLS Mapping

Source: `firestore.rules` (744 lines). Role predicates translate to RLS policies:

| Rule helper | Postgres equivalent |
|---|---|
| `isAuthed()` | `auth.uid() IS NOT NULL` |
| `isSuperAdmin()` | `auth.jwt() ->> 'role' = 'super_admin'` OR `EXISTS (profiles WHERE uid = auth.uid() AND role = 'super_admin')` — see note |
| `isGymAdmin()` | `auth.jwt() ->> 'role' IN ('gym_admin','admin')` or profiles lookup |
| `isAdminOrOwner()` | role ∈ {super_admin, gym_admin, gym_owner, admin} |
| `isStaff()` | role ∈ {super_admin, gym_admin, trainer, admin, gym_owner} |
| `isApproved()` | role ∈ all approved roles (excludes pending/gym_owner_pending/rejected) |
| `isMember()` | role = 'member' |
| `getCallerGymId()` | **RLS base**: `profiles.gym_id` of `auth.uid()` — recommend a security definer function `auth_gym_id()` |
| `inCallersGym()` | `gym_id = auth_gym_id()` |
| `inCallersGymCreate()` | `gym_id = auth_gym_id()` (new docs carry gym_id) |
| `isOwnAttendance(memberId)` | `member_id = auth.uid()` (direct uid comparison — rules were fixed to remove doc-path deps) |
| `isOwnMemberDoc(memberId)` | `member_id = auth.uid()` |

Per-table policy summary (each table gets `USING` + `WITH CHECK`):
- **profiles**: read own row or staff; create own row with non-privileged role only (pending/gym_owner_pending/rejected, or member/trainer when companion row exists — replicate via trigger check); update own row with protected columns immutable (`role`, `gym_id`, `email`, `referred_by` never change; `referral_code` settable once while null/''); delete super_admin only.
- **gyms**: read staff; create any authed with `owner_uid = auth.uid()`; update `isAdminOrOwner() AND (isSuperAdmin() OR gym_id = auth_gym_id())`; delete super_admin only.
- **subscriptions / subscriptionHistory / paymentAttempts / whatsappCampaigns / generatedReports / referrals(create/update) / rewardLedger(create/update) / discountCoupons(create) / whatsappLogs**: `isAdminOrOwner() AND inCallersGym()` (delete super_admin for history/attempts/logs).
- **members**: read staff in gym OR member owning row (`auth_uid = auth.uid()`); create admin in gym; update admin in gym OR trainer in gym WITHOUT touching `amount_paid`/`plan_price`; delete admin in gym.
- **trainers**: staff read; admin CRUD in gym.
- **plans**: `isApproved() AND inCallersGym()` read; super_admin/gym_admin CRUD.
- **planTemplates**: staff only (members denied).
- **dietPlans/workoutPlans**: staff read in gym OR member with `member_id/auth_uid = auth.uid()`; member create/update ONLY own drafts (`owner_type='draft' AND owner_id = auth.uid()`); delete admin.
- **progressLogs**: staff in gym OR member own (`member_id = auth.uid() OR auth_uid = auth.uid()`).
- **supportTickets / featureRequests**: read admin in gym OR `created_by = auth.uid()`; create any authed in gym; update/delete admin in gym.
- **settings**: read `isAdminOrOwner() AND inSettingsGym()` (doc_id prefix `gym_id:` OR `data.gym_id`) OR approved reading `gym`, `theme`, `referralSettings` docs; create/update admin in gym (update also super_admin); **delete super_admin ONLY** (critical — gym admins cannot delete settings today).
- **contactMessages**: create anyone; read/update/delete super_admin.
- **referralCodes**: read any authed; create owner claim (`referrer_uid = auth.uid()`); update/delete denied (`false`) — enforce via `REVOKE` + trigger or `FORBIDDEN` policy.
- **referrals**: super_admin all; gym_admin in gym; member own (referrer OR referred; **read of non-existent doc must be allowed** — Firestore 81H fix used a path-wildcard branch; Postgres naturally allows SELECT that returns 0 rows, so the idempotency probe is free).
- **rewardLedger**: member own (referrer_uid or referred_uid = auth.uid()).
- **discountCoupons**: member own (`user_id = auth.uid()`), member can update status only from available/active; admin in gym.
- **referralAuditLogs**: read super_admin or gym_admin in gym; create any authed; update/delete super_admin.
- **auditLog**: read super_admin; create super_admin/gym_admin; update/delete super_admin.
- **notifications**: read own (`user_id = auth.uid()`) or super_admin; create own OR referral type in gym OR unauthed contact-targeted (landing form — Postgres: `INSERT` with `target_role='super_admin' AND type='contact'` from anon role); update/delete own in gym or super_admin.
- **aiConversations**: owner-only CRUD (`user_id = auth.uid()`), update denied when `deleted = true`; **messages**: insert/select only if parent conversation owned; update/delete forbidden (append-only) — trigger `RAISE EXCEPTION` as policy fallback.
- **licensedDevices**: read/update/delete super_admin or gym_admin of the row's gym; create admin with `gym_id = auth_gym_id()`.
- **licenseHistory**: read super_admin or gym_admin in gym; create staff; update/delete super_admin.
- **subscriptions**: mirror semantics — `UNIQUE(gym_id)`; delete super_admin only.

Note: legacy role aliases (`admin`, `gym_owner`) and the `isSuperAdmin` boolean must be folded into a single role column during data migration (open question §13).

---

## 9. Realtime Mapping

Current client realtime (all `onSnapshot`):

| Listener (function) | Query | Supabase Realtime equivalent |
|---|---|---|
| `subscribeToMembers` (limit 2000, gymId) | collection `members` | `postgres_changes` on `members` with `filter: gym_id=eq.<gym_id>` |
| `subscribeToMyMembers` (limit 2000, trainer) | gymId + trainerAuthUid | filter `trainer_auth_uid=eq.<uid>` |
| `subscribeToMyMember` (authUid) | authUid | filter `auth_uid=eq.<uid>` |
| `subscribeToMyPayments` | gymId + authUid | filter both |
| `subscribeToPayments` (limit 2000) | gymId | filter gym_id |
| `subscribeToTrainers` (limit 500) | gymId | filter gym_id |
| `subscribeToSupportTickets` (500) | gymId | filter gym_id |
| `subscribeToContactMessages` (500) | status in [New,Read] | filter `status=in.(New,Read)` |
| `subscribeToFeatureRequests` (500) | gymId | filter gym_id |
| `subscribeToProgressLogs` (1000) / `subscribeToMyProgressLogs` (500) | gymId / authUid | filter gym_id / auth_uid |
| `subscribeToPlans` (1000) | gymId | filter gym_id |
| `subscribeToDietPlans` (1000), `subscribeToMyAssignedDietPlans` (500), `subscribeToMyDietPlans` (500, trainer) | gymId / +authUid / +assignedTrainerAuthUid | filters |
| `subscribeToWorkoutPlans` (1000), myAssigned (500), my (500, trainer) | same pattern | filters |
| `subscribeToGyms` (500) | all gyms (staff) | subscribe without filter; or filter `owner_uid=eq` for owners |
| `subscribeToSubscriptions` (500) | all | no filter |
| `subscribeToGymSubscription` (doc) | doc `gyms/{gymId}` | `postgres_changes` on single row (filter PK) |
| `subscribeToSubscriptionHistory` (200) | gymId + orderBy createdAt desc | filter gym_id (ordering client-side) |
| `subscribeAttendance` (5000, date ≥ now-90d, gymId) | date + gymId | filter `date=gte.<90d>` + gym_id |
| `subscribeMyAttendance` / `subscribeMyTrainerAttendance` | + memberId / trainerAuthUid | filters |
| `subscribeToWhatsappLogs` (300, orderBy createdAt desc) | gymId | filter gym_id |
| `subscribeToNotifications` (50, orderBy createdAt desc) | userId + optional gymId | filter user_id (+gym_id) — pagination via `loadMore` startAfter → keyset pagination |
| `subscribeToDevices` (statusFilter) | gymId + optional status | filters |
| `subscribeToAllDevices` | all | no filter |
| `subscribeToLicenseHistory` (1000) / `subscribeToAllLicenseHistory` | gymId / all | filters |
| `subscribeToPaymentAttempts` | gymId | filter gym_id |
| `subscribeToGeneratedReports` (50, orderBy createdAt desc) | gymId | filter gym_id |
| `subscribeToReferrals` ×3 (my/gym/all), `subscribeToReferralSettings`, `subscribeToRewardLedger` ×2, `subscribeToDiscountCoupons` ×2 | role-scoped | filters |
| `subscribeToConversations` (30, orderBy updatedAt desc, deleted=false) | userId + deleted | filter user_id + deleted=eq.false |
| `subscribeConversationMessages` (500) | parent conv | filter conversation_id |
| `subscribeToMyProgressLogs` etc. | — | — |

Realtime caveats: Supabase Realtime has a 100-row default limit for historical data (row-level, WAL); clients must re-fetch full snapshots on reconnect — behavior differs from Firestore's cached snapshot semantics (a `supabase-js` channel receives only NEW changes, not the existing rows, unless you first `select`). The **single-listener-implies-full-replace** pattern in AppContext (`setMembers(data)` on every event) maps cleanly to `initial select + INSERT/UPDATE/DELETE handlers`. Also: no `requestIdleCallback`-style batching in Supabase — debounce `setState` from realtime events (Firestore already batches by snapshot; postgres_changes does not).

Non-Firestore timers preserved: 30s pending-users poll (super admin), 60s campaign in-memory check, WhatsApp 00:05 sweep chain, PaymentStatus 10s poll — all client-side, unaffected.

---

## 10. Storage Mapping

| Firebase Storage path | Supabase Storage equivalent |
|---|---|
| `members/{memberId}/profile.webp` | bucket `member-photos` path `{member_id}/profile.webp` |
| `settings/gym-logo.webp` | bucket `settings` path `gym-logo.webp` |

- `storage.rules` today: any authed read/write. Supabase Storage policies must mirror: public-read bucket with authenticated INSERT/UPDATE (and RLS-linked path ownership where needed); the download URL pattern (`getDownloadURL`) → `getPublicUrl` (or signed URLs if private).
- Client logic to replicate: validate (type/size/name), client-side compress to webp ≤1024px/5MB, resumable upload with progress, delete on member delete (also delete from `profiles.photo_url` and `members.photo_url`).
- `deleteMember` cascade currently deletes `members/{id}/profile.webp` (either stored `storagePath` or derived path) — migration must preserve the derived-path fallback.

---

## 11. Functions Mapping

| Firebase function | Supabase replacement |
|---|---|
| `createPayment` / `verifyPayment` / `phonePeCallback` (PhonePe) | Supabase Edge Function `phonepe.ts` (or standalone service): create/status/webhook handlers; server-side secrets (`PHONEPE_*`) as Edge Function secrets |
| `createCashfreeOrder` / `verifyCashfreePayment` / `cashfreeWebhook` | Edge Function `cashfree.ts` (same split) |
| `onReferralSignup` (Firestore trigger) | **Postgres trigger on `profiles` INSERT** (`INSERT ... RETURNING` / `AFTER INSERT`) — runs inside the database, idempotent by `referrals(referred_uid)` PK; or Edge Function `webhook` called from a GoTrue `on_new_user` hook (Blaze-only today → Spark-compatible via trigger) |
| `fulfillSubscriptionPayment` + helpers | **Postgres function** `fulfill_subscription(attempt_id uuid)` run in a single transaction from the webhook/verify handlers; `notifyPaymentSuccess`, `createPaymentRecordInTransaction`, `issueReferralReward` as DB functions/triggers (payment insert → reward/notification triggers) |
| `backfillMissingProfiles` | One-off SQL migration script |
| `deleteAuthUser` | Supabase Admin API (`supabase.auth.admin.deleteUser`) from an Edge Function, or `auth.users` cascade delete via admin — note GoTrue profile FK `ON DELETE CASCADE` |
| `getSecurityMetrics` | SQL view or Edge Function aggregating counts |

Secrets: Edge Function secrets mirror the Firebase Secret Manager set (`PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_MODE`).

---

## 12. Migration Risks (high to low)

1. **Auth UID identity** — Every business table stores `authUid`/`userId`/`referrerUid` as the Firebase Auth UID string, and several doc IDs are the UID itself (`users/{uid}`, `referrals/{referredUid}`). Postgres `auth.users.id` is a UUID. Options: (a) preserve string uid in a `firebase_uid` column and use a UUID PK internally — requires rewriting every reference; (b) re-create Auth users (loses password/login history, requires password reset flows); (c) keep GoTrue UUIDs and store `firebase_uid` mapping table + lookup views. **This is the single biggest cost driver.** Recommend (c) with views to keep client code almost unchanged.
2. **Dual keying** — `members.id` vs `members.authUid` both appear as `memberId` across collections (attendance uses authUid; payments/progressLogs use doc id; diet/workout use both). Any FK must be built on a canonicalized value; a reconciliation pass is required before constraints can be added.
3. **Realtime semantics** — Supabase Realtime delivers only new WAL events; Firestore snapshots replace whole sets. AppContext assumes full-list replace on every event → migrate to `select`-then-subscribe with INSERT/UPDATE/DELETE upserts; race windows must be handled.
4. **`serverTimestamp()` vs client clocks** — `attendance.createdAt` is client ISO (uses client clock); Postgres `now()` differs. Order-by-stability of `date`+`time` (both client-set) may produce ties; add a tie-break column.
5. **Deterministic doc IDs / idempotency** — `referrals/{referredUid}` and `notifications/ref-registered-{ref}-{refd}` rely on doc-ID uniqueness for dedup. Postgres PKs preserve this; ensure the same keys are used in the DB (not random uuids) for these tables, or add unique constraints + retry semantics.
6. **Nested map writes** — `gyms.subscription.*` dot-path updates (transactions) and `gyms.documents.{id}.status` must translate to `jsonb_set` in SQL; failing to do so breaks license checks, license keys, and the superadmin document approval buttons.
7. **`arrayUnion` semantics** — Support ticket replies/internalNotes/attachments use `arrayUnion` (append-if-missing). If moved to child tables, uniqueness rules change (append-only vs append-if-not-present). Versions arrays (diet/workout last-5 snapshots) are capped client-side.
8. **`increment` counters** — `bumpWhatsappCampaignStats`, member `checkins+1`, payment auto-sync writes. Postgres: atomic `UPDATE ... SET x = x + 1` (safe under RLS as long as policy checks don't read the same row — plan `WHERE` guard accordingly).
9. **Settings composite-key semantics** — `settings/{gymId}:{docId}` with global ids (`billing`, `referralSettings`, `platform`) must not collide: use `settings(gym_id text default 'platform', doc_id text)` and re-point `getGlobalBilling()` to `doc_id='billing' AND gym_id='platform'`.
10. **Email-verification & secondary auth** — GoTrue has no "secondary instance"; the admin-created member/trainer flow must use the GoTrue Admin API (`auth.admin.createUser` with generated password + `email_confirm` semantics) — verify the "password shown once" UX can be preserved.
11. **Role aliases** — `admin` + `isSuperAdmin` boolean, `gym_owner` alias, `rejected` need normalization to one enum + one flag; RLS predicates and `rbac.js` both consume these.
12. **License enforcement** — `LicenseGuard` blocks the app when the gym subscription is missing/expired; it reads `gyms.subscription` + `subscriptions`. JSONB index/perf + transactional update ordering must be preserved exactly.
13. **Unauthed contact form** — `contactMessages` create + `notifications` create (targetRole super_admin, type contact) must be allowed from the anon role (Postgres: `anon` role policy on those two INSERTs only).
14. **Storage URL stability** — `downloadUrl` strings are persisted in `members.photoUrl`; Supabase URLs differ → rewrite URLs during migration or derive at render time.
15. **Cascade deletes (Sprint 81B)** — superadmin gym deletion wipes ~25 collections in chunked batches; Postgres should do this in one transaction via `ON DELETE CASCADE` FKs (requires canonical FKs — risk #2 prerequisite).
16. **30-min attempt expiry + auto-poll** — business logic in functions (`expiresAt` check on verify/webhook) must move to Edge Functions or a scheduled job; client countdown uses `expiresAt` ISO — keep format.

---

## 13. Open Questions

1. **Auth UID preservation strategy** — (c) mapping table + views, (b) re-create users, or (a) UUID rewrite everywhere? Determines the entire FK layer. *(Blocker for schema finalization.)*
2. **`settings` global-vs-gym split** — single `settings(gym_id, doc_id)` table with `'platform'` sentinel vs separate `platform_settings`? (Firestore rules treat `billing`/`referralSettings`/`platform` as global docs.)
3. **Role model** — collapse `admin`+`isSuperAdmin` and `gym_owner` alias into canonical enums, or keep a `role text` + `is_super_admin bool` composite to minimize code churn? RLS and `rbac.js` both must stay in sync.
4. **Realtime client strategy** — adopt `supabase-js` channel + manual upsert, or a thin realtime→onSnapshot-compatible adapter (recommended) to keep the 40+ listener call sites untouched?
5. **`dietPlans.meals` / `workoutPlans.exercises` / `versions`** — JSONB column vs child tables (postgres_changes row-level events vs nested JSON updates don't fire row events; if realtime must update plan details, JSONB is fine — plans aren't realtime-critical beyond list presence).
6. **WhatsApp / campaign engine placement** — stays client-side in-memory (Spark semantics) or moves to an Edge Function scheduler? (No Firestore listeners today; only client timers.)
7. **GoTrue profile linkage** — use GoTrue's built-in `profiles` convention (`auth.uid() = profiles.uid` FK) vs a standalone table? Built-in is recommended for RLS ergonomics.
8. **History/audit retention** — `licenseHistory`/`referralAuditLogs`/`auditLog` have 1000-row list caps today; Postgres should add retention (archive partition) since scans become unbounded.
9. **PhonePe/Cashfree config source** — today read from Edge Function secrets (post-migration), but `Settings → Billing` UI previously wrote `settings/billing`; confirm the write target for prod billing config after migration.
10. **`gyms.documents` approval payload** — what document metadata is stored (`documents.{id}` map) beyond status/reviewedAt? (superadmin approve/reject buttons write `status` + `reviewedAt` — full schema of the file docs unverified; needs a production data sample.)

---

## 14. Implementation Order (recommended migration sequence)

1. **Decision freeze** — resolve Open Questions #1, #2, #3 (auth UID strategy, settings split, role model). Everything downstream depends on these.
2. **Schema DDL** — create tables per §4 with canonical PKs/FKs, unique constraints (referrals.referred_uid, discount_coupons.code, subscriptions.gym_id, payments.payment_id), JSONB columns for nested maps, enums for status/role fields.
3. **Indexes** — apply §7 set (verify with `EXPLAIN` against query shapes from section 9).
4. **RLS policies** — apply §8 policy matrix per table; write a rule-equivalence test matrix (port each `firestore.rules` branch to a policy test).
5. **DB functions/triggers** — referral signup trigger (profiles INSERT), fulfillment transaction, payment-record + notification + reward triggers, `jsonb_set` helpers, `now()` defaulting, check-in counter increment, contact-message notification insert (anon).
6. **Realtime adapter** — supabase-js channels with initial `select` + upsert; adapter mirroring `onSnapshot(cb, err)` signature so AppContext/service call sites stay compatible.
7. **Data migration scripts** — export Firestore → staging JSONL → import with UID mapping table; backfill canonical `member_id` (dual-key reconciliation); rewrite settings doc IDs; rewrite storage URLs.
8. **Edge Functions** — port 10 Cloud Functions (PhonePe/Cashfree/wallet-ops) with secrets; validate HMAC/checksum byte-for-byte against current tests.
9. **Storage** — buckets, policies, client `uploadMemberPhoto`/`uploadGymLogo`/`deleteMemberPhoto` port (compress + resumable + URL rewrite).
10. **Cutover** — feature-flag dual-write (optional), verify subscription/license/attendance/payment live paths, run regression on all 13 modules, then flip DNS/auth.
11. **Decommission** — freeze Firestore writes, final export, delete Firebase resources (post-validation).

---

---

## 15. Final Identity and Tenancy Model

> **Status: RESOLVED** — this section freezes the decisions for Open Questions #1 (auth UID strategy), #2 (settings split), #3 (role model), #5 (JSONB vs child tables), and #7 (GoTrue profile linkage). It is the authoritative identity/tenancy contract for `docs/SUPABASE_DDL_SPEC.md`.

### 15.1 Firebase UID strategy (OQ #1) — preserve UIDs as first-class text columns

**Decision: Firebase UIDs are preserved byte-for-byte as TEXT identity columns; no UUID rewrite, no conversion, no mapping table beyond `profiles` itself.**

Rationale (evidence): Firebase UIDs are embedded across the codebase as foreign keys in 172+ `authUid` references and as deterministic document IDs (`users/{uid}`, `referrals/{referredUid}`, `referralCodes/{code}`). Supabase `auth.users.id` is a UUID owned by GoTrue. Rewriting every reference would require an invented, lossy conversion; a separate mapping table duplicates what `profiles` already provides.

- `profiles` is the single bridge: `profiles.id uuid PK = auth.users.id`, `profiles.firebase_uid text UNIQUE NOT NULL`.
- Every business table keeps its identity columns as TEXT holding the Firebase UID, with FKs pointing at `profiles(firebase_uid)`: `auth_uid`, `user_id`, `owner_uid`, `referrer_uid`, `referred_uid`, `actor_uid`, `performed_by`, `created_by`, `target_uid`, `trainer_auth_uid`, `assigned_trainer_auth_uid`.
- RLS resolves the session through the bridge: helper `auth_firebase_uid()` = `(select firebase_uid from profiles where id = auth.uid())`; policies compare `row.auth_uid = auth_firebase_uid()`.
- Application code keeps writing/reading the same string UID — the realtime adapter passes values through unchanged. Zero identity rewrite in client code.

### 15.2 Auth.users ↔ profile relationship (OQ #7)

- `auth.users` (GoTrue) is the **login/identity authority** — never referenced by business FKs directly (GoTrue-owned; no extension columns).
- `profiles` (business-owned) is the extension row: `profiles.id = auth.users.id` FK. It holds `firebase_uid`, `role`, `gym_id`, `referral_code`, `referred_by`, `is_super_admin`, `account_disabled*` flags.
- Migration: users re-created in Supabase Auth via Admin API (same email); `profiles.firebase_uid` carries the old uid, `profiles.id` is the new auth UUID.

### 15.3 Member identity — canonical model

- `members.id uuid PK` — canonical member record identifier; **FK target** for `payments.member_id`, `progress_logs.member_id`, `diet_plans.member_id`, `workout_plans.member_id`, `whatsapp_logs.member_id`, `attendance.member_id`.
- `members.legacy_id text UNIQUE` — the old Firestore document ID, preserved for migration mapping and reference integrity (never an FK target).
- `members.auth_uid text UNIQUE NULL FK profiles(firebase_uid)` — login link; nullable (legacy members without auth accounts); also the RLS self-read key and FK target for `attendance.auth_uid` (the pre-migration `memberId` value was the auth UID).
- Migration: child rows whose `member_id` held a doc ID **or** an auth UID are rewritten to the canonical `members.id` via `legacy_id`/`auth_uid` lookups. Dual-key ambiguity is eliminated; one canonical FK per relationship.

### 15.4 Trainer identity

- `trainers.id uuid PK`, `trainers.legacy_id text UNIQUE`, `trainers.auth_uid text UNIQUE NULL FK profiles(firebase_uid)`.
- `members.trainer_id uuid FK trainers.id` (canonical); `members.trainer_auth_uid text FK trainers(auth_uid)` retained for trainer-scoped queries (`subscribeToMyMembers` by `trainerAuthUid`).
- `attendance.trainer_id`/`trainer_auth_uid` and `diet_plans.assigned_trainer_auth_uid`/`workout_plans.trainer_auth_uid` mirror the same dual pattern (canonical id + auth uid) for scope filtering.

### 15.5 Gym identity — text PK preserved

- `gyms.id text PK` — Firestore doc IDs preserved **byte-for-byte** (`'default'` and auto IDs). Every gym-scoped row's `gym_id text FK gyms.id`. No rewrite of any `gymId` reference.
- `subscriptions` mirror rows keyed by the gym doc id at import (doc-id deletes in GymOwners cascade); new rows use `subscriptions.id uuid`.

### 15.6 Role identity (OQ #3)

- **Single role per user, single gym per user** (verified: `users` docs carry one `role` field and one `gymId`; navigation and `canSubscribe` are built per effective role; no role/gym junction anywhere).
- Effective-role normalization (rbac.js `getEffectiveRole`): `admin` + `isSuperAdmin` → `super_admin`; `admin` → `gym_admin`; `gym_owner` → `gym_admin`.
- **Decision: PostgreSQL ENUM `user_role`** with exactly 7 values: `super_admin`, `gym_admin`, `trainer`, `member`, `pending`, `gym_owner_pending`, `rejected`. No junction table (M:N role membership is not a supported capability).
- `profiles.is_super_admin boolean NOT NULL DEFAULT false` retained for legacy flag parity; derived at migration (`role='admin' AND isSuperAdmin` → `super_admin`; `role='admin'` → `gym_admin`; `role='gym_owner'` → `gym_admin`).

### 15.7 Settings model (OQ #2, #9)

- Single `settings` table: `gym_id text NOT NULL`, `doc_id text`, `data jsonb`, PK `(gym_id, doc_id)`.
- Gym-scoped docs: `doc_id ∈ {gym, theme, notifications, billing, whatsapp}` keyed by the real gym id (composite `${gymId}:${docId}` splits into two columns).
- Global docs: sentinel `gym_id = 'platform'` for `doc_id ∈ {billing, referralSettings, platform}`. `getGlobalBilling()` semantics = `doc_id='billing' AND gym_id='platform'` (gym Billing saves write their own gym row and can never overwrite the platform row — fixes the Sprint 81D RC2 hazard by schema).
- `gyms.subscription.*` and `gyms.documents.*` dot-path maps stay **JSONB on `gyms`** (30+ subscription fields; dot-path writes → `jsonb_set`; no normalization benefit).

### 15.8 Canonical foreign keys (summary)

| Relationship | Canonical FK target |
|---|---|
| user identity (all `*_uid`, `*_by`, `*_to`) | `profiles(firebase_uid)` (text) |
| login row ↔ business profile | `profiles.id = auth.users.id` (uuid) |
| member records (payments/progress/plans/attendance/logs) | `members.id` (uuid) |
| trainer links (members/attendance/progress) | `trainers.id` (uuid) |
| trainer-scope queries | `trainers(auth_uid)` (text) |
| member-scope/RLS queries | `members(auth_uid)` (text) |
| gym scoping (all gym-scoped rows) | `gyms.id` (text) |
| subscription mirror + history | `subscriptions.id` (uuid) |
| referrals / reward / coupons (user-scoped) | `profiles(firebase_uid)` (text) |

### 15.9 Tenancy rules (RLS contract)

1. **R1** — Every gym-scoped row carries `gym_id` (NOT NULL) → `gyms.id`.
2. **R2** — `auth_gym_id()` = `(select gym_id from profiles where id = auth.uid())`.
3. **R3** — `gym_admin` / `trainer` / `member` policies: `gym_id = auth_gym_id()`.
4. **R4** — `super_admin` bypass: `is_super_admin(auth.uid())` via `profiles`.
5. **R5** — user-scoped rows (`notifications`, `ai_conversations`, `referrals`, `reward_ledger`, `discount_coupons`): `auth_uid = auth_firebase_uid()` (members additionally via `members.auth_uid` join).
6. **R6** — Anonymous: `contact_messages` INSERT only.
7. **R7** — `gyms` registry: readable by approved roles (super_admin read/write; staff read own gym); `referral_codes` readable by any authenticated user, create by code owner only.

### 15.10 Deterministic keys preserved

`referrals.referred_uid` (PK = Firebase UID), `referral_codes.code` (PK = `IP-XXXXXX`), `settings (gym_id, doc_id)` PK, `gyms.id` (doc ID), `payments.payment_id` (`IP-{ts36}-{hex4}` UNIQUE), `subscriptions.license_key` (`IRP-...` UNIQUE), `payments.invoice_no` UNIQUE, `discount_coupons.code` UNIQUE.

---

*Document generated from source-code analysis only. No Firebase or Supabase resources were modified.*
