import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.GROQ_API_KEY = 'test-groq-key';
process.env.AUTON_MODEL_ID = 'configured-model';

const { AIProviderError, generateAIReply, listAIModels } = await import('./ai.service.js');

test('model catalog includes provider models and configured default', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const models = await listAIModels('groq');
    assert.deepEqual(
      models.map(({ id }) => id),
      ['configured-model', 'model-a', 'model-b']
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chat request uses the model selected by the user', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestBody:
    | {
        model?: string;
        temperature?: number;
        messages?: Array<{ role: string; content: string }>;
      }
    | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'model response' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const result = await generateAIReply(
      'hello',
      [{ role: 'assistant', content: 'A previous response' }],
      'groq',
      'selected-model'
    );
    assert.equal(requestUrl, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(requestBody?.model, 'selected-model');
    assert.equal(requestBody?.temperature, 0.85);
    assert.match(requestBody?.messages?.[0]?.content || '', /Avoid repeating previous answers/);
    assert.equal(requestBody?.messages?.[1]?.content, 'A previous response');
    assert.equal(result.model, 'selected-model');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider failures are surfaced instead of returning a canned reply', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'invalid API key' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    await assert.rejects(
      generateAIReply('hello', [], 'groq'),
      (error: unknown) =>
        error instanceof AIProviderError &&
        error.statusCode === 502 &&
        error.message.includes('invalid API key')
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
