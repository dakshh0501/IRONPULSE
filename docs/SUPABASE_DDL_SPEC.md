# IRONPULSE — Supabase DDL Specification (Final Blueprint)

> **STATUS: SPECIFICATION ONLY — DO NOT EXECUTE.**
> This document is the final DDL blueprint produced by Step 3A (schema blockers resolution). No Supabase project, table, migration, or SQL statement has been created or executed. Execution happens in a later step (Step 2 per `SUPABASE_MIGRATION_SCHEMA.md` §14) after review.
> Source of truth for decisions: `docs/SUPABASE_MIGRATION_SCHEMA.md` §15 "Final Identity and Tenancy Model".

---

## 1. Conventions

- **Naming**: snake_case tables/columns; singular table names (Firestore collection → table map in `SUPABASE_MIGRATION_SCHEMA.md` §4).
- **PKs**: `id uuid primary key default gen_random_uuid()` for all tables except the preserved-key tables listed in §4.5.
- **Preserved keys** (no rewrite): `gyms.id text PK`, `referral_codes.code text PK`, `referrals.referred_uid text PK`, `settings (gym_id, doc_id)` PK, plus `members.legacy_id`/`trainers.legacy_id` UNIQUE text columns.
- **Identity FKs**: user-identity columns are TEXT storing the Firebase UID, FK → `profiles(firebase_uid)`. Never FK to `auth.users` directly.
- **Timestamps**: `created_at timestamptz not null default now()` on every table; `updated_at timestamptz not null default now()` on mutable tables (trigger `set_updated_at()`).
- **Dates**: calendar dates as `date`; moments as `timestamptz`.
- **Money**: `numeric(12,2)` (paise-safe: store rupees with 2 decimals; PhonePe `finalAmount` paise values are converted at the Edge Function boundary — existing `Number((amount/100).toFixed(2))` behavior preserved).
- **Soft delete**: only `ai_conversations.deleted boolean` (per source behavior); all other deletes are hard deletes.
- **Audit fields**: `created_by text` (Firebase UID, FK `profiles(firebase_uid)`) on admin-created rows; `changed_by`/`performed_by`/`actor_uid`/`target_uid` on audit tables.
- **RLS**: helper functions §7; every table gets a policy set; super_admin bypass everywhere via `is_super_admin(auth.uid())`.
- **Realtime**: `realtime requirement` per table = whether `postgres_changes` subscription is needed (mirrors `canSubscribe` gate + AppContext listeners). supabase-js channel with initial `select` + upsert through the adapter.

---

## 2. Resolved Design Decisions (from Schema §15)

| Blocker | Decision |
|---|---|
| UID strategy | Firebase UIDs preserved byte-for-byte as TEXT columns; `profiles.firebase_uid` UNIQUE bridge to `auth.users.id`. No UUID rewrite, no conversion, no extra mapping table. |
| Canonical member identity | `members.id uuid PK` (FK target for all member-scoped rows) + `members.legacy_id text UNIQUE` (old doc id) + `members.auth_uid text UNIQUE` (login link, RLS key). |
| Role model | ENUM `user_role` (7 values), single role per user (verified); no role junction table. |
| Tenancy | `gyms.id text PK` preserved; every gym-scoped row `gym_id text NOT NULL FK gyms.id`; RLS via `auth_gym_id()`; super_admin bypass. |
| Settings | One `settings(gym_id, doc_id, data jsonb)` table; `gym_id='platform'` sentinel for global docs; `gyms.subscription`/`gyms.documents` stay JSONB. |
| JSONB vs child tables | Nested maps (meals/exercises/versions/stats/audience/schedule/raw responses) = JSONB; array subcollections that need independent querying/RLS = child tables (§5). |

---

## 3. Enums (19)

```sql
-- 1. user_role
create type user_role as enum ('super_admin','gym_admin','trainer','member','pending','gym_owner_pending','rejected');
-- 2. approval_status
create type approval_status as enum ('pending','approved','rejected','suspended');
-- 3. subscription_status
create type subscription_status as enum ('trial','active','expired','suspended','cancelled');
-- 4. subscription_payment_status
create type subscription_payment_status as enum ('pending','paid');
-- 5. invoice_status            (payments.status)
create type invoice_status as enum ('Paid','Partial','Pending','Overdue','Refunded');
-- 6. attempt_status            (paymentAttempts.status)
create type attempt_status as enum ('pending','success','failed','cancelled');
-- 7. membership_plan           (canonical plan vocabulary from PLAN_AMOUNTS)
create type membership_plan as enum ('Trial','Standard','Premium','Quarterly','Annual','Lifetime','Day Pass');
-- 8. attendance_method
create type attendance_method as enum ('Auto','Manual','reception','QR');
-- 9. referral_status
create type referral_status as enum ('Pending','Qualified','Rewarded');
-- 10. reward_status
create type reward_status as enum ('pending','available','used');
-- 11. coupon_status
create type coupon_status as enum ('available','active','used');
-- 12. ticket_status
create type ticket_status as enum ('Open','In Progress','Closed','Resolved');
-- 13. feature_status
create type feature_status as enum ('Under Review','Planned','Approved','Declined');
-- 14. contact_status
create type contact_status as enum ('New','Read');
-- 15. whatsapp_log_status
create type whatsapp_log_status as enum ('Queued','Sent','Failed','Retrying');
-- 16. campaign_status
create type campaign_status as enum ('Draft','Scheduled','Running','Completed','Cancelled');
-- 17. device_status
create type device_status as enum ('active','revoked','blocked');
-- 18. notification_priority
create type notification_priority as enum ('normal','high','low');
-- 19. report_format
create type report_format as enum ('CSV','TSV','PDF','Print');
```

