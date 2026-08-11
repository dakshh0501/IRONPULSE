// src/services/whatsapp/messageTemplates.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — Message templates & variables (Sprint 79A).
//
// Templates are reusable, per-gym-editable bodies stored in the
// automation config. This module holds the DEFAULTS plus a
// crash-safe renderer:
//   - {{var}} substitution only
//   - unknown variables never crash — they resolve to '' and are
//     reported via validateTemplate()
//   - missing values never crash — they resolve to ''
//   - values are escaped/sanitized (never injected as raw HTML)
// ─────────────────────────────────────────────────────────────

export const TEMPLATE_VARS = Object.freeze([
  'memberName', 'gymName', 'trainerName', 'planName',
  'amount', 'dueDate', 'expiryDate', 'attendance', 'phone', 'today',
])

export const TEMPLATE_IDS = Object.freeze([
  'membership_reminder',
  'payment_reminder',
  'payment_overdue',
  'birthday',
  'welcome',
  'new_member',
  'workout_assigned',
  'diet_assigned',
  'referral_reward',
  'announcement',
])

export const DEFAULT_TEMPLATES = {
  membership_reminder:
    'Hi {{memberName}},\n\nYour membership expires on {{expiryDate}}.\n\nRenew now to continue enjoying IRONPULSE.',
  payment_reminder:
    'Hi {{memberName}},\n\nYour payment of ₹{{amount}} is due on {{dueDate}}.',
  payment_overdue:
    'Hi {{memberName}},\n\nYour payment of ₹{{amount}} was due on {{dueDate}}. Please clear it at the front desk at the earliest.',
  birthday:
    'Happy Birthday {{memberName}}!\n\nHave an amazing year ahead!',
  welcome:
    'Welcome to {{gymName}}! We\u2019re excited to have you.',
  new_member:
    'Hi {{memberName}}, welcome to {{gymName}}! Your {{planName}} plan is now active. Strength starts today — see you at the gym!',
  workout_assigned:
    'Hi {{memberName}}, trainer {{trainerName}} has assigned your workout plan — {{planName}}. Check the app to get started!',
  diet_assigned:
    'Hi {{memberName}}, your {{planName}} diet plan is ready — see it in the app and follow the schedule!',
  referral_reward:
    'Great news {{memberName}}! Your referral reward has been credited. Check your rewards now!',
  announcement:
    '📢 {{gymName}}: {{message}}',
}

// ── Automation rules (each individually enable/disable) ─────
export const RULE_DEFS = Object.freeze([
  { key: 'expiry_soon',       name: 'Membership expires in X days', desc: 'Reminder before membership expiry (configurable window).', templateId: 'membership_reminder', defaultEnabled: true },
  { key: 'payment_due',       name: 'Payment due',                  desc: 'Payment reminder when an invoice is due soon.', templateId: 'payment_reminder', defaultEnabled: true },
  { key: 'payment_overdue',   name: 'Payment overdue',              desc: 'Chase payment after the due date passed.',            templateId: 'payment_overdue', defaultEnabled: true },
  { key: 'birthday',          name: 'Birthday wishes',              desc: 'Happy birthday on the member\u2019s birth date.',          templateId: 'birthday', defaultEnabled: true },
  { key: 'welcome',           name: 'Welcome message',              desc: 'Sent as soon as a new member joins.',               templateId: 'welcome', defaultEnabled: true },
  { key: 'new_member',        name: 'New member registration',     desc: 'Registration confirmation with plan details.',       templateId: 'new_member', defaultEnabled: true },
  { key: 'workout_assigned',  name: 'Workout assigned',            desc: 'Tell the member when a workout plan is assigned.',   templateId: 'workout_assigned', defaultEnabled: true },
  { key: 'diet_assigned',     name: 'Diet assigned',               desc: 'Tell the member when a diet plan is assigned.',      templateId: 'diet_assigned', defaultEnabled: true },
  { key: 'referral_reward',   name: 'Referral reward earned',      desc: 'Notify when a referral reward is credited.',         templateId: 'referral_reward', defaultEnabled: true },
  { key: 'admin_announcement', name: 'Admin announcement',         desc: 'Mass broadcast stored in the Automation Center.',    templateId: 'announcement', defaultEnabled: true },
])

export function defaultAutomationConfig() {
  return {
    enabled: true,
    provider: 'mock',                       // only provider available in this phase
    reminderDays: 3,                        // membership expiry window
    rules: Object.fromEntries(
      RULE_DEFS.map(r => [r.key, { enabled: r.defaultEnabled }])
    ),
    templates: { ...DEFAULT_TEMPLATES },
    updatedAt: new Date().toISOString(),
  }
}

// ── Renderer ────────────────────────────────────────────────

/** Fills {{var}} from vars. Unknown/missing resolve to '' (never crash). */
export function renderTemplate(body, vars = {}) {
  if (typeof body !== 'string') return ''
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, name) => {
    const value = vars[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}

/**
 * Sprint 81C: converts single-brace tokens ({var}) to double-brace
 * ({{var}}) so user-typed campaign/announcement bodies render their
 * variables. Already-double-braced text is left untouched.
 */
export function normalizeSingleBraces(body) {
  if (typeof body !== 'string') return body
  return body.replace(/(^|[^{])\{([a-zA-Z0-9_]+)\}(?!\})/g, '$1{{$2}}')
}

/**
 * @returns {{ unknown: string[], missing: string[] }} — never throws
 */
export function validateTemplate(body, vars = {}) {
  const found = new Set(['templateName'])
  const tokens = typeof body === 'string' ? (body.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || []) : []
  const names = tokens.map(t => t.replace(/[{}]/g, '').trim())
  const unknown = names.filter(n => !TEMPLATE_VARS.includes(n))
  const missing = names.filter(n => TEMPLATE_VARS.includes(n) && (vars[n] === undefined || vars[n] === null || vars[n] === ''))
  return { unknown: [...new Set(unknown)], missing: [...new Set(missing)] }
}

// ── Value formatting ────────────────────────────────────────
export function formatINR(n) {
  const v = Number(n) || 0
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function formatDate(isoOrTs) {
  if (!isoOrTs) return ''
  try {
    const d = isoOrTs instanceof Date ? isoOrTs : new Date(typeof isoOrTs === 'object' && isoOrTs.toDate ? isoOrTs.toDate() : isoOrTs)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default {
  TEMPLATE_VARS,
  TEMPLATE_IDS,
  DEFAULT_TEMPLATES,
  RULE_DEFS,
  defaultAutomationConfig,
  renderTemplate,
  normalizeSingleBraces,
  validateTemplate,
  formatINR,
  formatDate,
  todayStr,
}