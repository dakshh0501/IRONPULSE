import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react'
import { useAuth } from './AuthContext'
import {
  subscribeToMembers,
  subscribeToMyMembers,
  subscribeToMyMember,
  subscribeToMyPayments,
  backfillTrainerAuthUid,
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
  subscribeToProgressLogs, subscribeToMyProgressLogs,
  addProgressLog as addProgressLogToFirestore,
  updateProgressLog as updateProgressLogInFirestore,
  deleteProgressLog as deleteProgressLogFromFirestore,
  subscribeToSupportTickets,
  addSupportTicket as addSupportTicketToFirestore,
  subscribeToFeatureRequests,
  addFeatureRequest as addFeatureRequestToFirestore,
  subscribeToDietPlans,
  subscribeToMyDietPlans,
  subscribeToMyAssignedDietPlans,
  addDietPlan as addDietPlanToFirestore,
  updateDietPlan as updateDietPlanInFirestore,
  deleteDietPlan as deleteDietPlanFromFirestore,
  subscribeToWorkoutPlans,
  subscribeToMyWorkoutPlans,
  subscribeToMyAssignedWorkoutPlans,
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
  subscribeMyTrainerAttendance,
  addAttendance as addAttendanceToFirestore,
} from '../services/attendanceService'
import { getPendingUsers } from '../services/authService'
import {
  subscribeToPaymentAttempts,
  savePaymentAttempt,
  updatePaymentAttempt,
  initiatePayment as initiatePaymentService,
  refreshPaymentStatus as refreshPaymentStatusService,
  cleanupExpiredPaymentAttempts,
} from '../services/paymentService'
import { doc, getDoc, updateDoc, deleteDoc, query, where, collection, serverTimestamp, onSnapshot, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import {
  subscribeToNotifications,
  addNotification as addNotifToFirestore,
  markNotifAsRead,
  markNotifAsUnread,
  markAllNotifsAsRead,
  deleteNotification,
} from '../services/notificationService'
import { buildNotification } from '../utils/notificationTypes'
import { canSubscribe } from '../utils/rbac'
import { generateUniqueLicenseKey } from '../utils/license'
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
import {
  subscribeToMyReferrals,
  subscribeToGymReferrals,
  subscribeToAllReferrals,
  subscribeToReferralSettings,
  createReferral as createReferralInFirestore,
  updateReferral as updateReferralInFirestore,
  subscribeToRewardLedger,
  subscribeToGymRewardLedger,
  subscribeToMyDiscountCoupons,
  subscribeToGymDiscountCoupons,
} from '../services/referralService'
import { fetchSecurityMetrics as fetchSecurityMetricsFromService } from '../services/securityService'

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
  const [attendance,    setAttendance]    = useState([])
  const [oldPendingCount, setOldPendingCount] = useState(0)
  const [gymOwnersPending, setGymOwnersPending] = useState([])
  const pendingCount = useMemo(() => oldPendingCount + gymOwnersPending.length, [oldPendingCount, gymOwnersPending])
  const [gymSettings,   setGymSettings]   = useState({ name: 'IronForge Gym' })
  const [progressLogs,  setProgressLogs]  = useState([])
  const [dietPlans,     setDietPlans]     = useState([])
  const [workoutPlans,  setWorkoutPlans]  = useState([])
  const [gyms,          setGyms]          = useState([])
  const [supportTickets, setSupportTickets] = useState([])
  const [supportTicketsLoading, setSupportTicketsLoading] = useState(true)
  const [featureRequests, setFeatureRequests] = useState([])
  const [featureRequestsLoading, setFeatureRequestsLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState([])
  const [currentSubscription, setCurrentSubscription] = useState(null)
  const [subscriptionHistory, setSubscriptionHistory] = useState([])
  const [paymentAttempts, setPaymentAttempts] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [securityMetricsLoading, setSecurityMetricsLoading] = useState(true)
  const [referralsLoading, setReferralsLoading] = useState(true)
  const [snapshotErrors, setSnapshotErrors] = useState([])
  const [referrals, setReferrals] = useState([])
  const [referralSettings, setReferralSettings] = useState(null)
  const [rewardLedger, setRewardLedger] = useState([])
  const [discountCoupons, setDiscountCoupons] = useState([])

  const errorSeq = useRef(0)
  const errorTimers = useRef([])
  const reportSnapshotError = useCallback((error, collection) => {
    const seq = ++errorSeq.current
    const entry = { collection, message: error.message, timestamp: Date.now(), seq }
    setSnapshotErrors(prev => [...prev.slice(-9), entry])
    const id = setTimeout(() => {
      errorTimers.current = errorTimers.current.filter(t => t.id !== id)
      setSnapshotErrors(prev => prev.filter(e => e.seq !== seq))
    }, 10000)
    errorTimers.current.push({ id, seq })
  }, [])

  // ── Gym context (derived from userGymId) ───────────────
  const gymId = userGymId || null

  // ── Data isolation ──────────────────────────────────────
  // super_admin sees ALL data (no gymId filter).
  // All other roles scoped to their own gymId.
  const isSuperAdmin = effectiveRole === 'super_admin'
  const isAdmin = isSuperAdmin || effectiveRole === 'gym_admin'
  const queryGymId = isSuperAdmin ? null : gymId

  // ── Pending gym owner approvals listener ───────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    const unsubscribe = subscribeToGyms((data) => {
      setGyms(data)
      const pendingOwners = data.filter(g => g.approvalStatus === 'pending')
      setGymOwnersPending(pendingOwners)
    }, reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, reportSnapshotError])

  // ── Admins: approve gym owner (single source of truth) ──
  const approveGymOwner = async (gymId, newSubscription = 'Trial', remarks = '') => {
    if (!isSuperAdmin) throw new Error('Unauthorized: only super admins can approve gym owners')
    let stepsCompleted = []
    try {
      const gymSnap = await getDoc(doc(db, 'gyms', gymId))
      if (!gymSnap.exists()) throw new Error('Gym not found')
      const gymData = gymSnap.data()
      const ownerUid = gymData.ownerUid
      let userRoleWasUpdated = false

      await updateGym(gymId, {
        approvalStatus: 'approved',
        ...(remarks ? { approvalRemarks: remarks } : {}),
      })
      stepsCompleted.push('gym_approved')

      if (ownerUid) {
        const userSnap = await getDoc(doc(db, 'users', ownerUid))
        if (userSnap.exists() && userSnap.data().role === 'gym_owner_pending') {
          await updateDoc(doc(db, 'users', ownerUid), { role: 'gym_owner' })
          stepsCompleted.push('user_role_updated')
        }
      }

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
        stepsCompleted.push('subscription_created')

        const initNow = new Date()
        const initExpiry = new Date(initNow)
        const planLower = (newSubscription || 'Trial').toLowerCase()
        const daysMap = { trial: 7, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
        initExpiry.setDate(initExpiry.getDate() + (daysMap[planLower] || 7))
        await updateDoc(doc(db, 'gyms', gymId), {
          'subscription.plan': newSubscription,
          'subscription.planType': planLower,
          'subscription.status': 'active',
          'subscription.paymentStatus': 'paid',
          'subscription.paymentMethod': 'Not Set',
          'subscription.startDate': initNow.toISOString(),
          'subscription.expiryDate': initExpiry.toISOString(),
          'subscription.amount': newSubscription === 'Trial' ? 0 : 0,
          'subscription.currency': 'INR',
          'subscription.deviceLimit': planLower === 'trial' ? 1 : 2,
          'subscription.licenseKey': await generateUniqueLicenseKey(),
          'subscription.licenseStatus': 'active',
          'subscription.generatedAt': initNow.toISOString(),
          'subscription.updatedAt': initNow.toISOString(),
        })
        stepsCompleted.push('gym_subscription_inited')
      }

      if (ownerUid) {
        fireNotif('gym_approved', {
          userId: ownerUid,
          title: 'Gym Approved',
          message: `Your gym "${gymData.gymName || gymData.name}" has been approved by the admin.`,
          relatedDocumentId: gymId,
          actionUrl: '/dashboard',
        }).catch(err => console.error('[AppContext]', err))
      }
    } catch (err) {
      console.error('Failed to approve gym owner:', err)
      // Rollback completed steps in reverse order
      const rollbackSteps = stepsCompleted.reverse()
      for (const step of rollbackSteps) {
        try {
          if (step === 'gym_subscription_inited') {
            await updateDoc(doc(db, 'gyms', gymId), { subscription: {} })
          } else if (step === 'subscription_created') {
            const existingSub = await getSubscriptionByGymId(gymId)
            if (existingSub?.id) await deleteDoc(doc(db, 'subscriptions', existingSub.id))
          } else if (step === 'user_role_updated') {
            const gymSnap = await getDoc(doc(db, 'gyms', gymId))
            const ownerUid = gymSnap.data()?.ownerUid
            if (ownerUid) await updateDoc(doc(db, 'users', ownerUid), { role: 'gym_owner_pending' })
          } else if (step === 'gym_approved') {
            await updateGym(gymId, { approvalStatus: 'pending' })
          }
        } catch (rollbackErr) {
          console.error(`[ROLLBACK] Failed to revert step "${step}":`, rollbackErr)
        }
      }
      throw err
    }
  }

  // ── Admins: reject gym owner (single source of truth) ──
  const rejectGymOwner = async (gymId, remarks = '') => {
    if (!isSuperAdmin) throw new Error('Unauthorized: only super admins can reject gym owners')
    try {
      // 1. Read gym doc to get ownerUid
      const gymSnap = await getDoc(doc(db, 'gyms', gymId))
      if (!gymSnap.exists()) throw new Error('Gym not found')
      const gymData = gymSnap.data()
      const ownerUid = gymData.ownerUid

      // 2. Update gym approvalStatus
      await updateGym(gymId, {
        approvalStatus: 'rejected',
        ...(remarks ? { approvalRemarks: remarks } : {}),
      })

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
        }).catch(err => console.error('[AppContext]', err))
      }
    } catch (err) {
      console.error('Failed to reject gym owner:', err)
      throw err
    }
  }

  // ── Gym CRUD ─────────────────────────────────────────────
  const addGym = async (gymData) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage gyms')
    try {
      return await addGymToFirestore({ ...gymData, gymId: userGymId }, currentUser.uid)
    } catch (err) {
      console.error('Failed to create gym:', err)
      throw err
    }
  }

  const updateGym = async (gymId, updatedData) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage gyms')
    try {
      await updateGymInFirestore(gymId, updatedData)
    } catch (err) {
      console.error('Failed to update gym:', err)
      throw err
    }
  }

  const deleteGym = async (gymId) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage gyms')
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
      const effectiveGymId = (gymId && gymId !== 'default') ? gymId : params.gymId
      return await initiatePaymentService({ ...params, gymId: effectiveGymId })
    } catch (error) {
      console.error('Error initiating payment:', error)
      return { attemptId: null, redirectUrl: null, error: error.message }
    }
  }

  const refreshPaymentStatus = useCallback(async (attemptId) => {
    try {
      return await refreshPaymentStatusService(attemptId)
    } catch (error) {
      console.error('Error refreshing payment status:', error)
      return { status: null, error: error.message }
    }
  }, [])

  // ── Subscriptions listener (platform — super_admin only) ─
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    const unsubscribe = subscribeToSubscriptions((data) => setSubscriptions(data), reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, reportSnapshotError])

  // ── Gym Subscription listener (gym_admin/gym_owner/super_admin) ───
  useEffect(() => {
    if (authLoading || !currentUser || !gymId) return
    if (effectiveRole !== 'gym_admin' && effectiveRole !== 'super_admin') return
    const unsub = subscribeToGymSubscription(gymId, (sub) => {
      if (sub) {
        const checked = checkAutoExpiry(sub)
        if (checked.status !== sub.status) {
          updateGymInFirestore(gymId, { subscription: checked }).catch(err => console.error('[AppContext]', err))
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
    if (effectiveRole !== 'gym_admin' && effectiveRole !== 'super_admin') return
    const subGymId = effectiveRole === 'super_admin' ? null : gymId
    const unsub = subscribeToSubscriptionHistory(subGymId, setSubscriptionHistory)
    return unsub
  }, [currentUser, authLoading, effectiveRole, gymId])

  // ── Payment Attempts listener — all admin roles ──────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin' && effectiveRole !== 'gym_admin') return
    const subGymId = effectiveRole === 'super_admin' ? null : gymId
    const unsubscribe = subscribeToPaymentAttempts((data) => setPaymentAttempts(data), subGymId, reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, gymId, reportSnapshotError])

  // ── Cleanup expired payment attempts on mount + periodic ──
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin' && effectiveRole !== 'gym_admin') return
    cleanupExpiredPaymentAttempts().catch(err => console.error('[AppContext]', err))
    const interval = setInterval(() => {
      cleanupExpiredPaymentAttempts().catch(err => console.error('[AppContext] cleanup interval:', err))
    }, 300000)
    return () => clearInterval(interval)
  }, [authLoading, currentUser, effectiveRole])

  // ── Notifications listener (deferred) ─────────────────
  useEffect(() => {
    if (authLoading || !currentUser?.uid) return
    let unsubs = []
    let timerId
    const schedule = () => {
      const unsub1 = subscribeToNotifications(currentUser.uid, (data) => {
        setNotifications(data)
        setNotifLoading(false)
      }, gymId, reportSnapshotError)
      unsubs.push(unsub1)

      if (effectiveRole === 'super_admin') {
        const notifQuery = query(
          collection(db, 'notifications'),
          where('targetRole', '==', 'super_admin'),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
        const unsub2 = onSnapshot(notifQuery, (snapshot) => {
          const roleNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
          setNotifications(prev => {
            const merged = [...roleNotifs, ...prev.filter(n => !roleNotifs.some(rn => rn.id === n.id))]
            merged.sort((a, b) => {
              const aTime = a.createdAt?.seconds || a.createdAt || 0
              const bTime = b.createdAt?.seconds || b.createdAt || 0
              return bTime - aTime
            })
            return merged
          })
        }, (err) => {
          console.error('[AppContext] Role-based notif subscription error:', err.message)
          reportSnapshotError(err, 'notifications')
        })
        unsubs.push(unsub2)
      }
    }
    if ('requestIdleCallback' in window) {
      timerId = requestIdleCallback(schedule, { timeout: 300 })
    } else {
      timerId = setTimeout(schedule, 0)
    }
    return () => {
      if (timerId != null) {
        if (typeof timerId === 'number') clearTimeout(timerId)
        else cancelIdleCallback(timerId)
      }
      unsubs.forEach(u => u())
      unsubs = []
      setNotifLoading(false)
    }
  }, [currentUser, authLoading, gymId, effectiveRole, reportSnapshotError])

  // ── Security Metrics (super_admin only) ────────────────
  const [securityMetrics, setSecurityMetrics] = useState(null)


  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin') return
    let mounted = true
    fetchSecurityMetricsFromService().then(metrics => {
      if (!mounted) return
      setSecurityMetrics(metrics)
      setSecurityMetricsLoading(false)
    }).catch(err => {
      if (!mounted) return
      console.error('[AppContext] fetchSecurityMetrics error:', err)
      setSecurityMetricsLoading(false)
    })
    return () => { mounted = false }
  }, [authLoading, currentUser, effectiveRole])

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

  // ── Members listener (admin/trainer) ───────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'members')) return

    if (effectiveRole === 'trainer') {
      const unsubscribe = subscribeToMyMembers(
        currentUser.uid,
        (data) => { setMembers(data) },
        queryGymId,
        reportSnapshotError
      )
      // One-time backfill for existing members without trainerAuthUid
      backfillTrainerAuthUid(queryGymId).catch(() => {})
      return unsubscribe
    }

    const unsubscribe = subscribeToMembers(
      (data) => { setMembers(data) },
      queryGymId,
      reportSnapshotError
    )
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Member self-subscription (member role — own record) ──
  useEffect(() => {
    if (authLoading || !currentUser || effectiveRole !== 'member') return
    const unsubscribe = subscribeToMyMember(
      currentUser.uid,
      (data) => { setMembers(data) },
      reportSnapshotError
    )
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, reportSnapshotError])

  // ── Payments listener (admin) ──────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'payments')) return
    const unsubscribe = subscribeToPayments((data) => setPayments(data), queryGymId, reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Member self-payments (member role — own records) ───
  useEffect(() => {
    if (authLoading || !currentUser || effectiveRole !== 'member') return
    const unsubscribe = subscribeToMyPayments(
      currentUser.uid,
      (data) => { setPayments(data) },
      gymId,
      reportSnapshotError

    )
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, gymId, reportSnapshotError])
  // ── Trainers listener ──────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'trainers')) return
    const unsubscribe = subscribeToTrainers(
      (data) => { setTrainers(data) },
      queryGymId,
      reportSnapshotError
    )
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Plans listener ─────────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'plans')) return

    // gym_admin auto-migrates default plans once (scoped to gym)
    const migratedKey = `migrated_plans_${queryGymId || 'default'}`
    if (effectiveRole === 'gym_admin' && !sessionStorage.getItem(migratedKey)) {
      sessionStorage.setItem(migratedKey, '1')
      migrateDefaultPlans(queryGymId).catch(err => console.error('Failed to migrate plans:', err))
    }

    const unsubscribe = subscribeToPlans((data) => setPlans(data), queryGymId, reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Progress Logs listener (deferred) ──────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'progressLogs')) return
    let unsub; let timerId
    const schedule = () => {
      if (effectiveRole === 'member' && currentUser?.uid) {
        unsub = subscribeToMyProgressLogs((data) => setProgressLogs(data), currentUser.uid, reportSnapshotError)
      } else {
        unsub = subscribeToProgressLogs((data) => setProgressLogs(data), queryGymId, reportSnapshotError)
      }
    }
    if ('requestIdleCallback' in window) {
      timerId = requestIdleCallback(schedule, { timeout: 300 })
    } else {
      timerId = setTimeout(schedule, 0)
    }
    return () => {
      if (timerId != null) {
        if (typeof timerId === 'number') clearTimeout(timerId)
        else cancelIdleCallback(timerId)
      }
      if (unsub) unsub()
    }
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Diet Plans listener (deferred) ─────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'dietPlans')) return
    let unsub; let timerId
    const schedule = () => {
      if (effectiveRole === 'member' && currentUser?.uid) {
        unsub = subscribeToMyAssignedDietPlans(currentUser.uid, (data) => setDietPlans(data), queryGymId, reportSnapshotError)
      } else if (effectiveRole === 'trainer' && currentUser?.uid) {
        unsub = subscribeToMyDietPlans(currentUser.uid, (data) => setDietPlans(data), queryGymId, reportSnapshotError)
      } else {
        unsub = subscribeToDietPlans((data) => setDietPlans(data), queryGymId, reportSnapshotError)
      }
    }
    if ('requestIdleCallback' in window) {
      timerId = requestIdleCallback(schedule, { timeout: 300 })
    } else {
      timerId = setTimeout(schedule, 0)
    }
    return () => {
      if (timerId != null) {
        if (typeof timerId === 'number') clearTimeout(timerId)
        else cancelIdleCallback(timerId)
      }
      if (unsub) unsub()
    }
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Workout Plans listener (deferred) ──────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'workoutPlans')) return
    let unsub; let timerId
    const schedule = () => {
      if (effectiveRole === 'member' && currentUser?.uid) {
        unsub = subscribeToMyAssignedWorkoutPlans(currentUser.uid, (data) => setWorkoutPlans(data), queryGymId, reportSnapshotError)
      } else if (effectiveRole === 'trainer' && currentUser?.uid) {
        unsub = subscribeToMyWorkoutPlans(currentUser.uid, (data) => setWorkoutPlans(data), queryGymId, reportSnapshotError)
      } else {
        unsub = subscribeToWorkoutPlans((data) => setWorkoutPlans(data), queryGymId, reportSnapshotError)
      }
    }
    if ('requestIdleCallback' in window) {
      timerId = requestIdleCallback(schedule, { timeout: 300 })
    } else {
      timerId = setTimeout(schedule, 0)
    }
    return () => {
      if (timerId != null) {
        if (typeof timerId === 'number') clearTimeout(timerId)
        else cancelIdleCallback(timerId)
      }
      if (unsub) unsub()
    }
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Support Tickets listener ──────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'supportTickets')) return
    const unsubscribe = subscribeToSupportTickets((data) => { setSupportTickets(data); setSupportTicketsLoading(false) }, queryGymId, reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Feature Requests listener ──────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (!canSubscribe(effectiveRole, 'featureRequests')) return
    const unsubscribe = subscribeToFeatureRequests((data) => { setFeatureRequests(data); setFeatureRequestsLoading(false) }, queryGymId, reportSnapshotError)
    return unsubscribe
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

  // ── Referrals listener ─────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    let unsub
    if (effectiveRole === 'super_admin') {
      unsub = subscribeToAllReferrals((data) => { setReferrals(data); setReferralsLoading(false) }, reportSnapshotError)
    } else if (effectiveRole === 'member' && currentUser?.uid) {
      unsub = subscribeToMyReferrals(currentUser.uid, (data) => { setReferrals(data); setReferralsLoading(false) }, reportSnapshotError)
    } else if (gymId) {
      unsub = subscribeToGymReferrals(gymId, (data) => { setReferrals(data); setReferralsLoading(false) }, reportSnapshotError)
    } else {
      setReferralsLoading(false)
    }
    return () => { if (unsub) unsub() }
  }, [currentUser, authLoading, effectiveRole, gymId, reportSnapshotError])

  // ── Referral Settings listener (super_admin / gym_admin / member) ──
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'super_admin' && effectiveRole !== 'gym_admin' && effectiveRole !== 'member') return
    const unsub = subscribeToReferralSettings(setReferralSettings, reportSnapshotError)
    return () => unsub()
  }, [currentUser, authLoading, effectiveRole, reportSnapshotError])

  // ── Reward Ledger listener (gym_admin / member) ──────
  useEffect(() => {
    if (authLoading || !currentUser) return
    let unsub
    if (effectiveRole === 'member' && currentUser?.uid) {
      unsub = subscribeToRewardLedger(currentUser.uid, (data) => setRewardLedger(data), reportSnapshotError)
    } else if (gymId && (effectiveRole === 'gym_admin' || effectiveRole === 'super_admin')) {
      unsub = subscribeToGymRewardLedger(gymId, (data) => setRewardLedger(data), reportSnapshotError)
    }
    return () => { if (unsub) unsub() }
  }, [currentUser, authLoading, effectiveRole, gymId, reportSnapshotError])

  // ── Discount Coupons listener (gym_admin / member) ──
  useEffect(() => {
    if (authLoading || !currentUser) return
    let unsub
    if (effectiveRole === 'member' && currentUser?.uid) {
      unsub = subscribeToMyDiscountCoupons(currentUser.uid, (data) => setDiscountCoupons(data), reportSnapshotError)
    } else if (gymId && (effectiveRole === 'gym_admin' || effectiveRole === 'super_admin')) {
      unsub = subscribeToGymDiscountCoupons(gymId, (data) => setDiscountCoupons(data), reportSnapshotError)
    }
    return () => { if (unsub) unsub() }
  }, [currentUser, authLoading, effectiveRole, gymId, reportSnapshotError])

  // ── Attendance listener ────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole === 'trainer' && currentUser?.uid) {
      const unsubscribe = subscribeMyTrainerAttendance(currentUser.uid, (data) => setAttendance(data), queryGymId)
      return unsubscribe
    }
    if (canSubscribe(effectiveRole, 'attendance')) {
      const unsubscribe = subscribeAttendance((data) => setAttendance(data), queryGymId, reportSnapshotError)
      return unsubscribe
    }
    if (effectiveRole === 'member' && currentUser?.uid) {
      const unsubscribe = subscribeMyAttendance(currentUser.uid, (data) => setAttendance(data), queryGymId)
      return unsubscribe
    }
  }, [currentUser, authLoading, effectiveRole, queryGymId, reportSnapshotError])

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
        console.error('AppContext: Failed to load pending count:', e)
      }
    }
    loadPendingCount()
    const interval = setInterval(loadPendingCount, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [currentUser, authLoading, effectiveRole])

  // ── Stable actions ref (prevents context value recreation on every render) ──
  const actionsRef = useRef({})

  // ── Auto-sync member payment fields ───────────────────
  // M34: Track previous payments to only update affected members (avoid O(n) writes)
  const prevPaymentsRef = useRef([])
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (effectiveRole !== 'gym_admin' && effectiveRole !== 'super_admin') return
    if (members.length === 0 || payments.length === 0) return

    const updates = []
    const prevPayments = prevPaymentsRef.current

    // Detect which payments actually changed since last snapshot
    const changedPayments = payments.filter(p => {
      const prev = prevPayments.find(pp => pp.id === p.id)
      return !prev || prev.paid !== p.paid || prev.status !== p.status || prev.amount !== p.amount
    })
    prevPaymentsRef.current = payments

    // Only process members whose payments changed (M34: O(1) per change instead of O(n))
    const affectedMemberIds = new Set(changedPayments.map(p => p.memberId).filter(Boolean))
    const targetMembers = affectedMemberIds.size > 0
      ? members.filter(m => affectedMemberIds.has(m.id))
      : (prevPayments.length === 0 ? members : [])

    targetMembers.forEach(member => {
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
  }, [payments, members, currentUser, authLoading, effectiveRole])

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
      .catch(err => console.error('AppContext: Failed to load gym settings:', err))
    
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

  const markNotifUnread = async (notifId) => {
    try {
      await markNotifAsUnread(notifId)
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: false } : n))
    } catch (err) {
      console.error('markNotifUnread error:', err)
    }
  }

  const markAllNotifsRead = async () => {
    if (!currentUser?.uid) return
    try {
      await markAllNotifsAsRead(currentUser.uid, gymId)
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
    if (!isAdmin) throw new Error('Unauthorized: only admins can add members')
    try {
      const memberDataWithAuth = { ...memberData }
      if (memberDataWithAuth.trainerId && !memberDataWithAuth.trainerAuthUid) {
        const trainer = trainers.find(t => t.id === memberDataWithAuth.trainerId)
        if (trainer?.authUid) memberDataWithAuth.trainerAuthUid = trainer.authUid
      }
      const memberId = await addMemberToFirestore({
        ...memberDataWithAuth,
        gymId,
        trainerId:   memberDataWithAuth.trainerId   || '',
        trainerName: memberDataWithAuth.trainerName || '',
        status:      memberData.status      || 'Active',
        plan:        memberData.plan        || 'Monthly',
        amountPaid:  Number(memberData.amountPaid) || 0,
        checkins:    Number(memberData.checkins)   || 0,
      })
      if (currentUser?.uid && memberId) {
        const notifUserId = memberData.authUid || currentUser.uid
        fireNotif('member_added', {
          userId: currentUser.uid,
          title: 'New Member Added',
          message: `${memberData.name || 'Member'} has been added with ${memberData.plan || 'Monthly'} plan.`,
          relatedDocumentId: memberId,
        }).catch(() => {})
        if (notifUserId !== currentUser.uid) {
          fireNotif('member_added', {
            userId: notifUserId,
            title: 'Welcome!',
            message: `You have been registered with ${memberData.plan || 'Monthly'} plan.`,
            relatedDocumentId: memberId,
          }).catch(() => {})
        }
      }
      return memberId
    } catch (error) {
      console.error('Error adding member:', error)
      throw error
    }
  }

  const updateMember = async (id, data) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can update members')
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
    if (!isAdmin) throw new Error('Unauthorized: only admins can delete members')
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
      const memberId = member.authUid || member.id
      if (!memberId) {
        console.error('checkInMember: no authUid or id on member', member)
        throw new Error('Member identifier missing — cannot record attendance')
      }
      await addAttendanceToFirestore({
        memberId,
        memberName:  member.name,
        avatar:      member.avatar || (member.name || 'M').slice(0, 2).toUpperCase(),
        color:       member.color  || '#00c8b4',
        plan:        member.plan   || member.membershipPlan || 'Standard',
        trainerId:   member.trainerId   || '',
        trainerName: member.trainerName || '',
        trainerAuthUid: member.trainerAuthUid || '',
        date:        todayStr,
        time,
        method:      'Manual',
        duration:    90,
        gymId,
      })
      if (member.id) {
        await updateMemberInFirestore(member.id, { checkins: (member.checkins || 0) + 1 })
      }
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
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage payments')
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
        }).catch(err => console.error('[AppContext]', err))
        if (paymentData.authUid) {
          fireNotif('payment_received', {
            userId: paymentData.authUid,
            title: 'Payment Confirmed',
            message: `Your payment of ₹${Number(paymentData.amount).toLocaleString('en-IN')} has been received.`,
            relatedDocumentId: paymentId || '',
          }).catch(err => console.error('[AppContext]', err))
        }
      }
      return paymentId
    } catch (error) {
      console.error('Error adding payment:', error)
      throw error
    }
  }

  const updatePayment = async (id, data) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage payments')
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
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage payments')
    try {
      await deletePaymentFromFirestore(id)
    } catch (error) {
      console.error('Error deleting payment:', error)
      throw error
    }
  }

  // ── Trainer CRUD ───────────────────────────────────────
  const addTrainer = async (trainerData) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage trainers')
    try {
      const result = await addTrainerToFirestore({
        ...trainerData,
        gymId,
        rating:  trainerData.rating  || 5,
        clients: trainerData.clients || 0,
      })
      const trainerId = result?.id || ''
      if (currentUser?.uid) {
        fireNotif('trainer_added', {
          userId: currentUser.uid,
          title: 'New Trainer Added',
          message: `${trainerData.name || 'Trainer'} has been added to the team.`,
          relatedDocumentId: trainerId || '',
        }).catch(err => console.error('[AppContext]', err))
      }
      return result
    } catch (error) {
      console.error('Error adding trainer:', error)
      throw error
    }
  }

  const updateTrainer = async (id, data) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage trainers')
    try {
      await updateTrainerInFirestore(id, data)
    } catch (error) {
      console.error('Error updating trainer:', error)
      throw error
    }
  }

  const deleteTrainer = async (id) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage trainers')
    try {
      const trainer = trainers.find(t => t.id === id)
      await deleteTrainerFromFirestore(id)
      if (currentUser?.uid && trainer?.name) {
        fireNotif('trainer_removed', {
          userId: currentUser.uid,
          title: 'Trainer Removed',
          message: `${trainer.name} has been removed from the system.`,
          relatedDocumentId: id,
        }).catch(err => console.error('[AppContext]', err))
      }
    } catch (error) {
      console.error('Error deleting trainer:', error)
      throw error
    }
  }

  // ── Plans CRUD ─────────────────────────────────────────
  const addPlan = async (planData) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage plans')
    try {
      return await addPlanToFirestore({ ...planData, gymId })
    } catch (error) {
      console.error('Error adding plan:', error)
      throw error
    }
  }

  const updatePlan = async (id, data) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage plans')
    try {
      await updatePlanInFirestore(id, data)
    } catch (error) {
      console.error('Error updating plan:', error)
      throw error
    }
  }

  const deletePlan = async (id) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage plans')
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
        }).catch(err => console.error('[AppContext]', err))
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
      const ticketId = await addSupportTicketToFirestore({ ...ticketData, gymId, createdBy: currentUser?.uid || '' })
      fireNotif('ticket_opened', {
        userId: currentUser?.uid || '',
        title: 'Support Ticket Created',
        message: `Ticket #${ticketId?.slice(-6)} has been submitted.`,
        relatedDocumentId: ticketId || '',
        actionUrl: '/support',
      }).catch(err => console.error('[AppContext]', err))
      return ticketId
    } catch (error) {
      console.error('Error adding support ticket:', error)
      throw error
    }
  }

  // ── Feature Requests CRUD ────────────────────────────────
  const addFeatureRequest = async (requestData) => {
    try {
      const requestId = await addFeatureRequestToFirestore({ ...requestData, gymId, createdBy: currentUser?.uid || '' })
      fireNotif('ticket_opened', {
        userId: currentUser?.uid || '',
        title: 'Feature Request Submitted',
        message: 'Your feature request has been submitted for review.',
        relatedDocumentId: requestId || '',
      }).catch(err => console.error('[AppContext]', err))
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
        }).catch(err => console.error('[AppContext]', err))
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
        }).catch(err => console.error('[AppContext]', err))
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

  // ── Subscription Lifecycle ──────────────────────────────
  const activateSubscription = async (planName, planType, amount) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await activateSubService(gymId, planName, planType, amount, currentUser?.uid)
      fireNotif('sub_activated', {
        userId: currentUser?.uid,
        title: 'Subscription Activated',
        message: `Your ${planName} subscription has been activated.`,
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to activate subscription:', error)
      throw error
    }
  }

  const suspendSubscription = async () => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await suspendSubService(gymId, currentUser?.uid)
      const targetGym = gyms.find(g => g.id === gymId)
      const targetUserId = targetGym?.ownerUid || targetGym?.createdBy || currentUser?.uid
      fireNotif('gym_suspended', {
        userId: targetUserId,
        title: 'Subscription Suspended',
        message: 'The gym subscription has been suspended.',
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to suspend subscription:', error)
      throw error
    }
  }

  const expireSubscription = async () => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await expireSubService(gymId, currentUser?.uid)
      fireNotif('sub_expired', {
        userId: currentUser?.uid,
        title: 'Subscription Expired',
        message: 'The gym subscription has expired.',
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to expire subscription:', error)
      throw error
    }
  }

  const renewSubscription = async (planName, planType, amount) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await renewSubService(gymId, planName, planType, amount, currentUser?.uid)
      fireNotif('sub_renewed', {
        userId: currentUser?.uid,
        title: 'Subscription Renewed',
        message: `Your ${planName} subscription has been renewed.`,
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to renew subscription:', error)
      throw error
    }
  }

  const upgradeSubscription = async (planName, planType, amount) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await upgradeSubService(gymId, planName, planType, amount, currentUser?.uid)
      fireNotif('sub_upgraded', {
        userId: currentUser?.uid,
        title: 'Plan Upgraded',
        message: `Upgraded to ${planName}.`,
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to upgrade subscription:', error)
      throw error
    }
  }

  // delegates to changePlan (same date calc and update logic)
  const downgradeSubscription = async (planName, planType, amount) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await downgradeSubService(gymId, planName, planType, amount, currentUser?.uid)
      fireNotif('sub_downgraded', {
        userId: currentUser?.uid,
        title: 'Plan Downgraded',
        message: `Downgraded to ${planName}.`,
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to downgrade subscription:', error)
      throw error
    }
  }

  const reactivateSubscription = async () => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      const sub = currentSubscription
      const now = new Date()
      const daysMap = { trial: 14, monthly: 30, quarterly: 90, yearly: 365, annual: 365, lifetime: 9999 }
      const billingInterval = daysMap[sub?.planType] || 30
      const currentExpiry = sub?.expiryDate ? new Date(sub.expiryDate) : now
      const newExpiry = new Date(currentExpiry)
      newExpiry.setDate(newExpiry.getDate() + billingInterval)
      await updateDoc(doc(db, 'gyms', gymId), {
        'subscription.status': 'active',
        'subscription.licenseStatus': 'active',
        'subscription.expiryDate': newExpiry.toISOString(),
        'subscription.cancelledAt': null,
        'subscription.updatedAt': serverTimestamp(),
      })
      fireNotif('sub_reactivated', {
        userId: currentUser?.uid,
        title: 'Subscription Reactivated',
        message: 'Your subscription has been reactivated.',
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to reactivate subscription:', error)
      throw error
    }
  }

  const assignTrialToGym = async (trialDays) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await assignTrialService(gymId, trialDays, currentUser?.uid)
      fireNotif('sub_trial_started', {
        userId: currentUser?.uid,
        title: 'Trial Started',
        message: `Your ${trialDays}-day trial has started.`,
        relatedDocumentId: gymId,
        actionUrl: '/subscription',
      }).catch(err => console.error('[AppContext]', err))
    } catch (error) {
      console.error('Failed to assign trial:', error)
      throw error
    }
  }

  const extendSubscription = async (newExpiryDate) => {
    try {
      await extendExpiryService(gymId, newExpiryDate, currentUser?.uid)
    } catch (error) {
      console.error('Failed to extend subscription:', error)
      throw error
    }
  }

  const changeSubscriptionPlan = async (planName, planType, amount) => {
    if (!isAdmin) throw new Error('Unauthorized: only admins can manage subscriptions')
    try {
      await changePlanService(gymId, planName, planType, amount, currentUser?.uid)
    } catch (error) {
      console.error('Failed to change subscription plan:', error)
      throw error
    }
  }

  // ── Stable actions ref (always has latest functions, stable identity) ──
  actionsRef.current = {
    setDarkMode,
    addMember, updateMember, deleteMember,
    addTrainer, updateTrainer, deleteTrainer,
    addPayment, updatePayment, deletePayment,
    addPlan, updatePlan, deletePlan,
    addProgressLog, updateProgressLog, deleteProgressLog,
    addDietPlan, updateDietPlan, deleteDietPlan,
    addWorkoutPlan, updateWorkoutPlan, deleteWorkoutPlan,
    markAllNotifsRead, markNotifRead, markNotifUnread, deleteNotif, fireNotif, addNotifToFirestore,
    checkInMember,
    activateSubscription, suspendSubscription, expireSubscription,
    renewSubscription, upgradeSubscription, downgradeSubscription, reactivateSubscription,
    assignTrialToGym, extendSubscription, changeSubscriptionPlan,
    addPaymentAttempt, updatePaymentAttemptStatus, initiatePayment, refreshPaymentStatus,
    approveGymOwner, rejectGymOwner,
    addSupportTicket, addFeatureRequest,
    addGym, updateGym, deleteGym,
    createReferral: createReferralInFirestore,
    updateReferral: updateReferralInFirestore,
  }

  const contextValue = useMemo(() => ({
    darkMode, gymId,
    members, trainers, payments, plans,
    progressLogs, dietPlans, workoutPlans,
    notifications, attendance,
    pendingCount, gymSettings,
    gyms, subscriptions, currentSubscription, subscriptionHistory,
    paymentAttempts, snapshotErrors,
    supportTickets, supportTicketsLoading,
    featureRequests, featureRequestsLoading, notifLoading,
    referrals, referralSettings, referralsLoading,
    rewardLedger, discountCoupons,
    securityMetrics, securityMetricsLoading, unreadCount,
    ...actionsRef.current,
  }), [
    darkMode, gymId,
    members, trainers, payments, plans,
    progressLogs, dietPlans, workoutPlans,
    notifications, attendance,
    pendingCount, gymSettings,
    gyms, subscriptions, currentSubscription, subscriptionHistory,
    paymentAttempts, snapshotErrors,
    supportTickets, supportTicketsLoading,
    featureRequests, featureRequestsLoading, notifLoading,
    referrals, referralSettings, referralsLoading,
    rewardLedger, discountCoupons,
    securityMetrics, securityMetricsLoading, unreadCount,
  ])

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
