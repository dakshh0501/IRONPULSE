export const NOTIF_TYPES = {
  gym_registered:    { type: 'gym',        icon: '🏢', priority: 'high' },
  gym_approved:      { type: 'gym',        icon: '✅', priority: 'high' },
  gym_rejected:      { type: 'gym',        icon: '❌', priority: 'high' },
  gym_suspended:     { type: 'gym',        icon: '⚠️', priority: 'high' },
  member_added:      { type: 'member',     icon: '👤', priority: 'normal' },
  member_deleted:    { type: 'member',     icon: '🗑', priority: 'normal' },
  member_expiry:     { type: 'member',     icon: '⏰', priority: 'normal' },
  trainer_added:     { type: 'trainer',    icon: '🏋️', priority: 'normal' },
  trainer_removed:   { type: 'trainer',    icon: '🚫', priority: 'normal' },
  payment_received:  { type: 'payment',    icon: '💳', priority: 'normal' },
  payment_overdue:   { type: 'payment',    icon: '🔴', priority: 'high' },
  invoice_generated: { type: 'payment',    icon: '📄', priority: 'normal' },
  qr_success:        { type: 'attendance', icon: '✅', priority: 'low' },
  qr_failed:         { type: 'attendance', icon: '❌', priority: 'low' },
  workout_assigned:  { type: 'workout',    icon: '💪', priority: 'normal' },
  diet_assigned:     { type: 'diet',       icon: '🥗', priority: 'normal' },
  progress_updated:  { type: 'progress',   icon: '📈', priority: 'low' },
  whatsapp_created:  { type: 'whatsapp',   icon: '💬', priority: 'low' },
  whatsapp_sent:     { type: 'whatsapp',   icon: '📤', priority: 'low' },
  whatsapp_failed:   { type: 'whatsapp',   icon: '❌', priority: 'high' },
  whatsapp_delivered:{ type: 'whatsapp',   icon: '✅', priority: 'low' },
  ticket_opened:     { type: 'support',    icon: '🎫', priority: 'normal' },
  ticket_replied:    { type: 'support',    icon: '💬', priority: 'normal' },
  system_login:      { type: 'system',     icon: '🔑', priority: 'low' },
  system_logout:     { type: 'system',     icon: '🚪', priority: 'low' },
  system_offline:    { type: 'system',     icon: '📡', priority: 'high' },
  system_fn_error:   { type: 'system',     icon: '⚠️', priority: 'high' },
}

export function buildNotification(notifKey, data) {
  const def = NOTIF_TYPES[notifKey]
  if (!def) return null
  return {
    userId: data.userId || '',
    gymId: data.gymId || 'default',
    role: data.role || '',
    title: data.title || '',
    message: data.message || '',
    type: def.type,
    subtype: notifKey,
    priority: def.priority,
    icon: def.icon,
    actionUrl: data.actionUrl || '',
    relatedDocumentId: data.relatedDocumentId || '',
    read: false,
    createdAt: null,
  }
}
