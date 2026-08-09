// src/services/ai/commandParser.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI command layer — input → intent pipeline.
//
// Fully functional, rule-based (no AI provider connected yet).
// Sprint 77B adds data-aware intents (member/trainer/gym_admin/
// super_admin) plus navigation commands resolved to React Router
// paths via NAV_TARGETS.
//
// Future provider integration plugs in behind aiService — this
// parser stays as the fast-path intent layer.
// ─────────────────────────────────────────────────────────────

export const INTENTS = {
  // General
  GREETING:     'greeting',
  HELP:         'help',
  FALLBACK:     'fallback',
  NAVIGATE:     'navigate',

  // Member
  MEMBERSHIP_EXPIRY:  'membership_expiry',
  MEMBERSHIP_PLAN:    'membership_plan',
  MY_TRAINER:         'my_trainer',
  ATTENDANCE_TODAY:   'attendance_today',
  ATTENDANCE_TOTAL:   'attendance_total',
  PAYMENT_STATUS:     'payment_status',
  NEXT_DUE:           'next_due',
  MY_WORKOUTS:        'my_workouts',
  MY_DIET:            'my_diet',
  MY_PROGRESS:        'my_progress',
  ANALYZE_PROGRESS:   'analyze_progress',

  // Trainer
  ASSIGNED_MEMBERS:   'assigned_members',
  PENDING_CHECKINS:   'pending_checkins',
  EXPIRING_MEMBERS:   'expiring_members',
  TRAINER_WORKOUTS:   'trainer_workouts',
  TRAINER_DIET:       'trainer_diet',

  // Gym admin
  MEMBERS_COUNT:      'members_count',
  TRAINERS_COUNT:     'trainers_count',
  REVENUE_TODAY:      'revenue_today',
  PENDING_PAYMENTS:   'pending_payments',
  RECENT_NOTIFICATIONS: 'recent_notifications',
  MONTHLY_REVENUE:    'monthly_revenue',

  // Super admin
  TOTAL_GYMS:         'total_gyms',
  ACTIVE_GYMS:        'active_gyms',
  PENDING_APPROVALS:  'pending_approvals',
  PLATFORM_REVENUE:   'platform_revenue',
  ACTIVE_SUBSCRIPTIONS: 'active_subscriptions',
  TOTAL_USERS:        'total_users',
  MRR:                'mrr',
  ARR:                'arr',
  CAMPAIGNS:          'campaigns',

  // Legacy moods kept for graceful answers
  MEMBERS:      'members',
  ATTENDANCE:   'attendance',
  PAYMENTS:     'payments',
  REVENUE:      'revenue',
  REPORTS:      'reports',
  WORKOUTS:     'workouts',
  DIET:         'diet',
  PROGRESS:     'progress',
  TRAINERS:     'trainers',
  SUBSCRIPTION: 'subscription',
  SUPPORT:      'support',
  SETTINGS:     'settings',
}

/* ── Navigation registry ──────────────────────────────────────
   keyword → target with per-role React Router path.
   path === null → the assistant says the page is not available
   for that role instead of navigating.                        */
