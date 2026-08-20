# LOG_LICENSE_HISTORY Fix — Production Report

Date: 2026-08-20
Status: COMPLETE — no DB migration required, client-only fix

## 1. Reported Symptom

Super Admin → Device Management → Remove device failed with:

```
Failed to remove device:
Could not find the function public.log_license_history(p_action, p_device_id)
in the schema cache.
```

Device removal itself succeeded (device deleted, count dropped to 0); only the
license-history logging step failed.

## 2. Exact Root Cause (Category E — concrete client/data mismatch)

**The RPC exists in the live database with the exact 3-argument signature the
client intends to call. The failure was that the client payload was missing
`p_gym_id`, so PostgREST looked up a non-existent 2-argument function.**

Chain of events (all verified, none guessed):

1. `src/pages/superadmin/DeviceManagement.jsx` builds the history record from
   the device row: `addLicenseHistory({ gymId: dev.gymId, ... })`
   (`handleRemove`/`handleRevoke`/`handleSuspend`/`handleActivateDev`,
   lines 526-532, 543-549, 559-565, 575-581).
2. `mapDeviceRow()` in `src/services/deviceService.js` (the mapper used by
   `subscribeToAllDevices`/`subscribeToDevices`/`getDevicesForGym`) never
   mapped the `gym_id` column — the mapped row had NO `gymId` field.
3. Therefore `dev.gymId` was `undefined` at every call site (filter, gym sort,
   Gym column display, drawer, and all four history-logging handlers).
4. `licenseHistoryService.supabaseAddLicenseHistory()` built
   `{ p_gym_id: record.gymId /* undefined */, p_device_id, p_action }`.
   supabase-js `rpc()` serializes params with `JSON.stringify`, which **drops
   keys whose value is `undefined`** → wire body was
   `{"p_device_id":"DEV-0001","p_action":"Device Removed"}`.
5. PostgREST could not resolve a 2-argument `log_license_history(p_action,
   p_device_id)` (PostgREST lists request arg names alphabetically in the
   schema-cache error) → the exact reported error.

Mechanically reproduced in the verification harness (see §6, T5):
`JSON.stringify({p_gym_id: undefined, p_device_id: 'd1', p_action: 'X'})`
produces exactly the 2-arg lookup string from the production error.

Note: the gym-scoped `src/pages/DeviceManagement.jsx` was NOT affected — it
passes `gymId` from AppContext, never from the device row.

## 3. File Changed (the only product change)

`src/services/deviceService.js` — `mapDeviceRow()` gained one line:

```diff
   return {
     id: r.id,
+    gymId: r.gym_id || '',
     deviceId: r.device_id || '',
```

This single line restores `gymId` on every mapped device row, fixing all four
history-logging handlers plus the previously-broken Gym column / gym filter /
gym sort on the Super Admin page. No other files changed. No migration was
created or edited.

## 4. Live Function Signature (queried via Management API)

```
select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl
from pg_proc where proname = 'log_license_history'
```

| Attribute | Live value |
|---|---|
| name | `log_license_history` |
| identity args | `p_gym_id text, p_device_id text, p_action text` |
| security | `security definer` (prosecdef = true) |
| ACL | `{=X/postgres, postgres=X/postgres, authenticated=X/postgres}` |

Authz is enforced **inside** the function (0004_rpc.sql): `is_staff(auth.uid())`
gate + gym-mismatch guard (`p_gym_id <> auth_gym_id()` unless super admin) +
`performed_by = auth_firebase_uid()`. The residual `=X/postgres` PUBLIC-execute
entry is the same documented non-blocking class as `bump_campaign_stat`
(AGENTS.md Step 9B) — the function self-authorizes and raises on non-staff /
cross-gym callers, so the security model is unchanged and intact.

## 5. Inspection Summary (what was ruled out)

- **A (missing RPC)** — ruled out: function exists live with the 3-arg
  signature (0004_rpc.sql line 236, pushed 0001-0012, re-verified live).
- **B (wrong arg names/count)** — the call intent was correct
  (`p_gym_id`/`p_device_id`/`p_action`); the payload was corrupted by an
  `undefined` value before serialization.
- **C (stale signature)** — ruled out: live identity args match the client.
- **D (schema cache only)** — ruled out: the missing 2-arg function does not
  and should not exist; PostgREST was correctly rejecting a malformed call.
- **E (concrete mismatch)** — CONFIRMED: client data (device row) lacked
  `gymId` → payload missing `p_gym_id`.
- Grants/authz, RLS, and security definer behavior: untouched.

## 6. Verification Results

Targeted harness (`%TEMP%\opencode\s82\`, real bundled `deviceService.js` +
`licenseHistoryService.js` + fake Supabase client): **7/7 PASS**

- T1 `mapDeviceRow` now exposes `gymId` from `gym_id`.
- T2 remove-device flow → exactly ONE `log_license_history` call with
  `{p_gym_id, p_device_id, p_action}` all present in the serialized body; the
  device row is deleted.
- T3 revoke flow → complete payload, status `revoked`.
- T4 suspend flow → complete payload, status `suspended`.
- T5 pre-fix reproduction: `undefined` gymId still drops `p_gym_id` and yields
  the exact `log_license_history(p_action, p_device_id)` lookup — proves the
  root cause and that the fix is required and sufficient.
- T6 cross-gym rows keep their own `gymId` (tenant isolation intact).
- T7 activate flow → complete payload.
- No duplicate history entries: exactly one RPC per action.

Regressions (rebuilt from current source):
- s8c full data-plane suite: **101/101**
- s8e write-path suite (includes device limit/suspend/revoke/reset/validate +
  license history): **73/73**

Build: `npm run build` **0 errors, 0 warnings** (8.80s).
ESLint `src/services/deviceService.js`: **clean (0 problems)**.
Dist bundle scan: `gymId` mapping present in shipped chunks.

## 7. Final Answers

| Question | Answer |
|---|---|
| Exact root cause | `mapDeviceRow` omitted `gym_id` → `dev.gymId` undefined → `p_gym_id` dropped by JSON serialization → PostgREST 2-arg schema-cache lookup failed |
| Exact file changed | `src/services/deviceService.js` (1 line added in `mapDeviceRow`) |
| Migration changed | none |
| Live function signature | `log_license_history(p_gym_id text, p_device_id text, p_action text)`, security definer, staff+own-gym authz, executed by authenticated |
| Verification result | s82 harness 7/7, s8c 101/101, s8e 73/73, build 0/0, eslint clean |
| Another DB migration required? | **No** — the function already exists and is correct |
| Vercel/hosting redeploy required? | **Yes, client-only** — deploy the current `dist/` (entry `index-DoXxotv1.js`) to hosting/Vercel for the fix to go live |

## 8. Out of Scope / Untouched

Cashfree, PhonePe, subscription pricing, unrelated UI, Firebase, Firestore
rules, RLS, all other `addLicenseHistory` call sites (LicenseGuard, GymOwners,
LicenseKeys — all pass real gym ids and were already correct).