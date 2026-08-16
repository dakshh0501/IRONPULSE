# FIREBASE Data Migration Audit (READ-ONLY)

**Step 5A — Production data inventory + migration validator**
**Project:** `ironpulse-32f31` (Firebase production) · **Run:** 2026-08-14 · **Mode:** read-only
**Tool:** `supabase/scripts/migration_inventory_report.js` (pure Node ESM, zero deps, admin-read REST access via Firebase CLI refresh token; rules bypassed; NOTHING was written anywhere — Firebase and Supabase untouched)

## 1. Executive Verdict

| Metric | Count |
|---|---|
| Collections present (top-level) | 13 |
| Collections present but empty | 18 |
| Unknown collections | 0 |
| Total documents inventoried | 258 (193 top-level + 65 subcollection messages) |
| **SAFE** (migrate as-is after id remap) | **180** |
| **AMBIGUOUS** (needs a decision before migrate) | **24** |
| **BLOCKING** (cannot migrate without a decision) | **54** |
| Read errors | 0 |

Findings that must be resolved before any import (all decision-based, none require touching Firebase):

1. **All 49 attendance records are orphaned** — every one lacks `gymId`; 9 distinct `memberId` values match NO users doc and NO members doc (only 1 member doc exists in the entire dataset, and no attendance record references it). The 49 records are fully unattachable test-era data.
2. **All 28 plan docs carry `duration` as a string** (e.g. `"90 minutes"`) — needs numeric coercion; 4 plan docs additionally lack `gymId`; 6 use the `default` sentinel.
3. **4 plan names need a canonical mapping**: `Titan`, `Basic plan`, `kickstart`, `legacy` (1 doc each) — none match the canonical membership-plan vocabulary.
4. **The single `members` doc stores a plaintext `password` field** (value never dumped). It is orphaned (no `authUid`, email matches no user, weight is a string, `gymId` missing). Must be redacted, not migrated.
5. **Tenancy is unreliable in legacy data**: 10 users have no `gymId`; 2 users point at deleted gyms (`RAlIvHAT...`, `COMMANDOGYM`); 18 notifications, 6 plans and 14 AI conversations use the `default` sentinel; 4 gym docs lack a `gymId` field; 3 gyms have an `ownerUid` with no users doc; 6 gyms are owned by `rejected`-role users.
6. **`users_export.json` (local Auth export) is stale/unreliable**: 34 users in export vs 35 users docs; 19 export UIDs have no users doc and 20 users docs are absent from the export. Do not use it as an authority for user enumeration.
7. **`gyms.documents` does not exist anywhere** — the documents subcollection is absent on all 16 gyms; there is nothing to transform for the documents feature.

Positives: zero deterministic-identifier collisions (referral codes, referral doc-ids, paymentIds, invoiceNos, license keys, device pairs, coupon codes, subscription.gymId, member/trainer authUids), zero role enum violations, 7/7 subscription gymId references resolve, 11/11 licenseHistory gymId references resolve, all 65 AI conversation messages are clean.

---

## 2. Collection Inventory

Top-level collections discovered via `listCollectionIds` (13): `users, gyms, subscriptions, subscriptionHistory, paymentAttempts, members, trainers, plans, attendance, notifications, contactMessages, settings, licenseHistory, referralCodes, aiConversations` + subcollection `aiConversations/{id}/messages`.

### Per-collection buckets (total / SAFE / AMBIGUOUS / BLOCKING)

| Collection | Total | SAFE | AMBIG | BLOCK | Notes |
|---|---|---|---|---|---|
| users | 35 | 35 | 0 | 0 | structurally clean; tenancy issues only (see §6, §9) |
| gyms | 16 | 16 | 0 | 0 | 8 approved / 8 rejected; owner issues (§7) |
| subscriptions | 7 | 7 | 0 | 0 | all gymId refs resolve; 6 carry licenseKey |
| subscriptionHistory | 2 | 2 | 0 | 0 | gymId refs resolve |
| paymentAttempts | 0 | — | — | — | empty |
| members | 1 | 0 | 0 | 1 | legacy test doc; password field; §5 |
| trainers | 0 | — | — | — | empty |
| plans | 28 | 0 | 24 | 4 | duration string (28/28); gymId missing (4); §8 |
| attendance | 49 | 0 | 0 | 49 | gymId missing on all; 48 dangling memberId (§10) |
| notifications | 18 | 18 | 0 | 0 | 14 userId resolve; 4 dangling; gymId all `default` |
| contactMessages | 3 | 3 | 0 | 0 | clean |
| settings | 7 | 7 | 0 | 0 | legacy bare-id docs; §11 |
| licenseHistory | 11 | 11 | 0 | 0 | all gymId resolve |
| referralCodes | 1 | 1 | 0 | 0 | `IP-H6POBD`; referrer resolves |
| aiConversations | 15 | 15 | 0 | 0 | userId resolve; gymId 14×`default`, 1 real |
| aiConversationMessages | 65 | 65 | 0 | 0 | subcollection; clean |
| **Total** | **258** | **180** | **24** | **54** | |

