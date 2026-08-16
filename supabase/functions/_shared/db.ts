// _shared/db.ts — client factories for the payment Edge Functions.
// - adminClient(): service-role client (DB writes bypass RLS). The service
//   key is a platform-managed secret, present only in the server runtime.
// - userClient(authHeader): anon-key client carrying the caller's JWT —
//   used ONLY for auth.getUser(); all business reads/writes go through the
//   service-role client after role checks.

import { createClient, type SupabaseClient } from './supabase.ts'

const url = Deno.env.get('SUPABASE_URL') || ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

let _admin: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _admin
}

export function userClient(authHeader: string | null): SupabaseClient | null {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