---

## 4. Tables (35)

> Per-table template: **Purpose · PK · FKs · Columns (type, nullable, default) · UNIQUE · CHECK · Indexes · RLS · Realtime · Legacy Firestore IDs**.

### 4.1 `profiles` — user identity bridge (was `users`)

- **Purpose**: business extension of GoTrue `auth.users`; sole bridge between `auth.users.id` (uuid) and the legacy Firebase UID; carries role/tenancy/referral fields.
- **PK**: `id uuid` = `auth.users.id`.
- **FKs**: `id → auth.users(id)`.
- **Columns**:
  - `id uuid primary key`
  - `firebase_uid text not null` — legacy Firebase Auth UID (was `users/{uid}` doc ID + `users.uid` field)
  - `email text`, `phone text`, `name text`, `photo_url text`
  - `role user_role not null default 'pending'`
  - `is_super_admin boolean not null default false`
  - `gym_id text` → `gyms.id` (null for super_admin)
  - `referral_code text` (null/'' until generated; one-time set, immutable after — mirrors rule 118-131)
  - `referred_by text` (code string from signup, immutable)
  - `account_disabled boolean not null default false`, `disabled_reason text`, `disabled_at timestamptz`
  - `referral_code_generated_at timestamptz`
  - `created_at`, `updated_at`
- **UNIQUE**: `firebase_uid`, `referral_code` (partial: `where referral_code is not null and referral_code <> ''`), `email` (partial non-null).
- **CHECK**: `referral_code ~ '^IP-[A-Z0-9]{6}$'` when set.
- **Indexes**: `(gym_id)`; `(role)`.
- **RLS**: read = self (`id = auth.uid()`) OR `is_staff(auth.uid())`; update = self (referral_code only while null/''; role/gym_id/disabled not user-writable — trigger-enforced); insert = self (signup); delete = none (disabled flags only).
- **Realtime**: no direct listener (users read one-shot in AuthContext).
- **Legacy Firestore IDs**: `firebase_uid` (= `users/{uid}` doc id).

### 4.2 `gyms` — gym registry (was `gyms`)

- **Purpose**: platform registry; tenancy root; holds subscription + approval documents as JSONB.
- **PK**: `id text` — **preserved Firestore doc ID** (`'default'`, auto IDs). No rewrite of any `gymId` reference.
- **FKs**: `owner_uid text → profiles(firebase_uid)`.
- **Columns**: `id text pk`, `gym_name text`, `owner_name text`, `email text`, `phone text`, `owner_uid text`, `status text` (trial/active/expired/suspended), `approval_status approval_status default 'pending'`, `approval_reviewed_at timestamptz`, `approved_at timestamptz`, `rejected_reason text`, `documents jsonb not null default '{}'` (approval docs map — `status`/`reviewedAt`/file metadata; schema unverified, see §10 blocker), `subscription jsonb not null default '{}'` (30+ fields: plan/planType/amount/status/paymentStatus/paymentMethod/transactionId/paidAt/expiryDate/licenseKey/licenseStatus/startedAt/cancelledAt/pendingPaymentType/updatedAt… dot-path writes → `jsonb_set`), `created_at`, `updated_at`.
- **UNIQUE**: none (doc ID is PK).
- **Indexes**: `(owner_uid)`.
- **RLS**: read = super_admin OR staff-of-own-gym (`gym_id = auth_gym_id()`); write = super_admin only (ownerUid set at signup via insert policy for `owner_uid = auth_firebase_uid()` when approval pending — mirrors 79F flow).
- **Realtime**: yes — super_admin gym list listener (AppContext `gyms` subscription).
- **Legacy Firestore IDs**: `id` = doc ID; `owner_uid` = Firebase UID.

### 4.3 `subscriptions` — gym platform subscriptions (was `subscriptions`)

