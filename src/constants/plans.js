// ────────────────────────────────────────────────────────────────────────────
// PLAN PRICING — SINGLE AUTHORITATIVE SOURCE
// ────────────────────────────────────────────────────────────────────────────
// All amounts are in PAISE (₹1 = 100 paise). The checkout, subscription
// lifecycle, history, invoices, and the superadmin pages all read from here.
//
// ⚠️ TEMPORARY TEST PRICING (active)
// Every paid tier is set to ₹1 (100 paise) for the current testing period.
// To revert to real pricing, restore `PLAN_AMOUNTS_ORIGINAL` into
// `PLAN_AMOUNTS` (see below) and rebuild.
// ────────────────────────────────────────────────────────────────────────────

export const PLAN_OPTIONS = ['Trial', 'Standard', 'Premium', 'Quarterly', 'Annual', 'Lifetime', 'Day Pass']

export const PLAN_ORDER = {
  'Trial': 0,
  'Day Pass': 1,
  'Standard': 2,
  'Premium': 3,
  'Quarterly': 4,
  'Annual': 5,
  'Lifetime': 6,
}

// TEST CONFIGURATION — every paid tier = ₹1 (100 paise). Do not ship to
// production billing without restoring the original amounts.
export const PLAN_AMOUNTS = {
  'Trial': 0,
  'Standard': 100,
  'Premium': 100,
  'Quarterly': 100,
  'Annual': 100,
  'Lifetime': 100,
  'Day Pass': 100,
}

// Original intended production pricing (paise) — restore these into
// PLAN_AMOUNTS when the test period ends.
export const PLAN_AMOUNTS_ORIGINAL = {
  'Trial': 0,
  'Standard': 9999,
  'Premium': 19999,
  'Quarterly': 29999,
  'Annual': 99999,
  'Lifetime': 499999,
  'Day Pass': 99,
}

// A valid, PAYABLE plan: a PLAN_AMOUNTS key whose price is > 0. Trial and
// any other ₹0 plan are excluded. This is the canonical guard for all
// checkout / Pay Now plan targeting — there is deliberately NO fallback
// plan: a missing or invalid plan must never silently become Standard.
export function isValidPaidPlan(plan) {
  if (!plan || plan === 'Trial') return false
  if (!Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, plan)) return false
  return (PLAN_AMOUNTS[plan] || 0) > 0
}

// Resolve the current plan identity from the authoritative gyms-row
// subscription jsonb fields (planName → plan). Returns the first valid
// payable plan, or null when only Trial / invalid / missing values exist.
export function resolveCurrentPlan(planName, plan) {
  for (const p of [planName, plan]) {
    if (isValidPaidPlan(p)) return p
  }
  return null
}

// Canonical checkout target-plan validation — one source of truth for
// /checkout?type=<new|renewal|upgrade>&plan=<paid-plan>. A paid checkout
// REQUIRES an explicit, valid, payable target plan. Trial, missing, or
// invalid plans (and unsupported types) are blocked: { valid: false }.
export function resolveCheckoutPlan(paymentType, targetPlan) {
  const validType = paymentType === 'new' || paymentType === 'renewal' || paymentType === 'upgrade'
  const validPlan = isValidPaidPlan(targetPlan)
  if (!validType || !validPlan) return { valid: false, plan: null, amount: 0 }
  return { valid: true, plan: targetPlan, amount: PLAN_AMOUNTS[targetPlan] }
}