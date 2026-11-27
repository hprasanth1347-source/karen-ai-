# REDIS SECURITY & ISOLATION — KAREN AI

1. **Zero Frontend Exposure:** Redis credentials (`UPSTASH_REDIS_REST_TOKEN`, `REDIS_URL`) are strictly server-side (`apps/api`, `apps/worker`, `packages/shared`) and never prefixed with `VITE_`.
2. **User Isolation:** Every private cache key embeds the authenticated `userId` (`karen:{env}:{domain}:{userId}:{resource}`).
3. **Never Cached in Redis:** OAuth access/refresh tokens, passwords, API keys, and raw private document chunks.
4. **Atomic Locking:** Locks use unique UUID ownership tokens (`SET NX EX` + Lua compare-and-delete) — never unsafe `GET` followed by `SET`.
