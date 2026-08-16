// ─────────────────────────────────────────────────────────────────────────────
// realtimeService — shared Supabase Realtime adapter (Step 8D)
//
// Firestore-style snapshot semantics on top of Supabase Realtime:
//   - onChange(fullArray) is invoked with the complete, ordered, filtered set
//     after EVERY change (initial snapshot + INSERT/UPDATE/DELETE events).
//   - No server-side `filter` param on postgres_changes (RLS is the server
//     gate; DELETE events cannot be server-filtered without replica identity
//     full). Client-side filter re-checks apply to every event row.
//   - Registry dedupes identical subscriptions (table+filter+order+limit) so
//     StrictMode double-effects share one channel; refcounted unsubscribe.
//   - Reconnect: supabase-js re-joins channels automatically; every SUBSCRIBED
//     triggers a full resync (fresh SELECT + emit) so missed events are never
//     lost. CHANNEL_ERROR / TIMED_OUT surface via onError.
//   - Race safety: events arriving between the initial snapshot and channel
//     subscription are buffered and replayed idempotently after a reconcile
//     SELECT (postgres_changes events carry the full new row, so a replay is
//     a simple upsert).
// ─────────────────────────────────────────────────────────────────────────────

let clientPromise = null
function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = import('../lib/supabase').then((m) => m.supabase)
  }
  return clientPromise
}

// ── small helpers ──────────────────────────────────────────────────────────

