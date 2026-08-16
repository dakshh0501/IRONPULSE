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
  return true
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
  return null
}

export async function backfillMissingReferralCodes() {
  return 0
}
