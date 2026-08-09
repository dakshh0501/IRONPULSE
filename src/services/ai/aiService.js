// src/services/ai/aiService.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI assistant service layer (Sprint 77B, 77C, 79E).
//
// The assistant answers REAL questions using application data —
// but it reads ONLY the data already subscribed by AppContext
// (it never opens its own Firestore listeners, never polls, and
// never performs extra reads).
//
// Intent flow (Sprint 77C + 79E):
//   User → parseCommand → Action? → Navigation?
//     → Insight request? (Insight Engine — deterministic)
//     → confident local intent (>= 0.75)?
//       YES → AppContext resolver (deterministic fast path)
//       NO  → Gemini provider (when connected) → graceful fallback
//
// Insight requests (Sprint 79E) resolve through the Insight
// Engine first: Gemini (when connected) receives ONLY the
// aggregated metrics + insight summary + role + question, never
// raw Firestore data; when Gemini is offline, the deterministic
// answer is returned directly and the assistant never fails.
//
// The AppContext data snapshot is the LOCAL resolver's input only;
// it is never serialized or sent to any external provider.
// ─────────────────────────────────────────────────────────────

import { parseCommand, intentLabel } from './commandParser'
import { analyzeCommand } from './actionEngine'
import {
  matchInsightRequest,
  buildDeterministicAnswer,
  buildAggregateMetrics,
  buildRoleInsights,
  buildRoleHealth,
} from './insightEngine'
import {
  streamReply,
  isGeminiConfigured,
  GEMINI_GRACEFUL_FALLBACK,
} from './providers/geminiProvider'

export const AI_PROVIDER = {
  connected: false,
  name: null,
}

/** Parser confidence at/above which the local AppContext answer wins. */
export const CONFIDENCE_THRESHOLD = 0.75

/**
 * Flips the provider on. Called automatically at module load when
 * VITE_GEMINI_API_KEY is present; can also be invoked manually.
 */
export function connectGemini() {
  if (!AI_PROVIDER.connected && isGeminiConfigured()) {
    AI_PROVIDER.connected = true
    AI_PROVIDER.name = 'Gemini'
  }
  return AI_PROVIDER.connected
}

connectGemini()

export const SYSTEM_CAPABILITIES = [
  { area: 'Members',     example: 'Show members with pending dues' },
  { area: 'Attendance',  example: 'How many check-ins today?' },
  { area: 'Payments',    example: 'Which invoices are unpaid?' },
  { area: 'Revenue',     example: 'What was revenue today?' },
  { area: 'Workouts',    example: 'Create a workout plan' },
  { area: 'Diet',        example: 'Suggest a balanced meal plan' },
  { area: 'Reports',     example: 'Export a monthly report' },
  { area: 'Navigate',    example: 'Open payments, go to reports' },
]

export function isProviderConnected() {
  return AI_PROVIDER.connected
}

/* ══════════════════════════════════════════════════════════
   FORMATTING HELPERS
   ══════════════════════════════════════════════════════════ */

export function fmtINR(n) {
  const v = Number(n) || 0
  return '₹' + v.toLocaleString('en-IN')
}

export function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return String(str)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function todayForCompare() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function isToday(value) {
  if (!value) return false
  const check = String(value).slice(0, 10)
  return check === todayForCompare()
}

export function daysUntil(str) {
  if (!str) return null
  const end = new Date(str)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end.getTime() - Date.now()) / 86400000)
}

