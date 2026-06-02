import {
  createContext, useContext, useState, useEffect
} from 'react'
import { useAuth } from './AuthContext'
import {
  subscribeToMembers,
  addMember as addMemberToFirestore,
  updateMember as updateMemberInFirestore,
  deleteMember as deleteMemberFromFirestore,
  subscribeToPayments,
  addPayment as addPaymentToFirestore,
  updatePayment as updatePaymentInFirestore,
  deletePayment as deletePaymentFromFirestore,
  subscribeToTrainers,
  addTrainer as addTrainerToFirestore,
  updateTrainer as updateTrainerInFirestore,
  deleteTrainer as deleteTrainerFromFirestore,
} from '../services/firestoreService'
import {
  subscribeAttendance,
  addAttendance as addAttendanceToFirestore,
} from '../services/attendanceService'
import { createMemberAccount } from '../services/authService'

const AppContext = createContext()

export function AppProvider({ children }) {
  const { currentUser, authLoading } = useAuth()

  const [darkMode,       setDarkMode]       = useState(true)
  const [members,        setMembers]        = useState([])
  const [trainers,       setTrainers]       = useState([])
  const [payments,       setPayments]       = useState([])
  const [workouts,       setWorkouts]       = useState([])
  const [dietPlans,      setDietPlans]      = useState([])
  const [notifications,  setNotifications]  = useState([])
  const [checkinLog,     setCheckinLog]     = useState([])
  const [attendance,     setAttendance]     = useState([])

  // ── Realtime listeners ─────────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsub = subscribeToMembers(async (data) => {
      setMembers(data)
      const today = new Date()
      data.forEach(async (member) => {
        if (!member.expiry) return
        const expired = new Date(member.expiry) < today
        if (expired && member.status !== 'Expired') {
          try { await updateMemberInFirestore(member.id, { status: 'Expired' }) }
          catch (err) { console.error('Expiry update failed:', err) }
        }
      })
    })
    return unsub
  }, [currentUser, authLoading])

  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsub = subscribeToPayments(data => setPayments(data))
    return unsub
  }, [currentUser, authLoading])

  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsub = subscribeToTrainers(data => setTrainers(data))
    return unsub
  }, [currentUser, authLoading])

  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsub = subscribeAttendance(data => setAttendance(data))
    return unsub
  }, [currentUser, authLoading])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // ── Member CRUD ────────────────────────────────────────────
  const addMember = async (memberData) => {
    // Extract password — never saved to Firestore
    const { password, ...rest } = memberData

    let authUid = ''

    // Create Firebase Auth account if password provided
    if (password) {
      try {
        authUid = await createMemberAccount({
          name:     rest.name,
          email:    rest.email,
          password,
        })
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          // Auth account already exists — still save Firestore doc
          console.warn('Auth account already exists for', rest.email)
        } else {
          // Re-throw so Members.jsx can show the error in the modal
          throw err
        }
      }
    }

    return await addMemberToFirestore({
      ...rest,
      authUid,
      trainerId:   rest.trainerId   || '',
      trainerName: rest.trainerName || '',
      status:      rest.status      || 'Active',
      plan:        rest.plan        || 'Monthly',
      amountPaid:  Number(rest.amountPaid) || 0,
      checkins:    0,
    })
  }

  const updateMember = async (id, data) => {
    try {
      const { password, ...rest } = data   // never update password via Firestore
      await updateMemberInFirestore(id, {
        ...rest,
        amountPaid: Number(rest.amountPaid) || 0,
      })
    } catch (err) { console.error('Error updating member:', err) }
  }

  const deleteMember = async (id) => {
    try { await deleteMemberFromFirestore(id) }
    catch (err) { console.error('Error deleting member:', err) }
  }

  const checkInMember = async (member) => {
    try {
      await addAttendanceToFirestore({
        memberId:    member.authUid || member.uid || member.id,
        memberName:  member.name,
        trainerId:   member.trainerId   || '',
        trainerName: member.trainerName || '',
        type:        'checkin',
      })
      await updateMemberInFirestore(member.id, { checkins: (member.checkins || 0) + 1 })
    } catch (err) { console.error('Error checking in:', err) }
  }

  // ── Payment CRUD ───────────────────────────────────────────
  const addPayment = async (data) => {
    try {
      return await addPaymentToFirestore({
        ...data,
        amount: Number(data.amount) || 0,
        status: data.status || 'Paid',
        plan:   data.plan   || 'Monthly',
      })
    } catch (err) { console.error('Error adding payment:', err) }
  }

  const updatePayment = async (id, data) => {
    try { await updatePaymentInFirestore(id, { ...data, amount: Number(data.amount) || 0 }) }
    catch (err) { console.error('Error updating payment:', err) }
  }

  const deletePayment = async (id) => {
    try { await deletePaymentFromFirestore(id) }
    catch (err) { console.error('Error deleting payment:', err) }
  }

  // ── Trainer CRUD ───────────────────────────────────────────
  const addTrainer = async (data) => {
    try {
      return await addTrainerToFirestore({ ...data, rating: data.rating || 5, clients: data.clients || 0 })
    } catch (err) { console.error('Error adding trainer:', err) }
  }

  const updateTrainer = async (id, data) => {
    try { await updateTrainerInFirestore(id, data) }
    catch (err) { console.error('Error updating trainer:', err) }
  }

  const deleteTrainer = async (id) => {
    try { await deleteTrainerFromFirestore(id) }
    catch (err) { console.error('Error deleting trainer:', err) }
  }

  // ── Local check-in log ─────────────────────────────────────
  const checkIn = (member) => {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
    setCheckinLog(p => [{ id: Date.now(), name: member.name, avatar: member.avatar, time: timeStr, out: '—' }, ...p])
    updateMember(member.id, { checkins: Number(member.checkins || 0) + 1 })
  }

  // ── Notifications ──────────────────────────────────────────
  const markAllRead = () => setNotifications(p => p.map(n => ({ ...n, read: true })))
  const markRead    = (id) => setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n))
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      members,  addMember,  updateMember,  deleteMember,
      trainers, addTrainer, updateTrainer, deleteTrainer,
      payments, addPayment, updatePayment, deletePayment,
      workouts, setWorkouts,
      dietPlans, setDietPlans,
      notifications, markAllRead, markRead, unreadCount,
      checkinLog, checkIn,
      attendance, checkInMember,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)