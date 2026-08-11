// src/services/whatsapp/automationEngine.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — Automation Engine (Sprint 79A).
//
// Responsibilities (per spec):
//   1. Evaluate rules            → evaluateEvent() + daily sweeps
//   2. Render templates          → renderTemplate (crash-safe)
//   3. Queue messages            → in-memory queue with statuses
//   4. Execute provider          → MockProvider (only active one)
//   5. Log result                → injected log handler → Firestore
//
// Queue statuses: Queued → Sending → Sent | Failed | Retrying.
// Retry policy: 1 min, 5 min, 15 min — max 3 attempts (then Failed).
// NO polling: sweeps are scheduled with setTimeout chains, and the
// queue worker is driven by promise completion + retry timers.
// ─────────────────────────────────────────────────────────────

import { renderTemplate, validateTemplate, todayStr, defaultAutomationConfig, RULE_DEFS, formatDate, normalizeSingleBraces } from './messageTemplates'

export const QUEUE_STATUS = Object.freeze({
  QUEUED: 'Queued',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  RETRYING: 'Retrying',
})

const RETRY_DELAYS_MIN = [1, 5, 15] // 1 min → 5 min → 15 min
const MAX_ATTEMPTS = 3

let _seq = 0
const nextId = () => `wa_${Date.now()}_${++_seq}`

export class AutomationEngine {
  /**
   * @param {Object} opts
   * @param {import('./providers/baseProvider').BaseProvider} opts.provider
   * @param {Function} opts.log          (record) => Promise<void> — Firestore writer
   * @param {Function} opts.getConfig    () => config object (rules/templates/provider)
   */
  constructor({ provider, log, getConfig, onResult } = {}) {
    this.provider = provider
    this._log = log || (async () => {})
    this._getConfig = getConfig || (() => defaultAutomationConfig())
    this._onResult = onResult || null

    this._queue = []            // Execution queue (retries + immediate sends)
    this.running = new Set()    // entryIds currently in-flight
    this._entries = new Map()   // id → entry (all activity, ring-capped later)
    this._dedup = new Map()     // key `${memberId}:${templateId}:${day}` → timestamp
    this._scheduleTimer = null
    this._stats = {
      total: 0, sent: 0, failed: 0, retrying: 0, queued: 0, startedAt: new Date().toISOString(),
    }
    this._lastExecutions = []    // [{ id, template, status, at, error }] ring (last 20)
    this._sweepScheduled = false
  }

  // ── Public API ────────────────────────────────────────────

  ruleEnabled(key) {
    try {
      return Boolean(this._getConfig()?.rules?.[key]?.enabled && this._getConfig()?.enabled !== false)
    } catch {
      return false
    }
  }

  /**
   * Entry point for event-driven triggers (called from AppContext
   * hooks and the Automation Center). Safe no-op when disabled.
   */
  trigger(eventType, payload = {}) {
    const ctx = this.buildVars(payload)
    switch (eventType) {
      case 'new_member':
      case 'welcome': {
        if (this.ruleEnabled('welcome')) this.send({ templateId: 'welcome', phone: ctx.phone, vars: ctx })
        if (this.ruleEnabled('new_member')) this.send({ templateId: 'new_member', phone: ctx.phone, vars: ctx })
        break
      }
      case 'payment_created': {
        if (this.ruleEnabled('payment_due') && payload.status !== 'Paid') {
          this.send({ templateId: 'payment_reminder', phone: ctx.phone, vars: ctx })
        }
        break
      }
      case 'payment_overdue': {
        if (this.ruleEnabled('payment_overdue')) this.send({ templateId: 'payment_overdue', phone: ctx.phone, vars: ctx })
        break
      }
      case 'birthday': {
        if (this.ruleEnabled('birthday')) this.send({ templateId: 'birthday', phone: ctx.phone, vars: ctx })
        break
      }
      case 'workout_assigned': {
        if (this.ruleEnabled('workout_assigned')) this.send({ templateId: 'workout_assigned', phone: ctx.phone, vars: ctx })
        break
      }
      case 'diet_assigned': {
        if (this.ruleEnabled('diet_assigned')) this.send({ templateId: 'diet_assigned', phone: ctx.phone, vars: ctx })
        break
      }
      case 'referral_reward': {
        if (this.ruleEnabled('referral_reward')) this.send({ templateId: 'referral_reward', phone: ctx.phone, vars: ctx })
        break
      }
      default:
        break // unknown event never throws
    }
  }

  /** Sends an ad-hoc/announcement message (bypasses rule toggles). */
  announce({ phone, templateId = 'announcement', vars = {}, memberId = '', campaignId = '', customBody, skipDedup = false }) {
    return this.send({ templateId, phone, vars, memberId, campaignId, customBody, skipDedup })
  }

  /** Test send — enqueues and runs immediately, returns entry id. */
  testSend({ templateId, phone, vars = {}, campaignId = '' }) {
    return this.send({ templateId, phone, vars, test: true, campaignId })
  }

