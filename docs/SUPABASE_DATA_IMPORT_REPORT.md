# SUPABASE DATA IMPORT REPORT — STEP 7B EXECUTION

**Status: COMPLETE — 169 rows imported, 10 owner backfills applied, post-import validation PASS.**

| | |
|---|---|
| Migration run ID | `IRONPULSE-MIG-2026-08-14-001` |
| Execution timestamp | 2026-08-14 (17:39–17:44 UTC) |
| Source project | `ironpulse-32f31` (Firebase) — **read-only, untouched** |
| Target project | `osfhojfqytmqsqcmzvlf` (Supabase, name: **IRONPULSE**, org `vfuttdkozemcncuycift`) |
| Approvals | All 7 decisions APPROVED (2026-08-14) — gates A–G all GREEN |
| Rows imported | **169** (25 profiles + 13 gyms + 18 plans + 1 settings + 6 subscriptions + 2 subscription_history + 9 notifications + 11 license_history + 1 referral_codes + 15 ai_conversations + 65 ai_conversation_messages + 3 contact_messages) |
| Rows excluded | 28 (10 legacy-only profiles + 6 sentinel plans + 6 tenantless settings + 1 quarantined-gym subscription + 5 legacy-user notifications) |
| Rows quarantined | 61 (preserved in `migration-output/quarantine/`) |
| Source reconciliation | 258 = 169 imported + 28 excluded + 61 quarantine ✅ |
| Firebase writes | **0** (read-only admin REST) |
| Supabase schema/RLS changes | **0** (writes via service_role PostgREST; RLS untouched, still enabled) |

---

## 1. Pre-Flight (Step 7B)

| Check | Result |
|---|---|
| Supabase project identity = IRONPULSE | ✅ PASS (`linked-project.json` ref `osfhojfqytmqsqcmzvlf`; cred URL matches) |
| Write-capable credential available (temp file, outside repo) | ✅ PASS — service_role key loaded per-run from `%TEMP%\opencode\supabase-cred.env`, never printed/committed |
| All 35 application tables exist and are empty | ✅ PASS (`scripts/migration/supabase_table_status.mjs` — 0 rows everywhere) |
| `auth.users` provisioning count | ✅ PASS — 25 users (matches approved profile set) |
| 61 quarantine records accounted | ✅ PASS (attendance 49, gyms 3, members 1, plans 4, notifications 4) |
| FK pre-flight on approved manifests | ✅ PASS (`scripts/migration/preflight_fk_check.mjs` — 0 unresolved refs; reconciliation 258) |
| Signed decisions present | ✅ PASS (`docs/FIREBASE_IMPORT_DECISIONS.md`, `FIREBASE_IMPORT_APPROVAL_SUMMARY.md`) |
| Real PII re-read from Firebase (read-only) at import time | ✅ PASS (emails/phones for profiles, gyms, contact_messages) |

### Pre-flight discoveries (documented FK corrections)

1. **`subscriptions` row `iyjeYRVxdluVFbV5Ksra`** (safe manifest) references gym `Vh305r5D0desNQtqxXiz` — a **QUARANTINED** orphan gym → excluded (FK violation otherwise). Imported subscriptions: 6.
2. **5 safe `notifications` rows** reference legacy-only users (JGQdw7v1, joShucWx, nx0Qunp4, Y0BzZnBP, TitV32lD — excluded from provisioning) → excluded. Imported notifications: 9.
3. **`license_history.performed_by`** values are role strings/`system` (11 rows) — not Firebase UIDs → written NULL (nullable FK, R-SENTINEL-NULL policy analog; audit action/device/gym/date preserved).
4. **3 manual gyms** (`1Gz4zHCN...`, `Y3KJLfWv...`, `zG3GB9vi...`) have legacy-only owners → `owner_uid` NULL (nullable FK; the 6 rejected gyms still imported as inactive per decision D2).
5. **`profiles.id`** = live `auth.users.id` from the validated id-map (25 mappings), NOT the manifest placeholder detUuid.
6. **Circular FK** `gyms.owner_uid → profiles` / `profiles.gym_id → gyms`: two-phase insert (gyms with owner_uid NULL → profiles → PATCH backfill of 10 approved owners).

## 2. Execution

Pipeline: `scripts/migration/import_to_supabase.mjs` (staged, transactional, idempotent, stops on FK/uniqueness violation; PostgREST service_role, RLS-bypassing but never disabled).

| Stage | Rows | Result |
|---|---|---|
| gyms | 13 | ✅ inserted |
| profiles | 25 | ✅ inserted (id = auth UUID, real email/phone) |
| gyms.owner_uid backfill | 10 | ✅ PATCHed |
| plans | 18 | ✅ inserted |
| settings (platform) | 1 | ✅ inserted (guard_settings_gym exempt) |
| subscriptions | 6 | ✅ inserted (1 excluded — quarantined gym) |
| subscription_history | 2 | ✅ inserted |
| notifications | 9 | ✅ inserted (5 excluded — legacy-only users) |
| license_history | 11 | ✅ inserted (performed_by → NULL) |
| referral_codes | 1 | ✅ inserted |
| ai_conversations | 15 | ✅ inserted |
| ai_conversation_messages | 65 | ✅ inserted |
| contact_messages | 3 | ✅ inserted |

Retry semantics verified: re-run after partial failure is idempotent (PK existence skip; PATCH stages re-apply). Final re-run confirmed 0 duplicates.

## 3. Post-Import Validation (`scripts/migration/post_import_verify.mjs`)

| Check | Result |
|---|---|
| Row counts (12 populated tables) | ✅ all match expected (169 total) |
| Empty tables (23) | ✅ all 0 (members, trainers, attendance, payments, payment_attempts, progress, diet/workout plans, whatsapp, devices, referrals, support, audit, reports…) |
| FK integrity (11 spot checks) | ✅ 0 orphans (gyms.owner_uid, profiles.gym_id, plans/subscriptions/subscription_history.gym_id, sub_history.subscription_id, notifications.user_id, license_history.gym_id, referral_codes.referrer_uid, ai_conversations.user_id, ai_messages.conversation_id) |
| profiles ↔ auth.users | ✅ 25 = 25, 0 profiles without auth row |
| RLS enabled | ✅ anonymous read rejected (401) |
| Credential scan (migration-output + repo, value-matching deny list) | ✅ clean (documented `users_export.json` excluded material skipped) |
| Deterministic identifiers | ✅ no collisions (pre-validated; referral code `IP-H6POBD`, gym ids, firebase_uids unique) |

## 4. Quarantine Preservation (STEP 14)

61 quarantined records preserved in `migration-output/quarantine/` + `migration-output/summaries/attendance-quarantine-manifest.json`. No deletion; no sensitive values present (GATE A GREEN).

## 5. Final Verdict

**STEP 7B EXECUTION: COMPLETE.** 169 approved rows imported; 28 excluded per approved decisions + documented FK corrections; 61 quarantined preserved. Firebase untouched (0 writes). Supabase schema/RLS untouched. Credentials never exposed; temp credential file deleted after run. Remaining follow-ups (no blockers): provisioning of the 2 `create-banned` + 22 `create` auth users per `auth-provisioning-plan.json`, manual review of quarantine records, and post-import smoke tests of the app against Supabase when the app is switched over.
