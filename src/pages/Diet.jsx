import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { buildDietPlanWhatsAppMessage, buildDietPlanWhatsAppLink } from '../utils/whatsappReminders'
// ─── Mock / seed data (mirrors mockData.js pattern) ────────────────────────
const INITIAL_PLANS = [
  {
    id: 1,
    name: 'Lean Shred Protocol',
    goal: 'Fat Loss',
    calories: 1800,
    protein: 160,
    carbs: 150,
    fat: 55,
    assignedMember: 'Riya Sharma',
    assignedTrainer: 'Coach Arjun',
    duration: '8 weeks',
    status: 'Active',
    createdAt: '2025-04-10',
    meals: [
      { id: 1, name: 'Breakfast', time: '7:00 AM', calories: 380, items: ['Oats 80g', 'Egg whites 4', 'Banana 1', 'Black coffee'] },
      { id: 2, name: 'Mid Morning', time: '10:30 AM', calories: 200, items: ['Greek yogurt 150g', 'Almonds 20g', 'Green apple'] },
      { id: 3, name: 'Lunch', time: '1:00 PM', calories: 480, items: ['Brown rice 120g', 'Grilled chicken 150g', 'Broccoli 100g', 'Olive oil 1 tsp'] },
      { id: 4, name: 'Pre-Workout', time: '4:30 PM', calories: 220, items: ['Sweet potato 100g', 'Whey protein shake', 'Black coffee'] },
      { id: 5, name: 'Dinner', time: '8:00 PM', calories: 320, items: ['Salmon 130g', 'Spinach salad', 'Quinoa 80g', 'Lemon dressing'] },
      { id: 6, name: 'Night Snack', time: '10:00 PM', calories: 200, items: ['Casein protein shake', 'Peanut butter 1 tbsp'] },
    ],
  },
  {
    id: 2,
    name: 'Muscle Builder Extreme',
    goal: 'Muscle Gain',
    calories: 3200,
    protein: 220,
    carbs: 380,
    fat: 85,
    assignedMember: 'Karan Mehta',
    assignedTrainer: 'Coach Priya',
    duration: '12 weeks',
    status: 'Active',
    createdAt: '2025-03-22',
    meals: [
      { id: 1, name: 'Breakfast', time: '7:00 AM', calories: 680, items: ['Whole eggs 4', 'Whole wheat toast 3 slices', 'Avocado half', 'OJ 250ml', 'Whey shake'] },
      { id: 2, name: 'Mid Morning', time: '10:00 AM', calories: 420, items: ['Mass gainer shake', 'Banana 2', 'Peanut butter 2 tbsp'] },
      { id: 3, name: 'Lunch', time: '1:00 PM', calories: 780, items: ['White rice 200g', 'Chicken breast 200g', 'Lentils 100g', 'Mixed veggies', 'Ghee 1 tsp'] },
      { id: 4, name: 'Pre-Workout', time: '4:30 PM', calories: 380, items: ['Banana 2', 'Whey protein 40g', 'Oats 60g', 'Creatine'] },
      { id: 5, name: 'Post-Workout', time: '7:00 PM', calories: 500, items: ['Mass gainer 80g', 'Milk 400ml', 'Banana'] },
      { id: 6, name: 'Dinner', time: '9:00 PM', calories: 440, items: ['Beef 180g', 'Sweet potato 150g', 'Broccoli', 'Olive oil'] },
    ],
  },
  {
    id: 3,
    name: 'Keto Performance',
    goal: 'Keto / Low Carb',
    calories: 2100,
    protein: 175,
    carbs: 30,
    fat: 145,
    assignedMember: 'Sanya Patel',
    assignedTrainer: 'Coach Arjun',
    duration: '6 weeks',
    status: 'Paused',
    createdAt: '2025-05-01',
    meals: [
      { id: 1, name: 'Breakfast', time: '8:00 AM', calories: 500, items: ['Eggs 3 + yolks', 'Bacon 3 strips', 'Avocado 1', 'Butter coffee'] },
      { id: 2, name: 'Lunch', time: '1:00 PM', calories: 620, items: ['Salmon 180g', 'Caesar salad no croutons', 'Olive oil dressing', 'Cheese 40g'] },
      { id: 3, name: 'Snack', time: '4:00 PM', calories: 280, items: ['Almonds 40g', 'Cheddar 30g', 'Celery sticks'] },
      { id: 4, name: 'Dinner', time: '8:00 PM', calories: 700, items: ['Ribeye steak 220g', 'Asparagus', 'Garlic butter', 'Spinach sauté'] },
    ],
  },
  {
    id: 4,
    name: 'Maintenance & Balance',
    goal: 'Maintenance',
    calories: 2400,
    protein: 140,
    carbs: 280,
    fat: 75,
    assignedMember: 'Arjun Singh',
    assignedTrainer: 'Coach Priya',
    duration: 'Ongoing',
    status: 'Active',
    createdAt: '2025-02-14',
    meals: [
      { id: 1, name: 'Breakfast', time: '7:30 AM', calories: 520, items: ['Poha 150g', 'Boiled eggs 2', 'Fruits bowl', 'Green tea'] },
      { id: 2, name: 'Lunch', time: '1:00 PM', calories: 680, items: ['Dal 1 cup', 'Roti 3', 'Sabzi', 'Curd 100g', 'Salad'] },
      { id: 3, name: 'Snack', time: '5:00 PM', calories: 300, items: ['Sprouts chaat', 'Buttermilk', 'Roasted chana 30g'] },
      { id: 4, name: 'Dinner', time: '8:30 PM', calories: 500, items: ['Khichdi 200g', 'Grilled paneer 100g', 'Raita', 'Mixed salad'] },
      { id: 5, name: 'Post Dinner', time: '10:00 PM', calories: 400, items: ['Warm milk with turmeric', 'Banana'] },
    ],
  },
]

