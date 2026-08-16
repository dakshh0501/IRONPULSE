# FIREBASE IMPORT RULES — Deterministic Transformation Specification

**Step 5B — dry-run import rules.** Companion to `docs/FIREBASE_IMPORT_PLAN.md` (order + gates) and `docs/FIREBASE_DATA_MIGRATION_AUDIT.md` (Step 5A findings).
Authoritative schema: `supabase/migrations/0001_initial_schema.sql` / `docs/SUPABASE_DDL_SPEC.md`.
Status: **SPECIFICATION ONLY — no import has occurred.**

---

## 1. Authoritative Source (Step 1)

| Source | Role |
|---|---|
| Firestore `users` collection | Authoritative user registry (35 docs) |
| Firestore production collections per Step 5A audit | Authoritative data (13 collections, 258 docs) |
| `users_export.json` (repo root) | **EXCLUDED** — stale (34 users vs 35 docs; 19/20 asymmetric), contains `passwordHash`/`salt` |

Explicitly excluded material (never read into transforms, never written to artifacts):

- `users_export.json` — whole file
- password hashes and password salts (any field matching `password|passwd|hash|salt|secret|token|credential|api[_ -]?key`)
- plaintext `password` fields (observed once: `members/CX5jO1U3...`)
- any stale/exported credential material (Firebase Auth exports, service-account JSON, API keys, `.env` secrets)

No Firebase passwords are generated, preserved, or transported at any point.

## 2. User / Auth Transformation (Step 2)

- `profiles.firebase_uid` = Firestore users doc id (Firebase UID)
- `profiles.id` = provisional deterministic UUID (uuid5-style of `firebase_uid`); at provisioning time the real Supabase `auth.users.id` replaces it — `firebase_uid` is the stable bridge (unique, NOT NULL)
- `profiles.email/phone/name/photo_url/role/gym_id/referral_code/referred_by/created_at` mapped directly
- `profiles.is_super_admin` = true iff `role == 'super_admin'` (rule R-SUPER)
- `profiles.account_disabled` = true iff `role == 'rejected'` (rule R-REJECTED-DISABLE); no disabled-reason fabrication
- `profiles.gym_id` = `gymId` when it resolves to an existing gym doc id, else NULL (with reason recorded)
- Emails and phones are **masked in all generated artifacts**; real values are re-read from Firebase only at actual import time

### User classification (35 users — deterministic)

| Class | Rule | Expected |
|---|---|---|
| SAFE_AUTH_PROVISION | role ∈ {super_admin, gym_owner} AND email present/valid AND (super_admin OR gymId resolves — direct field OR backfilled from `gyms.ownerUid` when exactly one gym claims the uid; R-OWNER-BACKFILL) | 8 |
| MANUAL_REVIEW | role `rejected` (8) · role `gym_owner_pending` (6) · role member/trainer with no resolvable gymId (`default` sentinel or absent) (12) · gymId points to a non-existent gym doc (1: `bRKcg3fw...` → `RAlIvHAT...`) | 27 |
| BLOCKING | missing email · invalid email · missing role · other source-data issue | 0 expected |

Dry-run verified: **8 SAFE (7 gym_owner + 1 super_admin), 27 MANUAL_REVIEW, 0 BLOCKING** (2026-08-14). Note: 1 of the 8 `gym_owner` rows (`bRKcg3fw...`) is MANUAL_REVIEW because its `gymId` points to a deleted gym and no gym claims its `ownerUid`; the remaining 7 resolve directly.

No auth user is created by this step; the manifest only *prepares* the `firebase_uid → profiles.id` mapping (GATE A blocks any credential-bearing output).

## 3. Gym Transformation (Step 3)

- `gyms.id` = **preserved Firestore doc id (text)** — schema requires it; plan children already reference gyms by doc id (evidence: 18 plan docs reference `GadKLv23...`, `5phqBpix...`, `r7bcZ14h...`)
- 5 gyms lack a `gymId` field (`M6XqgpXb`, `P0oebgj7`, `ogE7fL9i`, `r7bcZ14h`, `yRTNmXSJ`) — rule R-GYMID-DOCID: `gym_id = doc id` (documented; the field was a self-reference; child references already use doc ids)
- `gyms.owner_uid` = `ownerUid` when a users doc exists, else NULL + quarantine/manual classification
- `gyms.documents` → `jsonb` (absent everywhere; default `{}`)
- embedded `gym.subscription` → `jsonb` verbatim (6 gyms); the `subscriptions` collection remains the relational authority
- `gyms.status` → NULL (field absent in source)

### Gym classification (16 — deterministic)

| Class | Rule | Expected |
|---|---|---|
| SAFE_IMPORT | approval_status `approved` AND owner resolves to a users doc with role `gym_owner` | 7 |
| MANUAL_REVIEW | approval_status `rejected` AND owner resolves but role is `rejected` (6) — decision: import as inactive / keep owner link | 6 |
| QUARANTINE | ownerUid has NO users doc (3: `3u8ObSiW...`, `6XND7bUX...`, `Vh305r5D...`) — no owner invented; quarantine record prepared | 3 |

