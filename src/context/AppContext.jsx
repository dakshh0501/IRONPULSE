import { createContext, useContext, useState, useEffect } from 'react'
import { MEMBERS, TRAINERS, PAYMENTS, WORKOUTS, DIET_PLANS, NOTIFICATIONS, CHECKIN_LOG } from '../data/mockData'

const AppContext = createContext()

export function AppProvider({ children }) {
  // ── Theme ──────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(true)

  // ── Auth ───────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null) // null = not logged in
  // currentUser: { name, email, role: 'admin'|'trainer'|'member', avatar }

  // ── Data ───────────────────────────────────────────────
  const [members,       setMembers]       = useState(MEMBERS)
  const [trainers,      setTrainers]      = useState(TRAINERS)
  const [payments,      setPayments]      = useState(PAYMENTS)
  const [workouts,      setWorkouts]      = useState(WORKOUTS)
  const [dietPlans,     setDietPlans]     = useState(DIET_PLANS)
  const [notifications, setNotifications] = useState(NOTIFICATIONS)
  const [checkinLog,    setCheckinLog]    = useState(CHECKIN_LOG)

  // ── Persist dark mode ──────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // ── Auth helpers ───────────────────────────────────────
  const login = (email, password, role) => {
    // In a real app: POST /api/auth/login
    // For now: always succeed with the chosen role
    const roleMap = {
      admin:   { name:'Admin User',   avatar:'AU', email },
      trainer: { name:'Amit Kumar',   avatar:'AK', email },
      member:  { name:'Rohan Sharma', avatar:'RS', email },
    }
    setCurrentUser({ ...roleMap[role], role })
    return true
  }

  const logout = () => setCurrentUser(null)

  // ── Member CRUD ────────────────────────────────────────
  const addMember = (m) => setMembers(p => [...p, { ...m, id: Date.now(), checkins:0, paid:false }])
  const updateMember = (id, data) => setMembers(p => p.map(m => m.id === id ? { ...m, ...data } : m))
  const deleteMember = (id) => setMembers(p => p.filter(m => m.id !== id))

  // ── Trainer CRUD ───────────────────────────────────────
  const addTrainer = (t) => setTrainers(p => [...p, { ...t, id: Date.now(), rating:4.5, clients:0 }])
  const updateTrainer = (id, data) => setTrainers(p => p.map(t => t.id === id ? { ...t, ...data } : t))
  const deleteTrainer = (id) => setTrainers(p => p.filter(t => t.id !== id))

  // ── Check-in ───────────────────────────────────────────
  const checkIn = (member) => {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
    const entry = { id: Date.now(), name: member.name, avatar: member.avatar, time: timeStr, out: '—' }
    setCheckinLog(p => [entry, ...p])
    updateMember(member.id, { checkins: member.checkins + 1 })
  }

  // ── Notifications ──────────────────────────────────────
  const markAllRead = () => setNotifications(p => p.map(n => ({ ...n, read: true })))
  const markRead = (id) => setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n))
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      currentUser, login, logout,
      members, addMember, updateMember, deleteMember,
      trainers, addTrainer, updateTrainer, deleteTrainer,
      payments, setPayments,
      workouts, setWorkouts,
      dietPlans, setDietPlans,
      notifications, markAllRead, markRead, unreadCount,
      checkinLog, checkIn,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)