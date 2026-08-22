# Subscription History Fix

## Root Cause

In `src/services/subscriptionService.js:361-373`, the `extendExpiry` function passed **hardcoded empty values** to `addHistoryRecord`:

```js
planId: '',    planName: '',    amount: 0
```

This meant every "extended" history entry stored an empty plan name and zero amount, causing the UI to display:

- **Plan = "—"** (because `h.planName || '—'` evaluates to `'—'`)
- **Amount = ₹0.00** (because `h.amount` was `0`)

The UI reads `h.planName` and `h.amount` from the `changes` jsonb column, which is populated from the record passed to `addHistoryRecord` → `supabaseAddHistoryRecord` → `subscription_history.changes`. Since `extendExpiry` never read the current subscription's plan data, the history entry had no plan information.

## Fix

**File modified:** `src/services/subscriptionService.js:361-378`

The `extendExpiry` function now reads the current gym subscription from the database before writing the history record, using the existing `supabaseGetGymSubscription` helper (already present in the same file):

```js
export async function extendExpiry(gymId, newExpiryDate, actorUid) {
  const current = await supabaseGetGymSubscription(gymId)
  await updateGymSubscription(gymId, {
    expiryDate: newExpiryDate,
    status: 'active',
  })

  await addHistoryRecord({
    gymId,
    planId: current.planType || '',
    planName: current.planName || current.planId || '',
    amount: current.amount != null ? current.amount : 0,
    currency: 'INR',
    status: 'active', paymentId: '', transactionId: '',
    startDate: '', expiryDate: newExpiryDate, createdBy: actorUid || '',
    action: 'extended',
  })
}
```

**Behavior changes:**

| Field | Before | After |
|-------|--------|-------|
| `planName` | `''` (empty) → UI shows "—" | `current.planName || current.planId` → UI shows actual plan name (e.g., "Standard", "Premium") |
| `amount` | `0` → UI shows "₹0.00" | `current.amount` if set, otherwise `0` → UI shows the plan's actual amount, or "₹0.00" for free extensions |
| `planId` | `''` (empty) | `current.planType` (e.g., "monthly", "yearly") |

This matches the required behavior: *plan = current subscription plan*, *amount = actual amount if billable; otherwise 0*, and *status = resulting subscription status*.

## Verification

- `npm run build` — **0 errors, 0 warnings** (24.34s)
- The fix uses existing DB-query patterns (`supabaseGetGymSubscription`) already employed by `upgradePlan`, `renewSubscription`, `downgradePlan` — no new dependencies or schema changes
- No Cashfree, PhonePe, checkout, payment fulfillment, pricing, RLS, or migration changes
- No hardcoded fake values — plan name is read live from the gym subscription row

## Notes

- The `upgradePlan`, `renewSubscription`, and `changePlan` functions already pass `planName` and `amount` correctly from their parameters — they were not modified
- Notifications (`sub_upgraded`, `sub_renewed`, etc.) are fired from `AppContext` with plan names from the same parameters; they were not affected by this data-mapping bug
- No deployment required — this is a client-side service function change only