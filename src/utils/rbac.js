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
    { key:'reports',       label:'Reports',          icon:'📊' },
    { key:'license',       label:'License Keys',     icon:'🔑' },
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
    { key:'attendance',    label:'QR Check-in',     icon:'📱' },
    { section:'Engagement' },
    { key:'notifications', label:'Notifications',   icon:'🔔', badge:'notifs' },
    { key:'reports',       label:'Reports',         icon:'📊' },
    { key:'whatsapp',      label:'WhatsApp Reminders',icon:'💬' },
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
    { key:'notifications', label:'Notifications',   icon:'🔔', badge:'notifs' },
  ],
}

// ── Role → Route Map ───────────────────────────────────────
export const PAGE_ROUTES = {
  super_admin: [
    'dashboard','gymOwners','subscriptions','pending',
    'analytics','revenue','support','notifications',
    'settings','security','reports','license',
  ],
  gym_admin: [
    'dashboard','members','trainers','payments',
    'attendance','reception','workouts','diet',
    'progress','reports','notifications','whatsapp','settings',
  ],
  trainer: [
    'dashboard','members','workouts','diet',
    'progress','attendance','reception','notifications',
  ],
  member: [
    'dashboard','progress','workouts','diet',
    'payments','attendance','notifications',
  ],
}

// ── Subscription Gating ────────────────────────────────────
// Returns which roles should subscribe to each Firestore collection
export function canSubscribe(role, collection) {
  const gate = {
    members:     ['super_admin','gym_admin','trainer'],
    trainers:    ['super_admin','gym_admin'],
    payments:    ['super_admin','gym_admin'],
    plans:       ['super_admin','gym_admin','trainer'],
    progressLogs:['super_admin','gym_admin','trainer'],
    dietPlans:   ['super_admin','gym_admin','trainer'],
    workoutPlans:['super_admin','gym_admin','trainer'],
    attendance:  ['super_admin','gym_admin','trainer'],
    settings:    ['super_admin','gym_admin','trainer'],
    subscriptions:    ['super_admin'],
    paymentAttempts:  ['super_admin'],
    gyms:             ['super_admin'],
    notifications:    ['super_admin','gym_admin','trainer','member'],
  }
  return gate[collection]?.includes(role) ?? false
}