- **Purpose**: gym subscription records; mirror of `gyms.subscription` with full history surface.
- **PK**: `id uuid`.
- **FKs**: `gym_id text → gyms.id`, `created_by text → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `plan text`, `plan_name text`, `plan_type text` (trial/monthly/… mixed vocabulary — canonicalize at import, keep raw in `plan_type_raw` if needed), `amount numeric(12,2)`, `currency text default 'INR'`, `status subscription_status`, `payment_status subscription_payment_status`, `payment_method text` (PhonePe/Cashfree/Manual), `transaction_id text`, `paid_at timestamptz`, `expiry_date date`, `started_at timestamptz`, `cancelled_at timestamptz`, `license_key text`, `pending_payment_type text`, `created_by text`, `created_at`, `updated_at`.
- **UNIQUE**: `license_key` (partial non-null).
- **Indexes**: `(gym_id)`, `(status)`, `(expiry_date)`.
- **RLS**: super_admin read/write; gym_admin read own gym.
- **Realtime**: yes (AppContext `subscriptions` gate = super_admin only).
- **Legacy Firestore IDs**: mirror rows imported with `gym_id` = old doc id (some rows had doc ID = gymId — mapped into `gym_id` column, dedup to latest).

### 4.4 `subscription_history` — subscription audit trail (was `subscriptionHistory`)

- **Purpose**: append-only history of subscription lifecycle actions.
- **PK**: `id uuid`.
- **FKs**: `gym_id → gyms.id`, `subscription_id → subscriptions.id`, `actor_uid → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `subscription_id uuid`, `action text not null`, `actor_uid text`, `changes jsonb default '{}'`, `created_at`.
- **RLS**: super_admin read; gym_admin read own gym. Insert super_admin (fulfillment path).
- **Realtime**: no.
- **Legacy IDs**: `actor_uid` = Firebase UID; `subscription_id` = old doc id (mapped to uuid).

### 4.5 `payment_attempts` — PhonePe/Cashfree attempts (was `paymentAttempts`)

- **Purpose**: gateway payment lifecycle records (30-min expiry, webhook correlation).
- **PK**: `id uuid`.
- **FKs**: `gym_id → gyms.id`, `auth_uid → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `payment_id text not null` (`IP-{ts36}-{hex4}` — dedup key used by functions), `gym_id text not null`, `subscription_id text` (gym subscription id), `type text` (new/renewal/upgrade), `plan text`, `original_amount numeric(12,2)`, `discount_amount numeric(12,2)`, `final_amount numeric(12,2)`, `currency text default 'INR'`, `name text`, `email text`, `phone text`, `redirect_url text`, `status attempt_status default 'pending'`, `payment_method text`, `payment_gateway text` (PhonePe/Cashfree), `transaction_id text`, `phonepe_transaction_id text`, `cashfree_order_id text`, `payment_session_id text`, `order_status text`, `auth_uid text`, `expires_at timestamptz` (30 min), `invoice_no text`, `error_message text`, `raw_response jsonb`, `created_at`, `updated_at`.
- **UNIQUE**: `payment_id`.
- **Indexes**: `(gym_id, status)`, `(subscription_id, status)` (pending-dup detection), `(cashfree_order_id)`, `(created_at desc)`.
- **RLS**: super_admin/gym_admin read + create own gym; update super_admin (fulfillment). (Mirrors existing rules.)
- **Realtime**: yes (gym_admin gate — Subscriptions/Checkout/PaymentStatus).
- **Legacy IDs**: `auth_uid` = Firebase UID.

### 4.6 `members` — gym members (was `members`)

- **Purpose**: canonical member registry. **FK target for all member-scoped rows.**
- **PK**: `id uuid`.
- **FKs**: `gym_id → gyms.id`, `auth_uid → profiles(firebase_uid)`, `trainer_id → trainers.id`, `trainer_auth_uid → trainers(auth_uid)`.
- **Columns**: `id uuid pk`, `legacy_id text not null`, `auth_uid text`, `gym_id text not null`, `name text not null`, `email text`, `phone text`, `contact text`, `age int`, `weight numeric(6,1)`, `height numeric(6,1)`, `gender text`, `plan text`, `plan_price numeric(12,2)`, `amount_paid numeric(12,2) default 0`, `balance_due numeric(12,2) default 0`, `payment_status invoice_status default 'Paid'`, `status text` (Active/Inactive/…), `checkins int default 0`, `trainer_id uuid`, `trainer_auth_uid text`, `avatar text`, `color text`, `photo_url text`, `storage_path text` (profile.webp), `expiry date`, `notes text`, `join_date date`, `referred_by text`, `created_by text`, `created_at`, `updated_at`.
- **UNIQUE**: `legacy_id`; `auth_uid` (partial non-null).
- **Indexes**: `(gym_id)`, `(trainer_auth_uid)` (trainer-scoped listener), `(auth_uid)`, `(status)`, `(expiry)`.
- **RLS**: staff read/write own gym; trainer read own `trainer_auth_uid`; member read own via `auth_uid = auth_firebase_uid()`.
- **Realtime**: yes (staff + trainer-scoped listeners).
- **Legacy Firestore IDs**: `legacy_id` = old doc ID; `auth_uid` = Firebase UID.

### 4.7 `trainers` — gym trainers (was `trainers`)

- **Purpose**: trainer registry.
- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `auth_uid → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `legacy_id text not null`, `auth_uid text`, `gym_id text not null`, `name text not null`, `email text`, `phone text`, `specialty text`, `rating numeric(3,1)`, `clients int default 0`, `bio text`, `experience text`, `avatar text`, `color text`, `created_by text`, `created_at`, `updated_at`.
- **UNIQUE**: `legacy_id`; `auth_uid` (partial non-null).
- **Indexes**: `(gym_id)`, `(auth_uid)`.
- **RLS**: staff own gym; trainer read self.
- **Realtime**: yes (staff gate).
- **Legacy IDs**: `legacy_id` = doc ID; `auth_uid` = Firebase UID.

