self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/overview";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.postMessage({ type: "QBAY_NOTIFICATION_CLICK", url: target });
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHOW_NOTIFICATION") return;
  const payload = event.data.notification || {};
  self.registration.showNotification(payload.title || "Q-Bay CRM", {
    body: payload.body || undefined,
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/overview" },
  });
});
