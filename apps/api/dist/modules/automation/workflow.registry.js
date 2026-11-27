export const AUTOMATION_TEMPLATES = [
    {
        id: 'tpl-karen-times-daily',
        name: 'Daily KAREN TIMES Publication',
        description: 'Generate Tamil & English KAREN TIMES editions at 07:00 IST and deliver to Telegram.',
        category: 'Newsroom',
        scheduleCron: '0 7 * * *',
        nodes: [
            { id: 'n1', type: 'trigger.schedule', label: 'Daily 07:00 IST', config: { cron: '0 7 * * *', timezone: 'Asia/Kolkata' } },
            { id: 'n2', type: 'action.process_news', label: 'Generate KAREN TIMES Editions', config: { languages: ['en', 'ta'] } },
            { id: 'n3', type: 'action.send_telegram', label: 'Deliver Editions to Telegram', config: { message: 'KAREN TIMES Daily Edition Ready' } },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-breaking-news',
        name: 'Breaking News Monitoring',
        description: 'Monitor configured RSS feeds and alert Telegram when urgent stories appear.',
        category: 'Newsroom',
        scheduleCron: '*/30 * * * *',
        nodes: [
            { id: 'n1', type: 'trigger.new_rss', label: 'RSS Feed Poll', config: {} },
            { id: 'n2', type: 'logic.ai_classify', label: 'Urgency Filter', config: { threshold: 'high' } },
            { id: 'n3', type: 'action.send_telegram', label: 'Send Breaking Update', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-classroom-reminders',
        name: 'Google Classroom Assignment Reminders',
        description: 'Sync Classroom courses, check pending/due assignments, and notify students on Telegram & Dashboard.',
        category: 'Google',
        scheduleCron: '0 8 * * *',
        nodes: [
            { id: 'n1', type: 'trigger.new_assignment', label: 'Classroom Sync Trigger', config: {} },
            { id: 'n2', type: 'action.run_integration', label: 'Sync Classroom Courses', config: { integration: 'classroom_sync' } },
            { id: 'n3', type: 'action.send_notification', label: 'Dashboard & Telegram Alert', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-instagram-ai',
        name: 'Instagram AI Auto-Replies',
        description: 'Process incoming Meta DM webhooks through Karen AI companion with safety checks.',
        category: 'Social',
        nodes: [
            { id: 'n1', type: 'trigger.new_message', label: 'Instagram DM Webhook', config: { channel: 'instagram' } },
            { id: 'n2', type: 'action.generate_ai_text', label: 'Karen AI DM Reply', config: { provider: 'groq' } },
            { id: 'n3', type: 'action.send_notification', label: 'Log & Notify Owner', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-daily-telegram-summary',
        name: 'Daily Telegram Summary',
        description: 'Compile pending tasks, Calendar events, and unread emails every evening at 20:00 IST.',
        category: 'Productivity',
        scheduleCron: '0 20 * * *',
        nodes: [
            { id: 'n1', type: 'trigger.schedule', label: 'Daily 20:00 IST', config: { cron: '0 20 * * *', timezone: 'Asia/Kolkata' } },
            { id: 'n2', type: 'action.generate_ai_text', label: 'Build Evening Summary', config: { prompt: 'Summarize today tasks and calendar.' } },
            { id: 'n3', type: 'action.send_telegram', label: 'Send to Telegram', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-daily-business-report',
        name: 'Daily Business Report',
        description: 'Generate an AI executive summary of daily activity and send via Telegram.',
        category: 'Analytics',
        scheduleCron: '0 21 * * *',
        nodes: [
            { id: 'n1', type: 'trigger.schedule', label: 'Daily 21:00 IST', config: { cron: '0 21 * * *' } },
            { id: 'n2', type: 'action.generate_ai_text', label: 'Generate Business Digest', config: {} },
            { id: 'n3', type: 'action.send_telegram', label: 'Send Report', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-weekly-analytics',
        name: 'Weekly Analytics Report',
        description: 'Weekly Sunday summary of automation runs, AI usage, and task completion.',
        category: 'Analytics',
        scheduleCron: '0 9 * * 0',
        nodes: [
            { id: 'n1', type: 'trigger.schedule', label: 'Sunday 09:00 IST', config: { cron: '0 9 * * 0' } },
            { id: 'n2', type: 'action.generate_ai_text', label: 'Analyze Weekly Metrics', config: {} },
            { id: 'n3', type: 'action.send_notification', label: 'Save Dashboard Report', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-doc-processing',
        name: 'Document Processing Pipeline',
        description: 'Extract, summarize, and index newly uploaded PDF/DOCX documents.',
        category: 'Documents',
        nodes: [
            { id: 'n1', type: 'trigger.file_uploaded', label: 'Document Uploaded', config: {} },
            { id: 'n2', type: 'action.generate_ai_text', label: 'Summarize Document', config: {} },
            { id: 'n3', type: 'action.send_notification', label: 'Notify Ready', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-drive-upload-notify',
        name: 'File Upload Notification',
        description: 'Notify Telegram whenever a file is uploaded to Google Drive via Karen.',
        category: 'Google',
        nodes: [
            { id: 'n1', type: 'trigger.file_uploaded', label: 'Drive Upload Event', config: {} },
            { id: 'n2', type: 'action.send_telegram', label: 'Send Drive Link', config: {} },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    },
    {
        id: 'tpl-failed-job-alert',
        name: 'Failed Job Alert',
        description: 'Monitor dead-letter/failed jobs and alert owner immediately on Telegram.',
        category: 'Operations',
        nodes: [
            { id: 'n1', type: 'trigger.db_event', label: 'Job Failed Event', config: {} },
            { id: 'n2', type: 'reliability.error_handler', label: 'Format Error Summary', config: {} },
            { id: 'n3', type: 'action.send_telegram', label: 'Alert Owner', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-social-content',
        name: 'AI-Generated Social Media Content',
        description: 'Draft daily Instagram caption & hashtags for owner review.',
        category: 'Social',
        scheduleCron: '0 11 * * *',
        nodes: [
            { id: 'n1', type: 'trigger.schedule', label: 'Daily 11:00 IST', config: { cron: '0 11 * * *' } },
            { id: 'n2', type: 'action.generate_ai_text', label: 'Draft Caption & Tags', config: {} },
            { id: 'n3', type: 'reliability.human_approval', label: 'Await Owner Review', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
    {
        id: 'tpl-system-health',
        name: 'Scheduled System Health Report',
        description: 'Check AI providers, cache, and database health every morning.',
        category: 'Operations',
        scheduleCron: '30 7 * * *',
        nodes: [
            { id: 'n1', type: 'trigger.schedule', label: 'Daily 07:30 IST', config: { cron: '30 7 * * *' } },
            { id: 'n2', type: 'action.run_integration', label: 'Check Provider Health', config: { integration: 'health_check' } },
            { id: 'n3', type: 'action.send_notification', label: 'Record Health Report', config: {} },
        ],
        edges: [
            { id: 'e1', source: 'n1', target: 'n2' },
            { id: 'e2', source: 'n2', target: 'n3' },
        ],
    },
];
