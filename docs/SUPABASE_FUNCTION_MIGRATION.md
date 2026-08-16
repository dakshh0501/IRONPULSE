# SUPABASE FUNCTION MIGRATION — Classification & Design

**Step 8G · Phase 1 · Scope**: migrate all 10 Firebase Cloud Functions in
`functions/index.js` (2,301 lines) to a Supabase-native backend
(Edge Functions + SQL RPCs + a DB trigger). No secrets move to the frontend.
Firebase Functions stay deployed until each replacement is validated.

---

## 1. Inventory — all 10 exports

| # | Export | Kind | Location | Callers | Secrets | Status/Class |
|---|--------|------|----------|---------|---------|--------------|
| 1 | `createPayment` | onCall | 1082 | paymentService.js (PhonePe `initiatePayment`) | PHONEPE_MERCHANT_ID/SALT_KEY/SALT_INDEX | **A — PhonePe Edge Function `phonepe-pay`** |
| 2 | `verifyPayment` | onCall | 1309 | paymentService.js (`refreshPaymentStatus`) | same | **A — Edge `phonepe-verify`** |
| 3 | `phonePeCallback` | onRequest (webhook) | 1425 | PhonePe server → HTTPS | same | **B — Edge `phonepe-callback`** |
| 4 | `createCashfreeOrder` | onCall | 1579 | cashfreeService.js | CASHFREE_CLIENT_ID/SECRET/MODE | **A — Edge `cashfree-order`** |
| 5 | `verifyCashfreePayment` | onCall | 1798 | cashfreeService.js (`verifyCashfreePayment`) | same | **A — Edge `cashfree-verify`** |
| 6 | `cashfreeWebhook` | onRequest (webhook) | 1903 | Cashfree server → HTTPS | same | **B — Edge `cashfree-webhook`** |
| 7 | `backfillMissingProfiles` | onCall | 2082 | (no client caller — manual/admin) | — | **C — RPC `backfill_profiles`** |
| 8 | `deleteAuthUser` | onCall | 2212 | authService.js:969, firestoreService.js:549/865 (gym cascade delete) | — | **C — RPC `delete_auth_user`** |
| 9 | `getSecurityMetrics` | onCall | 2246 | (no client caller in src — Security page unused) | — | **C — RPC `get_security_metrics`** |
| 10 | `onReferralSignup` | onDocumentCreated(users/{uid}) | 732 | Firebase Auth user creation (Sprint 81A; superseded client-side by 81A-Spark) | — | **D — DB trigger on `profiles` INSERT** |

**Class legend**:
- **A** — Callable payment functions → Edge Functions (user JWT, role checks,
  provider API calls, attempt persistence, then shared atomic RPC).
- **B** — Provider webhooks → Edge Functions (no JWT; signature/HMAC verified
  with secrets; always 200-ack; fail-closed).
- **C** — Internal admin utilities → security-definer SQL RPCs (super-admin
  gate; no HTTP surface at all).
- **D** — Firestore-triggered referral creation → PostgreSQL `AFTER INSERT`
  trigger (referral data already lives in Postgres; atomic with the insert).
- **E** — **Legacy/obsolete — NOT ported**: `issueReferralReward` (see §6).

---

## 2. Per-function classification detail

### A1. `createPayment` → Edge Function `phonepe-pay`
- **Behavior preserved**: auth required; validate `finalAmount>0`, 10-digit
  phone, `redirectUrl`, `subscriptionId` for renewal/upgrade, `gymId`,
  optional `callbackUrl` http(s); role ∈ {super_admin, gym_admin, gym_owner,
  admin}; non-super must have `profile.gym_id == gymId`; config from secrets
  (merchantId/saltKey/saltIndex); pending-attempt idempotency (existing
  pending for `subscriptionId` → return it); generate `merchantTransactionId`
  (`IP{ts36}{6hex}`, ≤35); payload V1 (PAY_PAGE, paise amount, callbackUrl);
  checksum `sha256(base64+"/pg/v1/pay"+saltKey)+"###"+saltIndex`; save
  attempt `pending` + 30-min `expiresAt`; POST `/pg/v1/pay` with X-VERIFY +
  X-MERCHANT-ID; success → save redirectUrl/transactionId/phonePeState;
  failure → status `failed` + errorMessage; return `{attemptId,
  redirectUrl, error}`.
