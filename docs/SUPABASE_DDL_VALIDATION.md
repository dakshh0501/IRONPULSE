# SUPABASE DDL VALIDATION — Step 3 Report

**Date**: 2026-08-14
**Scope**: `supabase/migrations/0001_initial_schema.sql` + `supabase/migrations/0002_rls.sql`
**Authority**: `docs/SUPABASE_DDL_SPEC.md` (DDL spec) + `docs/SUPABASE_MIGRATION_SCHEMA.md` §15 (identity/tenancy model)
**SQL executed remotely (Supabase)**: **NO**

---

## 1. Validation Methods Used

| # | Method | Tool | Result |
|---|--------|------|--------|
| 1 | Real PostgreSQL grammar parse | `pgsql-parser` 18.2.6 (libpg_query WASM) | 0001 OK, 0002 OK |
| 2 | Structural cross-check (FK targets, ref columns, index columns, enum values, table parity, RLS coverage, gym_id on all gym-scoped tables) | custom Node validator | 0 issues |
| 3 | **Full migration execution against a live local PostgreSQL 16** (Docker container `postgres:16-alpine`, not Supabase) | psql `ON_ERROR_STOP=1` | 0001 applied clean, 0002 applied clean |
| 4 | Post-apply object audit (counts vs spec) | SQL against live DB | 35/35 tables, 19/19 enums, 145 policies, RLS on 35/35 |
| 5 | Functional RLS smoke test (simulated JWT identities via `request.jwt.claim.sub`) | psql | 10/10 assertions pass |
| 6 | `npm run build` | Vite | 0 errors, 0 warnings |

---

## 2. Object Counts (verified against live PostgreSQL 16)

| Object | Spec | Migration (static) | **Live DB (authoritative)** |
|--------|------|--------------------|------------------------------|
| Tables | 35 | 35 | **35** |
| Enums | 19 | 19 | **19** |
| Indexes | — | 56 `CREATE INDEX` statements | **102** (incl. PK/UNIQUE constraint indexes) |
| Foreign keys | — | 77 (regex-detected) | **79** |
| RLS policies | — | 145 | **145** |
| Triggers | — | 25 statements | **26** (settings guard = 2 objects: INSERT + UPDATE) |
| Helper/guard functions | 7+1 | 8 | **8** |
| Tables with RLS enabled | 35 | 35 | **35** |
| Tables with `gym_id` column | 24 gym-scoped | 24 | 24 |

> **Notes**: (a) FK count 77 → 79: the static validator only parses `CREATE TABLE` bodies, so it missed `fk_profiles_gym` (declared via `ALTER TABLE` after `gyms` exists, for circular-FK resolution) and `profiles_id_fkey` (schema-qualified `auth.users` target breaks the inline-FK pattern). Live execution is authoritative — all 79 FKs reference existing tables/columns (full list verified via `information_schema`). (b) Indexes 56 → 102: PKs, UNIQUE constraints and partial UNIQUE indexes create implicit indexes; 56 explicit `CREATE INDEX` + 46 constraint-backed.

---

## 3. Dependency-Order Validation

1. **Extensions**: none required — `gen_random_uuid()` is core in PG 13+ (verified: no `CREATE EXTENSION` needed).
2. **Enums (19)**: created before any table referencing them.
3. **Base tables first**: `profiles` → `gyms` → all gym-scoped tables in FK order.
4. **Circular FK resolution** (`profiles.gym_id ↔ gyms.owner_uid`): `profiles` created without the `gym_id` FK, `gyms` created, then `alter table profiles add constraint fk_profiles_gym ... on delete set null` (0001 line ~706). Verified working live (insert owner profile → insert gym → insert staff profiles).
5. **Helper functions** (`auth_firebase_uid`, `auth_gym_id`, `is_super_admin`, `is_staff`, `set_updated_at`, `guard_profiles_update`, `guard_ai_conversation_update`, `guard_settings_gym`) created after all tables.
6. **Triggers** after all functions; **RLS (0002)** after 0001.
7. Live apply order `0001 → 0002` with `ON_ERROR_STOP=1`: **no failures**.

---

## 4. Design Deviations Found & Fixed During Validation

