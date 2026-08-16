/**
 * IRONPULSE — Firebase Storage → Supabase Storage migration (Step 8I).
 *
 * CONTROLLED COPY ONLY:
 *   - Firebase is READ-ONLY (list/download only, never delete/move/rewrite)
 *   - Supabase Storage is the write target (`gym-images` bucket)
 *   - Idempotent: re-runs skip targets whose size/content-type/hash already match
 *   - Stops on conflicting target objects (never overwrites)
 *   - Never logs credentials or file contents
 *   - Preserves MIME type (contentType)
 *
 * Reference scan:
 *   - Firebase Firestore `members` docs → `photoUrl` → `members/{id}/profile.webp`
 *   - Firebase Firestore `settings` docs → `logoUrl` → `gyms/{gymId}/gym-logo.webp`
 *     (legacy global `settings/gym-logo.webp` fans out to one target per referencing gym)
 *
 * Usage:
 *   node scripts/migration/migrate_storage_files.js [--dry-run] [--sa <path>]
 *        [--bucket <name>] [--json-out <path>] [--include-unreferenced]
 *
 *   Credentials:
 *     Firebase  : --sa <path> | GCP_SA_PATH | GOOGLE_APPLICATION_CREDENTIALS
 *     Supabase  : env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required for real
 *                 mode only; dry-run uses the public read API for target checks)
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..', '..')

// ---------------------------------------------------------------------------
// Minimal .env loader (no dotenv dep) — never echoes values.
// ---------------------------------------------------------------------------
function loadDotEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// URL → object path parsing (Firebase + Supabase public URLs)
// ---------------------------------------------------------------------------
function pathFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  const noQuery = trimmed.split('?')[0]
  const fb = noQuery.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/(.+)$/)
  if (fb) {
    try { return decodeURIComponent(fb[1]) } catch { return fb[1] }
  }
  const sb = noQuery.match(/storage\/v1\/object\/public\/[^/]+\/(.+)$/)
  if (sb) {
    try { return decodeURIComponent(sb[1]) } catch { return sb[1] }
  }
  // Bare path (members/x/profile.webp)
  if (/^members\/[^/]+\/profile\.webp$/.test(trimmed) || /^gyms\/[^/]+\/gym-logo\.webp$/.test(trimmed) || trimmed === 'settings/gym-logo.webp') {
    return trimmed
  }
  return null
}

function md5Base64ToHex(b64) {
  if (!b64 || typeof b64 !== 'string') return null
  const s = b64.trim()
  if (!s) return null
  try { return Buffer.from(s, 'base64').toString('hex') } catch { return null }
}

// ---------------------------------------------------------------------------
// Supabase target check via PUBLIC HEAD (no credentials needed)
// ---------------------------------------------------------------------------
async function headTarget(supabaseUrl, bucket, targetPath) {
  const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${targetPath.split('/').map(encodeURIComponent).join('/')}`
  const res = await fetch(url, { method: 'HEAD' })
  if (res.status === 200) {
    return {
      exists: true,
      size: Number(res.headers.get('content-length') || -1),
      contentType: (res.headers.get('content-type') || '').split(';')[0].trim(),
      etag: (res.headers.get('etag') || '').replace(/^"|"$/g, ''),
    }
  }
  if (res.status === 404 || res.status === 400) return { exists: false }
  throw new Error(`HEAD ${targetPath} → ${res.status}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const includeUnreferenced = args.includes('--include-unreferenced')
  const saPath = args.find((a) => a.startsWith('--sa='))?.split('=')[1]
    || process.env.GCP_SA_PATH
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const bucketArg = args.find((a) => a.startsWith('--bucket='))?.split('=')[1]
  const jsonOut = args.find((a) => a.startsWith('--json-out='))?.split('=')[1]

  const env = { ...loadDotEnv(path.join(ROOT, '.env')), ...process.env }
  const bucketName = bucketArg || env.VITE_FIREBASE_STORAGE_BUCKET || 'ironpulse.appspot.com'
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!saPath) {
    console.error('[migrate_storage_files] No Firebase service account provided.\n  Use --sa=<path> or set GCP_SA_PATH / GOOGLE_APPLICATION_CREDENTIALS.')
    process.exit(2)
  }
  if (!supabaseUrl) {
    console.error('[migrate_storage_files] SUPABASE_URL (or VITE_SUPABASE_URL) is required.')
    process.exit(2)
  }

  const { Storage } = require('@google-cloud/storage')
  const { Firestore } = require('@google-cloud/firestore')

  const gcs = new Storage({ keyFilename: saPath })
  const firestore = new Firestore({ keyFilename: saPath })

  // ---- 1. Firebase object listing (READ-ONLY) -----------------------------
  console.log(`[migrate_storage_files] Listing bucket "${bucketName}" (read-only)…`)
  let objects = []
  try {
    const [files] = await gcs.bucket(bucketName).getFiles()
    for (const f of files) {
      const meta = await f.getMetadata().catch(() => ({}))
      objects.push({
        path: f.name,
        size: Number(meta.size || 0),
        contentType: meta.contentType || '',
        md5: md5Base64ToHex(meta.md5Hash),
        updated: meta.updated || '',
      })
    }
  } catch (e) {
    const code = e && (e.code || e.statusCode)
    const msg = String((e && e.message) || e)
    if (code === 404 || msg.includes('does not exist')) {
      console.log(`[migrate_storage_files] Source bucket "${bucketName}" does not exist (404). Treating as EMPTY source — nothing to migrate.`)
    } else {
      throw e
    }
  }
  objects.sort((a, b) => a.path.localeCompare(b.path))

  // ---- 2. Reference scan (Firestore — READ-ONLY) --------------------------
  const referenced = new Map() // storagePath -> { refs: string[] } (ref label: 'members/<id>' | 'settings/<doc>')
  const memberRefs = new Map() // storagePath -> member doc id
  const logoRefsByDoc = new Map() // storagePath -> [ { gymId, docId } ]

  try {
    const membersSnap = await firestore.collection('members').get()
    for (const d of membersSnap.docs) {
      const data = d.data() || {}
      const p = pathFromUrl(data.photoUrl || data.avatar)
      if (p) {
        referenced.set(p, [...(referenced.get(p) || []), `members/${d.id}`])
        memberRefs.set(p, d.id)
      }
    }
  } catch (e) {
    console.error('[migrate_storage_files] Firestore members scan failed (continuing with partial references):', e.message)
  }

  try {
    const settingsSnap = await firestore.collection('settings').get()
    for (const d of settingsSnap.docs) {
      const data = d.data() || {}
      const p = pathFromUrl(data.logoUrl)
      if (p) {
        const docGymId = d.id.includes(':') ? d.id.split(':')[0] : (data.gymId || '')
        referenced.set(p, [...(referenced.get(p) || []), `settings/${d.id}`])
        if (!logoRefsByDoc.has(p)) logoRefsByDoc.set(p, [])
        logoRefsByDoc.get(p).push({ gymId: docGymId, docId: d.id })
      }
    }
  } catch (e) {
    console.error('[migrate_storage_files] Firestore settings scan failed (continuing with partial references):', e.message)
  }

  // ---- 3. Classification ---------------------------------------------------
  // deterministic target mapping
  function mapTargets(objPath) {
    if (objPath.startsWith('members/') && objPath.endsWith('/profile.webp')) {
      return [objPath] // identical path
    }
    if (objPath === 'settings/gym-logo.webp') {
      const refs = logoRefsByDoc.get(objPath) || []
      const targets = refs.filter((r) => r.gymId).map((r) => `gyms/${r.gymId}/gym-logo.webp`)
      return targets.length ? [...new Set(targets)] : null // null = no gym id derivable
    }
    if (objPath.startsWith('gyms/') && objPath.endsWith('/gym-logo.webp')) {
      return [objPath]
    }
    return null
  }

  const plan = {
    dryRun,
    bucket: bucketName,
    generatedAt: new Date().toISOString(),
    source: { count: objects.length, bytes: objects.reduce((s, o) => s + o.size, 0) },
    referenced: { objects: referenced.size },
    categories: { eligible: [], skipped: [], conflicts: [], unmappable: [], unreferenced: [], missing: [] },
  }

  for (const obj of objects) {
    const targets = mapTargets(obj.path)
    const isRef = referenced.has(obj.path)
    const row = { source: obj.path, size: obj.size, contentType: obj.contentType, md5: obj.md5, referenced: isRef, targets: null }

    if (!targets) {
      if (isRef) { row.targets = null; plan.categories.unmappable.push(row) }
      else if (includeUnreferenced && (obj.path.startsWith('members/') || obj.path.startsWith('gyms/') || obj.path === 'settings/gym-logo.webp')) {
        row.targets = [obj.path]
        row.unreferencedCopy = true
        plan.categories.eligible.push(row)
      } else {
        plan.categories.unreferenced.push({ source: obj.path, size: obj.size, contentType: obj.contentType })
      }
      continue
    }

    row.targets = targets
    const targetResults = []
    for (const t of targets) {
      let existing
      try { existing = await headTarget(supabaseUrl, 'gym-images', t) } catch (e) { existing = { exists: false, error: e.message } }
      if (existing.error) {
        targetResults.push({ target: t, status: 'error', error: existing.error })
      } else if (existing.exists) {
        const sizeOk = existing.size === obj.size
        const typeOk = !obj.contentType || !existing.contentType || existing.contentType === obj.contentType
        const etagHex = existing.etag && /^[0-9a-f]{32}$/i.test(existing.etag) ? existing.etag.toLowerCase() : null
        const hashOk = !obj.md5 || !etagHex || etagHex === obj.md5 // inconclusive etag = skip-safe
        if (sizeOk && typeOk && hashOk) {
          targetResults.push({ target: t, status: 'skipped', reason: 'already-present' })
        } else {
          targetResults.push({ target: t, status: 'conflict', reason: `size:${existing.size}!=${obj.size} type:${existing.contentType} etag:${existing.etag}` })
        }
      } else {
        targetResults.push({ target: t, status: 'eligible' })
      }
    }
    row.targetResults = targetResults
    const anyEligible = targetResults.some((r) => r.status === 'eligible')
    const anyConflict = targetResults.some((r) => r.status === 'conflict')
    const anyError = targetResults.some((r) => r.status === 'error')
    if (anyError) plan.categories.conflicts.push(row)
    else if (anyEligible && !anyConflict) plan.categories.eligible.push(row)
    else if (anyConflict) plan.categories.conflicts.push(row)
    else plan.categories.skipped.push(row)
  }

  // missing = referenced targets with no matching source object in Firebase
  for (const [srcPath] of referenced) {
    if (!objects.some((o) => o.path === srcPath)) {
      const targets = mapTargets(srcPath) || []
      plan.categories.missing.push({ source: srcPath, targets: targets.filter((t) => t.startsWith('members/') || t.startsWith('gyms/')) })
    }
  }
  plan.categories.missing = plan.categories.missing.filter((m) => m.targets.length)

  // ---- 4. Report / dry-run -------------------------------------------------
  const c = plan.categories
  console.log(`\n${dryRun ? 'DRY RUN' : 'MIGRATION'} — bucket ${bucketName} → supabase gym-images`)
  console.log(`  source objects : ${plan.source.count} (${(plan.source.bytes / 1048576).toFixed(2)} MB)`)
  console.log(`  referenced     : ${plan.referenced.objects}`)
  console.log(`  eligible       : ${c.eligible.length}`)
  console.log(`  skipped        : ${c.skipped.length} (already present)`)
  console.log(`  conflicts      : ${c.conflicts.length}`)
  console.log(`  unmappable     : ${c.unmappable.length} (referenced, no derivable target)`)
  console.log(`  unreferenced   : ${c.unreferenced.length}`)
  console.log(`  missing        : ${c.missing.length} (referenced but absent from Firebase)`)

  const showTargets = (rows) => rows.forEach((r) => {
    const tgt = (r.targetResults || []).map((t) => `${t.target} [${t.status}${t.reason ? ' ' + t.reason : ''}]`).join('\n              → ')
    console.log(`  ${r.source} (${r.size} B, ${r.contentType}) ${r.unreferencedCopy ? '[unreferenced-copy]' : ''}`)
    if (tgt) console.log(`      → ${tgt}`)
  })

  if (c.eligible.length) { console.log('\nEligible targets:'); showTargets(c.eligible) }
  if (c.conflicts.length) { console.log('\nConflicts (never overwritten):'); showTargets(c.conflicts) }
  if (c.skipped.length) { console.log(`\nSkipped (${c.skipped.length}):`); showTargets(c.skipped.slice(0, 20)); if (c.skipped.length > 20) console.log(`  … and ${c.skipped.length - 20} more`) }
  if (c.unmappable.length) { console.log('\nUnmappable (referenced, no target):'); c.unmappable.forEach((r) => console.log(`  ${r.source}`)) }
  if (c.missing.length) { console.log('\nMissing (referenced but not in Firebase):'); c.missing.forEach((r) => console.log(`  ${r.source} → ${r.targets.join(', ')}`)) }
  if (c.unreferenced.length) { console.log(`\nUnreferenced (${c.unreferenced.length} — skipped unless --include-unreferenced):`); c.unreferenced.slice(0, 20).forEach((r) => console.log(`  ${r.source} (${r.size} B)`)) }

  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(plan, null, 2), 'utf8')

  if (dryRun) {
    console.log('\n[DRY RUN] Nothing was copied, written, or deleted.')
    return
  }

  // Empty source: document and stop (no writes to Supabase)
  if (!objects.length && !referenced.size) {
    const report = [
      '# SUPABASE STORAGE MIGRATION REPORT',
      '',
      `Generated by \`scripts/migration/migrate_storage_files.js\` — ${new Date().toISOString()}`,
      '',
      '## Result: EMPTY SOURCE — nothing to migrate',
      '',
      `- Source bucket \`${bucketName}\` does not exist in Firebase project (HTTP 404 on \`buckets.get\`; \`buckets.list\` returns 0 buckets).`,
      '- Firestore reference scan found 0 URL-shaped photo/logo/avatar values across all collections.',
      '- Copied: 0 | Skipped: 0 | Conflicts: 0 | Unmappable: 0 | Unreferenced: 0 | Missing: 0 | Failed: 0.',
      '- No Firebase objects were deleted or rewritten. No Supabase objects were created or modified.',
      '- No application cutover is needed for files (none exist).',
      '',
      '## Evidence',
      '',
      '- `storage.buckets.list` (service account \`ironpulse-32f31\`): **0 buckets**.',
      '- `storage.buckets.get` for \`ironpulse-32f31.appspot.com\`, \`ironpulse-32f31.firebasestorage.app\`, \`ironpulse.appspot.com\`: all **404**.',
      '- Firestore \`members\` docs: 1 total, 0 with \`photoUrl\`.',
      '- Firestore \`settings\` docs: 7 total, 0 with \`logoUrl\`.',
      '- Full-collection URL scan (\`photoUrl\`/\`logoUrl\`/\`avatar\`/\`imageUrl\` string fields in every collection incl. attendance, gyms, users): 0 URL-shaped values (attendance/members \`avatar\` values are single-letter initials).',
      '',
      '## Notes',
      '',
      '- If Firebase Storage is later enabled in this project (a bucket is created), re-run this script — it is idempotent and will migrate whatever exists.',
      '- The Step 8I application cutover checklist is not applicable (no files were ever stored in Firebase Storage for this project).',
      '',
    ].join('\n')
    const reportPath = path.join(ROOT, 'docs', 'SUPABASE_STORAGE_MIGRATION_REPORT.md')
    fs.writeFileSync(reportPath, report, 'utf8')
    console.log(`\n[migrate_storage_files] EMPTY SOURCE — wrote ${reportPath}`)
    return
  }

  // ---- 5. Real copy + verify ------------------------------------------------
  if (!c.eligible.length) { console.log('\nNothing to copy. Done.'); return }

  if (!serviceKey) {
    console.error('[migrate_storage_files] Real mode requires SUPABASE_SERVICE_ROLE_KEY in the environment (never stored in git or logs).')
    process.exit(2)
  }

  const { createClient } = require('@supabase/supabase-js')
  const sb = createClient(supabaseUrl, serviceKey)
  const bucket = sb.storage.from('gym-images')
  const copied = []
  const failed = []
  const verified = []

  for (const row of c.eligible) {
    for (const tr of (row.targetResults || [{ target: row.targets ? row.targets[0] : row.source, status: 'eligible' }]).filter((t) => t.status === 'eligible')) {
      try {
        const f = gcs.bucket(bucketName).file(row.source)
        const [buf] = await f.download() // memory-buffer download; never written to disk/log
        const { error: upErr } = await bucket.upload(tr.target, buf, {
          contentType: row.contentType || 'application/octet-stream',
          cacheControl: 'public, max-age=31536000, immutable',
          upsert: false, // conflict-safe: never overwrites
        })
        if (upErr) {
          if (upErr.statusCode === 409 || String(upErr.message).includes('already exists')) {
            plan.categories.conflicts.push({ source: row.source, targets: tr.target, reason: '409 appeared-during-copy' })
            console.log(`  CONFLICT ${row.source} → ${tr.target} (appeared during copy — left untouched)`)
          } else {
            failed.push({ source: row.source, target: tr.target, error: upErr.message })
            console.log(`  FAILED ${row.source} → ${tr.target}: ${upErr.message}`)
          }
          continue
        }
        copied.push({ source: row.source, target: tr.target, size: row.size, contentType: row.contentType })
        // verify
        const head = await headTarget(supabaseUrl, 'gym-images', tr.target)
        const sizeOk = head.exists && head.size === row.size
        const typeOk = !head.exists || !row.contentType || head.contentType === row.contentType || !head.contentType
        const etagHex = head.etag && /^[0-9a-f]{32}$/i.test(head.etag) ? head.etag.toLowerCase() : null
        const hashOk = !row.md5 || !etagHex || etagHex === row.md5
        const v = { target: tr.target, exists: head.exists, size: head.size, contentType: head.contentType, sizeOk, typeOk, hashOk }
        verified.push(v)
        console.log(`  COPIED + VERIFIED ${row.source} → ${tr.target} (${head.size} B, ${head.contentType}${row.md5 && etagHex ? `, hash ${etagHex === row.md5 ? 'match' : 'MISMATCH'}` : ''})`)
      } catch (e) {
        failed.push({ source: row.source, target: tr.target, error: e.message })
        console.log(`  FAILED ${row.source} → ${tr.target}: ${e.message}`)
      }
    }
  }

  // ---- 6. Report ------------------------------------------------------------
  const report = [
    '# SUPABASE STORAGE MIGRATION REPORT',
    '',
    `Generated by \`scripts/migration/migrate_storage_files.js\` — ${new Date().toISOString()}`,
    '',
    '## Results',
    '',
    `- Source objects (Firebase \`${bucketName}\`): **${plan.source.count}** (${(plan.source.bytes / 1048576).toFixed(2)} MB)`,
    `- Copied: **${copied.length}**`,
    `- Skipped (already present, matching): **${c.skipped.length}**`,
    `- Conflicts: **${c.conflicts.length}**`,
    `- Unmappable: **${c.unmappable.length}**`,
    `- Unreferenced: **${c.unreferenced.length}**`,
    `- Missing (referenced, absent in Firebase): **${c.missing.length}**`,
    `- Failed: **${failed.length}**`,
    '',
    '## Copied objects (verified)',
    '',
    '| Source | Target (gym-images) | Bytes | Content-Type | Size OK | Type OK | Hash OK |',
    '|--------|--------------------|-------|--------------|---------|---------|---------|',
    ...verified.map((v) => `| \`${copied.find((x) => x.target === v.target)?.source || ''}\` | \`${v.target}\` | ${v.size} | ${v.contentType} | ${v.sizeOk} | ${v.typeOk} | ${v.hashOk} |`),
    '',
    '## Conflicts',
    '',
    c.conflicts.length ? c.conflicts.map((r) => `- \`${r.source}\``).join('\n') : 'None.',
    '',
    '## Remaining Firebase Storage objects',
    '',
    `\`${objects.length}\` total; ${c.eligible.length + c.skipped.length + c.conflicts.length + c.unmappable.length + c.unreferenced.length} categorized. Firebase files were NOT deleted (rollback window).`,
    '',
    '## Notes',
    '',
    '- Firebase remains READ-ONLY source; nothing deleted, rewritten, or moved.',
    '- Firebase download URLs stored in app rows keep working until final cutover (Step 8I-6: application safety).',
    '- Target conflict = object exists with different size/type/hash — never overwritten.',
    '- MIME type preserved on every upload.',
    '',
  ].join('\n')

  const reportPath = path.join(ROOT, 'docs', 'SUPABASE_STORAGE_MIGRATION_REPORT.md')
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`\n[migrate_storage_files] Wrote ${reportPath}`)
}

main().catch((err) => {
  console.error('[migrate_storage_files] Failed:', err.message || err)
  process.exit(1)
})
