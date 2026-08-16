# IRONPULSE — Firestore Service Migration Inventory (Step 8C)

Status: COMPLETE
Scope: `src/services/firestoreService.js` (1,668 lines) → Supabase/PostgreSQL.
Provider: dual-provider — `VITE_AUTH_PROVIDER` (`'supabase'` default active, `'firebase'` explicit legacy rollback).
Out of scope (NOT migrated in this step): realtime listeners, Storage, Cloud Functions, payment webhooks, attendanceService/paymentService/notificationService/referralService/deviceService/subscriptionService.

## 1. Classification Legend

- A = SELECT (one-shot read)
- B = INSERT
- C = UPDATE
- D = DELETE
- E = REALTIME (REALTIME_PENDING — see §6)
- F = TRANSACTION
- G = BATCH/one-time migration
- H = CALLABLE-BACKEND (httpsCallable)
- I = AUTH-PROVISIONING
- J = MIXED

## 2. Full Export Inventory (71 function exports + `DEFAULT_GYM_ID` const)

| # | Export | Class | Supabase implementation |
|---|--------|-------|-------------------------|
| 1 | `addMember(memberData)` | B,I,J | `members` insert (id/legacy_id = client UUID); authUid: null; NO auth account (Step 8 boundary); `referredBy` → `referred_by` column |
| 2 | `subscribeToMyMembers(trainerAuthUid, cb, gymId, onErr)` | E | one-shot fetch `members` (trainer_auth_uid eq) + REALTIME_PENDING warn, noop unsubscribe |
| 3 | `backfillTrainerAuthUid(gymId)` | G | one-shot read `members` + `trainers`, patch `trainer_auth_uid` |
| 4 | `subscribeToMembers(cb, gymId, onErr)` | E | one-shot fetch `members` (gym_id eq, limit 2000) + REALTIME_PENDING |
| 5 | `subscribeToMyMember(authUid, cb, onErr)` | E | one-shot fetch `members` (auth_uid eq) + REALTIME_PENDING |
| 6 | `subscribeToMyPayments(authUid, cb, gymId, onErr)` | E | one-shot fetch `payments` (auth_uid eq [gym_id eq]) + REALTIME_PENDING |
| 7 | `updateMember(memberId, updatedData)` | C | `members` update (whitelist map; numeric coercion) |
| 8 | `deleteMember(memberId)` | D,J | read row → storage photo delete (Storage untouched) → delete row (DB cascade removes child rows); notification cleanup skipped (no delete policy) |
| 9 | `addPayment(paymentData)` | B | `payments` insert; `payment_id` = `PMT-`+unique; member_id/auth_uid null-safe FKs |
| 10 | `subscribeToPayments(cb, gymId, onErr)` | E | one-shot fetch `payments` (gym_id eq, limit 2000) + REALTIME_PENDING |
| 11 | `updatePayment(paymentId, updatedData)` | C | `payments` update (whitelist; `paidOn`→ dropped, no column) |
| 12 | `deletePayment(paymentId)` | D | `payments` delete |
| 13 | `addTrainer(trainerData)` | B,I | `trainers` insert; NO auth account (boundary); returns `{ id, password: null }` |
| 14 | `subscribeToTrainers(cb, gymId, onErr)` | E | one-shot fetch `trainers` (gym_id eq, limit 500) + REALTIME_PENDING |
| 15 | `updateTrainer(trainerId, updatedData)` | C | `trainers` update (whitelist) |
| 16 | `deleteTrainer(trainerId)` | D | read row → name-based plan nullification → delete row (FK `on delete set null` cleans refs) |
| 17 | `addSupportTicket(ticketData)` | B | `support_tickets` insert |
| 18 | `subscribeToSupportTickets(cb, gymId, onErr)` | E | one-shot fetch (gym_id eq, limit 500) + REALTIME_PENDING |
| 19 | `addContactMessage(msgData)` | B,J | `contact_messages` insert (anon policy) + notification side-write |
| 20 | `subscribeToContactMessages(cb, onErr)` | E | one-shot fetch (status in New/Read, limit 500) + REALTIME_PENDING |
| 21 | `updateContactMessage(msgId, data)` | C | `contact_messages` update |
| 22 | `addFeatureRequest(requestData)` | B | `feature_requests` insert |
| 23 | `subscribeToFeatureRequests(cb, gymId, onErr)` | E | one-shot fetch (gym_id eq, limit 500) + REALTIME_PENDING |
| 24 | `getSettings(docId='gym', gymId)` | A | `settings` select (gym_id, doc_id); `docId==='billing' && !gymId` → gym_id `'platform'` |
| 25 | `saveSettings(docId='gym', data, gymId)` | C | `settings` upsert jsonb `data` (composite PK) |
| 26 | `getGlobalBilling()` | A | `settings` select (`'platform'`, `'billing'`) |
| 27 | `subscribeToProgressLogs(cb, gymId, onErr)` | E | one-shot fetch (gym_id eq, limit 1000) + REALTIME_PENDING |
| 28 | `subscribeToMyProgressLogs(cb, authUid, onErr)` | E | one-shot fetch (auth_uid eq) + REALTIME_PENDING |
| 29 | `addProgressLog(logData)` | B | `progress_logs` insert (numeric coercion; log_date) |
| 30 | `updateProgressLog(logId, updatedData)` | C | `progress_logs` update |
| 31 | `deleteProgressLog(logId)` | D | `progress_logs` delete |
| 32 | `subscribeToPlans(cb, gymId, onErr)` | E | one-shot fetch `plans` (gym_id eq, limit 1000) + REALTIME_PENDING |
| 33 | `addPlan(planData)` | B | `plans` insert; `duration` string → minutes int; `duration_days` int; `sort_order` = order |
| 34 | `updatePlan(planId, updatedData)` | C | `plans` update (duration → minutes) |
| 35 | `deletePlan(planId)` | D | `plans` delete |
| 36 | `migrateDefaultPlans(gymId)` | G | count gym_id → insert 6 defaults (minutes durations) |
| 37 | `subscribeToDietPlans(cb, gymId, onErr)` | E | one-shot fetch (gym_id eq, limit 1000) + REALTIME_PENDING |
| 38 | `subscribeToMyAssignedDietPlans(authUid, cb, gymId, onErr)` | E | one-shot fetch (auth_uid eq) + REALTIME_PENDING |
| 39 | `subscribeToMyDietPlans(trainerAuthUid, cb, gymId, onErr)` | E | one-shot fetch (assigned_trainer_auth_uid eq) + REALTIME_PENDING |
| 40 | `addDietPlan(planData)` | B | `diet_plans` insert (meals/versions jsonb, member_id/auth_uid null-safe) |
| 41 | `updateDietPlan(planId, updatedData)` | C,J | read prev → versions snapshot → update |
| 42 | `deleteDietPlan(planId)` | D | `diet_plans` delete |
| 43 | `subscribeToWorkoutPlans(cb, gymId, onErr)` | E | one-shot fetch (gym_id eq, limit 1000) + REALTIME_PENDING |
| 44 | `subscribeToMyAssignedWorkoutPlans(authUid, cb, gymId, onErr)` | E | one-shot fetch (auth_uid eq) + REALTIME_PENDING |
| 45 | `subscribeToMyWorkoutPlans(trainerAuthUid, cb, gymId, onErr)` | E | one-shot fetch (trainer_auth_uid eq) + REALTIME_PENDING |
| 46 | `addWorkoutPlan(planData)` | B | `workout_plans` insert (exercises/versions jsonb) |
| 47 | `updateWorkoutPlan(planId, updatedData)` | C,J | read prev → versions snapshot → update |
| 48 | `deleteWorkoutPlan(planId)` | D | `workout_plans` delete |
| 49 | `backfillOwnershipFields()` | G | one-shot read members + diet/workout plans, patch member_id/auth_uid |
| 50 | `subscribeToGyms(cb, onErr)` | E | one-shot fetch `gyms` (limit 500) + REALTIME_PENDING |
| 51 | `addGym(gymData, ownerUid)` | B | `gyms` insert (text id, owner_uid, approval_status 'pending') |
| 52 | `updateGym(gymId, updatedData)` | C | `gyms` update (whitelist; subscription/documents jsonb) |
| 53 | `deleteGym(gymId)` | D | `gyms` delete (DB cascade superset) |
| 54 | `subscribeToSubscriptions(cb, onErr)` | E | one-shot fetch (limit 500) + REALTIME_PENDING |
| 55 | `getSubscriptionByGymId(gymId)` | A | `subscriptions` select (gym_id eq) → first |
| 56 | `addSubscription(subData, billingSettings)` | B,J | `subscriptions` insert (super-only RLS); map available columns; drop fields w/o columns |
| 57 | `updateSubscription(subId, updatedData, billingSettings)` | C,J | read prev → plan-change recalcs → update |
| 58 | `deleteSubscription(subId)` | D | `subscriptions` delete |
| 59 | `migrateSubscriptions()` | G | one-shot select → patch available columns |
| 60 | `savePlanTemplate({type,name,plan,gymId})` | B | `plan_templates` insert (super-only RLS — limitation) |
| 61 | `listPlanTemplates(type, gymId)` | A | `plan_templates` select (type eq [gym_id eq], limit 200) |
| 62 | `deletePlanTemplate(templateId)` | D | `plan_templates` delete |
| 63 | `addWhatsappLog(record)` | B | `whatsapp_logs` insert (member_id/campaign_id null-safe uuid FKs) |
| 64 | `subscribeToWhatsappLogs(cb, gymId, onErr)` | E | one-shot fetch (gym_id eq, order created_at desc, limit 300) + REALTIME_PENDING |
| 65 | `getWhatsAppAutomationConfig(gymId)` | A | `settings` select (`gymId`,`whatsapp`) → jsonb data |
| 66 | `saveWhatsAppAutomationConfig(gymId, config)` | C | `settings` upsert (`gymId`,`whatsapp`) |
| 67 | `listWhatsappCampaigns(gymId, limitN=200)` | A | `whatsapp_campaigns` select (gym_id eq, order created_at desc) |
| 68 | `createWhatsappCampaign(campaign)` | B | `whatsapp_campaigns` insert (audience/schedule/stats jsonb) |
| 69 | `updateWhatsappCampaign(id, patch)` | C | `whatsapp_campaigns` update (whitelist) |
| 70 | `bumpWhatsappCampaignStats(id, delta)` | C | RPC `bump_campaign_stat(p_campaign_id, p_field, p_by)` (0003_rpc.sql) |
| 71 | `deleteWhatsappCampaign(id)` | D | `whatsapp_campaigns` delete |

