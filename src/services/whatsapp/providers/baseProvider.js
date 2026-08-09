// src/services/whatsapp/providers/baseProvider.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — Provider contract (Sprint 79A).
//
// Every provider implements the same interface so the automation
// engine can swap implementations (Mock / Meta Cloud API / Twilio
// / Gupshup / Interakt) without touching rule or queue logic.
//
// Contract:
//   name           string          unique provider id
//   isConfigured() boolean         false until credentials exist
//   send(opts)     Promise<SendResult>
//   getStatus()    object          { provider, active, description }
//
// SendResult: { ok: boolean, error?: string, simulated?: boolean }
//
// SECURITY: provider implementations never hardcode credentials;
// none of them may log phone numbers or message bodies.
// ─────────────────────────────────────────────────────────────

export class BaseProvider {
  constructor(opts = {}) {
    this.name = opts.name || 'base'
    this.label = opts.label || 'Base provider'
    this.active = false
  }

  /** Subclasses override. False until real credentials exist. */
  isConfigured() {
    return false
  }

  /** Must be implemented by subclasses. */
  async send() {
    throw new Error(`${this.label} does not implement send()`)
  }

  getStatus() {
    return {
      provider: this.name,
      label: this.label,
      active: this.active && this.isConfigured(),
      description: this.active
        ? (this.isConfigured() ? 'Active — ready to send' : 'Active but not configured')
        : 'Inactive',
    }
  }
}

/** Shared phone helpers — no logging, no storage. */
export function normalizePhone(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return ''
  const digits = String(raw).replace(/\D/g, '')
  return digits.length === 10 ? `+91${digits}` : digits.length === 12 ? `+91${digits}` : digits
}

export function maskPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 4) return '••••'
  return digits.slice(0, 2) + '****' + digits.slice(-2)
}

export default {
  BaseProvider,
  normalizePhone,
  maskPhone,
}