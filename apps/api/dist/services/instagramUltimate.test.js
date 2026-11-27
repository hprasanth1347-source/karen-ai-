import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInstagramMediaWithGemini } from './geminiMultimodal.service.js';
import { classifyUrgentDm, instagramAutoReplyService } from './instagramAutoReply.js';
import { getInstagramNotesActivity, getStoryInsights, handleInstagramNoteActivityEvent } from './instagramHub.service.js';
test('Gemini Multimodal never pretends to see unavailable media', async () => {
    const res = await analyzeInstagramMediaWithGemini({
        mediaUrl: undefined,
        kind: 'reel',
        senderUsername: 'testuser',
    });
    assert.equal(res.accessible, false);
    assert.equal(res.summary, '');
});
test('Auto-Reply respects human takeover and blocks OTP/password requests', async () => {
    instagramAutoReplyService.setHumanTakeover('takeover_user', true);
    const skipped = await instagramAutoReplyService.handleIncomingMessage('takeover_user', 'takeover_user', 'mid_takeover_1', 'hi karen', true);
    assert.equal(skipped.autoReplied, false);
    instagramAutoReplyService.setHumanTakeover('takeover_user', false);
    const blockedOtp = await instagramAutoReplyService.handleIncomingMessage('sender_otp_1', 'sender_otp_1', 'mid_otp_1', 'please send me your bank OTP and password right now', true);
    assert.equal(blockedOtp.autoReplied, false);
});
test('Story Insights preserves -1/unavailable metrics as null rather than fabricating counts', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
        data: [
            { name: 'impressions', values: [{ value: 142 }] },
            { name: 'reach', values: [{ value: -1 }] },
            { name: 'replies', values: [{ value: 3 }] },
        ],
    }), { status: 200 }));
    try {
        const insights = await getStoryInsights('story_123', 'mock-token');
        assert.equal(insights?.impressions, 142);
        assert.equal(insights?.reach, null);
        assert.equal(insights?.replies, 3);
    }
    finally {
        globalThis.fetch = origFetch;
    }
});
test('Instagram Notes Activity deduplicates events and marks Note likes as unavailable via Meta API', async () => {
    const first = await handleInstagramNoteActivityEvent({
        eventKey: 'note_reply_test_1',
        activityType: 'note_reply',
        noteId: 'note_1',
        noteText: 'Working late!',
        actorUsername: 'raghul',
        replyText: 'Same bro!',
    });
    assert.equal(first.recorded, true);
    assert.equal(first.duplicate, false);
    const dup = await handleInstagramNoteActivityEvent({
        eventKey: 'note_reply_test_1',
        activityType: 'note_reply',
        actorUsername: 'raghul',
    });
    assert.equal(dup.recorded, false);
    assert.equal(dup.duplicate, true);
    const activity = await getInstagramNotesActivity();
    assert.equal(activity.noteLikesSupported, false);
    assert.equal(activity.noteRepliesSupported, true);
    assert.ok(activity.events.some((e) => e.eventKey === 'note_reply_test_1'));
});
test('classifyUrgentDm flags medical emergencies, phone number requests, and urgent help for Telegram alerts', () => {
    const med = classifyUrgentDm('Urgent medical emergency at hospital, need ambulance help!', false, false);
    assert.equal(med.important, true);
    assert.equal(med.critical, true);
    assert.equal(med.category, 'MEDICAL_EMERGENCY');
    const phone = classifyUrgentDm('Bro please send Hari phone number urgent', false, false);
    assert.equal(phone.important, true);
    assert.equal(phone.critical, true);
    assert.equal(phone.category, 'PHONE_REQUEST');
    const casual = classifyUrgentDm('Hey just checking in', false, false);
    assert.equal(casual.important, false);
    assert.equal(casual.category, 'NORMAL');
});
test('getInstagramConversations supports IG login tokens, newest-first sorting, and normalized owner exclusion', async () => {
    const { config } = await import('../config/env.js');
    const { getInstagramConversations, sendInstagramMessage, invalidateInstagramCache } = await import('../providers/instagram.js');
    const prevToken = config.INSTAGRAM_ACCESS_TOKEN;
    const prevUser = config.INSTAGRAM_USERNAME;
    const prevAccountId = config.INSTAGRAM_ACCOUNT_ID;
    config.INSTAGRAM_ACCESS_TOKEN = 'IGAA_test_token_12345';
    config.INSTAGRAM_USERNAME = '@Hari.ii_14';
    config.INSTAGRAM_ACCOUNT_ID = '17841400001';
    invalidateInstagramCache();
    const calledUrls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
        const url = String(input);
        calledUrls.push(url);
        if (url.includes('graph.instagram.com') && url.includes('/conversations')) {
            return new Response(JSON.stringify({
                data: [
                    {
                        id: 'thread_1',
                        updated_time: '2026-11-26T12:00:00Z',
                        participants: {
                            data: [
                                { id: '17841400001', username: 'hari.ii_14' },
                                { id: '999001', username: 'raghul_test' },
                            ],
                        },
                        messages: {
                            data: [
                                {
                                    id: 'm_old',
                                    created_time: '2026-11-26T11:50:00Z',
                                    from: { id: '17841400001', username: 'hari.ii_14' },
                                    message: 'Earlier reply',
                                },
                                {
                                    id: 'm_new',
                                    created_time: '2026-11-26T12:00:00Z',
                                    from: { id: '999001', username: 'raghul_test' },
                                    message: 'Latest incoming message',
                                },
                            ],
                        },
                    },
                ],
            }), { status: 200 });
        }
        if (url === 'https://graph.instagram.com/v21.0/me/messages') {
            return new Response(JSON.stringify({ message_id: 'mid_sent_1' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: 'Unexpected URL' } }), { status: 400 });
    });
    try {
        const threads = await getInstagramConversations({ forceFresh: true });
        assert.equal(threads.length, 1);
        assert.equal(threads[0].participant.username, 'raghul_test');
        assert.equal(threads[0].messages?.[0]?.id, 'm_new');
        assert.ok(calledUrls.some((u) => u.startsWith('https://graph.instagram.com/v21.0/me/conversations')));
        const sendRes = await sendInstagramMessage('999001', 'Vanakkam test');
        assert.equal(sendRes.success, true);
        assert.equal(sendRes.messageId, 'mid_sent_1');
    }
    finally {
        globalThis.fetch = origFetch;
        config.INSTAGRAM_ACCESS_TOKEN = prevToken;
        config.INSTAGRAM_USERNAME = prevUser;
        config.INSTAGRAM_ACCOUNT_ID = prevAccountId;
        invalidateInstagramCache();
    }
});
test('Instagram webhook verifies token and dispatches Meta changes field=messages auto-replies', async () => {
    const { default: express } = await import('express');
    const { default: googleWorkspaceRoutes } = await import('../routes/googleWorkspace.js');
    const { default: instagramRoutes } = await import('../routes/instagram.js');
    const { config } = await import('../config/env.js');
    const { invalidateInstagramCache } = await import('../providers/instagram.js');
    const prevVerify = config.META_VERIFY_TOKEN;
    const prevSecret = config.META_APP_SECRET;
    const prevToken = config.INSTAGRAM_ACCESS_TOKEN;
    config.META_VERIFY_TOKEN = 'verify_test_token';
    config.META_APP_SECRET = '';
    config.INSTAGRAM_ACCESS_TOKEN = 'IGAA_webhook_token';
    invalidateInstagramCache();
    const app = express();
    app.use(express.json());
    app.use('/api/v1', googleWorkspaceRoutes);
    app.use('/api/v1/instagram', instagramRoutes);
    const sentBodies = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
        const url = String(input);
        if (url.includes('/messages')) {
            sentBodies.push(String(init?.body || ''));
            return new Response(JSON.stringify({ message_id: 'mid_wh_1' }), { status: 200 });
        }
        return new Response(JSON.stringify({ username: 'wh_sender' }), { status: 200 });
    });
    const server = app.listen(0);
    try {
        const addr = server.address();
        const base = `http://127.0.0.1:${addr.port}/api/v1/instagram/webhook`;
        const verifyRes = await origFetch(`${base}?hub.mode=subscribe&hub.verify_token=verify_test_token&hub.challenge=12345`);
        assert.equal(verifyRes.status, 200);
        assert.equal(await verifyRes.text(), '12345');
        const postRes = await origFetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                object: 'instagram',
                entry: [
                    {
                        id: '17841400001',
                        changes: [
                            {
                                field: 'messages',
                                value: {
                                    sender: { id: '888777' },
                                    recipient: { id: '17841400001' },
                                    message: { mid: `mid_wh_in_${Date.now()}`, text: 'hi karen need help' },
                                },
                            },
                        ],
                    },
                ],
            }),
        });
        assert.equal(postRes.status, 200);
        assert.ok(sentBodies.length >= 1);
    }
    finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(() => resolve()));
        globalThis.fetch = origFetch;
        config.META_VERIFY_TOKEN = prevVerify;
        config.META_APP_SECRET = prevSecret;
        config.INSTAGRAM_ACCESS_TOKEN = prevToken;
        invalidateInstagramCache();
    }
});
test('publishInstagramContent creates media container and publishes post', async () => {
    const { publishInstagramContent } = await import('./instagramHub.service.js');
    const { config } = await import('../config/env.js');
    const prevToken = config.INSTAGRAM_ACCESS_TOKEN;
    const prevAccount = config.INSTAGRAM_ACCOUNT_ID;
    config.INSTAGRAM_ACCESS_TOKEN = 'test_token';
    config.INSTAGRAM_ACCOUNT_ID = 'test_acc_123';
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
        const url = String(input);
        if (url.endsWith('/media')) {
            return new Response(JSON.stringify({ id: 'container_999' }), { status: 200 });
        }
        if (url.endsWith('/media_publish')) {
            return new Response(JSON.stringify({ id: 'media_888' }), { status: 200 });
        }
        if (url.includes('media_888')) {
            return new Response(JSON.stringify({ permalink: 'https://instagram.com/p/test' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: 'Unexpected' } }), { status: 400 });
    });
    try {
        const res = await publishInstagramContent({
            imageUrl: 'https://example.com/test.jpg',
            caption: 'Testing Karen AI Content Publishing #ai',
        });
        assert.equal(res.success, true);
        assert.equal(res.containerId, 'container_999');
        assert.equal(res.mediaId, 'media_888');
        assert.equal(res.permalink, 'https://instagram.com/p/test');
    }
    finally {
        globalThis.fetch = origFetch;
        config.INSTAGRAM_ACCESS_TOKEN = prevToken;
        config.INSTAGRAM_ACCOUNT_ID = prevAccount;
    }
});
test('getAccountInsights parses period metrics correctly', async () => {
    const { getAccountInsights } = await import('./instagramHub.service.js');
    const { config } = await import('../config/env.js');
    const prevToken = config.INSTAGRAM_ACCESS_TOKEN;
    const prevAccount = config.INSTAGRAM_ACCOUNT_ID;
    config.INSTAGRAM_ACCESS_TOKEN = 'test_token';
    config.INSTAGRAM_ACCOUNT_ID = 'test_acc_123';
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
        data: [
            { name: 'impressions', values: [{ value: 5420 }] },
            { name: 'reach', values: [{ value: 3100 }] },
            { name: 'profile_views', values: [{ value: 450 }] },
            { name: 'website_clicks', values: [{ value: 89 }] },
        ],
    }), { status: 200 }));
    try {
        const insights = await getAccountInsights('week');
        assert.equal(insights.period, 'week');
        assert.equal(insights.impressions, 5420);
        assert.equal(insights.reach, 3100);
        assert.equal(insights.profileViews, 450);
        assert.equal(insights.websiteClicks, 89);
    }
    finally {
        globalThis.fetch = origFetch;
        config.INSTAGRAM_ACCESS_TOKEN = prevToken;
        config.INSTAGRAM_ACCOUNT_ID = prevAccount;
    }
});