const GOALS = ['Fat Loss', 'Muscle Gain', 'Keto / Low Carb', 'Maintenance', 'Endurance', 'Vegan', 'Diabetic Friendly']
const STATUS_OPTIONS = ['Active', 'Paused', 'Completed']
const MEAL_TIMES = ['6:00 AM', '7:00 AM', '7:30 AM', '8:00 AM', '9:00 AM', '10:00 AM', '10:30 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '4:30 PM',
  '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM']

// ─── Helpers ────────────────────────────────────────────────────────────────
const GOAL_COLORS = {
  'Fat Loss':         { bg: 'rgba(232,66,10,0.13)', border: 'var(--orange)', text: 'var(--orange)', label: 'bg-red' },
  'Muscle Gain':      { bg: 'rgba(245,158,11,0.13)', border: 'var(--amber)', text: 'var(--amber)', label: 'bg-amber' },
  'Keto / Low Carb':  { bg: 'rgba(168,85,247,0.13)', border: 'var(--purple)', text: 'var(--purple)', label: 'bg-purple' },
  'Maintenance':      { bg: 'rgba(34,197,94,0.13)', border: 'var(--green)', text: 'var(--green)', label: 'bg-green' },
  'Endurance':        { bg: 'rgba(59,130,246,0.13)', border: '#3B82F6', text: '#60A5FA', label: 'bg-blue' },
  'Vegan':            { bg: 'rgba(34,197,94,0.13)', border: 'var(--green)', text: 'var(--green)', label: 'bg-emerald' },
  'Diabetic Friendly':{ bg: 'rgba(6,182,212,0.13)', border: 'var(--teal)', text: 'var(--teal)', label: 'bg-cyan' },
}
const goalColor = (goal) => GOAL_COLORS[goal] || { bg: '#ffffff11', border: '#666', text: '#aaa' }

const STATUS_STYLE = {
  Active:    { dot: 'var(--green)', text: 'var(--green)', bg: 'rgba(34,197,94,0.13)' },
  Paused:    { dot: 'var(--amber)', text: 'var(--amber)', bg: 'rgba(245,158,11,0.13)' },
  Completed: { dot: 'var(--text-muted)', text: 'var(--text-muted)', bg: 'rgba(96,112,160,0.13)' },
}

const macroColor = { protein: 'var(--orange)', carbs: 'var(--amber)', fat: 'var(--purple)' }

