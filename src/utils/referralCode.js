import { doc, getDoc, getDocs, collection, query, where, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateReferralCode() {
  let code = ''
  const array = new Uint32Array(6)
  crypto.getRandomValues(array)
  for (let i = 0; i < 6; i++) {
    code += CHARS[array[i] % CHARS.length]
  }
  return `IP-${code}`
}

export function validateReferralCodeFormat(code) {
  return typeof code === 'string' && /^IP-[A-Z0-9]{6}$/.test(code)
}

export async function isReferralCodeUnique(code) {
  if (!validateReferralCodeFormat(code)) return false
  const q = query(collection(db, 'users'), where('referralCode', '==', code))
  const snap = await getDocs(q)
  return snap.empty
}

export async function generateUniqueReferralCode() {
  let attempts = 0
  while (attempts < 20) {
    const code = generateReferralCode()
    const unique = await isReferralCodeUnique(code)
    if (unique) return code
    attempts++
  }
  throw new Error('Failed to generate unique referral code after 20 attempts')
}

export async function getReferrerByCode(code) {
  if (!code || !validateReferralCodeFormat(code)) return null
  const q = query(collection(db, 'users'), where('referralCode', '==', code))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const user = snap.docs[0].data()
  return {
    uid: user.uid,
    name: user.name || '',
    referralCode: code,
    gymId: user.gymId || 'default',
  }
}

export async function backfillMissingReferralCodes() {
  const q = query(collection(db, 'users'), where('role', '==', 'member'))
  const snap = await getDocs(q)
  let updated = 0
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (data.referralCode) continue
    try {
      const code = await generateUniqueReferralCode()
      await updateDoc(doc(db, 'users', docSnap.id), {
        referralCode: code,
        referralCodeGeneratedAt: serverTimestamp(),
      })
      updated++
    } catch (err) {
      console.error(`backfillMissingReferralCodes: failed for ${docSnap.id}:`, err)
    }
  }
  return updated
}
