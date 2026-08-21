# Pay Now Subscription Data Mismatch Fix

**Date:** 2026-08-20 · **MODE:** BUILD (targeted bug — no broad audit) · **Deployed:** NO (STOP before deployment, per instruction)

## 1. Symptom (live recording)

Subscription page (`/subscription`) shows the authoritative current plan:

- Current Plan = Standard · Status = Active · Payment = paid · Expiry = 23 Oct 2026

Clicking **Pay Now** navigates to `/checkout?subId=<existing-id>&type=new` and Checkout shows:

- **Plan = Trial · Type = New · Total = ₹1.00**

i.e. checkout displayed a stale "Trial" plan while the real current subscription is Standard — a payment-decision source mismatch.

## 2. Root cause (exact)

IRONPULSE keeps **two** subscription representations:

| Source | Table | Contents | Authority |
|---|---|---|---|
| `currentSubscription` (page `sub`) | `gyms.subscription` **jsonb** | plan/planName, status, paymentStatus, expiryDate, … | **AUTHORITATIVE** (written by lifecycle RPCs + `fulfill_payment`) |
| Billing row | `subscriptions` table | plan, amount, status, expiry_date, … | **Legacy mirror** — created at gym approval, **never rewritten** by supabase lifecycle ops (RPCs only update the jsonb) |

For the recorded gym: the jsonb says Standard/active/paid/23-Oct-2026, while the `subscriptions` row is stale (plan `Trial`, created at approval). `GymSubscription.jsx` `goPayNow` navigated with **`type=new` and no plan param**, and `Checkout.jsx` derived the displayed/charged plan from the billing row (`sub.plan`) whenever no target plan was present → "Plan = Trial".

Additional facts confirmed during the fix:

- No client-visible "outstanding payment" state exists anymore: gym approval marks both jsonb and row as `paid` immediately; `getPendingAttemptsForSubscription` is a no-op (`[]`) in Supabase mode by design (Step 8E); nothing writes `pending` before payment (requirement F already holds).
- A "Trial payment" is additionally **blocked server-side** (₹0 finalAmount fails the positive-amount validation in `cashfree-order`), so the defect was display/routing-level, but it still presented a wrong plan and could route a paying user into a meaningless "new Trial" payment intent.
- The `plan` URL param is the linchpin of the whole flow: `Checkout` → `handlePay` → attempt `plan` → `fulfill_payment` `v_new_plan = coalesce(attempt.plan, 'Standard')` (0009). Passing no plan made the stale row decide the plan server-side too.

## 3. Fix (3 files, client-only; zero DB/RLS/migration/webhook/fulfillment changes)

### `src/pages/GymSubscription.jsx`
- New `currentPlan` memo — reads the plan identity **only from the authoritative jsonb** (`sub.planName` → `sub.plan`, validated against `PLAN_AMOUNTS`, `Trial` excluded, fallback `Standard`). The billing row contributes only its **id** (payment-attempt target), never a plan/payment decision.
- New `showPayNow` gate — Pay Now renders **only when there is something outstanding to pay**:
  - `paymentStatus !== 'paid'` (unpaid state) **or** `status === 'expired'` (lapsed → restart),
  - **and** the current plan is not `Trial` (₹0 plans are never payable).
  - Active+paid (the recorded case) → **Pay Now hidden**; Renew / Upgrade are the correct flows there.
- `goPayNow` now passes the correct target: `/checkout?subId=<id>&type=new&plan=<currentPlan>`.

