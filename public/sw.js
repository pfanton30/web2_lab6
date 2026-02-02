const CACHE_NAME = 'photodiary';
const RUNTIME_CACHE = 'runtime-cache-v1';

// ako je ovo cacheirano aplikacija se moze otvoriti offline
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// install za sw
self.addEventListener('install', (event) => {
  event.waitUntil(      // cekaj da cache bude gotov, tek onda je sw instaliran
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
});

// pokreće se kad se sw instalira
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);    // izbrisi cacheve koje ne koristimo
          }
        })
      );
    })
  );
});

// Ovo je mjesto gdje SW donosi odluke umjesto browsera
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache First strategija, ako postoji, vrati odmah
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request);
      })
    );
    return;
  }

  // Network First - pokušaj mrežu
if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cacheiraj samo GET zahtjeve
          if (request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Pokušaj dohvatiti iz cachea (samo GET-ovi će postojati)
          if (request.method === 'GET') {
            return caches.match(request);
          }
          // Za POST/PUT/DELETE samo baci grešku
          return new Response(
            JSON.stringify({ error: 'Network error, no cached data' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }
});

// aktivira se kad se uređaj opet spoji na mrežu
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notes') {
    event.waitUntil(syncNotes());
  }
});

// dohvat lokalnih podataka, rezultat notes je niz objekata bilješki koje treba sinkronizirati sa serverom
async function syncNotes() {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  
  for (const note of notes) {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note)
      });
      
      if (response.ok) {
        // pošalji notification kad bude uspješan sync
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Bilješke sinkronizirane!' })
        });
      }
    } catch (err) {
      console.error('Sync failed:', err);
    }
  }
}

// sluša Push notificatione
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body
    })
  );
});

// otvaranje aplikacije ako se pritisne notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );

});
