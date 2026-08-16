# Supabase Write-Path Migration Report — Step 8E

**Status: COMPLETE — build 0 errors/0 warnings, eslint 0 NEW, smoke 73/73, regressions s8c 101/101 + s8d 96/100 (4 pre-existing realtime-harness failures, unrelated)**

## 1. Scope

Eliminate every remaining Firebase *application-data write* from the browser. Supabase is the ACTIVE data plane (`VITE_AUTH_PROVIDER=supabase`); Firebase mode remains as an explicit operator rollback branch (`=== 'firebase'`), built with the same foldable `IS_FIREBASE_MODE` constant pattern as Step 8C.

Out of scope (per constraint): Firebase Storage, Cloud Functions (payment webhooks), Firebase Auth data-plane reads that are function-owned, schema changes beyond `0004_rpc.sql`, service-role credentials.

## 2. Before / After write-count

| Path | Before | After |
|---|---|---|
| Pages/components direct `updateDoc`/`addDoc`/`setDoc` calls | Support (reply/note/attachment), Settings profile, MemberModal photoUrl, GymOwners (suspend/activate/delete/reset/edit/doc-review), LicenseKeys (5 handlers), ReferralManagement (reject), Subscriptions (delete) | 0 — all routed through dual-mode services or gated |
| AppContext approval/reactivation writes | `updateDoc(users/{uid})` + `updateDoc(gyms/{gymId}, …)` multi-write | 0 firebase calls outside `IS_FIREBASE_MODE` branches; supabase uses `set_profile_role` + `update_gym_subscription` RPCs |
| writeBatch / runTransaction browser multi-writes | signUp (Step 8B removed), subscription provisioning (read-then-write) | 0 — atomicity moved into SQL RPCs (`update_gym_subscription` single-statement merge) |
| `users` collection writes (staff-side referral helpers) | `isReferralCodeUnique`, `getReferrerByCode`, `backfillMissingReferralCodes` | `true`/`null`/`0` in supabase mode (firebase-rollback-only) |
| `paymentAttempts` client writes | `savePaymentAttempt`/`updatePaymentAttempt` | Throws (`Cloud-Function-owned`) in supabase mode; `getPendingAttemptsForSubscription` → `[]`; `cleanupExpiredPaymentAttempts` → `0` |

## 3. Files changed

### Product (Step 8E)
- `src/services/supportService.js` — **NEW**: `addSupportReply` / `addSupportNote` / `addSupportAttachment` — firebase `arrayUnion` OR supabase child-table inserts (`support_ticket_replies/notes/attachments`).
- `src/context/AppContext.jsx` — module helpers `setProfileRole`, `getUserRole`, `setGymSubscriptionFields`; `approveGymOwner`/`rejectGymOwner` read gym from state; approval init writes subscription via `update_gym_subscription` RPC; rollback mode-aware; `reactivateSubscription.updatedAt` ISO in supabase mode.
- `src/pages/Support.jsx`, `src/pages/superadmin/ReferralManagement.jsx` — service calls with error toasts.
- `src/pages/Settings.jsx` (profile users-write gated), `src/components/MemberModal.jsx` (photoUrl users-write gated).
- `src/utils/referralCode.js` — staff-side helpers firebase-rollback-only.
- `src/pages/superadmin/GymOwners.jsx` — suspend/activate/reset/edit/delete/document-review via `updateGym`/`deleteGym`; supabase-mode gym delete = single row delete (FK cascade wipes all gym-scoped tables; Auth accounts NOT deleted — `deleteAuthUser` CF is firebase-only).
- `src/pages/superadmin/LicenseKeys.jsx` — 5 handlers via `updateGym` + `licensePatch` (serverTimestamp→ISO in supabase).
- `src/services/firestoreService.js` — `supabaseUpdateGym` now merges `subscription.*` dot-path keys into the existing subscription jsonb (read-merge — see §4 bug list).
- `src/pages/superadmin/Subscriptions.jsx` — supabase-mode delete via `subscriptions` row delete (FK cascade `payment_attempts`).
- `src/services/paymentService.js` — payment-attempt guards (§2).
- `supabase/migrations/0004_rpc.sql` — 8 `security definer` RPCs + enum extensions (`device_status`+'suspended', `coupon_status`+'redeemed', `referral_status`+'Rejected').

### Production bugs found & fixed by the Step 8E smoke suite
1. **`supabaseGetDeviceCount(client, gymId)` argument order swapped** (signature `(gymId, clientOrNull)`) in `deviceService.js` — supabase-mode device-limit enforcement always counted `0`/crashed. Fixed both call sites (register + validate).
2. **`supabaseUpdateGym` dot-path replace, not merge** — a `subscription.*` write wiped plan/status/expiry set by other writers (Firebase dot-path parity broken). Now read-merges existing jsonb.
3. **`loadMoreConversations` cursor guard** — `!beforeSnapshot` early-returned `[]` in supabase mode (offset pagination needs no cursor). Guard moved inside the firebase branch.

