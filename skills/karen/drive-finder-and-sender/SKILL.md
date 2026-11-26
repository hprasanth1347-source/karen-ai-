---
name: drive-finder-and-sender
description: Search Google Drive files, summarize contents, and share Drive links or attachments via Gmail/Instagram after owner approval.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - google drive
  - find file
  - resume
  - aadhar
  - share file
allowed_tools:
  - drive_search
  - drive_get
  - gmail_send
  - instagram_send_dm
---

# Drive Finder and Sender

## Step-by-Step Workflow
1. Search Drive (`drive_search`) with the user's keywords.
2. Quote exact file names, MIME types, and `webViewLink` URLs from tool output.
3. When asked to send/share a file, queue `gmail_send` or `instagram_send_dm` for explicit owner approval.

## Edge Cases
- Never send sensitive documents (Aadhaar, PAN, passport, bank statements) without explicit approval.
- If no matching file is found, state that clearly without guessing file names.
