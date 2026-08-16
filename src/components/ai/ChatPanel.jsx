// src/components/ai/ChatPanel.jsx
// ──────────────────────────────────────────────────────────────
// The Pulse AI chat panel: persistent conversation sidebar +
// message history + suggestion chips + typing indicator + composer.
//
// Sprint 79C — conversations are Firestore-persisted
// (aiConversations + messages subcollection), so they survive
// refreshes, logout/login and device switches.
//
// Threading model:
//   • ONE realtime listener for the conversation list
//     (limit 30, updatedAt desc) — runs while signed in.
//   • ONE realtime listener for the open conversation's messages
//     (limit 500) — attached only while the panel is open.
//   • Messages are written optimistically and reconciled with the
//     listener (auto ids dedup identical docs).
// ──────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Bot, Eraser, FileDown, Menu, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { sendMessage, isProviderConnected } from '../../services/ai/aiService'
import { dispatchAction } from '../../services/ai/actionBus'
import {
  autoTitleFor,
  createConversation,
  updateConversation,
  subscribeToConversations,
  loadMoreConversations,
  subscribeConversationMessages,
  addConversationMessage,
  fetchConversationMessages,
  searchConversations,
  buildProviderHistory,
  formatTimeString,
  tsToMs,
  LIST_PAGE_SIZE,
  MAX_PINNED,
} from '../../services/ai/conversationService'
import { exportChat } from '../../services/ai/chatExporter'
import MessageBubble from './MessageBubble'
import MarkdownText from './MarkdownText'
import TypingIndicator from './TypingIndicator'
import SuggestionChips, { ROLE_PROMPTS } from './SuggestionChips'
import ConversationSidebar from './ConversationSidebar'

const toUiMessage = (id, role, text, time, extra) => ({ id, role, text, time, ...(extra || {}) })

