# FIREBASE WRITE PATH AUDIT (Step 8E)

Full sweep of every Firebase write API (`addDoc`, `setDoc`, `updateDoc`,
`deleteDoc`, `writeBatch`, `runTransaction`, `arrayUnion`, `arrayRemove`,
`increment`) plus callable functions used as application-data writes.

Grep baseline: **160 occurrences across 21 source files** (excluding CSS).
Classification target: every occurrence ends as one of
MIGRATE_TO_SUPABASE / BACKEND_FUNCTION_REQUIRED / STORAGE_ONLY /
LEGACY_ROLLBACK_ONLY / DOCUMENTED_EXCEPTION.

## Classification

### A. MIGRATE_TO_SUPABASE — client write paths with no supabase branch today

| File:line | Op | Function | Target table / RLS |
|---|---|---|---|
| attendanceService.js:74 | addDoc | addAttendance | attendance insert — staff own gym (`gym_id = auth_gym_id()`); member_id/auth_uid FK-resolved |
| notificationService.js:147 | addDoc | addNotification | notifications insert — staff own gym or gym_id null |
| notificationService.js:157 | updateDoc | markNotifAsRead | notifications update — owner (`user_id = auth_firebase_uid()`) |
| notificationService.js:161 | updateDoc | markNotifAsUnread | notifications update — owner |
| notificationService.js:172 | updateDoc | markAllNotifsAsRead | select own unread → update each |
| notificationService.js:177 | deleteDoc | deleteNotification | **no delete policy → RPC** `delete_own_notification` |
| notificationService.js:187 | deleteDoc | deleteAllNotifications | **no delete policy → RPC** `delete_own_notifications` |
| subscriptionService.js:97 | runTransaction | updateGymSubscription | gyms.subscription jsonb merge — super-only update; **atomicity → RPC** `update_gym_subscription` |
| subscriptionService.js:130 | addDoc | addHistoryRecord | subscription_history insert — super only (RLS ok for super admin) |
| deviceService.js:140,158,177,181,188,195,206 | updateDoc/addDoc/deleteDoc/writeBatch | registerDevice / removeDevice / revokeDevice / suspendDevice / activateDevice / resetAllDevices | licensed_devices staff-own CRUD; unique(gym_id, device_id) dedup |
| deviceService.js:211,252,279 | getDocs | getDeviceCount / validateDeviceRegistration / getDevicesForGym | licensed_devices select staff-own |
| licenseHistoryService.js:66 | addDoc | addLicenseHistory | **no insert policy → RPC** `log_license_history` |
| reportService.js:72 | addDoc | addGeneratedReport | generated_reports insert staff-own |
| reportService.js:76 | deleteDoc | deleteGeneratedReport | generated_reports delete staff-own |
| referralService.js:173 | setDoc | updateReferralSettings | settings upsert (gym_id 'platform' + doc_id) — super-only RLS; audit_log skip (no insert policy) |
| referralService.js:207 | addDoc | createReferral | referrals insert — `referred_uid = auth_firebase_uid()` (member-own) |
| referralService.js:233 | updateDoc | updateReferral | **no update policy → RPC** `update_referral_status` |
| referralService.js:247 | deleteDoc | deleteReferral | **no delete policy → RPC** `delete_referral` |
| referralService.js:566 | updateDoc | redeemDiscountCoupon | **no update policy → RPC** `redeem_discount_coupon` |
| referralService.js:767 | runTransaction | processPendingReferral | single atomic insert (PK = referred_uid); notifications side-writes best-effort; audit skipped (no policy) |
| conversationService.js:169 | addDoc | createConversation | ai_conversations insert owner |
| conversationService.js:202 | updateDoc | updateConversation | ai_conversations update owner (guard blocks once deleted) |
| conversationService.js:326 | addDoc | addConversationMessage | ai_conversation_messages insert owner |
| conversationService.js:273,339 | getDocs | loadMoreConversations / fetchConversationMessages | one-shot selects (read parity — STEP 5) |
| AppContext.jsx:231,253,288,295,327,1557 | updateDoc/deleteDoc | approveGymOwner / rejectGymOwner / reactivateSubscription | profiles.role **guarded → RPC** `set_profile_role`; gyms subscription via `update_gym_subscription` RPC / updateGym |
| Settings.jsx:246 | updateDoc | saveProfile users-doc sync | profiles self update (name/photo_url allowed) |
| Support.jsx:710,720,732 | updateDoc+arrayUnion | reply / note / attachment | support_ticket_replies / _notes / _attachments inserts — staff own gym via ticket join |
| superadmin/ReferralManagement.jsx:179 | updateDoc | handleReject | referrals status → `update_referral_status` RPC |
| superadmin/GymSubscription.jsx | — | subscription lifecycle buttons | routes through subscriptionService (migrated) |

### B. BACKEND_FUNCTION_REQUIRED (out of scope — payment/auth backend, per task constraints)

- paymentService.initiatePayment / refreshPaymentStatus → `createPayment` /
  `verifyPayment` httpsCallables (server-side gateway ops; attempts/records
  written by Cloud Functions).
- GymOwners cascade delete → `deleteAuthUser` httpsCallable (auth account
  deletion).
