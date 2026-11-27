import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFParse } from 'pdf-parse';
import {
  detectChatbotOrPromptLeakage,
  isLocalFallbackProvider,
  validateNewspaperArticle,
} from '../../apps/api/dist/services/newsroomValidation.js';
import {
  renderEditionHtml,
  renderEditionPdf,
} from '../../apps/api/dist/services/newsroom.service.js';

function makeValidEnArticle(overrides = {}) {
  return {
    category: 'Tamil Nadu',
    headline: 'Chennai Metro Phase II corridor testing begins on southern stretch',
    original_source_title: 'Chennai Metro Phase II corridor testing begins on southern stretch',
    article_summary: 'Trial runs commenced on the elevated corridor in Chennai following safety checks by metro engineers.',
    article_body: 'Trial runs commenced on the elevated corridor in Chennai following safety checks by metro engineers. Officials confirmed signalling tests will continue through the week.',
    source_name: 'The Hindu - Tamil Nadu',
    source_url: 'https://www.thehindu.com/news/states/tamil-nadu/metro-test',
    published_at: '2026-11-27T01:30:00Z',
    image_caption: 'Photo: The Hindu - Tamil Nadu',
    language: 'en',
    verification_status: 'verified',
    ...overrides,
  };
}

test('Article validation accepts valid structured article and rejects duplicates', () => {
  const seenUrls = new Set();
  const seenHeadlines = new Set();

  const okRes = validateNewspaperArticle(makeValidEnArticle(), seenUrls, seenHeadlines);
  assert.equal(okRes.ok, true);

  const dupUrl = validateNewspaperArticle(
    makeValidEnArticle({ headline: 'Different headline but same URL for testing' }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(dupUrl.ok, false);

  const dupHeadline = validateNewspaperArticle(
    makeValidEnArticle({ source_url: 'https://www.thehindu.com/other-url' }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(dupHeadline.ok, false);
});

test('Article validation rejects chatbot greeting leakage, prompt leakage, empty/malformed, and missing source', () => {
  const seenUrls = new Set();
  const seenHeadlines = new Set();

  assert.equal(isLocalFallbackProvider('local-karen'), true);
  assert.ok(detectChatbotOrPromptLeakage('Hi Hari! I received your message: "test". I am ready to help whenever you need.'));
  assert.ok(detectChatbotOrPromptLeakage('Respond ONLY with valid JSON matching schema'));

  const chatLeak = validateNewspaperArticle(
    makeValidEnArticle({
      article_body: 'Hi Hari! I received your message. I am ready to help whenever you need.',
    }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(chatLeak.ok, false);

  const promptLeak = validateNewspaperArticle(
    makeValidEnArticle({
      source_url: 'https://example.com/2',
      headline: 'Valid headline for prompt leak test',
      article_summary: 'Write a crisp 2-sentence summary for this prompt.',
    }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(promptLeak.ok, false);

  const missingSource = validateNewspaperArticle(
    makeValidEnArticle({ source_url: 'not-a-url', source_name: '' }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(missingSource.ok, false);

  const emptyBody = validateNewspaperArticle(
    makeValidEnArticle({ source_url: 'https://example.com/3', headline: 'Short body check', article_body: 'Too short' }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(emptyBody.ok, false);

  const nonTamilInTa = validateNewspaperArticle(
    makeValidEnArticle({
      source_url: 'https://example.com/4',
      language: 'ta',
      headline: 'English headline inside Tamil edition should fail',
      article_body: 'English body inside Tamil edition should be rejected by validation.',
    }),
    seenUrls,
    seenHeadlines
  );
  assert.equal(nonTamilInTa.ok, false);
});

test('PDF generator renders 1-article, multi-article, long-text, and large editions with zero blank pages', async () => {
  const mkEdition = (count, lang = 'en') => ({
    id: `ed-${count}-${lang}`,
    editionDate: '2026-11-27',
    issueNumber: 1,
    language: lang,
    status: 'published',
    createdAt: new Date().toISOString(),
    summary: 'Edition summary',
    articles: Array.from({ length: count }, (_, i) => ({
      id: `a-${i}`,
      section: i === 0 ? 'Tamil Nadu' : i % 2 === 0 ? 'Technology and AI' : 'World',
      headline:
        lang === 'ta'
          ? `தமிழ்நாடு செய்தி ${i + 1}: சென்னையில் புதிய மெட்ரோ மற்றும் தொழில்நுட்பத் திட்டங்கள் தொடக்கம்`
          : `Story ${i + 1}: Major regional infrastructure and artificial intelligence research update announced today`,
      summary: 'Concise verified summary.',
      body:
        lang === 'ta'
          ? `தமிழ்நாடு மற்றும் உலகளாவிய தொழில்நுட்ப வளர்ச்சி குறித்த முக்கிய செய்தி அறிக்கை ${i + 1}. அதிகாரப்பூர்வ தகவல்களின் அடிப்படையில் இந்தச் செய்தி வெளியிடப்படுகிறது.`
          : `Verified editorial report ${i + 1} covering regional policy, scientific progress, and global developments with full source attribution and balanced broadsheet formatting. `.repeat(
              i === 2 ? 3 : 1
            ),
      sourceName: i === 0 ? 'The Hindu - Tamil Nadu' : 'BBC Technology',
      sourceUrl: `https://example.com/story-${i + 1}`,
      imageIsAi: false,
      language: lang,
      verificationStatus: 'verified',
    })),
  });

  for (const [count, lang] of [
    [1, 'en'],
    [8, 'en'],
    [14, 'en'],
    [6, 'ta'],
  ]) {
    const ed = mkEdition(count, lang);
    const pdfBuf = await renderEditionPdf(ed);
    assert.ok(pdfBuf.subarray(0, 5).toString('utf8') === '%PDF-', 'Should emit valid PDF header');
    assert.ok(pdfBuf.length > 1500, `PDF for ${count} ${lang} articles should be non-trivial`);

    const parser = new PDFParse({ data: pdfBuf });
    const parsed = await parser.getText();
    const pages = parsed.pages || [];
    assert.ok(pages.length >= 1, 'Should produce at least 1 page');
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      assert.ok(
        pages[pIdx].text.trim().length > 60,
        `Page ${pIdx + 1} of ${count}-${lang} should not be blank`
      );
    }
    assert.ok(!/Hi Hari|I received your message|I am ready to help/i.test(parsed.text));
    if (lang === 'ta') {
      assert.ok(/[\u0B80-\u0BFF]/.test(parsed.text), 'Tamil PDF must contain Tamil Unicode glyphs');
    }

    const html = renderEditionHtml(ed);
    assert.ok(html.includes('KAREN TIMES') || html.includes('கரென் டைம்ஸ்'));
    assert.ok(!/Hi Hari|I received your message/i.test(html));
  }
});
