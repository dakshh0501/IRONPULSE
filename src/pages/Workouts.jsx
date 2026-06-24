import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { buildWorkoutPlanWhatsAppMessage, buildWorkoutPlanWhatsAppLink } from '../utils/whatsappReminders'

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const GOALS   = ['Weight Loss', 'Muscle Gain', 'Strength', 'Flexibility', 'Toning', 'Endurance', 'General Fitness']
const LEVELS  = ['Beginner', 'Intermediate', 'Advanced']
const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Glutes', 'Hamstrings', 'Full Body', 'Cardio']

const GOAL_COLOR = {
  'Weight Loss':     { bg: 'rgba(239,68,68,0.12)',    text: '#ef4444' },
  'Muscle Gain':     { bg: 'rgba(232,66,10,0.12)',    text: '#e8420a' },
  'Strength':        { bg: 'rgba(168,85,247,0.12)',   text: '#a855f7' },
  'Flexibility':     { bg: 'rgba(0,200,180,0.12)',    text: '#00c8b4' },
  'Toning':          { bg: 'rgba(245,158,11,0.12)',   text: '#f59e0b' },
  'Endurance':       { bg: 'rgba(34,197,94,0.12)',    text: '#22c55e' },
  'General Fitness': { bg: 'rgba(96,165,250,0.12)',   text: '#60a5fa' },
}

const LEVEL_COLOR = {
  Beginner:     { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  Intermediate: { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b' },
  Advanced:     { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444' },
}

const AV_COLORS = ['av-orange', 'av-teal', 'av-green', 'av-purple', 'av-amber']
const avColor   = (name = '') => AV_COLORS[(name.charCodeAt(0) || 0) % AV_COLORS.length]

const EMPTY_EXERCISE = { name: '', sets: 3, reps: '10', rest: '60s', muscle: 'Chest' }

const EMPTY_PLAN = {
  name: '', member: '', trainer: '', goal: 'Weight Loss',
  level: 'Beginner', days: 3, duration: '45 min', exercises: [],
}

// ─────────────────────────────────────────────────────────────
//  SMALL HELPERS
// ─────────────────────────────────────────────────────────────
function GoalBadge({ goal }) {
  const c = GOAL_COLOR[goal] || { bg: 'var(--bg3)', text: 'var(--text-muted)' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.text, whiteSpace: 'nowrap',
    }}>
      {goal}
    </span>
  )
}

function LevelBadge({ level }) {
  const c = LEVEL_COLOR[level] || { bg: 'var(--bg3)', text: 'var(--text-muted)' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.text, whiteSpace: 'nowrap',
    }}>
      {level}
    </span>
  )
}

