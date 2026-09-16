// Morrow's service worker: an offline shell, and phone notifications.
// Plain JS on purpose — it ships as-is from /public and never goes through the bundler.

const VERSION = 'v2'
const SHELL = `morrow-shell-${VERSION}`
const ASSETS = `morrow-assets-${VERSION}`
const OFFLINE = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE, '/favicon.svg', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Prices, balances and gifts are never worth a stale answer
  if (url.pathname.startsWith('/api/')) return

  // Pages come from the network so a signed-in view is always current; the shell stands in
  // only when the network is gone
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE).then((page) => page ?? Response.error())),
    )
    return
  }

  // Build output is content-hashed, so once it's cached it can be served straight away
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSETS).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Morrow', {
      body: payload.body ?? '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: payload.url ?? '/notifications' },
      // One gift, one notification: a second push about the same thing replaces the first
      tag: payload.url ?? 'morrow',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const window of windows) {
        if (window.url === target && 'focus' in window) return window.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
