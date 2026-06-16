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
import { getPendingUsers } from '../services/authService'

const AppContext = createContext()

export function AppProvider({ children }) {

  // ── Auth ───────────────────────────────────────────────
  const { currentUser, authLoading, userProfile } = useAuth()

  // ── Theme ──────────────────────────────────────────────
  // FIX: read from localStorage on startup so dark mode persists across refreshes
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('ironpulse-darkMode')
    return stored === null ? true : stored === 'true'
  })

  // ── Data ───────────────────────────────────────────────
  const [members,       setMembers]       = useState([])
  const [trainers,      setTrainers]      = useState([])
  const [payments,      setPayments]      = useState([])
  const [workouts,      setWorkouts]      = useState([])
  const [dietPlans,     setDietPlans]     = useState([])
  const [checkinLog,    setCheckinLog]    = useState([])
  const [attendance,    setAttendance]    = useState([])
  const [pendingCount,  setPendingCount]  = useState(0)

  // ── Members listener ───────────────────────────────────
  useEffect(() => {
  if (authLoading || !currentUser) return

  if (
    userProfile?.role !== 'admin' &&
    userProfile?.role !== 'trainer'
  ) {
    return
  }

  const unsubscribe = subscribeToMembers(
    async (data) => {
      setMembers(data)

      const today = new Date()

      data.forEach(async (member) => {
        if (!member.expiry) return

        const isExpired =
          new Date(member.expiry) < today

        if (
          isExpired &&
          member.status !== 'Expired'
        ) {
          try {
            await updateMemberInFirestore(
              member.id,
              { status: 'Expired' }
            )
          } catch (error) {
            console.error(
              'Expiry update failed:',
              error
            )
          }
        }
      })
    }
  )

  return unsubscribe

}, [
  currentUser,
  authLoading,
  userProfile
])

  // ── Payments listener — ADMIN ONLY ─────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (userProfile?.role !== 'admin') return
    const unsubscribe = subscribeToPayments((data) => setPayments(data))
    return unsubscribe
  }, [currentUser, authLoading, userProfile])

  // ── Trainers listener ──────────────────────────────────
  useEffect(() => {
  if (authLoading || !currentUser) return

  if (
    userProfile?.role !== 'admin' &&
    userProfile?.role !== 'trainer'
  ) {
    return
  }

  const unsubscribe =
    subscribeToTrainers((data) =>
      setTrainers(data)
    )

  return unsubscribe
}, [
  currentUser,
  authLoading,
  userProfile
])

  // ── Attendance listener ────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    const unsubscribe = subscribeAttendance((data) => setAttendance(data))
    return unsubscribe
  }, [currentUser, authLoading])

  // ── Pending approvals count — ADMIN ONLY ───────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (userProfile?.role !== 'admin') return
    let mounted = true
    async function loadPendingCount() {
      try {
        const pending = await getPendingUsers()
        if (mounted) setPendingCount(pending.length)
      } catch (e) {
        console.error('Failed to load pending count:', e)
      }
    }
    loadPendingCount()
    const interval = setInterval(loadPendingCount, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [currentUser, authLoading, userProfile])

  // ── Auto-sync member payment fields ───────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (userProfile?.role !== 'admin') return
    if (members.length === 0 || payments.length === 0) return

    members.forEach(member => {
      const totalPaid = payments
        .filter(p => p.memberId === member.id && p.status === 'Paid')
        .reduce((sum, p) => sum + Number(p.paid || 0), 0)

      const planPrice  = Number(member.planPrice || 0)
      const balanceDue = Math.max(0, planPrice - totalPaid)

      let paymentStatus = 'Pending'
      if (totalPaid >= planPrice && planPrice > 0) paymentStatus = 'Paid'
      else if (totalPaid > 0)                      paymentStatus = 'Partial'

      const hasChanged =
        (member.amountPaid    || 0)         !== totalPaid    ||
        (member.balanceDue    || 0)         !== balanceDue   ||
        (member.paymentStatus || 'Pending') !== paymentStatus

      if (hasChanged) {
        try {
          updateMemberInFirestore(member.id, { amountPaid: totalPaid, balanceDue, paymentStatus })
        } catch (error) {
          console.error('Error syncing member payment data:', error)
        }
      }
    })
  }, [payments, members, currentUser, authLoading, userProfile])

  // ── Persist dark mode ──────────────────────────────────
  // FIX: also save to localStorage whenever darkMode changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('ironpulse-darkMode', darkMode)
  }, [darkMode])

  // ── Notifications — derived from real data ─────────────
  const notifications = useMemo(() => {
    const list     = []
    const today    = new Date()
    const todayStr = today.toISOString().split('T')[0]

    members.forEach(m => {
      if (!m.expiry || m.status === 'Expired') return
      const diffDays = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24))
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

    members.forEach(m => {
      if (!m.expiry) return
      const diffDays = Math.ceil((new Date(m.expiry) - today) / (1000 * 60 * 60 * 24))
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

    members.forEach(m => {
      if (!m.join) return
      const diffDays = Math.ceil((today - new Date(m.join)) / (1000 * 60 * 60 * 24))
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

    attendance
      .filter(a => a.date === todayStr)
      .forEach(a => {
        list.push({
          id:    `checkin-${a.id || a.memberId + '-' + a.time}`,
          type:  'checkin',
          title: 'Member Checked In',
          msg:   `${a.memberName} checked in at ${a.time || 'today'}.`,
          time:  a.time || 'Today',
          read:  true,
        })
      })

    return list.sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1))
  }, [members, attendance])

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
        memberId:    member.authUid || member.uid || member.id,
        memberName:  member.name,
        trainerId:   member.trainerId   || '',
        trainerName: member.trainerName || '',
        type:        'checkin',
      })
      await updateMemberInFirestore(member.id, { checkins: (member.checkins || 0) + 1 })
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
    setCheckinLog(p => [{
      id: Date.now(), name: member.name,
      avatar: member.avatar, time: timeStr, out: '—',
    }, ...p])
    updateMember(member.id, { checkins: Number(member.checkins || 0) + 1 })
  }

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
      pendingCount,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)