### 4.8 `plans` — membership plans (was `plans`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `name text not null`, `price numeric(12,2)`, `duration int`, `duration_days int`, `description text`, `active boolean default true`, `sort_order int default 0`, `created_at`, `updated_at`.
- **RLS**: staff read/write own gym; member read own gym (plan names/price display).
- **Realtime**: yes (staff/trainer gate).
- **Legacy IDs**: none (auto doc ids dropped — no external refs beyond name-based plan lookups).

### 4.9 `plan_templates` — built-in plan templates (was `planTemplates`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id` (null = global templates).
- **Columns**: `id uuid pk`, `gym_id text`, `type text` (diet/workout), `name text`, `plan jsonb not null`, `created_at`.
- **RLS**: staff read own gym; super_admin read/write; member read own gym.
- **Realtime**: no.
- **Legacy IDs**: none.

### 4.10 `diet_plans` (was `dietPlans`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `member_id → members.id`, `auth_uid → members(auth_uid)`, `assigned_trainer_auth_uid → trainers(auth_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `name text not null`, `goal text`, `calories int`, `protein int`, `carbs int`, `fat int`, `hydration text`, `meals jsonb not null default '[]'` (per-meal food arrays), `member_id uuid`, `auth_uid text` (member login uid; RLS key), `assigned_member text`, `assigned_trainer text`, `assigned_trainer_auth_uid text`, `owner_type text`, `owner_id text`, `versions jsonb default '[]'`, `created_by text`, `created_at`, `updated_at`.
- **Indexes**: `(gym_id)`, `(member_id)`, `(auth_uid)` (member-scoped), `(assigned_trainer_auth_uid)` (trainer-scoped).
- **RLS**: staff own gym CRUD; trainer own `assigned_trainer_auth_uid`; member read own `auth_uid`.
- **Realtime**: yes.
- **Legacy IDs**: `member_id` rewritten doc-id→uuid at import; `auth_uid` = Firebase UID.

### 4.11 `workout_plans` (was `workoutPlans`)

- Same shape as 4.10 with: `level text`, `days int`, `duration text`, `split text`, `exercises jsonb not null default '[]'`, `trainer_auth_uid text → trainers(auth_uid)`, `member text`, `assigned_trainer text`.
- **PK/RLS/Realtime**: identical to 4.10.

### 4.12 `progress_logs` (was `progressLogs`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `member_id → members.id`, `auth_uid → profiles(firebase_uid)`, `trainer_id → trainers.id`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `member_id uuid`, `member_name text`, `auth_uid text`, `trainer_id uuid`, `trainer_name text`, `weight numeric(6,1)`, `body_fat numeric(4,1)`, `bmi numeric(4,1)`, `muscle numeric(6,1)`, `bench numeric(6,1)`, `squat numeric(6,1)`, `deadlift numeric(6,1)`, `notes text`, `log_date date default current_date`, `created_at`, `updated_at`.
- **Indexes**: `(gym_id, log_date desc)`, `(member_id)`, `(auth_uid)`.
- **RLS**: staff own gym; member own `auth_uid`.
- **Realtime**: yes.
- **Legacy IDs**: `member_id` rewritten to uuid; `auth_uid` = Firebase UID.

### 4.13 `payments` — invoices (was `payments`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `member_id → members.id`, `auth_uid → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `payment_id text not null` (`IP-…` from gateway; dedup), `invoice_no text` (`INV-YYYYMMDD-XXXX`), `gym_id text not null`, `member_id uuid`, `auth_uid text`, `member_name text`, `amount numeric(12,2) not null`, `paid numeric(12,2) not null default 0`, `status invoice_status default 'Pending'`, `plan text`, `method text`, `date date`, `due date`, `transaction_id text`, `payment_gateway text`, `created_by text`, `created_at`, `updated_at`.
- **UNIQUE**: `payment_id`, `invoice_no`.
- **Indexes**: `(gym_id, date desc)`, `(member_id)`, `(status)`.
- **RLS**: staff own gym; member own via `auth_uid = auth_firebase_uid()` (covers legacy rows whose `memberId` was the auth uid).
- **Realtime**: yes.
- **Legacy IDs**: `member_id` rewritten (doc id or auth uid → members.id); `auth_uid` = Firebase UID.

### 4.14 `attendance` (was `attendance`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `member_id → members.id`, `auth_uid → members(auth_uid)`, `trainer_id → trainers.id`, `trainer_auth_uid → trainers(auth_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `member_id uuid`, `auth_uid text` (the pre-migration `memberId` value = auth UID; preserved + FK for RLS self-read), `member_name text`, `avatar text`, `color text`, `plan text`, `trainer_id uuid`, `trainer_auth_uid text`, `trainer_name text`, `date date not null`, `time time not null`, `method attendance_method not null default 'Manual'`, `duration int not null default 90`, `created_at`.
- **Indexes**: `(gym_id, date desc, time desc)`, `(member_id, date)`, `(auth_uid, date)`, `(trainer_auth_uid, date)`.
- **RLS**: staff own gym; member own `auth_uid`; trainer own `trainer_auth_uid`.
- **Realtime**: yes (every authenticated role).
- **Legacy IDs**: `member_id` rewritten to uuid; `auth_uid` = Firebase UID (backfilled from member_id when it was an auth uid, else from members lookup); rows with unresolvable member_id keep `member_id null` + `auth_uid null` (anonymous historical rows readable by gym staff only).

