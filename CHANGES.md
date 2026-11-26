# Changes Summary

## Native Built-In Skills (`apps/api/src/skills/`)
Replaced the external runner, `/skills` UI, and `routes/skills.ts` with 24 compiled-in TypeScript skills:
- **Document Skills**: `word-docs` (`create_word_doc`, `read_word_doc`), `pdf-tools` (`create_pdf`, `extract_pdf_text`, `transform_pdf`), `slide-decks` (`create_slide_deck`, `read_slide_deck`), `spreadsheets` (`create_spreadsheet`, `read_spreadsheet`).
- **Writing Skills**: `my-brand` (`get_brand_settings`, `update_brand_settings`), `business-writing` (`queue_business_email_approval`), `doc-coauthor` (`save_coauthored_doc`), `thanglish-writer` (`format_thanglish_draft`).
- **Real-Work Skills**: `instagram-dm-reply`, `instagram-content`, `instagram-comments`, `gmail-assistant`, `drive-assistant`, `classroom-planner`, `classroom-explainer`, `exam-prep`, `daily-briefing`, `task-planner`, `memory-curator`, `doc-summarizer`, `meeting-notes`, `whatsapp-assistant`, `contacts`, `comfort-mode-safe`.

## Google Custom Search & Grounding (`apps/api/src/services/search.service.ts`)
- Rewrote `searchWebWithGoogle` with typed error reporting (`not_configured`, `forbidden`, `quota_exceeded`, `over_daily_budget`, `server_error`, `timeout`), 6s timeout, 1 retry on 5xx/timeout, SSRF-protected HTML page enrichment (`cheerio`), `<untrusted_content source="web">` wrapping, and `[[...]]` tag stripping.
- Added history-aware `rewriteSearchQuery`, `shouldSearchWeb`, Supabase `search_cache` & `search_usage` (`supabase/migrations/0008_search_cache_and_usage.sql`), 80% Telegram quota alert, `GET /api/v1/integrations/search-status`, and Monitor/Settings diagnostics UI.
- Removed `apps/api/src/providers/ai.ts`, `apps/api/src/routes/skills.ts`, `apps/skill-runner`, and Documents page skill labels.

## Environment Variables
- `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`, `SEARCH_DAILY_LIMIT` (default `90`).

## Command Understanding Engine (`apps/api/src/commands/`)
- Replaced all regex intent branches in `apps/api/src/providers/telegram.ts` with `runCommandEngine` (`apps/api/src/commands/engine.ts`), also wired into `POST /api/v1/ai/chat`.
- Added Supabase migration `0009_command_engine.sql` (`pending_actions`, `command_macros`, `chat_command_state`, `telegram_updates_dedupe`).
- Added `apps/api/src/services/gmail.service.ts` (metadata batch list + full-on-open read) and `apps/api/src/services/driveUpload.service.ts` (`drive.file` scope, SSRF-safe Telegram download, duplicate detection, folder confirmation).
- Added `/macros`, `/cancel`, dynamic `/help` from `COMMAND_TOOLS`, Groq Whisper voice transcription, and atomic `claimPendingActionById` double-tap protection.
- Verified with `apps/api/src/commands/engine.test.ts` (120+ phrasings >=95% accuracy + behavior tests).

## Join by Class ID (Google Classroom)
- Refactored `joinClassroom` (`apps/api/src/services/classroom.service.ts`) with explicit modes (`link`, `id_code`, `invitation`), URL-safe base64 slug decoding (`decodeCourseIdFromClassroomSlug`), Zod validation, preflight enrolled/archived checks, Google error mapping (`WRONG_CODE`, `COURSE_NOT_FOUND`, `COURSE_ARCHIVED`, `MISSING_ROSTER_SCOPE`, `DOMAIN_RESTRICTION`, `TIMEOUT`), audit logging, and Telegram notification.
- Updated `POST /api/v1/classroom/join` & added `GET /api/v1/classroom/invitations` (`apps/api/src/routes/classroom.ts`).
- Replaced single join input in `apps/web/src/pages/ClassroomPage.tsx` with 3 segmented modes (`Invite link`, `Class ID + code`, `Pending invitations`), live URL/slug decoding, accessible labels + `aria-live`, 16px mobile inputs, Reconnect Google button, and Recent Joins list.
- Added `/joinclass` guided flow and confirmation cards in `apps/api/src/providers/telegram.ts` and `apps/api/src/commands/`.
- Verified with `apps/api/src/services/classroomJoin.test.ts`.

## UI Design System, Dark Mode, Accessibility & Mobile Shell (`apps/web`)
- Replaced render-blocking font `@import` with CSS variables (`--cream`, `--surface`, `--ink`, `--coral`, `--teal`, `--yellow`, `--mint`, `--danger`, `--warning`, `--success`, `--info`) in `apps/web/src/styles.css` and `tailwind.config.js`, plus no-flash inline dark mode script in `apps/web/index.html`.
- Fixed WCAG 2.2 AA contrast on Coral/Teal buttons (ink `#0A0A0A` text) and added `scripts/check-contrast.mjs` (`npm run check:contrast`).
- Added `Skeleton`, `BottomSheet`, `PageHeader`, `SegmentedControl` primitives, `BottomNav` mobile 5-item bar, `Skip to main content` link, `min-h-dvh`, `16px` mobile inputs, `44px` coarse-pointer targets, `Topbar` theme toggle + live user initial, `/design-system` showcase route, `docs/ui-design.md`, and `docs/ui-qa.md`.
