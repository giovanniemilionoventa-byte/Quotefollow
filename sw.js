/* QuoteFollow — Service Worker
   Scopo:
   1) Rendere l'app installabile (requisito dei browser Chromium/Android).
   2) Offrire un fallback offline di base (cache dell'app shell).
   3) Mostrare le notifiche locali in modo più affidabile tramite
      self.registration.showNotification(), invocato dalla pagina via
      postMessage. Nessun dato lascia il dispositivo: nessun server,
      nessuna push reale — resta tutto locale, come prima.
*/

const CACHE_NAME = 'quotefollow-shell-v1';
const CORE_ASSETS = [
  './',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Non blocchiamo l'installazione se qualche asset non è raggiungibile
      Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Strategia: per le navigazioni (apertura/refresh dell'app) prova la rete,
// se non disponibile usa la copia in cache. Per gli altri asset stessa
// origine: cache-first con aggiornamento in background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// La pagina chiede al service worker di mostrare una notifica locale.
// Più affidabile di "new Notification()" su Chrome Android.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = data;
    self.registration.showNotification(title || 'QuoteFollow', {
      body: body || '',
      tag: tag || 'quotefollow',
      icon: undefined,
      badge: undefined
    });
  }
});

// Click sulla notifica: porta l'utente alla scheda già aperta dell'app,
// oppure ne apre una nuova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
