import {
  collection,
  addDoc,
  query,
  where,
  limit,
  onSnapshot,
  getDocs,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'attendance'

const RECENT_DAYS = 90
const MAX_ATTENDANCE_RECORDS = 5000

function getRecentDate() {
  const d = new Date()
  d.setDate(d.getDate() - RECENT_DAYS)
  return d.toISOString().split('T')[0]
}

export async function addAttendance(data) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    date: data.date || new Date().toISOString().split('T')[0],
    time: data.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    createdAt: new Date().toISOString(),
  })
  return docRef.id
}

export async function getAttendanceByDate(date, gymId) {
  const constraints = [where('date', '==', date)]
  if (gymId) constraints.push(where('gymId', '==', gymId))
  const q = query(collection(db, COLLECTION), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export function subscribeAttendance(callback, gymId, onError) {
  const constraints = [where('date', '>=', getRecentDate())]
  if (gymId) constraints.push(where('gymId', '==', gymId))
  constraints.push(limit(MAX_ATTENDANCE_RECORDS))
  const q = query(collection(db, COLLECTION), ...constraints)
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      records.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.time || '').localeCompare(a.time || '')
      })
      callback(records)
    },
    (err)  => {
      console.error('[attendanceService] subscribeAttendance error:', err)
      if (onError) onError(err, 'attendance')
    }
  )
}

export function subscribeMyTrainerAttendance(trainerAuthUid, callback, gymId) {
  if (!trainerAuthUid) { console.warn('[attendanceService] subscribeMyTrainerAttendance called without trainerAuthUid'); return () => {} }
  const constraints = [where('date', '>=', getRecentDate())]
  if (gymId) constraints.push(where('gymId', '==', gymId))
  constraints.push(where('trainerAuthUid', '==', trainerAuthUid))
  constraints.push(limit(MAX_ATTENDANCE_RECORDS))
  const q = query(collection(db, COLLECTION), ...constraints)
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      records.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.time || '').localeCompare(a.time || '')
      })
      callback(records)
    },
    (err)  => console.error('[attendanceService] subscribeMyTrainerAttendance error:', err)
  )
}

export function subscribeMyAttendance(uid, callback, gymId) {
  const constraints = [where('date', '>=', getRecentDate())]
  if (gymId) constraints.push(where('gymId', '==', gymId))
  constraints.push(where('memberId', '==', uid))
  constraints.push(limit(MAX_ATTENDANCE_RECORDS))
  const q = query(collection(db, COLLECTION), ...constraints)
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
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
