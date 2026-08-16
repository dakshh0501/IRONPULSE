# SUPABASE AUTH PROVISIONING — EXECUTION GUIDE (STEP 6C)

**Status: BAN-FIX (6C-FIX) + RECOVERY-POLICY FIX (6C-FIX2) APPLIED — PARTIAL EXECUTION ON 2026-08-14, RESUME IDEMPOTENT.**
Tool: `scripts/migration/provision_supabase_auth.js` (idempotent; fail-fast only on hard create/ban/verify errors; never destructive; fixture-tested 25/25).

---

## 0. Partial Execution Record (2026-08-14): 6C-FIX (ban) and 6C-FIX2 (recovery policy)

### Run 1 (`AP-20260814092524`) — ban 404, fixed by 6C-FIX

| # | Result | Detail |
|---|---|---|
| 1 | `created` | 1 normal user (`6oPiPBcZ…`, member) — created successfully |
| 2 | `error` | G1 canonical rejected user (`A0kiygGn…`) — created, then **ban failed**: `PUT /auth/v1/admin/users/a7bb02b7-7b4b-40b5-9315-b5ae51ae6c1d/ban → HTTP 404` |
| 3 | `create` | remaining 23 users — never attempted (fail-fast stop after the error) |

### Run 2 (`AP-20260814093703`) — recovery delivery failure, fixed by 6C-FIX2

| # | Result | Detail |
|---|---|---|
| 1 | `skip` | `6oPiPBcZ…` — existing-correct (matching metadata), resumed |
| 2 | `banned` | `A0kiygGn…` — ban applied **in place** (6C-FIX path, verified via `banned_until`) |
| 3 | `error` | `A4EI9QVE…` (trainer) — **CREATED** (`78f1d8d8-89a8-47d4-b8bb-9fcf0f798db1`) but recovery delivery failed: `/auth/v1/recover: Email address "trainer@gym.com" is invalid` |
| 4 | `create` | remaining 22 users — never attempted (fail-fast stop) |

**Current remote state (manifest evidence): 3 Auth users** — `6oPiPBcZ…` (`248ef170…`, normal), `A0kiygGn…` (`a7bb02b7…`, banned), `A4EI9QVE…` (`78f1d8d8…`, created, recovery NOT delivered). 22 remaining (21 normal + `ArlmC1TZ…` create-banned). Note: the manifest records `targetSupabaseUuid` for `A4EI9QVE…` — creation succeeded; only the recovery email was rejected.

### Root cause of the recovery failure (confirmed, not assumed)

- GoTrue validates email addresses at **email-SEND time**, not at admin user creation: `internal/api/mail.go` → `sendEmail` → `mr.RecoveryMail(...)` → mailer `validateclient` (`ErrInvalidEmailAddress` / `ErrInvalidEmailFormat` / `ErrInvalidEmailDNS`) → mapped to `ErrorCodeEmailAddressInvalid` → **`Email address %q is invalid`** (HTTP 400).
- Supabase's error-code reference documents `email_address_invalid` as: **"Example and test domains are currently not supported."**
- The admin **create** endpoint never sends mail (`email_confirm: true`) → creation succeeded for `trainer@gym.com`; only `/auth/v1/recover` hit the stricter validator.
- DNS probes: `gym.com` HAS MX + A records — the rejection is GoTrue's domain policy (major-provider allowlist; example/test-domain handling), not a "no MX" rule. The source address is RFC-valid and accepted by Firebase. **No email is fabricated or rewritten.**
- This was NOT an API misuse (D) nor application-level validation (C); it is GoTrue-side **email validation at recovery-link generation** (A+B). It also affects `member@gym.com` (`fvPn9yyf…`) and may affect other non-allowlisted domains (`example.com`, `mrworlds.com`, `doefy.com`) at delivery time — the per-user classification handles all of them.

### Corrected recovery implementation (6C-FIX2)

- **Creation and recovery delivery are fully separated** in `executePlanStep`:
  1. create (`POST /auth/v1/admin/users`) — idempotent, never rolled back,
  2. rejected → ban + verify (`banned_until` future),
  3. normal → recovery delivery (`POST /auth/v1/recover`), **non-fatal**.
