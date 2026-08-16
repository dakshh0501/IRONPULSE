-- IRONPULSE Step 4 — Remote schema verification (read-only; no data written)
-- Prints a PASS/FAIL summary of every required object count.
\pset pager off
\echo '=== IRONPULSE REMOTE SCHEMA VERIFICATION ==='

select 'tables' as object,
       count(*)::int as actual,
       35 as expected,
       case when count(*) = 35 then 'PASS' else 'FAIL' end as result
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE';

select 'enums' as object,
       count(*)::int as actual,
       19 as expected,
       case when count(*) = 19 then 'PASS' else 'FAIL' end as result
  from pg_type t
 where t.typnamespace = 'public'::regnamespace and t.typtype = 'e';

select 'indexes' as object,
       count(*)::int as actual,
       null as expected,
       case when count(*) >= 100 then 'PASS (>=100)' else 'CHECK' end as result
  from pg_indexes
 where schemaname = 'public';

select 'foreign_keys' as object,
       count(*)::int as actual,
       79 as expected,
       case when count(*) = 79 then 'PASS' else 'FAIL' end as result
  from information_schema.table_constraints
 where table_schema = 'public' and constraint_type = 'FOREIGN KEY';

select 'rls_policies' as object,
       count(*)::int as actual,
       145 as expected,
       case when count(*) = 145 then 'PASS' else 'FAIL' end as result
  from pg_policies
 where schemaname = 'public';

select 'triggers' as object,
       count(*)::int as actual,
       26 as expected,
       case when count(*) = 26 then 'PASS' else 'FAIL' end as result
  from information_schema.triggers
 where trigger_schema = 'public';

select 'rls_enabled_tables' as object,
       count(*)::int as actual,
       35 as expected,
       case when count(*) = 35 then 'PASS' else 'FAIL' end as result
  from pg_tables
 where schemaname = 'public' and rowsecurity = true;

select 'helper_functions' as object,
       count(*)::int as actual,
       8 as expected,
       case when count(*) = 8 then 'PASS' else 'FAIL' end as result
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in
       ('auth_firebase_uid','auth_gym_id','is_super_admin','is_staff',
        'set_updated_at','guard_profiles_update','guard_ai_conversation_update',
        'guard_settings_gym');

-- Unexpected IRONPULSE tables check: list any public tables beyond the 35 expected
\echo ''
\echo '=== UNEXPECTED TABLES (should be empty) ==='
select tablename
  from pg_tables
 where schemaname = 'public'
   and tablename not in (
     'profiles','gyms','trainers','members','plans','plan_templates',
     'subscriptions','subscription_history','payment_attempts','diet_plans',
     'workout_plans','progress_logs','payments','attendance','notifications',
     'support_tickets','support_ticket_replies','support_ticket_notes',
     'support_ticket_attachments','feature_requests','contact_messages',
     'settings','whatsapp_campaigns','whatsapp_logs','licensed_devices',
     'license_history','referral_codes','referrals','reward_ledger',
     'discount_coupons','referral_audit_logs','audit_log','ai_conversations',
     'ai_conversation_messages','generated_reports')
 order by 1;

\echo ''
\echo '=== DONE ==='