# SUPABASE FIRESTORE-SERVICE MIGRATION REPORT

**Status: COMPLETE (Step 8C)** — implementation, DCE verification, and smoke suite all green.
**Build:** 0 errors, 0 warnings. **eslint:** 0 NEW findings. **Smoke:** 100/100 checks.

Companion docs: `FIRESTORE_SERVICE_MIGRATION.md` (design + inventory + §9 RLS differences),
`SUPABASE_AUTH_MIGRATION_REPORT.md` (Step 8B auth layer), `SUPABASE_SERVICE_MIGRATION_PLAN.md`.

---

## 1. What was done

`src/services/firestoreService.js` now runs on **Supabase/PostgreSQL** as the active data plane
via a dual-provider build-time switch. All **71 exported functions + `DEFAULT_GYM_ID`** keep their
exact signatures and app-facing data contracts. A 1-line branch at the top of each export
(`if (!IS_FIREBASE_MODE) return supabaseX(...)`) dispatches to the Supabase implementation;
all Supabase implementations live in a single `// SUPABASE DATA PLANE (Step 8C)` section
(the file is now 3,246 lines).

### Dual-provider fold pattern (DCE)

```
const IS_FIREBASE_MODE = (import.meta.env.VITE_AUTH_PROVIDER || 'supabase') === 'firebase'
```

- Single directly-foldable const; esbuild constant-folds it (`("supabase" || "supabase") === "firebase"`
  → `false`) and inlines at every use site. Verified by fold-test harnesses: `.toLowerCase()`
  chains and cross-statement comparisons do NOT fold; this pattern does.
- `.env` requires `VITE_AUTH_PROVIDER=supabase` (lowercase) — the production `.env` was
  **missing it** before, which kept the env reference runtime-dynamic and prevented elimination.
- Same pattern applied in `authService.js` (Step 8B file) so both services fold consistently.

### Lazy secondary auth (startup side-effect removal)

`const secondaryApp = initializeApp(firebaseConfig, 'secondary')` at module top-level was
side-effectful and survived tree-shaking. Replaced with a lazy `getSecondaryAuth()` factory that
only instantiates when a firebase-mode branch actually executes.

### What was NOT migrated (by design)

| Area | Status |
|------|--------|
| Realtime subscriptions (`subscribe*`) | `REALTIME_PENDING` — one-shot initial load emulating the Firestore initial snapshot, then `noopUnsub` + console.warn. Per-listener semantics in `FIRESTORE_SERVICE_MIGRATION.md` §6. |
| Storage (photos) | Only the `deleteMemberPhoto`/`deleteTrainerPhoto` cleanup hooks are wired (best-effort). |
| Cloud Functions (`deleteAuthUser`) | Firebase-mode only; not supported in supabase mode (documented). |
| Payment webhooks (PhonePe/Cashfree) | Backend (functions/) — out of scope. |

## 2. RLS-driven behavior differences (documented, tests assert them)

1. `subscriptions`, `subscription_history`, `plan_templates`, `payment_attempts` = super-admin-only writes.
2. `gyms` update/delete = super-admin only; insert = super OR owner-with-pending.
3. `notifications` = no delete policy; staff-or-owner insert.
4. `settings` = staff write; delete super-only; `billing`/`referralSettings` without gymId map to `gym_id 'platform'`.
5. `contact_messages` = anon insert allowed; read/update/delete super-only.
6. **Staff boundary**: `addMember`/`addTrainer` create rows with `auth_uid = null`, NO auth account,
   NO temp password (`addTrainer` returns `{ id, password: null }`). Firebase-mode created real
   Auth accounts; supabase mode cannot (staff-account creation requires the Auth layer).
7. **`is_staff()` includes trainer** — trainer member/trainer CRUD is RLS-permitted
   (unlike Firebase rules where trainers were read-only on members).
8. PostgREST visibility semantics: UPDATE/DELETE on rows the caller cannot SELECT are
   **silent no-ops** (USING policy filters rows first); visible rows failing the write policy
   throw 42501 → `permission-denied`. Tests assert both behaviors.
9. Field drops: member `trainerName`, payment `paidOn`, subscription
   `originalAmount/discountAmount/discountType/discountValue/finalAmount/autoRenew/daysRemaining/isLifetime/graceEndDate`.
10. Cascade superset on gym/member/trainer delete (DB FKs); `referralCodes` directory and
    `users/{uid}` side-docs don't exist in supabase mode (authService owns provisioning).

## 3. Bugs found & fixed during smoke

1. **`mapSupabaseError` ignored `err.code`** — PostgREST returns the SQLSTATE in `error.code`
   (e.g. `42501`), not in the message. The matcher only tested the message, so RLS denials and
   FK violations lost their mapped codes (`permission-denied`/`foreign-key-violation` were
   `undefined`). Fixed: match against `message + ' ' + code`. (This also affects `authService.js`
   Step 8B error mapping for database errors — same matcher file, same fix semantics.)
2. **`supabaseAddContactMessage` notification destructure bug** — `const { data: session } =
   await sb.auth.getSession()` then `session?.user?.id` is always undefined because supabase-js
   returns `{ data: { session } }`. Contact-message notifications were therefore never created
   in production. Fixed: `const { data } = ...; const actorUid = data?.session?.user?.id`.

## 4. Smoke suite (100/100)

