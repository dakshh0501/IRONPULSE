// src/services/whatsapp/campaignEngine.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — Campaign Manager engine (Sprint 79B).
//
// Responsibilities:
//   1. Audience selection (9 filters, pure evaluation over feed data)
//   2. Scheduling / recurrence (once, daily, weekly, monthly, cron)
//   3. Execution   → enqueues into the AutomationEngine queue
//   4. History     → per-campaign stats persisted back to Firestore
//   5. Due-check   → 60s in-tab tick (setTimeout chain, NO listeners)
//
// Reuses the AppContext feed (members/payments) — no Firestore
// queries inside this module except the stat flush writes.
// ─────────────────────────────────────────────────────────────

import { renderTemplate, todayStr } from './messageTemplates'
import { normalizePhone } from './providers/baseProvider'

const DAY_MS = 24 * 60 * 60 * 1000

export const AUDIENCE_TYPES = Object.freeze([
  { id: 'all',            label: 'All Members' },
  { id: 'active',         label: 'Active Members' },
  { id: 'expired',        label: 'Expired Members' },
  { id: 'due_payments',   label: 'Due Payments' },
  { id: 'birthday_today', label: 'Birthday Today' },
  { id: 'joined_this_month', label: 'Joined This Month' },
  { id: 'trial',          label: 'Trial Members' },
  { id: 'by_trainer',     label: 'By Trainer' },
  { id: 'by_plan',        label: 'By Membership Plan' },
])

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
})

export const REPEAT_MODES = Object.freeze([
  { id: 'once',      label: 'Send once' },
  { id: 'daily',     label: 'Repeat daily' },
  { id: 'weekly',    label: 'Repeat weekly' },
  { id: 'monthly',   label: 'Repeat monthly' },
  { id: 'cron',      label: 'Custom (cron)' },
])

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// ── Audience evaluation (pure — feed data from AppContext) ──

export function evaluateAudience(audience = {}, members = [], payments = []) {
  const type = audience.type || 'all'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const y = today.getFullYear(), mo = today.getMonth()
  const key = todayStr()

  const selected = (members || []).filter((m) => {
    if (!m || !m.phone) return false
    switch (type) {
      case 'active': return (m.status || 'Active') !== 'Expired' && (!m.expiry || new Date(m.expiry) >= today)
      case 'expired': return m.expiry && new Date(m.expiry) < today
      case 'due_payments': {
        if (!Array.isArray(payments) || !payments.length) return false
        return payments.some(p => (p.memberId === m.id || p.memberId === (m.authUid || m.id)) && p.status !== 'Paid' && p.status !== 'paid')
      }
      case 'birthday_today': {
        if (!m.birthDate) return false
        const b = new Date(m.birthDate)
        return !isNaN(b.getTime()) && b.getMonth() === mo && b.getDate() === today.getDate()
      }
      case 'joined_this_month': {
        const join = m.join || m.joinedAt || m.createdAt || ''
        const j = new Date(join)
        return !isNaN(j.getTime()) && j.getFullYear() === y && j.getMonth() === mo
      }
      case 'trial': return /trial/i.test(String(m.plan || '')) || /trial/i.test(String(m.membershipPlan || ''))
      case 'by_trainer': {
        const targetId = audience.trainerId || audience.trainerAuthUid
        return targetId ? (m.trainerAuthUid === targetId || m.trainerId === targetId) : false
      }
      case 'by_plan': {
        const p = audience.plan
        return p ? (String(m.plan || '') === String(p)) : false
      }
      default: return true // 'all'
    }
  })

  return selected.map(m => ({
    id: m.id,
    memberId: m.authUid || m.id,
    name: m.name || '',
    phone: normalizePhone(String(m.phone || '')),
    plan: m.plan || '',
trainerName: m.trainerName || '',
    expiry: m.expiry || '',
    amount: m.amountPaid || m.amount || 0,
  })).filter(r => r.phone)
}

// ── Recurrence helpers ────────────────────────────────────────────

function parseCron(value, max, min = 0) {
  const out = new Set()
  const parts = String(value).split(',')
  for (const part of parts) {
    const step = part.split('/')
    const stepN = step.length > 1 ? (parseInt(step[1], 10) || 1) : 1
    if (step[0] === '*') {
      for (let i = min; i <= max; i += stepN) out.add(i)
    } else if (step[0].includes('-')) {
      const [a, b] = step[0].split('-').map(n => parseInt(n, 10))
      for (let i = a; i <= b; i += stepN) out.add(i)
    } else {
      const n = parseInt(step[0], 10)
      if (!isNaN(n)) out.add(n)
    }
  }
  return out
}

/** 5-field cron: minute hour day-of-month month day-of-week (0-6, sun=0; 7→0). */
export function matchCron(expr, date) {
  const f = String(expr || '').trim().split(/\s+/)
  if (f.length !== 5) return false
  const [minField, hourField, domField, monField, dowField] = f
  const mins = parseCron(minField, 59)
  const hours = parseCron(hourField, 23)
  const doms = parseCron(domField, 31, 1)
  const mons = parseCron(monField, 12, 1)
  let dows = parseCron(dowField, 6)
  if (dows.has(7)) dows.add(0)
  return mins.has(date.getMinutes()) &&
    hours.has(date.getHours()) &&
    doms.has(date.getDate()) &&
    mons.has(date.getMonth() + 1) &&
    dows.has(date.getDay())
}

