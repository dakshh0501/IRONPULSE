// Sprint 81H-Final — Firestore rules emulator test suite
// Run: firebase emulators:exec --only firestore "node firestore.rules.test.cjs"
// Uses the REAL firestore.rules via firebase.json. NEVER touches production.
'use strict'
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing')

const PROJECT_ID = 'demo-ironpulse'
let results = { pass: 0, fail: 0, details: [] }

function check(name, ok, extra) {
  if (ok) { results.pass++; console.log(`  PASS  ${name}`) }
  else { results.fail++; console.log(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`); results.details.push(`${name}: ${extra || ''}`) }
}

async function main() {
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID })

  // ── SEED (rules disabled) ──────────────────────────────────────
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    // Pre-existing owner with a code (D case)
    await db.doc('users/ownerD').set({ uid: 'ownerD', role: 'gym_owner_pending', gymId: 'gym1', referralCode: 'IP-DDD444' })
    // Pre-existing victim with a code (C1 squatting target)
    await db.doc('users/victimU').set({ uid: 'victimU', role: 'member', gymId: 'gym1', referralCode: 'IP-VIC999' })
    // Recovery companions (G7/G9)
    await db.doc('members/memberB').set({ authUid: 'memberB', gymId: 'gym1', name: 'Member B' })
    await db.doc('trainers/trainerC').set({ authUid: 'trainerC', gymId: 'gym1', name: 'Trainer C' })
    await db.doc('members/memberM').set({ authUid: 'memberM', gymId: 'gym1', name: 'Member M' })
    // Staff
    await db.doc('users/staffSuper').set({ uid: 'staffSuper', role: 'super_admin' })
    await db.doc('users/gymAdmin').set({ uid: 'gymAdmin', role: 'gym_admin', gymId: 'gym1' })
  })

  const ownerX = env.authenticatedContext('ownerX')
  const ownerY = env.authenticatedContext('ownerY')
  const attacker = env.authenticatedContext('attackerU')
  const victim = env.authenticatedContext('victimU')
  const ownerD = env.authenticatedContext('ownerD')
  const memberB = env.authenticatedContext('memberB')
  const trainerC = env.authenticatedContext('trainerC')
  const memberM = env.authenticatedContext('memberM')
  const staff = env.authenticatedContext('staffSuper')
  const admin = env.authenticatedContext('gymAdmin')
  const loneMember = env.authenticatedContext('loneMember')
  const anon = env.unauthenticatedContext()

  // ══ A. FRESH SIGNUP — ATOMIC BATCH AS PRODUCTION WRITES IT ══════
  console.log('── A. Fresh signup batch (users + referralCodes, one writeBatch)')
  {
    const db = ownerX.firestore()
    const docId = 'ownerX'
    const userData = {
      uid: docId, email: 'x@test.dev', name: 'Owner X',
      role: 'gym_owner_pending', gymId: 'gymX', referralCode: 'IP-X1X9X3', referredBy: '',
    }
    const batch = db.batch()
    batch.set(db.doc('users/ownerX'), userData)
    batch.set(db.doc('referralCodes/IP-X1X9X3'), { referrerUid: 'ownerX' })
    let ok = true, errTxt = ''
    try { await assertSucceeds(batch.commit()) } catch (e) { ok = false; errTxt = e.message }
    check('A1 users+referralCodes batch ALLOWED (same batch, getAfter validation)', ok, errTxt)

    // Verify BOTH docs were created
    let created = true, err2 = ''
    try {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const u = await ctx.firestore().doc('users/ownerX').get()
        const c = await ctx.firestore().doc('referralCodes/IP-X1X9X3').get()
        if (!(u.exists && c.exists)) throw new Error(`users.exists=${u.exists} codes.exists=${c.exists}`)
        if (u.data().role !== 'gym_owner_pending') throw new Error('role mismatch')
        if (c.data().referrerUid !== 'ownerX') throw new Error('referrerUid mismatch')
      })
    } catch (e) { created = false; err2 = e.message }
    check('A2 BOTH users/{uid} AND referralCodes/{code} persisted', created, err2)
  }

  // A3 — write ORDER reversed (referralCodes first): getAfter must be order-independent
  {
    const db = ownerY.firestore()
    const batch = db.batch()
    batch.set(db.doc('referralCodes/IP-Y7Y7Y7'), { referrerUid: 'ownerY' })
    batch.set(db.doc('users/ownerY'), { uid: 'ownerY', email: 'y@test.dev', role: 'gym_owner_pending', gymId: 'gymY', referralCode: 'IP-Y7Y7Y7' })
    let ok = true, errTxt = ''
    try { await assertSucceeds(batch.commit()) } catch (e) { ok = false; errTxt = e.message }
    check('A3 batch with referralCodes written FIRST still ALLOWED', ok, errTxt)
  }

  // ══ B. WRONG / MALICIOUS MAPPING → DENY ══════════════════════════
  console.log('── B. Wrong/malicious referral-code mapping')
  {
    // ownerX already owns users/ownerX with IP-X1X9X3; try to map a DIFFERENT code
    const db = ownerX.firestore()
    let ok = true, errTxt = ''
    try { await assertFails(db.doc('referralCodes/IP-OTHER00').set({ referrerUid: 'ownerX' })) } catch (e) { ok = false; errTxt = e.message }
    check('B1 map a code that is NOT my own users.referralCode → DENIED', ok, errTxt)

    // Referrer-uid mismatch on MY OWN code
    let ok2 = true, errTxt2 = ''
    try { await assertFails(db.doc('referralCodes/IP-X1X9X3').set({ referrerUid: 'someoneElse' })) } catch (e) { ok2 = false; errTxt2 = e.message }
    check('B2 own code but referrerUid != auth.uid → DENIED', ok2, errTxt2)
  }

  // ══ C. SQUATTING → DENY ═══════════════════════════════════════════
  console.log('── C. Referral-code squatting')
  {
    // attackerU creates their own users doc first (legit), then tries a VICTIM's code
    const db = attacker.firestore()
    let ok = true, errTxt = ''
    try {
      await assertSucceeds(db.doc('users/attackerU').set({ uid: 'attackerU', role: 'pending', gymId: 'gymA', referralCode: 'IP-ATT555' }))
      await assertFails(db.doc('referralCodes/IP-VIC999').set({ referrerUid: 'attackerU' }))
    } catch (e) { ok = false; errTxt = e.message }
    check('C1 claim another member\'s code (VIC) → DENIED', ok, errTxt)

    // Squat with NO users doc at all
    let ok2 = true, errTxt2 = ''
    try { await assertFails(db.doc('referralCodes/IP-EVE007').set({ referrerUid: 'eveU' })) } catch (e) { ok2 = false; errTxt2 = e.message }
    check('C2 no users doc at all → DENIED', ok2, errTxt2)

    // Victim CAN read the directory (legit resolution), attacker too — read is public-for-authed
    let ok3 = true
    try { await assertSucceeds(victim.firestore().doc('referralCodes/IP-VIC999').get()) } catch (e) { ok3 = false }
    check('C3 code owner can read directory entry', ok3)
  }

  // ══ D. EXISTING USER's OWN MAPPING → ALLOW ════════════════════════
  console.log('── D. Existing user creates missing directory entry for THEIR code')
  {
    let ok = true, errTxt = ''
    try { await assertSucceeds(ownerD.firestore().doc('referralCodes/IP-DDD444').set({ referrerUid: 'ownerD' })) } catch (e) { ok = false; errTxt = e.message }
    check('D1 owners\' own pre-existing code maps cleanly → ALLOWED', ok, errTxt)
  }

  // ══ E. UNAUTHENTICATED → DENY ═════════════════════════════════════
  console.log('── E. Unauthenticated mapping')
  {
    let ok = true, errTxt = '', ok2 = true, errTxt2 = ''
    try { await assertFails(anon.firestore().doc('referralCodes/IP-AAA000').set({ referrerUid: 'anonU' })) } catch (e) { ok = false; errTxt = e.message }
    try { await assertFails(anon.firestore().doc('users/anonU').set({ uid: 'anonU', role: 'pending' })) } catch (e) { ok2 = false; errTxt2 = e.message }
    check('E1 unauthenticated referralCodes create → DENIED', ok, errTxt)
    check('E2 unauthenticated users create → DENIED', ok2, errTxt2)
  }

  // ══ F. UPDATE / DELETE referralCodes → DENY ═══════════════════════
  console.log('── F. referralCodes update/delete')
  {
    const db = ownerD.firestore()
    let ok = true, errTxt = '', ok2 = true, errTxt2 = ''
    try { await assertFails(db.doc('referralCodes/IP-DDD444').update({ referrerUid: 'hacker' })) } catch (e) { ok = false; errTxt = e.message }
    try { await assertFails(db.doc('referralCodes/IP-DDD444').delete()) } catch (e) { ok2 = false; errTxt2 = e.message }
    check('F1 update → DENIED even for owner', ok, errTxt)
    check('F2 delete → DENIED even for owner', ok2, errTxt2)
  }

  // ══ G. USERS PROTECTION (role allow-list + escalation) ═══════════
  console.log('── G. users/{uid} protection')
  {
    const db = attacker.firestore()
    let ok = true, errTxt = ''
    try { await assertFails(db.doc('users/attackerU').set({ uid: 'attackerU', role: 'gym_admin', gymId: 'gymV' })) } catch (e) { ok = false; errTxt = e.message }
    check('G1 self-create role gym_admin → DENIED', ok, errTxt)

    let ok2 = true
    try { await assertFails(db.doc('users/attackerU').set({ uid: 'attackerU', role: 'super_admin' })) } catch (e) { ok2 = false }
    check('G2 self-create role super_admin → DENIED', ok2)

    let ok3 = true
    try { await assertFails(db.doc('users/attackerU').set({ uid: 'attackerU', role: 'gym_owner', gymId: 'gymV' })) } catch (e) { ok3 = false }
    check('G3 self-create role gym_owner → DENIED', ok3)

    let ok4 = true, errTxt4 = ''
    try { await assertSucceeds(db.doc('users/attackerU').set({ uid: 'attackerU', role: 'pending', gymId: 'gymA' })) } catch (e) { ok4 = false; errTxt4 = e.message }
    check('G4 self-create role pending → ALLOWED', ok4, errTxt4)

    let ok5 = true
    try { await assertSucceeds(loneMember.firestore().doc('users/loneMember').set({ uid: 'loneMember', role: 'gym_owner_pending', gymId: 'gymL' })) } catch (e) { ok5 = false }
    check('G5 self-create role gym_owner_pending → ALLOWED', ok5)

    let ok6 = true
    try { await assertSucceeds(loneMember.firestore().doc('users/loneMember2').set({ uid: 'loneMember2', role: 'rejected', gymId: 'gymL' })) } catch (e) { ok6 = false }
    check('G6 self-create role rejected (recovery) → ALLOWED', ok6)

    let ok7 = true, errTxt7 = ''
    try { await assertSucceeds(memberB.firestore().doc('users/memberB').set({ uid: 'memberB', role: 'member', gymId: 'gym1', email: 'b@t.dev' })) } catch (e) { ok7 = false; errTxt7 = e.message }
    check('G7 member recovery (companion members/{uid} exists) → ALLOWED', ok7, errTxt7)

    let ok8 = true
    try { await assertFails(memberB.firestore().doc('users/noCompanion').set({ uid: 'noCompanion', role: 'member', gymId: 'gym1' })) } catch (e) { ok8 = false }
    check('G8 self-create role member WITHOUT companion doc → DENIED', ok8)

    let ok9 = true
    try { await assertSucceeds(trainerC.firestore().doc('users/trainerC').set({ uid: 'trainerC', role: 'trainer', gymId: 'gym1' })) } catch (e) { ok9 = false }
    check('G9 trainer recovery (companion trainers/{uid} exists) → ALLOWED', ok9)

    let ok10 = true
    try { await assertSucceeds(staff.firestore().doc('users/newMember1').set({ uid: 'newMember1', role: 'member', gymId: 'gym1' })) } catch (e) { ok10 = false }
    check('G10 staff create member user → ALLOWED (staff path preserved)', ok10)

    let ok11 = true
    try { await assertFails(ownerX.firestore().doc('users/ownerX').update({ role: 'gym_admin' })) } catch (e) { ok11 = false }
    check('G11 self UPDATE role → DENIED (existing update rule preserved)', ok11)
  }

  // ══ H. FULL SIGNUP ORDER (gyms first, then atomic batch) ═════════
  console.log('── H. Full signup order regression (gyms create → users+referralCodes batch)')
  {
    const db = ownerY.firestore()
    let ok = true, errTxt = ''
    try {
      await assertSucceeds(db.doc('gyms/gymY').set({ gymId: 'gymY', ownerName: 'Owner Y', email: 'y@t.dev', phone: '+919000000000', ownerUid: 'ownerY', approvalStatus: 'pending' }))
      const batch = db.batch()
      batch.set(db.doc('users/ownerY'), { uid: 'ownerY', email: 'y@t.dev', role: 'gym_owner_pending', gymId: 'gymY', referralCode: 'IP-Y8Y8Y8' })
      batch.set(db.doc('referralCodes/IP-Y8Y8Y8'), { referrerUid: 'ownerY' })
      await assertSucceeds(batch.commit())
    } catch (e) { ok = false; errTxt = e.message }
    check('H1 gym-doc create + second batch ALLOWED (full signup sequence)', ok, errTxt)

    let ok2 = true
    try { await assertFails(attacker.firestore().doc('gyms/gymSpoof').set({ gymId: 'gymSpoof', ownerUid: 'someoneElse', approvalStatus: 'pending' })) } catch (e) { ok2 = false }
    check('H2 gyms create with foreign ownerUid → DENIED', ok2)
  }

  // ══ R. REFERRALS regression (81H path-wildcard probe + Spark transaction) ══
  console.log('── R. Referrals registration flow (81H regression)')
  {
    const db = memberM.firestore()
    let ok = true, errTxt = ''
    try {
      const missing = await db.doc('referrals/memberM').get()
      check('R0 missing referrals/{ownUid} probe READS OK (non-existent doc read allowed)', !missing.exists)
    } catch (e) { ok = false; errTxt = e.message }
    check('R1 referrals/{ownUid} path-wildcard probe ALLOWED (81H fix)', ok, errTxt)

    let ok2 = true, errTxt2 = ''
    try {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('referralCodes/IP-MR1R10').set({ referrerUid: 'referrerZ' })
      })
      const tx = await db.runTransaction(async (t) => {
        const existing = await t.get(db.doc('referrals/memberM'))
        if (existing.exists()) return 'exists'
        t.set(db.doc('referrals/memberM'), { referrerUid: 'referrerZ', referredUid: 'memberM', referralCode: 'IP-MR1R10', gymId: 'gym1', status: 'Pending', createdAt: new Date().toISOString() })
        t.set(db.doc('notifications/ref-test-ref-reg'), { userId: 'referrerZ', gymId: 'gym1', type: 'referral', subtype: 'referral_registered', title: 'T', message: 'M', read: false, createdAt: new Date().toISOString() })
        t.set(db.doc('notifications/ref-test-ref-app'), { userId: 'memberM', gymId: 'gym1', type: 'referral', subtype: 'referral_applied', title: 'T', message: 'M', read: false, createdAt: new Date().toISOString() })
        t.set(db.doc('referralAuditLogs/ref-test-audit'), { action: 'REFERRAL_CREATED', performedBy: 'memberM', targetUid: 'referrerZ', timestamp: new Date().toISOString() })
        return 'created'
      })
      check('R2 Spark referral transaction (referral+2 notifs+audit) ALLOWED', tx === 'created')
    } catch (e) { ok2 = false; errTxt2 = e.message }
    check('R3 transaction executed cleanly', ok2, errTxt2)

    let ok3 = true
    try {
      await db.runTransaction(async (t) => {
        const existing = await t.get(db.doc('referrals/memberM'))
        if (existing.exists()) return 'exists'
        throw new Error('should not reach')
      })
    } catch (e) { ok3 = false }
    check('R4 idempotency: second run sees existing row (no duplicate)', ok3)

    let ok4 = true
    try { await assertSucceeds(admin.firestore().doc('referrals/memberM').get()) } catch (e) { ok4 = false }
    check('R5 gym admin can read gym referral (inCallersGym)', ok4)
  }

  await env.cleanup()
  console.log(`\n══════ RESULTS: ${results.pass} passed / ${results.fail} failed ══════`)
  if (results.fail > 0) { results.details.forEach(d => console.log('FAILED:', d)) }
  process.exit(results.fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error('SUITE ERROR:', e); process.exit(2) })