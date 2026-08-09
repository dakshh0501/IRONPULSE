// src/components/ai/AiAssistant.jsx
// Floating IRONPULSE AI assistant launcher + chat panel.
// Mounted once inside the authenticated app shell, this single
// component renders:
//   • the floating launcher (visible on every authenticated page)
//   • the responsive chat panel (bottom-right / bottom-sheet)
//
// It does not talk to any AI provider (Sprint 77A — foundation).

import { useEffect, useState, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import ChatPanel from './ChatPanel'
import './ai-assistant.css'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  gym_admin:   'Gym Admin',
  trainer:     'Trainer',
  member:      'Member',
}

export default function AiAssistant() {
  const { isLoggedIn, role, effectiveRole, userProfile } = useAuth()
  const [open, setOpen] = useState(false)
  const launcherRef = useRef(null)

  // Close on Escape; return focus to the launcher.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const normRole = effectiveRole || role
  // Assistant only exists for signed-in users on authenticated pages.
  if (!isLoggedIn || !normRole) return null

  const roleLabel = ROLE_LABELS[normRole] || (normRole === 'admin' ? 'Gym Admin' : 'User')
  const aiRole = normRole === 'admin' ? 'gym_admin' : normRole

  return (
    <>
      <ChatPanel
        role={aiRole}
        roleLabel={roleLabel}
        userName={userProfile?.name || ''}
        gymName={userProfile?.gymName || ''}
        open={open}
        onClose={() => setOpen(false)}
      />

      <button
        ref={launcherRef}
        type="button"
        className={`ai-launcher${open ? ' is-open' : ''}`}
        onClick={() => setOpen(p => !p)}
        aria-label={open ? 'Close Pulse AI assistant' : 'Open Pulse AI assistant'}
        aria-expanded={open}
        aria-controls="pulse-ai-panel"
        aria-haspopup="dialog"
      >
        {open ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
        <span className="ai-launcher-ring" aria-hidden="true" />
      </button>
    </>
  )
}