Harness: `C:\Users\daksh\AppData\Local\Temp\opencode\s8c\`
- `entry.cjs` requires the REAL `src/services/firestoreService.js`; `build.cjs` bundles it with
  esbuild (`define VITE_AUTH_PROVIDER="supabase"`, alias plugin mapping all imports to shims,
  **external** so smoke and bundle share module instances).
- `shim-supabase.cjs` — rules-enforcing FakeSupabaseClient: 21-table store, RLS approximations
  (staff/super/own-row/own-gym tenancy), unique constraints, FK checks, cascade/set-null deletes,
  settings composite upsert, `bump_campaign_stat` RPC, `auth.getSession()`, deterministic
  `detUuid()` mirror for legacy-id resolution.
- Firebase shims (`firestore/auth/app/functions`) are counting stubs — **T33 asserts the entire
  suite made ZERO Firebase calls**.

Coverage (T01–T35):
- CRUD round-trips per entity: members, trainers, payments, progress logs, plans, diet/workout
  plans, gyms, subscriptions, settings (incl. platform billing isolation), whatsapp config/logs/
  campaigns (incl. RPC bump), support/feature tickets, contact messages (anon + authed),
  plan templates.
- Boundaries: staff-account (no password/authUid, `legacy_id = id`), password never persisted,
  referredBy uppercased, `paidOn` dropped, payment_id `PMT-` format, duration minutes↔string
  round-trip, versions snapshot on diet plan update, notification side-write (anon → 0, authed → 1).
- Isolation: member self-scoping (myPayments/myMember/myProgressLogs/myAssignedDietPlans),
  trainer scoping (subscribeToMyMembers), gym tenancy (gym-a vs gym-b members + settings billing),
  cross-tenant billing isolation.
- Permission matrix: member addMember/deleteMember denied; trainer deleteMember ALLOWED
  (is_staff); gym update own-gym denied / non-own silent no-op; subscription/plan-template
  gym_admin denied; contact update gym_admin silent no-op; unauthenticated read denied.
- Error mapping: duplicate gym id → `already-exists`; FK violation → `foreign-key-violation`;
  missing records → `not-found`-tolerant no-ops; missing settings/subscription → null.
- Migrations: `migrateDefaultPlans` (seed 6 + idempotent no-op), `backfillTrainerAuthUid`
  (patches from trainer auth_uid), `backfillOwnershipFields` (counts shape).
- Cascade: member delete cascades payments + progress logs; trainer delete set-nulls plan
  trainer_id; photo-cleanup hook invoked on member delete.

## 5. Static audit (Step 14) — remaining Firebase usage

All Firebase imports/symbols in `firestoreService.js` are confined to `IS_FIREBASE_MODE`
legacy branches:

| Import | Classification |
|--------|----------------|
| `firebase/firestore` (18 symbols) | LEGACY_ROLLBACK_ONLY — 267 references, all inside firebase-mode branches |
| `firebase/auth` (createUserWithEmailAndPassword, signOut, sendEmailVerification) | LEGACY_ROLLBACK_ONLY (addMember/addTrainer firebase paths) |
| `firebase/app` initializeApp + `getAuth` | LEGACY_ROLLBACK_ONLY (lazy `getSecondaryAuth()` — instantiated only when a firebase branch runs) |
| `../firebase` `firebaseConfig`, `db` (`auth` unused — pre-existing warning) | LEGACY_ROLLBACK_ONLY |
| `firebase/functions` getFunctions/httpsCallable | LEGACY_ROLLBACK_ONLY (deleteMember/deleteTrainer `deleteAuthUser` calls, lines 529/835 — not supported in supabase mode) |
| `../utils/referralCode` generateUniqueReferralCode | LEGACY_ROLLBACK_ONLY (firebase-mode `addMember` autogen; supabase mode writes no referral codes) |

Evidence: (a) smoke T33 zero-call counters across the whole suite; (b) supabase-mode bundle
contains zero firebase firestore/auth code from this file (verified in dist during Step 8C
implementation).

## 6. Verification summary

| Check | Result |
|-------|--------|
| `node --check src/services/firestoreService.js` | SYNTAX OK |
| `npm run build` | 0 errors, 0 warnings (15.57s; dist entry `index-C9sEWa9U.js`) |
| eslint `src/services/firestoreService.js` | 7 findings — ALL pre-existing legacy-branch baseline (21:3 signOut, 31:3 auth, 443/448 empty catch + unused `_`, 534 preserve-caught-error). 0 NEW. |
| eslint `src/services/authService.js` | 7 pre-existing 8B baseline. 0 NEW. |
| Smoke (supabase data plane) | **100/100** |

## 7. Deployment & remaining risks

- **Deploy**: client-only change — `firebase deploy --only hosting` (or Vercel). No functions/rules
  changes. Supabase migrations unchanged (0003 `bump_campaign_stat` already applied).
- **Realtime**: one-shot loads only. Any page relying on live multi-client updates shows stale
  data until a realtime provider (Supabase Realtime/Postgres changes) is implemented. Single-browser
  flows are unaffected.
- **Staff-created accounts**: `addMember`/`addTrainer` no longer create Auth users in supabase
  mode — staff-account creation must come from the Auth layer (Supabase Admin or the 8B
  provisioning path). Documented boundary, not a regression within supabase mode.
- **Auth mismatch**: `VITE_AUTH_PROVIDER` must be `supabase` in BOTH authService (8B) and
  firestoreService (8C) or the app mixes backends (Firebase auth session + Supabase data plane
  reads with no session → empty screens).
- **Referred-by / referral codes**: supabase mode does not write `users/{uid}` docs or the
  `referralCodes` directory from this service; referral semantics live in authService/referralService.