export function timeAgo(value) {
  if (!value) return ''
  const ts = value?.seconds ? value.seconds * 1000 : value
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const num = v => Number(v) || 0
const nameOf = m => m?.name || m?.memberName || 'Member'

/* ══════════════════════════════════════════════════════════
   DATA CONTEXT
   All resolvers read ONLY from context.data — the arrays the
   app already keeps in memory (role-scoped by AppContext).
   ══════════════════════════════════════════════════════════ */

function memberOf(data, userId) {
  // Member role: AppContext keeps only the user's own record.
  if (data.members.length === 1) return data.members[0]
  return data.members.find(m => m.authUid === userId || m.id === userId) || data.members[0] || null
}

function expiringSoon(members, days = 7) {
  return members
    .filter(m => m.expiry && !isToday(m.expiry))
    .map(m => ({ ...m, days: daysUntil(m.expiry) }))
    .filter(m => m.days !== null && m.days >= 0 && m.days <= days)
    .sort((a, b) => a.days - b.days)
}

/* ══════════════════════════════════════════════════════════
   INTENT RESOLVER REGISTRY
   Each resolver: (data, ctx) → { text, next? } | null
   A null return becomes the standard "couldn't find" answer.
   ══════════════════════════════════════════════════════════ */

const RESOLVERS = {
  // ── MEMBER ──────────────────────────────────────────────
  membership_expiry(data, ctx) {
    const me = memberOf(data)
    if (!me) return null
    if (!me.expiry) return { text: `No expiry date is set on your membership yet${ctx.role === 'member' ? '' : ` for ${nameOf(me)}`}.` }
    const d = daysUntil(me.expiry)
    const on = fmtDate(me.expiry)
    if (d === null) return { text: `Your membership is marked as expiring on ${me.expiry}.` }
    if (d < 0) return { text: `Your membership expired on ${on} — please renew to keep your plan active.` }
    return { text: `Your membership expires on ${on} — that's ${d} day${d === 1 ? '' : 's'} from now.` }
  },
  membership_plan(data, ctx) {
    const me = memberOf(data)
    if (!me) return null
    const plan = me.plan || me.planName || ''
    const price = me.planPrice ? ` at ${fmtINR(me.planPrice)}` : ''
    if (!plan) return { text: `No membership plan is assigned yet${ctx.role === 'member' ? '' : ` for ${nameOf(me)}`}.` }
    return { text: `You are on the ${plan} plan${price}.${me.status ? ` Status: ${me.status}` : ''}` }
  },
  my_trainer(data, ctx) {
    const me = memberOf(data)
    if (!me) return null
    const trainer = me.trainerName || (data.trainers?.find(t => t.id === me.trainerId)?.name)
    if (!trainer) return { text: ctx.role === 'member' ? "You don't have an assigned trainer yet." : `No trainer is assigned to ${nameOf(me)} yet.` }
    return { text: `Your trainer is ${trainer}.` }
  },
  attendance_today(data, ctx) {
    const records = data.attendance.filter(a => isToday(a.date))
    const unique = new Set(records.map(a => a.memberId))
    if (records.length === 0) return { text: ctx.role === 'member' ? "You haven't checked in today yet." : 'No check-ins have been recorded today yet.' }
    if (ctx.role === 'member') return { text: `You checked in today — ${records.length} record${records.length === 1 ? '' : 's'} on file.` }
    const note = ctx.role === 'trainer' ? ' of your clients' : ''
    return { text: `${records.length} check-in${records.length === 1 ? '' : 's'} today${note} — ${unique.size} member${unique.size === 1 ? '' : 's'} active.` }
  },
  attendance_total(data, ctx) {
    const total = data.attendance.length
    const label = ctx.role === 'member' ? 'You have' : 'Total'
    return { text: `${label} ${total} attendance record${total === 1 ? '' : 's'} on file.` }
  },
  payment_status(data, ctx) {
    const me = memberOf(data)
    if (!me) return null
    const totalPaid = num(me.amountPaid)
    const planPrice = num(me.planPrice)
    const balance = num(me.balanceDue) || Math.max(0, planPrice - totalPaid)
    const st = me.paymentStatus || (balance > 0 ? 'Pending' : 'Paid')
    if (st === 'Paid' || (balance <= 0 && planPrice > 0)) return { text: `Your payments are up to date — nothing is due.` }
    if (st === 'Partial') return { text: `Your payment is partial: ${fmtINR(totalPaid)} paid, ${fmtINR(balance)} balance remaining.` }
    return { text: `Your payment is pending — ${fmtINR(balance)} balance on your ${me.plan || 'current'} plan.` }
  },
  next_due(data, ctx) {
    const me = memberOf(data)
    if (!me) return null
    const balance = num(me.balanceDue) || Math.max(0, num(me.planPrice) - num(me.amountPaid))
    if (balance > 0) return { text: `Your next payment is ${fmtINR(balance)}${me.expiry ? ` — due before renewal on ${fmtDate(me.expiry)}` : ''}.` }
    return { text: 'No payments are pending — you are all caught up.' }
  },
  my_workouts(data, ctx) {
    const list = data.workoutPlans
    if (list.length === 0) return { text: ctx.role === 'member' ? 'No workout plans are assigned to you yet.' : 'No workout plans found.' }
    return { text: `You have ${list.length} workout plan${list.length === 1 ? '' : 's'}: ${list.slice(0, 4).map(p => p.name || 'Untitled').join(', ')}${list.length > 4 ? ` +${list.length - 4} more` : ''}.` }
  },
  my_diet(data, ctx) {
    const list = data.dietPlans
    if (list.length === 0) return { text: ctx.role === 'member' ? 'No diet plans are assigned to you yet.' : 'No diet plans are available.' }
    return { text: `You have ${list.length} diet plan${list.length === 1 ? '' : 's'}: ${list.slice(0, 4).map(p => p.name || 'Untitled').join(', ')}${list.length > 4 ? ` +${list.length - 4} more` : ''}.` }
  },
  my_progress(data, ctx) {
    const logs = data.progressLogs
    if (logs.length === 0) return { text: 'No progress entries logged yet — head to Progress to add your first entry.' }
    const latest = logs[logs.length - 1] || logs[0]
    const parts = []
    if (num(latest.weight)) parts.push(`weight ${latest.weight} kg`)
    if (num(latest.bodyFat)) parts.push(`body fat ${latest.bodyFat}%`)
    if (num(latest.bmi)) parts.push(`BMI ${latest.bmi}`)
    return { text: `You have ${logs.length} progress entr${logs.length === 1 ? 'y' : 'ies'}. Latest: ${parts.length ? parts.join(', ') : `logged on ${fmtDate(latest.createdAt)}`}.` }
  },
  analyze_progress(data, ctx) {
    const me = memberOf(data)
    const logs = Array.isArray(data.progressLogs) ? data.progressLogs.slice(-4) : []
    if (logs.length === 0 && !num(me?.weight) && !num(me?.bodyFat) && !me?.goal) {
      return { text: "I don't have enough progress data to analyze yet — log your first weight, body fat and BMI entry on the Progress page and ask me again." }
    }
    const bits = []
    if (num(me?.weight)) bits.push(`current weight ${num(me.weight)} kg`)
    if (num(me?.bodyFat)) bits.push(`body fat ${num(me.bodyFat)}%`)
    if (me?.goal) bits.push(`goal — ${String(me.goal).slice(0, 80)}`)
    const last = logs[logs.length - 1]
    const trend = last && num(last.weight) ? `last logged weight ${num(last.weight)} kg on ${fmtDate(last.createdAt || last.date)}` : ''
    return { text: `Progress snapshot: ${bits.length ? bits.join(', ') : 'no body metrics recorded yet'}${trend ? `; ${trend}` : ''}. Whether the numbers move up or down, consistency is what drives the trend.` }
  },

  // ── TRAINER ──────────────────────────────────────────────
  assigned_members(data, ctx) {
    const list = data.members
    if (list.length === 0) return { text: 'You have no assigned members right now.' }
    const names = list.slice(0, 5).map(nameOf).join(', ')
    return { text: `You have ${list.length} assigned member${list.length === 1 ? '' : 's'}${list.length <= 5 ? ` (${names}).` : ` — ${names} and more.`}` }
  },
  pending_checkins(data, ctx) {
    const members = data.members
    const todayIds = new Set(data.attendance.filter(a => isToday(a.date)).map(a => a.memberId))
    const pending = members.filter(m => !todayIds.has(m.authUid || m.id))
    if (pending.length === 0) return { text: 'All your members have checked in today.' }
    const names = pending.slice(0, 5).map(nameOf).join(', ')
    return { text: `${pending.length} client${pending.length === 1 ? '' : 's'} haven't checked in today yet — ${names}${pending.length > 5 ? ` and ${pending.length - 5} more` : ''}.` }
  },
  expiring_members(data, ctx) {
    const list = expiringSoon(data.members)
    const summary = summarizeExpiring(list)
    if (!summary) return { text: 'No memberships are expiring within the next 7 days.' }
    return { text: summary }
  },
  trainer_workouts(data, ctx) {
    const list = data.workoutPlans
    if (list.length === 0) return { text: 'No workout plans are available right now.' }
    return { text: `${list.length} workout plan${list.length === 1 ? '' : 's'} on file: ${list.slice(0, 4).map(p => p.name || 'Untitled').join(', ')}${list.length > 4 ? ` +${list.length - 4} more` : ''}.` }
  },
  trainer_diet(data, ctx) {
    const list = data.dietPlans
    if (list.length === 0) return { text: 'No diet plans are available right now.' }
    return { text: `${list.length} diet plan${list.length === 1 ? '' : 's'} on file: ${list.slice(0, 4).map(p => p.name || 'Untitled').join(', ')}${list.length > 4 ? ` +${list.length - 4} more` : ''}.` }
  },

  // ── GYM ADMIN ───────────────────────────────────────────
  members_count(data, ctx) { return { text: `You currently have ${data.members.length} member${data.members.length === 1 ? '' : 's'}.` } },
  trainers_count(data, ctx) { return { text: `${data.trainers.length} trainer${data.trainers.length === 1 ? '' : 's'} on staff.` } },
  revenue_today(data, ctx) {
    const todayPayments = data.payments.filter(p => isToday(p.date || p.paidOn) && String(p.status).toLowerCase() === 'paid')
    if (todayPayments.length === 0) return { text: 'No payments collected today yet.' }
    const total = todayPayments.reduce((s, p) => s + num(p.paid || p.amount), 0)
    return { text: `${fmtINR(total)} collected today across ${todayPayments.length} payment${todayPayments.length === 1 ? '' : 's'}.` }
  },
  monthly_revenue(data, ctx) {
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthPayments = data.payments.filter(p =>
      String(p.status).toLowerCase() === 'paid' &&
      String(p.date || p.paidOn || '').slice(0, 7) === monthPrefix
    )
    if (monthPayments.length === 0) return { text: `No payments collected in ${now.toLocaleString('en-IN', { month: 'long' })} yet.` }
    const total = monthPayments.reduce((s, p) => s + num(p.paid || p.amount), 0)
    return { text: `${fmtINR(total)} collected in ${now.toLocaleString('en-IN', { month: 'long' })} across ${monthPayments.length} payment${monthPayments.length === 1 ? '' : 's'}.` }
  },
  pending_payments(data, ctx) {
    const pending = data.payments.filter(p => {
      const st = String(p.status || '').toLowerCase()
      const due = num(p.amount) - num(p.paid)
      return st === 'pending' || st === 'overdue' || (st !== 'paid' && due > 0)
    })
    if (pending.length === 0) return { text: 'No pending or overdue payments right now.' }
    const total = pending.reduce((s, p) => s + (num(p.amount) - num(p.paid)), 0)
    return { text: `${pending.length} invoice${pending.length === 1 ? '' : 's'} outstanding totaling ${fmtINR(total)}.` }
  },
  recent_notifications(data, ctx) {
    const list = [...data.notifications]
      .sort((a, b) => (b.createdAt?.seconds || new Date(b.createdAt).getTime()) - (a.createdAt?.seconds || new Date(a.createdAt).getTime()))
      .slice(0, 3)
    if (list.length === 0) return { text: 'You have no notifications right now.' }
    return { text: `Your latest: ${list.map(n => `${n.title} (${timeAgo(n.createdAt)})`).join(', ')}.` }
  },

  // ── SUPER ADMIN ─────────────────────────────────────────
  total_gyms(data, ctx) { return { text: `${data.gyms.length} gym${data.gyms.length === 1 ? '' : 's'} registered on the platform.` } },
  active_gyms(data, ctx) {
    const active = data.gyms.filter(g => g.status === 'active' || (g.approvalStatus === 'approved' && g.status !== 'suspended'))
    return { text: `${active.length} of ${data.gyms.length} gyms are active right now.` }
  },
  pending_approvals(data, ctx) {
    const pending = data.gyms.filter(g => g.approvalStatus === 'pending')
    if (pending.length === 0) return { text: 'No gyms are awaiting approval.' }
    return { text: `${pending.length} gym${pending.length === 1 ? '' : 's'} awaiting approval.` }
  },
  platform_revenue(data, ctx) {
    const collected = data.payments.filter(p => String(p.status).toLowerCase() === 'paid').reduce((s, p) => s + num(p.paid || p.amount), 0)
    const subRevenue = data.subscriptions.filter(s => ['active', 'trial'].includes(String(s.status).toLowerCase())).reduce((s, sub) => s + num(sub.amount), 0)
    return { text: `${fmtINR(collected)} collected from member payments across gyms, plus ${fmtINR(subRevenue)} in active gym subscription revenue.` }
  },
  active_subscriptions(data, ctx) {
    const list = data.subscriptions.filter(s => ['active', 'trial'].includes(String(s.status).toLowerCase()))
    return { text: `${list.length} active gym subscription${list.length === 1 ? '' : 's'} on the platform.` }
  },
  total_users(data, ctx) {
    const m = data.members.length
    const t = data.trainers.length
    const gymOwners = data.gyms.length
    return { text: `${m} member${m === 1 ? '' : 's'}, ${t} trainer${t === 1 ? '' : 's'} and ${gymOwners} gym owner${gymOwners === 1 ? '' : 's'} — a total of ${m + t + gymOwners} accounts across the platform.` }
  },
  mrr(data, ctx) {
    const factor = { monthly: 1, quarterly: 3, yearly: 12, annual: 12, half_yearly: 6, '6month': 6, lifetime: 120, trial: 1 }
    const active = data.subscriptions.filter(s => ['active', 'trial'].includes(String(s.status).toLowerCase()))
    const mrr = active.reduce((s, sub) => s + num(sub.amount) / (factor[String(sub.planType || 'monthly').toLowerCase()] || 1), 0)
    return { text: `MRR is ${fmtINR(Math.round(mrr))} per month across ${active.length} active gym subscription${active.length === 1 ? '' : 's'}.` }
  },
  arr(data, ctx) {
    const factor = { monthly: 1, quarterly: 3, yearly: 12, annual: 12, half_yearly: 6, '6month': 6, lifetime: 120, trial: 1 }
    const active = data.subscriptions.filter(s => ['active', 'trial'].includes(String(s.status).toLowerCase()))
    const mrr = active.reduce((s, sub) => s + num(sub.amount) / (factor[String(sub.planType || 'monthly').toLowerCase()] || 1), 0)
    return { text: `ARR is approximately ${fmtINR(Math.round(mrr * 12))} per year (MRR ${fmtINR(Math.round(mrr))} × 12).` }
  },
  campaigns(data, ctx) {
    const list = Array.isArray(data.whatsappCampaigns) ? data.whatsappCampaigns : []
    if (list.length === 0) return { text: 'No WhatsApp campaigns have been created yet. Try the Campaign Manager.' }
    const byStatus = {}
    list.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1 })
    const summary = Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(', ')
    return { text: `${list.length} campaign${list.length === 1 ? '' : 's'} total — ${summary}. Start new ones from the Campaign Manager.` }
  },

  // ── General topics (data-light, kept useful) ────────────
  members(data, ctx) {
    if (ctx.role === 'member') return { text: `You have access to the member area — your plan, payments and attendance.` }
    if (ctx.role === 'trainer') return RESOLVERS.assigned_members(data, ctx)
    return RESOLVERS.members_count(data, ctx)
  },
  trainers(data, ctx) {
    if (ctx.role === 'trainer' || ctx.role === 'member') return { text: `The training team manages workouts, diet plans and client progress.` }
    return RESOLVERS.trainers_count(data, ctx)
  },
  workouts(data, ctx) { return RESOLVERS.trainer_workouts(data, ctx) },
  diet(data, ctx) { return RESOLVERS.trainer_diet(data, ctx) },
  progress(data, ctx) { return RESOLVERS.my_progress(data, ctx) },
  payments(data, ctx) { return RESOLVERS.pending_payments(data, ctx) },
  revenue(data, ctx) { return RESOLVERS.revenue_today(data, ctx) },
  attendance(data, ctx) { return RESOLVERS.attendance_today(data, ctx) },
  reports(data, ctx) {
    const me = memberOf(data)
    return { text: `The Reports page has Overview, Revenue, Members, Attendance, Workouts and CSV/PDF export.${ctx.role === 'member' ? ' Your membership summary lives on the Members side of the app.' : ''}` }
  },
  subscription(data, ctx) {
    if (ctx.role === 'member') {
      const me = memberOf(data)
      return { text: `Your membership is the ${me?.plan || 'current'} plan — renewals and renewals status live under My Payments.` }
    }
    if (data.currentSubscription) {
      const sub = data.currentSubscription
      return { text: `Your gym subscription: ${sub.planName || 'Standard'} (${sub.planType || 'monthly'}), status ${sub.status || '—'}${sub.expiryDate ? `, renewing on ${fmtDate(sub.expiryDate)}` : ''}.` }
    }
    if (ctx.role === 'super_admin') return RESOLVERS.active_subscriptions(data, ctx)
    return { text: 'Your subscription details are on the My Subscription page.' }
  },
  settings(data, ctx) {
    return { text: 'The Settings page covers gym details, appearance, notifications, staff, devices and more.' }
  },
  support(data, ctx) {
    return { text: ctx.role === 'member' || ctx.role === 'trainer'
      ? 'Support tickets are handled by your gym — ask the front desk or check the Support page if available.'
      : 'Your open tickets and requests are on the Support & Tickets page.' }
  },
}

