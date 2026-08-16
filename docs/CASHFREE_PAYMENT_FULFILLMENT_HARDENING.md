# Cashfree Payment Fulfillment Hardening — Step 9B

**Project**: `osfhojfqytmqsqcmzvlf` (IRONPULSE)
**Date**: 2026-08-16
**Status**: COMPLETE — final Cashfree sandbox E2E **40/40**, all regression suites green, verdict `READY_FOR_CASHFREE_PRODUCTION_CUTOVER` (see FINAL VERDICT)

## 1. Problem

The Cashfree sandbox E2E (previous run) passed 37/40 with three failures, all traced to defects in the deployed `public.fulfill_payment` RPC (first deployed via `0006_rpc.sql`):

| E2E check | Defect | Root cause |
|---|---|---|
| #10 — attempt status stays `pending` after SUCCESS webhook | **D1: status never transitions** | The RPC only *checked* `status <> 'pending'` and returned early for non-pending attempts, but never *wrote* `status`. Every fulfilled attempt remained `pending` forever. |
| #36 — `subscription_history` has 2 rows after retried webhook | **D2: duplicate fulfillment** | Because status stayed `pending`, a retried/duplicate SUCCESS webhook passed the guard again and re-fulfilled (second payment record + second history row + duplicated notifications). |
| #35 — `gym.subscription.expiryDate` is null | **D3: missing expiry fallback** | Gym jsonb sync used `coalesce(v_new_expiry, v_gsub->>'expiryDate')` — no fallback to `subscriptions.expiry_date` (which the client pre-sets for new/renewal payments). |

## 2. Root Cause Confirmation (evidence)

- **Deployed definition inspected live** (Management API `pg_get_functiondef` over the `database/query` endpoint, 2026-08-16): the deployed `fulfill_payment` was byte-identical to `0006_rpc.sql` — it never wrote `payment_attempts.status` (only the `<> 'pending'` check at what became lines 34-36 of the dump), and the gym expiry sync had no `subscriptions.expiry_date` fallback (line 128 of the dump).
- **Divergence from the smoke model**: the s8g shim (`doFulfill`) *does* set `attempt.status = 'success'` — which is why the 77/77 smoke passed while the live E2E failed. The real RPC never made the transition.
- **Enum validity**: `payment_attempts.status` is `attempt_status ('pending','success','failed','cancelled')` (0001) — `'success'` exists.
- **Edge-function contract**: `cashfree-webhook` and `phonepe-verify` deliberately do metadata-only writes after calling `fulfill_payment` ("status owned by fulfill_payment"); both treat `ok === true || already === true` as success.

## 3. Fix — New Migration `0009_rpc_fulfill_payment_fix.sql`

A **new** migration (applied 2026-08-16; applied migrations 0001–0008 were never edited in place; `0008` was also pending and pushed in the same batch). `CREATE OR REPLACE FUNCTION` with the same signature `fulfill_payment(uuid, text)`, same `SECURITY DEFINER` + `search_path = public`, same structure and writes — with three changes:

1. **D1 + D2 — atomic status claim**: after the existing `SELECT … FOR UPDATE` row lock, an `UPDATE payment_attempts SET status = 'success', updated_at = now() WHERE id = p_attempt_id AND status = 'pending'` claims the attempt; `GET DIAGNOSTICS` verifies the affected row count.
   - Winner (1 row) proceeds with fulfillment.
   - Loser (0 rows — already processed, or failed/cancelled) returns `{ok:false, already:true, code:'already_processed', status:<current>}` **without** touching payments / history / notifications / gym sync — the caller treats `already` like success. This closes the duplicate-webhook window in the RPC itself (in addition to the edge-level `status !== 'pending'` short-circuit).
   - Non-pending attempts (failed/cancelled) can never be claimed.
2. **D3 — expiry precedence**: `'expiryDate', coalesce(v_new_expiry::text, v_sub.expiry_date::text, v_gsub->>'expiryDate')` — newly computed (upgrade) → client pre-set `subscriptions.expiry_date` → existing gym jsonb value. A valid expiry is never overwritten with NULL.
3. **ACL re-asserted** (explicit, matches 0007 model): `revoke … from public/anon/authenticated`, `grant execute to service_role` only. Verified live after push: `proacl = {postgres=X/postgres, service_role=X/postgres}`.

Everything else is byte-identical to the deployed 0006 version: row lock, upgrade/renewal/new parity, payment upsert (`payment_id` unique + ON CONFLICT DO NOTHING), invoice `INV-YYYYMMDD-XXXX`, gym jsonb merge (renewalCount bump), `subscription_history` append (only the winner reaches it), `sub_payment_success` notifications (gym admins/owners high + supers low), return shape `{ok, status, paymentId, invoiceNo, transactionId}`.

**Exactly-once argument**: with the row lock serializing concurrent callers (webhook vs verify vs retry), only one transaction can hold the lock at a time; the conditional UPDATE is the atomic claim; the loser's 0-row result is returned before any fulfillment write. Payment records additionally stay naturally idempotent via `payment_id`.

