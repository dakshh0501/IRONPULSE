# SUPABASE AUTH — DUPLICATE EMAIL GROUP DECISIONS (STEP 6B)

**Status: ALL GROUPS APPROVED (2026-08-14) — NOT EXECUTED. Nothing provisioned, written, or modified.**
Evidence: `migration-output/summaries/duplicate-email-analysis.json` (READ-ONLY analysis of Firebase `users` + `members` + `trainers` + `gyms`).

| | |
|---|---|
| Date | 2026-08-14 |
| Scope | 11 of 35 approved users blocked by 3 duplicate-email groups |
| Guarantees | Zero Auth users created. Firebase untouched. Supabase untouched. No emails/names/phones/passwords/tokens printed anywhere. No email fabricated. |

---

## 1. The 3 Groups

### GROUP G1 — email `g***@gmail.com` (4 users, all `rejected`)

| Firebase UID (masked) | role | gym_id (users.gymId) | owner-matched gym | account status | created |
|---|---|---|---|---|---|
| TitV32lD | rejected | `default` (MISSING) | 1 (rejected) | inactive, rejected | 2026-07-25 |
| A0kiygGn | rejected | `default` (MISSING) | 1 (rejected) | inactive, rejected | 2026-07-25 |
| JGQdw7v1 | rejected | `default` (MISSING) | 1 (rejected) | inactive, rejected | 2026-07-25 |
| nx0Qunp4 | rejected | `default` (MISSING) | 1 (rejected) | inactive, rejected | 2026-07-25 |

Members: 0 each. Trainers: 0 each. All have full signup fields (`referralCode`, `referredBy`, `uid`, `name`, `createdAt`).

### GROUP G2 — email `h***@gmail.com` (5 users)

| Firebase UID (masked) | role | gym_id | owner-matched gym | account status | created |
|---|---|---|---|---|---|
| 37WD336c | gym_owner_pending | `default` (MISSING) | 0 | pending, inactive | 2026-06-27 |
| hnfpV7jJ | gym_owner_pending | `default` (MISSING) | 0 | pending, inactive | 2026-06-27 |
| kh9tSKzD | gym_owner_pending | `default` (MISSING) | 0 | pending, inactive | 2026-06-27 |
| mNBFFQUH | gym_owner_pending | `default` (MISSING) | 0 | pending, inactive | 2026-06-27 |
| Y0BzZnBP | rejected | `default` (MISSING) | 0 | inactive, rejected | 2026-06-27 |

Members: 0 each. Trainers: 0 each. Minimal fields (`email`, `role`, `gymId`, `name`, `createdAt`, `uid`); no `referralCode`/`referredBy`.

### GROUP G3 — email `h***@gmail.com` (2 users)

| Firebase UID (masked) | role | gym_id | owner-matched gym | account status | created |
|---|---|---|---|---|---|
| ZofzD9RL | gym_owner_pending | `default` (MISSING) | 0 | pending, inactive | 2026-06-27 |
| joShucWx | rejected | `default` (MISSING) | 0 | inactive, rejected | 2026-06-27 |

Members: 0 each. Trainers: 0 each. Minimal fields; no `referralCode`/`referredBy`.

## 2. Evidence

- **G1**: four accounts share one email, all created on the **same day (2026-07-25)** via the full gym-owner signup flow (referral fields present) — i.e., a single signup/rejection test batch (or repeated attempts with one email). Each owns exactly one **rejected** gym; zero member/trainer records; all terminated (`rejected` — can never access the app). Firebase Auth's unique-email invariant means **at most one** of the four can have a live Auth account for that email; the rest are Auth-less or failure-leftover docs.
- **G2**: five accounts share one email, all created the **same day (2026-06-27)** with **minimal fields and no gym, no member, no trainer** — a seeded test batch (approval-flow testing): 4 pending + 1 rejected under one email is impossible via the real signup flow (Auth blocks duplicate emails) and confirms console/seeded creation.
- **G3**: same 2026-06-27 batch shape: 1 pending + 1 rejected, no artifacts.

## 3. Classification (STEP 2)

- **G1 — A (clearly duplicate/test accounts)**: four identical rejected records from one batch; no real identities can be distinguished; no relationships.
- **G2 — A (clearly duplicate/test accounts)**: five identical minimal docs from one batch; no real identities; no relationships.
- **G3 — A (clearly duplicate/test accounts)**: same batch; no identities; no relationships.

No group is B (legitimate distinct users sharing an email) or C (ambiguous).

## 4. Recommended Policy per Group (STEP 3)

### G1 → **Option A (canonical + redirect)** — *recommended*
- Provision **ONE** canonical Supabase Auth user for the email (rejected → `create-banned`, `account_disabled=true` per D1.1).
- At import time, redirect the **3 non-canonical owner relationships** (rejected gyms `1Gz4zHCN…`, `LLrl5gO1…`, `Y3KJLfW…`, `zG3GB9…`) to the canonical UID via an explicit **legacyUid → canonicalUid map** recorded in the import manifest (preserves the 5B-approved import of the 6 rejected gyms: `gyms.owner_uid → profiles(firebase_uid)` stays FK-valid).
- Non-canonical Firebase docs stay **untouched** (legacy-only; not provisioned, not imported, not deleted).
- **Canonical selection rule (no fabrication)**: at execution, a read-only lookup for a live Firebase Auth account with that email → if exactly one exists, it is canonical; otherwise the developer names the canonical UID in the execution request. Never inferred from names.

