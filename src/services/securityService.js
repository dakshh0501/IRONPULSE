/** Lazy supabase client */
async function getSupabaseClient() {
  const mod = await import('../lib/supabase')
  return mod.supabase
}

const EMPTY_METRICS = {
  totalGyms: 0,
  totalUsers: 0,
  activeSubscriptions: 0,
  activeLicenses: 0,
  totalDevices: 0,
  authUserCount: 0,
  platformStatus: 'degraded',
}

export async function fetchSecurityMetrics() {
  try {
    // Super-admin-only RPC (0006_rpc.sql get_security_metrics,
    // granted to authenticated in 0008_rpc_grant_security_metrics.sql). The
    // in-function is_super_admin gate is the authorization boundary.
    const client = await getSupabaseClient()
    const { data, error } = await client.rpc('get_security_metrics')
    if (error) throw error
    if (data && typeof data === 'object' && data.error) throw new Error(data.error)
    const m = (data && data.metrics) || {}
    return {
      totalGyms: m.totalGyms ?? 0,
      totalUsers: m.totalUsers ?? 0,
      activeSubscriptions: m.activeSubscriptions ?? 0,
      activeLicenses: m.activeLicenses ?? 0,
      totalDevices: m.totalDevices ?? 0,
      authUserCount: m.authUserCount ?? 0,
      platformStatus: m.platformStatus || 'operational',
    }
  } catch (err) {
    console.error('[securityService] fetchSecurityMetrics failed:', err)
    return { ...EMPTY_METRICS, error: err.message }
  }
}
