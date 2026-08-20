# CHECKOUT PAYMENT ROUTING FIX

**Date**: 2026-08-20
**Mode**: BUILD (implemented, verified — NOT deployed)
**Scope**: Checkout amount correction + Cashfree provider configuration enablement.
No payment provider routing logic changed, no webhook/fulfillment logic changed, no RLS changed, no migrations added, no Firebase reintroduced, no production payment created.

---

## Confirmed root causes (recap)

1. **Stale amount on the Paytest subscription row** — `subscriptions.amount = 9999.00` was written at approval time (2026-08-17) because `calculateSubscriptionAmount('Trial')` used `PLAN_AMOUNTS['Trial'] || ...` where `PLAN_AMOUNTS['Trial'] = 0` is **falsy** → it fell through to `PLAN_AMOUNTS['Standard']` (= 9999 paise at that time). The `subscriptions` row is never rewritten by lifecycle operations in Supabase mode (they only update the `gyms.subscription` jsonb via RPC), so the stale 9999 stayed frozen and checkout read `sub.amount = 9999` → ₹99.99.
2. **Cashfree disabled** — `isCashfreeConfigured()` (`cashfreeService.js:40-43`) requires both `VITE_CASHFREE_APP_ID` and `VITE_CASHFREE_CLIENT_ID`. `VITE_CASHFREE_CLIENT_ID` was absent from `.env` (and Vercel) → the gate returned `false` → Checkout fell back to PhonePe. Additionally `VITE_CASHFREE_MODE="PRODUCTION"` was uppercase and quoted (dotenv strips quotes → `"PRODUCTION"` ≠ `'production'` → it already resolved to sandbox, but the value was misleading).

---

## Exact files changed

| File | Change |
|------|--------|
| `src/services/firestoreService.js` | `calculateSubscriptionAmount()` (`~L693-710`): fallback chain changed from `PLAN_AMOUNTS[plan] \|\| PLAN_AMOUNTS['Standard'] \|\| 0` to `PLAN_AMOUNTS[plan] ?? PLAN_AMOUNTS['Standard'] ?? 0` (nullish coalescing). `0` is now a valid amount — a Trial subscription correctly resolves to ₹0 instead of falling through to the Standard price. Only an unknown plan key falls back to Standard. Param renamed to `_billingSettings` (pre-existing unused-param warning silenced; signature/call sites unchanged). Added an explanatory comment documenting the historical `\|\|` bug. |
| `.env` | `VITE_CASHFREE_MODE="PRODUCTION"` → `VITE_CASHFREE_MODE=sandbox` (lowercase, unquoted — the intended test target). Comment updated: sandbox intent + explicit note that `VITE_CASHFREE_CLIENT_ID` is intentionally not set here and must come from the merchant. **No credential invented or written.** |
| `.env.example` | Cashfree block: documented that `VITE_CASHFREE_CLIENT_ID` value must come from the **merchant's own Cashfree account** (Dashboard → Settings → API Keys) and that without it the checkout stays on the PhonePe fallback; `mode` must be lowercase (no quotes). |
| `.env.production.example` | Same documentation updates as `.env.example`. |

No other source files changed. No routing-code change (`if (cashfreeEnabled)` gate at `Checkout.jsx:46/81-105` untouched).

---

## Exact data change (live DB)

```sql
update public.subscriptions
set amount = 100          -- ₹1 = 100 paise (current test pricing)
where id = '7a00af92-0c77-4d7d-9657-2410028dfbab'
  and gym_id = 'gym-1786961016948';   -- PayGym only
```

Applied via the Management API harness (`%TEMP%\opencode\s9b\run-sql-file.ps1`) and verified:

```json
{
  "id":  "7a00af92-0c77-4d7d-9657-2410028dfbab",
  "gym_id":  "gym-1786961016948",
  "plan":  "Trial",
  "plan_type":  "Trial",
  "amount":  "100.00",
  "currency":  "INR",
  "status":  "active",
  "payment_status":  "paid"
}
```

- Scoped by `id` **and** `gym_id` → only this single row was modified; no unrelated subscriptions touched.
- A direct SQL update was required (documented explicitly per spec): the existing service update path (`updateSubscription`) is super-admin-RLS-gated and needs an authenticated super-admin session; the Management API SQL path is the auditable, already-proven live-DB mechanism.

