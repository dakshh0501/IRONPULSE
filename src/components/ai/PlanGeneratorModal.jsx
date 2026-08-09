// src/components/ai/PlanGeneratorModal.jsx
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Workout & Diet Plan Generator (Sprint 78B).
// One modal for both plan types. Flow:
//   1. pick parameters → generate (Gemini, offline fallback)
//   2. preview; regenerate a single day / meal / exercise
//   3. staff:  save as reusable template → reuse a template
//   4. staff:  "Apply & open editor" (existing PlanFormModal)
//      member: "Save as draft" (personal draft, cannot overwrite)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import {
  generateWorkoutPlan,
  generateDietPlan,
  regenerateWorkoutDay,
  regenerateWorkoutExercise,
  regenerateDietMeal,
  macrosForGoal,
  WORKOUT_GOALS,
  DIET_GOALS,
  LEVELS,
} from '../../services/ai/planGenerator'
import { saveTemplate, loadTemplates, applyTemplate } from '../../services/ai/planTemplates'

const WORKOUT_DURATIONS = ['30 min', '45 min', '60 min', '75 min', '90 min']
const MEAL_COUNTS = [3, 4, 5, 6]
const CUISINES = ['Vegetarian', 'Non-Vegetarian', 'Eggetarian', 'Vegan', 'Any']