## 4. Role Normalization (Step 4)

Observed roles (35 users): `super_admin` (1), `gym_owner` (8), `gym_owner_pending` (6), `member` (9), `trainer` (3), `rejected` (8).

| Observed | Canonical (user_role enum) | Action |
|---|---|---|
| super_admin | super_admin | SAFE |
| gym_owner | gym_owner | SAFE |
| gym_owner_pending | gym_owner_pending | SAFE (enum member) — but account classified MANUAL_REVIEW (approval incomplete) |
| member | member | SAFE (enum member) |
| trainer | trainer | SAFE |
| rejected | rejected | SAFE (enum member) — account_disabled=true |
| (any other observed value) | — | BLOCKING — never silently coerced |

No aliases exist in the data; the mapping is identity. Unknown roles → BLOCKING with explicit reason.

## 5. Member Transformation (Step 5)

Canonical model (schema 2.4): `members.id` = canonical deterministic UUID; `members.legacy_id` = Firestore doc id (unique); `members.auth_uid` = Firebase UID when applicable. `authUid` is **never** used as `members.id`.

Rules:
- legacy_id = doc id (always preserved)
- auth_uid = doc's `authUid` if it resolves to a users doc, else NULL (recorded)
- gym_id = doc's `gymId` if it resolves to a gym doc, else classification downgrade (gym_id is NOT NULL)
- trainer_id/trainer_auth_uid = resolved via trainers map when present, else NULL
- password/password-like fields: **stripped before any transform** (GATE A)
- weight/height → numeric coercion; uncoercible → QUARANTINE
- member with unresolvable identity → QUARANTINE with reason — never silently dropped

Expected: 1 member doc (`CX5jO1U3...`) → **QUARANTINE** (plaintext `password` present, no gymId, no authUid, weight is a string, name/email match no user).

## 6. Plan Normalization (Step 6)

### Evidence review (application consumption)

- `src/constants/plans.js`: `PLAN_OPTIONS = ['Trial','Standard','Premium','Quarterly','Annual','Lifetime','Day Pass']`; `PLAN_ORDER`/`PLAN_AMOUNTS` keyed by those 7 only
- `src/services/firestoreService.js:976-981` (`migrateDefaultPlans`): seeds exactly those 7 names with `duration: '7 Days'/'1 Month'/'3 Months'/'12 Months'/'1 Day'` + `durationDays`
- `src/pages/Subscriptions.jsx`, `GymSubscription.jsx`, `Checkout.jsx`, `superadmin/Subscriptions.jsx`, `paymentService.js`, `subscriptionService.js`: all consume the 7 canonical names
- **No source file references `Titan`, `Basic plan`, `kickstart`, or `legacy` as a plan name** ("Titan" appears only as a testimonial gym name in `Landing.jsx`)
- No consumer data (attendance.plan, members.plan, subscriptions.plan, payments.plan) references the four names — attendance plans: Standard/Quarterly/Annual only; subscriptions: Trial only

### Name mapping decision

| Observed name | Count | Evidence | Classification |
|---|---|---|---|
| Trial / Standard / Premium / Quarterly / Annual / Day Pass | 24 | canonical; matches PLAN_OPTIONS + seeds | SAFE_IMPORT (name axis) |
| Basic plan | 1 | no consumer evidence; also lacks gymId | **MANUAL_REVIEW** — no semantic mapping without evidence |
| kickstart | 1 | no consumer evidence; also lacks gymId | **MANUAL_REVIEW** |
| legacy | 1 | no consumer evidence; also lacks gymId | **MANUAL_REVIEW** |
| Titan | 1 | no consumer evidence; also lacks gymId | **MANUAL_REVIEW** |

No semantic mapping is chosen without evidence. The exact decision required from the developer: confirm whether each of the four names maps to a canonical plan (e.g. Titan→Premium, kickstart→Trial, Basic plan→Standard, legacy→Trial) or is renamed/retired.

### Duration coercion (explicit function)

Source `duration` is a string on all 28 docs; `durationDays` is an int on all 28 (authoritative for days).

```
parseDurationToMinutes(s):
  trim s; match /^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|month|months|y|year|years)?$/i
  unit factor: minute(s)/min(s)=1, hour(s)/hr(s)/h=60, day(s)/d=1440,
               week(s)/w=10080, month(s)=43200 (30 d), year(s)/y=525600 (365 d)
  bare number → minutes as-is
  no match → MANUAL_REVIEW (reason: unparseable duration '<s>')
plans.duration      = parseDurationToMinutes(duration)   (int, minutes)
plans.duration_days = durationDays                        (int, authoritative; fallback round(duration/1440))
```

All 28 observed values parse ('1 Month', '3 Month(s)', '7 Days', '12 Months', '6 Month', '1 year', '1 Day').

### gymId handling

- 18 docs with gymId resolving to a gym doc → SAFE on tenant axis
- 6 docs with `gymId: 'default'` sentinel (no `gyms/default` doc) → **MANUAL_REVIEW** (gym_id is NOT NULL; tenant decision required — no safe fallback exists)
- 4 docs with NO gymId (exactly `Basic plan`, `kickstart`, `legacy`, `Titan`) → **QUARANTINE** (gym_id NOT NULL, no fallback, plus name decision)

