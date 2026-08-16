# SUPABASE POST-IMPORT RECONCILIATION

**Date:** 2026-08-14 · **Mode:** READ-ONLY — zero imports, zero Firebase/Supabase writes, zero schema/RLS/app changes, zero deletions.
**Scope:** Complete reconciliation of the Step 7B data import against the approved Step 5C plan and manifests.

**FINAL VERDICT: `READY_FOR_SWITCHOVER`** (app switch-over NOT performed in this task — separate step, per instruction).

---

## 1. Top-Line Accounting

| Item | Count |
|---|---|
| **Approved import plan** | **197** (152 SAFE + 45 APPROVED MANUAL) |
| **Imported** | **169** |
| **Excluded with approved/documented reason** | **28** |
| **Quarantined (preserved, not importable)** | **61** (attendance 49, gyms 3, members 1, plans 4, notifications 4) |
| **FAILED** | **0** |
| **MISSING_FROM_ACCOUNTING** | **0** |
| Source total reconciled | 197 + 61 = 258 ✓ (matches 5A inventory) |
| Imported + excluded | 169 + 28 = **197 ✓** |
| Firebase writes during import | 0 |
| Supabase schema/RLS changes | 0 |

Every approved record is classified exactly once (per-record list: `migration-output/summaries/post-import-reconciliation.json`, 197 entries + 61 quarantine).

## 2. Complete 197-Row Accounting (per table)

| Table | Approved (safe+manual) | IMPORTED | EXCLUDED |
|---|---|---|---|
| gyms | 13 (7 safe + 6 manual) | 13 | 0 |
| profiles | 35 (8 safe + 27 manual) | 25 | 10 |
| plans | 24 (18 safe + 6 manual) | 18 | 6 |
| settings | 7 (1 safe + 6 manual) | 1 | 6 |
| subscriptions | 7 (safe) | 6 | 1 |
| subscription_history | 2 (safe) | 2 | 0 |
| notifications | 14 (safe) | 9 | 5 |
| license_history | 11 (safe) | 11 | 0 |
| referral_codes | 1 (safe) | 1 | 0 |
| ai_conversations | 15 (safe) | 15 | 0 |
| ai_conversation_messages | 65 (safe) | 65 | 0 |
| contact_messages | 3 (safe) | 3 | 0 |
| **Total** | **197** | **169** | **28** |

The 45 approved MANUAL rows split as: 27 profiles → 17 imported + 10 excluded; 6 gyms → 6 imported; 6 plans → 6 excluded; 6 settings → 6 excluded. The 152 SAFE rows split as: 146 imported + 6 excluded (1 subscription + 5 notifications — FK exclusions discovered in pre-flight, §3). No FAILED, no MISSING.

## 3. All 28 Exclusions — Detailed

### A. Legacy-only profiles (10) — EXCLUDED_WITH_APPROVED_REASON

Masked source IDs: `37WD336c`, `JGQdw7v1`, `TitV32lD`, `Y0BzZnBP`, `ZofzD9RL`, `hnfpV7jJ`, `joShucWx`, `kh9tSKzD`, `mNBFFQUH`, `nx0Qunp4`

- **Collection:** `users` → `profiles`
- **Exact reason:** Not in the approved 25-identity Auth mapping. `auth-provisioning-plan.json` classified 35 users → **25 approved** (22 create + 3 create-banned); these 10 are legacy-only (3 G1 non-canonical + 5 G2 duplicate-email + 2 G3). No Supabase Auth account exists/was created for them, so `profiles.id → auth.users.id` (NOT NULL FK) cannot be satisfied. Excluded by the id-map (`firebase-to-supabase-id-map.json`, mode `validate-live-auth`, PASS) and enforced at import (profiles stage filters on the approved map).
- **Part of Step 5C approval?** Yes — the 25-profile approved set and 10 legacy-only exclusions derive from the approved decisions (D1/D2/D3) + approved Auth plan (35 classified → 25 approved, `SUPABASE_AUTH_PROVISIONING_PLAN.md`); the exclusion itself is the approved Auth-set boundary, enforced by the pre-flight FK check (`preflight_fk_check.mjs`: "legacy-only exclusions = 10").
- **Preserved anywhere?** Yes — full masked manifests in `migration-output/manual-review/profiles.json` (27 rows incl. these 10) and `auth-provisioning-plan.json` (all 35 users, decisions recorded). Firebase docs untouched.
- **Safely re-importable later?** Yes — if a Supabase Auth identity is ever provisioned for one of them (matching `firebase_uid` metadata), the profile can be imported with `id = auth.users.id`. No data loss.

