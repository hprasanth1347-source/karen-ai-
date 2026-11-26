---
name: task-planner-and-reminder-manager
description: Break goals into actionable tasks with due dates and priorities, and schedule Asia/Kolkata reminders.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - create task
  - add reminder
  - break down goal
  - schedule reminder
allowed_tools:
  - tasks_list
  - tasks_create
  - tasks_update
  - reminders_create
---

# Task Planner and Reminder Manager

## Step-by-Step Workflow
1. Check existing tasks (`tasks_list`) to avoid duplicates.
2. Break complex requests into concrete tasks (`tasks_create`) with `Asia/Kolkata` due dates (`YYYY-MM-DD`) and priorities (`low` | `medium` | `high` | `urgent`).
3. Create time-specific alerts via `reminders_create`.
