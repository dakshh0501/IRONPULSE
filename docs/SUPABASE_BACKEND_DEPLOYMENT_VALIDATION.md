# Supabase Backend Deployment Validation — Step 8H

**Project**: `osfhojfqytmqsqcmzvlf` (IRONPULSE, Southeast Asia — Singapore)
**Date**: 2026-08-15 (updated 2026-08-16 — see §6.3 / FINAL VERDICT)
**Status**: SEE FINAL VERDICT SECTION

## 1. Database Migration (STEP 1)

`supabase db push --linked` applied in two batches:

| Migration | Applied | Verified on remote |
|---|---|---|
| 0001_initial_schema.sql | already present (pre-8H) | — |
| 0002_rls.sql | already present (pre-8H) | — |
| 0003_rpc.sql | **applied 8H** | `bump_campaign_stat` present |
| 0004_rpc.sql | **applied 8H** | 8 RPCs (set_profile_role, update_gym_subscription, …) |
| 0005_storage.sql | **applied 8H** | `gym-images` bucket + storage policies |
| 0006_rpc.sql | **applied 8H** | see below |
| 0007_rpc_hardening.sql | **applied 8H (NEW — see §1.1)** | ACLs verified |

`supabase migration list --linked`: all 7 migrations show `Local 000X | Remote 000X`.

**0006 verified objects** (via `supabase db query`):
- RPCs: `fulfill_payment(uuid,text)`, `delete_auth_user(text)`, `get_security_metrics()`, `backfill_profiles()`, `plan_duration_membership(text)`, `handle_referral_signup()` — all present.
- `payment_attempts` columns: `merchant_transaction_id`, `phonepe_state`, `response_code`, `callback_amount`, `cashfree_transaction_id` — all present.
- Trigger: `trg_referral_signup` AFTER INSERT on `profiles` → `handle_referral_signup()` — present and enabled.
- `fulfill_payment` body verified live: row lock → `<> 'pending'` guard → payments upsert (ON CONFLICT DO NOTHING) → gyms jsonb merge → subscription_history append → notifications; invoice `INV-YYYYMMDD-XXXX`; `plan_duration_membership` duration math.
- Admin RPC bodies verified live: `delete_auth_user`, `get_security_metrics`, `backfill_profiles` all gate on `public.is_super_admin(auth.uid())`.

### 1.1 Hardening migration 0007 (found during validation)
`REVOKE … FROM anon, authenticated` in 0006 does **not** remove PostgreSQL's default **PUBLIC EXECUTE** grant (granted at function creation). Probed ACLs showed `{=X/postgres, …}` (PUBLIC execute) on all four RPCs — and `fulfill_payment` has **no in-function auth gate**, making it user-invocable. New `supabase/migrations/0007_rpc_hardening.sql` revokes PUBLIC execute and re-grants precisely:

| Function | Grants (verified) |
|---|---|
| `fulfill_payment` | postgres, **service_role only** |
| `delete_auth_user` / `get_security_metrics` / `backfill_profiles` | postgres, service_role, authenticated (body gates super admin) |
| `plan_duration_membership` | postgres, authenticated |

## 2. Deployed Functions (STEP 3)

All six, version 1, STATUS ACTIVE:

| Function | Type | JWT | Deploy |
|---|---|---|---|
| `phonepe-pay` | callable | verified | default |
| `phonepe-verify` | callable | verified | default |
| `cashfree-order` | callable | verified | default |
| `cashfree-verify` | callable | verified | default |
| `phonepe-callback` | webhook | **none** | `--no-verify-jwt` |
| `cashfree-webhook` | webhook | **none** | `--no-verify-jwt` |

Base URL: `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/<slug>`

## 3. Secret Configuration Status (STEP 2)