### 4.15 `notifications` (was `notifications`)

- **PK**: `id uuid`. **FKs**: `user_id → profiles(firebase_uid)`, `gym_id → gyms.id` (nullable — platform notifications).
- **Columns**: `id uuid pk`, `user_id text not null`, `gym_id text`, `role text`, `title text`, `message text`, `type text`, `subtype text`, `priority notification_priority default 'normal'`, `icon text`, `action_url text`, `related_document_id text`, `page text`, `tab text`, `contact_id text`, `target_role text`, `read boolean default false`, `created_at`.
- **Indexes**: `(user_id, created_at desc)`, `(gym_id, created_at desc)`.
- **RLS**: owner (`user_id = auth_firebase_uid()`) read/update; staff insert into own gym; super_admin platform-wide.
- **Realtime**: yes (per-role gate).
- **Legacy IDs**: `user_id`/`created_by` = Firebase UIDs; `related_document_id` = polymorphic doc id (no FK).

### 4.16 `support_tickets` (was `supportTickets`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `created_by → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `name text`, `email text`, `category text` (Bug/Feature/Feedback/Support), `subject text`, `message text`, `status ticket_status default 'Open'`, `priority text`, `created_by text`, `created_at`, `updated_at`.
- **RLS**: staff own gym; super_admin cross-gym.
- **Realtime**: yes (admin gate).

### 4.17 `support_ticket_replies` — child table (was subcollection `replies`)

- **PK**: `id uuid`. **FK**: `ticket_id → support_tickets.id on delete cascade`.
- **Columns**: `id uuid pk`, `ticket_id uuid not null`, `author_role text`, `author_name text`, `author_uid text`, `message text`, `created_at`.
- **RLS**: same as parent (inherits via ticket join).
- **Realtime**: no (embedded in ticket detail read).

### 4.18 `support_ticket_notes` — child table (was subcollection `notes`)

- `id uuid pk`, `ticket_id uuid → support_tickets.id on delete cascade`, `author_role text`, `author_name text`, `note text`, `created_at`. RLS: staff only.

### 4.19 `support_ticket_attachments` — child table (was subcollection `attachments`)

- `id uuid pk`, `ticket_id uuid → support_tickets.id on delete cascade`, `name text`, `url text`, `size int`, `type text`, `created_at`. RLS: staff + author.

### 4.20 `feature_requests` (was `featureRequests`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `created_by → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `title text`, `description text`, `category text`, `status feature_status default 'Under Review'`, `votes int default 0`, `created_by text`, `created_at`, `updated_at`.
- **RLS**: staff own gym; member create + read own gym.

### 4.21 `contact_messages` (was `contactMessages`)

- **PK**: `id uuid`. No FKs (anonymous).
- **Columns**: `id uuid pk`, `name text`, `email text`, `message text`, `status contact_status default 'New'`, `created_at`.
- **RLS**: INSERT for anon; read/update super_admin.
- **Realtime**: no (one-shot fetch).

### 4.22 `settings` — gym + global settings (was `settings` composite docs)

- **PK**: `(gym_id, doc_id)`. **FK**: `gym_id → gyms.id` (enforced by CHECK — see below; sentinel `'platform'` is not a gym).
- **Columns**: `gym_id text not null`, `doc_id text not null`, `data jsonb not null default '{}'`, `updated_at`.
- **CHECK**: `gym_id = 'platform' or exists (select 1 from gyms g where g.id = gym_id)`.
- **Doc keys**: gym-scoped `gym`/`theme`/`notifications`/`billing`/`whatsapp` (per-gym); global `billing`/`referralSettings`/`platform` with `gym_id='platform'`. `getGlobalBilling()` = `doc_id='billing' and gym_id='platform'`.
- **RLS**: staff read/write own gym rows; member read `whatsapp`? (no — staff only per gate); super_admin global rows.
- **Realtime**: yes (staff gate — AppContext gym/theme/notifications listeners).
- **Legacy IDs**: `${gymId}:${docId}` composite split into two columns.

### 4.23 `whatsapp_logs` (was `whatsappLogs`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `member_id → members.id`, `campaign_id → whatsapp_campaigns.id`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `member_id uuid`, `phone text` (masked in UI; full value stored), `template text`, `provider text`, `status whatsapp_log_status default 'Queued'`, `attempts int default 0`, `error text`, `entry_id text`, `campaign_id uuid`, `test boolean default false`, `sent_at timestamptz`, `created_at`.
- **Indexes**: `(gym_id, created_at desc)` (listener limit 300), `(campaign_id)`.
- **RLS**: staff own gym read; create via engine (staff-context writes); member never.
- **Realtime**: yes (single listener, admin pages only).
- **Legacy IDs**: `member_id` rewritten to uuid; `entry_id` = engine queue id (no FK).

