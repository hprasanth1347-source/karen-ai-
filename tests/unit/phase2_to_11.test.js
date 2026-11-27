import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheService } from '../../apps/api/dist/services/cache.service.js';
import { computeNextOccurrence } from '../../apps/api/dist/services/reminders.service.js';
import { googleConnectionManager } from '../../apps/api/dist/services/googleConnectionManager.service.js';
import { renderEditionHtml, renderEditionPdf, getNewsroomConfig } from '../../apps/api/dist/services/newsroom.service.js';

test('CacheService enforces user isolation and invalidation', async () => {
  const keyA = cacheService.buildKey('lovemode', 'user-a', 'state');
  const keyB = cacheService.buildKey('lovemode', 'user-b', 'state');
  assert.notEqual(keyA, keyB);

  await cacheService.set(keyA, { mood: 'happy-a' }, 60);
  await cacheService.set(keyB, { mood: 'calm-b' }, 60);

  assert.deepEqual(await cacheService.get(keyA), { mood: 'happy-a' });
  assert.deepEqual(await cacheService.get(keyB), { mood: 'calm-b' });

  cacheService.invalidateUser('user-a');
  assert.equal(await cacheService.get(keyA), null);
  assert.deepEqual(await cacheService.get(keyB), { mood: 'calm-b' });
});

test('Reminders computeNextOccurrence handles daily and weekly rules', () => {
  const base = '2026-11-27T02:30:00.000Z';
  assert.equal(computeNextOccurrence(base, 'daily'), '2026-11-28T02:30:00.000Z');
  assert.equal(computeNextOccurrence(base, 'weekly'), '2026-12-04T02:30:00.000Z');
  assert.equal(computeNextOccurrence(base, null), null);
});

test('GoogleConnectionManager maps HTTP errors to structured codes', () => {
  assert.equal(googleConnectionManager.mapHttpError(401).code, 'GOOGLE_TOKEN_EXPIRED');
  assert.equal(googleConnectionManager.mapHttpError(403).code, 'GOOGLE_PERMISSION_DENIED');
  assert.equal(googleConnectionManager.mapHttpError(404).code, 'GOOGLE_FILE_NOT_FOUND');
  assert.equal(googleConnectionManager.mapHttpError(429).code, 'GOOGLE_RATE_LIMITED');
});

test('KAREN TIMES Newsroom renders branded English and Tamil editions', () => {
  const cfg = getNewsroomConfig();
  assert.equal(cfg.brandEnglish, 'KAREN TIMES');
  assert.equal(cfg.brandTamil, 'கரென் டைம்ஸ்');
  assert.equal(cfg.tagline, 'KNOWLEDGE IS WISDOM.');

  const html = renderEditionHtml({
    id: 'ed-1',
    editionDate: '2026-11-27',
    issueNumber: 1,
    language: 'en',
    status: 'draft',
    summary: 'Headline 1',
    createdAt: new Date().toISOString(),
    articles: [
      {
        id: 'a-1',
        section: 'India',
        headline: 'Test Headline',
        summary: 'Test Summary',
        body: 'Test Body',
        sourceName: 'The Hindu',
        sourceUrl: 'https://www.thehindu.com/',
        imageIsAi: false,
      },
    ],
  });
  assert.ok(html.includes('KAREN TIMES'));
  assert.ok(html.includes('#F4EBDD'));
  assert.ok(html.includes('Test Headline'));
});

test('KAREN TIMES Newsroom generates a valid PDF buffer', async () => {
  const pdf = await renderEditionPdf({
    id: 'ed-pdf-1',
    editionDate: '2026-11-27',
    issueNumber: 1,
    language: 'en',
    status: 'draft',
    summary: 'Headline 1',
    createdAt: new Date().toISOString(),
    articles: [
      {
        id: 'a-1',
        section: 'India',
        headline: 'PDF Test Headline',
        summary: 'Summary',
        body: 'Body text for PDF generation.',
        sourceName: 'The Hindu',
        sourceUrl: 'https://www.thehindu.com/',
        imageIsAi: false,
      },
    ],
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 500);
  assert.equal(pdf.subarray(0, 5).toString('utf8'), '%PDF-');
});
