-- ============================================================================
-- IRONPULSE - Supabase Migration 0001: Initial Schema
-- Source of truth: docs/SUPABASE_DDL_SPEC.md (Step 3A blueprint, section 15 of
-- docs/SUPABASE_MIGRATION_SCHEMA.md).
--
-- STATUS: MIGRATION FILE ONLY. NOT EXECUTED. Do not run against Supabase yet.
--
-- Dependency order: extensions -> enums -> base tables -> dependent tables
--                   -> indexes -> helper functions/triggers.
--
-- RLS policies live separately in 0002_rls.sql (table creation and policy
-- creation are intentionally separated per the approved blueprint section 7/8).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
-- No extensions are required. `gen_random_uuid()` is a core function since
-- PostgreSQL 13; Supabase runs PostgreSQL 15+. No pgcrypto/citext/etc. needed.

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES (19)
-- ----------------------------------------------------------------------------

create type user_role as enum
  ('super_admin','gym_admin','trainer','member','pending','gym_owner_pending','rejected','gym_owner','admin');

create type approval_status as enum
  ('pending','approved','rejected','suspended');

create type subscription_status as enum
  ('trial','active','expired','suspended','cancelled');

create type subscription_payment_status as enum
  ('pending','paid');

create type invoice_status as enum
  ('Paid','Partial','Pending','Overdue','Refunded');

create type attempt_status as enum
  ('pending','success','failed','cancelled');

create type membership_plan as enum
  ('Trial','Standard','Premium','Quarterly','Annual','Lifetime','Day Pass');

create type attendance_method as enum
  ('Auto','Manual','reception','QR');

create type referral_status as enum
  ('Pending','Qualified','Rewarded');

create type reward_status as enum
  ('pending','available','used');

create type coupon_status as enum
  ('available','active','used');

create type ticket_status as enum
  ('Open','In Progress','Closed','Resolved');

create type feature_status as enum
  ('Under Review','Planned','Approved','Declined');

create type contact_status as enum
  ('New','Read');

create type whatsapp_log_status as enum
  ('Queued','Sent','Failed','Retrying');

create type campaign_status as enum
  ('Draft','Scheduled','Running','Completed','Cancelled');

create type device_status as enum
  ('active','revoked','blocked');

create type notification_priority as enum
  ('normal','high','low');

create type report_format as enum
  ('CSV','TSV','PDF','Print');

-- ----------------------------------------------------------------------------
-- 2. BASE / DEPENDENT TABLES
-- ----------------------------------------------------------------------------
-- Order respects FKs. Circularity between profiles.gym_id and gyms.owner_uid
-- is resolved by creating `profiles` first (without the gym_id FK), then
-- `gyms`, then adding the gym_id FK via ALTER TABLE at the end of the section.

-- 2.1 profiles - user identity bridge (was `users`)
--     Firebase UID preserved as TEXT in `firebase_uid`; bridges auth.users.id.
create table profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  firebase_uid                text not null unique,
  email                       text,
  phone                       text,
  name                        text,
  photo_url                   text,
  role                        user_role not null default 'pending',
  is_super_admin              boolean not null default false,
  gym_id                      text,
  referral_code               text,
  referred_by                 text,
  account_disabled            boolean not null default false,
  disabled_reason             text,
  disabled_at                 timestamptz,
  referral_code_generated_at  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint ck_profiles_referral_code_format check (
    referral_code is null
    or referral_code = ''
    or referral_code ~ '^IP-[A-Z0-9]{6}$'
  )
);

create unique index uq_profiles_referral_code
  on profiles (referral_code)
  where referral_code is not null and referral_code <> '';

create unique index uq_profiles_email
  on profiles (email)
  where email is not null;

