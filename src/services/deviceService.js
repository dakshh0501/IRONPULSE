function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
import { subscribeRealtime } from './realtimeService'

// Supabase licensed_devices row → Firestore-shaped device
function mapDeviceRow(r) {
  return {
    id: r.id,
    deviceId: r.device_id || '',
    deviceName: r.device_name || '',
    platform: r.platform || '',
    appVersion: r.app_version || '',
    userAgent: r.user_agent || '',
    status: r.status || 'active',
    createdBy: r.created_by || '',
    lastSeen: r.last_seen || null,
    licenseKey: r.license_key || '',
    registeredAt: r.registered_at || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

function deviceSubscribe({ filter, limitN, label, callback }) {
  return subscribeRealtime({
    table: 'licensed_devices',
    filter,
    limit: limitN,
    mapRow: mapDeviceRow,
    onChange: callback,
    onError: (e) => console.error(`[Supabase] ${label} realtime error:`, e.message),
    label,
  })
}

// ── Persistent Device ID ──────────────────────────────────
function getStorageKey() { return 'ironpulse_device_id' }

export function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(getStorageKey())
  if (!deviceId) {
    deviceId = generateUUID()
    localStorage.setItem(getStorageKey(), deviceId)
  }
  return deviceId
}

export function clearDeviceId() {
  localStorage.removeItem(getStorageKey())
}

// ── Device Info ──────────────────────────────────────────
export function getDeviceInfo() {
  const ua = navigator.userAgent || ''
  let platform = 'web'
  if (ua.includes('Android')) platform = 'android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'ios'
  else if (ua.includes('Mac')) platform = 'mac'
  else if (ua.includes('Windows')) platform = 'windows'
  else if (ua.includes('Linux')) platform = 'linux'

  return {
    deviceName: navigator.platform || platform,
    platform,
    appVersion: '1.0.0',
    userAgent: ua.substring(0, 500),
  }
}

// ── Firestore CRUD ────────────────────────────────────────
export function subscribeToDevices(gymId, callback, statusFilter) {
  if (!gymId) return () => {}
  return deviceSubscribe({
      filter: [['gym_id', gymId], ['status', statusFilter]],
      limitN: 500,
      label: 'devices',
      callback,
    })
}

export function subscribeToAllDevices(callback) {
  return deviceSubscribe({
      filter: [],
      limitN: 5000,
      label: 'allDevices',
      callback,
    })
}

export async function registerDevice(gymId, licenseKey) {
  return supabaseRegisterDevice(gymId, licenseKey)
}

export async function removeDevice(docId) {
  return supabaseDeviceStatusOp('delete', docId)
}

export async function revokeDevice(docId) {
  return supabaseDeviceStatusOp('revoked', docId)
}

export async function suspendDevice(docId) {
  return supabaseDeviceStatusOp('suspended', docId)
}

export async function activateDevice(docId) {
  return supabaseDeviceStatusOp('active', docId)
}

export async function resetAllDevices(gymId) {
  return supabaseResetAllDevices(gymId)
}

export async function getDeviceCount(gymId) {
  return supabaseGetDeviceCount(gymId)
}

export async function validateDeviceRegistration(gymId) {
  return supabaseValidateDeviceRegistration(gymId)
}

export async function getDevicesForGym(gymId) {
  return supabaseGetDevicesForGym(gymId)
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

function nowIso() {
  return new Date().toISOString()
}

async function supabaseRegisterDevice(gymId, licenseKey) {
  const client = await getSupabaseClient()
  const deviceId = getOrCreateDeviceId()
  const info = getDeviceInfo()
  const infoFields = {
    device_name: info.deviceName,
    platform: info.platform,
    app_version: info.appVersion,
    user_agent: info.userAgent,
    last_seen: nowIso(),
  }

  const { data: existing, error: exErr } = await client
    .from('licensed_devices')
    .select('id')
    .eq('device_id', deviceId)
    .eq('gym_id', gymId)
    .maybeSingle()
  if (exErr) throw mapSupabaseError(exErr, 'Failed to check device registration')

  if (existing) {
    const { error: upErr } = await client.from('licensed_devices')
      .update(infoFields)
      .eq('id', existing.id)
    if (upErr) throw mapSupabaseError(upErr, 'Failed to update device')
    return { action: 'updated', deviceId, docId: existing.id }
  }

  const { data: gym, error: gymErr } = await client
    .from('gyms')
    .select('subscription')
    .eq('id', gymId)
    .maybeSingle()
  if (gymErr) throw mapSupabaseError(gymErr, 'Failed to load gym')
  const deviceLimit = (gym?.subscription && gym.subscription.deviceLimit) || 0

  if (deviceLimit !== 9999) {
    const currentCount = await supabaseGetDeviceCount(gymId, client)
    if (currentCount >= deviceLimit) {
      throw new Error(`Device limit reached (${currentCount}/${deviceLimit}). Remove an existing device or contact your administrator.`)
    }
  }

  const { error: insErr } = await client.from('licensed_devices').insert({
    device_id: deviceId,
    ...infoFields,
    gym_id: gymId,
    license_key: licenseKey,
    status: 'active',
    created_by: gymId,
    registered_at: nowIso(),
  })
  if (insErr) {
    if (mapSupabaseError(insErr).code === 'already-exists') {
      const { data: raceRow, error: raceErr } = await client
        .from('licensed_devices')
        .select('id')
        .eq('device_id', deviceId)
        .eq('gym_id', gymId)
        .maybeSingle()
      if (raceErr || !raceRow) throw mapSupabaseError(insErr, 'Failed to register device')
      const { error: upErr } = await client.from('licensed_devices').update(infoFields).eq('id', raceRow.id)
      if (upErr) throw mapSupabaseError(upErr, 'Failed to update device')
      return { action: 'updated', deviceId, docId: raceRow.id }
    }
    throw mapSupabaseError(insErr, 'Failed to register device')
  }

  return { action: 'registered', deviceId }
}

async function supabaseDeviceStatusOp(statusOrDelete, docId) {
  const client = await getSupabaseClient()
  let res
  if (statusOrDelete === 'delete') {
    res = await client.from('licensed_devices').delete().eq('id', docId)
  } else {
    res = await client.from('licensed_devices').update({ status: statusOrDelete, last_seen: nowIso() }).eq('id', docId)
  }
  if (res.error) throw mapSupabaseError(res.error, 'Failed to update device')
}

async function supabaseResetAllDevices(gymId) {
  const client = await getSupabaseClient()
  const { error } = await client.from('licensed_devices').delete().eq('gym_id', gymId)
  if (error) throw mapSupabaseError(error, 'Failed to reset devices')
}

async function supabaseGetDeviceCount(gymId, clientOrNull) {
  const client = clientOrNull || await getSupabaseClient()
  const { data, error } = await client
    .from('licensed_devices')
    .select('id')
    .eq('gym_id', gymId)
    .eq('status', 'active')
  if (error) throw mapSupabaseError(error, 'Failed to count devices')
  return (data || []).length
}

async function supabaseGetDevicesForGym(gymId) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('licensed_devices')
    .select('*')
    .eq('gym_id', gymId)
  if (error) throw mapSupabaseError(error, 'Failed to load devices')
  return (data || []).map(mapDeviceRow)
}

async function supabaseValidateDeviceRegistration(gymId) {
  const client = await getSupabaseClient()

  const { data: gym, error: gymErr } = await client
    .from('gyms')
    .select('subscription')
    .eq('id', gymId)
    .maybeSingle()
  if (gymErr) throw mapSupabaseError(gymErr, 'Failed to load gym')
  if (!gym) return { valid: false, reason: 'Gym not found' }

  const sub = gym.subscription
  if (!sub) return { valid: false, reason: 'No subscription found' }
  if (!sub.licenseKey) return { valid: false, reason: 'No license key assigned' }
  if (sub.status === 'expired' || sub.status === 'suspended') {
    return { valid: false, reason: `Subscription is ${sub.status}` }
  }
  if (sub.licenseStatus === 'revoked') return { valid: false, reason: 'License revoked' }
  if (sub.licenseStatus === 'suspended') return { valid: false, reason: 'License suspended' }
  if (sub.licenseStatus !== 'active') return { valid: false, reason: 'License is not active' }

  const deviceLimit = sub.deviceLimit || 0
  if (deviceLimit === 0) return { valid: false, reason: 'Device limit not configured' }

  const deviceId = getOrCreateDeviceId()

  const { data: existing, error: exErr } = await client
    .from('licensed_devices')
    .select('id, status')
    .eq('device_id', deviceId)
    .eq('gym_id', gymId)
    .maybeSingle()
  if (exErr) throw mapSupabaseError(exErr, 'Failed to check device registration')

  if (existing) {
    if (existing.status === 'revoked' || existing.status === 'suspended') {
      return { valid: false, reason: `Device is ${existing.status}` }
    }
    return { valid: true, existing: true, deviceId, docId: existing.id }
  }

  const currentCount = await supabaseGetDeviceCount(gymId, client)
  if (deviceLimit !== 9999 && currentCount >= deviceLimit) {
    return {
      valid: false,
      reason: `Device limit reached (${currentCount}/${deviceLimit}). Remove an existing device or contact your administrator.`,
      currentCount,
      deviceLimit,
    }
  }

  return { valid: true, existing: false }
}
