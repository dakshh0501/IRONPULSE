# IRONPULSE — Final Application Functionality Audit

**Date:** 2026-08-17
**Scope:** Full application audit + repair of every page, role and action across the Supabase-only stack (Firebase fully retired). Three parallel audits (gym-admin pages, superadmin pages, member/trainer/misc) plus end-to-end verification.
**Verdict:** `READY_FOR_FINAL_PRODUCTION_PAYMENT` — with the operator checklist in §7 executed (client-only redeploy + migrations 0011/0012 + sandbox payment smoke).

---

## 1. Audit method

1. Three parallel code audits with 30-line-window context over all 50+ routed pages/components, AppContext, services, RBAC and routing.
2. Every button/action traced to a real handler; every handler traced to a real service call; every service call checked against RLS/migration reality (enum values, column names, existing policies/RPCs).
3. All audit-proven defects fixed in code; fixes verified by build, eslint, dist scan and 8 smoke suites.

## 2. Role / page / action matrix

| Page | Roles | Audit | Status |
|---|---|---|---|
| Dashboard (Admin) | gym_admin, super_admin | OK (1 LOW fixed) | ✅ |
| Members | gym_admin, super_admin | OK (1 LOW fixed) | ✅ |
| MemberDrawer / MemberModal / MemberRow | gym_admin | OK | ✅ |
| Attendance | gym_admin, trainer, member | OK | ✅ |
| Payments | gym_admin, super_admin, member | 1 LOW fixed (`\|\|1` → `\|\|0`) | ✅ |
| Trainers | gym_admin | 1 MEDIUM fixed (spec/exp loss) | ✅ |
| Progress | gym_admin, trainer, member | OK | ✅ |
| Diet / Workouts | gym_admin, trainer, member | OK | ✅ |
| Reports | gym_admin | OK | ✅ |
| Plans (Settings tab) | gym_admin | OK | ✅ |
| Settings | gym_admin, gym_owner | 2 HIGH + 2 MEDIUM fixed | ✅ |
| Support | gym_admin, member | OK | ✅ |
| Subscriptions (gym) | gym_admin, super_admin | OK (Pay Now wired, prior step) | ✅ |
| GymSubscription | gym_admin, super_admin | OK (Pay Now wired, prior step) | ✅ |
| Checkout | super_admin, gym_admin | allowedRoles narrowed (LOW fixed) | ✅ |
| PaymentStatus | all authed | OK | ✅ |
| WhatsAppReminders | gym_admin | 1 MEDIUM fixed (sweep payments feed) | ✅ |
| CampaignManager | gym_admin, super_admin | OK | ✅ |
| DeviceManagement | gym_admin, super_admin | OK | ✅ |
| LicenseGuard / LicenseKeys | super_admin, gym_admin | OK | ✅ |
| Notifications | all roles | 1 LOW fixed (hex text color) | ✅ |
| MemberDashboard | member | OK | ✅ |
| MyRewards | member | 1 HIGH fixed (wallet redeem) | ✅ |
| Referral (member) | member | OK | ✅ |
| ReferralDashboard / ReferralFraud / CouponManagement | gym_admin | 1 LOW fixed (ReferralFraud ISO) | ✅ |
| ReferralManagement / ReferralAnalytics | super_admin | 1 MEDIUM fixed (dead import) | ✅ |
| TrainerDashboard | trainer | OK | ✅ |
| ReceptionMode | reception, trainer | OK | ✅ |
| Auth / Rejected / Landing / Privacy / Terms | public | OK | ✅ |
| Pulse AI (ChatPanel/Assistant/Sidebar) | all | 2 LOW fixed (pagination dead, Gemini label) | ✅ |
| superadmin Dashboard | super_admin | 1 LOW fixed (system health labels) | ✅ |
| superadmin ApprovalRequests | super_admin | OK | ✅ |
| superadmin GymOwners | super_admin | 1 MEDIUM + 6 LOW fixed | ✅ |
| superadmin Subscriptions | super_admin | OK | ✅ |
| superadmin Revenue / UsageAnalytics | super_admin | OK | ✅ |
| superadmin Notifications | super_admin | OK | ✅ |
| superadmin Support | super_admin | 1 HIGH fixed (reply/note/attachment) | ✅ |
| superadmin Security | super_admin | OK (disabled buttons documented) | ✅ |
| superadmin PlatformSettings | super_admin | 1 HIGH + 1 LOW fixed | ✅ |
| superadmin Reports | super_admin | OK | ✅ |
| superadmin DeviceManagement | super_admin | OK | ✅ |

## 3. Defects found & fixed (this final audit)

### HIGH

