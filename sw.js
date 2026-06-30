const CACHE_NAME = 'famille-joseph-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/Style.css',
  '/Script.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('firebasedatabase') ||
      e.request.url.includes('firebaseio') ||
      e.request.url.includes('gstatic.com/firebasejs')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '✝ Famille Joseph';
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: 'file_00000000a4e871f4888734734ed2f542.png',
    badge: 'file_00000000a4e871f4888734734ed2f542.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'join', title: '🎙️ Rejoindre' },
      { action: 'dismiss', title: 'Plus tard' }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'join' || !e.action) {
    e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
  }
});
