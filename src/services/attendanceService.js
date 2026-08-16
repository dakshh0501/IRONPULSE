import { subscribeRealtime } from './realtimeService'

const RECENT_DAYS = 90
const MAX_ATTENDANCE_RECORDS = 5000

function getRecentDate() {
  const d = new Date()
  d.setDate(d.getDate() - RECENT_DAYS)
  return d.toISOString().split('T')[0]
}

// Supabase row → Firestore-shaped attendance record
function mapAttendanceRow(r) {
  return {
    id: r.id,
    memberId: r.member_id || r.auth_uid || '',
    memberName: r.member_name || '',
    avatar: r.avatar || '',
    color: r.color || '',
    plan: r.plan || '',
    date: r.date || '',
    time: r.time || '',
    method: r.method || '',
    duration: Number(r.duration) || 0,
    trainerId: r.trainer_id || '',
    trainerName: r.trainer_name || '',
    trainerAuthUid: r.trainer_auth_uid || '',
    authUid: r.auth_uid || '',
    gymId: r.gym_id || '',
    createdAt: r.created_at || null,
  }
}

// Firestore matches: date desc, then time desc (client-side comparator)
function attendanceSort(a, b) {
  const dateCmp = (b.date || '').localeCompare(a.date || '')
  if (dateCmp !== 0) return dateCmp
  return (b.time || '').localeCompare(a.time || '')
}

function attendanceSubscribe({ filter, label, callback, onError }) {
  return subscribeRealtime({
    table: 'attendance',
    filter,
    orderBy: { column: 'date', ascending: false },
    limit: MAX_ATTENDANCE_RECORDS,
    mapRow: mapAttendanceRow,
    sortFn: attendanceSort,
    onChange: callback,
    onError: (e) => {
      console.error(`[Supabase] ${label} realtime error:`, e.message)
      if (onError) onError(e, label)
    },
    label,
  })
}

export async function addAttendance(data) {
  return supabaseAddAttendance(data)
}

export async function getAttendanceByDate(date, gymId) {
  return supabaseGetAttendanceByDate(date, gymId)
}

export function subscribeAttendance(callback, gymId, onError) {
  return attendanceSubscribe({
      filter: [['date', 'gte', getRecentDate()], ['gym_id', gymId]],
      label: 'attendance',
      callback,
      onError,
    })
}

export function subscribeMyTrainerAttendance(trainerAuthUid, callback, gymId) {
  return attendanceSubscribe({
      filter: [['date', 'gte', getRecentDate()], ['gym_id', gymId], ['trainer_auth_uid', trainerAuthUid]],
      label: 'myTrainerAttendance',
      callback,
      onError: (e) => console.error('[Supabase] myTrainerAttendance error:', e.message),
    })
}

export function subscribeMyAttendance(uid, callback, gymId) {
  return attendanceSubscribe({
      filter: [['date', 'gte', getRecentDate()], ['gym_id', gymId], ['auth_uid', uid]],
      label: 'myAttendance',
      callback,
      onError: (e) => console.error('[Supabase] myAttendance error:', e.message),
    })
}

// ============================================================================
// SUPABASE DATA PLANE (Step 8E)
// ============================================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let _supabaseClient = null
async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient
  const m = await import('../lib/supabase')
  _supabaseClient = m.supabase
  return _supabaseClient
}

async function detUuid(str) {
  const data = new TextEncoder().encode('IRONPULSE:' + str)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
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

// Resolve a member reference from the app-level id (member uuid OR auth_uid)
// to the members row (FK-safe member_id + auth_uid).
async function resolveMemberRef(client, memberId) {
  if (!memberId) return {}
  const raw = String(memberId)
  const q = UUID_RE.test(raw)
    ? client.from('members').select('id, auth_uid').eq('id', raw.toLowerCase())
    : client.from('members').select('id, auth_uid').eq('auth_uid', raw)
  const { data, error } = await q.maybeSingle()
  if (error || !data) return {}
  return { memberId: data.id, authUid: data.auth_uid || null }
}

// Resolve a trainer reference (uuid id OR auth_uid OR trainer_auth_uid).
async function resolveTrainerRef(client, trainerId, trainerAuthUid) {
  if (trainerAuthUid) {
    const { data, error } = await client.from('trainers').select('id').eq('auth_uid', trainerAuthUid).maybeSingle()
    if (!error && data) return { trainerId: data.id, trainerAuthUid }
    return { trainerAuthUid }
  }
  if (!trainerId) return {}
  const raw = String(trainerId)
  const q = UUID_RE.test(raw)
    ? client.from('trainers').select('id, auth_uid').eq('id', raw.toLowerCase())
    : client.from('trainers').select('id, auth_uid').eq('auth_uid', raw)
  const { data, error } = await q.maybeSingle()
  if (error || !data) return {}
  return { trainerId: data.id, trainerAuthUid: data.auth_uid || null }
}

async function supabaseAddAttendance(data) {
  const client = await getSupabaseClient()
  const date = data.date || new Date().toISOString().split('T')[0]
  const time = data.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const member = await resolveMemberRef(client, data.memberId)
  const trainer = await resolveTrainerRef(client, data.trainerId, data.trainerAuthUid)
  const { data: row, error } = await client.from('attendance').insert({
    gym_id: data.gymId || null,
    member_id: member.memberId || null,
    auth_uid: member.authUid || null,
    member_name: data.memberName || '',
    avatar: data.avatar || '',
    color: data.color || '',
    plan: data.plan || '',
    date,
    time,
    method: data.method || 'Manual',
    duration: data.duration != null ? Number(data.duration) : 90,
    trainer_id: trainer.trainerId || null,
    trainer_auth_uid: trainer.trainerAuthUid || null,
    trainer_name: data.trainerName || '',
  }).select('id').single()
  if (error) throw mapSupabaseError(error, 'Failed to add attendance')
  return row.id
}

async function supabaseGetAttendanceByDate(date, gymId) {
  const client = await getSupabaseClient()
  let q = client.from('attendance').select('*').eq('date', date)
  if (gymId) q = q.eq('gym_id', gymId)
  const { data, error } = await q
  if (error) throw mapSupabaseError(error, 'Failed to load attendance')
  return (data || []).map(mapAttendanceRow)
}
