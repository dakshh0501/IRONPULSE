// Micro-probe: isolate referral read-rule evaluation errors
'use strict'
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing')
const PROJECT_ID = 'demo-ironpulse'

async function main() {
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID })
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await db.doc('users/memberR').set({ uid: 'memberR', role: 'member', gymId: 'gym1', referralCode: 'IP-MMM111' })
    await db.doc('members/memberR').set({ authUid: 'memberR', gymId: 'gym1' })
    await db.doc('users/gymAdmin').set({ uid: 'gymAdmin', role: 'gym_admin', gymId: 'gym1' })
    await db.doc('users/super').set({ uid: 'super', role: 'super_admin' })
    await db.doc('referrals/exists1').set({ referrerUid: 'memberR', referredUid: 'otherU', gymId: 'gym1', status: 'Pending' })
    await db.doc('licensedDevices/dev1').set({ gymId: 'gym1', status: 'active' })
  })

  const member = env.authenticatedContext('memberR')
  const admin = env.authenticatedContext('gymAdmin')
  const superCtx = env.authenticatedContext('super')
  const noUser = env.authenticatedContext('noUserDoc')

  async function probe(name, fn) {
    try { await assertSucceeds(fn()); console.log('PASS  ', name) }
    catch (e) { console.log('FAIL  ', name, '→', e.message.split('\n')[0].slice(0, 150)) }
  }
  async function probeFail(name, fn) {
    try { await assertFails(fn()); console.log('PASS  ', name + ' (denied as expected)') }
    catch (e) { console.log('FAIL  ', name, '→', e.message.split('\n')[0].slice(0, 150)) }
  }

  console.log('── sanity: isSuperAdmin chain on OTHER collections')
  await probe('admin reads licensedDevices (isSuperAdmin||isGymAdmin) — sanity', () => admin.firestore().doc('licensedDevices/dev1').get())
  await probe('super reads referrals (isSuperAdmin first branch)', () => superCtx.firestore().doc('referrals/exists1').get())

  console.log('── referrals read variants')
  await probe('member reads EXISTING referrals/{own-uid-otheruser}', () => member.firestore().doc('referrals/exists1').get())
  await probe('member reads MISSING referrals/ownUid (81H probe)', () => member.firestore().doc('referrals/memberR').get())
  await probe('admin reads missing referrals (isGymAdmin branch null-guard)', () => admin.firestore().doc('referrals/gymAdmin').get())
  await probeFail('admin reads OTHER gym referral — should DENY (null resource)', () => admin.firestore().doc('referrals/noSuch').get())

  console.log('── member without users doc')
  await probeFail('noUserDoc reads referrals (no users doc — isMember false → deny)', () => noUser.firestore().doc('referrals/noUserDoc').get())

  await env.cleanup()
}
main().catch(e => { console.error('PROBE ERROR:', e); process.exit(2) })