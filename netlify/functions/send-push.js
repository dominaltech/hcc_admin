// ============================================
// NETLIFY FUNCTION: SEND PUSH NOTIFICATIONS
// ============================================

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// ============================================
// ENVIRONMENT VARIABLES (Set in Netlify)
// ============================================
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Configure web-push
webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================
// MAIN HANDLER
// ============================================
exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Parse request body
        const { notificationId, type } = JSON.parse(event.body);

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
        } else if (type === 'pending') {
            // Send all pending notifications
            const { data, error } = await supabase
                .from('notifications_log')
                .select('*')
                .eq('is_sent', false)
                .order('created_at', { ascending: true })
                .limit(50);

            if (error) throw error;
            notifications = data || [];
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing notificationId or type=pending' })
            };
        }

        if (notifications.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'No notifications to send',
                    sent: 0
                })
            };
        }

        // Get all active subscriptions
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('is_active', true);

        if (subError) throw subError;

        if (!subscriptions || subscriptions.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'No active subscriptions',
                    sent: 0
                })
            };
        }

        let totalSent = 0;
        let failedSubscriptions = [];

        // Send each notification to all subscribers
        for (const notification of notifications) {
            const payload = JSON.stringify({
                title: notification.title,
                body: notification.message,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-96x96.png',
                url: notification.notification_data?.url || '/',
                data: notification.notification_data
            });

            // Filter subscriptions based on notification type
            let targetSubscriptions = subscriptions;
            
            // Admin-only notifications (admission inquiries)
            if (notification.notification_data?.admin_only) {
                targetSubscriptions = subscriptions.filter(sub => 
                    sub.device_type === 'admin'
                );
            }

            // Send to all target subscriptions
            for (const subscription of targetSubscriptions) {
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

                    // Update last_used timestamp
                    await supabase
                        .from('push_subscriptions')
                        .update({ last_used: new Date().toISOString() })
                        .eq('id', subscription.id);

                } catch (error) {
                    console.error('Failed to send to subscription:', error);
                    
                    // If subscription is invalid (410 Gone), mark as inactive
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Notifications sent successfully',
                sent: totalSent,
                notifications: notifications.length,
                subscribers: targetSubscriptions?.length || 0,
                failedSubscriptions: failedSubscriptions.length
            })
        };

    } catch (error) {
        console.error('Error sending push notifications:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Failed to send notifications',
                details: error.message 
            })
        };
    }
};
