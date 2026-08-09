// src/services/whatsapp/providers/metaProvider.js
// ─────────────────────────────────────────────────────────────
// WhatsApp Cloud API provider (SKELETON — keep inactive).
//
// Sprint 79A ships with ONLY MockProvider active. This file is the
// drop-in blueprint for Meta's official WhatsApp Business Cloud
// API. To activate later:
//   1. Provide credentials via environment variables ONLY
//      (e.g. VITE_META_WS_TOKEN, VITE_META_WS_PHONE_ID) — never
//      hardcode, never store in Firestore.
//   2. Implement AUTH header + POST to
//      https://graph.facebook.com/v21.0/{phoneNumberId}/messages
//   3. Return { ok, error, messageId } matching the contract.
//
// Until then isConfigured() is always false and send() refuses to
// run — the engine never selects an unconfigured provider.
// ─────────────────────────────────────────────────────────────

import { BaseProvider, normalizePhone } from './baseProvider'

export class MetaProvider extends BaseProvider {
  constructor() {
    super({ name: 'meta', label: 'WhatsApp Cloud API (Meta)' })
    this.active = true
  }

  isConfigured() {
    // No credentials are loaded in this phase — mock-only build.
    return false
  }

  async send({ phone, body, templateName = '' }) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'META_NOT_CONFIGURED', code: '503' }
    }
    const normalized = normalizePhone(phone)
    if (!normalized) return { ok: false, error: 'META_INVALID_PHONE' }
    // (Implementation goes here when credentials exist.)
    throw new Error('MetaProvider.send: not implemented in mock-only phase')
  }

  getStatus() {
    return {
      ...super.getStatus(),
      description: 'Official WhatsApp Cloud API. Inactive until credentials are added via env vars.',
    }
  }
}

export default MetaProvider