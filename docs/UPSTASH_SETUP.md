# UPSTASH REDIS SETUP GUIDE — KAREN AI

## 1. Create Free-Tier Upstash Redis Database
1. Sign in at [Upstash Console](https://console.upstash.com/) and create a Redis database in your nearest region (e.g. `ap-south-1` Mumbai for India / `Asia/Kolkata`).
2. Copy **REST URL** and **REST Token** into:
   ```env
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-rest-token
   REDIS_KEY_PREFIX=karen:production
   ```
3. (Optional, for TCP / BullMQ worker queues): Copy **Redis URL (`rediss://...`)** if your Upstash plan supports persistent TCP connections:
   ```env
   REDIS_URL=rediss://default:password@host:6379
   REDIS_TLS=true
   ```

## 2. REST vs TCP Compatibility
- **REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)**: Used for serverless-safe caching (`CacheService`), atomic distributed locks (`acquireDistributedLock`), and atomic rate limiting (`checkDistributedRateLimit`).
- **TCP (`REDIS_URL`)**: Required for BullMQ blocking commands. When TCP is not configured, Karen AI uses the Postgres-backed `jobs` table (`jobQueue.service.ts`) so zero jobs are lost and REST is never faked as BullMQ.
