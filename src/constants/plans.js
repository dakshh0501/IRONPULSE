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