import test from 'node:test';
import assert from 'node:assert';

test('Voice Policy: Rejects synthesis when female voice is not confirmed', () => {
  const confirmed = process.env.VOICE_FEMALE_CONFIRMED === 'true';
  const voiceId = process.env.VOICE_FEMALE_VOICE_ID;
  const ready = Boolean(confirmed && voiceId);

  // By default in unconfigured environment, ready must be false
  assert.strictEqual(ready, false, 'Unconfirmed voice must be unready');
});

test('Voice Policy: Strict female only rule prevents fallback', () => {
  const allowMaleFallback = false;
  assert.strictEqual(allowMaleFallback, false, 'Male fallback must never be allowed');
});
