# Spreadsheets Skill

Use this playbook to create or inspect `.xlsx` Excel workbooks.

## Design Rules
- Use dynamic Excel formulas (`SUM`, `AVERAGE`, `COUNT`, etc.) for totals and summaries rather than hardcoded totals.
- Format currency/percent/date columns explicitly, set readable column widths, freeze the header row, and style headers with the owner's brand color.
- Reopen the workbook with `exceljs` and verify computed formula results in code before reporting success.
