// src/services/firestoreService.js

import { subscribeRealtime } from './realtimeService'

// Secondary auth instance for creating trainer/member accounts
// so the admin stays logged in on the main auth instance
// (lazy: only instantiated when a firebase-mode branch actually runs â€”
//  fully tree-shaken from supabase production builds)

// Default gym ID for single-gym mode (pre-multi-tenant migration)
export const DEFAULT_GYM_ID = 'default'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DATA PROVIDER SELECTION (Step 8C â€” dual-provider)
// 'supabase' = default ACTIVE data plane
// 'firebase' = explicit legacy rollback (rebuild with VITE_AUTH_PROVIDER=firebase)
// NOTE: value must be lowercase; Vite inlines the env reference and esbuild
// folds the literal comparison, so IS_FIREBASE_MODE becomes `false` in a
// supabase production build and ALL legacy branches + firebase imports are
// dead-code-eliminated (same pattern as authService.js Step 8B).

let _supabaseClient = null
async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient
  const m = await import('../lib/supabase')
  _supabaseClient = m.supabase
  return _supabaseClient
}

// â”€â”€ ID translation (mirror of scripts/migration/dry_run_import.js) â”€â”€
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function detUuid(str) {
  const data = new TextEncoder().encode('IRONPULSE:' + str)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // UUID v5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC4122 variant
  const hex = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

async function resolveId(id) {
  if (id == null || id === '') return null
  const s = String(id)
  return UUID_RE.test(s) ? s.toLowerCase() : await detUuid(s)
}

function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// â”€â”€ Error mapping (Step 10) â”€â”€
function mapSupabaseError(err, fallbackMsg) {
  const msg = (err && (err.message || err.details || err.hint)) || String(err || fallbackMsg || 'Supabase error')
  // PostgREST returns the SQLSTATE in err.code, not the message — test both.
  const codeStr = msg + ' ' + (err && err.code ? String(err.code) : '')
  const code =
    /42501|42502|42504|permission denied|row-level security|new row violates/i.test(codeStr) ? 'permission-denied'
    : /23505|duplicate key|already exists/i.test(codeStr) ? 'already-exists'
    : /PGRST116|404|not found/i.test(codeStr) ? 'not-found'
    : /network|fetch failed|ECONN|timeout|Failed to fetch/i.test(codeStr) ? 'unavailable'
    : /22P02|22007|23514|invalid input|invalid enum|violates check/i.test(codeStr) ? 'invalid-argument'
    : /23503|foreign key/i.test(codeStr) ? 'foreign-key-violation'
    : undefined
  const error = new Error(msg)
  if (code) error.code = code
  return error
}

// â”€â”€ Numeric coercion (PostgREST returns numeric columns as strings) â”€â”€
function coerceNumeric(row, cols) {
  const out = { ...row }
  for (const c of cols) {
    if (out[c] != null && out[c] !== '') out[c] = Number(out[c])
  }
  return out
}

// â”€â”€ Snapshot helpers â”€â”€
function sbTable(client, name) {
  return client.from(name)
}

function sbError(err) {
  return mapSupabaseError(err)
}

// Supabase realtime subscription helper (Step 8D) — Firestore-style snapshot
// semantics over postgres_changes via the shared realtimeService adapter.
function sbSubscribe({ table, filter, orderBy, limit, mapRow, onChange, onError, label, keyFn }) {
  return subscribeRealtime({
    table,
    filter,
    orderBy,
    limit,
    mapRow,
    keyFn,
    onChange,
    onError: (e) => {
      console.error(`[Supabase] ${label || table} realtime error:`, e.message)
      if (onError) onError(e, label || table)
    },
    label: label || table,
  })
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MEMBERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Add new member
export async function addMember(memberData) {
  return supabaseAddMember(memberData)
}

// Trainer-scoped members subscription (trainer role â€” only assigned members)
export function subscribeToMyMembers(trainerAuthUid, callback, gymId, onError) {
  return sbSubscribe({
      table: 'members',
      filter: [['trainer_auth_uid', trainerAuthUid], ['gym_id', gymId]],
      limit: 2000,
      mapRow: mapMemberRow,
      onChange: callback,
      onError,
      label: 'myMembers',
    })
}

// Backfill trainerAuthUid on existing member docs (one-time migration)
export async function backfillTrainerAuthUid(gymId) {
  return supabaseBackfillTrainerAuthUid(gymId)
}

// Realtime members listener
export function subscribeToMembers(callback, gymId, onError) {
  return sbSubscribe({
      table: 'members',
      filter: [['gym_id', gymId]],
      limit: 2000,
      mapRow: mapMemberRow,
      onChange: callback,
      onError,
      label: 'members',
    })
}

// Member self-subscription (member role - own record only)
export function subscribeToMyMember(authUid, callback, onError) {
  return sbSubscribe({
      table: 'members',
      filter: [['auth_uid', authUid]],
      limit: 2000,
      mapRow: mapMemberRow,
      onChange: callback,
      onError,
      label: 'myMember',
    })
}

// Member self-payments subscription (member role - own records only)
export function subscribeToMyPayments(authUid, callback, gymId, onError) {
  return sbSubscribe({
      table: 'payments',
      filter: [['auth_uid', authUid], ['gym_id', gymId]],
      limit: 2000,
      mapRow: mapPaymentRow,
      onChange: callback,
      onError,
      label: 'myPayments',
    })
}

// Update member
export async function updateMember(memberId,  updatedData) {
  return supabaseUpdateMember(memberId, updatedData)
}

// Delete member
export async function deleteMember(memberId) {
  return supabaseDeleteMember(memberId)
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PAYMENTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Add payment
export async function addPayment(paymentData) {
  return supabaseAddPayment(paymentData)
}

// Realtime payments listener
export function subscribeToPayments(callback, gymId, onError) {
  return sbSubscribe({
      table: 'payments',
      filter: [['gym_id', gymId]],
      limit: 2000,
      mapRow: mapPaymentRow,
      onChange: callback,
      onError,
      label: 'payments',
    })
}

// Update payment
export async function updatePayment(paymentId,  updatedData) {
  return supabaseUpdatePayment(paymentId, updatedData)
}

// Delete payment
export async function deletePayment(paymentId) {
  return supabaseDeletePayment(paymentId)
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TRAINERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Add trainer
export async function addTrainer(trainerData) {
  return supabaseAddTrainer(trainerData)
}

// Subscribe realtime trainers
export function subscribeToTrainers(callback, gymId, onError) {
  return sbSubscribe({
      table: 'trainers',
      filter: [['gym_id', gymId]],
      limit: 500,
      mapRow: mapTrainerRow,
      onChange: callback,
      onError,
      label: 'trainers',
    })
}

// Update trainer
export async function updateTrainer(trainerId,  updatedData) {
  return supabaseUpdateTrainer(trainerId, updatedData)
}

// Delete trainer
export async function deleteTrainer(trainerId) {
  return supabaseDeleteTrainer(trainerId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SETTINGS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SUPPORT TICKETS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function addSupportTicket(ticketData) {
  return supabaseAddSupportTicket(ticketData)
}

export function subscribeToSupportTickets(callback, gymId, onError) {
  return sbSubscribe({
      table: 'support_tickets',
      filter: [['gym_id', gymId]],
      limit: 500,
      mapRow: mapSupportTicketRow,
      onChange: callback,
      onError,
      label: 'supportTickets',
    })
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONTACT MESSAGES (Landing page)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function addContactMessage(msgData) {
  return supabaseAddContactMessage(msgData)
}

export function subscribeToContactMessages(callback, onError) {
  return sbSubscribe({
      table: 'contact_messages',
      filter: [['status', ['New', 'Read']]],
      limit: 500,
      mapRow: mapContactMessageRow,
      onChange: callback,
      onError,
      label: 'contactMessages',
    })
}

export async function updateContactMessage(msgId, data) {
  return supabaseUpdateContactMessage(msgId, data)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FEATURE REQUESTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function addFeatureRequest(requestData) {
  return supabaseAddFeatureRequest(requestData)
}

export function subscribeToFeatureRequests(callback, gymId, onError) {
  return sbSubscribe({
      table: 'feature_requests',
      filter: [['gym_id', gymId]],
      limit: 500,
      mapRow: mapFeatureRequestRow,
      onChange: callback,
      onError,
      label: 'featureRequests',
    })
}

// Read settings document from /settings/{docId}
// In multi-tenant mode, settings scoped to gymId use docId = `${gymId}:${docId}`
export async function getSettings(docId = 'gym', gymId) {
  return supabaseGetSettings(docId, gymId)
}

// Write (merge) settings document to /settings/{docId}
// In multi-tenant mode, settings scoped to gymId use docId = `${gymId}:${docId}`
export async function saveSettings(docId = 'gym', data, gymId) {
  return supabaseSaveSettings(docId, data, gymId)
}

// â”€â”€ Global Billing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single global billing document at /settings/billing (no gymId prefix)
export async function getGlobalBilling() {
  return getSettings('billing')
}

// Apply discount to an original amount
// Returns { originalAmount, discountType, discountValue, finalAmount }
function applyDiscount(originalAmount, discountType, discountValue) {
  const orig = Number(originalAmount) || 0
  const type = discountType || 'none'
  const val = Number(discountValue) || 0
  let final = orig

  if (type === 'percentage' && val > 0 && val <= 100) {
    final = Math.round(orig - (orig * val / 100))
  } else if (type === 'fixed' && val > 0) {
    final = Math.max(0, orig - val)
  }

  return {
    originalAmount: orig,
    discountType: type,
    discountValue: val,
    finalAmount: final,
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PROGRESS LOGS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function subscribeToProgressLogs(callback, gymId, onError) {
  return sbSubscribe({
      table: 'progress_logs',
      filter: [['gym_id', gymId]],
      limit: 1000,
      mapRow: mapProgressLogRow,
      onChange: callback,
      onError,
      label: 'progressLogs',
    })
}

export function subscribeToMyProgressLogs(callback, authUid, onError) {
  return sbSubscribe({
      table: 'progress_logs',
      filter: [['auth_uid', authUid]],
      limit: 500,
      mapRow: mapProgressLogRow,
      onChange: callback,
      onError,
      label: 'myProgressLogs',
    })
}

export async function addProgressLog(logData) {
  return supabaseAddProgressLog(logData)
}

export async function updateProgressLog(logId, updatedData) {
  return supabaseUpdateProgressLog(logId, updatedData)
}

export async function deleteProgressLog(logId) {
  return supabaseDeleteProgressLog(logId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PLANS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Realtime plans listener (global â€” shared across gyms)
export function subscribeToPlans(callback, gymId, onError) {
  return sbSubscribe({
      table: 'plans',
      filter: [['gym_id', gymId]],
      limit: 1000,
      mapRow: mapPlanRow,
      onChange: callback,
      onError,
      label: 'plans',
    })
}

// Add plan
export async function addPlan(planData) {
  return supabaseAddPlan(planData)
}

// Update plan
export async function updatePlan(planId, updatedData) {
  return supabaseUpdatePlan(planId, updatedData)
}

// Delete plan
export async function deletePlan(planId) {
  return supabaseDeletePlan(planId)
}

// Migrate default plans if collection is empty (per gym)
export async function migrateDefaultPlans(gymId) {
  return supabaseMigrateDefaultPlans(gymId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DIET PLANS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function subscribeToDietPlans(callback, gymId, onError) {
  return sbSubscribe({
      table: 'diet_plans',
      filter: [['gym_id', gymId]],
      limit: 1000,
      mapRow: mapDietPlanRow,
      onChange: callback,
      onError,
      label: 'dietPlans',
    })
}

// Member-scoped diet plans subscription (own assigned plans)
export function subscribeToMyAssignedDietPlans(authUid, callback, gymId, onError) {
  return sbSubscribe({
      table: 'diet_plans',
      filter: [['auth_uid', authUid], ['gym_id', gymId]],
      limit: 500,
      mapRow: mapDietPlanRow,
      onChange: callback,
      onError,
      label: 'myAssignedDietPlans',
    })
}

// Trainer-scoped diet plans subscription
export function subscribeToMyDietPlans(trainerAuthUid, callback, gymId, onError) {
  return sbSubscribe({
      table: 'diet_plans',
      filter: [['assigned_trainer_auth_uid', trainerAuthUid], ['gym_id', gymId]],
      limit: 500,
      mapRow: mapDietPlanRow,
      onChange: callback,
      onError,
      label: 'myDietPlans',
    })
}

export async function addDietPlan(planData) {
  return supabaseAddDietPlan(planData)
}

// Version snapshot helper (Sprint 78B â€” req 7): compact previous
// state kept on the SAME document, never a separate collection.
function snapshotPlan(plan) {
  if (!plan) return null
  const base = { savedAt: new Date().toISOString(), name: plan.name, goal: plan.goal }
  if (Array.isArray(plan.meals)) {
    return {
      ...base,
      calories: plan.calories,
      protein: plan.protein,
      carbs: plan.carbs,
      fat: plan.fat,
      hydration: plan.hydration,
      meals: (plan.meals || []).map(m => m?.name).filter(Boolean),
    }
  }
  return {
    ...base,
    level: plan.level,
    days: plan.days,
    duration: plan.duration,
    split: plan.split,
    exercises: (plan.exercises || []).map(e => e?.name).filter(Boolean),
  }
}

export async function updateDietPlan(planId, updatedData) {
  return supabaseUpdateDietPlan(planId, updatedData)
}

export async function deleteDietPlan(planId) {
  return supabaseDeleteDietPlan(planId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WORKOUT PLANS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function subscribeToWorkoutPlans(callback, gymId, onError) {
  return sbSubscribe({
      table: 'workout_plans',
      filter: [['gym_id', gymId]],
      limit: 1000,
      mapRow: mapWorkoutPlanRow,
      onChange: callback,
      onError,
      label: 'workoutPlans',
    })
}

// Member-scoped workout plans subscription (own assigned plans)
export function subscribeToMyAssignedWorkoutPlans(authUid, callback, gymId, onError) {
  return sbSubscribe({
      table: 'workout_plans',
      filter: [['auth_uid', authUid], ['gym_id', gymId]],
      limit: 500,
      mapRow: mapWorkoutPlanRow,
      onChange: callback,
      onError,
      label: 'myAssignedWorkoutPlans',
    })
}

// Trainer-scoped workout plans subscription
export function subscribeToMyWorkoutPlans(trainerAuthUid, callback, gymId, onError) {
  return sbSubscribe({
      table: 'workout_plans',
      filter: [['trainer_auth_uid', trainerAuthUid], ['gym_id', gymId]],
      limit: 500,
      mapRow: mapWorkoutPlanRow,
      onChange: callback,
      onError,
      label: 'myWorkoutPlans',
    })
}

export async function addWorkoutPlan(planData) {
  return supabaseAddWorkoutPlan(planData)
}

export async function updateWorkoutPlan(planId, updatedData) {
  return supabaseUpdateWorkoutPlan(planId, updatedData)
}

export async function deleteWorkoutPlan(planId) {
  return supabaseDeleteWorkoutPlan(planId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BACKFILL: populate memberId/authUid on existing dietPlans/workoutPlans
// Call once after schema update to backfill legacy records.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function backfillOwnershipFields() {
  return supabaseBackfillOwnershipFields()
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GYMS (global collection â€” one doc per gym)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function subscribeToGyms(callback, onError) {
  return sbSubscribe({
      table: 'gyms',
      filter: [],
      limit: 500,
      mapRow: mapGymRow,
      onChange: callback,
      onError,
      label: 'gyms',
    })
}

export async function addGym(gymData, ownerUid) {
  return supabaseAddGym(gymData, ownerUid)
}

export async function updateGym(gymId, updatedData) {
  return supabaseUpdateGym(gymId, updatedData)
}

export async function deleteGym(gymId) {
  return supabaseDeleteGym(gymId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SUBSCRIPTIONS (global collection â€” billing per gym)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function subscribeToSubscriptions(callback, onError) {
  return sbSubscribe({
      table: 'subscriptions',
      filter: [],
      limit: 500,
      mapRow: mapSubscriptionRow,
      onChange: callback,
      onError,
      label: 'subscriptions',
    })
}

// Check if a subscription already exists for a given gymId
export async function getSubscriptionByGymId(gymId) {
  return supabaseGetSubscriptionByGymId(gymId)
}

// Fetch a single subscription row by id (RLS: super_admin all, gym_admin own gym).
// Used by /checkout when the caller's role has no platform-level subscriptions state.
export async function getSubscriptionById(id) {
  return supabaseGetSubscriptionById(id)
}

// Calculate subscription dates based on plan
function calculateSubscriptionDates(plan, billingSettings) {
  const trialDays = billingSettings?.trialDays || 7;
  const gracePeriod = billingSettings?.gracePeriod || 5;
  let isLifetime = false;

  function addDays(d, n) { return new Date(d.getTime() + n * 86400000) }

  const base = new Date()
  let startDate = base
  let expiryDate, graceEndDate

  switch (plan) {
    case 'Trial':
      expiryDate = addDays(base, trialDays)
      graceEndDate = addDays(base, trialDays + gracePeriod)
      break;
    case 'Standard':
      expiryDate = addDays(base, 30)
      graceEndDate = addDays(base, 30 + gracePeriod)
      break;
    case 'Premium':
      expiryDate = addDays(base, 30)
      graceEndDate = addDays(base, 30 + gracePeriod)
      break;
    case 'Quarterly':
      expiryDate = addDays(base, 90)
      graceEndDate = addDays(base, 90 + gracePeriod)
      break;
    case 'Annual':
      expiryDate = addDays(base, 365)
      graceEndDate = addDays(base, 365 + gracePeriod)
      break;
    case 'Lifetime':
      expiryDate = addDays(base, 9999)
      graceEndDate = base
      isLifetime = true
      break;
    case 'Day Pass':
      expiryDate = addDays(base, 1)
      graceEndDate = addDays(base, 1)
      break;
    default:
      expiryDate = addDays(base, 30)
      graceEndDate = addDays(base, 30 + gracePeriod)
  }

  const daysRemaining = isLifetime ? 9999 : Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

  return {
    startDate: startDate.toISOString().split('T')[0],
    expiryDate: expiryDate.toISOString().split('T')[0],
    graceEndDate: graceEndDate.toISOString().split('T')[0],
    daysRemaining,
    isLifetime,
  };
}

// Calculate subscription amount based on plan
// When billingSettings provided, returns { originalAmount, finalAmount }
// When no billingSettings, returns raw paise value (backward compat)
function calculateSubscriptionAmount(plan, billingSettings) {
  if (billingSettings) {
    const planAmounts = {
      'Trial':     0,
      'Standard':  billingSettings.monthlyPrice || 9999,
      'Premium':   billingSettings.yearlyPrice || 19999,
      'Quarterly': billingSettings.halfYearlyPrice || 29999,
      'Annual':    billingSettings.yearlyPrice || 99999,
      'Lifetime':  billingSettings.lifetimePrice || 499999,
      'Day Pass':  99,
    };
    return planAmounts[plan] || planAmounts['Standard'];
  }

  const planPrices = {
    'Trial': 0,
    'Standard': 9999,
    'Premium': 19999,
    'Quarterly': 29999,
    'Annual': 99999,
    'Lifetime': 499999,
    'Day Pass': 99,
  };

  return planPrices[plan] || planPrices['Standard'];
}

export async function addSubscription(subData, billingSettings) {
  return supabaseAddSubscription(subData, billingSettings)
}

export async function updateSubscription(subId, updatedData, billingSettings) {
  return supabaseUpdateSubscription(subId, updatedData, billingSettings)
}

export async function deleteSubscription(subId) {
  return supabaseDeleteSubscription(subId)
}

// Migration: Backfill missing fields on existing subscription documents
export async function migrateSubscriptions() {
  return supabaseMigrateSubscriptions()
}

// â”€â”€ superAdmins collection removed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// isSuperAdmin is now a boolean field on the user document.
// See AuthContext.jsx and rbac.js for the new approach.

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PLAN TEMPLATES (Sprint 78B, req 6)
// Staff-scoped reusable plan templates. On-demand getDocs only â€”
// deliberately NO onSnapshot listener here.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function savePlanTemplate({ type, name, plan, gymId }) {
  return supabaseSavePlanTemplate({ type, name, plan, gymId })
}

export async function listPlanTemplates(type, gymId) {
  return supabaseListPlanTemplates(type, gymId)
}

export async function deletePlanTemplate(templateId) {
  return supabaseDeletePlanTemplate(templateId)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WHATSAPP AUTOMATION (Sprint 79A)
//   whatsappLogs â€” send log records (written by the engine)
//   settings/{gymId}:whatsapp â€” automation config (one-shot reads)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function addWhatsappLog(record) {
  return supabaseAddWhatsappLog(record)
}

/** Single live subscription â€” used ONLY by AppContext (no duplicates). */
export function subscribeToWhatsappLogs(callback, gymId, onError) {
  return sbSubscribe({
      table: 'whatsapp_logs',
      filter: [['gym_id', gymId]],
      orderBy: { column: 'created_at', ascending: false },
      limit: 300,
      mapRow: mapWhatsappLogRow,
      onChange: callback,
      onError,
      label: 'whatsappLogs',
    })
}

export async function getWhatsAppAutomationConfig(gymId) {
  return supabaseGetWhatsAppAutomationConfig(gymId)
}

export async function saveWhatsAppAutomationConfig(gymId, config) {
  return supabaseSaveWhatsAppAutomationConfig(gymId, config)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WHATSAPP CAMPAIGNS (Sprint 79B)
//   whatsappCampaigns â€” campaign docs, updated per run.
//   ONE-SHOT reads only (NO onSnapshot â€” requirement: no new
//   realtime listeners; the page refreshes on mount + actions).
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function listWhatsappCampaigns(gymId, limitN = 200) {
  return supabaseListWhatsappCampaigns(gymId, limitN)
}

export async function createWhatsappCampaign(campaign) {
  return supabaseCreateWhatsappCampaign(campaign)
}

export async function updateWhatsappCampaign(id, patch) {
  return supabaseUpdateWhatsappCampaign(id, patch)
}

/** Atomic stat increment (stats.sent / stats.failed). */
export async function bumpWhatsappCampaignStats(id, delta) {
  return supabaseBumpWhatsappCampaignStats(id, delta)
}

export async function deleteWhatsappCampaign(id) {
  return supabaseDeleteWhatsappCampaign(id)
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SUPABASE DATA PLANE (Step 8C)
// All supabase implementations live below. Each public function in
// the Firebase section above delegates here when NOT firebase mode.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Row mappers (snake_case DB â†’ camelCase app shape) â”€â”€
function mapMemberRow(r) {
  const row = coerceNumeric(r, ['weight', 'height', 'plan_price', 'amount_paid', 'balance_due', 'age'])
  return {
    id: row.id,
    authUid: row.auth_uid || '',
    legacyId: row.legacy_id,
    gymId: row.gym_id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    contact: row.contact || '',
    age: row.age ?? null,
    weight: row.weight ?? null,
    height: row.height ?? null,
    gender: row.gender || '',
    plan: row.plan || 'Monthly',
    planPrice: row.plan_price ?? null,
    amountPaid: row.amount_paid ?? 0,
    balanceDue: row.balance_due ?? 0,
    paymentStatus: row.payment_status || 'Paid',
    status: row.status || 'Active',
    checkins: row.checkins || 0,
    trainerId: row.trainer_id || '',
    trainerAuthUid: row.trainer_auth_uid || '',
    avatar: row.avatar || '',
    color: row.color || '',
    photoUrl: row.photo_url || '',
    storagePath: row.storage_path || '',
    expiry: row.expiry || '',
    notes: row.notes || '',
    joinDate: row.join_date || '',
    referredBy: row.referred_by || '',
    createdAt: row.created_at || '',
  }
}

function mapTrainerRow(r) {
  const row = coerceNumeric(r, ['rating', 'clients'])
  return {
    id: row.id,
    authUid: row.auth_uid || '',
    legacyId: row.legacy_id,
    gymId: row.gym_id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    specialty: row.specialty || '',
    rating: row.rating ?? 0,
    clients: row.clients || 0,
    bio: row.bio || '',
    experience: row.experience || '',
    avatar: row.avatar || '',
    color: row.color || '',
    createdAt: row.created_at || '',
  }
}

function mapPaymentRow(r) {
  const row = coerceNumeric(r, ['amount', 'paid'])
  return {
    id: row.id,
    paymentId: row.payment_id,
    invoiceNo: row.invoice_no || '',
    gymId: row.gym_id,
    memberId: row.member_id || '',
    authUid: row.auth_uid || '',
    member: row.member_name || '',
    memberName: row.member_name || '',
    amount: row.amount ?? 0,
    paid: row.paid ?? 0,
    due: row.due || '',
    status: row.status || 'Pending',
    plan: row.plan || 'Monthly',
    method: row.method || '',
    date: row.date || '',
    transactionId: row.transaction_id || '',
    paymentGateway: row.payment_gateway || '',
    createdAt: row.created_at || '',
  }
}

function mapPlanRow(r) {
  const row = coerceNumeric(r, ['price'])
  return {
    id: row.id,
    gymId: row.gym_id,
    name: row.name,
    price: row.price ?? null,
    duration: minutesToDurationString(row.duration),
    durationDays: row.duration_days ?? null,
    description: row.description || '',
    active: row.active !== false,
    order: row.sort_order || 0,
    createdAt: row.created_at || '',
  }
}

function mapDietPlanRow(r) {
  const row = coerceNumeric(r, ['calories', 'protein', 'carbs', 'fat'])
  return {
    id: row.id,
    gymId: row.gym_id,
    name: row.name,
    goal: row.goal || '',
    calories: row.calories ?? null,
    protein: row.protein ?? null,
    carbs: row.carbs ?? null,
    fat: row.fat ?? null,
    hydration: row.hydration || '',
    meals: Array.isArray(row.meals) ? row.meals : [],
    memberId: row.member_id || '',
    authUid: row.auth_uid || '',
    assignedMember: row.assigned_member || '',
    assignedTrainer: row.assigned_trainer || '',
    assignedTrainerAuthUid: row.assigned_trainer_auth_uid || '',
    ownerType: row.owner_type || '',
    ownerId: row.owner_id || '',
    versions: Array.isArray(row.versions) ? row.versions : [],
    createdAt: row.created_at || '',
  }
}

function mapWorkoutPlanRow(r) {
  const row = coerceNumeric(r, ['days'])
  return {
    id: row.id,
    gymId: row.gym_id,
    name: row.name,
    level: row.level || '',
    days: row.days ?? null,
    duration: row.duration || '',
    split: row.split || '',
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    memberId: row.member_id || '',
    authUid: row.auth_uid || '',
    member: row.member || '',
    assignedTrainer: row.assigned_trainer || '',
    trainer: row.trainer || '',
    trainerAuthUid: row.trainer_auth_uid || '',
    ownerType: row.owner_type || '',
    ownerId: row.owner_id || '',
    versions: Array.isArray(row.versions) ? row.versions : [],
    createdAt: row.created_at || '',
  }
}

function mapProgressLogRow(r) {
  const row = coerceNumeric(r, ['weight', 'body_fat', 'bmi', 'muscle', 'bench', 'squat', 'deadlift'])
  return {
    id: row.id,
    gymId: row.gym_id,
    memberId: row.member_id || '',
    memberName: row.member_name || '',
    authUid: row.auth_uid || '',
    trainerId: row.trainer_id || '',
    trainerName: row.trainer_name || '',
    weight: row.weight ?? 0,
    bodyFat: row.body_fat ?? 0,
    bmi: row.bmi ?? 0,
    muscle: row.muscle ?? 0,
    bench: row.bench ?? 0,
    squat: row.squat ?? 0,
    deadlift: row.deadlift ?? 0,
    notes: row.notes || '',
    logDate: row.log_date || '',
    createdAt: row.created_at || '',
  }
}

function mapGymRow(r) {
  return {
    id: r.id,
    gymName: r.gym_name || r.id,
    ownerName: r.owner_name || '',
    email: r.email || '',
    phone: r.phone || '',
    ownerUid: r.owner_uid || '',
    status: r.status || '',
    approvalStatus: r.approval_status || 'pending',
    approvalReviewedAt: r.approval_reviewed_at || '',
    approvedAt: r.approved_at || '',
    rejectedReason: r.rejected_reason || '',
    documents: r.documents || {},
    subscription: r.subscription || {},
    createdAt: r.created_at || '',
  }
}

function mapSubscriptionRow(r) {
  const row = coerceNumeric(r, ['amount'])
  return {
    id: row.id,
    gymId: row.gym_id,
    plan: row.plan || '',
    planName: row.plan_name || '',
    planType: row.plan_type || '',
    amount: row.amount ?? null,
    currency: row.currency || 'INR',
    status: row.status || 'trial',
    paymentStatus: row.payment_status || 'pending',
    paymentMethod: row.payment_method || 'Not Set',
    transactionId: row.transaction_id || '',
    paidAt: row.paid_at || '',
    expiryDate: row.expiry_date || '',
    startedAt: row.started_at || '',
    cancelledAt: row.cancelled_at || '',
    licenseKey: row.license_key || '',
    pendingPaymentType: row.pending_payment_type || '',
    createdAt: row.created_at || '',
  }
}

function mapSupportTicketRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id,
    name: r.name || '',
    email: r.email || '',
    category: r.category || '',
    subject: r.subject || '',
    message: r.message || '',
    status: r.status || 'Open',
    priority: r.priority || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at || '',
  }
}

function mapFeatureRequestRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id,
    title: r.title || '',
    description: r.description || '',
    category: r.category || '',
    status: r.status || 'Under Review',
    votes: r.votes || 0,
    createdBy: r.created_by || '',
    createdAt: r.created_at || '',
  }
}

function mapContactMessageRow(r) {
  return {
    id: r.id,
    name: r.name || '',
    email: r.email || '',
    message: r.message || '',
    status: r.status || 'New',
    createdAt: r.created_at || '',
  }
}

function mapWhatsappLogRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id,
    memberId: r.member_id || '',
    phone: r.phone || '',
    template: r.template || '',
    provider: r.provider || 'mock',
    status: r.status || 'Queued',
    attempts: r.attempts || 0,
    error: r.error || '',
    entryId: r.entry_id || '',
    campaignId: r.campaign_id || '',
    test: !!r.test,
    sentAt: r.sent_at || '',
    createdAt: r.created_at || '',
  }
}

function mapCampaignRow(r) {
  return {
    id: r.id,
    gymId: r.gym_id,
    name: r.name || '',
    body: r.body || '',
    audience: r.audience || {},
    schedule: r.schedule || {},
    status: r.status || 'Draft',
    stats: r.stats || { sent: 0, failed: 0, pending: 0, cancelled: 0, total: 0 },
    nextRunAt: r.next_run_at || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at || '',
  }
}

// â”€â”€ Duration conversion (plans store minutes; UI uses strings) â”€â”€
function parseDurationToMinutes(str) {
  if (str == null || str === '') return null
  const m = /^(\d+)\s*(day|days|week|weeks|month|months|year|years|d|w|mo|y)?$/i.exec(String(str).trim())
  if (!m) return null
  const n = Number(m[1])
  if (!n || n <= 0) return null
  const unit = (m[2] || 'd').toLowerCase()
  const mult = unit === 'w' || unit.startsWith('week') ? 10080
    : unit === 'mo' || unit.startsWith('month') ? 43200
    : unit === 'y' || unit.startsWith('year') ? 525600
    : 1440
  return n * mult
}

function minutesToDurationString(min) {
  if (min == null) return ''
  const n = Number(min)
  if (n % 525600 === 0) return `${n / 525600} Year${n / 525600 > 1 ? 's' : ''}`
  if (n % 43200 === 0) return `${n / 43200} Month${n / 43200 > 1 ? 's' : ''}`
  if (n % 10080 === 0) return `${n / 10080} Week${n / 10080 > 1 ? 's' : ''}`
  if (n % 1440 === 0) return `${n / 1440} Day${n / 1440 > 1 ? 's' : ''}`
  return `${n} min`
}

// â”€â”€ Settings helpers (composite gym_id:doc_id) â”€â”€
function settingsKey(docId, gymId) {
  if (!gymId && docId === 'billing') return { gym_id: 'platform', doc_id: 'billing' }
  if (!gymId && docId === 'referralSettings') return { gym_id: 'platform', doc_id: 'referralSettings' }
  return { gym_id: gymId || DEFAULT_GYM_ID, doc_id: docId }
}

// â”€â”€ MEMBERS â”€â”€
async function supabaseAddMember(memberData) {
  const sb = await getSupabaseClient()
  const { referredBy, ...rest } = memberData
  delete rest.password
  const id = newUuid()
  const gymId = rest.gymId || DEFAULT_GYM_ID
  const trainerId = rest.trainerId ? await resolveId(rest.trainerId) : null
  const row = {
    id,
    legacy_id: id,
    gym_id: gymId,
    name: rest.name || '',
    email: rest.email || null,
    phone: rest.phone || null,
    contact: rest.contact || null,
    age: rest.age != null ? Number(rest.age) : null,
    weight: rest.weight != null ? Number(rest.weight) : null,
    height: rest.height != null ? Number(rest.height) : null,
    gender: rest.gender || null,
    plan: rest.plan || 'Monthly',
    plan_price: rest.planPrice != null ? Number(rest.planPrice) : null,
    amount_paid: Number(rest.amountPaid) || 0,
    balance_due: Number(rest.balanceDue) || 0,
    payment_status: rest.paymentStatus || 'Paid',
    status: rest.status || 'Active',
    checkins: Number(rest.checkins) || 0,
    trainer_id: trainerId,
    trainer_auth_uid: rest.trainerAuthUid || null,
    avatar: rest.avatar || null,
    color: rest.color || null,
    photo_url: rest.photoUrl || null,
    storage_path: rest.storagePath || null,
    expiry: rest.expiry || null,
    notes: rest.notes || null,
    join_date: rest.joinDate || null,
    referred_by: referredBy ? String(referredBy).trim().toUpperCase() : null,
    created_by: rest.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'members').insert(row).select('*').single()
  if (error) throw sbError(error)
  return { id: data.id, authUid: null }
}

async function supabaseUpdateMember(memberId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(memberId)
  const patch = {}
  const map = {
    name: 'name', email: 'email', phone: 'phone', contact: 'contact',
    gender: 'gender', plan: 'plan', status: 'status', avatar: 'avatar',
    color: 'color', photoUrl: 'photo_url', storagePath: 'storage_path',
    expiry: 'expiry', notes: 'notes', joinDate: 'join_date',
    referredBy: 'referred_by', paymentStatus: 'payment_status',
    trainerAuthUid: 'trainer_auth_uid',
  }
  for (const [k, col] of Object.entries(map)) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  for (const n of ['age', 'weight', 'height']) {
    if (updatedData[n] !== undefined) patch[n] = updatedData[n] == null ? null : Number(updatedData[n])
  }
  if (updatedData.amountPaid !== undefined) patch.amount_paid = Number(updatedData.amountPaid) || 0
  if (updatedData.balanceDue !== undefined) patch.balance_due = Number(updatedData.balanceDue) || 0
  if (updatedData.checkins !== undefined) patch.checkins = Number(updatedData.checkins) || 0
  if (updatedData.planPrice !== undefined) patch.plan_price = updatedData.planPrice == null ? null : Number(updatedData.planPrice)
  if (updatedData.trainerId !== undefined) patch.trainer_id = updatedData.trainerId ? await resolveId(updatedData.trainerId) : null
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'members').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeleteMember(memberId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(memberId)
  const { data: row, error: readErr } = await sbTable(sb, 'members').select('*').eq('id', id).maybeSingle()
  if (readErr) throw sbError(readErr)
  if (!row) return
  if (row.storage_path || row.photo_url) {
    try {
      const { deleteMemberPhoto } = await import('./storageService')
      await deleteMemberPhoto(row.storage_path || `members/${id}/profile.webp`)
    } catch { /* non-blocking: photo cleanup failure must not block member deletion */ }
  }
  // DB FKs cascade attendance/payments/progress_logs/diet_plans/workout_plans.
  // Notification cleanup is skipped (no delete policy in RLS) â€” documented.
  const { error } = await sbTable(sb, 'members').delete().eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseBackfillTrainerAuthUid(gymId) {
  if (!gymId) return 0
  const sb = await getSupabaseClient()
  let updated = 0
  try {
    let q = sbTable(sb, 'members').select('*').limit(2000)
    if (gymId) q = q.eq('gym_id', gymId)
    const { data: members, error: mErr } = await q
    if (mErr) throw mErr
    for (const m of members || []) {
      if (m.trainer_id && !m.trainer_auth_uid) {
        const { data: trainer, error: tErr } = await sbTable(sb, 'trainers').select('auth_uid').eq('id', m.trainer_id).maybeSingle()
        if (tErr) continue
        if (trainer?.auth_uid) {
          const { error } = await sbTable(sb, 'members').update({ trainer_auth_uid: trainer.auth_uid }).eq('id', m.id)
          if (!error) updated++
        }
      }
    }
  } catch (e) {
    console.error('[Supabase] backfillTrainerAuthUid error:', e)
  }
  return updated
}

// â”€â”€ TRAINERS â”€â”€
async function supabaseAddTrainer(trainerData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    legacy_id: id,
    gym_id: trainerData.gymId || DEFAULT_GYM_ID,
    name: trainerData.name || '',
    email: trainerData.email || null,
    phone: trainerData.phone || null,
    specialty: trainerData.specialty || null,
    rating: trainerData.rating != null ? Number(trainerData.rating) : null,
    clients: Number(trainerData.clients) || 0,
    bio: trainerData.bio || null,
    experience: trainerData.experience || null,
    avatar: trainerData.avatar || null,
    color: trainerData.color || null,
    created_by: trainerData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'trainers').insert(row).select('*').single()
  if (error) throw sbError(error)
  return { id: data.id, password: null }
}

async function supabaseUpdateTrainer(trainerId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(trainerId)
  const patch = {}
  for (const [k, col] of Object.entries({
    name: 'name', email: 'email', phone: 'phone', specialty: 'specialty',
    bio: 'bio', experience: 'experience', avatar: 'avatar', color: 'color',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  if (updatedData.rating !== undefined) patch.rating = updatedData.rating == null ? null : Number(updatedData.rating)
  if (updatedData.clients !== undefined) patch.clients = Number(updatedData.clients) || 0
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'trainers').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeleteTrainer(trainerId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(trainerId)
  const { data: row, error: readErr } = await sbTable(sb, 'trainers').select('*').eq('id', id).maybeSingle()
  if (readErr) throw sbError(readErr)
  if (!row) return
  if (row.name) {
    await Promise.allSettled([
      sbTable(sb, 'diet_plans').update({ assigned_trainer: null }).eq('gym_id', row.gym_id).eq('assigned_trainer', row.name),
      sbTable(sb, 'workout_plans').update({ trainer: null }).eq('gym_id', row.gym_id).eq('trainer', row.name),
    ])
  }
  // FK `on delete set null` clears member/attendance/progress trainer refs.
  const { error } = await sbTable(sb, 'trainers').delete().eq('id', id)
  if (error) throw sbError(error)
}

// â”€â”€ PAYMENTS â”€â”€
async function supabaseAddPayment(paymentData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const memberId = paymentData.memberId ? await resolveId(paymentData.memberId) : null
  const row = {
    id,
    payment_id: paymentData.paymentId || `PMT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    invoice_no: paymentData.invoiceNo || null,
    gym_id: paymentData.gymId || DEFAULT_GYM_ID,
    member_id: memberId,
    auth_uid: paymentData.authUid || null,
    member_name: paymentData.memberName || paymentData.member || null,
    amount: Number(paymentData.amount) || 0,
    paid: Number(paymentData.paid) || 0,
    status: paymentData.status || 'Pending',
    plan: paymentData.plan || 'Monthly',
    method: paymentData.method || null,
    date: paymentData.date || null,
    due: paymentData.due || null,
    transaction_id: paymentData.transactionId || null,
    payment_gateway: paymentData.paymentGateway || null,
    created_by: paymentData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'payments').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdatePayment(paymentId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(paymentId)
  const patch = {}
  for (const [k, col] of Object.entries({
    status: 'status', method: 'method', plan: 'plan', date: 'date', due: 'due',
    memberName: 'member_name', invoiceNo: 'invoice_no', transactionId: 'transaction_id',
    paymentGateway: 'payment_gateway',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  if (updatedData.amount !== undefined) patch.amount = Number(updatedData.amount) || 0
  if (updatedData.paid !== undefined) patch.paid = Number(updatedData.paid) || 0
  if (updatedData.memberId !== undefined) patch.member_id = updatedData.memberId ? await resolveId(updatedData.memberId) : null
  if (updatedData.authUid !== undefined) patch.auth_uid = updatedData.authUid || null
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'payments').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeletePayment(paymentId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(paymentId)
  const { error } = await sbTable(sb, 'payments').delete().eq('id', id)
  if (error) throw sbError(error)
}

// â”€â”€ PROGRESS LOGS â”€â”€
async function supabaseAddProgressLog(logData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const memberId = logData.memberId ? await resolveId(logData.memberId) : null
  const trainerId = logData.trainerId ? await resolveId(logData.trainerId) : null
  const row = {
    id,
    gym_id: logData.gymId || DEFAULT_GYM_ID,
    member_id: memberId,
    member_name: logData.memberName || null,
    auth_uid: logData.authUid || null,
    trainer_id: trainerId,
    trainer_name: logData.trainerName || null,
    weight: logData.weight != null ? Number(logData.weight) : null,
    body_fat: logData.bodyFat != null ? Number(logData.bodyFat) : null,
    bmi: logData.bmi != null ? Number(logData.bmi) : null,
    muscle: logData.muscle != null ? Number(logData.muscle) : null,
    bench: logData.bench != null ? Number(logData.bench) : null,
    squat: logData.squat != null ? Number(logData.squat) : null,
    deadlift: logData.deadlift != null ? Number(logData.deadlift) : null,
    notes: logData.notes || null,
    log_date: logData.logDate || new Date().toISOString().split('T')[0],
  }
  const { data, error } = await sbTable(sb, 'progress_logs').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdateProgressLog(logId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(logId)
  const patch = {}
  for (const [k, col] of Object.entries({
    memberName: 'member_name', trainerName: 'trainer_name', notes: 'notes', logDate: 'log_date',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  for (const [k, col] of Object.entries({
    weight: 'weight', bodyFat: 'body_fat', bmi: 'bmi', muscle: 'muscle',
    bench: 'bench', squat: 'squat', deadlift: 'deadlift',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : Number(updatedData[k])
  }
  if (updatedData.memberId !== undefined) patch.member_id = updatedData.memberId ? await resolveId(updatedData.memberId) : null
  if (updatedData.authUid !== undefined) patch.auth_uid = updatedData.authUid || null
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'progress_logs').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeleteProgressLog(logId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(logId)
  const { error } = await sbTable(sb, 'progress_logs').delete().eq('id', id)
  if (error) throw sbError(error)
}

// â”€â”€ PLANS â”€â”€
async function supabaseAddPlan(planData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    gym_id: planData.gymId || DEFAULT_GYM_ID,
    name: planData.name || 'Standard',
    price: planData.price != null ? Number(planData.price) : null,
    duration: planData.duration != null ? parseDurationToMinutes(planData.duration) : null,
    duration_days: planData.durationDays != null ? Number(planData.durationDays) : null,
    description: planData.description || null,
    active: planData.active !== undefined ? !!planData.active : true,
    sort_order: planData.order != null ? Number(planData.order) : 0,
  }
  const { data, error } = await sbTable(sb, 'plans').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdatePlan(planId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(planId)
  const patch = {}
  for (const [k, col] of Object.entries({
    name: 'name', description: 'description', durationDays: 'duration_days', order: 'sort_order',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  if (updatedData.price !== undefined) patch.price = updatedData.price == null ? null : Number(updatedData.price)
  if (updatedData.duration !== undefined) patch.duration = parseDurationToMinutes(updatedData.duration)
  if (updatedData.active !== undefined) patch.active = !!updatedData.active
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'plans').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeletePlan(planId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(planId)
  const { error } = await sbTable(sb, 'plans').delete().eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseMigrateDefaultPlans(gymId) {
  const sb = await getSupabaseClient()
  const targetGymId = gymId || DEFAULT_GYM_ID
  const { count, error: countErr } = await sbTable(sb, 'plans').select('*', { count: 'exact', head: true }).eq('gym_id', targetGymId)
  if (countErr) throw sbError(countErr)
  if (count > 0) return false
  const defaults = [
    { name: 'Trial', price: 499, duration: '7 Days', durationDays: 7, description: 'Short-term trial membership, no commitment', active: true, order: 1 },
    { name: 'Standard', price: 1499, duration: '1 Month', durationDays: 30, description: 'Regular monthly membership with full gym access', active: true, order: 2 },
    { name: 'Premium', price: 2999, duration: '1 Month', durationDays: 30, description: 'Premium with unlimited trainer access and perks', active: true, order: 3 },
    { name: 'Quarterly', price: 3999, duration: '3 Months', durationDays: 90, description: '3-month commitment with discounted rate', active: true, order: 4 },
    { name: 'Annual', price: 12999, duration: '12 Months', durationDays: 365, description: '12-month membership, best value for money', active: true, order: 5 },
    { name: 'Day Pass', price: 199, duration: '1 Day', durationDays: 1, description: 'Single-day access pass', active: true, order: 6 },
  ]
  const rows = defaults.map(p => ({
    id: newUuid(),
    gym_id: targetGymId,
    name: p.name,
    price: p.price,
    duration: parseDurationToMinutes(p.duration),
    duration_days: p.durationDays,
    description: p.description,
    active: p.active,
    sort_order: p.order,
  }))
  const { error } = await sbTable(sb, 'plans').insert(rows)
  if (error) throw sbError(error)
  return true
}

// â”€â”€ DIET / WORKOUT PLANS â”€â”€
async function supabaseAddDietPlan(planData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const memberId = planData.memberId ? await resolveId(planData.memberId) : null
  const row = {
    id,
    gym_id: planData.gymId || DEFAULT_GYM_ID,
    name: planData.name || 'Diet Plan',
    goal: planData.goal || null,
    calories: planData.calories != null ? Number(planData.calories) : null,
    protein: planData.protein != null ? Number(planData.protein) : null,
    carbs: planData.carbs != null ? Number(planData.carbs) : null,
    fat: planData.fat != null ? Number(planData.fat) : null,
    hydration: planData.hydration || null,
    meals: Array.isArray(planData.meals) ? planData.meals : [],
    member_id: memberId,
    auth_uid: planData.authUid || null,
    assigned_member: planData.assignedMember || null,
    assigned_trainer: planData.assignedTrainer || null,
    assigned_trainer_auth_uid: planData.assignedTrainerAuthUid || null,
    owner_type: planData.ownerType || null,
    owner_id: planData.ownerId || null,
    versions: [],
    created_by: planData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'diet_plans').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdateDietPlan(planId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(planId)
  const { data: prevRow, error: readErr } = await sbTable(sb, 'diet_plans').select('*').eq('id', id).maybeSingle()
  if (readErr) throw sbError(readErr)
  const prevData = prevRow ? mapDietPlanRow(prevRow) : null
  const versions = Array.isArray(prevData?.versions) ? prevData.versions.slice(0, 4) : []
  const snap = snapshotPlan(prevData)
  if (snap) versions.push(snap)
  const patch = {
    versions: versions.slice(-5),
  }
  for (const [k, col] of Object.entries({
    name: 'name', goal: 'goal', hydration: 'hydration',
    assignedMember: 'assigned_member', assignedTrainer: 'assigned_trainer',
    assignedTrainerAuthUid: 'assigned_trainer_auth_uid', ownerType: 'owner_type', ownerId: 'owner_id',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  for (const [k, col] of Object.entries({ calories: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat' })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : Number(updatedData[k])
  }
  if (updatedData.meals !== undefined) patch.meals = Array.isArray(updatedData.meals) ? updatedData.meals : []
  if (updatedData.memberId !== undefined) patch.member_id = updatedData.memberId ? await resolveId(updatedData.memberId) : null
  if (updatedData.authUid !== undefined) patch.auth_uid = updatedData.authUid || null
  const { error } = await sbTable(sb, 'diet_plans').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeleteDietPlan(planId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(planId)
  const { error } = await sbTable(sb, 'diet_plans').delete().eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseAddWorkoutPlan(planData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const memberId = planData.memberId ? await resolveId(planData.memberId) : null
  const row = {
    id,
    gym_id: planData.gymId || DEFAULT_GYM_ID,
    name: planData.name || 'Workout Plan',
    level: planData.level || null,
    days: planData.days != null ? Number(planData.days) : null,
    duration: planData.duration || null,
    split: planData.split || null,
    exercises: Array.isArray(planData.exercises) ? planData.exercises : [],
    member_id: memberId,
    auth_uid: planData.authUid || null,
    member: planData.member || null,
    assigned_trainer: planData.assignedTrainer || null,
    trainer: planData.trainer || null,
    trainer_auth_uid: planData.trainerAuthUid || null,
    owner_type: planData.ownerType || null,
    owner_id: planData.ownerId || null,
    versions: [],
    created_by: planData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'workout_plans').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdateWorkoutPlan(planId, updatedData) {
  const sb = await getSupabaseClient()
  const id = await resolveId(planId)
  const { data: prevRow, error: readErr } = await sbTable(sb, 'workout_plans').select('*').eq('id', id).maybeSingle()
  if (readErr) throw sbError(readErr)
  const prevData = prevRow ? mapWorkoutPlanRow(prevRow) : null
  const versions = Array.isArray(prevData?.versions) ? prevData.versions.slice(0, 4) : []
  const snap = snapshotPlan(prevData)
  if (snap) versions.push(snap)
  const patch = {
    versions: versions.slice(-5),
  }
  for (const [k, col] of Object.entries({
    name: 'name', level: 'level', duration: 'duration', split: 'split',
    member: 'member', assignedTrainer: 'assigned_trainer', trainer: 'trainer',
    trainerAuthUid: 'trainer_auth_uid', ownerType: 'owner_type', ownerId: 'owner_id',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  if (updatedData.days !== undefined) patch.days = updatedData.days == null ? null : Number(updatedData.days)
  if (updatedData.exercises !== undefined) patch.exercises = Array.isArray(updatedData.exercises) ? updatedData.exercises : []
  if (updatedData.memberId !== undefined) patch.member_id = updatedData.memberId ? await resolveId(updatedData.memberId) : null
  if (updatedData.authUid !== undefined) patch.auth_uid = updatedData.authUid || null
  const { error } = await sbTable(sb, 'workout_plans').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeleteWorkoutPlan(planId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(planId)
  const { error } = await sbTable(sb, 'workout_plans').delete().eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseBackfillOwnershipFields() {
  const sb = await getSupabaseClient()
  const { data: memberRows, error: mErr } = await sbTable(sb, 'members').select('*').limit(2000)
  if (mErr) throw sbError(mErr)
  const memberMap = {}
  for (const r of memberRows || []) memberMap[r.name] = { id: r.id, authUid: r.auth_uid }
  const results = { updated: 0, unmatched: 0, unmatchedNames: [] }

  const { data: dietRows, error: dErr } = await sbTable(sb, 'diet_plans').select('*').limit(2000)
  if (!dErr) {
    for (const r of dietRows || []) {
      if (r.member_id && r.auth_uid) continue
      const entry = memberMap[r.assigned_member]
      if (entry) {
        await sbTable(sb, 'diet_plans').update({ member_id: entry.id, auth_uid: entry.authUid }).eq('id', r.id)
        results.updated++
      } else if (r.assigned_member) {
        results.unmatched++
        results.unmatchedNames.push(`diet_plans/${r.id} â†’ "${r.assigned_member}"`)
      }
    }
  }

  const { data: workoutRows, error: wErr } = await sbTable(sb, 'workout_plans').select('*').limit(2000)
  if (!wErr) {
    for (const r of workoutRows || []) {
      if (r.member_id && r.auth_uid) continue
      const entry = memberMap[r.member]
      if (entry) {
        await sbTable(sb, 'workout_plans').update({ member_id: entry.id, auth_uid: entry.authUid }).eq('id', r.id)
        results.updated++
      } else if (r.member) {
        results.unmatched++
        results.unmatchedNames.push(`workout_plans/${r.id} â†’ "${r.member}"`)
      }
    }
  }

  return results
}

// â”€â”€ GYMS â”€â”€
async function supabaseAddGym(gymData, ownerUid) {
  const sb = await getSupabaseClient()
  const id = gymData.id || newUuid()
  const row = {
    id,
    gym_name: gymData.gymName || gymData.name || id,
    owner_name: gymData.ownerName || null,
    email: gymData.email || null,
    phone: gymData.phone || null,
    owner_uid: ownerUid || null,
    status: gymData.status || null,
    approval_status: 'pending',
    documents: gymData.documents || {},
    subscription: gymData.subscription || {},
  }
  const { data, error } = await sbTable(sb, 'gyms').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdateGym(gymId, updatedData) {
  const sb = await getSupabaseClient()
  const patch = {}
  for (const [k, col] of Object.entries({
    gymName: 'gym_name', ownerName: 'owner_name', email: 'email', phone: 'phone',
    ownerUid: 'owner_uid', status: 'status', rejectedReason: 'rejected_reason',
    approvalStatus: 'approval_status', documents: 'documents', subscription: 'subscription',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  const subPatch = {}
  for (const [k, v] of Object.entries(updatedData)) {
    if (k.startsWith('subscription.')) subPatch[k.slice('subscription.'.length)] = v
  }
  if (Object.keys(subPatch).length) {
    // Dot-path semantics merge into the EXISTING jsonb — a bare replace would
    // wipe plan/status/expiry fields set by other writers (Firebase parity).
    let current = patch.subscription
    if (!current && !('subscription' in patch)) {
      const { data: gym, error: readErr } = await sbTable(sb, 'gyms')
        .select('subscription')
        .eq('id', gymId)
        .maybeSingle()
      if (readErr) throw sbError(readErr)
      current = (gym && gym.subscription) || {}
    }
    patch.subscription = { ...(current || {}), ...subPatch }
  }
  for (const [k, col] of Object.entries({ approvalReviewedAt: 'approval_reviewed_at', approvedAt: 'approved_at' })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] || null
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'gyms').update(patch).eq('id', gymId)
  if (error) throw sbError(error)
}

async function supabaseDeleteGym(gymId) {
  const sb = await getSupabaseClient()
  const { error } = await sbTable(sb, 'gyms').delete().eq('id', gymId)
  if (error) throw sbError(error)
}

// â”€â”€ SUBSCRIPTIONS â”€â”€
async function supabaseAddSubscription(subData, billingSettings) {
  const sb = await getSupabaseClient()
  const billing = billingSettings || await supabaseGetGlobalBilling()
  const baseAmount = calculateSubscriptionAmount(subData.plan || 'Standard', billing)
  const discount = applyDiscount(baseAmount, subData.discountType, subData.discountValue)
  const dates = calculateSubscriptionDates(subData.plan || 'Standard', billing)
  const id = newUuid()
  const row = {
    id,
    gym_id: subData.gymId || 'default',
    plan: subData.plan || 'Standard',
    plan_name: subData.planName || null,
    plan_type: subData.plan || 'Standard',
    amount: subData.amount != null ? Number(subData.amount) : Number(discount.finalAmount) || 0,
    currency: subData.currency || subData.paymentCurrency || (billing?.currency || 'INR'),
    status: subData.status || 'trial',
    payment_status: subData.paymentStatus || 'pending',
    payment_method: subData.paymentMethod || 'Not Set',
    transaction_id: subData.transactionId || null,
    paid_at: subData.paidAt || ((subData.paymentStatus === 'paid' || subData.status === 'active') ? new Date().toISOString() : null),
    expiry_date: dates.expiryDate || null,
    started_at: dates.startDate ? new Date(dates.startDate + 'T00:00:00').toISOString() : null,
    cancelled_at: subData.cancelledAt || null,
    license_key: subData.licenseKey || null,
    pending_payment_type: subData.pendingPaymentType || null,
    created_by: subData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'subscriptions').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdateSubscription(subId, updatedData, billingSettings) {
  const sb = await getSupabaseClient()
  const id = await resolveId(subId)
  const patch = {}
  for (const [k, col] of Object.entries({
    plan: 'plan', planName: 'plan_name', planType: 'plan_type', currency: 'currency',
    status: 'status', paymentStatus: 'payment_status', paymentMethod: 'payment_method',
    transactionId: 'transaction_id', licenseKey: 'license_key', pendingPaymentType: 'pending_payment_type',
    cancelledAt: 'cancelled_at',
  })) {
    if (updatedData[k] !== undefined) patch[col] = updatedData[k] == null ? null : updatedData[k]
  }
  if (updatedData.amount !== undefined) patch.amount = updatedData.amount == null ? null : Number(updatedData.amount)
  if (updatedData.paidAt !== undefined) patch.paid_at = updatedData.paidAt || new Date().toISOString()
  if (updatedData.expiryDate !== undefined) patch.expiry_date = updatedData.expiryDate || null
  if (updatedData.startedAt !== undefined) patch.started_at = updatedData.startedAt || null

  if (updatedData.plan) {
    const { data: existing, error: readErr } = await sbTable(sb, 'subscriptions').select('*').eq('id', id).maybeSingle()
    if (readErr) throw sbError(readErr)
    const planChanged = existing?.plan !== updatedData.plan
    if (planChanged) {
      const billing = billingSettings || await supabaseGetGlobalBilling()
      const plan = updatedData.plan
      const dates = calculateSubscriptionDates(plan, billing)
      patch.expiry_date = dates.expiryDate
      if (dates.startDate) patch.started_at = new Date(dates.startDate + 'T00:00:00').toISOString()
      const baseAmount = calculateSubscriptionAmount(plan, billing)
      const discount = applyDiscount(baseAmount, updatedData.discountType, updatedData.discountValue)
      if (updatedData.amount == null) patch.amount = Number(discount.finalAmount) || 0
      if (patch.status === 'trial') {
        patch.status = 'active'
        patch.payment_status = 'paid'
        patch.paid_at = new Date().toISOString()
      }
    }
  }
  if (updatedData.paymentStatus === 'paid' && !patch.paid_at) {
    patch.paid_at = new Date().toISOString()
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'subscriptions').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseDeleteSubscription(subId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(subId)
  const { error } = await sbTable(sb, 'subscriptions').delete().eq('id', id)
  if (error) throw sbError(error)
}

async function supabaseGetSubscriptionByGymId(gymId) {
  const sb = await getSupabaseClient()
  const { data, error } = await sbTable(sb, 'subscriptions').select('*').eq('gym_id', gymId).limit(1).maybeSingle()
  if (error && error.code !== 'PGRST116') throw sbError(error)
  return data ? mapSubscriptionRow(data) : null
}

async function supabaseGetSubscriptionById(id) {
  if (!id) return null
  const sb = await getSupabaseClient()
  const resolved = await resolveId(id)
  const { data, error } = await sbTable(sb, 'subscriptions').select('*').eq('id', resolved).maybeSingle()
  if (error && error.code !== 'PGRST116') throw sbError(error)
  return data ? mapSubscriptionRow(data) : null
}

async function supabaseMigrateSubscriptions() {
  const sb = await getSupabaseClient()
  const { data: rows, error: readErr } = await sbTable(sb, 'subscriptions').select('*').limit(500)
  if (readErr) throw sbError(readErr)
  let migrated = 0
  for (const r of rows || []) {
    const data = mapSubscriptionRow(r)
    const needs = {}
    if (!data.planType) needs.plan_type = data.plan || 'Standard'
    if (!data.status) needs.status = 'active'
    if (!data.expiryDate) {
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + 30)
      needs.expiry_date = expiry.toISOString().split('T')[0]
    }
    if (!data.paymentStatus) needs.payment_status = data.status === 'active' ? 'paid' : 'pending'
    if (!data.paymentMethod) needs.payment_method = 'Not Set'
    if (data.amount == null) needs.amount = calculateSubscriptionAmount(data.planType || data.plan || 'Standard')
    if (!data.paidAt && (data.paymentStatus === 'paid' || data.status === 'active')) needs.paid_at = new Date().toISOString()
    if (Object.keys(needs).length > 0) {
      const { error } = await sbTable(sb, 'subscriptions').update(needs).eq('id', r.id)
      if (!error) migrated++
    }
  }
  return { migrated, total: (rows || []).length }
}

// â”€â”€ SETTINGS â”€â”€
async function supabaseGetSettings(docId = 'gym', gymId) {
  const sb = await getSupabaseClient()
  const key = settingsKey(docId, gymId)
  const { data, error } = await sbTable(sb, 'settings').select('*').eq('gym_id', key.gym_id).eq('doc_id', key.doc_id).maybeSingle()
  if (error && error.code !== 'PGRST116') throw sbError(error)
  return data ? data.data : null
}

async function supabaseSaveSettings(docId = 'gym', data, gymId) {
  const sb = await getSupabaseClient()
  const key = settingsKey(docId, gymId)
  const { data: existing, error: readErr } = await sbTable(sb, 'settings').select('*').eq('gym_id', key.gym_id).eq('doc_id', key.doc_id).maybeSingle()
  if (readErr && readErr.code !== 'PGRST116') throw sbError(readErr)
  const merged = { ...(existing?.data || {}), ...data }
  if (existing) {
    const { error } = await sbTable(sb, 'settings').update({ data: merged }).eq('gym_id', key.gym_id).eq('doc_id', key.doc_id)
    if (error) throw sbError(error)
  } else {
    const { error } = await sbTable(sb, 'settings').insert({ gym_id: key.gym_id, doc_id: key.doc_id, data: merged })
    if (error) throw sbError(error)
  }
}

async function supabaseGetGlobalBilling() {
  return supabaseGetSettings('billing')
}

// â”€â”€ SUPPORT / FEATURE / CONTACT â”€â”€
async function supabaseAddSupportTicket(ticketData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    gym_id: ticketData.gymId || DEFAULT_GYM_ID,
    name: ticketData.name || null,
    email: ticketData.email || null,
    category: ticketData.category || null,
    subject: ticketData.subject || null,
    message: ticketData.message || null,
    status: ticketData.status || 'Open',
    priority: ticketData.priority || null,
    created_by: ticketData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'support_tickets').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseAddFeatureRequest(requestData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    gym_id: requestData.gymId || DEFAULT_GYM_ID,
    title: requestData.title || null,
    description: requestData.description || null,
    category: requestData.category || null,
    status: requestData.status || 'Under Review',
    votes: Number(requestData.votes) || 0,
    created_by: requestData.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'feature_requests').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseAddContactMessage(msgData) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    name: msgData.name || null,
    email: msgData.email || null,
    message: msgData.message || null,
    status: 'New',
  }
  const { data, error } = await sbTable(sb, 'contact_messages').insert(row).select('*').single()
  if (error) throw sbError(error)
  const contactId = data.id
  try {
    // Notification side-write (super-admin target) â€” best effort.
    // notifications.user_id is a NOT-NULL FK to profiles(firebase_uid), so this
    // only works for an authenticated session (never for anonymous visitors).
    const { data } = await sb.auth.getSession()
    const actorUid = data?.session?.user?.id ? data.session.user.id : null
    if (actorUid) {
      const { error: nErr } = await sbTable(sb, 'notifications').insert({
        user_id: actorUid,
        gym_id: 'platform',
        role: 'super_admin',
        title: 'New Contact Message',
        message: `${msgData.name || 'Someone'} submitted a contact enquiry.`,
        type: 'contact',
        subtype: 'contact_message',
        priority: 'normal',
        icon: 'âœ‰ï¸',
        target_role: 'super_admin',
        page: 'support',
        tab: 'messages',
        contact_id: contactId,
        action_url: '/support?tab=messages',
        related_document_id: contactId,
        read: false,
      })
      if (nErr) console.warn('[Supabase] contact notification skipped:', nErr.message)
    }
  } catch (e) {
    console.warn('[Supabase] Failed to create notification for contact message:', e.message || e)
  }
  return contactId
}

async function supabaseUpdateContactMessage(msgId, data) {
  const sb = await getSupabaseClient()
  const id = await resolveId(msgId)
  const patch = {}
  for (const [k, col] of Object.entries({ status: 'status', name: 'name', email: 'email', message: 'message' })) {
    if (data[k] !== undefined) patch[col] = data[k] == null ? null : data[k]
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await sbTable(sb, 'contact_messages').update(patch).eq('id', id)
  if (error) throw sbError(error)
}

// â”€â”€ PLAN TEMPLATES â”€â”€
async function supabaseSavePlanTemplate({ type, name, plan, gymId }) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    gym_id: gymId || DEFAULT_GYM_ID,
    type: type || null,
    name: name || null,
    plan: plan || {},
  }
  const { data, error } = await sbTable(sb, 'plan_templates').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseListPlanTemplates(type, gymId) {
  const sb = await getSupabaseClient()
  let q = sbTable(sb, 'plan_templates').select('*').limit(200)
  if (type) q = q.eq('type', type)
  if (gymId) q = q.eq('gym_id', gymId)
  const { data, error } = await q
  if (error) throw sbError(error)
  return (data || []).map(r => ({
    id: r.id,
    gymId: r.gym_id,
    type: r.type || '',
    name: r.name || '',
    plan: r.plan || {},
    createdAt: r.created_at || '',
  }))
}

async function supabaseDeletePlanTemplate(templateId) {
  const sb = await getSupabaseClient()
  const id = await resolveId(templateId)
  const { error } = await sbTable(sb, 'plan_templates').delete().eq('id', id)
  if (error) throw sbError(error)
}

// â”€â”€ WHATSAPP â”€â”€
async function supabaseAddWhatsappLog(record) {
  const sb = await getSupabaseClient()
  const memberId = record.memberId ? await resolveId(record.memberId) : null
  const campaignId = record.campaignId ? await resolveId(record.campaignId) : null
  const row = {
    gym_id: record.gymId || DEFAULT_GYM_ID,
    member_id: memberId,
    phone: String(record.phone || ''),
    template: String(record.template || ''),
    provider: String(record.provider || 'mock'),
    status: String(record.status || 'Queued'),
    attempts: Number(record.attempts) || 0,
    error: String(record.error || ''),
    entry_id: String(record.entryId || ''),
    campaign_id: campaignId,
    test: Boolean(record.test),
    sent_at: record.sentAt || null,
  }
  const { error } = await sbTable(sb, 'whatsapp_logs').insert(row)
  if (error) throw sbError(error)
}

async function supabaseGetWhatsAppAutomationConfig(gymId) {
  try {
    return await supabaseGetSettings('whatsapp', gymId || DEFAULT_GYM_ID)
  } catch {
    return null
  }
}

async function supabaseSaveWhatsAppAutomationConfig(gymId, config) {
  await supabaseSaveSettings('whatsapp', config, gymId || DEFAULT_GYM_ID)
}

async function supabaseListWhatsappCampaigns(gymId, limitN = 200) {
  const sb = await getSupabaseClient()
  try {
    let q = sbTable(sb, 'whatsapp_campaigns').select('*').order('created_at', { ascending: false }).limit(limitN)
    if (gymId) q = q.eq('gym_id', gymId)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(mapCampaignRow)
  } catch (err) {
    console.error('listWhatsappCampaigns error:', err)
    return []
  }
}

async function supabaseCreateWhatsappCampaign(campaign) {
  const sb = await getSupabaseClient()
  const id = newUuid()
  const row = {
    id,
    gym_id: campaign.gymId || DEFAULT_GYM_ID,
    name: campaign.name || 'Campaign',
    body: campaign.body || '',
    audience: campaign.audience || {},
    schedule: campaign.schedule || {},
    status: campaign.status || 'Draft',
    stats: campaign.stats || { sent: 0, failed: 0, pending: 0, cancelled: 0, total: 0 },
    next_run_at: campaign.nextRunAt || null,
    created_by: campaign.createdBy || null,
  }
  const { data, error } = await sbTable(sb, 'whatsapp_campaigns').insert(row).select('*').single()
  if (error) throw sbError(error)
  return data.id
}

async function supabaseUpdateWhatsappCampaign(id, patch) {
  const sb = await getSupabaseClient()
  const cid = await resolveId(id)
  const row = {}
  for (const [k, col] of Object.entries({
    name: 'name', body: 'body', audience: 'audience', schedule: 'schedule',
    status: 'status', stats: 'stats', nextRunAt: 'next_run_at',
  })) {
    if (patch[k] !== undefined) row[col] = patch[k] == null ? null : patch[k]
  }
  if (Object.keys(row).length === 0) return
  const { error } = await sbTable(sb, 'whatsapp_campaigns').update(row).eq('id', cid)
  if (error) throw sbError(error)
}

async function supabaseBumpWhatsappCampaignStats(id, delta) {
  const sb = await getSupabaseClient()
  const cid = await resolveId(id)
  const { error } = await sb.rpc('bump_campaign_stat', {
    p_campaign_id: cid,
    p_field: delta.field,
    p_by: delta.by || 1,
  })
  if (error) throw sbError(error)
}

async function supabaseDeleteWhatsappCampaign(id) {
  const sb = await getSupabaseClient()
  const cid = await resolveId(id)
  const { error } = await sbTable(sb, 'whatsapp_campaigns').delete().eq('id', cid)
  if (error) throw sbError(error)
}