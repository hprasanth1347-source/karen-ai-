import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../config/supabase.js';
import { aiProviderManager } from './aiProviderManager.service.js';
import { sendTelegramDocument, sendTelegramMessage } from '../providers/telegram.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
const DEFAULT_CONFIG = {
    brandEnglish: 'KAREN TIMES',
    brandTamil: 'கரென் டைம்ஸ்',
    tagline: 'KNOWLEDGE IS WISDOM.',
    mode: 'APPROVAL',
    scheduleTimeIst: '07:00',
    paused: false,
    sections: ['Tamil Nadu', 'India', 'World', 'Technology and AI', 'Business and economy', 'Education', 'Science'],
    rssSources: [
        { name: 'The Hindu - National', url: 'https://www.thehindu.com/news/national/feeder/default.rss', section: 'India' },
        { name: 'The Hindu - Tamil Nadu', url: 'https://www.thehindu.com/news/states/tamil-nadu/feeder/default.rss', section: 'Tamil Nadu' },
        { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', section: 'World' },
    ],
};
let newsroomConfig = structuredClone(DEFAULT_CONFIG);
const editionsStore = [];
export function getNewsroomConfig() {
    return structuredClone(newsroomConfig);
}
export function updateNewsroomConfig(patch) {
    newsroomConfig = { ...newsroomConfig, ...patch };
    return getNewsroomConfig();
}
export function listEditions() {
    return [...editionsStore];
}
async function fetchRssItems(source) {
    try {
        const res = await fetch(source.url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok)
            return [];
        const xml = await res.text();
        const items = [];
        const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
        for (const m of matches) {
            const block = m[1];
            const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim();
            const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
            const rawDesc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || '';
            const imageUrl = block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i)?.[1] ||
                block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\//i)?.[1] ||
                rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
            const desc = rawDesc
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
            if (title && link) {
                items.push({ title, link, desc: desc.slice(0, 400), pubDate, imageUrl });
            }
            if (items.length >= 3)
                break;
        }
        return items;
    }
    catch {
        return [];
    }
}
async function fetchImageAsDataUrl(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok)
            return undefined;
        const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!ct.startsWith('image/') || ct === 'image/webp' || ct === 'image/svg+xml') {
            // pdfkit supports png and jpeg natively; skip webp/svg for PDF safety
            return ct.startsWith('image/') ? url : undefined;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > 2 * 1024 * 1024)
            return undefined;
        return `data:${ct};base64,${buf.toString('base64')}`;
    }
    catch {
        return undefined;
    }
}
export async function generateDailyEditions() {
    const dateIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const issueNumber = editionsStore.length / 2 + 1;
    const rawFeeds = await Promise.all(newsroomConfig.rssSources.map(async (src) => ({
        source: src,
        items: await fetchRssItems(src),
    })));
    const flat = rawFeeds.flatMap((f) => f.items.map((it) => ({ ...it, sourceName: f.source.name, section: f.source.section })));
    const enArticles = [];
    const taArticles = [];
    for (let idx = 0; idx < Math.min(flat.length, 6); idx++) {
        const item = flat[idx];
        // Prefer real RSS source photo; fall back to Hugging Face AI illustration on lead story
        let imgDataUrl = item.imageUrl ? await fetchImageAsDataUrl(item.imageUrl) : undefined;
        let imgIsAi = false;
        if (!imgDataUrl && idx === 0) {
            const aiImg = await generateEditorialImage(item.title);
            if (aiImg.dataUrl) {
                imgDataUrl = aiImg.dataUrl;
                imgIsAi = aiImg.isAi;
            }
        }
        enArticles.push({
            id: crypto.randomUUID(),
            section: item.section,
            headline: item.title,
            summary: item.desc || item.title,
            body: item.desc || item.title,
            sourceName: item.sourceName,
            sourceUrl: item.link,
            publishedAt: item.pubDate,
            imageUrl: imgDataUrl,
            imageIsAi: imgIsAi,
        });
        let taHeadline = item.title;
        let taSummary = item.desc || item.title;
        try {
            const tr = await aiProviderManager.generateText({
                prompt: `Translate this news headline and 2-sentence summary into natural, journalistic Tamil (preserving facts & attribution, no invention). Format as: HEADLINE: ...\nSUMMARY: ...\n\nTitle: ${item.title}\nDetails: ${item.desc}`,
                timeoutMs: 10000,
            });
            const hl = tr.reply.match(/HEADLINE:\s*(.+)/i)?.[1]?.trim();
            const sm = tr.reply.match(/SUMMARY:\s*([\s\S]+)/i)?.[1]?.trim();
            if (hl)
                taHeadline = hl;
            if (sm)
                taSummary = sm;
        }
        catch {
            // Preserve source headline if AI unavailable
        }
        taArticles.push({
            id: crypto.randomUUID(),
            section: item.section,
            headline: taHeadline,
            summary: taSummary,
            body: taSummary,
            sourceName: item.sourceName,
            sourceUrl: item.link,
            publishedAt: item.pubDate,
            imageUrl: imgDataUrl,
            imageIsAi: imgIsAi,
        });
    }
    const initialStatus = newsroomConfig.mode === 'AUTOMATIC' ? 'published' : 'awaiting_approval';
    const nowIso = new Date().toISOString();
    const enEdition = {
        id: crypto.randomUUID(),
        editionDate: dateIst,
        issueNumber,
        language: 'en',
        status: initialStatus,
        articles: enArticles,
        summary: enArticles.map((a) => `• [${a.section}] ${a.headline}`).join('\n') || 'No RSS items fetched.',
        createdAt: nowIso,
        publishedAt: initialStatus === 'published' ? nowIso : undefined,
    };
    const taEdition = {
        id: crypto.randomUUID(),
        editionDate: dateIst,
        issueNumber,
        language: 'ta',
        status: initialStatus,
        articles: taArticles,
        summary: taArticles.map((a) => `• [${a.section}] ${a.headline}`).join('\n') || 'செய்திகள் இல்லை.',
        createdAt: nowIso,
        publishedAt: initialStatus === 'published' ? nowIso : undefined,
    };
    editionsStore.unshift(enEdition, taEdition);
    for (const ed of [enEdition, taEdition]) {
        await supabaseAdmin
            .from('karen_times_editions')
            .upsert({
            id: ed.id,
            edition_date: ed.editionDate,
            issue_number: ed.issueNumber,
            language: ed.language,
            status: ed.status,
            summary: ed.summary,
            published_at: ed.publishedAt || null,
        }, { onConflict: 'edition_date,language' })
            .then(() => { }, (err) => logger.debug('Newsroom DB persist skipped', { err }));
    }
    return { en: enEdition, ta: taEdition };
}
export function renderEditionHtml(edition) {
    const brand = edition.language === 'ta' ? newsroomConfig.brandTamil : newsroomConfig.brandEnglish;
    const articlesHtml = edition.articles
        .map((a) => `
      <article style="break-inside: avoid; border-top: 2px solid #202020; padding-top: 10px; margin-bottom: 18px;">
        <div style="font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #A78248; font-weight: 700;">${a.section}</div>
        <h2 style="font-family: 'Libre Baskerville', 'Noto Serif Tamil', Georgia, serif; font-size: 18px; margin: 4px 0 8px; color: #202020;">${a.headline}</h2>
        ${a.imageUrl ? `<figure style="margin: 8px 0;"><img src="${a.imageUrl}" alt="${a.headline}" style="width:100%; border: 1px solid #202020;" /><figcaption style="font-size:9px; color:#686868; margin-top:2px;">${a.imageIsAi ? 'AI-Generated Editorial Illustration' : 'Source Image'}</figcaption></figure>` : ''}
        <p style="font-size: 13px; line-height: 1.55; color: #202020;">${a.body}</p>
        <div style="font-size: 10px; color: #686868; margin-top: 6px;">Source: ${a.sourceName}</div>
      </article>`)
        .join('\n');
    return `<!DOCTYPE html>
<html lang="${edition.language}">
<head>
  <meta charset="utf-8" />
  <title>${brand} — ${edition.editionDate}</title>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Noto+Serif+Tamil:wght@400;700&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />
</head>
<body style="background:#F4EBDD; color:#202020; font-family: Georgia, 'Noto Serif Tamil', serif; margin:0; padding:32px;">
  <header style="text-align:center; border-bottom: 4px double #202020; padding-bottom: 14px; margin-bottom: 24px;">
    <div style="font-family:'Playfair Display', 'Noto Serif Tamil', serif; font-size: 42px; font-weight: 900; letter-spacing: 2px;">${brand}</div>
    <div style="font-size: 11px; letter-spacing: 3px; color: #A78248; font-weight: 700; margin-top: 4px;">${newsroomConfig.tagline}</div>
    <div style="display:flex; justify-content:space-between; font-size: 11px; color: #686868; margin-top: 10px; border-top: 1px solid #202020; padding-top: 6px;">
      <span>Issue #${edition.issueNumber}</span>
      <span>${edition.editionDate} (IST)</span>
      <span>${edition.language === 'ta' ? 'தமிழ் பதிப்பு' : 'English Edition'}</span>
    </div>
  </header>
  <main style="column-count: 2; column-gap: 28px;">
    ${articlesHtml || '<p>No articles collected for this edition yet.</p>'}
  </main>
</body>
</html>`;
}
export async function generateEditorialImage(prompt) {
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
            }
            catch {
                // Try next provider endpoint
            }
        }
    }
    // Free (₹0, no API key required) fallback via Pollinations.ai
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
    }
    catch {
        // Fall back to no-image mode if offline
    }
    return { isAi: true, provider: 'svg-fallback' };
}
export function renderEditionPdf(edition) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        // Heritage newspaper background & masthead
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F4EBDD');
        doc.fillColor('#202020').font('Times-Bold').fontSize(26).text('KAREN TIMES', { align: 'center' });
        doc.fillColor('#A78248').font('Helvetica-Bold').fontSize(9).text(newsroomConfig.tagline, { align: 'center' });
        doc.moveDown(0.3);
        doc.fillColor('#686868').font('Helvetica').fontSize(9).text(`Issue #${edition.issueNumber}  |  ${edition.editionDate} (IST)  |  ${edition.language === 'ta' ? 'Tamil Edition' : 'English Edition'}`, { align: 'center' });
        doc.moveTo(40, doc.y + 6).lineTo(doc.page.width - 40, doc.y + 6).lineWidth(2).strokeColor('#202020').stroke();
        doc.moveDown(1);
        for (const art of edition.articles) {
            if (doc.y > doc.page.height - 130) {
                doc.addPage();
                doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F4EBDD');
            }
            doc.fillColor('#A78248').font('Helvetica-Bold').fontSize(8).text(art.section.toUpperCase());
            doc.fillColor('#202020').font('Times-Bold').fontSize(14).text(art.headline);
            doc.moveDown(0.2);
            if (art.imageUrl && art.imageUrl.startsWith('data:image/') && art.imageUrl.includes('base64,')) {
                try {
                    const b64 = art.imageUrl.split('base64,')[1];
                    const imgBuf = Buffer.from(b64, 'base64');
                    doc.image(imgBuf, { fit: [480, 170], align: 'center' });
                    doc.fillColor('#686868').font('Helvetica').fontSize(7.5).text(art.imageIsAi ? 'AI-Generated Editorial Illustration' : 'Source Image', { align: 'center' });
                    doc.moveDown(0.3);
                }
                catch {
                    // Ignore invalid image buffer
                }
            }
            doc.fillColor('#202020').font('Times-Roman').fontSize(10.5).text(art.body, { align: 'justify' });
            doc.fillColor('#686868').font('Helvetica').fontSize(8).text(`Source: ${art.sourceName} — ${art.sourceUrl}`);
            doc.moveDown(0.8);
        }
        if (edition.articles.length === 0) {
            doc.fillColor('#202020').font('Times-Roman').fontSize(12).text('No articles were collected for this edition.');
        }
        doc.end();
    });
}
export async function deliverEditionToTelegram(edition) {
    const brand = edition.language === 'ta' ? newsroomConfig.brandTamil : newsroomConfig.brandEnglish;
    const header = `📰 *${brand}* — ${edition.editionDate} (Issue #${edition.issueNumber})\n_${newsroomConfig.tagline}_\n\n`;
    const textOk = await sendTelegramMessage(`${header}${edition.summary}`).catch(() => false);
    let pdfOk = false;
    try {
        const pdfBuf = await renderEditionPdf(edition);
        const chatId = config.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || '';
        if (chatId) {
            pdfOk = await sendTelegramDocument(chatId, pdfBuf, `KAREN_TIMES_${edition.editionDate}_${edition.language.toUpperCase()}.pdf`, `${brand} — ${edition.editionDate}`);
        }
    }
    catch {
        pdfOk = false;
    }
    const ok = textOk || pdfOk;
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
