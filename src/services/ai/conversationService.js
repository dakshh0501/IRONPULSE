// src/services/ai/conversationService.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Persistent conversation manager (Sprint 79C).
//
// Turns the assistant from a session-only chat into a persistent
// one that survives refreshes, logout/login and device switches.
//
// Firestore layout:
//   aiConversations/{convId}                  ← one doc per chat
//     { id, gymId, userId, role, title,
//       createdAt, updatedAt, pinned, archived,
//       deleted, lastMessage, messageCount }
//     subcollection messages/{messageId}
//       { id, role, content, createdAt, metadata }
//
// Security is enforced in firestore.rules: a conversation and its
// messages are ONLY readable/writable by the owning auth UID.
// Gym admins / trainers can never read member chats.
//
// Performance:
//   • subscribeConversationList  → ONE realtime listener,
//     limit 30, ordered by updatedAt desc (load-more on demand)
//   • subscribeConversationMessages → realtime listener ONLY for
//     the currently open conversation (limit 500).
//   • message text search runs client-side over loaded docs +
//     an on-demand message cache (no collection-group query).
// ─────────────────────────────────────────────────────────────

import { subscribeRealtime } from '../realtimeService'

// Supabase ai_conversations row → Firestore-shaped conversation
function mapConversationRow(r) {
  return {
    id: r.id,
    userId: r.user_id || '',
    gymId: r.gym_id || '',
    role: r.role || '',
    title: r.title || '',
    pinned: Boolean(r.pinned),
    archived: Boolean(r.archived),
    deleted: Boolean(r.deleted),
    deletedAt: r.deleted_at || null,
    lastMessage: r.last_message || '',
    messageCount: Number(r.message_count) || 0,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

// Supabase ai_conversation_messages row → Firestore-shaped message
function mapConversationMessageRow(r) {
  return {
    id: r.id,
    conversationId: r.conversation_id || '',
    role: r.role || 'user',
    content: r.content || '',
    metadata: r.metadata || {},
    createdAt: r.created_at || null,
  }
}

/**
 * Recursively strips `undefined` from an object so it is always safe
 * to pass to addDoc/updateDoc/setDoc. Firestore rejects `undefined`
 * with "Unsupported field value", so EVERY conversation/message write
 * must run through this helper (Sprint 80B).
 *
 * Rules:
 *   • undefined      → dropped (missing keys, filtered array items)
 *   • null / false / 0 / "" / NaN → preserved exactly
 *   • arrays         → recursed, undefined items filtered out
 *   • Date and Firestore class instances (Timestamp, GeoPoint,
 *     DocumentReference, serverTimestamp()/increment() sentinels)
 *     → passed through untouched (detected via non-plain constructor)
 *   • plain objects  → recursed, `undefined` members removed
 *
 * The original object is NEVER mutated — a new tree is returned.
 */
export function sanitizeFirestoreData(value) {
  if (value === null || value === undefined || typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (Array.isArray(value)) {
    const out = []
    for (const item of value) {
      const clean = sanitizeFirestoreData(item)
      if (clean !== undefined) out.push(clean)
    }
    return out
  }
  if (value.constructor !== Object) return value
  const out = {}
  for (const key of Object.keys(value)) {
    const clean = sanitizeFirestoreData(value[key])
    if (clean !== undefined) out[key] = clean
  }
  return out
}

export const CONVERSATIONS_COLLECTION = 'aiConversations'
export const MESSAGES_SUBCOLLECTION = 'messages'

export const LIST_PAGE_SIZE = 30
export const MESSAGES_LIMIT = 500
export const GEMINI_HISTORY_TURNS = 20
export const MAX_PINNED = 10

/* ══════════════════════════════════════════════════════════
   TITLES — auto-generated from the first user prompt
   ══════════════════════════════════════════════════════════ */

const TITLE_RULES = [
  { re: /\brevenue\b/i,          title: 'Revenue Report' },
  { re: /\bwork ?out\b/i,        title: 'Workout Plan' },
  { re: /\bdiet\b|\bmeal\b|\bnutrition\b|\bfood\b/, title: 'Diet Suggestion' },
  { re: /\bpayments?\b|\binvoice\b|\bdu(e|es)\b/,   title: 'Payments' },
  { re: /\battendance\b|\bcheck[ -]?ins?\b/,        title: 'Attendance' },
  { re: /\bmembers?\b|\bclient\b/,                  title: 'Members' },
  { re: /\btrainers?\b/,                            title: 'Trainers' },
  { re: /\breport\b|\bexport\b/,                    title: 'Report' },
  { re: /\bprogress\b|\bweight\b|\bbmi\b|\bfat\b/,  title: 'Progress' },
  { re: /\breferral\b|\brewards?\b/,                title: 'Referral' },
  { re: /\bsubscription\b|\bplan\b/,                title: 'Subscription' },
  { re: /\bnotifications?\b/,                       title: 'Notifications' },
  { re: /^\s*(hi|hello|hey|yo)\b/i,                 title: 'Greeting' },
  { re: /what can you do|help\b/,                   title: 'Assistant Help' },
]

/**
 * Derives a short, human title from the first user prompt.
 * Falls back to a truncated snippet of the prompt itself.
 */
export function autoTitleFor(prompt) {
  const text = String(prompt || '').trim()
  if (!text) return 'New conversation'
  for (const rule of TITLE_RULES) {
    if (rule.re.test(text)) return rule.title
  }
  const clean = text.replace(/\s+/g, ' ').replace(/[?¿!.]+$/, '')
  return clean.length > 48 ? clean.slice(0, 48).trim() + '…' : (clean || 'New conversation')
}

/* ══════════════════════════════════════════════════════════
   CONVERSATION CRUD
   ══════════════════════════════════════════════════════════ */

/**
 * Creates a new conversation. Returns { id, ...dataWithoutTimestamps }.
 */
export async function createConversation({ gymId, userId, role, title }) {
  return supabaseCreateConversation({ gymId, userId, role, title })
}

/** Lightweight meta updates accepted on a conversation doc. */
export async function updateConversation(conversationId, data) {
  if (!conversationId) throw new Error('Missing conversation id')
  return supabaseUpdateConversation(conversationId, data)
}

export function renameConversation(conversationId, title) {
  const clean = String(title || '').trim()
  if (!clean) throw new Error('Title cannot be empty')
  return updateConversation(conversationId, { title: clean.slice(0, 80) })
}

export function togglePinConversation(conversationId, pinned) {
  return updateConversation(conversationId, { pinned: Boolean(pinned) })
}

export function setConversationArchived(conversationId, archived) {
  return updateConversation(conversationId, { archived: Boolean(archived) })
}

/**
 * SOFT DELETE ONLY — flips `deleted: true`. No permanent delete
 * exists anywhere: no service function, no UI action, and the
 * Firestore rules outright deny `delete`.
 */
export function softDeleteConversation(conversationId) {
  return updateConversation(conversationId, {
    deleted: true,
    deletedAt: new Date().toISOString(),
  })
}

/* ══════════════════════════════════════════════════════════
   CONVERSATION LIST — ONE realtime listener, limit 30
   ══════════════════════════════════════════════════════════ */

/**
 * Realtime subscription to the user's conversations, most recently
 * active first. Soft-deleted chats are filtered server-side.
 */
export function subscribeToConversations(userId, callback, onError, pageSize = LIST_PAGE_SIZE) {
  if (!userId) return () => {}
  return subscribeRealtime({
      table: 'ai_conversations',
      filter: [['user_id', userId], ['deleted', false]],
      orderBy: { column: 'updated_at', ascending: false },
      limit: pageSize,
      mapRow: mapConversationRow,
      onChange: callback,
      onError: (e) => {
        console.error('[Supabase] aiConversations realtime error:', e.message)
        if (onError) onError(e, 'aiConversations')
      },
      label: 'aiConversations',
    })
}

/** Loads the next page of older conversations (manual load-more). */
export async function loadMoreConversations(userId, beforeSnapshot, pageSize = LIST_PAGE_SIZE) {
  if (!userId) return { items: [], hasMore: false }
  return supabaseLoadMoreConversations(userId, beforeSnapshot, pageSize)
}

/* ══════════════════════════════════════════════════════════
   MESSAGES (realtime listener — active conversation ONLY)
   ══════════════════════════════════════════════════════════ */

/** Realtime subscription to one conversation's messages. */
export function subscribeConversationMessages(conversationId, callback, onError) {
  if (!conversationId) return () => {}
  return subscribeRealtime({
      table: 'ai_conversation_messages',
      filter: [['conversation_id', conversationId]],
      orderBy: { column: 'created_at', ascending: true },
      limit: MESSAGES_LIMIT,
      mapRow: mapConversationMessageRow,
      onChange: callback,
      onError: (e) => {
        console.error('[Supabase] aiMessages realtime error:', e.message)
        if (onError) onError(e, 'aiMessages')
      },
      label: 'aiMessages',
    })
}

/**
 * Adds a message to a conversation. Returns the created doc id
 * immediately (Firestore client-side ids) so callers can optimistically
 * render the bubble before the snapshot arrives.
 */
export async function addConversationMessage(conversationId, { role, content, metadata }) {
  return supabaseAddConversationMessage(conversationId, { role, content, metadata })
}

/** One-shot message read — used by the on-demand search cache. */
export async function fetchConversationMessages(conversationId, max = 500) {
  if (!conversationId) return []
  return supabaseFetchConversationMessages(conversationId, max)
}

/* ══════════════════════════════════════════════════════════
   SEARCH — title + message text (client-side over limited data)
   ══════════════════════════════════════════════════════════ */

/**
 * Case-insensitive substring search across every loaded conversation
 * (title + lastMessage preview). `messagesByConv` is the caller's
 * per-conversation message cache (plain text contents) — when
 * provided, message text is searched as well.
 *
 * Returns matches sorted by score (title hit > preview hit > body hit),
 * then by updatedAt desc.
 */
export function searchConversations(term, conversations, messagesByConv = {}) {
  const t = String(term || '').trim().toLowerCase()
  if (!t || t.length < 2) return []

  const scored = []
  for (const conv of conversations || []) {
    const title = String(conv.title || '').toLowerCase()
    const last = String(conv.lastMessage || '').toLowerCase()
    const body = (messagesByConv[conv.id] || [])
      .map(c => String(c || '').toLowerCase())
      .join(' ')

    let score = 0
    if (title.includes(t)) score = 3
    else if (last.includes(t)) score = 2
    else if (body.includes(t)) score = 1
    if (score === 0) continue

    scored.push({ conv, score, title, last })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (tsOf(b.conv.updatedAt) || 0) - (tsOf(a.conv.updatedAt) || 0)
  })
  return scored.map(s => s.conv)
}

/* ══════════════════════════════════════════════════════════
   PROVIDER CONTEXT — last N turns + auto summary
   ══════════════════════════════════════════════════════════ */

/**
 * Builds the provider context for a conversation:
 *   • summary — one-line digest of messages older than the last 20
 *     (auto-generated locally, hard-capped, never near token limits)
 *   • recent  — last 20 messages (role + text), ready for Gemini
 *
 * The last-sent history stays safely under any model's context
 * window; the summary is a plain truncated replay of the first few
 * user questions, framed explicitly as a summary.
 */
export function buildProviderHistory(messages) {
  const clean = (messages || []).filter(m => m && typeof m.text === 'string' && m.text.trim())
  if (clean.length === 0) return { summary: null, recent: [] }

  if (clean.length <= GEMINI_HISTORY_TURNS) {
    return { summary: null, recent: clean.map(m => ({ role: m.role, text: m.text })) }
  }

  const recent = clean.slice(-GEMINI_HISTORY_TURNS).map(m => ({ role: m.role, text: m.text }))
  const older = clean.slice(0, -GEMINI_HISTORY_TURNS)

  // Deterministic auto-summary: first few turns + count. Capped so it
  // can never approach model limits.
  const sample = older
    .slice(0, 4)
    .map(m => (m.role === 'user' ? 'asked' : 'Pulse answered') +
      ` "${String(m.text).replace(/\s+/g, ' ').slice(0, 110)}"`)
    .join('; ')
  const summary =
    `[Earlier part of this conversation (${older.length} messages before the last 20): ` +
    `${sample}]` +
    ' Continue naturally from the last 20 messages. Do not treat this summary as a new question.'
  return { summary, recent }
}

/* ══════════════════════════════════════════════════════════
   SHARED HELPERS
   ══════════════════════════════════════════════════════════ */

export function tsToMs(value) {
  if (!value) return 0
  if (value.seconds != null) return value.seconds * 1000
  if (value instanceof Date) return value.getTime()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function tsOf(value) {
  return tsToMs(value)
}

export function formatTimeString(value) {
  if (!value) return ''
  return new Date(tsToMs(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ============================================================================
// SUPABASE DATA PLANE (Step 8E)
// ============================================================================
let _supabaseClient = null
async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient
  const m = await import('../../lib/supabase')
  _supabaseClient = m.supabase
  return _supabaseClient
}

function mapSupabaseError(err, fallbackMsg) {
  const msg = (err && (err.message || err.details || err.hint)) || String(err || fallbackMsg || 'Supabase error')
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

function nowIso() {
  return new Date().toISOString()
}

// Only conversation metadata fields are mapped (snake_case); anything else
// in `data` (e.g. Firestore FieldValue sentinels) is ignored.
const CONV_FIELD_MAP = {
  title: 'title',
  pinned: 'pinned',
  archived: 'archived',
  deleted: 'deleted',
  deletedAt: 'deleted_at',
  lastMessage: 'last_message',
  messageCount: 'message_count',
}

async function supabaseCreateConversation({ gymId, userId, role, title }) {
  const client = await getSupabaseClient()
  const now = nowIso()
  // 'default' is the Firestore-era tenant sentinel; the supabase gyms table has
  // no such row and all existing ai_conversations rows are NULL (platform-
  // scoped). Map it to NULL so the gym_id FK is satisfied for gym-less users
  // (super admin). Real gym ids pass through unchanged.
  const resolvedGymId = gymId && gymId !== 'default' ? gymId : null
  const { data: row, error } = await client.from('ai_conversations').insert({
    gym_id: resolvedGymId,
    user_id: userId,
    role: role || 'gym_admin',
    title: title || 'New conversation',
    created_at: now,
    updated_at: now,
    pinned: false,
    archived: false,
    deleted: false,
    last_message: '',
    message_count: 0,
  }).select('id').single()
  if (error) throw mapSupabaseError(error, 'Failed to create conversation')
  return {
    id: row.id,
    gymId: resolvedGymId,
    userId,
    role: role || 'gym_admin',
    title: title || 'New conversation',
    pinned: false,
    archived: false,
    deleted: false,
    lastMessage: '',
    messageCount: 0,
  }
}

async function supabaseUpdateConversation(conversationId, data) {
  const client = await getSupabaseClient()
  const patch = {}
  for (const [key, col] of Object.entries(CONV_FIELD_MAP)) {
    if (data[key] !== undefined) patch[col] = data[key]
  }
  // ChatPanel bumps messageCount with a numeric delta — resolve it to a
  // read-then-set increment (single-user conversation; benign).
  if (data.messageCount && typeof data.messageCount === 'number') {
    const { data: conv, error: readErr } = await client
      .from('ai_conversations')
      .select('message_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (readErr) throw mapSupabaseError(readErr, 'Failed to update conversation')
    patch.message_count = (Number((conv && conv.message_count) || 0) || 0) + data.messageCount
  }
  patch.updated_at = nowIso()
  const { error } = await client.from('ai_conversations').update(patch).eq('id', conversationId)
  if (error) throw mapSupabaseError(error, 'Failed to update conversation')
}

async function supabaseLoadMoreConversations(userId, beforeSnapshot, pageSize) {
  const offset = typeof beforeSnapshot === 'number' ? beforeSnapshot : 0
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('updated_at', { ascending: false })
    .range(offset, offset + pageSize - 1)
  if (error) throw mapSupabaseError(error, 'Failed to load conversations')
  return {
    items: (data || []).map(mapConversationRow),
    hasMore: (data || []).length === pageSize,
  }
}

async function supabaseAddConversationMessage(conversationId, { role, content, metadata }) {
  const client = await getSupabaseClient()
  const { data: row, error } = await client.from('ai_conversation_messages').insert({
    conversation_id: conversationId,
    role: role === 'assistant' ? 'assistant' : 'user',
    content: String(content || '').slice(0, 8000),
    created_at: nowIso(),
    metadata: metadata || {},
  }).select('id').single()
  if (error) throw mapSupabaseError(error, 'Failed to add message')
  return row.id
}

async function supabaseFetchConversationMessages(conversationId, max) {
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('ai_conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(max)
  if (error) throw mapSupabaseError(error, 'Failed to load messages')
  return (data || []).map(mapConversationMessageRow)
}

export default {
  CONVERSATIONS_COLLECTION,
  LIST_PAGE_SIZE,
  MESSAGES_LIMIT,
  GEMINI_HISTORY_TURNS,
  MAX_PINNED,
  autoTitleFor,
  createConversation,
  updateConversation,
  renameConversation,
  togglePinConversation,
  setConversationArchived,
  softDeleteConversation,
  subscribeToConversations,
  loadMoreConversations,
  subscribeConversationMessages,
  addConversationMessage,
  fetchConversationMessages,
  searchConversations,
  buildProviderHistory,
  sanitizeFirestoreData,
  formatTimeString,
  tsToMs,
}