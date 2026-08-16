-- ============================================================================
-- 0008 — Step 9A: securityService supabase branch
-- get_security_metrics() (0006) was granted to service_role only; the
-- super_admin UI (AppContext security metrics) calls it from the browser via
-- the anon-key client with the user's JWT. The in-function is_super_admin()
-- gate is the authorization boundary — the GRANT only admits the call.
-- ============================================================================

grant execute on function public.get_security_metrics() to authenticated;
