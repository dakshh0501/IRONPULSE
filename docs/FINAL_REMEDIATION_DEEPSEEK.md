# FINAL_REMEDIATION_DEEPSEEK — Implementation Report

**Status:** COMPLETE (build 0 errors / 0 warnings, eslint 0 NEW, all regression suites pass)
**Date:** 2026-08-19
**Scope:** Confirmed remediation findings A1–A6, B1–B6, C from the final security remediation brief. C1 (migration 0014) is explicitly out of scope and was NOT touched. Deployment NOT performed (per instructions — stop before deployment).

---

## 1. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/0015_rls_gym_scoping.sql` | **NEW** — A1–A4 RLS gym-scoping fixes (drop/recreate policies only; no schema/RPC/grant changes; 0014 untouched) |
| `src/services/notificationService.js` | B2 — new `broadcastNotification()` export (profiles target query, dedupe by `firebase_uid`, never-null `user_id`, chunked inserts CHUNK=100 with per-row fallback, returns `{sent, failed}`, never throws per-target) |
| `src/pages/superadmin/Notifications.jsx` | B2 — broadcast handler now calls `broadcastNotification` (was `addNotifToFirestore`); `addNotifToFirestore` removed from `useApp()` destructure; result toast (success/failure, auto-dismiss 4s). B3 — `announcements` tab filters `type === 'announcement'`. B4 — `expiry` tab filters `type === 'subscription'`. B5 — Unread button now calls `markNotifUnread(n.id)`; `markNotifUnread` added to destructure |
| `src/context/AppContext.jsx` | B1 — `getRuleDefs: () => whatsappService.getRuleDefs()` added to the `whatsapp` context object (between `getLastExecutions` and `runSweepsNow`) |
| `src/components/ai/ChatPanel.jsx` | B6 — line 504 `await persistAndShow(convId, 'user', text)` de-dented from 0 to 6 spaces (cosmetic alignment with block convention; no control-flow change) |
| `src/services/ai/providers/groqProvider.js` | C — `redactSensitive()` helper (masks emails, 10-digit IN phone numbers with optional +91, 12-digit sequences); applied to the complete-request-body `console.warn` (cap 8000 chars) and the complete-response-body `console.error` on non-200 (cap 4000 chars). Logging contract unchanged otherwise (never logs headers/API key) |

---

## 2. Security Tests

### A1 — profiles SELECT (cross-tenant staff read)
- **Migration 0015 body:** `id = auth.uid() OR is_super_admin(auth.uid()) OR (is_staff(auth.uid()) AND gym_id = auth_gym_id())`
- **Client audit:** every profiles SELECT read in the app is either a self-row read (`profiles.select(...).eq('firebase_uid', uid)`) or super-admin-gated (`getUserRole` used only in `approveGymOwner`/`rejectGymOwner`; `getPendingUsers` super_admin-gated at AppContext:895; `getGymOwnerPending` has no callers). Staff of gym A can no longer read profiles of gym B. **PASS**

### A2 — support_tickets member INSERT (cross-gym injection)
- **Migration 0015 body:** `created_by = auth_firebase_uid() AND gym_id = auth_gym_id()` — fail-closed for members without a gym (no such members exist in production; imported members carry gymId). **PASS**

### A3 — notifications staff INSERT (arbitrary user_id / NULL-gym escape)
- **Migration 0015 body:** super admin unrestricted (platform-wide); staff branch requires `gym_id = auth_gym_id()` AND the target profile (`p.firebase_uid = user_id`) to belong to the same gym. The `gym_id IS NULL` escape is removed for non-super staff. Super admin broadcast (B2) is now RLS-legal. **PASS**

### A4 — referral_audit_logs staff SELECT (cross-gym audit trail)
- **Migration 0015 body:** staff rows visible only when `metadata->>'gymId' = auth_gym_id()` OR a referrals join (`r.referred_uid = referral_id AND r.gym_id = auth_gym_id()`); `performed_by`/`target_uid` self branches and super admin kept. No client reads this collection today (dev-logging only at referralService.js:459-460) — pure policy hardening. **PASS**

### A5 — fulfill_payment ACL (service_role only)
- Verified in migrations 0006/0007/0009 (grant/revoke statements); no later migration (0008, 0010, 0012, 0013) re-grants PUBLIC/authenticated/anon. **PASS (static); live-DB confirmation pending operator**

