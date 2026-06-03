import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo
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
  const { currentUser, authLoading } = useAuth()

  // ── Theme ──────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(true)

  // ── Data ───────────────────────────────────────────────
  const [members,    setMembers]    = useState([])
  const [trainers,   setTrainers]   = useState([])
  const [payments,   setPayments]   = useState([])
  const [workouts,   setWorkouts]   = useState([])
  const [dietPlans,  setDietPlans]  = useState([])
  const [checkinLog, setCheckinLog] = useState([])
  const [attendance, setAttendance] = useState([])

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

  // ── Notifications — generated from real Firebase data ──
  // Recalculated whenever members or attendance changes.
  // No hardcoded data. No fake entries.
  const notifications = useMemo(() => {
    const list = []
    const today = new Date()
    const todayStr = today.toLocaleDateString('en-CA')  // 'YYYY-MM-DD'

    // A. Membership expiring within 7 days
    members.forEach(m => {
      if (!m.expiry || m.status === 'Expired') return
      const expiryDate = new Date(m.expiry)
      const diffDays   = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24))
      if (diffDays >= 0 && diffDays <= 7) {
        list.push({
          id:    `expiry-soon-${m.id}`,
          type:  'expiry',
          title: 'Membership Expiring Soon',
          msg:   `${m.name}'s ${m.plan} plan expires in ${diffDays} day${diffDays !== 1 ? 's' : ''} (${m.expiry}).`,
          time:  `${diffDays}d left`,
          read:  false,
        })
      }
    })

    // B. Membership already expired
    members.forEach(m => {
      if (!m.expiry) return
      const expiryDate = new Date(m.expiry)
      const diffDays   = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24))
      if (diffDays < 0) {
        list.push({
          id:    `expiry-expired-${m.id}`,
          type:  'expiry',
          title: 'Membership Expired',
          msg:   `${m.name}'s membership expired on ${m.expiry}. Plan: ${m.plan}.`,
          time:  `${Math.abs(diffDays)}d ago`,
          read:  true,
        })
      }
    })

    // C. New members (joined within last 7 days)
    members.forEach(m => {
      if (!m.join) return
      const joinDate = new Date(m.join)
      const diffDays = Math.ceil((today - joinDate) / (1000 * 60 * 60 * 24))
      if (diffDays >= 0 && diffDays <= 7) {
        list.push({
          id:    `new-member-${m.id}`,
          type:  'new',
          title: 'New Member Joined',
          msg:   `${m.name} joined on ${m.join} with a ${m.plan} plan.`,
          time:  diffDays === 0 ? 'Today' : `${diffDays}d ago`,
          read:  diffDays > 1,
        })
      }
    })

    // D. Today's check-ins
    const todayCheckins = attendance.filter(a => a.date === todayStr)
    todayCheckins.forEach(a => {
      list.push({
        id:    `checkin-${a.id || a.memberId + '-' + a.time}`,
        type:  'checkin',
        title: 'Member Checked In',
        msg:   `${a.memberName} checked in at ${a.time || 'today'}.`,
        time:  a.time || 'Today',
        read:  true,
      })
    })

    // Sort: unread first, then by time string descending
    return list.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1
      return 0
    })
  }, [members, attendance])

  // ── Notification helpers ───────────────────────────────
  // Since notifications are derived (useMemo), markRead/markAllRead
  // are no-ops kept for API compatibility — the UI dismisses locally.
  const markAllRead = () => {}
  const markRead    = () => {}
  const unreadCount = notifications.filter(n => !n.read).length

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