# FIREBASE → SUPABASE IMPORT — DECISION REVIEW (Step 5C)

Analysis + decision documentation only. **NO data was written** — Firebase, Supabase, app code, migrations, schema, Auth, Storage, Functions all untouched.

Sources of evidence:
- `migration-output/` (dry-run manifests from `scripts/migration/dry_run_import.js`)
- `docs/FIREBASE_IMPORT_RULES.md`, `docs/FIREBASE_IMPORT_PLAN.md` §6
- `docs/FIREBASE_DATA_MIGRATION_AUDIT.md` (5A inventory)
- `supabase/migrations/0001_initial_schema.sql` + `docs/SUPABASE_DDL_SPEC.md`

Current dry-run state (post-5C refinement): **SAFE 152 · MANUAL 45 · QUARANTINE 61 · total 258**

> **APPROVAL RECORD — 2026-08-14**: All seven decisions below are **APPROVED** by the developer ("I approve all 7 migration decisions exactly as documented"). Import remains **NOT EXECUTED** — no data has been or will be written by this review.

---

## The Seven Decision Blocks

### Decision 1 — Rejected user accounts (8)

| | |
|---|---|
| **Issue** | 8 profiles have role `rejected` (Firestore `users` docs; `account_disabled=true` implied). 4 carry `gymId: 'default'` sentinel; 2 reference real gyms (`ArlmC1TZ...` → `gym-1786295772301-372804`, `JeFv6yMB...` → `ogE7fL9i14EcAXUdV7fI`); 2 have no gymId. |
| **Affected count** | 8 profiles |
| **Source evidence** | `migration-output/manual-review/profiles.json` (8 rows, reason `rejected account`) |
| **Current classification** | MANUAL_REVIEW (0 BLOCKING) |
| **Existing recommended action** | Import with `account_disabled=true` (R-REJECTED-DISABLE); no disabled-reason fabrication |
| **Migration consequence** | Preserves the `firebase_uid → profiles.id` mapping for audit continuity; accounts cannot sign in (disabled). If excluded instead, any future lookup of these uids yields nothing |
| **Reversibility** | Fully reversible — delete the 8 rows, or re-enable via app |
| **Recommended decision** | **APPROVE — import all 8 with `account_disabled=true`** (they satisfy every NOT NULL constraint; only a policy flag differs) |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** |

### Decision 2 — Pending gym owners (6)

| | |
|---|---|
| **Issue** | 6 profiles have role `gym_owner_pending`. All 6 carry `gymId: 'default'` (sentinel). **No gym doc claims any of them as `ownerUid`** — verified: all 16 gym docs are owned by gym_owner (7), rejected (6) users, or have no owner (3). Their gym docs were never created or were removed (Sprint 79F orphan cleanup). |
| **Affected count** | 6 profiles |
| **Source evidence** | `migration-output/manual-review/profiles.json` (6 rows, role `gym_owner_pending`, gym NULL) |
| **Current classification** | MANUAL_REVIEW |
| **Existing recommended action** | "Import as gym_owner with approval pending … or exclude" — refined: import with role `gym_owner_pending` (schema enum member, rules §4 identity mapping), `gym_id NULL` |
| **Migration consequence** | Approval history preserved; no gym relationship invented; accounts appear in the platform as pending. Exclusion would lose the audit trail of attempted signups |
| **Reversibility** | Fully reversible — delete or promote later |
| **Recommended decision** | **APPROVE — import all 6 with role `gym_owner_pending`, `gym_id NULL`** (preserve; do not fabricate a gym) |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** |

### Decision 3 — Gymless member/trainer profiles (12)

| | |
|---|---|
| **Issue** | 9 `member` + 3 `trainer` profiles have no resolvable gym (`gymId` absent or `default` sentinel). No member/trainer row can be attached (members/trainers tables are empty in source). |
| **Affected count** | 12 profiles |
| **Source evidence** | `migration-output/manual-review/profiles.json` (12 rows, reason `unresolved gym for member/trainer`, gym NULL) |
| **Current classification** | MANUAL_REVIEW |
| **Existing recommended action** | Import with `gym_id NULL` (recommended) or exclude |
| **Migration consequence** | Accounts preserved; gym linkage re-attached later via the app (owner approves → gym assigned). Exclusion loses real accounts (several have referral codes and chat history — see aiConversations) |
| **Reversibility** | Fully reversible — `UPDATE profiles SET gym_id = …` later, or delete |
| **Recommended decision** | **APPROVE — import all 12 with `gym_id NULL`** |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** |

### Decision 4 — Orphan gyms (3)

