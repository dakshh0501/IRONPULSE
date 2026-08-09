// src/services/whatsapp/providers/mockProvider.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — MockProvider (Sprint 79A).
//
// The ONLY active provider right now — no real WhatsApp delivery.
// It simulates provider behavior:
//     success    ~78%   message accepted
//     failure    ~6%    declared (400)
//     timeout    ~8%    no response (408)
//     rate_limit ~8%    throttled (429)
//
// Outcomes are DETERMINISTIC (hash of the recipient phone) unless
// a scenario is forced via setScenario() — used by test-send in
// the Automation Center. Only the caller-supplied result makes it
// out of this module. No credentials anywhere.
// ─────────────────────────────────────────────────────────────

import { BaseProvider, normalizePhone } from './baseProvider'

export const SCENARIOS = Object.freeze(['success', 'failure', 'timeout', 'rate_limit'])

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function outcomeFor(phone, forced) {
  if (forced && SCENARIOS.includes(forced)) return forced
  const r = hashStr(phone) % 100
  if (r < 78) return 'success'
  if (r < 86) return 'failure'
  if (r < 94) return 'timeout'
  return 'rate_limit'
}

export class MockProvider extends BaseProvider {
  constructor() {
    super({ name: 'mock', label: 'Mock Provider' })
    this.active = true
    this._forced = null
  }

  isConfigured() {
    return true // the mock needs no credentials
  }

  /** Force an outcome — used by the Test Send button. */
  setScenario(scenario) {
    this._forced = SCENARIOS.includes(scenario) ? scenario : null
  }

  getForcedScenario() {
    return this._forced
  }

  async send({ phone, body, meta = {} }) {
    if (!body || typeof body !== 'string') return { ok: false, error: 'Empty message body' }
    const normalized = normalizePhone(phone)
    if (!normalized) return { ok: false, error: 'MOCK_INVALID_PHONE' }

    // Simulated latency 150–950ms.
    const wait = 150 + (hashStr(normalized) % 8) * 100
    await new Promise(resolve => setTimeout(resolve, wait))

    const outcome = outcomeFor(normalized, this._forced)
    if (outcome === 'success') {
      return {
        ok: true,
        simulated: true,
        messageId: `mock-${Date.now()}_${hashStr(normalized) % 1000000}`,
      }
    }
    if (outcome === 'failure') return { ok: false, error: 'MOCK_FAILURE', code: '400' }
    if (outcome === 'timeout') return { ok: false, error: 'MOCK_TIMEOUT', code: '408' }
    return { ok: false, error: 'MOCK_RATE_LIMIT', code: '429' }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      description: 'Simulates success / failure / timeout / rate-limit. No real messages are sent.',
      simulated: true,
    }
  }
}

export default MockProvider