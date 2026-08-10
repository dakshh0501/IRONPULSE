// src/services/ai/reportGenerator.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — deterministic, data-driven report builder.
//
// Pure module (no Firebase, no React, no LLM): "Generate report"
// must answer with the REAL numbers already subscribed by
// AppContext — never a generic template from an external model.
//
// Role scopes:
//   super_admin → Platform Report (gyms, approvals, revenue, MRR)
//   gym_admin   → Gym Report     (members, attendance, revenue,
//                                  outstanding, expiries)
//   trainer     → Trainer Report (clients, check-ins, expiries)
//   member      → My Report      (plan, expiry, payments, activity)
//
// Every figure is computed defensively (missing arrays/fields are
// zero) so empty datasets still produce a coherent report.
// ─────────────────────────────────────────────────────────────

const SEVERITY = { GOOD: 'GOOD', WARN: 'WARN' }

const num = v => (Number(v) > 0 ? Number(v) : 0)
const toMs = v => (v && typeof v === 'object' && v.seconds ? v.seconds * 1000 : v ? new Date(v).getTime() : NaN)

export function fmtINR(n) {
  const v = Number(n) || 0
  return '₹' + v.toLocaleString('en-IN')
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthPrefixStr() {
  return todayStr().slice(0, 7)
}

export function daysUntilDate(str) {
  if (!str) return null
  const end = new Date(str)
  const start = new Date(todayStr())
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end.getTime() - start.getTime()) / 86400000)
}

function isToday(value) {
  return String(value || '').slice(0, 10) === todayStr()
}

function withinDays(value, days) {
  const ts = toMs(value)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= days * 86400000 && ts <= Date.now() + 86400000
}

function isPaid(p) {
  return String(p?.status || '').toLowerCase() === 'paid'
}

function isPendingPayment(p) {
  const st = String(p?.status || '').toLowerCase()
  if (st === 'paid') return false
  return st === 'pending' || st === 'overdue' || num(p.amount) - num(p.paid) > 0
}

function expiringMembers(members, days) {
  return (members || []).filter(m => {
    if (!m?.expiry) return false
    const d = daysUntilDate(m.expiry)
    return d !== null && d >= 0 && d <= days
  })
}

function monthCollected(payments) {
  const prefix = monthPrefixStr()
  return (payments || [])
    .filter(p => isPaid(p) && String(p.date || p.paidOn || '').slice(0, 7) === prefix)
    .reduce((s, p) => s + num(p.paid || p.amount), 0)
}

function outstanding(payments) {
  const list = (payments || []).filter(isPendingPayment)
  return {
    count: list.length,
    total: list.reduce((s, p) => s + (num(p.amount) - num(p.paid)), 0),
  }
}

const PLAN_FACTOR = { monthly: 1, quarterly: 3, yearly: 12, annual: 12, half_yearly: 6, '6month': 6, lifetime: 120, trial: 1 }

function mrrFrom(subscriptions) {
  const active = (subscriptions || []).filter(s => ['active', 'trial'].includes(String(s.status || '').toLowerCase()))
  return active.reduce((s, sub) => s + num(sub.amount) / (PLAN_FACTOR[String(sub.planType || 'monthly').toLowerCase()] || 1), 0)
}

function sentLast24h(logs) {
  return (logs || []).filter(l => l && String(l.status || '').toLowerCase() === 'sent' && withinDays(l.createdAt, 1)).length
}

function eventsLastNDays(list, field, days) {
  const f = field || 'createdAt'
  return (list || []).filter(item => withinDays(item?.[f], days)).length
}

/** Report = { title, rows: [{label, value}], observations: [{severity, text}], recommendations: [text] } */
export function buildRoleReport(role = 'gym_admin', data = {}) {
  const r = role === 'super_admin' ? buildPlatformReport(data)
    : role === 'trainer' ? buildTrainerReport(data)
    : role === 'member' ? buildMemberReport(data)
    : buildGymReport(data)
  r.text = renderReport(r)
  return r
}

/* ── super_admin: Platform Report ─────────────────────────── */