/* ══════════════════════════════════════════════════════════
   MINIMAL EXPLICIT CONTEXT (Sprint 77C+)
   Some "analysis" intents may carry a SMALL, explicit slice of
   app data to Gemini — never the whole AppContext. Each scope
   below returns only the fields the question actually needs.
   ══════════════════════════════════════════════════════════ */

const CONTEXT_SCOPES = {
  // "Analyze my progress" — body metrics + goal only.
  analyze_progress(data, ctx) {
    const me = memberOf(data)
    const out = {}
    if (num(me?.weight)) out.weight = num(me.weight)
    if (num(me?.bodyFat)) out.bodyFat = num(me.bodyFat)
    if (num(me?.bmi)) out.bmi = num(me.bmi)
    if (me?.goal) out.goal = String(me.goal).slice(0, 120)
    const latest = (Array.isArray(data.progressLogs) ? data.progressLogs : [])
      .slice(-5)
      .map(l => {
        const row = {}
        if (l.createdAt || l.date) row.date = String(fmtDate(l.createdAt || l.date))
        if (num(l.weight)) row.weight = num(l.weight)
        if (num(l.bodyFat)) row.bodyFat = num(l.bodyFat)
        if (num(l.bmi)) row.bmi = num(l.bmi)
        return row
      })
      .filter(row => Object.keys(row).length > 0)
    if (latest.length) out.latestEntries = latest
    return Object.keys(out).length > 0 ? out : null
  },
}