### B. Sentinel plans (6) — EXCLUDED_WITH_APPROVED_REASON

Masked source IDs: `2pEdfObs`, `63KUAxDT`, `7bWzVUnU`, `IfBGThgH`, `gNtFvF7a`, `wuLk33F4`

- **Collection:** `plans`
- **Exact reason:** Canonical-named plans (Trial/Standard/Premium/Quarterly/Annual/Day Pass) with `gymId: 'default'` sentinel — no tenant. Import would violate `guard_settings_gym`-equivalent tenancy rules / `gyms` FK.
- **Part of Step 5C approval?** Yes — **Decision 5 APPROVED**: "EXCLUDE both groups… no semantic mapping" (6 sentinel manual + 4 unknown quarantine).
- **Preserved anywhere?** Yes — `migration-output/manual-review/plans.json` (6 rows, reason `gymId 'default' sentinel`).
- **Safely re-importable later?** Yes — re-importable once a tenant gym is named; 18 safe plans already cover every canonical name under the 3 live gyms.

### C. Tenantless settings (6) — EXCLUDED_WITH_APPROVED_REASON

Masked source IDs (doc_id keys): `default`, `gym`, `notifications`, `pricing`, `profile_y9lt1eCE…`, `theme`

- **Collection:** `settings`
- **Exact reason:** Would derive `gym_id 'default'` and fail `guard_settings_gym` (DDL policy). Only `platform` (gym_id='platform', guard-exempt) was imported (1). `pricing` has no consumer in src; `profile_*` has no schema slot; `default`/`gym` are duplicated gym-settings; `notifications`/`theme` are tenant prefs with no named gym.
- **Part of Step 5C approval?** Yes — **Decision 6 APPROVED**: "import `platform` (SAFE, done); EXCLUDE the remaining 6 (PRESERVE + QUARANTINE)".
- **Preserved anywhere?** Yes — `migration-output/manual-review/settings.json` (6 rows, reason `fails guard_settings_gym`).
- **Safely re-importable later?** Yes — once a tenant is named; app re-seeds defaults on save paths.

### D. Subscription referencing quarantined gym (1) — EXCLUDED_WITH_APPROVED_REASON

Masked source ID: `iyjeYRVx` (full: `iyjeYRVxdluVFbV5Ksra`)

- **Collection:** `subscriptions`
- **Exact reason:** `gym_id = Vh305r5D0desNQtqxXiz` — a **QUARANTINED** orphan gym (Decision 4: approved-gym-with-no-owner-account; no import). FK `subscriptions.gym_id → gyms(id)` cannot be satisfied. Identified by the pre-flight FK check (post-approval discovery, documented in `SUPABASE_DATA_IMPORT_REPORT.md` §1 and importer stage 6 filter).
- **Part of Step 5C approval?** The gym's quarantine IS approved (Decision 4). The subscription itself was SAFE-classified in Step 5B; its exclusion is a **necessary FK consequence** of the approved quarantine — documented, not silently reinterpreted. No safe alternative (importing the orphan gym would violate the approved D4 decision).
- **Preserved anywhere?** Yes — `migration-output/safe/subscriptions.json` (row retained) + the quarantine gym manifest.
- **Safely re-importable later?** Yes — if the orphan gym is ever imported with an owner (developer decision on `Vh305r5D`, flagged in Decision 4 Special Case B), this subscription becomes re-importable.

### E. Notifications for legacy-only users (5) — EXCLUDED_WITH_APPROVED_REASON

Masked source IDs: `EskSHKLh` (user `JGQdw7v1`), `Mow83ETj` (user `joShucWx`), `OcNNOiU0` (user `nx0Qunp4`), `Xq0COeoA` (user `Y0BzZnBP`), `hHjMIcqv` (user `TitV32lD`)

