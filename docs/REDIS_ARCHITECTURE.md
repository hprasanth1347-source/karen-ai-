# REDIS ARCHITECTURE — KAREN AI

Shared infrastructure lives in `packages/shared/src/redis/`:
- `redisConfig.ts`: Validates REST (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) and TCP (`REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_TLS`) configuration.
- `redisKeys.ts`: Enforces namespace `karen:{env}:{domain}:{scopeId}:{resource}` across `cache`, `sessions`, `ai`, `instagram`, `telegram`, `newspaper`, `google`, `notifications`, `locks`, `ratelimit`.
- `redisClient.ts`: Centralized Upstash REST command runner with 1.5s timeout and 15s circuit breaker.
- `redisLock.ts`: Atomic `SET key token NX EX ttl` lock acquisition + Lua `EVAL` ownership-verified release.
- `redisRateLimit.ts`: Atomic `INCR` + `EXPIRE` window limiter with memory fallback.
- `redisHealth.ts`: Distinguishes `healthy`, `degraded` (REST-only), `disconnected`, and `misconfigured`.