export default function PlanGeneratorModal({ type, isMember, gymId, onClose, onOpenEditor, onSaveDraft }) {
  const [form, setForm] = useState(() => type === 'diet'
    ? { goal: 'Muscle Gain', calories: 2200, meals: 4, cuisine: 'Vegetarian', restrictions: '' }
    : { goal: 'Muscle Gain', level: 'Beginner', days: 3, duration: '45 min', focus: '' })

  const [preview, setPreview] = useState(null)
  const [source, setSource] = useState(null)          // 'gemini' | 'offline'
  const [busy, setBusy] = useState(false)
  const [regenerating, setRegenerating] = useState('') // segment key
  const [error, setError] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)

  // Templates (staff only)
  const [templates, setTemplates] = useState(null)    // null = not loaded
  const [templateBusy, setTemplateBusy] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [tmplMsg, setTmplMsg] = useState('')

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const macros = useMemo(() => macrosForGoal(form.goal, form.calories), [form.goal, form.calories])

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setError('')
  }

  const handleGenerate = async () => {
    setBusy(true)
    setError('')
    setPreview(null)
    setTmplMsg('')
    try {
      const res = type === 'diet'
        ? await generateDietPlan(form)
        : await generateWorkoutPlan(form)
      setSource(res.source)
      setPreview(res.plan)
    } catch (e) {
      setError('Generation failed: ' + (e?.message || 'Unknown error'))
    } finally {
      setBusy(false)
    }
  }

  const handleRegenerate = async (kind, a, b) => {
    if (!preview) return
    setRegenerating(`${kind}:${a}`)
    try {
      const next = kind === 'day'
        ? await regenerateWorkoutDay(preview, a)
        : kind === 'exercise'
          ? await regenerateWorkoutExercise(preview, a, b)
          : await regenerateDietMeal(preview, a)
      setPreview(next)
    } catch {
      setError('Regenerate failed — try again')
    } finally {
      setRegenerating('')
    }
  }

  // ── Templates ────────────────────────────────────────────
  const toggleTemplates = async () => {
    if (templates) { setTemplates(null); return }
    setTemplateBusy(true)
    setTmplMsg('')
    try {
      const list = await loadTemplates(type, gymId)
      setTemplates(list || [])
    } catch (e) {
      setTmplMsg('Could not load templates')
    } finally {
      setTemplateBusy(false)
    }
  }

  const handleUseTemplate = (tpl) => {
    const plan = applyTemplate(tpl)
    if (!plan) { setTmplMsg('Template is corrupted'); return }
    setPreview(plan)
    setSource('template')
    setTmplMsg(`Applied "${tpl.name}". You can still edit or regenerate any part.`)
  }

  const handleSaveTemplate = async () => {
    if (!preview) return
    if (!templateName.trim()) { setTmplMsg('Give the template a name'); return }
    setSavingTemplate(true)
    try {
      await saveTemplate({ type, name: templateName.trim(), plan: preview, gymId })
      setTmplMsg(`Saved template "${templateName.trim()}"`)
      setTemplateName('')
      if (templates) toggleTemplates()
    } catch (e) {
      setTmplMsg('Template failed to save')
    } finally {
      setSavingTemplate(false)
    }
  }

  // ── Save flows ───────────────────────────────────────────
  const handleApply = () => { if (preview) onOpenEditor?.(preview) }

  const handleDraft = async () => {
    if (!preview) return
    setSavingDraft(true)
    setError('')
    try {
      await onSaveDraft?.(preview)
    } catch (e) {
      setError(e?.message || 'Draft failed to save')
      setSavingDraft(false)
      return
    }
    setSavingDraft(false)
  }

  const canGen = type === 'diet' || (form.goal && form.level && form.days)
  const isStaff = !onSaveDraft

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="AI plan generator"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h3>✨ AI {type === 'diet' ? 'Diet' : 'Workout'} Generator</h3>
            <p>{isStaff ? 'Generate a plan, refine it, then save & assign' : 'Generate a personal plan draft'}</p>
          </div>
          <button className="modal-close" aria-label="Close modal" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</p>}

          {/* ── Parameters ── */}
          <div className="section-title" style={{ fontSize: 13 }}>Parameters</div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
              <label className="form-label">Goal</label>
              <select className="form-select" value={form.goal} onChange={e => set('goal', e.target.value)}>
                {(type === 'diet' ? DIET_GOALS : WORKOUT_GOALS).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {type === 'workout' && (
              <>
                <div className="form-group" style={{ flex: '1 1 150px', margin: 0 }}>
                  <label className="form-label">Level</label>
                  <select className="form-select" value={form.level} onChange={e => set('level', e.target.value)}>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '0 1 110px', margin: 0 }}>
                  <label className="form-label">Days / wk</label>
                  <select className="form-select" value={form.days} onChange={e => set('days', Number(e.target.value))}>
                    {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
                  <label className="form-label">Duration</label>
                  <select className="form-select" value={form.duration} onChange={e => set('duration', e.target.value)}>
                    {WORKOUT_DURATIONS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </>
            )}

            {type === 'diet' && (
              <>
                <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
                  <label className="form-label">Calories / day</label>
                  <input className="form-input" type="number" min="800" max="6000"
                    value={form.calories} onChange={e => set('calories', Number(e.target.value))} />
                </div>
                <div className="form-group" style={{ flex: '0 1 110px', margin: 0 }}>
                  <label className="form-label">Meals</label>
                  <select className="form-select" value={form.meals} onChange={e => set('meals', Number(e.target.value))}>
                    {MEAL_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 150px', margin: 0 }}>
                  <label className="form-label">Cuisine</label>
                  <select className="form-select" value={form.cuisine} onChange={e => set('cuisine', e.target.value)}>
                    {CUISINES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* extra free-text */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{type === 'diet' ? 'Restrictions (optional)' : 'Focus / equipment (optional)'}</label>
            <input className="form-input"
              placeholder={type === 'diet' ? 'e.g. no dairy, mild spice' : 'e.g. dumbbells only, 30 min cardio'}
              value={type === 'diet' ? form.restrictions : form.focus}
              onChange={e => set(type === 'diet' ? 'restrictions' : 'focus', e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={busy}>
              {busy ? 'Generating…' : preview ? '↻ Regenerate full plan' : '✨ Generate plan'}
            </button>
            {isStaff && (
              <button className="btn" onClick={toggleTemplates} disabled={templateBusy} style={{ background: 'var(--bg3)' }}>
                {templates ? 'Hide templates' : templateBusy ? 'Loading…' : '📚 Templates'}
              </button>
            )}
          </div>

          {/* ── Templates panel ── */}
          {templates && (
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Your reusable templates</div>
              {templates.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No templates yet — generate a plan, then save one below.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => handleUseTemplate(t)}
                    style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {preview && (
            <>
              <div className="section-title" style={{ fontSize: 13, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span>
                  Preview {source === 'gemini' ? '(Gemini)' : source === 'template' ? '(template)' : '(built-in trainer)'}
                </span>
                {preview.name && <span style={{ fontSize: 15, fontWeight: 800 }}>{preview.name}</span>}
              </div>

              {type === 'workout' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    {preview.split && <span>Split: <b style={{ color: 'var(--text)' }}>{preview.split}</b></span>}
                    <span>{preview.goal} · {preview.level} · {preview.days} day{preview.days>1?'s':''} · {preview.duration}</span>
                  </div>
                  {(preview.exercises || []).map((ex, i) => (
                    <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)', minWidth: 24 }}>D{i+1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{ex.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {ex.muscle} · {ex.sets} sets × {ex.reps} · rest {ex.rest}
                        </div>
                        {ex.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{ex.notes}</div>}
                      </div>
                      <button className="btn btn-sm" disabled={regenerating === `day:${i}`}
                        onClick={() => handleRegenerate('day', i)}
                        title="Regenerate this day" aria-label={`Regenerate day ${i+1}`}>
                        {regenerating === `day:${i}` ? '…' : '↻ Day'}
                      </button>
                      <button className="btn btn-sm" disabled={regenerating === `exercise:${i}`}
                        onClick={() => handleRegenerate('exercise', i, 0)}
                        title="Regenerate this exercise" aria-label={`Regenerate exercise ${i+1}`}>
                        {regenerating === `exercise:${i}` ? '…' : '↻ Ex'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>🔥 {Number(preview.calories||0).toLocaleString()} kcal</span>
                    <span>P {preview.protein}g</span><span>C {preview.carbs}g</span><span>F {preview.fat}g</span>
                    {preview.hydration && <span>💧 {preview.hydration}</span>}
                  </div>
                  {(preview.meals || []).map((m, i) => (
                    <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{m.name} {m.time && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {m.time}</span>}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {m.calories ? `${Number(m.calories).toLocaleString()} kcal` : ''} · {m.items.join(' · ')}
                        </div>
                      </div>
                      <button className="btn btn-sm" disabled={regenerating === `meal:${i}`}
                        onClick={() => handleRegenerate('meal', i)}
                        title="Regenerate this meal" aria-label={`Regenerate meal ${i+1}`}>
                        {regenerating === `meal:${i}` ? '…' : '↻ Meal'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Save as template / apply / draft ── */}
          {preview && isStaff && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="form-input" style={{ maxWidth: 260 }}
                  placeholder="Template name (optional)" value={templateName}
                  onChange={e => setTemplateName(e.target.value)} aria-label="Template name" />
                <button className="btn btn-sm" style={{ background: 'var(--bg3)' }} disabled={savingTemplate || !preview} onClick={handleSaveTemplate}>
                  {savingTemplate ? 'Saving…' : '💾 Save as template'}
                </button>
              </div>
              {tmplMsg && <p role="status" style={{ fontSize: 12, color: 'var(--teal)' }}>{tmplMsg}</p>}
              <button className="btn btn-primary" onClick={handleApply}>
                Open in editor to save & assign →
              </button>
            </div>
          )}

          {preview && !isStaff && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button className="btn btn-primary" disabled={savingDraft} onClick={handleDraft}>
                {savingDraft ? 'Saving draft…' : '💾 Save as my draft'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}