export const NAV_TARGETS = [
  {
    key: 'payments',
    label: 'Payments',
    keywords: ['payments', 'payment', 'billing', 'invoice', 'invoices', 'dues'],
    paths: { super_admin: '/payments', gym_admin: '/payments', trainer: null, member: '/member/payments' },
  },
  {
    key: 'reports',
    label: 'Reports',
    keywords: ['reports', 'report', 'analytics'],
    paths: { super_admin: '/reports', gym_admin: '/reports', trainer: null, member: null },
  },
  {
    key: 'attendance',
    label: 'Attendance',
    keywords: ['attendance', 'check in', 'check-in', 'checkin', 'check-ins', 'checkins'],
    paths: { super_admin: '/attendance', gym_admin: '/attendance', trainer: '/attendance', member: '/member/attendance' },
  },
  {
    key: 'members',
    label: 'Members',
    keywords: ['members', 'member list', 'clients', 'client list'],
    paths: { super_admin: '/members', gym_admin: '/members', trainer: '/members', member: null },
  },
  {
    key: 'trainers',
    label: 'Trainers',
    keywords: ['trainers', 'coaches', 'staff'],
    paths: { super_admin: '/trainers', gym_admin: '/trainers', trainer: null, member: null },
  },
  {
    key: 'diet',
    label: 'Diet Plans',
    keywords: ['diet', 'meal plan', 'nutrition'],
    paths: { super_admin: '/diet', gym_admin: '/diet', trainer: '/diet', member: '/member/diet' },
  },
  {
    key: 'workouts',
    label: 'Workout Plans',
    keywords: ['workout', 'workouts', 'training plan', 'routines'],
    paths: { super_admin: '/workouts', gym_admin: '/workouts', trainer: '/workouts', member: '/member/workouts' },
  },
  {
    key: 'progress',
    label: 'Progress',
    keywords: ['progress', 'my progress'],
    paths: { super_admin: '/progress', gym_admin: '/progress', trainer: '/progress', member: '/member/progress' },
  },
  {
    key: 'notifications',
    label: 'Notifications',
    keywords: ['notifications', 'notification', 'alerts'],
    paths: { super_admin: '/notifications', gym_admin: '/notifications', trainer: '/notifications', member: '/member/notifications' },
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    keywords: ['dashboard', 'home', 'overview'],
    paths: { super_admin: '/dashboard', gym_admin: '/dashboard', trainer: '/dashboard', member: '/dashboard' },
  },
  {
    key: 'support',
    label: 'Support',
    keywords: ['support', 'tickets', 'help desk'],
    paths: { super_admin: '/support', gym_admin: '/support', trainer: null, member: null },
  },
  {
    key: 'settings',
    label: 'Settings',
    keywords: ['settings', 'configuration'],
    paths: { super_admin: '/settings', gym_admin: '/settings', trainer: null, member: null },
  },
  {
    key: 'subscription',
    label: 'My Subscription',
    keywords: ['subscription', 'renew membership', 'renewal', 'my plan'],
    paths: { super_admin: '/subscription', gym_admin: '/subscription', trainer: null, member: null },
  },
  {
    key: 'referral',
    label: 'Refer & Earn',
    keywords: ['referral', 'rewards', 'refer and earn', 'earn'],
    paths: { super_admin: '/referral', gym_admin: '/referral', trainer: '/referral', member: '/referral' },
  },
  {
    key: 'devices',
    label: 'Devices',
    keywords: ['devices', 'registered devices'],
    paths: { super_admin: '/devices', gym_admin: '/devices', trainer: null, member: null },
  },
]

const NAV_VERBS = ['open', 'go to', 'navigate to', 'take me to', 'show me', 'show', 'bring up', 'go']

/**
 * Detect navigation commands ("open payments", "go to reports").
 * A navigation wins over the plain data keyword match because the
 * user explicitly asked to go somewhere.
 *
 * @param {string} normalized
 * @param {string} role
 * @returns {{ target: Object, path: (string|null), label: string, unavailable: boolean }|null}
 */
export function findNavigation(normalized, role) {
  let rest = normalized
  for (const verb of NAV_VERBS) {
    if (normalized.startsWith(verb)) rest = normalized.slice(verb.length).trim()
  }
  // "go to X" / "open X" — must start with a verb to count as navigation
  const verbsUsed = NAV_VERBS.some(v => normalized.startsWith(v))
  if (!verbsUsed) return null

  for (const nav of NAV_TARGETS) {
    const hit = nav.keywords.find(kw => rest.includes(kw))
    if (!hit) continue
    const path = nav.paths[role]
    return {
      target: nav,
      path: path || null,
      label: nav.label,
      unavailable: path === null,
      matchedKeyword: hit,
    }
  }
  return null
}

/**
 * Role-aware route for a target key (used by suggestion chips).
 * @param {string} role
 * @param {string} targetKey
 * @returns {(string|null)}
 */
export function resolveRouteKey(role, targetKey) {
  const nav = NAV_TARGETS.find(n => n.key === targetKey)
  return nav ? nav.paths[role] : null
}

