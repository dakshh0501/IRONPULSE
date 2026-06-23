// src/utils/whatsappReminders.js
// WhatsApp Reminder System - Phase 1
// Pure utility functions for reminder detection and message generation

/**
 * Calculate days until expiry from today
 * @param {string} expiryDate - ISO date string (YYYY-MM-DD)
 * @returns {number} Days until expiry (negative if expired)
 */
export function getDaysUntilExpiry(expiryDate) {
  if (!expiryDate) return null
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const expiry = new Date(`${expiryDate}T00:00:00`)
  expiry.setHours(0, 0, 0, 0)
  
  const diffTime = expiry - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  return diffDays
}

/**
 * Determine reminder type based on days until expiry
 * @param {number} daysLeft - Days until expiry
 * @returns {string} Reminder type: '7day' | '3day' | '1day' | 'expired' | null
 */
export function getReminderType(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return null
  
  if (daysLeft === 7) return '7day'
  if (daysLeft === 3) return '3day'
  if (daysLeft === 1) return '1day'
  if (daysLeft < 0 && daysLeft >= -30) return 'expired'  
  return null
}

/**
 * Generate professional gym renewal reminder message
 * @param {Object} member - Member object with name, plan, expiry, planPrice
 * @param {string} type - Reminder type: '7day' | '3day' | '1day' | 'expired'
 * @param {string} gymName - Gym name for branding
 * @returns {string} Formatted message for WhatsApp
 */
export function generateReminderMessage(member, type, gymName = 'IronForge Gym') {
  const { name, plan, expiry, planPrice } = member
  const formattedExpiry = expiry ? new Date(expiry).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : 'N/A'
  
  const priceText = planPrice ? `₹${planPrice.toLocaleString('en-IN')}` : 'your plan amount'
  
  const templates = {
    '7day': `Hi ${name}! 👋

This is a friendly reminder from ${gymName} that your ${plan} membership expires in 7 days on ${formattedExpiry}.

To continue enjoying uninterrupted access to all facilities, please renew your membership before the expiry date.

Renewal Amount: ${priceText}

Visit the front desk or reply to this message to process your renewal.

Thank you for being a valued member! 💪

— Team ${gymName}`,

    '3day': `Hi ${name}! ⏰

Your ${plan} membership at ${gymName} expires in 3 days on ${formattedExpiry}.

Don't let your fitness journey pause! Renew now to maintain continuous access.

Renewal Amount: ${priceText}

Visit the front desk or reply to this message to complete your renewal.

See you at the gym! 🏋️

— Team ${gymName}`,

    '1day': `Hi ${name}! 🚨

URGENT: Your ${plan} membership expires TOMORROW (${formattedExpiry}).

This is your final reminder to renew and avoid losing access to ${gymName} facilities.

Renewal Amount: ${priceText}

Please visit the front desk TODAY or reply immediately to process your renewal.

Don't break your streak! 💪

— Team ${gymName}`,

    'expired': `Hi ${name}! 😔

Your ${plan} membership at ${gymName} has expired on ${formattedExpiry}.

We miss seeing you at the gym! Your access has been paused, but you can reactivate instantly by renewing.

Renewal Amount: ${priceText}

Visit the front desk or reply to this message to restore your membership and get back to your fitness goals.

Welcome back! 🏋️

— Team ${gymName}`
  }
  
  return templates[type] || templates['7day']
}

/**
 * Build WhatsApp deep link with pre-filled message
 * @param {string} phone - Phone number (e.g., "+91 98765 43210")
 * @param {string} message - Pre-filled message text
 * @returns {string} WhatsApp wa.me URL
 */
