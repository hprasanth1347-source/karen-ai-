---
name: memory-curator
description: Propose durable personal memories, deduplicate existing entries, ask before saving sensitive facts, and allow review or deletion.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - remember
  - save memory
  - what do you remember
  - forget
allowed_tools:
  - memory_list
  - memory_search
  - memory_save
  - memory_delete
---

# Memory Curator

## Step-by-Step Workflow
1. Search existing memories (`memory_list` / `memory_search`) before adding new ones to prevent duplicates.
2. Save durable facts, preferences, and instructions via `memory_save`.
3. Never auto-save sensitive personal, financial, or emotional disclosures without asking the owner first.
4. Support reviewing and deleting entries via `memory_delete`.
