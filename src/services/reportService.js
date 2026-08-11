import { collection, query, where, orderBy, limit, onSnapshot, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

const REPORTS_COLLECTION = 'generatedReports'

export function subscribeToGeneratedReports(gymId, onChange, onError) {
  if (!gymId) {
    onChange([])
    return () => {}
  }
  const q = query(
    collection(db, REPORTS_COLLECTION),
    where('gymId', '==', gymId),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      if (onError) onError(err)
      onChange([])
    }
  )
}

export async function addGeneratedReport(data) {
  const payload = {
    gymId: data.gymId || 'default',
    userId: data.userId || '',
    userName: data.userName || '',
    format: data.format || 'CSV',
    label: data.label || 'Report',
    dateRange: data.dateRange || 'all',
    createdAt: new Date(),
  }
  await addDoc(collection(db, REPORTS_COLLECTION), payload)
}

export async function deleteGeneratedReport(reportId) {
  await deleteDoc(doc(db, REPORTS_COLLECTION, reportId))
}

export async function listGeneratedReports(gymId) {
  if (!gymId) return []
  const q = query(
    collection(db, REPORTS_COLLECTION),
    where('gymId', '==', gymId),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}