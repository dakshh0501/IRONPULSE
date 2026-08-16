// _shared/auth.ts — callable-authentication for the payment Edge Functions.
// Mirrors the Firebase onCall role checks (functions/index.js):
// caller must exist in profiles; create-paths allow
// super_admin | gym_admin | gym_owner | admin; verify-paths also allow trainer.

import { adminClient, userClient } from './db.ts'
import type { SupabaseClient } from './supabase.ts'

export interface Caller {
  uid: string
  firebaseUid: string
  role: string
  gymId: string | null
  isSuperAdmin: boolean
}

const ROLE_KEYS = 'firebase_uid, role, gym_id, is_super_admin'

export async function authenticateCaller(
  req: Request,
): Promise<{ caller: Caller | null; error: string | null }> {
  const client: SupabaseClient | null = userClient(req.headers.get('Authorization'))
  if (!client) return { caller: null, error: 'Authentication required' }

  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id) return { caller: null, error: 'Authentication required' }

  const uid = data.user.id
  const { data: profile } = await adminClient()
    .from('profiles')
    .select(ROLE_KEYS)
    .eq('id', uid)
    .maybeSingle()

  if (!profile) return { caller: null, error: 'Caller profile not found' }

  return {
    caller: {
      uid,
      firebaseUid: profile.firebase_uid || '',
      role: profile.role || 'pending',
      gymId: profile.gym_id || null,
      isSuperAdmin: !!profile.is_super_admin,
    },
    error: null,
  }
}

export function isPaymentInitiator(role: string): boolean {
  return ['super_admin', 'gym_admin', 'gym_owner', 'admin'].includes(role)
}

export function isPaymentViewer(role: string): boolean {
  return isPaymentInitiator(role) || role === 'trainer'
}