- **Supabase mapping**: JWT via `auth.getUser` → profile via service-role
  `profiles.select().eq('id', userId)`; attempts persisted in
  `payment_attempts` (service role; new `merchant_transaction_id` column —
  see 0006). Caller UID stored in `auth_uid` (profile `firebase_uid`).
- **Secrets (Deno.env)**: PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY,
  PHONEPE_SALT_INDEX. Verify JWT at gateway (default).

### A2. `verifyPayment` → Edge Function `phonepe-verify`
- **Behavior preserved**: auth; role ∈ {super_admin, gym_admin, gym_owner,
  admin, trainer}; `attemptId` required; attempt missing → error; status
  ≠ pending → short-circuit `{status}`; 30-min expiry → `cancelled`;
  cross-gym check (non-super caller gym vs attempt gym); status checksum
  `sha256("/pg/v1/status/"+mid+"/"+mtx+saltKey)+"###"+saltIndex`; GET status
  endpoint; map state (COMPLETED/PAYMENT_SUCCESS→success,
  FAILED/PAYMENT_FAILED→failed, EXPIRED→cancelled, PENDING→pending);
  update attempt; on success → **shared fulfillment**.
- **Supabase mapping**: attempts by `id` (uuid); webhook/verify race resolved
  by the atomic `fulfill_payment` RPC (row lock on the attempt).

### B1. `phonePeCallback` → Edge Function `phonepe-callback` (HTTP webhook)
- **Behavior preserved**: POST-only (405); body `{response}` base64 →
  JSON; missing merchantTransactionId → 200 no-op; config missing → 200;
  X-VERIFY `hash###idx` recomputed over
  `decodedJson+"/pg/v1/status/"+mid+"/"+mtx+saltKey`; mismatch → 200 no-op;
  attempt lookup by `merchant_transaction_id`; amount equality (paise);
  expiry → cancelled; status ≠ pending → 200 idempotent; state map; update;
  on success → shared fulfillment; **always 200** (never leak/reject).
- **Supabase mapping**: `x-verify` header; lookup by
  `merchant_transaction_id`; same state map; `fulfill_payment` RPC.
- **Deploy**: `--no-verify-jwt` (provider has no JWT).

### A3/A4. `createCashfreeOrder` / `verifyCashfreePayment` → Edge `cashfree-order` / `cashfree-verify`
- **Behavior preserved** (exact mirrors of A1/A2): Cashfree config from
  secrets (clientId, clientSecret, mode sandbox/production →
  baseUrl); orderId `CF-{ts36}-{8hex}` ≤50; order_amount rupees
  (`finalAmount/100`); return_url embeds real attemptId + `{order_id}`;
  attempt saved with cashfreeOrderId/orderStatus INITIALIZED; pending
  idempotency returns existing paymentSessionId+orderId; Orders API headers
  x-client-id/x-client-secret/x-api-version 2023-08-01; verify maps
  order_status (PAID/SUCCESS→success, ACTIVE/PENDING/INITIALIZED→pending,
  CANCELLED/USER_DROPPED→cancelled, FAILED/EXPIRED→failed);
  transaction id = `payment.payment_id`.
- **Supabase mapping**: identical tables; `fulfill_payment` RPC shared.

### B2. `cashfreeWebhook` → Edge Function `cashfree-webhook` (HTTP webhook)
- **Behavior preserved**: POST-only; config required; `x-webhook-signature`
  + `x-webhook-timestamp` required; replay guard |now−ts| ≤ 5 min; raw
  body required; HMAC `base64(HMAC-SHA256(clientSecret, ts+rawBody))`
  byte-exact over wire bytes + timing-safe compare; invalid → 200 no-op;
  v2 payload `body.data` base64 → JSON; order_id → attempt lookup by
  `cashfree_order_id`; amount rupees vs `finalAmount/100`; expiry;
  status ≠ pending idempotent; payment_status map; update; fulfill; 200.
- **Supabase mapping**: `request.rawBody` equivalent — Supabase webhook edge
  functions receive the raw text body; parse JSON from the raw string
  **before** any re-serialization; HMAC over `ts + rawBytes`.
- **Deploy**: `--no-verify-jwt`.