| | |
|---|---|
| **Issue** | 3 gym docs have an `ownerUid` with **no users doc**: `3u8ObSiW...`, `6XND7bUX...` (approval `rejected`), `Vh305r5D...` (approval **approved** — a live gym with no owner account). No owner can be derived; none will be invented. |
| **Affected count** | 3 gyms |
| **Source evidence** | `migration-output/quarantine/gyms.json` (3 rows, `owner_uid: null`, reasons `ownerUid has no users doc`) |
| **Current classification** | QUARANTINE |
| **Existing recommended action** | "Import with owner_uid NULL (recommended: NO — approval leftovers; delete source docs at cutover) or import inactive" |
| **Migration consequence** | If imported: gym rows exist with `owner_uid NULL` (FK satisfiable only if nullable — see note). If excluded: nothing references these gyms (verified — no plans/subs/settings child data), so no orphan children result |
| **Reversibility** | Reversible either way; exclusion is trivially reversible (re-add from manifest) |
| **Recommended decision** | **APPROVE — PRESERVE + QUARANTINE (do not import the 3).** Special-case note: `Vh305r5D` is approved and therefore deserves a developer look (see Special Case B) — but the safe default stands: no import without an owner |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** (Vh305r5D flagged for developer confirmation) |

### Decision 5 — Sentinel & unknown-name plans (10)

| | |
|---|---|
| **Issue** | 6 plans with canonical names (Trial/Standard/Premium/Quarterly/Annual/Day Pass — the exact 7-name vocabulary from `src/constants/plans.js`) but `gymId: 'default'` sentinel; 4 plans with **no consumer evidence** and no gymId: `Titan`, `Basic plan`, `kickstart`, `legacy`. |
| **Affected count** | 10 plans (6 sentinel + 4 unknown) |
| **Source evidence** | `migration-output/manual-review/plans.json` (6 rows, reason `gymId 'default' sentinel`), `migration-output/quarantine/plans.json` (4 rows, reasons `plan name has no consumer evidence` + `missing gymId`); vocabulary evidence in rules §6 (grep of `src/constants/plans.js`, `firestoreService.js:976-981`, all consumers) |
| **Current classification** | 6 MANUAL_REVIEW + 4 QUARANTINE |
| **Existing recommended action** | Sentinel: exclude (no tenant). Unknown names: exclude — no semantic mapping without evidence |
| **Migration consequence** | Excluded plans vanish from the product catalog — acceptable: no consumer references them (subscriptions all `Trial`; attendance.plan ∈ {Standard, Quarterly, Annual}; 18 safe plans already cover every canonical name under 3 real gyms) |
| **Reversibility** | Reversible — manifest rows retained; can be re-imported if a tenant is later named or evidence appears |
| **Recommended decision** | **APPROVE — EXCLUDE both groups (PRESERVE + QUARANTINE). Do NOT map `Titan`/`Basic plan`/`kickstart`/`legacy` to canonical names** (see Special Case C) |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** |

### Decision 6 — Settings tenancy (6)

| | |
|---|---|
| **Issue** | 7 settings docs; after the `platform` doc is correctly placed (`gym_id='platform'`, guard-exempt, consumed by `PlatformSettings.jsx` — now SAFE), 6 remain that would derive `gym_id 'default'` and fail `guard_settings_gym`: `default:gym` + `gym` (identical gym-settings content, duplicated), `notifications` (gym alert prefs), `theme` (accent), `pricing` (plan price map — **no consumer found in src**), `profile_y9lt1eCE...` (super-admin profile prefs — no schema slot). |
| **Affected count** | 6 settings docs |
| **Source evidence** | `migration-output/manual-review/settings.json` (6 rows, reason `fails guard_settings_gym`); `migration-output/safe/settings.json` (1 row: `platform`); consumer grep: only `getSettings('platform')` in `src/pages/superadmin/PlatformSettings.jsx:250,272` |
| **Current classification** | 1 SAFE (`platform`) + 6 MANUAL_REVIEW |
| **Existing recommended action** | "Map to a real gym (only for docs that belong to it) or exclude per-doc" |
| **Migration consequence** | Excluded docs lose gym branding/notification/theme prefs — cosmetic; the app re-seeds defaults (`migrateDefaultPlans`/settings save paths). No functional consumer is affected for `pricing` (unused) or `profile_*` |
| **Reversibility** | Reversible — manifest rows retained; can be mapped once a tenant is named |
| **Recommended decision** | **APPROVE — import `platform` (SAFE, done); EXCLUDE the remaining 6 (PRESERVE + QUARANTINE).** No gym will be named for tenant settings without developer input |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** |

### Decision 7 — Orphan attendance (49)

