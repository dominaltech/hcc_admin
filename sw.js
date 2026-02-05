// ============================================
// ADMIN SERVICE WORKER
// No Caching - Always fetch latest
// Only handles push notifications
// ============================================

const VERSION = 'admin-v1.0.0';

// ============================================
// INSTALL - Skip waiting
// ============================================
self.addEventListener('install', (event) => {
    console.log('✅ Admin SW installed:', VERSION);
    self.skipWaiting();
});

// ============================================
// ACTIVATE - Clean up old versions
// ============================================
self.addEventListener('activate', (event) => {
    console.log('✅ Admin SW activated:', VERSION);
    event.waitUntil(
        clients.claim()
    );
});

// ============================================
// FETCH - No caching, always network
// ============================================
self.addEventListener('fetch', (event) => {
    // Always fetch from network (no cache)
    event.respondWith(
        fetch(event.request)
            .catch(err => {
                console.error('Fetch failed:', err);
                return new Response('Network error', {
                    status: 408,
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});

// ============================================
// PUSH NOTIFICATION HANDLER
// ============================================
self.addEventListener('push', (event) => {
    console.log('🔔 Push notification received:', event);

    let notificationData = {
        title: 'HCC School Admin',
        body: 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: {
            url: '/admin.html'
        }
    };

    // Parse push data if available
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || data.message || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                data: {
                    url: data.url || '/admin.html',
                    ...data
                }
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
            actions: [
                {
                    action: 'open',
                    title: 'Open Admin Panel'
                },
                {
                    action: 'close',
                    title: 'Dismiss'
                }
            ]
        })
    );
});

// ============================================
// NOTIFICATION CLICK HANDLER
// ============================================
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);

    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    const urlToOpen = event.notification.data?.url || '/admin.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if admin panel is already open
                for (let client of clientList) {
                    if (client.url.includes('admin.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if not open
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// ============================================
// MESSAGE HANDLER (for skip waiting)
// ============================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ============================================
// BACKGROUND SYNC (Optional - for offline actions)
// ============================================
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync:', event.tag);
    
    if (event.tag === 'sync-notifications') {
        event.waitUntil(
            fetch('/api/sync-notifications')
                .then(response => response.json())
                .then(data => console.log('Sync complete:', data))
                .catch(err => console.error('Sync failed:', err))
        );
    }
});
