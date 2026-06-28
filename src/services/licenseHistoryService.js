import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const HISTORY_COLLECTION = 'licenseHistory'

export function subscribeToLicenseHistory(gymId, callback) {
  if (!gymId) return () => {}
  const q = query(
    collection(db, HISTORY_COLLECTION),
    where('gymId', '==', gymId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export function subscribeToAllLicenseHistory(callback) {
  const q = query(
    collection(db, HISTORY_COLLECTION),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function addLicenseHistory(record) {
  await addDoc(collection(db, HISTORY_COLLECTION), {
    ...record,
    createdAt: serverTimestamp(),
  })
}
