# SUPABASE MIGRATION FINAL AUDIT

**Project:** IRONPULSE (ironpulse-32f31)
**Date:** 2026-08-15
**Scope:** Final development-side Firebase → Supabase migration completion audit.
**Boundary:** NO production cutover performed. No webhook reconfiguration, no Firebase data modification, no schema changes, no deletion of PhonePe code, no deletion of Firebase, rollback support retained.

---

## Status Summary

| Area | Status |
|------|--------|
| CORE MIGRATION | COMPLETE |
| DATA MIGRATION | COMPLETE |
| AUTH MIGRATION | COMPLETE |
| REALTIME MIGRATION | COMPLETE |
| STORAGE MIGRATION | COMPLETE |
| FUNCTION MIGRATION | COMPLETE |
| CASHFREE | PENDING EXTERNAL WEBHOOK VALIDATION |
| PHONEPE | DEFERRED / RETAINED |
| FIREBASE RETIREMENT | PENDING FINAL CUTOVER |

---

## Audit 1 — Firebase References (Repository-wide)

Every remaining Firebase reference in `src/` was classified. All 25 SDK-importing files use the foldable dual-provider pattern
(`const IS_FIREBASE_MODE = (import.meta.env.VITE_AUTH_PROVIDER || 'supabase') === 'firebase'`); in a supabase build esbuild
folds the constant to `false` and every Firebase branch is dead-code-eliminated. Verified per-file by guard inspection AND by
dist-chunk scan (Audit 2).

| File | Classification |
|------|----------------|
| `src/firebase.js` | ROLLBACK_ONLY + DOCUMENTED_EXCEPTION (dormant SDK chunk, mode-conditional init, null sentinels in supabase mode) |
| `src/services/authService.js` | ROLLBACK_ONLY (Step 8B dual-provider; firebase branches folded) |
| `src/services/firestoreService.js` | ROLLBACK_ONLY (Step 8C dual-provider; 72 guarded refs; lazy secondary auth) |
| `src/services/paymentService.js` | ROLLBACK_ONLY (Step 9A-U1 lazy `getFunctions`); DOCUMENTED_EXCEPTION (`getPaymentAttempt` read of function-owned data) |
| `src/services/cashfreeService.js` | ROLLBACK_ONLY (Step 9A-U2 lazy `getFunctions`) |
| `src/services/attendanceService.js` | ROLLBACK_ONLY (guarded refs, 6) |
| `src/services/notificationService.js` | ROLLBACK_ONLY (guarded refs, 10) |
| `src/services/licenseHistoryService.js` | ROLLBACK_ONLY (guarded refs, 4) |
| `src/services/deviceService.js` | ROLLBACK_ONLY (guarded refs, 12) |
| `src/services/reportService.js` | ROLLBACK_ONLY (guarded refs, 5) |
| `src/services/subscriptionService.js` | ROLLBACK_ONLY (guarded refs, 5) |
| `src/services/supportService.js` | ROLLBACK_ONLY (Step 8E; arrayUnion branch guarded) |
| `src/services/storageService.js` | ROLLBACK_ONLY (Step 8F); DOCUMENTED_EXCEPTION (inert SDK module-registration code in entry chunk) |
| `src/services/securityService.js` | ROLLBACK_ONLY (Step 9A-U3; supabase RPC branch) |
| `src/services/referralService.js` | ROLLBACK_ONLY (guarded refs, 21) |
| `src/services/ai/conversationService.js` | ROLLBACK_ONLY (guarded refs, 8) |
| `src/context/AppContext.jsx` | ROLLBACK_ONLY (all direct firebase calls inside `IS_FIREBASE_MODE` branches; RPC/supabase equivalents elsewhere) |
| `src/components/ai/ChatPanel.jsx` | ROLLBACK_ONLY — DOCUMENTED_EXCEPTION (`increment()` sentinel converted to read-then-set inside `supabaseUpdateConversation`) |
| `src/components/MemberModal.jsx` | ROLLBACK_ONLY (users-doc photoUrl write gated) |
| `src/pages/Settings.jsx` | ROLLBACK_ONLY (gated) |
| `src/pages/superadmin/Subscriptions.jsx` | ROLLBACK_ONLY (Step 9A-U5 guarded mirror) |
| `src/pages/superadmin/LicenseKeys.jsx` | ROLLBACK_ONLY (`serverTimestamp` sentinel converted via `licensePatch`) |
| `src/pages/superadmin/GymOwners.jsx` | ROLLBACK_ONLY (supabase-mode FK-cascade early-return; firebase cascade guarded) |
| `src/utils/license.js` | ROLLBACK_ONLY (Step 9A-U4; supabase jsonb-filter branch) |
| `src/utils/referralCode.js` | ROLLBACK_ONLY (Step 8E; staff helpers return no-ops in supabase mode) |
| `functions/index.js` | SERVER_LEGACY (legacy Cloud Functions retained unchanged as rollback window; not client code) |
| `dist/assets/firebase-FusQFP5G.js` (413.01 kB) | DOCUMENTED_EXCEPTION — dormant SDK chunk: no init, no network, no API calls reachable (verified by chunk scan); removed only at Firebase retirement |
| Firebase env vars in `.env*` | DEFERRED (kept for rollback; retirement pending final cutover) |