## 7. Attendance Transformation (Step 7)

All 49 records lack `gymId`. Rules (no fabricated gym ids):

1. exact member mapping — attempt `memberId` → members doc / auth UID → **0 matches**
2. exact auth UID/user mapping — attempt `memberId` → users doc → **0 matches**
3. gym derivation from a valid canonical parent — impossible (no parent resolves) → **not DERIVABLE**

Result: **49/49 QUARANTINE** with a manifest (`migration-output/summaries/attendance-quarantine-manifest.json`): source doc id, reason, possible parent matches (none), recommended manual action (either re-attach to a real member by name/date evidence or exclude as test-era data; 30 rows additionally lack `date`/`time` — pre-standardization legacy rows). No record is discarded; no sensitive payload values are included in the manifest.

## 8. Other Child Collections (Step 8)

Per-record classification (SAFE_IMPORT / MANUAL_REVIEW / QUARANTINE); nothing silently dropped.

| Collection | Source | Rule | Expected |
|---|---|---|---|
| subscriptions | 7 | gymId resolves; status `active` ∈ enum; paymentStatus `paid` ∈ enum; licenseKey absent → NULL (schema-unique nullable) | 7 SAFE_IMPORT |
| subscriptionHistory | 2 | gymId resolves; subscription_id linked via gymId when exactly one match, else NULL | 2 SAFE_IMPORT |
| paymentAttempts | 0 | — | empty |
| payments | 0 | — | empty |
| notifications | 18 | user_id NOT NULL: 14 resolve → SAFE_IMPORT with gym_id NULL (rule R-SENTINEL-NULL: `default` → NULL on nullable FK); 4 unresolved userId → QUARANTINE | 14 SAFE / 4 QUARANTINE |
| settings | 7 | composite identity preserved (gym_id = field `gymId` or `default`, doc_id = bare id); guard_settings_gym rejects non-`platform`/non-existent gym_id → all 7 MANUAL_REVIEW (tenant decision) | 7 MANUAL_REVIEW |
| licenseHistory | 11 | gymId resolves → SAFE_IMPORT | 11 SAFE_IMPORT |
| referralCodes | 1 | referrerUid resolves; code `IP-H6POBD` preserved (format-checked) | 1 SAFE_IMPORT |
| aiConversations | 15 | userId resolves (15); gymId `default` → NULL | 15 SAFE_IMPORT |
| aiConversationMessages | 65 | conversation_id attaches via deterministic conversation UUIDs | 65 SAFE_IMPORT |
| contactMessages | 3 | no FKs | 3 SAFE_IMPORT |
| gyms.documents | 0 | absent everywhere — no transform | n/a |
| Empty collections | 0 | trainers, plans-templates, dietPlans, workoutPlans, progressLogs, payments, supportTickets(+replies/notes/attachments), featureRequests, whatsappLogs, whatsappCampaigns, licensedDevices, referrals, rewardLedger, discountCoupons, referralAuditLogs, auditLog, generatedReports, paymentAttempts | summarized as empty (18) |

Empty collections still produce per-collection summaries (source 0) so GATE G reconciliation is total.

## 9. Deterministic Identifiers (Step 9)

Preserved exactly (Step 5A found zero collisions):

- `referral_codes.code` (natural key; format `^IP-[A-Z0-9]{6}$`)
- `referrals.referred_uid` (deterministic doc-id-as-PK convention) — collection empty
- `payments.payment_id` / `payments.invoice_no` — collection empty; format re-validated anyway
- `subscriptions.license_key` — absent in source docs (nullable); re-validated as zero-duplicate
- `settings` composite identity `(gym_id, doc_id)` — preserved as parsed
- `gyms.id` — preserved doc id (text PK)
- `profiles.firebase_uid` — preserved (unique)
- `members.legacy_id`, `trainers.legacy_id` — preserved doc ids

No replacements are generated unless the source value is genuinely missing; replacements (if ever needed) are only proposed, never emitted into an import.

## 10. Sanitization (Step 10)

- Strip/deny-list (fields and any nested keys): `password`, `passwd`, `passwordHash`, `passwordSalt`, `salt`, `hash`, `token`, `secret`, `credential`, `apiKey`/`api_key`/`api-key`, `privateKey`, `refreshToken`, `accessToken`
- Mask emails (`j***@gmail.com`) and phones (`+91 98***321`) in every artifact
- These never appear in: import JSON, logs, migration documentation, SQL files, generated reports
- Enforced mechanically by GATE A (scan of all generated files for deny-list keys)

## 11. Classification Taxonomy

- **SAFE_AUTH_PROVISION / SAFE_IMPORT** — importable as-is after documented coercions
- **MANUAL_REVIEW** — one explicit decision required (tenant, name mapping, account state, nullable-FK policy)
- **QUARANTINE** — cannot import without rework or exclusion; manifest with reason + possible matches + recommended action

All counts are deterministic per run; every record carries its classification and reasons in the generated manifests (`migration-output/`).