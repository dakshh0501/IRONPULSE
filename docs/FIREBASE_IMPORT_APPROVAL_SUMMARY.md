# FIREBASE → SUPABASE IMPORT — APPROVAL SUMMARY (Step 5C)

> **APPROVAL RECORD — 2026-08-14**: all seven decisions **APPROVED** by the developer ("I approve all 7 migration decisions exactly as documented"). **Import NOT EXECUTED** — no Firebase/Supabase writes performed.

Concise approval matrix. Full analysis: [`FIREBASE_IMPORT_DECISIONS.md`](./FIREBASE_IMPORT_DECISIONS.md).
Current dry-run: **SAFE 152 · MANUAL 45 · QUARANTINE 61 · total 258**.
No data was written; no code, schema, or migrations were touched.

| # | Decision | Recommended choice | Reason | Affected | Blocks initial import? |
|---|---|---|---|---|---|
| 1 | **Rejected users** | Import with `account_disabled=true` | Preserves `firebase_uid → id` mapping; rows satisfy all NOT NULL constraints; fully reversible | 8 profiles | No |
| 2 | **Pending owners** | Import with role `gym_owner_pending`, `gym_id NULL` | No gym claims them (verified); audit preservation; no gym invented | 6 profiles | No |
| 3 | **Gymless members/trainers** | Import with `gym_id NULL` | Real accounts (some hold referral codes + chat history); linkage re-attached later | 12 profiles | No |
| 4 | **Orphan gyms** | PRESERVE + QUARANTINE — do not import | Owner FK unresolvable; no owner invented; `Vh305r5D` (approved) flagged for confirmation but safe default stands | 3 gyms | No (decision = exclusion) |
| 5 | **Sentinel/unknown plans** | EXCLUDE all 10 (preserve manifests) | No tenant (6); no consumer evidence + duration coincidence is not mapping proof (4); canonical catalog fully covered by 18 safe plans | 10 plans | No |
| 6 | **Settings tenancy** | Import `platform` (SAFE); EXCLUDE remaining 6 | `platform` is guard-exempt and consumed; the rest would fail `guard_settings_gym`; `pricing` has no consumer; no tenant named | 7 settings (1 in / 6 out) | No |
| 7 | **Orphan attendance** | PRESERVE + QUARANTINE all 49 (manifest) | No canonical parent derivable; no fabrication of `gymId`/`memberId`; no deletion | 49 rows | No (policy approval flips GATE E) |

**Also covered (special cases):**
- **A. `bRKcg3fw` → deleted gym `RAlIvHAT`**: relationship not preservable (gym doc absent, no gym claims the ownerUid); profile imports with `gym_id NULL`; no replacement gym invented. Clears GATE B (1 unresolved ref).
- **B. 9 problematic gyms**: 6 rejected-with-rejected-owner are FK-valid → importable; 3 orphans (2 rejected + 1 approved) must remain quarantined.
- **C. `Titan` / `Basic plan` / `kickstart` / `legacy`**: no semantic mapping (duration overlap with canonical plans is not evidence); preserved as explicit manual-review records.
- **D. 49 attendance rows**: no canonical parent; preserved, not deleted, not fabricated.

**Decision status:** all seven decisions **APPROVED (2026-08-14, developer sign-off)**. Reopen evidence requirements for every blocked item are in the plan's §6A (Pre-Import Approval Gates).

---

## IMPORT STATUS: APPROVED — NOT EXECUTED

All seven decisions are approved; **no data has been imported**. Execution (the `--apply` run) is a separate step that must be explicitly requested. Until then: no Firebase writes, no Supabase writes, no Auth users created.