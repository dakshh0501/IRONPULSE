-- ============================================================================
-- 0014_profiles_self_signup_guard.sql
-- ----------------------------------------------------------------------------
-- C1 (CRITICAL) remediation: profiles self-insert privilege escalation.
--
-- Root cause (verified live):
--   pol_profiles_insert_self (0002_rls.sql:72-73) only constrains
--   `id = auth.uid()` at INSERT. `role`, `is_super_admin` and `gym_id` were
--   unconstrained on the insert path, and guard_profiles_update (0001:857) is
--   attached BEFORE UPDATE ONLY (0001:951). is_super_admin() (0001:818) trusts
--   profiles.role = 'super_admin' / profiles.is_super_admin. Therefore any
--   authenticated user could POST /rest/v1/profiles with their own id and
--   role='super_admin' (or is_super_admin=true) and obtain a full RLS bypass
--   on every table in the database.
--
-- Fix (smallest database-only change - no RLS weakening, no public RPC):
--   BEFORE INSERT trigger on profiles that normalizes self-registration:
--     * auth.uid() IS NULL (service-role / DB-internal context, e.g.
--       backfill_profiles executed under service_role)            -> pass through
--     * actor is already super_admin (legit provisioning, e.g.
--       backfill_profiles executed under an authenticated super JWT,
--       or any future trusted server path)                         -> pass through
--     * any other authenticated user (self-registration):
--         - role must be one of the two legitimate signup roles
--           ('pending', 'gym_owner_pending'); anything else - including
--           super_admin/gym_admin/gym_owner/trainer/admin/member/rejected -
--           is normalized to 'pending'
--         - is_super_admin forced false
--         - gym_id forced NULL (FK-safe; owners receive gym_id only at
--           approval via set_profile_gym_id)
--         - id forced to auth.uid() (defense in depth; RLS also enforces it)
--
-- Why the pass-through branches are safe:
--   * auth.uid() NULL  => no user JWT is in play (service role). The only
--     profiles-inserting server path today is backfill_profiles (super-only
--     body gate + service_role/authenticated ACL) - unchanged behaviour.
--   * super_admin actor => the actor already holds every privilege this
--     trigger protects (is_super_admin() returns true for them).
--
-- Why nothing else breaks:
--   * provisionProfile (authService.js:183, the ONLY client insert path)
--     inserts role 'gym_owner_pending' (owner signup) or 'pending', with
--     is_super_admin=false and gym_id=null - all preserved by the trigger.
--   * set_profile_role / set_profile_gym_id / approveUser / rejectUser all
--     UPDATE profiles (UPDATE guard unchanged) - unaffected.
--   * handle_referral_signup (AFTER INSERT, 0006) fires after this BEFORE
--     trigger and sees the normalized row - unaffected.
--   * No recursion: the trigger only mutates NEW and reads is_super_admin().
--
-- Mirrors the existing guard_profiles_update style (invoker, search_path
-- pinned, no dynamic SQL). No grants are changed; trigger functions require
-- no EXECUTE grants to fire.
-- ============================================================================

create or replace function public.guard_profiles_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_uid uuid := auth.uid();
  actor_super boolean := false;
begin
  -- Server-side provisioning (service role / DB context): pass through.
  if actor_uid is null then
    return new;
  end if;

  -- Legitimate super-admin provisioning: pass through.
  select coalesce(is_super_admin, false)
    into actor_super
    from profiles
   where id = actor_uid;

  if actor_super then
    return new;
  end if;

  -- Self-registration: the row must belong to the caller and carry only
  -- safe signup values. Anything else is normalized (never escalated).
  if new.id is distinct from actor_uid then
    raise exception 'profiles.id must equal the authenticated user';
  end if;

  if new.role not in ('pending'::public.user_role, 'gym_owner_pending'::public.user_role) then
    new.role := 'pending'::public.user_role;
  end if;
  new.is_super_admin := false;
  new.gym_id := null;

  return new;
end;
$$;

drop trigger if exists trg_profiles_insert_guard on public.profiles;
create trigger trg_profiles_insert_guard
  before insert on public.profiles
  for each row
  execute function public.guard_profiles_insert();