export function buildWhatsAppLink(phone, message) {
  if (!phone) return '#'
  
  // Clean phone number: remove spaces, dashes, parentheses, plus sign
  const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '')
  
  // Ensure it starts with country code (default to 91 for India if not present)
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message)
  
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`
}

/**
 * Process members array and generate reminders
 * @param {Array} members - Array of member objects from Firestore
 * @param {string} gymName - Gym name for branding
 * @returns {Array} Array of reminder objects with member data and reminder info
 */
export function generateReminders(members, gymName = 'IronForge Gym') {
  if (!Array.isArray(members)) return []
  
  const reminders = []
  
  members.forEach(member => {
    // Skip if no contact or expiry
    if (!member.contact || !member.expiry) return
    
    // Skip expired status members (they're already in expired category)
    // Actually, include them - they need expired reminders
    
    const daysLeft = getDaysUntilExpiry(member.expiry)
    const reminderType = getReminderType(daysLeft)
    
    if (reminderType) {
      const message = generateReminderMessage(member, reminderType, gymName)
      const whatsappLink = buildWhatsAppLink(member.contact, message)
      
      reminders.push({
        memberId: member.id,
        name: member.name,
        contact: member.contact,
        plan: member.plan,
        expiry: member.expiry,
        planPrice: member.planPrice,
        daysLeft,
        reminderType,
        message,
        whatsappLink,
        status: member.status,
        lastReminderSent: null,
      })
    }
  })
  
  // Sort by urgency: expired first, then 1day, 3day, 7day
  const typeOrder = { expired: 0, '1day': 1, '3day': 2, '7day': 3 }
  reminders.sort((a, b) => typeOrder[a.reminderType] - typeOrder[b.reminderType])
  
  return reminders
}

/**
 * Get reminder summary counts for dashboard cards
 * @param {Array} reminders - Array of reminder objects
 * @returns {Object} Summary counts
 */
export function getReminderSummary(reminders) {
  return {
    total: reminders.length,
    expired: reminders.filter(r => r.reminderType === 'expired').length,
    '1day': reminders.filter(r => r.reminderType === '1day').length,
    '3day': reminders.filter(r => r.reminderType === '3day').length,
    '7day': reminders.filter(r => r.reminderType === '7day').length,
  }
}

/**
 * Get reminder type display config
 * @param {string} type - Reminder type
 * @returns {Object} Display config with label, color, icon
 */
export function getReminderTypeConfig(type) {
  const configs = {
    '7day': { label: '7 Days Left', color: 'var(--teal)', bg: 'rgba(0,200,180,0.1)', icon: '📅' },
    '3day': { label: '3 Days Left', color: 'var(--orange)', bg: 'rgba(245,158,11,0.1)', icon: '⏰' },
    '1day': { label: '1 Day Left', color: 'var(--red)', bg: 'rgba(239,68,68,0.1)', icon: '🚨' },
    'expired': { label: 'Expired', color: 'var(--red)', bg: 'rgba(239,68,68,0.1)', icon: '❌' },
  }
  return configs[type] || configs['7day']
}

/**
 * Build WhatsApp message for diet plan sharing
 * @param {Object} plan - Diet plan object
 * @param {string} gymName - Gym name for branding
 * @returns {string} Formatted message for WhatsApp
 */
export function buildDietPlanWhatsAppMessage(plan, gymName = 'IronForge Gym') {
  const { name, goal, calories, protein, carbs, fat, assignedMember, assignedTrainer, duration, meals } = plan
  
  const mealLines = meals.map((meal, i) => 
    `${i + 1}. ${meal.name} (${meal.time}) - ${meal.calories} kcal\n   ${meal.items.join(', ')}`
  ).join('\n\n')
  
  return `🍽️ *${name}*\n\n` +
    `🏋️ *Gym:* ${gymName}\n` +
    `🎯 *Goal:* ${goal}\n` +
    `⏱ *Duration:* ${duration}\n\n` +
    `📊 *Macros (Daily)*\n` +
    `• Calories: ${calories.toLocaleString()} kcal\n` +
    `• Protein: ${protein}g\n` +
    `• Carbs: ${carbs}g\n` +
    `• Fat: ${fat}g\n\n` +
    `👤 *Member:* ${assignedMember}\n` +
    `🏋️ *Trainer:* ${assignedTrainer}\n\n` +
    `📋 *Meal Schedule*\n${mealLines}\n\n` +
    `---\n` +
    `Shared from ${gymName} Gym Management App`
}

/**
 * Build WhatsApp share link for diet plan (no phone number - opens contact picker)
 * @param {string} message - Pre-filled message text
 * @returns {string} WhatsApp wa.me URL with contact picker
 */
export function buildDietPlanWhatsAppLink(message) {
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/?text=${encodedMessage}`
}