Values are never stored in VITE_ variables, React source, git, or docs. Platform-managed: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS` (all present).

Payment secrets (set by operator via `supabase secrets set`, names only):

| Secret | Status |
|---|---|
| `PHONEPE_MERCHANT_ID` | PENDING (operator) |
| `PHONEPE_SALT_KEY` | PENDING (operator) |
| `PHONEPE_SALT_INDEX` | PENDING (operator) |
| `CASHFREE_CLIENT_ID` | **SET** (Cashfree Phase 1, 2026-08-15 — digest `fe2bec591a446ebae8a3d1451731e7fe…`; value never printed) |
| `CASHFREE_CLIENT_SECRET` | **SET** (Cashfree Phase 1, 2026-08-15 — digest `9add91d0b34ced0206b25b1f19736048…`; value never printed) |
| `CASHFREE_MODE` | **SET = `sandbox`** (Phase 1 — secret digest `b7ad567477c83756aab9a542b2be04f7…` matches SHA-256 of the literal string `sandbox`, computed locally; value never printed) |

## 4. Live Deployment Validation (STEP 4)

Probes against the live endpoints:

| Probe | Result |
|---|---|
| `phonepe-pay` without Authorization | **HTTP 401** (JWT middleware active) |
| `phonepe-pay` with test gym_admin JWT (fixture user) | **HTTP 200** — `{"attemptId":null,"redirectUrl":null,"error":"PhonePe is not configured…"}` — JWT verified, role gate (gym_admin) passed, gym ownership passed, DB reads OK, config-error path clean. Attempt NOT created (config validated before insert) |
| `phonepe-callback` POST without X-VERIFY | **HTTP 200** no-op (fail-closed) |
| `cashfree-webhook` POST without signature | **HTTP 200** no-op (fail-closed) |
| Source review: missing config → 200 no-op; checksum mismatch → 200 no-op; replay >5 min → 200 no-op; amount mismatch → 200 no-op | verified in code + smoke |

Log inspection via CLI is unavailable (`supabase functions logs` removed); no errors surfaced in any probe response.

## 5. PhonePe Test Results (STEP 5)

- **Callable pipeline (pay)**: live-verified end-to-end up to the config gate (JWT → role → ownership → config error). With secrets set, `phonepe-pay` is **NOT invoked against the production merchant** (would create real orders — out of scope).
- **Callback signature verification (the fixed X-VERIFY full-header compare)**: fail-closed paths live-verified (no-signature → 200 no-op). Valid-signature path requires the salt secret: covered by smoke T24–T32 (full happy path, checksum compare over decoded JSON, duplicate callback idempotent, replay/amount/unknown-mtx rejects, expiry → cancelled, FAILED → failed) — simulation-validated.
- **After secrets are set** (safe probes only): `phonepe-verify` with a non-existent attemptId → clean `not_found` (DB-only, no provider call).
- **Operator step (documented, not executed)**: send a real **PhonePe test/sandbox event** from the PhonePe dashboard to `…/functions.supabase.co/phonepe-callback`, then inspect `payment_attempts`/`payments` via the dashboard. Requires sandbox merchant credentials (PGTEST merchant) — the production merchant id must NOT be used for order creation during validation.

## 6. Cashfree Test Results (STEP 6)

- **Fail-closed paths live-verified**: missing signature/timestamp → 200 no-op (HTTP).
- **Full matrix (order → verify → webhook → HMAC → replay → amount → fulfillment)**: covered by smoke T33–T49 — simulation-validated (sandbox API + real credentials are an operator step).
- **After secrets are set** (safe probes): `cashfree-verify` with a non-existent attemptId → clean `not_found`.
- **Operator step (documented, not executed)**: with `CASHFREE_MODE=sandbox` and sandbox credentials, create an order via `cashfree-order` (test gym), complete a sandbox payment (test UPI), and confirm the webhook fires → fulfillment. With production credentials, do NOT create orders — validate only via the Cashfree dashboard **Test Webhook** button.

## 6.1 Cashfree Phase 1 — Safe Probe Validation (2026-08-15, COMPLETE)

Phase 1 gates: secrets set + safe verification probes pass + DB/RPC authorization verified + temp records cleaned. **No real payment order was created** (the `cashfree-order` function was NOT invoked — order creation is deferred to the operator webhook-test step).

**Secret verification (values never printed):**
- `supabase secrets list` → all three `CASHFREE_*` secrets present (digests only).
- `CASHFREE_MODE` value confirmed `sandbox` by comparing the stored secret digest with a locally computed SHA-256 of the string `sandbox` (exact match).

**Probes (live, against `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-verify`, all ACTIVE v2):**

| Probe | Auth | Result |
|---|---|---|
| P1 — no Authorization header | — | HTTP 200 `{"status":null,"error":"Authentication required"}` (rejected before DB work) |
| P2 — password sign-in of temp gym_admin fixture (GoTrue) | real user JWT | HTTP 200, token issued |
| P3 — `attemptId` = non-existent UUID | gym_admin JWT | HTTP 200 `{"status":null,"error":"Payment attempt not found"}` — clean DB-only error, **no Cashfree API call, no order, no writes** |
| P4 — `attemptId` = empty string | gym_admin JWT | HTTP 200 `{"status":null,"error":"attemptId is required"}` (input validation) |
| P5 — malformed/tampered JWT | fake token | HTTP 401 `UNAUTHORIZED_LEGACY_JWT` (edge platform rejects before the function) |

**Fixture + findings during probing:**
- Fixture created via direct SQL (bcrypt via bcryptjs, `email_confirmed_at` set) — first login attempt returned HTTP 500 `"Database error querying schema"`. Root cause traced through the GoTrue v2.195.0 source (downloaded, `internal/api/token.go` + `internal/models/user.go`): the message wraps ANY error from `FindUserByEmailAndAudience`, and the row's `email_change = NULL` cannot scan into the model's plain `string` field (lib/pq NULL→string scan failure). Setting the plain-string token columns (`confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`) to `''` made login succeed (HTTP 200). **Audited all production auth rows: 0 NULLs across all 8 plain-string token columns for all users — no production login blocker.** The anomaly is a fixture-insertion nuance, not a platform defect.
- Signup control probe: valid `gmail.com` signup succeeded; an early `example.com` signup returned `email_address_invalid` (could not be re-confirmed — subsequent attempts hit `over_email_send_rate_limit`). **Residual observation, not Cashfree-blocking**: if signup anomalies appear in staging, review Dashboard → Auth → Email validation/domain settings.
- Signup rate limiter works as expected (429 `over_email_send_rate_limit` on rapid consecutive signups).

**DB/RPC authorization (re-verified live):**

| Function | Grants | Status |
|---|---|---|
| `fulfill_payment` | postgres, **service_role only** | ✅ payment-state transitions NOT user-invocable |
| `delete_auth_user` / `get_security_metrics` / `backfill_profiles` | postgres, service_role, authenticated (body gates `is_super_admin`) | ✅ |
| `plan_duration_membership` | postgres, authenticated | ✅ |
| `bump_campaign_stat` | **PUBLIC execute** (`=X/postgres`) — pre-existing 0003-era ACL, security-invoker + whitelisted fields = low risk | ⚠️ residual; optional hardening: `revoke execute on function public.bump_campaign_stat from public;` |

**Payment-state handling:** ownership of status transitions remains in `fulfill_payment` (`SELECT … FOR UPDATE` row lock → `status <> 'pending'` short-circuit → payments upsert `ON CONFLICT (payment_id) DO NOTHING` → gyms jsonb merge → subscription_history append → notifications) — unchanged from §7; ACL re-verified above. Integrity after all probes: `payment_attempts` 0, `payments` 0 (probes created zero records).

## 7. Database Fulfillment Verification (STEP 7)

- **No duplicate fulfillment**: single `fulfill_payment` RPC owns the status transition; row lock serializes webhook+verify+retry; `<> 'pending'` short-circuits; payments upserted on `payment_id` ON CONFLICT DO NOTHING; deterministic invoice per attempt. Proven by smoke T30 (double callback → 1 payment row), T32 (webhook+verify race → 1 row), T48 (duplicate webhook → 1 row).
- **Integrity after live probes**: `payment_attempts` 0, `payments` 0, `subscription_history` 0, notifications 0 for the fixture gym — the config-error path created nothing.
- **Fixture**: one auth user (`step8h.validation@example.com`), one gym (`step8h-gym`), one profile (gym_admin) — created for live probes; removed at end of validation (see §9 cleanup).

## 8. Rollback Procedure

No webhook URLs were changed and no Firebase Functions were touched — the production billing path is untouched. Rollback of this deployment:

1. **Functions**: `supabase functions delete <slug>` for any/all of the six (or redeploy older code). Firebase Functions remain the live receivers for PhonePe/Cashfree webhooks.
2. **Migrations 0003–0007**: additive DDL (new functions, columns, triggers, grants). None alter existing table data. To revert, run the inverse SQL manually (drop functions/triggers/columns) — there is no destructive migration.
3. **Secrets**: `supabase secrets unset <name>` per secret.
4. **Client**: keep `VITE_AUTH_PROVIDER=supabase` — client already calls the Edge Functions; switching back to Firebase mode only affects the client (Firebase Functions still deployed).

## 9. Webhook URLs for Later Cutover (NOT CHANGED IN THIS TASK)

The provider-side URLs below are documented for the cutover step but **were not modified**:

- PhonePe webhook/callback URL: `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/phonepe-callback`
- Cashfree webhook URL: `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-webhook`

Cutover procedure (future, operator-executed):
1. Set secrets (this task's pending item).
2. Validate both webhooks against real provider **Test Webhook** events (PhonePe dashboard / Cashfree dashboard).
3. Switch the PhonePe merchant callback URL + Cashfree webhook URL in the provider dashboards to the URLs above.
4. Send a real low-value test order through the app; confirm `payments`, `subscriptions`, `subscription_history`, `gyms.subscription` updates and notifications.
5. Keep Firebase Functions deployed for 30 days as rollback; then optionally remove.

## 6.2 Cashfree Sandbox E2E — Webhook Pipeline Attempt (2026-08-15, BLOCKED AT PROVIDER AUTH)

Full sandbox end-to-end harness executed (operator-authorized). Everything on the IRONPULSE side passed; the **Cashfree sandbox API rejected the stored credentials**.

**What was exercised (all PASS, fixture fully cleaned up):**
- Fixture creation via service-role REST: throwaway `gyms` row (`cf-e2e-*`), `profiles` row (`gym_admin`), 2 `subscriptions` rows; GoTrue admin-API user creation (no emails, no rate limits) + password-grant JWT.
- `cashfree-order` Edge Function invocation with a real gym_admin JWT: validation, role + gym-ownership checks, attempt row persisted (`payment_attempts`, pending, 30-min `expires_at`, `cashfree_order_id` generated), then the real Cashfree **sandbox** Orders API call (`https://sandbox.cashfree.com/pg/orders`).
- Provider failure surfaced correctly: attempt marked `failed` with `raw_response` persisted; clean error returned to caller; no orders created at the provider.

