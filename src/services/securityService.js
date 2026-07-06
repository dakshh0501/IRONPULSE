import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export async function fetchSecurityMetrics() {
  try {
    const [gymsSnap, usersSnap, devicesSnap] = await Promise.all([
      getDocs(collection(db, 'gyms')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'licensedDevices')),
    ])

    const gyms = gymsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const activeSubs = gyms.filter(g => g.subscription?.status === 'active')
    const activeLicenses = gyms.filter(g => g.subscription?.licenseStatus === 'active')

    return {
      totalGyms: gymsSnap.size,
      totalUsers: usersSnap.size,
      activeSubscriptions: activeSubs.length,
      activeLicenses: activeLicenses.length,
      totalDevices: devicesSnap.size,
      authUserCount: usersSnap.size,
      platformStatus: 'operational',
    }
  } catch (err) {
    console.error('[securityService] fetchSecurityMetrics failed:', err)
    return {
      totalGyms: 0,
      totalUsers: 0,
      activeSubscriptions: 0,
      activeLicenses: 0,
      totalDevices: 0,
      authUserCount: 0,
      platformStatus: 'degraded',
      error: err.message,
    }
  }
}