function hashKey(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function eqValue(v) {
  if (v === null || v === undefined || v === '') return null
  return v
}

// Filter spec (normalized): [column, op, value] with op in eq|in|gte|gt|lte|lt.
function normalizeFilter(entry) {
  if (!entry) return null
  if (entry.length === 2) {
    const [col, val] = entry
    if (Array.isArray(val)) return [col, 'in', val]
    return [col, 'eq', val]
  }
  if (entry.length >= 3) return [entry[0], entry[1], entry[2]]
  return null
}

function matchesFilter(row, filters) {
  if (!row || !filters || !filters.length) return true
  return filters.every(([col, op, val]) => {
    const rv = row[col]
    switch (op) {
      case 'eq': return rv === val || (val === null && (rv === null || rv === undefined || rv === ''))
      case 'in': return Array.isArray(val) && val.includes(rv)
      case 'gte': return rv !== null && rv !== undefined && val !== null && rv >= val
      case 'gt': return rv !== null && rv !== undefined && val !== null && rv > val
      case 'lte': return rv !== null && rv !== undefined && val !== null && rv <= val
      case 'lt': return rv !== null && rv !== undefined && val !== null && rv < val
      default: return true
    }
  })
}

function buildQuery(client, table, filters, orderBy, limit) {
  let q = client.from(table).select('*')
  for (const [col, op, val] of filters || []) {
    if (op === 'in') q = q.in(col, val)
    else if (op === 'eq') {
      const v = eqValue(val)
      if (v === null) continue // null/'' means "no constraint" (sbInitialLoad parity)
      q = q.eq(col, v)
    }
    else q = q[op](col, eqValue(val))
  }
  if (orderBy) q = q.order(orderBy.column, { ascending: !!orderBy.ascending })
  if (limit) q = q.limit(limit)
  return q
}

async function fetchRows(client, entry) {
  const { data, error } = await buildQuery(client, entry.table, entry.filters, entry.orderBy, entry.limit)
  if (error) throw error
  return data || []
}

// ── registry ────────────────────────────────────────────────────────────────

const registry = new Map()

function entryKey(table, filters, orderBy, limit) {
  return JSON.stringify([table, filters || [], orderBy || null, limit || null])
}

function channelName(key) {
  return `rt-${hashKey(key)}`
}

function rowKey(entry, row) {
  if (!row) return null
  return entry.keyFn(row)
}

function upsert(entry, row) {
  const k = rowKey(entry, row)
  if (k === null || k === undefined) {
    entry.rows.push(row)
    return
  }
  const idx = entry.rows.findIndex((r) => rowKey(entry, r) === k)
  if (idx >= 0) entry.rows[idx] = row
  else entry.rows.push(row)
}

function removeByKey(entry, k) {
  const idx = entry.rows.findIndex((r) => rowKey(entry, r) === k)
  if (idx >= 0) entry.rows.splice(idx, 1)
}

function sortRows(entry) {
  if (!entry.orderBy) return
  const { column, ascending } = entry.orderBy
  entry.rows.sort((a, b) => {
    const av = a ? a[column] : null
    const bv = b ? b[column] : null
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    let c = 0
    if (av < bv) c = -1
    else if (av > bv) c = 1
    return ascending ? c : -c
  })
}

function emitTo(entry, sub) {
  if (sub.detached || entry.closed) return
  let out = entry.rows.map(sub.mapRow || ((r) => r))
  if (sub.sortFn) out = out.slice().sort(sub.sortFn)
  if (entry.limit) out = out.slice(0, entry.limit)
  sub.onChange(out)
}

function emitAll(entry) {
  if (entry.closed) return
  sortRows(entry)
  for (const sub of entry.subs) emitTo(entry, sub)
}

// Mirrors firestoreService.mapSupabaseError: translate PostgREST errors to the
// Firebase-style error codes the UI checks (permission-denied, already-exists,
// not-found, unavailable, invalid-argument, foreign-key-violation).
function mapRtError(err) {
  const msg = (err && err.message) || ''
  const code = (err && err.code) ? String(err.code) : ''
  const codeStr = `${msg} ${code}`
  let mapped = null
  if (/permission.?denied|42501|RLS/i.test(codeStr)) mapped = 'permission-denied'
  else if (/already.?exists|duplicate|23505/i.test(codeStr)) mapped = 'already-exists'
  else if (/not.?found|PGRST116/i.test(codeStr)) mapped = 'not-found'
  else if (/unavailable|fetch/i.test(codeStr)) mapped = 'unavailable'
  else if (/invalid|22P02|22P01/i.test(codeStr)) mapped = 'invalid-argument'
  else if (/foreign.?key|23503/i.test(codeStr)) mapped = 'foreign-key-violation'
  if (mapped && err && typeof err === 'object') {
    return { ...err, code: mapped }
  }
  return err
}

function failAll(entry, err) {
  if (entry.closed) return
  const raw = err && err.message ? err : new Error('realtime: ' + String(err))
  const e = mapRtError(raw)
  for (const sub of entry.subs) {
    if (!sub.detached) sub.onError(e)
  }
}

// ── event application ───────────────────────────────────────────────────────

function applyEvent(entry, payload) {
  if (entry.closed) return
  const eventType = payload.eventType || payload.type || 'UPDATE'
  const newRow = payload.new || payload.record || null
  const oldRow = payload.old || payload.old_record || null

  if (eventType === 'DELETE') {
    const k = oldRow ? rowKey(entry, oldRow) : null
    if (k !== null && k !== undefined) removeByKey(entry, k)
    else requestRefetch(entry)
    return
  }
  if (!newRow) return
  if (matchesFilter(newRow, entry.filters)) {
    upsert(entry, newRow)
  } else if (eventType === 'UPDATE') {
    const k = rowKey(entry, newRow)
    if (k !== null && k !== undefined) removeByKey(entry, k)
  }
}

function requestRefetch(entry) {
  if (entry.refetchPending || entry.closed) return
  entry.refetchPending = true
  setTimeout(async () => {
    entry.refetchPending = false
    if (entry.closed) return
    const client = await getSupabaseClient()
    try {
      const fresh = await fetchRows(client, entry)
      if (!entry.closed) {
        entry.rows = fresh
        emitAll(entry)
      }
    } catch (err) {
      failAll(entry, err)
    }
  }, 50)
}

// ── lifecycle ───────────────────────────────────────────────────────────────

async function runReconcile(entry) {
  if (entry.reconciling || entry.closed) return
  entry.reconciling = true
  try {
    const client = await getSupabaseClient()
    const fresh = await fetchRows(client, entry)
    if (entry.closed) return
    entry.rows = fresh
    emitAll(entry)
    const buffered = entry.buffer
    entry.buffer = []
    for (const p of buffered) applyEvent(entry, p)
    emitAll(entry)
    entry.phase = 'live'
  } catch (err) {
    failAll(entry, err)
    const buffered = entry.buffer
    entry.buffer = []
    for (const p of buffered) applyEvent(entry, p)
    emitAll(entry)
    entry.phase = 'live'
  } finally {
    entry.reconciling = false
  }
}

function onStatus(entry, status, err) {
  if (entry.closed) return
  if (status === 'SUBSCRIBED') {
    entry.phase = 'buffering'
    runReconcile(entry)
  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    failAll(entry, new Error(`realtime channel ${status}: ${(err && err.message) || 'unavailable'}`))
  }
}

function onEvent(entry, payload) {
  if (entry.closed) return
  if (entry.phase !== 'live') {
    entry.buffer.push(payload)
    return
  }
  applyEvent(entry, payload)
  emitAll(entry)
}

function startEntry(entry) {
  getSupabaseClient().then(async (client) => {
    if (entry.closed) return
    try {
      entry.rows = await fetchRows(client, entry)
      emitAll(entry)
    } catch (err) {
      entry.rows = []
      failAll(entry, err)
    }
    if (entry.closed) return
    entry.channel = client.channel(channelName(entryKey(entry.table, entry.filters, entry.orderBy, entry.limit)))
    entry.channel
      .on('postgres_changes', { event: '*', schema: 'public', table: entry.table }, (payload) => onEvent(entry, payload))
      .subscribe((status, err) => onStatus(entry, status, err))
  }).catch((err) => {
    failAll(entry, err)
  })
}

function detach(entry, sub) {
  sub.detached = true
  entry.subs.delete(sub)
  if (entry.subs.size === 0) {
    entry.closed = true
    registry.delete(entryKey(entry.table, entry.filters, entry.orderBy, entry.limit))
    if (entry.channel) entry.channel.unsubscribe()
  }
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Firestore-style realtime subscription over Supabase Realtime.
 *
 * opts:
 *   table    — supabase table name
 *   filter   — [[col, value] | [col, [..]] | [col, op, value], ...]
 *   orderBy  — { column, ascending } (server sort + local re-sort on events)
 *   limit    — max rows delivered to onChange (after sortFn)
 *   mapRow   — row → Firestore-shaped object (per subscriber)
 *   sortFn   — optional client comparator applied AFTER mapRow
 *   keyFn    — row → unique key (default r => r.id; settings uses composite)
 *   onChange — (array) full snapshot after every change
 *   onError  — (error) channel/load failures (never throws)
 *   label    — debug label for error messages
 *
 * Returns an unsubscribe function.
 */
export function subscribeRealtime(opts) {
  // Drop eq-null/empty constraints so the initial SELECT and the event filter
  // agree (sbInitialLoad parity: null/'' means "no constraint").
  const filters = (opts.filter || [])
    .map(normalizeFilter)
    .filter(Boolean)
    .filter(([_col, op, val]) => !(op === 'eq' && eqValue(val) === null))
  const orderBy = opts.orderBy || null
  const limit = opts.limit || null
  const key = entryKey(opts.table, filters, orderBy, limit)

  const sub = {
    mapRow: opts.mapRow || ((r) => r),
    sortFn: opts.sortFn || null,
    keyFn: opts.keyFn || ((r) => (r ? r.id : null)),
    onChange: opts.onChange || (() => {}),
    onError: opts.onError || (() => {}),
    label: opts.label || opts.table,
    detached: false,
  }

  const existing = registry.get(key)
  if (existing && !existing.closed) {
    existing.subs.add(sub)
    emitTo(existing, sub)
    return () => detach(existing, sub)
  }

  const entry = {
    table: opts.table,
    filters,
    orderBy,
    limit,
    keyFn: sub.keyFn,
    channel: null,
    rows: [],
    subs: new Set([sub]),
    phase: 'init',
    buffer: [],
    reconciling: false,
    refetchPending: false,
    closed: false,
  }
  registry.set(key, entry)
  startEntry(entry)
  return () => detach(entry, sub)
}

// Test/observability hook — never used by product code.
export function __realtimeRegistrySize() {
  return registry.size
}