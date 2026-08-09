// src/services/ai/insightEngine.js
// ═════════════════════════════════════════════════════════════
// IRONPULSE AI — Insights & Recommendations Engine (Sprint 79D).
//
// Deterministic, role-isolated analytics running entirely on the
// AppContext data snapshot the chat already holds:
//
//   • Health scores (0–100, + status + reasons + recommendations)
//   • Severity-tagged insights (INFO / SUCCESS / WARNING / CRITICAL)
//   • Natural-language request mapping ("Show pending payments.")
//   • Aggregated metrics for the Gemini explainer — raw documents
//     never leave the browser.
//
// Contract: pure functions — no React, no Firestore, no listeners,
// no polling, no I/O. Every export is smoke-testable.
// ═════════════════════════════════════════════════════════════

export const SEVERITY = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
}

export const HEALTH_STATUS = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  NEEDS_ATTENTION: 'needs_attention',
}

export function healthScoreStatus(score) {
  if (score >= 80) return HEALTH_STATUS.EXCELLENT
  if (score >= 60) return HEALTH_STATUS.GOOD
  if (score >= 40) return HEALTH_STATUS.FAIR
  return HEALTH_STATUS.NEEDS_ATTENTION
}

const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, SUCCESS: 2, INFO: 3 }

/* ══════════════════════════════════════════════════════════
   PURE HELPERS
   ══════════════════════════════════════════════════════════ */