function buildPlatformReport(data) {
  const gyms = Array.isArray(data.gyms) ? data.gyms : []
  const subs = Array.isArray(data.subscriptions) ? data.subscriptions : []

  const pendingApprovals = gyms.filter(g => String(g.approvalStatus || '').toLowerCase() === 'pending')
  const activeGyms = gyms.filter(g => String(g.status || '').toLowerCase() === 'active'
    || (String(g.approvalStatus || '').toLowerCase() === 'approved' && !['suspended', 'expired', 'trial'].includes(String(g.status || '').toLowerCase())))
  const trialGyms = gyms.filter(g => String(g.status || '').toLowerCase() === 'trial')
  const trialSubs = subs.filter(s => String(s.status || '').toLowerCase() === 'trial').length
  // Trial gyms are mirrored in gyms[{status:'trial'}] AND their
  // subscription doc — count from gyms, fall back to subs only when
  // the gyms array is empty (avoids double counting).
  const trialCount = trialGyms.length > 0 ? trialGyms.length : trialSubs
  const expiredGyms = gyms.filter(g => ['expired', 'suspended'].includes(String(g.status || '').toLowerCase()))

  const monthly = monthCollected(data.payments)
  const mrr = mrrFrom(subs)
  const sent24h = sentLast24h(data.whatsappLogs)
  const campaignCount = Array.isArray(data.whatsappCampaigns) ? data.whatsappCampaigns.length : 0

  const observations = []
  const recommendations = []

  if (trialCount > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${trialCount} gym${trialCount === 1 ? '' : 's'} ${trialCount === 1 ? 'is' : 'are'} still on trial.` })
    recommendations.push('Reach out to trial gyms and convert them before their trial expires.')
  }
  if (pendingApprovals.length > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${pendingApprovals.length} approval${pendingApprovals.length === 1 ? '' : 's'} ${pendingApprovals.length === 1 ? 'is' : 'are'} pending.` })
    recommendations.push('Review pending approvals in the Gym Owners page to unblock new gyms.')
  }
  if (expiredGyms.length > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${expiredGyms.length} gym${expiredGyms.length === 1 ? '' : 's'} ${expiredGyms.length === 1 ? 'has' : 'have'} expired or been suspended.` })
    recommendations.push('Follow up with expired gyms to reactivate their subscription.')
  }
  if (monthly <= 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'Revenue has not started yet.' })
    recommendations.push('Collect the first payments and verify the PhonePe gateway configuration.')
  } else {
    recommendations.push(`Keep the momentum — ${fmtINR(monthly)} collected this month.`)
  }
  if (mrr <= 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'Recurring revenue (MRR) is zero — no paid subscriptions yet.' })
    recommendations.push('Convert active trials into paid plans to start building MRR.')
  } else {
    recommendations.push(`MRR is ${fmtINR(Math.round(mrr))} — focus on retention to keep subscription renewals on time.`)
  }
  if (sent24h > 0) {
    observations.push({ severity: SEVERITY.GOOD, text: `${sent24h} WhatsApp message${sent24h === 1 ? '' : 's'} delivered in the last 24 hours.` })
  } else {
    observations.push({ severity: SEVERITY.WARN, text: 'No WhatsApp messages sent in the last 24 hours.' })
    recommendations.push('Run a campaign or announce an offer from the Campaign Manager.')
  }
  if (campaignCount === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No WhatsApp campaigns created yet.' })
    recommendations.push('Launch your first campaign (festival wishes, discount or referral).')
  }

  const rows = [
    { label: 'Active gyms', value: String(activeGyms.length) },
    { label: 'Trial gyms', value: String(trialCount) },
    { label: 'Expired gyms', value: String(expiredGyms.length) },
    { label: 'Pending approvals', value: String(pendingApprovals.length) },
    { label: 'Monthly revenue', value: fmtINR(monthly) },
    { label: 'MRR', value: fmtINR(Math.round(mrr)) },
  ]

  return { title: 'Platform Report', rows, observations: capObs(observations), recommendations: capRec(recommendations) }
}

/* ── gym_admin: Gym Report ────────────────────────────────── */

function buildGymReport(data) {
  const members = Array.isArray(data.members) ? data.members : []
  const payments = Array.isArray(data.payments) ? data.payments : []
  const attendance = Array.isArray(data.attendance) ? data.attendance : []
  const trainers = Array.isArray(data.trainers) ? data.trainers : []

  const todays = attendance.filter(a => isToday(a.date))
  const uniqueToday = new Set(todays.map(a => a.memberId)).size
  const expiring = expiringMembers(members, 14)
  const due = outstanding(payments)
  const monthly = monthCollected(payments)
  const workoutCount = Array.isArray(data.workoutPlans) ? data.workoutPlans.length : 0
  const dietCount = Array.isArray(data.dietPlans) ? data.dietPlans.length : 0
  const newThisMonth = eventsLastNDays(members, 'createdAt', 30)
  const sent24h = sentLast24h(data.whatsappLogs)

  const observations = []
  const recommendations = []

  if (expiring.length > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${expiring.length} membership${expiring.length === 1 ? '' : 's'} expire within 14 days.` })
    recommendations.push('Send renewal reminders (WhatsApp automation) to the expiring members.')
  }
  if (due.count > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${due.count} invoice${due.count === 1 ? '' : 's'} outstanding totaling ${fmtINR(due.total)}.` })
    recommendations.push('Chase pending payments — follow up with the members listed under Payments.')
  }
  if (todays.length === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No check-ins recorded today yet.' })
    recommendations.push('Open the registration desk or reception mode to start the day\u2019s check-ins.')
  } else {
    observations.push({ severity: SEVERITY.GOOD, text: `${uniqueToday} member${uniqueToday === 1 ? '' : 's'} checked in today (${todays.length} record${todays.length === 1 ? '' : 's'}).` })
  }
  if (monthly <= 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No payments collected this month yet.' })
    recommendations.push('Collect pending invoices to start the month positive.')
  }
  if (newThisMonth === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No new members joined in the last 30 days.' })
    recommendations.push('Push a referral or flash-discount campaign to grow your member base.')
  }
  if (sent24h > 0) {
    observations.push({ severity: SEVERITY.GOOD, text: `${sent24h} WhatsApp message${sent24h === 1 ? '' : 's'} delivered in the last 24 hours.` })
  }
  if (members.length > 0 && trainers.length === 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${members.length} member${members.length === 1 ? '' : 's'} on board but no trainers on staff.` })
    recommendations.push('Add trainers and assign them to members for plan coverage.')
  }

  const rows = [
    { label: 'Total members', value: String(members.length) },
    { label: 'Trainers', value: String(trainers.length) },
    { label: 'Check-ins today', value: `${todays.length} (${uniqueToday} members)` },
    { label: 'Revenue this month', value: fmtINR(monthly) },
    { label: 'Outstanding payments', value: `${fmtINR(due.total)} (${due.count} invoices)` },
    { label: 'Memberships expiring in 14 days', value: String(expiring.length) },
    { label: 'Workout plans', value: String(workoutCount) },
    { label: 'Diet plans', value: String(dietCount) },
  ]

  return { title: 'Gym Report', rows, observations: capObs(observations), recommendations: capRec(recommendations) }
}