  /**
   * Core enqueue: renders, validates shape, dedups per member/template/day,
   * pushes to queue and runs the worker.
   * Extra options: customBody (campaign messages), campaignId (stats),
   * `skipDedup` (campaigns re-check themselves instead).
   */
  send({ templateId, phone, vars = {}, test = false, memberId = '', campaignId = '', customBody, skipDedup = false }) {
    const cfg = this._getConfig() || {}
    // Sprint 81C: campaign bodies may use either {var} or {{var}} —
    // normalize single braces so rendered messages never show raw tokens.
    const body = customBody ? normalizeSingleBraces(customBody) : (cfg.templates?.[templateId] || '')
    if (!body) return null

    const rendered = renderTemplate(body, vars)
    if (!rendered.trim()) return null

    const entry = {
      id: nextId(),
      templateId,
      templateName: templateId,
      phone: String(phone || vars.phone || ''),
      body: rendered,
      vars: { ...vars },
      memberId: String(memberId || vars.memberId || ''),
      campaignId: String(campaignId || ''),
      status: QUEUE_STATUS.QUEUED,
      attempts: 0,
      provider: this.provider?.name || 'unknown',
      test: test === true,
      createdAt: new Date().toISOString(),
    }

    // Dedup guard (24h window). Sprint 81C: the key is scoped per
    // CAMPAIGN (when campaignId present) so two different campaigns can
    // both reach the same member on the same day — previously every
    // campaign shared templateId 'campaign', so the second campaign of
    // the day was silently deduped away for overlapping members
    // ("created but never delivered"). Re-running the SAME campaign
    // within 24h is still blocked (duplicate-send protection).
    if (!test && !skipDedup) {
      const day = todayStr()
      const key = entry.campaignId
        ? `${entry.campaignId}:${entry.memberId}:${templateId}:${day}`
        : `${entry.memberId}:${templateId}:${day}`
      const last = this._dedup.get(key)
      if (last && Date.now() - last < 24 * 60 * 60 * 1000) return null
      this._dedup.set(key, Date.now())
    }

    this._queue.push(entry)
    this._entries.set(entry.id, entry)
    this._stats.queued += 1
    this._stats.total += 1

    this.pump()
    return entry.id
  }

  /** Worker: processes the queue sequentially. */
  async pump() {
    while (this._queue.length > 0 && !this._pumping) {
      this._pumping = true
      const entry = this._queue.shift()
      this._stats.queued = Math.max(0, this._stats.queued - 1)
      await this.execute(entry)
      this._pumping = false
    }
  }

  async execute(entry) {
    entry.status = QUEUE_STATUS.SENDING
    entry.attempts += 1
    this._stats.retrying = [...this._entries.values()].filter(e => e.status === QUEUE_STATUS.RETRYING).length

    try {
      const result = await this.provider.send({ phone: entry.phone, body: entry.body, templateName: entry.templateId })
      if (result?.ok) {
        entry.status = QUEUE_STATUS.SENT
        entry.providerMessageId = result.messageId || ''
        this._stats.sent += 1
        this.recordExecution(entry, '')
        if (this._onResult) this._onResult(entry, QUEUE_STATUS.SENT)
      } else {
        throw new Error(result?.error || 'Provider rejected the message')
      }
    } catch (err) {
      const message = (err && err.message) || 'Provider error'
      if (entry.attempts < MAX_ATTEMPTS) {
        entry.status = QUEUE_STATUS.RETRYING
        this._stats.retrying += 1
        this.recordExecution(entry, message, true)
        this.scheduleRetry(entry)
      } else {
        entry.status = QUEUE_STATUS.FAILED
        entry.error = message
        this._stats.failed += 1
        this.recordExecution(entry, message, false)
        if (this._onResult) this._onResult(entry, QUEUE_STATUS.FAILED)
        // Failed executions stay in _entries for the dashboard retry button.
      }
    }

    await this._log({
      memberId: entry.memberId,
      phone: entry.phone,
      template: entry.templateId,
      provider: entry.provider,
      status: entry.status,
      attempts: entry.attempts,
      error: entry.error || '',
      entryId: entry.id,
      campaignId: entry.campaignId || '',
    })
  }

  scheduleRetry(entry) {
    const delayMin = RETRY_DELAYS_MIN[Math.min(entry.attempts - 1, RETRY_DELAYS_MIN.length - 1)] || RETRY_DELAYS_MIN[0]
    const timer = setTimeout(() => {
      entry.status = QUEUE_STATUS.RETRYING
      this._queue.push(entry)
      this.pump()
    }, delayMin * 60 * 1000)
    entry._retryTimer = timer
  }

  /** Retry a previously failed entry (dashboard Retry button). */
  retry(entryId) {
    const entry = this._entries.get(entryId)
    if (!entry || (entry.status !== QUEUE_STATUS.FAILED && entry.status !== QUEUE_STATUS.RETRYING)) return false
    if (entry._retryTimer) clearTimeout(entry._retryTimer)
    entry.attempts = Math.min(entry.attempts, 2) // count current attempt against the max
    entry.status = QUEUE_STATUS.QUEUED
    entry.error = ''
    this._queue.push(entry)
    this._stats.queued += 1
    this.pump()
    return true
  }

