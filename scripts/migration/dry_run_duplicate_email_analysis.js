// ============================================================================
// IRONPULSE — Step 6B: DUPLICATE EMAIL GROUP ANALYSIS (READ-ONLY)
// ----------------------------------------------------------------------------
// Identifies the duplicate-email groups among the 35 approved users and
// reports ONLY non-sensitive metadata per user:
//   - firebase uid (first 8 chars), role, gym_id (+ gym existence/status),
//   - account_disabled, presence-field inventory (no values),
//   - related member/trainer records (counts), created timestamp.
// Never prints/exported: emails (masked only), names, phones, password
// material, tokens, secrets.
// Performs ZERO writes: no Auth API calls, no Firebase writes, no Supabase.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'migration-output', 'summaries');

if (process.env.FIREBASE_EMULATOR) {
  console.error('REFUSING TO RUN: FIREBASE_EMULATOR set. Must read production project.');
  process.exit(3);
}

function loadToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN) return process.env.FIREBASE_ACCESS_TOKEN;
  if (process.env.FIREBASE_TOKEN) return process.env.FIREBASE_TOKEN;
  const cfg = JSON.parse(readFileSync(join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
  return cfg.tokens && cfg.tokens.refresh_token;
}

async function getAccessToken() {
  const candidate = loadToken();
  if (candidate.startsWith('ya29.')) return candidate;
  const form = new URLSearchParams();
  form.set('refresh_token', candidate);
  form.set('client_id', '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com');
  form.set('client_secret', 'j9iVZfS8kkCEFUPaAeJV0sAi');
  form.set('grant_type', 'refresh_token');
  const res = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`token exchange failed: ${res.status}`);
  return body.access_token;
}

function convValue(f) {
  if (f == null) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('referenceValue' in f) return f.referenceValue;
  if ('arrayValue' in f) return (f.arrayValue?.values || []).map(convValue);
  if ('mapValue' in f) return convFields(f.mapValue?.fields || {});
  if ('bytesValue' in f) return '<bytes>';
  return '<unknown>';
}
function convFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = convValue(v);
  return out;
}

async function listDocs(access, project, col) {
  const out = [];
  let token = '';
  for (let i = 0; i < 100; i++) {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${col}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
    const body = await res.json();
    if (body.error) throw new Error(`${col}: ${body.error.code} ${body.error.message}`);
    for (const d of body.documents || []) out.push({ id: d.name.split('/').pop(), fields: convFields(d.fields) });
    token = body.nextPageToken;
    if (!token) break;
  }
  return out;
}

function maskEmail(e) {
  if (e == null || typeof e !== 'string') return '(missing)';
  const at = e.indexOf('@');
  if (at <= 0) return '(invalid)';
  return `${e[0]}***${e.slice(at)}`;
}

