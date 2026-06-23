// src/utils/theme.js
// Single source of truth for applying the gym's accent color across the
// entire app via CSS custom properties.
//
// Why this reaches every page without touching every component:
// Buttons, badges, the sidebar logo, stat cards, and most inline
// highlight colors in Dashboard/Reports/Attendance/TrainerDashboard
// already read color from var(--orange) / var(--orange-lit) rather
// than a hardcoded hex. Updating those two variables on the document
// root updates every consumer instantly, everywhere — no re-render,
// no prop drilling, no per-file changes required.

export const DEFAULT_ACCENT     = '#e8420a'
const DEFAULT_ACCENT_LIT        = '#ff5520' // exact original --orange-lit value

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const bigint = parseInt(full, 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

function lighten(hex, percent) {
  const { r, g, b } = hexToRgb(hex)
  const amt = Math.round((percent / 100) * 255)
  const clamp = (v) => Math.min(255, v + amt)
  const toHex = (v) => v.toString(16).padStart(2, '0')
  return `#${toHex(clamp(r))}${toHex(clamp(g))}${toHex(clamp(b))}`
}

/**
 * Applies an accent color to the whole app instantly.
 * Safe to call repeatedly (idempotent) — used on app mount, on login,
 * on Settings page load, and live as the user clicks a swatch.
 *
 * @param {string} hex - e.g. '#e8420a'
 */
export function applyAccentColor(hex) {
  if (!hex) return
  const root = document.documentElement
  const { r, g, b } = hexToRgb(hex)

  // Exact-match the original default so zero customization = zero visual change
  const lit = hex.toLowerCase() === DEFAULT_ACCENT.toLowerCase()
    ? DEFAULT_ACCENT_LIT
    : lighten(hex, 12)

  // Forward-looking canonical variables (for any new code going forward)
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--accent-lit', lit)

  // Drive the existing brand variables so every current consumer
  // (buttons, badges, sidebar logo, stat cards, dashboard/report/
  // attendance/trainer inline highlights) updates instantly with
  // zero changes to those files.
  root.style.setProperty('--orange', hex)
  root.style.setProperty('--orange-lit', lit)
}