-- ============================================================================
-- IRONPULSE Supabase Migration 0002 â€” Row Level Security
-- Applies to: supabase/migrations/0002_rls.sql
-- Depends on: 0001_initial_schema.sql (tables, enums, helper functions)
--
-- Design per docs/SUPABASE_DDL_SPEC.md Â§4 (per-table RLS) and Â§7 (helpers).
-- Every table: RLS enabled. Super admin bypass everywhere via
-- is_super_admin(auth.uid()). Staff = is_staff(auth.uid()) (includes
-- super_admin, gym_admin, gym_owner, trainer, admin â€” legacy values kept for
-- the dual-read window). Tenancy = auth_gym_id(). Identity = auth_firebase_uid().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Grants (Supabase defaults; explicit grants only where behaviour differs)
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- contact_messages is a public (anonymous) form â€” INSERT allowed for anon.
grant insert on public.contact_messages to anon;

-- ----------------------------------------------------------------------------
-- 2. Enable row level security on every table (35)
-- ----------------------------------------------------------------------------
alter table public.profiles                     enable row level security;
alter table public.gyms                         enable row level security;
alter table public.subscriptions                enable row level security;
alter table public.subscription_history         enable row level security;
alter table public.payment_attempts             enable row level security;
alter table public.members                      enable row level security;
alter table public.trainers                     enable row level security;
alter table public.plans                        enable row level security;
alter table public.plan_templates               enable row level security;
alter table public.diet_plans                   enable row level security;
alter table public.workout_plans                enable row level security;
alter table public.progress_logs                enable row level security;
alter table public.payments                     enable row level security;
alter table public.attendance                   enable row level security;
alter table public.notifications                enable row level security;
alter table public.support_tickets              enable row level security;
alter table public.support_ticket_replies       enable row level security;
alter table public.support_ticket_notes         enable row level security;
alter table public.support_ticket_attachments   enable row level security;
alter table public.feature_requests             enable row level security;
alter table public.contact_messages             enable row level security;
alter table public.settings                     enable row level security;
alter table public.whatsapp_logs                enable row level security;
alter table public.whatsapp_campaigns           enable row level security;
alter table public.licensed_devices             enable row level security;
alter table public.license_history              enable row level security;
alter table public.referral_codes               enable row level security;
alter table public.referrals                    enable row level security;
alter table public.reward_ledger                enable row level security;
alter table public.discount_coupons             enable row level security;
alter table public.referral_audit_logs          enable row level security;
alter table public.audit_log                    enable row level security;
alter table public.ai_conversations             enable row level security;
alter table public.ai_conversation_messages     enable row level security;
alter table public.generated_reports            enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Policies â€” 4.1 profiles
-- Read: self OR staff. Update: self (field-level guard via trigger
-- guard_profiles_update: referral_code immutable once set; role/gym_id/
-- is_super_admin/account_disabled not user-writable). Insert: self (signup).
-- Delete: none (disabled flags only).
-- ----------------------------------------------------------------------------
create policy pol_profiles_select_self_or_staff on public.profiles
  for select using (id = auth.uid() or is_staff(auth.uid()));

create policy pol_profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

create policy pol_profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4.2 gyms â€” tenancy root. Read: super_admin OR staff-of-own-gym
-- (own gym = id = auth_gym_id()). Write: super_admin only. Insert: owner at
-- signup (owner_uid = auth_firebase_uid(), approval pending â€” mirrors 79F).
-- ----------------------------------------------------------------------------
create policy pol_gyms_select_super_or_own on public.gyms
  for select using (
    is_super_admin(auth.uid())
    or (is_staff(auth.uid()) and id = auth_gym_id())
  );

create policy pol_gyms_insert_super_or_owner_pending on public.gyms
  for insert with check (
    is_super_admin(auth.uid())
    or (owner_uid = auth_firebase_uid() and approval_status = 'pending')
  );

create policy pol_gyms_update_super on public.gyms
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.3 subscriptions â€” gym platform subscriptions.
-- Read/write: super_admin; read: gym_admin own gym.
-- ----------------------------------------------------------------------------
create policy pol_subscriptions_select_super on public.subscriptions
  for select using (is_super_admin(auth.uid()));

create policy pol_subscriptions_select_gymadmin_own on public.subscriptions
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'gym_admin'
    and gym_id = auth_gym_id()
  );

create policy pol_subscriptions_insert_super on public.subscriptions
  for insert with check (is_super_admin(auth.uid()));

create policy pol_subscriptions_update_super on public.subscriptions
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

