# License 1/1 Blocker — Paytest / PayGym Diagnosis

Date: 2026-08-20
Mode: DIAGNOSIS ONLY — no code, no data, no RLS, no deployment changes.

---

## 1. Summary

The account **is not blocked by a code bug, a duplicate row, or a stale row**.
It is blocked because the **current browser session presents a device ID that
has never been registered**, while the single allowed slot (limit = 1) is
occupied by a **legitimate, active, freshly-used row** that belongs to the same
gym and the same owner, but to a **different browser identity**.

The code is behaving **exactly as specified**:

- limit = 1 and the current device is already registered → validation PASSES.
- limit = 1 and a DIFFERENT device is registered → current device is BLOCKED.
- 0 devices → current device registers and passes.

The current browser is case 2. Its localStorage device ID
(`29f073ec-…`) does not match the registered device (`55cbbd8c-…`).

**Classification: DATA / BROWSER-STATE mismatch — NOT a code defect.**

---

## 2. Identity

| Entity | Value |
|---|---|
| Account | Paytest — `17f94de7-7220-49c2-b501-7cdec19586f8` (role `gym_owner`, `account_disabled=false`) |
| Gym | `gym-1786961016948` (PayGym), `owner_uid` = Paytest, `approval_status=approved` |
| Subscription (gyms.subscription jsonb) | `status=active`, `licenseKey=IRP-9UO6-5T9M-PJL8`, `licenseStatus=active`, `planType=trial`, `deviceLimit=1`, expiry 2026-08-24 |

`deviceLimit=1` is produced by `getDeviceLimit('trial')` in
`src/services/subscriptionService.js:4-13` (Trial → 1). Expected for a trial.

---

## 3. Live database — source of truth (read-only SELECTs)

### 3.1 licensed_devices for gym-1786961016948 — EXACTLY **1 row** (A)

| Column | Value |
|---|---|
| id | `cbbd8bc8-d87a-4f4c-adc7-7f08ca00222a` |
| gym_id | `gym-1786961016948` ✔ (correct gym) |
| device_id | `55cbbd8c-57c5-4cfa-967d-278e885420ee` |
| device_name / platform | `Win32` / `windows` |
| status | `active` |
| created_by | `17f94de7-7220-49c2-b501-7cdec19586f8` = Paytest ✔ (correct owner) |
| license_key | `IRP-9UO6-5T9M-PJL8` ✔ (matches subscription) |
| registered_at | 2026-08-20 04:33 |
| last_seen | 2026-08-20 04:33 |

Full-table scan: this is the **only** licensed_devices row in the entire
database. **Zero duplicates, zero cross-gym rows** (F: no duplicate/incorrect
counting).

### 3.2 Audit trail (license_history for the gym) — full device timeline

| Time (UTC) | Action | device_id |
|---|---|---|
| 08-17 14:10–14:14 | Validation Failed - Error (pre-approval era, stale) | `29e46072-…` |
| 08-17 14:37 | **Device Registered** | `0ece5a46-…` (row created) |
| 08-17 14:42 → 08-20 03:49 | Device Re-verified (×many — working) | `0ece5a46-…` |
| 08-20 03:51–03:58 | **Validation Failed - Device limit reached (1/1)** | `228ade72-…` (new identity, blocked) |
| 08-20 04:33 | **Device Registered** (only possible because count was 0 ⇒ old row was deleted) | `55cbbd8c-…` (row created) |
| 08-20 04:35 / 05:07 / 05:38 | Device Re-verified — working | `55cbbd8c-…` |
| 08-20 05:39–05:41 | **Validation Failed - Device limit reached (1/1) ← CURRENT SYMPTOM** | `29f073ec-d2ad-4cd6-834f-01832b4ee08c` |

Notes:

- No `Device Removed` / `Device Revoked` / `Device Reset` audit entry exists for
  this gym (the only two such entries in the DB belong to gym `r7bcZ…`, July).
  The `0ece5a46` row was therefore deleted through a path that does not log
  (direct DB / helper), i.e. **the "previous stale device removal" removed the
  server-side row but could not restore the current browser's identity**.
- The registered row `55cbbd8c` is **not stale**: it was re-verified at
  05:38, one minute before the current block started at 05:39.
- `last_seen` is not bumped by re-verification (see §5, cosmetic) — the row
  displays 04:33 even though it was used at 05:38. This makes it *look* stale
  in the Devices UI but it is not.

---

## 4. Current device match result (B, C, D, E)

- **B — Match result: NO MATCH.** The current browser's device ID
  (from `localStorage['ironpulse_device_id']`) is
  `29f073ec-d2ad-4cd6-834f-01832b4ee08c` (the ID written by LicenseGuard's own
  audit entries at 05:39–05:41, the ongoing failure). No licensed_devices row
  has this device_id.
