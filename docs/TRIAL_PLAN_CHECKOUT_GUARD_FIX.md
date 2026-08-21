# Trial / Invalid Plan Checkout Guard Fix

**Date:** 2026-08-20 · **MODE:** BUILD (small targeted fix) · **Deployed:** NO (STOP before deployment, per instruction)

## 1. Problem (confirmed)

Two residual "silent Standard" fallbacks survived the previous Pay Now fix:

1. `src/pages/GymSubscription.jsx` — `currentPlan` returned **`'Standard'`** when the authoritative jsonb held only Trial / invalid / missing values. A Trial subscription would therefore present as "Standard" and (with an outstanding-payment state) expose Pay Now → a Standard ₹1 checkout.
2. `src/pages/Checkout.jsx` — `amount` fell back to `PLAN_AMOUNTS['Standard'] ?? 0` and `effectivePlan` fell back to `'Standard'` when the target plan was missing, invalid, or the billing row said Trial. A malformed/stale checkout URL could silently become a Standard ₹1 payment; the billing row's stale `originalAmount` was also leaked into the attempt (`discountAmount` noise).

## 2. Fix — one canonical validation (4 files, client-only)

### `src/constants/plans.js` — canonical helpers (single source of truth, pure)
- `isValidPaidPlan(plan)` — `true` only for a `PLAN_AMOUNTS` key with amount > 0 (Trial and any ₹0 plan excluded). No fallback plan exists by construction.
- `resolveCurrentPlan(planName, plan)` — first valid payable plan from the authoritative jsonb candidates (`planName` → `plan`); **null** when only Trial/invalid/missing values exist.
- `resolveCheckoutPlan(paymentType, targetPlan)` — canonical `/checkout` validation: type must be `new`/`renewal`/`upgrade` AND target plan must be a valid paid plan → `{ valid: true, plan, amount: PLAN_AMOUNTS[targetPlan] }`, else `{ valid: false, plan: null, amount: 0 }`.

### `src/pages/GymSubscription.jsx`
- `currentPlan` = `resolveCurrentPlan(sub?.planName, sub?.plan)` — Trial/invalid/missing → **null** (no Standard invention).
- `showPayNow = !!subRowId && !!currentPlan && (paymentStatus !== 'paid' || status === 'expired')` — Pay Now requires a valid payable current plan AND outstanding payment; Trial can never show it.
- `goPayNow` — returns without navigating when `!subRowId || !currentPlan`; otherwise `/checkout?subId=..&type=new&plan=<currentPlan>`.

### `src/pages/Checkout.jsx`
- Plan/amount derivation replaced by the canonical `resolveCheckoutPlan(paymentType, targetPlan)` → `checkoutValid`, `effectivePlan`, `amount`. The billing row contributes **only its id** (payment-attempt target), never a plan/amount authority.
- Invalid state → **blocking error page** ("Invalid payment plan. Please return to Subscription and try again." + Back to Subscription) — no form, no pay button, nothing can initiate an order.
- `handlePay` first-line guard (defense-in-depth): `checkoutInvalid` → set the same error, return, before any gateway call.
- `originalAmount: amount`, `discountAmount: 0` (both gateways) — stale row amounts no longer leak into the attempt; pricing authority is `PLAN_AMOUNTS` only.

### `src/pages/superadmin/Subscriptions.jsx` (same defect class, found by inspection)
- Drawer "Pay Now (Cashfree)" plan resolution now uses `isValidPaidPlan` (gym jsonb → row) with **no `'Standard'` fallback**; when nothing valid resolves, the `plan` param is omitted and the Checkout blocking page shows the clear error.

## 3. Business rules satisfied

1. Trial is not payable — `isValidPaidPlan('Trial') === false`; `resolveCheckoutPlan(_, 'Trial')` blocked.
2. A paid checkout requires an explicit valid target plan — `{ valid: false }` otherwise.
3. Valid targets come from `PLAN_AMOUNTS` only — amount always `PLAN_AMOUNTS[targetPlan]`.
4. Upgrade `type=upgrade&plan=<valid>` → allowed (Standard/Premium/etc.).
5. Renewal `type=renewal&plan=<valid>` → allowed.
6. Pay Now `type=new&plan=<valid>` → shown only when payment is actually outstanding (unpaid or expired jsonb) and a valid payable current plan exists.
7. Trial/missing/invalid → **never silently Standard** (blocked with the exact error copy).
8. Invalid/missing → clear checkout error; **no Cashfree order, no PhonePe order, no attempt, no subscription mutation**.

## 4. Verification

- **Targeted smoke 37/37** (`%TEMP%\opencode\s9d-trial-guard\` — real bundled `plans.js` + source/dist static assertions):
  - A: Trial/invalid/missing jsonb → `currentPlan === null`; Pay Now hidden (incl. Trial unpaid+expired); Standard unpaid/expired → shown; active+paid → hidden; no row id → hidden.
  - B/C/D: `upgrade|renewal|new` + Standard → valid, plan Standard, amount 100 (PLAN_AMOUNTS); upgrade+Premium likewise.
  - E/F/G: `new+Trial`, `new+missing`, `upgrade+FakePlan`, garbage type → all `{ valid: false }`.
  - H/I static: zero mutation calls in Checkout source; no `PLAN_AMOUNTS['Standard']` fallback in any of the 4 files **or** the dist bundle; exact blocking copy present and its first occurrence precedes both gateway call sites; `goPayNow` null guard; superadmin Pay Now has no Standard fallback.
- `npm run build` → **0 errors, 0 warnings** (17.95s).
- ESLint on the 4 changed files → **0 NEW** (13 pre-existing baseline findings in untouched lines: 5 Date.now purity errors + 8 unused-var warnings).
- Regressions rebuilt from current source: s8c **101/101** · s8e **73/73** · s8b **56/56**.

## 5. Compatibility (unchanged flows)

- `type=upgrade&plan=Standard` → Standard ₹1 payable ✓
- `type=renewal&plan=Standard` → Standard ₹1 payable ✓
- `type=new&plan=<current paid plan>` → payable when outstanding ✓
- Current subscription state is never changed before successful payment (no writes added anywhere; `fulfill_payment` / webhook / HMAC / RLS / migrations untouched) ✓

## 6. Deployment

Client-only change — hosting deploy of current `dist` required to go live. **Not deployed** per instruction. No DB/migration/functions deployment needed.