- **Classification** (per-user, in the manifest `recoverySummary`):
  - `recovery: 'delivered'` — link sent successfully,
  - `recovery: 'delivery-failed'` (`RECOVERY_DELIVERY_FAILED`, reason `invalid-email`/`other`) — **user stays created**; manual credential setup required; the run continues,
  - `status: 'manual-review'` — the address was rejected at **creation** time (`email_address_invalid`): no user created, no fabricated address, source email preserved, run continues,
  - `status: 'error'` — hard create/ban/verify failure only → fail-fast (rerun idempotent).
- **Masking**: emails in error text are masked in console output and manifests (`maskText`); the previous manifest's raw `"trainer@gym.com"` leak is prevented going forward.
- **`--resend-recovery`** (execution only): re-attempts recovery delivery for existing-correct normal users (skip entries); never creates/deletes/bans anything.
- Pre-flight conflict protections, drift guards, 25/22/3 counts, and the 6C-FIX ban path are unchanged. Firebase password hashes/salts are NEVER migrated (temporary passwords in memory only).

### Local fixture test (`node scripts/migration/provision_supabase_auth.js --fixture-test`)

**25/25 PASSED**, zero network, zero remote writes: approved 25 (22+3); new normal → created + recovery delivered; A4EI9QVE-analog (`trainer@gym.com`) → created + `RECOVERY_DELIVERY_FAILED` (`invalid-email`), **no rollback, run continues**; second gym.com user likewise classified; creation-time invalid email → `MANUAL_REVIEW`, user NOT created, run continues; rejected → created-banned / banned-in-place (existing unbanned, no duplicate); existing-correct → skip; foreign squatter → conflict; ban verification via `banned_until`; recovery never attempted for rejected users.

### Safe resume (next real execution)

`node scripts/migration/provision_supabase_auth.js --yes --canonical-uid A0kiygGnU8dSev0jZs4iJrrn3Fm1` is **idempotent**:
1. skips existing-correct users (`6oPiPBcZ…`, `A4EI9QVE…`, `A0kiygGn…`),
2. creates the remaining 22 (21 normal + `ArlmC1TZ…`/`JeFv6yMB…` create-banned, both banned + verified),
3. attempts recovery for each new normal user; `trainer@gym.com`/`member@gym.com`-style rejections become `RECOVERY_DELIVERY_FAILED` (manual credential setup) instead of stopping the run,
4. verifies every ban via `banned_until`; writes the manifest with `recoverySummary`.
Nothing is deleted; no user is created twice; unrelated metadata is never overwritten. Use `--resend-recovery` to re-attempt recovery links for existing normal users.

---

## 1. Prerequisites

- Node.js ≥ 18 (fetch, Web Crypto) — verified on Node v24.
- Firebase source access: Firebase CLI refresh token at `%USERPROFILE%\.config\configstore\firebase-tools.json` (read-only source; same as Step 5B/6A).
- Supabase target:
  - Project `osfhojfqytmqsqcmzvlf` (IRONPULSE) — schema live (0001/0002 applied).
  - **A server-side service_role key** (currently NOT available in this environment — Blocker 1; obtain out-of-band from the project owner).
  - Recovery emails deliverable (GoTrue email provider configured in the Supabase project; required only for the 22 normal users).
- Approved decisions on file:
  - `docs/FIREBASE_IMPORT_DECISIONS.md` (7 decisions, approved 2026-08-14).
  - `docs/SUPABASE_AUTH_DUPLICATE_EMAIL_DECISIONS.md` (G1/G2/G3, approved 2026-08-14).
  - `docs/SUPABASE_AUTH_PROVISIONING_PLAN.md` (final plan: 25 users).

## 2. Required Environment Variables

| Variable | Required | Value |
|---|---|---|
| `SUPABASE_URL` | yes | `https://osfhojfqytmqsqcmzvlf.supabase.co` |
| `SUPABASE_SECRET_KEY` | yes | service_role key (server-side only). The script **refuses publishable keys** (`sb_publishable_…`) and refuses to run without both vars. |
| `SUPABASE_EXPECTED_REF` | optional | `osfhojfqytmqsqcmzvlf` — extra safety: abort if the URL doesn't contain it |
| `SEND_RECOVERY` | optional | `false` to skip recovery emails (default: send) |
| `FIREBASE_ACCESS_TOKEN` / `FIREBASE_TOKEN` | optional | alternative Firebase tokens (default: CLI configstore refresh token) |

