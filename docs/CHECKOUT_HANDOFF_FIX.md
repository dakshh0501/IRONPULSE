# CHECKOUT HANDOFF & CASHFREE ENABLEMENT — FIX REPORT

Date: 2026-08-20
Scope: client-only fixes (no schema, no RLS, no Edge Function, no migration changes).
State: **NOT DEPLOYED** (per task instruction). Changes are in the working tree
(commits: none made — operator must commit + deploy hosting).

---

## 1. Confirmed bugs and root causes

### Bug 1 — Checkout always fell back to PhonePe (Cashfree never enabled)

**Symptom**: The Cashfree branch was never selected; every checkout hit the
PhonePe fallback despite sandbox credentials being configured.

**Root cause** (confirmed in `src/services/cashfreeService.js`, lines 40–43):

```js
export function isCashfreeConfigured() {
  const cfg = getCashfreeConfig()
  return !!(cfg.appId && cfg.clientId)
}
```

`getCashfreeConfig()` read `VITE_CASHFREE_APP_ID` into `appId` and
`VITE_CASHFREE_CLIENT_ID` into `clientId`. But the Cashfree App ID **is** the
public client identifier (the value sent as `x-client-id` in API calls) — the
two env names are aliases for the SAME credential. The deployment sets only
`VITE_CASHFREE_APP_ID=13683606c33c09f0fc51c9822430638631` (sandbox), and
`VITE_CASHFREE_CLIENT_ID` is intentionally absent. Therefore
`isCashfreeConfigured()` always returned `false`, `cashfreeEnabled=false`, and
`handlePay()` routed to `initiatePayment` (PhonePe).

**Fix** (`src/services/cashfreeService.js`):

- `getCashfreeConfig()` now resolves a single canonical public id:
  `const canonicalId = import.meta.env.VITE_CASHFREE_APP_ID || import.meta.env.VITE_CASHFREE_CLIENT_ID || ''`
  and returns `{ mode, appId: canonicalId, clientId: canonicalId, apiVersion }` —
  both names are populated from the one credential, so the SDK loader
  (`load({ mode, env: { CASHFREE_APP_ID, CASHFREE_CLIENT_ID } })`) receives a
  valid value whichever env name is set.
- `isCashfreeConfigured()` now returns `!!cfg.clientId` (single gate).
- Backward compatible: a deployment that still sets the legacy
  `VITE_CASHFREE_CLIENT_ID` name works unchanged.

### Bug 2 — Checkout displayed "Plan: Trial, Total: ₹1.00" after choosing Standard

**Symptom**: From the gym subscription page, selecting **Standard → Confirm
Upgrade** landed on `/checkout?subId=<id>&type=new` showing Plan = Trial,
Total = ₹1.00.

**Root cause** (confirmed against the deployed bundle, commit `ceb9d91`
"Configure Cashfree sandbox checkout"):

1. The deployed `GymSubscription.jsx` had **no checkout handoff for
   upgrade/renew** — `handleUpgrade`/`handleRenew` performed direct lifecycle
   RPCs; the only navigation to checkout was the "Pay Now" button
   (`goPayNow` → `/checkout?subId=...&type=new`).
2. The deployed `Checkout.jsx` was **row-driven**: it displayed
   `sub.plan` / `sub.amount` from the `subscriptions` row. For the Paytest gym
   the row is `plan='Trial'`, `amount=100` (paise — corrected to ₹1.00 in Step
   0017). Hence "Trial ₹1.00".
