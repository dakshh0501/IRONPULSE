// src/services/ai/providers/groqProvider.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Groq provider (Sprint 80C + 80C-fix).
//
// Drop-in replacement for the previous Gemini provider: same
// surface (streamReply / generateJson / isConfigured), OpenAI-
// compatible protocol behind the scenes.
//
// Used ONLY when:
//   1. VITE_GROQ_API_KEY is present in the environment, and
//   2. AI_PROVIDER.connected is true (set by the service layer).
//
// Wire contract (Sprint 80C-fix):
//   • Endpoint  : POST https://api.groq.com/openai/v1/chat/completions
//   • Auth      : `Authorization: Bearer <VITE_GROQ_API_KEY>` (SDK)
//   • Content   : application/json (SDK)
//   • Payload   : ONLY fields Groq supports — `model`, `messages`,
//                 `temperature`, `max_tokens`, and `stream` (streaming
//                 only). No `stream_options`, `response_format`,
//                 `tools`, `functions`, `tool_choice`, `reasoning`,
//                 `seed`, `metadata`, `max_completion_tokens` — and
//                 NEVER request options inside the body. AbortSignal
//                 travels in the SDK's `options` argument (v7+), not
//                 the body — putting it in the body serializes it as
//                 `"signal":{}` and Groq rejects it with HTTP 400
//                 "property 'signal' is unsupported".
//   • Model     : VITE_GROQ_MODEL override or llama-3.3-70b-versatile.
//                 If Groq reports the model is missing/unavailable,
//                 one automatic retry with llama-3.1-8b-instant.
//   • Errors    : every non-200 response body is logged (status +
//                 body text only — never headers, keys or requests).
//                 Failures never throw and never leak stack traces.
//
// Security contract:
//   - The API key is read from import.meta.env at runtime; it is
//     never hardcoded, never logged, and never mirrored into any
//     Firestore/state object.
//   - Only { role, question, history } is ever sent to the API —
//     plus, when an intent explicitly requests an analysis, a
//     minimal context slice (see contextScopes in aiService).
//     The AppContext data snapshot NEVER leaves the browser.
//   - All failures are caught here — no stack trace, request body,
//     prompt, API key or Authorization header ever escapes this
//     module (errors are logged as name/status only; the Groq
//     response body on non-200 is logged by design — it never
//     contains credentials or prompts).
// ─────────────────────────────────────────────────────────────

// NOTE: the `openai` SDK is loaded lazily (dynamic import inside
// getClient) so that the ~200 KB package is never parsed at app
// startup — it loads only on the first real AI call (Sprint 81F).

export const SYSTEM_PROMPT =
  'You are IRONPULSE AI. ' +
  'You are a professional gym assistant. ' +
  'Never invent user membership information. ' +
  'Never claim access to Firebase data. ' +
  'If asked about app-specific information, respond only if context is provided. ' +
  'Prefer concise answers.'

export const GROQ_GRACEFUL_FALLBACK =
  "I'm having trouble reaching the AI service right now."

const DEFAULT_MODEL = 'llama-3.3-70b-versatile'
const FALLBACK_MODEL = 'llama-3.1-8b-instant'
const BASE_URL = 'https://api.groq.com/openai/v1'
const TIMEOUT_MS = 20000
const MAX_OUTPUT_TOKENS = 600
const TEMPERATURE = 0.7

/** Runtime-only key read — never stored, never logged. */
export function getGroqApiKey() {
  try {
    return String(import.meta.env?.VITE_GROQ_API_KEY || '').trim()
  } catch {
    return ''
  }
}

export function getGroqModel() {
  const override = String(import.meta.env?.VITE_GROQ_MODEL || '').trim()
  return override || DEFAULT_MODEL
}

export function isGroqConfigured() {
  return Boolean(getGroqApiKey())
}

export function buildSystemPrompt(role = 'gym_admin') {
  return (
    SYSTEM_PROMPT +
    `\nThe current user is a ${String(role).replace('_', ' ')}. Tailor your wording to that role.`
  )
}

/**
 * Model chain to try, in order. The configured/override model first;
 * if Groq reports it missing, we retry exactly once with the
 * fallback model. Duplicates are removed.
 */
function modelChain() {
  const primary = getGroqModel()
  const chain = [primary]
  if (FALLBACK_MODEL && FALLBACK_MODEL !== primary) chain.push(FALLBACK_MODEL)
  return chain
}

