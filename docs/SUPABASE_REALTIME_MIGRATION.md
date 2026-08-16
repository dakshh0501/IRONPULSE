# SUPABASE REALTIME MIGRATION (Step 8D) — Inventory

Migrates every remaining Firestore realtime listener to Supabase Realtime via
the shared adapter `src/services/realtimeService.js`. UI behavior, RLS
boundaries, and the Firebase rollback path (`VITE_AUTH_PROVIDER=firebase`)
are preserved.

## Mode switch

`IS_FIREBASE_MODE = (import.meta.env.VITE_AUTH_PROVIDER || 'supabase') === 'firebase'`

Same foldable constant as Step 8C — Vite inlines the env reference and esbuild
dead-code-eliminates the unused provider branches. All services below define
their own copy.

## The adapter (`src/services/realtimeService.js`)

`subscribeRealtime({ table, filter, orderBy, limit, mapRow, sortFn, keyFn, onChange, onError, label })`

- **Firestore-style snapshots**: `onChange(fullArray)` fires with the complete
  ordered/filtered set after every change (initial + INSERT/UPDATE/DELETE).
- **Race safety**: initial SELECT → emit → channel subscribe. On `SUBSCRIBED`
  a reconcile SELECT replaces the rows, then buffered events replay
  idempotently (upsert by key) before streaming live.