- **C — The registered row belongs to the correct gym/owner/license.** It is a
  legitimate, active registration — just from a different browser identity
  than the one currently in use.
- **D — If the current device were already registered it WOULD pass.**
  `validateDeviceRegistration` (deviceService.js:329-334) returns
  `{ valid: true, existing: true }` for a matching row and LicenseGuard logs
  "Device Re-verified" (LicenseGuard.jsx:77-79). The code implements the
  "already registered → pass" rule correctly. The current browser simply does
  not match.
- **E — No stale row is blocking a legitimate current device.** The blocking
  row (`55cbbd8c`) is active and was used minutes before the block. The truly
  stale row (`0ece5a46`) is already deleted. What blocks the current browser is
  that its **never-registered** identity hits the count gate:
  `existing=null → count(active)=1 ≥ deviceLimit=1 → block`
  (deviceService.js:336-344), message emitted verbatim as
  `Device limit reached (1/1). Remove an existing device or contact your administrator.`

---

## 5. Why the identity keeps changing (root mechanism)

The device ID is **localStorage-only** (`getOrCreateDeviceId`,
deviceService.js:47-54). Every browser profile, incognito window, or cleared
site-data session generates a brand-new UUID on first load. Today alone the
gym produced four identities: `0ece5a46` (deleted) → `228ade72` (blocked) →
`55cbbd8c` (registered) → `29f073ec` (current, blocked). This is not a server
problem — the server correctly tracks exactly what was registered.

Cosmetic secondary finding (no action needed): re-verification does not bump
`last_seen` (only `supabaseRegisterDevice` writes it), so active rows look
older than they are in the Devices page.

---

## 6. Verdict

- **A**: exactly **1** active row.
- **B**: current browser ID (`29f073ec-…`) matches **no** row.
- **C**: the row belongs to the correct gym/owner/license — legitimate.
- **D**: already-registered → PASS is implemented correctly; the current device
  is not registered, so it is correctly blocked.
- **E**: no stale row; the prior stale row was already removed.
- **F**: no duplicate or incorrect counting logic.

**This is DATA/BROWSER-STATE, not CODE. No code defect found in LicenseGuard,
deviceService, or DeviceManagement for this scenario.**

---

## 7. Smallest safe fix (choose ONE)

### Option 1 — No database change (instant, same machine)
In the current browser, set the device ID to the registered value and reload:

```js
localStorage.setItem('ironpulse_device_id', '55cbbd8c-57c5-4cfa-967d-278e885420ee')
location.reload()
```

On load, `validateDeviceRegistration` finds the row → `existing=true` →
**"Device Re-verified" → access granted**. Zero data change. Safe only if the
current browser is the same physical machine (registered row was created today
at 04:33 by Paytest's own Windows browser, `device_name=Win32`).

### Option 2 — Release the slot (canonical, audit-logged)
Have a **super admin** remove the single device via the Devices page
(`/devices` → SuperAdminDevices → Remove — logs `Device Removed`), or directly:

```sql
delete from licensed_devices where id = 'cbbd8bc8-d87a-4f4c-adc7-7f08ca00222a';
```

Then the current browser self-registers on next load (count 0 < 1 →
"Device Registered" → pass). This is exactly the action the error message
suggests.

Recommended: **Option 1 first** (no data change, instant); fall back to
Option 2 if the user intends a different machine to become the registered one.

---

## 8. Prevention / hardening (documented only — NOT implemented)

- Device identity is per-browser-profile; incognito, a second Chrome profile,
  or cleared site data always produces a new ID. At limit=1 the gym owner is
  **bricked with no self-service**: both `/devices` and `/subscription` are
  wrapped in `Guarded` → `LicenseGuard` (App.jsx:298-313), so a blocked
  gym_owner cannot reach the Devices page to release a slot. Only a super
  admin (not gated) can intervene.
- Candidates for a future change (out of scope here):
  1. Let gym_owner/gym_admin reach `DeviceManagement` from the
     `LicenseRequiredScreen` (self-service "use this device / remove old
     device").
  2. Bump `getDeviceLimit('trial')` or rotate idle rows (e.g., treat
     `last_seen` older than N days as releasable).
  3. Bump `last_seen` on re-verification so the Devices page reflects real
     activity.

---

## 9. Operator action required

1. Confirm the current browser is the same Windows machine that registered
   `55cbbd8c` at 04:33 today.
   - Same machine → apply Option 1 (set localStorage, reload). No DB change.
   - Different machine intended to become the registered device → apply
     Option 2 (super admin removes the row; current browser re-registers).
2. Do NOT delete data blindly — the existing row is legitimate and was active
   minutes before the block.
3. No code change, no RLS change, no deployment required for this incident.