function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
import {
  doc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, addDoc, query, where, onSnapshot,
  serverTimestamp, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'

const DEVICES_COLLECTION = 'licensedDevices'

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
  const constraints = [where('gymId', '==', gymId)]
  if (statusFilter) constraints.push(where('status', '==', statusFilter))
  const q = query(collection(db, DEVICES_COLLECTION), ...constraints)
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export function subscribeToAllDevices(callback) {
  const q = query(collection(db, DEVICES_COLLECTION))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function registerDevice(gymId, licenseKey) {
  const deviceId = getOrCreateDeviceId()
  const info = getDeviceInfo()

  const existing = await getDocs(query(
    collection(db, DEVICES_COLLECTION),
    where('deviceId', '==', deviceId),
    where('gymId', '==', gymId)
  ))

  if (!existing.empty) {
    const dev = existing.docs[0]
    const ref = doc(db, DEVICES_COLLECTION, dev.id)
    await updateDoc(ref, {
      lastSeen: serverTimestamp(),
      deviceName: info.deviceName,
      platform: info.platform,
      appVersion: info.appVersion,
      userAgent: info.userAgent,
      updatedAt: serverTimestamp(),
    })
    return { action: 'updated', deviceId, docId: dev.id }
  }

  await addDoc(collection(db, DEVICES_COLLECTION), {
    deviceId,
    deviceName: info.deviceName,
    platform: info.platform,
    appVersion: info.appVersion,
    userAgent: info.userAgent,
    registeredAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    gymId,
    licenseKey,
    status: 'active',
    createdBy: gymId,
    updatedAt: serverTimestamp(),
  })

  return { action: 'registered', deviceId }
}

export async function removeDevice(docId) {
  await deleteDoc(doc(db, DEVICES_COLLECTION, docId))
}

export async function revokeDevice(docId) {
  await updateDoc(doc(db, DEVICES_COLLECTION, docId), {
    status: 'revoked',
    updatedAt: serverTimestamp(),
  })
}

export async function suspendDevice(docId) {
  await updateDoc(doc(db, DEVICES_COLLECTION, docId), {
    status: 'suspended',
    updatedAt: serverTimestamp(),
  })
}

export async function activateDevice(docId) {
  await updateDoc(doc(db, DEVICES_COLLECTION, docId), {
    status: 'active',
    updatedAt: serverTimestamp(),
  })
}

export async function resetAllDevices(gymId) {
  const snap = await getDocs(query(
    collection(db, DEVICES_COLLECTION),
    where('gymId', '==', gymId)
  ))
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

export async function getDeviceCount(gymId) {
  const snap = await getDocs(query(
    collection(db, DEVICES_COLLECTION),
    where('gymId', '==', gymId),
    where('status', '==', 'active')
  ))
  return snap.size
}

export async function validateDeviceRegistration(gymId) {
  const gymRef = doc(db, 'gyms', gymId)
  const gymSnap = await getDoc(gymRef)
  if (!gymSnap.exists()) return { valid: false, reason: 'Gym not found' }

  const sub = gymSnap.data().subscription
  if (!sub) return { valid: false, reason: 'No subscription found' }

  if (sub.status === 'expired' || sub.status === 'suspended') {
    return { valid: false, reason: `Subscription is ${sub.status}` }
  }

  if (sub.licenseStatus === 'revoked') {
    return { valid: false, reason: 'License has been revoked' }
  }

  if (!sub.licenseKey) {
    return { valid: false, reason: 'No license key assigned' }
  }

  const deviceLimit = sub.deviceLimit || 0
  if (deviceLimit === 0) return { valid: false, reason: 'Device limit not configured' }

  const deviceId = getOrCreateDeviceId()

  const existing = await getDocs(query(
    collection(db, DEVICES_COLLECTION),
    where('deviceId', '==', deviceId),
    where('gymId', '==', gymId)
  ))

  if (!existing.empty) {
    const dev = existing.docs[0]
    if (dev.data().status === 'revoked' || dev.data().status === 'suspended') {
      return { valid: false, reason: `Device is ${dev.data().status}` }
    }
    return { valid: true, existing: true, deviceId, docId: dev.id }
  }

  const currentCount = await getDeviceCount(gymId)
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

export async function getDevicesForGym(gymId) {
  const snap = await getDocs(query(
    collection(db, DEVICES_COLLECTION),
    where('gymId', '==', gymId)
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