async function main() {
  const project = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : 'ironpulse-32f31';
  const access = await getAccessToken();
  console.log(`[dup-analysis] project=${project} — READ-ONLY`);

  const [users, members, trainers, gyms] = await Promise.all([
    listDocs(access, project, 'users'),
    listDocs(access, project, 'members'),
    listDocs(access, project, 'trainers'),
    listDocs(access, project, 'gyms'),
  ]);

  const gymsById = new Map(gyms.map((g) => [g.id, g]));
  const ownerGymsByUid = new Map();
  for (const g of gyms) {
    if (g.fields.ownerUid == null) continue;
    const k = String(g.fields.ownerUid);
    ownerGymsByUid.set(k, [...(ownerGymsByUid.get(k) || []), g]);
  }
  const membersByAuth = new Map();
  for (const m of members) {
    const au = m.fields.authUid != null ? String(m.fields.authUid) : null;
    if (!au) continue;
    membersByAuth.set(au, (membersByAuth.get(au) || 0) + 1);
  }
  const trainersByAuth = new Map();
  for (const t of trainers) {
    const au = t.fields.authUid != null ? String(t.fields.authUid) : null;
    if (!au) continue;
    trainersByAuth.set(au, (trainersByAuth.get(au) || 0) + 1);
  }

  const allUsers = [];
  for (const u of users) {
    const f = u.fields;
    const emailRaw = f.email != null ? String(f.email).trim() : '';
    const keys = new Set(Object.keys(f));
    allUsers.push({
      uid: u.id,
      email: emailRaw.toLowerCase(),
      emailRaw,
      role: f.role != null ? String(f.role) : null,
      gymId: f.gymId != null ? String(f.gymId) : null,
      accountDisabled: f.accountDisabled === true,
      createdAt: f.createdAt != null ? String(f.createdAt) : null,
      fieldInventory: {
        email: keys.has('email'), role: keys.has('role'), gymId: keys.has('gymId'),
        name: keys.has('name') || keys.has('displayName') || keys.has('memberName'),
        phone: keys.has('phone') || keys.has('mobile') || keys.has('phoneNumber'),
        createdAt: keys.has('createdAt'), accountDisabled: keys.has('accountDisabled'),
        referralCode: keys.has('referralCode'), referredBy: keys.has('referredBy'),
        approved: keys.has('approved') || keys.has('approvalStatus'),
        extra: [...keys].filter((k) => !['email', 'role', 'gymId', 'name', 'displayName', 'memberName', 'phone', 'mobile', 'phoneNumber', 'createdAt', 'accountDisabled', 'referralCode', 'referredBy', 'approved', 'approvalStatus'].includes(k)),
      },
    });
  }

  // duplicate groups (exact normalized email, count >= 2)
  const byEmail = new Map();
  for (const u of allUsers) {
    if (!u.email) continue;
    byEmail.set(u.email, [...(byEmail.get(u.email) || []), u]);
  }
  const groups = [...byEmail.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);

  const report = {
    project,
    generatedAt: new Date().toISOString(),
    mode: 'READ-ONLY ANALYSIS — ZERO AUTH USERS / ZERO WRITES',
    totalApprovedUsers: allUsers.length,
    groupCount: groups.length,
    groups: groups.map((g) => ({
      size: g.length,
      emailMasked: maskEmail(g[0].emailRaw),
      users: g.map((u) => {
        const gym = u.gymId ? gymsById.get(u.gymId) : null;
        const ownerGyms = ownerGymsByUid.get(u.uid) || [];
        return {
          uid: u.uid.slice(0, 8),
          role: u.role,
          gymId: u.gymId || null,
          gymExists: u.gymId ? gymsById.has(u.gymId) : false,
          gymStatus: gym ? (gym.fields.approvalStatus != null ? String(gym.fields.approvalStatus) : (gym.fields.status != null ? String(gym.fields.status) : 'unknown')) : null,
          ownerGymCount: ownerGyms.length,
          ownerGymIds: ownerGyms.map((g) => g.id.slice(0, 12)),
          ownerGymStatuses: ownerGyms.map((g) => (g.fields.approvalStatus != null ? String(g.fields.approvalStatus) : (g.fields.status != null ? String(g.fields.status) : 'unknown'))),
          accountDisabled: u.accountDisabled,
          members: membersByAuth.get(u.uid) || 0,
          trainers: trainersByAuth.get(u.uid) || 0,
          createdAt: u.createdAt || null,
          fieldInventory: u.fieldInventory,
        };
      }),
    })),
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'duplicate-email-analysis.json'), JSON.stringify(report, null, 2));

  for (const g of report.groups) {
    console.log(`\nGROUP size=${g.size} email=${g.emailMasked}`);
    for (const u of g.users) {
      console.log(`  ${u.uid} role=${u.role} disabled=${u.accountDisabled} gym=${u.gymId ? `${u.gymId.slice(0, 12)}(${u.gymExists ? u.gymStatus : 'MISSING'})` : 'NULL'} ownerGyms=${u.ownerGymCount}[${u.ownerGymStatuses.join(',')}] members=${u.members} trainers=${u.trainers} created=${u.createdAt ? u.createdAt.slice(0, 10) : '?'} fields=[${Object.entries(u.fieldInventory).filter(([, v]) => v).map(([k]) => k).join(',')}]`);
    }
  }
  console.log(`\nartifact: ${join(OUT, 'duplicate-email-analysis.json')}`);
  console.log('ZERO AUTH USERS CREATED. ZERO FIREBASE WRITES. ZERO SUPABASE CALLS.');
}

main().catch((e) => {
  console.error(`FATAL: ${e?.message || e}`);
  process.exit(1);
});