/** Next run after `from` for a campaign config. Returns Date or null (once & past → null). */
export function computeNextRun(schedule = {}, from = new Date()) {
  const mode = schedule.mode || 'once'
  const base = schedule.startAt ? new Date(schedule.startAt) : new Date(from)

  if (isNaN(base.getTime())) return null
  if (mode === 'once') return (base > from) ? base : null

  if (mode === 'daily') {
    const next = new Date(base)
    while (next <= from) next.setDate(next.getDate() + 1)
    return next
  }

  if (mode === 'weekly') {
    const weekdays = schedule.weekdays || schedule.runOnDays || []
    const days = weekdays.length
      ? weekdays.map(d => (Number(d) === 7 ? 0 : Number(d)))
      : [base.getDay()]
    const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate())
    for (let i = 0; i < 14; i++) {
      next.setDate(next.getDate() + 1)
      if (days.includes(next.getDay()) && next > fromDate) break
    }
    return next
  }

  if (mode === 'monthly') {
    const dom = schedule.dayOfMonth || base.getDate()
    let next = new Date(from)
    for (let i = 0; i < 13 && next <= from; i++) {
      next = new Date(next.getFullYear(), next.getMonth() + 1, Math.min(dom, 28))
    }
    return (next > from) ? next : null
  }

  if (mode === 'cron') {
    // Scan forward min-by-min (capped at 90 days) until match
    const probe = new Date(from)
    probe.setSeconds(0, 0)
    for (let i = 0; i < 90 * 24 * 60; i++) {
      probe.setMinutes(probe.getMinutes() + 1)
      if (matchCron(schedule.cron || '', probe)) return new Date(probe)
    }
    return null
  }

  return null
}

// ── Execution ─────────────────────────────────────────────────────
// Pure/feed-driven — the HOST (whatsappService) supplies the engine
// and persistence hooks.

export class CampaignRunner {
  constructor({ engine, log, getConfig }) {
    this.engine = engine
    this._log = log || (async () => {})
    this._getConfig = getConfig || (() => ({}))
    this._checkTimer = null
    this.lastCheck = null
  }

  /** Host app feeds latest members/payments (memory only). */
  setFeed(members = [], payments = []) {
    this._feedM = members
    this._feedP = payments
  }

  /** Previews audience + delivery estimate (used by the UI + preview). */
  preview(campaign, members = [], payments = []) {
    const recipients = isAudience(campaign.audience, members, payments)
    const total = recipients.length
    const estMinutes = Math.max(1, Math.ceil(total / 60)) // ~1 msg/sec throughput
    return { recipients, total, estMinutes }
  }

  /** Enqueue one message per audience member through the shared engine. */
  async run(campaign, members = [], payments = []) {
    if (!campaign || campaign.status === CAMPAIGN_STATUS.CANCELLED) return 0
    const recipients = isAudience(campaign.audience, members, payments)
    if (!recipients.length) return 0

    let queued = 0
    const varsBase = {
      gymName: campaign.gymName || 'Workspace',
      campaignName: campaign.name || '',
      today: todayStr(),
    }
    for (const r of recipients) {
      const vars = {
        ...varsBase,
        memberName: r.name,
        phone: r.phone,
        planName: r.plan,
        trainerName: r.trainerName,
        expiryDate: r.expiry,
        amount: r.amount,
        totalCount: String(recipients.length),
      }
      const tpl = campaign.templateId || 'campaign'
      if (this.engine.send({
        templateId: tpl,
        customBody: campaign.body || '',
        phone: r.phone,
        vars,
        memberId: r.memberId,
        campaignId: campaign.id,
        // Recurring campaigns should re-send each run — dedup is per-day
        // (member+template), so a daily campaign re-fires on later days.
        skipDedup: false,
      })) queued++
    }
    campaign.lastRunAt = new Date().toISOString()
    campaign.lastRunCount = queued
    await this._log({ campaignId: campaign.id, status: 'triggered', count: queued })
    return queued
  }

  /** Mark a campaign completed / re-arm next run. */
  async advanceCampaign(campaign) {
    const next = computeNextRun(campaign.schedule, new Date())
    if (next) {
      campaign.nextRunAt = next.toISOString()
      campaign.status = CAMPAIGN_STATUS.SCHEDULED
    } else {
      campaign.nextRunAt = null
      campaign.status = CAMPAIGN_STATUS.COMPLETED
    }
    return next
  }

  /** 1-minute in-tab tick: fire due campaigns (NO Firestore polling).
   *  `loadDue` → due campaign list (in-memory cache via service);
   *  `onExecuted(campaign, next)` → persistence hook (service). */
  startCheckLoop(loadDue, onExecuted) {
    if (this._checkTimer) return
    this._checkTimer = setInterval(async () => {
      const now = Date.now()
      try {
        const list = typeof loadDue === 'function' ? loadDue(now) : []
        for (const c of list || []) {
          if (!c || c.status !== CAMPAIGN_STATUS.SCHEDULED || !c.nextRunAt) continue
          if (new Date(c.nextRunAt).getTime() <= now) {
            const queued = await this.run(c, this._feedM, this._feedP)
            const next = queued > 0 ? await this.advanceCampaign(c) : null
            if (queued > 0 && typeof onExecuted === 'function') {
              try { await onExecuted(c, next, queued) } catch { /* persistence failure is non-fatal */ }
            }
          }
        }
      } catch { /* tick failures never crash the loop */ }
      this.lastCheck = new Date().toISOString()
    }, 60 * 1000)
  }

  stopCheck() {
    if (this._checkTimer) { clearInterval(this._checkTimer); this._checkTimer = null }
  }
}

/** Feed-fed audience evaluation → normalized recipients with phones. */
export function isAudience(audience = {}, members = [], payments = []) {
  return evaluateAudience(audience, members, payments)
}