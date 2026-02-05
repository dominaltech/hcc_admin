// ============================================
// ADMIN SERVICE WORKER - ABSOLUTELY NO CACHING
// ============================================

const VERSION = 'admin-v1.0.3'; // Changed version to force update

self.addEventListener('install', (event) => {
    console.log('✅ Admin SW installed:', VERSION);
    // Force immediate activation
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('✅ Admin SW activated:', VERSION);
    
    event.waitUntil(
        (async () => {
            // Delete ALL caches on activation
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log('✅ All caches deleted');
            
            // Take control of all pages immediately
            await clients.claim();
        })()
    );
});

// CRITICAL FIX: Explicitly bypass cache
self.addEventListener('fetch', (event) => {
    // Always fetch fresh - NO CACHE
    event.respondWith(
        fetch(event.request, {
            cache: 'no-store', // ← THIS IS THE KEY FIX!
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        })
        .then(response => {
            // Clone response and add no-cache headers
            const newHeaders = new Headers(response.headers);
            newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            newHeaders.set('Pragma', 'no-cache');
            newHeaders.set('Expires', '0');
            
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        })
        .catch(err => {
            console.error('❌ Fetch failed:', err);
            
            // If offline and trying to access admin
            if (event.request.url.includes('index.html') || event.request.url.endsWith('/')) {
                return new Response('⚠️ Admin panel requires internet connection', {
                    status: 503,
                    headers: { 
                        'Content-Type': 'text/plain',
                        'Cache-Control': 'no-store'
                    }
                });
            }
            
            return new Response('❌ Network error - Admin offline', {
                status: 408,
                headers: { 
                    'Content-Type': 'text/plain',
                    'Cache-Control': 'no-store'
                }
            });
        })
    );
});

// Push notification handler (unchanged)
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

// Notification click handler (unchanged)
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

// Handle skip waiting message
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    // Add force update message
    if (event.data && event.data.type === 'FORCE_UPDATE') {
        caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
        });
        self.skipWaiting();
    }
});

console.log('🚀 Admin SW loaded - TRUE NO-CACHE MODE');