- functions/index.js webhook/fulfillment writers (phonePeCallback,
  cashfreeWebhook, fulfillSubscriptionPayment, createPaymentRecord,
  notifyPaymentSuccess, issueReferralReward) — server-side application-data
  writes executed with Admin SDK; not browser code.

### C. STORAGE_ONLY (not migrated — task constraint)

- storageService.js uploadMemberPhoto / uploadGymLogo etc. — Firebase Storage.

### D. LEGACY_ROLLBACK_ONLY (inside `if (IS_FIREBASE_MODE)` / `if (isFirebaseMode)` branches)

- firestoreService.js — all ~60 write occurrences (addMember/addPayment/
  addTrainer/deleteMember cascades/updateXxx/deleteXxx/addGym/updateGym/
  deleteGym/subscriptions/plans/progress/diet/workout/settings/whatsapp/
  notifications side-write) — every exported function already has a supabase
  branch at its top (Step 8C); Firebase code is tree-shaken in supabase builds.
- authService.js — signUp writeBatch (319), approveUser (882-925), rejectUser
  (955-970), recoverUserProfile (801-863) — all behind `isFirebaseMode`.
- referralCode.js — isReferralCodeUnique / generateUniqueReferralCode /
  getReferrerByCode / backfillMissingReferralCodes — invoked only from
  firebase-mode callers (firestoreService.addMember firebase branch,
  AuthContext firebase-mode referral block).
- referralService.js — ensureSelfReferralCode / ensureOwnReferralCodeMapping /
  resolveReferralCode / hasPendingReferral — called only by the AuthContext
  firebase-mode self-heal block (`if (!SUPABASE_ACTIVE)`); getReferralById has
  no callers.
- AppContext.jsx — `doc/getDoc/updateDoc/deleteDoc/serverTimestamp` usage in
  firebase-mode approval paths (guarded per-site in Step 8E work).

### E. DOCUMENTED_EXCEPTION

- MemberModal.jsx:105 users-doc photoUrl write — part of the Firebase Storage
  upload flow (Storage not migrated; write accompanies uploadMemberPhoto).
- referralService.logReferralAudit + auditLog inserts — `audit_log` /
  `referral_audit_logs` have select-only RLS; audit rows are Firestore-only
  (Firebase mode) and skipped in supabase mode.
- processPendingReferral notification side-writes in supabase mode — member
  sessions cannot insert notifications (staff-only RLS); referral row itself
  is atomic (PK), notifications best-effort and documented.

## RPC additions required (0004_rpc.sql — concrete RLS blockers)

| RPC | Purpose | Auth guard |
|---|---|---|
| set_profile_role(p_uid, p_role) | approval flow — profiles.role guarded by trigger | is_super_admin(auth.uid()) |
| update_gym_subscription(p_gym_id, p_updates jsonb) | atomic jsonb merge (licenseKey provisioning, lifecycle) | is_super_admin(auth.uid()) |
| delete_own_notification(p_id) | notifications have no delete policy | user_id = auth_firebase_uid() |
| delete_own_notifications(p_user_id) | bulk delete | p_user_id = auth_firebase_uid() |
| update_referral_status(p_referred_uid, p_status, p_reason) | no referrals update policy | is_super_admin OR gym_admin-own-gym |
| delete_referral(p_referred_uid) | no referrals delete policy | is_super_admin(auth.uid()) |
| redeem_discount_coupon(p_coupon_id) | no discount_coupons update policy | user_id = auth_firebase_uid() |
| log_license_history(p_gym_id, p_device_id, p_action) | no license_history insert policy | is_staff(auth.uid()) and gym match |

All: `security definer` (final decision — same precedent as `auth_firebase_uid()`/`is_staff()`), explicit in-function role checks (no RLS dependence), `revoke anon; grant authenticated` (public RPCs unusable by the anon key), no service-role credentials. Rationale: every RPC here exists precisely because the corresponding table has NO RLS write policy — an `invoker` RPC would hit the same wall; the definer function is the sanctioned atomicity + authorization boundary.

## Transaction/atomicity decisions (STEP 4)

- subscriptionService licenseKey provisioning — was `runTransaction`; becomes
  single-statement RPC `update_gym_subscription` (no browser read-then-write).
- processPendingReferral — was `runTransaction`; becomes single atomic INSERT
  with deterministic PK (23505 = already-registered). No transaction emulation.
- deviceService resetAllDevices — was `writeBatch`; becomes single DELETE
  statement (where gym_id = X).
- Everything else is single-document-equivalent single-row writes.

## Callers checked

- subscriptionService lifecycle fns ← AppContext (activate/suspend/expire/
  renew/upgrade/downgrade/assignTrial/extend/changePlan) and
  superadmin/GymSubscription.jsx.
- fireNotif ← AppContext 20+ sites (actor session is staff — RLS-ok after
  migration).
- notificationService mark/delete ← AppContext + superadmin/Notifications.jsx.
- redeemDiscountCoupon ← MyRewards.jsx (member).
- updateReferralSettings ← superadmin ReferralManagement + ReferralSettingsSection.
- registerDevice/validateDeviceRegistration ← LicenseGuard (all roles), DeviceManagement pages.
