import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

let ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateLicenseKey() {
  const seg = () => {
    const a = new Uint8Array(4)
    crypto.getRandomValues(a)
    return Array.from(a, b => ALPHABET[b % 36]).join('')
  }
  return `IRP-${seg()}-${seg()}-${seg()}`
}

export async function generateUniqueLicenseKey() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = generateLicenseKey()
    const snap = await getDocs(query(collection(db, 'gyms'), where('subscription.licenseKey', '==', key)))
    if (snap.empty) return key
  }
  throw new Error('Unable to generate a unique license key after 10 attempts')
}
