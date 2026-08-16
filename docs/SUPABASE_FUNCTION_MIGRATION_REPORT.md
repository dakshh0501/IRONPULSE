# Supabase Function Migration Report — Step 8G

**Status: COMPLETE** — build 0 errors/0 warnings, eslint 0 NEW, smoke 77/77, regressions s8c 101/101, s8e 73/73, s8f 35/35.

## 1. Scope

All 10 Cloud Functions in `functions/index.js` are now available as Supabase-native backends. Firebase Functions are **retained unchanged** as an explicit rollback window; nothing is removed until cutover is validated.

| Legacy Cloud Function | Supabase replacement | Type | Deploy flag |
|---|---|---|---|
| `createPayment` | `phonepe-pay` Edge Function | callable | default (verify_jwt) |
| `verifyPayment` | `phonepe-verify` Edge Function | callable | default (verify_jwt) |
| `phonePeCallback` | `phonepe-callback` Edge Function | webhook | `--no-verify-jwt` |
| `createCashfreeOrder` | `cashfree-order` Edge Function | callable | default (verify_jwt) |
| `verifyCashfreePayment` | `cashfree-verify` Edge Function | callable | default (verify_jwt) |
| `cashfreeWebhook` | `cashfree-webhook` Edge Function | webhook | `--no-verify-jwt` |
| `deleteAuthUser` | `delete_auth_user(text)` RPC | security definer | — |
| `getSecurityMetrics` | `get_security_metrics()` RPC | security definer | — |
| `backfillMissingProfiles` | `backfill_profiles()` RPC | security definer | — |
| `onReferralSignup` | `handle_referral_signup()` DB trigger | AFTER INSERT on profiles | — |
| `issueReferralReward` | **not ported — dead code** | class E | — |

`issueReferralReward` is unreachable in the legacy codebase: both `createPayment` and `createCashfreeOrder` require a `gymId` (edge/legacy validation), and the function's first line returns early when `!attempt.subscriptionId || attempt.gymId` — i.e. it always early-returns.

## 2. What was built

### Edge Functions (`supabase/functions/`)
- **`_shared/helpers.ts`** — `json`, `sha256Hex`, `bytesToBase64`, `base64ToString`, `hmacSha256Base64`, `timingSafeEqualStr`, `randomHex`, `generateMerchantTransactionId` (CF-… / PhonePe format, ≤35 chars), `generateCashfreeOrderId`, `generatePaymentId` (`IP-<ts36>-<hex>`), `loadPhonePeConfig`/`validatePhonePeConfig`, `phonePeChecksum`/`phonePeStatusChecksum`/`phonePeCallbackChecksum`, `getPhonePeApiEndpoint` (PGTEST → sandbox), `mapPhonePeState`, `loadCashfreeConfig` (CASHFREE_MODE default sandbox), `cashfreeHeaders`, `mapCashfreeOrderStatus`.
- **`_shared/supabase.ts` / `db.ts` / `auth.ts`** — client factories (service role via `SUPABASE_SERVICE_ROLE_KEY`, user client via caller JWT) and `authenticateCaller` / `isPaymentInitiator` (super_admin, gym_admin, gym_owner, admin) / `isPaymentViewer` (+ trainer).
- **`phonepe-pay`** — validation (positive finalAmount, 10-digit phone, redirectUrl, subscriptionId for renewal/upgrade, gymId, HTTP callbackUrl), role + gym-ownership checks, pending-attempt idempotency (same subscriptionId → same attemptId), server-side payload + checksum, attempt persisted as `pending` (30-min `expires_at`), PhonePe `/pg/v1/pay` call, redirect URL stored. Response `{ attemptId, redirectUrl, error }`.
- **`phonepe-verify`** — role gate, status short-circuit, 30-min expiry → cancelled, cross-gym denial, server-side status checksum + GET, status mapping, **fulfillment via shared `fulfill_payment` RPC**.
- **`phonepe-callback`** — webhook: X-VERIFY `hash###saltIndex` timing-safe verification over the **decoded response JSON + `/pg/v1/status/{mid}/{mtx}` + saltKey** (hex digest), amount verification (paise), expiry, idempotency, `mapPhonePeState`, shared fulfillment. Every rejection = 200 no-op (fail-closed, no retry leak).
- **`cashfree-order`** — same validation/role/ownership/idempotency surface; server-side orderId (`CF-…`), paise→rupees `order_amount`, `return_url` with the real attemptId embedded; attempt persisted with `cashfree_order_id`/`order_status 'INITIALIZED'`; Orders API call; returns `{ attemptId, paymentSessionId, orderId, error }`.
- **`cashfree-verify`** — order status GET, mapping (PAID/SUCCESS→success, ACTIVE/PENDING/INITIALIZED→pending, CANCELLED/USER_DROPPED→cancelled, else failed), shared fulfillment.
- **`cashfree-webhook`** — HMAC over **byte-exact** `x-webhook-timestamp + rawBody` (never re-serialized), ≤5 min replay guard, v2 `body.data` base64 decode, order lookup by `cashfree_order_id`, rupees amount match, shared fulfillment. All rejects = 200 no-op.

