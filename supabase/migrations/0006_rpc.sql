-- ============================================================================
-- 0006_rpc.sql — Step 8G: Supabase backend for the 10 Firebase Cloud Functions
-- ----------------------------------------------------------------------------
-- Contents:
--   1. payment_attempts schema deltas (merchantTransactionId + provider fields)
--   2. plan_duration_membership(text)  — PLAN_DURATIONS port
--   3. fulfill_payment(...)            — ATOMIC fulfillment core (Phase 7):
--        replaces fulfillSubscriptionPayment + createPaymentRecordInTransaction
--        + notifyPaymentSuccess with ONE security-definer RPC transaction.
--   4. delete_auth_user(text)          — replaces deleteAuthUser (super only)
--   5. get_security_metrics()          — replaces getSecurityMetrics (super only)
--   6. backfill_profiles()             — replaces backfillMissingProfiles (super)
--   7. handle_referral_signup()        — replaces onReferralSignup (DB trigger)
--
-- Security: every function is SECURITY DEFINER with an in-function role gate
-- (is_super_admin / role checks) — precedent set by 0004_rpc.sql. The heavy
-- lifts run under the service role from Edge Functions (gateway-verified
-- JWTs); SQL gates are defense in depth.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. payment_attempts schema deltas
--    nullable — only new server-side writes populate these; no backfill needed.
-- ----------------------------------------------------------------------------
alter table public.payment_attempts
  add column merchant_transaction_id  text,
  add column phonepe_state            text,
  add column response_code            text,
  add column callback_amount          numeric(12,2),
  add column cashfree_transaction_id  text;

-- ----------------------------------------------------------------------------
-- 2. plan_duration_membership(p_plan) — PLAN_DURATIONS port (functions/index.js:50)
-- ----------------------------------------------------------------------------
create or replace function public.plan_duration_membership(p_plan text)
returns int
language sql
immutable
as $$
  select case p_plan
    when 'Trial'    then 7
    when 'Day Pass' then 1
    when 'Standard' then 30
    when 'Premium'  then 30
    when 'Quarterly' then 90
    when 'Annual'   then 365
    when 'Lifetime' then 9999
    else 30
  end;
$$;