  recordExecution(entry, error, isRetry = false) {
    if (isRetry) return // retries are recorded again on next execute
    this._stats.lastExecution = new Date().toISOString()
    this._stats.lastStatus = entry.status
    this._lastError = error || this._lastError
    this._lastExecTemplate = entry.templateId

    this._lastExecutions = [
      { id: entry.id, templateId: entry.templateId, templateName: entry.templateId, status: entry.status, at: new Date().toISOString(), error },
      ...(this._lastExecutions || []),
    ].slice(0, 20)
  }

  // ── Vars builder (server-safe: reads only provided payload) ──
  buildVars(payload = {}) {
    return {
      memberName: payload.memberName || payload.name || '',
      gymName: payload.gymName || 'Workspace',
      trainerName: payload.trainerName || '',
      planName: payload.planName || payload.plan || '',
      amount: payload.amount !== undefined ? payload.amount : '',
      dueDate: payload.dueDate || '',
      expiryDate: payload.expiryDate || '',
      attendance: payload.attendance ?? '',
      phone: payload.phone || '',
      today: todayStr(),
    }
  }

  startScheduler() {
    if (this._sweepScheduled) return
    this._sweepScheduled = true
    const tick = () => {
      this.runDailySweeps()
      const now = new Date()
      const next = new Date(now)
      next.setHours(0, 5, 0, 0) // 00:05 IST-ish (local)
      if (next <= now) next.setDate(next.getDate() + 1)
      this._scheduleTimer = setTimeout(() => {
        this.runDailySweeps()
        tick()
      }, next - now)
    }
    tick()
  }

  /**
   * Daily rules — evaluated from data the HOST app provides once
   * (no Firestore queries, no listeners): membership expiry in X
   * days, birthday today, overdue payments.
   */
  runDailySweeps(members = [], payments = []) {
    const list = members.length ? members : this._sweepMembers
    const bills = payments.length ? payments : this._sweepPayments
    const cfg = this._getConfig() || {}
    if (!Array.isArray(list) || !list.length) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayKey = todayStr()

    for (const m of list) {
      if (!m || !m.phone) continue
      const vars = this.buildVars({
        memberId: m.id,
        memberName: m.name,
        phone: m.phone,
        planName: m.plan,
        gymName: cfg.gymName || 'Workspace',
      })

      // Birthday wishes
      if (this.ruleEnabled('birthday') && m.birthDate) {
        const b = new Date(m.birthDate)
        if (!isNaN(b.getTime()) && b.getMonth() === today.getMonth() && b.getDate() === today.getDate()) {
          this.send({ templateId: 'birthday', phone: m.phone, vars, memberId: m.id })
        }
      }

      // Membership expires in X days (calendar-day math — immune to the
      // time-of-day stored in the expiry value)
      if (this.ruleEnabled('expiry_soon') && m.expiry) {
        const exp = new Date(m.expiry)
        if (!isNaN(exp.getTime())) {
          exp.setHours(0, 0, 0, 0)
          const diff = Math.round((exp - today) / (1000 * 60 * 60 * 24))
          const window = Number(cfg.reminderDays) || 3
          if (diff >= 0 && diff <= window) {
            this.send({ templateId: 'membership_reminder', phone: m.phone, vars: { ...vars, expiryDate: formatDate(m.expiry) }, memberId: m.id })
          }
        }
      }
    }

    // Payment overdue sweep (due date passed + still unpaid)
    if (this.ruleEnabled('payment_overdue') && Array.isArray(bills)) {
      for (const p of bills) {
        if (!p || !p.due || p.status === 'Paid' || p.status === 'paid') continue
        if (String(p.due) < dayKey) {
          const m = list.find(x => x.id === p.memberId)
          if (!m?.phone) continue
          this.send({
            templateId: 'payment_overdue',
            phone: m.phone,
            vars: this.buildVars({
              memberId: m.id,
              memberName: m.name,
              phone: m.phone,
              amount: p.amount,
              dueDate: formatDate(p.due),
              planName: m.plan,
            }),
            memberId: m.id,
          })
        }
      }
    }
  }

  /** Host app feeds latest members/payments ONCE per change (no listeners added here). */
  setSweepData(members = [], payments = []) {
    this._sweepMembers = members
    this._sweepPayments = payments
  }

  getStats() {
    const queuedNow = this._queue.length
    return {
      ...this._stats,
      queuedNow,
      provider: this.provider?.name || 'none',
      retryPolicy: RETRY_DELAYS_MIN,
      maxAttempts: MAX_ATTEMPTS,
    }
  }

  getLastExecutions() {
    return (this._lastExecutions || []).map(e => ({ ...e }))
  }

  getEntryById(id) {
    return this._entries.get(id) || null
  }

  reset() {
    if (this._scheduleTimer) clearTimeout(this._scheduleTimer)
    this._sweepScheduled = false
    this._entries.forEach(e => { if (e._retryTimer) clearTimeout(e._retryTimer) })
    this._entries.clear()
    this._queue = []
    this._dedup.clear()
    this._lastExecutions = []
    this._stats = { total: 0, sent: 0, failed: 0, retrying: 0, queued: 0, startedAt: new Date().toISOString() }
  }
}

export default AutomationEngine