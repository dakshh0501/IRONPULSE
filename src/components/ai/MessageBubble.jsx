// src/components/ai/MessageBubble.jsx
// Single chat message — user vs assistant variant.
// Assistant text is rendered through the safe, dependency-free
// MarkdownText renderer (bullets, lists, bold, code blocks).

import { Bot, User } from 'lucide-react'
import MarkdownText from './MarkdownText'
import InsightCards from './InsightCards'

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const showInsights = !isUser && (Array.isArray(message.insights) || message.health)

  return (
    <div className={`ai-msg ai-msg-${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="ai-msg-avatar" aria-hidden="true">
          <Bot size={14} />
        </div>
      )}
      <div className="ai-msg-body">
        <div className="ai-msg-bubble">
          {isUser ? message.text : <MarkdownText text={message.text} />}
        </div>
        {showInsights && (
          <InsightCards insights={message.insights} health={message.health} />
        )}
        <div className="ai-msg-time">
          {isUser && <User size={10} aria-hidden="true" />}
          {message.time}
        </div>
      </div>
    </div>
  )
}