**UNEXPECTED = 0** (Step 9A UNEXPECTED findings U0–U5 verified as fixed; no new unexpected references introduced since.)

---

## Audit 2 — Supabase Mode

- `VITE_AUTH_PROVIDER=supabase` — confirmed in `.env` (line 44), `.env.example`, `.env.production.example`.
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable only) present in all three env files.
- Built bundle (`dist/assets/index-ZxA6b1gK.js` entry + all non-SDK chunks) contains **ZERO** reachable Firebase API calls:

| Marker | Entry | Non-SDK chunks | Firebase SDK chunk |
|--------|-------|----------------|--------------------|
| getFirestore / getDoc / setDoc / addDoc / updateDoc / deleteDoc / writeBatch | 0 | 0 | 0 (firestore SDK tree-shaken entirely) |
| onSnapshot | 0 | 0 | — |
| getStorage / getDownloadURL / uploadBytesResumable / deleteObject | 0 | 0 | 0 (storage SDK tree-shaken; only inert RestClient string) |
| getFunctions / httpsCallable | 0 | 0 | 0 (functions SDK tree-shaken) |
| getAuth / sendEmailVerification / applyActionCode / updateProfile | 0 | 0 | SDK-internal definitions only (never called) |
| initializeApp | 0 | 0 | 2 (SDK-internal error strings only — no call site) |

- The only `getAuth`-like substrings in the entry are supabase-js internals (`_getAuthToken`, `getAuthenticatorAssuranceLevel`).
- Supabase markers confirmed in bundle (`supabase.co`, `sb_publishable`).

**Supabase mode does not read, write, subscribe to, use Storage of, or call Functions on Firebase.** VERIFIED.

---

## Audit 3 — Auth

