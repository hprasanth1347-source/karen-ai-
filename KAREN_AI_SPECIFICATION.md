# KAREN AI — Full System Specification

> **Generated from repository inspection** (`karen-ultra` v0.1.0)
> **Timezone:** `Asia/Kolkata` (IST) · **Live Deployment:** `https://karen-ai-me.vercel.app`

---

## 1. System Overview

**Karen AI** is a full-stack Personal AI Operating System built as an npm-workspaces TypeScript monorepo. It unifies multi-provider AI chat, permanent conversation storage, personal memory, task/reminder management, document intelligence, Google Workspace (Drive, Gmail, Google Classroom), Meta messaging (Instagram DMs, WhatsApp), a full-featured Telegram bot, emotional companionship (**Love & Comfort Mode**), and a responsive React dashboard.

---

## 2. Monorepo & Architecture

```text
karen-ultra/
├── api/
│   └── index.ts                  # Vercel serverless entry (DOMMatrix/ImageData/Path2D polyfills + Express app)
├── apps/
│   ├── api/                      # @karen/api — Express REST API & providers (TypeScript, ESM)
│   ├── web/                      # @karen/web — React 18 + Vite 6 + Tailwind CSS dashboard
│   └── worker/                   # @karen/worker — Background job handlers (scaffolded)
├── packages/
│   └── shared/                   # @karen/shared — Shared types, constants, utils, Zod validators
├── supabase/
│   └── migrations/               # PostgreSQL schema, indexes, RLS policies, seed data
├── tests/unit/                   # Root unit tests (crypto, policy)
├── .env.example                  # Documented environment variable template
├── vercel.json                   # Vercel build, rewrites, and daily cron jobs
└── package.json                  # Workspace scripts (dev, build, typecheck, test, lint)
```

### Runtime Entry Points
- **Serverless Production (Vercel):** `api/index.ts` rewrites `/api/:path*` via `vercel.json` (`__path` query parameter) and delegates to `apps/api/src/app.ts`.
- **Node Server (Local / Docker):** `apps/api/src/index.ts` starts Express on `PORT` (default `8080`) and starts `startCompanionScheduler()`.
- **Frontend SPA:** `apps/web/src/main.tsx` → `apps/web/src/App.tsx` (served from `dist/` via `vite build`).
- **Background Worker:** `apps/worker/src/index.ts` registers 7 job handlers (`documentIngestion`, `gmailSync`, `driveSync`, `notificationDelivery`, `reminderScheduler`, `automationExecutor`, `webhookProcessor`).

---

## 3. Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Language** | TypeScript (`strict: true`, ES Modules) |
| **Backend** | Node.js, Express 4, Zod, Winston, Helmet, `express-rate-limit`, `jsonwebtoken` |
| **Frontend** | React 18, React Router v6, Vite 6, Tailwind CSS 3, TanStack Query v5, Axios, Lucide React |
| **Database & Auth** | Supabase (PostgreSQL + Row Level Security + Supabase Auth) |
| **AI Providers** | Groq (`qwen/qwen3.8-27b`, GPT-OSS, Allam), Google Gemini (`gemini-flash-lite-latest`, `gemini-2.5-flash`, `gemini-3.8-flash`), GitHub Copilot SDK (`gpt-4o-mini`, `gpt-4o`, `claude-3.5-sonnet`) |
| **Voice** | ElevenLabs (strictly female-only voice policy in `apps/api/src/voice/policy.ts`) |
| **Document Parsing** | `pdf-parse`, `mammoth` (`apps/api/src/utils/docParser.ts`) |
| **Hosting** | Vercel (Frontend static + Serverless API + Daily Crons) |

---

## 4. Authentication & Security

### Frontend Auth Flow (`apps/web`)
- **`RequireAuth` (`apps/web/src/App.tsx`):** Wraps all dashboard routes (`/*`) and redirects unauthenticated users to `/auth`.
- **`AuthContext` (`apps/web/src/contexts/AuthContext.tsx`):**
  - Restores session synchronously from `window.sessionStorage` (`karen_auth_session`) on startup so authenticated users stay signed in across menu switches and page reloads until browser/tab close or explicit sign-out.
  - Supports both Supabase client auth (configured with `window.sessionStorage` in `apps/web/src/lib/supabase.ts`) and backend `/auth/login` + `/auth/bootstrap`.
- **`AuthPage` (`apps/web/src/pages/AuthPage.tsx`):** Checks `GET /api/v1/auth/status` (`{ hasOwner }`) to present Owner Sign-In or First-Time Owner Account Creation (`POST /api/v1/auth/bootstrap` with `BOOTSTRAP_SECRET`), then auto-redirects to `/`.

