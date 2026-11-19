self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'منصة الأكاديميات', body: event.data.text() } };
  }
  const title = payload.notification?.title || 'إشعار من منصة الأكاديميات';
  const options = {
    body: payload.notification?.body || '',
    dir: 'rtl',
    lang: 'ar',
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
