---
name: daily-briefing
description: Compile a concise morning/daily briefing across Tasks, Gmail, Google Classroom, Instagram DMs, and Asia/Kolkata schedule, and deliver to Telegram.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - morning briefing
  - daily briefing
  - digest
  - today summary
allowed_tools:
  - tasks_list
  - gmail_list
  - classroom_overview
  - instagram_list_threads
  - telegram_send
---

# Daily Briefing

## Step-by-Step Workflow
1. Read active tasks (`tasks_list`), unread emails (`gmail_list`), Classroom deadlines (`classroom_overview`), and recent Instagram DMs (`instagram_list_threads`).
2. Summarize only verified counts, deadlines, and senders in crisp bullets (`Asia/Kolkata` timezone).
3. Deliver to Telegram via `telegram_send` when requested.
