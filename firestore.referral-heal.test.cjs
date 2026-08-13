// Sprint 82 — users-doc update rule missing-field tolerance (real firestore.rules)
// Run: firebase emulators:exec --only firestore "node firestore.referral-heal.test.cjs"
'use strict'
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing')

const PROJECT_ID = 'demo-ironpulse-heal'
let results = { pass: 0, fail: 0, details: [] }

function check(name, ok, extra) {
  if (ok) { results.pass++; console.log(`  PASS  ${name}`) }
  else { results.fail++; console.log(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`); results.details.push(`${name}: ${extra || ''}`) }
}

async function main() {
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID })

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    // Legacy gym owner: no referralCode / referredBy / authUid fields at all
    await db.doc('users/ownerA').set({ uid: 'ownerA', role: 'gym_owner', gymId: 'gym1', email: 'a@x.dev' })
    // Member with empty-string code (81A-era failed generation)
    await db.doc('users/memberB').set({ uid: 'memberB', role: 'member', gymId: 'gym1', email: 'b@x.dev', referralCode: '' })
    // Member with invalid-format legacy code (lowercase)
    await db.doc('users/memberC').set({ uid: 'memberC', role: 'member', gymId: 'gym1', email: 'c@x.dev', referralCode: 'IP-abc1' })
    // Gym owner with valid code but MISSING directory entry
    await db.doc('users/ownerD').set({ uid: 'ownerD', role: 'gym_owner', gymId: 'gym1', email: 'd@x.dev', referralCode: 'IP-DDD444' })
    // Gym owner with valid code AND existing own mapping
    await db.doc('users/ownerE').set({ uid: 'ownerE', role: 'gym_owner', gymId: 'gym1', email: 'e@x.dev', referralCode: 'IP-EEE555' })
    await db.doc('referralCodes/IP-EEE555').set({ referrerUid: 'ownerE' })
    // Member with a valid code (update-other-fields case)
    await db.doc('users/memberF').set({ uid: 'memberF', role: 'member', gymId: 'gym1', email: 'f@x.dev', referralCode: 'IP-FFF666', referredBy: '' })
    // Pending legacy user for staff approval (no referralCode/referredBy)
    await db.doc('users/pendingG').set({ uid: 'pendingG', role: 'pending', gymId: 'gym1', email: 'g@x.dev' })
    // Super admin (staff)
    await db.doc('users/staffSuper').set({ uid: 'staffSuper', role: 'super_admin' })
  })

  const ownerA = env.authenticatedContext('ownerA')
  const memberB = env.authenticatedContext('memberB')
  const memberC = env.authenticatedContext('memberC')
  const ownerD = env.authenticatedContext('ownerD')
  const ownerE = env.authenticatedContext('ownerE')
  const memberF = env.authenticatedContext('memberF')
  const staff = env.authenticatedContext('staffSuper')

  // T1: legacy gym owner, NO code -> heal write (one-time set) + mapping create
  console.log('── T1. legacy gym_owner without code (ensureSelfReferralCode heal)')
  {
    const db = ownerA.firestore()
    try {
      await assertSucceeds(db.doc('users/ownerA').update({
        referralCode: 'IP-NEW001', referralCodeGeneratedAt: new Date(),
      }))
      check('T1a users/ownerA heal referralCode set ALLOWED', true)
    } catch (e) { check('T1a users/ownerA heal referralCode set ALLOWED', false, e.message) }
    try {
      await assertSucceeds(db.doc('referralCodes/IP-NEW001').set({ referrerUid: 'ownerA' }))
      check('T1b referralCodes/IP-NEW001 create ALLOWED', true)
    } catch (e) { check('T1b referralCodes/IP-NEW001 create ALLOWED', false, e.message) }
  }

  // T2: member with referralCode:'' -> heal one-time set allowed
  console.log('── T2. member with empty-string code')
  {
    const db = memberB.firestore()
    try {
      await assertSucceeds(db.doc('users/memberB').update({ referralCode: 'IP-NEW002' }))
      check('T2 users/memberB heal set from "" ALLOWED', true)
    } catch (e) { check('T2 users/memberB heal set from "" ALLOWED', false, e.message) }
  }

  // T3: member with existing code -> overwrite DENIED (immutability preserved)
  console.log('── T3. member with existing code (immutability)')
  {
    const db = memberC.firestore()
    try {
      await assertFails(db.doc('users/memberC').update({ referralCode: 'IP-NEW003' }))
      check('T3 users/memberC code overwrite DENIED', true)
    } catch (e) { check('T3 users/memberC code overwrite DENIED', false, e.message) }
  }

  // T4: valid code + missing mapping -> converge create allowed
  console.log('── T4. valid existing code, missing directory entry')
  {
    const db = ownerD.firestore()
    try {
      await assertSucceeds(db.doc('referralCodes/IP-DDD444').set({ referrerUid: 'ownerD' }, { merge: true }))
      check('T4 referralCodes converge create ALLOWED', true)
    } catch (e) { check('T4 referralCodes converge create ALLOWED', false, e.message) }
  }

  // T5: coded doc, update UNRELATED fields (profile save) -> allowed
  console.log('── T5. profile update on doc WITH a code')
  {
    const db = memberF.firestore()
    try {
      await assertSucceeds(db.doc('users/memberF').update({ name: 'F New Name' }))
      check('T5 users/memberF profile update ALLOWED', true)
    } catch (e) { check('T5 users/memberF profile update ALLOWED', false, e.message) }
    try {
      await assertFails(db.doc('users/memberF').update({ role: 'super_admin' }))
      check('T5b users/memberF role escalation DENIED', true)
    } catch (e) { check('T5b users/memberF role escalation DENIED', false, e.message) }
    try {
      await assertFails(db.doc('users/memberF').update({ gymId: 'otherGym' }))
      check('T5c users/memberF gymId change DENIED', true)
    } catch (e) { check('T5c users/memberF gymId change DENIED', false, e.message) }
  }

  // T6: staff approveUser on legacy doc missing referralCode/referredBy -> allowed
  console.log('── T6. staff approval update on legacy pending doc')
  {
    const db = staff.firestore()
    try {
      await assertSucceeds(db.doc('users/pendingG').update({ role: 'member', approvedAt: new Date() }))
      check('T6 staff approveUser legacy doc ALLOWED', true)
    } catch (e) { check('T6 staff approveUser legacy doc ALLOWED', false, e.message) }
    try {
      await assertSucceeds(db.doc('users/pendingG').update({ role: 'gym_owner' }))
      check('T6b staff role change to gym_owner ALLOWED (approveUser semantics)', true)
    } catch (e) { check('T6b staff role change to gym_owner ALLOWED (approveUser semantics)', false, e.message) }
  }

  await env.cleanup()
  console.log(`\n════ RESULT: ${results.pass} passed, ${results.fail} failed ════`)
  if (results.fail) {
    console.log('FAILURES:')
    results.details.forEach(d => console.log('  ✗ ' + d))
    process.exit(1)
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1) })