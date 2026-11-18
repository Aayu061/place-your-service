// Place Your Service — Minimal Static App-Shell Service Worker
// Intentionally never caches /api/*, Supabase, or authenticated dynamic JSON responses.
const SHELL_CACHE = 'pys-app-shell-v2';
const SHELL_ASSETS = ['/', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  event.respondWith(
    fetch(request).catch(async () => {
      // Offline or network failure: serve a cached copy, fall back to the app shell for
      // page navigations, and otherwise return a proper network error (never undefined,
      // which throws "Failed to convert value to 'Response'").
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      return Response.error();
    })
  );
});

