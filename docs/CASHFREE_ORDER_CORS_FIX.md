# Cashfree-Order CORS Preflight Fix

**Date:** 2026-08-20 · **Mode:** BUILD (targeted production bug — no broad audit) · **Deployed:** NO

## 1. Symptom

Browser checkout with Cashfree selected: clicking "Pay ₹1.00 via Cashfree" fires

```
POST https://osfhojfqytmqsqcmzvlf.supabase.co/functions/v1/cashfree-order
```

which fails before the function can create an order. Browser console:

- `CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource`
- `preflight request does not pass access control check`
- `net::ERR_FAILED`

## 2. Root Cause (exact, verified live)

The four callable Edge Functions in this project (`cashfree-order`, `cashfree-verify`, `phonepe-pay`, `phonepe-verify`) contained **no CORS handling at all** — no OPTIONS handling, no `Access-Control-Allow-*` headers on any response. They relied on an assumption that the Supabase platform injects CORS headers automatically. That assumption is false for function-generated responses:

**Live probe (2026-08-20) against the deployed project** — `OPTIONS /functions/v1/cashfree-order` with `Origin: https://ironpulse-liart.vercel.app` and browser `Access-Control-Request-*` headers:

- The OPTIONS request is **forwarded to the Deno handler** (response carries `x-deno-execution-id`, i.e. the function executed).
- The handler's first line `if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)` answered 405 **with no `Access-Control-Allow-Origin` header**.
- Browser → preflight fails → `net::ERR_FAILED` → order never created.
- Same result for `OPTIONS /functions/v1/phonepe-pay` and `/functions/v1/cashfree-webhook` (all function-generated 405s carry no CORS headers).

The only CORS headers visible in probes came from the **platform API gateway for gateway-generated rejections** (e.g. an invalid API key yields `Access-Control-Allow-Origin: *`), which confirms the gateway does not add CORS to responses the function itself produces. The platform's own documentation requires functions to handle CORS + preflight themselves (manual handling) unless they use the `withSupabase` server wrapper.

The two webhook functions (`phonepe-callback`, `cashfree-webhook`) are server-to-server (provider dashboards) — no browser, no CORS needed, which is why they "work". The callables are the ones that failed in the browser.

## 3. Fix (narrowly scoped)

**Allowed origins (verified intended):**

| Origin | Status |
|---|---|
| `https://ironpulse-liart.vercel.app` | Production (Vercel) — allowed |
| `http://localhost:3000` | Dev (Vite dev server port 3000 per `vite.config.js`) — allowed, intended dev origin |
| `http://127.0.0.1:3000` | Dev alias — allowed |
| everything else (incl. `*.supabase.co`, any other host, `null`) | **Denied — no CORS headers returned, browser blocks (fail-closed)** |

No wildcard `Access-Control-Allow-Origin: *` anywhere — the origin is **echoed** only when it matches the allow-list, plus `Vary: Origin`. JWT auth (`verify_jwt`), role checks (`isPaymentInitiator`/`isPaymentViewer`), gym-ownership checks, request validation, and server-side Cashfree secret usage are untouched. No secrets enter the browser; no second order path; webhook/HMAC logic untouched; `fulfill_payment` untouched.

### Files changed

| File | Change |
|---|---|
| `supabase/functions/_shared/cors.ts` | **NEW** — `ALLOWED_ORIGINS` allow-list, `isAllowedOrigin()`, `corsHeadersFor(origin)` (returns `null` fail-closed), `withCors(handler)` serve wrapper (answers OPTIONS preflight with 204 + CORS headers when allowed, plain 204 otherwise; attaches CORS headers to every response for allowed origins; no-op for server-side callers without an `Origin` header). |
| `supabase/functions/cashfree-order/index.ts` | Import `withCors`; `Deno.serve(withCors(handler))` (2-line change). Preflight + response headers now correct. |
| `supabase/functions/cashfree-verify/index.ts` | Same 2-line change — this function is called by `PaymentStatus.jsx` polling in the **same** browser flow and had the identical defect. |

`phonepe-pay` / `phonepe-verify` (legacy PhonePe fallback path, not part of the Cashfree flow) were **left untouched** — same latent defect, same 2-line fix applies if ever re-enabled; documented below.

### CORS behavior — before vs after

| Request | Before | After |
|---|---|---|
| `OPTIONS` + allowed origin + browser preflight headers | 405, no CORS headers → **preflight fails** | **204** with `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: authorization, apikey, x-client-info, content-type, x-retry-count`, `Access-Control-Max-Age: 3600`, `Vary: Origin` |
| `OPTIONS` + disallowed origin / no Origin | 405, no CORS headers | 204, **no** CORS headers (browser blocks — fail-closed) |
| `POST` (any path: success, validation error, 401/405) + allowed origin | no CORS headers | all CORS headers attached |
| `POST` + disallowed origin | n/a | response body evaluated normally but **no** CORS headers (browser cannot read it) |
| Any request without `Origin` (server-side callers, e2e harness, curl) | normal | **identical** — no CORS headers added, byte-identical body/status |