**BLOCKER (provider-side):** Cashfree sandbox API rejects the stored client credentials —
```json
{"code":"request_failed","type":"authentication_error","message":"authentication Failed"}
```
Interpretation: `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` (secrets SET in Phase 1, values never printed) are not valid for the **sandbox** environment — likely production credentials, invalid values, or a different merchant account. **Operator action:** verify the sandbox Client ID + Secret in the Cashfree dashboard (Sandbox → Settings/API keys), then `supabase secrets set CASHFREE_CLIENT_ID=<sandbox id> CASHFREE_CLIENT_SECRET=<sandbox secret>` and re-run the E2E.

**Re-run (idempotent, self-sweeps any stray fixtures):**
```
node C:\Users\daksh\AppData\Local\Temp\opencode\s9b-cashfree-e2e\e2e.mjs
```
The harness then covers: FAILED webhook → attempt `failed`; SUCCESS webhook (sent twice) → `fulfill_payment` (attempt success, payment record + `INV-` invoice, subscription paid/active, gyms.subscription jsonb sync, subscription_history, sub_payment_success notifications to gym admins + super admins); full cleanup with baseline restoration (13/25/25/0/0/9/2).

**Tooling notes:** webhook signing done by a temporary `cf-wh-probe` Edge Function (secret stays in Supabase env — CLI has no `secrets get`), deployed → invoked → deleted after the run; NOT present in the project now. Service-role key fetched via `supabase projects api-keys --reveal` (never printed). E2E script at `C:\Users\daksh\AppData\Local\Temp\opencode\s9b-cashfree-e2e\e2e.mjs`.

