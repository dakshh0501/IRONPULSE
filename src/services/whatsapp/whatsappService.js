// src/services/whatsapp/whatsappService.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — Service facade (Sprint 79A).
//
// Single entry point used by AppContext hooks and the Automation
// Center page:
//   init(gymId)            load config + start scheduler
//   trigger(event, ctx)    engine dispatch (no-op when disabled)
//   testSend / announce    explicit sends
//   retry(id)              dashboard retry
//   getStats / getProviderStatus
//
// Provider selection is centralized here — swap by changing the
// factory return. Only MockProvider is active in this build.
// SECURITY: phone numbers never appear in logs or UI outside
// admin-gated pages; credentials never exist in this bundle.
// ─────────────────────────────────────────────────────────────

import { MockProvider } from './providers/mockProvider'
import { MetaProvider } from './providers/metaProvider'
import { TwilioProvider } from './providers/twilioProvider'
import { AutomationEngine } from './automationEngine'
import { defaultAutomationConfig, RULE_DEFS } from './messageTemplates'
import { CampaignRunner, isAudience, computeNextRun, CAMPAIGN_STATUS } from './campaignEngine'
import {
  addWhatsappLog,
  getWhatsAppAutomationConfig,
  saveWhatsAppAutomationConfig,
  listWhatsappCampaigns,
  createWhatsappCampaign,
  updateWhatsappCampaign,
  bumpWhatsappCampaignStats,
  deleteWhatsappCampaign,
} from '../firestoreService'

const mock = new MockProvider()

/** Provider registry — Mock is the only active provider. */
const PROVIDERS = Object.freeze([
  mock,
  new MetaProvider(),
  new TwilioProvider(),
])

function activeProvider() {
  const active = PROVIDERS.find(p => p.active && p.isConfigured())
  return active || mock // engine always has a runnable provider
}

let _config = defaultAutomationConfig()
let _gymId = ''
let _campaignsCache = []

// ── Campaign stat flushing (batched — max 1 write per campaign/2s) ──
const statFlush = new Map() // campaignId → { sent, failed }
let statTimer = null
function queueStat(campaignId, field) {
  if (!campaignId) return
  const cur = statFlush.get(campaignId) || { sent: 0, failed: 0 }
  cur[field] += 1
  statFlush.set(campaignId, cur)
  if (statTimer) return
  statTimer = setTimeout(async () => {
    statTimer = null
    const batch = [...statFlush.entries()]
    statFlush.clear()
    for (const [id, d] of batch) {
      try {
        if (d.sent) await bumpWhatsappCampaignStats(id, { field: 'sent', by: d.sent })
        if (d.failed) await bumpWhatsappCampaignStats(id, { field: 'failed', by: d.failed })
      } catch {
        // stat loss on write failure is acceptable (never blocks sends)
      }
    }
  }, 2000)
}

export const engine = new AutomationEngine({
  provider: mock,
  log: async (record) => {
    try {
      await addWhatsappLog({ ...record, gymId: _gymId })
    } catch {
      // Logging failure must never break the send flow.
    }
  },
  getConfig: () => _config,
  onResult: (entry, status) => {
    if (!entry.campaignId) return
    queueStat(entry.campaignId, status === 'Sent' ? 'sent' : 'failed')
  },
})

export const campaignRunner = new CampaignRunner({
  engine,
  log: async (record) => {
    try { await addWhatsappLog({ ...record, gymId: _gymId }) } catch { /* non-fatal log write */ }
  },
  getConfig: () => _config,
})

/** Load automation config for a gym (one-shot getDoc — no listener). */
export async function init(gymId) {
  if (!gymId) return
  _gymId = gymId
  try {
    const cfg = await getWhatsAppAutomationConfig(gymId)
    if (cfg && typeof cfg === 'object') {
      _config = { ...defaultAutomationConfig(), ...cfg, rules: { ...defaultAutomationConfig().rules, ...(cfg.rules || {}) } }
    }
  } catch {
    _config = defaultAutomationConfig()
  }
  engine.startScheduler()
  startCampaignCheck()
  await syncCampaigns(gymId).catch(() => {})
  return _config
}