/**
 * True when a Groq error body indicates the model itself is not
 * available — the only condition worth retrying with a fallback
 * model. Bodies are checked for "does not exist" / "not found".
 */
function isModelError(status, body) {
  if (status !== 400 && status !== 404) return false
  const text = String(body || '')
  return /\bmodel\b/.test(text) && /(does not exist|not found|not_found|unknown model)/i.test(text)
}

/** Most recent non-200 response body (module-scoped, thread-safe
 *  enough for a single in-flight request). */
let lastHttpBody = ''

/**
 * fetch wrapper handed to the OpenAI client. Contract:
 *   • forward the request untouched (SDK builds headers/body)
 *   • log the COMPLETE request body before fetch() — task 1 of the
 *     Sprint 80C-fix (request bodies never contain the API key or
 *     the Authorization header)
 *   • log the COMPLETE response body whenever response.ok === false
 *     — task 2 (response bodies never contain credentials)
 *   • never log headers or the API key
 */
async function fetchForClient(url, init) {
  const bodyStr = typeof init?.body === 'string' ? init.body : ''
  try {
    console.warn('[Pulse AI] Groq request', String(url), bodyStr)
  } catch {
    // logging must never break the request
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    try {
      const body = await res.clone().text()
      lastHttpBody = body
      console.error('[Pulse AI] Groq HTTP', res.status, body)
    } catch {
      lastHttpBody = ''
    }
  }
  return res
}

/**
 * Lazy singleton OpenAI client — Groq's OpenAI-compatible endpoint.
 * Created only when a key is present (never at module import), and
 * the openai package itself is fetched on first use only (Sprint 81F).
 */
let clientCache = null
let openaiModulePromise = null
function loadOpenaiModule() {
  if (!openaiModulePromise) openaiModulePromise = import('openai')
  return openaiModulePromise
}
async function getClient() {
  if (clientCache) return clientCache
  const { default: OpenAI } = await loadOpenaiModule()
  clientCache = new OpenAI({
    apiKey: getGroqApiKey(),
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
    dangerouslyAllowBrowser: true,
    fetch: fetchForClient,
  })
  return clientCache
}

/**
 * Maps the in-memory session history (last 10 turns) to OpenAI
 * chat message format. Nothing is persisted anywhere. Every message
 * is normalized to the strict Groq schema before it can travel:
 *   role ∈ system|user|assistant, content ALWAYS a plain string
 * (no objects, arrays, null or undefined content inside).
 */
function toOpenAIMessages(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter(m => m && typeof m.text === 'string' && m.text.trim())
    .slice(-10)
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text.slice(0, 4000),
    }))
}

/** Hard guarantee for task 6: every chat message is
 *  { role: 'system'|'user'|'assistant', content: <string> } — any
 *  non-string or empty content message is dropped, never mangled. */
function sanitizeMessages(messages) {
  const out = []
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || typeof m !== 'object') continue
    const role = m.role === 'system' || m.role === 'assistant' ? m.role : 'user'
    if (typeof m.content !== 'string') continue // never objects/arrays/null
    const content = m.content.trim()
    if (!content.length) continue // never empty content
    out.push({ role, content: content.slice(0, 8000) })
  }
  return out
}

function safeErrorDetail(err) {
  // Never log keys, prompts, bodies or headers — name/status only.
  // (The Groq response body on non-200 is logged separately by
  // fetchForClient — response bodies never hold credentials.)
  const status = err && err.status ? ` status=${err.status}` : ''
  return String((err && err.name) || 'unknown') + status
}

/** Builds the system instruction for the current call. */
function buildSystemInstruction(role, context, mode) {
  let instruction = buildSystemPrompt(role)
  if (context && typeof context === 'object' && Object.keys(context).length > 0) {
    const json = JSON.stringify(context).slice(0, 2000)
    instruction +=
      '\n\nThe user explicitly shared this app data for your analysis. ' +
      'Use ONLY these fields — never infer, invent, or claim access to any other data:\n' +
      json
  }
  if (mode === 'explain') {
    instruction +=
      '\n\nExplain these metrics in simple language and provide practical recommendations for the user. ' +
      'Be concise, specific, and do not invent numbers that are not in the provided fields.'
  }
  return instruction
}

