# Karen Ultra — System Architecture

## Overview

Karen Ultra is a personal AI operating system architected around an owner-centric, privacy-first model.

```
                  +----------------------------------------------+
                  |                 OWNER ACCESS                 |
                  |  Web (PWA)  •  Voice (STT)  •  Telegram Bot  |
                  +----------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                       KAREN ULTRA COMMAND CORE (Node.js)                        |
|                                                                                 |
|   +-------------------------+  +----------------------+  +------------------+   |
|   |   Zod Input Validation  |  |  Winston Structured  |  |  Rate Limiting   |   |
|   |   & Express Security    |  |  Audit Logging       |  |  & Crypto Utils  |   |
|   +-------------------------+  +----------------------+  +------------------+   |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |                         AI REASONING GATEWAY                            |   |
|   |   - Primary Engine: Groq Cloud (Llama 3.3 70B Versatile)                |   |
|   |   - Multimodal & Tool Engine: Google Gemini 2.0 Flash                   |   |
|   |   - Language Strategy: Thanglish (Tamil in Latin script) default        |   |
|   +-------------------------------------------------------------------------+   |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |                      STRICT VOICE POLICY ENFORCER                       |   |
|   |   - Provider: ElevenLabs Turbo v2.5                                     |   |
|   |   - Voice: Verified Female ID Only                                      |   |
|   |   - Policy: Never fallback to male or generic browser speech            |   |
|   +-------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+-------------------+          +-------------------+           +-------------------+
|     DATABASE      |          | EXTERNAL SERVICES |           | BACKGROUND WORKER |
|  Supabase 16 PG   |          | - WhatsApp Cloud  |           | BullMQ / Tsx Jobs |
|  22 Locked Tables |          | - Instagram Graph |           | - Drive Sync      |
|  Strict RLS       |          | - Gmail OAuth2    |           | - Email Digest    |
|  Owner Isolation  |          | - Google Drive    |           | - Doc Citations   |
+-------------------+          +-------------------+           +-------------------+
```

## Security Model

1. **Owner-Only Authentication:** Only the owner can access the system. No public signups.
2. **Database Isolation:** Supabase Row Level Security (RLS) is applied to all 22 relational tables.
3. **Sensitive Data Protection:** Identity information, banking details, and credentials are encrypted at rest with AES-256-GCM.
4. **Secret Containment:** Provider credentials remain server-side in `.env` and are never exposed to the frontend.