### Backend Security (`apps/api`)
- **Middleware:** `helmet`, `cors` (origin allowlist via `ALLOWED_ORIGINS`), `requestId`, `globalLimit` & `aiLimit` & `authLimit` (`express-rate-limit`), Zod `validate`, and `errorHandler`.
- **Auth Middleware (`apps/api/src/middleware/auth.ts`):** `requireAuth` validates `Authorization: Bearer <token>` via `supabaseAdmin.auth.getUser(token)`; `requireOwner` enforces `role === 'owner'`.
- **Encryption (`apps/api/src/services/persistence.service.ts`):** OAuth tokens are encrypted at rest with **AES-256-GCM** using SHA-256 derived keys from `ENCRYPTION_KEY` / `APP_SECRET`.
- **Production Guard (`apps/api/src/config/env.ts`):** Blocks startup in `NODE_ENV=production` if `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, `APP_SECRET`, or `BOOTSTRAP_SECRET` are missing or contain placeholder values. `SUPABASE_SERVICE_ROLE_KEY` is never exposed to frontend code.

---

## 5. AI Brain & Cross-Menu Actions (`apps/api/src/services/ai.service.ts`)

`generateAIReply(prompt, history, preferredProvider, preferredModel, signal)` orchestrates:
- **Context Injection (parallel `Promise.all`):**
  - Live Web Search (`search.service.ts` via Google Custom Search when `shouldSearchWeb(prompt)` matches)
  - Google Drive & Gmail context (`getGoogleContextForPrompt`)
  - Personal Memory (`getMemoryContextPrompt`)
  - Active Tasks (`getTasksContextPrompt`)
  - Document Vault (`getDocumentsContextPrompt`)
  - Google Classroom live summary (`getClassroomContextPrompt`)
  - Server-injected `Asia/Kolkata` date/time override
- **Provider Fallback:** Tries the selected/default provider (`groq` → `gemini` → `copilot`) with a 15s `AbortSignal`.
- **Silent Action Tags (`finalizeAIReply`):**
  - `[[MEMORY: <fact> | <category>]]` → saves durable facts to Personal Memory
  - `[[TASK: <title> | <YYYY-MM-DD> | <priority>]]` → creates a task
  - `[[SEND_EMAIL: <to> | <subject> | <body> | <optional_drive_file>]]` → sends email (or queues approval if sensitive)
  - `[[SEND_INSTA: <username> | <message>]]` → resolves handle via `resolveInstagramRecipient` and sends Instagram DM (or queues approval if sensitive)
  - `[[SEND_TELEGRAM: <message>]]` → dispatches message to owner's Telegram
  - `[[CLASSROOM_SYNC]]` → triggers `syncClassroomData()`
  - `[[JOIN_CLASS: <invite_link_or_code> | <optional_course_id>]]` → enrolls in Classroom course
  - `[[ADD_EXAM: <subject> | <YYYY-MM-DD> | <optional_time>]]` → adds tracked exam date

---

## 6. Permanent AI Chat Library

- **Database Source of Truth:** Reuses `public.conversations` and `public.messages` in Supabase PostgreSQL (`apps/api/src/services/chatLibrary.service.ts`), with `user_settings` (`chat_library_v1`) as secondary DB backup.
- **Hardening (`supabase/migrations/0004_chat_library_hardening.sql`):**
  - Adds `client_message_id TEXT` and unique partial index `idx_messages_conversation_client_id` on `(conversation_id, client_message_id)` to prevent duplicate messages on double-clicks or retries.
  - Adds `idx_conversations_updated_at` and `idx_conversations_user_title` for fast sorting and DB-backed search.
- **Features:**
  - `listConversations(userId, channel, { q, limit, offset })`: PostgreSQL `.ilike('title', ...)` search + pagination.
  - `getConversationMessages(conversationId, userId, { limit, before })`: Verifies `conversations.user_id === uid` ownership and supports cursor pagination (`before`), returning chronological messages.
  - `appendChatMessage(...)`: Deduplicates by `clientMessageId`, verifies ownership, inserts message, updates `last_message_at`, `updated_at`, and `message_count`.
  - **Frontend (`apps/web/src/pages/AIChatPage.tsx`):** Persists `karen_active_conversation_id` and `karen_chat_library_v1` in `localStorage` for instant load across menu switches, auto-resumes the latest chat so new chats are only created on the first message or manual **NEW** click, includes a DB-backed search input, double-send lock (`sendingLockRef`), and a visible **Retry** banner if saving fails.
  - **Telegram Auto-Save:** Telegram conversations are also persisted to `chatLibrary.service.ts` under `channel: 'telegram'`.

---

## 7. Love & Comfort Mode (`apps/api/src/services/loveMode.service.ts`)

- **Purpose:** Girlfriend-style emotional companion speaking natural **Thanglish + English**, listening patiently before offering advice, adapting to the user's language, and persisting state in Supabase `user_settings` (`love_mode_<chatId>`).
- **Activation:**
  - Commands: `/love`, `/comfort`, `/lonely`
  - Natural language: e.g., `"I feel lonely"`, `"I need you"`, `"I'm feeling down"`, `"romba kastama irukku"`, `"yaar kittayum solla mudiyala"`
  - Web UI toggle: `/love-mode` (`apps/web/src/pages/LoveModePage.tsx`) and inside `/ai-chat`
- **Deactivation:** `/endlove`, `/normal`, `"stop love mode"`, `"let's talk normally"`
- **Emotional Safety:** Never shames, manipulates, or encourages isolation; for self-harm expressions, responds compassionately and provides India crisis helplines (iCare `9152987821`, Vandrevala Foundation `1860-2662-345`).

---

## 8. Google Classroom Integration — Student Edition (`apps/api/src/services/classroom.service.ts`)

- **Official API:** Google Classroom REST API v1 (`https://classroom.googleapis.com/v1`) with pagination (`nextPageToken`), quota-safe `429` retry, parallel course syncing, and 6s per-request timeout.
- **OAuth Scopes:** `classroom.courses.readonly`, `classroom.coursework.me.readonly`, `classroom.announcements.readonly`, `classroom.rosters`.
- **Capabilities:**
  - **Courses & Announcements:** Lists active/archived courses, teachers (when permitted), Classroom links, and announcements (with Gemini summarization).
  - **Assignments & Grades:** Categorizes into `new`, `pending`, `submitted`, `graded`, `overdue`; keeps personal task status (`todo`, `in_progress`, `done`) strictly separate from official Classroom submission status; never treats missing grade as `0`.
  - **Join Class:** `joinClassroomByCodeOrLink` enrolls via `POST /v1/courses/{courseId}/students?enrollmentCode={code}` (from Classroom invite links `classroom.google.com/c/...?cjc=...` or `courseId + code`) and accepts pending invitations.
  - **Notifications:** Deduplicated Telegram alerts with inline buttons (`View Assignment`, `Explain`, `Remind Later`, `Start Preparation`, `View Topics`) for new assignments, grades, announcements, `3d`/`1d`/`3h`/overdue deadlines, and exam alerts (`1d` before + exam morning), respecting quiet hours.
  - **Gemini Academic Assistants:** English/Thanglish assignment explanations, `.md`/`.txt` AI study draft generation (never auto-submitted), and **Last-Minute Exam Preparation Mode ONLY** (cram plan, short notes, quiz, mock test, topic checklist — **no daily study timetables**).