/**
 * Builds the minimal explicit context slice for an intent, or
 * null when the intent carries none (the default for all other
 * questions — they reach Gemini with role + question + history
 * only).
 */
export function buildMinimalContext(intent, data, ctx) {
  const builder = CONTEXT_SCOPES[intent]
  if (typeof builder !== 'function' || !data) return null
  try {
    return builder(data, ctx) || null
  } catch {
    return null
  }
}

/** "Renew membership" style suggestions let users both ask
 *  again and jump — resolves to navigation-aware chips. */
function reduceSuggestions(chips) {
  return chips.filter((v, i, a) => a.indexOf(v) === i).slice(0, 5)
}

function summarizeExpiring(list) {
  if (list.length === 0) return null
  const shown = list.slice(0, 4).map(m => `${m.name} (${m.expiry})`).join(', ')
  return `${list.length} membership${list.length === 1 ? '' : 's'} expiring within 7 days — ${shown}${list.length > 4 ? ` plus ${list.length - 4} more` : ''}.`
}

/* ══════════════════════════════════════════════════════════
   FOLLOW-UP SUGGESTIONS (3–4 relevant chips after every reply)
   ══════════════════════════════════════════════════════════ */

const DEFAULT_FOLLOWUPS = {
  super_admin: ['Which gyms are awaiting approval?', 'What is platform revenue?', 'List active subscriptions', 'Total gyms on platform'],
  gym_admin:   ['How many check-ins today?', 'Which members have pending dues?', 'What is revenue today?', 'Which memberships are expiring?'],
  trainer:     ['Who is due for a check-in today?', 'Show my assigned members', 'Which memberships are expiring?', 'What workout plans do I have?'],
  member:      ['When does my membership expire?', 'What is my payment status?', 'Show my workout plans', 'Open my diet plans'],
}