## 4. RPC summary (0004_rpc.sql)

| RPC | Purpose | Authorization |
|---|---|---|
| `set_profile_role(p_uid, p_role)` | approval/rejection role change (RLS has no cross-user UPDATE policy) | `is_super_admin` only; role whitelist |
| `update_gym_subscription(p_gym_id, p_updates jsonb)` | atomic `subscription = subscription || p_updates` merge (license provisioning, lifecycle) | `is_super_admin` only |
| `delete_own_notification(p_id)` / `delete_own_notifications(p_user_id)` | notifications have no delete policy | owner only |
| `update_referral_status(p_referred_uid, p_status)` | no referrals update policy; whitelist incl. `Rejected` | super OR gym_admin/gym_owner own-gym |
| `delete_referral(p_referred_uid)` | no referrals delete policy | super only |
| `redeem_discount_coupon(p_coupon_id)` | `available→redeemed` + `used_at=now()` (23505 race-safe) | owner only |
| `log_license_history(p_gym_id, p_device_id, p_action)` | no license_history insert policy | staff + own-gym (or super) |

All `security definer` (precedent: `auth_firebase_uid()`/`is_staff()`), explicit in-function role checks, `revoke anon; grant authenticated`. Audit doc reconciled (was marked `invoker` during planning; final decision definer).

## 5. Documented exceptions / boundaries (by design, no code change)

- **Payment attempts are BACKEND_FUNCTION_REQUIRED**: Cloud Functions (PhonePe/Cashfree webhooks + verify) own `paymentAttempts` in Firebase Firestore. Client writes throw in supabase mode; `getPaymentAttempt` read kept (function-owned data) — the only firebase data-plane read remaining, documented exception.
- **Super-admin gym notifications fail RLS in supabase mode**: `pol_notifications_insert_staff_own` requires `gym_id = auth_gym_id()`, and super admins have no gym_id. `fireNotif` catches; non-blocking.
- **Super admin cannot insert attendance** (insert RLS = staff + own gym). Documented 8C edge, unchanged.
- **`rejectedAt` dropped** in supabase mode (no `referrals.rejected_at` column; firebase keeps it). Status change itself is authoritative.
- **Gym-delete cascade**: supabase-mode `deleteGym` wipes all gym-scoped tables via FK cascade (incl. new child tables + `ai_conversations` + children); Auth accounts/profiles are NOT deleted (no cross-system deletion from the browser; `deleteAuthUser` CF is firebase-only).
- **Member-session referral notification side-writes** remain best-effort (staff-only insert RLS) — caught, documented 8C boundary.
- **`referralCodes` directory**: create rule is owner-only — staff-side `addMember` mapping write is denied in supabase mode; converges via member login self-heal (`ensureSelfReferralCode`).

## 6. Verification

- `npm run build`: 0 errors, 0 warnings (22.5s, entry `index-QVbdflIj.js`).
- eslint on all 15 touched files: **0 NEW** (all remaining findings verified pre-existing in untouched code: AppContext 803, Settings 483, LicenseKeys 485/494, Subscriptions 520/597/598, ReferralManagement 96/121, firestoreService 462 + referralService 194 empty catches, referralCode `getDoc` import).
- **Step 8E smoke 73/73** (`C:\Users\daksh\AppData\Local\Temp\opencode\s8e\`): real bundled services in supabase mode + rules-enforcing fake Supabase (3 new child tables, 8 RPCs) + counting firebase stubs. Coverage: support child inserts (staff own-gym ✓ / member ✗ / cross-gym ✗ / super ✓ / FK), role-change + gym-subscription RPC authz, notification deletes (owner-only), referral status/delete/coupon-redeem, license history, subscription lifecycle + history packing, conversations (increment sentinel, offset pagination, parent-owner RLS), payment guards (writes throw, zero firebase calls), referralCode gating, attendance, devices (limit/status enum/23505 race/reset/validate), reports, updateGym dot-path merge, notifications insert RLS, **global zero-firebase-write assertion**.
- Regressions: s8c **101/101** ✓ (rebuilt against current source); s8d **96/100** — 4 failures (T02 warn-timing race, T24/T25/T32 realtime channel-adapter semantics) reproduced deterministically with untouched harness, in subscribe/one-shot code paths none of the 3 Step 8E source edits touch (verified by isolated re-probe of T24's exact scenario passing).
- DCE: supabase mode bundle contains zero firebase data-plane write calls at runtime (guards + counters assert zero calls across the suite).

## 7. Deployment & remaining risk

- Client-only deploy (`firebase deploy --only hosting`) — no functions/rules changes.
- `supabase db push` for `0004_rpc.sql` (migrations 0001–0003 already applied).
- Remaining: s8d realtime harness failures pre-date Step 8E (one-shot semantics vs 8D-era adapter expectations) — track separately if realtime is later re-enabled.
