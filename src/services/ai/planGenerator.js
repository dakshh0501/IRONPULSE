// src/services/ai/planGenerator.js
// ─────────────────────────────────────────────────────────────
// IRONPULSE AI — Workout & Diet Plan Generator (Sprint 78B).
//
// Generates structured workout / diet plans with Gemini and
// returns them shaped exactly like the EXISTING workoutPlans /
// dietPlans Firestore documents — no new schema, no new
// collections. When Gemini is not configured (or fails), a
// deterministic offline builder produces a valid plan so the
// feature never dead-ends.
//
// Permission model (enforced by callers + Firestore rules):
//   - Trainer/gym_admin: generate, edit, save, assign.
//   - Member:            generate a personal draft; drafts are
//                        saved with ownerType:'draft' and can
//                        never touch trainer-owned plans.
//
// Every write path stays inside the existing AppContext CRUD
// wrappers; this module never touches Firestore directly.
// ─────────────────────────────────────────────────────────────

import { generateJson } from './providers/geminiProvider'

// ── Existing schema shapes (mirrors pages/Workouts.jsx + Diet.jsx) ──
export const WORKOUT_GOALS = Object.freeze(['Weight Loss', 'Muscle Gain', 'Strength', 'Flexibility', 'Toning', 'Endurance', 'General Fitness'])
export const DIET_GOALS    = Object.freeze(['Fat Loss', 'Muscle Gain', 'Keto / Low Carb', 'Maintenance', 'Endurance', 'Vegan', 'Diabetic Friendly'])
export const LEVELS        = Object.freeze(['Beginner', 'Intermediate', 'Advanced'])
const DURATIONS            = Object.freeze(['30 min', '45 min', '60 min', '75 min', '90 min'])
const DIET_STATUSES        = Object.freeze(['Active', 'Paused', 'Completed'])

export function emptyWorkoutPlan() {
  return {
    name: '', member: '', trainer: '', trainerAuthUid: '',
    memberId: '', authUid: '',
    goal: 'Weight Loss', level: 'Beginner', days: 3, duration: '45 min',
    split: '', exercises: [],
  }
}

export function emptyDietPlan() {
  return {
    name: '', goal: 'Fat Loss', calories: '', protein: '', carbs: '', fat: '',
    hydration: '', assignedMember: '', assignedTrainer: '', assignedTrainerAuthUid: '',
    memberId: '', authUid: '', duration: '4 weeks', status: 'Active',
    meals: [],
  }
}

// ── Gemini prompts (documented deliverable) ─────────────────
export const WORKOUT_PROMPT = (opts) => `
Create a ${opts.days}-day ${opts.level} workout plan for goal: ${opts.goal}.
Session duration: ${opts.duration}${opts.focus ? `. Focus/equipment: ${opts.focus}.` : ''}

Return ONLY a JSON object with EXACTLY this shape (no markdown, no extra keys):
{
  "name": "Short plan title (e.g. Push Pull Legs - Fat Loss)",
  "goal": "${opts.goal}",
  "level": "${opts.level}",
  "days": ${opts.days},
  "duration": "${opts.duration}",
  "split": "e.g. Push / Pull / Legs",
  "exercises": [
    { "name": "Exercise name", "sets": 3, "reps": "10-12", "rest": "60s", "muscle": "Chest", "notes": "1 sentence form tip" }
  ]
}
Rules:
- exercises.length must equal days (one array entry PER day; each entry is the day's signature exercise block).
- Use realistic, safe exercises; muscle must be one of: Chest, Back, Legs, Shoulders, Arms, Core, Glutes, Hamstrings, Full Body, Cardio.
- reps is a STRING like "8-12". sets is a NUMBER. rest like "60s".
- The whole array must contain at least ${opts.days} entries (one per training day).
`

export const DIET_PROMPT = (opts) => `
Create a ${opts.meals}-meal daily diet plan for goal: ${opts.goal}.
Target calories: ${opts.calories} kcal/day.
Macros target: protein ${opts.protein}g, carbs ${opts.carbs}g, fat ${opts.fat}g.
Cuisine preference: ${opts.cuisine}.${opts.restrictions ? ` Restrictions: ${opts.restrictions}.` : ''}

Return ONLY a JSON object with EXACTLY this shape (no markdown, no extra keys):
{
  "name": "Short plan title (e.g. Lean Shred Protocol)",
  "goal": "${opts.goal}",
  "calories": ${opts.calories},
  "protein": ${opts.protein},
  "carbs": ${opts.carbs},
  "fat": ${opts.fat},
  "hydration": "e.g. 2.5 L of water daily",
  "duration": "4 weeks",
  "status": "Active",
  "meals": [
    { "name": "Breakfast", "time": "7:00 AM", "calories": 450, "items": ["2 whole eggs + 1 egg white", "1 slice whole wheat toast", "Black coffee"] }
  ]
}
Rules:
- meals.length must equal ${opts.meals}. Times progress through the day.
- Each meal has 3-5 real food items (name only, no quantities inside brackets).
- Sum of meal calories should approximate the daily target (within +-150 kcal).
- calorie values are NUMBERS.
`