function calcMacroPercent(protein, carbs, fat) {
  const pc = protein * 4, cc = carbs * 4, fc = fat * 9
  const total = pc + cc + fc || 1
  return { protein: Math.round((pc / total) * 100), carbs: Math.round((cc / total) * 100), fat: Math.round((fc / total) * 100) }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MacroBar({ protein, carbs, fat }) {
  const pct = calcMacroPercent(protein, carbs, fat)
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        <div style={{ width: `${pct.protein}%`, background: macroColor.protein, borderRadius: 4 }} />
        <div style={{ width: `${pct.carbs}%`, background: macroColor.carbs, borderRadius: 4 }} />
        <div style={{ width: `${pct.fat}%`, background: macroColor.fat, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        {[['Protein', protein, 'g', macroColor.protein], ['Carbs', carbs, 'g', macroColor.carbs], ['Fat', fat, 'g', macroColor.fat]].map(([label, val, unit, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{val}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatPill({ icon, value, label, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: '#ffffff08', border: '1px solid #ffffff10',
      borderRadius: 10, padding: '10px 14px', minWidth: 70,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: color || '#fff', lineHeight: 1.2, marginTop: 2 }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
    </div>
  )
}

function GoalBadge({ goal }) {
  const c = goalColor(goal)
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}40`,
      color: c.text, borderRadius: 6, padding: '3px 10px',
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{goal}</span>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Paused
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.text,
      borderRadius: 20, padding: '3px 10px',
      fontSize: 11, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {status}
    </span>
  )
}

function MealTimeline({ meals }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {meals.map((meal, i) => (
        <div key={meal.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative' }}>
          {/* Timeline spine */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 18 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--orange),#F59E0B)',
              border: '2px solid #1a1a1a', zIndex: 1, marginTop: 4, flexShrink: 0,
            }} />
            {i < meals.length - 1 && (
              <div style={{ width: 2, flex: 1, minHeight: 28, background: '#ffffff12', borderRadius: 1 }} />
            )}
          </div>
          <div style={{ flex: 1, paddingBottom: i < meals.length - 1 ? 20 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{meal.name}</span>
              <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>{meal.calories} kcal</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{meal.time}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {meal.items.map((item, j) => (
                <span key={j} style={{
                  background: '#ffffff08', border: '1px solid #ffffff10',
                  color: 'var(--text-muted)', borderRadius: 4, padding: '2px 7px', fontSize: 11,
                }}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Plan Card ───────────────────────────────────────────────────────────────
function PlanCard({ plan, onView, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const gc = goalColor(plan.goal)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'linear-gradient(160deg,#161616 60%,#1a1a1a)',
        border: `1px solid ${hovered ? gc.border + '60' : '#ffffff12'}`,
        borderRadius: 16,
        padding: 22,
        cursor: 'pointer',
        transition: 'all 0.22s ease',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered ? `0 12px 40px ${gc.border}18, 0 0 0 1px ${gc.border}20` : '0 2px 12px #00000044',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* accent glow */}
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100, borderRadius: '50%',
        background: `radial-gradient(circle, ${gc.border}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', marginBottom: 6, letterSpacing: -0.3 }}>
            {plan.name}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <GoalBadge goal={plan.goal} />
            <StatusBadge status={plan.status} />
          </div>
        </div>
      </div>

      {/* Calorie big number */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
        marginBottom: 10, padding: '10px 14px',
        background: '#ffffff06', borderRadius: 10, border: '1px solid #ffffff08',
      }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--orange)', lineHeight: 1, fontFamily: "'Bebas Neue',sans-serif" }}>
          {plan.calories.toLocaleString()}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>kcal / day</span>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>⏱ {plan.duration}</div>
      </div>

      {/* Macro bar */}
      <div style={{ marginBottom: 14 }}>
        <MacroBar protein={plan.protein} carbs={plan.carbs} fat={plan.fat} />
      </div>

      {/* Assignment info */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, padding: '8px 12px',
        background: '#ffffff05', borderRadius: 8, border: '1px solid #ffffff08',
      }}>
        <div style={{ flex: 1, fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 1 }}>Member</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>👤 {plan.assignedMember}</div>
        </div>
        <div style={{ flex: 1, fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 1 }}>Trainer</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>🏋️ {plan.assignedTrainer}</div>
        </div>
        <div style={{ fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 1 }}>Meals</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>🍽️ {plan.meals.length}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onView(plan)} style={{
          flex: 1, padding: '8px 0',
          background: `linear-gradient(135deg, ${gc.border}22, ${gc.border}11)`,
          border: `1px solid ${gc.border}40`,
          borderRadius: 8, color: gc.text, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', letterSpacing: 0.3,
        }}>VIEW PLAN</button>
        <button onClick={() => onEdit(plan)} style={{
          padding: '8px 14px',
          background: '#ffffff08', border: '1px solid #ffffff15',
          borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>✏️</button>
        <button onClick={() => onDelete(plan.id)} style={{
          padding: '8px 14px',
          background: 'var(--orange)11', border: '1px solid var(--orange)30',
          borderRadius: 8, color: 'var(--orange)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>🗑</button>
      </div>
    </div>
  )
}

// ─── Detail Modal ────────────────────────────────────────────────────────────
function PlanDetailModal({ plan, onClose, onEdit, gymName }) {
  const pct = calcMacroPercent(plan.protein, plan.carbs, plan.fat)
  const totalMealCal = plan.meals.reduce((s, m) => s + m.calories, 0)
  const gc = goalColor(plan.goal)

  const handleWhatsAppShare = () => {
    const message = buildDietPlanWhatsAppMessage(plan, gymName)
    const link = buildDietPlanWhatsAppLink(message)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, backdropFilter: 'blur(6px)',
    }} onClick={onClose}>
      <div style={{
        background: '#111', border: `1px solid ${gc.border}30`,
        borderRadius: 20, width: '100%', maxWidth: 740,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: `0 30px 80px #000, 0 0 0 1px ${gc.border}20`,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid #ffffff10',
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: '#111',
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: 'var(--text)', letterSpacing: 1 }}>
                {plan.name}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <GoalBadge goal={plan.goal} />
                <StatusBadge status={plan.status} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleWhatsAppShare} style={{
                padding: '8px 16px', background: '#25D366',
                border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                💬 Share via WhatsApp
              </button>
              <button onClick={() => { onClose(); onEdit(plan) }} style={{
                padding: '8px 16px', background: '#ffffff10',
                border: '1px solid #ffffff20', borderRadius: 8,
                color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>✏️ EDIT</button>
              <button onClick={onClose} style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'var(--orange)15', border: '1px solid var(--orange)30',
                color: 'var(--orange)', fontSize: 18, cursor: 'pointer',
              }}>×</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Stat row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatPill icon="🔥" value={plan.calories.toLocaleString()} label="kcal" color="var(--orange)" />
            <StatPill icon="🥩" value={`${plan.protein}g`} label="Protein" color="var(--orange)" />
            <StatPill icon="🍞" value={`${plan.carbs}g`} label="Carbs" color="#F59E0B" />
            <StatPill icon="🥑" value={`${plan.fat}g`} label="Fat" color="#8B5CF6" />
            <StatPill icon="🍽️" value={plan.meals.length} label="Meals" color="#10B981" />
            <StatPill icon="📅" value={plan.duration} label="Duration" color="#60A5FA" />
          </div>

          {/* Macro visual */}
          <div style={{
            background: '#ffffff06', border: '1px solid #ffffff10',
            borderRadius: 12, padding: '16px 20px', marginBottom: 24,
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Macro Distribution
            </div>
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, marginBottom: 12 }}>
              <div style={{ width: `${pct.protein}%`, background: `linear-gradient(90deg, var(--orange), var(--orange))`, borderRadius: 6 }} />
              <div style={{ width: `${pct.carbs}%`, background: `linear-gradient(90deg, #F59E0B, var(--amber))`, borderRadius: 6 }} />
              <div style={{ width: `${pct.fat}%`, background: `linear-gradient(90deg, #8B5CF6, var(--purple))`, borderRadius: 6 }} />
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              {[
                ['Protein', plan.protein, 'g', pct.protein, 'var(--orange)'],
                ['Carbohydrates', plan.carbs, 'g', pct.carbs, '#F59E0B'],
                ['Fat', plan.fat, 'g', pct.fat, '#8B5CF6'],
              ].map(([name, val, unit, perc, color]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{val}{unit} <span style={{ fontSize: 11, color, fontWeight: 600 }}>({perc}%)</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Assignment */}
          <div style={{
            display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap',
          }}>
            {[['👤 Member', plan.assignedMember], ['🏋️ Trainer', plan.assignedTrainer], ['📅 Created', plan.createdAt]].map(([label, val]) => (
              <div key={label} style={{
                flex: 1, minWidth: 140,
                background: '#ffffff06', border: '1px solid #ffffff10',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Meal Timeline */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
              Meal Schedule · {totalMealCal} kcal total
            </div>
            <MealTimeline meals={plan.meals} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Plan Form Modal ─────────────────────────────────────────────────────────
const EMPTY_PLAN = {
  name: '', goal: 'Fat Loss', calories: '', protein: '', carbs: '', fat: '',
  assignedMember: '', assignedTrainer: '', duration: '', status: 'Active',
  meals: [{ id: Date.now(), name: 'Breakfast', time: '7:00 AM', calories: '', items: [''] }],
}

function PlanFormModal({ existing, onSave, onClose, members = [] }) {
  const [form, setForm] = useState(() => {
    if (existing) {
      const f = { ...existing, meals: existing.meals.map(m => ({ ...m, items: [...m.items] })) }
      if (!f.memberId) {
        const m = members.find(x => x.name === f.assignedMember)
        if (m) { f.memberId = m.id; f.authUid = m.authUid }
      }
      return f
    }
    return { ...EMPTY_PLAN, meals: [{ id: Date.now(), name: 'Breakfast', time: '7:00 AM', calories: '', items: [''] }] }
  })
  const [errors, setErrors] = useState({})
  const [step, setStep] = useState(0) // 0=details, 1=meals

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Plan name required'
    if (!form.calories || isNaN(form.calories) || +form.calories <= 0) e.calories = 'Valid calories required'
    if (!form.protein || isNaN(form.protein) || +form.protein < 0) e.protein = 'Valid protein required'
    if (!form.carbs || isNaN(form.carbs) || +form.carbs < 0) e.carbs = 'Valid carbs required'
    if (!form.fat || isNaN(form.fat) || +form.fat < 0) e.fat = 'Valid fat required'
    if (!form.assignedMember.trim()) e.assignedMember = 'Assign a member'
    if (!form.assignedTrainer.trim()) e.assignedTrainer = 'Assign a trainer'
    if (!form.duration.trim()) e.duration = 'Duration required'
    form.meals.forEach((m, i) => {
      if (!m.name.trim()) e[`meal_name_${i}`] = 'Meal name required'
      if (!m.calories || isNaN(m.calories)) e[`meal_cal_${i}`] = 'Calories required'
    })
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({
      ...form,
      id: existing?.id || Date.now(),
      calories: +form.calories, protein: +form.protein, carbs: +form.carbs, fat: +form.fat,
      createdAt: existing?.createdAt || new Date().toISOString().split('T')[0],
      meals: form.meals.map(m => ({ ...m, calories: +m.calories, items: m.items.filter(i => i.trim()) })),
    })
  }

  const addMeal = () => setForm(f => ({
    ...f, meals: [...f.meals, { id: Date.now(), name: '', time: '12:00 PM', calories: '', items: [''] }]
  }))
  const removeMeal = (idx) => setForm(f => ({ ...f, meals: f.meals.filter((_, i) => i !== idx) }))
  const updateMeal = (idx, key, val) => setForm(f => ({
    ...f, meals: f.meals.map((m, i) => i === idx ? { ...m, [key]: val } : m)
  }))
  const updateItem = (mealIdx, itemIdx, val) => setForm(f => ({
    ...f, meals: f.meals.map((m, i) => i === mealIdx ? { ...m, items: m.items.map((it, j) => j === itemIdx ? val : it) } : m)
  }))
  const addItem = (mealIdx) => setForm(f => ({
    ...f, meals: f.meals.map((m, i) => i === mealIdx ? { ...m, items: [...m.items, ''] } : m)
  }))
  const removeItem = (mealIdx, itemIdx) => setForm(f => ({
    ...f, meals: f.meals.map((m, i) => i === mealIdx ? { ...m, items: m.items.filter((_, j) => j !== itemIdx) } : m)
  }))

  const inp = (key, placeholder, type = 'text', extra = {}) => ({
    value: form[key],
    onChange: e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(err => ({ ...err, [key]: '' })) },
    placeholder,
    type,
    style: {
      width: '100%', padding: '10px 12px', boxSizing: 'border-box',
      background: errors[key] ? 'var(--orange)11' : '#ffffff08',
      border: `1px solid ${errors[key] ? 'var(--orange)60' : '#ffffff15'}`,
      borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
    },
    ...extra
  })

  const labelStyle = { fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' }
  const errStyle = { color: 'var(--orange)', fontSize: 11, marginTop: 3 }
  const gridTwo = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }
  const gridThree = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #ffffff18', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 30px 80px #000' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #ffffff10', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#111', zIndex: 2, borderRadius: '20px 20px 0 0' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--text)', letterSpacing: 1 }}>
              {existing ? 'EDIT DIET PLAN' : 'CREATE DIET PLAN'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {existing ? `Editing: ${existing.name}` : 'Add a new nutrition plan for a member'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--orange)15', border: '1px solid var(--orange)30', color: 'var(--orange)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        {/* Step tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ffffff10' }}>
          {['📋 Plan Details', '🍽️ Meal Schedule'].map((label, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              flex: 1, padding: '12px 0',
              background: step === i ? 'var(--orange)18' : 'transparent',
              border: 'none', borderBottom: `2px solid ${step === i ? 'var(--orange)' : 'transparent'}`,
              color: step === i ? 'var(--orange)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
            }}>{label}</button>
          ))}
        </div>

        <div style={{ padding: '22px 26px' }}>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Plan Name *</label>
                <input {...inp('name', 'e.g. Lean Shred Protocol')} />
                {errors.name && <div style={errStyle}>{errors.name}</div>}
              </div>
              <div style={gridTwo}>
                <div>
                  <label style={labelStyle}>Goal *</label>
                  <select value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} style={{ ...inp('goal').style, cursor: 'pointer' }}>
                    {GOALS.map(g => <option key={g} value={g} style={{ background: '#1a1a1a' }}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...inp('status').style, cursor: 'pointer' }}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ background: '#1a1a1a' }}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Total Daily Calories (kcal) *</label>
                <input {...inp('calories', 'e.g. 2200', 'number')} min="0" />
                {errors.calories && <div style={errStyle}>{errors.calories}</div>}
              </div>
              <div style={gridThree}>
                {['protein', 'carbs', 'fat'].map(macro => (
                  <div key={macro}>
                    <label style={labelStyle}>{macro.charAt(0).toUpperCase() + macro.slice(1)} (g) *</label>
                    <input {...inp(macro, 'e.g. 150', 'number')} min="0" />
                    {errors[macro] && <div style={errStyle}>{errors[macro]}</div>}
                  </div>
                ))}
              </div>
              {form.protein && form.carbs && form.fat && (
                <div style={{ background: '#ffffff06', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700 }}>MACRO PREVIEW</div>
                  <MacroBar protein={+form.protein} carbs={+form.carbs} fat={+form.fat} />
                </div>
              )}
              <div style={gridTwo}>
                <div>
                  <label style={labelStyle}>Assigned Member *</label>
                  <select value={form.assignedMember} onChange={e => {
                    const val = e.target.value
                    const m = members.find(x => x.name === val)
                    setForm(f => ({ ...f, assignedMember: val, memberId: m ? m.id : '', authUid: m ? m.authUid : '' }))
                    setErrors(err => ({ ...err, assignedMember: '' }))
                  }} style={{ ...inp('assignedMember').style, cursor: 'pointer' }}>
                    <option value="">— Select member —</option>
                    {members.map(m => <option key={m.id} value={m.name} style={{ background: '#1a1a1a' }}>{m.name} ({m.plan})</option>)}
                  </select>
                  {errors.assignedMember && <div style={errStyle}>{errors.assignedMember}</div>}
                  {form.assignedMember && members.find(x => x.name === form.assignedMember) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: '#ffffff08', borderRadius: 8, padding: '8px 12px' }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{form.assignedMember}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{members.find(x => x.name === form.assignedMember)?.goal} · {members.find(x => x.name === form.assignedMember)?.plan}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Assigned Trainer *</label>
                  <input {...inp('assignedTrainer', 'Trainer name')} />
                  {errors.assignedTrainer && <div style={errStyle}>{errors.assignedTrainer}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Duration *</label>
                <input {...inp('duration', 'e.g. 8 weeks, Ongoing')} />
                {errors.duration && <div style={errStyle}>{errors.duration}</div>}
              </div>
              <button onClick={() => setStep(1)} style={{
                width: '100%', padding: '12px', background: 'linear-gradient(135deg,var(--orange),#F59E0B)',
                border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 14,
                cursor: 'pointer', letterSpacing: 1,
              }}>NEXT: MEAL SCHEDULE →</button>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {form.meals.map((meal, mIdx) => (
                <div key={meal.id} style={{ background: '#ffffff06', border: '1px solid #ffffff10', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>Meal {mIdx + 1}</div>
                    {form.meals.length > 1 && (
                      <button onClick={() => removeMeal(mIdx)} style={{ background: 'var(--orange)15', border: '1px solid var(--orange)30', color: 'var(--orange)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                    )}
                  </div>
                  <div style={{ ...gridThree, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Meal Name *</label>
                      <input value={meal.name} onChange={e => updateMeal(mIdx, 'name', e.target.value)} placeholder="e.g. Breakfast" style={{ width: '100%', padding: '9px 11px', boxSizing: 'border-box', background: '#ffffff08', border: `1px solid ${errors[`meal_name_${mIdx}`] ? 'var(--orange)60' : '#ffffff15'}`, borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                      {errors[`meal_name_${mIdx}`] && <div style={errStyle}>{errors[`meal_name_${mIdx}`]}</div>}
                    </div>
                    <div>
                      <label style={labelStyle}>Time</label>
                      <select value={meal.time} onChange={e => updateMeal(mIdx, 'time', e.target.value)} style={{ width: '100%', padding: '9px 11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                        {MEAL_TIMES.map(t => <option key={t} value={t} style={{ background: '#1a1a1a' }}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Calories *</label>
                      <input value={meal.calories} onChange={e => updateMeal(mIdx, 'calories', e.target.value)} placeholder="kcal" type="number" min="0" style={{ width: '100%', padding: '9px 11px', boxSizing: 'border-box', background: '#ffffff08', border: `1px solid ${errors[`meal_cal_${mIdx}`] ? 'var(--orange)60' : '#ffffff15'}`, borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                      {errors[`meal_cal_${mIdx}`] && <div style={errStyle}>{errors[`meal_cal_${mIdx}`]}</div>}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Food Items</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {meal.items.map((item, iIdx) => (
                        <div key={iIdx} style={{ display: 'flex', gap: 6 }}>
                          <input value={item} onChange={e => updateItem(mIdx, iIdx, e.target.value)} placeholder={`Item ${iIdx + 1}`} style={{ flex: 1, padding: '8px 11px', background: '#ffffff08', border: '1px solid #ffffff12', borderRadius: 7, color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                          {meal.items.length > 1 && (
                            <button onClick={() => removeItem(mIdx, iIdx)} style={{ background: 'var(--orange)10', border: '1px solid var(--orange)20', color: 'var(--orange)', borderRadius: 7, width: 32, cursor: 'pointer', fontSize: 14 }}>×</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addItem(mIdx)} style={{ padding: '7px', background: '#ffffff06', border: '1px dashed #ffffff20', borderRadius: 7, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>+ Add Item</button>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addMeal} style={{ padding: '10px', background: '#ffffff06', border: '1px dashed #ffffff20', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>+ ADD MEAL</button>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setStep(0)} style={{ flex: 1, padding: '12px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 10, color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>← BACK</button>
                <button onClick={handleSave} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,var(--orange),#F59E0B)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
                  {existing ? '✔ SAVE CHANGES' : '✔ CREATE PLAN'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ──────────────────────────────────────────────────────────
function DeleteConfirm({ plan, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#111', border: '1px solid var(--orange)30', borderRadius: 16, padding: 28, maxWidth: 380, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px #000' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--text)', letterSpacing: 1, marginBottom: 8 }}>DELETE PLAN?</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 22 }}>
          This will permanently delete <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{plan.name}</span>. This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px', background: '#ffffff08', border: '1px solid #ffffff15', borderRadius: 9, color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg,var(--orange),#c0392b)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Diet Page ───────────────────────────────────────────────────────────
export default function Diet({ search = '' }) {
  const { darkMode, gymSettings, dietPlans, addDietPlan, updateDietPlan, deleteDietPlan, members } = useApp()
  const gymName = gymSettings?.name || 'IronForge Gym'
  const [viewPlan, setViewPlan] = useState(null)
  const [editPlan, setEditPlan] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [delPlan, setDelPlan] = useState(null)
  const [filterGoal, setFilterGoal] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [localSearch, setLocalSearch] = useState('')

  const searchTerm = (search || localSearch).toLowerCase()

  const filtered = useMemo(() => dietPlans.filter(p => {
    const matchSearch = !searchTerm ||
      p.name.toLowerCase().includes(searchTerm) ||
      (p.assignedMember || '').toLowerCase().includes(searchTerm) ||
      (p.assignedTrainer || '').toLowerCase().includes(searchTerm) ||
      p.goal.toLowerCase().includes(searchTerm)
    const matchGoal = filterGoal === 'All' || p.goal === filterGoal
    const matchStatus = filterStatus === 'All' || p.status === filterStatus
    return matchSearch && matchGoal && matchStatus
  }), [dietPlans, searchTerm, filterGoal, filterStatus])

  const stats = useMemo(() => ({
    total: dietPlans.length,
    active: dietPlans.filter(p => p.status === 'Active').length,
    avgCal: Math.round(dietPlans.reduce((s, p) => s + p.calories, 0) / (dietPlans.length || 1)),
    goals: [...new Set(dietPlans.map(p => p.goal))].length,
  }), [dietPlans])

  const handleSave = async (plan) => {
    try {
      if (plan.id && dietPlans.find(p => p.id === plan.id)) {
        await updateDietPlan(plan.id, plan)
      } else {
        const { id, ...rest } = plan
        await addDietPlan(rest)
      }
    } catch (e) {
      console.error('Failed to save diet plan:', e)
    }
    setShowForm(false)
    setEditPlan(null)
  }

  const handleDelete = async (id) => {
    try {
      await deleteDietPlan(id)
    } catch (e) {
      console.error('Failed to delete diet plan:', e)
    }
    setDelPlan(null)
  }

  const openEdit = (plan) => { setEditPlan(plan); setShowForm(true) }

  // ── Styles ──
  const filterBtn = (active) => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.15s',
    background: active ? 'linear-gradient(135deg,var(--orange),#F59E0B)' : '#ffffff09',
    border: active ? 'none' : '1px solid #ffffff15',
    color: active ? '#fff' : 'var(--text-muted)',
  })

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', fontFamily: "'Barlow', sans-serif", color: 'var(--text)' }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, letterSpacing: 2, color: 'var(--text)' }}>
            DIET PLANS
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
            {stats.active} active plans · {stats.total} total · {stats.goals} goal types
          </div>
        </div>
        <button onClick={() => { setEditPlan(null); setShowForm(true) }} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', background: 'linear-gradient(135deg,var(--orange),#F59E0B)',
          border: 'none', borderRadius: 10, color: '#fff',
          fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5,
          boxShadow: '0 4px 20px var(--orange)40',
        }}>
          <span style={{ fontSize: 16 }}>+</span> CREATE PLAN
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Plans', value: stats.total, icon: '📋', color: '#60A5FA' },
          { label: 'Active Plans', value: stats.active, icon: '✅', color: '#10B981' },
          { label: 'Avg Calories', value: `${stats.avgCal.toLocaleString()} kcal`, icon: '🔥', color: 'var(--orange)' },
          { label: 'Goal Types', value: stats.goals, icon: '🎯', color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#161616', border: '1px solid #ffffff10',
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
          <input
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search plans, members, trainers..."
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, boxSizing: 'border-box', background: '#161616', border: '1px solid #ffffff15', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['All', ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={filterBtn(filterStatus === s)}>{s}</button>
          ))}
        </div>
        <select value={filterGoal} onChange={e => setFilterGoal(e.target.value)} style={{ padding: '8px 12px', background: '#161616', border: '1px solid #ffffff15', borderRadius: 10, color: filterGoal === 'All' ? 'var(--text-muted)' : 'var(--text)', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          <option value="All">All Goals</option>
          {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Plans grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🥗</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, marginBottom: 8 }}>NO PLANS FOUND</div>
          <div style={{ fontSize: 13 }}>Try adjusting your filters or create a new diet plan.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {filtered.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onView={setViewPlan}
              onEdit={openEdit}
              onDelete={(id) => setDelPlan(dietPlans.find(p => p.id === id))}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {viewPlan && <PlanDetailModal plan={viewPlan} onClose={() => setViewPlan(null)} onEdit={(p) => { setViewPlan(null); openEdit(p) }} gymName={gymName} />}
      {showForm && <PlanFormModal existing={editPlan} onSave={handleSave} onClose={() => { setShowForm(false); setEditPlan(null) }} members={members} />}
      {delPlan && <DeleteConfirm plan={delPlan} onConfirm={() => handleDelete(delPlan.id)} onCancel={() => setDelPlan(null)} />}
    </div>
  )
}