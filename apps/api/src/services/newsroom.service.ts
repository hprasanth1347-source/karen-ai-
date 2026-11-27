import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { aiProviderManager } from './aiProviderManager.service.js';
import { sendTelegramDocument, sendTelegramMessage } from '../providers/telegram.js';
import { uploadFileToDrive } from './driveUpload.service.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  detectChatbotOrPromptLeakage,
  hasTamilUnicode,
  isLocalFallbackProvider,
  validateNewspaperArticle,
} from './newsroomValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveTamilFontPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts/NotoSerifTamil-Regular.ttf'),
    path.resolve(__dirname, '../../../assets/fonts/NotoSerifTamil-Regular.ttf'),
    path.resolve(process.cwd(), 'apps/api/assets/fonts/NotoSerifTamil-Regular.ttf'),
    'C:\\Windows\\Fonts\\Nirmala.ttf',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // Continue
    }
  }
  return null;
}

export type NewsroomMode = 'MANUAL' | 'APPROVAL' | 'AUTOMATIC';

export interface NewsroomConfig {
  brandEnglish: string;
  brandTamil: string;
  tagline: string;
  mode: NewsroomMode;
  scheduleTimeIst: string;
  paused: boolean;
  sections: string[];
  rssSources: Array<{ name: string; url: string; section: string }>;
}

export interface NewsArticleItem {
  id: string;
  section: string;
  headline: string;
  originalSourceTitle?: string;
  summary: string;
  body: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt?: string;
  imageUrl?: string;
  imageCaption?: string;
  imageIsAi: boolean;
  language?: 'en' | 'ta';
  verificationStatus?: 'verified' | 'needs_review' | 'rejected';
}

export interface NewspaperEdition {
  id: string;
  editionDate: string;
  issueNumber: number;
  language: 'ta' | 'en';
  status: 'draft' | 'awaiting_approval' | 'published' | 'failed';
  articles: NewsArticleItem[];
  summary: string;
  createdAt: string;
  publishedAt?: string;
  driveFileId?: string;
  driveWebViewLink?: string;
}

