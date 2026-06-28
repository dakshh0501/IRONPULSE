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
  getSettings,
  subscribeToPlans,
  addPlan as addPlanToFirestore,
  updatePlan as updatePlanInFirestore,
  deletePlan as deletePlanFromFirestore,
  migrateDefaultPlans,
  subscribeToProgressLogs,
  addProgressLog as addProgressLogToFirestore,
  updateProgressLog as updateProgressLogInFirestore,
  deleteProgressLog as deleteProgressLogFromFirestore,
  subscribeToSupportTickets,
  addSupportTicket as addSupportTicketToFirestore,
  subscribeToFeatureRequests,
  addFeatureRequest as addFeatureRequestToFirestore,
  subscribeToDietPlans,
  addDietPlan as addDietPlanToFirestore,
  updateDietPlan as updateDietPlanInFirestore,
  deleteDietPlan as deleteDietPlanFromFirestore,
  subscribeToWorkoutPlans,
  addWorkoutPlan as addWorkoutPlanToFirestore,
  updateWorkoutPlan as updateWorkoutPlanInFirestore,
  deleteWorkoutPlan as deleteWorkoutPlanFromFirestore,
  subscribeToGyms,
  subscribeToSubscriptions,
  addGym as addGymToFirestore,
  updateGym as updateGymInFirestore,
  deleteGym as deleteGymFromFirestore,
  getSubscriptionByGymId,
  addSubscription,
} from '../services/firestoreService'
import {
  subscribeAttendance,
  subscribeMyAttendance,
  addAttendance as addAttendanceToFirestore,
} from '../services/attendanceService'
import { getPendingUsers } from '../services/authService'
import {
  subscribeToPaymentAttempts,
  savePaymentAttempt,
  updatePaymentAttempt,
  initiatePayment as initiatePaymentService,
  refreshPaymentStatus as refreshPaymentStatusService,
} from '../services/paymentService'
import { doc, getDoc, updateDoc, query, where, getDocs, collection } from 'firebase/firestore'
import { db } from '../firebase'
import {
  subscribeToNotifications,
  addNotification as addNotifToFirestore,
  markNotifAsRead,
  markAllNotifsAsRead,
  deleteNotification,
} from '../services/notificationService'
import { buildNotification } from '../utils/notificationTypes'
import { canSubscribe } from '../utils/rbac'
import {
  subscribeToGymSubscription,
  subscribeToSubscriptionHistory,
  activateSubscription as activateSubService,
  suspendSubscription as suspendSubService,
  expireSubscription as expireSubService,
  renewSubscription as renewSubService,
  upgradePlan as upgradeSubService,
  downgradePlan as downgradeSubService,
  assignTrial as assignTrialService,
  extendExpiry as extendExpiryService,
  changePlan as changePlanService,
  checkAutoExpiry,
} from '../services/subscriptionService'

const AppContext = createContext()