-- 2.2 gyms - gym registry (tenancy root). id = preserved Firestore doc ID (text).
create table gyms (
  id                    text primary key,
  gym_name              text,
  owner_name            text,
  email                 text,
  phone                 text,
  owner_uid             text references profiles (firebase_uid) on delete set null,
  status                text,
  approval_status       approval_status not null default 'pending',
  approval_reviewed_at  timestamptz,
  approved_at           timestamptz,
  rejected_reason       text,
  documents             jsonb not null default '{}',
  subscription          jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 2.3 trainers - gym trainers (was `trainers`)
create table trainers (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text not null unique,
  auth_uid    text unique,
  gym_id      text not null references gyms (id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  specialty   text,
  rating      numeric(3,1),
  clients     int not null default 0,
  bio         text,
  experience  text,
  avatar      text,
  color       text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fk_trainers_auth_uid_profiles foreign key (auth_uid)
    references profiles (firebase_uid) on delete set null,
  constraint fk_trainers_created_by_profiles foreign key (created_by)
    references profiles (firebase_uid) on delete set null
);

-- 2.4 members - canonical member registry (FK target for member-scoped rows)
create table members (
  id               uuid primary key default gen_random_uuid(),
  legacy_id        text not null unique,
  auth_uid         text unique,
  gym_id           text not null references gyms (id) on delete cascade,
  name             text not null,
  email            text,
  phone            text,
  contact          text,
  age              int,
  weight           numeric(6,1),
  height           numeric(6,1),
  gender           text,
  plan             text,
  plan_price       numeric(12,2),
  amount_paid      numeric(12,2) not null default 0,
  balance_due      numeric(12,2) not null default 0,
  payment_status   invoice_status not null default 'Paid',
  status           text,
  checkins         int not null default 0,
  trainer_id       uuid references trainers (id) on delete set null,
  trainer_auth_uid text,
  avatar           text,
  color            text,
  photo_url        text,
  storage_path     text,
  expiry           date,
  notes            text,
  join_date        date,
  referred_by      text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fk_members_auth_uid_profiles foreign key (auth_uid)
    references profiles (firebase_uid) on delete set null,
  constraint fk_members_trainer_auth_uid_trainers foreign key (trainer_auth_uid)
    references trainers (auth_uid) on delete set null,
  constraint fk_members_created_by_profiles foreign key (created_by)
    references profiles (firebase_uid) on delete set null
);

-- 2.5 plans - membership plans (was `plans`)
create table plans (
  id            uuid primary key default gen_random_uuid(),
  gym_id        text not null references gyms (id) on delete cascade,
  name          text not null,
  price         numeric(12,2),
  duration      int,
  duration_days int,
  description   text,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2.6 plan_templates - built-in plan templates (was `planTemplates`)
create table plan_templates (
  id         uuid primary key default gen_random_uuid(),
  gym_id     text references gyms (id) on delete cascade,
  type       text,
  name       text,
  plan       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 2.7 subscriptions - gym platform subscriptions (was `subscriptions`)
create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               text not null references gyms (id) on delete cascade,
  plan                 text,
  plan_name            text,
  plan_type            text,
  amount               numeric(12,2),
  currency             text not null default 'INR',
  status               subscription_status,
  payment_status       subscription_payment_status,
  payment_method       text,
  transaction_id       text,
  paid_at              timestamptz,
  expiry_date          date,
  started_at           timestamptz,
  cancelled_at         timestamptz,
  license_key          text unique,
  pending_payment_type text,
  created_by           text references profiles (firebase_uid) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 2.8 subscription_history - subscription audit trail (was `subscriptionHistory`)
create table subscription_history (
  id              uuid primary key default gen_random_uuid(),
  gym_id          text not null references gyms (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  action          text not null,
  actor_uid       text references profiles (firebase_uid) on delete set null,
  changes         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- 2.9 payment_attempts - PhonePe/Cashfree attempts (was `paymentAttempts`)
create table payment_attempts (
  id                      uuid primary key default gen_random_uuid(),
  payment_id              text not null unique,
  gym_id                  text not null references gyms (id) on delete cascade,
  subscription_id         text,
  type                    text,
  plan                    text,
  original_amount         numeric(12,2),
  discount_amount         numeric(12,2),
  final_amount            numeric(12,2),
  currency                text not null default 'INR',
  name                    text,
  email                   text,
  phone                   text,
  redirect_url            text,
  status                  attempt_status not null default 'pending',
  payment_method          text,
  payment_gateway         text,
  transaction_id          text,
  phonepe_transaction_id  text,
  cashfree_order_id       text,
  payment_session_id      text,
  order_status            text,
  auth_uid                text references profiles (firebase_uid) on delete set null,
  expires_at              timestamptz,
  invoice_no              text,
  error_message           text,
  raw_response            jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 2.10 diet_plans (was `dietPlans`)
create table diet_plans (
  id                          uuid primary key default gen_random_uuid(),
  gym_id                      text not null references gyms (id) on delete cascade,
  name                        text not null,
  goal                        text,
  calories                    int,
  protein                     int,
  carbs                       int,
  fat                         int,
  hydration                   text,
  meals                       jsonb not null default '[]',
  member_id                   uuid references members (id) on delete cascade,
  auth_uid                    text references members (auth_uid) on delete set null,
  assigned_member             text,
  assigned_trainer            text,
  assigned_trainer_auth_uid   text references trainers (auth_uid) on delete set null,
  owner_type                  text,
  owner_id                    text,
  versions                    jsonb not null default '[]',
  created_by                  text references profiles (firebase_uid) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- 2.11 workout_plans (was `workoutPlans`)
create table workout_plans (
  id                        uuid primary key default gen_random_uuid(),
  gym_id                    text not null references gyms (id) on delete cascade,
  name                      text not null,
  level                     text,
  days                      int,
  duration                  text,
  split                     text,
  exercises                 jsonb not null default '[]',
  member_id                 uuid references members (id) on delete cascade,
  auth_uid                  text references members (auth_uid) on delete set null,
  member                    text,
  assigned_trainer          text,
  trainer                   text,
  trainer_auth_uid          text references trainers (auth_uid) on delete set null,
  owner_type                text,
  owner_id                  text,
  versions                  jsonb not null default '[]',
  created_by                text references profiles (firebase_uid) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- 2.12 progress_logs (was `progressLogs`)
create table progress_logs (
  id           uuid primary key default gen_random_uuid(),
  gym_id       text not null references gyms (id) on delete cascade,
  member_id    uuid references members (id) on delete cascade,
  member_name  text,
  auth_uid     text references profiles (firebase_uid) on delete set null,
  trainer_id   uuid references trainers (id) on delete set null,
  trainer_name text,
  weight       numeric(6,1),
  body_fat     numeric(4,1),
  bmi          numeric(4,1),
  muscle       numeric(6,1),
  bench        numeric(6,1),
  squat        numeric(6,1),
  deadlift     numeric(6,1),
  notes        text,
  log_date     date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.13 payments - invoices (was `payments`)
create table payments (
  id              uuid primary key default gen_random_uuid(),
  payment_id      text not null unique,
  invoice_no      text unique,
  gym_id          text not null references gyms (id) on delete cascade,
  member_id       uuid references members (id) on delete cascade,
  auth_uid        text references profiles (firebase_uid) on delete set null,
  member_name     text,
  amount          numeric(12,2) not null,
  paid            numeric(12,2) not null default 0,
  status          invoice_status not null default 'Pending',
  plan            text,
  method          text,
  date            date,
  due             date,
  transaction_id  text,
  payment_gateway text,
  created_by      text references profiles (firebase_uid) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2.14 attendance (was `attendance`)
create table attendance (
  id                uuid primary key default gen_random_uuid(),
  gym_id            text not null references gyms (id) on delete cascade,
  member_id         uuid references members (id) on delete cascade,
  auth_uid          text references members (auth_uid) on delete set null,
  member_name       text,
  avatar            text,
  color             text,
  plan              text,
  trainer_id        uuid references trainers (id) on delete set null,
  trainer_auth_uid  text references trainers (auth_uid) on delete set null,
  trainer_name      text,
  date              date not null,
  time              time not null,
  method            attendance_method not null default 'Manual',
  duration          int not null default 90,
  created_at        timestamptz not null default now()
);-- 2.15 notifications (was `notifications`)
create table notifications (
  id                   uuid primary key default gen_random_uuid(),
  user_id              text not null references profiles (firebase_uid) on delete cascade,
  gym_id               text references gyms (id) on delete cascade,
  role                 text,
  title                text,
  message              text,
  type                 text,
  subtype              text,
  priority             notification_priority not null default 'normal',
  icon                 text,
  action_url           text,
  related_document_id  text,
  page                 text,
  tab                  text,
  contact_id           text,
  target_role          text,
  read                 boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 2.16 support_tickets (was `supportTickets`)
create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  gym_id      text not null references gyms (id) on delete cascade,
  name        text,
  email       text,
  category    text,
  subject     text,
  message     text,
  status      ticket_status not null default 'Open',
  priority    text,
  created_by  text references profiles (firebase_uid) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2.17 support_ticket_replies - child table (subcollection `replies`)
create table support_ticket_replies (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references support_tickets (id) on delete cascade,
  author_role  text,
  author_name  text,
  author_uid   text,
  message      text,
  created_at   timestamptz not null default now()
);

-- 2.18 support_ticket_notes - child table (subcollection `notes`)
create table support_ticket_notes (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references support_tickets (id) on delete cascade,
  author_role  text,
  author_name  text,
  note         text,
  created_at   timestamptz not null default now()
);

-- 2.19 support_ticket_attachments - child table (subcollection `attachments`)
create table support_ticket_attachments (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets (id) on delete cascade,
  name        text,
  url         text,
  size        int,
  type        text,
  created_at  timestamptz not null default now()
);

-- 2.20 feature_requests (was `featureRequests`)
create table feature_requests (
  id          uuid primary key default gen_random_uuid(),
  gym_id      text not null references gyms (id) on delete cascade,
  title       text,
  description text,
  category    text,
  status      feature_status not null default 'Under Review',
  votes       int not null default 0,
  created_by  text references profiles (firebase_uid) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2.21 contact_messages (was `contactMessages`) - anonymous insert
create table contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text,
  message     text,
  status      contact_status not null default 'New',
  created_at  timestamptz not null default now()
);

-- 2.22 settings - gym + global settings (was `settings` composite docs)
--     gym_id = 'platform' sentinel for global docs (billing/referralSettings/platform).
--     Gym-existence enforced by trigger guard_settings_gym (CHECK cannot
--     contain subqueries in PostgreSQL).
create table settings (
  gym_id      text not null,
  doc_id      text not null,
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (gym_id, doc_id)
);

-- 2.23 whatsapp_campaigns (was `whatsappCampaigns`)
create table whatsapp_campaigns (
  id           uuid primary key default gen_random_uuid(),
  gym_id       text not null references gyms (id) on delete cascade,
  name         text,
  body         text,
  audience     jsonb not null default '{}',
  schedule     jsonb not null default '{}',
  status       campaign_status not null default 'Draft',
  stats        jsonb not null default '{"sent":0,"failed":0,"pending":0,"cancelled":0,"total":0}',
  next_run_at  timestamptz,
  created_by   text references profiles (firebase_uid) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.24 whatsapp_logs (was `whatsappLogs`)
create table whatsapp_logs (
  id           uuid primary key default gen_random_uuid(),
  gym_id       text not null references gyms (id) on delete cascade,
  member_id    uuid references members (id) on delete set null,
  phone        text,
  template     text,
  provider     text,
  status       whatsapp_log_status not null default 'Queued',
  attempts     int not null default 0,
  error        text,
  entry_id     text,
  campaign_id  uuid references whatsapp_campaigns (id) on delete set null,
  test         boolean not null default false,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.25 licensed_devices (was `licensedDevices`)
create table licensed_devices (
  id           uuid primary key default gen_random_uuid(),
  gym_id       text not null references gyms (id) on delete cascade,
  device_id    text not null,
  device_name  text,
  platform     text,
  app_version  text,
  user_agent   text,
  status       device_status not null default 'active',
  created_by   text references profiles (firebase_uid) on delete set null,
  last_seen    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_licensed_devices_gym_device unique (gym_id, device_id)
);

-- 2.26 license_history (was `licenseHistory`)
create table license_history (
  id            uuid primary key default gen_random_uuid(),
  gym_id        text not null references gyms (id) on delete cascade,
  device_id     text,
  action        text,
  performed_by  text references profiles (firebase_uid) on delete set null,
  created_at    timestamptz not null default now()
);

-- 2.27 referral_codes - directory (was `referralCodes`). code = natural key.
create table referral_codes (
  code          text primary key,
  referrer_uid  text references profiles (firebase_uid) on delete set null,
  created_at    timestamptz not null default now(),
  constraint ck_referral_codes_format check (code ~ '^IP-[A-Z0-9]{6}$')
);

-- 2.28 referrals (was `referrals`). referred_uid = deterministic key.
create table referrals (
  referred_uid     text primary key references profiles (firebase_uid) on delete cascade,
  referrer_uid     text not null references profiles (firebase_uid) on delete cascade,
  referral_code    text,
  gym_id           text references gyms (id) on delete cascade,
  referred_name    text,
  status           referral_status not null default 'Pending',
  reward_type      text,
  reward_value     numeric(12,2),
  reward_issued    boolean not null default false,
  first_payment_id text,
  expires_at       timestamptz,
  qualified_at     timestamptz,
  rewarded_at      timestamptz,
  reward_ref       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2.29 reward_ledger (was `rewardLedger`)
create table reward_ledger (
  id             uuid primary key default gen_random_uuid(),
  type           text,
  reward_type    text,
  reward_value   numeric(12,2),
  extension_days int,
  referrer_uid   text references profiles (firebase_uid) on delete set null,
  referred_uid   text references profiles (firebase_uid) on delete set null,
  user_id        text references profiles (firebase_uid) on delete set null,
  referral_id    text,
  gym_id         text references gyms (id) on delete cascade,
  status         reward_status not null default 'pending',
  issued_at      timestamptz,
  description    text,
  reward_ref     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2.30 discount_coupons (was `discountCoupons`)
create table discount_coupons (
  id          uuid primary key default gen_random_uuid(),
  user_id     text references profiles (firebase_uid) on delete set null,
  gym_id      text references gyms (id) on delete cascade,
  code        text not null unique,
  status      coupon_status not null default 'available',
  value       numeric(12,2),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

-- 2.31 referral_audit_logs (was `referralAuditLogs`)
create table referral_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  action        text,
  performed_by  text references profiles (firebase_uid) on delete set null,
  target_uid    text references profiles (firebase_uid) on delete set null,
  referral_id   text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- 2.32 audit_log (was `auditLog`)
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  action          text not null,
  changed_by      text references profiles (firebase_uid) on delete set null,
  changes         jsonb not null default '{}',
  previous_values jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- 2.33 ai_conversations (was `aiConversations`)
create table ai_conversations (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references profiles (firebase_uid) on delete cascade,
  gym_id         text references gyms (id) on delete cascade,
  role           text,
  title          text,
  pinned         boolean not null default false,
  archived       boolean not null default false,
  deleted        boolean not null default false,
  deleted_at     timestamptz,
  last_message   text,
  message_count  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2.34 ai_conversation_messages - child table (subcollection `messages`)
create table ai_conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  role            text not null,
  content         text not null,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  constraint ck_ai_messages_role check (role in ('user','assistant','system'))
);

-- 2.35 generated_reports (was `generatedReports`)
create table generated_reports (
  id          uuid primary key default gen_random_uuid(),
  gym_id      text not null references gyms (id) on delete cascade,
  user_id     text references profiles (firebase_uid) on delete set null,
  user_name   text,
  format      report_format not null,
  label       text,
  date_range  text,
  created_at  timestamptz not null default now()
);

-- 2.36 Resolve profiles <-> gyms circular FK (added after both exist).
alter table profiles
  add constraint fk_profiles_gym foreign key (gym_id)
    references gyms (id) on delete set null;-- ----------------------------------------------------------------------------
-- 3. INDEXES
-- ----------------------------------------------------------------------------

create index idx_profiles_gym_id        on profiles (gym_id);
create index idx_profiles_role          on profiles (role);

create index idx_gyms_owner_uid         on gyms (owner_uid);

create index idx_subscriptions_gym_id   on subscriptions (gym_id);
create index idx_subscriptions_status   on subscriptions (status);
create index idx_subscriptions_expiry   on subscriptions (expiry_date);

create index idx_payment_attempts_gym_status    on payment_attempts (gym_id, status);
create index idx_payment_attempts_sub_status    on payment_attempts (subscription_id, status);
create index idx_payment_attempts_cf_order      on payment_attempts (cashfree_order_id);
create index idx_payment_attempts_created_desc  on payment_attempts (created_at desc);

create index idx_members_gym_id          on members (gym_id);
create index idx_members_trainer_auth    on members (trainer_auth_uid);
create index idx_members_auth_uid        on members (auth_uid);
create index idx_members_status          on members (status);
create index idx_members_expiry          on members (expiry);

create index idx_trainers_gym_id         on trainers (gym_id);
create index idx_trainers_auth_uid       on trainers (auth_uid);

create index idx_diet_plans_gym_id            on diet_plans (gym_id);
create index idx_diet_plans_member_id         on diet_plans (member_id);
create index idx_diet_plans_auth_uid          on diet_plans (auth_uid);
create index idx_diet_plans_trainer_auth      on diet_plans (assigned_trainer_auth_uid);

create index idx_workout_plans_gym_id         on workout_plans (gym_id);
create index idx_workout_plans_member_id      on workout_plans (member_id);
create index idx_workout_plans_auth_uid       on workout_plans (auth_uid);
create index idx_workout_plans_trainer_auth   on workout_plans (trainer_auth_uid);

create index idx_progress_logs_gym_date  on progress_logs (gym_id, log_date desc);
create index idx_progress_logs_member_id on progress_logs (member_id);
create index idx_progress_logs_auth_uid  on progress_logs (auth_uid);

create index idx_payments_gym_date  on payments (gym_id, date desc);
create index idx_payments_member_id on payments (member_id);
create index idx_payments_status    on payments (status);

create index idx_attendance_gym_date_time on attendance (gym_id, date desc, time desc);
create index idx_attendance_member_date   on attendance (member_id, date);
create index idx_attendance_auth_date     on attendance (auth_uid, date);
create index idx_attendance_trainer_date  on attendance (trainer_auth_uid, date);

create index idx_notifications_user_date  on notifications (user_id, created_at desc);
create index idx_notifications_gym_date   on notifications (gym_id, created_at desc);

-- child-table functional indexes (required by realtime/message-detail queries)
create index idx_support_replies_ticket       on support_ticket_replies (ticket_id, created_at);
create index idx_support_notes_ticket         on support_ticket_notes (ticket_id, created_at);
create index idx_support_attachments_ticket   on support_ticket_attachments (ticket_id, created_at);

create index idx_whatsapp_logs_gym_date   on whatsapp_logs (gym_id, created_at desc);
create index idx_whatsapp_logs_campaign   on whatsapp_logs (campaign_id);

create index idx_whatsapp_campaigns_gym_status on whatsapp_campaigns (gym_id, status);
create index idx_whatsapp_campaigns_gym_date   on whatsapp_campaigns (gym_id, created_at desc);

create index idx_licensed_devices_gym_id  on licensed_devices (gym_id);
create index idx_licensed_devices_status  on licensed_devices (status);

create index idx_license_history_gym_date on license_history (gym_id, created_at desc);

create index idx_referral_codes_referrer  on referral_codes (referrer_uid);

create index idx_referrals_referrer_date  on referrals (referrer_uid, created_at desc);
create index idx_referrals_gym_date       on referrals (gym_id, created_at desc);
create index idx_referrals_status         on referrals (status);

create index idx_ai_conversations_user_deleted_updated
  on ai_conversations (user_id, deleted, updated_at desc);

create index idx_ai_messages_conversation_date
  on ai_conversation_messages (conversation_id, created_at);

create index idx_generated_reports_gym_date on generated_reports (gym_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS / TRIGGERS (approved in DDL spec section 7)
-- ----------------------------------------------------------------------------

-- auth_firebase_uid() - resolve the session to the legacy Firebase UID string.
create or replace function auth_firebase_uid()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select firebase_uid from profiles where id = auth.uid()
$$;

-- auth_gym_id() - resolve the session to its gym (tenancy).
create or replace function auth_gym_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select gym_id from profiles where id = auth.uid()
$$;

-- is_super_admin(uid) - super_admin bypass predicate.
create or replace function is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from profiles where id = uid), false)
      or (select role = 'super_admin' from profiles where id = uid)
$$;

-- is_staff(uid) - staff predicate (rule parity; legacy role values cannot
-- exist post-migration but are kept for the dual-read window).
create or replace function is_staff(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select role from profiles where id = uid) in
         ('super_admin','gym_admin','gym_owner','trainer','admin')
$$;

-- set_updated_at() - shared trigger function for every mutable table.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- referral_code immutability + protected-field guard on profiles.
-- Mirror of firestore.rules 118-131: referral_code may only be set once
-- (null/'') and role/gym_id/is_super_admin/account_disabled are never
-- user-writable (super_admin may change role/gym_id/is_super_admin).
create or replace function guard_profiles_update()
returns trigger
language plpgsql
as $$
declare
  actor_uid uuid := auth.uid();
  actor_super boolean := false;
begin
  if actor_uid is not null then
    select coalesce(is_super_admin, false)
      into actor_super
      from profiles
      where id = actor_uid;
  end if;

  if old.referral_code is not null and old.referral_code <> ''
     and new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code is immutable once set';
  end if;

  if not actor_super then
    if new.role is distinct from old.role then
      raise exception 'role is not user-writable';
    end if;
    if new.gym_id is distinct from old.gym_id then
      raise exception 'gym_id is not user-writable';
    end if;
    if new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'is_super_admin is not user-writable';
    end if;
    if new.account_disabled is distinct from old.account_disabled then
      raise exception 'account_disabled is not user-writable';
    end if;
  end if;

  return new;
end;
$$;

-- ai_conversations: updates denied once deleted (mirror of spec 4.33).
create or replace function guard_ai_conversation_update()
returns trigger
language plpgsql
as $$
begin
  if old.deleted then
    raise exception 'conversation is deleted and immutable';
  end if;
  return new;
end;
$$;

-- settings: gym_id must reference an existing gym OR be the 'platform'
-- sentinel (CHECK cannot contain subqueries in PostgreSQL — enforced here).
create or replace function guard_settings_gym()
returns trigger
language plpgsql
as $$
begin
  if new.gym_id <> 'platform'
     and not exists (select 1 from gyms g where g.id = new.gym_id) then
    raise exception 'settings.gym_id % does not reference an existing gym', new.gym_id;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS (mutable tables -> set_updated_at)
-- ----------------------------------------------------------------------------

create trigger trg_profiles_updated          before update on profiles          for each row execute function set_updated_at();
create trigger trg_gyms_updated              before update on gyms              for each row execute function set_updated_at();
create trigger trg_subscriptions_updated     before update on subscriptions     for each row execute function set_updated_at();
create trigger trg_members_updated           before update on members           for each row execute function set_updated_at();
create trigger trg_trainers_updated          before update on trainers          for each row execute function set_updated_at();
create trigger trg_plans_updated             before update on plans             for each row execute function set_updated_at();
create trigger trg_diet_plans_updated        before update on diet_plans        for each row execute function set_updated_at();
create trigger trg_workout_plans_updated     before update on workout_plans     for each row execute function set_updated_at();
create trigger trg_progress_logs_updated     before update on progress_logs     for each row execute function set_updated_at();
create trigger trg_payments_updated          before update on payments          for each row execute function set_updated_at();
create trigger trg_notifications_updated     before update on notifications     for each row execute function set_updated_at();
create trigger trg_support_tickets_updated   before update on support_tickets   for each row execute function set_updated_at();
create trigger trg_feature_requests_updated  before update on feature_requests  for each row execute function set_updated_at();
create trigger trg_payment_attempts_updated  before update on payment_attempts  for each row execute function set_updated_at();
create trigger trg_settings_updated          before update on settings          for each row execute function set_updated_at();
create trigger trg_whatsapp_logs_updated     before update on whatsapp_logs     for each row execute function set_updated_at();
create trigger trg_whatsapp_campaigns_updated before update on whatsapp_campaigns for each row execute function set_updated_at();
create trigger trg_licensed_devices_updated  before update on licensed_devices  for each row execute function set_updated_at();
create trigger trg_referrals_updated         before update on referrals         for each row execute function set_updated_at();
create trigger trg_reward_ledger_updated     before update on reward_ledger     for each row execute function set_updated_at();
create trigger trg_discount_coupons_updated  before update on discount_coupons  for each row execute function set_updated_at();
create trigger trg_ai_conversations_updated  before update on ai_conversations  for each row execute function set_updated_at();

create trigger trg_profiles_guard             before update on profiles          for each row execute function guard_profiles_update();
create trigger trg_ai_conversations_guard     before update on ai_conversations  for each row execute function guard_ai_conversation_update();
create trigger trg_settings_gym_guard         before insert or update on settings for each row execute function guard_settings_gym();