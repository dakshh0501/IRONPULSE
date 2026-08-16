-- ============================================================================
-- IRONPULSE Supabase Migration 0004 — Write-Path RPCs (Step 8E)
-- Applies to: supabase/migrations/0004_rpc.sql
-- Depends on: 0001_initial_schema.sql, 0002_rls.sql, 0003_rpc.sql
--
-- Purpose: eliminate remaining Firebase client write paths (attendance,
-- notifications, devices, licenses, referrals, conversations, support,
-- subscriptions) by expressing every write Supabase cannot express through
-- plain RLS-table access as an RPC.
--
-- Authorization model (uniform across all functions below):
--   * security definer (same precedent as auth_firebase_uid()/is_staff()
--     in 0001) — NOT service-role; the browser still calls with the user's
--     own JWT and every function re-checks the caller's identity/role.
--   * revoke anon, grant authenticated only (mirrors 0003).
--
-- Why RPC instead of new RLS policies: 0003 established the RPC layer for
-- exactly this class of operation; keeping every Step 8E write in one
-- reviewable, testable surface. Single-statement atomicity where the old
-- Firebase code used runTransaction/writeBatch (subscription jsonb merge,
-- referral insert) — never multi-write emulation in the browser.
--
-- Enum extensions (concrete blockers, see docs/FIREBASE_WRITE_PATH_AUDIT.md):
--   * device_status  += 'suspended'   (deviceService.suspendDevice writes it)
--   * coupon_status  += 'redeemed'    (referralService.redeemDiscountCoupon)
--   * referral_status+= 'Rejected'    (ReferralManagement.handleReject)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum extensions — required values the client legitimately writes that the
-- Step 3A enums rejected. Each is proven by a live client write path.
-- ----------------------------------------------------------------------------
alter type public.device_status  add value if not exists 'suspended';
alter type public.coupon_status  add value if not exists 'redeemed';
alter type public.referral_status add value if not exists 'Rejected';

