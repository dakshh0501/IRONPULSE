-- 0010_rpc_provision_fix.sql
-- ----------------------------------------------------------------------------
-- Production signup-blocker fix (HTTP 409 on profiles insert).
--
-- Root cause: provisionProfile inserted profiles with gym_id = 'gym-<ts>'
-- (gym owner) or 'default' (member) BEFORE the gyms row existed / with no
-- matching gyms row at all -> fk_profiles_gym violation (23503) -> PostgREST
-- 409 -> getUserProfile retries exhausted -> blank /dashboard for every new
-- self-signup after the Supabase cutover. Fixed client-side by inserting
-- gym_id NULL (profiles) and linking owners at approval time.
--
-- This migration provides the approval-side link:
--  1) set_profile_gym_id  - super-admin-only definer RPC that sets
--     profiles.gym_id (guard_profiles_update + self-only RLS forbid it via
--     PostgREST). Called by AppContext.approveGymOwner after set_profile_role.
--  2) set_profile_role    - CREATE OR REPLACE with an explicit ::user_role
--     cast. The deployed 0004 version assigns text to the user_role enum
--     column without a cast -> ERROR 42804 -> real approvals always failed
--     at the "user_role_updated" step. Same permission model, same signature.
-- ----------------------------------------------------------------------------

create or replace function public.set_profile_gym_id(p_uid text, p_gym_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid uuid := auth.uid();
begin
  if not is_super_admin(actor_uid) then
    raise exception 'set_profile_gym_id: super_admin required';
  end if;
  update public.profiles set gym_id = p_gym_id where firebase_uid = p_uid;
  if not found then
    raise exception 'set_profile_gym_id: no profile with firebase_uid %', p_uid;
  end if;
end;
$$;

revoke all on function public.set_profile_gym_id(text, text) from anon;
grant execute on function public.set_profile_gym_id(text, text) to authenticated;

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
  update public.profiles set role = p_role::user_role where firebase_uid = p_uid;
  if not found then
    raise exception 'set_profile_role: no profile with firebase_uid %', p_uid;
  end if;
end;
$$;

revoke all on function public.set_profile_role(text, text) from anon;
grant execute on function public.set_profile_role(text, text) to authenticated;