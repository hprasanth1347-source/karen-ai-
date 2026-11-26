import { z } from 'zod';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import mammoth from 'mammoth';
import { storeGeneratedSkillFile } from '../storage.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { wordDocsInstructions, wordDocsMeta } from './meta.js';

const sectionSchema = z.object({
  heading: z.string().min(1).max(200),
  paragraphs: z.array(z.string().min(1)).default([]),
  bullets: z.array(z.string().min(1)).default([]),
  table: z
    .object({
      headers: z.array(z.string()).min(1),
      rows: z.array(z.array(z.string())).default([]),
    })
    .optional(),
});

const createWordDocInput = z.object({
  fileName: z.string().min(1).max(120).default('document.docx'),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  sections: z.array(sectionSchema).min(1),
});

const readWordDocInput = z.object({
  base64Content: z.string().min(1),
});

export const createWordDocTool: SkillToolDefinition<z.infer<typeof createWordDocInput>> = {
  name: 'create_word_doc',
  description: 'Create a branded .docx Word document with headings, paragraphs, bullet lists, tables, and headers/footers.',
  inputSchema: createWordDocInput,
  async execute(args, ctx) {
    const primaryHex = ctx.brand.primaryColor.replace('#', '');
    const accentHex = ctx.brand.accentColor.replace('#', '');
    const children: Array<Paragraph | Table> = [
      new Paragraph({
        text: args.title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 120 },
      }),
    ];

    if (args.subtitle) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: args.subtitle, italics: true, color: accentHex })],
          spacing: { after: 240 },
        })
      );
    }

    for (const sec of args.sections) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: sec.heading, bold: true, color: primaryHex, font: ctx.brand.headingFont })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );

      for (const p of sec.paragraphs) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: p, font: ctx.brand.bodyFont })],
            spacing: { after: 120 },
          })
        );
      }

      for (const b of sec.bullets) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: b, font: ctx.brand.bodyFont })],
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
      }

      if (sec.table && sec.table.headers.length > 0) {
        const headerRow = new TableRow({
          children: sec.table.headers.map(
            (h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF' })] })],
                shading: { fill: primaryHex },
              })
          ),
        });
        const dataRows = sec.table.rows.map(
          (row) =>
            new TableRow({
              children: sec.table!.headers.map(
                (_, idx) =>
                  new TableCell({
                    children: [new Paragraph({ text: row[idx] ?? '' })],
                  })
              ),
            })
        );
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: `${ctx.brand.brandName} — ${args.title}`, size: 18, color: '64748B' })],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: 'Page ', size: 18, color: '64748B' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64748B' }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    // Verification step: reopen generated buffer with mammoth
    const verified = await mammoth.extractRawText({ buffer });
    if (!verified.value || !verified.value.includes(args.title.slice(0, 12))) {
      return {
        ok: false,
        summary: 'Generated .docx failed structure verification',
        error: 'Document verification did not find expected title text',
      };
    }

    const finalName = args.fileName.endsWith('.docx') ? args.fileName : `${args.fileName}.docx`;
    const file = await storeGeneratedSkillFile({
      fileName: finalName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
      userId: ctx.userId,
      skillName: 'word-docs',
    });

    return {
      ok: true,
      summary: `Created and verified Word document "${finalName}" (${args.sections.length} sections).`,
      files: [file],
    };
  },
};

export const readWordDocTool: SkillToolDefinition<z.infer<typeof readWordDocInput>> = {
  name: 'read_word_doc',
  description: 'Extract readable text from an existing .docx file (base64 encoded).',
  inputSchema: readWordDocInput,
  async execute(args) {
    const buffer = Buffer.from(args.base64Content, 'base64');
    const extracted = await mammoth.extractRawText({ buffer });
    return {
      ok: true,
      summary: `Extracted ${extracted.value.length} characters from .docx.`,
      data: { text: extracted.value.slice(0, 15000) },
    };
  },
};

export const wordDocsSkill: SkillModule = {
  meta: wordDocsMeta,
  instructions: wordDocsInstructions,
  tools: [createWordDocTool, readWordDocTool],
};