---

## Tests

| Suite | Result | Coverage |
|-------|--------|----------|
| `s8c\probe-calc-amount.cjs` (NEW, bundles real `firestoreService.js`) | **4/4** | 1. `addSubscription({plan:'Trial'})` → row `amount = 0` (zero valid, **not** Standard fallback — the exact bug). 2. `addSubscription({plan:'Standard'})` → `amount = 100` (₹1 test pricing). 3. Unknown plan `'Bogus'` → `amount = 100` (Standard fallback preserved). 4. Checkout amount chain (`Checkout.jsx:44-45` semantics) on the corrected row → `amount = 100` → **`₹1.00`**. |
| `s9b\gate-probe.cjs` (NEW, bundles real `cashfreeService.js` with build-time `VITE_*` defines) | **4/4** | 1. `VITE_CASHFREE_CLIENT_ID` present + mode `sandbox` → `isCashfreeConfigured() = true` (Cashfree branch enabled). 2. clientId missing (current prod state) → `false` (PhonePe fallback). 3. mode `production` → resolves `production`. |
| `s8c\smoke.cjs` (full regression, rebuilt from current source) | **101/101** | Full Supabase data-plane CRUD/RLS matrix incl. subscription CRUD. |
| `s8e\smoke-s8e.cjs` (full regression, rebuilt from current source) | **73/73** | Subscription lifecycle / RPC / write-path matrix. |

## Build

`npm run build` → **0 errors, 0 warnings** (~6.5s). Entry: `dist/assets/index-BGgeCL1_.js` (before final param-rename rebuild: `index-B88y_Fxg.js`; final build regenerated the tree — current dist reflects the last source state).

## Bundle security scan (dist)

- Secret patterns `cfsk_`, `CASHFREE_CLIENT_SECRET`, `x-client-secret`, `api.cashfree.com`, `sandbox.cashfree.com`: **0 matches** (exit 1 = clean).
- Firebase SDK symbols (`initializeApp`, `getFirestore`, `getAuth(`, `getFunctions`, `httpsCallable`): **0 matches** (no Firebase in the frontend bundle).
- `src` eslint: `firestoreService.js` → **0 errors, 0 warnings**.

---

## Environment variable still required from operator

**`VITE_CASHFREE_CLIENT_ID`** — the real merchant value, from the merchant's Cashfree account (**Cashfree Dashboard → Settings → API Keys**). It must be set in `.env` (local builds) **and** in the Vercel/production environment variables, then the hosting bundle rebuilt/redeployed. Until it is supplied, the checkout intentionally uses the PhonePe fallback (no default/dummy value is invented). Not a secret — it is the public client id the v3 SDK needs to load the checkout modal.

Already in place (no action): server-side Edge Function secrets `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_MODE=sandbox` (digest-verified per `docs/SUPABASE_BACKEND_DEPLOYMENT_VALIDATION.md`).

## Will checkout now show ₹1 once the client ID is configured?

**Yes.** With the corrected row (`amount = 100`):
- `Checkout.jsx:44` → `amount = 100`; `Checkout.jsx:45` → **`₹1.00`**; `Checkout.jsx:279` button → **"Pay ₹1.00 via Cashfree"**.
- Provider: once `VITE_CASHFREE_CLIENT_ID` is supplied, `isCashfreeConfigured()` returns `true` → `Checkout.jsx:46` → the Cashfree branch (`handleCollectPayment` → `cashfree-order` Edge → SDK modal, sandbox) runs; the PhonePe branch (`handlePay` → `phonepe-pay` Edge) is **not** executed while Cashfree is configured. Without the client ID, PhonePe remains the fallback (unchanged behavior).
- Sandbox mode is explicit: `VITE_CASHFREE_MODE=sandbox` (lowercase) in `.env`.

## Deployment

**STOPPED BEFORE DEPLOYMENT** per spec. When the operator is ready: add `VITE_CASHFREE_CLIENT_ID` (merchant value) to `.env`/Vercel → `npm run build` → hosting deploy. No `supabase db push`, no Edge Function deploy, no RLS/migration changes are required for this fix.