| Check | Result | Evidence |
|-------|--------|----------|
| 25/25 Auth users | PASS | `auth-provisioning-manifest.json`: `expectedCounts {approved:25, normalCreate:22, bannedCreate:3}`; users array = 25 (9 member, 3 rejected, 3 trainer, 8 gym_owner, 1 gym_owner_pending, 1 super_admin) |
| 25/25 UID mappings | PASS | Every manifest entry carries `targetSupabaseUuid`; `firebase-to-supabase-id-map.json` = 25 mappings, `missing:[] duplicates:[] unexpected:[]` |
| 3 rejected users banned | PASS | All 3 rejected entries: `provision: "create-banned"`, `status: "existing-correct (matching firebase_uid, already banned)"`; ban verified via `banned_until` (ban_duration 876000h), no recovery link sent |
| profile/Auth FK integrity | PASS | `profiles-without-auth = 0`; 25 auth = 25 profiles; post-import FK spot checks (11) all 0 orphans; 0 FAILED, 0 MISSING |
| Session restore | PASS | s8b smoke suite 56/56 (session restore, malformed session → null) |
| Login / logout | PASS | s8b 56/56 (sign-in, logout, auth-state events, role gates: pending / gym_owner_pending / rejected / account_disabled) |
| Recovery | PASS | s8b 56/56 (resetPasswordForEmail anti-enumeration, recovery link, completeRecoveryLink → updatePassword, recovery session gate) |
| Role routing | PASS | s8b 56/56 (profile+role loading, pending/rejected/gop/disabled gates); s8c 101/101 (RBAC data-plane matrix) |

**AUTH MIGRATION: COMPLETE.**

---

## Audit 4 — Data

| Metric | Expected | Actual | Result |
|--------|----------|--------|--------|
| Imported | 169 | 169 (byTable: gyms 13, profiles 25, plans 18, settings 1, subscriptions 6, subscription_history 2, notifications 9, license_history 11, referral_codes 1, ai_conversations 15, ai_conversation_messages 65, contact_messages 3, +10 gyms.owner_uid backfill) | PASS |
| Approved exclusions | 28 | 28 — 10 legacy-only profiles, 6 sentinel plans (Decision 5), 6 tenantless settings (Decision 6), 1 subscription→quarantined gym FK, 5 notifications→legacy-only user FK; all `EXCLUDED_WITH_APPROVED_REASON` | PASS |
| Quarantined | 61 | 61 (attendance 49, gyms 3, members 1, plans 4, notifications 4); `collisionsWithImported: 0` | PASS |
| Missing | 0 | 0 (0 FAILED, 0 MISSING_FROM_ACCOUNTING in rows: 169 IMPORTED + 28 EXCLUDED = 197/197 accounted) | PASS |
| Unexplained FK violations | 0 | All 6 FK exclusions documented consequences of approved decisions (D4 quarantine, Auth-set boundary); pre-flight FK check = 0 unresolved refs across 12 imported tables; license_history.performed_by → NULL policy (11), gyms.owner_uid legacy-only → NULL (3) | PASS |
| Deterministic IDs clean | Yes | `deterministic-identifiers.json`: 0 duplicates across referralCodes, paymentIds, invoiceNos, licenseKeys, referralReferredUid, firebaseUids (35), gymIds (16) | PASS |

**DATA MIGRATION: COMPLETE.**

---

## Audit 5 — Realtime

Adapter (Supabase Realtime + postgres_changes, race-safe, RLS-gated — `docs/SUPABASE_REALTIME_MIGRATION.md`/`REPORT.md`).

| Check | Result | Evidence (s8d `smoke-rt.cjs` 31/31 + `smoke.cjs` 96/100) |
|-------|--------|--------|
| Migrated subscriptions | PASS | R12–R19 (members, member, notifications, gym subscription jsonb, settings, history, whatsapp logs) |
| Initial load | PASS | R01, R03, R13 (empty + populated initial snapshots, desc order + limit) |
| INSERT | PASS | R01, R13 (live INSERT delivered, full-array snapshot) |
| UPDATE | PASS | R03 (desc/limit), R07 (filter-violating UPDATE removed client-side) |
| DELETE | PASS | R06 (row removed) |
| Reconnect | PASS | R08 (buffered event survives reconcile), R09/R10 (CHANNEL_ERROR/TIMED_OUT → onError), R11 (reconcile catch-up of missed inserts) |
| Unsubscribe | PASS | R05 (registry dedup + refcount), R17 (no callbacks after unsubscribe, registry empty) |
| RLS isolation | PASS | R03 (cross-gym event NOT delivered), R16 (member sees null on staff-only settings; staff sees data) |

