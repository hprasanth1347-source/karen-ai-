import crypto from 'node:crypto';
import { execUpstashCommand } from './redisClient.js';
import { loadRedisConfig } from './redisConfig.js';
import type { DistributedLockHandle } from './redisTypes.js';

const localLocks = new Map<string, { token: string; expiresAt: number }>();

export async function acquireDistributedLock(
  key: string,
  ttlSeconds = 30,
  envObj: Record<string, string | undefined> = process.env
): Promise<DistributedLockHandle> {
  const token = crypto.randomUUID();
  const cfg = loadRedisConfig(envObj);

  if (cfg.restConfigured) {
    const res = await execUpstashCommand<string>(['SET', key, token, 'NX', 'EX', Math.max(1, ttlSeconds)], envObj);
    if (res.ok) {
      return { key, token, acquired: res.result === 'OK' };
    }
  }

  const existing = localLocks.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return { key, token, acquired: false };
  }
  localLocks.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
  return { key, token, acquired: true };
}

export async function releaseDistributedLock(
  handle: DistributedLockHandle,
  envObj: Record<string, string | undefined> = process.env
): Promise<boolean> {
  if (!handle.acquired) return false;
  const cfg = loadRedisConfig(envObj);

  if (cfg.restConfigured) {
    // Atomic compare-and-delete via Lua EVAL in Upstash REST
    const script = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    const res = await execUpstashCommand<number>(['EVAL', script, 1, handle.key, handle.token], envObj);
    if (res.ok) return res.result === 1;
  }

  const existing = localLocks.get(handle.key);
  if (existing && existing.token === handle.token) {
    localLocks.delete(handle.key);
    return true;
  }
  return false;
}
