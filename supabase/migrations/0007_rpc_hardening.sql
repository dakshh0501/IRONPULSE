-- 0007_rpc_hardening.sql
-- Step 8H: close the PUBLIC-EXECUTE gap left by 0006.
-- REVOKE ... FROM anon, authenticated does NOT remove the default PUBLIC
-- grant (postgres grants EXECUTE to PUBLIC at function creation). These
-- revokes ensure only the intended roles can invoke sensitive RPCs.
--
-- Access model (matches the in-function gates):
--   fulfill_payment          -> service_role ONLY (no in-function auth gate — payment
--                                fulfillment must never be user-invocable)
--   delete_auth_user         -> service_role + authenticated (body gates super admin)
--   get_security_metrics     -> service_role + authenticated (body gates super admin)
--   backfill_profiles        -> service_role + authenticated (body gates super admin)
--   plan_duration_membership -> authenticated (0006 intent; helper used by definer)

revoke all on function public.fulfill_payment(uuid, text) from public;
revoke all on function public.delete_auth_user(text) from public;
revoke all on function public.get_security_metrics() from public;
revoke all on function public.backfill_profiles() from public;
revoke all on function public.plan_duration_membership(text) from public;

grant execute on function public.fulfill_payment(uuid, text) to service_role;

grant execute on function public.delete_auth_user(text) to service_role;
grant execute on function public.delete_auth_user(text) to authenticated;

grant execute on function public.get_security_metrics() to service_role;
grant execute on function public.get_security_metrics() to authenticated;

grant execute on function public.backfill_profiles() to service_role;
grant execute on function public.backfill_profiles() to authenticated;

grant execute on function public.plan_duration_membership(text) to authenticated;