export async function saveConfig(config, gymId = _gymId) {
  _config = { ...defaultAutomationConfig(), ...config }
  await saveWhatsAppAutomationConfig(gymId, _config)
  return _config
}

export function getConfig() {
  return { ..._config, rules: { ..._config.rules } }
}

/** Called from AppContext CRUD hooks. Safe no-op when not enabled. */
export function triggerEvent(eventType, payload) {
  try {
    if (_config.enabled === false) return
    engine.trigger(eventType, payload)
  } catch {
    // never break the calling flow
  }
}

export function testSend({ templateId, phone, vars = {} }) {
  return engine.testSend({ templateId, phone, vars })
}

export function announceTo({ memberId, phone, vars = {} }) {
  return engine.announce({ phone, vars, memberId })
}

export function retryEntry(entryId) {
  return engine.retry(entryId)
}

export function getProviderStatus() {
  return PROVIDERS.map(p => p.getStatus())
}

export function getActiveProviderName() {
  return engine.provider?.name || 'mock'
}

export function setMockScenario(scenario) {
  mock.setScenario(scenario)
  return mock.getForcedScenario()
}

export function getStats() {
  return engine.getStats()
}

export function getLastExecutions() {
  return engine.getLastExecutions()
}

export function getRuleDefs() {
  return RULE_DEFS
}

export function setSweepData(members, payments) {
  engine.setSweepData(members, payments)
}

// ── Campaign Manager API ─────────────────────────────────────────

let _lastFeedM = []
let _lastFeedP = []
let _lastFeedG = []

export async function syncCampaigns(gymId = _gymId) {
  const list = await listWhatsappCampaigns(gymId)
  _campaignsCache = list
  return list
}

export function getCampaigns() {
  return [..._campaignsCache]
}

/** Collate a campaign doc (status-aware next run). */
export function buildCampaignDoc(input, createdBy = '', gymId = _gymId, id = '') {
  const schedule = {
    mode: input.scheduleMode || 'once',
    startAt: input.startAt ? new Date(input.startAt).toISOString() : new Date().toISOString(),
    weekdays: Array.isArray(input.weekdays) ? input.weekdays : [],
    dayOfMonth: input.dayOfMonth || 1,
    cron: input.cron || '',
  }
  const nextRunAt = computeNextRun(schedule, new Date())
  const status = nextRunAt ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.DRAFT
  return {
    id,
    name: input.name || '',
    gymId,
    presetId: input.presetId || '',
    body: input.body || '',
    audience: {
      type: input.audience || 'all',
      plan: input.plan || '',
      trainerAuthUid: input.trainerAuthUid || '',
    },
    schedule,
    status,
    nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
    lastRunAt: '',
    gymName: input.gymName || '',
    createdBy: input.createdBy || '',
    createdByName: input.createdByName || '',
    stats: { sent: 0, failed: 0, pending: 0, cancelled: 0, total: 0 },
    templateId: input.templateId || 'campaign',
  }
}

/** Create a campaign; if `fireNow` it enqueues immediately and ends. */
export async function createCampaign(input) {
  const doc = buildCampaignDoc(input)
  const id = await createWhatsappCampaign(doc)
  let fired = 0
  if (input.fireNow) {
    const c = { ...doc, id }
    fired = await campaignRunner.run(c, _lastFeedM, _lastFeedP, _lastFeedG)
    if (fired > 0) {
      const next = await campaignRunner.advanceCampaign(c)
      await updateWhatsappCampaign(id, {
        status: next ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.COMPLETED,
        lastRunAt: c.lastRunAt || new Date().toISOString(),
        nextRunAt: next ? next.toISOString() : null,
        'stats.total': fired,
      })
      doc.status = next ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.COMPLETED
      doc.lastRunAt = c.lastRunAt || new Date().toISOString()
      doc.nextRunAt = next ? next.toISOString() : null
      doc.stats.total = fired
    }
  }
  await syncCampaigns()
  return { ...doc, id, _fired: fired }
}

