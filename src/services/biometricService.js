import { NativeBiometric } from 'capacitor-native-biometric'

const BIOMETRY_TYPE_NAMES = {
  0: 'None',
  1: 'Touch ID',
  2: 'Face ID',
  3: 'Fingerprint',
  4: 'Face Authentication',
  5: 'Iris Authentication',
  6: 'Multiple',
}

const BIOMETRY_ICONS = {
  0: '',
  1: '🖐️',
  2: '😀',
  3: '🖐️',
  4: '😀',
  5: '👁️',
  6: '🔐',
}

const BIOMETRY_LABELS = {
  0: '',
  1: 'Touch ID',
  2: 'Face ID',
  3: 'Fingerprint',
  4: 'Face Unlock',
  5: 'Iris Unlock',
  6: 'Biometric',
}

let cachedAvailability = null

function isNative() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform())
  } catch {
    return false
  }
}

export async function isBiometricAvailable() {
  if (cachedAvailability !== null) return cachedAvailability

  if (!isNative()) {
    cachedAvailability = { isAvailable: false, biometryType: 0 }
    return cachedAvailability
  }

  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false })
    cachedAvailability = result
    return result
  } catch {
    cachedAvailability = { isAvailable: false, biometryType: 0 }
    return cachedAvailability
  }
}

export function getBiometricTypeName(type) {
  return BIOMETRY_TYPE_NAMES[type] || 'Biometric'
}

export function getBiometricIcon(type) {
  return BIOMETRY_ICONS[type] || '🔐'
}

export function getBiometricLabel(type) {
  return BIOMETRY_LABELS[type] || 'Biometric'
}

export async function verifyBiometric(options = {}) {
  if (!isNative()) {
    throw new Error('BIOMETRIC_NOT_AVAILABLE')
  }

  try {
    await NativeBiometric.verifyIdentity({
      reason: options.reason || 'Verify your identity',
      title: options.title || 'Biometric Verification',
      subtitle: options.subtitle || '',
      description: options.description || 'Authenticate to continue',
      negativeButtonText: options.negativeButtonText || 'Cancel',
      maxAttempts: options.maxAttempts || 3,
    })
    return true
  } catch (err) {
    if (err && typeof err === 'object') {
      const code = err.code
      if (code === 16) throw new Error('USER_CANCEL')
      if (code === 17) throw new Error('USER_FALLBACK')
      if (code === 10) throw new Error('AUTHENTICATION_FAILED')
      if (code === 2 || code === 4) throw new Error('USER_LOCKOUT')
    }
    throw new Error('BIOMETRIC_FAILED')
  }
}

export function isBiometricLoginEnabled() {
  try {
    return localStorage.getItem('ironpulse-biometric') === 'true'
  } catch {
    return false
  }
}

export function setBiometricLoginEnabled(enabled) {
  try {
    if (enabled) {
      localStorage.setItem('ironpulse-biometric', 'true')
    } else {
      localStorage.removeItem('ironpulse-biometric')
    }
  } catch {
  }
}

export function clearBiometricCache() {
  cachedAvailability = null
}
