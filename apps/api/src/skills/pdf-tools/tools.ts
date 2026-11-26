import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDoc, degrees, rgb, StandardFonts } from 'pdf-lib';
import { storeGeneratedSkillFile } from '../storage.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { pdfToolsInstructions, pdfToolsMeta } from './meta.js';

const createPdfInput = z.object({
  fileName: z.string().min(1).max(120).default('document.pdf'),
  title: z.string().min(1).max(200),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        body: z.string().min(1),
      })
    )
    .min(1),
});

const extractPdfInput = z.object({
  base64Content: z.string().min(1),
});

const transformPdfInput = z.object({
  action: z.enum(['merge', 'rotate', 'watermark']),
  fileName: z.string().min(1).max(120).default('output.pdf'),
  base64Pdfs: z.array(z.string().min(1)).min(1),
  rotateDegrees: z.number().int().optional(),
  watermarkText: z.string().optional(),
});

async function renderPdfBuffer(
  title: string,
  sections: Array<{ heading: string; body: string }>,
  brandName: string,
  primaryColor: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(10).fillColor('#64748B').text(brandName, { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(22).fillColor(primaryColor).text(title);
    doc.moveDown(1);

    for (const sec of sections) {
      doc.fontSize(14).fillColor(primaryColor).text(sec.heading);
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#0F172A').text(sec.body, { lineGap: 4 });
      doc.moveDown(1);
    }

    doc.end();
  });
}

export const createPdfTool: SkillToolDefinition<z.infer<typeof createPdfInput>> = {
  name: 'create_pdf',
  description: 'Create a formatted, branded PDF document from title and sections, then verify structure.',
  inputSchema: createPdfInput,
  async execute(args, ctx) {
    const buffer = await renderPdfBuffer(args.title, args.sections, ctx.brand.brandName, ctx.brand.primaryColor);
    // Verification step: reopen with pdf-lib
    const loaded = await PdfLibDoc.load(buffer);
    const pageCount = loaded.getPageCount();
    if (pageCount < 1) {
      return { ok: false, summary: 'PDF verification failed (0 pages)', error: 'Empty PDF generated' };
    }

    const finalName = args.fileName.endsWith('.pdf') ? args.fileName : `${args.fileName}.pdf`;
    const file = await storeGeneratedSkillFile({
      fileName: finalName,
      mimeType: 'application/pdf',
      buffer,
      userId: ctx.userId,
      skillName: 'pdf-tools',
    });

    return {
      ok: true,
      summary: `Created and verified PDF "${finalName}" (${pageCount} page${pageCount > 1 ? 's' : ''}).`,
      files: [file],
    };
  },
};

export const extractPdfTextTool: SkillToolDefinition<z.infer<typeof extractPdfInput>> = {
  name: 'extract_pdf_text',
  description: 'Extract readable text and page count from a base64 PDF.',
  inputSchema: extractPdfInput,
  async execute(args) {
    const buffer = Buffer.from(args.base64Content, 'base64');
    const loaded = await PdfLibDoc.load(buffer);
    const pageCount = loaded.getPageCount();

    const pdfParseModule = (await import('pdf-parse')) as unknown as {
      PDFParse?: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> };
      default?: (buf: Buffer) => Promise<{ text: string }>;
    };

    let text = '';
    if (typeof pdfParseModule.PDFParse === 'function') {
      const parser = new pdfParseModule.PDFParse({ data: buffer });
      const res = await parser.getText();
      text = (res.text || '').trim();
    } else if (typeof pdfParseModule.default === 'function') {
      const res = await pdfParseModule.default(buffer);
      text = (res.text || '').trim();
    }

    if (!text) {
      return {
        ok: true,
        summary: `PDF has ${pageCount} pages, but no extractable text was found (OCR not available for scanned PDFs).`,
        data: { pageCount, text: '', ocrAvailable: false },
      };
    }

    return {
      ok: true,
      summary: `Extracted ${text.length} characters across ${pageCount} PDF pages.`,
      data: { pageCount, text: text.slice(0, 15000), ocrAvailable: true },
    };
  },
};

export const transformPdfTool: SkillToolDefinition<z.infer<typeof transformPdfInput>> = {
  name: 'transform_pdf',
  description: 'Merge multiple PDFs, rotate pages, or add a text watermark.',
  inputSchema: transformPdfInput,
  async execute(args, ctx) {
    let outDoc: PdfLibDoc;
    if (args.action === 'merge') {
      outDoc = await PdfLibDoc.create();
      for (const b64 of args.base64Pdfs) {
        const src = await PdfLibDoc.load(Buffer.from(b64, 'base64'));
        const pages = await outDoc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => outDoc.addPage(p));
      }
    } else {
      outDoc = await PdfLibDoc.load(Buffer.from(args.base64Pdfs[0], 'base64'));
      const pages = outDoc.getPages();
      if (args.action === 'rotate') {
        const angle = args.rotateDegrees ?? 90;
        pages.forEach((p) => p.setRotation(degrees(angle)));
      } else if (args.action === 'watermark') {
        const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
        const text = args.watermarkText || ctx.brand.brandName;
        pages.forEach((p) => {
          const { width, height } = p.getSize();
          p.drawText(text, {
            x: width * 0.2,
            y: height * 0.5,
            size: 36,
            font,
            color: rgb(0.75, 0.75, 0.75),
            rotate: degrees(35),
            opacity: 0.4,
          });
        });
      }
    }

    const bytes = await outDoc.save();
    const buffer = Buffer.from(bytes);
    const verified = await PdfLibDoc.load(buffer);
    const finalName = args.fileName.endsWith('.pdf') ? args.fileName : `${args.fileName}.pdf`;
    const file = await storeGeneratedSkillFile({
      fileName: finalName,
      mimeType: 'application/pdf',
      buffer,
      userId: ctx.userId,
      skillName: 'pdf-tools',
    });

    return {
      ok: true,
      summary: `Completed PDF ${args.action} (${verified.getPageCount()} pages).`,
      files: [file],
    };
  },
};

export const pdfToolsSkill: SkillModule = {
  meta: pdfToolsMeta,
  instructions: pdfToolsInstructions,
  tools: [createPdfTool, extractPdfTextTool, transformPdfTool],
};
