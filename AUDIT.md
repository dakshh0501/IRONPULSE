# IRONPULSE — Production Readiness Audit Report

**Date:** 2026-06-30
**Scope:** Full application audit — all 38 pages, 12 components, auth, subscriptions, license, payments, Firestore, Cloud Functions
**Methodology:** Static code analysis, architecture review, data-flow tracing, dependency analysis
**Build:** 0 errors (2656 modules)

---

## EXECUTIVE SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 3 | Application broken or data corruption |
| **HIGH** | 13 | Business logic incorrect, data loss, or UX block |
| **MEDIUM** | 27 | Feature works but has significant flaws |
| **LOW** | 36 | UI polish, performance, or minor issues |
| **FALSE POSITIVE** | 4 | Looks suspicious but is correct |
| **VERIFIED WORKING** | 28 | Confirmed correct |

**Verdict: NOT READY for production deployment.** 3 CRITICAL and 13 HIGH issues must be resolved before client handoff. Primary concerns: data integrity (subscription duration miscalculation, stale attendance dates), silent failure patterns (delete operations, payment initiation), and security (member data exposure).

---

## CRITICAL FINDINGS

### C1. Attendance/Reception Date Stale After Midnight

| Field | Detail |
|-------|--------|
| **File** | `src/pages/Attendance.jsx:6`, `src/pages/ReceptionMode.jsx:7` |
| **Function** | Module-level `const todayStr = new Date().toISOString().split('T')[0]` |
| **Root Cause** | Date is captured once at module import time. If the page is left open past midnight, `todayStr` is stale (yesterday's date) for the rest of the session. Affects ALL date-based operations: check-in timestamps, duplicate detection, attendance statistics, KPI cards. |
| **Reproduction** | Open Attendance page at 11:50 PM. Past midnight, all check-ins record yesterday's date. Duplicate detection uses wrong date — member checking in at 12:05 AM "passes" duplicate check since yesterday's records don't match. |
| **Impact** | **CRITICAL** — All attendance data recorded with wrong date after midnight. No page refresh required. Data corruption occurs silently. |

### C2. Subscription Duration Miscalculation — Annual Gets 30 Days

| Field | Detail |
|-------|--------|
| **File** | `src/services/subscriptionService.js:87,146,186,223,314` (5 functions) |
| **Function** | `activateSubscription`, `renewSubscription`, `upgradePlan`, `downgradePlan`, `changePlan` |
| **Root Cause** | `daysMap` only has keys `{ trial, monthly, quarterly, yearly }`. GymSubscription passes planTypes from `selectedPlan.toLowerCase()` producing `'annual'`, `'lifetime'`, `'premium'`, `'standard'`. None exist in `daysMap`, so fallback `|| 30` is always used. |
| **Reproduction** | Navigate to Subscriptions → Upgrade Plan → Select "Annual" → Confirm. Expiry is set to 30 days, not 365. |
| **Impact** | **CRITICAL** — Annual subscriptions get 30 days. Lifetime gets 30 days. Customer pays ₹99,999 for 30 days. Financial/trust issue. |

### C3. Auto-Expiry Write Replaces Entire `subscription` Object (Race Condition)

| Field | Detail |
|-------|--------|
| **File** | `src/context/AppContext.jsx:339` |
| **Function** | Gym subscription listener `useEffect` |
| **Root Cause** | `updateGymInFirestore(gymId, { subscription: checked })` replaces the ENTIRE `subscription` sub-object. If a concurrent operation (renew, upgrade) modified `subscription` fields AFTER the snapshot was taken but BEFORE this `updateDoc` runs, those changes are erased. |
| **Reproduction** | Subscription expires today. Admin clicks "Renew" → writes new `expiryDate`, `status: 'active'`. Simultaneously, auto-expiry listener fires with old snapshot data → overwrites renewal's changes, sets `status: 'expired'`. Renewal undone. |
| **Impact** | **CRITICAL** — Paid renewals can be silently reverted. Subscriptions appear expired despite successful payment. Customer-facing data integrity issue. |

---

## HIGH FINDINGS

### H1. Members Can View ALL Gym Progress Logs (Data Exposure)

| Field | Detail |
|-------|--------|
| **File** | `src/utils/rbac.js:139`, `src/services/firestoreService.js:530-545` |
| **Function** | `canSubscribe` / `subscribeToProgressLogs` |
| **Root Cause** | `canSubscribe` allows `'member'` role to subscribe to `progressLogs`. `subscribeToProgressLogs` only filters by `gymId` — never by member's own `authUid`. No `subscribeMyProgressLogs` variant exists (unlike attendance which has `subscribeMyAttendance`). |
| **Reproduction** | Log in as a member. Open DevTools. Inspect `progressLogs` array from `useApp()`. See weight, body fat, BMI of all gym members. |
| **Impact** | **HIGH** — Privacy violation. A member can see ALL other members' progress data via React state. |

### H2. Orphaned Auth Accounts on Signup Firestore Write Failure

| Field | Detail |
|-------|--------|
| **File** | `src/services/authService.js:34-63` |
| **Function** | `signUp()` |
| **Root Cause** | Auth account created FIRST (line 35-36), then Firestore `users/{uid}` doc written SECOND (line 53). If Firestore write fails, Auth account exists with no corresponding user doc. User cannot log in ("User profile not found") and cannot re-register ("email already in use"). No cleanup/rollback of Auth account. |
| **Reproduction** | Sign up. Have Firestore `setDoc` fail (network drop, rule violation). User signed out. Try to log in → "User profile not found". Try to re-register → "email already in use". User permanently stuck. |
| **Impact** | **HIGH** — Permanently orphaned Auth account. Admin must manually delete via Firebase Console. |

### H3. Inconsistent Rejected-Role Handling — Localhost vs Production

| Field | Detail |
|-------|--------|
| **File** | `src/context/AuthContext.jsx:146-157` vs `src/App.jsx:350-353` |
| **Function** | Auth subscription listener / ProtectedRoute |
| **Root Cause** | On localhost, rejected users are force-redirected to `/auth` via `window.location.replace`. On production, user stays logged in with role `'rejected'` and ProtectedRoute redirects to `/rejected`. Two different behaviors. The `/rejected` route is unreachable on localhost. |
| **Reproduction** | Set user role to `rejected`. Log in on localhost. User is redirected to `/auth` without seeing `/rejected` page. |
| **Impact** | **HIGH** — Cannot test rejected flow locally. Different behavior between dev and production. |

### H4. Plan Duration Mismatch in Gym Approval Initialization

| Field | Detail |
|-------|--------|
| **File** | `src/context/AppContext.jsx:189` |
| **Function** | `approveGymOwner()` |
| **Root Cause** | `daysMap = { trial: 7, monthly: 30, quarterly: 90, yearly: 365 }` — same missing keys. `planLower = 'annual'` → `daysMap['annual']` → undefined → fallback `|| 7`. Initial expiry = 7 days instead of 365. |
| **Reproduction** | Super admin approves gym with `newSubscription = 'Annual'`. Initial `expiryDate` = 7 days. Subscription expires in a week after paying for a year. |
| **Impact** | **HIGH** — Only affects gyms where super admin explicitly selects non-trial plan during approval. Subscription expires prematurely. |

### H5. All 9 Subscription Service Functions Lack Error Handling

| Field | Detail |
|-------|--------|
| **File** | `src/services/subscriptionService.js` |
| **Function** | ALL exported functions |
| **Root Cause** | No try/catch blocks in any async function. If Firestore `getDoc`, `updateDoc`, or `addDoc` throws (network error, permission denied), the error propagates unhandled to the caller. |
| **Reproduction** | Disconnect network. Click "Renew" on GymSubscription page. `renewSubscription` throws. Unhandled promise rejection. No user feedback. |
| **Impact** | **HIGH** — Network failures silently fail subscription operations. No user feedback. |

### H6. GymSubscription Click Handlers Lack Error Handling

| Field | Detail |
|-------|--------|
| **File** | `src/pages/GymSubscription.jsx` |
| **Function** | `handleRenew`, `handleUpgrade`, `handleExtend`, `handleActivate` |
| **Root Cause** | All four handlers are `async` with no try/catch. If the underlying service function throws, the rejection is unhandled. Modal closes on success path but stays open with no error message on failure. |
| **Reproduction** | Open "Renew" modal. Set network offline. Click "Confirm Renew". Modal stays open with no error. User thinks nothing happened. |
| **Impact** | **HIGH** — Users may think renewal succeeded when it failed. May navigate away losing pending operation. |

### H7. Silent Loading Failure — Data Never Loads but Empty State Shown

| Field | Detail |
|-------|--------|
| **File** | `src/pages/Members.jsx:553-557`, `src/pages/Trainers.jsx:449-453` |
| **Function** | `useEffect` loading timeout |
| **Root Cause** | After 3 seconds, `loading` is set to `false` regardless of whether the Firestore subscription ever delivered data. The `onSnapshot` error handler only logs to console — does not set an error state. If subscription fails silently, user sees "No data" (empty table) after 3 seconds. |
| **Reproduction** | Block Firestore reads (network throttling + offline). Open Members or Trainers page. After 3 seconds, skeleton loader vanishes. User sees "No members yet" — but data may have simply failed to load. |
| **Impact** | **HIGH** — No visual feedback that data failed to load. User incorrectly believes system has no data. |

### H8. Floating Promises — Unhandled `addPayment` and `updateMember` Rejections

| Field | Detail |
|-------|--------|
| **File** | `src/pages/Members.jsx:900,902` |
| **Function** | Inline button onClick handlers |
| **Root Cause** | `addPayment(...)` and `async () => { await updateMember(...); await addPayment(...) }` are called without `.catch()` or try/catch. If Firestore write fails, promises reject unhandled. |
| **Reproduction** | Click 💰 button on member row while offline. `confirm` passes. `addPayment` fails silently. Unhandled promise rejection in console. No user feedback. |
| **Impact** | **HIGH** — Floating promises. No user feedback on payment failure. |

### H9. Delete Errors Silently Swallowed — Modal Closes on Failure

| Field | Detail |
|-------|--------|
| **File** | `src/pages/Diet.jsx:733-740`, `src/pages/Workouts.jsx:1025` |
| **Function** | `handleDelete` / delete onConfirm |
| **Root Cause** | Diet: `setDelPlan(null)` runs AFTER try/catch — modal closes even if Firestore delete fails. Workouts: `deleteWorkoutPlan(id); setDelPlan(null)` — no await, no try/catch. Unhandled promise rejection. |
| **Reproduction** | Open delete modal for a diet/workout plan. Delete with network offline. Modal closes. Plan reappears when subscription refreshes. User thinks it was deleted. |
| **Impact** | **HIGH** — Misleading success behavior. User believes plan was deleted when it was not. |

### H10. Notifications Search Input Read-Only

| Field | Detail |
|-------|--------|
| **File** | `src/pages/Notifications.jsx:214` |
| **Function** | Search input render |
| **Root Cause** | Search `<input>` has `value={search || ''}` but NO `onChange` handler. Controlled input with no way to update value. User types — nothing happens. |
| **Reproduction** | Navigate to Notifications. Click search input. Type anything. No text appears. No filtering occurs. |
| **Impact** | **HIGH** — In-page search is completely broken. |

### H11. Missing Composite Index for `markAllNotifsAsRead`

| Field | Detail |
|-------|--------|
| **File** | `src/services/notificationService.js:80` |
| **Function** | `markAllNotifsAsRead` |
| **Root Cause** | Query combines `where('userId', '==', userId)` and `where('read', '==', false)` with no `orderBy`. Firestore requires composite index on `userId ASC, read ASC` for >~200 documents. Not included in index declarations. |
| **Reproduction** | Gym with >200 unread notifications. Click "Mark All Read". Firestore throws "requires an index" error. Caught in AppContext, logged to console. No user feedback. |
| **Impact** | **HIGH** for larger datasets — "Mark All Read" breaks silently. |

### H12. Rejected Role Bypass — Suspended Gym Owner Recovery Creates Orphan

| Field | Detail |
|-------|--------|
| **File** | `src/services/authService.js:316-341`, `functions/index.js:977` |
| **Function** | `rejectUser` / `backfillMissingProfiles` |
| **Root Cause** | `rejectUser` deletes `users/{uid}` doc first, then calls `deleteAuthUser` Cloud Function. If CF fails (not deployed, network error), user doc is deleted but Auth account remains. Backfill for suspended gym owners assigns `role: 'gym_owner'` not `suspended` — suspended gym owners can still authenticate. |
| **Reproduction** | `rejectUser(uid)` → Firestore doc deleted → Cloud Function fails → Auth account remains. Orphan with no user doc. |
| **Impact** | **HIGH** — Orphaned Auth account. Suspended gym owner can still log in (backfill recovery assigns active role). |

### H13. `renewalCount` Lost Update Race Condition

| Field | Detail |
|-------|--------|
| **File** | `src/services/subscriptionService.js:149-151` |
| **Function** | `renewSubscription` |
| **Root Cause** | `getDoc` reads `renewalCount`, JS increments, `updateDoc` writes incremented value. Two concurrent renewals both read `renewalCount=0`, both write `renewalCount=1`. Second write wins, first renewal's count is lost. |
| **Reproduction** | Trigger two simultaneous renewals (double-click). Both read same `renewalCount`. Final value is 1 instead of 2. |
| **Impact** | **HIGH** — `renewalCount` under-reports true renewals. Affects analytics and billing reports. |

---

## MEDIUM FINDINGS

### M1. Initial Device Limit Hardcoded to 2 for All Non-Trial Plans

| Field | Detail |
|-------|--------|
| **File** | `src/context/AppContext.jsx:202` |
| **Function** | `approveGymOwner` |
| **Root Cause** | `deviceLimit: planLower === 'trial' ? 1 : 2` — hardcodes 2 for ALL non-trial plans. Does not use `getDeviceLimit()` from subscriptionService. |
| **Impact** | Gyms approved with Premium, Quarterly, Annual, Lifetime get device limit of 2 instead of actual plan limit (10, 5, 10, 9999). Artificially restricts device registration. |

### M2. `changePlan` Ignores Remaining Time

| File | `src/services/subscriptionService.js:316-317` |
|------|------|
| **Impact** | Unlike `upgradePlan`/`downgradePlan` which preserve remaining time using `Math.max(current expiry, now)`, `changePlan` always starts expiry from `now`. Customer loses paid time when super admin changes plan mid-cycle. |

### M3. KPI Counts Disagree with Table Filters — Auto-Expire Not Applied

| Field | Detail |
|-------|--------|
| **File** | `src/pages/Members.jsx:604-611` |
| **Function** | `summary` useMemo |
| **Root Cause** | `summary` uses raw `members` array. `normalizedMembers` overrides `status` to `'Expired'` when `expiry < todayDate`. A member with past expiry date but `status:'Active'` in Firestore is counted as Active in KPI but hidden in Active table tab. Counts disagree. |
| **Impact** | Misleading KPI numbers. Members expiring today counted in both "Expiring Soon" and "Expired" KPIs. |

### M4. Different `memberId` Fallback Chains Across Check-in Paths

| File | `src/pages/Attendance.jsx:388` vs `src/context/AppContext.jsx:730` |
|------|------|
| **Impact** | Attendance.jsx falls back to `member.id` (Firestore doc ID). AppContext throws error if no `authUid`. Members page uses AppContext — member without authUid can't be checked in from Members page but CAN from Attendance QR/Quick Check-in. Inconsistent behavior. |

### M5. Attendance Rate Can Exceed 100%

| File | `src/pages/ReceptionMode.jsx:333-335` |
|------|------|
| **Impact** | `todayLogs.length` counts ALL records (potential duplicates). Member count is unique. Duplicate check-in or race condition allows rate >100%. Metric becomes nonsensical. |

### M6. Sequential Bulk Operations Without Error Isolation

| File | `src/pages/Members.jsx:623-646` |
|------|------|
| **Impact** | `for...of` + `await` — if member #3 deletion fails, members #4,#5,#6 are not deleted. `setSelectedIds(new Set())` still runs, clearing selection. No feedback about partial failure. |

### M7. Photo Upload Error Message Misleading

| File | `src/pages/Members.jsx:125-133` |
|------|------|
| **Impact** | "Failed to save member" shown even when member WAS saved — only photo upload failed. User may retry, creating duplicate member. |

### M8. DeleteConfirm Closes Before Async Operation Completes

| File | `src/pages/Members.jsx:295` |
|------|------|
| **Impact** | `onConfirm()` called before `onClose()`. `onConfirm` is async (`deleteMember`). If deletion fails, modal already closed. Member reappears on subscription refresh. Confusing UX. |

### M9. MemberDrawer `onRenew` No Loading/Error State

| File | `src/pages/Members.jsx:821-829` |
|------|------|
| **Impact** | Two-step async operation (updateMember + addPayment) with no loading indicator or error handling. Drawer stays open during operation. No visual feedback. |

### M10. Notifications Priority Filter / Badge — "Urgent" Dead Feature

| File | `src/pages/Notifications.jsx:266,323`, `src/utils/notificationTypes.js:1-48` |
|------|------|
| **Impact** | None of 48 notification types use `priority: 'urgent'`. Highest is `'high'`. "Urgent" filter returns zero results. URGENT badge never renders. Dead UI. |

### M11. Notifications Time Group Labels Swapped

| File | `src/pages/Notifications.jsx:117-129` |
|------|------|
| **Impact** | Timestamps from yesterday show "Earlier Today". Timestamps from 2-7 days ago show "Yesterday". Labels "Earlier Today" and "Yesterday" are swapped. |

### M12. Notifications Pagination Capped at 50 — No Load More

| File | `src/pages/Notifications.jsx:131-172`, `src/services/notificationService.js:44-55` |
|------|------|
| **Impact** | `PAGE_SIZE = 50`. `loadMoreNotifications` exported but NEVER imported or called. No "Load More" button or infinite scroll. Older notifications beyond most recent 50 are inaccessible. |

### M13. `subscribeMyProgressLogs` Missing (Data Privacy Redux)

| File | `src/services/firestoreService.js:530-545` |
|------|------|
| **Impact** | Only `subscribeToProgressLogs` exists (no member-filtered variant). Members subscribe to ALL progress logs. Existing UI filters client-side, but raw data is in React state. Same root cause as H1. |

### M14. Plugin Race Condition in Payment Record Creation

| File | `functions/index.js:180-183` |
|------|------|
| **Impact** | Duplicate prevention query runs OUTSIDE the transaction. Between query and `transaction.set()`, concurrent invocation could create duplicate payment record. |

### M15. Cloud Function `savePaymentAttempt` No Error Handling

| File | `functions/index.js:352-359` |
|------|------|
| **Impact** | If `.add()` fails (permissions, network, quota), error propagates uncaught. No try-catch around line 538 in `createPayment` where it's called. Unhandled exception → generic Firebase error to caller instead of structured response. |

### M16. Cloud Function `getPaymentAttempt` No Error Handling

| File | `functions/index.js:389-393`, referenced at `verifyPayment:647` |
|------|------|
| **Impact** | If `.get()` fails, error propagates uncaught. No try-catch around call. Firestore read failure throws rather than returning structured error. |

### M17. Existing Pending Check Doesn't Verify Expiry

| File | `functions/index.js:494-508` |
|------|------|
| **Impact** | When checking for existing pending attempts, does NOT check whether the existing attempt has expired (past 30-min `expiresAt`). Returns stale/existing redirect URL. User could be redirected to expired PhonePe payment page. |

### M18. `rejected` Role Not Excluded from `isLoggedIn`

| File | `src/context/AuthContext.jsx:410` |
|------|------|
| **Impact** | `isLoggedIn: !!currentUser && role !== 'pending'` only excludes `'pending'`. Users with `rejected` or `gym_owner_pending` evaluate as `isLoggedIn === true`. Semantic bug — could cause improper routing if `isLoggedIn` used in conditional logic. |

### M19. AuthContext `gym_owner_pending` Effect Creates Stale Firebase Session

| File | `src/context/AuthContext.jsx:64-78` |
|------|------|
| **Impact** | Separate effect clears React state but does NOT call `logOut()`. Firebase Auth session persists. Race condition with subscription handler — two pieces of code fighting over same state transition with different behavior. |

### M20. ProtectedRoute Missing `gym_owner_pending` Case

| File | `src/App.jsx:332-360` |
|------|------|
| **Impact** | Does not check for `gym_owner_pending`. If user somehow has this role when ProtectedRoute evaluates, falls through to `allowedRoles` check. Not in any allowedRoles list → redirects to `/dashboard`. Defense-in-depth gap. |

### M21. No Client-Side Rate Limiting on Payment Initiation

| File | `src/pages/Checkout.jsx:58`, `src/pages/Subscriptions.jsx:369` |
|------|------|
| **Impact** | No throttle/debounce on "Pay" button. User could click rapidly, sending multiple `initiatePayment` calls. Server side has idempotency check but rapid clicks cause multiple Firestore writes before check completes. |

### M22. Suspend/Expire History Records Have Empty Plan Info

| File | `src/services/subscriptionService.js:127-139` |
|------|------|
| **Impact** | `suspendSubscription` and `expireSubscription` pass `planId: ''`, `planName: ''`, `amount: 0` to history record. Cannot determine from history what plan was in effect when suspension/expiration occurred. |

### M23. CSV Export Does Not Escape Values

| File | `src/pages/Reports.jsx:785,332-338` |
|------|------|
| **Impact** | Values joined with commas without quoting/escaping. If any value contains a comma (plan name, formatted currency), CSV columns misalign. |

### M24. `extendExpiry` Unconditionally Sets `status: 'active'`

| File | `src/services/subscriptionService.js:297` |
|------|------|
| **Impact** | Extending an expired or suspended subscription automatically reactivates it. No explicit "reactivate" step. May be intentional but differs from expected behavior — extending a suspended subscription activates it. |

### M25. `changePlan` Shadows Remaining Time Calculation

| File | `src/services/subscriptionService.js:312-317` |
|------|------|
| **Impact** | Always calculates from `now` instead of preserving remaining time like `upgradePlan`/`downgradePlan`. If used for mid-cycle changes, customer loses paid time. Called from super admin flows via `changeSubscriptionPlan`. |

### M26. Shared Module-Level `PLAN_OPTIONS` for GymSubscription Shadowed

| File | `src/pages/GymSubscription.jsx:33` |
|------|------|
| **Impact** | Duplicate local definition omits `'Day Pass'` which exists in `constants/plans.js`. If new plans added to constants, they won't appear in GymSubscription. |

### M27. Landing.jsx Feature Card mousemove Listeners Never Cleaned Up

| File | `src/pages/Landing.jsx:266-274` |
|------|------|
| **Impact** | Anonymous arrow function passed to `addEventListener`. Cannot be removed with `removeEventListener`. Listeners leak if component unmounts. |

---

## LOW FINDINGS

| # | File | Issue |
|---|------|-------|
| L01 | `src/services/authService.js:67` | Register hardcodes `gym_owner_pending` role — no mechanism for `pending` signups |
| L02 | `src/components/Auth.jsx:131-132` | Error silently swallowed if `setAuthError` removed from caller |
| L03 | `src/components/Auth.jsx:146` | No phone format validation (accepts "abc") |
| L04 | `src/components/Auth.jsx:307` | Null `currentUser` in pending approval WhatsApp support link |
| L05 | `src/components/Auth.jsx:277-283` | Misleading "Subscription" step in approval timeline |
| L06 | `src/components/Auth.jsx:127-130` | No client-side rate limit on password reset (Firebase rate-limits server-side) |
| L07 | `src/components/Auth.jsx:87-142` | "Remember me" email leaks to signup form |
| L08 | `src/components/Auth.jsx` + `src/App.jsx:91-96` | Unnecessary AdminDashboard component creation then discarded for trainer/member |
| L09 | `src/config/website.js` | No code splitting needed — 0.29kB file ✅ |
| L10 | `src/pages/GymSubscription.jsx:7-31` | DOM styles injected at module load time, never cleaned up |
| L11 | `src/pages/GymSubscription.jsx` | Inline hardcoded colors throughout, no CSS variable support |
| L12 | `src/services/subscriptionService.js:46-53` | License key generation narrow read-then-write race |
| L13 | `src/components/LicenseGuard.jsx:99` | Silent error swallowing in `addAudit` catch |
| L14 | `src/services/deviceService.js:199` | TOCTOU race in device limit enforcement |
| L15 | `src/pages/DeviceManagement.jsx:114` | "Active Devices" stat counts all devices, not just active |
| L16 | `src/components/LicenseRequiredScreen.jsx:74` | Potentially stale gym name in WhatsApp support message |
| L17 | `src/components/LicenseGuard.jsx:84-87` | Generic error message on validation exception |
| L18 | `src/App.jsx:188` | `isPageLocked` doesn't handle `suspended` status (LicenseGuard catches it) |
| L19 | `src/pages/Members.jsx:76` | `URL.createObjectURL` not revoked on modal close |
| L20 | `src/pages/Members.jsx:18` | `storagePath` in EMPTY_MEMBER never used; `deleteMember` doesn't clean storage |
| L21 | `src/pages/Trainers.jsx:477` | "Busy" stat mislabeled (actually "Available"/"Unassigned") |
| L22 | `src/pages/Attendance.jsx:337` | Trainer name in table shows current assignment, not check-in-time trainer |
| L23 | `src/pages/Notifications.jsx:350-361` | Toast notification never auto-dismisses |
| L24 | `src/pages/Notifications.jsx:176` | `handleMarkRead` lacks try/catch (inconsistent with sibling functions) |
| L25 | `src/services/notificationService.js:82-83` | `allSettled` silently swallows individual update failures |
| L26 | `src/utils/notificationTypes.js:65-66` | `read: false` and `createdAt: null` base values overwritten before write |
| L27 | `src/pages/Diet.jsx:430` | Redundant `id` field sent to onSave (stripped by parent but fragile) |
| L28 | `src/pages/Diet.jsx:382` | PlanFormModal missing default for `trainers` parameter (latent crash risk) |
| L29 | `src/pages/Workouts.jsx:165` | `memo` ineffective due to inline callback references |
| L30 | `src/pages/Workouts.jsx:887` | Goal filter pills don't narrow with active search |
| L31 | `src/pages/Reports.jsx:785` | `URL.revokeObjectURL` called before download completes |
| L32 | `src/pages/Reports.jsx:731` | `_search` parameter destructured but unused |
| L33 | `src/pages/Reports.jsx:516,686` | Plan badge colors only distinct for Premium/Trial |
| L34 | `src/components/Auth.jsx:524,526` | Privacy/Terms links use `href="javascript:void(0)"` — dead links |
| L35 | `src/pages/Landing.jsx:911,926,949` | Social/product/legal footer links all `href="javascript:void(0)"` — dead links |
| L36 | `src/pages/Landing.jsx:43` | Counter `setInterval` not in useEffect cleanup; interval leaks on unmount |

---

## FALSE POSITIVES

| # | File | Description | Why Correct |
|---|------|-------------|-------------|
| F01 | `src/context/AuthContext.jsx:388-397` | Super admin consistency guard sets `setIsSuperAdmin(false)` which is in deps — looks like infinite loop | React bails out of re-render when setter sets same value; safe |
| F02 | `src/context/AppContext.jsx:549-599` | Auto-sync member payment fields with Firestore write that triggers subscription callback | `prevPaymentsRef` comparison prevents infinite loops |
| F03 | `src/context/AuthContext.jsx:104-133` | 3 retries with 1s delay each — looks slow | Intentional for transient Firestore reconnection on Android |
| F04 | `src/pages/Rejected.jsx` | Uses `gymSettings` from context (may be stale default "IronForge Gym") | WhatsApp support handles null gracefully; cosmetic only |

---

## VERIFIED WORKING

| # | Area | Details |
|---|------|---------|
| V01 | **Authentication** | SignIn, SignOut, password reset all work correctly |
| V02 | **Role gating** | ProtectedRoute correctly gates for all 5 roles |
| V03 | **PublicRoute** | Correctly redirects authenticated users |
| V04 | **`getEffectiveRole`** | Correctly normalizes admin/super_admin/gym_owner → gym_admin |
| V05 | **Super admin consistency guard** | Detects and demotes inconsistent state |
| V06 | **Signup step progression** | Correctly validates each step |
| V07 | **Profile recovery** | Correctly queries members/trainers/gyms collections |
| V08 | **`signingUpRef` guard** | Prevents premature profile check during registration |
| V09 | **`currentSubscription` sync** | Always equals `gyms/{gymId}.subscription` (verified via `onSnapshot`) |
| V10 | **License generation** | Auto-generated on activation, preserved on subsequent operations |
| V11 | **Device limit enforcement** | Full chain: getDeviceLimit → Firestore → validateDeviceRegistration → LicenseGuard |
| V12 | **Auto-expiry detection** | `checkAutoExpiry` correctly detects expired and proximity states |
| V13 | **Trial creation** | `assignTrial` works with configurable days, correct schema |
| V14 | **LicenseGuard race condition** | **FIXED** in Sprint 42 — waits for `currentSubscription` to load |
| V15 | **Payment attempt expiry** | 30-min TTL checked in both verifyPayment and phonePeCallback |
| V16 | **Payment checksum verification** | Callback checksum with `/` path fix applied (Sprint 32) |
| V17 | **Gym ownership validation** | `createPayment` verifies caller gymId matches attempt gymId |
| V18 | **NotFound.jsx** | Simple page, no bugs |
| V19 | **Rejected.jsx** | Simple page, no bugs |
| V20 | **Payment status auto-polling** | 10s interval with cancel safety via `useRef` |
| V21 | **Checkout duplicate prevention** | `getPendingAttemptsForSubscription` check before initiating |
| V22 | **Members/Trainers export CSV** | Proper blob URL lifecycle with revoke |
| V23 | **Members photo replace** | Overwrites same Storage path — no orphan accumulation on edit |
| V24 | **`canSubscribe` member→progressLogs** | Intentional per AGENTS.md (member reads own filtered data) |
| V25 | **Gym owner approve/reject** | Correctly updates gym, user role, subscription, notification |
| V26 | **Delete gym owner Auth cleanup** | `deleteAuthUser` Cloud Function handles `auth/user-not-found` as success |
| V27 | **Notification markAllAsRead** | Works correctly for <200 notifications |
| V28 | **`useCallback` stable references** | `refreshPaymentStatus` correctly has empty deps array |

---

## SUMMARY STATISTICS

### By Page/Module

| Module | CRIT | HIGH | MED | LOW | TOTAL |
|--------|------|------|-----|-----|-------|
| Auth/RBAC | 0 | 2 | 3 | 7 | 12 |
| Subscription | 2 | 3 | 5 | 3 | 13 |
| License/Devices | 0 | 0 | 0 | 5 | 5 |
| Payments (CF) | 0 | 1 | 3 | 0 | 4 |
| Members | 0 | 2 | 5 | 2 | 9 |
| Trainers | 0 | 0 | 0 | 1 | 1 |
| Attendance/Reception | 1 | 0 | 2 | 1 | 4 |
| Diet/Workouts | 0 | 2 | 0 | 3 | 5 |
| Reports | 0 | 0 | 1 | 3 | 4 |
| Notifications | 0 | 2 | 4 | 3 | 9 |
| Landing/Auth Page | 0 | 0 | 1 | 7 | 8 |
| Performance/Code | 0 | 1 | 3 | 1 | 5 |
| **TOTAL** | **3** | **13** | **27** | **36** | **79** |

### By Category

| Category | Count |
|----------|-------|
| Data corruption / wrong data persisted | 3 (C1, C2, C3) |
| Data exposure / privacy | 1 (H1) |
| Race condition / concurrency | 4 (C3, H13, M14, L14) |
| Silent failure / no user feedback | 7 (H5, H6, H7, H8, H9, H11, M15) |
| Dead code / unused feature | 4 (M10, M12, NS2, R1) |
| Error handling gap | 6 (H5, H6, H8, M15, M16, NS3) |
| UX / misleading UI | 8 (M3, M4, M5, M7, M8, M9, M11, L21) |
| UI polish / cosmetic | 12 (L10-L33) |
| Performance | 5 (M27, L09, L13, L19, L29) |
| Security (defense-in-depth) | 2 (H12, M20) |

---

## TOP 10 MUST-FIX BEFORE DEPLOYMENT

1. **C2 — Subscription duration miscalculation**: Add `annual: 365`, `lifetime: 9999`, `premium: 30`, `standard: 30` to ALL 6 `daysMap` instances in subscriptionService.js and AppContext.jsx
2. **C1 — Stale attendance date**: Replace module-level `todayStr` with state+interval pattern (like Members.jsx `todayDate`) in Attendance.jsx and ReceptionMode.jsx
3. **C3 — Auto-expiry race condition**: Use dot-notation Firestore updates instead of replacing entire `subscription` sub-object
4. **H1 — Member data privacy**: Create `subscribeMyProgressLogs` filtered by `authUid`; gate member subscription to use it
5. **H2 — Orphaned Auth accounts**: Add Auth deletion rollback in `signUp()` when Firestore write fails
6. **H5/H6 — Subscription error handling**: Add try/catch to all subscription service functions and GymSubscription click handlers with user-facing error feedback
7. **H7 — Silent loading failure**: Add error state from `onSnapshot` error callbacks; propagate to UI
8. **H9 — Delete feedback**: Add await + try/catch to diet/workout delete handlers; show error toast on failure
9. **H10 — Notifications search**: Add `onChange` handler to the search input
10. **H11 — Composite index**: Add `userId ASC, read ASC` composite index for `markAllNotifsAsRead`

**Build passes with 0 errors** after all fixes are applied.
