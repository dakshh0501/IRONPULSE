
const STORAGE_BUCKET = 'gym-images'
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024
const MAX_WIDTH = 1024
const MAX_HEIGHT = 1024

let supabaseClientPromise = null
function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('../lib/supabase').then((m) => m.supabase)
  }
  return supabaseClientPromise
}

function toSupabaseStorageError(err) {
  if (!err) return new Error('Storage upload failed.')
  if (err.message && typeof err.message === 'string') {
    return new Error(err.message)
  }
  return new Error('Storage upload failed.')
}

function validateImage(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('Invalid file object.')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, JPEG, PNG, and WEBP files are accepted.')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('File size must be less than 5MB.')
  }
  if (file.size <= 0) {
    throw new Error('File appears to be empty.')
  }
  if (file.name && file.name.length > 200) {
    throw new Error('File name is too long.')
  }
  if (file.name && /[<>:"/\\|?*]/.test(file.name)) {
    throw new Error('File name contains invalid characters.')
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= MAX_WIDTH && height <= MAX_HEIGHT && file.type === 'image/webp') {
        resolve(file)
        return
      }
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width)
        width = MAX_WIDTH
      }
      if (height > MAX_HEIGHT) {
        width = Math.round((width * MAX_HEIGHT) / height)
        height = MAX_HEIGHT
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Image compression failed.'))
          return
        }
        const compressed = new File([blob], file.name, { type: 'image/webp', lastModified: Date.now() })
        resolve(compressed)
      }, 'image/webp', 0.8)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image.'))
    }
    img.src = url
  })
}

async function supabaseUpload(path, file, onProgress) {
  const client = await getSupabaseClient()
  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
  if (error) throw toSupabaseStorageError(error)
  if (onProgress) onProgress(100)
  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return { downloadUrl: data.publicUrl, storagePath: path }
}

export async function uploadMemberPhoto(file, memberId, onProgress) {
  validateImage(file)
  const compressed = await compressImage(file)

  const storagePath = `members/${memberId}/profile.webp`

    return supabaseUpload(storagePath, compressed, onProgress)
}

// gymId is REQUIRED in supabase mode (gym-scoped path `gyms/{gymId}/gym-logo.webp`);
// optional 3rd arg — the firebase rollback branch keeps the legacy global path.
export async function uploadGymLogo(file, onProgress, gymId) {
  validateImage(file)
  const compressed = await compressImage(file)

    if (!gymId) {
      throw new Error('gymId is required to upload a gym logo.')
    }
    const storagePath = `gyms/${gymId}/gym-logo.webp`
    return supabaseUpload(storagePath, compressed, onProgress)
}

export async function deleteMemberPhoto(storagePath) {
  if (!storagePath) return

    try {
      const client = await getSupabaseClient()
      const { error } = await client.storage.from(STORAGE_BUCKET).remove([storagePath])
      if (error) throw error
    } catch (err) {
      const message = (err && err.message) || ''
      if (!/not found/i.test(message) && !(err && String(err.statusCode) === '404')) {
        console.error('Failed to delete member photo:', err)
      }
    }
    return
}