### SQL (`supabase/migrations/0006_rpc.sql`)
- `payment_attempts` ALTER: `merchant_transaction_id`, `phonepe_state`, `response_code`, `callback_amount`, `cashfree_transaction_id` (all nullable).
- `plan_duration_membership(text)` — immutable plan→days (Trial 7, Day Pass 1, Standard 30, Premium 30, Quarterly 90, Annual 365, Lifetime 9999).
- `fulfill_payment(uuid, text)` — **the single atomic fulfillment core**: `SELECT … FOR UPDATE` on the attempt (serializes webhook + verify + retries), `status <> 'pending'` guard → `already_processed`, payments upsert keyed `payment_id` (natural dedup) with invoice `INV-YYYYMMDD-XXXX`, subscription fulfillment (upgrade = new plan + expiry recomputed from `greatest(expiry, today)` + duration; renewal/new = mark paid/active, dates client-set), gyms `subscription` jsonb merge (renewalCount bump), `subscription_history` append, notifications (`sub_payment_success` to gym staff high / super admins low with `gym_id NULL`). Revoked from anon+authenticated; **service_role only**.
- `delete_auth_user(text)` — super-only; uuid (auth.users.id) or legacy firebase_uid resolution; not-found = idempotent success; `delete auth.users` cascades profiles.
- `get_security_metrics()` — super-only; platform counts.
- `backfill_profiles()` — super-only; recovers missing profiles from auth.users by **email join** to members/trainers/gyms (auth.users.id is a new uuid — a legacy-firebase-uid join is impossible in Postgres; documented schema-driven difference), fallback role `pending`, `firebase_uid` self-reference when unrecovered.
- `handle_referral_signup()` trigger — format-only fast path (`^IP-[A-Z0-9]{6}$`), gym-owner roles excluded, referrer resolution (self-referral impossible by `firebase_uid <>`), `ON CONFLICT (referred_uid) DO NOTHING`, referrer + referred notifications, audit row — runs inside the profile INSERT transaction (Spark-compatible, no Admin SDK).

## 3. Production bugs caught by the smoke

1. **`phonepe-callback` checksum compare** — the edge compared the split `receivedChecksum` (hash only) against `expectedChecksum` (hash + `###{saltIndex}`), which can never match → every legitimately-signed callback was dropped. Fixed: compare the full `xVerify` header.
2. **Status pre-write breaking fulfillment** — all 4 success paths (verify/callback/cashfree-verify/cashfree-webhook) wrote `status: 'success'` **before** calling `fulfill_payment`, so the RPC's `<> 'pending'` guard saw a non-pending attempt and skipped fulfillment (no payment record, subscription never activated). Fixed: fulfillment now **owns the status transition** (RPC first, metadata-only write after); non-success states still write status directly.

