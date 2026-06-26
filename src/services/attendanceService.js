// src/services/attendanceService.js
// Single source of truth for all Firestore attendance operations.
// Import addAttendance from HERE everywhere — never from AppContext.

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'attendance'
const DEFAULT_GYM_ID = 'default'

/**
 * addAttendance(data)
 * Writes one attendance record to Firestore.
 * Returns { success: true, id } or { success: false, error }.
 *
 * Required fields in data:
 *   memberId   — Firebase auth UID (from member.authUid)
 *   memberName — display name
 *   date       — 'YYYY-MM-DD'
 *   time       — 'HH:MM'
 *   method     — 'QR' | 'Manual'
 */
export async function addAttendance(data) {
  try {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...data,
      gymId: data.gymId || DEFAULT_GYM_ID,
      createdAt: serverTimestamp(),
    })
    return { success: true, id: ref.id }
  } catch (err) {
    console.error('[attendanceService] addAttendance error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * getAttendanceByDate(date, gymId)
 * One-time fetch of all attendance records for a given date string 'YYYY-MM-DD'.
 */
export async function getAttendanceByDate(date, gymId) {
  try {
    // Use only equality filters — sort client-side
    const q = gymId
      ? query(collection(db, COLLECTION), where('gymId', '==', gymId), where('date', '==', date))
      : query(collection(db, COLLECTION), where('date', '==', date))
    const snap = await getDocs(q)
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    records.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    return records
  } catch (err) {
    console.error('[attendanceService] getAttendanceByDate error:', err)
    return []
  }
}

/**
 * subscribeAttendance(callback, gymId)
 * Real-time listener for all attendance records, ordered by date desc.
 * Returns the unsubscribe function.
 *
 * Usage in AppContext (admin/trainer):
 *   useEffect(() => {
 *     const unsub = subscribeAttendance(records => setAttendance(records))
 *     return unsub
 *   }, [user])
 */
export function subscribeAttendance(callback, gymId) {
  // Use only equality filters to avoid requiring composite indexes — sort client-side
  const q = gymId
    ? query(collection(db, COLLECTION), where('gymId', '==', gymId))
    : query(collection(db, COLLECTION))
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort by date desc, time desc (client-side to avoid index requirement)
      records.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.time || '').localeCompare(a.time || '')
      })
      callback(records)
    },
    (err)  => console.error('[attendanceService] subscribeAttendance error:', err)
  )
}

/**
 * subscribeMyAttendance(uid, callback, gymId)
 * Real-time listener for attendance records belonging to a specific member,
 * ordered by date desc. Used by the Member role so they only see their own data.
 *
 * Usage in AppContext (member):
 *   useEffect(() => {
 *     const unsub = subscribeMyAttendance(currentUser.uid, records => setAttendance(records))
 *     return unsub
 *   }, [currentUser.uid])
 */
export function subscribeMyAttendance(uid, callback, gymId) {
  // Use only equality filters to avoid requiring composite indexes — sort client-side
  const q = gymId
    ? query(collection(db, COLLECTION), where('gymId', '==', gymId), where('memberId', '==', uid))
    : query(collection(db, COLLECTION), where('memberId', '==', uid))
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort by date desc, time desc (client-side)
      records.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.time || '').localeCompare(a.time || '')
      })
      callback(records)
    },
    (err)  => console.error('[attendanceService] subscribeMyAttendance error:', err)
  )
}