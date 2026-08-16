-- 0009_rpc_fulfill_payment_fix.sql
-- Step 9B: fix 3 defects in public.fulfill_payment (first deployed via 0006).
--   DEFECT 1 (E2E #10): status never transitions pending -> success. The RPC
--             only *checked* status ('pending' guard) but never wrote it, so
--             every fulfilled attempt stayed 'pending' forever.
--   DEFECT 2 (E2E #36): duplicate SUCCESS webhook re-fulfilled. Because status
--             stayed 'pending', a retried/duplicate webhook passed the guard
--             again and created a second payment record + history row.
--   DEFECT 3 (E2E #35): gym.subscription.expiryDate had no fallback to
--             subscriptions.expiry_date (client pre-sets it for new/renewal),
--             so the gym jsonb sync wrote NULL over an unset field.
--
-- Design (exactly-once, concurrency-safe):
--   - SELECT ... FOR UPDATE serializes concurrent fulfillers (webhook vs
--     verify vs retry) on the attempt row.
--   - The conditional UPDATE (WHERE id = ... AND status = 'pending') is the
--     ATOMIC claim: the winner affects exactly 1 row and proceeds; losers
--     affect 0 rows and return already_processed WITHOUT writing payments /
--     history / notifications / gym sync.
--   - status = 'success' is written ONLY by the claim (attempt_status enum
--     value; 'success' exists in 0001). Edge functions never write status
--     (metadata-only after this RPC).
--   - Non-pending attempts (failed/cancelled/success) can never be claimed.
--   - expiryDate precedence: newly computed (upgrade) -> subscriptions
--     .expiry_date (client pre-set for new/renewal) -> existing gym jsonb
--     value. A valid expiry is never overwritten with NULL.
--   - payment record stays naturally idempotent (payment_id unique +
--     ON CONFLICT DO NOTHING), history/notifications are written only by the
--     single winner.
--
-- ACL re-asserted (same as 0007): service_role ONLY. CREATE OR REPLACE keeps
-- the old grants, so revoke+grant explicitly for auditable parity.

create or replace function public.fulfill_payment(
  p_attempt_id   uuid,
  p_transaction_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
  v_rows       int;
begin
  -- 1. Lock the attempt row (serializes webhook + verify + retries)
  select * into v_attempt
    from public.payment_attempts
   where id = p_attempt_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'status', '');
  end if;

  -- 2. ATOMIC CLAIM: pending -> success (DEFECT 1 + DEFECT 2 fix).
  --    Only the winner affects 1 row. Zero rows = already processed (success)
  --    or not claimable (failed/cancelled) -> idempotent no-op; the caller
  --    treats 'already' like success, and NO fulfillment work is repeated.
  update public.payment_attempts
     set status = 'success',
         updated_at = now()
   where id = p_attempt_id
     and status = 'pending';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object(
      'ok', false, 'already', true, 'code', 'already_processed',
      'status', v_attempt.status::text);
  end if;

  v_amount := round(coalesce(v_attempt.final_amount, 0) / 100, 2);
  v_new_plan := coalesce(v_attempt.plan, 'Standard');
  v_new_expiry := null;
  v_action := case v_attempt.type
                when 'renewal' then 'renewed'
                when 'upgrade' then 'upgraded'
                else 'activated'
              end;

  -- 3. Subscription fulfillment (renewal/upgrade/new parity with legacy)
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

  -- 4. Gym display name + auth_uid FK safety
  select gym_name into v_gym_name from public.gyms where id = v_attempt.gym_id;
  v_auth_ok := exists (
    select 1 from public.profiles where firebase_uid = v_attempt.auth_uid
  );

  -- 5. Payment record (natural idempotency via payment_id unique)
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

  -- 6. Gym subscription jsonb sync (dot-path parity with legacy gym doc)
  if v_attempt.gym_id is not null then
    select subscription into v_gsub
      from public.gyms
     where id = v_attempt.gym_id
     for update;

    if found then
      -- DEFECT 3 fix: expiryDate = computed (upgrade) -> subscriptions
      -- .expiry_date (client pre-set) -> existing gym jsonb value.
      v_gsub := v_gsub || jsonb_build_object(
        'planId',           coalesce(v_sub.plan_type, v_gsub->>'planType', v_new_plan),
        'planName',         coalesce(v_attempt.plan, v_gsub->>'planName', v_new_plan),
        'planType',         coalesce(v_sub.plan_type, v_gsub->>'planType', v_new_plan),
        'status',           'active',
        'paymentStatus',    'paid',
        'startDate',        coalesce(v_gsub->>'startDate', (now())::date::text),
        'expiryDate',       coalesce(v_new_expiry::text, v_sub.expiry_date::text, v_gsub->>'expiryDate'),
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

      -- 7. Subscription history (append-only audit; only the winner reaches here)
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

  -- 8. Payment-success notifications (sub_payment_success)
  --    gym admins/owners (high) + super admins (low, gym_id NULL - FK-safe).
  --    Dedup is free: only the winning caller (row lock + claim) reaches this point.
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
$function$;

-- ACL: service_role ONLY (matches 0007 hardening model).
revoke all on function public.fulfill_payment(uuid, text) from public;
revoke all on function public.fulfill_payment(uuid, text) from anon;
revoke all on function public.fulfill_payment(uuid, text) from authenticated;
grant execute on function public.fulfill_payment(uuid, text) to service_role;
