// Service worker para Web Push en segundo plano.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    data = { title: 'RUAG', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'RUAG'
  const options = {
    body: data.body || '',
    icon: '/ruag-icon-192.png',
    badge: '/ruag-icon-192.png',
    vibrate: [80, 40, 80],
    tag: data.tag || 'ruag-cumple',
    data: { url: data.url || '/escaner' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/escaner'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })
  )
})
