const CACHE = 'ironpulse-v1'
const ASSETS = ['/']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => {
        // Best-effort cache of video assets — don't block install on failure
        caches.open(CACHE).then((c) => {
          c.add('/videos/Startup.mp4').catch(() => {})
          c.add('/videos/Loading.gif').catch(() => {})
        })
      })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
      self.registration?.navigationPreload?.enable(),
    ])
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    (async () => {
      const preload = e.request.mode === 'navigate' ? await e.preloadResponse : null
      if (preload) {
        return preload
      }
      try {
        const res = await fetch(e.request)
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, clone))
        return res
      } catch {
        return caches.match(e.request)
      }
    })()
  )
})