### C1. `backfillMissingProfiles` → RPC `backfill_profiles()`
- **Behavior preserved**: super-admin-only gate; for every `auth.users`
  row without a `profiles` row, recover role/gym from `members`
  (auth_uid), `trainers` (auth_uid), `gyms` (owner_uid), else skip
  (admins never auto-recovered); returns `{backfilled, skipped, errors}`.
- **Supabase mapping**: one security-definer function, super gate via
  `is_super_admin(auth.uid())`, `for loop over auth.users`; insert
  profiles (id=auth.users.id, firebase_uid=matched legacy uid or
  id::text fallback with role 'pending').

### C2. `deleteAuthUser` → RPC `delete_auth_user(p_uid text)`
- **Behavior preserved**: super-admin gate (`admin` role + isSuperAdmin);
  `uid` required; delete auth user; not-found → success (idempotent);
  returns `{success, error}`.
- **Supabase mapping**: accepts uuid or legacy firebase_uid text
  (resolve via profiles.firebase_uid → auth.users.id); `delete from
  auth.users` (cascades profiles).

### C3. `getSecurityMetrics` → RPC `get_security_metrics()`
- **Behavior preserved**: super-admin gate; counts: gyms, users,
  active subscriptions (subscription.status=active), active licenses
  (subscription.licenseStatus=active), devices, auth users;
  platformStatus 'operational'.
- **Supabase mapping**: single SELECT with subqueries (gyms jsonb
  operators for licenseStatus).

### D1. `onReferralSignup` → DB trigger `handle_referral_signup()`
- **Behavior preserved** (Firestore version): on `users/{uid}` create —
  valid `referredBy` format; resolve referrer by referralCode; skip
  self-referral; skip gym_owner(_pending) roles; idempotent (doc key =
  referred uid); write referral Pending + 2 notifications
  (`referral_registered` to referrer, `referral_applied` to referred) +
  audit entry.
- **Supabase mapping**: `AFTER INSERT ON profiles` — `referred_by`
  (already uppercase, format-constrained); resolve referrer by
  `referral_code` (unique index) or `referral_codes` directory; skip if
  `new.role` in (gym_owner, gym_owner_pending); self-referral skip;
  `insert into referrals (referred_uid, ...) on conflict (referred_uid)
  do nothing`; if inserted → notifications (user_id =
  firebase_uid; gym_id null-safe) + referral_audit_logs. Atomic with
  the profile insert (same transaction). The 81A-Spark client-side
  `processPendingReferral` remains as a convergence fallback — its
  existence probe sees the trigger-created row and skips.

---

## 3. Shared fulfillment — atomic RPC `fulfill_payment` (Phase 7)

Replaces `fulfillSubscriptionPayment` + `createPaymentRecordInTransaction`
+ `notifyPaymentSuccess` with **one security-definer RPC** run inside a
single transaction:

1. `SELECT ... FOR UPDATE` on `payment_attempts` by id → not found → error;
   status ≠ pending → `{already:true}` (webhook/verify race: second caller
   short-circuits — no double fulfillment, no double invoice).
2. `payments` upsert keyed by `payment_id` (ON CONFLICT DO NOTHING):
   invoice `INV-{YYYYMMDD}-{4hex}` (unique), amount/paid rupees
   (`final_amount/100`), status 'Paid', method/gateway from attempt,
   member_name = gym name (lookup `gyms`), date/due = current_date,
   transaction_id.
3. `subscriptions` update (by `subscription_id::uuid`): payment_status
   'paid', payment_method, transaction_id, paid_at, status 'active';
   **renewal** → dates already pre-set by client (mark only);
   **upgrade** → apply `attempt.plan`, recompute `expiry_date` from
   max(now, current expiry) + plan duration (PLAN_DURATIONS map),
   amount = rupees;
   **new** → activate only.
4. `gyms.subscription` jsonb merge: planId/planName/planType/status
   'active'/paymentStatus 'paid'/startDate/expiryDate/amount rupees/
   currency INR/renewalCount +1 on renewal/lastPaymentId/
   lastTransactionId/updatedAt.
5. `subscription_history` insert (action renewed/upgraded/activated,
   changes jsonb snapshot).