/**
 * Build WhatsApp message for workout plan sharing
 * @param {Object} plan - Workout plan object
 * @param {string} gymName - Gym name for branding
 * @returns {string} Formatted message for WhatsApp
 */
export function buildWorkoutPlanWhatsAppMessage(plan, gymName = 'IronForge Gym') {
  const { name, goal, level, days, duration, exercises, member, trainer } = plan
  const exerciseCount = exercises?.length || 0
  
  const exerciseLines = exercises?.map((ex, i) => 
    `${i + 1}. ${ex.name} — ${ex.sets}×${ex.reps} (${ex.rest}) [${ex.muscle}]`
  ).join('\n') || 'No exercises added'
  
  const muscleGroups = exercises?.length > 0 
    ? [...new Set(exercises.map(e => e.muscle))].join(', ')
    : 'N/A'

  return `💪 *${name}*\n\n` +
    `🏋️ *Gym:* ${gymName}\n` +
    `🎯 *Goal:* ${goal}\n` +
    `📊 *Level:* ${level}\n` +
    `📅 *Days/Week:* ${days}x\n` +
    `⏱ *Session Duration:* ${duration}\n` +
    `💪 *Total Exercises:* ${exerciseCount}\n` +
    `🎯 *Muscles Targeted:* ${muscleGroups}\n\n` +
    `📋 *Exercise List*\n${exerciseLines}\n\n` +
    `👤 *Assigned Member:* ${member || 'Unassigned'}\n` +
    `🏋️ *Assigned Trainer:* ${trainer || 'Unassigned'}\n\n` +
    `---\n` +
    `Shared from ${gymName} Gym Management App`
}

/**
 * Build WhatsApp share link for workout plan (no phone number - opens contact picker)
 * @param {string} message - Pre-filled message text
 * @returns {string} WhatsApp wa.me URL with contact picker
 */
export function buildWorkoutPlanWhatsAppLink(message) {
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/?text=${encodedMessage}`
}

/**
 * Build WhatsApp message for payment receipt sharing
 * @param {Object} invoice - Payment invoice object
 * @param {string} gymName - Gym name for branding
 * @param {Object} gymSettings - Gym settings object (contact, address, email)
 * @returns {string} Formatted message for WhatsApp
 */
export function buildPaymentReceiptWhatsAppMessage(invoice, gymName = 'IronForge Gym', gymSettings = {}) {
  const { 
    id, 
    member, 
    memberName, 
    plan, 
    amount, 
    paid, 
    method, 
    paidOn, 
    status 
  } = invoice
  
  const memberDisplayName = member || memberName || 'Member'
  const contactInfo = gymSettings.contact ? `\n📞 ${gymSettings.contact}` : ''
  const addressInfo = gymSettings.address ? `\n📍 ${gymSettings.address}` : ''
  const emailInfo = gymSettings.email ? `\n📧 ${gymSettings.email}` : ''
  
  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const timestamp = new Date().toLocaleString('en-IN')
  
  return `🧾 *PAYMENT RECEIPT*\n\n` +
    `🏋️ *${gymName}*${contactInfo}${addressInfo}${emailInfo}\n\n` +
    `📋 *Receipt #:* ${id}\n` +
    `👤 *Member:* ${memberDisplayName}\n` +
    `📦 *Plan:* ${plan}\n` +
    `💰 *Amount Paid:* ${fmt(paid || amount)}\n` +
    `💳 *Method:* ${method || '—'}\n` +
    `📅 *Payment Date:* ${fmtDate(paidOn)}\n` +
    `✅ *Status:* ${status}\n\n` +
    `🕐 *Generated:* ${timestamp}\n\n` +
    `Thank you for your payment! We appreciate your business.\n\n` +
    `---\n` +
    `Generated from ${gymName} Gym Management App`
}

/**
 * Build WhatsApp share link for payment receipt (no phone number - opens contact picker)
 * @param {string} message - Pre-filled message text
 * @returns {string} WhatsApp wa.me URL with contact picker
 */
export function buildPaymentReceiptWhatsAppLink(message) {
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/?text=${encodedMessage}`
}

/**
 * Format currency for receipt
 */
export function formatReceiptCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`
}

/**
 * Format date for receipt
 */
export function formatReceiptDate(date) {
  return date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}