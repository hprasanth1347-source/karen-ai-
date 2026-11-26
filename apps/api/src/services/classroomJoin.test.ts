import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeCourseIdFromClassroomSlug,
  joinClassroom,
  parseClassroomCourseInput,
} from './classroom.service.js';
import { planDeterministicCommand, runCommandEngine } from '../commands/engine.js';
import { saveGoogleTokensToDb } from './persistence.service.js';

test('decodeCourseIdFromClassroomSlug & parseClassroomCourseInput handle numeric, URL with/without cjc, base64 with/without padding, invalid', () => {
  assert.equal(decodeCourseIdFromClassroomSlug('123456789'), '123456789');

  const rawId = '712345678901';
  const b64NoPad = Buffer.from(rawId, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const b64Pad = Buffer.from(rawId, 'utf8').toString('base64');

  assert.equal(decodeCourseIdFromClassroomSlug(b64NoPad), rawId);
  assert.equal(decodeCourseIdFromClassroomSlug(b64Pad), rawId);
  assert.equal(decodeCourseIdFromClassroomSlug('not-a-valid-numeric-id'), 'not-a-valid-numeric-id');

  const withCjc = parseClassroomCourseInput(`https://classroom.google.com/c/${b64NoPad}?cjc=Abc1234`);
  assert.equal(withCjc.courseId, rawId);
  assert.equal(withCjc.cjc, 'Abc1234');

  const withoutCjc = parseClassroomCourseInput(`https://classroom.google.com/c/${b64NoPad}`);
  assert.equal(withoutCjc.courseId, rawId);
  assert.equal(withoutCjc.cjc, undefined);
});

test('Classroom join natural language & pending_action flows (including multiple links)', async () => {
  const p1 = planDeterministicCommand('join class 123456789 code abc1234', [], false);
  assert.equal(p1?.[0]?.tool, 'classroom_join');
  assert.equal(p1?.[0]?.args.courseId, '123456789');
  assert.equal(p1?.[0]?.args.classCode, 'abc1234');

  const p2 = planDeterministicCommand('class id 987654321 and code xyz987 join pannu', [], false);
  assert.equal(p2?.[0]?.tool, 'classroom_join');
  assert.equal(p2?.[0]?.args.courseId, '987654321');
  assert.equal(p2?.[0]?.args.classCode, 'xyz987');

  const pMulti = planDeterministicCommand(
    'add me to https://classroom.google.com/c/MTIz?cjc=abc1234 and https://classroom.google.com/c/NDU2?cjc=xyz9876',
    [],
    false
  );
  assert.equal(pMulti?.length, 2);

  // Bare code asks for class ID/link and stores pending_action
  const bare = await runCommandEngine({
    chatKey: 'tg-join-test',
    text: 'join class code abc1234',
    channel: 'telegram',
    useLlmFallback: false,
  });
  assert.equal(bare.outcome, 'needs_clarification');
  assert.match(bare.reply, /does not allow joining by a bare class code alone/i);

  // Next message provides numeric Class ID -> resolves pending_action to confirmation card
  const followUp = await runCommandEngine({
    chatKey: 'tg-join-test',
    text: '123456789',
    channel: 'telegram',
    useLlmFallback: false,
  });
  assert.equal(followUp.outcome, 'needs_tap');
  assert.match(followUp.reply, /123456789/);
});

test('joinClassroom maps mocked Google API responses: success, wrong code, not found, archived, missing scope, already enrolled', async () => {
  await saveGoogleTokensToDb({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600_000,
  });

  const origFetch = globalThis.fetch;
  try {
    // 1. Success
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ courseId: '111222333', userId: 'me' }), { status: 200 })) as typeof fetch;
    const okRes = await joinClassroom({ mode: 'id_code', courseId: '111222333', classCode: 'Abc1234' });
    assert.equal(okRes.joined, true);
    assert.equal(okRes.courseId, '111222333');

    // 2. Wrong code
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid enrollment code' } }), { status: 400 })) as typeof fetch;
    const wrongCode = await joinClassroom({ mode: 'id_code', courseId: '111222333', classCode: 'wrong99' });
    assert.equal(wrongCode.joined, false);
    assert.equal(wrongCode.errorCode, 'WRONG_CODE');

    // 3. Not found
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Requested entity was not found.' } }), { status: 404 })) as typeof fetch;
    const notFound = await joinClassroom({ mode: 'id_code', courseId: '999999999', classCode: 'Abc1234' });
    assert.equal(notFound.joined, false);
    assert.equal(notFound.errorCode, 'COURSE_NOT_FOUND');

    // 4. Archived
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Course is archived' } }), { status: 400 })) as typeof fetch;
    const archived = await joinClassroom({ mode: 'id_code', courseId: '111222333', classCode: 'Abc1234' });
    assert.equal(archived.joined, false);
    assert.equal(archived.errorCode, 'COURSE_ARCHIVED');

    // 5. Missing scope
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Request had insufficient authentication scopes.' } }), { status: 403 })) as typeof fetch;
    const scopeErr = await joinClassroom({ mode: 'id_code', courseId: '111222333', classCode: 'Abc1234' });
    assert.equal(scopeErr.joined, false);
    assert.equal(scopeErr.errorCode, 'MISSING_ROSTER_SCOPE');

    // 6. Already enrolled (409)
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Requested entity already exists' } }), { status: 409 })) as typeof fetch;
    const already = await joinClassroom({ mode: 'id_code', courseId: '111222333', classCode: 'Abc1234' });
    assert.equal(already.joined, true);
    assert.equal(already.alreadyEnrolled, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});
