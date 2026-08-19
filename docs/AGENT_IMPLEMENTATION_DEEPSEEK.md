# AGENT IMPLEMENTATION — Confirmed Defects B1–B13

Status: COMPLETE
Date: 2026-08-18
Build: 0 errors / 0 warnings
Smoke regressions: s8c 101/101, s8e 73/73, s8g 77/77, s8p 27/27, s8b 56/56 (0 Firebase calls), s8f 35/35, s8d realtime 31/31
ESLint: 0 NEW findings (all remaining findings are pre-existing baseline on untouched lines)

## Scope
Fixes for the 13 confirmed defects (B1–B13). Rules honored: no Firebase reintroduction, no Cashfree changes, no schema changes beyond the one required by B7, no PLAN_AMOUNTS change (B12), no jsPDF optimization (B13), no broad refactoring, existing public service APIs preserved, unrelated files untouched.

## Changes by defect

### B1 (Critical) — `sbError` ReferenceError in referralService redeem paths
`supabaseRedeemDiscountCoupon` / `supabaseRedeemWalletReward` called undefined `sbError(error)` → ReferenceError at runtime, breaking every coupon/wallet redemption.
Fix: `mapSupabaseError(error, 'Failed to redeem coupon')` / `mapSupabaseError(error, 'Failed to redeem wallet reward')`.
File: `src/services/referralService.js`

### B2 (High) — MyRewards coupon Redeem button never rendered
`RewardCard` only showed the Redeem button for non-coupons, and `onRedeem` was passed `undefined` for coupons.
Fix: removed `!isCoupon` gate and passed `onRedeem={handleRedeem}` for both types (handleRedeem already routes coupons → `redeemDiscountCoupon`).
File: `src/pages/MyRewards.jsx`

### B3 (High) — `reactivateSubscription` missing from subscriptionService; no history
Added `reactivateSubscription(gymId, actorUid)` to `subscriptionService.js` (reads current sub via `supabaseGetGymSubscription`, computes new expiry = max(current expiry, today) + one billing interval of the existing planType, writes `status/active`, `licenseStatus/active`, `expiryDate`, `cancelledAt:null`, records a `subscription_history` row with action `reactivated`).
Wired in `AppContext.jsx` (`reactivateSubscriptionService` import; the inline `setGymSubscriptionFields`-based body replaced with the service call, `fireNotif('sub_reactivated')` preserved).
Files: `src/services/subscriptionService.js`, `src/context/AppContext.jsx`

### B4 (Medium) — Device dates always "—" in Supabase mode
Rendering only handled Firestore `.seconds` timestamps; Supabase returns ISO strings.
Fix: added `fmtDate(value, time)` helper handling both `.seconds` and ISO/Date; applied to `registeredAt` / `lastSeen`.
File: `src/pages/DeviceManagement.jsx`

### B5 (Medium) — GymSubscription Extend baseDate should be max(expiry, now)
`handleExtend` extended from `new Date()` only, losing future expiry overlap.
Fix: base = `max(existing sub.expiryDate, now)`, then `+ extendDays`.
File: `src/pages/GymSubscription.jsx`

### B6 (Medium) — superadmin Subscriptions Extend ignored formDays
`handleAction` `case 'extend'` passed `expiryStr = now.toISOString()` (always +0 days from now).
Fix: compute `extendBase = max(current endDate, now)`, `+ formDays`, pass that ISO string. Removed a duplicate shadowed `now`.
File: `src/pages/superadmin/Subscriptions.jsx`

### B7 (Medium) — rejectedAt not persisted
`referrals` had no `rejected_at` column; `update_referral_status` RPC dropped it.
Fix: new migration `0013_referral_rejected_at.sql` (adds `rejected_at timestamptz`, extends the RPC with optional `p_rejected_at` default NULL; sets `rejected_at` on `Rejected`, clears otherwise); client `supabaseUpdateReferral` passes `p_rejected_at` when `rejectedAt` present; `mapReferralRow` exposes `rejectedAt`. RLS untouched (writes remain RPC-only).
Files: `supabase/migrations/0013_referral_rejected_at.sql`, `src/services/referralService.js`

### B8 (Medium) — LicenseGuard not explicitly covering gym_owner
`Guarded` wrapper in `App.jsx` checked only `navRole === 'gym_admin'`. (effectiveRole normalizes gym_owner→gym_admin, but the raw-role fallback path was uncovered.)
Fix: `navRole === 'gym_admin' || navRole === 'gym_owner'`. (`LicenseGuard` itself already covered gym_owner.)
File: `src/App.jsx`

### B9 (High) — Reactivate button called activateSubscription
`GymSubscription.jsx` "Reactivate" button invoked `handleActivate` (→ `activateSubscription`). Added `handleReactivate` calling the new `reactivateSubscription()` from context; button now uses it.
File: `src/pages/GymSubscription.jsx`

### B10 (Low) — dead `src/pages/Subscriptions.jsx`
Confirmed zero imports/routes (grep), deleted the file.

### B11 — deferred (documented)
`referral_audit_logs` RLS (0002 L719-729) is staff/super SELECT-only by design; the only writes are server-side (`handle_referral_signup` trigger, reward functions). Client never writes audit logs, so no INSERT policy is required. No change made.

### B12 — not changed (per constraint)
`PLAN_AMOUNTS` left at ₹1 test pricing.

### B13 — not changed (per constraint)
jsPDF untouched.

## Verification
- `npm run build`: 0 errors, 0 warnings (14.5s).
- Smoke suites rebuilt from current source: s8c 101/101, s8e 73/73, s8g 77/77, s8p 27/27, s8b 56/56 (Firebase auth shim calls = 0), s8f 35/35, s8d realtime 31/31.
- ESLint on 8 changed files: 0 NEW (remaining = pre-existing Date.now purity in superadmin/Subscriptions.jsx at 592/855/982 and unused-var warnings in referralService at 367/458 — untouched lines).
- dist scan: `sbError` ABSENT; zero Firebase SDK refs (only false-positive `currentChatCompletionSnapshot` identifier inside the openai SDK chunk).

## Files changed
- `src/services/referralService.js` (B1, B7)
- `src/pages/MyRewards.jsx` (B2)
- `src/services/subscriptionService.js` (B3)
- `src/context/AppContext.jsx` (B3)
- `src/pages/GymSubscription.jsx` (B5, B9)
- `src/pages/DeviceManagement.jsx` (B4)
- `src/pages/superadmin/Subscriptions.jsx` (B6)
- `src/App.jsx` (B8)
- `src/pages/Subscriptions.jsx` deleted (B10)
- `supabase/migrations/0013_referral_rejected_at.sql` (new, B7)

## Remaining operator actions
1. `supabase db push` to apply `0013` (adds `rejected_at` column + RPC extension; additive, reversible).
2. Client-only hosting deploy of the current dist for B1–B10 fixes to go live.

## Residual / out of scope
- B11 deferred by design (no INSERT policy needed).
- Reactivation in Supabase mode writes via `update_gym_subscription` RPC (super-admin-gated) — same documented 8C boundary as other gym subscription writes; gym-owner reactivation self-service remains a supabase-mode limitation.