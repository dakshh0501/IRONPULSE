-- ============================================================================
-- IRONPULSE Supabase Migration 0015 - Security Remediation Gym Scoping (A1-A4)
-- Applies to: supabase/migrations/0015_rls_gym_scoping.sql
-- Depends on: 0001_initial_schema.sql, 0002_rls.sql, 0014_profiles_self_signup_guard.sql
--
-- Purpose: close the four confirmed cross-tenant / privilege findings from
-- the final security remediation:
--
--   A1 - profiles SELECT: staff could read EVERY profile of EVERY gym
--        (pol_profiles_select_self_or_staff: `is_staff(auth.uid())` alone).
--        Fix: staff may read profiles of their OWN gym only (gym_id =
--        auth_gym_id()); super admin retains platform-wide read; own row
--        always readable (id = auth.uid()).
--
--   A2 - support_tickets member INSERT: a member could inject a ticket into
--        ANOTHER gym (pol_support_tickets_insert_member checked only
--        created_by = auth_firebase_uid()). Fix: ticket gym_id must equal
--        the member's own gym (auth_gym_id()) - fail-closed for members
--        without a gym.
--
--   A3 - notifications staff INSERT: staff could write a notification into
--        any gym (or NULL gym) with an arbitrary user_id
--        (pol_notifications_insert_staff_own allowed gym_id = auth_gym_id()
--        OR gym_id IS NULL with no target check). Fix: super admin branch
--        unrestricted (platform-wide); staff branch requires gym_id =
--        auth_gym_id() AND the target profile (firebase_uid = user_id) to
--        belong to the same gym. The `gym_id IS NULL` escape is removed for
--        non-super staff. This also makes the Superadmin Broadcast (B2)
--        RLS-legal, since super admin may now insert rows addressed to any
--        gym.
--
--   A4 - referral_audit_logs staff SELECT: staff could read another gym's
--        referral audit trail (pol_referral_audit_logs_select_staff scoped
--        by is_staff() only). Fix: staff rows are visible only when the row's
--        gym (metadata->>'gymId' or the referrals table join by referral_id)
--        matches auth_gym_id(); performed_by/target_uid self branches and
--        the super admin branch are unchanged.
--
-- No schema changes, no RPC changes, no grants changed. Applied migrations
-- are never edited - all four fixes are drop/recreate policy statements.
-- 0014 (profiles self-signup guard) is NOT touched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1 - profiles SELECT: own row | super admin | staff-of-own-gym
-- ----------------------------------------------------------------------------
drop policy if exists pol_profiles_select_self_or_staff on public.profiles;

create policy pol_profiles_select_self_or_staff on public.profiles
  for select using (
    id = auth.uid()
    or is_super_admin(auth.uid())
    or (is_staff(auth.uid()) and gym_id = auth_gym_id())
  );

-- ----------------------------------------------------------------------------
-- A2 - support_tickets member INSERT: own gym only (fail-closed)
-- ----------------------------------------------------------------------------
drop policy if exists pol_support_tickets_insert_member on public.support_tickets;

create policy pol_support_tickets_insert_member on public.support_tickets
  for insert with check (
    created_by = auth_firebase_uid()
    and gym_id = auth_gym_id()
  );

-- ----------------------------------------------------------------------------
-- A3 - notifications INSERT: super admin platform-wide; staff own gym +
--      target profile in same gym. `gym_id IS NULL` removed for staff.
-- ----------------------------------------------------------------------------
drop policy if exists pol_notifications_insert_staff_own on public.notifications;

create policy pol_notifications_insert_staff_own on public.notifications
  for insert with check (
    is_super_admin(auth.uid())
    or (
      is_staff(auth.uid())
      and gym_id = auth_gym_id()
      and exists (
        select 1 from public.profiles p
        where p.firebase_uid = user_id
          and p.gym_id = auth_gym_id()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- A4 - referral_audit_logs SELECT: staff scoped to own gym (via metadata
--      gymId or the referrals join); self branches and super admin kept.
-- ----------------------------------------------------------------------------
drop policy if exists pol_referral_audit_logs_select_staff on public.referral_audit_logs;

create policy pol_referral_audit_logs_select_staff on public.referral_audit_logs
  for select using (
    (is_staff(auth.uid()) and (
      metadata->>'gymId' = auth_gym_id()
      or exists (
        select 1 from public.referrals r
        where r.referred_uid = referral_id
          and r.gym_id = auth_gym_id()
      )
    ))
    or performed_by = auth_firebase_uid()
    or target_uid = auth_firebase_uid()
  );

-- ============================================================================
-- End of migration 0015 - security remediation gym scoping.
-- ============================================================================
