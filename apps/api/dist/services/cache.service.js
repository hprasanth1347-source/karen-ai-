import crypto from 'node:crypto';
import { logger } from '../config/logger.js';
const MAX_MEMORY_ENTRIES = 500;
const MAX_VALUE_BYTES = 256 * 1024;
const CIRCUIT_OPEN_MS = 30_000;
class CacheService {
    memory = new Map();
    inflight = new Map();
    userVersions = new Map();
    hits = 0;
    misses = 0;
    errors = 0;
    circuitOpenUntil = 0;
    get redisUrl() {
        return (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
    }
    get redisToken() {
        return (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
    }
    isRedisConfigured() {
        return Boolean(this.redisUrl && this.redisToken);
    }
    isCircuitOpen() {
        return Date.now() < this.circuitOpenUntil;
    }
    buildKey(scope, userId, resource, params) {
        const ver = userId !== 'system' ? (this.userVersions.get(userId) ?? 1) : 1;
        const hash = params
            ? crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 12)
            : 'default';
        return `karen:v${ver}:${scope}:${userId}:${resource}:${hash}`;
    }
    async upstashCmd(args) {
        if (!this.isRedisConfigured() || this.isCircuitOpen())
            return null;
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
            if (!res.ok)
                throw new Error(`Upstash HTTP ${res.status}`);
            const json = (await res.json());
            if (json.error)
                throw new Error(json.error);
            return json.result ?? null;
        }
        catch (err) {
            this.errors++;
            this.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
            logger.warn('Upstash Redis unavailable, falling back to memory LRU', {
                err: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }
    evictIfNeeded() {
        if (this.memory.size < MAX_MEMORY_ENTRIES)
            return;
        const firstKey = this.memory.keys().next().value;
        if (firstKey)
            this.memory.delete(firstKey);
    }
    async get(key) {
        if (this.isRedisConfigured() && !this.isCircuitOpen()) {
            const raw = await this.upstashCmd(['GET', key]);
            if (typeof raw === 'string') {
                try {
                    this.hits++;
                    return JSON.parse(raw);
                }
                catch {
                    // Ignore parse error
                }
            }
        }
        const mem = this.memory.get(key);
        if (mem) {
            if (mem.expiresAt > Date.now()) {
                this.hits++;
                return mem.value;
            }
            this.memory.delete(key);
        }
        this.misses++;
        return null;
    }
    async set(key, value, ttlSeconds = 60, tags = []) {
        if (value === undefined)
            return;
        let serialized;
        try {
            serialized = JSON.stringify(value);
        }
        catch {
            return;
        }
        if (serialized.length > MAX_VALUE_BYTES)
            return;
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
    async getOrSet(key, loader, opts) {
        const cached = await this.get(key);
        if (cached !== null)
            return cached;
        const existing = this.inflight.get(key);
        if (existing)
            return existing;
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
    async del(key) {
        this.memory.delete(key);
        if (this.isRedisConfigured() && !this.isCircuitOpen()) {
            await this.upstashCmd(['DEL', key]);
        }
    }
    invalidateTag(tag) {
        for (const [k, entry] of this.memory.entries()) {
            if (entry.tags.includes(tag)) {
                this.memory.delete(k);
            }
        }
    }
    invalidateUser(userId) {
        const next = (this.userVersions.get(userId) ?? 1) + 1;
        this.userVersions.set(userId, next);
        const marker = `:${userId}:`;
        for (const k of this.memory.keys()) {
            if (k.includes(marker))
                this.memory.delete(k);
        }
    }
    stats() {
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
