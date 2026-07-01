import { SUPPORT_WHATSAPP } from '../config/support'

export function buildSupportWhatsAppMessage({ user, gym, page, issue, extra } = {}) {
  const isGuest = !user && !gym
  const gymName = gym?.name || gym?.gymName || (isGuest ? 'Guest' : 'Not Available')
  const ownerName = user?.name || user?.displayName || (isGuest ? 'Guest' : 'Not Available')
  const email = user?.email || (isGuest ? 'Not Provided' : 'Not Provided')
  const plan = gym?.plan || (isGuest ? 'N/A' : 'Not Available')

  return `Hello IRONPULSE Support 👋

I need assistance.

━━━━━━━━━━━━━━━━━━

Page:
${page || 'N/A'}

Issue:
${issue || 'N/A'}

Gym:
${gymName}

Owner:
${ownerName}

Email:
${email}

Plan:
${plan}

━━━━━━━━━━━━━━━━━━

Additional Information:

${extra || 'None'}

Thank you.`
}

export function buildSupportWhatsAppLink(opts = {}) {
  const message = buildSupportWhatsAppMessage(opts)
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`
}

export function openSupportWhatsApp(opts = {}) {
  const link = buildSupportWhatsAppLink(opts)
  window.open(link, '_blank', 'noopener,noreferrer')
}