/* ── trainer: Trainer Report ──────────────────────────────── */

function buildTrainerReport(data) {
  const members = Array.isArray(data.members) ? data.members : []
  const attendance = Array.isArray(data.attendance) ? data.attendance : []

  const todayIds = new Set(attendance.filter(a => isToday(a.date)).map(a => a.memberId))
  const checkedIn = members.filter(m => todayIds.has(m.authUid || m.id))
  const missing = members.filter(m => !todayIds.has(m.authUid || m.id))
  const expiring = expiringMembers(members, 14)

  const workoutCount = Array.isArray(data.workoutPlans) ? data.workoutPlans.length : 0
  const dietCount = Array.isArray(data.dietPlans) ? data.dietPlans.length : 0

  const observations = []
  const recommendations = []

  if (missing.length > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${missing.length} client${missing.length === 1 ? '' : 's'} haven't checked in today.` })
    recommendations.push(`Follow up with ${missing.slice(0, 3).map(m => m.name || 'your clients').join(', ')}${missing.length > 3 ? ' and more' : ''}.`)
  } else if (checkedIn.length > 0) {
    observations.push({ severity: SEVERITY.GOOD, text: `All ${checkedIn.length} client${checkedIn.length === 1 ? '' : 's'} checked in today.` })
  }
  if (expiring.length > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${expiring.length} client membership${expiring.length === 1 ? '' : 's'} expire within 14 days.` })
    recommendations.push('Remind expiring clients to renew before the date passes.')
  }
  if (workoutCount === 0 && dietCount === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No workout or diet plans assigned yet.' })
    recommendations.push('Use the AI generator to create workout and diet plans for your clients.')
  }
  if (members.length === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No clients assigned to you yet.' })
    recommendations.push('Ask the gym admin to assign members to your profile.')
  }

  const rows = [
    { label: 'Assigned members', value: String(members.length) },
    { label: 'Checked in today', value: String(checkedIn.length) },
    { label: 'Not checked in today', value: String(missing.length) },
    { label: 'Clients expiring in 14 days', value: String(expiring.length) },
    { label: 'Workout plans', value: String(workoutCount) },
    { label: 'Diet plans', value: String(dietCount) },
  ]

  return { title: 'Trainer Report', rows, observations: capObs(observations), recommendations: capRec(recommendations) }
}

/* ── member: My Report ────────────────────────────────────── */

function buildMemberReport(data) {
  const members = Array.isArray(data.members) ? data.members : []
  const me = members.length === 1
    ? members[0]
    : (members.find(m => m.authUid === data.userId || m.id === data.userId) || members[0] || null)

  const attendance = Array.isArray(data.attendance) ? data.attendance : []
  const myAttendance = me ? attendance.filter(a => (a.memberId === (me.authUid || me.id)) || (members.length === 1 && a.memberId === me.id)) : attendance
  const checkinsToday = myAttendance.filter(a => isToday(a.date)).length
  const workoutCount = Array.isArray(data.workoutPlans) ? data.workoutPlans.length : 0
  const dietCount = Array.isArray(data.dietPlans) ? data.dietPlans.length : 0
  const progressCount = Array.isArray(data.progressLogs) ? data.progressLogs.length : 0

  const plan = me?.plan || me?.planName || (Array.isArray(data.plans) && data.plans.length ? data.plans[0].name : null) || '—'
  const expiry = me?.expiry
  const days = expiry ? daysUntilDate(expiry) : null

  const totalPaid = num(me?.amountPaid)
  const planPrice = num(me?.planPrice)
  const balance = num(me?.balanceDue) || Math.max(0, planPrice - totalPaid)
  const st = me?.paymentStatus || (balance > 0 ? 'Pending' : 'Paid')

  const observations = []
  const recommendations = []

  if (days !== null) {
    if (days < 0) {
      observations.push({ severity: SEVERITY.WARN, text: 'Your membership has expired.' })
      recommendations.push('Renew your membership to keep your plan active.')
    } else if (days <= 30) {
      observations.push({ severity: SEVERITY.WARN, text: `Your membership expires in ${days} day${days === 1 ? '' : 's'}.` })
      recommendations.push('Renew early to avoid a gap in your plan.')
    } else {
      observations.push({ severity: SEVERITY.GOOD, text: `Your membership is active for another ${days} day${days === 1 ? '' : 's'}.` })
    }
  }
  if (balance > 0) {
    observations.push({ severity: SEVERITY.WARN, text: `${fmtINR(balance)} is pending on your account (${st}).` })
    recommendations.push('Clear your balance through My Payments to stay on track.')
  } else if (me) {
    observations.push({ severity: SEVERITY.GOOD, text: 'Your payments are up to date.' })
  }
  if (checkinsToday === 0) {
    observations.push({ severity: SEVERITY.WARN, text: "You haven't checked in today." })
    recommendations.push('Check in on the Attendance page to keep your streak alive.')
  } else {
    observations.push({ severity: SEVERITY.GOOD, text: `Checked in ${checkinsToday} time${checkinsToday === 1 ? '' : 's'} today.` })
  }
  if (progressCount === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No progress entries logged yet.' })
    recommendations.push('Log your first weight and body-fat entry on the Progress page.')
  }
  if (workoutCount === 0 && dietCount === 0) {
    observations.push({ severity: SEVERITY.WARN, text: 'No workout or diet plans assigned yet.' })
    recommendations.push(`Ask your trainer (${me?.trainerName || 'the gym admin'}) for a plan.`)
  }

  const rows = [
    { label: 'Plan', value: String(plan) },
    { label: 'Membership expiry', value: expiry ? `${String(expiry).slice(0, 10)}${days !== null ? (days < 0 ? ' (expired)' : ` (in ${days} days)`) : ''}` : 'Not set' },
    { label: 'Payment status', value: String(st) },
    { label: 'Pending amount', value: balance > 0 ? fmtINR(balance) : '₹0' },
    { label: 'Check-ins today', value: String(checkinsToday) },
    { label: 'Total check-ins', value: String(myAttendance.length) },
    { label: 'Workout plans', value: String(workoutCount) },
    { label: 'Diet plans', value: String(dietCount) },
  ]

  return { title: 'My Report', rows, observations: capObs(observations), recommendations: capRec(recommendations) }
}

/* ── formatting ───────────────────────────────────────────── */

function capObs(list) {
  return list.slice(0, 5)
}

function capRec(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    const k = String(item).toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out.slice(0, 5)
}

function renderReport(report) {
  const lines = []
  lines.push(report.title)
  lines.push('')
  for (const row of report.rows) {
    lines.push(`${row.label}: ${String(row.value)}`)
  }
  if (report.observations.length > 0) {
    lines.push('')
    lines.push('Observations')
    for (const o of report.observations) lines.push(`- ${o.text}`)
  }
  if (report.recommendations.length > 0) {
    lines.push('')
    lines.push('Recommendations')
    for (const rec of report.recommendations) lines.push(`- ${rec}`)
  }
  return lines.join('\n')
}

export default {
  fmtINR,
  todayStr,
  monthPrefixStr,
  daysUntilDate,
  buildRoleReport,
}