## 4. Tests

### CORS smoke — 13/13 PASS
`%TEMP%\opencode\cors-fix\` — real bundled `cashfree-order` + `cashfree-verify` (esbuild) + rules-modeled fake Supabase shim (s8g pattern):

- T1 OPTIONS allowed (prod) → 204 + echoed ACAO + allow methods/headers/max-age/vary
- T2 OPTIONS allowed (localhost:3000) → 204 + echoed ACAO
- T3 OPTIONS disallowed origin → 204, no ACAO (fail-closed)
- T4 OPTIONS no Origin → 204, no ACAO
- T5 POST allowed origin, no auth → JSON error + ACAO present
- T6 POST disallowed origin, valid auth → response without ACAO
- T7 POST allowed origin, happy path → order created + `paymentSessionId` + ACAO; attempt row persisted (status pending)
- T8 GET allowed origin → 405 + ACAO present
- T9 `cashfree-verify` OPTIONS → 204 + ACAO
- T10 `cashfree-verify` POST PAID order → `success` + ACAO + full fulfillment (attempt success, payments row, transaction id)
- T11 POST without Origin (server-side caller) → no CORS headers added (behavior unchanged)
- T12 no wildcard ACAO anywhere
- T13 allow-list: prod + dev allowed; evil / supabase.co / null / empty denied

### Regressions
- **s8g smoke: 77/77** — all 6 Edge Functions rebuilt from current source; zero behavioral change (the wrapper only acts when an `Origin` header is present; s8g sends none).
- **`npm run build`: 0 errors, 0 warnings** (client source unchanged).
- **dist secret scan: clean** — `cfsk_`, `CASHFREE_CLIENT_SECRET`, `x-client-secret` → 0 matches in `dist/`.

### Cashfree E2E harness (`%TEMP%\opencode\s9b-cashfree-e2e\e2e.mjs`)
**Current live run: 14/41 — NOT a regression of this fix, and it cannot be re-verified green today.** Evidence:

1. The failure is entirely in the **webhook processing** path: `cashfree-order` still creates real sandbox orders (PASS), but the webhook acks 200 without processing (fail-closed) — attempts stay pending.
2. The webhook source is **untouched** (git status: only `cashfree-order` / `cashfree-verify` / new `cors.ts`); nothing was deployed; the harness hits the live, unchanged deployed functions.
3. The harness signs with the sandbox secret from `OneDrive\Documents\APIKey Test.csv` (unchanged since 8/16). Probe: those CSV credentials are **valid** against the Cashfree sandbox Orders API (GET nonexistent order → 404, i.e. auth passed; invalid creds → 401). Therefore the **deployed Edge Function secret `CASHFREE_CLIENT_SECRET` differs from the CSV secret** — the live webhook computes a different HMAC key and rejects every event (fail-closed 200s). This is an operator-side environment mismatch (deployed secrets), pre-existing since the last 40/40 pass (2026-08-16).
4. The simulated webhook HMAC path (s8g T33–T49 with the real current source) passes 77/77 — the source is correct; the live deployment disagrees only via its secrets.

Operator action to re-enable the E2E: reconcile `supabase secrets set CASHFREE_CLIENT_ID=… CASHFREE_CLIENT_SECRET=…` with the same sandbox pair used by the harness CSV, then re-run `e2e.mjs` (it self-cleans fixtures).

## 5. Deployment required

**Yes — Edge Function deployment is required for the fix to take effect** (client is already correct; this is a server-side-only change):

```
supabase functions deploy cashfree-order
supabase functions deploy cashfree-verify
```

(`_shared/cors.ts` is bundled into each function at deploy time.) No `verify_jwt` flags change (both remain JWT-protected callables). No DB migrations, no `firestore.rules`, no hosting deploy strictly required (client unchanged), no provider webhook URL changes. **Not deployed in this task by instruction.**

## 6. Residual notes

- `phonepe-pay` / `phonepe-verify` carry the identical latent CORS defect (legacy fallback path). If the PhonePe fallback is ever exercised from the browser again, apply the same two lines (`import { withCors } …` + `Deno.serve(withCors(handler))`) and deploy. Left untouched here per scope.
- The `VITE_CASHFREE_CLIENT_ID`/`VITE_CASHFREE_MODE=sandbox` configuration from Step 0017 remains the cashfree-enabled state; no pricing or gateway selection logic was touched.
- The platform's automatic CORS only covers gateway-generated responses (e.g. invalid API key); every function-generated response must carry CORS headers itself — this is now the documented pattern for any future browser-invoked Edge Function.