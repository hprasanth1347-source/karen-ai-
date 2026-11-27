import { execUpstashCommand } from './redisClient.js';
import { loadRedisConfig } from './redisConfig.js';
import type { RateLimitCheck } from './redisTypes.js';

const memoryCounters = new Map<string, { count: number; resetAt: number }>();

export async function checkDistributedRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  envObj: Record<string, string | undefined> = process.env
): Promise<RateLimitCheck> {
  const cfg = loadRedisConfig(envObj);
  if (cfg.restConfigured) {
    const incr = await execUpstashCommand<number>(['INCR', key], envObj);
    if (incr.ok && typeof incr.result === 'number') {
      if (incr.result === 1) {
        await execUpstashCommand(['EXPIRE', key, windowSeconds], envObj);
      }
      return {
        allowed: incr.result <= limit,
        remaining: Math.max(0, limit - incr.result),
        resetAfterSec: windowSeconds,
        backend: 'upstash-rest',
      };
    }
  }

  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAfterSec: windowSeconds, backend: 'memory-fallback' };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    backend: 'memory-fallback',
  };
}
