// src/services/ai/providers/geminiProvider.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Google Gemini fallback provider (Sprint 77C).
//
// Used ONLY when:
//   1. VITE_GEMINI_API_KEY is present in the environment, and
//   2. AI_PROVIDER.connected is true (set by the service layer).
//
// Security contract:
//   - The API key is read from import.meta.env at runtime; it is
//     never hardcoded, never logged, and never mirrored into any
//     Firestore/state object.
//   - Only { role, question, history } is ever sent to the API —
//     plus, when an intent explicitly requests an analysis, a
//     minimal context slice (see contextScopes in aiService).
//     The AppContext data snapshot NEVER leaves the browser.
//   - All failures are caught here — no stack trace or request
//     details ever escape this module.
// ─────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai'

export const SYSTEM_PROMPT =
  'You are IRONPULSE AI. ' +
  'You are a professional gym assistant. ' +
  'Never invent user membership information. ' +
  'Never claim access to Firebase data. ' +
  'If asked about app-specific information, respond only if context is provided. ' +
  'Prefer concise answers.'

export const GEMINI_GRACEFUL_FALLBACK =
  "I'm having trouble reaching the AI service right now."

const DEFAULT_MODEL = 'gemini-2.0-flash'
const TIMEOUT_MS = 20000
const MAX_OUTPUT_TOKENS = 600
const TEMPERATURE = 0.7

/** Runtime-only key read — never stored, never logged. */
export function getGeminiApiKey() {
  try {
    return String(import.meta.env?.VITE_GEMINI_API_KEY || '').trim()
  } catch {
    return ''
  }
}

export function getGeminiModel() {
  const override = String(import.meta.env?.VITE_GEMINI_MODEL || '').trim()
  return override || DEFAULT_MODEL
}

export function isGeminiConfigured() {
  return Boolean(getGeminiApiKey())
}

export function buildSystemPrompt(role = 'gym_admin') {
  return (
    SYSTEM_PROMPT +
    `\nThe current user is a ${String(role).replace('_', ' ')}. Tailor your wording to that role.`
  )
}

/**
 * Maps the in-memory session history (last 10 turns) to Gemini
 * message format. Nothing is persisted anywhere.
 */
function toGeminiHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter(m => m && typeof m.text === 'string' && m.text.trim())
    .slice(-10)
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text.slice(0, 4000) }],
    }))
}

/**
 * Streams a reply from Gemini.
 *
 * @param {Object}   opts
 * @param {string}   opts.question
 * @param {Array}    [opts.history]       last-10-turn conversation memory
 * @param {string}   [opts.role]          current user's role hint
 * @param {Object|null} [opts.context]    OPTIONAL minimal explicit app
 *                                        context slice (never the full
 *                                        AppContext); embedded verbatim
 *                                        as JSON when present
 * @param {string}   [opts.mode]            'explain' appends the
 *                                          insight-explanation task to
 *                                          the system instruction
 * @param {Function} [opts.onToken]       called with each text delta
 * @param {AbortSignal} [opts.signal]     cancels the request in flight
 * @returns {Promise<string|null>}        full text, or null on any failure
 */
export async function streamReply({ question, history = [], role = 'gym_admin', context = null, mode, onToken, signal } = {}) {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let received = 0
  let accumulated = ''

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: getGeminiModel(),
      generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS },
    })

    // Embed the explicit context slice verbatim, with a hard cap.
    let systemInstruction = buildSystemPrompt(role)
    if (context && typeof context === 'object' && Object.keys(context).length > 0) {
      const json = JSON.stringify(context).slice(0, 2000)
      systemInstruction +=
        '\n\nThe user explicitly shared this app data for your analysis. ' +
        'Use ONLY these fields — never infer, invent, or claim access to any other data:\n' +
        json
    }
    if (mode === 'explain') {
      systemInstruction +=
        '\n\nExplain these metrics in simple language and provide practical recommendations for the user. ' +
        'Be concise, specific, and do not invent numbers that are not in the provided fields.'
    }

    const result = await model.generateContentStream({
      contents: toGeminiHistory(history),
      systemInstruction,
      signal: controller.signal,
    })

    for await (const chunk of result.stream) {
      const delta = chunk.text?.() || ''
      if (!delta) continue
      accumulated += delta
      received += delta.length
      if (typeof onToken === 'function') onToken(accumulated)
    }

    if (received === 0) return null
    return accumulated.trim()
  } catch {
    // Partial text is worth keeping; a clean failure returns null
    // so the caller can emit the graceful fallback message.
    return accumulated.trim() || null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Non-streaming structured generation (used by the AI Workout/Diet
 * Generator — Sprint 78B). Asks Gemini for a single JSON object and
 * returns it parsed, or null on any failure. The API key is read at
 * runtime and never leaves this module.
 *
 * @param {Object}   opts
 * @param {string}   opts.prompt            user-side instruction (schema included)
 * @param {string}   [opts.systemInstruction]  role / safety framing
 * @param {number}   [opts.maxTokens]       default 4096 (plans are long)
 * @param {number}   [opts.temperature]     default 0.6 (structured output)
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Object|null>}          parsed JSON, or null
 */
export async function generateJson({ prompt, systemInstruction = SYSTEM_PROMPT, maxTokens = 4096, temperature = 0.6, signal } = {}) {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return null

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), 45000)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: getGeminiModel(),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    })
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction,
      signal: controller.signal,
    })
    const text = (result.response.text?.() || '').trim()
    if (!text) return null

    // Defensive parse: strip code fences, keep the first {...} block.
    let jsonText = text
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) jsonText = fenced[1]
    const objStart = jsonText.indexOf('{')
    const objEnd = jsonText.lastIndexOf('}')
    if (objStart === -1 || objEnd === -1) return null
    return JSON.parse(jsonText.slice(objStart, objEnd + 1))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export default {
  SYSTEM_PROMPT,
  GEMINI_GRACEFUL_FALLBACK,
  getGeminiApiKey,
  getGeminiModel,
  isGeminiConfigured,
  buildSystemPrompt,
  streamReply,
  generateJson,
}