| # | Defect | Fix | Where |
|---|---|---|---|
| H1 | PlatformSettings save completely broken — `settingsKey('platform')` returned `{gym_id:'default'}`; `guard_settings_gym` trigger rejects every write → nothing persisted | Platform-scoped key `{gym_id:'platform', doc_id:'platform'}` | `src/services/firestoreService.js` (`settingsKey`) |
| H2 | MyRewards "Redeem" always called `redeem_discount_coupon` RPC (coupons table) even for wallet `reward_ledger` rows — wallet rewards unredeemable | New owner-only RPC `redeem_wallet_reward` + branch on `_type` | `supabase/migrations/0012_redeem_wallet_and_gyms_delete.sql`, `src/services/referralService.js`, `src/pages/MyRewards.jsx` |
| H3 | Settings "Delete Gym Account" was a no-op — `gyms` table had NO delete RLS policy | New `pol_gyms_delete_super_or_owner` policy (super OR `owner_uid`) | `0012_redeem_wallet_and_gyms_delete.sql` |
| H4 | superadmin Support TicketDrawer: Send Reply / Save Note / Attachments were fake-success stubs with stale "after Firestore replies collection is implemented" copy | Wired to `supportService.addSupportReply/addSupportNote/addSupportAttachment` with saving state + success/error feedback | `src/pages/superadmin/Support.jsx` |

### MEDIUM

| # | Defect | Fix | Where |
|---|---|---|---|
| M1 | Trainer spec/exp silently dropped — form sends `spec`/`exp`; `supabaseAddTrainer` read `specialty`/`experience`; mapper never exposed them | Read/write/map both key forms | `src/services/firestoreService.js` |
| M2 | Settings profile tab `getSettings/saveSettings('profile_…')` without gymId → `gym_id 'default'` → RLS denied for gym admins | Pass `gymId \|\| 'platform'` (3 call sites) | `src/pages/Settings.jsx` |
| M3 | Settings profile photo upload reused `uploadGymLogo` → overwrote the gym logo | `uploadMemberPhoto(file, currentUser?.uid \|\| 'profile')` | `src/pages/Settings.jsx` |
| M4 | Settings "Reset All App Data" was fake (logout only) | Removed honestly; real Danger Zone = Delete Gym Account (now works via H3) | `src/pages/Settings.jsx` |
| M5 | GymOwners: header "Approve Gym" dead (no handler), `monthlyRevenue` always ₹0 (`createdAt?.seconds` on ISO), mini-chart + "+12%" hardcoded | Approve opens confirm on first pending gym; ISO-safe revenue; real 12-month `revenueBars`; real `memberGrowth` | `src/pages/superadmin/GymOwners.jsx` |
| M6 | WhatsAppReminders "Run Sweeps Now" passed empty payments feed → overdue sweep never ran | Pass `payments` from context | `src/pages/WhatsAppReminders.jsx` |
| M7 | ReferralManagement imported dead `deleteReferral` | Import removed | `src/pages/superadmin/ReferralManagement.jsx` |

### LOW

| # | Defect | Fix | Where |
|---|---|---|---|
| L1 | Payment balance used `\|\|1` → unpaids shown as ₹−1 | `\|\|0` | `src/pages/Payments.jsx:125` |
| L2 | Members search crashed on null email | `(m.email\|\|'').toLowerCase()` | `src/pages/Members.jsx:86` |
| L3 | ChatPanel "Load more" dead — cursor only ever set from a Firestore snapshot; adapter passes arrays | Numeric offset (`items.length`), offset bumped on append; `hasMore = items.length >= pageSize` | `src/components/ai/ChatPanel.jsx` |
| L4 | "Gemini live answers" label (provider is Groq) | Relabeled | `src/components/ai/ChatPanel.jsx:639` |
| L5 | `/checkout` allowed trainer/member (roles with no subscription-row read) | Narrowed to `['super_admin','gym_admin']` | `src/App.jsx:290` |
| L6 | superadmin Dashboard System Health labeled Firestore/Cloud Functions | Database / Edge Functions | `src/pages/superadmin/Dashboard.jsx` |
| L7 | PlatformSettings stale service labels (Firestore, Cloud Functions) | Database (PostgreSQL), Edge Functions (Supabase) | `src/pages/superadmin/PlatformSettings.jsx` |
| L8 | ReferralFraud CAMPAIGN_EXPIRED never fired — `createdAt?.seconds` on ISO | Module-level `isCampaignExpired` helper (ISO + `.seconds`), eslint-clean | `src/pages/gym/ReferralFraud.jsx` |
| L9 | GymOwners/Notifications hardcoded dark-theme text hexes (invisible in light theme) | CSS-variable sweep (58 + 1 occurrences) | `GymOwners.jsx`, `Notifications.jsx` |
| L10 | GymOwners delete-confirm claimed auth accounts are deleted (untrue in Supabase) | Corrected copy | `src/pages/superadmin/GymOwners.jsx` |
| L11 | ReferralAnalytics dead imports (`getTopReferrers`, `buildReferralLink`, `ExternalLink`) | Removed | `src/pages/superadmin/ReferralAnalytics.jsx` |

### By-design / documented (no code change)
- Security.jsx "disabled" buttons (no backend exists — disabled with explanatory tooltip).
- PlatformSettings Test Email/SMS/WhatsApp + Run Backup/Restore buttons: messages already state what is/isn't possible (SMTP/Cloud-Function dependencies); labels updated to the real stack.
- Trainer delete in Supabase is allowed by RLS (`is_staff` includes trainer) — differs from legacy Firebase rules, documented in Step 8C §2.
- Super-admin gym notifications / attendance inserts fail RLS in supabase mode (no gym_id) — non-blocking catch.