function numO(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function clampN(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function pctP(part, whole) {
  return whole > 0 ? clampN(Math.round((part / whole) * 100), 0, 100) : 0
}

function round1(n) {
  return Math.round(n * 10) / 10
}

export function toMs(value) {
  if (value == null) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000
  const ms = Date.parse(String(value))
  return Number.isNaN(ms) ? 0 : ms
}

export function dayOf(value) {
  const ms = toMs(value)
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysAgoStr(n) {
  const d = new Date(Date.now() - n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthKeyStr(shift) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + (shift || 0))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function daysUntilDate(value) {
  const ms = toMs(value)
  if (!ms) return null
  return Math.ceil((ms - Date.now()) / 86400000)
}

export function diffDays(value) {
  const ms = toMs(value)
  if (!ms) return null
  return Math.floor((Date.now() - ms) / 86400000)
}

function isPaid(p) {
  return String(p?.status || '').toLowerCase() === 'paid'
}

function nameOf(m) {
  return m?.name || m?.memberName || m?.gymName || 'Member'
}

export function memberPk(m) {
  return m?.authUid || m?.id || ''
}

/** Records belonging to a member (authUid or doc id match). */
export function ownFilter(list, member) {
  const pk = memberPk(member)
  if (!pk) return []
  return (list || []).filter(x =>
    String(x?.authUid || x?.memberId || '') === pk || String(x?.memberId) === String(member?.id || ''))
}

export function fmtINR(n) {
  const v = numO(n)
  if (v >= 10000000) return '₹' + round1(v / 10000000) + 'Cr'
  if (v >= 100000) return '₹' + round1(v / 100000) + 'L'
  return '₹' + v.toLocaleString('en-IN')
}

function frontList(items, n) {
  return items.slice(0, n).map(nameOf).join(', ') + (items.length > n ? ' …' : '')
}

/**
 * Consecutive check-in streak ending today or yesterday.
 */
export function calcStreakCount(attendance) {
  const keys = new Set((attendance || []).map(a => dayOf(a?.date || a?.createdAt || '')).filter(Boolean))
  let streak = 0
  let i = 0
  while (i < 90) {
    const key = i === 0 ? todayStr() : daysAgoStr(i)
    if (keys.has(key)) {
      streak = i + 1
      i += 1
      continue
    }
    if (i === 0 || i === 1) {
      i += 1
      continue
    }
    break
  }
  return streak
}

function monthRevenue(payments, monthKeyName) {
  return (payments || []).reduce((s, p) => {
    if (!isPaid(p)) return s
    const d = dayOf(p?.date || p?.paidOn || p?.createdAt || '')
    return d.slice(0, 7) === monthKeyName ? s + numO(p?.paid || p?.amount) : s
  }, 0)
}

/* ══════════════════════════════════════════════════════════
   HEALTH SCORES
   ══════════════════════════════════════════════════════════ */

function healthBundle(score, dimensions, reasons, recommendations) {
  return {
    score,
    status: healthScoreStatus(score),
    reasons: reasons || [],
    recommendations: recommendations || [],
    dimensions: (dimensions || []).map(d => ({ ...d, status: healthScoreStatus(d.score) })),
  }
}

/**
 * MEMBER health (0–100): attendance vs 18 check-in days over 28,
 * workout & diet plan coverage (target 2 each), progress cadence
 * (target 4 logs per 8 weeks).
 */
export function computeMemberHealth(member, data = {}) {
  if (!member) return healthBundle(0, [], ['no member profile available'], [])
  const att = ownFilter(data.attendance, member)
  const logs = ownFilter(data.progressLogs, member)
  const pk = memberPk(member)
  const idStr = String(member.id || '')
  const matchesPlan = p => {
    const rid = String(p?.authUid || p?.memberId || p?.assignedMemberId || '')
    return rid === pk || (idStr && rid === idStr)
  }
  const wk = (data.workoutPlans || []).filter(matchesPlan)
  const dt = (data.dietPlans || []).filter(matchesPlan)

  const attDays = new Set(att.map(a => dayOf(a?.date || a?.createdAt || '')).filter(Boolean)).size
  const attScore = clampN(Math.round((attDays / 18) * 100), 0, 100)
  const wkScore = clampN(Math.round((wk.length / 2) * 100), 0, 100)
  const dtScore = clampN(Math.round((dt.length / 2) * 100), 0, 100)
  const recentLogs = logs.filter(l => {
    const d = diffDays(l?.createdAt || l?.date)
    return d !== null && d <= 56
  }).length
  const progScore = clampN(Math.round((recentLogs / 4) * 100), 0, 100)

  const score = Math.round(attScore * 0.3 + wkScore * 0.2 + dtScore * 0.2 + progScore * 0.3)
  return healthBundle(score, [
    { key: 'attendance', label: 'Attendance', score: attScore },
    { key: 'workout', label: 'Workout plans', score: wkScore },
    { key: 'diet', label: 'Diet plans', score: dtScore },
    { key: 'progress', label: 'Progress logging', score: progScore },
  ], [
    attDays === 0 ? 'no check-ins in the last 28 days' : `${attDays} check-in day(s) in the last 28 days`,
    wk.length === 0 ? 'no workout plans assigned' : `${wk.length} workout plan(s) active`,
    dt.length === 0 ? 'no diet plans assigned' : `${dt.length} diet plan(s) active`,
    recentLogs === 0 ? 'no progress logs in the last 8 weeks' : `${recentLogs} progress log(s) in the last 8 weeks`,
  ])
}

/**
 * TRAINER health: client engagement (last 14 days), plan coverage,
 * today's check-ins. `data.members` must be the trainer-scoped
 * client list (Sprint 69A AppContext scope).
 */
export function computeTrainerHealth(data = {}) {
  const members = data.members || []
  const attendance = data.attendance || []
  const workoutPlans = data.workoutPlans || []
  const dietPlans = data.dietPlans || []
  if (members.length === 0) {
    return healthBundle(0, [], ['no clients assigned yet'], ['Assign members to this trainer'])
  }
  const ids = new Set(members.map(memberPk).filter(Boolean))
  const recent14 = new Set()
  const todaySet = new Set()
  attendance.forEach(a => {
    const rid = String(a?.authUid || a?.memberId || '')
    if (!ids.has(rid)) return
    const d = dayOf(a?.date || a?.createdAt || '')
    if (!d) return
    if (d >= daysAgoStr(14)) recent14.add(rid)
    if (d === todayStr()) todaySet.add(rid)
  })
  const planOwners = new Set()
  ;[...workoutPlans, ...dietPlans].forEach(p => {
    const rid = String(p?.authUid || p?.memberId || p?.assignedMemberId || '')
    if (ids.has(rid)) planOwners.add(rid)
  })

  const engagement = pctP(recent14.size, members.length)
  const coverage = pctP(planOwners.size, members.length)
  const todayRate = pctP(todaySet.size, members.length)
  const score = Math.round(engagement * 0.5 + coverage * 0.3 + todayRate * 0.2)

  return healthBundle(score, [
    { key: 'engagement', label: 'Client engagement', score: engagement },
    { key: 'planCoverage', label: 'Plan coverage', score: coverage },
    { key: 'todayAttendance', label: 'Today check-ins', score: todayRate },
  ], [
    `${members.length} assigned client(s)`,
    `${recent14.size} client(s) active in the last 14 days`,
    `${planOwners.size} client(s) with an assigned plan`,
    `${todaySet.size} checked in today`,
  ])
}

/**
 * GYM health: revenue trend (current vs last month), retention,
 * growth, trainer workload. Uses only gym-scoped arrays.
 */
export function computeGymHealth(data = {}) {
  const payments = data.payments || []
  const members = data.members || []
  const trainers = data.trainers || []

  const cur = monthRevenue(payments, monthKeyStr(0))
  const prev = monthRevenue(payments, monthKeyStr(-1))
  let revenueScore = 30
  if (prev <= 0 && cur > 0) revenueScore = 75
  else if (prev > 0) revenueScore = clampN(Math.round(((cur - prev) / prev) * 100 + 60), 10, 100)

  const retained = members.filter(m => {
    const d = daysUntilDate(m?.expiry)
    return d === null || d > 14
  }).length
  const retentionScore = pctP(retained, members.length)

  const new30 = members.filter(m => {
    const d = diffDays(m?.createdAt || m?.joinDate || m?.join || m?.created_at)
    return d !== null && d <= 30
  }).length
  const growthScore = members.length
    ? clampN(Math.round((new30 / Math.max(3, members.length)) * 400), 5, 100)
    : 20

  const avgLoad = trainers.length ? members.length / trainers.length : 0
  const loadScore = trainers.length
    ? clampN(Math.round(100 - Math.max(0, avgLoad - 12) * 8), 20, 100)
    : 60

  const score = Math.round(revenueScore * 0.4 + retentionScore * 0.25 + growthScore * 0.2 + loadScore * 0.15)
  return healthBundle(score, [
    { key: 'revenue', label: 'Revenue trend', score: revenueScore },
    { key: 'retention', label: 'Member retention', score: retentionScore },
    { key: 'growth', label: 'Membership growth', score: growthScore },
    { key: 'workload', label: 'Trainer workload', score: loadScore },
  ], [
    `collected ${fmtINR(cur)} this month${prev > 0 ? ` vs ${fmtINR(prev)} last month` : ''}`,
    `${retained} of ${members.length} membership(s) in good standing`,
    `${new30} new member(s) in the last 30 days`,
    trainers.length ? `${trainers.length} trainer(s) on staff (avg load ${round1(avgLoad)})` : 'no trainers on staff',
  ])
}

/**
 * PLATFORM health: growth, revenue, retention, automation — from
 * the global collections only (gyms, subscriptions, campaigns).
 */
export function computePlatformHealth(data = {}) {
  const gyms = data.gyms || []
  const subscriptions = data.subscriptions || []
  const campaigns = data.whatsappCampaigns || []

  const plActive = g => String(g?.approvalStatus || g?.status) === 'approved' || String(g?.status) === 'active'
  const active = gyms.filter(plActive).length
  const new30 = gyms.filter(g => {
    const d = diffDays(g?.createdAt || g?.created)
    return d !== null && d <= 30
  }).length
  const pending = gyms.filter(g => String(g?.approvalStatus) === 'pending').length

  const activeSubs = subscriptions.filter(s => ['active', 'trial'].includes(String(s?.status || '').toLowerCase()))
  const activeAmount = activeSubs.reduce((s, sub) => s + numO(sub?.amount), 0)
  const churn30 = subscriptions.filter(s => {
    if (['active', 'trial'].includes(String(s?.status || '').toLowerCase())) return false
    const d = diffDays(s?.expiryDate || s?.endedAt || s?.createdAt || '')
    return d !== null && d <= 30
  }).length

  const sends = (campaigns || []).reduce((s, c) => s + numO(c?.stats?.sent), 0)
  const failed = (campaigns || []).reduce((s, c) => s + numO(c?.stats?.failed), 0)
  const delivered = Math.max(0, sends - failed)

  const growthScore = clampN(Math.round(new30 * 12 + active * 3), 15, 100)
  const revenueScore = clampN(Math.round((activeAmount / 250000) * 200), 10, 100)
  const retentionScore = pctP(activeSubs.length, subscriptions.length)
  const automationScore = sends > 0
    ? clampN(Math.round(pctP(delivered, sends) * 0.7 + 30), 30, 100)
    : 30

  const score = Math.round(growthScore * 0.3 + revenueScore * 0.3 + retentionScore * 0.25 + automationScore * 0.15)
  return healthBundle(score, [
    { key: 'growth', label: 'Platform growth', score: growthScore },
    { key: 'revenue', label: 'Platform revenue', score: revenueScore },
    { key: 'retention', label: 'Subscription retention', score: retentionScore },
    { key: 'automation', label: 'Automation adoption', score: automationScore },
  ], [
    `${gyms.length} gym(s), ${new30} new in the last 30 days`,
    `${activeSubs.length} active subscription(s) worth ${fmtINR(activeAmount)}/mo`,
    churn30 > 0 ? `${churn30} subscription(s) ended in the last 30 days` : 'no subscriptions ended recently',
    sends > 0 ? `${sends} automated message(s) sent, ${delivered} delivered` : 'no automation volume yet',
  ])
}

/* ══════════════════════════════════════════════════════════
   INSIGHT GENERATORS
   Each insight: { id, kind, severity, title, message,
     recommendations[], sortDate, metric? }
   ══════════════════════════════════════════════════════════ */

function insight(id, kind, severity, title, message, recommendations, sortDate, metric) {
  const item = { id, kind, severity, title, message, recommendations: recommendations || [], sortDate: sortDate ?? Date.now() }
  if (metric !== undefined) item.metric = metric
  return item
}

const tMin = () => Date.now() - 60000
const tHour = () => Date.now() - 3600000
const tDay = () => Date.now() - 86400000

export function sortInsights(list) {
  return [...(list || [])].sort((a, b) => {
    const rank = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
    if (rank !== 0) return rank
    return numO(b.sortDate) - numO(a.sortDate)
  })
}

function uniqueById(list) {
  const map = new Map()
  ;(list || []).forEach(i => { if (i && i.id && !map.has(i.id)) map.set(i.id, i) })
  return [...map.values()]
}

function planMatches(p, pk, idStr) {
  const rid = String(p?.authUid || p?.memberId || p?.assignedMemberId || '')
  return rid === pk || (idStr && rid === idStr)
}

/**
 * MEMBER insights — the member's own data slice only.
 */
export function generateMemberInsights(member, data = {}) {
  if (!member) return []
  const att = ownFilter(data.attendance, member)
  const logs = ownFilter(data.progressLogs, member)
  const payments = ownFilter(data.payments, member)
  const pk = memberPk(member)
  const idStr = String(member.id || '')
  const wk = (data.workoutPlans || []).filter(p => planMatches(p, pk, idStr))
  const dt = (data.dietPlans || []).filter(p => planMatches(p, pk, idStr))
  const out = []

  // 1 — Membership expiry
  const expD = daysUntilDate(member?.expiry)
  if (expD === null) {
    out.push(insight('mem-expiry', 'membership', SEVERITY.INFO, 'Expiry not set',
      `No expiry date is recorded for ${member.name || 'this member'}.`,
      ['Set the expiry in Members to enable retention alerts'], tDay()))
  } else if (expD < 0) {
    out.push(insight('mem-expiry', 'membership', SEVERITY.CRITICAL, `Expired ${Math.abs(expD)} day(s) ago`,
      `Membership ended on ${dayOf(member.expiry)}.`,
      ['Follow up on renewal immediately'], toMs(member.expiry)))
  } else if (expD <= 14) {
    out.push(insight('mem-expiry', 'membership', SEVERITY.WARNING, `Expiring in ${expD} day(s)`,
      `Renews on ${dayOf(member.expiry)}.`,
      ['Send the expiring-membership reminder'], toMs(member.expiry), expD))
  }

  // 2 — Payment status
  const due = payments.filter(p => !isPaid(p))
  const dueTotal = due.reduce((s, p) => s + numO(p?.amount) - numO(p?.paid), 0)
  if (due.length > 0) {
    out.push(insight('mem-payments', 'payments', SEVERITY.CRITICAL, `${due.length} unpaid item(s)`,
      `Outstanding balance of ${fmtINR(dueTotal)}.`,
      ['Follow up about the due balance'], tMin(), dueTotal))
  } else if (payments.length > 0) {
    out.push(insight('mem-payments', 'payments', SEVERITY.SUCCESS, 'Payments up to date',
      'No outstanding dues on this account.', [], tDay()))
  }

  // 3 — Attendance trend (last 5 days)
  const attDays = new Set(att.map(a => dayOf(a?.date || a?.createdAt || '')).filter(Boolean))
  const last5 = Array.from({ length: 5 }, (_, i) => daysAgoStr(i)).filter(d => attDays.has(d)).length
  out.push(insight('mem-attendance', 'attendance', last5 >= 3 ? SEVERITY.SUCCESS : last5 === 0 ? SEVERITY.WARNING : SEVERITY.INFO,
    `${last5} check-in(s) in 5 days`,
    last5 === 0 ? 'No check-ins during the last 5 days.' : `Checked in ${last5} of the last 5 days.`,
    last5 === 0 ? ['Offer a catch-up session or a fresh routine'] : [], tHour(), last5))

  // 4 — Streak
  const streak = calcStreakCount(att)
  if (streak >= 2) {
    out.push(insight('mem-streak', 'streak', streak >= 5 ? SEVERITY.SUCCESS : SEVERITY.INFO,
      `${streak}-day streak`,
      `Currently on a ${streak}-day check-in streak.`,
      ['Celebrate the milestone with a nudge'], tHour(), streak))
  }

  // 5/6 — Plan coverage
  out.push(insight('mem-workout', 'workout', wk.length === 0 ? SEVERITY.WARNING : SEVERITY.SUCCESS, 'Workout plan coverage',
    wk.length === 0 ? 'No workout plan assigned yet.' : `${wk.length} workout plan(s) active.`,
    wk.length === 0 ? ['Assign a workout plan in Workouts'] : [], tHour(), wk.length))
  out.push(insight('mem-diet', 'diet', dt.length === 0 ? SEVERITY.WARNING : SEVERITY.SUCCESS, 'Diet plan coverage',
    dt.length === 0 ? 'No diet plan assigned yet.' : `${dt.length} diet plan(s) active.`,
    dt.length === 0 ? ['Assign a diet plan in Diet'] : [], tDay(), dt.length))

  // 7 — Progress / weight change
  const sorted = [...logs].sort((a, b) => toMs(a?.createdAt || a?.date || '') - toMs(b?.createdAt || b?.date || ''))
  if (sorted.length >= 2) {
    const latest = sorted[sorted.length - 1]
    const prior = sorted[sorted.length - 2]
    const wLast = numO(latest?.weight)
    const wPrior = numO(prior?.weight)
    if (wLast > 0 && wPrior > 0) {
      const delta = round1(wLast - wPrior)
      const goal = String(member?.goal || '').toLowerCase()
      const lossGoal = goal.includes('loss') || goal.includes('lose')
      const improving = (lossGoal && delta < 0) || (!lossGoal && delta > 0)
      out.push(insight('mem-weight', 'progress', Math.abs(delta) <= 0.5 ? SEVERITY.INFO : improving ? SEVERITY.SUCCESS : SEVERITY.WARNING,
        `Weight ${delta > 0 ? '+' : ''}${delta} kg`,
        `Weight moved from ${wPrior} kg to ${wLast} kg in recent logs.`,
        Math.abs(delta) <= 0.5 ? ['Keep logging — trends need 4+ weeks'] : improving ? ['Direction matches the goal'] : ['Adjust the plan — direction is off the goal'],
        toMs(latest?.createdAt || latest?.date || ''), delta))
    }
  }

  // 8 — BMI (only when actually logged)
  const latestLog = sorted[sorted.length - 1]
  const bmi = latestLog ? numO(latestLog?.bmi) : 0
  if (bmi > 0) {
    out.push(insight('mem-bmi', 'progress', bmi >= 30 ? SEVERITY.WARNING : SEVERITY.INFO, `BMI ${bmi}`,
      `Latest logged BMI is ${bmi}.`,
      bmi >= 30 ? ['Suggest a body-composition consult'] : [], toMs(latestLog?.createdAt || latestLog?.date || '')))
  }

  // 9 — Plateau
  if (sorted.length >= 3) {
    const three = sorted.slice(-3)
    const weights = three.map(l => numO(l?.weight)).filter(w => w > 0)
    if (weights.length === 3) {
      const spread = Math.max(...weights) - Math.min(...weights)
      const first = Math.min(...three.map(l => toMs(l?.createdAt || l?.date || '')).filter(Boolean))
      const last = Math.max(...three.map(l => toMs(l?.createdAt || l?.date || '')).filter(Boolean))
      const span = (last && first) ? Math.floor((last - first) / 86400000) : 0
      if (spread < 0.6 && span >= 10) {
        out.push(insight('mem-plateau', 'plateau', SEVERITY.WARNING, 'Possible plateau',
          `Weight varied under ${round1(spread)} kg across ${span} days.`,
          ['Try a deload week or a plan change'], tHour()))
      }
    }
  }

  // 10 — Personal best
  const best = bestLiftMsg(logs)
  if (best) out.push(insight('mem-best', 'strength', SEVERITY.SUCCESS, 'New personal best', best, ['Keep logging lifts'], tHour()))

  // 11 — Missed workouts
  const lastMs = att.map(a => toMs(a?.date || a?.createdAt || '')).filter(Boolean).sort((a, b) => b - a)[0]
  if (lastMs) {
    const gap = Math.floor((Date.now() - lastMs) / 86400000)
    if (gap >= 4) {
      out.push(insight('mem-gap', 'attendance', gap >= 14 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        `No check-in for ${gap} day(s)`,
        `Last check-in was ${gap} day(s) ago.`,
        ['Send a nudge message or schedule a comeback session'], lastMs, gap))
    }
  } else {
    out.push(insight('mem-gap', 'attendance', SEVERITY.INFO, 'Never checked in',
      'No attendance records exist yet.', ['Book the first session today'], tDay()))
  }

  return sortInsights(uniqueById(out))
}

function memberOf(m) {
  return m?.name || m?.memberName || 'This member'
}

function bestLiftMsg(logs) {
  const lifts = ['bench', 'squat', 'deadlift']
  let msg = null
  for (const lift of lifts) {
    const withVal = logs.filter(l => numO(l?.[lift]) > 0)
    if (withVal.length < 2) continue
    const latest = numO(withVal[withVal.length - 1]?.[lift])
    const prevMax = Math.max(...withVal.slice(0, -1).map(l => numO(l?.[lift])))
    if (latest > prevMax) msg = `${lift} PR: ${latest} kg (up from ${prevMax} kg)`
  }
  return msg
}

/** TRAINER insights — across the trainer's assigned clients. */
export function generateTrainerInsights(data = {}) {
  const members = data.members || []
  const attendance = data.attendance || []
  const workoutPlans = data.workoutPlans || []
  const dietPlans = data.dietPlans || []
  const out = []
  if (members.length === 0) {
    out.push(insight('trn-empty', 'caseload', SEVERITY.INFO, 'No assigned clients',
      'No clients are assigned to you yet.', ['Ask the gym admin to assign members'], tDay()))
    return out
  }
  const ids = new Set(members.map(memberPk))
  const lastActive = new Map()
  const todaySet = new Set()
  attendance.forEach(a => {
    const rid = String(a?.authUid || a?.memberId || '')
    if (!ids.has(rid)) return
    const ms = toMs(a?.date || a?.createdAt || '')
    if (ms) {
      const prev = lastActive.get(rid)
      if (!prev || ms > prev) lastActive.set(rid, ms)
    }
    if (dayOf(a?.date || a?.createdAt || '') === todayStr()) todaySet.add(rid)
  })

  // 1 — Inactive > 7 days
  const inactive = members.filter(m => {
    const ms = lastActive.get(memberPk(m))
    return !ms || Date.now() - ms > 7 * 86400000
  })
  if (inactive.length > 0) {
    out.push(insight('trn-inactive', 'engagement', inactive.length > 5 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      `${inactive.length} inactive client(s)`,
      `${frontList(inactive, 4)} haven't checked in for over a week.`,
      ['Reach out and schedule a comeback session'], tMin(), inactive.length))
  }

  // 2 — Missing check-ins today
  const pendingToday = members.filter(m => !todaySet.has(memberPk(m)))
  out.push(insight('trn-today', 'attendance', pendingToday.length === 0 ? SEVERITY.SUCCESS : SEVERITY.WARNING,
    pendingToday.length === 0 ? 'Everyone checked in today' : `${pendingToday.length} not checked in today`,
    pendingToday.length === 0 ? 'All assigned clients have checked in today.' : `Not yet checked in: ${frontList(pendingToday, 5)}.`,
    pendingToday.length > 0 ? ['Send a reminder before closing hours'] : [], tHour(), pendingToday.length))

  // 3 — Expiring memberships
  const expiring = members.filter(m => {
    const d = daysUntilDate(m?.expiry)
    return d !== null && d >= 0 && d <= 14
  })
  if (expiring.length > 0) {
    out.push(insight('trn-expiring', 'retention', SEVERITY.WARNING, `${expiring.length} client(s) expiring in 14 days`,
      `${frontList(expiring, 4)} membership(s) end soon.`,
      ['Offer renewed plans and incentives'], tDay(), expiring.length))
  }

  // 4 — Highest improving (progress logging cadence)
  const logCount = new Map()
  ;(data.progressLogs || []).forEach(l => {
    const rid = String(l?.authUid || l?.memberId || '')
    if (ids.has(rid)) logCount.set(rid, (logCount.get(rid) || 0) + 1)
  })
  const improvers = [...logCount.entries()].filter(([, n]) => n >= 3)
  if (improvers.length > 0) {
    out.push(insight('trn-improving', 'progress', SEVERITY.SUCCESS, `${improvers.length} improving client(s)`,
      `Clients logging 3+ progress entries: ${improvers.slice(0, 3).map(([rid]) => memberOf(members.find(m => memberPk(m) === rid))).join(', ')}.`,
      ['Use the trends to set the next milestone'], tDay(), improvers.length))
  }

  // 5 — Needs attention (expired / dues)
  const attn = members.filter(m => {
    const d = daysUntilDate(m?.expiry)
    return (d !== null && d < 0) || numO(m?.balanceDue) > 0
  })
  if (attn.length > 0) {
    out.push(insight('trn-attention', 'attention', SEVERITY.CRITICAL,
      `${attn.length} client(s) needing attention`,
      `Expired or with dues: ${frontList(attn, 4)}.`,
      ['Flag to front desk and chase renewals'], tHour(), attn.length))
  }

  // 6/7 — Plan coverage
  const planRid = new Set()
  ;[...workoutPlans, ...dietPlans].forEach(p => {
    const rid = String(p?.authUid || p?.memberId || p?.assignedMemberId || '')
    if (ids.has(rid)) planRid.add(rid)
  })
  const coverage = pctP(planRid.size, members.length)
  out.push(insight('trn-coverage', 'plans', coverage >= 50 ? SEVERITY.SUCCESS : SEVERITY.WARNING,
    `${coverage}% plan coverage`,
    `${planRid.size} of ${members.length} client(s) have an assigned workout or diet plan.`,
    coverage < 50 ? ['Assign plans to uncovered clients'] : [], tDay(), coverage))

  return sortInsights(uniqueById(out))
}

/** GYM insights — gym_admin scope. */
export function generateGymInsights(data = {}) {
  const members = data.members || []
  const payments = data.payments || []
  const attendance = data.attendance || []
  const trainers = data.trainers || []
  const referrals = data.referrals || []
  const whatsappLogs = data.whatsappLogs || []
  const whatsappCampaigns = data.whatsappCampaigns || []
  const out = []

  // 1 — Revenue today
  const tKey = todayStr()
  const todayPaid = payments.filter(p => isPaid(p) && dayOf(p?.date || p?.paidOn || p?.createdAt || '') === tKey)
  const todayTotal = todayPaid.reduce((s, p) => s + numO(p?.paid || p?.amount), 0)
  out.push(insight('gym-rev-today', 'revenue', todayTotal >= 5000 ? SEVERITY.SUCCESS : SEVERITY.INFO,
    `${fmtINR(todayTotal)} collected today`,
    todayPaid.length === 0 ? 'No collections recorded today yet.' : `Collected from ${todayPaid.length} transaction(s).`,
    todayPaid.length === 0 ? ['Run a quick-collect round for pending dues'] : [], tMin(), todayTotal))

  // 2 — Monthly revenue trend
  const curM = monthRevenue(payments, monthKeyStr(0))
  const prevM = monthRevenue(payments, monthKeyStr(-1))
  const deltaM = prevM > 0 ? Math.round(((curM - prevM) / prevM) * 100) : (curM > 0 ? 100 : 0)
  out.push(insight('gym-rev-month', 'revenue', deltaM < -20 ? SEVERITY.WARNING : deltaM >= 0 ? SEVERITY.SUCCESS : SEVERITY.INFO,
    `Month revenue ${deltaM >= 0 ? '+' : ''}${deltaM}%`,
    `Collected ${fmtINR(curM)} this month${prevM > 0 ? ` vs ${fmtINR(prevM)} last month` : ' (no last-month baseline)'}.`,
    deltaM < -20 ? ['Launch a collections or re-activation campaign'] : [], tDay(), curM))

  // 3 — Pending payments
  const pending = payments.filter(p => !isPaid(p))
  const pendingTotal = pending.reduce((s, p) => s + numO(p?.amount) - numO(p?.paid), 0)
  out.push(insight('gym-pending', 'payments', pending.length === 0 ? SEVERITY.SUCCESS : pendingTotal > 50000 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
    `${pending.length} pending payment(s)`,
    pendingTotal > 0 ? `Outstanding balance of ${fmtINR(pendingTotal)}.` : 'Invoices present, nothing due yet.',
    pending.length > 0 ? ['Send payment reminders', 'Call the top defaulters'] : [], tMin(), pendingTotal))

  // 4 — Expiring memberships
  const expiring = members.filter(m => {
    const d = daysUntilDate(m?.expiry)
    return d !== null && d >= 0 && d <= 14
  })
  out.push(insight('gym-expiring', 'retention', expiring.length === 0 ? SEVERITY.SUCCESS : expiring.length > 5 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
    `${expiring.length} membership(s) expiring in 14 days`,
    expiring.length === 0 ? 'No memberships expiring within two weeks.' : frontList(expiring, 5),
    expiring.length > 0 ? ['Prepare a renewal outreach list'] : [], tHour(), expiring.length))

  // 5 — Attendance trend (last 7 vs previous 7)
  const count7 = (from, to) => attendance.filter(a => {
    const d = dayOf(a?.date || a?.createdAt || '')
    return d >= from && d <= to
  }).length
  const cur7 = count7(daysAgoStr(7), todayStr())
  const prev7 = count7(daysAgoStr(14), daysAgoStr(8))
  const deltaA = prev7 > 0 ? Math.round(((cur7 - prev7) / prev7) * 100) : (cur7 > 0 ? 100 : 0)
  out.push(insight('gym-attendance', 'attendance', deltaA < -20 ? SEVERITY.WARNING : deltaA >= 0 ? SEVERITY.SUCCESS : SEVERITY.INFO,
    `7-day attendance ${deltaA >= 0 ? '+' : ''}${deltaA}%`,
    `${cur7} check-in(s) this week${prev7 > 0 ? ` vs ${prev7} last week` : ''}.`,
    deltaA < -20 ? ['Consider a weekend class or membership push'] : [], tDay()))

  // 6 — Peak hours
  const hourCounts = {}
  attendance.forEach(a => {
    const h = String(a?.time || '').slice(0, 2)
    if (h && h !== '00') hourCounts[h + ':00'] = (hourCounts[h + ':00'] || 0) + 1
  })
  const peak = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
  if (peak) {
    out.push(insight('gym-peak', 'attendance', SEVERITY.INFO, `Peak hour ${peak[0]}`,
      `${peak[1]} check-in(s) recorded at ${peak[0]}.`,
      ['Schedule staffing around the peak slot'], tDay()))
  }

  // 7 — Referrals (30 days)
  const ref30 = (referrals || []).filter(r => {
    const d = diffDays(r?.createdAt || r?.created)
    return d !== null && d <= 30
  }).length
  out.push(insight('gym-referrals', 'growth', ref30 === 0 ? SEVERITY.WARNING : SEVERITY.SUCCESS,
    `${ref30} referral(s) in 30 days`,
    ref30 === 0 ? 'No referral activity recorded in the last month.' : `Referral influx of ${ref30} in the last month.`,
    ref30 === 0 ? ['Run a referral incentive round'] : [], tHour(), ref30))

  // 8 — WhatsApp delivery (24h)
  const logs24 = whatsappLogs.filter(l => {
    const ms = toMs(l?.createdAt || l?.attemptedAt || '')
    return ms && Date.now() - ms <= 86400000
  })
  const sentW = logs24.filter(l => ['sent', 'delivered'].includes(String(l?.status || '').toLowerCase())).length
  const failedW = logs24.filter(l => String(l?.status || '').toLowerCase() === 'failed').length
  const delR = sentW + failedW > 0 ? pctP(sentW, sentW + failedW) : null
  out.push(insight('gym-whatsapp', 'automation', delR === null ? SEVERITY.INFO : delR >= 70 ? SEVERITY.SUCCESS : SEVERITY.WARNING,
    delR === null ? 'No WhatsApp sends yet' : `${delR}% WhatsApp delivery (24h)`,
    `${sentW} delivered${failedW ? `, ${failedW} failed` : ''} in the last 24h${delR === null ? ' — configure automation to start sending' : ''}.`,
    failedW > 0 ? ['Review failed sends and retry'] : [], tHour(), sentW))

  // 9 — Campaign performance
  const campSends = whatsappCampaigns.reduce((s, c) => s + numO(c?.stats?.sent), 0)
  const campFailed = whatsappCampaigns.reduce((s, c) => s + numO(c?.stats?.failed), 0)
  const campRate = campSends + campFailed > 0 ? pctP(campSends, campSends + campFailed) : null
  if (campRate !== null) {
    out.push(insight('gym-campaigns', 'automation', campRate >= 70 ? SEVERITY.SUCCESS : SEVERITY.WARNING,
      `Campaign delivery ${campRate}%`,
      `${campSends} sent, ${campFailed} failed across campaigns.`,
      campRate < 70 ? ['Improve campaign quality and retry'] : [], tHour(), campRate))
  }

  // 10 — Trainer workload
  const avgLoad = trainers.length ? members.length / trainers.length : 0
  out.push(insight('gym-load', 'team', avgLoad > 20 ? SEVERITY.WARNING : SEVERITY.INFO,
    'Trainer workload',
    `${members.length} member(s) across ${trainers.length || 0} trainer(s) (${Math.round(avgLoad)} per trainer).`,
    avgLoad > 20 ? ['Hire or redistribute assigned clients'] : [], tDay(), Math.round(avgLoad)))

  // 11 — Membership growth
  const new30 = members.filter(m => {
    const d = diffDays(m?.createdAt || m?.joinDate || m?.join || m?.created_at)
    return d !== null && d <= 30
  }).length
  out.push(insight('gym-growth', 'growth', new30 > 3 ? SEVERITY.SUCCESS : new30 === 0 ? SEVERITY.WARNING : SEVERITY.INFO,
    `${new30} new member(s) / 30 days`,
    new30 === 0 ? 'No new members joined in the last month.' : `${new30} new members in the last 30 days.`,
    new30 === 0 ? ['Start a joint promotion'] : [], tHour(), new30))

  return sortInsights(uniqueById(out))
}

/** PLATFORM insights — super_admin scope. */
export function generatePlatformInsights(data = {}) {
  const gyms = data.gyms || []
  const subscriptions = data.subscriptions || []
  const campaigns = data.whatsappCampaigns || []
  const out = []

  const plActive = g => String(g?.approvalStatus || g?.status) === 'approved' || String(g?.status) === 'active'
  const isPendingGym = g => String(g?.approvalStatus) === 'pending'
  const isLiveSub = s => ['active', 'trial'].includes(String(s?.status || '').toLowerCase())
  const createdDays = g => diffDays(g?.createdAt || g?.created)

  const active = gyms.filter(plActive).length
  const new30 = gyms.filter(g => {
    const d = createdDays(g)
    return d !== null && d <= 30
  }).length
  const pending = gyms.filter(isPendingGym).length
  const activeSubs = subscriptions.filter(isLiveSub)
  const activeAmount = activeSubs.reduce((s, sub) => s + numO(sub?.amount), 0)
  const churn30 = subscriptions.filter(s => {
    if (isLiveSub(s)) return false
    const d = diffDays(s?.expiryDate || s?.endedAt || s?.createdAt || '')
    return d !== null && d <= 30
  }).length
  const sends = campaigns.reduce((s, c) => s + numO(c?.stats?.sent), 0)

  out.push(insight('pl-active', 'growth', active === 0 ? SEVERITY.WARNING : SEVERITY.SUCCESS,
    `${active} active gym(s)`, `${active} of ${gyms.length} gym(s) are active.`, [], tDay(), active))
  out.push(insight('pl-new', 'growth', new30 === 0 ? SEVERITY.INFO : SEVERITY.SUCCESS,
    `${new30} new gym(s) / 30 days`, 'Fresh onboarding on the platform.', [], tDay(), new30))
  out.push(insight('pl-approvals', 'platform', pending === 0 ? SEVERITY.SUCCESS : SEVERITY.WARNING,
    `${pending} pending approval(s)`, pending === 0 ? 'No gym applications waiting.' : 'Gym owners awaiting approval.',
    pending > 0 ? ['Review the waiting applications'] : [], tMin(), pending))
  if (activeSubs.length > 0) {
    out.push(insight('pl-revenue', 'revenue', SEVERITY.SUCCESS,
      `${fmtINR(activeAmount)} monthly subscription value`,
      `${activeSubs.length} active/trial subscription(s).`, [], tHour(), activeAmount))
  }
  const sub90 = subscriptions.filter(s => {
    const d = diffDays(s?.createdAt || s?.created)
    return d !== null && d <= 90
  }).length
  out.push(insight('pl-sub-growth', 'growth', sub90 >= 2 ? SEVERITY.SUCCESS : SEVERITY.INFO,
    `${sub90} subscription(s) last 90 days`, 'Quarterly platform subscription flow.', [], tDay(), sub90))
  if (churn30 > 0) {
    out.push(insight('pl-churn', 'retention', churn30 > 2 ? SEVERITY.WARNING : SEVERITY.INFO,
      `${churn30} subscription(s) ended / 30 days`, `${churn30} gym subscription(s) ended in the last month.`,
      ['Follow up with the most recent churners'], tDay(), churn30))
  }
  out.push(insight('pl-automation', 'automation', sends >= 10 ? SEVERITY.SUCCESS : SEVERITY.INFO,
    sends >= 10 ? `${sends} automation messages sent` : 'Automation ramping up',
    sends >= 10 ? `${sends} campaign messages sent across the platform.` : 'Fewer than 10 campaign sends so far.',
    sends < 10 ? ['Spotlight the Automation Center during onboarding'] : [], tDay(), sends))

  const health = computePlatformHealth(data)
  out.push(insight('pl-health', 'platform',
    health.score >= 60 ? SEVERITY.SUCCESS : health.score >= 40 ? SEVERITY.WARNING : SEVERITY.CRITICAL,
    `Platform health ${health.score}/100`,
    health.status,
    health.recommendations || [], tHour(), health.score))

  return sortInsights(uniqueById(out))
}

/* ══════════════════════════════════════════════════════════
   ROLE ROUTING
   ══════════════════════════════════════════════════════════ */

const SCOPE_GENERATORS = {
  member: (me, data) => generateMemberInsights(me, data),
  trainer: (me, data) => generateTrainerInsights(data),
  gym_admin: (me, data) => [...generateGymInsights(data), ...generateTrainerInsights(data)],
}

export function buildRoleInsights(role, data = {}) {
  const me = (data.members || [])[0]
  if (role === 'member') {
    const list = generateMemberInsights(me, data)
    return { scope: 'member', insights: list }
  }
  if (role === 'super_admin') {
    return { scope: 'platform', insights: generatePlatformInsights(data) }
  }
  const gen = SCOPE_GENERATORS[role]
  return { scope: role, insights: gen ? gen(me, data) : [] }
}

export function buildRoleHealth(role, data = {}) {
  if (role === 'member') {
    const me = (data.members || [])[0]
    return me ? computeMemberHealth(me, data) : null
  }
  if (role === 'super_admin') return computePlatformHealth(data)
  if (role === 'trainer') return computeTrainerHealth(data)
  if (role === 'gym_admin') return computeGymHealth(data)
  return null
}

/* ══════════════════════════════════════════════════════════
   NATURAL LANGUAGE REQUESTS
   ══════════════════════════════════════════════════════════ */

export function normalizePlain(raw) {
  if (typeof raw !== 'string') return ''
  return raw.toLowerCase().replace(/[.,!?;:()]/g, '').replace(/\s+/g, ' ').trim()
}

const REQUEST_MAP = [
  { key: 'status', scope: 'member', roles: ['member'], patterns: ['how am i doing', 'am i doing well'] },
  { key: 'progress', scope: 'member', roles: ['member'], patterns: ['show my progress', 'my progress', 'progress trend'] },
  { key: 'attention', scope: 'trainer', roles: ['trainer', 'gym_admin'], patterns: ['who needs attention', 'needs attention', 'who should i focus'] },
  { key: 'revenue', scope: 'gym', roles: ['gym_admin', 'super_admin'], patterns: ['revenue this month', 'income this month', 'earnings this month'] },
  { key: 'pending', scope: 'gym', roles: ['gym_admin'], patterns: ['show pending payments', 'pending payments', 'outstanding'] },
  { key: 'attendance', scope: 'gym', roles: ['gym_admin', 'trainer'], patterns: ["who hasn't checked in", 'has not checked in', 'not checked in', 'missing check ins'] },
  { key: 'renewal', scope: 'gym', roles: ['gym_admin'], patterns: ['who is likely to renew', 'likely to renew', 'renewal risk'] },
  { key: 'expiring', scope: 'gym', roles: ['gym_admin', 'trainer'], patterns: ['show expiring memberships', 'expiring memberships', 'memberships expiring'] },
  { key: 'health', scope: 'gym', roles: ['gym_admin'], patterns: ['how healthy is my gym', 'gym health', 'health of my gym'] },
  { key: 'platform', scope: 'platform', roles: ['super_admin'], patterns: ['show platform health', 'platform health', 'health of the platform'] },
]

export function matchInsightRequest(raw, role) {
  const n = normalizePlain(raw)
  if (!n) return null
  for (const req of REQUEST_MAP) {
    if (!req.roles.includes(role)) continue
    const hit = req.patterns.some(p => n.includes(p))
    if (hit) return { key: req.key, scope: req.scope }
  }
  return null
}

/* ══════════════════════════════════════════════════════════
   AGGREGATED METRICS (Gemini-safe: numbers + labels only)
   ══════════════════════════════════════════════════════════ */

export function buildAggregateMetrics(request, data = {}) {
  const scope = request?.scope || 'gym'
  const m = { scope, asOf: todayStr() }
  if (scope === 'member') {
    const me = (data.members || [])[0]
    if (me) {
      m.member = String(me.name || me.memberName || '').slice(0, 40)
      m.expiryDays = daysUntilDate(me?.expiry)
      m.pendingBalance = round1(numO(me?.balanceDue))
      const att = ownFilter(data.attendance, me)
      m.streak = calcStreakCount(att)
      const attDays5 = new Set(att.map(a => dayOf(a?.date || a?.createdAt || '')).filter(Boolean))
      m.checkInsLast5d = Array.from({ length: 5 }, (_, i) => daysAgoStr(i)).filter(d => attDays5.has(d)).length
      const pk = memberPk(me)
      m.workoutPlans = (data.workoutPlans || []).filter(p => planMatches(p, pk, String(me.id || ''))).length
      m.dietPlans = (data.dietPlans || []).filter(p => planMatches(p, pk, String(me.id || ''))).length
      m.progressLogs90 = ownFilter(data.progressLogs, me).filter(l => {
        const d = diffDays(l?.createdAt || l?.date)
        return d !== null && d <= 90
      }).length
    }
  } else if (scope === 'trainer') {
    const members = data.members || []
    const att = data.attendance || []
    const ids = new Set(members.map(memberPk))
    m.clients = members.length
    m.admitted = members.length
    m.active14 = new Set(att.filter(a => ids.has(String(a?.authUid || a?.memberId || '')) && dayOf(a?.date || a?.createdAt || '') >= daysAgoStr(14)).map(a => a?.authUid || a?.memberId)).size
    m.todayCheckins = new Set(att.filter(a => ids.has(String(a?.authUid || a?.memberId || '')) && dayOf(a?.date || a?.createdAt || '') === todayStr()).map(a => a?.authUid || a?.memberId)).size
  } else if (scope === 'gym') {
    const payments = data.payments || []
    const members = data.members || []
    const attendance = data.attendance || []
    m.collectedThisMonth = round1(monthRevenue(payments, monthKeyStr(0)))
    m.collectedLastMonth = round1(monthRevenue(payments, monthKeyStr(-1)))
    const pending = payments.filter(p => !isPaid(p))
    m.pendingCount = pending.length
    m.pendingTotal = round1(pending.reduce((s, p) => s + numO(p?.amount) - numO(p?.paid), 0))
    m.membershipTotal = members.length
    m.expiring14 = members.filter(x => {
      const d = daysUntilDate(x?.expiry)
      return d !== null && d >= 0 && d <= 14
    }).length
    const todayKeyName = todayStr()
    m.todayCheckins = attendance.filter(a => dayOf(a?.date || a?.createdAt || '') === todayKeyName).length
    m.attendance7 = attendance.filter(a => {
      const d = dayOf(a?.date || a?.createdAt || '')
      return d >= daysAgoStr(7) && d <= todayKeyName
    }).length
  } else if (scope === 'platform') {
    const gyms = data.gyms || []
    const subscriptions = data.subscriptions || []
    m.gymCount = gyms.length
    m.newGyms30 = gyms.filter(g => {
      const d = diffDays(g?.createdAt || g?.created)
      return d !== null && d <= 30
    }).length
    m.pendingApprovals = gyms.filter(g => String(g?.approvalStatus) === 'pending').length
    m.activeSubscriptions = subscriptions.filter(s => ['active', 'trial'].includes(String(s?.status || '').toLowerCase())).length
    m.subscriptionRevenue = round1(subscriptions.filter(s => ['active', 'trial'].includes(String(s?.status || '').toLowerCase())).reduce((s, sub) => s + numO(sub?.amount), 0))
  }
  return m
}

/* ══════════════════════════════════════════════════════════
   DETERMINISTIC ANSWERS (plain text, no LLM needed)
   ══════════════════════════════════════════════════════════ */

function buildMemberAnswer(m, request) {
  if (!m) return "I couldn't find your member profile yet."
  const lines = [`Here's where you stand, ${String(m.name || m.memberName || 'there').split(' ')[0]} —`, '']
  if (Object.prototype.hasOwnProperty.call(m, 'expiryDays')) {
    if (m.expiryDays === null) lines.push('• Membership end date is not set up yet.')
    else if (m.expiryDays < 0) lines.push(`• Membership expired ${Math.abs(m.expiryDays)} day(s) ago — renew soon.`)
    else if (m.expiryDays <= 14) lines.push(`• Membership expires in ${m.expiryDays} day(s) — renew to keep training.`)
    else lines.push(`• Membership runs for another ${m.expiryDays} day(s).`)
  }
  if (m.checkInsLast5d !== undefined) {
    lines.push(`• You came ${m.checkInsLast5d} of the last 7 days (${m.streak ?? 0}-day streak).`)
  }
  if (m.pendingBalance > 0) lines.push(`• Balance due: ${fmtINR(m.pendingBalance)}.`)
  if (m.workoutPlans !== undefined) {
    lines.push(`• ${m.workoutPlans} workout plan(s), ${m.dietPlans} diet plan(s) assigned.`)
    lines.push(`• ${m.progressLogs90} progress log(s) in the last 90 days.`)
  }
  lines.push('', 'Keep the streak going — consistency beats intensity.')
  return lines.join('\n')
}

function buildTrainerAnswer(m, request) {
  if (m === undefined || m === null) return "I couldn't find your client list yet."
  const lines = [
    `Your caseload: ${m.clients} client(s).`,
    `${m.active14} were active in the past 14 days (${m.admitted ? `${m.admitted} handled` : 'in the roster'}).`,
    `${m.todayCheckins} checked in today.`,
    '',
    'Tip: follow up on the clients who haven\'t checked in this week — they are the ones most at risk of churning.',
    '',
    'For a fresh client list, say "who needs attention".',
  ]
  return lines.join('\n')
}

function buildGymAnswer(m, request) {
  if (!m) return "I couldn't find gym data yet."
  const lines = [
    'Here is the gym picture —',
    '',
    `• Revenue this month: ${fmtINR(m.collectedThisMonth)}${m.collectedLastMonth ? ` (vs ${fmtINR(m.collectedLastMonth)} last month)` : ''}`,
    `• ${m.pendingCount} pending invoice(s), ${fmtINR(m.pendingTotal)} outstanding`,
    `• ${m.membershipTotal} members, ${m.expiring14} memberships expiring in 14 days`,
    `• Today: ${m.todayCheckins} check-in(s) | last 7 days: ${m.attendance7} check-in(s)`,
    '',
    buildGymRecommendation(m),
  ]
  return lines.join('\n')
}

function buildGymRecommendation(m) {
  const tips = []
  if (m.expiring14 > 0) tips.push(`start renewal outreach for the ${m.expiring14} expiring memberships`)
  if (m.pendingCount > 0) tips.push(`collect the ${fmtINR(m.pendingTotal)} outstanding balance`)
  if (m.pendingCount === 0 && m.expiring14 === 0) tips.push('revenue and retention look healthy — keep it consistent')
  return `Suggested focus: ${tips.join(' and ')}.`
}

function buildPlatformAnswer(m, request) {
  if (!m) return 'No platform data yet.'
  return [
    `Platform overview —`,
    `• ${m.gymCount} gym(s) onboarded, ${m.newGyms30} new in 30 days`,
    `• ${m.pendingApprovals} pending gym approval(s)`,
    `• ${m.activeSubscriptions} active/trial subscription(s), ${fmtINR(m.subscriptionRevenue)} monthly value`,
    '',
    m.pendingApprovals > 0 ? `Action: review the ${m.pendingApprovals} waiting application(s).` : 'Action: everything is balanced.',
  ].join('\n')
}

export function buildDeterministicAnswer(request, role, data = {}) {
  const metrics = buildAggregateMetrics(request, data)
  if (metrics.scope === 'member') return buildMemberAnswer(metrics, request)
  if (metrics.scope === 'trainer') return buildTrainerAnswer(metrics, request)
  if (metrics.scope === 'gym') return buildGymAnswer(metrics, request)
  if (metrics.scope === 'platform') return buildPlatformAnswer(metrics, request)
  return "I couldn't scope that request to your role."
}

export function printInsightResponse(text) {
  return [
    '╔══════════════════════════════════════════╗',
    ...String(text || '').split('\n').map(l => `║ ${l}`.padEnd(43)),
    '╚══════════════════════════════════════════╝',
  ].join('\n')
}

export function getInsightsForScope(scope, data = {}) {
  if (scope === 'member') {
    const me = (data.members || [])[0]
    return me ? generateMemberInsights(me, data) : []
  }
  if (scope === 'trainer') return generateTrainerInsights(data)
  if (scope === 'gym') return generateGymInsights(data)
  if (scope === 'platform') return generatePlatformInsights(data)
  return []
}

export function getHealthForRole(role, data = {}) {
  return buildRoleHealth(role, data)
}