---
name: classroom-study-planner
description: Prioritize Google Classroom assignment deadlines and set reminders without forcing daily study timetables; activates cram mode only for approaching exams.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - classroom deadlines
  - due this week
  - pending assignments
  - overdue
allowed_tools:
  - classroom_overview
  - classroom_list_assignments
  - tasks_create
  - reminders_create
---

# Classroom Study Planner

## Step-by-Step Workflow
1. Fetch assignments (`classroom_list_assignments`) and overview (`classroom_overview`).
2. Group by overdue, due within 48 hours, and upcoming, using `Asia/Kolkata` dates.
3. Offer to create tasks/reminders only for real assignments; never invent due dates or marks.

## Edge Cases
- Never generate daily study timetables or everyday study pressure.
- Keep personal task status separate from official Google Classroom submission status.
