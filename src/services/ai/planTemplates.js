// src/services/ai/planTemplates.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Reusable plan templates (Sprint 78B, req 6).
//
// Templates are stored in the planTemplates Firestore collection
// (staff-scoped, gym-scoped). Reads are on-demand getDocs calls —
// NO listener is added, so requirement 9 (reuse existing
// AppContext, no duplicate listeners) is preserved.
// ─────────────────────────────────────────────────────────────

import {
  savePlanTemplate as saveTemplateInFirestore,
  listPlanTemplates,
  deletePlanTemplate,
} from '../firestoreService'

/** Shallow-immutable copy safe to drop into a plan editor. */
export function applyTemplate(template) {
  if (!template?.plan || typeof template.plan !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(template.plan))
  } catch {
    return null
  }
}

/**
 * @param {Object}  opts { type: 'workout'|'diet', name, plan, gymId }
 * @returns {Promise<string>} template doc id
 */
export async function saveTemplate({ type, name, plan, gymId }) {
  const cleanName = String(name || '').trim().slice(0, 60)
  if (!cleanName) throw new Error('Template name is required')
  if (!plan || typeof plan !== 'object') throw new Error('Template plan data is missing')
  if (type !== 'workout' && type !== 'diet') throw new Error('Template type must be workout or diet')
  return saveTemplateInFirestore({ type, name: cleanName, plan, gymId })
}

export async function loadTemplates(type, gymId) {
  return listPlanTemplates(type, gymId)
}

export async function removeTemplate(templateId) {
  return deletePlanTemplate(templateId)
}

export default {
  applyTemplate,
  saveTemplate,
  loadTemplates,
  removeTemplate,
}