// Keyword → intent table. Ordered scan: first pattern with the
// most keyword hits wins (confidence scoring below).
const INTENT_PATTERNS = [
  { intent: INTENTS.GREETING,     keywords: ['hi there', 'hello there', 'good morning', 'good evening', ' hi ', ' hey ', 'namaste'] },
  { intent: INTENTS.HELP,         keywords: ['what can you do', 'how do i', 'how to', 'assist', 'guide', 'help'] },
  { intent: INTENTS.MEMBERSHIP_EXPIRY, keywords: ['membership expiry', 'expiry date', 'when does my membership end', 'membership end', 'does my membership expire', 'membership expire'] },
  { intent: INTENTS.MEMBERSHIP_PLAN,   keywords: ['membership plan', 'what plan', 'plan details', 'current plan', 'which plan'] },
  { intent: INTENTS.MY_TRAINER,        keywords: ['my trainer', 'who is my trainer', 'assigned trainer', 'my coach'] },
  { intent: INTENTS.PENDING_CHECKINS,  keywords: ["hasn't checked in", "haven't checked in today", 'not checked in today', 'pending check-ins', 'pending checkin', 'who is yet to check'] },
  { intent: INTENTS.ATTENDANCE_TODAY,  keywords: ['attendance today', 'check in today', 'checked in today', 'check-ins today', 'checkins today', 'today attendance', 'today check in', 'today checkin'] },
  { intent: INTENTS.ATTENDANCE_TOTAL,  keywords: ['total attendance', 'attendance count', 'how many times have i checked', 'attendance so far', 'check in total'] },
  { intent: INTENTS.PAYMENT_STATUS,    keywords: ['payment status', 'is my payment', 'status of my payment', 'membership status', 'paid status'] },
  { intent: INTENTS.NEXT_DUE,          keywords: ['next due', 'next payment', 'upcoming payment', 'balance due', 'due payment', 'when do i pay'] },
  { intent: INTENTS.MY_WORKOUTS,       keywords: ['my workout', 'my routine', 'assigned workout', 'my training plan', 'show my workout'] },
  { intent: INTENTS.MY_DIET,           keywords: ['my diet', 'my meal plan', 'assigned diet', 'show my diet'] },
  { intent: INTENTS.ANALYZE_PROGRESS, keywords: ['analyze my progress', 'analyze progress', 'progress analysis', 'analyze my body', 'how is my progress', 'am i improving', 'assess my progress', 'progress insights', 'my progress trend', 'progress report', 'analyze my gains'] },
  { intent: INTENTS.MY_PROGRESS,       keywords: ['my progress', 'progress log', 'my gains', 'my body', 'my weight'] },
  { intent: INTENTS.ASSIGNED_MEMBERS,  keywords: ['assigned members', 'assigned clients', 'my members', 'my clients', 'client list', 'who are my members'] },
  { intent: INTENTS.EXPIRING_MEMBERS,  keywords: ['expiring memberships', 'memberships expiring', 'memberships are expiring', 'membership is expiring', 'membership expiring', 'expiring members', 'members are expiring', 'expire soon', 'renewal due', 'ending soon'] },
  { intent: INTENTS.TRAINER_WORKOUTS,  keywords: ['workout plans i have', 'my workout plans', 'plans i created', 'my routine plans'] },
  { intent: INTENTS.TRAINER_DIET,      keywords: ['diet plans i have', 'my diet plans', 'my meal plans'] },
  { intent: INTENTS.MEMBERS_COUNT,     keywords: ['how many members', 'member count', 'members count', 'total members', 'number of members', 'count of members'] },
  { intent: INTENTS.TRAINERS_COUNT,    keywords: ['how many trainers', 'trainer count', 'trainers count', 'total trainers', 'number of trainers', 'count of trainers'] },
  { intent: INTENTS.REVENUE_TODAY,     keywords: ['revenue today', 'today revenue', "today's revenue", 'earned today', 'collected today', 'made today'] },
  { intent: INTENTS.MONTHLY_REVENUE,   keywords: ['monthly revenue', 'revenue this month', 'revenue for this month', 'this month revenue', "this month's revenue", 'month revenue', 'revenue last month', 'last month revenue'] },
  { intent: INTENTS.PENDING_PAYMENTS,  keywords: ['pending payments', 'pending dues', 'unpaid', 'outstanding', 'overdue', 'who owes', 'uncollected'] },
  { intent: INTENTS.RECENT_NOTIFICATIONS, keywords: ['recent notifications', 'latest notifications', 'unread notifications', 'my notifications', 'new alerts'] },
  { intent: INTENTS.ACTIVE_GYMS,       keywords: ['active gyms', 'gyms are active', 'how many active', 'gyms active'] },
  { intent: INTENTS.TOTAL_GYMS,        keywords: ['total gyms', 'how many gyms', 'gym count', 'number of gyms'] },
  { intent: INTENTS.PENDING_APPROVALS, keywords: ['pending approvals', 'pending gym', 'approval requests', 'awaiting approval', 'owners pending', 'approvals pending'] },
  { intent: INTENTS.PLATFORM_REVENUE,  keywords: ['platform revenue', 'total revenue', 'total earnings', 'overall revenue', 'global revenue'] },
  { intent: INTENTS.MRR,               keywords: ['mrr'] },
  { intent: INTENTS.ARR,               keywords: ['arr'] },
  { intent: INTENTS.ACTIVE_SUBSCRIPTIONS, keywords: ['active subscriptions', 'subscriptions active', 'active plans', 'how many subscriptions', 'gym subscriptions', 'active gym subscriptions', 'list subscriptions', 'subscriptions list'] },
  { intent: INTENTS.TOTAL_USERS,       keywords: ['total users', 'user count', 'all users', 'how many users', 'accounts registered'] },
  { intent: INTENTS.CAMPAIGNS,         keywords: ['campaigns', 'campaign status', 'campaign stats', 'active campaigns', 'my campaigns', 'campaign report'] },
  { intent: INTENTS.REVENUE,           keywords: ['revenue', 'earnings', 'income', 'profit'] },
  { intent: INTENTS.PAYMENTS,          keywords: ['payment', 'invoice', 'billing'] },
  { intent: INTENTS.ATTENDANCE,        keywords: ['attendance', 'check-ins', 'checkins', 'streak'] },
  { intent: INTENTS.MEMBERS,           keywords: ['member', 'client'] },
  { intent: INTENTS.TRAINERS,          keywords: ['trainer', 'coach'] },
  { intent: INTENTS.WORKOUTS,          keywords: ['workout', 'exercise'] },
  { intent: INTENTS.DIET,              keywords: ['diet', 'meal', 'nutrition'] },
  { intent: INTENTS.PROGRESS,          keywords: ['progress', 'bmi', 'body fat', 'bench', 'squat', 'deadlift'] },
  { intent: INTENTS.SUBSCRIPTION,      keywords: ['subscription', 'upgrade', 'renew'] },
  { intent: INTENTS.SUPPORT,           keywords: ['support', 'ticket', 'bug'] },
  { intent: INTENTS.SETTINGS,          keywords: ['settings', 'configure', 'setup'] },
]