## 6.3 Cashfree Sandbox E2E — Webhook Pipeline Resolved (2026-08-16, COMPLETE)

**Preliminary note (2026-08-16):** the E2E's earlier attempt posted webhooks to `/cf-wh-probe` — the temporary signing function from the first run, which had been deleted. The deployed slug is `cashfree-webhook`. The E2E now signs webhooks itself (official Cashfree v2 scheme: payload `{data: base64({order, payment})}`, `x-webhook-signature = base64(HMAC-SHA256(clientSecret, x-webhook-timestamp + rawBody))` byte-exact, `x-webhook-timestamp` header) and POSTs to `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-webhook`. Full report: `docs/CASHFREE_WEBHOOK_E2E_DIAGNOSIS.md` and `docs/CASHFREE_PAYMENT_FULFILLMENT_HARDENING.md`.

**Result: 40/40 checks passed** (previously 37/40). The 3 failing checks were defects in the deployed `public.fulfill_payment` RPC (0006) and are fixed by new migration **`0009_rpc_fulfill_payment_fix.sql`** (applied 2026-08-16; 0008 also applied in the same push):

| Check | Before | After (0009) |
|---|---|---|
| attempt1 status after SUCCESS webhook | stayed `pending` (RPC never wrote status) | `success` (atomic conditional claim `UPDATE … SET status='success' WHERE status='pending'` + row-count verify) |
| retried SUCCESS webhook | re-fulfilled (2nd payment record + 2nd history row + dup notifications) | idempotent `already_processed` no-op — exactly 1 payment row, 1 history row, 2 notifications |
| `gym.subscription.expiryDate` | null (no fallback) | `2026-09-15` from `subscriptions.expiry_date` (`coalesce(v_new_expiry, v_sub.expiry_date, v_gsub->>'expiryDate')`) |