const SYSTEM_GEN = 'You are a certified fitness and nutrition coach. You output structured JSON only, for a gym management app. Never invent allergies; stay safe and realistic. Never fabricate user data.'

// ── Sanitize + normalize into the existing schema ───────────
function sanitizeWorkoutPlan(raw, opts) {
  const plan = emptyWorkoutPlan()
  plan.name = String(raw?.name || `${opts.goal} — ${opts.level} Program`).slice(0, 80)
  plan.goal = WORKOUT_GOALS.includes(raw?.goal) ? raw.goal : opts.goal
  plan.level = LEVELS.includes(raw?.level) ? raw.level : opts.level
  plan.days = Math.min(7, Math.max(1, Number(raw?.days) || opts.days))
  plan.duration = DURATIONS.includes(raw?.duration) ? raw.duration : (opts.duration || '45 min')
  plan.split = String(raw?.split || '').slice(0, 60)
  const ex = Array.isArray(raw?.exercises) ? raw.exercises : []
  plan.exercises = ex.slice(0, 42).map(e => ({
    name: String(e?.name || 'Exercise').slice(0, 60),
    sets: Math.min(10, Math.max(1, Number(e?.sets) || 3)),
    reps: String(e?.reps || '10-12').slice(0, 10),
    rest: String(e?.rest || '60s').slice(0, 8),
    muscle: String(e?.muscle || 'Full Body').slice(0, 20),
    notes: String(e?.notes || '').slice(0, 140),
  })).filter(e => e.name && e.name !== 'Exercise')
  return plan
}

function sanitizeDietPlan(raw, opts) {
  const plan = emptyDietPlan()
  plan.name = String(raw?.name || `${opts.goal} — Nutrition Plan`).slice(0, 80)
  plan.goal = DIET_GOALS.includes(raw?.goal) ? raw.goal : opts.goal
  plan.calories = Math.round(Number(raw?.calories) || opts.calories)
  plan.protein = Math.round(Number(raw?.protein) || opts.protein)
  plan.carbs = Math.round(Number(raw?.carbs) || opts.carbs)
  plan.fat = Math.round(Number(raw?.fat) || opts.fat)
  plan.hydration = String(raw?.hydration || '2.5 L of water daily').slice(0, 60)
  plan.duration = String(raw?.duration || '4 weeks').slice(0, 20)
  plan.status = DIET_STATUSES.includes(raw?.status) ? raw.status : 'Active'
  const meals = Array.isArray(raw?.meals) ? raw.meals : []
  plan.meals = meals.slice(0, 8).map(m => ({
    name: String(m?.name || 'Meal').slice(0, 40),
    time: String(m?.time || '').slice(0, 10),
    calories: Math.max(0, Math.round(Number(m?.calories) || 0)),
    items: Array.isArray(m?.items) ? m.items.map(i => String(i).slice(0, 80)).filter(Boolean).slice(0, 6) : [],
  })).filter(m => m.name && m.items.length)
  return plan
}