revoke all on function public.plan_duration_membership(text) from anon;
grant execute on function public.plan_duration_membership(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. fulfill_payment — ATOMIC payment fulfillment (single transaction)
-- ----------------------------------------------------------------------------
-- Mirrors functions/index.js fulfillSubscriptionPayment +
-- createPaymentRecordInTransaction + notifyPaymentSuccess.
--
-- Concurrency: SELECT ... FOR UPDATE on the attempt row serializes every
-- caller (webhook, verify, double-submit). First caller wins; every later
-- caller sees status <> 'pending' and short-circuits — no double payment
-- records, no double subscription updates, no double notifications.
--
-- Units (documented convention): payment_attempts.final_amount is in PAISE
-- (legacy parity with the PhonePe V1 API and the old Firestore schema);
-- payments.amount / subscriptions.amount / gyms.subscription.amount are in
-- RUPEES (schema convention used by the client and the legacy gym doc sync).
-- ----------------------------------------------------------------------------
create or replace function public.fulfill_payment(
  p_attempt_id   uuid,
  p_transaction_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt    public.payment_attempts%rowtype;
  v_sub        public.subscriptions%rowtype;
  v_gsub       jsonb;
  v_gym_name   text;
  v_auth_ok    boolean;
  v_new_plan   text;
  v_duration   int;
  v_expiry_base date;
  v_new_expiry date;
  v_amount     numeric(12,2);
  v_invoice_no text;
  v_action     text;
  v_date_part  text;
  v_rand_part  text;
  v_notif_base record;
begin
  -- 1. Lock the attempt row (serializes webhook + verify + retries)
  select * into v_attempt
    from public.payment_attempts
   where id = p_attempt_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'status', '');
  end if;

  if v_attempt.status <> 'pending' then
    return jsonb_build_object('ok', false, 'already', true, 'code', 'already_processed', 'status', v_attempt.status::text);
  end if;

  v_amount := round(coalesce(v_attempt.final_amount, 0) / 100, 2);
  v_new_plan := coalesce(v_attempt.plan, 'Standard');
  v_new_expiry := null;
  v_action := case v_attempt.type
                when 'renewal' then 'renewed'
                when 'upgrade' then 'upgraded'
                else 'activated'
              end;

  -- 2. Subscription fulfillment (renewal/upgrade/new parity with legacy)
  if v_attempt.subscription_id is not null and v_attempt.subscription_id <> '' then
    select * into v_sub
      from public.subscriptions
     where id::text = v_attempt.subscription_id;

    if found then
      if v_attempt.type = 'upgrade' then
        -- Upgrade: apply new plan, recompute dates extending from current expiry
        v_duration := public.plan_duration_membership(v_new_plan);
        v_expiry_base := greatest(coalesce(v_sub.expiry_date, current_date), current_date);
        v_new_expiry := v_expiry_base + v_duration;

        update public.subscriptions set
          plan             = v_new_plan,
          plan_name        = v_new_plan,
          plan_type        = v_new_plan,
          status           = 'active',
          payment_status   = 'paid',
          payment_method   = coalesce(v_attempt.payment_method, 'UPI'),
          transaction_id   = p_transaction_id,
          paid_at          = now(),
          expiry_date      = v_new_expiry,
          amount           = v_amount,
          pending_payment_type = null,
          updated_at       = now()
        where id::text = v_attempt.subscription_id;
      else
        -- Renewal / new: dates are pre-set by the client; mark paid + activate
        update public.subscriptions set
          status           = 'active',
          payment_status   = 'paid',
          payment_method   = coalesce(v_attempt.payment_method, 'UPI'),
          transaction_id   = p_transaction_id,
          paid_at          = now(),
          pending_payment_type = null,
          updated_at       = now()
        where id::text = v_attempt.subscription_id;
      end if;
    end if;
  end if;

  -- 3. Gym display name + auth_uid FK safety
  select gym_name into v_gym_name from public.gyms where id = v_attempt.gym_id;
  v_auth_ok := exists (
    select 1 from public.profiles where firebase_uid = v_attempt.auth_uid
  );

  -- 4. Payment record (natural idempotency via payment_id unique)
  v_date_part := to_char(current_date, 'YYYYMMDD');
  v_rand_part := upper(lpad(to_hex(floor(random() * 65536)::int), 4, '0'));
  v_invoice_no := 'INV-' || v_date_part || '-' || v_rand_part;

  insert into public.payments
    (payment_id, invoice_no, gym_id, auth_uid, member_name, amount, paid,
     status, plan, method, date, due, transaction_id, payment_gateway)
  values
    (v_attempt.payment_id, v_invoice_no, v_attempt.gym_id,
     case when v_auth_ok then v_attempt.auth_uid else null end,
     coalesce(v_gym_name, 'Subscription'),
     v_amount, v_amount, 'Paid',
     v_new_plan, coalesce(v_attempt.payment_method, 'UPI'),
     current_date, current_date,
     p_transaction_id, coalesce(v_attempt.payment_gateway, 'PhonePe'))
  on conflict (payment_id) do nothing;

  -- 5. Gym subscription jsonb sync (dot-path parity with legacy gym doc)
  if v_attempt.gym_id is not null then
    select subscription into v_gsub
      from public.gyms
     where id = v_attempt.gym_id
     for update;

    if found then
      v_gsub := v_gsub || jsonb_build_object(
        'planId',           coalesce(v_sub.plan_type, v_gsub->>'planType', v_new_plan),
        'planName',         coalesce(v_attempt.plan, v_gsub->>'planName', v_new_plan),
        'planType',         coalesce(v_sub.plan_type, v_gsub->>'planType', v_new_plan),
        'status',           'active',
        'paymentStatus',    'paid',
        'startDate',        coalesce(v_gsub->>'startDate', (now())::date::text),
        'expiryDate',       coalesce(v_new_expiry::text, v_gsub->>'expiryDate'),
        'amount',           v_amount,
        'currency',         'INR',
        'renewalCount',     (coalesce((v_gsub->>'renewalCount')::int, 0) + case when v_attempt.type = 'renewal' then 1 else 0 end),
        'lastPaymentId',    v_attempt.payment_id,
        'lastTransactionId', coalesce(p_transaction_id, v_gsub->>'lastTransactionId'),
        'updatedAt',        now()::text
      );

      update public.gyms
         set subscription = v_gsub,
             updated_at   = now()
       where id = v_attempt.gym_id;

      -- 6. Subscription history (append-only audit)
      if v_sub.id is not null then
        insert into public.subscription_history
          (gym_id, subscription_id, action, changes)
        values
          (v_attempt.gym_id, v_sub.id, v_action,
           jsonb_build_object(
             'planId',       coalesce(v_sub.plan_type, v_new_plan),
             'planName',     coalesce(v_attempt.plan, v_new_plan),
             'amount',       v_amount,
             'currency',     coalesce(v_attempt.currency, 'INR'),
             'status',       'active',
             'paymentId',    v_attempt.payment_id,
             'transactionId', p_transaction_id,
             'startDate',    coalesce(v_sub.started_at, now())::date::text,
             'expiryDate',   coalesce(v_new_expiry, v_sub.expiry_date)::text,
             'action',       v_action
           ));
      end if;
    end if;
  end if;

  -- 7. Payment-success notifications (sub_payment_success)
  --    gym admins/owners (high) + super admins (low, gym_id NULL — FK-safe).
  --    Dedup is free: only the winning caller (row lock) reaches this point.
  for v_notif_base in
    select firebase_uid as user_id, role, gym_id
      from public.profiles
     where gym_id = v_attempt.gym_id
       and role in ('admin', 'gym_admin', 'gym_owner')
  loop
    insert into public.notifications
      (user_id, gym_id, role, title, message, type, subtype, priority,
       icon, action_url, related_document_id, target_role)
    values
      (v_notif_base.user_id, v_attempt.gym_id, v_notif_base.role,
       'Payment Received',
       'Payment of ₹' || v_amount || ' for ' || coalesce(v_attempt.plan, 'Subscription') ||
         ' subscription was received successfully.',
       'subscription', 'sub_payment_success', 'high', '💳',
       '/subscriptions', v_attempt.payment_id, 'admin');
  end loop;

  for v_notif_base in
    select firebase_uid as user_id, role, gym_id
      from public.profiles
     where is_super_admin
  loop
    insert into public.notifications
      (user_id, gym_id, role, title, message, type, subtype, priority,
       icon, action_url, related_document_id, target_role)
    values
      (v_notif_base.user_id, null, 'super_admin',
       'Gym Payment Received',
       'Payment of ₹' || v_amount || ' received from gym ' ||
         coalesce(v_attempt.gym_id, '') || ' (' || coalesce(v_attempt.plan, 'Subscription') || ').',
       'subscription', 'sub_payment_success', 'low', '💳',
       '/subscriptions', v_attempt.payment_id, 'super_admin');
  end loop;

  return jsonb_build_object(
    'ok', true, 'status', 'success',
    'paymentId', v_attempt.payment_id,
    'invoiceNo', v_invoice_no,
    'transactionId', p_transaction_id
  );
end;
$$;

revoke all on function public.fulfill_payment(uuid, text) from anon;
revoke all on function public.fulfill_payment(uuid, text) from authenticated;
grant execute on function public.fulfill_payment(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 4. delete_auth_user(p_uid) — replaces deleteAuthUser (functions/index.js:2212)
--    Super-admin only; accepts a uuid OR a legacy firebase_uid string;
--    not-found is idempotent success (legacy parity).
-- ----------------------------------------------------------------------------
create or replace function public.delete_auth_user(p_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_id uuid;
begin
  if not public.is_super_admin(auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'Insufficient permissions: super_admin only');
  end if;

  if p_uid is null or p_uid = '' then
    return jsonb_build_object('success', false, 'error', 'uid is required');
  end if;

  -- Resolve auth.users.id from a uuid literal or a legacy firebase_uid
  if p_uid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_auth_id from auth.users where id = p_uid::uuid;
  else
    select p.id into v_auth_id
      from public.profiles p
     where p.firebase_uid = p_uid;
  end if;

  if v_auth_id is null then
    return jsonb_build_object('success', true, 'error', null); -- idempotent
  end if;

  delete from auth.users where id = v_auth_id; -- cascades profiles

  return jsonb_build_object('success', true, 'error', null);
end;
$$;

revoke all on function public.delete_auth_user(text) from anon;
revoke all on function public.delete_auth_user(text) from authenticated;
grant execute on function public.delete_auth_user(text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. get_security_metrics() — replaces getSecurityMetrics (functions/index.js:2246)
--    Super-admin only.
-- ----------------------------------------------------------------------------
create or replace function public.get_security_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_total_gyms         int;
  v_total_users        int;
  v_active_subs        int;
  v_active_licenses    int;
  v_total_devices      int;
  v_auth_user_count    int;
begin
  if not public.is_super_admin(auth.uid()) then
    return jsonb_build_object('error', 'Insufficient permissions: super_admin only', 'metrics', null);
  end if;

  select count(*) into v_total_gyms       from public.gyms;
  select count(*) into v_total_users      from public.profiles;
  select count(*) into v_active_subs      from public.subscriptions where status = 'active';
  select count(*) into v_active_licenses  from public.gyms where subscription->>'licenseStatus' = 'active';
  select count(*) into v_total_devices    from public.licensed_devices;
  select count(*) into v_auth_user_count  from auth.users;

  return jsonb_build_object('error', null, 'metrics', jsonb_build_object(
    'totalGyms',         v_total_gyms,
    'totalUsers',        v_total_users,
    'activeSubscriptions', v_active_subs,
    'activeLicenses',    v_active_licenses,
    'totalDevices',      v_total_devices,
    'authUserCount',     v_auth_user_count,
    'platformStatus',    'operational'
  ));
end;
$$;

revoke all on function public.get_security_metrics() from anon;
revoke all on function public.get_security_metrics() from authenticated;
grant execute on function public.get_security_metrics() to service_role;

-- ----------------------------------------------------------------------------
-- 6. backfill_profiles() — replaces backfillMissingProfiles (functions/index.js:2082)
--    Super-admin only. For every auth.users row without a profiles row, recover
--    role/gym from members/trainers/gyms by EMAIL (Postgres join by email is
--    the only reliable signal: auth.users.id is a new uuid, not the legacy
--    Firebase uid stored in members.auth_uid); fallback role 'pending'.
-- ----------------------------------------------------------------------------
create or replace function public.backfill_profiles()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user      record;
  v_backfilled int := 0;
  v_skipped   int := 0;
  v_errors    int := 0;
  v_firebase_uid text;
  v_role      text;
  v_gym_id    text;
  v_name      text;
  v_email     text;
  v_status    text;
begin
  if not public.is_super_admin(auth.uid()) then
    return jsonb_build_object('error', 'Insufficient permissions: super_admin only',
                              'backfilled', 0, 'skipped', 0, 'errors', 0);
  end if;

  for v_user in select * from auth.users
  loop
    begin
      if exists (select 1 from public.profiles where id = v_user.id) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_firebase_uid := v_user.id::text; -- self-reference convention (8B)
      v_role := 'pending';
      v_gym_id := null;
      v_name := null;
      v_email := v_user.email;
      v_status := null;

      -- Recover from members by email
      select m.auth_uid, m.name, m.gym_id
        into v_firebase_uid, v_name, v_gym_id
        from public.members m
       where lower(coalesce(m.email, '')) = lower(coalesce(v_email, ''))
       limit 1;
      if v_firebase_uid is not null and v_firebase_uid <> v_user.id::text then
        v_role := 'member';
      else
        v_firebase_uid := v_user.id::text;
        v_name := null;
        v_gym_id := null;
      end if;

      if v_role = 'pending' then
        -- Recover from trainers by email
        select t.auth_uid, t.name, t.gym_id
          into v_firebase_uid, v_name, v_gym_id
          from public.trainers t
         where lower(coalesce(t.email, '')) = lower(coalesce(v_email, ''))
         limit 1;
        if found then
          v_role := 'trainer';
          v_firebase_uid := coalesce(v_firebase_uid, v_user.id::text);
        else
          v_firebase_uid := v_user.id::text;
          v_name := null;
          v_gym_id := null;
        end if;
      end if;

      if v_role = 'pending' then
        -- Recover from gyms by owner email (gym owners)
        select g.owner_uid, g.owner_name, g.id, g.approval_status::text
          into v_firebase_uid, v_name, v_gym_id, v_status
          from public.gyms g
         where lower(coalesce(g.email, '')) = lower(coalesce(v_email, ''))
         limit 1;
        if found then
          v_role := case v_status
                      when 'approved'  then 'gym_owner'
                      when 'suspended' then 'gym_owner'
                      when 'rejected'  then 'rejected'
                      else 'gym_owner_pending'
                    end;
          v_firebase_uid := coalesce(v_firebase_uid, v_user.id::text);
        else
          v_firebase_uid := v_user.id::text;
          v_name := null;
          v_gym_id := null;
        end if;
      end if;

      insert into public.profiles
        (id, firebase_uid, email, name, role, gym_id, is_super_admin)
      values
        (v_user.id, v_firebase_uid, v_email, coalesce(v_name, v_user.raw_user_meta_data->>'name'), v_role, v_gym_id, false);

      v_backfilled := v_backfilled + 1;
    exception
      when others then
        v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object('backfilled', v_backfilled, 'skipped', v_skipped, 'errors', v_errors, 'error', null);
end;
$$;

revoke all on function public.backfill_profiles() from anon;
revoke all on function public.backfill_profiles() from authenticated;
grant execute on function public.backfill_profiles() to service_role;

-- ----------------------------------------------------------------------------
-- 7. handle_referral_signup — replaces onReferralSignup
--    (functions/index.js:732, Sprint 81A). Atomic: fires in the SAME
--    transaction as the profile INSERT. Idempotent: referrals PK is
--    referred_uid, so a duplicate signup/retry can never double-write.
-- ----------------------------------------------------------------------------
create or replace function public.handle_referral_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer  public.profiles%rowtype;
  v_inserted  boolean;
begin
  -- Format-only fast path (client validates; never trust data anyway)
  if NEW.referred_by is null or NEW.referred_by = '' then
    return NEW;
  end if;
  if NEW.referred_by !~ '^IP-[A-Z0-9]{6}$' then
    return NEW;
  end if;
  -- Gym owners never qualify for member referral rewards (81A parity)
  if NEW.role in ('gym_owner', 'gym_owner_pending') then
    return NEW;
  end if;

  -- Resolve the referrer (self-referral is impossible — referrer != NEW uid)
  select * into v_referrer
    from public.profiles
   where referral_code = NEW.referred_by
     and firebase_uid <> NEW.firebase_uid
   limit 1;

  if not found then
    return NEW;
  end if;

  insert into public.referrals
    (referred_uid, referrer_uid, referral_code, gym_id, referred_name, status)
  values
    (NEW.firebase_uid, v_referrer.firebase_uid, NEW.referred_by, NEW.gym_id, NEW.name, 'Pending')
  on conflict (referred_uid) do nothing;

  v_inserted := found;

  if v_inserted then
    -- Referrer notification
    insert into public.notifications
      (user_id, gym_id, role, title, message, type, subtype, priority,
       icon, action_url, related_document_id, target_role)
    values
      (v_referrer.firebase_uid, v_referrer.gym_id, v_referrer.role,
       'New Referral Registered',
       'Someone signed up with your referral code ' || NEW.referred_by || '.',
       'referral', 'referral_registered', 'normal', '🎉',
       '/referral', NEW.firebase_uid, 'member');

    -- Referred user notification
    insert into public.notifications
      (user_id, gym_id, role, title, message, type, subtype, priority,
       icon, action_url, related_document_id, target_role)
    values
      (NEW.firebase_uid, NEW.gym_id, NEW.role,
       'Referral Applied',
       'Your referral code ' || NEW.referred_by || ' has been recorded.',
       'referral', 'referral_applied', 'normal', '✅',
       '/referral', NEW.firebase_uid, 'member');

    -- Audit entry
    insert into public.referral_audit_logs
      (action, performed_by, target_uid, referral_id, metadata)
    values
      ('registered', v_referrer.firebase_uid, NEW.firebase_uid, NEW.firebase_uid,
       jsonb_build_object('code', NEW.referred_by, 'gymId', NEW.gym_id));
  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_referral_signup() from anon;

drop trigger if exists trg_referral_signup on public.profiles;
create trigger trg_referral_signup
  after insert on public.profiles
  for each row
  execute function public.handle_referral_signup();
