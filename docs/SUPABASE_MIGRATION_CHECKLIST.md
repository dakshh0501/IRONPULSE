# IRONPULSE — Firestore → Supabase Migration Checklist

**Status:** Analysis-only (Step 2). No code changed, no SQL executed, no Firebase/Supabase resources modified.
**Legend:** ✅ Completed (analyzed) · ⏳ Pending (not yet done in Step 2) · ❓ Blocked/Uncertain

---

## ✅ Completed (Step 2 — source-code analysis)

- [x] Full repository walk: `src/` (services, context, pages, components, utils), `functions/index.js` (2301 lines), `firestore.rules` (744 lines), `storage.rules`, `firestore.indexes.json` (594 lines), `package.json`, `vite.config.js`, `firebase.json`, env examples.
- [x] Complete collection inventory — **33 collections/subcollections** identified (see `SUPABASE_MIGRATION_SCHEMA.md` §3): users, gyms, subscriptions, subscriptionHistory, paymentAttempts, members, trainers, plans, planTemplates, dietPlans, workoutPlans, progressLogs, payments, attendance, notifications, supportTickets, featureRequests, contactMessages, settings, whatsappLogs, whatsappCampaigns, licensedDevices, licenseHistory, referralCodes, referrals, rewardLedger, discountCoupons, referralAuditLogs, auditLog, aiConversations (+messages subcollection), generatedReports.
- [x] Field-level schema extraction for every collection from real write paths (add*/update*/setDoc payloads, migration functions, Cloud Function writes).
- [x] Documented dual-keying anti-pattern: `members.id` vs `members.authUid` both used as `memberId` across attendance (authUid), payments/progressLogs (doc id), diet/workout plans (both).
- [x] Realtime inventory: **40+ `onSnapshot` listeners** catalogued with their exact query shapes and Supabase equivalents (§9).
- [x] Transaction/batch inventory: `runTransaction` ×2 (subscriptionService.js:47, referralService.js:589), `writeBatch` ×4 (authService.js:119, deviceService.js:155, GymOwners.jsx:403, Subscriptions.jsx:711), `arrayUnion` ×3 (Support.jsx), `increment` (whatsappCampaigns stats, member checkins).
- [x] Cloud Functions inventory: 10 exports (4 callables, 2 webhooks, 1 Firestore trigger, 3 admin utils) + secrets list.
- [x] Firestore rules → RLS policy matrix for every collection (§8), including helper-function translation (`isStaff`, `inCallersGym`, `isOwnAttendance`, `isOwnMemberDoc`, `getCallerGymId`).
- [x] Index strategy: all 39 composite indexes + 3 field overrides mapped to Postgres indexes + additional single-field query patterns that Firestore auto-indexes (§7).
- [x] Storage mapping: `members/{memberId}/profile.webp` + `settings/gym-logo.webp` with client-side compress/resumable/delete logic (§10).
- [x] PK/ID strategy per collection, including deterministic doc IDs (`referrals/{referredUid}`, `referralCodes/{code}`, `settings/{gymId}:{docId}`) and gateway dedup keys (`payments.paymentId`, `paymentAttempts.paymentId`) (§6).
- [x] Migration risks ranked 1–16 (§12).
- [x] Open questions 1–10 listed (§13).
- [x] Implementation order drafted (11 phases, §14).
- [x] Deliverables written: `docs/SUPABASE_MIGRATION_SCHEMA.md` (14 sections) + this checklist.

## ⏳ Pending (not part of Step 2 — for later steps)

- [ ] **Step 3**: DDL script — actual Postgres schema (tables, enums, PKs/FKs, JSONB columns).
- [ ] **Step 4**: RLS policies as SQL (`CREATE POLICY` per table) — port of the §8 matrix.
- [ ] **Step 5**: DB functions/triggers (fulfillment transaction, referral-signup trigger, notification/reward triggers, jsonb_set helpers).
- [ ] **Step 6**: Realtime adapter implementation (supabase-js channels + initial select + upsert).
- [ ] **Step 7**: Data migration scripts (export → transform → import, UID mapping, dual-key reconciliation).
- [ ] **Step 8**: Edge Function ports (PhonePe, Cashfree, admin utils) with secrets.
- [ ] **Step 9**: Storage bucket policies + client storage service port.
- [ ] **Step 10**: Cutover plan (dual-write/feature flags, regression on all 13 modules).
- [ ] **Step 11**: Decommission Firestore (freeze, final export, delete).

## ❓ Blocked / Uncertain (requires user decision or production data)

- [ ] **Auth UID preservation strategy** — Postgres `auth.users.id` is UUID vs Firebase string UIDs referenced in ~10 tables and as doc IDs. Options: (c) mapping table + views [recommended], (b) recreate users, (a) rewrite UUIDs everywhere. *(Biggest cost driver — blocks schema finalization.)*
- [ ] **Settings global-vs-gym split** — `settings(gym_id, doc_id)` with `'platform'` sentinel vs separate `platform_settings` table; must preserve `getGlobalBilling()` semantics (`settings/billing` must stay global, NOT gym-scoped).
- [ ] **Role model normalization** — how to fold `admin` + `isSuperAdmin` boolean and `gym_owner` alias into canonical roles without breaking `rbac.js` and RLS predicates.
- [ ] **`gyms.documents` full schema** — superadmin approve/reject writes only `status` + `reviewedAt`; the complete document map contents are unverified (needs a production data sample).
- [ ] **`dietPlans.meals` / `workoutPlans.exercises` / `versions`** — JSONB column vs child tables (depends on realtime requirements for plan detail updates).
- [ ] **WhatsApp/campaign engine placement** — client-side in-memory (Spark semantics) vs Edge Function scheduler.
- [ ] **GoTrue profile linkage** — built-in `profiles` convention vs standalone table.
- [ ] **Audit/history retention** — licenseHistory/referralAuditLogs/auditLog are unbounded in Postgres; archive/retention policy needed.
- [ ] **Billing config write target post-migration** — `settings/billing` (global) vs Edge Function secrets for prod PhonePe/Cashfree config.
- [ ] **Storage URL rewrite** — persisted `photoUrl`/`logoUrl` values contain Firebase `firebasestorage.googleapis.com` URLs; Supabase URLs differ → rewrite at migration or render-time derivation.

## Notes

- Constraint compliance check: ✅ No Firestore tables created, no SQL executed, no Firebase/Supabase resources modified, no auth/payment/attendance logic changed, no source files modified, `src/lib/supabase.js` left untouched (unimported scaffold — flagged for later steps).
- Validation performed: all schema claims traced to actual source code; grep/inventory cross-checked against `firestore.indexes.json`, `firestore.rules`, and every `addDoc`/`setDoc`/`updateDoc`/`onSnapshot` call site in `src/` and `functions/`.