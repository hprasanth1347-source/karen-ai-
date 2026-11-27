import { z } from 'zod';

export const StructuredArticleSchema = z.object({
  category: z.string().trim().min(2).max(60),
  headline: z.string().trim().min(8).max(240),
  original_source_title: z.string().trim().min(5).max(300),
  article_summary: z.string().trim().min(20).max(600),
  article_body: z.string().trim().min(25).max(2500),
  source_name: z.string().trim().min(2).max(120),
  source_url: z.string().trim().url(),
  published_at: z.string().trim().min(1),
  image_url: z.string().trim().optional(),
  image_caption: z.string().trim().max(240),
  language: z.enum(['en', 'ta']),
  verification_status: z.enum(['verified', 'needs_review', 'rejected']),
});

export type StructuredArticle = z.infer<typeof StructuredArticleSchema>;

const CHATBOT_LEAK_PATTERNS: RegExp[] = [
  /\bhi\s+hari\b/i,
  /\bi\s+received\s+your\s+message\b/i,
  /\bi\s+am\s+ready\s+to\s+help\b/i,
  /\bwhenever\s+you\s+need\b/i,
  /\bhow\s+can\s+i\s+assist\b/i,
  /\bas\s+an\s+ai\b/i,
  /\blive\s+search\s+was\s+unavailable\b/i,
  /\bsure,?\s+here\s+(is|are)\b/i,
  /\bcertainly!\b/i,
  /\bno\s+extra\s+snippet\s+provided\b/i,
  /\brespond\s+only\s+with\s+valid\s+json\b/i,
  /\bstrict\s+journalistic\b/i,
  /\bwrite\s+a\s+crisp\b/i,
  /\bHEADLINE:\s*/i,
  /\b402\s+payment\s+required\b/i,
  /\b401\s+unauthorized\b/i,
];

export function detectChatbotOrPromptLeakage(text: string): string | null {
  const s = (text || '').trim();
  if (!s) return 'Empty text';
  for (const re of CHATBOT_LEAK_PATTERNS) {
    if (re.test(s)) {
      return `Matched forbidden pattern: ${re.source}`;
    }
  }
  return null;
}

export function isLocalFallbackProvider(provider?: string): boolean {
  const p = (provider || '').toLowerCase();
  return p === 'local-karen' || p === 'local' || p === 'fallback';
}

export function hasTamilUnicode(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text || '');
}

export function normalizeHeadlineKey(headline: string): string {
  return (headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0B80-\u0BFF]+/g, ' ')
    .trim();
}

export function validateNewspaperArticle(
  candidate: unknown,
  seenUrls: Set<string>,
  seenHeadlines: Set<string>
): { ok: true; article: StructuredArticle } | { ok: false; reason: string } {
  const parsed = StructuredArticleSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Schema validation failed: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    };
  }

  const art = parsed.data;
  for (const field of [art.headline, art.article_summary, art.article_body, art.image_caption]) {
    if (!field) continue;
    const leak = detectChatbotOrPromptLeakage(field);
    if (leak) {
      return { ok: false, reason: `Leakage detected: ${leak}` };
    }
  }

  if (seenUrls.has(art.source_url)) {
    return { ok: false, reason: `Duplicate source URL: ${art.source_url}` };
  }

  const normHeadline = normalizeHeadlineKey(art.headline);
  if (seenHeadlines.has(normHeadline)) {
    return { ok: false, reason: `Duplicate headline: ${art.headline}` };
  }

  if (art.language === 'ta' && !hasTamilUnicode(art.headline) && !hasTamilUnicode(art.article_body)) {
    return { ok: false, reason: 'Tamil edition article lacks Tamil Unicode characters' };
  }

  seenUrls.add(art.source_url);
  seenHeadlines.add(normHeadline);
  return { ok: true, article: art };
}
