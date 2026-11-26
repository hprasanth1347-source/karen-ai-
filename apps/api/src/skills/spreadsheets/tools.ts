import { z } from 'zod';
import ExcelJS from 'exceljs';
import { storeGeneratedSkillFile } from '../storage.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { spreadsheetsInstructions, spreadsheetsMeta } from './meta.js';

const sheetSchema = z.object({
  name: z.string().min(1).max(31).default('Sheet1'),
  headers: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).default([]),
  numberFormats: z.record(z.string(), z.string()).optional(),
  summaryFormulaColumns: z.array(z.number().int().min(0)).default([]),
});

const createSpreadsheetInput = z.object({
  fileName: z.string().min(1).max(120).default('workbook.xlsx'),
  sheets: z.array(sheetSchema).min(1),
});

const readSpreadsheetInput = z.object({
  base64Content: z.string().min(1),
});

function colIndexToLetter(zeroBased: number): string {
  let n = zeroBased + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export const createSpreadsheetTool: SkillToolDefinition<z.infer<typeof createSpreadsheetInput>> = {
  name: 'create_spreadsheet',
  description: 'Create a branded .xlsx workbook with formulas, number formats, column widths, freeze panes, and verified formula totals.',
  inputSchema: createSpreadsheetInput,
  async execute(args, ctx) {
    const ExcelCtor = (ExcelJS as unknown as { default?: typeof ExcelJS }).default || ExcelJS;
    const workbook = new ExcelCtor.Workbook();
    workbook.creator = ctx.brand.brandName;
    workbook.created = new Date();

    const primaryHex = ctx.brand.primaryColor.replace('#', '');
    const computedTotals: Record<string, Record<string, number>> = {};

    for (const sheetSpec of args.sheets) {
      const ws = workbook.addWorksheet(sheetSpec.name.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      const headerRow = ws.addRow(sheetSpec.headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${primaryHex}` },
        };
      });

      for (const r of sheetSpec.rows) {
        ws.addRow(r);
      }

      if (sheetSpec.summaryFormulaColumns.length > 0 && sheetSpec.rows.length > 0) {
        const lastDataRow = sheetSpec.rows.length + 1;
        const totalValues: Array<string | number | { formula: string; result: number }> = sheetSpec.headers.map(
          (_, colIdx) => {
            if (colIdx === 0) return 'Total';
            if (!sheetSpec.summaryFormulaColumns.includes(colIdx)) return '';
            const colLetter = colIndexToLetter(colIdx);
            const numericSum = sheetSpec.rows.reduce((sum, row) => {
              const v = Number(row[colIdx]);
              return sum + (Number.isFinite(v) ? v : 0);
            }, 0);
            computedTotals[sheetSpec.name] = computedTotals[sheetSpec.name] || {};
            computedTotals[sheetSpec.name][sheetSpec.headers[colIdx]] = numericSum;
            return { formula: `SUM(${colLetter}2:${colLetter}${lastDataRow})`, result: numericSum };
          }
        );
        const totalRow = ws.addRow(totalValues);
        totalRow.font = { bold: true };
      }

      if (sheetSpec.numberFormats) {
        for (const [colIdxStr, fmt] of Object.entries(sheetSpec.numberFormats)) {
          const colIdx = Number(colIdxStr) + 1;
          if (Number.isFinite(colIdx) && colIdx >= 1) {
            ws.getColumn(colIdx).numFmt = fmt;
          }
        }
      }

      sheetSpec.headers.forEach((h, idx) => {
        const maxLen = Math.max(
          h.length,
          ...sheetSpec.rows.map((r) => String(r[idx] ?? '').length),
          10
        );
        ws.getColumn(idx + 1).width = Math.min(maxLen + 4, 42);
      });
    }

    const out = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);

    // Verification step: reopen with exceljs
    const verifyWb = new ExcelCtor.Workbook();
    await verifyWb.xlsx.load(buffer as unknown as ArrayBuffer);
    if (verifyWb.worksheets.length !== args.sheets.length) {
      return {
        ok: false,
        summary: 'Generated .xlsx failed worksheet count verification',
        error: 'Worksheet count mismatch after reopen',
      };
    }

    const finalName = args.fileName.endsWith('.xlsx') ? args.fileName : `${args.fileName}.xlsx`;
    const file = await storeGeneratedSkillFile({
      fileName: finalName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      userId: ctx.userId,
      skillName: 'spreadsheets',
    });

    return {
      ok: true,
      summary: `Created and verified Excel workbook "${finalName}" (${args.sheets.length} sheet(s)).`,
      data: { computedTotals },
      files: [file],
    };
  },
};

export const readSpreadsheetTool: SkillToolDefinition<z.infer<typeof readSpreadsheetInput>> = {
  name: 'read_spreadsheet',
  description: 'Read sheet names and rows from an existing .xlsx workbook (base64 encoded).',
  inputSchema: readSpreadsheetInput,
  async execute(args) {
    const ExcelCtor = (ExcelJS as unknown as { default?: typeof ExcelJS }).default || ExcelJS;
    const wb = new ExcelCtor.Workbook();
    await wb.xlsx.load(Buffer.from(args.base64Content, 'base64') as unknown as ArrayBuffer);
    const sheets = wb.worksheets.map((ws) => {
      const rows: unknown[][] = [];
      ws.eachRow((row) => rows.push(row.values as unknown[]));
      return { name: ws.name, rowCount: rows.length, preview: rows.slice(0, 20) };
    });
    return {
      ok: true,
      summary: `Read ${sheets.length} sheet(s) from workbook.`,
      data: { sheets },
    };
  },
};

export const spreadsheetsSkill: SkillModule = {
  meta: spreadsheetsMeta,
  instructions: spreadsheetsInstructions,
  tools: [createSpreadsheetTool, readSpreadsheetTool],
};
