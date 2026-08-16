import { subscribeRealtime } from './realtimeService'

const PAGE_SIZE = 50

// Supabase row → Firestore-shaped notification
function mapNotificationRow(r) {
  return {
    id: r.id,
    userId: r.user_id || '',
    gymId: r.gym_id || '',
    role: r.role || '',
    title: r.title || '',
    message: r.message || '',
    type: r.type || '',
    subtype: r.subtype || '',
    priority: r.priority || 'normal',
    icon: r.icon || '',
    actionUrl: r.action_url || '',
    relatedDocumentId: r.related_document_id || '',
    page: r.page || '',
    tab: r.tab || '',
    contactId: r.contact_id || '',
    targetRole: r.target_role || '',
    read: Boolean(r.read),
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

function notifSort(a, b) {
  const aTime = a.createdAt ? (typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime()) : 0
  const bTime = b.createdAt ? (typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime()) : 0
  return bTime - aTime
}

function notifSubscribe({ filter, label, callback, onError }) {
  return subscribeRealtime({
    table: 'notifications',
    filter,
    orderBy: { column: 'created_at', ascending: false },
    limit: PAGE_SIZE,
    mapRow: mapNotificationRow,
    sortFn: notifSort,
    onChange: callback,
    onError: (e) => {
      console.error(`[Supabase] ${label} realtime error:`, e.message)
      if (onError) onError(e, label)
      callback([])
    },
    label,
  })
}

export function subscribeToNotifications(userId, callback, gymId, onError) {
  return notifSubscribe({
      filter: [['user_id', userId], ['gym_id', gymId]],
      label: 'notifications',
      callback,
      onError,
    })
}

/**
 * Role-scoped notifications subscription (super-admin platform feed).
 * Replaces the AppContext direct onSnapshot (Step 8D) — same shape.
 */
export function subscribeToRoleNotifications(targetRole, callback, onError) {
  return notifSubscribe({
      filter: [['target_role', targetRole]],
      label: 'roleNotifications',
      callback,
      onError,
    })
}

export async function loadMoreNotifications(userId, lastVisible, gymId) {
  return supabaseLoadMoreNotifications(userId, gymId)
}

export async function addNotification(data) {
  return supabaseAddNotification(data)
}

export async function markNotifAsRead(notifId) {
  return supabaseSetNotifRead(notifId, true)
}

export async function markNotifAsUnread(notifId) {
  return supabaseSetNotifRead(notifId, false)
}

export async function markAllNotifsAsRead(userId, gymId) {
  return supabaseMarkAllNotifsAsRead(userId, gymId)
}

export async function deleteNotification(notifId) {
  return supabaseDeleteNotification(notifId)
}

export async function deleteAllNotifications(userId, gymId) {
  return supabaseDeleteAllNotifications(userId)
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

async function supabaseLoadMoreNotifications(userId, gymId) {
  const client = await getSupabaseClient()
  let q = client.from('notifications').select('*').eq('user_id', userId)
  if (gymId) q = q.eq('gym_id', gymId)
  q = q.order('created_at', { ascending: false }).limit(PAGE_SIZE)
  const { data, error } = await q
  if (error) throw mapSupabaseError(error, 'Failed to load notifications')
  return (data || []).map(mapNotificationRow)
}

async function supabaseAddNotification(data) {
  const client = await getSupabaseClient()
  const { data: row, error } = await client.from('notifications').insert({
    user_id: data.userId,
    gym_id: data.gymId || null,
    role: data.role || '',
    title: data.title || '',
    message: data.message || '',
    type: data.type || '',
    subtype: data.subtype || '',
    priority: data.priority || 'normal',
    icon: data.icon || '',
    action_url: data.actionUrl || '',
    related_document_id: data.relatedDocumentId || '',
    page: data.page || '',
    tab: data.tab || '',
    contact_id: data.contactId || null,
    target_role: data.targetRole || '',
    read: false,
  }).select('id').single()
  if (error) throw mapSupabaseError(error, 'Failed to add notification')
  return row.id
}

async function supabaseSetNotifRead(notifId, read) {
  const client = await getSupabaseClient()
  const { error } = await client.from('notifications').update({ read }).eq('id', notifId)
  if (error) throw mapSupabaseError(error, 'Failed to update notification')
}

async function supabaseMarkAllNotifsAsRead(userId, gymId) {
  const client = await getSupabaseClient()
  let q = client.from('notifications').select('id').eq('user_id', userId).eq('read', false)
  if (gymId) q = q.eq('gym_id', gymId)
  q = q.limit(100)
  const { data, error } = await q
  if (error) throw mapSupabaseError(error, 'Failed to load notifications')
  const ids = (data || []).map(r => r.id)
  if (!ids.length) return
  await client.from('notifications').update({ read: true }).in('id', ids)
}

async function supabaseDeleteNotification(notifId) {
  const client = await getSupabaseClient()
  const { error } = await client.rpc('delete_own_notification', { p_id: notifId })
  if (error) throw mapSupabaseError(error, 'Failed to delete notification')
}

async function supabaseDeleteAllNotifications(userId) {
  const client = await getSupabaseClient()
  const { error } = await client.rpc('delete_own_notifications', { p_user_id: userId })
  if (error) throw mapSupabaseError(error, 'Failed to clear notifications')
}
