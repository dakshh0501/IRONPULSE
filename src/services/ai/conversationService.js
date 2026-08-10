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

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'

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
  const now = serverTimestamp()
  const docRef = await addDoc(
    collection(db, CONVERSATIONS_COLLECTION),
    sanitizeFirestoreData({
      gymId: gymId || 'default',
      userId,
      role: role || 'gym_admin',
      title: title || 'New conversation',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      deleted: false,
      lastMessage: '',
      messageCount: 0,
    })
  )
  return {
    id: docRef.id,
    gymId: gymId || 'default',
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

/** Lightweight meta updates accepted on a conversation doc. */
export async function updateConversation(conversationId, data) {
  if (!conversationId) throw new Error('Missing conversation id')
  await updateDoc(
    doc(db, CONVERSATIONS_COLLECTION, conversationId),
    sanitizeFirestoreData({
      ...data,
      updatedAt: serverTimestamp(),
    })
  )
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
    deletedAt: serverTimestamp(),
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
  const ref = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where('userId', '==', userId),
    where('deleted', '==', false),
    orderBy('updatedAt', 'desc'),
    limit(pageSize)
  )
  return onSnapshotWith(ref, callback, onError, 'aiConversations')
}

/** Loads the next page of older conversations (manual load-more). */
export async function loadMoreConversations(userId, beforeSnapshot, pageSize = LIST_PAGE_SIZE) {
  if (!userId || !beforeSnapshot) return { items: [], hasMore: false }
  const ref = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where('userId', '==', userId),
    where('deleted', '==', false),
    orderBy('updatedAt', 'desc'),
    startAfter(beforeSnapshot),
    limit(pageSize)
  )
  const snap = await getDocs(ref)
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    hasMore: snap.docs.length === pageSize,
  }
}

/* ══════════════════════════════════════════════════════════
   MESSAGES (realtime listener — active conversation ONLY)
   ══════════════════════════════════════════════════════════ */

/** Realtime subscription to one conversation's messages. */
export function subscribeConversationMessages(conversationId, callback, onError) {
  if (!conversationId) return () => {}
  const ref = query(
    collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'asc'),
    limit(MESSAGES_LIMIT)
  )
  return onSnapshotWith(ref, callback, onError, 'aiMessages')
}

/**
 * Adds a message to a conversation. Returns the created doc id
 * immediately (Firestore client-side ids) so callers can optimistically
 * render the bubble before the snapshot arrives.
 */
export async function addConversationMessage(conversationId, { role, content, metadata }) {
  const ref = await addDoc(
    collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION),
    sanitizeFirestoreData({
      role: role === 'assistant' ? 'assistant' : 'user',
      content: String(content || '').slice(0, 8000),
      createdAt: serverTimestamp(),
      metadata: metadata || {},
    })
  )
  return ref.id
}

/** One-shot message read — used by the on-demand search cache. */
export async function fetchConversationMessages(conversationId, max = 500) {
  if (!conversationId) return []
  const snap = await getDocs(
    query(
      collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION),
      orderBy('createdAt', 'asc'),
      limit(max)
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
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

function onSnapshotWith(ref, callback, onError, label) {
  let unsub = null
  try {
    unsub = onSnapshot(
      ref,
      (snapshot) => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        callback(items, snapshot)
      },
      (error) => {
        console.error(`[Conversation] Subscription error (${label}):`, error.message)
        if (typeof onError === 'function') onError(error, label)
      }
    )
  } catch (error) {
    console.error(`[Conversation] Subscription setup error (${label}):`, error.message)
    if (typeof onError === 'function') onError(error, label)
  }
  return unsub
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