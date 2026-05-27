import {
  createContext,
  useContext,
  useState,
  useEffect
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

const AppContext = createContext()

export function AppProvider({ children }) {

  // ── Auth ───────────────────────────────────────────────
  const { currentUser, authLoading } = useAuth()  // ← INSIDE component, correct

  // ── Theme ──────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(true)

  // ── Data ───────────────────────────────────────────────
  const [members,       setMembers]       = useState([])
  const [trainers,      setTrainers]      = useState([])
  const [payments,      setPayments]      = useState([])
  const [workouts,      setWorkouts]      = useState([])
  const [dietPlans,     setDietPlans]     = useState([])
  const [notifications, setNotifications] = useState([])
  const [checkinLog,    setCheckinLog]    = useState([])
  const [attendance,    setAttendance]    = useState([])

  // ── Realtime Firestore listeners ───────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsubscribe = subscribeToMembers(async (data) => {
      setMembers(data)
      const today = new Date()
      data.forEach(async (member) => {
        if (!member.expiry) return
        const expiryDate = new Date(member.expiry)
        const isExpired  = expiryDate < today
        if (isExpired && member.status !== 'Expired') {
          try {
            await updateMemberInFirestore(member.id, { status: 'Expired' })
          } catch (error) {
            console.error('Expiry update failed:', error)
          }
        }
      })
    })
    return unsubscribe
  }, [currentUser, authLoading])

  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsubscribe = subscribeToPayments((data) => setPayments(data))
    return unsubscribe
  }, [currentUser, authLoading])

  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsubscribe = subscribeToTrainers((data) => setTrainers(data))
    return unsubscribe
  }, [currentUser, authLoading])

  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsubscribe = subscribeAttendance((data) => setAttendance(data))
    return unsubscribe
  }, [currentUser, authLoading])

  // ── Persist dark mode ──────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // ── Member CRUD ────────────────────────────────────────
  const addMember = async (memberData) => {
    try {
      return await addMemberToFirestore({
        ...memberData,
        trainerId:   memberData.trainerId   || '',
        trainerName: memberData.trainerName || '',
        status:      memberData.status      || 'Active',
        plan:        memberData.plan        || 'Monthly',
        amountPaid:  Number(memberData.amountPaid) || 0,
        checkins:    Number(memberData.checkins)   || 0,
      })
    } catch (error) {
      console.error('Error adding member:', error)
    }
  }

  const updateMember = async (id, data) => {
    try {
      await updateMemberInFirestore(id, {
        ...data,
        amountPaid: Number(data.amountPaid) || 0,
      })
    } catch (error) {
      console.error('Error updating member:', error)
    }
  }

  const deleteMember = async (id) => {
    try {
      await deleteMemberFromFirestore(id)
    } catch (error) {
      console.error('Error deleting member:', error)
    }
  }

  const checkInMember = async (member) => {
    try {
      await addAttendanceToFirestore({
        memberId:    member.id,
        memberName:  member.name,
        trainerId:   member.trainerId   || '',
        trainerName: member.trainerName || '',
        type:        'checkin',
      })
      await updateMember(member.id, { checkins: (member.checkins || 0) + 1 })
    } catch (error) {
      console.error('Error checking in:', error)
    }
  }

  // ── Payment CRUD ───────────────────────────────────────
  const addPayment = async (paymentData) => {
    try {
      return await addPaymentToFirestore({
        ...paymentData,
        amount: Number(paymentData.amount) || 0,
        status: paymentData.status || 'Paid',
        plan:   paymentData.plan   || 'Monthly',
      })
    } catch (error) {
      console.error('Error adding payment:', error)
    }
  }

  const updatePayment = async (id, data) => {
    try {
      await updatePaymentInFirestore(id, { ...data, amount: Number(data.amount) || 0 })
    } catch (error) {
      console.error('Error updating payment:', error)
    }
  }

  const deletePayment = async (id) => {
    try {
      await deletePaymentFromFirestore(id)
    } catch (error) {
      console.error('Error deleting payment:', error)
    }
  }

  // ── Trainer CRUD ───────────────────────────────────────
  const addTrainer = async (trainerData) => {
    try {
      return await addTrainerToFirestore({
        ...trainerData,
        rating:  trainerData.rating  || 5,
        clients: trainerData.clients || 0,
      })
    } catch (error) {
      console.error('Error adding trainer:', error)
    }
  }

  const updateTrainer = async (id, data) => {
    try {
      await updateTrainerInFirestore(id, data)
    } catch (error) {
      console.error('Error updating trainer:', error)
    }
  }

  const deleteTrainer = async (id) => {
    try {
      await deleteTrainerFromFirestore(id)
    } catch (error) {
      console.error('Error deleting trainer:', error)
    }
  }

  // ── Local check-in log ─────────────────────────────────
  const checkIn = (member) => {
    const now     = new Date()
    const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
    setCheckinLog(p => [{ id: Date.now(), name: member.name, avatar: member.avatar, time: timeStr, out: '—' }, ...p])
    updateMember(member.id, { checkins: Number(member.checkins || 0) + 1 })
  }

  // ── Notifications ──────────────────────────────────────
  const markAllRead = () => setNotifications(p => p.map(n => ({ ...n, read: true })))
  const markRead    = (id) => setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n))
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,

      members, addMember, updateMember, deleteMember,

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