/**
 * Streams a reply from Groq (OpenAI-compatible chat completions).
 *
 * @param {Object}   opts
 * @param {string}   opts.question
 * @param {Array}    [opts.history]       last-10-turn conversation memory
 * @param {string}   [opts.role]          current user's role hint
 * @param {Object|null} [opts.context]    OPTIONAL minimal explicit app
 *                                        context slice (never the full
 *                                        AppContext); embedded verbatim
 *                                        as JSON when present
 * @param {string}   [opts.mode]          'explain' appends the
 *                                        insight-explanation task to
 *                                        the system instruction
 * @param {Function} [opts.onToken]       called with each text delta
 * @param {AbortSignal} [opts.signal]     cancels the request in flight
 * @returns {Promise<{text: string|null, usage: Object|null, finishReason: string|null}|null>}
 *                                        full result, or null on any
 *                                        failure with no partial text;
 *                                        partial text is kept on aborts
 */
export async function streamReply({ question, history = [], role = 'gym_admin', context = null, mode, onToken, signal } = {}) {
  if (!getGroqApiKey()) return null

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let accumulated = ''
  let finishReason = null
  let usage = null

  try {
    const systemInstruction = buildSystemInstruction(role, context, mode)
    const messages = sanitizeMessages([
      { role: 'system', content: systemInstruction },
      ...toOpenAIMessages(history),
      { role: 'user', content: String(question || '').slice(0, 4000) },
    ])

    // Payload contains ONLY Groq-supported fields. The AbortSignal
    // is a request OPTION (SDK v7 signature: create(body, options)),
    // never part of the JSON body.
    const body = {
      model: modelChain()[0],
      messages,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
    }
    const options = { signal: controller.signal }

    let stream = null
    for (const model of modelChain()) {
      try {
        stream = await getClient().chat.completions.create({ ...body, model }, options)
        break
      } catch (err) {
        if (isModelError(err && err.status, lastHttpBody)) {
          console.error(`[Pulse AI] model ${model} unavailable — retrying with ${modelChain().find(m => m !== model)}`)
          continue
        }
        throw err
      }
    }
    if (!stream) return null

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        accumulated += delta
        if (typeof onToken === 'function') onToken(accumulated)
      }
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
      if (chunk.usage) usage = chunk.usage
    }

    if (!accumulated.trim()) return null
    return { text: accumulated.trim(), usage, finishReason }
  } catch (err) {
    // Partial text is worth keeping; a clean failure returns null
    // so the caller can emit the graceful fallback message.
    if (accumulated.trim()) {
      return { text: accumulated.trim(), usage, finishReason: finishReason || 'aborted' }
    }
    console.error('[Pulse AI] provider error:', safeErrorDetail(err))
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Non-streaming structured generation (used by the AI Workout/Diet
 * Generator — Sprint 78B). Asks Groq for a single JSON object and
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
  if (!getGroqApiKey()) return null

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), 45000)

  try {
    // Groq-supported fields only — no response_format / tools /
    // extra OpenAI fields. JSON is requested via the prompt itself.
    const body = {
      model: modelChain()[0],
      messages: sanitizeMessages([
        { role: 'system', content: systemInstruction },
        { role: 'user', content: String(prompt || '').slice(0, 8000) },
      ]),
      max_tokens: maxTokens,
      temperature,
    }
    const options = { signal: controller.signal }

    let completion = null
    for (const model of modelChain()) {
      try {
        completion = await getClient().chat.completions.create({ ...body, model }, options)
        break
      } catch (err) {
        if (isModelError(err && err.status, lastHttpBody)) {
          console.error(`[Pulse AI] model ${model} unavailable — retrying with ${modelChain().find(m => m !== model)}`)
          continue
        }
        throw err
      }
    }
    if (!completion) return null

    const text = (completion.choices?.[0]?.message?.content || '').trim()
    if (!text) return null

    // Defensive parse: strip code fences, keep the first {...} block.
    let jsonText = text
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) jsonText = fenced[1]
    const objStart = jsonText.indexOf('{')
    const objEnd = jsonText.lastIndexOf('}')
    if (objStart === -1 || objEnd === -1) return null
    return JSON.parse(jsonText.slice(objStart, objEnd + 1))
  } catch (err) {
    console.error('[Pulse AI] JSON generation error:', safeErrorDetail(err))
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export default {
  SYSTEM_PROMPT,
  GROQ_GRACEFUL_FALLBACK,
  getGroqApiKey,
  getGroqModel,
  isGroqConfigured,
  buildSystemPrompt,
  streamReply,
  generateJson,
}