const INTENT_FOLLOWUPS = {
  insights:           ['How healthy is my gym?', 'Which memberships are expiring?', 'Who needs attention?', 'What is revenue this month?'],
  membership_expiry: ['Renew my membership', 'What is my payment status?', 'Show my payments', 'Attendance today'],
  membership_plan:   ['When does my membership expire?', 'What is my next payment?', 'Show my workout plans'],
  my_trainer:        ['What workout plans do I have?', 'What is in my diet plan?', 'My progress summary'],
  attendance_today:  ['How many times have I checked in?', 'What is my payment status?', 'Open attendance', 'My trainer'],
  attendance_total:  ['My attendance today', 'What is my payment status?', 'Show my workout plans'],
  payment_status:    ['What is my next payment?', 'Renew my membership', 'When does my membership expire?', 'My progress'],
  next_due:          ['What is my payment status?', 'Renew membership', 'Show my payments', 'Membership expiry'],
  my_workouts:       ['Open my workouts', 'My diet plans', 'My progress'],
  my_diet:           ['Open my diet plans', 'My workout plans', 'My trainer'],
  my_progress:       ['My workouts', 'My diet', 'My payment status', 'Membership expiry'],
  analyze_progress:   ['My progress', 'My workouts', 'My diet', 'My payment status'],
  assigned_members:  ["Which clients haven't checked in?", 'Which memberships are expiring?', 'Open my members'],
  pending_checkins:  ['How many check-ins today?', 'Which memberships are expiring?', 'Show my members'],
  expiring_members:  ["Who hasn't checked in today?", 'Open members', 'How many members?'],
  trainer_workouts:  ['What diet plans do I have?', 'Who is expiring soon?', 'My clients'],
  trainer_diet:      ['What workout plans do I have?', "Who hasn't checked in today?", 'My clients'],
  members_count:     ['How many trainers are there?', "Who hasn't checked in today?", 'What is revenue today?'],
  trainers_count:    ['How many members are there?', 'Show me trainers', 'What is revenue today?'],
  revenue_today:     ['Which payments are pending?', 'How many members are there?', 'What is expiring soon?'],
  pending_payments:  ['What is revenue today?', "Who hasn't checked in today?", 'How many members?'],
  recent_notifications: ['Open notifications', 'What is my payment status?', "Who hasn't checked in today?"],
  total_gyms:        ['How many gyms are active?', 'Pending gym approvals', 'Platform revenue'],
  active_gyms:       ['How many gyms total?', 'Pending approvals', 'Active subscriptions'],
  pending_approvals: ['How many gyms total?', 'Active gyms', 'Platform revenue'],
  platform_revenue:  ['How many active subscriptions?', 'How many gyms total?', 'Pending approvals'],
  active_subscriptions: ['What is platform revenue?', 'Active gyms', 'Total gyms'],
  total_users:       ['How many gyms total?', 'Active subscriptions', 'Platform revenue'],
  navigate:          ['What can you do?', 'Show me my payment status', 'How many members?' , 'Open my diet'],
  greeting:          ['What can you do?', 'Show me my payment status', 'How many check-ins today?'],
  help:              ['Show me my payment status', 'How many check-ins today?', 'Which memberships are expiring?', 'Open payments'],
  fallback:          ['What can you do?', 'Show me my payment status', 'Open payments'],
  subscription:      ['Show my payments', 'When does my membership expire?', 'Open my membership plan'],
  reports:           ['Open reports', 'How many members?', 'What is revenue today?'],
  settings:          ['Open settings', 'Show my notifications', 'What can you do?'],
  support:           ['Show my recent notifications', 'How many check-ins today?', 'What can you do?'],
}

