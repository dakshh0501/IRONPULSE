# SUPABASE AUTH — FINAL RECONCILIATION (STEP 6C-FINAL)

**Date:** 2026-08-14
**Mode:** READ-ONLY. Zero remote writes, zero recovery emails, zero Firebase changes.
**Artifacts (authoritative evidence):**
- `migration-output/summaries/auth-provisioning-manifest.json` — execution run `AP-20260814093703` (last live remote enumeration; per-user target UUIDs recorded at write time)
- `migration-output/summaries/auth-provisioning-plan.json` — approved plan (Step 6A, 35 classified → 25 approved)
- `docs/SUPABASE_AUTH_DUPLICATE_EMAIL_DECISIONS.md` — G1/G2/G3 (approved 2026-08-14)
- `docs/SUPABASE_AUTH_PROVISIONING_EXECUTION.md` / `docs/SUPABASE_AUTH_PROVISIONING_PLAN.md` — 6C-FIX (ban) + 6C-FIX2 (recovery policy)

---

## 1. Method & Dry-Run Attempt

The provisioner's `--dry-run` performs a **live read-only remote check** (GoTrue health + full existing-user enumeration + per-email conflict detection) and therefore requires `SUPABASE_URL` + `SUPABASE_SECRET_KEY` at runtime:

```
node scripts/migration/provision_supabase_auth.js --dry-run --canonical-uid A0kiygGnU8dSev0jZs4iJrrn3Fm1
→ MISSING CREDENTIAL: SUPABASE_URL and SUPABASE_SECRET_KEY env vars are required. Aborting. (exit 4)
```

**No service_role key exists in this environment** (checked env + `.env`, presence only) — both earlier execution runs (`AP-20260814092524`, `AP-20260814093703`) were performed out-of-band with a developer-supplied key. The remote dry-run therefore **could not be re-run here**; the reconciliation below is derived from the **last live enumeration (run 2 manifest)** — the only record of remote truth — cross-checked against the approved plan. This task performed **zero remote calls** (the refusal happens before any network activity). Local fixture test (6C-FIX2, 25/25 PASSED) confirms the provisioner's behavior for every status class used below.

## 2. Current Remote Auth State (known)

| # | User (masked UID) | Role | Email (masked) | Target UUID (recorded in manifest) | State |
|---|---|---|---|---|---|
| 1 | `6oPiPBcZ` | member | `n***@gmail.com` | `248ef170-81ba-4728-831f-e1eba0eabd65` | existing, correct |
| 2 | `A0kiygGnU8dSev0jZs4iJrrn3Fm1` | rejected (G1 canonical) | `g***@gmail.com` | `a7bb02b7-7b4b-40b5-9315-b5ae51ae6c1d` | existing, **banned** (6C-FIX, verified via `banned_until`) |
| 3 | `A4EI9QVEcYgZNIdTLK1gJPKoEzB3` | trainer | `t***@gym.com` | `78f1d8d8-89a8-47d4-b8bb-9fcf0f798db1` | existing, **created**; recovery delivery failed (`email_address_invalid`, 6C-FIX2 policy: `RECOVERY_DELIVERY_FAILED`, manual credential setup) |

**Current remote count (known, UUID-recorded): 3.** Exact full enumeration requires the service_role key (absent); per the last pre-flight there are no foreign accounts on any approved email (`conflictsFound: 0`).

## 3. Reconciliation Totals

| Item | Count | Detail |
|---|---|---|
| **Approved total** | **25** | 22 normal + 3 rejected (2 unique-email + 1 G1 canonical) |
| **Current remote (existing)** | **3** | §2 — all three are existing-correct → `skip` at next run |
| — existing normal (skip) | 2 | `6oPiPBcZ` (member), `A4EI9QVE` (trainer) |
| — existing rejected, banned (skip) | 1 | `A0kiygGn` (G1 canonical) — remains banned |
| **Remaining to create** | **22** | 20 normal + 2 rejected (`create-banned`) |
| — normal creates | 20 | super_admin 1, gym_owner 7, gym_owner_pending 1, member 7, trainer 2 (of the 22 approved normal, `6oPiPBcZ` and `A4EI9QVE` already exist) |
| — rejected creates (banned at creation) | 2 | `ArlmC1TZ` (`s***@example.com`), `JeFv6yMB` (`t***@gmail.com`) — banned via `ban_duration: '876000h'`, verified via `banned_until`; **no recovery link** |
| **Remaining ban count** | **2** | the two create-banned above (A0kiygGn already banned — no further action) |
| **Recovery-delivery-failed** | **1 known + 1 expected** | known: `A4EI9QVE` (`t***@gym.com`, existing); expected at next run: `fvPn9yyf` (`m***@gym.com`) — GoTrue send-time rejection per 6C-FIX2 (user created, manual credential setup, run continues). Possible (non-allowlisted domains, classified per-user, non-fatal): `hxTWhdxQ` (`p***@example.com`), `bRKcg3fw` (`f***@mrworlds.com`), `clwHQsB3` (`d***@doefy.com`) |
| **Existing / reconciled (skip)** | **3** | all three current remote users |
| **Legacy-only (excluded)** | **10** | 3 G1 non-canonical + 5 G2 + 2 G3 — no auth, Firebase docs untouched |
| **Conflicts** | **0** | `conflictsFound: 0` in run 2; re-checked at every pre-flight |
| **Expected final Auth users** | **25** | 3 existing + 22 created = 25 ✔ |