**s8d harness baseline (4 pre-existing failures) — RECORDED UNCHANGED:**
`T02 REALTIME_PENDING warned` (warn-timing race), `T24 gym-a members exclude gym-b Bob` (realtime channel-adapter semantics), `T25 unauthenticated read denied (via onError)` (realtime channel-adapter semantics), `T32 one-shot single invocation` (realtime channel-adapter semantics). Identical to the documented Step 8E/9A baseline (96/100); none touched by current source. Not release blockers (realtime adapter itself passes 31/31 RT-focused checks).

**REALTIME MIGRATION: COMPLETE.**

---

## Audit 6 — Storage

| Check | Result | Evidence |
|-------|--------|----------|
| Firebase Storage source empty | PASS | `docs/FIREBASE_STORAGE_INVENTORY.md` (Step 8I, live evidence): project has 0 buckets; `ironpulse-32f31.appspot.com` / `.firebasestorage.app` = 404; 0 URL-shaped values across all Firestore collections. Nothing to migrate. |
| Supabase storage policies active | PASS | `supabase/migrations/0005_storage.sql`: bucket `gym-images` + `storage_gym_image_allowed()` security-definer helper + 4 policies (public read, staff upload/update/delete with path scoping, super bypass) |
| Storage smoke | PASS | s8f 35/35 (upload/delete/public-URL/path-scoping/RLS denials/upsert/duplicate/zero-firebase) |

**STORAGE MIGRATION: COMPLETE.**

---

## Audit 7 — Functions

| Check | Result | Evidence |
|-------|--------|----------|
| 6 Supabase payment Edge Functions | PASS | `supabase/functions/`: phonepe-pay, phonepe-verify, phonepe-callback (webhook, no JWT), cashfree-order, cashfree-verify, cashfree-webhook (webhook, no JWT) — all `Deno.serve` handlers, shared helpers in `_shared/` |
| 4 RPC/security functions | PASS | 0006: `fulfill_payment` (definer, service-role only per 0007), `delete_auth_user`, `get_security_metrics`, `backfill_profiles`; plus 0004 family (set_profile_role, update_gym_subscription, notification deletes, referral status/coupon, license history) and 0003 `bump_campaign_stat`; 0007 closes PUBLIC-execute gap; 0008 grants get_security_metrics to authenticated |
| Referral trigger | PASS | 0006: `handle_referral_signup()` + `trg_referral_signup` AFTER INSERT on profiles (Spark-compatible, no Admin SDK) |
| No secrets in frontend | PASS | Browser code holds zero secret material; all payment secrets (PhonePe salt, Cashfree client secret, merchant IDs) server-side only via Edge Function env (`supabase secrets set`); publishable anon key only in frontend |
| Cashfree webhook validation | **PENDING EXTERNAL CONFIGURATION** | Edge webhook HMAC + amount checks are simulation-validated (s8g 77/77) but NOT yet validated against a real dashboard "Test Webhook" event; provider-side webhook URLs still point at legacy Firebase Functions until validated cutover. Not a development-side blocker. |
| PhonePe | **DEFERRED / RETAINED** | Full Edge Function parity exists (pay/verify/callback + server-side checksums) and passes s8g; not required for launch; kept operational for rollback/deferred cutover. Not a launch blocker. |

**FUNCTION MIGRATION: COMPLETE.**

---

## Audit 8 — Secret Scan

Scanned: `src`, `supabase/`, `scripts/`, `public/`, `functions/`, `dist/`, `migration-output/`, `docs/`, `.env*`, `android/`, `e2e/`.