## 3. ID Translation Strategy

- `detUuid(str)` = SHA-256(`'IRONPULSE:' + str`), byte 6 → v5 bits, byte 8 → RFC4122 variant, lowercase UUID hex. Identical to `scripts/migration/dry_run_import.js:57-63`.
- `resolveId(id)` = `UUID_RE.test(id) ? id.toLowerCase() : detUuid(id)`.
- Every table PK = `detUuid(firestoreDocId)` EXCEPT: `gyms.id` (text, preserved), `profiles.id` (live auth UUID), `referral_codes.code` (natural PK).
- NEW rows (operational tables — currently empty): client generates `crypto.randomUUID()`; `legacy_id = id` (members, trainers).
- Membership FK columns (`trainer_id`, `member_id`, `campaign_id`...) accept only UUIDs → always routed through `resolveId` (null-safe; null when input empty/legacy).

## 4. Table → Collection Map

| Supabase table | Firestore collection | Status |
|---|---|---|
| `gyms` (13 rows) | `gyms` | imported; text ids |
| `profiles` (25) | `users` | imported; live auth UUID ids (handled by authService, NOT here) |
| `plans` (18) | `plans` | imported |
| `settings` (1) | `settings` | imported; composite (gym_id, doc_id) |
| `subscriptions` (6) | `subscriptions` | imported |
| `subscription_history` (2) | `subscriptionHistory` | imported; written by Cloud Functions only |
| `notifications` (9) | `notifications` | imported |
| `license_history` (11) | `licenseHistory` | imported; written by deviceService/CF only |
| `referral_codes` (1) | `referralCodes` | imported |
| `ai_conversations` (15) / `ai_conversation_messages` (65) | `aiConversations` / messages | imported; written by ai services (not here) |
| `contact_messages` (3) | `contactMessages` | imported |
| `members`, `trainers`, `attendance`, `payment_attempts`, `payments`, `progress_logs`, `diet_plans`, `workout_plans`, `plan_templates`, `support_tickets`, `feature_requests`, `whatsapp_logs`, `whatsapp_campaigns`, `licensed_devices`, `referrals`, `reward_ledger`, `discount_coupons`, `referral_audit_logs`, `audit_log`, `generated_reports` | various | EMPTY — supabase mode writes fresh rows (uuid ids) |

