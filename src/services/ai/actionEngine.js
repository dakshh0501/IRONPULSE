// src/services/ai/actionEngine.js
// ─────────────────────────────────────────────────────────────
// AI Action Engine (Sprint 78A).
//
// Maps free-text commands to in-app UI actions. The assistant
// runs this BEFORE the routing parser: when a command matches,
// the assistant executes a real UI action instead of answering.
//
// Safety contract:
//   - Destructive verbs (delete / remove / reset / cancel /
//     clear / erase) NEVER produce an executable action. They
//     return a confirmation prompt — the assistant only describes
//     the flow, it never mutates data from the chat.
//   - Every action is role-gated; a command outside the user's
//     role simply does not match.
//
// The engine only DESCRIBES actions; actionBus delivers them to
// the page that owns the UI.
// ─────────────────────────────────────────────────────────────

import { normalizeInput } from './commandParser'

const DESTRUCTIVE_RE = /\b(?:delete|remove|reset|cancel|clear|erase)\b/i

/**
 * @param {string} raw
 * @param {string} role 'super_admin' | 'gym_admin' | 'trainer' | 'member'
 * @returns {null | {kind:'confirm', label:string, prompt:string}
 *                | {kind:'action', actionId:string, scope:string,
 *                   label:string, reply:string, navigateTo:string|null, params:Object}}
 */
export function analyzeCommand(raw, role) {
  const norm = normalizeInput(raw)
  if (!norm) return null

  // Safety first: destructive verbs → confirmation only.
  if (DESTRUCTIVE_RE.test(norm)) {
    const target = norm.replace(DESTRUCTIVE_RE, '').trim() || 'this item'
    const label = `"${target}"`
    return {
      kind: 'confirm',
      label,
      prompt:
        `Just to confirm — you asked to ${target}? I never execute destructive ` +
        'actions automatically, so nothing has changed yet. ' +
        'Reply "Yes, proceed" and I will guide you to do it safely, or "No, cancel."',
    }
  }

  const isAdmin = role === 'gym_admin' || role === 'super_admin'
  const train = role === 'trainer'
  const member = role === 'member'

  const RULES = [
    /* ── Gym admin / super admin ────────────────────────── */
    {
      ok: isAdmin && /^add (?:a |new )*member$/.test(norm),
      run: () => act('members', 'openAdd', '/members', 'the Add Member form', 'On it — opening the Add Member form.'),
    },
    {
      ok: isAdmin && /^add (?:a |new )*member named (.+)$/.test(norm),
      run: (named) => act('members', 'openAddPrefill', '/members',
        `the Add Member form for ${named}`,
        `On it — opening the Add Member form with ${named} prefilled.`,
        { name: named }),
    },
    {
      ok: isAdmin && /^add (?:a |new )*trainer$/.test(norm),
      run: () => act('trainers', 'openAdd', '/trainers', 'the Add Trainer form', 'On it — opening the Add Trainer form.'),
    },
    {
      ok: (isAdmin || train) && /^(?:create|start|make|open) (?:a |new )*(?:workout|training plan)(?: plan)?s?$/.test(norm),
      run: () => act('workouts', 'openCreate', train ? '/trainer/workouts' : '/workouts',
        'the workout plan creator', 'On it — opening the workout plan creator.'),
    },
    {
      ok: (isAdmin || train) && /^(?:create|start|make|open) (?:a |new )*(?:diet|meal plan|nutrition plan)(?: plan)?s?$/.test(norm),
      run: () => act('diet', 'openCreate', train ? '/trainer/diet' : '/diet',
        'the diet plan creator', 'On it — opening the diet plan creator.'),
    },
    {
      ok: isAdmin && /^(?:show|list|view|open) (?:me |the )?(?:pending|unpaid|overdue) (?:payments|invoices|dues)$/.test(norm),
      run: () => act('payments', 'applyFilter', '/payments', 'pending payments',
        'On it — showing pending payments.', { status: 'Pending' }),
    },
    {
      ok: isAdmin && /^(?:show|list|view|find) (?:me |the )*expiring (?:members|memberships)$/.test(norm),
      run: () => act('members', 'applyPreset', '/members', 'memberships expiring within 7 days',
        'On it — showing memberships expiring within 7 days.', { preset: 'expiring' }),
    },
    {
      ok: isAdmin && /^(?:open|go to|show) (?:the )?reports?$/.test(norm),
      run: () => act('reports', 'open', '/reports', 'Reports', 'On it — opening Reports.'),
    },
    {
      ok: isAdmin && /^(?:show|open|view) (?:the )?attendance$/.test(norm),
      run: () => act('attendance', 'open', '/attendance', 'Attendance', 'On it — opening Attendance.'),
    },

    /* ·········· Trainer ································ */
    {
      ok: train && /^(?:open|show) (?:my )?members$/.test(norm),
      run: () => act('members', 'open', '/trainer/members', 'your assigned members',
        'On it — opening your assigned members.'),
    },
    {
      ok: train && /^(?:show|open|view) (?:today's |today )?(?:client )?attendance$/.test(norm),
      run: () => act('attendance', 'open', '/trainer/attendance', 'Attendance',
        'On it — opening your attendance view.'),
    },

    /* ·· Member ·· */
    {
      ok: member && /^(?:show|open|view) my qr/.test(norm),
      run: () => act('member-dashboard', 'scrollToQr', '/member/dashboard', 'your QR code',
        'On it — scrolling to your QR check-in code.'),
    },
    {
      ok: member && /^renew (?:my )?membership/.test(norm),
      run: () => act('payments', 'open', '/member/payments', 'your payments (renewal info)',
        'On it — opening your payments; renewals and dues live there.'),
    },
    {
      ok: member && /^(?:open|show) (?:my )?payments?$/.test(norm),
      run: () => act('payments', 'open', '/member/payments', 'your payments',
        'On it — opening your payments.'),
    },
    {
      ok: member && /^(?:open|show) (?:my )?progress$/.test(norm),
      run: () => act('progress', 'open', '/member/progress', 'your progress',
        'On it — opening your progress.'),
    },
    {
      ok: member && /^(?:show|open|view) (?:my )?(?:workout|workouts|routine)s?$/.test(norm),
      run: () => act('workouts', 'open', '/member/workouts', 'your workouts',
        'On it — opening your workouts.'),
    },
    {
      ok: member && /^(?:show|open|view) (?:my )?diet$/.test(norm),
      run: () => act('diet', 'open', '/member/diet', 'your diet plans',
        'On it — opening your diet plans.'),
    },
  ]

  for (const rule of RULES) {
    if (!rule.ok) continue
    const rawMatch = raw.match(/named\s+(.+?)\s*[.!?;:]*$/i)
    const named = rawMatch ? rawMatch[1].trim().replace(/\s+/g, ' ').slice(0, 60) : null
    const result = rule.run?.(named)
    if (!result) continue
    return { kind: 'action', ...result }
  }

  return null
}

function act(scope, actionId, navigateTo, label, reply, params = {}) {
  return { scope, actionId, navigateTo, label, reply, params }
}

export default {
  analyzeCommand,
}