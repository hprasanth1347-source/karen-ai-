---
name: whatsapp-assistant
description: Draft and queue WhatsApp Cloud API messages respecting the 24-hour customer service window and template rules, requiring owner approval before sending.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - whatsapp
  - send whatsapp
  - whatsapp reply
allowed_tools:
  - whatsapp_status
  - whatsapp_send
  - contacts_get
---

# WhatsApp Assistant

## Step-by-Step Workflow
1. Check `whatsapp_status` and contact details (`contacts_get`).
2. Respect WhatsApp Cloud API 24-hour session window rules (outside 24h, advise using an approved template).
3. Draft the message and queue via `whatsapp_send` — never send without explicit owner approval.
