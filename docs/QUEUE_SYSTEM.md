# QUEUE SYSTEM & WORKER ARCHITECTURE — KAREN AI

Registered Queues (`KAREN_QUEUES`):
- `ai-processing`
- `instagram-replies`
- `telegram-delivery`
- `newspaper-generation`
- `image-generation`
- `google-classroom-reminders`
- `google-sync`
- `notifications`
- `document-processing`
- `automation-execution`
- `webhook-processing`

## Durability & Source of Truth
- **Supabase / PostgreSQL** (`jobs`, `job_attempts`, `reminders`, `automations`, `automation_executions`, `karen_times_editions`) is ALWAYS the permanent source of truth.
- Redis coordinates locks, deduplication, rate limits, and short-lived caching.
- `apps/worker/src/jobs/*.ts` executes jobs with exponential backoff, idempotency keys, dead-letter status (`dead`), and graceful shutdown.
