// ============================================
// NETLIFY FUNCTION: SEND PUSH NOTIFICATIONS
// Automatically sends push when called
// ============================================

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// Environment variables from Netlify
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@hccschool.edu.in';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Configure web-push
webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================
// MAIN HANDLER
// ============================================
exports.handler = async (event, context) => {
    console.log('🔔 Push notification function called');

    // Allow CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Parse request
        const { notificationId, sendAll } = JSON.parse(event.body || '{}');

        let notifications = [];

        if (notificationId) {
            // Send specific notification
            const { data, error } = await supabase
                .from('notifications_log')
                .select('*')
                .eq('id', notificationId)
                .single();

            if (error) throw error;
            notifications = [data];
        } else if (sendAll) {
            // Send all pending notifications
            const { data, error } = await supabase
                .from('notifications_log')
                .select('*')
                .eq('is_sent', false)
                .order('created_at', { ascending: true })
                .limit(20);

            if (error) throw error;
            notifications = data || [];
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing notificationId or sendAll parameter' })
            };
        }

        if (notifications.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true,
                    message: 'No notifications to send',
                    sent: 0
                })
            };
        }

        // Get active admin subscriptions
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('is_active', true)
            .eq('device_type', 'admin');

        if (subError) throw subError;

        if (!subscriptions || subscriptions.length === 0) {
            console.log('⚠️ No admin subscriptions found');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true,
                    message: 'No active admin subscriptions',
                    sent: 0
                })
            };
        }

        console.log(`📤 Sending to ${subscriptions.length} admin devices`);

        let totalSent = 0;
        let failedSubscriptions = [];

        // Send each notification
        for (const notification of notifications) {
            const payload = JSON.stringify({
                title: notification.title || 'HCC Admin Alert',
                body: notification.message || 'New notification',
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-96x96.png',
                url: notification.notification_data?.url || '/',
                data: notification.notification_data || {},
                tag: 'admin-notification',
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200]
            });

            // Send to all admin subscriptions
            for (const subscription of subscriptions) {
                try {
                    const pushSubscription = {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: subscription.p256dh,
                            auth: subscription.auth
                        }
                    };

                    await webpush.sendNotification(pushSubscription, payload);
                    totalSent++;
                    console.log(`✅ Sent to ${subscription.endpoint.substring(0, 50)}...`);

                    // Update last_used
                    await supabase
                        .from('push_subscriptions')
                        .update({ last_used: new Date().toISOString() })
                        .eq('id', subscription.id);

                } catch (error) {
                    console.error('❌ Failed to send:', error.message);
                    
                    // If subscription expired (410 Gone)
                    if (error.statusCode === 410) {
                        failedSubscriptions.push(subscription.id);
                        await supabase
                            .from('push_subscriptions')
                            .update({ is_active: false })
                            .eq('id', subscription.id);
                    }
                }
            }

            // Mark notification as sent
            await supabase
                .from('notifications_log')
                .update({ is_sent: true })
                .eq('id', notification.id);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Notifications sent successfully',
                sent: totalSent,
                notifications: notifications.length,
                subscribers: subscriptions.length,
                failed: failedSubscriptions.length
            })
        };

    } catch (error) {
        console.error('❌ Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to send notifications',
                details: error.message 
            })
        };
    }
};