| | |
|---|---|
| **Issue** | 49 attendance rows: no `gymId`; 30 also lack `date`/`time`; 9 distinct `memberId` values resolve to **no** member or users doc (the only members doc, `CX5jO1U3...`, is itself quarantined). No canonical parent exists to derive `gym_id`/`member_id` from. |
| **Affected count** | 49 attendance rows |
| **Source evidence** | `migration-output/quarantine/attendance.json` (49 rows); `migration-output/summaries/attendance-quarantine-manifest.json` (per-row manifest, possible-parent-matches: none) |
| **Current classification** | QUARANTINE (49/49) |
| **Existing recommended action** | Exclude with manifest — legacy/unattached test data; historical attendance is non-authoritative |
| **Migration consequence** | Zero check-in history migrated. Acceptable: the new tenant starts clean; no downstream dependency (payments/reports derive from `payments`, not attendance) |
| **Reversibility** | Reversible — manifest retained; rows can be re-attached and imported if a matching member is ever created |
| **Recommended decision** | **APPROVE — PRESERVE + QUARANTINE all 49; do not delete, do not fabricate `gymId`/`memberId`** |
| **Status** | **APPROVED (2026-08-14 — developer sign-off)** |

---

## Special Cases

### A. Owner `bRKcg3fw...` → deleted gym `RAlIvHATmLoqSVxty21v`

- **Preserving the owner relationship is NOT possible.** The target gym doc does not exist, and no gym doc claims `bRKcg3fw` as `ownerUid` (verified via the backfill map — zero candidates). The user's `gymId` field is the only trace.
- **Do not invent a replacement gym.** The profile imports (Decision 1 rules apply — role `gym_owner`, `gym_id NULL`) with reason recorded; this is the single unresolved ref keeping GATE B RED, resolved by this decision.
- **The gym remains quarantined by absence** — there is nothing to import; no child data references it (plans/subs/settings all reference the 3 live gyms or sentinel). No quarantine record is created for a non-existent doc.
- **Gate impact**: GATE B → GREEN once this decision (import profile with `gym_id NULL`) is recorded.

### B. The 9 problematic gyms — exact categories

| Category | Count | Gym ids | Importable? |
|---|---|---|---|
| Rejected gym + owner role `rejected` | 6 | `1Gz4zHCN...`, `LLrl5gO1...`, `Y3KJLfWv...`, `gym-1786295772301-372804`, `ogE7fL9i...`, `zG3GB9vi...` | **YES — safely importable** (FK-valid: owner resolves; `gym_id` = doc id; import with `approval_status='rejected'`) — tied to Decision 1 |
| Rejected gym + owner missing (orphan) | 2 | `3u8ObSiW...`, `6XND7bUX...` | **NO — must remain quarantined** (owner FK unresolvable) |
| Approved gym + owner missing (orphan) | 1 | `Vh305r5D...` | **NO — must remain quarantined** (approved but unadministrable; no owner invented) |

Net: 6 of 9 import safely; 3 remain quarantined (GATE C resolves to GREEN on this basis — zero *importable* gyms have unresolved owners).

### C. The 4 unknown plan names — no semantic mapping

| Name | duration | duration_days | Closest canonical duration | Verdict |
|---|---|---|---|---|
| `Titan` | 259200 | 120 | none (120 d is unique) | no mapping |
| `Basic plan` | 43200 | 30 | Standard/Premium both 43200 (ambiguous) | no mapping |
| `kickstart` | 129600 | 90 | Quarterly 129600 | **not** evidence — durations collide by design |
| `legacy` | 525600 | 365 | Annual 525600 | **not** evidence — durations collide by design |

Duration coincidence is not mapping evidence (Standard and Premium share 43200). No app consumer references any of the four names. **Recommendation: preserve all 4 as explicit manual-review/quarantine records — never guess.** They are independently unimportable (missing `gymId`, NOT NULL constraint), so preservation costs nothing.

### D. The 49 orphan attendance records — derivation attempt

- **No canonical parent exists.** Attempted derivations, all failed:
  - `memberId` → members docs: 0 matches (the only members doc is itself quarantined and has no `authUid` to match).
  - `memberId` → users docs: 0 matches (9 distinct ids, none in the 35 users).
  - `memberName` → members: no importable member rows to join to.
  - `gymId`: absent on every row; no parent to inherit from.
- **Do not fabricate** `gymId`/`memberId`; **do not delete** the rows.
- **Recommendation**: quarantine preservation with the manifest (`attendance-quarantine-manifest.json`, per-row reasons + recommended action). Reopen trigger: a member doc appears whose id/authUid matches one of the 9 dangling ids, or the developer provides a mapping.

---

## Safe-Default Principle Applied

Where evidence was insufficient, the recommendation is **PRESERVE + QUARANTINE**, never GUESS + IMPORT:
- Orphan gyms (3) — preserved, no owner invented
- Unknown-name plans (4) — preserved, no semantic guess
- Sentinel plans (6) — preserved, no tenant invented
- Tenantless settings (6) — preserved, no gym named
- Orphan attendance (49) — preserved, no parent fabricated
- Deleted-gym owner `bRKcg3fw` — preserved as `gym_id NULL`, no replacement gym

Data integrity is the objective; the import percentage is not.

---

## Sensitive-data note

This document contains no passwords, hashes, salts, API keys, or unmasked personal data. All evidence is doc ids, counts, and masked values from `migration-output/` (GATE A GREEN).