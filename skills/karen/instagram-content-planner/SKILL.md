---
name: instagram-content-planner
description: Plan Instagram posts, Reels ideas, captions, and hashtags using account media and insights data, queuing publishing actions for owner approval.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - instagram post
  - reel idea
  - caption
  - hashtags
  - content plan
allowed_tools:
  - instagram_list_media
  - instagram_get_insights
  - tasks_create
---

# Instagram Content Planner

## Step-by-Step Workflow
1. Inspect recent media (`instagram_list_media`) and insights (`instagram_get_insights`).
2. Identify top-performing formats and engagement patterns.
3. Propose captions, hooks, hashtags, and posting slots tailored to the owner's niche.
4. Optionally create content tasks via `tasks_create`; never publish without explicit owner approval.

## Examples
- *"Give me 3 Reel ideas based on my recent posts."* -> Fetch media/insights first, cite real metrics, then propose 3 ideas.

## Edge Cases
- If insights permissions are missing, state the exact missing permission instead of inventing reach/impression numbers.
