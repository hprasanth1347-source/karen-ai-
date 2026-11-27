import crypto from 'node:crypto';
import { logger } from '../config/logger.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

export interface CacheStats {
  backend: 'upstash-rest' | 'memory-lru';
  redisConfigured: boolean;
  circuitOpen: boolean;
  hits: number;
  misses: number;
  errors: number;
  memoryEntries: number;
}

const MAX_MEMORY_ENTRIES = 500;
const MAX_VALUE_BYTES = 256 * 1024;
const CIRCUIT_OPEN_MS = 30_000;

class CacheService {
  private memory = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private userVersions = new Map<string, number>();
  private hits = 0;
  private misses = 0;
  private errors = 0;
  private circuitOpenUntil = 0;

  private get redisUrl(): string {
    return (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  }

  private get redisToken(): string {
    return (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  }

  public isRedisConfigured(): boolean {
    return Boolean(this.redisUrl && this.redisToken);
  }

  private isCircuitOpen(): boolean {
    return Date.now() < this.circuitOpenUntil;
  }

  public buildKey(scope: string, userId: string | 'system', resource: string, params?: unknown): string {
    const ver = userId !== 'system' ? (this.userVersions.get(userId) ?? 1) : 1;
    const hash = params
      ? crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 12)
      : 'default';
    return `karen:v${ver}:${scope}:${userId}:${resource}:${hash}`;
  }

  private async upstashCmd<T = unknown>(args: Array<string | number>): Promise<T | null> {
    if (!this.isRedisConfigured() || this.isCircuitOpen()) return null;
    try {
      const res = await fetch(this.redisUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
      const json = (await res.json()) as { result?: T; error?: string };
      if (json.error) throw new Error(json.error);
      return json.result ?? null;
    } catch (err) {
      this.errors++;
      this.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
      logger.warn('Upstash Redis unavailable, falling back to memory LRU', {
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private evictIfNeeded(): void {
    if (this.memory.size < MAX_MEMORY_ENTRIES) return;
    const firstKey = this.memory.keys().next().value;
    if (firstKey) this.memory.delete(firstKey);
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.isRedisConfigured() && !this.isCircuitOpen()) {
      const raw = await this.upstashCmd<string>(['GET', key]);
      if (typeof raw === 'string') {
        try {
          this.hits++;
          return JSON.parse(raw) as T;
        } catch {
          // Ignore parse error
        }
      }
    }

    const mem = this.memory.get(key);
    if (mem) {
      if (mem.expiresAt > Date.now()) {
        this.hits++;
        return mem.value as T;
      }
      this.memory.delete(key);
    }
    this.misses++;
    return null;
  }

  public async set<T>(key: string, value: T, ttlSeconds = 60, tags: string[] = []): Promise<void> {
    if (value === undefined) return;
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return;
    }
    if (serialized.length > MAX_VALUE_BYTES) return;

    this.evictIfNeeded();
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      tags,
    });

    if (this.isRedisConfigured() && !this.isCircuitOpen()) {
      await this.upstashCmd(['SET', key, serialized, 'EX', Math.max(1, Math.floor(ttlSeconds))]);
    }
  }

  public async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    opts?: { ttlSeconds?: number; tags?: string[] }
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const p = loader()
      .then(async (val) => {
        if (val !== null && val !== undefined) {
          await this.set(key, val, opts?.ttlSeconds ?? 60, opts?.tags ?? []);
        }
        return val;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, p);
    return p;
  }

  public async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.isRedisConfigured() && !this.isCircuitOpen()) {
      await this.upstashCmd(['DEL', key]);
    }
  }

  public invalidateTag(tag: string): void {
    for (const [k, entry] of this.memory.entries()) {
      if (entry.tags.includes(tag)) {
        this.memory.delete(k);
      }
    }
  }

  public invalidateUser(userId: string): void {
    const next = (this.userVersions.get(userId) ?? 1) + 1;
    this.userVersions.set(userId, next);
    const marker = `:${userId}:`;
    for (const k of this.memory.keys()) {
      if (k.includes(marker)) this.memory.delete(k);
    }
  }

  public stats(): CacheStats {
    return {
      backend: this.isRedisConfigured() && !this.isCircuitOpen() ? 'upstash-rest' : 'memory-lru',
      redisConfigured: this.isRedisConfigured(),
      circuitOpen: this.isCircuitOpen(),
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      memoryEntries: this.memory.size,
    };
  }
}

export const cacheService = new CacheService();
