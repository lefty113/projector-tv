// Minimal service worker: only here so Chrome treats the page as an installable full-screen app.
// It caches nothing — every request goes straight to the network, so updates always show.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