## 4. Verification

### 4.1 Deployment + live ACL
- `supabase db push` applied `0008_rpc_grant_security_metrics.sql` (pending from Step 9A) + `0009_rpc_fulfill_payment_fix.sql` (Docker warning about migration-catalog caching only; push itself succeeded — verified via `supabase migration list`: 0001–0009 all `Local | Remote` matched).
- Deployed function re-inspected live: contains the claim (`set status = 'success' … and status = 'pending'`), `v_rows` verification, and the `v_sub.expiry_date` fallback.
- ACL live: `{postgres=X/postgres, service_role=X/postgres}` — service_role ONLY, no PUBLIC/anon/authenticated.

### 4.2 Cashfree sandbox E2E — **40/40** (was 37/40)
Harness: `C:\Users\daksh\AppData\Local\Temp\opencode\s9b-cashfree-e2e\e2e.mjs` — real sandbox orders + Cashfree v2 webhook payloads (`{data: base64({order, payment})}`) + official HMAC (`base64(HMAC-SHA256(clientSecret, ts + rawBody))`), delivered to the deployed `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-webhook`. Previously-failing checks now green:
- **#10** `attempt1 status = success` (`status=success order_status=SUCCESS`)
- **#35** `gym.subscription expiryDate set — 2026-09-15` (from `subscriptions.expiry_date` fallback)
- **#36** `subscription_history 1 row (activated)` (duplicate webhook idempotent — no second payment/history/notifications)

Full suite: fixture auth user, gym + profile + 2 subscriptions, 2 sandbox orders, FAILED webhook → attempt `failed`, SUCCESS webhook ×2 (retry) → single fulfillment (attempt success, payment record + INV- invoice, subscription paid/active + transaction_id + paid_at + amount, gym jsonb sync incl. renewalCount 0, history 1 row, notifications 2 — gym admin high + supers low), `subscription2` untouched. Cleanup restored the exact baseline: gyms 13 / users 25 / profiles 25 / attempts 0 / payments 0 / notifs 9 / history 2.

### 4.3 Regression suites (all rebuilt/rerun 2026-08-16)
| Suite | Result |
|---|---|
| s8g (payments/subscriptions/referrals edges + shim) | **77/77** (1 harness fix: T50's hardcoded `2026-09-14` expectation drifted because fixture expiry `2026-08-15` < current date — the upgrade math `greatest(expiry, current_date) + 30` is date-relative by design; assertion now computes the expected date from `Math.max(2026-08-15, now)` + 30 days. Not a product change — deployed RPC upgrade math is byte-identical.) |
| s8c (data plane) | **101/101** |
| s8e (write paths/RPCs) | **73/73** |
| s8f (storage) | **35/35** |
| `npm run build` | **0 errors, 0 warnings** (12s; entry `index-ZxA6b1gK.js`) |

No client source changed in this step (migration-only fix), so no new eslint findings; the build includes the previously-audited bundle.

## 5. Files Changed
- `supabase/migrations/0009_rpc_fulfill_payment_fix.sql` (new — the only product change)
- `docs/SUPABASE_BACKEND_DEPLOYMENT_VALIDATION.md` (updated — see §6 there)
- Smoke harness only: `C:\Users\daksh\AppData\Local\Temp\opencode\s8g\smoke-8g.cjs` (T50 date-relative expectation)

## 6. Remaining Risk / Operator Steps Before Live Traffic (unchanged from prior validation)
1. Webhook URL cutover remains **operator-executed and NOT done**: PhonePe/Cashfree provider dashboards still point at Firebase Functions. The Edge `cashfree-webhook`/`phonepe-callback` are simulation- and sandbox-validated; before flipping, validate against a real provider **Test Webhook** event.
2. Validate sandbox vs production webhook HMAC variants (PG vs PPI doc differences) against a dashboard "Test Webhook" event before going live.
3. `CASHFREE_MODE` is `sandbox`; production cutover requires the operator to set `CASHFREE_MODE=production` + production credentials.
4. Residual non-blocking items: `bump_campaign_stat` PUBLIC execute ACL (optional hardening); dormant Firebase SDK chunk by design; REALTIME_PENDING one-shot loads.

## FINAL VERDICT

**Cashfree payment fulfillment (2026-08-16): READY_FOR_CASHFREE_PRODUCTION_CUTOVER**
- ✅ 3 fulfillment defects fixed via new migration `0009` (status transition, exactly-once duplicate suppression, expiry fallback), deployed and verified live.
- ✅ Cashfree sandbox E2E **40/40** (was 37/40) — status `success`, `expiryDate` synced, single history row on retried webhook, baseline restored exactly.
- ✅ Regressions: s8g 77/77, s8c 101/101, s8e 73/73, s8f 35/35; build 0/0.
- ✅ ACL service_role-only verified live; no PUBLIC/anon/authenticated execute.
- ⏳ Remaining before live traffic: operator flips provider webhook URLs after real Test-Webhook validation (documented in `docs/SUPABASE_BACKEND_DEPLOYMENT_VALIDATION.md`).