- **Collection:** `notifications`
- **Exact reason:** `notifications.user_id` is NOT NULL FK → `profiles(firebase_uid)`; each references a legacy-only user from group A (no auth account, excluded from the approved 25). Identified by the pre-flight FK check (post-approval discovery, documented in `SUPABASE_DATA_IMPORT_REPORT.md` §1 and importer stage 8 filter).
- **Part of Step 5C approval?** The user exclusions ARE approved (Auth-set boundary, group A); the notification rows themselves were SAFE-classified in Step 5B — their exclusion is a **necessary FK consequence** of the approved 25-identity boundary. Documented, not silently reinterpreted.
- **Preserved anywhere?** Yes — `migration-output/safe/notifications.json` (14 rows incl. these 5).
- **Safely re-importable later?** Yes — if the referenced users ever get Auth identities (group A re-import path), the notifications become re-importable.

### Exclusion summary

| Reason family | Count | Part of Step 5C approval |
|---|---|---|
| Legacy-only profile (no Auth identity) | 10 | Yes (approved 25-identity set) |
| Sentinel plan (no tenant) | 6 | Yes (Decision 5) |
| Tenantless settings | 6 | Yes (Decision 6) |
| Subscription → quarantined gym (FK) | 1 | Quarantine approved (D4); row exclusion = documented FK consequence |
| Notification → legacy-only user (FK) | 5 | User exclusion approved; row exclusion = documented FK consequence |

No exclusion was silently reinterpreted; all 28 are enumerated with reasons in `post-import-reconciliation.json`.

## 4. Quarantine Verification (Task 3)

| Collection | Count | Artifact |
|---|---|---|
| attendance | 49 | `migration-output/quarantine/attendance.json` ✓ exists |
| gyms | 3 | `migration-output/quarantine/gyms.json` ✓ exists |
| members | 1 | `migration-output/quarantine/members.json` ✓ exists |
| plans | 4 | `migration-output/quarantine/plans.json` ✓ exists |
| notifications | 4 | `migration-output/quarantine/notifications.json` ✓ exists |
| **Total** | **61** | ✓ |

- **No quarantined record inserted:** importer stages read ONLY `safe/` + `manual-review/` manifests (verified in `import_to_supabase.mjs`); quarantine manifests feed only the subscription-exclusion check. Reconciliation script confirms **0 quarantine-ID collisions among imported rows**. Post-import remote counts: attendance=0, members=0, plans=18, notifications=9, gyms=13 (3 quarantine gyms absent) — PASS.
- Quarantine contents were never deleted, never modified (GATE A GREEN, no sensitive values).

## 5. Auth State Reconciliation (Task 4)

| Requirement | Remote evidence | Result |
|---|---|---|
| Total Auth users = 25 | id-map `validate-live-auth` PASS (17:28) — 25 mappings; provisioning dry-run `AP-20260814100425` — all 25 `status: skip` = existing-correct; post-import verify (live, this session) — `auth.users=25` | ✓ |
| All 25 approved mappings present | id-map `mappings[]` = 25, `missing: []`, `duplicates: []`, `unexpected: []` | ✓ |
| 3 rejected users banned | id-map `banned: true` for `A0kiygGn` (a7bb02b7…), `ArlmC1TZ` (f98ac3c3…), `JeFv6yMB` (c7034d3b…); provisioning manifest: all 3 `create-banned` / "already banned" | ✓ |
| No unexpected Auth users | id-map `unexpected: []`; `legacyOnlyAuthUsersFound: []` | ✓ |
| Legacy-only 10 remain excluded from provisioning | id-map `legacyOnlyExcluded: 10`; provisioning manifest `excluded` = 10; reconciliation: 10 profiles EXCLUDED (group A) | ✓ |
| Profiles ↔ Auth linkage | post-import verify (live): `auth.users=25, profiles=25, profiles-without-auth=0` | ✓ |

**Doc reconciliation:**
- `docs/SUPABASE_DATA_IMPORT_AUTH_MAPPING.md` — matches current state exactly (25/25, 0 missing/duplicates/unexpected, 3 rejected banned, 10 legacy-only excluded). CONSISTENT.
- `docs/SUPABASE_AUTH_FINAL_RECONCILIATION.md` — its "Current remote (known): 3" section reflects the 09:37 partial-execution state and predates out-of-band completion of the remaining 22 creates (all 25 present by the 10:04 dry-run; live-validated 25/25 at 17:28). The doc's own expected-final row ("Expected final Auth users: 25") is consistent with actual state. The discrepancy (3 → 25) is explained by provisioning completion after the doc was written; **the remote state was not modified by this task.**
- **Note:** the service_role credential file was deleted per the prior migration-completion mandate; no new remote queries were executed in this task. All auth facts above come from live-validated artifacts captured during/at provisioning and import time (id-map validate-live-auth run, provisioning dry-run enumeration, and the live post-import verification run earlier this session).

