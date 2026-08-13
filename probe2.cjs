// Probe 2 — raw error classification
'use strict'
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing')
const PROJECT_ID = 'demo-ironpulse'

async function main() {
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID })
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await db.doc('users/memberR').set({ uid: 'memberR', role: 'member', gymId: 'gym1' })
    await db.doc('users/gymAdmin').set({ uid: 'gymAdmin', role: 'gym_admin', gymId: 'gym1' })
  })
  const member = env.authenticatedContext('memberR')
  const admin = env.authenticatedContext('gymAdmin')
  const noUser = env.authenticatedContext('noUserDoc')

  async function classify(name, fn) {
    try {
      await fn()
      console.log('ALLOWED  ', name)
    } catch (e) {
      const m = e.code + ' | ' + (e.message || '').replace(/\s+/g, ' ').slice(0, 220)
      console.log('DENIED/ERR', name, '→', m)
    }
  }

  await classify('member WITH users doc reads missing referrals/self (81H probe)', () => member.firestore().doc('referrals/memberR').get())
  await classify('member WITHOUT users doc reads missing referrals/self', () => noUser.firestore().doc('referrals/noUserDoc').get())
  await classify('gym_admin reads missing referrals doc', () => admin.firestore().doc('referrals/someMissing').get())
  await classify('gym_admin reads users/{own} (sanity: isAdminOrOwner read rule OK)', () => admin.firestore().doc('users/gymAdmin').get())

  await env.cleanup()
}
main().catch(e => { console.error('PROBE ERROR:', e); process.exit(2) })