Both fixes live in the Edge Functions; the SQL design (lock + guard) was already correct and is exercised end-to-end by the smoke (webhook + verify racing on one attempt → exactly one payment record).

## 4. Client wiring

- `src/services/paymentService.js` — `initiatePayment` → `supabase.functions.invoke('phonepe-pay')`, `refreshPaymentStatus` → `invoke('phonepe-verify')`, `getPaymentAttempt` supabase read (maps row via `mapPaymentAttemptRow`); `savePaymentAttempt`/`updatePaymentAttempt` throw in supabase mode (Cloud-Function-owned boundary, Step 8E); `subscribeToPaymentAttempts` unchanged (realtimeService).
- `src/services/cashfreeService.js` — `createCashfreeOrder` → `invoke('cashfree-order')`, `verifyCashfreePayment` → `invoke('cashfree-verify')`; zero REST calls, zero secrets, zero client audit writes.
- `deleteAuthUser` — **no client change needed**: all 3 call sites (authService.js:969, firestoreService.js:549/865) are inside Firebase-mode branches (`deleteMember`/`deleteTrainer` return early in supabase mode). The RPC is the server-side port; a future gym-owner deletion path can call `supabase.rpc('delete_auth_user', …)` as super admin.

## 5. Verification

- **Step 8G smoke 77/77** (`C:\Users\daksh\AppData\Local\Temp\opencode\s8g\`): real esbuild-bundled Edge Functions + real bundled client services against a rules-modeled fake Supabase (shared store, JWT tokens, RPC dispatch with the real SQL gates, referral trigger, counting firebase stubs). Covers: PhonePe pay/verify/callback happy + reject + idempotency + expiry + cross-gym + roles; Cashfree order/verify/webhook same matrix incl. HMAC replay/signature/amount rejects; fulfillment variants (upgrade/renewal/new); 3 admin RPCs authz + semantics; referral trigger 6 scenarios; client wiring incl. `__setCaller` identity switch; zero-firebase-call assertion.
- **Regressions (rebuilt from current source)**: s8c 101/101, s8e 73/73, s8f 35/35.
- **Build**: 0 errors, 0 warnings (20.4s). **eslint**: 0 NEW on changed client files.

## 6. Deployment / cutover

1. `supabase db push` (0006 migration; the cashfree_transaction_id column was added to the ALTER in this sprint).
2. Set secrets: `supabase secrets set PHONEPE_MERCHANT_ID=… PHONEPE_SALT_KEY=… PHONEPE_SALT_INDEX=… CASHFREE_CLIENT_ID=… CASHFREE_CLIENT_SECRET=…` (`CASHFREE_MODE` optional; `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are platform-managed).
3. Deploy: `supabase functions deploy phonepe-pay phonepe-verify cashfree-order cashfree-verify` and `supabase functions deploy phonepe-callback --no-verify-jwt` + `supabase functions deploy cashfree-webhook --no-verify-jwt`.
4. Client: `firebase deploy --only hosting` (no Firebase Functions redeploy needed — the client calls Edge Functions in supabase mode).
5. **Do NOT change provider-side webhook URLs yet** — Firebase Functions remain the live callback/webhook receivers until a validated cutover (switching URLs is a deliberate follow-up step per the migration constraints). Verify the `phonepe-callback`/`cashfree-webhook` Edge Functions against real provider "Test" events before switching.

## 7. Remaining risks

- **Webhook cutover**: Firebase Functions still own the live webhook URLs; Edge webhooks validated only in simulation until a real provider test event is sent.
- **Legacy data**: pre-existing payment attempts lack the new nullable fields (no backfill needed); `backfill_profiles` relies on email matching (documented limitation).
- **Realtime (REALTIME_PENDING)**: unchanged from Step 8C — subscribe* paths remain one-shot fetches.
- **`delete_auth_user`** deletes only auth.users + cascading profiles; members/trainers rows are untouched (legacy parity).
