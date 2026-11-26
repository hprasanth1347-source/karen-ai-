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
