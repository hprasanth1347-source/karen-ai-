---
name: instagram-comment-manager
description: Classify Instagram post comments, draft context-aware public replies, flag/hide spam, and prepare Private Replies (DM) for leads via approval.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - instagram comments
  - comment reply
  - hide spam
  - private reply
allowed_tools:
  - instagram_list_media
  - instagram_list_comments
  - instagram_reply_comment
  - instagram_send_dm
---

# Instagram Comment Manager

## Step-by-Step Workflow
1. List recent media (`instagram_list_media`) and fetch comments (`instagram_list_comments`).
2. Classify comments into `lead`, `question`, `praise`, or `spam`.
3. Draft concise replies or queue Private Reply DMs (`instagram_send_dm`) for leads; require approval for outbound sends.

## Edge Cases
- Respect Meta comment moderation & 24-hour/7-day Private Reply rules.
