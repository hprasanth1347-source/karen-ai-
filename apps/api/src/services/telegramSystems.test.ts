import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const {
  processNotificationEvent,
  updateNotificationPreferences,
  resetNotificationEngineForTests,
  isInsideQuietHours,
  retryFailedNotifications,
} = await import('./notificationEngine.service.js');

const {
  generateAndSendGreeting,
  runCompanionTick,
  resetCompanionForTests,
  updateCompanionConfig,
} = await import('./dailyCompanion.service.js');

test('Notification Engine classifies critical security alerts and blocks duplicates', async () => {
  resetNotificationEngineForTests();
  updateNotificationPreferences({ useAIClassification: false });

  const first = await processNotificationEvent({
    source: 'gmail',
    title: 'Security Alert: Unauthorized login attempt',
    sender: 'security@google.com',
    body: 'Critical unauthorized login blocked on your account.',
  });

  assert.equal(first.priority, 'CRITICAL');

  const duplicate = await processNotificationEvent({
    source: 'gmail',
    title: 'Security Alert: Unauthorized login attempt',
    sender: 'security@google.com',
    body: 'Critical unauthorized login blocked on your account.',
  });

  assert.equal(duplicate.status, 'duplicate');
});

test('Notification Engine respects quiet hours for non-critical alerts and allows CRITICAL emergency bypass', async () => {
  resetNotificationEngineForTests();
  updateNotificationPreferences({
    useAIClassification: false,
    quietHours: {
      enabled: true,
      start: '00:00',
      end: '23:59',
      allowEmergency: true,
    },
  });

  assert.equal(isInsideQuietHours(new Date()), true);

  const mediumAlert = await processNotificationEvent({
    source: 'instagram',
    title: 'New follower',
    body: 'Someone followed your profile.',
    suggestedPriority: 'MEDIUM',
  });
  assert.equal(mediumAlert.status, 'suppressed_quiet');

  const criticalAlert = await processNotificationEvent({
    source: 'system',
    title: 'Server down',
    body: 'Critical failure in production worker.',
    suggestedPriority: 'CRITICAL',
  });
  // Not suppressed by quiet hours (attempts delivery -> failed in test env without token)
  assert.notEqual(criticalAlert.status, 'suppressed_quiet');
});

test('Notification Engine retryFailedNotifications tracks retry attempts', async () => {
  resetNotificationEngineForTests();
  updateNotificationPreferences({ useAIClassification: false });

  await processNotificationEvent({
    source: 'whatsapp',
    title: 'Urgent message',
    body: 'Please call back ASAP.',
    suggestedPriority: 'HIGH',
  });

  const result = await retryFailedNotifications();
  assert.equal(result.retried, 1);
  assert.equal(result.succeeded, 0);
});

test('Daily Companion prevents duplicate greetings for the same date and slot in Asia/Kolkata', async () => {
  resetCompanionForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 500 });
  try {
    const fixedMorningIst = new Date('2026-11-25T07:05:00+05:30');

    const tick1 = await runCompanionTick(fixedMorningIst);
    assert.deepEqual(tick1.triggered, ['morning']);

    const tick2 = await runCompanionTick(fixedMorningIst);
    assert.deepEqual(tick2.triggered, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Daily Companion supports all four greeting slots (morning, afternoon, evening, night)', async () => {
  resetCompanionForTests();
  updateCompanionConfig({ respectQuietHours: false });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 500 });
  try {
    const slots = ['morning', 'afternoon', 'evening', 'night'] as const;
    for (const slot of slots) {
      const res = await generateAndSendGreeting(slot, { force: true });
      assert.equal(res.sent, true);
      assert.equal(res.entry?.slot, slot);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
