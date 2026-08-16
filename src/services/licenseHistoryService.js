import { subscribeRealtime } from './realtimeService'

// Supabase license_history row → Firestore-shaped record
function mapLicenseHistoryRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id || '',
    deviceId: r.device_id || '',
    action: r.action || '',
    performedBy: r.performed_by || '',
    createdAt: r.created_at || null,
  }
}

function licenseHistorySubscribe({ filter, label, callback }) {
  return subscribeRealtime({
    table: 'license_history',
    filter,
    orderBy: { column: 'created_at', ascending: false },
    limit: 1000,
    mapRow: mapLicenseHistoryRow,
    onChange: callback,
    onError: (e) => console.error(`[Supabase] ${label} realtime error:`, e.message),
    label,
  })
}

export function subscribeToLicenseHistory(gymId, callback) {
  if (!gymId) return () => {}
  return licenseHistorySubscribe({ filter: [['gym_id', gymId]], label: 'licenseHistory', callback })
}

export function subscribeToAllLicenseHistory(callback) {
  return licenseHistorySubscribe({ filter: [], label: 'allLicenseHistory', callback })
}

export async function addLicenseHistory(record) {
  return supabaseAddLicenseHistory(record)
}

// ============================================================================
// SUPABASE DATA PLANE (Step 8E)
// ============================================================================
let _supabaseClient = null
async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient
  const m = await import('../lib/supabase')
  _supabaseClient = m.supabase
  return _supabaseClient
}

function mapSupabaseError(err, fallbackMsg) {
  const msg = (err && (err.message || err.details || err.hint)) || String(err || fallbackMsg || 'Supabase error')
  const codeStr = msg + ' ' + (err && err.code ? String(err.code) : '')
  const code =
    /42501|42502|42504|permission denied|row-level security|new row violates/i.test(codeStr) ? 'permission-denied'
    : /23505|duplicate key|already exists/i.test(codeStr) ? 'already-exists'
    : /PGRST116|404|not found/i.test(codeStr) ? 'not-found'
    : /network|fetch failed|ECONN|timeout|Failed to fetch/i.test(codeStr) ? 'unavailable'
    : /22P02|22007|23514|invalid input|invalid enum|violates check/i.test(codeStr) ? 'invalid-argument'
    : /23503|foreign key/i.test(codeStr) ? 'foreign-key-violation'
    : undefined
  const error = new Error(msg)
  if (code) error.code = code
  return error
}

async function supabaseAddLicenseHistory(record) {
  const client = await getSupabaseClient()
  const { error } = await client.rpc('log_license_history', {
    p_gym_id: record.gymId,
    p_device_id: record.deviceId || null,
    p_action: record.action || 'action',
  })
  if (error) throw mapSupabaseError(error, 'Failed to log license history')
}