- **Dashboard (`apps/web/src/pages/ClassroomPage.tsx`):** Single-call `/classroom/bundle` + `localStorage` cache (`karen_classroom_bundle_v1`) with 7 tabs: Overview, My Classes (with Join Class form), Assignments, Exam Prep, Grades, Notifications, Settings.

---

## 9. Google Drive & Gmail (`apps/api/src/routes/googleDrive.ts`)

- Shared Google OAuth 2.0 flow (`/api/v1/auth/google/callback`) with encrypted token storage in `provider_connections` and `user_settings`, automatic refresh-token renewal, and OAuth token revocation (`disconnectGoogleAccount`).
- Drive file search/listing (`/drive/files`) and attachment/link sharing via Gmail (`/gmail/*` and `[[SEND_EMAIL]]`) or Instagram.

---

## 10. Telegram Bot & Notification Systems (`apps/api/src/providers/telegram.ts`)

- **Transport:** Webhook (`POST /api/v1/telegram/webhook` with `X-Telegram-Bot-Api-Secret-Token` timing-safe check) for Vercel production, plus polling for local development. Owner-only authorization via `TELEGRAM_OWNER_CHAT_ID`.
- **Supported Commands:**
  - Core: `/start`, `/help`, `/status`, `/chat`, `/clear`, `/memory`, `/tasks`, `/task`, `/digest`, `/approve`, `/reject`, `/whatsapp`, `/instagram`, `/drive`, `/settings`
  - Instagram: `/insta <command>` + natural-language DM/inbox detection
  - Love Mode: `/love`, `/comfort`, `/lonely`, `/endlove`, `/normal`
  - Google Classroom: `/classroom`, `/classes`, `/joinclass`, `/assignments`, `/pending`, `/overdue`, `/deadlines`, `/announcements`, `/grades`, `/exams`, `/examprep`, `/explain`, `/connectclassroom`, `/disconnectclassroom`, `/classroomsettings`
