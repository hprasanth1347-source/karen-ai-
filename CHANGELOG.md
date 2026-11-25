# Changelog — Karen Ultra

All notable changes and milestones are documented in this file.

## [1.0.0] - 2026-11-23

### Added
- **Complete Monorepo Architecture:** `apps/web` (React/Vite), `apps/api` (Express/TS), `apps/worker` (Job runner), and `packages/shared` (Shared types & schemas).
- **Neuro-Brutalist Design System:** Warm cream canvas (`#FAF7F0`), coral primary actions (`#FF6B6B`), electric blue, yellow, mint and violet accents, bold Inter typography, black outlines (`border-3 border-ink`), and offset shadows (`shadow-brutal`).
- **All 20 Functional UI Modules:**
  1. Overview Dashboard
  2. Karen AI Chat (Thanglish / Tamil / English)
  3. WhatsApp Manager (Meta Cloud API & Unknown Contact Policy)
  4. Instagram Manager (Creator DM Hub & Meta Policy Disclaimers)
  5. Gmail Manager (Categorization & Daily Digest)
  6. Google Drive Document Vault (with Sensitive Data Masking)
  7. Personal Memory Vault (User-confirmed facts & instructions)
  8. Document Intelligence (Multi-format citations & Q&A)
  9. Voice Centre (Strict female-only policy enforcement)
  10. Telegram Tunnel (Owner-only Bot pairing)
  11. Notification Centre (Priority filters & Asia/Kolkata quiet hours)
  12. Contact Manager (Unified identity & language rules)
  13. Automation Centre (Rule builder with bounded permissions)
  14. Tasks & Reminders (Task board with auto-source tagging)
  15. Scheduled Alarms (IST timezone & recurrence)
  16. Security Centre (22 RLS tables, session audit, AES-256)
  17. API Management (Provider credentials & secret masking)
  18. Database Architecture (Supabase PostgreSQL audit)
  19. System Diagnostics (Heartbeat, latency, port telemetry)
  20. Activity History (Tamper-resistant audit log)
- **Supabase PostgreSQL Schema:** 22 complete tables in `supabase/migrations/0002_karen_ultra_complete.sql` with full Row Level Security (RLS) policies and automated `updated_at` triggers.
- **Strict Female Voice Policy:** ElevenLabs verified female ID requirement; fallback to generic or male voices is strictly blocked.
- **Multi-Provider AI Architecture:** Fallback-ready integration supporting Groq (Llama 3.3 70B) and Google Gemini 2.0 Flash.