const INTENT_ALIASES = {
  'help': [INTENTS.HELP],
  'hi': [INTENTS.GREETING],
  'hello': [INTENTS.GREETING],
  'whats my plan': [INTENTS.MEMBERSHIP_PLAN],
  'when is my membership expiring': [INTENTS.MEMBERSHIP_EXPIRY],
}

/**
 * Normalizes a raw message (lowercase, strip punctuation,
 * collapse whitespace).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeInput(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .toLowerCase()
    .replace(/[.,!?;:()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parses a free-text user message into a structured command.
 *
 * @param {string} raw
 * @param {string} role - 'super_admin' | 'gym_admin' | 'trainer' | 'member'
 * @returns {{ intent: string, confidence: number, navigation: ?Object, raw: string, normalized: string }}
 */
export function parseCommand(raw, role) {
  const normalized = normalizeInput(raw)
  if (!normalized) {
    return { intent: INTENTS.FALLBACK, confidence: 0, navigation: null, raw, normalized }
  }

  // 1. Navigation commands win over data keywords ("open payments").
  const navigation = findNavigation(normalized, role)
  if (navigation) {
    return { intent: INTENTS.NAVIGATE, confidence: 0.95, navigation, raw, normalized }
  }

  // 2. Explicit aliases (exact normalized match)
  if (INTENT_ALIASES[normalized]) {
    return { intent: INTENT_ALIASES[normalized][0], confidence: 0.95, navigation: null, raw, normalized }
  }

  // 3. Keyword registry — longest/strongest match wins.
  //    Any single matched keyword is already a confident intent
  //    (>= 0.75 threshold) so the answer stays on the local,
  //    AppContext-driven fast path; weak matches fall through.
  let best = { intent: INTENTS.FALLBACK, confidence: 0.2 }
  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.filter(k => normalized.includes(k))
    if (matched.length === 0) continue
    const confidence = Math.min(0.95, 0.75 + matched.length * 0.1)
    if (confidence > best.confidence) {
      best = { intent: pattern.intent, confidence }
    }
  }

  return { intent: best.intent, confidence: best.confidence, navigation: null, raw, normalized }
}

