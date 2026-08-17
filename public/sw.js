const CACHE = 'ironpulse-v3'
const STATIC_CACHE = 'ironpulse-static-v3'
const SHELL_URLS = ['/']

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(SHELL_URLS).catch(() => {})
      const staticCache = await caches.open(STATIC_CACHE)
      await staticCache.add('/index.html').catch(() => {})
      try {
        const assetsCache = await caches.open(CACHE)
        await assetsCache.add('/videos/Startup.mp4').catch(() => {})
        await assetsCache.add('/videos/Loading.gif').catch(() => {})
      } catch {}
    })()
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
      if (self.registration?.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable()
        } catch {}
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (isLocalhost && /^\/(src|@vite|@fs|node_modules)\//.test(url.pathname)) {
    return
  }
  const isNavigation = e.request.mode === 'navigate'
  const isStatic = /\.(js|jsx|ts|tsx|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|avif|mp4|webm)$/i.test(url.pathname)
  const isFirestore = /firestore|firebaseio|googleapis/.test(url.hostname)

  if (isStatic) {
    e.respondWith(cacheFirst(e.request))
  } else if (isNavigation) {
    e.respondWith(navStrategy(e))
  } else if (isFirestore) {
    e.respondWith(networkOnly(e))
  } else {
    e.respondWith(networkFirst(e.request))
  }
})

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    return caches.match(req)
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(req)
    return cached || new Response('Offline', { status: 503 })
  }
}

async function navStrategy(e) {
  try {
    let preload
    try { preload = await e.preloadResponse } catch {}
    if (preload) return preload
    const res = await fetch(e.request)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(e.request, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(e.request)
    if (cached) return cached
    const fallback = await caches.match('/')
    return fallback || new Response('Offline', { status: 503 })
  }
}

async function networkOnly(e) {
  try {
    return await fetch(e.request)
  } catch {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