function ChatPanel({ role, roleLabel, userName, gymName, open, onClose }) {
  const app = useApp()
  const { currentUser, userProfile, userGymId } = useAuth()
  const navigate = useNavigate()

  // Owner identity for ai_conversations: profiles.firebase_uid (legacy Firebase
  // UID for migrated users, self-reference UUID for Supabase-native users).
  // RLS policies compare user_id to auth_firebase_uid(), so currentUser.uid
  // (Supabase UUID) would violate them for migrated users.
  const userId = userProfile?.firebaseUid || currentUser?.uid || ''
  const lastConvKey = userId ? `ironpulse-ai-conv-${userId}` : null

  // ── Conversation list ──────────────────────────────────────
  const [convs, setConvs] = useState([])
  const [convsLoading, setConvsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tab, setTab] = useState('recent')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Active conversation + messages ─────────────────────────
  const [activeConvId, setActiveConvId] = useState(null)
  const [dbMessages, setDbMessages] = useState([])
  const [optimisticTick, setOptimisticTick] = useState(0)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [sendError, setSendError] = useState('')
  const [notice, setNotice] = useState('')

  // ── Composer / session ─────────────────────────────────────
  const [input, setInput] = useState('')
  const [chips, setChips] = useState(() => ROLE_PROMPTS[role] || ROLE_PROMPTS.gym_admin)
  const [exportOpen, setExportOpen] = useState(false)

  const endRef = useRef(null)
  const inputRef = useRef(null)
  const sendingRef = useRef(false)
  const abortRef = useRef(null)
  const confirmRef = useRef(null)
  const optimisticRef = useRef(new Map())
  const cursorRef = useRef(null)
  const listLoadedRef = useRef(false)
  const resumeTriedRef = useRef(false)
  const cacheRef = useRef(new Map())        // convId → string[] message contents (search index)
  const exportMenuRef = useRef(null)
  const dbMessagesRef = useRef([])

  const CONFIRM_YES = /^(yes|yep|yeah|ok|okay|sure|proceed|go ahead|do it|confirm)$/i

  // Live snapshot of the conversation for the provider call —
  // kept in a ref so handleSend always reads the latest turn.
  const historyRef = useRef([])

  // Snapshot of the AppContext state the AI may answer from.
  // This is ONLY already-subscribed data — the assistant opens no
  // extra data listeners for gym data.
  const aiData = useMemo(() => ({
    members: app.members || [],
    trainers: app.trainers || [],
    payments: app.payments || [],
    attendance: app.attendance || [],
    workoutPlans: app.workoutPlans || [],
    dietPlans: app.dietPlans || [],
    progressLogs: app.progressLogs || [],
    notifications: app.notifications || [],
    gyms: app.gyms || [],
    subscriptions: app.subscriptions || [],
    currentSubscription: app.currentSubscription || null,
    plans: app.plans || [],
    whatsappCampaigns: app.whatsappCampaigns || [],
    whatsappLogs: app.whatsappLogs || [],
  }), [
    app.members, app.trainers, app.payments, app.attendance,
    app.workoutPlans, app.dietPlans, app.progressLogs,
    app.notifications, app.gyms, app.subscriptions, app.currentSubscription, app.plans,
    app.whatsappCampaigns, app.whatsappLogs,
  ])

  // ── Conversation list listener (ONE, limit 30, always on) ──
  useEffect(() => {
    if (!userId) return
    setConvsLoading(true)
    const unsub = subscribeToConversations(
      userId,
      (items, snapshot) => {
        cursorRef.current = snapshot?.docs?.length
          ? snapshot.docs[snapshot.docs.length - 1]
          : null
        setHasMore(snapshot ? snapshot.docs.length === LIST_PAGE_SIZE : false)
        setConvs(prev => {
          const incoming = new Set(items.map(i => i.id))
          const keepOld = prev.filter(c => !incoming.has(c.id))
          return [...items, ...keepOld]
        })
        setConvsLoading(false)
        listLoadedRef.current = true
      },
      () => setConvsLoading(false),
      LIST_PAGE_SIZE
    )
    return unsub
  }, [userId])

  // ── Resume the last conversation the first time the panel opens ──
  const activeConvIdRef = useRef(null)
  activeConvIdRef.current = activeConvId
  useEffect(() => {
    if (!open || !userId || !listLoadedRef.current || resumeTriedRef.current) return
    if (activeConvIdRef.current) { resumeTriedRef.current = true; return }
    resumeTriedRef.current = true

    const storedId = lastConvKey ? localStorage.getItem(lastConvKey) : null
    const match = convs.find(c => c.id === storedId && !c.deleted)
    if (match) {
      setActiveConvId(match.id)
    } else {
      const mostRecent = [...convs]
        .filter(c => !c.deleted)
        .sort((a, b) => tsToMs(b.updatedAt) - tsToMs(a.updatedAt))[0]
      if (mostRecent) setActiveConvId(mostRecent.id)
    }
  }, [open, userId, convs, lastConvKey])

  // ── Realtime listener: ONLY the open conversation's messages ──
  useEffect(() => {
    if (!open || !activeConvId) {
      setDbMessages([])
      setMessagesLoading(false)
      return
    }
    setMessagesLoading(true)
    const unsub = subscribeConversationMessages(
      activeConvId,
      (items) => {
        setDbMessages(items)
        setMessagesLoading(false)
      },
      () => setMessagesLoading(false)
    )
    return unsub
  }, [open, activeConvId])

  // ── Merged UI messages (db + optimistic, deduped by id) ────
  const messages = useMemo(() => {
    const db = dbMessages.map(m => toUiMessage(
      m.id,
      m.role === 'user' ? 'user' : 'assistant',
      m.content || m.text || '',
      formatTimeString(m.createdAt),
      {
        insights: m.metadata?.insights,
        health: m.metadata?.health,
      }
    ))
    const pending = [...optimisticRef.current.values()]
      .filter(o => !db.some(d => d.id === o.id))
      .map(o => toUiMessage(o.id, o.role, o.text, '…'))
    return [...db, ...pending]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbMessages, optimisticTick])

  useEffect(() => { historyRef.current = messages }, [messages])
  dbMessagesRef.current = dbMessages

  // Cancel any in-flight Gemini request when the panel unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // Auto-scroll to the newest message while typing/streaming.
  useEffect(() => {
    const node = endRef.current
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, isTyping, isStreaming, streamingText, open, activeConvId])

  // Click-outside — close the export menu
  useEffect(() => {
    if (!exportOpen) return
    const onDoc = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [exportOpen])

  /* ════════════════════════════════════════════════════════
     ACTIONS
     ════════════════════════════════════════════════════════ */

  const showNotice = useCallback((msg) => {
    setNotice(msg)
    window.clearTimeout(showNotice._t)
    showNotice._t = window.setTimeout(() => setNotice(''), 3500)
  }, [])

  // One-line conversation meta update — local state + Firestore.
  const patchConv = useCallback((convId, data) => {
    setConvs(prev => prev.map(c => (c.id === convId ? { ...c, ...data } : c)))
    updateConversation(convId, data).catch(() => {})
  }, [])

  const openConversation = useCallback((conv) => {
    if (!conv || !conv.id) return
    abortRef.current?.abort()
    sendingRef.current = false
    confirmRef.current = null
    optimisticRef.current.clear()
    setActiveConvId(conv.id)
    if (lastConvKey) localStorage.setItem(lastConvKey, conv.id)
    setSendError('')
    setSidebarOpen(false)
  }, [lastConvKey])

  const startNewChat = useCallback(() => {
    abortRef.current?.abort()
    sendingRef.current = false
    confirmRef.current = null
    optimisticRef.current.clear()
    setActiveConvId(null)
    if (lastConvKey) localStorage.removeItem(lastConvKey)
    setDbMessages([])
    setStreamingText('')
    setSendError('')
    setChips(ROLE_PROMPTS[role] || ROLE_PROMPTS.gym_admin)
    if (inputRef.current) inputRef.current.focus()
  }, [lastConvKey, role])

  const handleTab = useCallback((nextTab) => {
    if (nextTab === null) { setSidebarOpen(false); return }
    setTab(nextTab)
    setSidebarOpen(false)
  }, [])

  const handleSearchChange = useCallback((term) => {
    setSearchTerm(term)
    const active = term.trim().length >= 2
    setSearching(active)
    if (!active) { setSearchResults([]); return }

    // Lazy search index: fetch messages of conversations not yet cached.
    const busted = []
    for (const c of convs) {
      if (c.id === activeConvIdRef.current) continue
      if (!cacheRef.current.has(c.id)) busted.push(c.id)
    }
    const finish = () => {
      const cache = Object.fromEntries(cacheRef.current)
      const activeId = activeConvIdRef.current
      if (activeId) {
        cache[activeId] = dbMessagesRef.current.map(m => m.content || m.text || '')
      }
      const results = searchConversations(term, convs, cache)
      setSearchResults(results)
    }
    if (busted.length) {
      Promise.all(busted.map(id => fetchConversationMessages(id).then(
        list => {
          cacheRef.current.set(id, list.map(m => m.content || m.text || ''))
        },
        () => {}
      ))).finally(finish)
    } else {
      finish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs])

  const handleLoadMore = useCallback(async () => {
    if (!userId || !cursorRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await loadMoreConversations(userId, cursorRef.current, LIST_PAGE_SIZE)
      setConvs(prev => {
        const existing = new Set(prev.map(c => c.id))
        return [...prev, ...res.items.filter(i => !existing.has(i.id))]
      })
      setHasMore(res.hasMore)
    } catch (err) {
      console.error('[Pulse AI] load more failed:', err.message)
    } finally {
      setLoadingMore(false)
    }
  }, [userId, loadingMore])

  const handleTogglePin = useCallback((conv, pinned) => {
    const pinnedCount = convs.filter(c => c.pinned && !c.deleted).length
    if (pinned && pinnedCount >= MAX_PINNED) {
      showNotice(`You can pin up to ${MAX_PINNED} conversations.`)
      return
    }
    patchConv(conv.id, { pinned })
  }, [convs, patchConv, showNotice])

  const handleToggleArchive = useCallback((conv, archived) => {
    patchConv(conv.id, { archived })
  }, [patchConv])

  const handleRename = useCallback((convId, title) => {
    const clean = String(title || '').trim().slice(0, 80)
    if (!clean) return
    patchConv(convId, { title: clean })
  }, [patchConv])

  const handleDelete = useCallback((conv) => {
    // SOFT DELETE ONLY — no permanent delete exists anywhere.
    patchConv(conv.id, { deleted: true, deletedAt: new Date() })
    if (activeConvIdRef.current === conv.id) startNewChat()
  }, [patchConv, startNewChat])

  const activeConv = useMemo(
    () => convs.find(c => c.id === activeConvId) || null,
    [convs, activeConvId]
  )

  const handleExport = useCallback(async (conv, format) => {
    if (!conv) return
    let items = []
    if (conv.id === activeConvIdRef.current) {
      items = historyRef.current.map(m => ({
        role: m.role,
        text: m.text,
        time: m.time && m.time !== '…' ? m.time : '',
      }))
    } else {
      try {
        const list = await fetchConversationMessages(conv.id)
        items = list.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          text: m.content || m.text || '',
          time: formatTimeString(m.createdAt),
        }))
      } catch (err) {
        console.error('[Pulse AI] export fetch failed:', err.message)
        return
      }
    }
    try {
      exportChat(format, {
        title: conv.title || 'Conversation',
        messages: items,
        userName,
        gymName,
        role,
      })
      showNotice('Conversation exported.')
    } catch (err) {
      console.error('[Pulse AI] export failed:', err.message)
      showNotice('Export failed — please try again.')
    }
  }, [userName, gymName, role])

  // Create a conversation lazily on the first message of a new chat.
  const ensureUserConversation = useCallback(async (firstPrompt) => {
    try {
      const conv = await createConversation({
        gymId: userGymId || 'default',
        userId,
        role,
        title: autoTitleFor(firstPrompt),
      })
      optimisticRef.current.clear()
      setActiveConvId(conv.id)
      if (lastConvKey) localStorage.setItem(lastConvKey, conv.id)
      setConvs(prev => prev.some(c => c.id === conv.id) ? prev : [conv, ...prev])
      setTab('recent')
      return conv.id
    } catch (err) {
      console.error('[Pulse AI] createConversation failed:', err.message)
      return null
    }
  }, [userId, role, userGymId, lastConvKey])

  // ── Firestore message writer (optimistic UI) ───────────────
  // A failed persistence write must NEVER swallow the answer:
  // the message is rendered locally either way, and a real
  // send failure is reported separately by handleSend.
  const persistAndShow = useCallback(async (convId, mRole, text, extra) => {
    let id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      id = await addConversationMessage(convId, { role: mRole, content: text, metadata: extra || {} })
    } catch (err) {
      console.error('[Pulse AI] message save failed (shown locally):', err?.message || err)
    }
    optimisticRef.current.set(id, { id, role: mRole, text })
    setOptimisticTick(t => t + 1)
    return id
  }, [])

  const bumpConvMeta = useCallback((convId, last, delta) => {
    setConvs(prev => prev.map(c =>
      c.id === convId
        ? { ...c, lastMessage: String(last || '').slice(0, 140), messageCount: (c.messageCount || 0) + delta, updatedAt: new Date() }
        : c
    ))
    updateConversation(convId, {
      lastMessage: String(last || '').slice(0, 140),
      messageCount: delta,
    }).catch(() => {})
  }, [])

  const handleSend = useCallback(async (raw) => {
    const text = (raw ?? input).trim()
    if (!text) return

    const answerNow = async (replyText) => {
      const convId = activeConvIdRef.current || await ensureUserConversation(text)
      if (!convId) return
      await persistAndShow(convId, 'user', text)
      await persistAndShow(convId, 'assistant', replyText)
      bumpConvMeta(convId, replyText, 2)
      setChips(ROLE_PROMPTS[role] || ROLE_PROMPTS.gym_admin)
    }

    // ── Confirmation gate (destructive commands) ────────────
    const pending = confirmRef.current
    if (pending) {
      confirmRef.current = null
      setSendError('')
      setInput('')
      if (CONFIRM_YES.test(text)) {
        await answerNow(
          'Understood. I still won\'t ' + pending.label + ' automatically — nothing has been changed. ' +
          'You can manage this yourself from the relevant page; say "Open members" or "Open payments" and I will take you there.'
        )
      } else {
        await answerNow('Cancelled — nothing was changed. I never run destructive actions automatically; say the word if you need help with anything else.')
      }
      return
    }

    if (sendingRef.current) return
    // Rate limiting: never run two requests at once — cancel the
    // previous in-flight Gemini call before starting a new one.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    sendingRef.current = true
    setSendError('')
    setInput('')
    setStreamingText('')
    setIsStreaming(false)

    const convId = activeConvIdRef.current || await ensureUserConversation(text)
    if (!convId) {
      sendingRef.current = false
      showNotice('Could not start the conversation — please try again.')
      return
    }

await persistAndShow(convId, 'user', text)
      bumpConvMeta(convId, text, 1)
      setIsTyping(true)

      try {
        // Conversation memory: last 20 messages + automatic summary of
        // anything older — stays far below model token limits.
        const context = buildProviderHistory(historyRef.current.slice(0, -1))
        const history = context.summary
          ? [{ role: 'user', text: context.summary }, ...context.recent]
          : context.recent

        const reply = await sendMessage(
          text,
          {
            role,
            userId,
            name: userName,
            gymName,
            history,
            data: aiData,
          },
          {
            signal: controller.signal,
            onToken: (acc) => {
              setIsStreaming(true)
              setStreamingText(acc)
            },
          }
        )
        await persistAndShow(
          convId,
          'assistant',
          reply.text,
          {
            insights: reply.insights,
            health: reply.health,
          }
        )
      bumpConvMeta(convId, reply.text, 1)
      if (reply.nextSuggestions?.length) setChips(reply.nextSuggestions)
      // Actions — confirmations arm the yes/no gate above;
      // executable actions are delivered to the target page.
      if (reply.action?.kind === 'confirm') {
        confirmRef.current = { label: reply.action.label }
      } else if (reply.action?.kind === 'action') {
        dispatchAction(reply.action)
      }
      // Navigation commands — react-router, no page reload.
      if (reply.navigation?.path) navigate(reply.navigation.path)
    } catch (err) {
      // A REAL send failure — not a persistence hiccup (persistAndShow
      // never throws). Keep the user prompt visible and give a useful
      // next step instead of masking the failure with a generic line.
      setSendError('Sorry, I hit a snag replying. Please try again, or type "help" to see what I can answer.')
      await persistAndShow(convId, 'assistant', "I couldn't determine what you meant. Please try again, or type \"help\" to see what I can answer.")
      bumpConvMeta(convId, "I couldn't determine what you meant. Please try again, or type \"help\" to see what I can answer.", 1)
    } finally {
      sendingRef.current = false
      setIsTyping(false)
      setIsStreaming(false)
      setStreamingText('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userName, gymName, input, aiData, navigate, showNotice, ensureUserConversation, persistAndShow, bumpConvMeta])

  const handleChip = useCallback((prompt) => {
    if (sendingRef.current) return
    handleSend(prompt)
  }, [handleSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className={`ai-panel ai-panel-multi${open ? '' : ' is-hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Pulse AI assistant chat"
      id="pulse-ai-panel"
    >
      <ConversationSidebar
        open={sidebarOpen}
        items={searching ? searchResults : tabList(tab, convs)}
        searching={searching}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        tab={tab}
        onTab={handleTab}
        activeId={activeConvId}
        onSelect={openConversation}
        hasMore={hasMore && !searching}
        loading={convsLoading}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
        onNewChat={startNewChat}
        onExport={handleExport}
        onRename={handleRename}
        onTogglePin={handleTogglePin}
        onToggleArchive={handleToggleArchive}
        onDelete={handleDelete}
      />

      <div className="ai-chat-pane">
        {/* ── Chat header ── */}
        <div className="ai-panel-header">
          <button
            type="button"
            className="ai-icon-btn ai-conv-toggle"
            onClick={() => setSidebarOpen(p => !p)}
            aria-label="Toggle conversation list"
            aria-expanded={sidebarOpen}
            title="Conversations"
          >
            <Menu size={15} aria-hidden="true" />
          </button>
          <div className="ai-panel-avatar" aria-hidden="true">
            <Bot size={17} />
          </div>
          <div className="ai-panel-title">
            <div className="ai-panel-name">
              <span className="ai-panel-name-text">
                {activeConv ? (activeConv.title || 'New conversation') : 'Pulse AI'}
                {activeConv && activeConv.archived && <span className="ai-archived-pill">Archived</span>}
              </span>
              <span className="ai-role-badge">{roleLabel}</span>
            </div>
            <div className="ai-panel-sub">
              <span className="ai-status-dot" aria-hidden="true" />
              {isProviderConnected() ? 'Online · Gemini live answers' : 'Online · answers from your gym data'}
            </div>
          </div>
          <div className="ai-panel-actions">
            {activeConvId && (
              <div className="ai-export-wrap" ref={exportMenuRef}>
                <button
                  type="button"
                  className="ai-icon-btn"
                  onClick={() => setExportOpen(p => !p)}
                  aria-label="Export conversation"
                  aria-expanded={exportOpen}
                  title="Export conversation"
                >
                  <FileDown size={14} aria-hidden="true" />
                </button>
                {exportOpen && (
                  <div className="ai-export-menu" role="menu" aria-label="Export format">
                    <button type="button" role="menuitem" onClick={() => { handleExport(activeConv, 'pdf'); setExportOpen(false) }}>
                      PDF
                    </button>
                    <button type="button" role="menuitem" onClick={() => { handleExport(activeConv, 'txt'); setExportOpen(false) }}>
                      TXT
                    </button>
                    <button type="button" role="menuitem" onClick={() => { handleExport(activeConv, 'markdown'); setExportOpen(false) }}>
                      Markdown
                    </button>
                  </div>
                )}
              </div>
            )}
            <button type="button" className="ai-icon-btn" onClick={startNewChat} aria-label="Start a new conversation" title="New conversation">
              <Eraser size={14} aria-hidden="true" />
            </button>
            <button type="button" className="ai-icon-btn ai-icon-btn-close" onClick={onClose} aria-label="Close chat">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Notice / error banner ── */}
        {(notice || sendError) && (
          <div className={`ai-notice${sendError ? ' is-error' : ''}`} role="alert">
            {sendError || notice}
          </div>
        )}

        {/* ── Messages ── */}
        <div className="ai-messages">
          {messagesLoading && messages.length === 0 && (
            <div className="ai-msg-loading" role="status">Loading conversation…</div>
          )}
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {(isTyping || isStreaming) && !streamingText && (
            <div className="ai-msg ai-msg-assistant">
              <div className="ai-msg-avatar" aria-hidden="true">
                <Bot size={14} />
              </div>
              <div className="ai-msg-body">
                <div className="ai-msg-bubble ai-msg-bubble-typing">
                  <TypingIndicator />
                </div>
              </div>
            </div>
          )}
          {isStreaming && streamingText && (
            <div className="ai-msg ai-msg-assistant">
              <div className="ai-msg-avatar" aria-hidden="true">
                <Bot size={14} />
              </div>
              <div className="ai-msg-body">
                <div className="ai-msg-bubble">
                  <MarkdownText text={streamingText} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* ── Suggested prompts (fresh conversations only) ── */}
        {!messagesLoading && messages.length === 0 && !isTyping && !isStreaming && (
          <div className="ai-chips-wrap">
            <SuggestionChips role={role} onPick={handleChip} disabled={isTyping || sendingRef.current} />
          </div>
        )}

        {/* ── Composer ── */}
        <form className="ai-composer" onSubmit={(e) => { e.preventDefault(); handleSend() }}>
          <label htmlFor="pulse-ai-input" className="sr-only">Type a message for Pulse AI</label>
          <textarea
            id="pulse-ai-input"
            ref={inputRef}
            className="ai-input"
            rows={1}
            placeholder={activeConvId ? 'Continue this conversation…' : 'Start a new conversation…'}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
            }}
            onKeyDown={handleKeyDown}
            aria-label="Message"
            disabled={isTyping}
          />
          <button
            type="submit"
            className="ai-send-btn"
            disabled={!input.trim() || isTyping}
            aria-label="Send message"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── list helpers ─────────────────────────────────── */

function tabList(tab, convs) {
  const list = Array.isArray(convs) ? convs : []
  return list.filter(c => {
    if (c.deleted) return false
    if (tab === 'pinned') return c.pinned && !c.archived
    if (tab === 'archived') return c.archived
    return !c.archived && !c.pinned
  })
}

const MemoChatPanel = memo(ChatPanel)
export default MemoChatPanel