/**
 * Canonical human label for an intent.
 * @param {string} intent
 * @returns {string}
 */
export function intentLabel(intent) {
  const labels = {
    [INTENTS.GREETING]: 'Greeting',
    [INTENTS.HELP]: 'Help & Capabilities',
    [INTENTS.NAVIGATE]: 'Navigation',
    [INTENTS.MEMBERSHIP_EXPIRY]: 'Membership Expiry',
    [INTENTS.MEMBERSHIP_PLAN]: 'Membership Plan',
    [INTENTS.MY_TRAINER]: 'My Trainer',
    [INTENTS.ATTENDANCE_TODAY]: 'Attendance Today',
    [INTENTS.ATTENDANCE_TOTAL]: 'Total Attendance',
    [INTENTS.PAYMENT_STATUS]: 'Payment Status',
    [INTENTS.NEXT_DUE]: 'Next Due Payment',
    [INTENTS.MY_WORKOUTS]: 'My Workout Plans',
    [INTENTS.MY_DIET]: 'My Diet Plans',
    [INTENTS.MY_PROGRESS]: 'My Progress Summary',
    [INTENTS.ANALYZE_PROGRESS]: 'Progress Analysis',
    [INTENTS.ASSIGNED_MEMBERS]: 'Assigned Members',
    [INTENTS.PENDING_CHECKINS]: 'Pending Check-ins',
    [INTENTS.EXPIRING_MEMBERS]: 'Expiring Memberships',
    [INTENTS.TRAINER_WORKOUTS]: 'Trainer Workout Plans',
    [INTENTS.TRAINER_DIET]: 'Trainer Diet Plans',
    [INTENTS.MEMBERS_COUNT]: 'Members Count',
    [INTENTS.TRAINERS_COUNT]: 'Trainers Count',
    [INTENTS.REVENUE_TODAY]: 'Revenue Today',
    [INTENTS.MONTHLY_REVENUE]: 'Monthly Revenue',
    [INTENTS.PENDING_PAYMENTS]: 'Pending Payments',
    [INTENTS.RECENT_NOTIFICATIONS]: 'Recent Notifications',
    [INTENTS.TOTAL_GYMS]: 'Total Gyms',
    [INTENTS.ACTIVE_GYMS]: 'Active Gyms',
    [INTENTS.PENDING_APPROVALS]: 'Pending Approvals',
    [INTENTS.PLATFORM_REVENUE]: 'Platform Revenue',
    [INTENTS.ACTIVE_SUBSCRIPTIONS]: 'Active Subscriptions',
    [INTENTS.TOTAL_USERS]: 'Total Users',
    [INTENTS.MRR]: 'Monthly Recurring Revenue',
    [INTENTS.ARR]: 'Annual Recurring Revenue',
    [INTENTS.CAMPAIGNS]: 'Campaigns',
    [INTENTS.MEMBERS]: 'Members',
    [INTENTS.ATTENDANCE]: 'Attendance',
    [INTENTS.PAYMENTS]: 'Payments',
    [INTENTS.REVENUE]: 'Revenue',
    [INTENTS.REPORTS]: 'Reports & Analytics',
    [INTENTS.WORKOUTS]: 'Workout Plans',
    [INTENTS.DIET]: 'Diet & Nutrition',
    [INTENTS.PROGRESS]: 'Progress Tracking',
    [INTENTS.TRAINERS]: 'Trainers & Staff',
    [INTENTS.SUBSCRIPTION]: 'Gym Subscription',
    [INTENTS.SUPPORT]: 'Support & Tickets',
    [INTENTS.SETTINGS]: 'Settings & Configuration',
    [INTENTS.FALLBACK]: 'General',
  }
  return labels[intent] || 'General'
}

export default {
  INTENTS,
  NAV_TARGETS,
  normalizeInput,
  parseCommand,
  intentLabel,
  findNavigation,
  resolveRouteKey,
}