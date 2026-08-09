// src/components/ai/ConversationSidebar.jsx
// ──────────────────────────────────────────────────────────────
// Pulse AI — persistent conversation list (Sprint 79C).
// Desktop: left column inside the chat panel.
// Mobile: slides in as a drawer over the chat pane.
//
// Sections (tabs): Recent · Pinned · Archived. A search field at
// the top switches the list to live search results (title + text).
// "Load more" paginates the conversation list (limit 30 per page).
// ──────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Check,
  FileDown,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

function formatDate(value) {
  if (!value) return ''
  const ts = value?.seconds ? value.seconds * 1000 : value
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export default function ConversationSidebar({
  open,
  items,
  searching,
  searchTerm,
  onSearchChange,
  tab,
  onTab,
  activeId,
  onSelect,
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  onNewChat,
  onExport,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
}) {
  const [menuId, setMenuId] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const menuRef = useRef(null)

  const isSearching = Boolean(searching)

  // Close dropdowns when the sidebar closes
  useEffect(() => {
    if (!open) {
      setMenuId(null)
      setRenameId(null)
      setConfirmId(null)
    }
  }, [open])

  // Click-outside — close overflow menu / rename
  useEffect(() => {
    if (!menuId && !renameId) return
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuId(null)
      }
      if (renameId && !e.target.closest('.ai-rename-row')) setRenameId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuId, renameId])

  const startRename = (conv) => {
    setRenameId(conv.id)
    setRenameValue(conv.title || (conv.lastMessage || '').slice(0, 40) || 'Conversation')
    setMenuId(null)
  }

  const commitRename = () => {
    if (renameValue.trim()) onRename(renameId, renameValue.trim())
    setRenameId(null)
  }

  const sorted = useMemo(() => {
    const list = Array.isArray(items) ? items : []
    return [...list].sort((a, b) => {
      const at = a.updatedAt?.seconds || a.updatedAt || 0
      const bt = b.updatedAt?.seconds || b.updatedAt || 0
      return bt - at
    })
  }, [items])

  return (
    <div className={`ai-conv-sidebar${open ? ' is-open' : ''}`} role="navigation" aria-label="Conversations">
      {/* ── Header ── */}
      <div className="ai-conv-head">
        <span className="ai-conv-title">Conversations</span>
        <div className="ai-conv-head-actions">
          <button type="button" className="ai-icon-btn" onClick={onNewChat} aria-label="Start a new conversation" title="New chat">
            <Plus size={15} aria-hidden="true" />
          </button>
          <button type="button" className="ai-icon-btn ai-conv-close" onClick={() => onTab(null)} aria-label="Close conversation list" title="Close">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="ai-conv-search" role="search">
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          className="ai-conv-search-input"
          placeholder="Search chats…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search conversations by title or message"
        />
        {searchTerm && (
          <button type="button" className="ai-icon-btn" onClick={() => onSearchChange('')} aria-label="Clear search">
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Section tabs ── */}
      {!isSearching && (
        <div className="ai-conv-tabs" role="tablist" aria-label="Conversation sections">
          {[
            { id: 'recent', label: 'Recent', icon: MessageSquare },
            { id: 'pinned', label: 'Pinned', icon: Pin },
            { id: 'archived', label: 'Archived', icon: Archive },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`ai-conv-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => onTab(id)}
            >
              <Icon size={12} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── List ── */}
      <div className="ai-conv-list" role="list">
        {loading && sorted.length === 0 && (
          <div className="ai-conv-empty" role="status">Loading chats…</div>
        )}
        {!loading && sorted.length === 0 && (
          <div className="ai-conv-empty">
            <MessageSquare size={22} aria-hidden="true" />
            <span>
              {isSearching
                ? 'No conversations match your search.'
                : tab === 'pinned'
                  ? 'No pinned chats yet — pin a conversation to keep it on top.'
                  : tab === 'archived'
                    ? 'Nothing archived.'
                    : 'No conversations yet — start a new chat.'}
            </span>
          </div>
        )}

        {sorted.map(conv => (
          <ConversationListRow
            key={conv.id}
            conv={conv}
            activeId={activeId}
            onSelect={() => onSelect(conv)}
            menuOpen={menuId === conv.id}
            menuRef={menuRef}
            toggleMenu={() => setMenuId(conv.id)}
            closeMenu={() => setMenuId(null)}
            isRenaming={renameId === conv.id}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            commitRename={commitRename}
            cancelRename={() => setRenameId(null)}
            startRename={() => startRename(conv)}
            confirmOpen={confirmId === conv.id}
            openConfirm={() => setConfirmId(conv.id)}
            closeConfirm={() => setConfirmId(null)}
            onExport={onExport}
            onRename={onRename}
            onTogglePin={onTogglePin}
            onToggleArchive={onToggleArchive}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* ── Load more ── */}
      {!isSearching && hasMore && (
        <div className="ai-conv-footer">
          <button type="button" className="ai-conv-more" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load older chats'}
          </button>
        </div>
      )}
    </div>
  )
}

function ConversationListRow({
  conv,
  activeId,
  onSelect,
  menuOpen,
  menuRef,
  toggleMenu,
  closeMenu,
  isRenaming,
  renameValue,
  setRenameValue,
  commitRename,
  cancelRename,
  startRename,
  confirmOpen,
  openConfirm,
  closeConfirm,
  onExport,
  onTogglePin,
  onToggleArchive,
  onDelete,
}) {
  const isActive = activeId === conv.id

  if (isRenaming) {
    return (
      <div className="ai-conv-row is-renaming" onClick={e => e.stopPropagation()}>
        <div className="ai-rename-row">
          <input
            className="ai-rename-input"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            aria-label="Conversation title"
            autoFocus
          />
          <button type="button" className="ai-icon-btn" onClick={commitRename} aria-label="Save title" title="Save">
            <Check size={13} aria-hidden="true" />
          </button>
          <button type="button" className="ai-icon-btn" onClick={cancelRename} aria-label="Cancel rename" title="Cancel">
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`ai-conv-row${isActive ? ' is-active' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }
      }}
    >
      <div className="ai-conv-row-main">
        <div className="ai-conv-row-title">
          <span className="ai-conv-title-text">{conv.title || 'New conversation'}</span>
          {conv.pinned && <Pin size={10} className="ai-conv-pin-icon" aria-hidden="true" />}
          {conv.archived && <Archive size={10} className="ai-conv-arch-icon" aria-hidden="true" />}
        </div>
        <div className="ai-conv-row-sub">
          <span className="ai-conv-preview">{conv.lastMessage || 'Tap to continue this chat'}</span>
          <span className="ai-conv-time">{formatDate(conv.updatedAt)}</span>
        </div>
      </div>

      {menuOpen && (
        <div className="ai-conv-menu" ref={menuRef} onClick={e => e.stopPropagation()}>
          {confirmOpen ? (
            <div className="ai-conv-menu-confirm" role="alertdialog" aria-label="Delete conversation">
              <span className="ai-conv-menu-confirm-text">Delete this chat?</span>
              <div className="ai-conv-menu-confirm-actions">
                <button type="button" className="ai-conv-menu-confirm-yes" onClick={() => { onDelete(conv); closeConfirm() }}>
                  Delete
                </button>
                <button type="button" className="ai-conv-menu-confirm-no" onClick={closeConfirm}>
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <>
              <MenuButton icon={conv.pinned ? PinOff : Pin} label={conv.pinned ? 'Unpin' : 'Pin'} onClick={() => { onTogglePin(conv, !conv.pinned); closeMenu() }} />
              <MenuButton icon={conv.archived ? ArchiveRestore : Archive} label={conv.archived ? 'Unarchive' : 'Archive'} onClick={() => { onToggleArchive(conv, !conv.archived); closeMenu() }} />
              <MenuButton icon={Pencil} label="Rename" onClick={() => { startRename(conv); closeMenu() }} />
              <MenuDivider />
              <MenuButton icon={FileText} label="Export PDF" onClick={() => { onExport(conv, 'pdf'); closeMenu() }} />
              <MenuButton icon={FileDown} label="Export TXT" onClick={() => { onExport(conv, 'txt'); closeMenu() }} />
              <MenuButton icon={FileDown} label="Export Markdown" onClick={() => { onExport(conv, 'markdown'); closeMenu() }} />
              <MenuDivider />
              <MenuButton icon={Trash2} label="Delete" danger onClick={() => { openConfirm(); }} />
            </>
          )}
        </div>
      )}

      {!menuOpen && (
        <button
          type="button"
          className="ai-icon-btn ai-conv-more-btn"
          onClick={e => { e.stopPropagation(); toggleMenu() }}
          aria-label="Conversation actions"
          title="More"
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function MenuButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button type="button" className={`ai-conv-menu-item${danger ? ' is-danger' : ''}`} onClick={onClick}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </button>
  )
}

function MenuDivider() {
  return <div className="ai-conv-menu-divider" role="separator" />
}

export { formatDate as formatConversationDate }