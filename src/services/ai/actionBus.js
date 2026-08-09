// src/services/ai/actionBus.js
// ─────────────────────────────────────────────────────────────
// UI action bus (Sprint 78A — AI Action Engine).
//
// A tiny in-memory transport between the AI assistant and the
// pages that can perform UI actions (open modals, apply filters,
// focus search, scroll to sections). Pages register their
// handlers on mount; the assistant dispatches by scope.
//
// - No Firestore listeners, no polling, no new subscriptions.
// - If the target page isn't mounted yet (navigation in flight),
//   the action is queued and immediately executed when the page
//   registers — this removes any navigation race.
// - Handler failures are swallowed so a UI bug can never break
//   the chat.
// ─────────────────────────────────────────────────────────────

/** scope -> { actionId: fn(params) } */
const registry = new Map()

/** scope -> [action, ...] queued while the page isn't mounted */
const pendingQueue = new Map()

/**
 * Registers a page's action handlers. Returns an unregister fn
 * (for useEffect cleanup).
 *
 * @param {string} scope     e.g. 'members' | 'workouts' | 'member-dashboard'
 * @param {Object} handlers   { actionId: (params) => void }
 */
export function registerActionHandlers(scope, handlers) {
  const safe = {}
  Object.keys(handlers || {}).forEach(id => {
    if (typeof handlers[id] === 'function') safe[id] = handlers[id]
  })
  registry.set(scope, safe)

  // Flush anything queued while this page was coming up.
  const queued = pendingQueue.get(scope)
  if (queued && queued.length) {
    pendingQueue.delete(scope)
    queued.forEach(action => dispatchAction(action))
  }

  return () => {
    registry.delete(scope)
    pendingQueue.delete(scope)
  }
}

/**
 * Sends an action to a page. Returns true when handled now, false
 * when it had to be queued (page navigation in progress).
 */
export function dispatchAction(action) {
  if (!action || typeof action.scope !== 'string' || typeof action.actionId !== 'string') return false
  const handlers = registry.get(action.scope)
  const fn = handlers?.[action.actionId]
  if (typeof fn === 'function') {
    try {
      fn(action.params || {})
    } catch {
      // A UI handler must never break the assistant.
    }
    return true
  }
  const queued = pendingQueue.get(action.scope) || []
  queued.push(action)
  pendingQueue.set(action.scope, queued)
  return false
}

/** True when the scope's page currently has handlers registered. */
export function hasActionHandlers(scope) {
  return registry.has(scope)
}

/** Clears queued actions (e.g. after navigation away). */
export function clearQueuedActions(scope) {
  pendingQueue.delete(scope)
}

export default {
  registerActionHandlers,
  dispatchAction,
  hasActionHandlers,
  clearQueuedActions,
}