create policy pol_subscriptions_delete_super on public.subscriptions
  for delete using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.4 subscription_history â€” append-only audit trail.
-- Read: super_admin; read: gym_admin own gym. Insert: super_admin (fulfillment).
-- ----------------------------------------------------------------------------
create policy pol_subscription_history_select_super on public.subscription_history
  for select using (is_super_admin(auth.uid()));

create policy pol_subscription_history_select_gymadmin_own on public.subscription_history
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'gym_admin'
    and gym_id = auth_gym_id()
  );

create policy pol_subscription_history_insert_super on public.subscription_history
  for insert with check (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.5 payment_attempts â€” gateway payment lifecycle.
-- Read/create: super_admin OR gym_admin own gym; update: super_admin
-- (fulfillment path). Mirrors existing Firestore rules.
-- ----------------------------------------------------------------------------
create policy pol_payment_attempts_select_super_or_gymadmin on public.payment_attempts
  for select using (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  );

create policy pol_payment_attempts_insert_super_or_gymadmin on public.payment_attempts
  for insert with check (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  );

create policy pol_payment_attempts_update_super on public.payment_attempts
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.6 members â€” canonical member registry.
-- Staff read/write own gym; trainer read own trainer_auth_uid; member read
-- own via auth_uid = auth_firebase_uid().
-- ----------------------------------------------------------------------------
create policy pol_members_select_staff_own on public.members
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_members_insert_staff_own on public.members
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_members_update_staff_own on public.members
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_members_delete_staff_own on public.members
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_members_select_trainer_own on public.members
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'trainer'
    and trainer_auth_uid = auth_firebase_uid()
  );

create policy pol_members_select_member_own on public.members
  for select using (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.7 trainers â€” gym trainer registry.
-- Staff read/write own gym; trainer read self (auth_uid).
-- ----------------------------------------------------------------------------
create policy pol_trainers_select_staff_own on public.trainers
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_trainers_insert_staff_own on public.trainers
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_trainers_update_staff_own on public.trainers
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_trainers_delete_staff_own on public.trainers
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_trainers_select_self on public.trainers
  for select using (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.8 plans â€” membership plans.
-- Staff read/write own gym; member read own gym (plan display).
-- ----------------------------------------------------------------------------
create policy pol_plans_select_staff_own on public.plans
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_plans_insert_staff_own on public.plans
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_plans_update_staff_own on public.plans
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_plans_delete_staff_own on public.plans
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_plans_select_member_own on public.plans
  for select using (gym_id = auth_gym_id());

-- ----------------------------------------------------------------------------
-- 4.9 plan_templates â€” built-in templates (gym_id null = global).
-- Staff read own gym + global; super_admin read/write; member read own gym.
-- ----------------------------------------------------------------------------
create policy pol_plan_templates_select_staff on public.plan_templates
  for select using (
    is_staff(auth.uid())
    and (gym_id = auth_gym_id() or gym_id is null)
  );

create policy pol_plan_templates_select_member_own on public.plan_templates
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'member'
    and (gym_id = auth_gym_id() or gym_id is null)
  );

create policy pol_plan_templates_insert_super on public.plan_templates
  for insert with check (is_super_admin(auth.uid()));

create policy pol_plan_templates_update_super on public.plan_templates
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

create policy pol_plan_templates_delete_super on public.plan_templates
  for delete using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.10 diet_plans â€” staff CRUD own gym; trainer own assigned_trainer_auth_uid;
-- member read own auth_uid.
-- ----------------------------------------------------------------------------
create policy pol_diet_plans_select_staff_own on public.diet_plans
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_diet_plans_insert_staff_own on public.diet_plans
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_diet_plans_update_staff_own on public.diet_plans
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_diet_plans_delete_staff_own on public.diet_plans
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_diet_plans_select_trainer_own on public.diet_plans
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'trainer'
    and assigned_trainer_auth_uid = auth_firebase_uid()
  );

create policy pol_diet_plans_select_member_own on public.diet_plans
  for select using (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.11 workout_plans â€” identical shape/RLS to 4.10 (trainer_auth_uid field).
-- ----------------------------------------------------------------------------
create policy pol_workout_plans_select_staff_own on public.workout_plans
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_workout_plans_insert_staff_own on public.workout_plans
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_workout_plans_update_staff_own on public.workout_plans
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_workout_plans_delete_staff_own on public.workout_plans
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_workout_plans_select_trainer_own on public.workout_plans
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'trainer'
    and trainer_auth_uid = auth_firebase_uid()
  );