export async function updateCampaign(id, patch) {
  await updateWhatsappCampaign(id, patch)
  await syncCampaigns()
  return patch
}

export async function cancelCampaign(id) {
  await updateWhatsappCampaign(id, { status: CAMPAIGN_STATUS.CANCELLED, nextRunAt: null })
  await syncCampaigns()
}

export async function removeCampaign(id) {
  await deleteWhatsappCampaign(id)
  _campaignsCache = _campaignsCache.filter(c => c.id !== id)
}

/** Preview audience + delivery estimate for the create form. */
export function previewCampaign(audience, members = [], payments = [], gyms = []) {
  const recipients = isAudience(audience, members, payments, gyms)
  return {
    recipients,
    total: recipients.length,
    estMinutes: Math.max(1, Math.ceil(recipients.length / 60)),
  }
}

/** Re-run / kick a campaign straight into the queue. */
export async function runCampaignNow(id) {
  const c = _campaignsCache.find(x => x.id === id)
  if (!c || c.status === CAMPAIGN_STATUS.CANCELLED) return 0
  const queued = await campaignRunner.run(c, _lastFeedM, _lastFeedP, _lastFeedG)
  if (queued > 0) {
    c.lastRunAt = new Date().toISOString()
    // Sprint 81C: once-schedules must COMPLETE after a manual run — computing
    // the next run from a still-future startAt would re-arm Scheduled and the
    // 60s check-loop would fire the campaign a second time.
    const next = c.schedule && c.schedule.mode && c.schedule.mode !== 'once' ? computeNextRun(c.schedule, new Date()) : null
    await updateWhatsappCampaign(id, {
      lastRunAt: c.lastRunAt,
      nextRunAt: next ? next.toISOString() : null,
      status: next ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.COMPLETED,
      'stats.total': (c.stats?.total || 0) + queued,
    })
    c.status = next ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.COMPLETED
    c.nextRunAt = next ? next.toISOString() : null
  }
  await syncCampaigns()
  return queued
}

/** App feeds live members/payments/gyms (memory only — no queries here). */
export function setCampaignFeedData(members, payments, gyms) {
  _lastFeedM = members || []
  _lastFeedP = payments || []
  _lastFeedG = gyms || []
  engine.setSweepData(_lastFeedM, _lastFeedP)
  campaignRunner.setFeed(_lastFeedM, _lastFeedP, _lastFeedG)
}

/** Start the 1-min due-check loop (idempotent; no Firestore polling). */
let _checkStarted = false
export function startCampaignCheck() {
  if (_checkStarted) return
  _checkStarted = true
  campaignRunner.startCheckLoop(
    (now) => _campaignsCache.filter(c => c.status === CAMPAIGN_STATUS.SCHEDULED && c.nextRunAt && new Date(c.nextRunAt).getTime() <= now),
    async (campaign, next, queued) => {
      try {
        await updateWhatsappCampaign(campaign.id, {
          lastRunAt: campaign.lastRunAt || new Date().toISOString(),
          nextRunAt: next ? next.toISOString() : null,
          status: next ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.COMPLETED,
          'stats.total': (campaign.stats?.total || 0) + queued,
        })
      } catch { /* non-fatal */ }
      await syncCampaigns().catch(() => {})
    }
  )
}

export function runSweepsNow(members, payments) {
  engine.runDailySweeps(members, payments)
}

export default {
  init,
  saveConfig,
  getConfig,
  triggerEvent,
  testSend,
  announceTo,
  retryEntry,
  getProviderStatus,
  getActiveProviderName,
  setMockScenario,
  getStats,
  getLastExecutions,
  getRuleDefs,
  setSweepData,
  runSweepsNow,
  syncCampaigns,
  getCampaigns,
  buildCampaignDoc,
  createCampaign,
  updateCampaign,
  cancelCampaign,
  removeCampaign,
  previewCampaign,
  runCampaignNow,
  setCampaignFeedData,
  startCampaignCheck,
  engine,
  campaignRunner,
}