- **Supporting Services:**
  - `notificationEngine.service.ts`: Priority classification (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), quiet hours bypass for critical alerts, deduplication, retry tracking, and inline Telegram action callbacks.
  - `dailyCompanion.service.ts`: Idempotent `Asia/Kolkata` greetings (`morning`, `afternoon`, `evening`, `night`) triggered via `/api/v1/cron/companion-tick` or local scheduler.

---

## 11. Instagram, WhatsApp & Voice

- **Instagram (`apps/api/src/providers/instagram.ts`, `routes/instagram.ts`, `services/instagramAutoReply.ts`):** Meta Graph API v21.0 integration for profile, media, DM threads, sending DMs, AI reply drafting, voice/text command orchestration (`executeInstagramVoiceCommand`), `KNOWN_CONTACTS` fuzzy resolution, and VIP auto-reply rules.
- **WhatsApp (`apps/web/src/pages/WhatsAppPage.tsx`):** Meta Cloud API configuration status and management UI.
- **Voice (`apps/api/src/voice/policy.ts`):** Enforces female-only ElevenLabs voice synthesis (`VOICE_FEMALE_CONFIRMED`), disabling male/fallback voices.

---

## 12. Database Schema & Migrations (`supabase/migrations/`)

| Migration | Purpose |
| :--- | :--- |
| `0001_karen_core.sql` | Initial core tables (`profiles`, `contacts`, `provider_events`, `notifications`, `memories`, `documents`, `approval_queue`, `audit_logs`, `integration_settings`) |
| `0002_karen_ultra_complete.sql` | Full schema: `user_settings`, `provider_connections`, `conversations`, `messages`, `contact_preferences`, `notification_preferences`, `document_chunks`, `document_jobs`, `tasks`, `reminders`, `automation_rules`, `automation_runs`, `approval_requests`, `external_events`, `webhook_events`, `api_usage`, `security_events`, `email_cache`, `drive_files`, `voice_sessions`, indexes, `updated_at` triggers, and RLS policies (`auth.uid() = user_id`) |
| `0003_karen_seed.sql` | Default seed data |
| `0004_chat_library_hardening.sql` | Additive Chat Library indexes & `client_message_id` deduplication index |

---

## 13. API Endpoint Reference (`/api/v1/*`)

Mounted in `apps/api/src/routes/index.ts`:
- **Health & Integrations:** `GET /health`, `GET /integrations/status` (`health.ts`, `integrations.ts`)
- **Auth:** `GET /auth/status`, `POST /auth/bootstrap`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (`auth.ts`)
- **AI & Chat Library:** `GET /ai/models`, `POST /ai/chat`, `GET /ai/conversations`, `POST /ai/conversations`, `GET /ai/conversations/:id/messages`, `POST /ai/conversations/:id/messages`, `DELETE /ai/conversations/:id`, `GET /voice/status`, `POST /voice/synthesize` (`ai.ts`)
- **Love Mode:** `GET /love-mode/status`, `POST /love-mode/activate`, `POST /love-mode/deactivate`, `POST /love-mode/reset` (`loveMode.ts`)
- **Google Classroom:** `GET /classroom/status`, `GET /classroom/auth-url`, `POST /classroom/disconnect`, `POST /classroom/sync`, `GET /classroom/overview`, `GET /classroom/bundle`, `GET /classroom/courses`, `POST /classroom/join`, `GET /classroom/assignments`, `PATCH /classroom/assignments/:id/personal-status`, `POST /classroom/assignments/:id/explain`, `POST /classroom/assignments/:id/draft`, `GET /classroom/announcements`, `POST /classroom/announcements/:id/summarize`, `GET /classroom/grades`, `GET /classroom/exams`, `POST /classroom/exams`, `DELETE /classroom/exams/:id`, `POST /classroom/exams/:id/topics/:index/toggle`, `POST /classroom/exam-prep`, `GET /classroom/settings`, `PUT /classroom/settings` (`classroom.ts`)
- **Google Drive & Gmail:** `GET /auth/google/callback`, `/drive/*`, `/gmail/*` (`googleDrive.ts`)
- **Telegram:** `/telegram/status`, `/telegram/register-webhook`, `/telegram/delete-webhook`, `/telegram/start-polling`, `/telegram/stop-polling`, `/telegram/set-commands`, `/telegram/send`, `/telegram/notifications/*`, `/telegram/companion/*`, `POST /telegram/webhook` (`telegram.ts`)
- **Instagram:** `/instagram/*` (`instagram.ts`)
- **Productivity & System:** `/tasks/*` (`tasks.ts`), `/memories/*` (`memories.ts`), `/documents/*` (`documents.ts`), `/notifications/*` (`notifications.ts`), `/activity/*` (`activity.ts`), `/skills/*` (`skills.ts`)
- **Cron Jobs:** `GET|POST /cron/morning-briefing`, `GET|POST /cron/companion-tick`, `POST /cron/greeting/:slot`, `GET|POST /cron/classroom-sync` (`cron.ts`)