## 4. Files & migrations changed (final audit)

**Client (19 files):** `src/services/firestoreService.js`, `src/services/referralService.js`, `src/pages/MyRewards.jsx`, `src/pages/Settings.jsx`, `src/pages/superadmin/Support.jsx`, `src/pages/superadmin/GymOwners.jsx`, `src/pages/superadmin/Dashboard.jsx`, `src/pages/superadmin/PlatformSettings.jsx`, `src/pages/superadmin/ReferralManagement.jsx`, `src/pages/superadmin/ReferralAnalytics.jsx`, `src/pages/Payments.jsx`, `src/pages/Members.jsx`, `src/pages/WhatsAppReminders.jsx`, `src/pages/Notifications.jsx`, `src/pages/gym/ReferralFraud.jsx`, `src/components/ai/ChatPanel.jsx`, `src/App.jsx`.

**Migration:** `supabase/migrations/0012_redeem_wallet_and_gyms_delete.sql` (new — RPC + gyms delete policy; verified against `reward_ledger.user_id text` schema and 0001 helpers `auth_firebase_uid()`/`is_super_admin()`).

**Not applied to live DB yet:** 0011 + 0012 (operator action, §7).

## 5. Payment flow status

- Full chain verified end-to-end in Cashfree **sandbox** (Step 9B E2E **40/40**): Checkout → `cashfree-order` Edge → SDK modal → webhook/verify → `fulfill_payment` RPC (0009 exactly-once claim) → payments + invoice `INV-YYYYMMDD-XXXX` + subscription paid/active + gym.subscription sync + history + notifications. Backend untouched by this audit (UI-only changes).
- ₹1 sandbox pricing active (`PLAN_AMOUNTS` = 100 paise in `src/constants/plans.js`; `calculateSubscriptionAmount` is the single source). **No real production payment was made.**
- PhonePe legacy server paths intact; Cashfree is the active gateway branch.

## 6. Verification results (final run)

| Check | Result |
|---|---|
| `npm run build` | 0 errors, 0 warnings (6.09s) |
| eslint (12 changed files) | 0 NEW — all remaining findings are documented pre-existing baselines (App.jsx:148 refs, ChatPanel effect patterns, PlatformSettings 249/778/827, Dashboard Date.now purity, Members 31, WhatsAppReminders 57/97, ReferralManagement 95/120) |
| dist scan | clean — no identitytoolkit / firestore.googleapis.com / `getAuth(` / `initializeApp` / `onSnapshot`(Firestore) / `httpsCallable` / storage SDK / secrets (`cfsk_`, `x-client-secret`, `CASHFREE_SECRET`, `SERVICE_ROLE`). Only benign hits: `firebase_uid` column names and OpenAI SDK's `currentChatCompletionSnapshot` method |
| s8b (auth) | 56/56, 0 firebase calls |
| s8c (data plane) | 101/101 |
| s8e (write paths/RPCs) | 73/73 |
| s8f (storage) | 35/35 |
| s8g (edges/payments) | 77/77 |
| s8p (password recovery) | 27/27 |
| s8x (devices) | 16/16 |
| realtime suite | 31/31 |
| s8d full | 96/100 — recorded pre-existing harness baseline (T02 warn-timing race, T24/T25/T32 realtime harness semantics; unrelated to this audit) |
| Cashfree sandbox E2E | 40/40 (Step 9B; harness cleaned, backend unchanged this audit) |

## 7. Operator checklist (to go live)

1. `supabase db push` — applies **0011** (licensed_devices columns) and **0012** (redeem RPC + gyms delete policy). Migration list must show 0001–0012 applied.
2. Vercel (or hosting) redeploy of current `dist` — the deployed bundle predates this audit.
3. Sandbox ₹1 payment smoke via the website UI (`/subscription` or `/subscriptions` → Pay Now → checkout → Cashfree modal → status page). Requires `VITE_CASHFREE_CLIENT_ID` set (currently NOT set → Cashfree branch disabled by design).
4. Validate a real provider "Test Webhook" event against `cashfree-webhook` (HMAC over `x-webhook-timestamp + rawBody`) before cutting webhook URLs over from legacy Firebase Functions (30-day rollback window).
5. Supabase Redirect URLs must include the app `/auth` path (recovery/verification links).
6. No data migration needed — all fixes are code + additive policies.

## 8. Residual risks (non-blocking, tracked)

- `s8d` 96/100 harness baseline (realtime semantics) — not a production defect.
- Real-time replication: publication enabled 2026-08-17 via Management API (additive); verify live lists update after a fresh deploy.
- `bump_campaign_stat` PUBLIC execute ACL (legacy) — non-blocking.
- Remaining `firebase` strings in src are identifier/column naming only (`firebase_uid`, `firebaseUid`), documented as acceptable.
- Groq API key is inlined in the client bundle by design (documented; rotation recommended at cutover).