-- ----------------------------------------------------------------------------
-- set_profile_role — approval flow (AppContext.approveGymOwner/rejectGymOwner).
-- profiles.role is trigger-guarded (guard_profiles_update); only the super
-- admin may change it. RLS has no cross-user UPDATE policy -> definer RPC.
-- ----------------------------------------------------------------------------
create or replace function public.set_profile_role(p_uid text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid uuid := auth.uid();
begin
  if not is_super_admin(actor_uid) then
    raise exception 'set_profile_role: super_admin required';
  end if;
  if p_role not in ('super_admin','gym_admin','gym_owner','trainer','member',
                    'pending','rejected','gym_owner_pending') then
    raise exception 'set_profile_role: invalid role "%"', p_role;
  end if;
  update public.profiles set role = p_role where firebase_uid = p_uid;
  if not found then
    raise exception 'set_profile_role: no profile with firebase_uid %', p_uid;
  end if;
end;
$$;

revoke all on function public.set_profile_role(text, text) from anon;
grant execute on function public.set_profile_role(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- update_gym_subscription — atomic jsonb merge of gyms.subscription.
-- Replaces the Firebase runTransaction (subscriptionService.updateGymSubscription
-- + AppContext dot-path writes). gyms UPDATE is super-only under RLS, so the
-- RPC keeps that exact permission model (gym-owner subscription self-service
-- remains a documented supabase-mode limitation, consistent with 8C §9).
-- ----------------------------------------------------------------------------
create or replace function public.update_gym_subscription(
  p_gym_id  text,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin(auth.uid()) then
    raise exception 'update_gym_subscription: super_admin required';
  end if;
  update public.gyms
     set subscription = coalesce(subscription, '{}'::jsonb) || coalesce(p_updates, '{}'::jsonb)
   where id = p_gym_id;
  if not found then
    raise exception 'update_gym_subscription: gym % not found', p_gym_id;
  end if;
end;
$$;

revoke all on function public.update_gym_subscription(text, jsonb) from anon;
grant execute on function public.update_gym_subscription(text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- delete_own_notification(s) — notifications has NO delete policy under RLS
-- (owner may select/update only). Owner-scoped definer deletes.
-- ----------------------------------------------------------------------------
create or replace function public.delete_own_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
   where id = p_id and user_id = auth_firebase_uid();
  if not found then
    raise exception 'delete_own_notification: not found or not owned';
  end if;
end;
$$;

revoke all on function public.delete_own_notification(uuid) from anon;
grant execute on function public.delete_own_notification(uuid) to authenticated;

create or replace function public.delete_own_notifications(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id <> auth_firebase_uid() then
    raise exception 'delete_own_notifications: may only clear your own';
  end if;
  delete from public.notifications where user_id = p_user_id;
end;
$$;

revoke all on function public.delete_own_notifications(text) from anon;
grant execute on function public.delete_own_notifications(text) to authenticated;

-- ----------------------------------------------------------------------------
-- update_referral_status — referrals has NO update policy under RLS.
-- Super admin anywhere; gym_admin/gym_owner for referrals inside their own
-- gym. Supports the ReferralManagement reject flow ('Rejected').
-- ----------------------------------------------------------------------------
create or replace function public.update_referral_status(
  p_referred_uid text,
  p_status       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid  uuid := auth.uid();
  actor_role text;
  actor_gym  text;
  row_gym    text;
begin
  select role, gym_id into actor_role, actor_gym
    from public.profiles where id = actor_uid;
  select gym_id into row_gym from public.referrals where referred_uid = p_referred_uid;

  if row_gym is null then
    raise exception 'update_referral_status: referral % not found', p_referred_uid;
  end if;
  if p_status not in ('Pending','Qualified','Rewarded','Rejected') then
    raise exception 'update_referral_status: invalid status "%"', p_status;
  end if;

  if not (is_super_admin(actor_uid)
      or (actor_role in ('gym_admin','gym_owner') and row_gym = actor_gym)) then
    raise exception 'update_referral_status: not authorized';
  end if;

  update public.referrals set status = p_status where referred_uid = p_referred_uid;
end;
$$;

revoke all on function public.update_referral_status(text, text) from anon;
grant execute on function public.update_referral_status(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- delete_referral — referrals has NO delete policy under RLS. Super only.
-- ----------------------------------------------------------------------------
create or replace function public.delete_referral(p_referred_uid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin(auth.uid()) then
    raise exception 'delete_referral: super_admin required';
  end if;
  delete from public.referrals where referred_uid = p_referred_uid;
  if not found then
    raise exception 'delete_referral: referral % not found', p_referred_uid;
  end if;
end;
$$;

revoke all on function public.delete_referral(text) from anon;
grant execute on function public.delete_referral(text) to authenticated;

-- ----------------------------------------------------------------------------
-- redeem_discount_coupon — discount_coupons has select-only policies.
-- Owner-only, one-shot ('available' -> 'redeemed' + used_at) — mirrors the
-- Firebase updateDoc semantics without a client-side read-then-write.
-- ----------------------------------------------------------------------------
create or replace function public.redeem_discount_coupon(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.discount_coupons
     set status  = 'redeemed',
         used_at = now()
   where id = p_coupon_id
     and user_id = auth_firebase_uid()
     and status = 'available';
  if not found then
    raise exception 'redeem_discount_coupon: not found, not owned, or already redeemed';
  end if;
end;
$$;

revoke all on function public.redeem_discount_coupon(uuid) from anon;
grant execute on function public.redeem_discount_coupon(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- log_license_history — license_history has select-only policies. Staff may
-- append rows for their own gym (super anywhere). performed_by = caller.
-- ----------------------------------------------------------------------------
create or replace function public.log_license_history(
  p_gym_id     text,
  p_device_id  text,
  p_action     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid uuid := auth.uid();
begin
  if not is_staff(actor_uid) then
    raise exception 'log_license_history: staff required';
  end if;
  if not is_super_admin(actor_uid) and p_gym_id <> auth_gym_id() then
    raise exception 'log_license_history: gym mismatch';
  end if;
  insert into public.license_history (gym_id, device_id, action, performed_by)
  values (p_gym_id, p_device_id, p_action, auth_firebase_uid());
end;
$$;

revoke all on function public.log_license_history(text, text, text) from anon;
grant execute on function public.log_license_history(text, text, text) to authenticated;
