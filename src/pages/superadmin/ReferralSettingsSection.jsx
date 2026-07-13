import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getReferralSettings, updateReferralSettings } from '../../services/referralService'

function Toggle({ on, onChange }) {
  return (
    <div className={`ps-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <div className="ps-toggle-thumb" />
    </div>
  )
}

function SettingsCard({ icon, iconBg, title, subtitle, children }) {
  return (
    <div className="ps-card" style={{ animation: 'ps-fade-up 0.35s ease' }}>
      <div className="ps-card-header">
        <div className="ps-card-icon" style={{ background: iconBg || 'rgba(232,66,10,0.08)' }}>{icon}</div>
        <div>
          <h3 className="ps-card-title">{title}</h3>
          {subtitle && <p className="ps-card-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="ps-row">
      <div className="ps-row-info">
        <p className="ps-row-label">{label}</p>
        {desc && <p className="ps-row-desc">{desc}</p>}
      </div>
      <div className="ps-row-action">{children}</div>
    </div>
  )
}

export default function ReferralSettingsSection() {
  const { currentUser } = useAuth()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    getReferralSettings().then(data => {
      if (!mounted) return
      if (data) {
        setForm({
          enabled: data.enabled !== false,
          rewardMode: data.rewardMode || 'Wallet Credit',
          referrerRewardValue: data.referrerRewardValue || 100,
          newUserRewardValue: data.newUserRewardValue || 50,
          referralExpiryDays: data.referralExpiryDays || 90,
          minSubscriptionPlan: data.minSubscriptionPlan || '',
          minSubscriptionAmount: data.minSubscriptionAmount || 0,
          shareMessage: data.shareMessage || '',
          maxRewardsPerUser: data.maxRewardsPerUser || 10,
          minSubscriptionDays: data.minSubscriptionDays || 30,
          campaignName: data.campaignName || '',
        })
      } else {
        setForm({
          enabled: true,
          rewardMode: 'Wallet Credit',
          referrerRewardValue: 100,
          newUserRewardValue: 50,
          referralExpiryDays: 90,
          minSubscriptionPlan: '',
          minSubscriptionAmount: 0,
          shareMessage: '',
          maxRewardsPerUser: 10,
          minSubscriptionDays: 30,
          campaignName: '',
        })
      }
      setLoading(false)
    }).catch(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = useCallback(async () => {
    if (!form) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateReferralSettings({
        enabled: form.enabled,
        rewardMode: form.rewardMode,
        referrerRewardValue: Number(form.referrerRewardValue) || 0,
        newUserRewardValue: Number(form.newUserRewardValue) || 0,
        referralExpiryDays: Number(form.referralExpiryDays) || 0,
        minSubscriptionPlan: form.minSubscriptionPlan || '',
        minSubscriptionAmount: Number(form.minSubscriptionAmount) || 0,
        shareMessage: form.shareMessage || '',
        maxRewardsPerUser: Number(form.maxRewardsPerUser) || 0,
        minSubscriptionDays: Number(form.minSubscriptionDays) || 0,
        campaignName: form.campaignName || '',
      }, currentUser?.uid)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Failed to save referral settings: ' + (err.message || 'Unknown error'))
    }
    setSaving(false)
  }, [form, currentUser])

  if (loading) {
    return (
      <SettingsCard icon="🎁" iconBg="rgba(232,66,10,0.08)" title="Referral Settings" subtitle="Global referral program configuration">
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading referral settings...</div>
      </SettingsCard>
    )
  }

  if (!form) return null

  return (
    <>
      <SettingsCard icon="🎁" iconBg="rgba(232,66,10,0.08)" title="Referral Program" subtitle="Configure global referral program settings">
        <SettingRow label="Enable Referral System" desc="Toggle the entire referral program on or off">
          <Toggle on={form.enabled} onChange={v => set('enabled', v)} />
        </SettingRow>

        <SettingRow label="Reward Type" desc="Type of reward issued for successful referrals">
          <select className="ps-select" value={form.rewardMode}
            onChange={e => set('rewardMode', e.target.value)} style={{ minWidth: 200 }}>
            <option value="Wallet Credit">Wallet Credit</option>
            <option value="Discount Coupon">Discount Coupon</option>
            <option value="Membership Extension">Membership Extension</option>
          </select>
        </SettingRow>

        <SettingRow label="Referrer Reward Value" desc="Amount/value the referrer earns (₹ or days)">
          <input className="ps-input" type="number" min={0} value={form.referrerRewardValue}
            onChange={e => set('referrerRewardValue', Number(e.target.value))} style={{ width: 120 }} />
        </SettingRow>

        <SettingRow label="New User Reward Value" desc="Amount/value the new referred user earns (₹ or days)">
          <input className="ps-input" type="number" min={0} value={form.newUserRewardValue}
            onChange={e => set('newUserRewardValue', Number(e.target.value))} style={{ width: 120 }} />
        </SettingRow>

        <SettingRow label="Referral Expiry Days" desc="How many days before a referral code expires">
          <input className="ps-input" type="number" min={1} value={form.referralExpiryDays}
            onChange={e => set('referralExpiryDays', Number(e.target.value))} style={{ width: 120 }} />
        </SettingRow>

        <SettingRow label="Minimum Subscription Plan" desc="Minimum plan name required for referral qualification">
          <input className="ps-input" type="text" value={form.minSubscriptionPlan}
            onChange={e => set('minSubscriptionPlan', e.target.value)}
            placeholder="e.g. Standard" style={{ width: 200 }} />
        </SettingRow>

        <SettingRow label="Minimum Subscription Amount (₹)" desc="Minimum subscription amount for referral qualification">
          <input className="ps-input" type="number" min={0} value={form.minSubscriptionAmount}
            onChange={e => set('minSubscriptionAmount', Number(e.target.value))} style={{ width: 120 }} />
        </SettingRow>

        <SettingRow label="Max Rewards Per User" desc="Maximum number of rewards a single user can earn">
          <input className="ps-input" type="number" min={1} value={form.maxRewardsPerUser}
            onChange={e => set('maxRewardsPerUser', Number(e.target.value))} style={{ width: 120 }} />
        </SettingRow>

        <SettingRow label="Min Subscription Days" desc="Minimum days before a referral qualifies for reward">
          <input className="ps-input" type="number" min={0} value={form.minSubscriptionDays}
            onChange={e => set('minSubscriptionDays', Number(e.target.value))} style={{ width: 120 }} />
        </SettingRow>

        <SettingRow label="Campaign Name" desc="Optional name for the current referral campaign">
          <input className="ps-input" type="text" value={form.campaignName}
            onChange={e => set('campaignName', e.target.value)}
            placeholder="e.g. Summer 2026 Drive" style={{ width: 240 }} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon="💬" iconBg="rgba(16,185,129,0.08)" title="Share Message" subtitle="Default message template for sharing referral links">
        <SettingRow label="Share Message Template" desc="Use {{NAME}}, {{LINK}}, {{CODE}}, {{GYM}} as placeholders">
          <textarea
            className="ps-input"
            value={form.shareMessage}
            onChange={e => set('shareMessage', e.target.value)}
            placeholder="Join {{GYM}} on IRONPULSE! Use my referral link: {{LINK}} Code: {{CODE}}"
            style={{ width: '100%', minHeight: 100, resize: 'vertical', padding: 10, fontSize: 12, lineHeight: 1.6 }}
          />
        </SettingRow>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', padding: '8px 12px', background: 'var(--hover)', borderRadius: 6, lineHeight: 1.6 }}>
          <strong>Available placeholders:</strong><br />
          {'{{NAME}}'} — Referrer's name<br />
          {'{{LINK}}'} — Full referral URL<br />
          {'{{CODE}}'} — Referral code<br />
          {'{{GYM}}'} — Gym name
        </div>
      </SettingsCard>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
          ⚠ {error}
        </div>
      )}

      <div className="ps-save-bar" style={{ marginTop: 16 }}>
        <div>
          {saved && <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>✓ Referral settings saved</span>}
        </div>
        <div>
          <button className="ps-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Referral Settings'}
          </button>
        </div>
      </div>
    </>
  )
}
