---
name: contact-manager
description: Manage contacts, deduplicate entries, maintain VIP/blocked rules, and store per-contact notes used by DM and email skills.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - contact
  - vip
  - add note
  - block contact
allowed_tools:
  - contacts_list
  - contacts_get
  - contacts_upsert
---

# Contact Manager

## Step-by-Step Workflow
1. Search existing contacts (`contacts_list` / `contacts_get`) before adding new entries to avoid duplicates.
2. Update VIP status, platform handles, or per-contact notes via `contacts_upsert`.
3. Never expose contact lists externally.
