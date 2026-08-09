// src/components/ai/InsightCards.jsx
// ─────────────────────────────────────────────────────────────
// Sprint 79E — insight presentation widgets.
//
// `InsightCards`  — embedded in assistant chat bubbles (uses the
//                   ai-* class system; severity-colored cards with
//                   expand/collapse).
// `InsightsPanel` — dashboard card (reuses .card/.section-title
//   design system) showing a health score + top insights.
//
// Both are pure presentational components: the Insight Engine
// (insightEngine.js) computes the data; these just render it.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'

export const SEVERITY_STYLE = {
  CRITICAL: { color: 'var(--red)', bg: 'rgba(239,68,68,0.10)', label: 'Critical' },
  WARNING:  { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)', label: 'Warning' },
  SUCCESS:  { color: 'var(--green)', bg: 'rgba(34,197,94,0.10)', label: 'Good' },
  INFO:     { color: 'var(--teal)',  bg: 'rgba(0,200,180,0.10)',  label: 'Info' },
}

export function SeverityBadge({ severity, size = 'sm' }) {
  const s = SEVERITY_STYLE[severity] || SEVERITY_STYLE.INFO
  return (
    <span
      className={`ai-sev-badge ai-sev-badge-${size}`}
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}33` }}
    >
      {s.label}
    </span>
  )
}

function HealthScoreRow({ health, onToggle, expanded }) {
  if (!health) return null
  const score = Math.max(0, Math.min(100, Math.round(Number(health.score) || 0)))
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)'
  return (
    <div className="ai-health-card">
      <button
        type="button"
        className="ai-health-main"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label="Health score details"
      >
        <div className="ai-health-score" style={{ color }}>{score}</div>
        <div className="ai-health-info">
          <div className="ai-health-title">Health Score</div>
          <div className="ai-health-status" style={{ color }}>{health.status || '—'}</div>
        </div>
        <ChevronDown size={14} className={`ai-health-chev${expanded ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="ai-health-details">
          {(health.reasons || []).map((r, i) => (
            <div key={i} className="ai-health-reason"><span aria-hidden="true">•</span> {r}</div>
          ))}
          {(health.dimensions || []).slice(0, 4).map(d => (
            <div key={d.key} className="ai-health-dim">
              <span>{d.label}</span>
              <div className="ai-health-bar">
                <div className="ai-health-bar-fill" style={{ width: `${Math.max(0, Math.min(100, d.score))}%`, background: d.score >= 70 ? 'var(--green)' : d.score >= 40 ? 'var(--amber)' : 'var(--red)' }} />
              </div>
              <span className="ai-health-dim-val">{Math.round(d.score)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight, defaultExpanded = false }) {
  const [open, setOpen] = useState(false)
  const expanded = open || defaultExpanded
  const s = SEVERITY_STYLE[insight.severity] || SEVERITY_STYLE.INFO

  return (
    <div className="ai-insight-card" style={{ borderLeft: `3px solid ${s.color}` }}>
      <button
        type="button"
        className="ai-insight-head"
        onClick={() => setOpen(o => !o)}
        aria-expanded={expanded}
        aria-label={`${insight.title} — ${expanded ? 'collapse' : 'expand'}`}
      >
        <SeverityBadge severity={insight.severity} />
        <span className="ai-insight-title">{insight.title}</span>
        <ChevronDown size={14} className={`ai-insight-chev${expanded ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="ai-insight-body">
          <div className="ai-insight-msg">{insight.message}</div>
          {(insight.recommendations || []).length > 0 && (
            <ul className="ai-insight-recs">
              {(insight.recommendations || []).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Chat-bubble insight block: optional health score + insight list
 * with severity badges, recommendation sections, expand/collapse.
 */
export default function InsightCards({ insights = [], health, defaultExpanded = 2, limit = 5 }) {
  const list = useMemo(() => (Array.isArray(insights) ? insights.slice(0, limit) : []), [insights, limit])
  if (list.length === 0 && !health) return null
  return (
    <div className="ai-insight-cards">
      {health && <HealthScoreRow health={health} />}
      {list.map((ins, i) => (
        <InsightCard key={ins.id || i} insight={ins} defaultExpanded={i < defaultExpanded} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD VARIANT (design-system `.card` / inline styles)
   ══════════════════════════════════════════════════════════ */

function HealthScorePanel({ health, limit = 4 }) {
  if (!health) return null
  const score = Math.max(0, Math.min(100, Math.round(Number(health.score) || 0)))
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)'
  return (
    <div className="card" style={{ gridColumn: 'span 1' }}>
      <div className="section-title" style={{ marginBottom: 14 }}><span aria-hidden="true">🩺</span> Health Score</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22, fontWeight: 800, color,
          background: `${color}14`, border: `3px solid ${color}44`,
        }}>
          {score}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{health.status || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>out of 100</div>
        </div>
      </div>
      {(health.reasons || []).slice(0, limit).map((r, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
          <span aria-hidden="true">·</span>{r}
        </div>
      ))}
    </div>
  )
}

function InsightRow({ insight }) {
  const s = SEVERITY_STYLE[insight.severity] || SEVERITY_STYLE.INFO
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)',
      alignItems: 'flex-start',
    }}>
      <span style={{
        flexShrink: 0, width: 8, height: 8, borderRadius: '50%', marginTop: 5, background: s.color,
      }} aria-hidden="true" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="ai-sev-badge" style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}33` }}>{s.label}</span>
          {insight.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{insight.message}</div>
        {(insight.recommendations || []).length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 6, display: 'flex', gap: 6 }}>
            <Lightbulb size={12} style={{ flexShrink: 0, marginTop: 2, color: 'var(--amber)' }} aria-hidden="true" />
            <span style={{ color: 'var(--text-muted)' }}>{insight.recommendations.join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Dashboard widget: health score card + top insights with severity
 * badges and recommendations. Uses design-system tokens only.
 */
export function InsightsPanel({ insights = [], health, title = 'AI Insights', limit = 4, showHealth = true }) {
  const list = useMemo(() => (Array.isArray(insights) ? insights.slice(0, limit) : []), [insights, limit])
  if (list.length === 0 && !health) return null
  return (
    <div style={{ marginTop: 18 }}>
      <div className="settings-section-header" style={{ marginBottom: 12, paddingBottom: 10 }}>
        <div>
          <div className="settings-section-title-row">
            <span className="settings-section-icon" aria-hidden="true">✨</span>
            <h3 className="settings-section-title">{title}</h3>
          </div>
          <p className="settings-section-desc" style={{ marginLeft: 30 }}>Live analysis from your gym data</p>
        </div>
      </div>
      <div className="stats-grid" style={{ alignItems: 'stretch', gridAutoRows: '1fr' }}>
        {showHealth && health && <HealthScorePanel health={health} limit={2} />}
        <div className="card" style={{ gridColumn: showHealth && health ? 'span 2' : 'span 1', minWidth: 0 }}>
          <div className="section-title" style={{ marginBottom: 6 }}><span aria-hidden="true">💡</span> Top Insights</div>
          {list.map(ins => <InsightRow key={ins.id} insight={ins} />)}
          {list.length === 0 && <p className="muted-text" style={{ padding: '8px 0' }}>No insights yet — add members and attendance to see live analysis.</p>}
        </div>
      </div>
    </div>
  )
}