const DEFAULT_CONFIG: NewsroomConfig = {
  brandEnglish: 'KAREN TIMES',
  brandTamil: 'கரென் டைம்ஸ்',
  tagline: 'KNOWLEDGE IS WISDOM.',
  mode: 'APPROVAL',
  scheduleTimeIst: '07:00',
  paused: false,
  sections: ['Tamil Nadu', 'India', 'World', 'Technology and AI', 'Business and economy', 'Education', 'Science'],
  rssSources: [
    { name: 'The Hindu - Tamil Nadu', url: 'https://www.thehindu.com/news/states/tamil-nadu/feeder/default.rss', section: 'Tamil Nadu' },
    { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', section: 'Technology and AI' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', section: 'World' },
    { name: 'The Hindu - National', url: 'https://www.thehindu.com/news/national/feeder/default.rss', section: 'India' },
    { name: 'The Hindu - Sci-Tech', url: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', section: 'Technology and AI' },
  ],
};

let newsroomConfig: NewsroomConfig = structuredClone(DEFAULT_CONFIG);
const editionsStore: NewspaperEdition[] = [];

export function getNewsroomConfig(): NewsroomConfig {
  return structuredClone(newsroomConfig);
}

export function updateNewsroomConfig(patch: Partial<NewsroomConfig>): NewsroomConfig {
  newsroomConfig = { ...newsroomConfig, ...patch };
  return getNewsroomConfig();
}

export function listEditions(): NewspaperEdition[] {
  return [...editionsStore];
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function fetchRssItems(source: { name: string; url: string; section: string }): Promise<Array<{ title: string; link: string; desc: string; pubDate?: string; imageUrl?: string }>> {
  try {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: Array<{ title: string; link: string; desc: string; pubDate?: string; imageUrl?: string }> = [];
    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    for (const m of matches) {
      const block = m[1];
      const title = decodeHtmlEntities((block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim());
      const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
      const rawDesc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || '';
      const imageUrl =
        block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i)?.[1] ||
        block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\//i)?.[1] ||
        rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
      const desc = decodeHtmlEntities(
        rawDesc
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
      const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
      if (title && link) {
        items.push({ title, link, desc: desc.slice(0, 500), pubDate, imageUrl });
      }
      if (items.length >= 3) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!ct.startsWith('image/') || ct === 'image/webp' || ct === 'image/svg+xml') {
      return undefined;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2 * 1024 * 1024) return undefined;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

const AiBriefSchema = z.object({
  headline: z.string().min(8),
  summary: z.string().min(20),
  body: z.string().min(30),
});

function hasRealAiProviderConfigured(): boolean {
  return Boolean((config.GROQ_API_KEY || '').trim() || (config.GEMINI_API_KEY || '').trim());
}

async function buildJournalisticEnglishArticle(item: {
  title: string;
  link: string;
  desc: string;
  pubDate?: string;
  sourceName: string;
  section: string;
}): Promise<{ headline: string; summary: string; body: string; verificationStatus: 'verified' | 'needs_review' }> {
  const cleanTitle = item.title.trim();
  const cleanDesc = (item.desc || '').trim();

  if (hasRealAiProviderConfigured()) {
    try {
      const prompt = `You are a senior newspaper copy editor for KAREN TIMES.
Write a factual, neutral 2-sentence journalistic brief in English using ONLY the provided source headline and snippet.
Rules:
- Never include greetings, chatbot phrasing, or personal names.
- Never invent facts, numbers, dates, or quotes not present in the source.
- Return JSON: {"headline":"...","summary":"...","body":"..."}

Section: ${item.section}
Source: ${item.sourceName}
Headline: ${cleanTitle}
Snippet: ${cleanDesc || 'No additional snippet provided.'}`;
      const structured = await aiProviderManager.generateStructuredOutput({ prompt }, AiBriefSchema);
      const leak =
        detectChatbotOrPromptLeakage(structured.headline) ||
        detectChatbotOrPromptLeakage(structured.summary) ||
        detectChatbotOrPromptLeakage(structured.body);
      if (!leak) {
        return {
          headline: structured.headline,
          summary: structured.summary,
          body: structured.body,
          verificationStatus: cleanDesc.length >= 30 ? 'verified' : 'needs_review',
        };
      }
    } catch {
      // Fall back to verified RSS source material below
    }
  }

  // Verified RSS-direct fallback (zero chatbot leakage, zero hallucination)
  const fallbackBody =
    cleanDesc.length >= 30
      ? cleanDesc
      : `${cleanTitle}. Reported by ${item.sourceName} under ${item.section}. Full details are available at the cited source.`;
  return {
    headline: cleanTitle,
    summary: fallbackBody.slice(0, 240),
    body: fallbackBody,
    verificationStatus: cleanDesc.length >= 30 ? 'verified' : 'needs_review',
  };
}

async function buildJournalisticTamilArticle(item: {
  title: string;
  desc: string;
  sourceName: string;
  section: string;
}): Promise<{ headline: string; summary: string; body: string; verificationStatus: 'verified' | 'needs_review' } | null> {
  if (!hasRealAiProviderConfigured()) {
    return null;
  }
  try {
    const prompt = `Translate this verified news item into formal, journalistic Tamil for KAREN TIMES (கரென் டைம்ஸ்).
Rules:
- Preserve all facts and source attribution strictly; never invent details.
- Never include greetings or chatbot remarks.
- Return JSON: {"headline":"...","summary":"...","body":"..."}

Section: ${item.section}
Source: ${item.sourceName}
Headline: ${item.title}
Details: ${item.desc || item.title}`;
    const tr = await aiProviderManager.generateText({ prompt, timeoutMs: 12000 });
    if (isLocalFallbackProvider(tr.provider)) return null;
    const cleaned = tr.reply.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = AiBriefSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) return null;
    const leak =
      detectChatbotOrPromptLeakage(parsed.data.headline) ||
      detectChatbotOrPromptLeakage(parsed.data.body);
    if (leak || !hasTamilUnicode(parsed.data.headline) || !hasTamilUnicode(parsed.data.body)) {
      return null;
    }
    return {
      headline: parsed.data.headline,
      summary: parsed.data.summary,
      body: parsed.data.body,
      verificationStatus: (item.desc || '').trim().length >= 30 ? 'verified' : 'needs_review',
    };
  } catch {
    return null;
  }
}

export async function generateDailyEditions(options?: { force?: boolean }): Promise<{ en: NewspaperEdition; ta: NewspaperEdition }> {
  const dateIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Idempotency guard: return existing editions for today's IST date unless force=true
  if (!options?.force) {
    const existingEn = editionsStore.find((e) => e.editionDate === dateIst && e.language === 'en');
    const existingTa = editionsStore.find((e) => e.editionDate === dateIst && e.language === 'ta');
    if (existingEn && existingTa) {
      return { en: existingEn, ta: existingTa };
    }
  }

  const issueNumber = Math.floor(editionsStore.length / 2) + 1;
  const rawFeeds = await Promise.all(
    newsroomConfig.rssSources.map(async (src) => ({
      source: src,
      items: await fetchRssItems(src),
    }))
  );

  // Tamil Nadu leads first, followed by round-robin Tech/AI, World, India
  const tnFeed = rawFeeds.find((f) => f.source.section === 'Tamil Nadu');
  const otherFeeds = rawFeeds.filter((f) => f.source.section !== 'Tamil Nadu');
  const orderedFeeds = tnFeed ? [tnFeed, ...otherFeeds] : rawFeeds;

  const flat: Array<{ title: string; link: string; desc: string; pubDate?: string; imageUrl?: string; sourceName: string; section: string }> = [];
  const maxPerFeed = 3;
  for (let round = 0; round < maxPerFeed; round++) {
    for (const f of orderedFeeds) {
      const it = f.items[round];
      if (it) {
        flat.push({ ...it, sourceName: f.source.name, section: f.source.section });
      }
    }
  }

  const enArticles: NewsArticleItem[] = [];
  const taArticles: NewsArticleItem[] = [];
  const seenEnUrls = new Set<string>();
  const seenEnHeadlines = new Set<string>();
  const seenTaUrls = new Set<string>();
  const seenTaHeadlines = new Set<string>();

  for (let idx = 0; idx < flat.length && enArticles.length < 8; idx++) {
    const item = flat[idx];
    let imgDataUrl = item.imageUrl ? await fetchImageAsDataUrl(item.imageUrl) : undefined;
    let imgIsAi = false;
    if (!imgDataUrl && enArticles.length === 0) {
      const aiImg = await generateEditorialImage(item.title);
      if (aiImg.dataUrl) {
        imgDataUrl = aiImg.dataUrl;
        imgIsAi = aiImg.isAi;
      }
    }

    const imgCaption = imgDataUrl
      ? imgIsAi
        ? 'AI-Generated Editorial Illustration (Illustrative)'
        : `Photo: ${item.sourceName}`
      : `Dispatch: ${item.sourceName}`;

    const enBuilt = await buildJournalisticEnglishArticle(item);
    const enValidation = validateNewspaperArticle(
      {
        category: item.section,
        headline: enBuilt.headline,
        original_source_title: item.title,
        article_summary: enBuilt.summary,
        article_body: enBuilt.body,
        source_name: item.sourceName,
        source_url: item.link,
        published_at: item.pubDate || new Date().toISOString(),
        image_url: imgDataUrl,
        image_caption: imgCaption,
        language: 'en',
        verification_status: enBuilt.verificationStatus,
      },
      seenEnUrls,
      seenEnHeadlines
    );

    if (enValidation.ok) {
      enArticles.push({
        id: crypto.randomUUID(),
        section: enValidation.article.category,
        headline: enValidation.article.headline,
        originalSourceTitle: enValidation.article.original_source_title,
        summary: enValidation.article.article_summary,
        body: enValidation.article.article_body,
        sourceName: enValidation.article.source_name,
        sourceUrl: enValidation.article.source_url,
        publishedAt: enValidation.article.published_at,
        imageUrl: enValidation.article.image_url,
        imageCaption: enValidation.article.image_caption,
        imageIsAi: imgIsAi,
        language: 'en',
        verificationStatus: enValidation.article.verification_status,
      });
    }

    const taBuilt = await buildJournalisticTamilArticle(item);
    if (taBuilt) {
      const taValidation = validateNewspaperArticle(
        {
          category: item.section,
          headline: taBuilt.headline,
          original_source_title: item.title,
          article_summary: taBuilt.summary,
          article_body: taBuilt.body,
          source_name: item.sourceName,
          source_url: item.link,
          published_at: item.pubDate || new Date().toISOString(),
          image_url: imgDataUrl,
          image_caption: imgDataUrl
            ? imgIsAi
              ? 'AI விளக்கப் படம் (Illustrative)'
              : `படம்: ${item.sourceName}`
            : `செய்தி: ${item.sourceName}`,
          language: 'ta',
          verification_status: taBuilt.verificationStatus,
        },
        seenTaUrls,
        seenTaHeadlines
      );
      if (taValidation.ok) {
        taArticles.push({
          id: crypto.randomUUID(),
          section: taValidation.article.category,
          headline: taValidation.article.headline,
          originalSourceTitle: taValidation.article.original_source_title,
          summary: taValidation.article.article_summary,
          body: taValidation.article.article_body,
          sourceName: taValidation.article.source_name,
          sourceUrl: taValidation.article.source_url,
          publishedAt: taValidation.article.published_at,
          imageUrl: taValidation.article.image_url,
          imageCaption: taValidation.article.image_caption,
          imageIsAi: imgIsAi,
          language: 'ta',
          verificationStatus: taValidation.article.verification_status,
        });
      }
    }
  }

  const initialStatus = newsroomConfig.mode === 'AUTOMATIC' ? 'published' : 'awaiting_approval';
  const nowIso = new Date().toISOString();

  const enEdition: NewspaperEdition = {
    id: crypto.randomUUID(),
    editionDate: dateIst,
    issueNumber,
    language: 'en',
    status: initialStatus,
    articles: enArticles,
    summary: enArticles.map((a) => `• [${a.section}] ${a.headline}`).join('\n') || 'No verified RSS items collected.',
    createdAt: nowIso,
    publishedAt: initialStatus === 'published' ? nowIso : undefined,
  };
  const taEdition: NewspaperEdition = {
    id: crypto.randomUUID(),
    editionDate: dateIst,
    issueNumber,
    language: 'ta',
    status: initialStatus,
    articles: taArticles,
    summary: taArticles.map((a) => `• [${a.section}] ${a.headline}`).join('\n') || 'சரிபார்க்கப்பட்ட தமிழ் செய்திகள் இல்லை (AI மொழிபெயர்ப்பு தேவை).',
    createdAt: nowIso,
    publishedAt: initialStatus === 'published' ? nowIso : undefined,
  };

  editionsStore.unshift(enEdition, taEdition);

  for (const ed of [enEdition, taEdition]) {
    await saveEditionToDrive(ed).catch((err) => {
      logger.debug('Newsroom Drive auto-save skipped', { err: err instanceof Error ? err.message : String(err) });
    });

    await supabaseAdmin
      .from('karen_times_editions')
      .upsert(
        {
          id: ed.id,
          edition_date: ed.editionDate,
          issue_number: ed.issueNumber,
          language: ed.language,
          status: ed.status,
          summary: ed.summary,
          pdf_url: ed.driveWebViewLink || null,
          published_at: ed.publishedAt || null,
        },
        { onConflict: 'edition_date,language' }
      )
      .then(() => { }, (err) => logger.debug('Newsroom DB persist skipped', { err }));
  }

  return { en: enEdition, ta: taEdition };
}

export async function saveEditionToDrive(
  edition: NewspaperEdition,
  userId?: string
): Promise<{ saved: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  if (edition.driveFileId) {
    return { saved: true, fileId: edition.driveFileId, webViewLink: edition.driveWebViewLink };
  }
  try {
    const pdfBuf = await renderEditionPdf(edition);
    const fileName = `KAREN_TIMES_${edition.editionDate}_${edition.language.toUpperCase()}.pdf`;
    const up = await uploadFileToDrive({
      buffer: pdfBuf,
      fileName,
      mimeType: 'application/pdf',
      folderName: 'KAREN TIMES',
      allowCreateFolder: true,
      replaceExisting: true,
      userId,
    });
    if (up.ok && up.fileId) {
      edition.driveFileId = up.fileId;
      edition.driveWebViewLink = up.webViewLink;
      return { saved: true, fileId: up.fileId, webViewLink: up.webViewLink };
    }
    return { saved: false, error: up.error };
  } catch (err) {
    return { saved: false, error: err instanceof Error ? err.message : 'Drive upload failed' };
  }
}

export function renderEditionHtml(edition: NewspaperEdition): string {
  const brand = edition.language === 'ta' ? newsroomConfig.brandTamil : newsroomConfig.brandEnglish;
  const lead = edition.articles[0];
  const rest = edition.articles.slice(1);
  const breaking = edition.articles
    .slice(0, 3)
    .map((a) => `<span style="margin-right:24px;"><strong>[${a.section.toUpperCase()}]</strong> ${a.headline}</span>`)
    .join('');

  const renderCard = (a: NewsArticleItem, isLead = false) => `
    <article style="${isLead ? 'column-span: all; border-bottom: 2px solid #202020; padding-bottom: 18px; margin-bottom: 20px;' : 'break-inside: avoid; border-top: 1px solid #202020; padding-top: 10px; margin-bottom: 18px;'}">
      <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #A78248; font-weight: 700;">${isLead ? `TOP STORY • ${a.section}` : a.section}</div>
      <h2 style="font-family: 'Playfair Display', 'Libre Baskerville', 'Noto Serif Tamil', Georgia, serif; font-size: ${isLead ? '28px' : '17px'}; line-height: 1.25; margin: 4px 0 10px; color: #202020;">${a.headline}</h2>
      ${a.imageUrl ? `<figure style="margin: 8px 0 10px; border: 1.5px solid #202020; padding: 4px; background: #FFFDF8;"><img src="${a.imageUrl}" alt="${a.headline}" style="width:100%; max-height:${isLead ? '340px' : '180px'}; object-fit:cover; display:block;" /><figcaption style="font-size:9px; color:#686868; margin-top:4px; text-align:center;">${a.imageCaption || (a.imageIsAi ? 'AI-Generated Editorial Illustration (Illustrative)' : `Photo: ${a.sourceName}`)}</figcaption></figure>` : ''}
      <p style="font-size: ${isLead ? '14px' : '12.5px'}; line-height: 1.6; color: #202020; text-align: justify;">${a.body}</p>
      <div style="font-size: 10px; color: #686868; margin-top: 6px; font-style: italic;">Source: ${a.sourceName}</div>
    </article>`;

  const articlesHtml = lead
    ? `${renderCard(lead, true)}\n${rest.map((a) => renderCard(a, false)).join('\n')}`
    : '';

  return `<!DOCTYPE html>
<html lang="${edition.language}">
<head>
  <meta charset="utf-8" />
  <title>${brand} — ${edition.editionDate}</title>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Noto+Serif+Tamil:wght@400;700&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />
</head>
<body style="background:#F4EBDD; color:#202020; font-family: 'Libre Baskerville', Georgia, 'Noto Serif Tamil', serif; margin:0; padding:28px;">
  <div style="max-width: 960px; margin: 0 auto; background: #F4EBDD; border: 2px solid #202020; padding: 28px 34px; box-shadow: 6px 6px 0 #202020;">
    <header style="text-align:center; border-bottom: 4px double #202020; padding-bottom: 12px; margin-bottom: 14px;">
      <div style="display:flex; justify-content:space-between; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #686868; border-bottom: 1px solid #202020; padding-bottom: 5px; margin-bottom: 10px;">
        <span>Vol. I • Issue #${edition.issueNumber}</span>
        <span>${edition.editionDate} (IST)</span>
        <span>${edition.language === 'ta' ? 'தமிழ் பதிப்பு' : 'English Broadsheet'}</span>
      </div>
      <div style="font-family:'Playfair Display', 'Noto Serif Tamil', serif; font-size: 52px; font-weight: 900; letter-spacing: 3px; line-height: 1;">${brand}</div>
      <div style="font-size: 11px; letter-spacing: 4px; color: #A78248; font-weight: 700; margin-top: 6px;">${newsroomConfig.tagline}</div>
    </header>
    ${breaking ? `<div style="background:#202020; color:#F4EBDD; font-size:11px; padding:7px 10px; margin-bottom:18px; display:flex; align-items:center; gap:10px;"><span style="background:#A52A2A; color:#F4EBDD; font-weight:700; padding:3px 8px; letter-spacing:1px; white-space:nowrap;">BREAKING</span><span style="line-height:1.4;">${breaking}</span></div>` : ''}
    <main style="column-count: 2; column-gap: 28px; column-rule: 1px solid #C8BCA8;">
      ${articlesHtml || '<p>No verified articles collected for this edition yet.</p>'}
    </main>
  </div>
</body>
</html>`;
}

export async function generateEditorialImage(prompt: string): Promise<{ dataUrl?: string; isAi: boolean; provider: string }> {
  const cleanPrompt = `Editorial newspaper illustration, clean ink and warm print style: ${prompt.slice(0, 180)}`;
  const hfKey = (process.env.HUGGINGFACE_API_KEY || '').trim();
  if (hfKey) {
    const endpoints = [
      'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers',
      'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: cleanPrompt, prompt: cleanPrompt }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
          const buf = Buffer.from(await res.arrayBuffer());
          return {
            dataUrl: `data:${ct};base64,${buf.toString('base64')}`,
            isAi: true,
            provider: 'huggingface',
          };
        }
      } catch {
        // Try next provider endpoint
      }
    }
  }

  try {
    const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=800&height=450&nologo=true`;
    const res = await fetch(pollUrl, { signal: AbortSignal.timeout(25000) });
    if (res.ok) {
      const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      if (ct.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length <= 4 * 1024 * 1024) {
          return {
            dataUrl: `data:${ct};base64,${buf.toString('base64')}`,
            isAi: true,
            provider: 'pollinations',
          };
        }
      }
    }
  } catch {
    // Fall back gracefully
  }

  return { isAi: true, provider: 'svg-fallback' };
}

export function renderEditionPdf(edition: NewspaperEdition): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 34;
    // Small bottom margin prevents PDFKit's internal autoPageBreak from creating blank pages
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 24, bottom: 16, left: margin, right: margin },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const tamilFontPath = resolveTamilFontPath();
    let hasTamilFont = false;
    if (tamilFontPath) {
      try {
        doc.registerFont('TamilSerif', tamilFontPath);
        hasTamilFont = true;
      } catch {
        hasTamilFont = false;
      }
    }

    const useTamilFont = (text?: string): boolean =>
      hasTamilFont && (edition.language === 'ta' || hasTamilUnicode(text || ''));

    const fontFor = (kind: 'headline' | 'body' | 'meta', text?: string): string => {
      if (useTamilFont(text)) return 'TamilSerif';
      if (kind === 'headline') return 'Times-Bold';
      if (kind === 'body') return 'Times-Roman';
      return 'Helvetica';
    };

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const gutter = 18;
    const colW = (contentW - gutter) / 2;
    const leftX = margin;
    const rightX = margin + colW + gutter;
    const bottomLimit = pageH - 46;
    let pageNum = 1;

    const drawPageChrome = (isFirstPage: boolean) => {
      doc.rect(0, 0, pageW, pageH).fill('#F4EBDD');
      doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(0.75).strokeColor('#C8BCA8').stroke();

      if (isFirstPage) {
        doc.moveTo(margin, 30).lineTo(pageW - margin, 30).lineWidth(0.75).strokeColor('#202020').stroke();
        doc.fillColor('#686868').font('Helvetica-Bold').fontSize(7.5);
        doc.text(`VOL. I  •  ISSUE #${edition.issueNumber}`, margin, 34, { width: contentW / 3, align: 'left', lineBreak: false });
        doc.text(`${edition.editionDate}  •  07:00 IST`, margin + contentW / 3, 34, { width: contentW / 3, align: 'center', lineBreak: false });
        doc.text(edition.language === 'ta' ? 'TAMIL EDITION' : 'ENGLISH BROADSHEET', margin + (contentW * 2) / 3, 34, {
          width: contentW / 3,
          align: 'right',
          lineBreak: false,
        });
        doc.moveTo(margin, 45).lineTo(pageW - margin, 45).lineWidth(0.75).strokeColor('#202020').stroke();

        const mastheadTitle = edition.language === 'ta' && hasTamilFont ? newsroomConfig.brandTamil : newsroomConfig.brandEnglish;
        doc.fillColor('#202020').font(fontFor('headline', mastheadTitle)).fontSize(32).text(mastheadTitle, margin, 51, {
          width: contentW,
          align: 'center',
          lineBreak: false,
        });
        doc.fillColor('#A78248').font('Helvetica-Bold').fontSize(8.5).text(newsroomConfig.tagline, margin, 89, {
          width: contentW,
          align: 'center',
          characterSpacing: 2,
          lineBreak: false,
        });
        doc.moveTo(margin, 102).lineTo(pageW - margin, 102).lineWidth(2).strokeColor('#202020').stroke();
        doc.moveTo(margin, 105.5).lineTo(pageW - margin, 105.5).lineWidth(0.6).strokeColor('#202020').stroke();
      } else {
        doc.fillColor('#686868').font('Helvetica-Bold').fontSize(7.5);
        doc.text(`KAREN TIMES  •  ${edition.editionDate}`, margin, 30, { width: contentW / 2, align: 'left', lineBreak: false });
        doc.text(`PAGE ${pageNum}`, margin + contentW / 2, 30, { width: contentW / 2, align: 'right', lineBreak: false });
        doc.moveTo(margin, 42).lineTo(pageW - margin, 42).lineWidth(1).strokeColor('#202020').stroke();
      }

      doc.moveTo(margin, pageH - 36).lineTo(pageW - margin, pageH - 36).lineWidth(0.5).strokeColor('#C8BCA8').stroke();
      doc.fillColor('#686868').font('Helvetica').fontSize(7).text(
        `KAREN TIMES — ${newsroomConfig.tagline}  |  Page ${pageNum}`,
        margin,
        pageH - 31,
        { width: contentW, align: 'center', lineBreak: false }
      );
    };

    const decodeImage = (url?: string): Buffer | null => {
      if (!url || !url.startsWith('data:image/') || !url.includes('base64,')) return null;
      try {
        return Buffer.from(url.split('base64,')[1], 'base64');
      } catch {
        return null;
      }
    };

    drawPageChrome(true);

    if (edition.articles.length === 0) {
      const emptyMsg =
        edition.language === 'ta'
          ? 'இந்தப் பதிப்பிற்கு சரிபார்க்கப்பட்ட தமிழ் செய்திகள் எதுவும் இல்லை.'
          : 'No verified articles were collected for this edition.';
      doc.fillColor('#202020').font(fontFor('body', emptyMsg)).fontSize(12).text(emptyMsg, margin, 125, { width: contentW });
      doc.end();
      return;
    }

    // ── Breaking News Banner (non-overlapping, wrapped cleanly) ──
    const tickerY = 112;
    const tickerHeadlines = edition.articles
      .slice(0, 2)
      .map((a) => `[${a.section.toUpperCase()}] ${a.headline}`)
      .join('   •   ');
    const tickerFont = fontFor('body', tickerHeadlines);
    doc.font(tickerFont).fontSize(7.5);
    const tickerTextH = Math.min(24, Math.max(12, doc.heightOfString(tickerHeadlines, { width: contentW - 88 })));
    const tickerBoxH = tickerTextH + 10;

    doc.rect(leftX, tickerY, contentW, tickerBoxH).fill('#202020');
    doc.rect(leftX, tickerY, 76, tickerBoxH).fill('#A52A2A');
    doc.fillColor('#F4EBDD').font('Helvetica-Bold').fontSize(7.2).text('BREAKING', leftX + 4, tickerY + (tickerBoxH - 8) / 2, {
      width: 68,
      align: 'center',
      lineBreak: false,
    });
    doc.fillColor('#F4EBDD').font(tickerFont).fontSize(7.5).text(tickerHeadlines, leftX + 82, tickerY + 5, {
      width: contentW - 88,
      height: tickerTextH + 2,
      ellipsis: true,
    });

    // ── Lead Front-Page Story (full width, manual layout — NO pdfkit columns option) ──
    const lead = edition.articles[0];
    let cursorY = tickerY + tickerBoxH + 8;
    doc.fillColor('#A78248').font('Helvetica-Bold').fontSize(8).text(`TOP STORY  •  ${lead.section.toUpperCase()}`, leftX, cursorY, { width: contentW });
    cursorY = doc.y + 2;
    doc.fillColor('#202020').font(fontFor('headline', lead.headline)).fontSize(16.5).text(lead.headline, leftX, cursorY, {
      width: contentW,
      lineGap: 1,
    });
    cursorY = doc.y + 5;

    const leadImg = decodeImage(lead.imageUrl);
    if (leadImg) {
      try {
        const imgH = 122;
        doc.rect(leftX, cursorY, contentW, imgH + 14).fillAndStroke('#FFFDF8', '#202020');
        doc.image(leadImg, leftX + 4, cursorY + 4, { fit: [contentW - 8, imgH - 4], align: 'center', valign: 'center' });
        const cap = lead.imageCaption || (lead.imageIsAi ? 'AI-Generated Editorial Illustration (Illustrative)' : `Photo: ${lead.sourceName}`);
        doc.fillColor('#686868').font(fontFor('meta', cap)).fontSize(6.8).text(cap, leftX + 4, cursorY + imgH + 2, {
          width: contentW - 8,
          align: 'center',
        });
        cursorY += imgH + 18;
      } catch {
        // Skip invalid image
      }
    }

    doc.fillColor('#202020').font(fontFor('body', lead.body)).fontSize(9.5).text(lead.body, leftX, cursorY, {
      width: contentW,
      align: 'justify',
      lineGap: 1.2,
    });
    cursorY = doc.y + 3;
    doc.fillColor('#686868').font('Helvetica-Oblique').fontSize(7.2).text(`Source: ${lead.sourceName}`, leftX, cursorY, { width: contentW });
    cursorY = doc.y + 5;
    doc.moveTo(leftX, cursorY).lineTo(pageW - margin, cursorY).lineWidth(1.5).strokeColor('#202020').stroke();
    cursorY += 8;

    // ── Balanced Two-Column Broadsheet Grid (shortest-column placement) ──
    const rest = edition.articles.slice(1);
    let colStartY = cursorY;
    let leftY = cursorY;
    let rightY = cursorY;

    const drawColumnRule = (topY: number, botY: number) => {
      const ruleX = leftX + colW + gutter / 2;
      if (botY > topY + 10) {
        doc.moveTo(ruleX, topY).lineTo(ruleX, botY).lineWidth(0.6).strokeColor('#C8BCA8').stroke();
      }
    };

    const measureArticleHeight = (art: NewsArticleItem, hasImg: boolean): number => {
      doc.font('Helvetica-Bold').fontSize(7.2);
      const secH = doc.heightOfString(art.section.toUpperCase(), { width: colW });
      doc.font(fontFor('headline', art.headline)).fontSize(10.5);
      const headH = doc.heightOfString(art.headline, { width: colW, lineGap: 0.8 });
      doc.font(fontFor('body', art.body)).fontSize(8.8);
      const bodyH = doc.heightOfString(art.body, { width: colW, align: 'justify', lineGap: 1.1 });
      const imgH = hasImg ? 88 : 22; // 22pt for category placeholder badge when no image
      return secH + headH + bodyH + imgH + 22;
    };

    for (const art of rest) {
      const artImg = decodeImage(art.imageUrl);
      const exactH = measureArticleHeight(art, Boolean(artImg));

      let targetCol: 0 | 1;
      if (leftY <= rightY && leftY + exactH <= bottomLimit) {
        targetCol = 0;
      } else if (rightY + exactH <= bottomLimit) {
        targetCol = 1;
      } else if (leftY + exactH <= bottomLimit) {
        targetCol = 0;
      } else {
        drawColumnRule(colStartY, Math.min(bottomLimit - 4, Math.max(leftY, rightY) - 4));
        pageNum += 1;
        doc.addPage();
        drawPageChrome(false);
        colStartY = 50;
        leftY = 50;
        rightY = 50;
        targetCol = 0;
      }

      const x = targetCol === 0 ? leftX : rightX;
      let y = targetCol === 0 ? leftY : rightY;

      doc.fillColor('#A78248').font('Helvetica-Bold').fontSize(7.2).text(art.section.toUpperCase(), x, y, { width: colW });
      y = doc.y + 1.5;
      doc.fillColor('#202020').font(fontFor('headline', art.headline)).fontSize(10.5).text(art.headline, x, y, { width: colW, lineGap: 0.8 });
      y = doc.y + 3;

      if (artImg) {
        try {
          const boxH = 72;
          doc.rect(x, y, colW, boxH + 12).fillAndStroke('#FFFDF8', '#202020');
          doc.image(artImg, x + 3, y + 3, { fit: [colW - 6, boxH - 4], align: 'center', valign: 'center' });
          const cap = art.imageCaption || (art.imageIsAi ? 'AI-Generated Editorial Illustration (Illustrative)' : `Photo: ${art.sourceName}`);
          doc.fillColor('#686868').font(fontFor('meta', cap)).fontSize(6.3).text(cap, x + 3, y + boxH + 1.5, {
            width: colW - 6,
            align: 'center',
          });
          y += boxH + 15;
        } catch {
          // Ignore invalid image
        }
      } else {
        // Category placeholder banner when image is unavailable
        doc.rect(x, y, colW, 16).fillAndStroke('#EFE5D4', '#C8BCA8');
        doc.fillColor('#686868').font('Helvetica-Bold').fontSize(6.5).text(
          `${art.section.toUpperCase()}  •  VERIFIED DISPATCH`,
          x + 6,
          y + 5,
          { width: colW - 12, align: 'center', lineBreak: false }
        );
        y += 20;
      }

      doc.fillColor('#202020').font(fontFor('body', art.body)).fontSize(8.8).text(art.body, x, y, {
        width: colW,
        align: 'justify',
        lineGap: 1.1,
      });
      y = doc.y + 2;
      doc.fillColor('#686868').font('Helvetica-Oblique').fontSize(6.8).text(`Source: ${art.sourceName}`, x, y, { width: colW });
      y = doc.y + 4;
      doc.moveTo(x, y).lineTo(x + colW, y).lineWidth(0.5).strokeColor('#C8BCA8').stroke();
      y += 6;

      if (targetCol === 0) leftY = y;
      else rightY = y;
    }

    // Fill remaining space in shorter column with Edition Highlights
    const shorterCol = leftY <= rightY ? 0 : 1;
    const shortY = shorterCol === 0 ? leftY : rightY;
    const availH = bottomLimit - shortY;
    if (availH >= 75 && edition.articles.length > 0) {
      const boxX = shorterCol === 0 ? leftX : rightX;
      const boxH = Math.min(availH - 4, 140);
      doc.rect(boxX, shortY, colW, boxH).fillAndStroke('#EFE5D4', '#202020');
      doc.fillColor('#A78248').font('Helvetica-Bold').fontSize(7.5).text('IN BRIEF  •  EDITION HIGHLIGHTS', boxX + 8, shortY + 7, { width: colW - 16 });
      let by = doc.y + 4;
      for (const a of edition.articles.slice(0, 5)) {
        const line = `• [${a.section}] ${a.headline}`;
        doc.font(fontFor('body', line)).fontSize(7.6);
        const lh = doc.heightOfString(line, { width: colW - 16, lineGap: 0.5 });
        if (by + lh > shortY + boxH - 6) break;
        doc.fillColor('#202020').text(line, boxX + 8, by, { width: colW - 16, lineGap: 0.5 });
        by = doc.y + 3;
      }
      if (shorterCol === 0) leftY = shortY + boxH + 4;
      else rightY = shortY + boxH + 4;
    }

    drawColumnRule(colStartY, Math.min(bottomLimit - 4, Math.max(leftY, rightY) - 4));
    doc.end();
  });
}