## 4. Required Verifications

| Requirement | Status | Evidence |
|---|---|---|
| No user duplicated | ✔ | The 3 existing users carry matching `firebase_uid` metadata → `skip` (idempotent). The 22 remaining were confirmed absent at run 2 pre-flight → `create`. Fixture asserts `A0kiygGn` is never re-created (`create attempts=21` in fixture with 1 pre-existing rejected) and foreign-email squatters → `conflict` (STOP). |
| `A0kiygGn` remains banned | ✔ | Manifest status `banned` (run 2); ban applied in place via `updateUserById(id, { ban_duration: '876000h' })` and verified via `banned_until` (6C-FIX). Next run: `skip` — no create, no unban. |
| `A4EI9QVE` recognized existing, not recreated | ✔ | Target UUID `78f1d8d8-89a8-47d4-b8bb-9fcf0f798db1` recorded → creation succeeded. Its run-2 `error` status was the recovery-DELIVERY failure (old code); 6C-FIX2 makes delivery non-fatal → next run classifies it existing-correct (`skip`), recovery documented under `recoverySummary.deliveryFailed`. |
| G1 canonical redirect correct | ✔ | Manifest `g1OwnerRedirectMap` = 3 entries: `Y3KJLfWvAM5YOOw5NIwj`, `1Gz4zHCN3vNqqyj2Kuva`, `zG3GB9viQp2DDYqM93HJ` → `A0kiygGnU8dSev0jZs4iJrrn3Fm1`. Canonical flag required at execution (`--canonical-uid`), never inferred from names. |
| 10 legacy-only excluded | ✔ | Manifest `excluded` count = 10 (3 G1 non-canonical + 5 G2 + 2 G3); excluded from plan, no auth created, source docs untouched. |
| `@gym.com` accounts use RECOVERY_DELIVERY_FAILED policy | ✔ | `A4EI9QVE` (existing): documented delivery-failed, manual credential setup (no fabricated email). `fvPn9yyf` (`m***@gym.com`): still `create`; next run creates the user, the `/recover` attempt will be rejected by GoTrue send-time validation → classified `RECOVERY_DELIVERY_FAILED` — run continues, no rollback. Fixture covers both paths (25/25). |

## 5. Final Verdict

**RECONCILED.** Approved 25 = existing 3 (all correct: 2 normal + 1 banned) + to-create 22 (20 normal + 2 create-banned) = **25**. Zero conflicts, zero duplicates, zero overwrites, zero deletions, zero fabricated emails. `A0kiygGn` stays banned; `A4EI9QVE` is not recreated; G1 redirect map intact (3 gyms → canonical owner); 10 legacy-only remain excluded; recovery-delivery policy applies to the two `@gym.com` accounts (and per-user to any other provider-rejected domain).

**Blocker (unchanged):** the real run requires `SUPABASE_SECRET_KEY` (service_role) in the execution environment plus explicit execution authorization. Until then the remote dry-run cannot be re-executed from this environment.

**Next real run (expected behavior):**
```
node scripts/migration/provision_supabase_auth.js --yes --canonical-uid A0kiygGnU8dSev0jZs4iJrrn3Fm1
```
- creates **exactly 22** users (20 normal + `ArlmC1TZ`, `JeFv6yMB` created-banned),
- skips the 3 existing (including banned `A0kiygGn` and existing `A4EI9QVE`),
- verifies both bans via `banned_until`,
- classifies recovery rejections as `RECOVERY_DELIVERY_FAILED` (expected: `fvPn9yyf`; possible: `hxTWhdxQ`, `bRKcg3fw`, `clwHQsB3`),
- ends with **25 total Supabase Auth users** (`recoverySummary` in the manifest: delivered / deliveryFailed / manualReview).
