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
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'attendance'

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
      createdAt: serverTimestamp(),
    })
    return { success: true, id: ref.id }
  } catch (err) {
    console.error('[attendanceService] addAttendance error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * getAttendanceByDate(date)
 * One-time fetch of all attendance records for a given date string 'YYYY-MM-DD'.
 */
export async function getAttendanceByDate(date) {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('date', '==', date),
      orderBy('time', 'asc')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('[attendanceService] getAttendanceByDate error:', err)
    return []
  }
}

/**
 * subscribeAttendance(callback)
 * Real-time listener for all attendance records, ordered by date desc.
 * Returns the unsubscribe function.
 *
 * Usage in AppContext:
 *   useEffect(() => {
 *     const unsub = subscribeAttendance(records => setAttendance(records))
 *     return unsub
 *   }, [user])
 */
export function subscribeAttendance(callback) {
  const q = query(
    collection(db, COLLECTION),
    orderBy('date', 'desc'),
    orderBy('time', 'desc')
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err)  => console.error('[attendanceService] subscribeAttendance error:', err)
  )
}