// ── Offline deterministic builders (no API key / failure) ───
const BASE_EXERCISES = [
  { name: 'Push-ups', muscle: 'Chest', sets: 3, reps: '10-12', rest: '60s', notes: 'Keep core tight; lower chest to just above the floor.' },
  { name: 'Squats', muscle: 'Legs', sets: 3, reps: '12-15', rest: '90s', notes: 'Sit back like a chair; knees track over toes.' },
  { name: 'Bent-Over Rows', muscle: 'Back', sets: 3, reps: '10-12', rest: '90s', notes: 'Flat back, pull elbows to hips.' },
  { name: 'Overhead Press', muscle: 'Shoulders', sets: 3, reps: '8-10', rest: '90s', notes: 'Squeeze glutes, avoid arching the lower back.' },
  { name: 'Plank', muscle: 'Core', sets: 3, reps: '45-60s', rest: '45s', notes: 'Straight line from head to heels.' },
  { name: 'Lunges', muscle: 'Legs', sets: 3, reps: '10-12 each', rest: '60s', notes: 'Step long; front knee over ankle.' },
  { name: 'Dumbbell Curls', muscle: 'Arms', sets: 3, reps: '10-12', rest: '45s', notes: 'Keep elbows pinned to your sides.' },
  { name: 'Mountain Climbers', muscle: 'Cardio', sets: 3, reps: '30s', rest: '30s', notes: 'Drive knees fast, hips low.' },
]
const SPLITS = {
  'Weight Loss': ['Full Body HIIT', 'Cardio Core', 'Lower Body'],
  'Muscle Gain': ['Push', 'Pull', 'Legs'],
  Strength: ['Heavy Upper', 'Heavy Lower', 'Accessory'],
  Toning: ['Upper Body', 'Lower Body', 'Full Body'],
  Flexibility: ['Mobility', 'Stretch & Core', 'Yoga Flow'],
  Endurance: ['Interval Cardio', 'Tempo Run', 'Cross-Training'],
  'General Fitness': ['Full Body', 'Upper Body', 'Lower Body'],
}
function offlineWorkoutPlan(opts) {
  const plan = emptyWorkoutPlan()
  const split = SPLITS[opts.goal] || SPLITS['General Fitness']
  plan.name = `${opts.goal} — ${opts.level} Program`
  plan.goal = opts.goal
  plan.level = opts.level
  plan.days = opts.days
  plan.duration = opts.duration
  plan.split = split.join(' / ')
  const repsScale = opts.level === 'Beginner' ? '10-12' : opts.level === 'Intermediate' ? '8-10' : '6-8'
  const sets = opts.level === 'Beginner' ? 3 : 4
  plan.exercises = Array.from({ length: opts.days }, (_, i) => ({
    ...BASE_EXERCISES[i % BASE_EXERCISES.length],
    sets,
    reps: BASE_EXERCISES[i % BASE_EXERCISES.length].muscle === 'Cardio' ? '30s' : repsScale,
    name: `${split[i % split.length]}: ${BASE_EXERCISES[i % BASE_EXERCISES.length].name}`,
    notes: BASE_EXERCISES[i % BASE_EXERCISES.length].notes,
  }))
  return plan
}

const MEAL_BLOCKS = [
  { name: 'Breakfast', time: '7:00 AM', items: ['2 whole eggs + 1 egg white', '1 slice whole wheat toast', 'Black coffee'], cal: 400 },
  { name: 'Mid-Morning Snack', time: '10:30 AM', items: ['1 apple', '1 tbsp peanut butter', '10 almonds'], cal: 250 },
  { name: 'Lunch', time: '1:00 PM', items: ['150g grilled chicken breast', '1 cup brown rice', 'Steamed broccoli'], cal: 600 },
  { name: 'Post-Workout', time: '4:30 PM', items: ['1 scoop whey protein', '1 banana'], cal: 250 },
  { name: 'Dinner', time: '8:00 PM', items: ['150g paneer / tofu stir-fry', 'Mixed salad with olive oil', '1 cup dal'], cal: 550 },
  { name: 'Bedtime Snack', time: '10:00 PM', items: ['1 cup low-fat curd', '1 tsp honey'], cal: 150 },
]
function offlineDietPlan(opts) {
  const plan = emptyDietPlan()
  plan.name = `${opts.goal} — Nutrition Plan`
  plan.goal = opts.goal
  plan.calories = opts.calories
  plan.protein = opts.protein
  plan.carbs = opts.carbs
  plan.fat = opts.fat
  plan.hydration = '2.5 L of water daily'
  const base = opts.goal === 'Muscle Gain' ? MEAL_BLOCKS : MEAL_BLOCKS.map(m => ({ ...m }))
  plan.meals = base.slice(0, opts.meals).map((m, i) => ({
    name: m.name,
    time: m.time,
    calories: i === 0 ? Math.round(opts.calories * 0.25) : Math.round((opts.calories - Math.round(opts.calories * 0.25)) / Math.max(1, opts.meals - 1)),
    items: [...m.items],
  }))
  return plan
}

// ── Default macro split by goal (offline path) ──────────────
export function macrosForGoal(goal, calories) {
  const c = Math.max(800, Number(calories) || 2000)
  if (goal === 'Fat Loss') return { calories: c, protein: Math.round(c * 0.4 / 4), carbs: Math.round(c * 0.3 / 4), fat: Math.round(c * 0.3 / 9) }
  if (goal === 'Muscle Gain') return { calories: c, protein: Math.round(c * 0.3 / 4), carbs: Math.round(c * 0.45 / 4), fat: Math.round(c * 0.25 / 9) }
  if (goal === 'Keto / Low Carb') return { calories: c, protein: Math.round(c * 0.35 / 4), carbs: Math.round(c * 0.1 / 4), fat: Math.round(c * 0.55 / 9) }
  return { calories: c, protein: Math.round(c * 0.3 / 4), carbs: Math.round(c * 0.45 / 4), fat: Math.round(c * 0.25 / 9) }
}

// ── Public generation API ───────────────────────────────────
/**
 * @param {Object} opts { goal, level, days, duration, focus }
 * @returns {Promise<{plan: Object, source: 'gemini'|'offline'}>}
 */