create policy pol_workout_plans_select_member_own on public.workout_plans
  for select using (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.12 progress_logs â€” staff own gym; member own auth_uid.
-- ----------------------------------------------------------------------------
create policy pol_progress_logs_select_staff_own on public.progress_logs
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_progress_logs_insert_staff_own on public.progress_logs
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_progress_logs_update_staff_own on public.progress_logs
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_progress_logs_delete_staff_own on public.progress_logs
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_progress_logs_select_member_own on public.progress_logs
  for select using (auth_uid = auth_firebase_uid());

create policy pol_progress_logs_insert_member_own on public.progress_logs
  for insert with check (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.13 payments â€” invoices. Staff own gym; member own via auth_uid
-- (covers legacy rows whose memberId was the auth uid).
-- ----------------------------------------------------------------------------
create policy pol_payments_select_staff_own on public.payments
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_payments_insert_staff_own on public.payments
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_payments_update_staff_own on public.payments
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_payments_delete_staff_own on public.payments
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_payments_select_member_own on public.payments
  for select using (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.14 attendance â€” staff own gym; member own auth_uid; trainer own
-- trainer_auth_uid.
-- ----------------------------------------------------------------------------
create policy pol_attendance_select_staff_own on public.attendance
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_attendance_insert_staff_own on public.attendance
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_attendance_update_staff_own on public.attendance
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_attendance_delete_staff_own on public.attendance
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_attendance_select_trainer_own on public.attendance
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'trainer'
    and trainer_auth_uid = auth_firebase_uid()
  );

create policy pol_attendance_select_member_own on public.attendance
  for select using (auth_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.15 notifications â€” owner read/update; staff insert into own gym
-- (gym_id null = platform notification); super_admin platform-wide.
-- ----------------------------------------------------------------------------
create policy pol_notifications_select_owner on public.notifications
  for select using (user_id = auth_firebase_uid());

create policy pol_notifications_update_owner on public.notifications
  for update using (user_id = auth_firebase_uid())
  with check (user_id = auth_firebase_uid());

create policy pol_notifications_insert_staff_own on public.notifications
  for insert with check (
    is_staff(auth.uid())
    and (gym_id = auth_gym_id() or gym_id is null)
  );

create policy pol_notifications_select_super on public.notifications
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.16 support_tickets â€” staff own gym; super_admin cross-gym;
-- member create (own user).
-- ----------------------------------------------------------------------------
create policy pol_support_tickets_select_staff_own on public.support_tickets
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_support_tickets_insert_staff_own on public.support_tickets
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_support_tickets_update_staff_own on public.support_tickets
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_support_tickets_delete_staff_own on public.support_tickets
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_support_tickets_select_super on public.support_tickets
  for select using (is_super_admin(auth.uid()));

create policy pol_support_tickets_insert_member on public.support_tickets
  for insert with check (created_by = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.17 support_ticket_replies â€” child; RLS inherits parent via ticket join
-- (staff of the ticket's gym), author read, super_admin.
-- ----------------------------------------------------------------------------
create policy pol_support_ticket_replies_select_staff on public.support_ticket_replies
  for select using (
    is_staff(auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.gym_id = auth_gym_id()
    )
  );

create policy pol_support_ticket_replies_insert_staff on public.support_ticket_replies
  for insert with check (
    is_staff(auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.gym_id = auth_gym_id()
    )
  );

create policy pol_support_ticket_replies_select_author on public.support_ticket_replies
  for select using (author_uid = auth_firebase_uid());

create policy pol_support_ticket_replies_select_super on public.support_ticket_replies
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.18 support_ticket_notes â€” child; staff only (via ticket join).
-- ----------------------------------------------------------------------------
create policy pol_support_ticket_notes_select_staff on public.support_ticket_notes
  for select using (
    is_staff(auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.gym_id = auth_gym_id()
    )
  );

create policy pol_support_ticket_notes_insert_staff on public.support_ticket_notes
  for insert with check (
    is_staff(auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.gym_id = auth_gym_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 4.19 support_ticket_attachments â€” child; staff (via join) + super_admin.
-- ----------------------------------------------------------------------------
create policy pol_support_ticket_attachments_select_staff on public.support_ticket_attachments
  for select using (
    is_staff(auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.gym_id = auth_gym_id()
    )
  );

create policy pol_support_ticket_attachments_insert_staff on public.support_ticket_attachments
  for insert with check (
    is_staff(auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.gym_id = auth_gym_id()
    )
  );

create policy pol_support_ticket_attachments_select_super on public.support_ticket_attachments
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.20 feature_requests â€” staff own gym; member create + read own gym.
-- ----------------------------------------------------------------------------
create policy pol_feature_requests_select_staff_own on public.feature_requests
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_feature_requests_insert_staff_own on public.feature_requests
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_feature_requests_update_staff_own on public.feature_requests
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_feature_requests_delete_staff_own on public.feature_requests
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_feature_requests_select_member_own on public.feature_requests
  for select using (gym_id = auth_gym_id());

create policy pol_feature_requests_insert_member_own on public.feature_requests
  for insert with check (gym_id = auth_gym_id() and created_by = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.21 contact_messages â€” anonymous contact form.
-- INSERT for anon; read/update super_admin.
-- ----------------------------------------------------------------------------
create policy pol_contact_messages_insert_anon on public.contact_messages
  for insert to anon, authenticated with check (true);

create policy pol_contact_messages_select_super on public.contact_messages
  for select using (is_super_admin(auth.uid()));

create policy pol_contact_messages_update_super on public.contact_messages
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));
-- ----------------------------------------------------------------------------
-- 4.22 settings â€” gym + global settings (composite PK (gym_id, doc_id)).
-- Staff read/write own gym rows (gym_id = auth_gym_id()); super_admin global
-- rows (gym_id = 'platform') and cross-gym (DeviceManagement/PlatformSettings).
-- Members: no access per gate (staff-only settings).
-- ----------------------------------------------------------------------------
create policy pol_settings_select_staff_own on public.settings
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_settings_insert_staff_own on public.settings
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_settings_update_staff_own on public.settings
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_settings_select_super on public.settings
  for select using (is_super_admin(auth.uid()));

create policy pol_settings_insert_super on public.settings
  for insert with check (is_super_admin(auth.uid()));

create policy pol_settings_update_super on public.settings
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

create policy pol_settings_delete_super on public.settings
  for delete using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.23 whatsapp_logs â€” delivery log. Staff own gym read; create/update via
-- engine (staff-context writes: attempts increments, retries). Member never.
-- ----------------------------------------------------------------------------
create policy pol_whatsapp_logs_select_staff_own on public.whatsapp_logs
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_whatsapp_logs_insert_staff_own on public.whatsapp_logs
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_whatsapp_logs_update_staff_own on public.whatsapp_logs
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_whatsapp_logs_select_super on public.whatsapp_logs
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.24 whatsapp_campaigns â€” super_admin/gym_admin only (CRUD own gym).
-- ----------------------------------------------------------------------------
create policy pol_whatsapp_campaigns_select_admin on public.whatsapp_campaigns
  for select using (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  );

create policy pol_whatsapp_campaigns_insert_admin on public.whatsapp_campaigns
  for insert with check (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  );

create policy pol_whatsapp_campaigns_update_admin on public.whatsapp_campaigns
  for update using (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  )
  with check (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  );

create policy pol_whatsapp_campaigns_delete_admin on public.whatsapp_campaigns
  for delete using (
    is_super_admin(auth.uid())
    or ((select role from public.profiles where id = auth.uid()) = 'gym_admin'
        and gym_id = auth_gym_id())
  );

-- ----------------------------------------------------------------------------
-- 4.25 licensed_devices â€” staff own gym CRUD; super_admin cross-gym
-- (DeviceManagement).
-- ----------------------------------------------------------------------------
create policy pol_licensed_devices_select_staff_own on public.licensed_devices
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_licensed_devices_insert_staff_own on public.licensed_devices
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_licensed_devices_update_staff_own on public.licensed_devices
  for update using (is_staff(auth.uid()) and gym_id = auth_gym_id())
  with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_licensed_devices_delete_staff_own on public.licensed_devices
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_licensed_devices_select_super on public.licensed_devices
  for select using (is_super_admin(auth.uid()));

create policy pol_licensed_devices_insert_super on public.licensed_devices
  for insert with check (is_super_admin(auth.uid()));

create policy pol_licensed_devices_update_super on public.licensed_devices
  for update using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

create policy pol_licensed_devices_delete_super on public.licensed_devices
  for delete using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.26 license_history â€” staff own gym read; super_admin all.
-- ----------------------------------------------------------------------------
create policy pol_license_history_select_staff_own on public.license_history
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_license_history_select_super on public.license_history
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.27 referral_codes â€” directory. Read = any authenticated; create = code
-- owner only (referrer_uid = auth_firebase_uid() AND user's own referral_code
-- = code â€” mirror of firestore.rules 478-487); update/delete = none.
-- ----------------------------------------------------------------------------
create policy pol_referral_codes_select_authenticated on public.referral_codes
  for select to authenticated using (true);

create policy pol_referral_codes_insert_owner on public.referral_codes
  for insert with check (
    referrer_uid = auth_firebase_uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.referral_code = code
    )
  );

-- ----------------------------------------------------------------------------
-- 4.28 referrals â€” PK = referred_uid (deterministic doc key = referred user's
-- Firebase UID). Referrer read own outbound; member read own (referred_uid =
-- auth_firebase_uid() â€” path-wildcard doc-key semantics of Sprint 81H);
-- gym_admin read own gym; super_admin all; create via transaction (Spark
-- client path â€” deterministic doc key makes it idempotent).
-- ----------------------------------------------------------------------------
create policy pol_referrals_select_referrer_own on public.referrals
  for select using (referrer_uid = auth_firebase_uid());

create policy pol_referrals_select_referred_own on public.referrals
  for select using (referred_uid = auth_firebase_uid());

create policy pol_referrals_select_gymadmin_own on public.referrals
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'gym_admin'
    and gym_id = auth_gym_id()
  );

create policy pol_referrals_select_super on public.referrals
  for select using (is_super_admin(auth.uid()));

create policy pol_referrals_insert_transaction on public.referrals
  for insert with check (referred_uid = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.29 reward_ledger â€” owner read own; gym_admin own gym; super_admin all.
-- ----------------------------------------------------------------------------
create policy pol_reward_ledger_select_owner on public.reward_ledger
  for select using (
    user_id = auth_firebase_uid()
    or referrer_uid = auth_firebase_uid()
    or referred_uid = auth_firebase_uid()
  );

create policy pol_reward_ledger_select_gymadmin_own on public.reward_ledger
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'gym_admin'
    and gym_id = auth_gym_id()
  );

create policy pol_reward_ledger_select_super on public.reward_ledger
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.30 discount_coupons â€” owner read own; staff own gym; super_admin all.
-- ----------------------------------------------------------------------------
create policy pol_discount_coupons_select_owner on public.discount_coupons
  for select using (user_id = auth_firebase_uid());

create policy pol_discount_coupons_select_staff_own on public.discount_coupons
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_discount_coupons_select_super on public.discount_coupons
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.31 referral_audit_logs â€” staff/super_admin read; no client writes
-- (server/transaction path).
-- ----------------------------------------------------------------------------
create policy pol_referral_audit_logs_select_staff on public.referral_audit_logs
  for select using (
    is_staff(auth.uid())
    or performed_by = auth_firebase_uid()
    or target_uid = auth_firebase_uid()
  );

create policy pol_referral_audit_logs_select_super on public.referral_audit_logs
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.32 audit_log â€” super_admin read only (retention/archive per OQ #8).
-- ----------------------------------------------------------------------------
create policy pol_audit_log_select_super on public.audit_log
  for select using (is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4.33 ai_conversations â€” owner only (user_id = auth_firebase_uid());
-- update denied once deleted (trigger guard_ai_conversation_update);
-- no delete policy.
-- ----------------------------------------------------------------------------
create policy pol_ai_conversations_select_owner on public.ai_conversations
  for select using (user_id = auth_firebase_uid());

create policy pol_ai_conversations_insert_owner on public.ai_conversations
  for insert with check (user_id = auth_firebase_uid());

create policy pol_ai_conversations_update_owner on public.ai_conversations
  for update using (user_id = auth_firebase_uid())
  with check (user_id = auth_firebase_uid());

-- ----------------------------------------------------------------------------
-- 4.34 ai_conversation_messages â€” child; owner via parent join
-- (FK subquery on conversation owner). No update/delete (immutable transcript).
-- ----------------------------------------------------------------------------
create policy pol_ai_conversation_messages_select_owner on public.ai_conversation_messages
  for select using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth_firebase_uid()
    )
  );

create policy pol_ai_conversation_messages_insert_owner on public.ai_conversation_messages
  for insert with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth_firebase_uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 4.35 generated_reports â€” staff own gym read/write/delete; super_admin all.
-- ----------------------------------------------------------------------------
create policy pol_generated_reports_select_staff_own on public.generated_reports
  for select using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_generated_reports_insert_staff_own on public.generated_reports
  for insert with check (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_generated_reports_delete_staff_own on public.generated_reports
  for delete using (is_staff(auth.uid()) and gym_id = auth_gym_id());

create policy pol_generated_reports_select_super on public.generated_reports
  for select using (is_super_admin(auth.uid()));

-- ============================================================================
-- End of migration 0002 â€” RLS complete for all 35 tables.
-- ============================================================================