- Full flow exercised live: 2 sandbox orders via `cashfree-order` → FAILED webhook → attempt `failed`; SUCCESS webhook sent twice → single fulfillment (attempt `success` + `order_status SUCCESS` + `cashfree_transaction_id` + `callback_amount 99.99`; payment record `IP-MSVOM1CI-2277`, invoice `INV-20260816-1AFA`, amount/paid 99.99, Paid, Cashfree, `payment_gateway Cashfree`, `auth_uid` caller, transaction_id = webhook tx; subscription1 paid/active/transaction_id/paid_at/amount 99.99; subscription2 untouched; gym jsonb: active/paid/99.99/lastPaymentId/renewalCount 0/expiryDate set; history 1 row `activated`; notifications 2 — gym admin high `sub_payment_success` + super admins low).
- Cleanup restored the exact baseline: `gyms` 13 / `auth.users` 25 / `profiles` 25 / `payment_attempts` 0 / `payments` 0 / notifications 9 / subscription_history 2.
- ACL after push, verified live: `fulfill_payment` proacl = `{postgres=X/postgres, service_role=X/postgres}` (service_role only; no PUBLIC/anon/authenticated).
- Regressions (2026-08-16): s8g **77/77** (T50 assertion made date-relative — fixture expiry 2026-08-15 is before current date and the upgrade math `greatest(expiry, current_date) + 30` is date-relative by design; no product change), s8c **101/101**, s8e **73/73**, s8f **35/35**; `npm run build` 0 errors/0 warnings. No client source changed (migration-only fix).

## 10. Fixture Cleanup

Executed at the end of validation:
- `delete from auth.users where id = 'a7e1d2c3-0000-4000-8000-000000000001';` (cascades profile)
- `delete from public.gyms where id = 'step8h-gym';`
- Local temp files (`s8h-*.json`, `s8h-jwt.txt`, `s8h-*.sql`, bcrypt temp dir) removed.

**Cashfree Phase 1 cleanup (2026-08-15, executed):**
- Fixture auth user `4cd9147c-1aeb-45cd-823a-ee01c0e98e7e` (gym_admin, temp password) → deleted (cascades profile; identity row deleted earlier during diagnosis).
- Control signup user `02bdb242-686c-4689-a5ad-0b00cf919f19` (`phase1.test@gmail.com`) → deleted (cascades identity + profile).
- **8H leftover found and removed**: fixture user `a7e1d2c3-0000-4000-8000-000000000001` (`step8h.validation@example.com`) and gym `step8h-gym` were still present despite the 8H cleanup record — both deleted now. (Earlier detection miss was a column-name error — `gym_name`, not `name`.)
- Local Phase 1 artifacts (fixture SQL/creds/scripts, GoTrue v2.195.0 source zip for diagnosis) removed.
- Post-cleanup state (matches import reconciliation): `gyms` 13, `auth.users` 25, `profiles` 25, `identities` 25, `payment_attempts` 0, `payments` 0; notifications 9 and subscription_history 2 are pre-existing production data (unchanged by probes).

