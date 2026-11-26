---
name: classroom-assignment-explainer
description: Explain Google Classroom assignments in simple English or natural Thanglish, breaking down deliverables and preparing AI-labeled study drafts (never auto-submitted).
version: 1.0.0
license: MIT
type: instruction
triggers:
  - explain assignment
  - assignment draft
  - what should i do
  - explain in thanglish
allowed_tools:
  - classroom_list_assignments
  - classroom_explain
  - classroom_draft
  - documents_create
---

# Classroom Assignment Explainer

## Step-by-Step Workflow
1. Locate the assignment via `classroom_list_assignments`.
2. Call `classroom_explain` (English or Thanglish) using only the teacher's actual instructions, marks, and deadline.
3. If the user asks for a draft, call `classroom_draft` and clearly label it as an AI study draft for review.

## Edge Cases
- Never fabricate citations, lab results, or missing teacher instructions.
- Never auto-submit assignments to Google Classroom.