3. The working-tree fix (this task's handoff work) was **uncommitted** — the
   deployed bundle never contained it.

**Fix** (working tree, uncommitted):

- `src/pages/GymSubscription.jsx`: `handleUpgrade`/`handleRenew` now navigate
  to checkout for paid targets, carrying the target plan as a query parameter:
  `/checkout?subId=<rowId>&type=upgrade&plan=Standard`
  `/checkout?subId=<rowId>&type=renewal&plan=Standard`
  ₹0 targets (Trial) keep the direct lifecycle path (no payment needed).
- `src/pages/Checkout.jsx`: parses `plan` + `type` query params; when
  `type ∈ {upgrade, renewal}` and the plan is a known key of `PLAN_AMOUNTS`,
  it renders the **pending target plan** (`effectivePlan`) and computes the
  amount from the centralized pricing config
  (`PLAN_AMOUNTS[targetPlan]`, `src/constants/plans.js` — the client-side
  mirror of the server `plan_pricing` table), NOT from the subscription row.
- **The database is never mutated before payment.** Checkout performs zero
  writes; the row stays `plan='Trial'` until `fulfill_payment` runs
  server-side after a successful sandbox payment. On cancel, the row is
  untouched (still Trial).
- `handleCollectPayment` (Cashfree) and `initiatePayment` (PhonePe) both send
  `plan: effectivePlan`, `finalAmount` in paise, `subscriptionId`,
  `gymId`, `type`.

**Handoff mechanism used: QUERY PARAMETER** (task option B) —
`/checkout?subId=<id>&type=<upgrade|renewal>&plan=<Plan>`. State (the target
plan) is carried in the URL; the database is left unchanged until the
server-side `fulfill_payment` RPC applies the upgrade after a successful
payment. This satisfies "DB remains Trial before payment; checkout displays
Standard ₹1".

---

## 2. Files changed

| File | Change |
|------|--------|
| `src/services/cashfreeService.js` | Canonical public-id resolution (`APP_ID \|\| CLIENT_ID`); gate now single-id; comments |
| `src/pages/Checkout.jsx` | Target-plan display + authoritative amount (working tree, uncommitted) |
| `src/pages/GymSubscription.jsx` | Upgrade/Renew → checkout handoff with `plan` query param (working tree, uncommitted) |
| `.env.example` | Documented alias semantics (either env name enables Cashfree; value from merchant dashboard) |
| `.env.production.example` | Same |

Not changed (by task constraint): `supabase/functions/*` (cashfree-order,
cashfree-verify, cashfree-webhook, phonepe-*), `supabase/migrations/*`
(fulfill_payment, update_gym_subscription, plan_pricing), firestore rules,
webhook URLs. No Firebase re-introduced. No second payment system.

---

## 3. Server-side validation (unchanged, for reference)

- `cashfree-order` Edge: role check, gym ownership check, `finalAmount > 0`
  (paise), `subscriptionId` required for renewal/upgrade, 30-min
  `expires_at`, pending-attempt idempotency (same subscriptionId → same
  attempt), amount converted paise→rupees server-side, order created with
  `x-client-id` from **server secrets only** (never in browser).
- `cashfree-webhook`: HMAC-SHA256 over `x-webhook-timestamp + rawBody`
  (byte-exact), ≤5 min replay guard, fail-closed, exactly-once via
  `fulfill_payment`.
- `fulfill_payment` RPC (0009): atomic status claim (`SELECT ... FOR UPDATE`
  + `UPDATE ... WHERE status='pending'` + row-count check), exactly-once;
  `upgrade` branch applies `v_attempt.plan` (the plan the client sent as
  `plan: effectivePlan`) and recomputes expiry; `renewal`/`new` mark
  paid+activate with the row's pre-set dates. Service-role only.
- `update_gym_subscription` RPC (0016): amount cross-checked against the
  `plan_pricing` table (used by direct lifecycle paths).

Residual (documented, not changed per minimal-change/no-deploy constraint):
the order edges validate `finalAmount > 0` and gym ownership but do not
cross-check plan↔amount against `plan_pricing`; the client amount derives
from `PLAN_AMOUNTS` which mirrors `plan_pricing` (Trial 0, paid 100 paise).

---

## 4. Build & test verification

- `npm run build`: **0 errors, 0 warnings** (21.96s; entry `index-9RYNw095.js`).
- `npx eslint` on changed files: **0 errors**, 7 warnings — all pre-existing
  baseline (Checkout `gymId` unused; GymSubscription `err`×5, `handleActivate`
  unused), verified identical via git-stash baseline in the prior session.
- Dist bundle evidence (minified, verified directly):
  - `cashfreeService-*.js` chunk: `const r="13683606c33c09f0fc51c9822430638631"; return{mode:sandbox, appId:r, clientId:r}` and `isCashfreeConfigured` constant-folded to `!0` (true) — the sandbox ID present at build time enables Cashfree; the env reference is fully inlined (zero `VITE_CASHFREE_APP_ID` refs remain).
  - Checkout chunk: `plan` query-param parsing present; upgrade/renewal branch strings present.
- Probes (harness, real bundled modules):
  - `probe-cashfree-gate.cjs` **5/5**: configured=true with APP_ID only / CLIENT_ID only / both / APP_ID+production; false with neither; appId===clientId in all cases.
  - `probe-handoff-chain.cjs` **14/14**: upgrade URL `type=upgrade&plan=Standard`; checkout resolves effectivePlan=Standard, amount=100 → ₹1.00; row untouched (Trial); order params `{type, subscriptionId, plan:'Standard', finalAmount:100}`; renewal same; Pay Now (`type=new`) unchanged row-driven; missing row id → friendly error, no navigation.
- Regression suites (rebuilt from current source): **s8b 56/56** (0 Firebase calls), **s8c 101/101**, **s8e 73/73**, **s8f 35/35**, **s8g 77/77** (incl. T16/T38 verify→fulfill, T50 upgrade, T51 renewal, T52 new), **s8p 27/27**, **s8x 16/16**.
- Cashfree sandbox E2E (40/40, Step 9B): **NOT re-run** — it creates real
  sandbox orders against live edges and the task prohibits making real
  payments; since no Edge/RPC/webhook file changed, it remains green by
  construction.
- Secret scan of `dist`: no `cfsk_`, `CASHFREE_CLIENT_SECRET`,
  `x-client-secret`, `service_role`, `CASHFREE_SALT` anywhere. Only match is
  the supabase-js SDK internal REST path `/realtime/client_secrets` (endpoint
  name, benign — previously classified in Step 9A). The sandbox App ID is
  public by design (it is the `x-client-id`).

---

## 5. Environment variables required (exact)

Client (`VITE_` — all public, build-time inlined):

| Var | Value | Required? |
|-----|-------|-----------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | project URL + anon key | yes (app bootstrap) |
| `VITE_AUTH_PROVIDER=supabase` | auth + data plane | yes |
| `VITE_CASHFREE_MODE=sandbox` | gateway mode | yes for test |
| `VITE_CASHFREE_APP_ID=13683606c33c09f0fc51c9822430638631` | **canonical** public id (alias of client id) | **yes — this is what enables Cashfree** |
| `VITE_CASHFREE_CLIENT_ID` | optional legacy alias (same value) | no (alias) |
| `VITE_GROQ_API_KEY` / `VITE_GROQ_MODEL` | Pulse AI | optional |

Server (Supabase secrets — NEVER client-side):
`CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, optional `CASHFREE_MODE`;
PhonePe: `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`.
(Set in the Edge-Function secret store; `CASHFREE_MODE` default sandbox.)

---

## 6. Readiness for Cashfree Sandbox testing

- Client gate: **READY** — with `VITE_CASHFREE_APP_ID` set, the built bundle
  constant-folds `isCashfreeConfigured()` to true and routes checkout to the
  Cashfree SDK modal (never PhonePe).
- Order flow: **READY** — `/checkout` → `cashfree-order` (server) → SDK
  `_modal` → `/payment-status?attemptId=..&order_id=..&source=cashfree` →
  poll `cashfree-verify` until the webhook/fulfillment lands.
- Fulfillment: **READY** — `fulfill_payment` exactly-once; upgrade applies
  Standard + recomputed expiry only after success; cancel leaves Trial.
- What the operator must still do: commit + deploy hosting (the bundle on
  Vercel is the pre-fix `index-_-ZK25p_.js` era); confirm Edge secrets are
  set; then validate against a real dashboard "Test Webhook" event per the
  Step 9B checklist before flipping provider webhook URLs to the Edge
  Functions.

## 7. Remaining notes / risks

- The two page fixes (`Checkout.jsx`, `GymSubscription.jsx`) are **uncommitted
  working-tree changes** — they must be committed and the new bundle deployed
  for Bug 2 to be fixed in production.
- Renewal flow: after successful payment, `fulfill_payment` marks the row
  paid/active preserving the row's pre-set dates (pre-existing RPC behavior —
  flag for a product decision if renewal should recompute dates instead).
- Order edges do not cross-check plan↔amount vs `plan_pricing` (see §3).
- `Pay Now` (`type=new`) intentionally remains row-driven — it pays the
  current plan's invoice; the upgrade/renew paths carry the target plan.