## 5. RPC Requirements (Step 6)

| RPC | Purpose | Migration |
|---|---|---|
| `bump_campaign_stat(p_campaign_id uuid, p_field text, p_by int)` | atomic `jsonb_set` increment on `whatsapp_campaigns.stats` + `updated_at`; security invoker (RLS applies); whitelist fields sent/failed/pending/cancelled/total | `0003_rpc.sql` |

No other transactions required — Firestore code uses no multi-doc transactions; DB FKs/cascades provide atomicity (cascade on members/trainers/gyms).

## 6. REALTIME_PENDING List (Step 9 — NOT migrated)

All 21 `subscribeTo*` exports (see §2 class E). Supabase-mode behavior: **one-shot initial fetch** (matching the Firestore filter/limit, mapped to camelCase) then `console.warn('[REALTIME_PENDING] ...')` once; returns `() => {}` noop unsubscribe. Pages get initial data; live updates require the future realtime migration (Supabase Realtime / broadcast) or polling.

Initial-load semantics per listener (table, filters, order, limit):
- members: gym_id eq; 2000. myMembers: trainer_auth_uid eq (+ gym_id). myMember: auth_uid eq. myPayments: auth_uid eq (+ gym_id). payments: gym_id eq; 2000. trainers: gym_id eq; 500. supportTickets: gym_id eq; 500. contactMessages: status in (New,Read); 500. featureRequests: gym_id eq; 500. progressLogs: gym_id eq; 1000. myProgressLogs: auth_uid eq. plans: gym_id eq; 1000. dietPlans/workoutPlans: gym_id eq; 1000 (+ assigned-scoped variants). gyms: none; 500. subscriptions: none; 500. whatsappLogs: gym_id eq, created_at desc; 300.