Live execution caught 3 real defects that static parsing could not:

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | `settings` CHECK used a subquery (`exists (select 1 from gyms …)`) — **PostgreSQL forbids subqueries in CHECK constraints** | **High** (migration would fail at apply) | Replaced with `guard_settings_gym()` trigger (BEFORE INSERT OR UPDATE) enforcing the identical rule: `gym_id = 'platform'` OR gym exists. Trigger smoke-tested live (S1: invalid gym blocked) |
| 2 | `user_role` enum had 7 values but `is_staff()` referenced `'gym_owner'` and `'admin'` (spec §7 keeps them for the dual-read window) → `invalid input value for enum user_role` at function creation | **High** (migration would fail at apply) | Added `'gym_owner','admin'` to the enum → **9 values**. Matches the spec's note: legacy values cannot exist post-normalization but are kept for rule parity during the dual-read window |
| 3 | `grant all on all tables … to anon, authenticated` missing for portability (Supabase default privileges normally provide this) | Medium | Explicit grants added for `anon`, `authenticated`, `service_role` (tables + sequences) |

Additionally, the UTF-8 BOM produced by PowerShell `Set-Content -Encoding UTF8` on 0002 was stripped (parser rejected it).

---

## 5. RLS Functional Smoke Test (live PostgreSQL)

Seeded: 1 gym, super admin + gym_admin + member profiles, 1 member, 1 payment, 1 platform settings row. Assertions executed under simulated JWTs:

| # | Assertion | Expected | Result |
|---|-----------|----------|--------|
| A1 | gym_admin reads own gym members | 1 row | ✅ |
| A2 | gym_admin cannot read `settings` where gym_id='platform' | 0 rows | ✅ |
| A3 | gym_admin reads own gym payments | 1 row | ✅ |
| A4 | gym_admin reads own gym | 1 row | ✅ |
| M1 | member reads own member row | 1 row | ✅ |
| M2 | member reads own payments | 1 row | ✅ |
| M3 | member cannot read any settings | 0 rows | ✅ |
| M4 | member cannot read other gyms | 0 rows | ✅ |
| S1 | settings insert with non-existent gym blocked by trigger | exception | ✅ |
| S2 | settings insert with 'platform' sentinel allowed | OK | ✅ |

Identity resolution (`auth_firebase_uid()`, `auth_gym_id()`, role subqueries) verified against the real `profiles` bridge — member sees data keyed by `auth_uid`/`user_id`/`owner_uid` columns; staff see gym-scoped rows only.

---

## 6. Compatibility Validation

- **PostgreSQL version**: applied on PG 16; targets Supabase PG 15+ (no 16-only syntax used; `gen_random_uuid` core since 13).
- **Supabase-managed objects assumed (not part of the migrations)**: `auth.users` table, `auth.uid()` function, `anon`/`authenticated`/`service_role` roles — verified via local shims; documented here so the apply checklist includes "run on a Supabase project (roles/auth already exist)".
- **RLS helper security**: all 4 helpers are `security definer` with `set search_path = public` (no search-path hijack); guard triggers raise exceptions on violation (no silent pass).
- **`is_staff` role list** includes `gym_owner`/`admin` — now consistent with the 9-value enum.
- **Deterministic keys preserved**: `referral_codes.code` PK, `referrals.referred_uid` PK (idempotent re-run), `payments.payment_id`/`invoice_no` UNIQUE, `payment_attempts.payment_id` UNIQUE, `subscriptions.license_key` partial UNIQUE, `settings (gym_id, doc_id)` PK, `members.legacy_id`/`trainers.legacy_id` UNIQUE.
- **Build**: `npm run build` 0 errors, 0 warnings (only migration files + this doc changed; no source files touched).

---

## 7. Unresolved Issues / Limitations

1. **Nothing blocking** — both migrations apply cleanly and the security model behaves per spec.
2. `settings` gym-existence is trigger-enforced instead of CHECK-enforced (PostgreSQL limitation) — semantically identical; documented in 0001 comments.
3. Live validation used a local container, not the real Supabase project — the real project has `auth.users`/roles already present, so apply order there is `0001` then `0002` as-is.
4. **Not yet done (out of scope for this step)**: no SQL executed remotely, no data import, no Supabase project provisioning, no app-code changes. `src/lib/supabase.js` remains an unimported scaffold.

---

## 8. Files Created/Modified (this step)

| File | Action | Size |
|------|--------|------|
| `supabase/migrations/0001_initial_schema.sql` | **Created** (2 fixes during validation: settings CHECK→trigger; user_role +2 values) | 857 lines, 39,875 B |
| `supabase/migrations/0002_rls.sql` | **Created** (grants extended during validation) | 642 lines, 38,461 B |
| `docs/SUPABASE_DDL_VALIDATION.md` | **Created** (this report) | — |

**No other files changed.** Validation artifacts (parser, validator, shims, smoke SQL) live in `C:\Users\daksh\AppData\Local\Temp\opencode\s3-validate\` and are not part of the repo.