### G2 → **Option D (legacy-only / manual-review)** — *recommended*
- **No Auth user provisioned** for this email. All 5 docs remain legacy-only records; their **profiles are excluded from the Supabase import** (documented exception to decisions D2/D1.1 for these 5 specific docs). Nothing is deleted or modified.
- If the developer later identifies a real owner, the group can be re-opened (D is fully reversible at plan level).

### G3 → **Option D (legacy-only / manual-review)** — *recommended*
- Same as G2 (no Auth user; profiles excluded from import; docs untouched).

### Alternatives considered
- **Option B** (provision one auth, leave others unprovisioned): for G1 this still leaves 3 gyms unimportable (FK) — strictly worse than A. For G2/G3 it creates dead accounts for seeded test emails with no value.
- **Option C** (alternate emails): **rejected** — task forbids fabricating replacement emails.
- **Option D for G1**: rejected — would break the already-approved import of the 4 rejected gyms.

## 5. Impact Analysis (STEP 4)

| Group | Profiles | Member/Trainer relations | Firebase UID losing direct Auth mapping | Login behavior | Manual intervention |
|---|---|---|---|---|---|
| G1 | 4 → 1 imported (canonical, banned); 3 legacy-only | none exist (0/0) | 3 UIDs lose direct mapping (they are legacy test docs with no live Auth identity — no user is affected) | none (all rejected; no login possible before or after) | canonical UID selection at execution (rule above) |
| G2 | 5 excluded from import | none exist | 5 UIDs unmapped (seeded test docs) | none (pending/rejected) | none — unless developer confirms a real owner |
| G3 | 2 excluded from import | none exist | 2 UIDs unmapped (seeded test docs) | none (pending/rejected) | none — unless developer confirms a real owner |

Approved-data reconciliation after this policy: **25 profiles + 25 Auth users** (22 `create` + 3 `create-banned` incl. G1 canonical); **10 profiles excluded** (3 G1 non-canonical + 5 G2 + 2 G3) as legacy-only. All 13 gyms (7 safe + 6 rejected) remain importable.

## 6. Reversibility

- Every action here is **plan-level only** — nothing executed. Firebase and Supabase are untouched.
- The redirect map and exclusion lists are plain manifests in `migration-output/`; they can be amended or reverted before any execution.
- Post-import, the affected records are rejected/pending legacy rows with no live usage — no user-facing consequence.
- Canonical selection is recorded in the execution manifest for audit.

## 7. Developer Decision Required — APPROVED

**DEVELOPER APPROVAL RECORD — 2026-08-14:** All three duplicate-email decisions approved exactly as documented (developer sign-off). G1 canonical UID selected by explicit developer decision: `A0kiygGn…` (see below). No Auth users created; no Supabase writes; no Firebase modifications.

| # | Group | Decision | Approval |
|---|---|---|---|
| 1 | **G1** — Category A | **Option A**: one canonical Supabase Auth account (`create-banned`, per approved rejected-user policy — `account_disabled=true`); explicit owner redirect map for the 3 affected rejected gyms at import; canonical never inferred from names | **APPROVED 2026-08-14** |
| 2 | **G2** — Category A | **Option D**: legacy-only records; no Supabase Auth account; excluded from Auth/profile provisioning; migration/manifests preserved for historical reference | **APPROVED 2026-08-14** |
| 3 | **G3** — Category A | **Option D**: legacy-only records; no Supabase Auth account; excluded from Auth/profile provisioning; migration/manifests preserved for historical reference | **APPROVED 2026-08-14** |

**G1 CANONICAL SELECTION — APPROVED 2026-08-14 (explicit developer decision):**
`A0kiygGnU8dSev0jZs4iJrrn3Fm1` (masked: `A0kiygGn`) is the canonical G1 account for provisioning (`create-banned`). Execution flag: `--canonical-uid A0kiygGn`. This is an explicit developer selection, not an inferred identity decision. The other 3 G1 users (`TitV32lD…`, `JGQdw7v1…`, `nx0Qunp4…`) remain legacy-only, excluded from provisioning; their 3 rejected gyms redirect to the canonical owner at import time via the G1 owner redirect map.

Execution effects locked in by this approval (all plan-level, nothing executed):
- Auth users: **25** (22 `create` + 3 `create-banned` incl. G1 canonical).
- Profiles imported: **25**; profiles excluded (legacy-only, manifests preserved): **10** (3 G1 non-canonical + 5 G2 + 2 G3).
- Rejected gyms: all **6** importable via the G1 owner redirect map (3 redirected to canonical; 2 already unique-email owners `ArlmC1TZ…`, `JeFv6yMB…`; 1 canonical owner).

---

AUTH PROVISIONING STATUS:
BLOCKED — duplicate-email groups RESOLVED (approved 2026-08-14); blocked on remaining blockers only: (1) missing Supabase credential (service-role key / access token), (2) explicit execution authorization. ZERO Auth users created.
