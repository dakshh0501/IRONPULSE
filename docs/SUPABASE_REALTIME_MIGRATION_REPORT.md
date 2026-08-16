# SUPABASE REALTIME MIGRATION REPORT (Step 8D)

Migrates every remaining Firestore realtime listener to Supabase Realtime.
Client-only change — no schema/RLS/functions changes.

## Scope

- New shared adapter `src/services/realtimeService.js` (Firestore-style snapshot
  semantics over postgres_changes).
- 23 subscribe functions migrated across 9 services; 1 direct `onSnapshot` in
  AppContext replaced by a new `subscribeToRoleNotifications` service export.
- Firebase branches fully preserved (rollback via `VITE_AUTH_PROVIDER=firebase`).

## Adapter design (race-safe, RLS-gated)

`subscribeRealtime({ table, filter, orderBy, limit, mapRow, sortFn, keyFn, onChange, onError, label })`

- Full-array snapshot semantics: `onChange` fires with the complete ordered,
  filtered set after every change (initial + INSERT/UPDATE/DELETE).
- Race safety: initial SELECT → emit → channel subscribe. On `SUBSCRIBED` a
  reconcile SELECT replaces rows, then buffered events replay idempotently
  (upsert by key) before going live. Every re-`SUBSCRIBED` (reconnect) resyncs,
  so missed events are never lost.
- postgres_changes has no server-side filter (DELETE events cannot be filtered
  without replica identity full) — RLS is the server gate; every event row is
  re-checked client-side against the subscription filter. `eq null/''`
  constraints are dropped so the initial SELECT and the event filter agree
  (matches Step 8C `sbInitialLoad` parity — required by `statusFilter`
  optionals).
- Registry dedupes identical subscriptions (table+filter+order+limit) into one
  channel with a refcounted unsubscribe — StrictMode double-effect safe.
- Channel `CHANNEL_ERROR`/`TIMED_OUT` surface via `onError` (translated to
  Firebase-style codes, matching `mapSupabaseError`: permission-denied,
  already-exists, not-found, unavailable, invalid-argument,
  foreign-key-violation).

## Migrations

| Service | Functions | Supabase table / filter / order / limit |
|---|---|---|
| firestoreService | 21 (members ×3, payments ×2, trainers, support_tickets, contact_messages, feature_requests, progress_logs ×2, plans, diet_plans ×3, workout_plans ×3, gyms, subscriptions, whatsapp_logs) | 1:1 column mapping; limits 300–5000 match Firebase |
| attendanceService | subscribeAttendance, subscribeMyTrainerAttendance, subscribeMyAttendance | attendance; date ≥ 90d + gym_id (+ trainer_auth_uid / auth_uid); date desc + client sortFn; 5000 |
| notificationService | subscribeToNotifications, subscribeToRoleNotifications (NEW) | notifications; user_id+gym_id / target_role; created_at desc + sortFn; 50 |
| paymentService | subscribeToPaymentAttempts | payment_attempts; gym_id; 500 |
| subscriptionService | subscribeToGymSubscription (single doc → callback(subscription jsonb or null)), subscribeToSubscriptionHistory | gyms id-eq limit 1 / subscription_history gym_id created_at desc 200 |
| deviceService | subscribeToDevices (optional status filter), subscribeToAllDevices | licensed_devices; gym_id (+status); 500 / 5000 |
| licenseHistoryService | subscribeToLicenseHistory, subscribeToAllLicenseHistory | license_history; created_at desc; 1000 |
| reportService | subscribeToGeneratedReports | generated_reports; gym_id; created_at desc; 50 |
| referralService | subscribeToReferralSettings (settings gym_id='platform' + doc_id, composite key, data jsonb), subscribeToMy/Gym/AllReferrals, subscribeToRewardLedger ×2, subscribeToDiscountCoupons ×2 | 500/1000; created_at/issued_at desc |
| ai/conversationService | subscribeToConversations (user_id + deleted=false, updated_at desc, pageSize), subscribeConversationMessages (conversation_id, created_at asc, 500) | ai_conversations / ai_conversation_messages |
| AppContext | super_admin role-notification listener → subscribeToRoleNotifications | direct onSnapshot removed; onSnapshot/query/where/collection/orderBy/limit imports dropped |

## RLS notes & behavior deltas

- RLS remains the server-side gate for events (per-subscriber visibility).
- UPDATE events whose NEW row is RLS-invisible (e.g. gym move) deliver no event
  — the stale row clears on the next reconcile (reconnect). Filter-violating
  updates that stay RLS-visible (e.g. status change) are removed client-side.
- Members get `null` from `subscribeToReferralSettings` (staff-only read) —
  pre-existing Step 8C boundary.
- `subscribeToGymSubscription` now emits `null` for a missing gym doc (Firebase
  kept stale data) — documented improvement.

## Verification

- **Build**: `npm run build` 0 errors, 0 warnings.
- **ESLint**: 0 NEW findings on all 12 changed files (remaining = documented
  pre-existing baselines: firestoreService 7 legacy-branch, referralService 2,
  AppContext 2, all untouched by this step).
- **Step 8C suite** (`Temp\opencode\s8c`, real bundled service + rules-enforcing
  shim): **101/101** — T02 updated (REALTIME_PENDING warn removed → realtime
  initial fetch + live INSERT), T24 unsub added, T32 rewritten to
  unsubscribe-stops-callbacks; all other 98 checks unchanged and green.
- **Step 8D suite** (`Temp\opencode\s8d`, real adapter + firestoreService +
  notification/subscription/referral services): **31/31** — initial snapshot,
  INSERT/UPDATE/DELETE, desc order + limit, RLS cross-gym gating, eq-null
  constraint drop, registry dedup + refcount, filter-violating UPDATE removal,
  buffering + reconcile idempotency (delayed SELECT hook), CHANNEL_ERROR /
  TIMED_OUT → onError, reconnect catch-up, service-level end-to-end
  (subscribeToMembers, subscribeToMyMember own-row, role notifications,
  single-doc gym subscription jsonb, referral settings RLS, subscription
  history, whatsapp logs), unsubscribe stops delivery, registry empty at end.

## Bugs found & fixed during the step

1. `subscribeToRoleNotifications` mode branches were INVERTED (Firebase branch
   ran in supabase mode) — swapped.
2. `notifSubscribe` error path dropped `callback([])` when `onError` was passed
   (Firebase always emits [] on error) — aligned.
3. Adapter passed raw PostgREST errors (code `42501`) to `onError` — added
   `mapRtError` translation so UI checks (`e.code === 'permission-denied'`)
   keep working.

## Deployment & risks

- Client-only: `firebase deploy --only hosting` (or Vercel) — no migrations,
  no functions.
- Requires Supabase **Realtime** enabled (public schema). `postgres_changes`
  events carry the full NEW row — `DELETE` events carry only the primary key
  (works: keyFn defaults to `id`; settings uses its composite PK; a DELETE
  without an extractable key triggers a debounced refetch).
- Channel count: 1 per distinct (table+filter+order+limit) — gym pages with
  many members each get 1; members get their own-scope channels.
- Realtime is connection-based; when the browser is closed there is no
  delivery (client-side app — same as Firestore onSnapshot).
- Not migrated (pre-existing Step 8C gaps, out of scope): CRUD/one-shot reads
  remain Firebase-bound in supabase mode, `loadMoreNotifications`,
  `loadMoreConversations`, attendance/notifications WRITE paths
  (`addAttendanceToFirestore`, `addNotifToFirestore`), Storage, Cloud
  Functions, payment webhooks.