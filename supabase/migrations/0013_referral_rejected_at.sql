-- ============================================================================
-- 0013 — referrals.rejected_at persistence (B7)
-- ----------------------------------------------------------------------------
-- ReferralManagement.handleReject passes { status:'Rejected', rejectedAt: ... }
-- but the referrals table had no rejected_at column and update_referral_status
-- dropped it. This adds the column and extends the RPC (optional param, default
-- NULL) so the rejection timestamp persists. RLS is untouched (writes remain
-- RPC-only via update_referral_status; SELECT still staff/owner-scoped).
-- ============================================================================

alter table public.referrals
  add column if not exists rejected_at timestamptz;

create or replace function public.update_referral_status(
  p_referred_uid text,
  p_status       text,
  p_rejected_at  timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uid  uuid := auth.uid();
  actor_role text;
  actor_gym  text;
  row_gym    text;
begin
  select role, gym_id into actor_role, actor_gym
    from public.profiles where id = actor_uid;
  select gym_id into row_gym from public.referrals where referred_uid = p_referred_uid;

  if row_gym is null then
    raise exception 'update_referral_status: referral % not found', p_referred_uid;
  end if;
  if p_status not in ('Pending','Qualified','Rewarded','Rejected') then
    raise exception 'update_referral_status: invalid status "%"', p_status;
  end if;

  if not (is_super_admin(actor_uid)
      or (actor_role in ('gym_admin','gym_owner') and row_gym = actor_gym)) then
    raise exception 'update_referral_status: not authorized';
  end if;

  update public.referrals
     set status     = p_status,
         rejected_at = case when p_status = 'Rejected' then coalesce(p_rejected_at, now())
                            else null end
   where referred_uid = p_referred_uid;
end;
$$;

revoke all on function public.update_referral_status(text, text, timestamptz) from anon;
grant execute on function public.update_referral_status(text, text, timestamptz) to authenticated;