// src/services/ai/chatExporter.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Conversation export (Sprint 79C).
// Formats: PDF (jsPDF — same utility the Reports page uses),
// TXT and Markdown. All three build the same linear transcript
// and download the file via Blob.
// ─────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf'

/* ══════════════════════════════════════════════════════════
   SHARED FORMATTING
   ══════════════════════════════════════════════════════════ */

/** Crude markdown → plain text, good enough for PDF/TXT export. */
function plainText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, (block) => {
      const code = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      return '\n' + code
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
}

function roleLabel(role) {
  return role === 'user' ? 'You' : 'Pulse AI'
}

function safeName(s) {
  const base = String(s || 'conversation')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 48)
  return base || 'conversation'
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Standard meta lines (name / gym / role / message count / date). */
function buildMeta(payload = {}) {
  const { userName, gymName, role, messages } = payload
  return [
    ...(userName ? [`Name: ${userName}`] : []),
    ...(gymName ? [`Gym: ${gymName}`] : []),
    ...(role ? [`Role: ${String(role).replace('_', ' ')}`] : []),
    `Messages: ${(messages || []).filter(m => m && m.text).length}`,
    `Exported: ${new Date().toLocaleString()}`,
  ]
}

/* ══════════════════════════════════════════════════════════
   TXT
   ══════════════════════════════════════════════════════════ */

export function exportChatTxt({ title = 'Conversation', meta = [], messages = [] }) {
  const lines = [
    'IRONPULSE AI — Conversation',
    `Title: ${title}`,
    ...meta.map(m => m),
    '──────────────────────────────────────',
    '',
  ]
  for (const m of messages || []) {
    if (!m || !m.role || !m.text) continue
    lines.push(`${roleLabel(m.role)}${m.time ? ` (${m.time})` : ''}:`)
    lines.push(plainText(m.text))
    lines.push('')
  }
  return lines.join('\n')
}

/* ══════════════════════════════════════════════════════════
   MARKDOWN
   ══════════════════════════════════════════════════════════ */

export function exportChatMarkdown({ title = 'Conversation', meta = [], messages = [] }) {
  const lines = [
    `# ${title}`,
    '',
    ...(meta || []).map(m => `> ${m}`),
    '',
    '---',
    '',
  ]
  for (const m of messages || []) {
    if (!m || !m.role || !m.text) continue
    lines.push(`### ${roleLabel(m.role)}${m.time ? ` — ${m.time}` : ''}`, '', m.text, '')
  }
  return lines.join('\n')
}

/* ══════════════════════════════════════════════════════════
   PDF (jsPDF — same library as the Reports page)
   ══════════════════════════════════════════════════════════ */

export function exportChatPdf({ title = 'Conversation', meta = [], messages = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const maxW = 196 - margin * 2
  let y = 18

  const line = (text, size, colorHex) => {
    doc.setFontSize(size)
    doc.setTextColor(...colorHex)
    const wrapped = doc.splitTextToSize(text, maxW)
    for (const w of wrapped) {
      if (y > 282) { doc.addPage(); y = 18 }
      doc.text(w, margin, y)
      y += size * 0.5 + 1.6
    }
  }

  const hr = () => {
    y += 1.5
    if (y > 282) { doc.addPage(); y = 18 }
    doc.setDrawColor(215, 215, 215)
    doc.line(margin, y, margin + maxW, y)
    y += 3.5
  }

  line('IRONPULSE AI — Conversation', 16, [232, 66, 10])
  hr()
  line(title || 'Conversation', 13, [30, 30, 30])
  for (const n of meta || []) line(n, 9, [140, 140, 140])
  hr()

  for (const m of messages || []) {
    if (!m || !m.role || !m.text) continue
    line(`${roleLabel(m.role)}${m.time ? `  (${m.time})` : ''}`, 10.5, [232, 66, 10])
    for (const part of plainText(m.text).split('\n')) {
      line(part || ' ', 9.5, [60, 60, 60])
    }
    hr()
  }

  doc.save(`ironpulse-chat-${safeName(title)}.pdf`)
}

/* ══════════════════════════════════════════════════════════
   FACADE — format dispatch
   ══════════════════════════════════════════════════════════ */

/**
 * Exports a conversation.
 * @param {'pdf'|'txt'|'markdown'} format
 * @param {Object} payload — { title, messages, gymName, userName, role }
 */
export function exportChat(format, payload) {
  const { title = 'Conversation', messages = [] } = payload || {}
  const meta = buildMeta(payload)
  const base = safeName(title)

  if (format === 'txt') {
    download(`ironpulse-chat-${base}.txt`, exportChatTxt({ title, meta, messages }), 'text/plain;charset=utf-8')
  } else if (format === 'markdown') {
    download(`ironpulse-chat-${base}.md`, exportChatMarkdown({ title, meta, messages }), 'text/markdown;charset=utf-8')
  } else {
    exportChatPdf({ title, meta, messages })
  }
}

export default {
  exportChat,
  exportChatTxt,
  exportChatMarkdown,
  exportChatPdf,
}