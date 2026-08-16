# Cashfree Webhook E2E Diagnosis

**Date:** 2026-08-16
**Mode:** READ-ONLY (no payment logic, secrets, dashboard, or deployment modified)
**Project ref:** `osfhojfqytmqsqcmzvlf`

## Symptom

Sandbox E2E webhook POSTs (FAILED + SUCCESS ×2) all received:

```json
{"code":"NOT_FOUND","message":"Requested function was not found"}
```

wrapped in an HTTP 200 response. Downstream fulfillment assertions failed because the webhook handler never ran.

## TASK 1 — E2E script inspection (`C:\Users\daksh\AppData\Local\Temp\opencode\s9b-cashfree-e2e\e2e.mjs`)

| Item | Value |
|------|-------|
| Function URL used | `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cf-wh-probe` |
| Function slug | `cf-wh-probe` |
| URL derivation | Hardcoded — `PROJ = 'osfhojfqytmqsqcmzvlf'` (line 13) + `EDGE = https://${PROJ}.functions.supabase.co` (line 15); slug `/cf-wh-probe` hardcoded in the fetch (line 95). **Not** derived from any environment variable. |

The comment at e2e.mjs:93 states the intent: the webhook was to be signed server-side by a "temporary cf-wh-probe edge function" (real secret never leaves Supabase env, fixture JWT required, verify_jwt on).

## TASK 2 — Current Supabase deployment (`supabase functions list --project-ref osfhojfqytmqsqcmzvlf`)

| Slug | Status | Version | Updated (UTC) |
|------|--------|---------|---------------|
| `phonepe-pay` | ACTIVE | 4 | 2026-08-15 13:25:50 |
| `phonepe-verify` | ACTIVE | 4 | 2026-08-15 13:25:54 |
| `cashfree-order` | ACTIVE | 4 | 2026-08-15 13:26:03 |
| `cashfree-verify` | ACTIVE | 4 | 2026-08-15 13:26:08 |
| `phonepe-callback` | ACTIVE | 4 | 2026-08-15 13:26:17 |
| **`cashfree-webhook`** | **ACTIVE** | **4** | **2026-08-15 13:26:21** |

- Deployed slug: **`cashfree-webhook`** — ACTIVE, version 4.
- **`cf-wh-probe` is NOT deployed** (absent from the list; also absent locally — `supabase/functions/` contains only the 6 functions above).

## TASK 3 — URL vs deployment comparison

| | URL |
|---|---|
| E2E webhook URL | `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cf-wh-probe` |
| Deployed webhook URL | `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-webhook` |

**Mismatch: A. WRONG SLUG.** Same project ref, different slug.

- The E2E posts to `/cf-wh-probe` — a helper function that was never deployed (no such slug in the functions list, no such directory in `supabase/functions/`).
- The actually deployed webhook handler is `/cashfree-webhook`.
- Supabase's edge gateway returns the `NOT_FOUND` wrapper for any unknown function slug — the exact error observed.

## TASK 4 — Direct safe probe (read-only, no real event, no fulfillment)

1. `POST {}` → **deployed** `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cashfree-webhook`
   - Result: **HTTP 200 `{"success":true}`** — the handler responded (fail-closed ack: no `x-webhook-signature`/`x-webhook-timestamp` headers → `{success:true}` per index.ts:20–35). Endpoint reachable, function running.
2. `POST {}` → `https://osfhojfqytmqsqcmzvlf.functions.supabase.co/cf-wh-probe`
   - Result: **HTTP 404 `{"code":"NOT_FOUND","message":"Requested function was not found"}`** — exact reproduction of the E2E failure.

## TASK 5 — No fixes applied

Nothing was modified: no Edge Function source, no secrets, no E2E script, no dashboard webhook config, no deployments.

## Root cause

The E2E script targets a **nonexistent function slug** (`cf-wh-probe`) instead of the deployed handler slug (`cashfree-webhook`). The deployed function is healthy and reachable; the failure is entirely in the E2E request URL.

## Exact one-line fix required

`e2e.mjs:95` — change the fetch target from `cf-wh-probe` to the deployed slug:

```js
// BEFORE
const r = await fetch(`${EDGE}/cf-wh-probe`, {
// AFTER
const r = await fetch(`${EDGE}/cashfree-webhook`, {
```

Note: `cashfree-webhook` is deployed with `--no-verify-jwt`, so the fixture JWT header is harmless. For a genuine signature-validated test, the E2E must also supply valid `x-webhook-signature` + `x-webhook-timestamp` headers — either via the server-side signing helper (`cf-wh-probe`, which would first need to be deployed) or by computing the HMAC with the secret held in Supabase env. As-is, a bare post to `cashfree-webhook` will be acknowledged (`{success:true}`) but not processed — the fail-closed design.

## FINAL VERDICT

**WEBHOOK_URL_MISMATCH**

(The deployed `cashfree-webhook` endpoint itself is reachable and functional; the E2E posts to the wrong, never-deployed slug `cf-wh-probe`.)