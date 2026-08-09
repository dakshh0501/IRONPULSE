// src/components/ai/SuggestionChips.jsx
// Role-aware suggested prompts. Clicking a chip sends it as a
// user message, exactly like typing it manually.

import { Sparkles } from 'lucide-react'

export const ROLE_PROMPTS = {
  super_admin: [
    'Which gyms are awaiting approval?',
    'What is platform revenue?',
    'List active gym subscriptions',
    'Create a platform usage report',
  ],
  gym_admin: [
    'How many check-ins today?',
    'Which members have pending dues?',
    'What is revenue this month?',
    'How do I create a workout plan?',
  ],
  trainer: [
    'Show my assigned clients',
    'How do I assign a diet plan?',
    'Summarize a client progress log',
    'Update member attendance',
  ],
  member: [
    'What is my payment status?',
    'When was my last check-in?',
    'Show me my workout plan',
    'Show me my diet plan',
  ],
}

export default function SuggestionChips({ role, onPick, disabled }) {
  const prompts = ROLE_PROMPTS[role] || ROLE_PROMPTS.gym_admin

  return (
    <div className="ai-chips">
      <div className="ai-chips-title">
        <Sparkles size={11} aria-hidden="true" />
        <span>Suggested for you</span>
      </div>
      <div className="ai-chips-row">
        {prompts.map(prompt => (
          <button
            key={prompt}
            type="button"
            className="ai-chip"
            onClick={() => onPick(prompt)}
            disabled={disabled}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}