function StatPill({ icon, value, label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'var(--bg3)', borderRadius: 8, padding: '10px 8px', flex: 1,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: "'Barlow Condensed',sans-serif" }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MUSCLE TAG
// ─────────────────────────────────────────────────────────────
const MUSCLE_COLORS = {
  Chest:      '#e8420a', Back:  '#a855f7', Legs:      '#22c55e',
  Shoulders:  '#f59e0b', Arms:  '#00c8b4', Core:      '#60a5fa',
  Glutes:     '#ec4899', Hamstrings:'#f97316', 'Full Body':'#8b5cf6',
  Cardio:     '#ef4444',
}
function MuscleTag({ muscle }) {
  const color = MUSCLE_COLORS[muscle] || 'var(--teal)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>
      {muscle}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
//  EXERCISE TABLE (used in card preview + detail modal)
// ─────────────────────────────────────────────────────────────
function ExerciseTable({ exercises, compact = false }) {
  if (!exercises?.length) return (
    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
      No exercises added yet.
    </p>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 12 : 13 }}>
        <thead>
          <tr>
            {['#', 'Exercise', 'Sets', 'Reps', 'Rest', !compact && 'Muscle'].filter(Boolean).map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: compact ? '6px 10px' : '9px 12px',
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                fontWeight: 600, whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {exercises.map((ex, i) => (
            <tr key={i}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: compact ? '6px 10px' : '10px 12px', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>
                {String(i + 1).padStart(2, '0')}
              </td>
              <td style={{ padding: compact ? '6px 10px' : '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                {ex.name}
              </td>
              <td style={{ padding: compact ? '6px 10px' : '10px 12px' }}>
                <span style={{ fontWeight: 700, color: 'var(--orange)' }}>{ex.sets}</span>
              </td>
              <td style={{ padding: compact ? '6px 10px' : '10px 12px' }}>
                <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{ex.reps}</span>
              </td>
              <td style={{ padding: compact ? '6px 10px' : '10px 12px', color: 'var(--text-muted)' }}>
                {ex.rest}
              </td>
              {!compact && (
                <td style={{ padding: '10px 12px' }}>
                  <MuscleTag muscle={ex.muscle} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  WORKOUT CARD
// ─────────────────────────────────────────────────────────────
function WorkoutCard({ plan, members, trainers, onView, onEdit, onDelete, gymName }) {
  const member  = members.find(m => m.name === plan.member)
  const trainer = trainers.find(t => t.name === plan.trainer)
  const gc      = GOAL_COLOR[plan.goal] || { bg: 'var(--bg3)', text: 'var(--text-muted)' }

  const handleWhatsAppShare = (e) => {
    e.stopPropagation()
    const message = buildWorkoutPlanWhatsAppMessage(plan, gymName)
    const link = buildWorkoutPlanWhatsAppLink(message)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="card"
      style={{
        padding: 0, overflow: 'hidden', cursor: 'pointer',
        transition: 'transform 0.18s, box-shadow 0.18s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(0,0,0,0.45)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = 'var(--shadow)' }}
      onClick={() => onView(plan)}
    >
      {/* Accent bar using goal color */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${gc.text}, var(--teal))` }} />

      {/* Card header */}
      <div style={{ padding: '18px 18px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>
            {plan.name}
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <GoalBadge goal={plan.goal} />
            <LevelBadge level={plan.level} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-sm btn-ghost" onClick={handleWhatsAppShare} style={{ background: '#25D366', border: 'none', color: '#fff' }}>💬</button>
          <button className="btn btn-sm btn-ghost" onClick={() => onEdit(plan)}>✏️</button>
          <button className="btn btn-sm btn-red"   onClick={() => onDelete(plan)}>🗑</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, padding: '0 18px 14px' }}>
        <StatPill icon="💪" value={plan.exercises?.length || 0} label="Exercises" />
        <StatPill icon="📅" value={`${plan.days}x`}            label="Per Week"  />
        <StatPill icon="⏱"  value={plan.duration}              label="Duration"  />
      </div>

      {/* Assigned member & trainer */}
      <div style={{
        padding: '12px 18px', borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Member */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, flexShrink: 0 }}>Member</span>
          {member ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={`avatar ${avColor(member.name)}`} style={{ width: 24, height: 24, fontSize: 9 }}>
                {member.avatar}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{member.name}</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unassigned</span>
          )}
        </div>

        {/* Trainer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, flexShrink: 0 }}>Trainer</span>
          {trainer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={`avatar ${avColor(trainer.name)}`} style={{ width: 24, height: 24, fontSize: 9 }}>
                {trainer.avatar}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{trainer.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {trainer.spec}</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unassigned</span>
          )}
        </div>
      </div>

      {/* Exercise preview — first 3 */}
      {plan.exercises?.length > 0 && (
        <div style={{ padding: '10px 18px 16px', borderTop: '1px solid var(--border)', flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Exercises Preview
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {plan.exercises.slice(0, 3).map((ex, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg3)', borderRadius: 6, padding: '7px 10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--orange)', width: 18 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{ex.name}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {ex.sets}×{ex.reps}
                </span>
              </div>
            ))}
            {plan.exercises.length > 3 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
                +{plan.exercises.length - 3} more exercises
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  WORKOUT DETAIL MODAL
// ─────────────────────────────────────────────────────────────
function WorkoutDetailModal({ plan, members, trainers, onEdit, onClose, gymName }) {
  const member  = members.find(m => m.name === plan.member)
  const trainer = trainers.find(t => t.name === plan.trainer)
  const gc      = GOAL_COLOR[plan.goal] || { bg: 'var(--bg3)', text: 'var(--orange)' }

  const handleWhatsAppShare = () => {
    const message = buildWorkoutPlanWhatsAppMessage(plan, gymName)
    const link = buildWorkoutPlanWhatsAppLink(message)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <GoalBadge goal={plan.goal} />
              <LevelBadge level={plan.level} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800 }}>{plan.name}</h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={handleWhatsAppShare} style={{ background: '#25D366', border: 'none', color: '#fff' }}>
              💬 Share via WhatsApp
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Top stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { icon: '💪', label: 'Exercises', value: plan.exercises?.length || 0, color: 'var(--orange)' },
            { icon: '📅', label: 'Days/Week',  value: `${plan.days}x`,            color: 'var(--teal)'   },
            { icon: '⏱',  label: 'Duration',  value: plan.duration,               color: 'var(--amber)'  },
            { icon: '🎯', label: 'Goal',       value: plan.goal.split(' ')[0],     color: gc.text         },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg3)', borderRadius: 8, padding: 14, textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "'Barlow Condensed',sans-serif" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Assignments */}
        <div className="grid-2" style={{ marginBottom: 20 }}>
          {/* Member */}
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Assigned Member
            </p>
            {member ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className={`avatar ${avColor(member.name)}`} style={{ width: 40, height: 40, fontSize: 14 }}>
                  {member.avatar}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{member.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{member.goal} · {member.plan}</p>
                </div>
              </div>
            ) : <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No member assigned</p>}
          </div>

          {/* Trainer */}
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Assigned Trainer
            </p>
            {trainer ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className={`avatar ${avColor(trainer.name)}`} style={{ width: 40, height: 40, fontSize: 14 }}>
                  {trainer.avatar}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{trainer.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{trainer.spec}</p>
                </div>
              </div>
            ) : <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No trainer assigned</p>}
          </div>
        </div>

        {/* Muscle groups hit */}
        {plan.exercises?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Muscles Targeted
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[...new Set(plan.exercises.map(e => e.muscle))].map(m => (
                <MuscleTag key={m} muscle={m} />
              ))}
            </div>
          </div>
        )}

        {/* Full exercise table */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Full Exercise List ({plan.exercises?.length || 0} exercises)
          </p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <ExerciseTable exercises={plan.exercises} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => { onEdit(plan); onClose() }}>
            ✏️ Edit Plan
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  EXERCISE ROW EDITOR  (inside plan form)
// ─────────────────────────────────────────────────────────────
function ExerciseEditor({ exercises, onChange }) {
  const addExercise    = () => onChange([...exercises, { ...EMPTY_EXERCISE }])
  const removeExercise = (i) => onChange(exercises.filter((_, idx) => idx !== i))
  const updateExercise = (i, key, val) => {
    const next = exercises.map((ex, idx) => idx === i ? { ...ex, [key]: val } : ex)
    onChange(next)
  }

  return (
    <div>
      {/* Exercise rows */}
      {exercises.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {exercises.map((ex, i) => (
            <div key={i} style={{
              background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px',
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              {/* Number */}
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--orange)', width: 22, flexShrink: 0 }}>
                {i + 1}.
              </span>

              {/* Name */}
              <input
                className="form-input"
                placeholder="Exercise name"
                value={ex.name}
                onChange={e => updateExercise(i, 'name', e.target.value)}
                style={{ flex: '2 1 140px', minWidth: 120 }}
              />

              {/* Sets */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 60px' }}>
                <input
                  className="form-input"
                  type="number" min="1" max="20"
                  value={ex.sets}
                  onChange={e => updateExercise(i, 'sets', Number(e.target.value))}
                  style={{ textAlign: 'center', padding: '8px 4px' }}
                />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase' }}>Sets</span>
              </div>

              {/* Reps */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 72px' }}>
                <input
                  className="form-input"
                  placeholder="12"
                  value={ex.reps}
                  onChange={e => updateExercise(i, 'reps', e.target.value)}
                  style={{ textAlign: 'center', padding: '8px 4px' }}
                />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase' }}>Reps</span>
              </div>

              {/* Rest */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 72px' }}>
                <input
                  className="form-input"
                  placeholder="60s"
                  value={ex.rest}
                  onChange={e => updateExercise(i, 'rest', e.target.value)}
                  style={{ textAlign: 'center', padding: '8px 4px' }}
                />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase' }}>Rest</span>
              </div>

              {/* Muscle */}
              <select
                className="form-select"
                value={ex.muscle}
                onChange={e => updateExercise(i, 'muscle', e.target.value)}
                style={{ flex: '1 1 110px', minWidth: 90 }}
              >
                {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              {/* Remove */}
              <button
                type="button"
                className="btn btn-sm btn-red"
                onClick={() => removeExercise(i)}
                style={{ flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add exercise button */}
      <button
        type="button"
        className="btn btn-outline"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={addExercise}
      >
        + Add Exercise
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  CREATE / EDIT PLAN MODAL
// ─────────────────────────────────────────────────────────────
function PlanFormModal({ plan, members, trainers, onSave, onClose }) {
  const isEdit = Boolean(plan)
  const [form,   setForm]   = useState(() => {
    if (plan) {
      const f = { ...plan }
      if (!f.memberId && f.member) {
        const m = members.find(x => x.name === f.member)
        if (m) { f.memberId = m.id; f.authUid = m.authUid }
      }
      return f
    }
    return { ...EMPTY_PLAN, exercises: [] }
  })
  const [errors, setErrors] = useState({})
  const [tab,    setTab]    = useState('info')   // 'info' | 'exercises'

  const set = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())    e.name    = 'Plan name is required'
    if (!form.goal)           e.goal    = 'Select a goal'
    if (!form.level)          e.level   = 'Select a level'
    if (form.exercises.length < 1) e.exercises = 'Add at least 1 exercise'
    if (form.exercises.some(ex => !ex.name || !ex.name.trim())) e.exercises = 'All exercises must have a name'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) {
      setErrors(e)
      if (e.exercises) setTab('exercises')
      return
    }
    onSave(form)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h3>{isEdit ? 'Edit Workout Plan' : 'Create Workout Plan'}</h3>
            <p>{isEdit ? 'Update this plan' : 'Build a new routine and assign it'}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ flexShrink: 0 }}>
          <button className={`tab-btn ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
            📋 Plan Info
          </button>
          <button className={`tab-btn ${tab === 'exercises' ? 'active' : ''}`} onClick={() => setTab('exercises')}>
            💪 Exercises
            {form.exercises.length > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--orange)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
                {form.exercises.length}
              </span>
            )}
            {errors.exercises && <span style={{ marginLeft: 4, color: 'var(--red)', fontSize: 12 }}>⚠</span>}
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── TAB: Plan Info ── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* Plan details section */}
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
                Plan Details
              </p>

              <div className="form-group">
                <label className="form-label">Plan Name *</label>
                <input className="form-input" placeholder="e.g. Strength Building Phase 1"
                  value={form.name} onChange={e => set('name', e.target.value)} />
                {errors.name && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>⚠ {errors.name}</p>}
              </div>

              <div className="form-row" style={{ marginBottom: 14 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Fitness Goal *</label>
                  <select className="form-select" value={form.goal} onChange={e => set('goal', e.target.value)}>
                    {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Difficulty Level *</label>
                  <select className="form-select" value={form.level} onChange={e => set('level', e.target.value)}>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: 20 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Days Per Week</label>
                  <select className="form-select" value={form.days} onChange={e => set('days', Number(e.target.value))}>
                    {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n} day{n>1?'s':''}/week</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Session Duration</label>
                  <select className="form-select" value={form.duration} onChange={e => set('duration', e.target.value)}>
                    {['30 min','45 min','60 min','75 min','90 min','120 min'].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Assignments section */}
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
                Assignments
              </p>

              <div className="form-row" style={{ marginBottom: 6 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Assign to Member</label>
                  <select className="form-select" value={form.member} onChange={e => {
                    const val = e.target.value
                    const m = members.find(x => x.name === val)
                    setForm(prev => ({ ...prev, member: val, memberId: m ? m.id : '', authUid: m ? m.authUid : '' }))
                    setErrors(prev => ({ ...prev, member: '' }))
                  }}>
                    <option value="">— Select member —</option>
                    {members.map(m => (
                      <option key={m.id} value={m.name}>
                        {m.name} ({m.plan})
                      </option>
                    ))}
                  </select>
                  {/* Member preview */}
                  {form.member && (() => {
                    const m = members.find(x => x.name === form.member)
                    return m ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px' }}>
                        <div className={`avatar ${avColor(m.name)}`} style={{ width: 28, height: 28, fontSize: 10 }}>{m.avatar}</div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.goal} · {m.plan}</p>
                        </div>
                      </div>
                    ) : null
                  })()}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Assign Trainer</label>
                  <select className="form-select" value={form.trainer} onChange={e => set('trainer', e.target.value)}>
                    <option value="">— Select trainer —</option>
                    {trainers.map(t => (
                      <option key={t.id} value={t.name}>
                        {t.name} — {t.spec}
                      </option>
                    ))}
                  </select>
                  {/* Trainer preview */}
                  {form.trainer && (() => {
                    const t = trainers.find(x => x.name === form.trainer)
                    return t ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px' }}>
                        <div className={`avatar ${avColor(t.name)}`} style={{ width: 28, height: 28, fontSize: 10 }}>{t.avatar}</div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.spec} · ⭐ {t.rating}</p>
                        </div>
                      </div>
                    ) : null
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: Exercises ── */}
          {tab === 'exercises' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {form.exercises.length} exercise{form.exercises.length !== 1 ? 's' : ''} added
                </p>
                {form.exercises.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[...new Set(form.exercises.map(e => e.muscle))].slice(0, 4).map(m => (
                      <MuscleTag key={m} muscle={m} />
                    ))}
                  </div>
                )}
              </div>

              {errors.exercises && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--red)' }}>
                  ⚠ {errors.exercises}
                </div>
              )}

              <ExerciseEditor
                exercises={form.exercises}
                onChange={(exs) => { set('exercises', exs); setErrors(p => ({ ...p, exercises: '' })) }}
              />

              {/* Quick-add presets */}
              {form.exercises.length === 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12 }}>
                    Or start with a preset:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: '🏋️ Push Day',  exs: [
                        { name:'Bench Press',      sets:4,reps:'8', rest:'90s',muscle:'Chest'     },
                        { name:'Incline DB Press', sets:3,reps:'12',rest:'60s',muscle:'Chest'     },
                        { name:'Overhead Press',   sets:3,reps:'10',rest:'75s',muscle:'Shoulders' },
                        { name:'Lateral Raises',   sets:3,reps:'15',rest:'45s',muscle:'Shoulders' },
                        { name:'Tricep Pushdown',  sets:3,reps:'12',rest:'60s',muscle:'Arms'      },
                      ]},
                      { label: '🦵 Pull Day',  exs: [
                        { name:'Deadlift',         sets:4,reps:'6', rest:'120s',muscle:'Back'     },
                        { name:'Barbell Row',      sets:4,reps:'8', rest:'90s', muscle:'Back'     },
                        { name:'Pull-ups',         sets:3,reps:'8', rest:'90s', muscle:'Back'     },
                        { name:'Face Pulls',       sets:3,reps:'15',rest:'60s', muscle:'Shoulders'},
                        { name:'Barbell Curl',     sets:3,reps:'12',rest:'60s', muscle:'Arms'     },
                      ]},
                      { label: '🦵 Leg Day',  exs: [
                        { name:'Barbell Squat',    sets:4,reps:'8', rest:'120s',muscle:'Legs'     },
                        { name:'Romanian Deadlift',sets:4,reps:'10',rest:'90s', muscle:'Hamstrings'},
                        { name:'Leg Press',        sets:3,reps:'12',rest:'75s', muscle:'Legs'     },
                        { name:'Leg Curl',         sets:3,reps:'12',rest:'60s', muscle:'Hamstrings'},
                        { name:'Calf Raises',      sets:4,reps:'15',rest:'45s', muscle:'Legs'     },
                      ]},
                      { label: '🔥 HIIT Circuit', exs: [
                        { name:'Burpees',          sets:4,reps:'10',rest:'30s',muscle:'Full Body' },
                        { name:'Jump Squats',      sets:4,reps:'15',rest:'30s',muscle:'Legs'      },
                        { name:'Mountain Climbers',sets:4,reps:'30s',rest:'30s',muscle:'Core'     },
                        { name:'Push-ups',         sets:3,reps:'12',rest:'30s',muscle:'Chest'     },
                        { name:'High Knees',       sets:4,reps:'30s',rest:'30s',muscle:'Cardio'   },
                      ]},
                    ].map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        className="btn btn-ghost"
                        style={{ justifyContent: 'center', fontSize: 13 }}
                        onClick={() => { set('exercises', preset.exs); setErrors(p => ({ ...p, exercises:'' })) }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {tab === 'info' && (
            <button className="btn btn-outline" onClick={() => setTab('exercises')}>
              Next: Exercises →
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave}>
            {isEdit ? '💾 Save Changes' : '+ Create Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  DELETE CONFIRM
// ─────────────────────────────────────────────────────────────
function DeleteModal({ plan, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🗑️</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Plan</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Delete <strong style={{ color: 'var(--text)' }}>{plan.name}</strong>?<br />
            This cannot be undone.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" onClick={() => { onConfirm(plan.id); onClose() }}>
            Delete Plan
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MAIN PAGE EXPORT
// ─────────────────────────────────────────────────────────────
export default function Workouts({ search = '' }) {
  const { workoutPlans: workouts, addWorkoutPlan, updateWorkoutPlan, deleteWorkoutPlan, members, trainers, gymSettings } = useApp()
  const gymName = gymSettings?.name || 'IronForge Gym'

  const [goalFilter, setGoalFilter] = useState('All')
  const [viewPlan,   setViewPlan]   = useState(null)
  const [editPlan,   setEditPlan]   = useState(null)
  const [formOpen,   setFormOpen]   = useState(false)
  const [delPlan,    setDelPlan]    = useState(null)

  // ── CRUD handlers ─────────────────────────────────────────
  const handleSave = async (data) => {
    try {
      if (editPlan) {
        await updateWorkoutPlan(editPlan.id, data)
      } else {
        await addWorkoutPlan(data)
      }
    } catch (e) {
      console.error('Failed to save workout plan:', e)
    }
  }

  // ── Filter logic ──────────────────────────────────────────
  const goals    = ['All', ...GOALS.filter(g => workouts.some(w => w.goal === g))]
  const filtered = workouts.filter(w => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      w.name.toLowerCase().includes(q) ||
      w.member.toLowerCase().includes(q) ||
      w.trainer.toLowerCase().includes(q) ||
      w.goal.toLowerCase().includes(q)
    const matchGoal = goalFilter === 'All' || w.goal === goalFilter
    return matchSearch && matchGoal
  })

  // ── Summary stats ─────────────────────────────────────────
  const totalExercises = workouts.reduce((s, w) => s + (w.exercises?.length || 0), 0)
  const assigned       = workouts.filter(w => w.member).length

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h2>Workout Plans</h2>
          <p>{workouts.length} plans · {assigned} assigned to members</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditPlan(null); setFormOpen(true) }}>
          + Create Plan
        </button>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card orange">
          <span className="stat-icon">📋</span>
          <span className="stat-label">Total Plans</span>
          <span className="stat-value">{workouts.length}</span>
        </div>
        <div className="stat-card teal">
          <span className="stat-icon">👥</span>
          <span className="stat-label">Assigned</span>
          <span className="stat-value">{assigned}</span>
          <span className="stat-sub">of {workouts.length} plans</span>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">💪</span>
          <span className="stat-label">Total Exercises</span>
          <span className="stat-value">{totalExercises}</span>
        </div>
        <div className="stat-card amber">
          <span className="stat-icon">🎯</span>
          <span className="stat-label">Goals Covered</span>
          <span className="stat-value">{new Set(workouts.map(w => w.goal)).size}</span>
        </div>
      </div>

      {/* Goal filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {goals.map(g => {
          const gc = g === 'All' ? null : GOAL_COLOR[g]
          const active = goalFilter === g
          return (
            <button
              key={g}
              onClick={() => setGoalFilter(g)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${active ? (gc?.text || 'var(--teal)') : 'var(--border)'}`,
                background: active ? `${gc?.bg || 'rgba(0,200,180,0.1)'}` : 'var(--card)',
                color: active ? (gc?.text || 'var(--teal)') : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {g}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} plan{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {filtered.map(plan => (
            <WorkoutCard
              key={plan.id}
              plan={plan}
              members={members}
              trainers={trainers}
              onView={setViewPlan}
              onEdit={(p) => { setEditPlan(p); setFormOpen(true) }}
              onDelete={(p) => setDelPlan(p)}
              gymName={gymName}
            />
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          background: 'var(--card)', borderRadius: 'var(--radius)',
          border: '1px solid var(--card-border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💪</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No workout plans found</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            {search ? 'Try a different search term.' : 'Create your first workout plan to get started.'}
          </p>
          <button className="btn btn-primary" onClick={() => { setGoalFilter('All'); setEditPlan(null); setFormOpen(true) }}>
            + Create First Plan
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {viewPlan && (
        <WorkoutDetailModal
          plan={viewPlan}
          members={members}
          trainers={trainers}
          onEdit={(p) => { setEditPlan(p); setFormOpen(true) }}
          onClose={() => setViewPlan(null)}
          gymName={gymName}
        />
      )}

      {formOpen && (
        <PlanFormModal
          plan={editPlan}
          members={members}
          trainers={trainers}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditPlan(null) }}
        />
      )}

      {delPlan && (
        <DeleteModal
          plan={delPlan}
          onConfirm={(id) => { deleteWorkoutPlan(id); setDelPlan(null) }}
          onClose={() => setDelPlan(null)}
        />
      )}
    </div>
  )
}