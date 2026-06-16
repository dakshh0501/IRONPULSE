// src/pages/WhatsAppReminders.jsx
// WhatsApp Reminder System - Phase 1
// Admin page for sending membership renewal reminders via WhatsApp

import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  generateReminders,
  getReminderSummary,
  getReminderTypeConfig
} from '../utils/whatsappReminders'

const TYPE_ORDER = ['expired', '1day', '3day', '7day']

export default function WhatsAppReminders({ search = '' }) {
  const { members } = useApp()
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  if (!isAdmin) {
  return (
    <div className="card">
      <h3>Access Denied</h3>
      <p>You do not have permission to view this page.</p>
    </div>
  )
}

  // Generate reminders from members data
  const reminders = useMemo(() => generateReminders(members), [members])
  const summary = useMemo(() => getReminderSummary(reminders), [reminders])

  // Filter reminders by search (uses global search prop)
  const filteredReminders = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return reminders
    return reminders.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.contact || '').includes(q) ||
      (r.plan || '').toLowerCase().includes(q)
    )
  }, [reminders, search])

  // Group reminders by type
  const groupedReminders = useMemo(() => {
    const groups = {}
    TYPE_ORDER.forEach(type => { groups[type] = [] })
    filteredReminders.forEach(r => {
      if (groups[r.reminderType]) groups[r.reminderType].push(r)
    })
    return groups
  }, [filteredReminders])

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  // Format phone for display
  const formatPhone = (phone) => {
    if (!phone) return '—'
    return phone.replace(/(\+91\s?)?(\d{5})(\d{5})/, '+91 $2 $3')
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>WhatsApp Reminders</h2>
          <p>Send membership renewal reminders via WhatsApp</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card teal">
          <span className="stat-icon">📅</span>
          <span className="stat-label">7 Day Reminders</span>
          <span className="stat-value" style={{ color: 'var(--teal)' }}>{summary['7day']}</span>
          <span className="stat-sub">Expiring in 7 days</span>
        </div>
        <div className="stat-card orange">
          <span className="stat-icon">⏰</span>
          <span className="stat-label">3 Day Reminders</span>
          <span className="stat-value" style={{ color: 'var(--orange)' }}>{summary['3day']}</span>
          <span className="stat-sub">Expiring in 3 days</span>
        </div>
        <div className="stat-card red">
          <span className="stat-icon">🚨</span>
          <span className="stat-label">1 Day Reminders</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{summary['1day']}</span>
          <span className="stat-sub">Expiring tomorrow</span>
        </div>
        <div className="stat-card red" style={{ borderColor: 'var(--red)' }}>
          <span className="stat-icon">❌</span>
          <span className="stat-label">Expired Members</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{summary.expired}</span>
          <span className="stat-sub">Membership expired</span>
        </div>
        <div className="stat-card" style={{ borderColor: 'var(--purple)', background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(168,85,247,0.05))' }}>
          <span className="stat-icon">📊</span>
          <span className="stat-label">Total Reminders</span>
          <span className="stat-value" style={{ color: 'var(--purple)' }}>{summary.total}</span>
          <span className="stat-sub">Members needing action</span>
        </div>
      </div>

      {/* Search Results Count */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Showing {filteredReminders.length} of {reminders.length} reminders
        </span>
      </div>

      {/* Reminder Groups */}
      {filteredReminders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h3 style={{ marginBottom: 8 }}>All caught up!</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No members currently need renewal reminders.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {TYPE_ORDER.map(type => {
            const group = groupedReminders[type]
            if (!group || group.length === 0) return null

            const config = getReminderTypeConfig(type)

            return (
              <div key={type} className="card">
                {/* Group Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  background: config.bg,
                  borderBottom: `1px solid ${config.color}30`,
                  borderRadius: 'var(--radius) var(--radius) 0 0',
                  margin: '-1px -1px 0 -1px'
                }}>
                  <span style={{ fontSize: 20 }}>{config.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: config.color }}>{config.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.length} member{group.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                {/* Reminder List */}
                <div style={{ padding: 8 }}>
                  {group.map(reminder => (
                    <div
                      key={reminder.memberId}
                      className="card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        flexWrap: 'wrap',
                        padding: 16,
                        marginBottom: 8,
                        border: `1px solid ${config.color}20`,
                        background: config.bg,
                        transition: 'all 0.2s'
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: config.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 16,
                        color: '#fff',
                        fontFamily: "'Barlow Condensed', sans-serif",
                      }}>
                        {reminder.name.trim().split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?'}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{reminder.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span>📱 {formatPhone(reminder.contact)}</span>
                          <span>📋 {reminder.plan}</span>
                          <span>📅 Expires: {formatDate(reminder.expiry)}</span>
                          <span style={{ color: config.color, fontWeight: 600 }}>{reminder.daysLeft >= 0 ? `${reminder.daysLeft} day${reminder.daysLeft !== 1 ? 's' : ''} left` : `${Math.abs(reminder.daysLeft)} day${Math.abs(reminder.daysLeft) !== 1 ? 's' : ''} ago`}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <a
                        href={reminder.whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{
                          minWidth: 140,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          flexShrink: 0
                        }}
                      >
                        <span style={{ fontSize: 16 }}>💬</span>
                        <span>Send WhatsApp</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info Note */}
      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        💡 <strong>How it works:</strong> Click "Send WhatsApp" to open WhatsApp Web/App with a pre-filled renewal message. Messages are personalized with member name, plan, expiry date, and renewal amount. No external APIs required — uses native <code>wa.me</code> deep links.
      </div>
    </div>
  )
}