// ── Role Normalization ─────────────────────────────────────
// Maps legacy database roles to canonical RBAC roles.
// super_admin: platform owner (isSuperAdmin flag on user doc)
// gym_admin:   single-gym administrator
// trainer:     trainer (unchanged)
// member:      member (unchanged)
export function getEffectiveRole(profile) {
  if (!profile) return null
  const { role } = profile
  if (role === 'admin' && profile.isSuperAdmin) return 'super_admin'
  if (role === 'admin' && !profile.isSuperAdmin) return 'gym_admin'
  if (role === 'gym_owner') return 'gym_admin'
  return role
}

// ── Permission Matrix ──────────────────────────────────────
export const PERMISSIONS = {
  VIEW_ALL_GYMS:       ['super_admin'],
  MANAGE_SUBSCRIPTIONS:['super_admin'],
  APPROVE_GYM_OWNER:   ['super_admin'],
  SUSPEND_GYM:         ['super_admin'],
  VIEW_ANALYTICS:      ['super_admin'],
  MANAGE_PLATFORM_SETTINGS: ['super_admin'],
  MANAGE_LICENSES:     ['super_admin'],
  VIEW_DEVICES:        ['super_admin'],
  MANAGE_DEVICES:      ['super_admin'],
  VIEW_SECURITY:       ['super_admin'],

  VIEW_MEMBERS:        ['super_admin','gym_admin','trainer'],
  VIEW_OWN_PROFILE:    ['member'],
}

// ── Permission Helpers ─────────────────────────────────────
// role should already be normalized via getEffectiveRole()
export function hasPermission(role, permission) {
  return PERMISSIONS[permission]?.includes(role) ?? false
}

