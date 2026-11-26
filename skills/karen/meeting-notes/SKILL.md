---
name: meeting-notes
description: Convert raw meeting notes or transcripts into structured summaries, decisions, and assigned tasks.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - meeting notes
  - action items
  - transcript
allowed_tools:
  - tasks_create
  - documents_create
  - memory_save
---

# Meeting Notes

## Step-by-Step Workflow
1. Parse attendees, key decisions, open questions, and action items from the provided notes.
2. Create tasks (`tasks_create`) for each concrete action item with due dates if mentioned.
3. Optionally save the structured summary to Document Vault (`documents_create`).
