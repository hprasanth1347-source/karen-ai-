import type { SkillMeta } from '../types.js';

export const spreadsheetsMeta: SkillMeta = {
  name: 'spreadsheets',
  description: 'Create and inspect .xlsx Excel workbooks with formulas, number formats, column widths, freeze panes, and verified totals.',
  triggerIntents: ['xlsx', 'excel', 'spreadsheet', 'workbook', 'csv to excel', 'budget sheet'],
  allowedAgentTools: ['create_spreadsheet', 'read_spreadsheet'],
  pageAffinity: ['/documents', '/drive', '/chat'],
  outputTypes: ['xlsx'],
};

export const spreadsheetsInstructions = `# Spreadsheets Skill
- Build clean, branded .xlsx workbooks using \`create_spreadsheet\` (supports multiple sheets, headers, typed rows, Excel formulas, number formats, auto-fit column widths, and frozen headers).
- Always verify the workbook by reopening it with exceljs and computing formula totals in code before reporting success.`;
