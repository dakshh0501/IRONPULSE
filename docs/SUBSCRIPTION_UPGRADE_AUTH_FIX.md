# Subscription Upgrade Auth Fix (HTTP 400) — Report

**Date:** 2026-08-20
**Status:** Applied to live DB (migration 0016), client change built, **NOT deployed (hosting)**

## 1. Symptom

Production gym "Upgrade Plan -> Confirm Upgrade" (and renew/downgrade) returned an
HTTP 400; the upgrade never applied. `GymSubscription.jsx` showed the error and the
plan stayed unchanged. The gym operator acting was a **gym owner** who is mapped
client-side to `gym_admin` (rbac.js `getEffectiveRole`), so the client UI gate
(`AppContext.isAdmin`) allowed the action before the server rejected it.

## 2. Root cause (live-confirmed)

`update_gym_subscription` (migration 0004) was **super-admin-only**:

```sql
if not is_super_admin(auth.uid()) then
  raise exception 'update_gym_subscription: super_admin required';
end if;
```

- Client flow: `GymSubscription.jsx handleUpgrade` -> `AppContext.upgradeSubscription`
  (`isAdmin` gate passes for gym_admin/gym_owner via effectiveRole) ->
  `subscriptionService.upgradePlan` -> `client.rpc('update_gym_subscription', ...)`.
- Every non-super session therefore hit the server-side raise -> HTTP 400.

Live DB facts (project `osfhojfqytmqsqcmzvlf`):

- **No `gym_admin` profiles exist** in production; the reporter is the gym owner
  `17f94de7-7220-49c2-b501-7cdec19586f8` (gym `gym-1786961016948` = PayGym).
- Only that one `gym_owner` row has `profiles.gym_id` set; the other legacy owner
  rows have `gym_id = NULL` (see Operator actions).

Two latent blockers existed behind the primary 400 (all three would have failed
the same flow once the RPC was fixed):

| # | Layer | Issue |
|---|-------|-------|
| 1 | RPC authz | super-only check (the 400) |
| 2 | `subscription_history` RLS | INSERT policy super-only (`pol_subscription_history_insert_super`) — `addHistoryRecord` after every lifecycle RPC would fail for gym_admin/gym_owner |
| 3 | `subscriptions` / `subscription_history` SELECT | own-gym policies required role exactly `'gym_admin'` — gym_owner DB role could not read the billing row (Checkout fallback `getSubscriptionById`) or its history |

## 3. Fix

### Migration `supabase/migrations/0016_subscription_upgrade_auth.sql` (applied)

1. **New authoritative `plan_pricing` table** (read-only; SELECT policy for any
   authenticated user; no write policies). Seeded with the current test pricing —
   **all paid plans = 100 paise (INR 1), Trial = 0**:

   | plan | amount_paise |
   |------|-------------:|
   | trial | 0 |
   | standard / premium / quarterly / annual / lifetime / day pass | 100 |