## 6. Profiles Verification (Task 5)

| Requirement | Evidence | Result |
|---|---|---|
| Expected imported profiles exist | post-import verify (live): `profiles=25` (planned 25) | ✓ |
| `profiles.id` = `auth.users.id` | Importer writes `id: approved.get(firebase_uid)` (live auth UUID); post-import verify: `profiles-without-auth=0` (every profile id exists in auth.users) | ✓ |
| `profiles.firebase_uid` matches approved mapping | Only approved-mapped rows pass the profiles-stage filter; exactly-once uniqueness checked in pre-flight ("profiles exactly-once" = 0 dupes) | ✓ |
| No credential fields | DDL scan (`0001_initial_schema.sql`): no password/hash/salt/secret/token/credential columns; GATE A GREEN on all manifests; credential scan of repo+migration-output clean (excluding documented `users_export.json`) | ✓ |
| No orphan profile/auth relationships | `profiles-without-auth=0`; 25 auth = 25 profiles (no auth user without profile) | ✓ |

## 7. FK Integrity & Deterministic IDs (Task 6)

**FK checks (post-import verify, live — 11 spot checks, all 0 orphans):**

| FK | Orphans |
|---|---|
| gyms.owner_uid → profiles(firebase_uid) | 0 |
| profiles.gym_id → gyms(id) | 0 |
| plans.gym_id → gyms | 0 |
| subscriptions.gym_id → gyms | 0 |
| subscription_history.gym_id → gyms | 0 |
| subscription_history.subscription_id → subscriptions | 0 |
| notifications.user_id → profiles | 0 |
| license_history.gym_id → gyms | 0 |
| referral_codes.referrer_uid → profiles | 0 |
| ai_conversations.user_id → profiles | 0 |
| ai_conversation_messages.conversation_id → ai_conversations | 0 |

Member/trainer-referenced tables (attendance, members, payments, progress, diet/workout plans, whatsapp, devices, referrals, support) are **0 rows** — no orphan child records possible by construction (verified remotely: all 0).

**Deterministic identifiers** (`deterministic-identifiers.json`): referral codes duplicates=0 (`IP-H6POBD`), gym doc ids duplicates=0 (16 unique), firebase_uids duplicates=0 (35 unique), paymentIds/invoiceNos/licenseKeys empty (0). Profile ids are live auth UUIDs (unique by construction, validated 25/25).

**Invalid refs:** pre-flight FK check (`preflight_fk_check.mjs`) — 0 unresolved references across all 12 imported tables; every non-approved ref either excluded (28) or nulled per documented policy (license_history.performed_by sentinel → NULL, 11 rows; gyms.owner_uid legacy-only → NULL, 3 manual gyms).

## 8. Remaining Issues / Follow-ups (non-blocking)

1. **App switch-over** — NOT performed (per instruction). Requires a separate, explicitly authorized step (app config → Supabase, auth flows, smoke tests).
2. **`Vh305r5D0desNQtqxXiz`** — quarantined approved gym with no owner (Decision 4 Special Case B): developer decision pending; affects only the excluded subscription (`iyjeYRVxdluVFbV5Ksra`) re-import.
3. **Quarantine review (61)** — manual disposition remains open: attendance 49 (orphan, test data), gyms 3 (orphan), members 1, plans 4 (unknown names), notifications 4.
4. **Legacy-only 10** — remain Firebase-only; re-import path exists if Auth identities are ever provisioned.
5. **Recovery-delivery** for `@gym.com` / non-allowlisted-domain auth users — `RECOVERY_DELIVERY_FAILED` policy: manual credential setup (no fabricated emails). Auth users are created regardless.

## 9. Verdict

**READY_FOR_SWITCHOVER.**

197 approved = 169 imported + 28 excluded with approved/documented reasons; 61 quarantined preserved; 0 FAILED; 0 MISSING_FROM_ACCOUNTING. Auth 25/25 with 3 banned; profiles fully linked; FK integrity clean; deterministic IDs unique; zero credentials present; Firebase untouched (0 writes); Supabase schema/RLS untouched. The app switch-over itself is a separate task and was NOT performed.
