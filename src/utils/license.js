/** Lazy supabase client */
async function getSupabaseClient() {
  const mod = await import('../lib/supabase')
  return mod.supabase
}

let ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateLicenseKey() {
  const seg = () => {
    const a = new Uint8Array(4)
    crypto.getRandomValues(a)
    return Array.from(a, b => ALPHABET[b % 36]).join('')
  }
  return `IRP-${seg()}-${seg()}-${seg()}`
}

export async function generateUniqueLicenseKey() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = generateLicenseKey()

    // gyms.subscription is jsonb — filter on the key path.
    // Callers are always super_admin (approveGymOwner / LicenseKeys), who
    // bypass RLS, so the query never fails on visibility.
    try {
      const client = await getSupabaseClient()
      const { data, error } = await client
        .from('gyms')
        .select('id')
        .eq('subscription->>licenseKey', key)
        .limit(1)
      if (error) throw error
      if (!data || data.length === 0) return key
    } catch (e) {
      console.error('[license] supabase uniqueness check failed (falling back to pure-random key):', e?.message || e)
      return key
    }
  }
  throw new Error('Unable to generate a unique license key after 10 attempts')
}