export async function generateWorkoutPlan(opts = {}) {
  const params = {
    goal: WORKOUT_GOALS.includes(opts.goal) ? opts.goal : 'General Fitness',
    level: LEVELS.includes(opts.level) ? opts.level : 'Beginner',
    days: Math.min(7, Math.max(1, Number(opts.days) || 3)),
    duration: DURATIONS.includes(opts.duration) ? opts.duration : '45 min',
    focus: String(opts.focus || '').trim().slice(0, 120),
  }
  const raw = await generateJson({ prompt: WORKOUT_PROMPT(params), systemInstruction: SYSTEM_GEN, maxTokens: 4096 })
  if (raw) return { plan: sanitizeWorkoutPlan(raw, params), source: 'gemini' }
  return { plan: offlineWorkoutPlan(params), source: 'offline' }
}

/**
 * @param {Object} opts { goal, calories, meals, cuisine, restrictions }
 * @returns {Promise<{plan: Object, source: 'gemini'|'offline'}>}
 */
export async function generateDietPlan(opts = {}) {
  const m = macrosForGoal(opts.goal, opts.calories)
  const params = {
    goal: DIET_GOALS.includes(opts.goal) ? opts.goal : 'Maintenance',
    calories: m.calories,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    meals: Math.min(6, Math.max(2, Number(opts.meals) || 4)),
    cuisine: String(opts.cuisine || 'Vegetarian').slice(0, 30),
    restrictions: String(opts.restrictions || '').trim().slice(0, 120),
  }
  const raw = await generateJson({ prompt: DIET_PROMPT(params), systemInstruction: SYSTEM_GEN, maxTokens: 4096 })
  if (raw) return { plan: sanitizeDietPlan(raw, params), source: 'gemini' }
  return { plan: offlineDietPlan(params), source: 'offline' }
}

// ── Regenerate single segments (Requirement 5) ──────────────
function regenerateExerciseList(plan) {
  const current = new Set((plan?.exercises || []).map(e => e?.name))
  const fresh = BASE_EXERCISES.filter(e => !current.has(e.name)) || BASE_EXERCISES
  const pool = fresh.length ? fresh : BASE_EXERCISES
  const seed = pool[Math.floor(Math.random() * pool.length)]
  return {
    name: seed.name,
    sets: Math.max(2, seed.sets),
    reps: seed.muscle === 'Cardio' ? '30s' : seed.reps,
    rest: seed.rest,
    muscle: seed.muscle,
    notes: seed.notes,
  }
}

/** @param {Object} plan  current workout plan  @param {number} dayIndex 0-based */
export async function regenerateWorkoutDay(plan, dayIndex) {
  const days = Math.max(1, plan?.days || 1)
  const i = Math.max(0, Math.min(dayIndex, days - 1))
  const ex = Array.isArray(plan?.exercises) ? plan.exercises.map(e => ({ ...e })) : []
  while (ex.length < days) ex.push(regenerateExerciseList(plan))
  ex[i] = regenerateExerciseList(plan)
  return { ...plan, days, exercises: ex }
}

/** @param {Object} plan @param {number} dayIndex @param {number} exerciseIndex */
export async function regenerateWorkoutExercise(plan, dayIndex, exerciseIndex) {
  const ex = Array.isArray(plan?.exercises) ? plan.exercises.map(e => ({ ...e })) : []
  const i = Math.max(0, Math.min(Number(exerciseIndex) ?? 0, Math.max(0, ex.length - 1)))
  ex[i] = regenerateExerciseList(plan)
  return { ...plan, exercises: ex }
}

/** @param {Object} plan current diet plan @param {number} mealIndex 0-based */
export async function regenerateDietMeal(plan, mealIndex) {
  const meals = Array.isArray(plan?.meals) ? plan.meals.map(m => ({ ...m, items: [...(m.items || [])] })) : []
  const i = Math.max(0, Math.min(mealIndex, Math.max(0, meals.length - 1)))
  const block = MEAL_BLOCKS[Math.floor(Math.random() * MEAL_BLOCKS.length)]
  const totalCal = Number(plan?.calories) || 2000
  const avgCal = Math.round(totalCal / Math.max(1, meals.length))
  meals[i] = {
    name: block.name,
    time: meals[i]?.time || block.time,
    calories: avgCal,
    items: [...block.items],
  }
  return { ...plan, meals }
}

export default {
  emptyWorkoutPlan,
  emptyDietPlan,
  generateWorkoutPlan,
  generateDietPlan,
  regenerateWorkoutDay,
  regenerateWorkoutExercise,
  regenerateDietMeal,
  macrosForGoal,
  WORKOUT_GOALS,
  DIET_GOALS,
  LEVELS,
}
