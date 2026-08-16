import { subscribeRealtime } from './realtimeService'

// Supabase generated_reports row → Firestore-shaped report
function mapGeneratedReportRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id || '',
    userId: r.user_id || '',
    userName: r.user_name || '',
    format: r.format || 'CSV',
    label: r.label || 'Report',
    dateRange: r.date_range || 'all',
    createdAt: r.created_at || null,
  }
}

export function subscribeToGeneratedReports(gymId, onChange, onError) {
  if (!gymId) {
    onChange([])
    return () => {}
  }
  return subscribeRealtime({
      table: 'generated_reports',
      filter: [['gym_id', gymId]],
      orderBy: { column: 'created_at', ascending: false },
      limit: 50,
      mapRow: mapGeneratedReportRow,
      onChange,
      onError: (e) => {
        if (onError) onError(e)
        onChange([])
      },
      label: 'generatedReports',
    })
}

export async function addGeneratedReport(data) {
  return supabaseAddGeneratedReport(data)
}

export async function deleteGeneratedReport(reportId) {
  return supabaseDeleteGeneratedReport(reportId)
}

export async function listGeneratedReports(gymId) {
  if (!gymId) return []
  return supabaseListGeneratedReports(gymId)
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

async function supabaseAddGeneratedReport(data) {
  const client = await getSupabaseClient()
  const { error } = await client.from('generated_reports').insert({
    gym_id: data.gymId || 'default',
    user_id: data.userId || '',
    user_name: data.userName || '',
    format: data.format || 'CSV',
    label: data.label || 'Report',
    date_range: data.dateRange || 'all',
  })
  if (error) throw mapSupabaseError(error, 'Failed to save generated report')
}

async function supabaseDeleteGeneratedReport(reportId) {
  const client = await getSupabaseClient()
  const { error } = await client.from('generated_reports').delete().eq('id', reportId)
  if (error) throw mapSupabaseError(error, 'Failed to delete generated report')
}

async function supabaseListGeneratedReports(gymId) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('generated_reports')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw mapSupabaseError(error, 'Failed to load generated reports')
  return (data || []).map(mapGeneratedReportRow)
}