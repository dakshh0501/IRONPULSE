-- ============================================================================
-- 0012 — Wallet reward redemption RPC + gyms delete policy
-- ----------------------------------------------------------------------------
-- Fixes found by the FINAL_APPLICATION_FUNCTIONALITY audit:
--   1. MyRewards "Redeem" on wallet reward_ledger rows called redeem_discount_coupon
--      (coupon-table RPC) — wallet rows could never be redeemed.
--      New owner-only RPC: reward_ledger status 'available' -> 'used'.
--   2. gyms had select/insert/update policies but NO delete policy — the
--      "Delete Gym Account" flow and superadmin GymOwners cascade delete
--      silently affected 0 rows. New policy: super admin OR the gym owner.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. redeem_wallet_reward — reward_ledger has select-only policies.
-- Owner-only, one-shot ('available' -> 'used' + updated_at) — mirrors the
-- redeem_discount_coupon RPC semantics.
-- ----------------------------------------------------------------------------
create or replace function public.redeem_wallet_reward(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reward_ledger
     set status     = 'used',
         updated_at = now()
   where id = p_ledger_id
     and user_id = auth_firebase_uid()
     and status = 'available';
  if not found then
    raise exception 'redeem_wallet_reward: not found, not owned, or already redeemed';
  end if;
end;
$$;

revoke all on function public.redeem_wallet_reward(uuid) from anon;
grant execute on function public.redeem_wallet_reward(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. gyms delete policy — super admin OR the gym owner (owner_uid).
-- FK `on delete cascade` already wipes all gym-scoped tables.
-- ----------------------------------------------------------------------------
create policy pol_gyms_delete_super_or_owner on public.gyms
  for delete
  using (is_super_admin(auth.uid()) or auth_firebase_uid() = owner_uid);

-- ----------------------------------------------------------------------------
-- 3. guard_profiles_update — FK-cascade exemption.
-- gyms delete cascades `profiles.gym_id ON DELETE SET NULL`; that internal
-- UPDATE fires guard_profiles_update and previously raised `gym_id is not
-- user-writable` for non-super actors, so a gym owner deleting their OWN gym
-- failed with P0001 (super admin passed because actor_super=true).
-- Exemption: when gym_id is being cleared AND the referenced gym row no
-- longer exists, this is the FK cascade, not a user write — allow it.
-- No other guard paths change (role/is_super_admin/account_disabled and
-- referral_code immutability still enforced for non-super actors).
-- ----------------------------------------------------------------------------
create or replace function public.guard_profiles_update()
returns trigger
language plpgsql
as $$
declare
  actor_uid uuid := auth.uid();
  actor_super boolean := false;
  gym_deleted boolean := false;
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

  if old.gym_id is not null
     and new.gym_id is null
     and not exists (select 1 from gyms g where g.id = old.gym_id) then
    gym_deleted := true;
  end if;

  if not actor_super and not gym_deleted then
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
