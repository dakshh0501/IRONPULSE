-- ============================================================================
-- IRONPULSE Supabase Migration 0003 — RPC Functions (Step 8C)
-- Applies to: supabase/migrations/0003_rpc.sql
-- Depends on: 0001_initial_schema.sql, 0002_rls.sql
--
-- Design per docs/FIRESTORE_SERVICE_MIGRATION.md §5 (RPC requirements).
-- security invoker: RLS policies on whatsapp_campaigns apply (admin-only
-- update), so a caller cannot bump stats on a campaign outside their gym.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- bump_campaign_stat — atomic jsonb_set increment on whatsapp_campaigns.stats
-- (replaces the Firestore FieldValue.increment dot-path update).
-- Field whitelist prevents arbitrary jsonb mutation.
-- ----------------------------------------------------------------------------
create or replace function public.bump_campaign_stat(
  p_campaign_id uuid,
  p_field       text,
  p_by          integer default 1
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_field not in ('sent', 'failed', 'pending', 'cancelled', 'total') then
    raise exception 'bump_campaign_stat: invalid stat field "%"', p_field;
  end if;

  update public.whatsapp_campaigns
     set stats       = jsonb_set(
                         stats,
                         array[p_field],
                         ((coalesce((stats ->> p_field)::int, 0) + coalesce(p_by, 1))::text)::jsonb
                       ),
         updated_at  = now()
   where id = p_campaign_id;
end;
$$;

revoke all on function public.bump_campaign_stat(uuid, text, integer) from anon;
grant execute on function public.bump_campaign_stat(uuid, text, integer) to authenticated;