## FINAL VERDICT

**Cashfree Phase 1 (2026-08-15): READY_FOR_CASHFREE_WEBHOOK_TEST**

**Cashfree Sandbox E2E (2026-08-15, §6.2): BLOCKED_ON_CASHFREE_SANDBOX_CREDENTIALS** — full pipeline (fixture → auth → `cashfree-order` → attempt persistence → error propagation → cleanup) verified working; the sandbox Orders API returns `authentication_error` for the stored `CASHFREE_CLIENT_ID`/`CASHFREE_CLIENT_SECRET`. Operator must supply valid sandbox credentials (`supabase secrets set`), then re-run the E2E script (idempotent). Webhook signature/fulfillment paths are implemented and spec-verified but await a valid sandbox order to be exercised end-to-end.
- ✅ `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_MODE` (= `sandbox`, digest-verified, values never printed) configured as Edge Function secrets.
- ✅ Safe probes passed live: unauthenticated/tampered-JWT rejected; authenticated gym_admin JWT verified; non-existent attemptId → clean `Payment attempt not found` (DB-only, zero Cashfree API calls, zero writes, zero orders created).
- ✅ DB/RPC authorization verified: `fulfill_payment` service_role-only (payment-state transitions not user-invocable); integrity clean (0 payment artifacts).
- ✅ All temp records removed (fixtures + 8H leftovers); production state matches the import reconciliation (13 gyms / 25 users / 25 profiles).
- PhonePe: retained, deferred, no credentials required, not a launch blocker (secrets remain PENDING by design).

**UPDATE (2026-08-16) — supersedes the BLOCKED verdict above (see §6.3 + `docs/CASHFREE_PAYMENT_FULFILLMENT_HARDENING.md`):**

**Cashfree Payment Fulfillment (2026-08-16): READY_FOR_CASHFREE_PRODUCTION_CUTOVER**
- ✅ Sandbox credentials valid; sandbox Orders API + full order → webhook → fulfillment pipeline exercised end-to-end live.
- ✅ 3 fulfillment defects in the deployed `fulfill_payment` RPC fixed via new migration `0009_rpc_fulfill_payment_fix.sql` (status transition pending→success; duplicate-webhook exactly-once via atomic conditional claim; `expiryDate` fallback to `subscriptions.expiry_date`), applied 2026-08-16 (0008 also applied), ACL re-verified service_role-only.
- ✅ Cashfree sandbox E2E **40/40** (was 37/40): attempt `success` + order_status SUCCESS + cashfree_transaction_id + callback_amount; 1 payment row (INV- invoice, Cashfree gateway); subscription1 paid/active; gym.subscription expiryDate `2026-09-15`; history 1 row; notifications 2; subscription2 untouched; baseline restored exactly (13/25/25/0/0/9/2).
- ✅ Regressions: s8g 77/77, s8c 101/101, s8e 73/73, s8f 35/35; `npm run build` 0/0. No client source changed.

**What remains before live traffic (operator-executed, out of this task's scope):**
1. Send a real Cashfree sandbox **Test Webhook** event from the Cashfree dashboard to `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-webhook`; confirm HMAC validation, amount check, fulfillment via `payment_attempts`/`payments`/`subscriptions` in the dashboard.
2. Optionally create a sandbox order via `cashfree-order` (test gym) with a test UPI payment to validate the full order → modal → verify → webhook loop (safe in sandbox mode; NEVER with production credentials).
3. Only after (1)/(2) pass: flip provider-side webhook URL to the Supabase endpoint (cutover), keep Firebase Functions for the 30-day rollback window.
4. For production: set `CASHFREE_MODE=production` + production credentials; validate webhook HMAC variants against a real dashboard Test Webhook event first.

Residual (non-blocking, tracked): `bump_campaign_stat` PUBLIC execute ACL (optional hardening); `example.com` signup `email_address_invalid` observation (unconfirmed, review Dashboard Auth settings if signup issues appear).