### 4.24 `whatsapp_campaigns` (was `whatsappCampaigns`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `created_by → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `name text`, `body text`, `audience jsonb default '{}'` (type + params), `schedule jsonb default '{}'` (mode/startAt/weekdays/dayOfMonth/cron), `status campaign_status default 'Draft'`, `stats jsonb default '{"sent":0,"failed":0,"pending":0,"cancelled":0,"total":0}'` (increment via `jsonb_set`), `next_run_at timestamptz`, `created_by text`, `created_at`, `updated_at`.
- **Indexes**: `(gym_id, status)`, `(gym_id, created_at desc)`.
- **RLS**: super_admin/gym_admin only (create/read/update/delete in own gym).
- **Realtime**: no (one-shot sync + 60s in-memory loop).
- **Legacy IDs**: none (doc `id` data field dropped at import — Sprint 81C C4).

### 4.25 `licensed_devices` (was `licensedDevices`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `created_by → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `device_id text not null` (client UUID), `device_name text`, `platform text`, `app_version text`, `user_agent text` (≤500), `status device_status default 'active'`, `created_by text`, `last_seen timestamptz`, `license_key text` (added 0011 — app `registerDevice` persists the gym's license key per device), `registered_at timestamptz` (added 0011), `created_at`, `updated_at`.
- **UNIQUE**: `(gym_id, device_id)`.
- **Indexes**: `(gym_id)`, `(status)`.
- **RLS**: staff own gym; super_admin cross-gym (DeviceManagement).
- **Realtime**: yes (device lists) / one-shot per page.

