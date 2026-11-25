import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export function isWebSearchConfigured(): boolean {
  return Boolean(config.GOOGLE_SEARCH_API_KEY && config.GOOGLE_SEARCH_ENGINE_ID);
}

export function shouldSearchWeb(prompt: string): boolean {
  if (!isWebSearchConfigured()) return false;
  const text = prompt.trim();
  if (text.length < 8) return false;
  return /\b(search|google|look up|find online|latest|news|today|current|price|weather|score|who is|what is|when is|release|version|2026|2025)\b/i.test(
    text
  );
}

export async function searchWebWithGoogle(
  query: string,
  limit = 5,
  signal?: AbortSignal
): Promise<WebSearchResult[]> {
  if (!isWebSearchConfigured()) return [];

  const params = new URLSearchParams({
    key: config.GOOGLE_SEARCH_API_KEY,
    cx: config.GOOGLE_SEARCH_ENGINE_ID,
    q: query.slice(0, 300),
    num: String(Math.min(Math.max(limit, 1), 10)),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn('Google Custom Search returned non-OK status', { status: res.status });
      return [];
    }
    const json = await res.json();
    const items: Array<{ title?: string; link?: string; snippet?: string }> = json.items || [];
    return items
      .filter((item) => item.title && item.link)
      .map((item) => ({
        title: item.title!,
        link: item.link!,
        snippet: item.snippet || '',
      }));
  } catch (err) {
    logger.warn('Google Custom Search failed, continuing without web results', { err });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function formatSearchContext(results: WebSearchResult[]): string {
  if (results.length === 0) return '';
  const lines = results.map(
    (r, idx) => `${idx + 1}. ${r.title} (${r.link})\n   ${r.snippet}`
  );
  return `\n\nLive Web Search Results (use these facts and cite URLs when helpful):\n${lines.join('\n')}`;
}