- **No server-side filter**: postgres_changes has no filter param (DELETE
  events can't be filtered without replica identity full). RLS is the server
  gate; every event row is re-checked client-side against the subscription
  filter. DELETE removes by key (`old.id`); missing id → full refetch.
- **Dedup registry**: identical `table|filter|order|limit` subscriptions share
  one channel (StrictMode double-effect safe); refcounted unsubscribe.
- **Reconnect**: supabase-js re-joins automatically; every `SUBSCRIBED` runs a
  reconcile so missed events are never lost. `CHANNEL_ERROR`/`TIMED_OUT` →
  `onError`.
- Filter ops: `[col, val]` = eq (null/'' → no constraint), `[col, [..]]` = in,
  `[col, op, val]` with op in `eq|in|gte|gt|lte|lt`.

## Listener inventory (41 subscriptions)

| # | Source | Function | Table | Supabase filter | Order | Limit | Note |
|---|--------|----------|-------|-----------------|-------|-------|------|
| 1 | firestoreService | subscribeToMyMembers | members | trainer_auth_uid, gym_id | – | 2000 | trainer scope |
| 2 | firestoreService | subscribeToMembers | members | gym_id | – | 2000 | |
| 3 | firestoreService | subscribeToMyMember | members | auth_uid | – | 2000 | |
| 4 | firestoreService | subscribeToMyPayments | payments | auth_uid, gym_id | – | 2000 | |
| 5 | firestoreService | subscribeToPayments | payments | gym_id | – | 2000 | |
| 6 | firestoreService | subscribeToTrainers | trainers | gym_id | – | 500 | |
| 7 | firestoreService | subscribeToSupportTickets | support_tickets | gym_id | – | 500 | |
| 8 | firestoreService | subscribeToContactMessages | contact_messages | status in (New,Read) | – | 500 | |
| 9 | firestoreService | subscribeToFeatureRequests | feature_requests | gym_id | – | 500 | |
| 10 | firestoreService | subscribeToProgressLogs | progress_logs | gym_id | – | 1000 | |
| 11 | firestoreService | subscribeToMyProgressLogs | progress_logs | auth_uid | – | 500 | |
| 12 | firestoreService | subscribeToPlans | plans | gym_id | – | 1000 | |
| 13 | firestoreService | subscribeToDietPlans | diet_plans | gym_id | – | 1000 | |
| 14 | firestoreService | subscribeToMyAssignedDietPlans | diet_plans | auth_uid, gym_id | – | 500 | member scope |
| 15 | firestoreService | subscribeToMyDietPlans | diet_plans | assigned_trainer_auth_uid, gym_id | – | 500 | trainer scope |
| 16 | firestoreService | subscribeToWorkoutPlans | workout_plans | gym_id | – | 1000 | |
| 17 | firestoreService | subscribeToMyAssignedWorkoutPlans | workout_plans | auth_uid, gym_id | – | 500 | member scope |
| 18 | firestoreService | subscribeToMyWorkoutPlans | workout_plans | trainer_auth_uid, gym_id | – | 500 | trainer scope |
| 19 | firestoreService | subscribeToGyms | gyms | (none) | – | 500 | super admin |
| 20 | firestoreService | subscribeToSubscriptions | subscriptions | (none) | – | 500 | super admin |
| 21 | firestoreService | subscribeToWhatsappLogs | whatsapp_logs | gym_id | created_at desc | 300 | |
| 22 | attendanceService | subscribeAttendance | attendance | date gte 90d, gym_id | date desc (client sortFn) | 5000 | |
| 23 | attendanceService | subscribeMyTrainerAttendance | attendance | date gte, gym_id, trainer_auth_uid | date desc | 5000 | |
| 24 | attendanceService | subscribeMyAttendance | attendance | date gte, gym_id, auth_uid | date desc | 5000 | Firebase used memberId == uid (auth uid); supabase uses auth_uid column |
| 25 | notificationService | subscribeToNotifications | notifications | user_id, gym_id | created_at desc + client sortFn | 50 | |
| 26 | notificationService | subscribeToRoleNotifications (NEW) | notifications | target_role | created_at desc + client sortFn | 50 | replaces AppContext direct onSnapshot |
| 27 | paymentService | subscribeToPaymentAttempts | payment_attempts | gym_id | – | 500 | |
| 28 | subscriptionService | subscribeToGymSubscription | gyms | id eq gymId | – | 1 | single doc → callback(subscription jsonb or null) |
| 29 | subscriptionService | subscribeToSubscriptionHistory | subscription_history | gym_id | created_at desc | 200 | |
| 30 | deviceService | subscribeToDevices | licensed_devices | gym_id, status (optional) | – | 500 | |
| 31 | deviceService | subscribeToAllDevices | licensed_devices | (none) | – | 5000 | |
| 32 | licenseHistoryService | subscribeToLicenseHistory | license_history | gym_id | created_at desc | 1000 | |
| 33 | licenseHistoryService | subscribeToAllLicenseHistory | license_history | (none) | created_at desc | 1000 | |
| 34 | reportService | subscribeToGeneratedReports | generated_reports | gym_id | created_at desc | 50 | |
| 35 | referralService | subscribeToReferralSettings | settings | gym_id='platform', doc_id='referralSettings' | – | 1 | keyFn composite (gym_id:doc_id); callback(data jsonb) |
| 36 | referralService | subscribeToMyReferrals | referrals | referrer_uid | created_at desc | 500 | |
| 37 | referralService | subscribeToGymReferrals | referrals | gym_id | created_at desc | 500 | |
| 38 | referralService | subscribeToAllReferrals | referrals | (none) | created_at desc | 1000 | super admin |
| 39 | referralService | subscribeToRewardLedger | reward_ledger | referrer_uid | issued_at desc | 500 | |
| 40 | referralService | subscribeToGymRewardLedger | reward_ledger | gym_id | issued_at desc | 500 | |
| 41 | referralService | subscribeToMyDiscountCoupons | discount_coupons | user_id | created_at desc | 500 | |
| 42 | referralService | subscribeToGymDiscountCoupons | discount_coupons | gym_id | created_at desc | 500 | |
| 43 | ai/conversationService | subscribeToConversations | ai_conversations | user_id, deleted eq false | updated_at desc | 30 (pageSize) | |
| 44 | ai/conversationService | subscribeConversationMessages | ai_conversation_messages | conversation_id | created_at asc | 500 | |

## Key column mappings (supabase row → Firestore shape)

- **members**: id, legacy_id, auth_uid, gym_id, name, email, phone, plan,
  trainer_id, trainer_auth_uid, status, checkins, amount_paid, amount_due,
  membership_start, membership_expiry, join_date, notes, avatar, color,
  created_at, updated_at (see `mapMemberRow`).
- **attendance**: member_id → memberId, auth_uid → authUid, member_name,
  trainer_auth_uid → trainerAuthUid, date, time, method, duration.
- **notifications**: user_id → userId, action_url → actionUrl,
  related_document_id → relatedDocumentId, target_role → targetRole.
- **payment_attempts**: payment_id → paymentId, redirect_url → redirectUrl,
  phonepe_transaction_id → phonePeTransactionId, order_status → orderStatus,
  cashfree_order_id → cashfreeOrderId, payment_session_id → paymentSessionId,
  expires_at → expiresAt, invoice_no → invoiceNo, error_message → errorMessage.
- **referrals**: PK = referred_uid → id (deterministic key), referrer_uid,
  referral_code, reward_issued → rewardIssued, qualified_at → qualifiedAt.
- **ai_conversations**: user_id → userId, last_message → lastMessage,
  message_count → messageCount, updated_at → updatedAt.
- **ai_conversation_messages**: conversation_id → conversationId.

## RLS notes

- RLS remains the server-side gate: postgres_changes events are authorized per
  subscriber (settings staff-only read, member self-scope, gym tenancy, etc.).
- `subscribeToReferralSettings` for members returns `null` (RLS staff-only) —
  pre-existing Step 8C boundary, unchanged.
- `referrals` read rule includes the `referralId == request.auth.uid`
  path-wildcard probe (Sprint 81H) — no client change needed.

## Not migrated (documented limitations)

- `loadMoreNotifications`, `loadMoreConversations`, all CRUD, one-shot reads,
  attendance/notifications writes, `backfill*` — Firebase-bound in supabase
  mode (pre-existing Step 8C gap; NOT realtime, out of 8D scope).
- Storage, Cloud Functions (`deleteAuthUser`), payment webhooks — untouched.
- No schema/RLS/functions changes in this step; client-only deployment.