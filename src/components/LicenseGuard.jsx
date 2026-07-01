import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { validateDeviceRegistration, registerDevice, getOrCreateDeviceId } from '../services/deviceService'
import { addLicenseHistory } from '../services/licenseHistoryService'
import LicenseRequiredScreen from './LicenseRequiredScreen'

export default function LicenseGuard({ children }) {
  const { isLoggedIn, effectiveRole, authLoading } = useAuth()
  const { gymId, currentSubscription } = useApp()
  const [licenseState, setLicenseState] = useState('loading')
  const [reason, setReason] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const mountedRef = useRef(true)

  const isGymAdmin = effectiveRole === 'gym_admin' || effectiveRole === 'gym_owner'
  const needsCheck = isLoggedIn && isGymAdmin && gymId

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!needsCheck) {
      setLicenseState('ok')
      return
    }

    // subscription data not yet loaded — stay loading
    if (!currentSubscription) {
      return
    }

    let cancelled = false

    async function check() {
      setLicenseState('loading')

      // 1. Subscription status
      const sub = currentSubscription
      if (!sub || !sub.status) {
        if (!cancelled) { setLicenseState('blocked'); setReason('No active subscription found.'); addAudit('Validation Failed - No Subscription') }
        return
      }

      if (sub.status === 'expired' || sub.status === 'suspended') {
        if (!cancelled) { setLicenseState('blocked'); setReason(`Your subscription is ${sub.status}. Please renew to continue.`); addAudit(`Validation Failed - ${sub.status}`) }
        return
      }

      // 2. License key exists
      if (!sub.licenseKey) {
        if (!cancelled) { setLicenseState('blocked'); setReason('No license key assigned. Contact your administrator.'); addAudit('Validation Failed - No License Key') }
        return
      }

      // 3. License status
      if (sub.licenseStatus === 'revoked') {
        if (!cancelled) { setLicenseState('blocked'); setReason('License revoked. Contact your administrator.'); addAudit('Validation Failed - License Revoked') }
        return
      }
      if (sub.licenseStatus === 'suspended') {
        if (!cancelled) { setLicenseState('blocked'); setReason('License suspended. Contact your administrator.'); addAudit('Validation Failed - License Suspended') }
        return
      }

      // 4. Device registration
      try {
        const result = await validateDeviceRegistration(gymId)
        if (!result.valid) {
          if (!cancelled) { setLicenseState('blocked'); setReason(result.reason); addAudit(`Validation Failed - ${result.reason}`) }
          return
        }

        if (result.existing) {
          if (!cancelled) { setLicenseState('ok'); addAudit('Device Re-verified') }
        } else {
          await registerDevice(gymId, sub.licenseKey)
          if (!cancelled) { setLicenseState('ok'); addAudit('Device Registered') }
        }
      } catch (err) {
        console.error('Device validation error:', err)
        if (!cancelled) { setLicenseState('blocked'); setReason('License validation error. Please try again or contact support.'); addAudit('Validation Failed - Error') }
      }
    }

    async function addAudit(action) {
      try {
        await addLicenseHistory({
          gymId,
          licenseKey: sub?.licenseKey || '',
          action,
          performedBy: 'system',
          deviceId: getOrCreateDeviceId(),
        })
      } catch {}
    }

    check()

    return () => { cancelled = true }
  }, [authLoading, needsCheck, gymId, currentSubscription, currentSubscription?.status, currentSubscription?.licenseKey, retryKey])

  const handleRetry = () => {
    setRetryKey(k => k + 1)
  }

  if (authLoading) return null

  if (!needsCheck) return <>{children}</>

  if (licenseState === 'loading') {
    return (
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'60vh', flexDirection:'column', gap:16,
      }}>
        <div style={{
          width:40, height:40, borderRadius:'50%',
          border:'3px solid var(--border)',
          borderTopColor:'var(--primary)',
          animation:'spin 0.8s linear infinite',
        }} />
        <p style={{ color:'var(--text-muted)', fontSize:14 }}>Validating license...</p>
      </div>
    )
  }

  if (licenseState === 'blocked') {
    return <LicenseRequiredScreen reason={reason} subscription={currentSubscription} onRetry={handleRetry} />
  }

  return <>{children}</>
}