function buildFollowUps(intent, role) {
  const entry = INTENT_FOLLOWUPS[intent]
  const pool = (typeof entry === 'function' ? entry() : entry) || DEFAULT_FOLLOWUPS[role] || DEFAULT_FOLLOWUPS.gym_admin
  return reduceSuggestions(pool)
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION RESOLVER — maps to React Router paths (no reload)
   ══════════════════════════════════════════════════════════ */

function resolveNavigation(nav, role) {
  if (nav.unavailable) {
    return {
      text: `The ${nav.label} page isn't available for your role — I can find the answer you need here instead.`,
    }
  }
  return {
    text: `Opening ${nav.label}...`,
    navigation: { path: nav.path, label: nav.label },
  }
}

/* ══════════════════════════════════════════════════════════
   MAIN ENTRY
   ══════════════════════════════════════════════════════════ */

/**
 * Sends a user message and resolves with an assistant reply.
 * Never rejects and never throws — failures resolve as a user-safe
 * message so the chat never breaks.
 *
 * Resolution order:
 *  0. Action commands (Action Engine) — "add member", "create
 *     workout", "show pending payments"… execute UI actions via
 *     actionBus. Destructive requests only confirm, never act.
 *  1. Navigation / greeting / help → answered locally, always.
 *  2. Insight requests ("how healthy is my gym?", "who needs
 *     attention?", "how am I doing?") → Insight Engine. Gemini
 *     (when connected) explains ONLY aggregated metrics + insight
 *     summary — never the raw data; offline it returns the
 *     deterministic answer directly and never fails.
 *  3. Analysis intents (e.g. "Analyze my progress") with Gemini
 *     connected → Gemini, carrying ONLY a minimal explicit data
 *     slice (never the full AppContext).
 *  4. Confident local intent (confidence >= 0.75) → AppContext data.
 *  5. Otherwise, when the Gemini provider is connected → Gemini
 *     (streaming via onToken, cancellable via signal).
 *  6. Otherwise → simulated fallback answer.
 *
 * @param {string} message           - user input
 * @param {Object} context
 * @param {string} context.role
 * @param {string} context.userId
 * @param {string} [context.name]
 * @param {string} [context.gymName]
 * @param {Array}  [context.history] - last-10-turn session memory
 *                                     (React state, never stored)
 * @param {Object} context.data      - live AppContext data subset
 *                                     (local resolvers ONLY)
 * @param {Object} [handlers]
 * @param {Function} [handlers.onToken] - streaming text delta callback
 * @param {AbortSignal} [handlers.signal] - cancels in-flight Gemini call
 * @returns {Promise<{text: string, intent: string, intentLabel: string, nextSuggestions: string[], navigation?: {path: string, label: string}}>}
 */
export async function sendMessage(message, context = {}, handlers = {}) {
  const role = context.role || 'gym_admin'

  // 0. Action Engine — UI actions beat every other answer type.
  const command = analyzeCommand(message, role)
  if (command) {
    const latency = 160
    await new Promise(resolve => setTimeout(resolve, latency))
    if (command.kind === 'confirm') {
      return {
        text: command.prompt,
        intent: 'action',
        intentLabel: 'Action · Confirmation',
        nextSuggestions: ['Yes, proceed', 'No, cancel'],
        action: { kind: 'confirm', label: command.label },
      }
    }
    return {
      text: command.reply,
      intent: 'action',
      intentLabel: 'Action',
      nextSuggestions: buildFollowUps(role === 'member' ? 'navigate' : 'fallback', role),
      navigation: command.navigateTo
        ? { path: command.navigateTo, label: command.label }
        : undefined,
      action: {
        kind: 'action',
        scope: command.scope,
        actionId: command.actionId,
        params: command.params,
      },
    }
  }

  const parsed = parseCommand(message, role)
  let text
  let navigation
  let provider = 'local'

  try {
    if (parsed.intent === 'navigate' && parsed.navigation) {
      const n = resolveNavigation(parsed.navigation, role)
      text = n.text
      navigation = n.navigation
    } else {
      // Insight requests resolve role-first through the Insight
      // Engine — Gemini (when connected) only EXPLAINS metrics.
      const insight = await insightReply(message, context, handlers)
      if (insight) return insight

      if (parsed.intent === 'analyze_progress' && AI_PROVIDER.connected) {
        // Analysis requests: route to Gemini with an explicit,
        // minimal data slice (metrics + goal only).
        const scope = buildMinimalContext(parsed.intent, context.data, context)
        text = await geminiCall(message, context, handlers, scope)
        provider = 'gemini'
      } else if (parsed.intent === 'greeting' || parsed.intent === 'help' || parsed.confidence >= CONFIDENCE_THRESHOLD) {
        const ok = resolveIntent(parsed.intent, context.data, context)
        if (ok) {
          text = ok
        } else if (AI_PROVIDER.connected) {
          // Recognized topic but nothing to answer from local data —
          // hand the question to Gemini instead of guessing.
          text = await geminiCall(message, context, handlers)
          provider = 'gemini'
        } else {
          text = "I couldn't find that information. Try rephrasing — for example: 'Show me pending payments' or 'What is my membership expiry?'"
        }
      } else if (AI_PROVIDER.connected) {
        text = await geminiCall(message, context, handlers)
        provider = 'gemini'
      } else {
        text = "I couldn't find that information. Try rephrasing — for example: 'Open payments' or 'How many members?'"
      }
    }
  } catch (err) {
    text = GEMINI_GRACEFUL_FALLBACK
  }

  // Local answers keep a light simulated latency so the typing
  // indicator reads naturally; Gemini streams so it needs none.
  if (provider !== 'gemini') {
    const latency = Math.max(350, 900 - message.length * 2)
    await new Promise(resolve => setTimeout(resolve, latency))
  }

  return {
    text,
    intent: parsed.intent,
    intentLabel: intentLabel(parsed.intent),
    nextSuggestions: navigation
      ? buildFollowUps('navigate', role)
      : buildFollowUps(parsed.intent, role),
    navigation,
  }
}

/**
 * Insight Engine branch (Sprint 79E).
 * Recognizes insight questions ("how healthy is my gym?", "who
 * needs attention?", "how am I doing?", "platform health"…) and
 * answers them deterministically from already-subscribed data.
 *
 * Gemini is only ever asked to EXPLAIN aggregated metrics + an
 * insight summary — never raw Firestore records. When Gemini is
 * absent or fails, the deterministic answer is used as-is and the
 * assistant never fails because Gemini is offline.
 */
async function insightReply(message, context = {}, handlers = {}) {
  const role = context.role || 'gym_admin'
  const matched = matchInsightRequest(message, role)
  if (!matched) return null

  try {
    const data = context.data || {}
    const bundle = buildRoleInsights(role, data)
    const deterministic = buildDeterministicAnswer(matched, role, data)

    let text = deterministic
    let provider = 'local'
    if (AI_PROVIDER.connected) {
      // Aggregated metrics + summaries only — raw Firestore data
      // never leaves the browser.
      const scope = {
        insight: matched.key,
        metrics: buildAggregateMetrics(matched, data),
        topInsights: bundle.insights.slice(0, 6).map(i => `${i.severity}: ${i.title} — ${i.message}`),
      }
      const enriched = await geminiInsightCall(message, context, handlers, scope)
      if (enriched) {
        text = enriched
        provider = 'gemini'
      }
    }

    if (provider !== 'gemini') {
      const latency = Math.max(350, 900 - message.length * 2)
      await new Promise(resolve => setTimeout(resolve, latency))
    }

    return {
      text,
      intent: 'insights',
      intentLabel: 'Insights',
      nextSuggestions: buildFollowUps('insights', role),
      insights: bundle.insights.slice(0, 5),
      health: buildRoleHealth(role, data) || undefined,
    }
  } catch {
    return {
      text: "I couldn't generate insights right now.",
      intent: 'insights',
      intentLabel: 'Insights',
      nextSuggestions: buildFollowUps('insights', role),
    }
  }
}

/**
 * Gemini call site for insight explanations — sends ONLY role,
 * question, last-10-turn history and the aggregated metrics +
 * insight summary. Fails resolve to null so the caller keeps the
 * deterministic answer (never the generic fallback text).
 */
async function geminiInsightCall(message, context, handlers, scope) {
  const reply = await streamReply({
    question: message,
    history: context.history || [],
    role: context.role || 'gym_admin',
    context: scope,
    mode: 'explain',
    onToken: handlers?.onToken,
    signal: handlers?.signal,
  })
  return reply || null
}

/**
 * Gemini call site — sends ONLY role, question, the last 10 chat
 * turns, and (when the intent explicitly asks for it) a minimal
 * data slice via `explicitScope`. AppContext data never leaves
 * the browser otherwise. Any failure resolves to the graceful
 * fallback text.
 */
async function geminiCall(message, context, handlers, explicitScope) {
  const reply = await streamReply({
    question: message,
    history: context.history || [],
    role: context.role || 'gym_admin',
    context: explicitScope || null,
    onToken: handlers?.onToken,
    signal: handlers?.signal,
  })
  return reply || GEMINI_GRACEFUL_FALLBACK
}

function resolveIntent(intent, data, ctx) {
  if (intent === 'help') {
    return buildHelpReply(ctx.role)
  }
  if (intent === 'greeting') {
    return `Hi ${ctx.name?.trim() || 'there'}! Ask me about anything in ${ctx.gymName?.trim() || 'your gym'} — membership, attendance, payments, revenue, reports — or say 'Open payments' and I'll take you there.`
  }
  if (!data) return null
  const allowed = PERMISSION_GATES[intent]
  if (allowed && !allowed.includes(ctx.role)) {
    return `That question is for ${allowed.length > 1 ? 'admins only' : `the ${allowed[0] === 'super_admin' ? 'platform administrator' : 'gym admin'} team`} — your role (${ctx.role}) doesn't have access to that data.`
  }
  const resolver = RESOLVERS[intent]
  if (!resolver) return null
  const result = typeof resolver === 'function' ? resolver(data, ctx) : resolver
  if (!result) return "I couldn't determine what you meant. Try rephrasing — for example: 'How many members?' or 'Show me pending payments'."
  return result.text || "I couldn't determine what you meant."
}

/** Super-admin / admin-only intents. Anything not listed is
 *  answerable by everyone the parser exposes it to. */
const PERMISSION_GATES = {
  total_gyms: ['super_admin'],
  active_gyms: ['super_admin'],
  pending_approvals: ['super_admin'],
  platform_revenue: ['super_admin'],
  active_subscriptions: ['super_admin'],
  total_users: ['super_admin'],
  mrr: ['super_admin'],
  arr: ['super_admin'],
  campaigns: ['super_admin', 'gym_admin'],
}

function buildHelpReply(role) {
  const byRole = {
    member: 'Membership expiry, my plan, my trainer, check-ins (today/total), payment status, next payment, my workouts, my diet, my progress — and I can navigate, e.g. "Open my workouts".',
    trainer: 'Assigned members, today attendance, pending check-ins, expiring memberships, my workout & diet plans — and I can navigate, e.g. "Open my clients".',
    gym_admin: 'Member counts, trainers, today attendance, today revenue, pending payments, expiring memberships, recent notifications — and page navigation like "Open payments".',
    super_admin: 'Gyms count, active gyms, pending approvals, platform revenue, subscriptions, users — and page navigation like "Show me the gyms".',
  }
  return `Here's what I can answer from your live data: ${byRole[role] || byRole.gym_admin}.`
}

export default {
  AI_PROVIDER,
  SYSTEM_CAPABILITIES,
  CONFIDENCE_THRESHOLD,
  isProviderConnected,
  connectGemini,
  sendMessage,
  fmtINR,
  fmtDate,
  timeAgo,
}