export function AppProvider({ children }) {

  // ── Auth ───────────────────────────────────────────────
  const { currentUser, authLoading, userProfile, userGymId, effectiveRole } = useAuth()

  // ── Theme ──────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('ironpulse-darkMode')
    return stored === null ? true : stored === 'true'
  })

  // ── Data ───────────────────────────────────────────────
  const [members,       setMembers]       = useState([])
  const [trainers,      setTrainers]      = useState([])
  const [payments,      setPayments]      = useState([])
  const [plans,         setPlans]         = useState([])
  const [checkinLog,    setCheckinLog]    = useState([])
  const [attendance,    setAttendance]    = useState([])
  const [oldPendingCount, setOldPendingCount] = useState(0)
  const [gymOwnersPending, setGymOwnersPending] = useState([])
  const pendingCount = useMemo(() => oldPendingCount + gymOwnersPending.length, [oldPendingCount, gymOwnersPending])
  const [gymSettings,   setGymSettings]   = useState({ name: 'IronForge Gym' })
  const [progressLogs,  setProgressLogs]  = useState([])
  const [dietPlans,     setDietPlans]     = useState([])
  const [workoutPlans,  setWorkoutPlans]  = useState([])
  const [gyms,          setGyms]          = useState([])
  const [currentGym,    setCurrentGym]    = useState(null)
  const [supportTickets, setSupportTickets] = useState([])
  const [featureRequests, setFeatureRequests] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [currentSubscription, setCurrentSubscription] = useState(null)
  const [subscriptionHistory, setSubscriptionHistory] = useState([])
  const [paymentAttempts, setPaymentAttempts] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(true)

  // ── Gym context (derived from userGymId) ───────────────
  const gymId = userGymId || null

  // ── Data isolation ──────────────────────────────────────
  // super_admin sees ALL data (no gymId filter).
  // All other roles scoped to their own gymId.
  const isSuperAdmin = effectiveRole === 'super_admin'
  const queryGymId = isSuperAdmin ? null : gymId

  // ── Pending gym owner approvals listener ───────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    const unsubscribe = subscribeToGyms((data) => {
      setGyms(data)
      const pendingOwners = data.filter(g => g.approvalStatus === 'pending')
      setGymOwnersPending(pendingOwners)
    })
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole])

  // ── Admins: approve gym owner (single source of truth) ──
  const approveGymOwner = async (gymId, newSubscription = 'Trial') => {
    try {
      // 1. Read gym doc to get ownerUid
      const gymSnap = await getDoc(doc(db, 'gyms', gymId))
      if (!gymSnap.exists()) throw new Error('Gym not found')
      const gymData = gymSnap.data()
      const ownerUid = gymData.ownerUid

      // 2. Update gym approvalStatus
      await updateGym(gymId, { approvalStatus: 'approved' })

      // 3. Update user role (if ownerUid exists and role is still pending)
      if (ownerUid) {
        const userSnap = await getDoc(doc(db, 'users', ownerUid))
        if (userSnap.exists() && userSnap.data().role === 'gym_owner_pending') {
          await updateDoc(doc(db, 'users', ownerUid), { role: 'gym_owner' })
        }
      }

      // 4. Defensive: only create subscription if one doesn't already exist
      const existingSub = await getSubscriptionByGymId(gymId)
      if (!existingSub) {
        await addSubscription({
          gymId,
          plan: newSubscription,
          status: 'active',
          paymentStatus: 'paid',
          paymentMethod: 'Not Set',
          autoRenew: false,
        })
      }

      // 5. Notify the gym owner
      if (ownerUid) {
        fireNotif('gym_approved', {
          userId: ownerUid,
          title: 'Gym Approved',
          message: `Your gym "${gymData.gymName || gymData.name}" has been approved by the admin.`,
          relatedDocumentId: gymId,
          actionUrl: '/dashboard',
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Failed to approve gym owner:', err)
      throw err
    }
  }

  // ── Admins: reject gym owner (single source of truth) ──
  const rejectGymOwner = async (gymId) => {
    try {
      // 1. Read gym doc to get ownerUid
      const gymSnap = await getDoc(doc(db, 'gyms', gymId))
      if (!gymSnap.exists()) throw new Error('Gym not found')
      const gymData = gymSnap.data()
      const ownerUid = gymData.ownerUid

      // 2. Update gym approvalStatus
      await updateGym(gymId, { approvalStatus: 'rejected' })

      // 3. Update user role (if ownerUid exists and role is still pending)
      if (ownerUid) {
        const userSnap = await getDoc(doc(db, 'users', ownerUid))
        if (userSnap.exists() && userSnap.data().role === 'gym_owner_pending') {
          await updateDoc(doc(db, 'users', ownerUid), { role: 'rejected' })
        }

        fireNotif('gym_rejected', {
          userId: ownerUid,
          title: 'Gym Registration Rejected',
          message: `Your gym "${gymData.gymName || gymData.name}" registration has been rejected.`,
          relatedDocumentId: gymId,
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Failed to reject gym owner:', err)
      throw err
    }
  }

  // ── Gym CRUD ─────────────────────────────────────────────
  const addGym = async (gymData) => {
    try {
      return await addGymToFirestore({ ...gymData, gymId: userGymId }, currentUser.uid)
    } catch (err) {
      console.error('Failed to create gym:', err)
      throw err
    }
  }

  const updateGym = async (gymId, updatedData) => {
    try {
      await updateGymInFirestore(gymId, updatedData)
    } catch (err) {
      console.error('Failed to update gym:', err)
      throw err
    }
  }

  const deleteGym = async (gymId) => {
    try {
      await deleteGymFromFirestore(gymId)
    } catch (err) {
      console.error('Failed to delete gym:', err)
      throw err
    }
  }

  // ── Payment Attempts CRUD ──────────────────────────────
  const addPaymentAttempt = async (paymentRequest) => {
    try {
      return await savePaymentAttempt(paymentRequest)
    } catch (error) {
      console.error('Error saving payment attempt:', error)
      throw error
    }
  }

  const updatePaymentAttemptStatus = async (docId, updates) => {
    try {
      await updatePaymentAttempt(docId, updates)
    } catch (error) {
      console.error('Error updating payment attempt:', error)
      throw error
    }
  }

  const initiatePayment = async (params) => {
    try {
      return await initiatePaymentService({ ...params, gymId })
    } catch (error) {
      console.error('Error initiating payment:', error)
      return { attemptId: null, redirectUrl: null, error: error.message }
    }
  }

  const refreshPaymentStatus = async (attemptId) => {
    try {
      return await refreshPaymentStatusService(attemptId)
    } catch (error) {
      console.error('Error refreshing payment status:', error)
      return { status: null, error: error.message }
    }
  }

  // ── Subscriptions listener (platform — super_admin only) ─
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    const unsubscribe = subscribeToSubscriptions((data) => setSubscriptions(data))
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole])

  // ── Gym Subscription listener (gym_admin/gym_owner) ───
  useEffect(() => {
    if (authLoading || !currentUser || !gymId) return
    if (effectiveRole !== 'gym_admin' && effectiveRole !== 'gym_owner') return
    const unsub = subscribeToGymSubscription(gymId, (sub) => {
      if (sub) {
        const checked = checkAutoExpiry(sub)
        if (checked.status !== sub.status) {
          updateGymInFirestore(gymId, { subscription: checked }).catch(() => {})
        }
        setCurrentSubscription(checked)
      } else {
        setCurrentSubscription(null)
      }
    })
    return unsub
  }, [currentUser, authLoading, effectiveRole, gymId])

  // ── Subscription History listener (gym_admin) ──────────
  useEffect(() => {
    if (authLoading || !currentUser || !gymId) return
    if (effectiveRole !== 'gym_admin' && effectiveRole !== 'gym_owner' && effectiveRole !== 'super_admin') return
    const subGymId = effectiveRole === 'super_admin' ? null : gymId
    const unsub = subscribeToSubscriptionHistory(subGymId, setSubscriptionHistory)
    return unsub
  }, [currentUser, authLoading, effectiveRole, gymId])

  // ── Payment Attempts listener — SUPER_ADMIN ONLY ──────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    const unsubscribe = subscribeToPaymentAttempts((data) => setPaymentAttempts(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Notifications listener ─────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser?.uid) return
    setNotifLoading(true)
    const unsubscribe = subscribeToNotifications(currentUser.uid, (data) => {
      setNotifications(data)
      setNotifLoading(false)
    }, gymId)
    return () => {
      unsubscribe()
      setNotifLoading(false)
    }
  }, [currentUser, authLoading, gymId])

  // ── Notification helpers ───────────────────────────────
  const fireNotif = async (notifKey, data) => {
    try {
      const notif = buildNotification(notifKey, {
        userId: currentUser?.uid || '',
        gymId: gymId || 'default',
        role: userProfile?.role || '',
        ...data,
      })
      if (!notif) return
      return await addNotifToFirestore(notif)
    } catch (err) {
      console.error('fireNotif error:', err)
    }
  }

  // ── Members listener ───────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'members')) return

    const unsubscribe = subscribeToMembers(
      (data) => { setMembers(data) },
      queryGymId
    )
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Payments listener ──────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'payments')) return
    const unsubscribe = subscribeToPayments((data) => setPayments(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Trainers listener ──────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'trainers')) return
    const unsubscribe = subscribeToTrainers(
      (data) => setTrainers(data),
      queryGymId
    )
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Plans listener ─────────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'plans')) return

    // gym_admin auto-migrates default plans (scoped to gym)
    if (effectiveRole === 'gym_admin') {
      migrateDefaultPlans(queryGymId).catch(err => console.error('Failed to migrate plans:', err))
    }

    const unsubscribe = subscribeToPlans((data) => setPlans(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Progress Logs listener ─────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'progressLogs')) return
    const unsubscribe = subscribeToProgressLogs((data) => setProgressLogs(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Diet Plans listener ────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'dietPlans')) return
    const unsubscribe = subscribeToDietPlans((data) => setDietPlans(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Workout Plans listener ─────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'workoutPlans')) return
    const unsubscribe = subscribeToWorkoutPlans((data) => setWorkoutPlans(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Support Tickets listener ──────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'supportTickets')) return
    const unsubscribe = subscribeToSupportTickets((data) => setSupportTickets(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Feature Requests listener ──────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'featureRequests')) return
    const unsubscribe = subscribeToFeatureRequests((data) => setFeatureRequests(data), queryGymId)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Attendance listener ────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (canSubscribe(effectiveRole, 'attendance')) {
      const unsubscribe = subscribeAttendance((data) => setAttendance(data), queryGymId)
      return unsubscribe
    }
    if (effectiveRole === 'member' && currentUser?.uid) {
      const unsubscribe = subscribeMyAttendance(currentUser.uid, (data) => setAttendance(data), queryGymId)
      return unsubscribe
    }
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Pending approvals count — SUPER_ADMIN ONLY ──────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    let mounted = true
    async function loadPendingCount() {
      try {
        const pending = await getPendingUsers()
        if (mounted) setOldPendingCount(pending.length)
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
  }, [currentUser, authLoading, effectiveRole])

  // ── Auto-sync member payment fields ───────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'gym_admin' && effectiveRole !== 'super_admin') return
    if (members.length === 0 || payments.length === 0) return

    const updates = []

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
        updates.push(
          updateMemberInFirestore(member.id, { amountPaid: totalPaid, balanceDue, paymentStatus })
            .catch(error => console.error('Error syncing member payment data:', error))
        )
      }
    })

    if (updates.length > 0) {
      Promise.allSettled(updates)
    }
  }, [payments, members, currentUser, authLoading, userProfile])

  // ── Persist dark mode ──────────────────────────────────
  // FIX: also save to localStorage whenever darkMode changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('ironpulse-darkMode', darkMode)
  }, [darkMode])

  // ── Load Gym Settings ──────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'settings')) return
    
    let mounted = true
    getSettings('gym', queryGymId)
      .then(data => {
        if (mounted && data) {
          setGymSettings(prev => ({ ...prev, ...data }))
        }
      })
      .catch(err => console.error('Failed to load gym settings:', err))
    
    return () => { mounted = false }
  }, [currentUser, authLoading, effectiveRole, queryGymId])

  // ── Notifications — Firestore-backed ───────────────────
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  const markNotifRead = async (notifId) => {
    try {
      await markNotifAsRead(notifId)
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n))
    } catch (err) {
      console.error('markNotifRead error:', err)
    }
  }

  const markAllNotifsRead = async () => {
    if (!currentUser?.uid) return
    try {
      await markAllNotifsAsRead(currentUser.uid)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch (err) {
      console.error('markAllNotifsRead error:', err)
    }
  }

  const deleteNotif = async (notifId) => {
    try {
      await deleteNotification(notifId)
      setNotifications(prev => prev.filter(n => n.id !== notifId))
    } catch (err) {
      console.error('deleteNotif error:', err)
    }
  }

  // ── Member CRUD ────────────────────────────────────────
  const addMember = async (memberData) => {
    try {
      const memberId = await addMemberToFirestore({
        ...memberData,
        gymId,
        trainerId:   memberData.trainerId   || '',
        trainerName: memberData.trainerName || '',
        status:      memberData.status      || 'Active',
        plan:        memberData.plan        || 'Monthly',
        amountPaid:  Number(memberData.amountPaid) || 0,
        checkins:    Number(memberData.checkins)   || 0,
      })
      if (currentUser?.uid) {
        fireNotif('member_added', {
          userId: currentUser.uid,
          title: 'New Member Added',
          message: `${memberData.name || 'Member'} has been added with ${memberData.plan || 'Monthly'} plan.`,
          relatedDocumentId: memberId || '',
        }).catch(() => {})
      }
      return memberId
    } catch (error) {
      console.error('Error adding member:', error)
      throw error
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
      throw error
    }
  }

  const deleteMember = async (id) => {
    try {
      const member = members.find(m => m.id === id)
      await deleteMemberFromFirestore(id)
      if (currentUser?.uid && member?.name) {
        fireNotif('member_deleted', {
          userId: currentUser.uid,
          title: 'Member Deleted',
          message: `${member.name} has been removed from the system.`,
          relatedDocumentId: id,
        }).catch(() => {})
      }
    } catch (error) {
      console.error('Error deleting member:', error)
      throw error
    }
  }

  const checkInMember = async (member) => {
    try {
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      await addAttendanceToFirestore({
        memberId:    member.authUid || member.uid || member.id,
        memberName:  member.name,
        avatar:      member.avatar || (member.name || 'M').slice(0, 2).toUpperCase(),
        color:       member.color  || '#00c8b4',
        plan:        member.plan   || member.membershipPlan || 'Standard',
        trainerId:   member.trainerId   || '',
        trainerName: member.trainerName || '',
        date:        todayStr,
        time,
        method:      'Manual',
        duration:    90,
        gymId,
      })
      await updateMemberInFirestore(member.id, { checkins: (member.checkins || 0) + 1 })
      if (member.authUid || member.uid) {
        fireNotif('qr_success', {
          userId: member.authUid || member.uid,
          title: 'Check-in Successful',
          message: `You checked in at ${time}. Have a great workout!`,
        }).catch(() => {})
      }
    } catch (error) {
      console.error('Error checking in:', error)
      throw error
    }
  }

  // ── Payment CRUD ───────────────────────────────────────
  const addPayment = async (paymentData) => {
    try {
      const paymentId = await addPaymentToFirestore({
        ...paymentData,
        gymId,
        amount: Number(paymentData.amount) || 0,
        status: paymentData.status || 'Paid',
        plan:   paymentData.plan   || 'Monthly',
      })
      if (currentUser?.uid) {
        fireNotif('payment_received', {
          userId: currentUser.uid,
          title: 'Payment Received',
          message: `₹${Number(paymentData.amount).toLocaleString('en-IN')} received from ${paymentData.memberName || 'member'} for ${paymentData.plan || 'plan'}.`,
          relatedDocumentId: paymentId || '',
          actionUrl: '/payments',
        }).catch(() => {})
        if (paymentData.memberId) {
          fireNotif('payment_received', {
            userId: paymentData.memberId,
            title: 'Payment Confirmed',
            message: `Your payment of ₹${Number(paymentData.amount).toLocaleString('en-IN')} has been received.`,
            relatedDocumentId: paymentId || '',
          }).catch(() => {})
        }
      }
      return paymentId
    } catch (error) {
      console.error('Error adding payment:', error)
      throw error
    }
  }

  const updatePayment = async (id, data) => {
    try {
      const { amount, ...rest } = data
      const payload = { ...rest }
      if (amount !== undefined) payload.amount = Number(amount) || 0
      await updatePaymentInFirestore(id, payload)
    } catch (error) {
      console.error('Error updating payment:', error)
      throw error
    }
  }

  const deletePayment = async (id) => {
    try {
      await deletePaymentFromFirestore(id)
    } catch (error) {
      console.error('Error deleting payment:', error)
      throw error
    }
  }

  // ── Trainer CRUD ───────────────────────────────────────
  const addTrainer = async (trainerData) => {
    try {
      const trainerId = await addTrainerToFirestore({
        ...trainerData,
        gymId,
        rating:  trainerData.rating  || 5,
        clients: trainerData.clients || 0,
      })
      if (currentUser?.uid) {
        fireNotif('trainer_added', {
          userId: currentUser.uid,
          title: 'New Trainer Added',
          message: `${trainerData.name || 'Trainer'} has been added to the team.`,
          relatedDocumentId: trainerId || '',
        }).catch(() => {})
      }
      return trainerId
    } catch (error) {
      console.error('Error adding trainer:', error)
      throw error
    }
  }

  const updateTrainer = async (id, data) => {
    try {
      await updateTrainerInFirestore(id, data)
    } catch (error) {
      console.error('Error updating trainer:', error)
      throw error
    }
  }

  const deleteTrainer = async (id) => {
    try {
      const trainer = trainers.find(t => t.id === id)
      await deleteTrainerFromFirestore(id)
      if (currentUser?.uid && trainer?.name) {
        fireNotif('trainer_removed', {
          userId: currentUser.uid,
          title: 'Trainer Removed',
          message: `${trainer.name} has been removed from the system.`,
          relatedDocumentId: id,
        }).catch(() => {})
      }
    } catch (error) {
      console.error('Error deleting trainer:', error)
      throw error
    }
  }

  // ── Plans CRUD ─────────────────────────────────────────
  const addPlan = async (planData) => {
    try {
      return await addPlanToFirestore({ ...planData, gymId })
    } catch (error) {
      console.error('Error adding plan:', error)
      throw error
    }
  }

  const updatePlan = async (id, data) => {
    try {
      await updatePlanInFirestore(id, data)
    } catch (error) {
      console.error('Error updating plan:', error)
      throw error
    }
  }

  const deletePlan = async (id) => {
    try {
      await deletePlanFromFirestore(id)
    } catch (error) {
      console.error('Error deleting plan:', error)
      throw error
    }
  }

  // ── Progress Logs CRUD ──────────────────────────────────
  const addProgressLog = async (logData) => {
    try {
      const logId = await addProgressLogToFirestore({
        ...logData,
        gymId,
        memberId: logData.memberId || '',
        memberName: logData.memberName || '',
        trainerId: logData.trainerId || userProfile?.trainerId || userProfile?.uid || '',
        trainerName: logData.trainerName || userProfile?.name || '',
        authUid: logData.authUid || '',
      })
      if (logData.authUid) {
        fireNotif('progress_updated', {
          userId: logData.authUid,
          title: 'Progress Updated',
          message: `Your progress has been updated. Check your latest metrics.`,
          relatedDocumentId: logId || '',
          actionUrl: '/progress',
        }).catch(() => {})
      }
      return logId
    } catch (error) {
      console.error('Error adding progress log:', error)
      throw error
    }
  }

  const updateProgressLog = async (logId, updatedData) => {
    try {
      await updateProgressLogInFirestore(logId, updatedData)
    } catch (error) {
      console.error('Error updating progress log:', error)
      throw error
    }
  }

  const deleteProgressLog = async (logId) => {
    try {
      await deleteProgressLogFromFirestore(logId)
    } catch (error) {
      console.error('Error deleting progress log:', error)
      throw error
    }
  }

  // ── Support Tickets CRUD ─────────────────────────────────
  const addSupportTicket = async (ticketData) => {
    try {
      const ticketId = await addSupportTicketToFirestore({ ...ticketData, gymId })
      fireNotif('ticket_opened', {
        userId: currentUser?.uid || '',
        title: 'Support Ticket Created',
        message: `Ticket #${ticketId?.slice(-6)} has been submitted.`,
        relatedDocumentId: ticketId || '',
        actionUrl: '/support',
      }).catch(() => {})
      return ticketId
    } catch (error) {
      console.error('Error adding support ticket:', error)
      throw error
    }
  }

  // ── Feature Requests CRUD ────────────────────────────────
  const addFeatureRequest = async (requestData) => {
    try {
      const requestId = await addFeatureRequestToFirestore({ ...requestData, gymId })
      fireNotif('system_login', {
        userId: currentUser?.uid || '',
        title: 'Feature Request Submitted',
        message: 'Your feature request has been submitted for review.',
        relatedDocumentId: requestId || '',
      }).catch(() => {})
      return requestId
    } catch (error) {
      console.error('Error adding feature request:', error)
      throw error
    }
  }

  // ── Diet Plans CRUD ─────────────────────────────────────
  const addDietPlan = async (planData) => {
    try {
      const planId = await addDietPlanToFirestore({ ...planData, gymId })
      if (planData.authUid) {
        fireNotif('diet_assigned', {
          userId: planData.authUid,
          title: 'Diet Plan Assigned',
          message: `A new diet plan "${planData.name || 'Diet Plan'}" has been assigned to you.`,
          relatedDocumentId: planId || '',
          actionUrl: '/diet',
        }).catch(() => {})
      }
      return planId
    } catch (error) {
      console.error('Error adding diet plan:', error)
      throw error
    }
  }

  const updateDietPlan = async (id, data) => {
    try {
      await updateDietPlanInFirestore(id, data)
    } catch (error) {
      console.error('Error updating diet plan:', error)
      throw error
    }
  }

  const deleteDietPlan = async (id) => {
    try {
      await deleteDietPlanFromFirestore(id)
    } catch (error) {
      console.error('Error deleting diet plan:', error)
      throw error
    }
  }

  // ── Workout Plans CRUD ──────────────────────────────────
  const addWorkoutPlan = async (planData) => {
    try {
      const planId = await addWorkoutPlanToFirestore({ ...planData, gymId })
      if (planData.authUid) {
        fireNotif('workout_assigned', {
          userId: planData.authUid,
          title: 'Workout Plan Assigned',
          message: `A new workout plan "${planData.name || 'Workout Plan'}" has been assigned to you.`,
          relatedDocumentId: planId || '',
          actionUrl: '/workouts',
        }).catch(() => {})
      }
      return planId
    } catch (error) {
      console.error('Error adding workout plan:', error)
      throw error
    }
  }

  const updateWorkoutPlan = async (id, data) => {
    try {
      await updateWorkoutPlanInFirestore(id, data)
    } catch (error) {
      console.error('Error updating workout plan:', error)
      throw error
    }
  }

  const deleteWorkoutPlan = async (id) => {
    try {
      await deleteWorkoutPlanFromFirestore(id)
    } catch (error) {
      console.error('Error deleting workout plan:', error)
      throw error
    }
  }

  // ── Local check-in log ─────────────────────────────────
  const checkIn = async (member) => {
    const now     = new Date()
    const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
    setCheckinLog(p => [{
      id: Date.now(), name: member.name,
      avatar: member.avatar, time: timeStr, out: '�',
    }, ...p])
    try {
      await updateMember(member.id, { checkins: Number(member.checkins || 0) + 1 })
    } catch (err) {
      console.error('Failed to update checkin count:', err)
    }
  }

  // ── Subscription Lifecycle ──────────────────────────────
  const activateSubscription = async (planName, planType, amount) => {
    await activateSubService(gymId, planName, planType, amount, currentUser?.uid)
    fireNotif('sub_activated', {
      userId: currentUser?.uid,
      title: 'Subscription Activated',
      message: `Your ${planName} subscription has been activated.`,
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const suspendSubscription = async () => {
    await suspendSubService(gymId, currentUser?.uid)
    fireNotif('gym_suspended', {
      userId: currentUser?.uid,
      title: 'Subscription Suspended',
      message: 'The gym subscription has been suspended.',
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const expireSubscription = async () => {
    await expireSubService(gymId, currentUser?.uid)
    fireNotif('sub_expired', {
      userId: currentUser?.uid,
      title: 'Subscription Expired',
      message: 'The gym subscription has expired.',
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const renewSubscription = async (planName, planType, amount) => {
    await renewSubService(gymId, planName, planType, amount, currentUser?.uid)
    fireNotif('sub_renewed', {
      userId: currentUser?.uid,
      title: 'Subscription Renewed',
      message: `Your ${planName} subscription has been renewed.`,
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const upgradeSubscription = async (planName, planType, amount) => {
    await upgradeSubService(gymId, planName, planType, amount, currentUser?.uid)
    fireNotif('sub_upgraded', {
      userId: currentUser?.uid,
      title: 'Plan Upgraded',
      message: `Upgraded to ${planName}.`,
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const downgradeSubscription = async (planName, planType, amount) => {
    await downgradeSubService(gymId, planName, planType, amount, currentUser?.uid)
    fireNotif('sub_downgraded', {
      userId: currentUser?.uid,
      title: 'Plan Downgraded',
      message: `Downgraded to ${planName}.`,
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const assignTrialToGym = async (trialDays) => {
    await assignTrialService(gymId, trialDays, currentUser?.uid)
    fireNotif('sub_trial_started', {
      userId: currentUser?.uid,
      title: 'Trial Started',
      message: `Your ${trialDays}-day trial has started.`,
      relatedDocumentId: gymId,
      actionUrl: '/subscription',
    }).catch(() => {})
  }

  const extendSubscription = async (newExpiryDate) => {
    await extendExpiryService(gymId, newExpiryDate, currentUser?.uid)
  }

  const changeSubscriptionPlan = async (planName, planType, amount) => {
    await changePlanService(gymId, planName, planType, amount, currentUser?.uid)
  }

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      gymId,
      members,  addMember,  updateMember,  deleteMember,
      trainers, addTrainer, updateTrainer, deleteTrainer,
      payments, addPayment, updatePayment, deletePayment,
      plans,    addPlan,    updatePlan,    deletePlan,
      progressLogs, addProgressLog, updateProgressLog, deleteProgressLog,
      dietPlans, addDietPlan, updateDietPlan, deleteDietPlan,
      workoutPlans, addWorkoutPlan, updateWorkoutPlan, deleteWorkoutPlan,
      notifications, markAllNotifsRead, markNotifRead, deleteNotif, unreadCount, notifLoading, fireNotif,
      checkinLog, checkIn,
      attendance, checkInMember,
      pendingCount,
      gymSettings,
      gyms, currentGym, subscriptions,
      currentSubscription, subscriptionHistory,
      activateSubscription, suspendSubscription, expireSubscription,
      renewSubscription, upgradeSubscription, downgradeSubscription,
      assignTrialToGym, extendSubscription, changeSubscriptionPlan,
      paymentAttempts, addPaymentAttempt, updatePaymentAttemptStatus,
      initiatePayment, refreshPaymentStatus,
      approveGymOwner, rejectGymOwner,
      supportTickets, addSupportTicket,
      featureRequests, addFeatureRequest,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