### A6 — PhonePe webhook checksum verification
- **VERIFIED CORRECT — no change.** `phonePeCallbackChecksum` (`supabase/functions/_shared/helpers.ts:124-132`) = `sha256(decodedJson + "/pg/v1/status/" + merchantId + "/" + merchantTransactionId + saltKey)` — matches the official PhonePe webhook spec. `phonepe-callback/index.ts:58` compares the full X-VERIFY header (hash + salt index) via `timingSafeEqualStr`; fail-closed 200 no-op. **PASS**

### B1 — WhatsApp rule definitions in context
- `getRuleDefs` exposed on `useApp().whatsapp`; `WhatsAppReminders.jsx:97` consumes it (runtime source verified). **PASS**

### B2 — Superadmin broadcast (now RLS-legal under A3)
- `broadcastNotification` queries `profiles` for `role IN (super_admin, gym_admin, gym_owner, trainer, admin, member)`, dedupes by `firebase_uid`, skips null uids, chunked inserts with per-row fallback. UI wired with result feedback. Requires migration 0015 (A3) to be applied before deployment. **PASS (code + smoke); runtime E2E pending deployment**

### B3/B4 — notification tab filters
- `announcements` → `type === 'announcement'`; `expiry` → `type === 'subscription'` (canonical type map; there is no `'expiry'` notification type). **PASS**

### B5 — Unread action
- `markNotifUnread(n.id)` wired (AppContext implementation exists at ~line 1008). **PASS**

### B6 — ChatPanel cosmetic dedent
- Line 504 aligned to 6-space block convention; no logic change. **PASS**

### C — Groq logging PII redaction
- Request bodies (full conversation content) and non-200 response bodies are now PII-redacted (emails → `***@***`, phones → `******<last4>`, 12-digit sequences → `***`) and length-capped; the API key is never logged (header-only). **PASS**

---

## 3. Functional Tests

- `npm run build` — **0 errors, 0 warnings** (6.56s)
- ESLint on all 5 changed files — **0 NEW findings** (remaining 18 findings are all documented pre-existing baselines on untouched lines: ChatPanel showNotice-ref/refs-in-render/set-state-in-effect, AppContext 264/789, notificationService 162 unused `gymId`)
- Regression suites rebuilt from current source:
  - s8b auth: **56/56** (0 Firebase shim calls)
  - s8c data plane: **101/101**
  - s8d realtime: **31/31**
  - s8e write-path: **73/73**
  - s8f storage: **35/35**
  - s8g payments/edges: **77/77**
  - s8p recovery: **27/27**
  - s8x device service: **16/16**
- No Firebase SDK references introduced in any changed file (grep verified — only `firebase_uid` column/comment refs)
- No Cashfree/payment code touched

---

## 4. Build Result

`npm run build`: **0 errors, 0 warnings.** Entry `index-IJUD6cQw.js` (462.12 kB, gzip 125.57 kB); `groqProvider-W9rMnHvd.js` contains `redactSensitive`.

---

## 5. Remaining HIGH / MEDIUM Issues (not fixed)

| Issue | Severity | Reason |
|-------|----------|--------|
| C1 — profiles self-signup role/write guard | HIGH | Explicitly out of scope; migration 0014 exists, not deployed; must not be touched |
| `fireNotif` hardcodes `gymId: gymId || 'default'` — super-admin fireNotif fails FK (no 'default' gym row) | MEDIUM (pre-existing) | Documented exception; broadcast (B2) bypasses it by writing real gym ids |
| Migration 0015 not yet applied to the live DB | HIGH (deployment) | Deployment intentionally deferred; `supabase db push` required |
| A5 live-DB ACL confirmation pending | MEDIUM | Static verification only until operator checks `pg_proc`/grants |
| `getGymOwnerPending` has no callers | LOW | Dead export; safe to leave |

---

## 6. Manual Test Items (post-deployment)

1. Super admin → Notifications → Broadcast → confirm all target roles receive it (rows carry their own gym_id) and the result toast shows sent/failed counts.
2. Super admin broadcast reaches recipients across multiple gyms (A3 super branch).
3. Gym admin staff notification to own-gym member succeeds; staff cannot target a member of another gym (A3 staff branch).
4. Member creates a support ticket — allowed for own gym only; cross-gym ticket rejected (A2).
5. Gym admin opens referral audit log — sees own-gym rows only (A4).
6. WhatsApp Reminders page still renders rule definitions (B1) and toggles work.
7. Notifications page tabs: Announcements shows only `type='announcement'`; Expiry shows only `type='subscription'` (B3/B4); Unread marks a read notification unread (B5).
8. Pulse AI chat with a real Groq call — console shows redacted request/response logs; no email/phone values visible (C).