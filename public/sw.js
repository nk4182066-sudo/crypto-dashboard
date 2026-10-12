// Service Worker — browser notifications for 90+ score signals.
// Handles: push payload display + notification click → open/focus the app.
// Educational only. Not financial advice.

const CACHE_NAME = "trading-ai-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old caches on upgrade.
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await clients.claim();
    })()
  );
});

// Push notification receive (works when a real push server sends an event).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const options = {
    body: data.body || "New signal detected",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/signals" },
    tag: "signal-alert",
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || "🎯 Trading Alert", options));
});

// Local (in-page) notifications also route through the registration so the
// click handler below works the same way for every alert.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/signals";
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })()
  );
});