6. `notifications`: `sub_payment_success` high → gym admins/owners
   (`profiles` role ∈ admin/gym_admin/gym_owner AND gym_id = attempt.gym)
   + low → super admins (gym_id NULL — FK-safe; legacy 'platform' string
   cannot exist in `gyms`); deduped by the attempt row lock (only the
   winning caller inserts).
7. Returns `{ok, status, paymentId, invoiceNo, transactionId}`.

Edge functions (verify + webhooks, both gateways) call this RPC with the
service role — no per-gateway fulfillment duplication (parity with the
legacy shared choke point).

---

## 4. Client wiring (dual-provider, same fold pattern as 8E/8F)

| Client site | Firebase (rollback) | Supabase (active) |
|-------------|--------------------|-------------------|
| `paymentService.initiatePayment` | httpsCallable `createPayment` | `supabase.functions.invoke('phonepe-pay', {body})` |
| `paymentService.refreshPaymentStatus` | httpsCallable `verifyPayment` | `invoke('phonepe-verify', {body:{attemptId}})` |
| `cashfreeService.createCashfreeOrder` | httpsCallable | `invoke('cashfree-order', {body})` |
| `cashfreeService.verifyCashfreePayment` | httpsCallable | `invoke('cashfree-verify', {body:{attemptId}})` |
| `firestoreService` deleteAuthUser (×2) | httpsCallable | `supabase.rpc('delete_auth_user', {p_uid})` |
| `authService` deleteAuthUser | httpsCallable | `supabase.rpc('delete_auth_user', {p_uid})` |

`getPaymentAttempt` client read stays (documented 8E exception —
function-owned data, read-only). Client writes to `payment_attempts`
remain THROWING ("Cloud-Function-owned"). No `backfill_profiles` /
`get_security_metrics` client wiring (no callers today).

---

## 5. Firestore functions retained (rollback window)

All 10 Firebase Functions remain deployed until cutover. During the
rollback window `VITE_AUTH_PROVIDER=firebase` continues to use them
verbatim. The migration adds new Supabase surface; it never deletes or
disables the Firebase surface. Decommissioning is a separate,
explicitly-instructed step after production validation.

---

## 6. Dead code — `issueReferralReward` (NOT ported)

```js
// functions/index.js:355
if (!attempt.subscriptionId || attempt.gymId) return
```

`createPayment`/`createCashfreeOrder` **require** `gymId` (validation error
`'gymId is required'`), so `attempt.gymId` is ALWAYS truthy for every
attempt the system creates → `issueReferralReward` early-returns on every
possible call path. It is dead code in production; the membership-payment
referral path it was built for does not exist (only gym platform
subscriptions are paid via PhonePe/Cashfree). Classified **E** and
excluded from the migration. Referral qualification/rewarding is instead
admin-driven via the existing `update_referral_status` RPC (8E).

---

## 7. Schema deltas required (0006_rpc.sql)

```sql
alter table payment_attempts
  add column merchant_transaction_id text,
  add column phonepe_state         text,
  add column response_code         text,
  add column callback_amount       numeric(12,2);
```
(nullable — no backfill needed; only new server-side writes populate them)

Plus the RPCs: `fulfill_payment`, `backfill_profiles`, `delete_auth_user`,
`get_security_metrics`, the trigger `handle_referral_signup`, and
`bump`-free helper `plan_duration_membership(text)` (PLAN_DURATIONS port).

---

## 8. Deployment notes

- Edge Functions: `supabase functions deploy phonepe-pay phonepe-verify
  cashfree-order cashfree-verify` (verify_jwt on) and
  `--no-verify-jwt` for `phonepe-callback cashfree-webhook`.
- Secrets: `supabase secrets set PHONEPE_MERCHANT_ID=... PHONEPE_SALT_KEY=...
  PHONEPE_SALT_INDEX=... CASHFREE_CLIENT_ID=... CASHFREE_CLIENT_SECRET=...
  CASHFREE_MODE=sandbox` (values never in repo — see
  SUPABASE_FUNCTIONS_SECRETS.md).
- DB: `supabase db push` (0006).
- **Provider configs (production URLs) are NOT changed by this sprint** —
  PhonePe callback / Cashfree webhook URLs keep pointing at the Firebase
  Functions until the Edge Functions are validated and an explicit cutover
  is authorized.