### 4.26 `license_history` (was `licenseHistory`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `performed_by → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `device_id text`, `action text`, `performed_by text`, `created_at`.
- **Indexes**: `(gym_id, created_at desc)`.
- **RLS**: staff own gym; super_admin all.
- **Realtime**: no (audit log — retention/archive per OQ #8).

### 4.27 `referral_codes` (was `referralCodes` directory)

- **PK**: `code text` — natural key `IP-XXXXXX`.
- **FKs**: `referrer_uid → profiles(firebase_uid)`.
- **Columns**: `code text pk`, `referrer_uid text not null`, `created_at`.
- **Indexes**: `(referrer_uid)`.
- **RLS**: read = any authenticated; create = code owner only (`referrer_uid = auth_firebase_uid()` AND user's own `referral_code = code` — mirror of rule 478-487); update/delete = none.
- **Realtime**: no.
- **Legacy IDs**: `code` = doc ID; `referrer_uid` = Firebase UID.

### 4.28 `referrals` (was `referrals`)

- **PK**: `referred_uid text` — deterministic doc key = referred user's Firebase UID.
- **FKs**: `referred_uid → profiles(firebase_uid)`, `referrer_uid → profiles(firebase_uid)`, `gym_id → gyms.id`.
- **Columns**: `referred_uid text pk`, `referrer_uid text not null`, `referral_code text`, `gym_id text`, `referred_name text`, `status referral_status default 'Pending'`, `reward_type text`, `reward_value numeric(12,2)`, `reward_issued boolean default false`, `first_payment_id text`, `expires_at timestamptz`, `qualified_at timestamptz`, `rewarded_at timestamptz`, `reward_ref text`, `created_at`, `updated_at`.
- **Indexes**: `(referrer_uid, created_at desc)`, `(gym_id, created_at desc)`, `(status)`.
- **RLS**: referrer read own outbound (`referrer_uid = auth_firebase_uid()`); member read own (`referred_uid = auth_firebase_uid()` OR path-wildcard doc-key check — Sprint 81H semantics); gym_admin read own gym; super_admin all; create via transaction (Spark client path) or trigger (Blaze path).
- **Realtime**: yes (referral dashboards).
- **Legacy IDs**: PK = Firebase UID.

### 4.29 `reward_ledger` (was `rewardLedger`)

- **PK**: `id uuid`. **FKs**: `referrer_uid/referred_uid/user_id → profiles(firebase_uid)`, `gym_id → gyms.id`.
- **Columns**: `id uuid pk`, `type text`, `reward_type text`, `reward_value numeric(12,2)`, `extension_days int`, `referrer_uid text`, `referred_uid text`, `user_id text`, `referral_id text`, `gym_id text`, `status reward_status default 'pending'`, `issued_at timestamptz`, `description text`, `reward_ref text`, `created_at`.
- **RLS**: owner read own; gym_admin/super_admin all-own-gym/all.
- **Realtime**: no (one-shot).

### 4.30 `discount_coupons` (was `discountCoupons`)

- **PK**: `id uuid`. **FKs**: `user_id → profiles(firebase_uid)`, `gym_id → gyms.id`.
- **Columns**: `id uuid pk`, `user_id text`, `gym_id text`, `code text not null`, `status coupon_status default 'available'`, `value numeric(12,2)`, `created_at`, `used_at timestamptz`.
- **UNIQUE**: `code`.
- **RLS**: owner read own; staff own gym; super_admin all.
- **Realtime**: no.

### 4.31 `referral_audit_logs` (was `referralAuditLogs`)

- **PK**: `id uuid`. **FKs**: `performed_by/target_uid → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `action text`, `performed_by text`, `target_uid text`, `referral_id text`, `metadata jsonb default '{}'`, `created_at`.
- **RLS**: staff/super_admin read. No client writes (server/transaction path).
- **Realtime**: no.

### 4.32 `audit_log` (was `auditLog`)

- **PK**: `id uuid`. **FK**: `changed_by → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `action text not null`, `changed_by text`, `changes jsonb default '{}'`, `previous_values jsonb default '{}'`, `created_at`.
- **RLS**: super_admin read.
- **Realtime**: no (retention/archive per OQ #8).

### 4.33 `ai_conversations` (was `aiConversations`)

- **PK**: `id uuid`. **FKs**: `user_id → profiles(firebase_uid)`, `gym_id → gyms.id` (nullable).
- **Columns**: `id uuid pk`, `user_id text not null`, `gym_id text`, `role text`, `title text`, `pinned boolean default false`, `archived boolean default false`, `deleted boolean default false`, `deleted_at timestamptz`, `last_message text`, `message_count int default 0`, `created_at`, `updated_at`.
- **Indexes**: `(user_id, deleted, updated_at desc)` (composite — replaces Firestore index).
- **RLS**: owner only (`user_id = auth_firebase_uid()`); update denied when `deleted`; no delete policy.
- **Realtime**: yes (conversation list, limit 30, owner).
- **Legacy IDs**: `user_id` = Firebase UID.

### 4.34 `ai_conversation_messages` — child table (was subcollection `messages`)

- **PK**: `id uuid`. **FK**: `conversation_id → ai_conversations.id on delete cascade`.
- **Columns**: `id uuid pk`, `conversation_id uuid not null`, `role text not null`, `content text not null`, `metadata jsonb default '{}'` (sanitized — no `undefined` values), `created_at`.
- **CHECK**: `role in ('user','assistant','system')`.
- **RLS**: owner via parent join (FK subquery on conversation owner).
- **Realtime**: yes (active conversation only, limit 500).
- **Legacy IDs**: none.

### 4.35 `generated_reports` (was `generatedReports`)

- **PK**: `id uuid`. **FKs**: `gym_id → gyms.id`, `user_id → profiles(firebase_uid)`.
- **Columns**: `id uuid pk`, `gym_id text not null`, `user_id text`, `user_name text`, `format report_format not null`, `label text`, `date_range text`, `created_at`.
- **Indexes**: `(gym_id, created_at desc)`.
- **RLS**: staff own gym read/write/delete; super_admin all.
- **Realtime**: yes (reports panels, limit 50).

---

## 5. Junction and Child Tables

- **Junction tables (M:N): 0.** Justified: single role + single gym per user (verified in source — `users.gymId` single value, no role arrays, navigation built per effective role). No many-to-many relationships exist in the Firestore model.
- **Child tables (1:N from arrays/subcollections): 4** — `support_ticket_replies`, `support_ticket_notes`, `support_ticket_attachments` (subcollections under `supportTickets`), `ai_conversation_messages` (subcollection under `aiConversations`).

---

## 6. JSONB Fields (13)

| Table | Column | Notes |
|---|---|---|
| gyms | subscription | 30+ fields; dot-path writes → `jsonb_set` (functions fulfillment) |
| gyms | documents | approval docs map (status/reviewedAt/…; full schema unverified — §10) |
| settings | data | per-doc payload |
| diet_plans | meals | per-meal food arrays |
| diet_plans | versions | edit history |
| workout_plans | exercises | exercise grid |
| workout_plans | versions | edit history |
| plan_templates | plan | template payload |
| whatsapp_campaigns | audience | type + params |
| whatsapp_campaigns | schedule | mode/startAt/weekdays/dayOfMonth/cron |
| whatsapp_campaigns | stats | sent/failed/pending/cancelled/total (increment) |
| payment_attempts | raw_response | gateway raw response |
| ai_conversation_messages | metadata | sanitized (no undefined) |
| referral_audit_logs / audit_log | metadata / changes, previous_values | audit payloads |

---

## 7. RLS Helper Functions (spec)

```sql
create or replace function auth_firebase_uid() returns text
language sql stable security definer set search_path = public as $$
  select firebase_uid from profiles where id = auth.uid()
$$;

create or replace function auth_gym_id() returns text
language sql stable security definer set search_path = public as $$
  select gym_id from profiles where id = auth.uid()
$$;

create or replace function is_super_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = uid), false)
     or (select role = 'super_admin' from profiles where id = uid)
$$;

create or replace function is_staff(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select role from profiles where id = uid) in
         ('super_admin','gym_admin','gym_owner','trainer','admin')
$$;
-- Note: role values stored are canonical (post-normalization); 'gym_owner'/'admin'
-- cannot exist post-migration but kept for rule-parity during dual-read window.

-- updated_at trigger (every mutable table)
create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
-- attach: create trigger trg_<t>_updated before update on <t> for each row execute function set_updated_at();
```

Tenancy rule implementation (R1–R7 per Schema §15.9): gym-scoped policy predicates use `gym_id = auth_gym_id()`; user-scoped use `auth_uid = auth_firebase_uid()`; super_admin policies add `or is_super_admin(auth.uid())`.

---

## 8. Realtime Matrix (postgres_changes)

| Table | Realtime | Subscribers (mirrors AppContext listeners) |
|---|---|---|
| members | yes | staff (gym-scoped), trainer (trainer_auth_uid scope) |
| trainers | yes | staff |
| payments | yes | staff, member (own) |
| plans | yes | staff/trainer |
| progress_logs | yes | staff/trainer, member (own) |
| diet_plans | yes | staff/trainer/member (scoped) |
| workout_plans | yes | staff/trainer/member (scoped) |
| attendance | yes | all roles (scoped) |
| settings | yes | staff (gym rows) |
| subscriptions | yes | super_admin |
| payment_attempts | yes | super_admin/gym_admin |
| gyms | yes | super_admin |
| notifications | yes | per-role gates |
| support_tickets | yes | admin |
| feature_requests | yes | admin |
| referrals | yes | super_admin/gym_admin/member (own) |
| whatsapp_logs | yes | staff (limit 300) |
| generated_reports | yes | staff (limit 50) |
| ai_conversations / ai_conversation_messages | yes | owner only |
| subscription_history, license_history, audit_log, referral_audit_logs, reward_ledger, discount_coupons, plan_templates, contact_messages, whatsapp_campaigns | no | one-shot reads / in-memory loops |

---

## 9. Migration Compatibility (Step 8)

### 9.1 Identifiers preserved byte-for-byte
- All Firebase Auth UIDs → `profiles.firebase_uid` + every `*_uid`/`*_by`/`*_to` text column (no rewrite anywhere).
- `gyms.id` doc IDs (text PK) — every `gym_id` reference keeps its value.
- Deterministic keys: `referral_codes.code` (`IP-XXXXXX`), `referrals.referred_uid`, `settings (gym_id, doc_id)`, `payments.payment_id` (`IP-…`), `payments.invoice_no` (`INV-…`), `subscriptions.license_key` (`IRP-…`), `discount_coupons.code`.

### 9.2 Identifiers that become UUIDs (internal only)
- New PKs: `members.id`, `trainers.id`, `subscriptions.id`, and all collection PKs except the preserved-key tables above.
- Rewritten at import: `members.legacy_id`/`trainers.legacy_id` retain the old doc ID so any legacy reference (including rows imported before canonicalization) resolves via lookup.

### 9.3 Reference resolution during import
- Member-scoped rows (`payments`, `progress_logs`, `diet_plans`, `workout_plans`, `whatsapp_logs`, `attendance`): old `member_id` value (which may be a member doc ID **or** an auth UID) resolved to `members.id` via `legacy_id`/`auth_uid` index; `auth_uid` column backfilled from the member row.
- Trainer-scoped rows: same via `trainers.legacy_id`/`trainers.auth_uid`.
- Attendance rows with unresolvable member_id (deleted members, no auth account): imported with `member_id null`, `auth_uid null`, staff-readable, never member-visible.
- `subscriptions` mirror rows keyed by gym doc id: deduped to one row per `gym_id` (keep latest), `gym_id` column set.
- `payment_attempts.subscription_id` (text, gym subscription id) preserved as-is — no FK (subscription may be deleted).

### 9.4 User → Supabase Auth mapping
- Users re-created via Admin API (same email); password unknown → temporary random password + `email_verify` flow (forced reset), matching the existing Firebase verification-email UX.
- `profiles.id` = new Supabase auth UUID; `profiles.firebase_uid` = old Firebase UID.
- `auth.uid()` in RLS resolves through the bridge; client code continues using the old UID string — **no identity rewrite in app code**.

### 9.5 Historical data integrity
- All payments/attendance/progress rows keep their relationships through the member mapping (§9.3); revenue/history reports unaffected.
- Notification `related_document_id` stays polymorphic text (no FK).
- History/audit tables imported fully; retention/archive added post-migration (OQ #8).

---

## 10. Remaining Blockers (post-Step 3A)

1. **`gyms.documents` payload schema** — approval file-doc metadata beyond `status`/`reviewedAt` unverified; needs a production data sample before finalizing JSONB shape (does not block DDL — column exists as JSONB).
2. **Plan vocabulary mismatch** — `planType` uses mixed casing/vocabulary (Trial/monthly/Standard/Premium/Quarterly/Annual/Lifetime/Day Pass…) across `subscriptions`, `gyms.subscription`, `payments.plan`, `plans.name`. Canonical enum `membership_plan` defined; import normalization rules needed (raw value preserved in `plan_type` as text during dual-read window).
3. **Edge Function secrets/config** — PhonePe/Cashfree config moves to Supabase Secrets post-migration; `settings(billing, platform)` write target for prod billing config must be confirmed against the migrated Billing UI (schema now prevents cross-tenant overwrite).
4. **Realtime adapter build** — supabase-js channel + initial-select/upsert adapter must mirror `onSnapshot(cb, err)` so 40+ listener call sites stay untouched (Step 6 of §14 sequence).
5. **Deployment sequencing** — DDL + triggers + RLS must land together with the data-import freeze window; Firestore stays authoritative until cutover.

---

*Specification only — nothing was created or executed against any Supabase project.*