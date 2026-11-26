---
name: exam-prep
description: Last-Minute Exam Preparation Mode ONLY — generates hour-by-hour cram plans, short notes, MCQs, 2/5/10-mark questions, and mock tests from Classroom/Drive/Document Vault materials.
version: 1.0.0
license: MIT
type: instruction
triggers:
  - exam tomorrow
  - exam prep
  - last minute
  - prepare me for
  - cram
allowed_tools:
  - classroom_list_exams
  - classroom_exam_prep
  - documents_list
  - drive_search
  - reminders_create
---

# Last-Minute Exam Prep

## Step-by-Step Workflow
1. Check tracked exam dates (`classroom_list_exams`) and ask/infer available hours.
2. Gather relevant course topics, uploaded notes (`documents_list`), or Drive files (`drive_search`).
3. Run `classroom_exam_prep` to generate a realistic cram kit (short notes, definitions, MCQs, 2/5/10-mark questions, mock test).

## Edge Cases
- Do NOT create daily study schedules.
- Never claim to know the actual exam paper or guarantee exact questions.
