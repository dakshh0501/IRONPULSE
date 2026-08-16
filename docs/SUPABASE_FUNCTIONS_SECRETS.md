# SUPABASE FUNCTIONS SECRETS — Step 8G

**No secret values in this file, in the repo, or in the browser.**
All secrets are injected by the Supabase platform at deploy/runtime and
read exclusively inside Edge Functions via `Deno.env.get()`.

---

## 1. Secret inventory (Edge Functions)

| Secret | Used by | Purpose | Set with |
|--------|---------|---------|----------|
| `PHONEPE_MERCHANT_ID` | phonepe-pay, phonepe-verify, phonepe-callback | PhonePe V1 API merchant id (prefix `PGTEST` = sandbox) | `supabase secrets set PHONEPE_MERCHANT_ID=...` |
| `PHONEPE_SALT_KEY` | phonepe-pay, phonepe-verify, phonepe-callback | Checksum salt for pay + status endpoints | `supabase secrets set PHONEPE_SALT_KEY=...` |
| `PHONEPE_SALT_INDEX` | phonepe-pay, phonepe-verify, phonepe-callback | Checksum suffix (1 or 2) | `supabase secrets set PHONEPE_SALT_INDEX=...` |
| `CASHFREE_CLIENT_ID` | cashfree-order, cashfree-verify, cashfree-webhook | Cashfree API client id (x-client-id header) | `supabase secrets set CASHFREE_CLIENT_ID=...` |
| `CASHFREE_CLIENT_SECRET` | cashfree-order, cashfree-verify, cashfree-webhook | API secret (x-client-secret header) AND webhook HMAC key | `supabase secrets set CASHFREE_CLIENT_SECRET=...` |
| `CASHFREE_MODE` | cashfree-order, cashfree-verify, cashfree-webhook | `production` or (default) `sandbox` — selects the API base URL | `supabase secrets set CASHFREE_MODE=production` (optional) |

## 2. Platform-managed (already present in the runtime, never set manually)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project URL (client factory) |
| `SUPABASE_ANON_KEY` | Anon key — used ONLY for `auth.getUser()` JWT verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — DB access for the Edge Functions; **never** in the browser |

## 3. Client-side variables (public, already in `.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | supabase-js client |
| `VITE_CASHFREE_APP_ID` / `VITE_CASHFREE_CLIENT_ID` | Cashfree v3 SDK public creds (checkout modal) |
| `VITE_CASHFREE_MODE` | UI display only — the SERVER mode is `CASHFREE_MODE` |

## 4. Parity table — Firebase Secret Manager → Supabase secrets

| Firebase secret (functions) | Supabase secret |
|-----------------------------|-----------------|
| `PHONEPE_MERCHANT_ID` | `PHONEPE_MERCHANT_ID` (same name) |
| `PHONEPE_SALT_KEY` | `PHONEPE_SALT_KEY` |
| `PHONEPE_SALT_INDEX` | `PHONEPE_SALT_INDEX` |
| `CASHFREE_CLIENT_ID` | `CASHFREE_CLIENT_ID` |
| `CASHFREE_CLIENT_SECRET` | `CASHFREE_CLIENT_SECRET` |
| `CASHFREE_MODE` | `CASHFREE_MODE` |

## 5. Rotation & hygiene

- Rotate `CASHFREE_CLIENT_SECRET` / `PHONEPE_SALT_KEY` on the provider dashboards
  AND `supabase secrets set` the new value before the old one is disabled.
- Webhook HMAC uses the SAME `CASHFREE_CLIENT_SECRET` — rotating it rotates
  webhook verification automatically (both read the secret at call time).
- Never commit `.env`, never log `Deno.env.get(...)` output, never echo a
  secret in an error response (all Edge Function error paths return generic
  messages — provider responses are the only external payloads).
