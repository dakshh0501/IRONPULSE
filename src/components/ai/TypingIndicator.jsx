// src/components/ai/TypingIndicator.jsx
// Three-dot animated "assistant is typing" indicator.

export default function TypingIndicator() {
  return (
    <span className="ai-typing" role="status" aria-label="Assistant is typing">
      <span className="ai-typing-dot" aria-hidden="true" />
      <span className="ai-typing-dot" aria-hidden="true" />
      <span className="ai-typing-dot" aria-hidden="true" />
    </span>
  )
}