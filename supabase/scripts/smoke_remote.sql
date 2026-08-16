-- IRONPULSE Step 4 — RLS smoke test (remote; self-cleaning transaction).
-- Wraps everything in a single transaction and ROLLS BACK: no persistent data.
-- Requires: role anon/authenticated (Supabase default), auth schema with
-- uid(); uses request.jwt.claim.sub to simulate identities.
\pset pager off
\echo '=== IRONPULSE REMOTE RLS SMOKE TEST ==='

begin;

-- 0) seed Supabase auth.users mirror rows (needed for profiles FK)
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'super@test.com'),
  ('10000000-0000-0000-0000-000000000002', 'admin@test.com'),
  ('10000000-0000-0000-0000-000000000003', 'member@test.com')
on conflict (id) do nothing;

-- 1) seed data (superuser context bypasses RLS; circular FK resolved by
--    inserting the owner profile first)
insert into profiles (id, firebase_uid, email, role, gym_id, is_super_admin)
  values ('10000000-0000-0000-0000-000000000001', 'uid-super', 'super@test.com', 'super_admin', null, true);

insert into gyms (id, gym_name, owner_uid, status, approval_status)
  values ('gym-1', 'Test Gym', 'uid-super', 'active', 'approved');

insert into profiles (id, firebase_uid, email, role, gym_id, is_super_admin)
  values
  ('10000000-0000-0000-0000-000000000002', 'uid-admin', 'admin@test.com', 'gym_admin', 'gym-1', false),
  ('10000000-0000-0000-0000-000000000003', 'uid-member', 'member@test.com', 'member', 'gym-1', false);

insert into members (legacy_id, auth_uid, gym_id, name)
  values ('m-1', 'uid-member', 'gym-1', 'Test Member');

insert into payments (payment_id, invoice_no, gym_id, auth_uid, member_name, amount, paid)
  values ('IP-1', 'INV-1', 'gym-1', 'uid-member', 'Test Member', 100.00, 100.00);

insert into settings (gym_id, doc_id, data) values ('platform', 'billing', '{"trialDays": 14}');

-- 2) gym admin assertions
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);

select 'A1 admin reads own gym members' as test,
       count(*)::int as rows,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from members where gym_id = 'gym-1';

select 'A2 admin cannot read platform settings' as test,
       count(*)::int as rows,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result
  from settings where gym_id = 'platform';

select 'A3 admin reads own gym payments' as test,
       count(*)::int as rows,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from payments where gym_id = 'gym-1';

select 'A4 admin reads own gym' as test,
       count(*)::int as rows,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from gyms where id = 'gym-1';

reset role;

-- 3) member assertions
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);

select 'M1 member reads own member row' as test,
       count(*)::int as rows,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from members where auth_uid = 'uid-member';

select 'M2 member reads own payments' as test,
       count(*)::int as rows,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from payments where auth_uid = 'uid-member';

select 'M3 member cannot read settings' as test,
       count(*)::int as rows,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result
  from settings;

select 'M4 member cannot read other gyms' as test,
       count(*)::int as rows,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result
  from gyms where id <> 'gym-1';

reset role;

-- 4) settings gym-existence protection (guard_settings_gym trigger)
do $$
begin
  begin
    insert into settings (gym_id, doc_id, data) values ('gym-nope', 'theme', '{}');
    raise notice 'S1 settings trigger blocks invalid gym: FAIL';
  exception when others then
    if sqlerrm like '%does not reference an existing gym%' then
      raise notice 'S1 settings trigger blocks invalid gym: PASS';
    else
      raise;
    end if;
  end;
end $$;

-- 5) rollback: nothing persists
rollback;

\echo '=== SMOKE TEST COMPLETE (rolled back — no data persisted) ==='