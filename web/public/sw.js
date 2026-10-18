/* Heavyworks Garage service worker: shows push notifications and opens the right page when one is tapped. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Heavyworks Garage";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag, renotify: !!data.tag, data: { url: data.url || "/jobs" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/jobs", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) { await w.focus(); if ("navigate" in w) await w.navigate(url); return; } }
    await self.clients.openWindow(url);
  })());
});
