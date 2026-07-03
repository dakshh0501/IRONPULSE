import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'notifications'

const PAGE_SIZE = 50

export function subscribeToNotifications(userId, callback, gymId, onError) {
  const constraints = [where('userId', '==', userId)]
  if (gymId) {
    constraints.push(where('gymId', '==', gymId))
  }
  constraints.push(limit(PAGE_SIZE))
  const q = query(collection(db, COLLECTION), ...constraints)
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt || 0
      const bTime = b.createdAt?.seconds || b.createdAt || 0
      return bTime - aTime
    })
    callback(list.slice(0, PAGE_SIZE))
  }, (err) => {
    console.error('subscribeToNotifications error:', err); if (onError) onError(err, 'notifications')
    callback([])
  })
}

export async function loadMoreNotifications(userId, lastVisible, gymId) {
  const constraints = [where('userId', '==', userId)]
  if (gymId) {
    constraints.push(where('gymId', '==', gymId))
  }
  constraints.push(limit(PAGE_SIZE * 2))
  const q = query(collection(db, COLLECTION), ...constraints)
  const snapshot = await getDocs(q)
  const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  list.sort((a, b) => {
    const aTime = a.createdAt?.seconds || a.createdAt || 0
    const bTime = b.createdAt?.seconds || b.createdAt || 0
    return bTime - aTime
  })
  return list.slice(0, PAGE_SIZE)
}

export async function addNotification(data) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    gymId: data.gymId || 'default',
    read: false,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function markNotifAsRead(notifId) {
  await updateDoc(doc(db, COLLECTION, notifId), { read: true })
}

export async function markNotifAsUnread(notifId) {
  await updateDoc(doc(db, COLLECTION, notifId), { read: false })
}

export async function markAllNotifsAsRead(userId, gymId) {
  const constraints = [where('userId', '==', userId)]
  if (gymId) {
    constraints.push(where('gymId', '==', gymId))
  }
  const q = query(collection(db, COLLECTION), ...constraints)
  const snapshot = await getDocs(q)
  const updates = snapshot.docs
    .filter(d => d.data().read === false)
    .map(d => updateDoc(d.ref, { read: true }))
  await Promise.allSettled(updates)
}

export async function deleteNotification(notifId) {
  await deleteDoc(doc(db, COLLECTION, notifId))
}

export async function deleteAllNotifications(userId, gymId) {
  const constraints = [where('userId', '==', userId)]
  if (gymId) {
    constraints.push(where('gymId', '==', gymId))
  }
  const q = query(collection(db, COLLECTION), ...constraints)
  const snapshot = await getDocs(q)
  const deletes = snapshot.docs.map(d => deleteDoc(d.ref))
  await Promise.allSettled(deletes)
}
