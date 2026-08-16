# SUPABASE STORAGE MIGRATION — DESIGN

Step 8F — Replace Firebase Storage with Supabase Storage (API-preserving).

## 1. Storage surface audit (STEP 1)

### src/services/storageService.js — the ONLY Firebase Storage module

| Export | Signature | Firebase path | Returns | Callers |
|--------|-----------|---------------|---------|---------|
| `uploadMemberPhoto` | `(file, memberId, onProgress)` | `members/{memberId}/profile.webp` | `{ downloadUrl, storagePath }` | `MemberModal.jsx:104` |
| `uploadGymLogo` | `(file, onProgress)` | `settings/gym-logo.webp` | `{ downloadUrl, storagePath }` | `Settings.jsx:151,590` |
| `deleteMemberPhoto` | `(storagePath)` | any member path | void (tolerates missing) | `firestoreService.js:460,465,2469` (staff cleanup on member add/update/delete) |

- Client-side validation: `validateImage` (jpeg/jpg/png/webp, ≤5 MB, non-empty, safe filename) + `compressImage` (canvas → webp 1024×1024 max, quality 0.8). Both are provider-agnostic and stay.
- Callers consume ONLY `downloadUrl` (persisted to `members.photoUrl` / settings `gym.logoUrl`) and `storagePath` (deletion). URLs are rendered directly in `<img>` (MemberAvatar, logo preview) — permanent, embeddable URLs required.
- Uploads run in staff sessions only (admin creating/editing members; gym admin editing Settings).
- `src/firebase.js:60` exports the shared `storage` instance (also used by nothing else). `deviceService.js` match was only the `getStorageKey` localStorage helper — not Firebase Storage.

### Found bug (documented, fixed by path design)
Firebase path `settings/gym-logo.webp` is NOT gym-scoped — every gym uploads to the same object; gym B's upload silently overwrites gym A's logo file. Supabase design scopes logos per gym (`gyms/{gymId}/gym-logo.webp`).

## 2. Bucket design (STEP 2)

**One bucket: `gym-images`** (public). Minimum consistent with security — both object kinds are avatars/logos displayed to members, non-sensitive.

| Attribute | Value |
|-----------|-------|
| name | `gym-images` |
| public/private | **public** (read) |
| allowed MIME | `image/jpeg`, `image/jpg`, `image/png`, `image/webp` (bucket-level `allowed_mime_types`) |
| max size | 5 MB (bucket-level `file_size_limit`; client enforces the same) |
| path convention | `members/{memberId}/profile.webp`, `gyms/{gymId}/gym-logo.webp` |
| read policy | public (no auth) — matches Firebase `request.auth != null` semantics with simpler surface; images are non-sensitive |
| insert policy | staff only + path scoping (`is_staff(auth.uid())` AND member-in-own-gym / gym-segment==own-gym; super_admin bypass) |
| update policy | same predicate (upsert overwrite of the same path) |
| delete policy | same predicate (staff cleanup only) |

## 3. Path compatibility (STEP 3)

| Firebase path | Supabase path | Note |
|---------------|---------------|------|
| `members/{memberId}/profile.webp` | identical | logical id preserved; `memberId` = `members.id::text` in supabase mode, firestore doc id in firebase mode |
| `settings/gym-logo.webp` | `gyms/{gymId}/gym-logo.webp` | gym-scoped; `uploadGymLogo` signature extended with optional 3rd arg `gymId` (backward-compatible: firebase rollback branch keeps the legacy path) |

URL conversion: Firebase `getDownloadURL` → Supabase public URL `{SUPABASE_URL}/storage/v1/object/public/gym-images/{path}`. Deterministic (no token).

## 4. Security model (STEP 4)

Storage RLS mirrors the tenancy model; helper predicates already exist (`is_staff`, `is_super_admin`, `auth_gym_id` in 0001).

Policy predicate helper (0005 migration):

```
storage_gym_image_allowed(name) =
  path[1]='members' AND (super OR member-with-that-id in caller's gym)
  OR path[1]='gyms'  AND (super OR path[2] = caller's gym_id)
```

- gym-scoped objects → path join on `members`/`auth_gym_id` ✓
- user-owned objects → member photo uploads only by staff of that member's gym ✓
- super_admin exceptions → explicit bypass ✓
- No service-role credentials in browser — client uses the publishable client (same `src/lib/supabase.js` instance as the data plane).

## 5. URL semantics (STEP 6)

**Permanent public URL** (public bucket). Rationale:

- Callers persist the URL in Postgres docs and render it in `<img>` — a signed URL would expire (7d default) and break stored avatars/logos; authenticated download would require fetch+blob plumbing in every `<img>`.
- Images are non-sensitive avatars/logos; the Firebase default was equally public (any authed read).
- Trade-off accepted: object deletion does not invalidate the URL (404 at render time) — same as the Firebase token URL being revoked on delete.

Behavior differences vs Firebase (documented for the report):

| Aspect | Firebase | Supabase |
|--------|----------|----------|
| progress events | resumable, streamed | none (single-shot) — `onProgress` fires 0→100 at completion |
| getDownloadURL on missing object | fails | public URL always constructs (404 only at render) |
| overwrite same path | silent replace | `upsert: true` silent replace (same) |
| upload auth | any authed | staff-only, gym-scoped |
| delete auth | any authed | staff-only, gym-scoped |

## 6. Rollback

`IS_FIREBASE_MODE` build-time constant (same foldable pattern as the data plane): `(import.meta.env.VITE_AUTH_PROVIDER || 'supabase') === 'firebase'`. Firebase branches keep the exact legacy implementation and paths. Supabase build dead-code-eliminates all Firebase Storage imports (lazy `getStorage` side effects avoided via existing shared `storage` export — rollback-only).

## 7. Migration of existing files (STEP 7)

No auto-move. `scripts/migration/storage_inventory.js` (read-only) inventories the Firebase bucket; see `docs/FIREBASE_STORAGE_INVENTORY.md`. Existing Firebase URLs in old rows keep working while Firebase storage stays enabled (rollback window); new uploads land in Supabase.

## 8. Deployment

- `supabase db push` applies `0005_storage.sql` (bucket + policies).
- Client-only hosting deploy for the new bundle.
- No Cloud Functions, no payments/webhook changes (out of scope).
