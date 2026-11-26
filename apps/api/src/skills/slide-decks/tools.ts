import { z } from 'zod';
import PptxGenJS from 'pptxgenjs';
import { parseOffice } from 'officeparser';
import { storeGeneratedSkillFile } from '../storage.js';
import type { SkillModule, SkillToolDefinition } from '../types.js';
import { slideDecksInstructions, slideDecksMeta } from './meta.js';

const slideSpecSchema = z.object({
  layout: z.enum(['title', 'content', 'two_column', 'chart']).default('content'),
  title: z.string().min(1).max(160),
  subtitle: z.string().max(240).optional(),
  bullets: z.array(z.string().min(1)).default([]),
  rightBullets: z.array(z.string().min(1)).default([]),
  speakerNotes: z.string().max(1000).optional(),
  chart: z
    .object({
      type: z.enum(['bar', 'line', 'pie']).default('bar'),
      labels: z.array(z.string()).min(1),
      values: z.array(z.number()).min(1),
      seriesName: z.string().default('Series 1'),
    })
    .optional(),
});

const createSlideDeckInput = z.object({
  fileName: z.string().min(1).max(120).default('presentation.pptx'),
  deckTitle: z.string().min(1).max(160),
  slides: z.array(slideSpecSchema).min(1).max(30),
});

const readSlideDeckInput = z.object({
  base64Content: z.string().min(1),
});

export const createSlideDeckTool: SkillToolDefinition<z.infer<typeof createSlideDeckInput>> = {
  name: 'create_slide_deck',
  description: 'Create a branded .pptx presentation with title, content, two-column, and chart layouts plus speaker notes.',
  inputSchema: createSlideDeckInput,
  async execute(args, ctx) {
    const PptxCtor = ((PptxGenJS as unknown as { default?: unknown }).default || PptxGenJS) as new () => {
      layout: string;
      title: string;
      author: string;
      ChartType: { line: unknown; pie: unknown; bar: unknown };
      addSlide: () => any;
      write: (opts: { outputType: string }) => Promise<unknown>;
    };
    const pptx = new PptxCtor();
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = args.deckTitle;
    pptx.author = ctx.brand.brandName;

    const primaryHex = ctx.brand.primaryColor.replace('#', '');
    const accentHex = ctx.brand.accentColor.replace('#', '');
    const bgHex = ctx.brand.backgroundColor.replace('#', '');
    const textHex = ctx.brand.textColor.replace('#', '');

    for (const s of args.slides) {
      const slide = pptx.addSlide();
      slide.background = { color: bgHex };

      if (s.layout === 'title') {
        slide.addText(s.title, {
          x: 0.8,
          y: 1.8,
          w: 8.4,
          h: 1.2,
          fontSize: 34,
          bold: true,
          color: primaryHex,
          fontFace: ctx.brand.headingFont,
        });
        if (s.subtitle) {
          slide.addText(s.subtitle, {
            x: 0.8,
            y: 3.1,
            w: 8.4,
            h: 0.8,
            fontSize: 18,
            color: accentHex,
            fontFace: ctx.brand.bodyFont,
          });
        }
      } else {
        slide.addText(s.title, {
          x: 0.6,
          y: 0.4,
          w: 8.8,
          h: 0.7,
          fontSize: 24,
          bold: true,
          color: primaryHex,
          fontFace: ctx.brand.headingFont,
        });

        if (s.layout === 'two_column') {
          const leftText = (s.bullets.length ? s.bullets : ['Key point']).map((b) => `• ${b}`).join('\n');
          const rightText = (s.rightBullets.length ? s.rightBullets : ['Details']).map((b) => `• ${b}`).join('\n');
          slide.addText(leftText, {
            x: 0.6,
            y: 1.3,
            w: 4.2,
            h: 3.8,
            fontSize: 15,
            color: textHex,
            fontFace: ctx.brand.bodyFont,
            valign: 'top',
          });
          slide.addText(rightText, {
            x: 5.1,
            y: 1.3,
            w: 4.2,
            h: 3.8,
            fontSize: 15,
            color: textHex,
            fontFace: ctx.brand.bodyFont,
            valign: 'top',
          });
        } else if (s.layout === 'chart' && s.chart) {
          const chartType =
            s.chart.type === 'line'
              ? pptx.ChartType.line
              : s.chart.type === 'pie'
                ? pptx.ChartType.pie
                : pptx.ChartType.bar;
          slide.addChart(
            chartType,
            [{ name: s.chart.seriesName, labels: s.chart.labels, values: s.chart.values }],
            { x: 0.8, y: 1.3, w: 8.4, h: 3.8, chartColors: [primaryHex, accentHex] }
          );
        } else {
          const bodyBullets = (s.bullets.length ? s.bullets : [s.subtitle || s.title])
            .map((b) => `• ${b}`)
            .join('\n');
          slide.addText(bodyBullets, {
            x: 0.6,
            y: 1.3,
            w: 8.8,
            h: 3.8,
            fontSize: 16,
            color: textHex,
            fontFace: ctx.brand.bodyFont,
            valign: 'top',
          });
        }
      }

      if (s.speakerNotes) {
        slide.addNotes(s.speakerNotes);
      }
    }

    const out = await pptx.write({ outputType: 'nodebuffer' });
    const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);

    // Verification step: reopen generated deck with officeparser
    const extracted = await parseOffice(buffer);
    if (!extracted || String(extracted).trim().length === 0) {
      return {
        ok: false,
        summary: 'Generated .pptx failed verification (no readable slide text)',
        error: 'Empty presentation text after parseOfficeAsync',
      };
    }

    const finalName = args.fileName.endsWith('.pptx') ? args.fileName : `${args.fileName}.pptx`;
    const file = await storeGeneratedSkillFile({
      fileName: finalName,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer,
      userId: ctx.userId,
      skillName: 'slide-decks',
    });

    return {
      ok: true,
      summary: `Created and verified PowerPoint deck "${finalName}" with ${args.slides.length} slides.`,
      files: [file],
    };
  },
};

export const readSlideDeckTool: SkillToolDefinition<z.infer<typeof readSlideDeckInput>> = {
  name: 'read_slide_deck',
  description: 'Extract text from an existing .pptx presentation (base64 encoded).',
  inputSchema: readSlideDeckInput,
  async execute(args) {
    const buffer = Buffer.from(args.base64Content, 'base64');
    const text = String(await parseOffice(buffer));
    return {
      ok: true,
      summary: `Extracted ${text.length} characters from .pptx deck.`,
      data: { text: text.slice(0, 15000) },
    };
  },
};

export const slideDecksSkill: SkillModule = {
  meta: slideDecksMeta,
  instructions: slideDecksInstructions,
  tools: [createSlideDeckTool, readSlideDeckTool],
};