### `src/pages/Checkout.jsx`
- Target-plan semantics extended to `type=new`: when a valid `plan` param is present (`PLAN_AMOUNTS` key, `Trial` excluded), Checkout uses it for the plan badge **and** the amount (`PLAN_AMOUNTS[targetPlan]` — the single authoritative pricing source, matching the server's `plan_pricing` validation).
- Fallback hardened: when no target plan exists (legacy direct-URL entry), the billing row's plan is used only if it is a valid non-`Trial` plan; otherwise `Standard` — a "Trial New" charge can never be displayed or initiated.

### `src/pages/superadmin/Subscriptions.jsx` (drawer "Pay Now (Cashfree)")
- Same defect class: now resolves the plan from the authoritative gym jsonb (`gyms[].subscription.planName || .plan`, validated, `Trial` excluded) with the row plan / `Standard` as fallback.
- Routes contextually: row `active` + `paid` (no outstanding payment) → **renewal** payment flow (`type=renewal`, per requirement B's allowed alternative); otherwise → `type=new`. Both carry `&plan=<resolved>`.

## 4. Semantics implemented

| Flow | Behavior after fix |
|---|---|
| **Pay Now** (active + paid) | **Not shown** — no outstanding payment (requirement A + B option 1) |
| **Pay Now** (unpaid jsonb or expired) | Shown → `/checkout?type=new&plan=<authoritative current plan>` — never "new Trial" |
| **Renew** | Unchanged flow: `/checkout?type=renewal&plan=<selected>` for paid plans (requirement C; already correct) |
| **Upgrade Plan** | Unchanged flow: `/checkout?type=upgrade&plan=<target>` (requirement D; already correct) |
| **Checkout display** | upgrade/renewal/new-with-plan show the **target plan** (requirement E); amounts from `PLAN_AMOUNTS` only |
| Pre-payment DB writes | **None** — no jsonb/row mutation before payment (requirement F; verified unchanged) |
| `fulfill_payment` / webhook / HMAC / RLS / migrations | **Untouched** (requirements G/H/I) |

## 5. Verification

- `npm run build` → **0 errors, 0 warnings** (built in 20.52s).
- ESLint on the 3 changed files → **0 NEW** findings (13 pre-existing baseline items, all in untouched lines: unused `gymId`/`err`/`handleActivate` in GymSubscription; `Date.now` purity ×5 + unused `i` in superadmin/Subscriptions).
- Regressions rebuilt from current source:
  - s8c (firestoreService data plane) **101/101**
  - s8e (write paths/RPCs) **73/73**
  - s8b (auth) **56/56**
- Test matrix mapping:
  1. Current Standard/paid → Pay Now **hidden** (no Trial/New payment possible) ✓
  2. Current Standard/paid → Renew → `/checkout?type=renewal&plan=Standard` (renewal payment flow) ✓
  3. Current Standard → Upgrade → `/checkout?type=upgrade&plan=<target>` shows target plan + `PLAN_AMOUNTS[target]` amount ✓
  4. Current Trial → Pay Now hidden (₹0 not payable); Upgrade flow unchanged ✓
  5. No pre-payment subscription mutation — no writes added anywhere; checkout still pure ✓
  6. Build 0/0 ✓
  7. Existing suites green (above) ✓

## 6. Residual notes (known, out of scope by design)

- Renewal/upgrade expiry math lives in the `fulfill_payment` RPC (`coalesce(v_new_expiry, v_sub.expiry_date, v_gsub->>'expiryDate')`); the RPC contract expects the client to pre-set `subscriptions.expiry_date` before new/renewal payments, but this build intentionally performs **no** pre-payment writes (requirement F). With a NULL row `expiry_date` (the norm for rows created at approval), renewal/upgrade therefore preserve the existing jsonb expiry — no regression, but no extension either. Extend / Change Plan admin actions remain the immediate tools; aligning the renewal staging write is a separate product decision (server contract says "client pre-sets"), deliberately not implemented here to keep payment purity.
- Stale `subscriptions` rows themselves (e.g. plan Trial) are left untouched — they are no longer consulted for any plan/payment decision; only their id is used. An optional data-cleanup migration is out of scope (would touch RLS/migrations, which requirement I forbids).
- Deployment: client-only — hosting deploy of the current `dist` (entry `index-DyzYvkRB.js`) is required for the fix to go live. **Not deployed** per instruction.