---

## 14. Frontend Dashboard & Performance (`apps/web`)

- **Pages (23 lazy-loaded routes in `App.tsx`):** Overview (`/`), Karen AI Chat (`/ai-chat`), Love & Comfort (`/love-mode`), WhatsApp (`/whatsapp`), Instagram (`/instagram`), Gmail (`/gmail`), Google Drive (`/drive`), Google Classroom (`/classroom`), Personal Memory (`/memory`), Doc Intelligence (`/documents`), Voice Centre (`/voice`), Telegram Tunnel (`/telegram`), Notifications (`/notifications`), Contact Manager (`/contacts`), Automation Centre (`/automation`), Tasks & Reminders (`/tasks`), Scheduled Alarms (`/reminders`), Security Centre (`/security`), API Management (`/api-management`), Database Health (`/database`), System Monitor (`/monitor`), Activity History (`/activity`), Settings (`/settings`), Auth (`/auth`).
- **Performance Optimizations:**
  - `React.lazy` + `Suspense` route code-splitting (initial `index` bundle ~27.7 kB / 8.6 kB gzip).
  - Sidebar hover/focus route chunk prefetching (`apps/web/src/components/layout/Sidebar.tsx`).
  - Synchronous `sessionStorage` token injection + 15s in-memory GET cache with automatic invalidation on mutations (`apps/web/src/lib/api.ts`).

---

## 15. Vercel Deployment, Crons & Environment Variables

### Vercel Crons (`vercel.json` — Hobby Plan Daily Limit Compliant)
- `/api/v1/cron/companion-tick` → `30 1 * * *` (7:00 AM IST daily)
- `/api/v1/cron/classroom-sync` → `0 2 * * *` (7:30 AM IST daily)
- `/api/v1/cron/morning-briefing` → `30 2 * * *` (8:00 AM IST daily)

### Key Environment Variables (`.env.example` & `apps/api/src/config/env.ts`)
- **Core & Auth:** `NODE_ENV`, `PORT`, `APP_URL`, `WEB_ORIGIN`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, `APP_SECRET`, `BOOTSTRAP_SECRET`
- **AI & Search:** `DEFAULT_AI_PROVIDER`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `AUTON_MODEL_ID`, `COPILOT_GITHUB_TOKEN`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`
- **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
- **Google OAuth & Classroom:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLASSROOM_ENABLED`, `GOOGLE_CLASSROOM_SCOPES`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLASSROOM_SYNC_ENABLED`, `GOOGLE_CLASSROOM_SYNC_INTERVAL`, `GOOGLE_CLASSROOM_TIMEZONE`
- **Meta & Voice:** `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_PAGE_ID`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `VOICE_PROVIDER`, `VOICE_API_KEY`, `VOICE_FEMALE_VOICE_ID`, `VOICE_FEMALE_CONFIRMED`, `VOICE_LANGUAGE`

---

## 16. Known Notes & Pending Manual Steps

1. **Supabase Migration `0004`:** Run `supabase/migrations/0004_chat_library_hardening.sql` in the Supabase SQL Editor to enable the `client_message_id` unique deduplication index on `public.messages`.
2. **Google Cloud Console:** Ensure Google Classroom API, Google Drive API, and Gmail API are enabled, and `https://karen-ai-me.vercel.app/api/v1/auth/google/callback` is registered as an Authorized Redirect URI.
3. **Background Worker (`apps/worker`):** Job handlers are scaffolded and registered in `apps/worker/src/index.ts`; queue transport (`BullMQ` / `pg-boss`) is marked `TODO` since production currently runs on Vercel Serverless + Vercel Cron.