## 7. Error Contract (Step 10) — `mapSupabaseError(err)`

| Supabase/PostgREST signal | `.code` |
|---|---|
| 42501 / 42502 / 42504 / permission denied | `permission-denied` |
| 23505 / unique violation | `already-exists` |
| PGRST116 / 404 / not found | `not-found` |
| network / fetch failed / timeout | `unavailable` |
| 22P02 / 22007 / 23514 / invalid enum / check violation | `invalid-argument` |
| 23503 / foreign key violation | `foreign-key-violation` |
| else | message preserved (P0001 business raises keep text) |

## 8. Null/Type Semantics (Step 11)

- timestamptz → ISO 8601 strings (JS `new Date()` compatible); `date` → `YYYY-MM-DD`.
- `numeric` → PostgREST returns STRINGS → `coerceNumeric(row, cols)` converts to Number (plan price, member weight, payment amounts, progress metrics).
- `int` → numbers natively. `jsonb` → parsed objects/arrays (meals, exercises, versions, audience, schedule, stats, settings data, gym documents/subscription).
- nulls preserved; empty strings from Firestore → `null` for nullable columns (except `name not null` fields).
- INSERT/UPDATE use whitelisted column maps — unknown Firestore fields are dropped (documented per function; PostgREST errors on unknown columns).

## 9. Known RLS-Driven Differences (documented, NOT schema changes)

1. **subscriptions + subscription_history + plan_templates + payment_attempts: super-admin-only writes** (RLS insert/update/delete = super). gym_admin subscription lifecycle / plan-template saves → `permission-denied` (Firestore allowed staff). UI for these is superadmin-facing; AppContext gates unchanged.
2. **gyms update = super-only** — gym_admin cannot patch the gym doc (Firestore allowed); subscription mirror writes by gym_admin fail (errors surface via mapper).
3. **notifications: no delete policy** — deleteMember cannot clean member notifications (Firestore could).
4. **settings: staff-only read/write** (gym-scoped) — members cannot read referralSettings (Firestore rules allowed).
5. **support_tickets: no member-select policy** — member ticket lists read denied; insert works.
6. **contact_messages: super-only read/update** (staff cannot read messages; Firestore allowed staff).
7. **Staff account creation (Step 8)**: `addMember`/`addTrainer` create rows with `auth_uid = null`; NO auth account, NO temporary password, NO referral-code generation client-side (`referralCodes` owner-code-match policy + users-doc model don't exist client-side). Temp-password display in TrainerModal shows null. Member login for supabase-created members requires the secure backend boundary (documented).
8. **Field drops** (no columns): member `trainerName`; payment `paidOn`; subscription `originalAmount/discountAmount/discountType/discountValue/finalAmount/autoRenew/daysRemaining/isLifetime/graceEndDate/startDate(present as started_at)/expiryDate(present as expiry_date)`; plans duration is INT MINUTES (imported) — UI string conversion handled by row mapper (`minutesToDurationString`), round-trip via `duration_days`.
9. **Delete cascade superset**: deleting gyms/members/trainers cascades children DB-wide (better than Firestore's manual cleanup).
10. **No Firestore `users/{uid}` docs / `referralCodes` client writes / `deleteAuthUser` httpsCallable** in supabase mode (BACKEND_ONLY).