export async function deliverEditionToTelegram(
  edition: NewspaperEdition,
  options?: { force?: boolean; autoScheduled?: boolean }
): Promise<boolean> {
  const { cacheService } = await import('./cache.service.js');
  const dedupeKey = `newsroom:delivered:${edition.editionDate}:${edition.language}`;
  if (options?.autoScheduled && !options?.force) {
    const alreadySent = await cacheService.get<boolean>(dedupeKey).catch(() => false);
    if (alreadySent) {
      logger.info(`Skipping duplicate automatic newspaper delivery for ${edition.editionDate} (${edition.language})`);
      return false;
    }
  }
  await saveEditionToDrive(edition).catch(() => {});
  const brand = edition.language === 'ta' ? newsroomConfig.brandTamil : newsroomConfig.brandEnglish;
  const header = `📰 *${brand}* — ${edition.editionDate} (Issue #${edition.issueNumber})\n_${newsroomConfig.tagline}_\n\n`;
  const textOk = await sendTelegramMessage(`${header}${edition.summary}`).catch(() => false);
  let pdfOk = false;
  try {
    const pdfBuf = await renderEditionPdf(edition);
    const chatId = config.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || '';
    if (chatId) {
      pdfOk = await sendTelegramDocument(
        chatId,
        pdfBuf,
        `KAREN_TIMES_${edition.editionDate}_${edition.language.toUpperCase()}.pdf`,
        `${brand} — ${edition.editionDate}`
      );
    }
  } catch {
    pdfOk = false;
  }
  const ok = textOk || pdfOk;
  if (ok) {
    await cacheService.set(dedupeKey, true, 86400).catch(() => {});
  }
  await supabaseAdmin
    .from('karen_times_deliveries')
    .insert({
      edition_id: edition.id,
      channel: 'telegram',
      destination: 'owner',
      status: ok ? 'sent' : 'failed',
    })
    .then(() => { }, () => { });
  return ok;
}
