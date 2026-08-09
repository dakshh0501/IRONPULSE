// src/services/whatsapp/campaignTemplates.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE WhatsApp — Campaign quick-starts (Sprint 79B).
// Reusable campaign presets with a default body + gradient used
// in the Campaign Manager UI. Bodies are templates like any
// WhatsApp template ({{memberName}}, {{gymName}}, {{today}}…).
// ─────────────────────────────────────────────────────────────

export const CAMPAIGN_PRESETS = Object.freeze([
  {
    id: 'festival_wishes',
    name: 'Festival Wishes',
    emoji: '🎉',
    description: 'Seasonal greetings to your members',
    body: 'Wishing you and your family a joyful festival season {{memberName}}! May this celebration bring health and happiness your way. 🎉 — {{gymName}}',
  },
  {
    id: 'new_year',
    name: 'New Year',
    emoji: '🎆',
    description: 'New Year greetings and motivation',
    body: 'Happy New Year {{memberName}}! 🎆 Here\u2019s to a stronger, healthier you in the year ahead. See you at {{gymName}}!',
  },
  {
    id: 'diwali',
    name: 'Diwali',
    emoji: '🪔',
    description: 'Diwali wishes for members',
    body: 'Shubh Diwali {{memberName}}! 🪔 May this festival of lights bring you and your family joy, prosperity and good health. — {{gymName}}',
  },
  {
    id: 'holi',
    name: 'Holi',
    emoji: '🎨',
    description: 'Holi wishes for members',
    body: 'Happy Holi {{memberName}}! 🎨 A splash of colour, a burst of energy — just like your workouts at {{gymName}}. Celebrate safely!',
  },
  {
    id: 'independence_day',
    name: 'Independence Day',
    emoji: '🇮🇳',
    description: 'Independence Day greetings',
    body: 'Happy Independence Day {{memberName}}! 🇮🇳 Let\u2019s honor the freedom fighters by staying fit, strong and independent. — {{gymName}}',
  },
  {
    id: 'gym_anniversary',
    name: 'Gym Anniversary',
    emoji: '🏆',
    description: 'Celebrate the gym\u2019s founding day',
    body: 'Today marks another year of {{gymName}}! 🏆 Thank you {{memberName}} for being part of our journey. Here\u2019s to many more reps together!',
  },
  {
    id: 'monthly_motivation',
    name: 'Monthly Motivation',
    emoji: '💪',
    description: 'Monthly push to stay consistent',
    body: 'New month, new goals {{memberName}}! 💪 Consistency beats intensity — keep showing up at {{gymName}}. Your future self says thank you.',
  },
  {
    id: 'flash_discount',
    name: 'Flash Discount',
    emoji: '⚡',
    description: 'Limited-time membership offer',
    body: 'FLASH OFFER {{memberName}}! ⚡ Enjoy exclusive {{discount}} discount on renewals, valid only till {{validUntil}}. Grab it at {{gymName}} today!',
  },
  {
    id: 'new_plan_launch',
    name: 'New Plan Launch',
    emoji: '🚀',
    description: 'Announce a brand-new membership plan',
    body: 'Big news {{memberName}}! 🚀 {{gymName}} just launched the {{planName}} plan — {{planDesc}}. Ask at the front desk or reply to know more!',
  },
  {
    id: 'referral_campaign',
    name: 'Referral Campaign',
    emoji: '🎁',
    description: 'Invite members to refer friends',
    body: 'Hi {{memberName}}! 🎁 Refer a friend to {{gymName}} and earn rewards on every successful signup. Share your referral code today!',
  },
])

export function getCampaignPreset(id) {
  return CAMPAIGN_PRESETS.find(p => p.id === id) || null
}