Collections present but **empty** (no documents at all): `trainers, planTemplates, dietPlans, workoutPlans, progressLogs, payments, supportTickets, featureRequests, whatsappLogs, whatsappCampaigns, licensedDevices, referrals, rewardLedger, discountCoupons, referralAuditLogs, auditLog, generatedReports, paymentAttempts` (18 total). Migration for these = table creation only, no data.

---

## 3. Data Quality Audit (field-level)

- **users (35)**: 0 missing required, 0 missing gymId at schema level, 0 type issues, 0 id/uid mismatches (`uid` == doc id on all). Referral-code quality: 0 duplicate codes, 0 invalid formats, 1 users doc has a code with no `referralCodes/{code}` directory entry (Sprint 81E self-heal converges this at that user's next login — benign).
- **plans (28)**: `duration` is a string on all 28 (expected number) — e.g. `"90 minutes"`; requires parsing + coercion. 4 docs missing `gymId`. No id mismatches.
- **members (1)**: missing `gymId`; `weight` string (expected number); legacy fields (`bf`, `strength`, `goal`, `join`, `checkins`, `amountPaid`, `balanceDue`, `planPrice`); `password` field present (see §14).
- **attendance (49)**: missing `gymId` on all 49; 30/49 also missing `date` AND `time` (pre-standardization legacy rows that carry `timestamp` + `type` instead — the old schema from before the standardized `date/time/method/duration` check-in schema); 1 doc missing `method`. Methods observed: `QR`, `Manual`, 1 missing. Durations numeric and valid (no `badDuration`).
- **notifications (18)**: `priority` and `read` valid on all; all 18 are `type: gym`; 14 `userId` resolve to users docs, 4 do not.
- **settings (7)**: all parse as composite ids; 6 legacy bare ids (`gym`, `notifications`, `platform`, `pricing`, `theme`, `profile_y9lt1eCE...`) + 1 true composite (`default:gym`). One parse anomaly: doc id `platform` has field `gymId: "default"` (legacy super-admin doc; id-gymId `platform` vs field-gymId `default` mismatch — harmless, but the doc is NOT gym-scoped).
- **aiConversations (15) + messages (65)**: 0 issues of any kind; all 65 messages have valid `role`/`content`; all messages attach to existing conversations.

---

## 4. UID Mapping & Auth Cross-Check

| Check | Value |
|---|---|
| users collection docs | 35 |
| `users_export.json` Auth export users | 34 |
| Export UIDs with no users doc | 19 |
| Users docs with no export entry | 20 |

The local Auth export is **stale** (taken earlier; Auth users have since been added/deleted) and must not be used as the user enumeration authority. The users **collection** is the source of truth for migration. `users_export.json` additionally contains `passwordHash`/`salt` — sensitive; used only for masked cross-check, never persisted.

---

## 5. Member Identity Conflicts

- Only **1 member doc** exists (`CX5jO1U3...`, name `jfdjhvs`). It has **no `authUid`**, its email matches **no users doc**, and it carries a plaintext `password` field.
- **9 distinct attendance `memberId` values** exist across the 49 attendance docs (names: `John`, `wrgfrdsf`, `ewfwd`, `ABC2`, `ABC3`, `Joshua`, `Test`, `BETE`, `Test 2.0`) — **none** matches a users doc id, a member doc id, or an auth UID. Every attendance row is therefore un-attachable to a member identity; the names indicate test-era data.
- No email-based member→user matching was performed (not safe to automate); the only surviving member doc is unmatchable anyway.
- **Conflict verdict**: member identity data is effectively absent in production. The members table will migrate with 0 attachable records; attendance will be migrated only as unattached history (see §12/§13) or excluded per decision.

---

## 6. Role Normalization

| Role | Count |
|---|---|
| super_admin | 1 |
| gym_owner | 8 |
| gym_owner_pending | 6 |
| member | 9 |
| trainer | 3 |
| rejected | 8 |
| **Total** | **35 |

- 0 invalid/unrecognized role values (enum-safe against the migration `user_role` enum).
- 0 role-alias conflicts.
- **10 users lack `gymId`** (legacy pre-multi-tenant accounts: 9 member/trainer-role + 1 other) → they have no tenancy anchor (AMBIGUOUS: assign to `default` tenant or leave unassigned).
- **2 users point at deleted gyms**: `bRKcg3fw... → RAlIvHAT...` (no gym doc), `y9lt1eCE... → COMMANDOGYM` (no gym doc — legacy single-tenant id).
- Role↔gym ownership conflicts: 6 gyms owned by `rejected`-role users (their owners were later rejected) — see §7.

---

## 7. Gym Integrity & Ownership

- 16 gym docs: **8 `approved`, 8 `rejected`**. `status` field absent on all (approval-driven).
- **Embedded subscription objects**: present on 6 gyms (5× 14-key shape `licenseKey/plan/planType/status/paymentStatus/amount/currency/startDate/expiryDate/deviceLimit/licenseStatus/generatedAt/updatedAt/paymentMethod`; 1× 10-key `planName/planId` variant) — vs **7** subscription docs. One subscription doc has no embedded mirror in its gym (dual-write drift, benign for migration: subscription table wins).
- **3 owner orphans**: gyms `3u8ObSiW...`, `6XND7bUX...`, `Vh305r5D...` have an `ownerUid` with no users doc → owner cannot be linked (AMBIGUOUS: migrate gym with `owner_id NULL` or drop).
- **6 gyms owned by `rejected` users** (`1Gz4zHCN...`, `LLrl5gO1...`, `Y3KJLfWv...`, `gym-1786295772301-372804`, `ogE7fL9i...`, `zG3GB9vi...`) — owner rows exist but role is `rejected`; migration must decide whether these gyms are migrated as inactive.
- **4 gym docs lack a `gymId` field** (doc id is the only id).
- Gym-scoped children are essentially absent: members 0 attachable, trainers 0, attendance 0 (all gymless), payments 0. Only 4 gyms have any user attached (1 user each).
- `gyms.documents`: absent on all 16 — see §11.

---

## 8. Plan Normalization Proposal

Canonical membership-plan vocabulary (from migration schema): `Trial, Standard, Premium, Quarterly, Annual, Lifetime, Day Pass`.

Observed values (all sources combined, count = docs):

| Value | Count | Proposal |
|---|---|---|
| Standard | 20 | Standard |
| Trial | 11 | Trial |
| Quarterly | 7 | Quarterly |
| Annual | 5 | Annual |
| Premium | 4 | Premium |
| Day Pass | 4 | Day Pass |
| Basic plan | 1 | **(needs decision)** — likely Standard |
| kickstart | 1 | **(needs decision)** — likely Trial |
| legacy | 1 | **(needs decision)** — likely Trial/Standard |
| Titan | 1 | **(needs decision)** — likely Premium |

Source breakdown: `subscriptions.plan/planType` = Trial×7; `members.plan` = Standard×1; `attendance.plan` = Standard×15, Quarterly×3, Annual×1; `plans.name` = all 10 values (4 each for the 6 canonical, 1 each for the 4 unknowns).

Additional plan data issues:
- `duration` is a **string** on all 28 plan docs — parse to minutes (e.g. `"90 minutes"` → 90) before import.
- `gymId`: 18 resolve to real gyms (SAFE), 6 use `default` sentinel, 4 missing (BLOCKING).
- No duplicate plan names within a gym; no id/name mismatches.

---

## 9. Deterministic Identifier Collisions

Checked across all deterministic-key candidates — **zero collisions**:

| Domain | Total checked | Duplicates |
|---|---|---|
| referralCodes values + directory↔user symmetry | 1 | 0 (1 user code lacks directory entry — self-heal pending) |
| referrals doc-id vs `referredUid` field, duplicate pairs, status | 0 | 0 |
| payments `paymentId` + `invoiceNo` (format `INV-YYYYMMDD-XXXX`) | 0 | 0 |
| paymentAttempts `paymentId` | 0 | 0 |
| licenseKey across gyms + subscriptions | 6 | 0 |
| licensedDevices gymId+deviceId pairs | 0 | 0 |
| discountCoupons codes | 0 | 0 |
| members/trainers `authUid` | 1/0 | 0 |
| subscriptions per-gymId | 7 | 0 |

The `gyms`/`subscriptions` dual-write is consistent enough that the subscription table (7 rows) is the authoritative side.

---

## 10. Orphan Analysis

| Orphan type | Count | Detail |
|---|---|---|
| attendance.memberId → no member/users doc | 48 | 9 distinct ids; all dangling; (1 doc's memberId not checked — its id also appears nowhere) |
| notifications.userId → no users doc | 4 | deleted/unmatched users |
| gyms.ownerUid → no users doc | 3 | ownerOrphans |
| users.gymId → no gym doc | 2 | `RAlIvHAT...`, `COMMANDOGYM` |
| users with no gymId at all | 10 | legacy accounts |
| plans.gymId = `default` sentinel | 6 | no `gyms/default` doc exists (sentinel by design) |
| notifications.gymId = `default` sentinel | 18 | all notifications |
| aiConversations.gymId = `default` sentinel | 14 | legacy tenant |

Subscriptions (7), subscriptionHistory (2), licenseHistory (11), referralCodes (1) — **0 orphans**; all gymId/userId refs resolve.

---

## 11. `gyms.documents` Shape

- `documents` subcollection/field present on **0 / 16** gyms (`missing` on all).
- No representative keys, no value types to transform.
- **Conclusion**: the documents feature is unused in production; migration should create the table empty (or skip) — nothing to normalize.

---

## 12. Blocking Records (54)

Records that cannot be imported without a decision (the decision is a mapping rule, not a Firebase change):

| Collection | Count | Blocking condition |
|---|---|---|
| attendance | 49 | missing `gymId` (no tenant anchor); 30 of them also lack `date`/`time` (legacy schema) |
| plans | 4 | missing `gymId` |
| members | 1 | missing `gymId`, string `weight`, plaintext `password` (redact), no identity link |

Recommended handling: (a) attendance → migrate as unattached history under a designated "legacy" tenant, or exclude; (b) the 4 plans → assign tenant by owner decision or exclude; (c) member doc → redact password field, coerce types, and import only if the tenant assignment is made, else exclude.

---

## 13. Safe-to-Migrate Records (180)

| Collection | Count | Notes |
|---|---|---|
| users | 35 | all fields valid; tenancy caveats in §6 |
| gyms | 16 | approval/subscription mirrored; owner caveats §7 |
| subscriptions | 7 | SAFE refs; 6 licenseKeys |
| subscriptionHistory | 2 | SAFE |
| notifications | 18 | 4 userIds dangling → nullable FK (AMBIGUOUS-lite; kept SAFE because schema allows null) |
| contactMessages | 3 | SAFE |
| settings | 7 | legacy ids — remap to tenant-scoped keys |
| licenseHistory | 11 | SAFE |
| referralCodes | 1 | SAFE |
| aiConversations | 15 | userId SAFE; gymId `default` sentinel on 14 |
| aiConversationMessages | 65 | SAFE; attach after conversations get stable ids |

---

## 14. Sensitive-Data Findings

1. **`members/CX5jO1U3...` contains a plaintext `password` field.** This violates the app's own password-stripping invariant. Value was never dumped or persisted; the doc must be **redacted before any migration** (or excluded). Post-migration, the source doc should be scrubbed manually by a Firebase admin.
2. **`users_export.json` contains `passwordHash` + `salt`** — sensitive artifact at repo root. Used only for masked cross-check; must not be imported, copied into docs, or committed to the Supabase project.
3. All output (console + JSON artifact) masks emails (`j***@gmail.com`), phones, and truncates doc ids to 8 chars; no document values are persisted by the tool.

---

## 15. Recommended Transformation Order (import staging)

1. **Tenants/gyms** — insert 16 gyms (decide fate of 3 owner-orphans + 6 rejected-owner gyms first).
2. **Users** — insert 35 users; resolve the 10 no-gymId users (assign legacy tenant or NULL); drop/repair the 2 deleted-gym refs.
3. **Subscriptions + subscriptionHistory + licenseHistory** — 7/2/11 rows, all refs resolve.
4. **Plans** — 28 docs: coerce `duration` to minutes, decide 4 unknown names, assign tenant for the 4 gymless docs, map `default` → tenant.
5. **Notifications** — 18 rows; 4 userIds → NULL; `default` → tenant.
6. **Contact messages, settings** — 3 + 7 (settings remapped to `{gymId}:{docId}` keys).
7. **Referral codes** — 1 row.
8. **AI conversations + messages** — 15 + 65 (messages after conversation ids).
9. **Attendance** — decision-gated (exclude or migrate as unattached legacy history).
10. **Members** — decision-gated (redact password, fix types) or exclude.

---

## 16. Reproduction

```bash
node supabase/scripts/migration_inventory_report.js --out <dir>
# auth: FIREBASE_ACCESS_TOKEN > FIREBASE_TOKEN > firebase-tools configstore refresh token
# guards: aborts if FIREBASE_EMULATOR / SUPABASE_SERVICE_ROLE_KEY / FIREBASE_SERVICE_ACCOUNT are set
```

Artifacts (no sensitive values): `<out>/migration_inventory_report.json` (full report incl. per-doc flags), console summary (collections, totals, buckets, read errors).

**Remaining risk**: none from this step — no writes were performed; all findings are decisions for the import plan (Step 5B+).
