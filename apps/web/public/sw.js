self.addEventListener("push", (event) => {
  let payload = {
    title: "NewsPortal alert",
    body: "A new update is available."
  };

  try {
    const parsed = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === "object") {
      payload = {
        title: String(parsed.title ?? payload.title),
        body: String(parsed.body ?? payload.body)
      };
    }
  } catch {
    payload = {
      title: "NewsPortal alert",
      body: event.data ? String(event.data.text()) : "A new update is available."
    };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