- Credentials are read from the environment **only**. They are never written to source files, manifests, logs, or docs. The manifest stores the target URL but never any key.
- Never set `FIREBASE_EMULATOR` (script refuses to run).

## 3. Execution Command

```powershell
# 1) Dry-run first (read-only remote checks; creates ZERO users; writes the manifest)
$env:SUPABASE_URL = "https://osfhojfqytmqsqcmzvlf.supabase.co"
$env:SUPABASE_SECRET_KEY = "<service_role key>"
node scripts/migration/provision_supabase_auth.js --dry-run --canonical-uid <G1-canonical-uid>

# 2) Real execution (only after dry-run is clean and --yes is given)
node scripts/migration/provision_supabase_auth.js --yes --canonical-uid <G1-canonical-uid>

# 3) Re-attempt recovery links for existing-correct normal users (optional, execution only)
node scripts/migration/provision_supabase_auth.js --yes --canonical-uid <G1-canonical-uid> --resend-recovery
```

- `--canonical-uid <uid>` = the approved G1 canonical account (one of the 4 G1 rejected users; **never inferred from names** — explicit developer selection per decision G1).
- `--project ironpulse-32f31` (default) — source Firebase project.

## 4. What the Script Does

1. **Pre-flight (read-only):** GoTrue health; credential check (lists existing users); full existing-user enumeration; per-email conflict detection.
2. **Drift guards:** duplicate-email groups must match the approved shapes (5:4 pending+1 rejected / 4: all rejected / 2: 1 pending+1 rejected); approved set must be exactly **25 (22 normal + 3 rejected)**; invalid/missing emails abort.
3. **Conflict rule:** an existing Supabase user for an approved email is accepted ONLY if its `user_metadata.firebase_uid` matches the source UID (→ `skip`, idempotent; rejected-but-unbanned → `ban`, applied in place). Any other existing user → **STOP before creating anything** (never overwrite, never delete).
4. **Creation (execution only):** per approved user — random 16-char temp password generated **in memory only** (never stored/logged); `POST /auth/v1/admin/users` with `email_confirm: true` and `user_metadata: { firebase_uid, role, gym_id, migration_run }`; `auth.users.id` is the Supabase-generated UUID (**Firebase UID never used as id**).
5. **Banned users (3 rejected):** banned via the **supported Admin SDK method** `supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })` (6C-FIX — replaces the raw `PUT /auth/v1/admin/users/{id}/ban` which returned HTTP 404); every ban is **verified** via `getUserById` → `banned_until` in the future; **no recovery link is sent** to them. Existing unbanned rejected users are banned in place (status `ban`).
6. **Normal users (22):** recovery link sent via `POST /auth/v1/recover` (unless `SEND_RECOVERY=false`). No credentials in logs. **Recovery delivery is non-fatal (6C-FIX2):** a provider rejection at send time (GoTrue `email_address_invalid` — e.g. example/test domains) classifies the user as `RECOVERY_DELIVERY_FAILED` (created user KEPT; manual credential setup required) and the run continues. Creation-time rejections classify `MANUAL_REVIEW` (no user created, source email preserved, no fabricated address). `--resend-recovery` re-attempts delivery for existing-correct normal users.
7. **Manifest (non-sensitive):** `migration-output/summaries/auth-provisioning-manifest.json` — run ID, masked source UID, target Supabase UUID, masked email, role, gym_id, status (created/created-banned/banned/skipped/manual-review/error/conflict), per-user `recovery` (delivered/delivery-failed/skipped), `recoverySummary` (delivered, deliveryFailed, manualReview — masked), G1 owner redirect map, excluded list (10 legacy-only). Emails in error text are masked everywhere (console + manifest).
8. **Fail-fast ONLY on hard create/ban/verify errors:** mark error, stop; re-run is idempotent (existing-correct users are skipped; existing unbanned rejected users are banned in place). Recovery-delivery failures and manual-review classifications NEVER stop the run and never roll back created users.