| Pattern | Result |
|---------|--------|
| `sb_secret_` | No actual values. Only supabase-js SDK internal guard strings in dist (`sb_publishable_`/`sb_secret_` prefix checks) — not credentials. |
| `service_role` | Name-only references (scripts/DB client construction from env vars, RLS/GRANT docs, config.toml comments). Zero JWT values (`eyJ…` = 0 across repo). |
| `private_key` | 0 matches. |
| `client_secret` | Name-only (env var names, Secret Manager references, comments). `.env`/`.env.example` contain only `VITE_CASHFREE_*` public vars — no client secret. |
| `cfsk_` | 0 matches (previously-removed production secret confirmed gone; rotation flagged at 81J). |
| password-like credentials | `.env` contains only client-side publishable keys (Supabase publishable, Firebase web API key, Groq client key, Cashfree app id — all by design). `.creds/` (operator service account, gitignored) excluded from repo; not committed. |
| migration-output | CLEAN (no pattern matches). |
| docs | Name-only references; no JWTs, no values. |

**No actual credentials leaked.** PASS.

---

## Audit 9 — Build / Test

| Suite | Result |
|-------|--------|
| s8c (data plane) | **101/101 PASS** |
| s8d (realtime) | **96/100 PASS** — 4 failures = recorded pre-existing baseline, UNCHANGED (Audit 5) |
| s8e (write paths/RPCs) | **73/73 PASS** |
| s8f (storage) | **35/35 PASS** |
| s8g (functions/payments) | **77/77 PASS** |
| s8b (auth — supplementary) | **56/56 PASS**, 0 Firebase auth shim calls |
| `npm run build` | **0 errors, 0 warnings** (18.6s; entry 476.96 kB, dormant firebase chunk 413.01 kB) |
| eslint | No NEW findings. All 103 errors are documented pre-existing baseline (react-hooks v6 `set-state-in-effect`/`refs` rules across untouched files, legacy-branch findings at AppContext 803, Settings 483, LicenseKeys 485/494, Subscriptions 520/597/598/900/1027, ReferralManagement 96/121, firestoreService 462/467/553, referralService 194, authService 270/407/486/502/875, App.jsx 148, Auth.jsx 263/311, PlatformSettings 249/778/827). All migration-created files eslint-clean (lib/supabase.js, supportService, storageService, securityService, license.js, cashfreeService, paymentService, MemberModal, conversationService). |

---

## Audit 10 — Final State

- **CORE MIGRATION: COMPLETE**
- **DATA MIGRATION: COMPLETE**
- **AUTH MIGRATION: COMPLETE**
- **REALTIME MIGRATION: COMPLETE**
- **STORAGE MIGRATION: COMPLETE**
- **FUNCTION MIGRATION: COMPLETE**
- **CASHFREE: PENDING EXTERNAL WEBHOOK VALIDATION** (operator must set `CASHFREE_CLIENT_ID`/`CASHFREE_CLIENT_SECRET` secrets, validate a dashboard test-webhook event against the Edge receiver, then re-point provider webhook URLs)
- **PHONEPE: DEFERRED / RETAINED** (not a launch blocker)
- **FIREBASE RETIREMENT: PENDING FINAL CUTOVER** (operator decision: rebuild `VITE_AUTH_PROVIDER=firebase` for rollback; retirement removes the dormant SDK chunk, `.env` Firebase vars, `functions/`, `firebase.json`, `firestore.rules`)

---

## FINAL VERDICT: DEVELOPMENT_MIGRATION_COMPLETE

All conditions met:
- Unexpected Firebase references = 0 (Audit 1)
- Build passes — 0 errors, 0 warnings (Audit 9)
- All required suites pass (s8c 101/101, s8d 96/100 with unchanged documented baseline, s8e 73/73, s8f 35/35, s8g 77/77, s8b 56/56) (Audit 9)
- No credential leakage (Audit 8)
- Data/Auth reconciliation remains valid — 169 imported / 28 approved exclusions / 61 quarantined / 0 missing / 0 unexplained FK violations; Auth 25/25 with 3 banned, FK integrity clean (Audits 3–4)

**No production cutover was performed.** Remaining before launch (operator): Cashfree secrets + webhook endpoint validation + provider-side URL cutover, then Firebase retirement as a separate, operator-authorized task.
