import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { sendTelegramMessage } from '../providers/telegram.js';
const stats = {
    totalLookups: 0,
    cacheHits: 0,
    lastErrorCode: null,
    lastErrorReason: null,
};
const inFlightSearches = new Map();
const memoryCache = new Map();
const memoryUsage = new Map();
export function isWebSearchConfigured() {
    return Boolean(config.GOOGLE_SEARCH_API_KEY && config.GOOGLE_SEARCH_ENGINE_ID);
}
export function getIstDateString(date = new Date()) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function normalizeSearchQuery(query) {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function hashSearchQuery(query, freshness) {
    return createHash('sha256').update(`${freshness}:${normalizeSearchQuery(query)}`).digest('hex');
}
export function stripActionTagsFromSearch(text) {
    return text.replace(/\[\[[\s\S]*?\]\]/g, '[redacted-tag]');
}
export function getFreshnessParams(freshness) {
    if (freshness === 'breaking')
        return { dateRestrict: 'd2', sort: 'date' };
    if (freshness === 'recent')
        return { dateRestrict: 'm1' };
    return {};
}
export function getCacheTtlMs(freshness) {
    if (freshness === 'breaking')
        return 10 * 60 * 1000;
    if (freshness === 'recent')
        return 6 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
}
// ─── When to Search ───────────────────────────────────────────────────────────
export function shouldSearchWeb(prompt, options) {
    if (options?.loveMode)
        return false;
    const text = prompt.trim();
    if (text.length < 6)
        return false;
    // Skip greetings / pure small talk
    if (/^(hi|hello|hey|vanakkam|gm|good morning|good night|thanks|thank you|ok|okay|bye|cool|nice)[!.\s]*$/i.test(text) ||
        /^(?:how\s+are\s+you|how\s+r\s+u|how'?s\s+it\s+going|what'?s\s+up)\b/i.test(text)) {
        return false;
    }
    // Personal-data commands, outbound sends, and pure text rewriting/translation stay local unless web/search is explicit
    const personalOrActionPattern = /\b(my\s+(?:[a-z0-9_-]+\s+){0,2}(?:tasks?|emails?|inbox|mails?|gmail|drive|files?|documents?|vault|classroom|assignments?|exams?|memories?|reminders?|instagram|dms?|comments?|whatsapp|contacts?)|in\s+(?:google\s+)?drive|in\s+gmail|send\s+(?:an?\s+)?(?:email|dm|message|whatsapp)|reply\s+to|join\s+class|translate\s+this|rewrite\s+this|summarize\s+this\s+text|make\s+(?:this|my\s+notes)\s+into\s+(?:a\s+)?(?:pdf|docx|pptx|slides|xlsx))\b/i;
    if (personalOrActionPattern.test(text) && !/\b(latest|news|price|weather|score|online|google|search|web\s+search|live\s+search)\b/i.test(text)) {
        return false;
    }
    // Explicit web search, custom search queries, or factual/time-sensitive questions
    return /\b(search|google|look\s*up|find(?:\s+online|\s+out|\s+about)?|check\s+(?:online|latest|live|current)|fetch|browse|latest|news|today|tomorrow|yesterday|current|recent|newest|fresh|update|live|happening|trending|price|cost|weather|forecast|score|match|won|winner|who\s+(?:is|was|won|are)|what\s+(?:is|are|was|were|happened)|when\s+(?:is|was|did|does|will)|where\s+(?:is|are)|which\s+(?:is|are)|how\s+(?:is|are|was|were|did|does|do|much|many|old|long)|(?:cm|pm|chief\s+minister|prime\s+minister|president|governor|minister|ceo|founder|capital|population|winner|champion)\s+(?:of|for|in)|release|version|spec|specs|stats|status|compare|vs|versus|law|act|rule|stock|rate|202\d)\b/i.test(text);
}
function cleanStandaloneSearchQuery(prompt) {
    const stripped = prompt
        .trim()
        .replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:web\s+search|custom\s+search|live\s+search|search(?:\s+(?:the\s+web|the\s+data|data))?(?:\s+(?:for|about|on))?|google|look\s*up|find\s+online)\s*[:,-]?\s*/i, '')
        .trim();
    return (stripped || prompt.trim()).slice(0, 120);
}
// ─── History-Aware Query Rewrite ──────────────────────────────────────────────
export async function rewriteSearchQuery(prompt, history = []) {
    const cleanedQuery = cleanStandaloneSearchQuery(prompt);
    const fallbackFreshness = /\b(today|tomorrow|yesterday|now|live|latest|breaking|tonight|match|score|weather|price|fresh)\b/i.test(prompt)
        ? 'breaking'
        : /\b(recent|this\s+month|this\s+year|202\d|new|newest|current|version|release|update)\b/i.test(prompt)
            ? 'recent'
            : 'any';
    // Fast path: skip slow LLM rewrite unless prior turns exist AND the message is a short/pronoun follow-up
    const wordCount = cleanedQuery.split(/\s+/).filter(Boolean).length;
    const hasFollowUpReference = wordCount <= 3 ||
        /\b(it|that|this|they|them|he|she|his|her|their|those|these|same|more|above|previous)\b/i.test(prompt);
    if (history.length === 0 || !hasFollowUpReference) {
        return { query: cleanedQuery, freshness: fallbackFreshness };
    }
    const recentTurns = history
        .slice(-4)
        .map((h) => `${h.role}: ${h.content.slice(0, 240)}`)
        .join('\n');
    const rewritePrompt = `Rewrite the user's latest message into a standalone web search query (<12 words) using the conversation context if needed, and classify freshness as breaking, recent, or any.
Return ONLY valid JSON: {"query":"...","freshness":"breaking|recent|any"}

Conversation:
${recentTurns || '(none)'}
Latest user message: ${prompt.slice(0, 300)}`;
    try {
        if (config.GROQ_API_KEY) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
                    messages: [{ role: 'user', content: rewritePrompt }],
                    temperature: 0,
                    max_tokens: 80,
                }),
                signal: AbortSignal.timeout(1200),
            });
            if (res.ok) {
                const json = await res.json();
                const raw = json.choices?.[0]?.message?.content || '';
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    const q = typeof parsed.query === 'string' && parsed.query.trim() ? parsed.query.trim().slice(0, 120) : cleanedQuery;
                    const f = ['breaking', 'recent', 'any'].includes(parsed.freshness)
                        ? parsed.freshness
                        : fallbackFreshness;
                    return { query: q, freshness: f };
                }
            }
        }
        else if (config.GEMINI_API_KEY) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${config.GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: rewritePrompt }] }],
                }),
                signal: AbortSignal.timeout(1200),
            });
            if (res.ok) {
                const json = await res.json();
                const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    const q = typeof parsed.query === 'string' && parsed.query.trim() ? parsed.query.trim().slice(0, 120) : cleanedQuery;
                    const f = ['breaking', 'recent', 'any'].includes(parsed.freshness)
                        ? parsed.freshness
                        : fallbackFreshness;
                    return { query: q, freshness: f };
                }
            }
        }
    }
    catch {
        // Fall back to deterministic cleaned query
    }
    return { query: cleanedQuery, freshness: fallbackFreshness };
}
// ─── SSRF Protection & Page Enrichment ────────────────────────────────────────
export function isPrivateOrReservedIp(ip) {
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        const [a, b] = parts;
        if (a === 0 || a === 10 || a === 127)
            return true;
        if (a === 169 && b === 254)
            return true; // link-local / cloud metadata
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        if (a === 192 && b === 168)
            return true;
        if (a === 100 && b >= 64 && b <= 127)
            return true; // CGNAT
        if (a >= 224)
            return true; // multicast/reserved
        return false;
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
            return true;
        }
        if (lower.startsWith('::ffff:')) {
            return isPrivateOrReservedIp(lower.slice(7));
        }
        return false;
    }
    return true;
}
export async function validateSafePublicUrl(urlStr, lookupFn = (h) => dns.lookup(h, { all: true })) {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Blocked URL protocol: ${parsed.protocol}`);
    }
    if (parsed.username || parsed.password) {
        throw new Error('Blocked URL with embedded credentials');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new Error(`Blocked internal hostname: ${hostname}`);
    }
    if (net.isIP(hostname)) {
        if (isPrivateOrReservedIp(hostname)) {
            throw new Error(`Blocked private IP: ${hostname}`);
        }
        return parsed;
    }
    const records = await lookupFn(hostname);
    if (!records || records.length === 0) {
        throw new Error(`DNS resolution returned no records for ${hostname}`);
    }
    for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
            throw new Error(`Blocked resolved private IP ${rec.address} for ${hostname}`);
        }
    }
    return parsed;
}
export async function fetchAndExtractPageExcerpt(urlStr, timeoutMs = 1800) {
    try {
        let currentUrl = await validateSafePublicUrl(urlStr);
        let res = null;
        for (let hops = 0; hops < 3; hops++) {
            res = await fetch(currentUrl.toString(), {
                method: 'GET',
                redirect: 'manual',
                headers: {
                    'User-Agent': 'KarenAI-SearchBot/1.0 (+https://karen.local)',
                    Accept: 'text/html,application/xhtml+xml',
                },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get('location');
                if (!loc)
                    return undefined;
                const nextUrl = new URL(loc, currentUrl);
                currentUrl = await validateSafePublicUrl(nextUrl.toString());
                continue;
            }
            break;
        }
        if (!res || !res.ok)
            return undefined;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('text/html'))
            return undefined;
        const reader = res.body?.getReader();
        if (!reader)
            return undefined;
        const chunks = [];
        let totalBytes = 0;
        const MAX_BYTES = 500 * 1024;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > MAX_BYTES) {
                    await reader.cancel().catch(() => { });
                    break;
                }
                chunks.push(value);
            }
        }
        const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
        const $ = cheerio.load(html);
        $('script, style, nav, header, footer, aside, noscript, iframe, [role="navigation"], .ad, .ads').remove();
        const rawText = $('body').text().replace(/\s+/g, ' ').trim();
        if (!rawText)
            return undefined;
        return stripActionTagsFromSearch(rawText.slice(0, 1500));
    }
    catch {
        return undefined;
    }
}
// ─── Cache & Daily Quota ──────────────────────────────────────────────────────
async function readSearchCache(queryHash, freshness, maxCacheAgeMs) {
    const now = Date.now();
    const mem = memoryCache.get(queryHash);
    if (mem && mem.expiresAt > now && (!maxCacheAgeMs || now - mem.cachedAt <= maxCacheAgeMs)) {
        return mem.results;
    }
    const supabase = supabaseAdmin;
    if (!supabase)
        return null;
    try {
        const { data } = await supabase
            .from('search_cache')
            .select('results, expires_at')
            .eq('query_hash', queryHash)
            .maybeSingle();
        if (data) {
            const expiresAtMs = new Date(data.expires_at).getTime();
            const approxCachedAt = expiresAtMs - getCacheTtlMs(freshness);
            if (expiresAtMs > now && (!maxCacheAgeMs || now - approxCachedAt <= maxCacheAgeMs)) {
                const results = (data.results || []);
                memoryCache.set(queryHash, { results, expiresAt: expiresAtMs, cachedAt: approxCachedAt });
                return results;
            }
        }
    }
    catch {
        // Non-fatal
    }
    return null;
}
async function writeSearchCache(queryHash, normalizedQuery, freshness, results) {
    const now = Date.now();
    const ttlMs = getCacheTtlMs(freshness);
    const expiresAtMs = now + ttlMs;
    memoryCache.set(queryHash, { results, expiresAt: expiresAtMs, cachedAt: now });
    const supabase = supabaseAdmin;
    if (!supabase)
        return;
    try {
        await supabase.from('search_cache').upsert({
            query_hash: queryHash,
            normalized_query: normalizedQuery.slice(0, 300),
            freshness,
            results,
            expires_at: new Date(expiresAtMs).toISOString(),
        });
    }
    catch {
        // Non-fatal
    }
}
export async function getSearchUsageToday() {
    const today = getIstDateString();
    const limit = config.SEARCH_DAILY_LIMIT || 90;
    const supabase = supabaseAdmin;
    if (supabase) {
        try {
            const { data } = await supabase
                .from('search_usage')
                .select('count')
                .eq('date', today)
                .maybeSingle();
            if (data && typeof data.count === 'number') {
                return { date: today, count: data.count, limit };
            }
        }
        catch {
            // Fallback to memory
        }
    }
    return { date: today, count: memoryUsage.get(today)?.count || 0, limit };
}
async function checkAndIncrementSearchQuota() {
    const today = getIstDateString();
    const limit = config.SEARCH_DAILY_LIMIT || 90;
    const current = await getSearchUsageToday();
    if (current.count >= limit) {
        return { allowed: false, count: current.count, limit };
    }
    const nextCount = current.count + 1;
    const memEntry = memoryUsage.get(today) || { count: 0, alerted80: false };
    memEntry.count = nextCount;
    const threshold80 = Math.floor(limit * 0.8);
    let shouldAlert = false;
    const supabase = supabaseAdmin;
    if (supabase) {
        try {
            const { data: existing } = await supabase
                .from('search_usage')
                .select('alerted_80')
                .eq('date', today)
                .maybeSingle();
            const alreadyAlerted = Boolean(existing?.alerted_80 || memEntry.alerted80);
            if (nextCount >= threshold80 && !alreadyAlerted) {
                shouldAlert = true;
                memEntry.alerted80 = true;
            }
            await supabase.from('search_usage').upsert({
                date: today,
                count: nextCount,
                alerted_80: alreadyAlerted || shouldAlert,
                updated_at: new Date().toISOString(),
            });
        }
        catch {
            // Fallback to memory tracking
        }
    }
    else if (nextCount >= threshold80 && !memEntry.alerted80) {
        shouldAlert = true;
        memEntry.alerted80 = true;
    }
    memoryUsage.set(today, memEntry);
    if (shouldAlert) {
        sendTelegramMessage(`⚠️ *Google Search Quota Notice*: Karen AI has used ${nextCount}/${limit} (${Math.round((nextCount / limit) * 100)}%) of today's Custom Search budget.`).catch(() => { });
    }
    return { allowed: true, count: nextCount, limit };
}
export async function searchWebWithGoogle(query, limitOrOptions = 5, _signal) {
    const opts = typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);
    const freshness = opts.freshness || 'any';
    const normalized = normalizeSearchQuery(query);
    const queryHash = hashSearchQuery(normalized, freshness);
    if (!isWebSearchConfigured()) {
        return {
            ok: false,
            status: 0,
            reason: 'not_configured',
            errorMessage: 'GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID is not configured',
            results: [],
            sources: [],
            cached: false,
            freshness,
            queryUsed: normalized,
        };
    }
    stats.totalLookups += 1;
    if (!opts.bypassCache) {
        const cached = await readSearchCache(queryHash, freshness, opts.maxCacheAgeMs);
        if (cached) {
            stats.cacheHits += 1;
            logger.info('Google search cache hit', { queryHash, freshness, count: cached.length });
            return {
                ok: true,
                status: 200,
                results: cached.slice(0, limit),
                sources: cached.slice(0, limit).map((r) => ({
                    title: r.title,
                    url: r.link,
                    displayLink: r.displayLink || new URL(r.link).hostname,
                })),
                cached: true,
                freshness,
                queryUsed: normalized,
            };
        }
    }
    const inflightKey = `${queryHash}:${limit}:${opts.start || 1}`;
    const existingInflight = inFlightSearches.get(inflightKey);
    if (existingInflight) {
        return existingInflight;
    }
    const runPromise = (async () => {
        const startMs = Date.now();
        if (!opts.skipBudgetIncrement) {
            const budget = await checkAndIncrementSearchQuota();
            if (!budget.allowed) {
                stats.lastErrorCode = 429;
                stats.lastErrorReason = 'over_daily_budget';
                logger.warn('Google search daily budget exceeded', {
                    queryHash,
                    count: budget.count,
                    limit: budget.limit,
                });
                return {
                    ok: false,
                    status: 429,
                    reason: 'over_daily_budget',
                    errorMessage: `Daily search budget reached (${budget.count}/${budget.limit})`,
                    results: [],
                    sources: [],
                    cached: false,
                    freshness,
                    queryUsed: normalized,
                };
            }
        }
        const freshnessParams = getFreshnessParams(freshness);
        const params = new URLSearchParams({
            key: config.GOOGLE_SEARCH_API_KEY,
            cx: config.GOOGLE_SEARCH_ENGINE_ID,
            q: query.trim().slice(0, 300),
            num: String(limit),
            gl: 'in',
            hl: 'en',
            safe: 'active',
            fields: 'items(title,link,snippet,displayLink,pagemap/metatags),searchInformation(totalResults,formattedTotalResults)',
        });
        const dateRestrict = opts.dateRestrict || freshnessParams.dateRestrict;
        const sort = opts.sort || freshnessParams.sort;
        if (dateRestrict)
            params.set('dateRestrict', dateRestrict);
        if (sort)
            params.set('sort', sort);
        if (opts.start && opts.start > 1)
            params.set('start', String(opts.start));
        const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
        let lastStatus = 0;
        let lastReason = 'network_error';
        let lastErrorMessage = 'Unknown search error';
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
                lastStatus = res.status;
                if (!res.ok) {
                    const errBody = (await res.json().catch(() => ({})));
                    lastErrorMessage = errBody.error?.message || `HTTP ${res.status}`;
                    if (res.status === 403) {
                        lastReason = 'forbidden';
                        break; // do not retry 403
                    }
                    if (res.status === 429) {
                        lastReason = 'quota_exceeded';
                        break; // do not retry 429
                    }
                    if (res.status >= 500) {
                        lastReason = 'server_error';
                        if (attempt === 0) {
                            await new Promise((r) => setTimeout(r, 350));
                            continue;
                        }
                    }
                    break;
                }
                const json = (await res.json());
                const rawItems = (json.items || []).filter((i) => i.title && i.link);
                const mapped = rawItems.map((i) => ({
                    title: stripActionTagsFromSearch(i.title),
                    link: i.link,
                    snippet: stripActionTagsFromSearch(i.snippet || ''),
                    displayLink: i.displayLink || new URL(i.link).hostname,
                }));
                if (opts.enrichPages !== false && mapped.length > 0) {
                    const enrichTimeout = Math.min(Math.max(opts.enrichTimeoutMs ?? 1600, 400), 4000);
                    const topTargets = mapped.slice(0, 2);
                    const excerpts = await Promise.race([
                        Promise.all(topTargets.map((item) => fetchAndExtractPageExcerpt(item.link, enrichTimeout))),
                        new Promise((resolve) => setTimeout(() => resolve([]), enrichTimeout + 200)),
                    ]);
                    excerpts.forEach((excerpt, idx) => {
                        if (excerpt && topTargets[idx])
                            topTargets[idx].pageExcerpt = excerpt;
                    });
                }
                await writeSearchCache(queryHash, normalized, freshness, mapped);
                stats.lastErrorCode = null;
                stats.lastErrorReason = null;
                logger.info('Google Custom Search completed', {
                    queryHash,
                    freshness,
                    latencyMs: Date.now() - startMs,
                    status: 200,
                    cacheHit: false,
                    count: mapped.length,
                });
                return {
                    ok: true,
                    status: 200,
                    results: mapped,
                    sources: mapped.map((r) => ({
                        title: r.title,
                        url: r.link,
                        displayLink: r.displayLink || new URL(r.link).hostname,
                    })),
                    cached: false,
                    freshness,
                    queryUsed: normalized,
                };
            }
            catch (err) {
                const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
                lastReason = isTimeout ? 'timeout' : 'network_error';
                lastErrorMessage = err instanceof Error ? err.message : 'Search request failed';
                if (attempt === 0 && isTimeout) {
                    await new Promise((r) => setTimeout(r, 350));
                    continue;
                }
                break;
            }
        }
        stats.lastErrorCode = lastStatus || null;
        stats.lastErrorReason = `${lastReason}: ${lastErrorMessage}`;
        logger.warn('Google Custom Search failed', {
            queryHash,
            status: lastStatus,
            reason: lastReason,
            errorMessage: lastErrorMessage,
            latencyMs: Date.now() - startMs,
        });
        return {
            ok: false,
            status: lastStatus,
            reason: lastReason,
            errorMessage: lastErrorMessage,
            results: [],
            sources: [],
            cached: false,
            freshness,
            queryUsed: normalized,
        };
    })();
    inFlightSearches.set(inflightKey, runPromise);
    try {
        return await runPromise;
    }
    finally {
        inFlightSearches.delete(inflightKey);
    }
}
async function fetchDuckDuckGoHtmlResults(query, limit) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 220))}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                Accept: 'text/html',
            },
            signal: AbortSignal.timeout(2600),
        });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const items = [];
        $('.result').each((_, el) => {
            if (items.length >= limit)
                return;
            const linkEl = $(el).find('a.result__a').first();
            let href = linkEl.attr('href') || '';
            if (href.includes('uddg=')) {
                try {
                    const parsed = new URL(href.startsWith('http') ? href : `https://duckduckgo.com${href}`);
                    const actual = parsed.searchParams.get('uddg');
                    if (actual)
                        href = actual;
                }
                catch {
                    // keep original href
                }
            }
            if (!href.startsWith('http'))
                return;
            const title = stripActionTagsFromSearch(linkEl.text().replace(/\s+/g, ' ').trim());
            const snippet = stripActionTagsFromSearch($(el).find('.result__snippet').first().text().replace(/\s+/g, ' ').trim());
            if (!title)
                return;
            let displayLink = href;
            try {
                displayLink = new URL(href).hostname;
            }
            catch {
                // ignore
            }
            items.push({ title, link: href, snippet, displayLink });
        });
        return items;
    }
    catch {
        return [];
    }
}
async function fetchWikipediaSearchResults(query, limit) {
    try {
        const cleanQ = query
            .replace(/^(?:who|how|what|when|where|which)\s+(?:is|are|was|were)\s+(?:the\s+)?/i, '')
            .replace(/\bcm\b/gi, 'Chief Minister')
            .replace(/\bpm\b/gi, 'Prime Minister')
            .trim();
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=1&format=json&origin=*`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'KarenAI-SearchBot/1.0' },
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok)
            return [];
        const json = (await res.json());
        const list = (json.query?.search || []).slice(0, limit);
        return list
            .filter((item) => item.title)
            .map((item) => {
            const title = stripActionTagsFromSearch(item.title);
            const rawSnippet = (item.snippet || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return {
                title: `${title} - Wikipedia`,
                link: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
                snippet: stripActionTagsFromSearch(rawSnippet || title),
                displayLink: 'en.wikipedia.org',
            };
        });
    }
    catch {
        return [];
    }
}
async function fetchGoogleNewsRssResults(query, limit) {
    try {
        const cleanQ = query.replace(/\bcm\b/gi, 'Chief Minister').replace(/\bpm\b/gi, 'Prime Minister');
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ.slice(0, 200))}&hl=en-IN&gl=IN&ceid=IN:en`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'KarenAI-SearchBot/1.0' },
            signal: AbortSignal.timeout(2200),
        });
        if (!res.ok)
            return [];
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const items = [];
        $('item').each((_, el) => {
            if (items.length >= limit)
                return;
            const title = stripActionTagsFromSearch($(el).find('title').first().text().trim());
            const link = $(el).find('link').first().text().trim();
            const pubDate = $(el).find('pubDate').first().text().trim();
            const source = stripActionTagsFromSearch($(el).find('source').first().text().trim());
            if (!title || !link.startsWith('http'))
                return;
            items.push({
                title,
                link,
                snippet: [source, pubDate].filter(Boolean).join(' · ') || title,
                displayLink: source || 'news.google.com',
            });
        });
        return items;
    }
    catch {
        return [];
    }
}
export async function searchWebLiveFallback(query, limit = 5, freshness = 'any') {
    const normalized = normalizeSearchQuery(query);
    const [newsResults, wikiResults, ddgResults] = await Promise.all([
        fetchGoogleNewsRssResults(normalized, limit),
        fetchWikipediaSearchResults(normalized, Math.min(3, limit)),
        fetchDuckDuckGoHtmlResults(normalized, limit),
    ]);
    const combined = [];
    const seen = new Set();
    for (const item of [...newsResults, ...wikiResults, ...ddgResults]) {
        if (!seen.has(item.link)) {
            seen.add(item.link);
            combined.push(item);
        }
        if (combined.length >= limit)
            break;
    }
    return {
        ok: combined.length > 0,
        status: combined.length > 0 ? 200 : 503,
        results: combined,
        sources: combined.map((r) => ({
            title: r.title,
            url: r.link,
            displayLink: r.displayLink || r.link,
        })),
        cached: false,
        freshness,
        queryUsed: normalized,
        reason: combined.length > 0 ? undefined : 'network_error',
        errorMessage: combined.length > 0 ? undefined : 'Live fallback search returned no results',
    };
}
export async function searchWebWithFallback(query, limitOrOptions = 5, signal) {
    const primary = await searchWebWithGoogle(query, limitOrOptions, signal);
    if (primary.ok && primary.results.length > 0) {
        return primary;
    }
    const opts = typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
    const fallback = await searchWebLiveFallback(query, Math.min(Math.max(opts.limit ?? 5, 1), 10), opts.freshness || 'any');
    return fallback.ok ? fallback : primary;
}
export function formatSearchContext(results) {
    if (results.length === 0)
        return '';
    const lines = results.map((r, idx) => {
        const safeTitle = stripActionTagsFromSearch(r.title);
        const safeSnippet = stripActionTagsFromSearch(r.snippet);
        const safeExcerpt = r.pageExcerpt ? `\n   Page excerpt: ${stripActionTagsFromSearch(r.pageExcerpt)}` : '';
        return `${idx + 1}. [${r.displayLink || r.link}] ${safeTitle} (${r.link})\n   Snippet: ${safeSnippet}${safeExcerpt}`;
    });
    return `<untrusted_content source="web">\nLive Web Search Results:\n${lines.join('\n')}\n</untrusted_content>`;
}
export async function getSearchHealthStatus() {
    const configured = isWebSearchConfigured();
    const usage = await getSearchUsageToday();
    const cacheHitRate = stats.totalLookups > 0 ? Math.round((stats.cacheHits / stats.totalLookups) * 100) / 100 : 0;
    if (!configured) {
        return {
            configured: false,
            working: false,
            lastErrorCode: null,
            lastErrorReason: 'GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID is missing',
            usageToday: usage.count,
            dailyLimit: usage.limit,
            cacheHitRate,
            checkedAt: new Date().toISOString(),
        };
    }
    const probe = await searchWebWithGoogle('test', {
        limit: 1,
        enrichPages: false,
        bypassCache: true,
        skipBudgetIncrement: true,
    });
    return {
        configured: true,
        working: probe.ok,
        lastErrorCode: probe.ok ? null : probe.status || null,
        lastErrorReason: probe.ok ? null : `${probe.reason}: ${probe.errorMessage}`,
        usageToday: usage.count,
        dailyLimit: usage.limit,
        cacheHitRate,
        checkedAt: new Date().toISOString(),
    };
}
