// The register shell can install as a PWA. Vendor records are never stored in the service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vendor Register · Offline</title><body style="font:16px Arial;padding:30px;background:#f4f6f4;color:#143c35"><h1>Reconnect to open the register</h1><p>Vendor records stay on the server and are not saved on this device.</p><button onclick="location.reload()" style="padding:12px">Try again</button></body></html>',
    {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}}
  )));
});
