// ============================================
// CRON JOB: Check and send pending notifications
// Runs every 2 minutes
// ============================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

exports.handler = async (event, context) => {
    console.log('🔍 Checking for pending notifications...');

    try {
        // Get pending notifications
        const { data: pending, error } = await supabase
            .from('notifications_log')
            .select('id')
            .eq('is_sent', false)
            .limit(10);

        if (error) throw error;

        if (!pending || pending.length === 0) {
            console.log('✅ No pending notifications');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'No pending notifications' })
            };
        }

        console.log(`📨 Found ${pending.length} pending notifications`);

        // Call send-push function for each
        const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL;
        
        const response = await fetch(`${SITE_URL}/.netlify/functions/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sendAll: true })
        });

        const result = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                checked: pending.length,
                result: result
            })
        };

    } catch (error) {
        console.error('❌ Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
