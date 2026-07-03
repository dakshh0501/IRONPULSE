import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions()
const getSecurityMetricsFn = httpsCallable(functions, 'getSecurityMetrics')

export async function fetchSecurityMetrics() {
  try {
    const result = await getSecurityMetricsFn()
    const data = result.data
    if (data.error) {
      console.error('[securityService] fetchSecurityMetrics error:', data.error)
      return null
    }
    return data.metrics
  } catch (err) {
    console.error('[securityService] fetchSecurityMetrics failed:', err)
    return null
  }
}