2. **`CREATE OR REPLACE update_gym_subscription`** — same signature, corrected authz
   + server-side plan/amount validation (mirrors the `update_referral_status`
   authz pattern from 0004):

   ```sql
   select role, gym_id into actor_role, actor_gym from public.profiles where id = auth.uid();
   if not (is_super_admin(actor_uid)
       or (actor_role in ('gym_admin','gym_owner') and p_gym_id = actor_gym)) then
     raise exception 'update_gym_subscription: not authorized';
   end if;
   ```

   Tenancy key = `profiles.gym_id` (the canonical key used by `auth_gym_id()` /
   `update_referral_status`). `gyms.owner_uid` is NOT used (and never was the
   RPC's gate).

   Validation (only when BOTH a plan identifier and `amount` are present, so
   `suspend`/`expire`/`extend` — neither — and `reactivate` — planType only — are
   unaffected):

   - plan alias normalization: `monthly -> standard`, `yearly -> annual`,
     `pro -> premium`, `enterprise -> lifetime`.
   - unknown plan -> `unknown plan "<p>"`.
   - amount mismatch -> `amount <a> does not match plan <p> pricing <expected>`.
   - amount is accepted in **paise (100)** OR **rupee-legacy (1)** form
     (`amount::numeric = expected` OR `amount::numeric * 100 = expected`) so
     superadmin `Subscriptions.jsx` flows that may carry rupees keep working.

   The jsonb merge and `gym not found` raise are unchanged.

3. **RLS extensions** (recreated, additive):

   - `pol_subscriptions_select_gymadmin_own` -> role in `('gym_admin','gym_owner')`
     AND `gym_id = auth_gym_id()` (fixes Checkout fallback read + superadmin drawer).
   - `pol_subscription_history_select_gymadmin_own` -> same extension.
   - NEW `pol_subscription_history_insert_gymadmin_own` -> role in
     `('gym_admin','gym_owner')` AND `gym_id = auth_gym_id()` (fixes `addHistoryRecord`).

4. Grants: `revoke all ... from anon`, `grant execute ... to authenticated`
   (0004/0007 pattern).

### Client change (`src/context/AppContext.jsx` — 2 lines)

`approveGymOwner` `initFields` wrote `subscription.amount` as `0` unconditionally
(`newSubscription === 'Trial' ? 0 : 0`). Under the new validation a super-admin
approval with a **paid** plan would now fail (0 != 100). Fixed to the authoritative
amount: `PLAN_AMOUNTS[newSubscription] || 0` (new import from `../constants/plans`).
Trial approvals keep 0; paid approvals now carry 100 paise. No other client changes
were required — the client already passes `PLAN_AMOUNTS` amounts in paise for
activate/renew/upgrade/downgrade/change/assignTrial.

## 4. Authz matrix (post-fix)

| Actor | Target gym | Result |
|-------|-----------|--------|
| super_admin | any | ALLOW |
| gym_admin (profiles.gym_id = target) | own gym | ALLOW |
| gym_owner (profiles.gym_id = target) | own gym | ALLOW |
| gym_admin | other gym | DENY |
| gym_owner | other gym | DENY |
| trainer | any | DENY |
| member | any | DENY |
| gym_owner with `gym_id = NULL` (legacy) | own gym | DENY (fail-closed; see Operator actions) |

## 5. Live-DB verification (management API, ROLLBACK-protected, zero residue)

Applied `0016` to production, then confirmed the deployed function/policies/pricing,
then ran safe probes (`set local role authenticated` + JWT claims; temp `auth.users`
+ `profiles` row for the gym_admin test; all inside `BEGIN/ROLLBACK`).

**ALLOW probes — 10/10 pass:**
`A_super_own_merged`, `B_gymadmin_own_ok`, `C_owner_own_ok` (exact reported flow),
`H_owner_history_insert` (history policy), `H2_owner_notification_ok`
(sub_upgraded fireNotif shape), `I_full_payload_synced` (gyms jsonb merge with
full upgrade payload incl. renewalCount/currency), `J3_rupee_legacy_ok`
(premium + amount 1), `J4_trial_zero_ok`, `J5_monthly_alias_ok`, `J6_reactivate_noamount_ok`.

**DENY probes — 6/6 raise** (exact SQLSTATE/exception text verified):
cross-gym owner, cross-gym gym_admin, trainer, member, wrong amount
(`amount 999 does not match plan standard pricing 100`), unknown plan
(`unknown plan "nonexistent"`).

**Residue check:** temp gym_admin profile 0, temp auth user 0, gym count 14
(unchanged), no test history/notification rows, PayGym `subscription.planType`
still `trial` (unchanged).

## 6. Build / lint / regressions

- `npm run build` — 0 errors, 0 warnings (entry `index-CDNgtvPB.js`, 7.11s).
- `eslint src/context/AppContext.jsx` — 0 NEW (the 2 findings — unused
  `userRoleWasUpdated`, set-state-in-effect — are the documented pre-existing
  baseline, untouched lines).
- Regressions rebuilt from current source:
  - Step 8E smoke **73/73** (subscription RPC/history/notification paths).
  - Step 8B smoke **56/56** (auth, 0 Firebase shim calls).

## 7. Deployment / operator actions

- **DB:** migration `0016` is **already applied** to production (verified live).
- **Hosting:** the client change is **not deployed** — deploy the current `dist/`
  to pick up the `approveGymOwner` amount fix (defensive; the server fix is what
  unblocks gym-owner upgrades).
- **Legacy owners:** gym owners whose `profiles.gym_id` is NULL (all except PayGym's
  owner) remain fail-closed for subscription writes by design. Fix per gym via the
  super-admin approval path (`set_profile_gym_id`) or direct DB backfill — their
  RLS reads were already broken (tenant isolation), so nothing regresses.

## 8. Files changed

- `supabase/migrations/0016_subscription_upgrade_auth.sql` (new; applied to live).
- `src/context/AppContext.jsx` (2 lines: import `PLAN_AMOUNTS`; `initFields` amount).
- Harness (not product): `%TEMP%\opencode\s9c\` (tests-allow.sql + 6 deny probes +
  residue.sql + verify-0016.sql).

## 9. Remaining risks

- Amount validation enforces the seeded ₹1 test pricing; when real pricing is
  introduced, update `plan_pricing` (super admin/DB) — the RPC reads it, no code
  change.
- Webhook/payment paths (`fulfill_payment`, cashfree-order, phonepe-pay) unchanged
  — they write `subscriptions`/`subscription_history`/`payments` via the
  service-role RPC and are unaffected by these client policies.
- `update_gym_subscription` RPC now validates plan/amount only when both are
  present; a future caller passing plan+wrong amount gets a clear server error
  rather than silent divergence from pricing.