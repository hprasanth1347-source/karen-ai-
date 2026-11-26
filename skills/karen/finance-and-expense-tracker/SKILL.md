---
name: finance-and-expense-tracker
description: Optional expense tracker (disabled by default) to parse owner-uploaded receipts/statements, categorize spending, and summarize budgets without sharing externally.
version: 1.0.0
license: MIT
type: instruction
enabled: false
triggers:
  - expense
  - receipt
  - budget
  - spending
allowed_tools:
  - documents_list
  - documents_get
---

# Finance and Expense Tracker

## Step-by-Step Workflow
1. Read only receipts or statements explicitly uploaded by the owner (`documents_list`, `documents_get`).
2. Categorize transactions and compute totals strictly from parsed numbers.
3. Never send financial data to any external email, DM, or third-party service.