## 5. Expected Counts

| Item | Count |
|---|---|
| Approved users provisioned | **25** |
| — normal (`create`) | **22** (super_admin 1, gym_owner 8, gym_owner_pending 1, member 9, trainer 3) |
| — rejected (`create-banned`) | **3** (2 unique-email rejected + 1 G1 canonical) |
| Legacy-only, NO auth (excluded) | **10** (3 G1 non-canonical + 5 G2 + 2 G3) — Firebase docs untouched, manifests preserved |
| G1 owner redirect map (import-time) | 3 gym docs → canonical owner |
| Auth users deleted | **0** (never) |
| Auth users overwritten | **0** (never) |
| Profiles inserted by this step | **0** (profile import is a separate, later step; mapping lives in user_metadata + manifest) |

## 6. Rollback Procedure

- **Banned users (rejected):** unban via Supabase Dashboard (Auth → Users → Unban) or Admin SDK `updateUserById(id, { ban_duration: null })` — developer-authorized only.
- **Created normal users:** delete via Supabase Dashboard or Admin API `DELETE /auth/v1/admin/users/{id}` — developer-authorized only; the script itself never deletes.
- **Incomplete run (fail-fast):** re-run the same command — it skips existing-correct users (idempotent), bans existing unbanned rejected users in place, and continues.
- **Wrong canonical selection:** run stops if `--canonical-uid` is not a G1 user; no users created in that case. If detected after creation, developer-authorized cleanup of the affected accounts only.
- **Firebase rollback:** none needed — Firebase is never written by this step. Supabase schema: untouched (no DDL).

## 7. Safety Rules

1. Never run without `--dry-run` having passed cleanly.
2. `--yes` is mandatory for real creation; absence aborts.
3. No temp passwords, tokens, or keys in source, logs, artifacts, or docs — enforced by design (in-memory only).
4. No deletes, no blind overwrites, no forced UID into `auth.users.id`.
5. No recovery links to banned/rejected users; recovery delivery failures are classified, never fatal (6C-FIX2).
6. Publishable/frontend keys are rejected for admin operations.
7. Any drift in source data (group shapes, counts, emails) aborts before any write.
8. Execution requires explicit developer authorization (this step is build-only).
9. Emails in errors/console/manifests are always masked; temp passwords never leave memory.

## 8. Post-Execution

- Verify manifest statuses (25 created/created-banned/banned/skipped, 0 conflict, 0 error) AND `recoverySummary` (delivered vs deliveryFailed vs manualReview — delivery failures need manual credential setup per gym owner).
- Feed `auth-provisioning-manifest.json` mapping into the **profile import stage** (profiles.firebase_uid = source UID, profiles.id = target Supabase UUID).
- Update `docs/SUPABASE_AUTH_PROVISIONING_PLAN.md` status; proceed to data import only after approval.

**Current state (2026-08-14): PARTIAL execution — run 1 (`AP-20260814092524`): 1 normal user created, G1 canonical `A0kiygGn…` created but ban 404 (root cause fixed in 6C-FIX). Run 2 (`AP-20260814093703`): `6oPiPBcZ…` skipped (existing-correct), `A0kiygGn…` banned in place + verified, `A4EI9QVE…` **created** (`78f1d8d8…`) but recovery delivery failed (`/auth/v1/recover` → `email_address_invalid` for `t***@gym.com` — root cause + Option A policy fixed in 6C-FIX2: kept created, manual credential setup; `member@gym.com` `fvPn9yyf…` expected to hit the same policy), 22 not attempted. Remote Auth users: 3 (2 normal + 1 banned). Next real run resumes idempotently (skips existing-correct, bans remaining create-banned, creates the remaining 22, classifies any recovery rejections as `RECOVERY_DELIVERY_FAILED`). Blockers unchanged: service_role key + explicit execution authorization (this step is build-only — 6C-FIX2 validated via the local fixture test only, 25/25 PASSED, ZERO remote writes).**
