import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRedisKey,
  loadRedisConfig,
  acquireDistributedLock,
  releaseDistributedLock,
  checkDistributedRateLimit,
  checkRedisHealth,
  KAREN_QUEUES,
} from '../../packages/shared/dist/index.js';

test('Redis key builder enforces environment and user isolation', () => {
  const k1 = buildRedisKey('karen:production', 'instagram', 'user-1', 'dm:123');
  const k2 = buildRedisKey('karen:production', 'instagram', 'user-2', 'dm:123');
  assert.equal(k1, 'karen:production:instagram:user-1:dm:123');
  assert.notEqual(k1, k2);
});

test('Distributed lock enforces mutual exclusion and ownership token release', async () => {
  const env = {};
  const lock1 = await acquireDistributedLock('karen:test:locks:sys:job1', 30, env);
  assert.equal(lock1.acquired, true);

  const lock2 = await acquireDistributedLock('karen:test:locks:sys:job1', 30, env);
  assert.equal(lock2.acquired, false);

  const releasedWrong = await releaseDistributedLock({ ...lock1, token: 'wrong-token' }, env);
  assert.equal(releasedWrong, false);

  const releasedOk = await releaseDistributedLock(lock1, env);
  assert.equal(releasedOk, true);
});

test('Rate limiter enforces window limit and reports health cleanly when unconfigured', async () => {
  const env = {};
  const r1 = await checkDistributedRateLimit('karen:test:ratelimit:u1:ai', 2, 60, env);
  const r2 = await checkDistributedRateLimit('karen:test:ratelimit:u1:ai', 2, 60, env);
  const r3 = await checkDistributedRateLimit('karen:test:ratelimit:u1:ai', 2, 60, env);
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, false);

  const health = await checkRedisHealth(env);
  assert.equal(health.status, 'disconnected');
  assert.equal(health.queues.length, 11);
  assert.ok(KAREN_QUEUES.includes('newspaper-generation'));

  const cfg = loadRedisConfig({ UPSTASH_REDIS_REST_URL: 'https://demo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok' });
  assert.equal(cfg.restConfigured, true);
  assert.equal(cfg.tcpConfigured, false);
});
