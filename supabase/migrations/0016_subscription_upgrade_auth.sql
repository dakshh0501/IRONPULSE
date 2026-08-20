-- ============================================================================
-- 0016_subscription_upgrade_auth.sql
-- ----------------------------------------------------------------------------
-- Fixes the production HTTP 400 "update_gym_subscription: super_admin required"
-- on the gym "Upgrade Plan -> Confirm Upgrade" flow.
--
-- Root cause: update_gym_subscription (0004) was super-admin-only. The client
-- gates on effectiveRole (gym_owner -> gym_admin via rbac.js), so gym owners
-- and gym admins pass client-side, then hit the server-side super-only check
-- -> 400 -> upgrade never applies.
--
-- Changes:
--   1. New authoritative plan_pricing table (read-only; test pricing preserved:
--      all paid plans = 100 paise = INR 1, Trial = 0). Server-side plan/amount
--      validation in the RPC (tolerates paise OR rupee-legacy amounts).
--   2. update_gym_subscription authz: super admin anywhere; gym_admin /
--      gym_owner ONLY for their own gym (profiles.gym_id, the canonical
--      tenancy key used by auth_gym_id()/update_referral_status). All other
--      roles denied. Same signature - no client call-site change.
--   3. subscriptions SELECT extended to gym_owner own gym (Checkout fallback
--      getSubscriptionById + superadmin drawer read).
--   4. subscription_history: SELECT extended to gym_owner own gym; new INSERT
--      policy for gym_admin/gym_owner own gym (previously super-only, which
--      broke addHistoryRecord after the RPC was fixed).
-- No schema/table changes to existing tables. Additive + CREATE OR REPLACE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Authoritative plan pricing (test pricing: INR 1 = 100 paise, Trial 0).
-- Read-only for clients (select policy only; no insert/update/delete policies).
-- ----------------------------------------------------------------------------
create table if not exists public.plan_pricing (
  plan         text primary key,
  amount_paise integer not null check (amount_paise >= 0),
  updated_at   timestamptz not null default now()
);

insert into public.plan_pricing (plan, amount_paise) values
  ('trial', 0), ('standard', 100), ('premium', 100), ('quarterly', 100),
  ('annual', 100), ('lifetime', 100), ('day pass', 100)
on conflict (plan) do update
  set amount_paise = excluded.amount_paise, updated_at = now();

alter table public.plan_pricing enable row level security;

drop policy if exists pol_plan_pricing_select on public.plan_pricing;
create policy pol_plan_pricing_select on public.plan_pricing
  for select using (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 2. Corrected update_gym_subscription (authz + plan/amount validation).
-- ----------------------------------------------------------------------------
create or replace function public.update_gym_subscription(p_gym_id text, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid  uuid := auth.uid();
  actor_role text;
  actor_gym  text;
  v_plan     text;
  v_alias    text;
  v_expected integer;
begin
  select role, gym_id into actor_role, actor_gym
    from public.profiles where id = actor_uid;

  if not (is_super_admin(actor_uid)
      or (actor_role in ('gym_admin','gym_owner') and p_gym_id = actor_gym)) then
    raise exception 'update_gym_subscription: not authorized';
  end if;

  -- Server-side plan validation against the authoritative pricing table.
  -- Only enforced when BOTH a plan identifier and an amount are present
  -- (suspend/expire/extend carry neither; reactivate carries planType only).
  v_plan := lower(coalesce(p_updates->>'planType', p_updates->>'planId', p_updates->>'plan', ''));
  if v_plan <> '' and p_updates ? 'amount' then
    v_alias := case v_plan
      when 'monthly'    then 'standard'
      when 'yearly'     then 'annual'
      when 'pro'        then 'premium'
      when 'enterprise' then 'lifetime'
      else v_plan
    end;
    select amount_paise into v_expected from public.plan_pricing where plan = v_alias;
    if v_expected is null then
      raise exception 'update_gym_subscription: unknown plan "%"', v_plan;
    end if;
    -- Accept paise (100) or rupee-legacy (1) forms of the authoritative price.
    if (p_updates->>'amount')::numeric <> v_expected
       and (p_updates->>'amount')::numeric * 100 <> v_expected then
      raise exception 'update_gym_subscription: amount % does not match plan % pricing %',
        p_updates->>'amount', v_alias, v_expected;
    end if;
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
-- 3. subscriptions SELECT: extend gym_admin own-gym policy to gym_owner
--    (Checkout getSubscriptionById fallback + superadmin drawer read).
-- ----------------------------------------------------------------------------
drop policy if exists pol_subscriptions_select_gymadmin_own on public.subscriptions;
create policy pol_subscriptions_select_gymadmin_own on public.subscriptions
  for select using (
    (select role from public.profiles where id = auth.uid()) in ('gym_admin','gym_owner')
    and gym_id = auth_gym_id()
  );

-- ----------------------------------------------------------------------------
-- 4. subscription_history: SELECT extended to gym_owner; new own-gym INSERT
--    (addHistoryRecord runs after every lifecycle RPC for gym_admin/gym_owner).
-- ----------------------------------------------------------------------------
drop policy if exists pol_subscription_history_select_gymadmin_own on public.subscription_history;
create policy pol_subscription_history_select_gymadmin_own on public.subscription_history
  for select using (
    (select role from public.profiles where id = auth.uid()) in ('gym_admin','gym_owner')
    and gym_id = auth_gym_id()
  );

drop policy if exists pol_subscription_history_insert_gymadmin_own on public.subscription_history;
create policy pol_subscription_history_insert_gymadmin_own on public.subscription_history
  for insert with check (
    (select role from public.profiles where id = auth.uid()) in ('gym_admin','gym_owner')
    and gym_id = auth_gym_id()
  );