// ── Navigation ─────────────────────────────────────────────
export const NAVIGATION = {
  super_admin: [
    { section:'Platform' },
    { key:'dashboard',     label:'Dashboard',       icon:'📊' },
    { key:'referral',      label:'Refer & Earn',    icon:'🎁' },
    { key:'gymOwners',      label:'Gym Owners',      icon:'🏢' },
    { key:'subscriptions',  label:'Subscriptions',   icon:'📋' },
    { key:'pending',       label:'Approval Requests',icon:'⏳', badge:'pending' },
    { section:'Monitoring' },
    { key:'analytics',     label:'Usage Analytics',  icon:'📈' },
    { key:'revenue',       label:'Revenue',          icon:'💰' },
    { section:'Engagement' },
    { key:'support',       label:'Support',          icon:'🆘' },
    { key:'notifications', label:'Notifications',    icon:'🔔', badge:'notifs' },
    { section:'System' },
    { key:'settings',      label:'Settings',         icon:'⚙️' },
    { key:'security',      label:'Security',         icon:'🚫' },
    { key:'devices',       label:'Devices',          icon:'📱' },
    { key:'reports',       label:'Reports',          icon:'📊' },
    { key:'license',       label:'License Keys',     icon:'🔑' },
    { key:'referrals',     label:'Referral Management',icon:'🎁' },
    { key:'referrals/analytics', label:'Referral Analytics',icon:'📊' },
    { key:'referrals/fraud', label:'Fraud Monitoring',icon:'🛡️' },
    { key:'referrals/coupons', label:'Coupons',icon:'🎟️' },
  ],
  gym_admin: [
    { section:'Main' },
    { key:'dashboard',     label:'Dashboard',       icon:'📊' },
    { section:'Members' },
    { key:'members',       label:'Members',          icon:'👥' },
    { key:'trainers',      label:'Trainers',         icon:'🏋️' },
    { section:'Programs' },
    { key:'workouts',      label:'Workout Plans',   icon:'💪' },
    { key:'diet',          label:'Diet Plans',      icon:'🥗' },
    { key:'progress',      label:'Progress Tracking',icon:'📈' },
    { section:'Business' },
    { key:'payments',      label:'Payments',        icon:'💳', badge:'payments' },
    { section:'Engagement' },
    { key:'notifications', label:'Notifications',   icon:'🔔', badge:'notifs' },
    { key:'reports',       label:'Reports',         icon:'📊' },
    { key:'whatsapp',      label:'WhatsApp Reminders',icon:'💬' },
    { key:'support',       label:'Support & Tickets',icon:'🆘' },
    { section:'Attendance' },
    { key:'attendance',    label:'Attendance',      icon:'📋' },
    { key:'reception',     label:'Reception Mode',  icon:'🚪' },
    { section:'Referral' },
    { key:'referral', label:'Refer & Earn',icon:'🎁' },
    { key:'referrals/dashboard', label:'Referral Dashboard',icon:'📊' },
    { key:'referrals/fraud',     label:'Fraud Monitoring',icon:'🛡️' },
    { key:'referrals/coupons',   label:'Coupons',icon:'🎟️' },
    { section:'Subscription' },
    { key:'subscription',  label:'My Subscription', icon:'📋' },
    { key:'devices',       label:'Registered Devices',icon:'📱' },
    { section:'System' },
    { key:'settings',      label:'Settings',        icon:'⚙️' },
  ],
  trainer: [
    { section:'Main' },
    { key:'dashboard',     label:'Dashboard',       icon:'📊' },
    { key:'members',       label:'My Clients',      icon:'👥' },
    { section:'Programs' },
    { key:'workouts',      label:'Workout Plans',   icon:'💪' },
    { key:'diet',          label:'Diet Plans',      icon:'🥗' },
    { key:'progress',      label:'Progress Tracking',icon:'📈' },
    { section:'Other' },
    { key:'attendance',    label:'Attendance',      icon:'📱' },
    { key:'reception',     label:'Reception Mode',  icon:'🚪' },
    { key:'notifications', label:'Notifications',   icon:'🔔', badge:'notifs' },
  ],
  member: [
    { section:'My Gym' },
    { key:'dashboard',     label:'My Dashboard',    icon:'📊' },
    { key:'progress',      label:'My Progress',     icon:'📈' },
    { key:'workouts',      label:'My Workouts',     icon:'💪' },
    { key:'diet',          label:'My Diet Plan',    icon:'🥗' },
    { section:'Account' },
    { key:'payments',      label:'My Payments',     icon:'💳' },
    { key:'attendance',    label:'Check In',        icon:'📱' },
    { key:'referral',      label:'Refer & Earn',    icon:'🎁' },
    { key:'rewards',label:'My Rewards',      icon:'💰' },
    { key:'notifications', label:'Notifications',   icon:'🔔', badge:'notifs' },
  ],
}

// ── Subscription Gating ────────────────────────────────────
// Returns which roles should subscribe to each Firestore collection
export function canSubscribe(role, collection) {
  const gate = {
    members:     ['super_admin','gym_admin','trainer'],
    trainers:    ['super_admin','gym_admin','trainer'],
    payments:    ['super_admin','gym_admin'],
    plans:       ['super_admin','gym_admin','trainer'],
    progressLogs:['super_admin','gym_admin','trainer','member'],
    dietPlans:   ['super_admin','gym_admin','trainer','member'],
    workoutPlans:['super_admin','gym_admin','trainer','member'],
    attendance:  ['super_admin','gym_admin','trainer','member'],
    settings:    ['super_admin','gym_admin','trainer'],
    subscriptions:    ['super_admin'],
    paymentAttempts:  ['super_admin', 'gym_admin'],
    gyms:             ['super_admin'],
    notifications:    ['super_admin','gym_admin','trainer','member'],
    supportTickets:   ['super_admin','gym_admin'],
    featureRequests:  ['super_admin','gym_admin'],
    referrals:        ['super_admin','gym_admin','member'],
    referralSettings: ['super_admin','gym_admin','member'],
  }
  const result = gate[collection]?.includes(role) ?? false
  if (!(collection in gate)) {
    // unknown collection — deny by default
  }
  return result
}
