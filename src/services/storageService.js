import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024
const MAX_WIDTH = 1024
const MAX_HEIGHT = 1024

function validateImage(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, JPEG, PNG, and WEBP files are accepted.')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('File size must be less than 5MB.')
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

export async function uploadMemberPhoto(file, memberId, onProgress) {
  validateImage(file)
  const compressed = await compressImage(file)

  const storagePath = `members/${memberId}/profile.webp`
  const storageRef = ref(storage, storagePath)
  const uploadTask = uploadBytesResumable(storageRef, compressed)

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        if (onProgress) onProgress(pct)
      },
      (error) => {
        reject(error)
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)
        resolve({ downloadUrl, storagePath })
      }
    )
  })
}

export async function uploadGymLogo(file, onProgress) {
  validateImage(file)
  const compressed = await compressImage(file)

  const storagePath = `settings/gym-logo.webp`
  const storageRef = ref(storage, storagePath)
  const uploadTask = uploadBytesResumable(storageRef, compressed)

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        if (onProgress) onProgress(pct)
      },
      (error) => reject(error),
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)
        resolve({ downloadUrl, storagePath })
      }
    )
  })
}

export async function deleteMemberPhoto(storagePath) {
  if (!storagePath) return
  try {
    const storageRef = ref(storage, storagePath)
    await deleteObject(storageRef)
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      console.error('Failed to delete member photo:', err)
    }
  }
}
