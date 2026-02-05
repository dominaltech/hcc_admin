// ============================================
// ADMIN SERVICE WORKER - No Caching
// ============================================

const VERSION = 'admin-v1.0.1';

self.addEventListener('install', (event) => {
    console.log('✅ Admin SW installed:', VERSION);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('✅ Admin SW activated:', VERSION);
    event.waitUntil(clients.claim());
});

// NO CACHING - Always fetch fresh
self.addEventListener('fetch', (event) => {
    // Always network first for admin
    event.respondWith(
        fetch(event.request)
            .catch(err => {
                console.error('Fetch failed:', err);
                // If offline and trying to access admin, show error
                if (event.request.url.includes('index.html') || event.request.url.endsWith('/')) {
                    return new Response('Admin panel requires internet connection', {
                        status: 503,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                }
                return new Response('Network error', {
                    status: 408,
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});

// Push notification handler
self.addEventListener('push', (event) => {
    let notificationData = {
        title: 'HCC Admin Alert',
        body: 'New inquiry received',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: { url: '/#inquiries' }
    };

    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || data.message || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                data: { url: data.url || '/', ...data }
            };
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            vibrate: [200, 100, 200],
            data: notificationData.data,
            requireInteraction: true,
            actions: [
                { action: 'open', title: 'View' },
                { action: 'close', title: 'Dismiss' }
            ]
        })
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (let client of clientList) {
                    if (client.url.includes(self.registration.scope) && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
