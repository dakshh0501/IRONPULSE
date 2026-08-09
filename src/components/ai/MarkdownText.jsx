// src/components/ai/MarkdownText.jsx
// Minimal, dependency-free Markdown renderer for assistant replies.
//
// Supports the subset Gemini is expected to return:
//   - ``` fenced code blocks
//   - "- bullet" lists          (also "* bullet")
//   - "1. numbered" lists
//   - **bold**, `inline code`, *italic*
//
// Builds React elements only — never uses dangerouslySetInnerHTML,
// so assistant text can never inject raw HTML.

import { Fragment } from 'react'

function renderInline(text, keyBase) {
  const parts = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0
  let m
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyBase}-${i++}`
    if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('*')) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const BULLET_RE = /^\s*[-*+]\s+(.*)$/
const NUMBERED_RE = /^\s*(\d+)[.)]\s+(.*)$/

export default function MarkdownText({ text }) {
  if (!text) return null
  const source = String(text).replace(/\r\n/g, '\n')

  const blocks = []
  let codeBuf = null
  let buf = []
  let list = null
  let listKey = 0

  const flushText = () => {
    if (buf.length === 0) return
    const paragraph = buf
      .filter(l => l.trim())
      .map((l, i) => <Fragment key={`p-${i}`}>{renderInline(l)}<br /></Fragment>)
    if (paragraph.length) blocks.push(<p key={`par-${blocks.length}`}>{paragraph}</p>)
    buf = []
  }

  const closeList = () => {
    flushText()
    if (list) {
      const items = list.items
      const cls = list.type === 'ol' ? 'ai-md-ol' : 'ai-md-ul'
      blocks.push(
        list.type === 'ol'
          ? <ol key={`lst-${listKey++}`} className={cls}>{items}</ol>
          : <ul key={`lst-${listKey++}`} className={cls}>{items}</ul>
      )
      list = null
    }
  }

  for (const line of source.split('\n')) {
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      if (list) closeList()
      if (codeBuf !== null) {
        flushText()
        blocks.push(<pre key={`code-${listKey++}`} className="ai-md-pre"><code>{codeBuf}</code></pre>)
        codeBuf = null
      } else {
        flushText()
        codeBuf = ''
      }
      continue
    }

    if (codeBuf !== null) {
      codeBuf += (codeBuf ? '\n' : '') + line
      continue
    }

    const bullet = trimmed.match(BULLET_RE)
    if (bullet) {
      if (list && list.type !== 'bulleted') closeList()
      if (!list) { list = { type: 'bulleted', items: [] }; buf = [] }
      list.items.push(<li key={list.items.length}>{renderInline(bullet[1])}</li>)
      continue
    }

    const numbered = trimmed.match(NUMBERED_RE)
    if (numbered) {
      if (list && list.type !== 'ordered') closeList()
      if (!list) { list = { type: 'ordered', items: [] }; buf = [] }
      list.items.push(<li key={list.items.length}>{renderInline(numbered[2])}</li>)
      continue
    }

    if (list && trimmed === '') {
      closeList()
      continue
    }

    if (list) { closeList() }
    buf.push(line)
  }

  if (codeBuf !== null) {
    flushText()
    blocks.push(<pre key={`code-${listKey++}`} className="ai-md-pre"><code>{codeBuf}</code></pre>)
  }
  closeList()
  flushText()

  // Plain single-line replies render as one paragraph (no padding).
  return <div className="ai-md">{blocks}</div>
}