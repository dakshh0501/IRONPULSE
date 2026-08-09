// src/services/whatsapp/providers/twilioProvider.js
// ─────────────────────────────────────────────────────────────
// Twilio WhatsApp provider (SKELETON — keep inactive).
//
// Blueprint for the Twilio Sandbox / business API settings in
// https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json.
// Credentials must come from environment variables at runtime
// (e.g. VITE_TWILIO_SID, VITE_TWILIO_TOKEN, VITE_TWILIO_FROM)
// when activated — never hardcoded, never stored in Firestore.
//
// Sprint 79A ships mock-only; isConfigured() stays false.
// ─────────────────────────────────────────────────────────────

import { BaseProvider, normalizePhone } from './baseProvider'

export class TwilioProvider extends BaseProvider {
  constructor() {
    super({ name: 'twilio', label: 'Twilio WhatsApp' })
    this._id = 'twilio'
    this.active = true
  }

  isConfigured() {
    // No credentials loaded in this phase.
    return false
  }

  async send({ phone, body }) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'TWILIO_NOT_CONFIGURED', code: '503' }
    }
    const normalized = normalizePhone(phone)
    if (!normalized) return { ok: false, error: 'TWILIO_INVALID_PHONE' }
    // (Implementation goes here when credentials exist.)
    throw new Error('TwilioProvider.send: not implemented in mock-only phase')
  }

  getStatus() {
    return {
      ...super.getStatus(),
      description: 'Twilio WhatsApp channel. Inactive until credentials are added via env vars.',
    }
  }
}

export default TwilioProvider