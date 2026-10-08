// Imported by the generated service worker (workbox.importScripts). Web Push display + click handling.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Tessera', {
    body: d.body || '',
    icon: '/tessera/icon-192.png',
    badge: '/tessera/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/tessera/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/tessera/', self.location.origin).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url === url && 'focus' in c) return c.focus();
    }
    for (const c of list) {
      if (c.url.startsWith(self.location.origin + '/tessera/') && 'focus' in c) {
        const f = await c.focus();
        if (f && 'navigate' in f && f.url !== url) { try { return await f.navigate(url); } catch (e) { /* fall through */ } }
        return f;
      }
    }
    return self.clients.openWindow(url);
  })());
});
