import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import app from '../app.js';
import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/env.js';

const PROTECTED_GET_ROUTES = [
  '/api/v1/auth/me',
  '/api/v1/integrations/status',
  '/api/v1/activity',
  '/api/v1/ai/models?provider=groq',
  '/api/v1/ai/conversations',
  '/api/v1/voice/status',
  '/api/v1/love-mode/status',
  '/api/v1/classroom/status',
  '/api/v1/documents',
  '/api/v1/memories',
  '/api/v1/tasks',
  '/api/v1/notifications',
  '/api/v1/approvals',
  '/api/v1/drive/status',
  '/api/v1/telegram/status',
  '/api/v1/instagram/profile',
  '/api/v1/integrations/search-status',
  '/api/v1/settings/brand',
];

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('Phase 1 Auth Matrix: public /health returns 200', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
  });
});

test('Phase 1 Auth Matrix: every protected route returns 401 without Bearer token', async () => {
  await withServer(async (baseUrl) => {
    for (const route of PROTECTED_GET_ROUTES) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 401, `Expected 401 for ${route}, got ${res.status}`);
      const body = (await res.json()) as { ok: boolean; code: string };
      assert.equal(body.ok, false);
      assert.equal(body.code, 'UNAUTHORIZED');
    }
  });
});

test('Phase 1 Auth Matrix: non-owner valid token returns 403 and owner valid token returns 200', async () => {
  const origGetUser = supabaseAdmin.auth.getUser.bind(supabaseAdmin.auth);
  const origOwnerEmail = config.OWNER_EMAIL;
  config.OWNER_EMAIL = 'owner@example.com';

  try {
    (supabaseAdmin.auth as unknown as { getUser: (t: string) => Promise<unknown> }).getUser = async (token: string) => {
      if (token === 'non-owner-token') {
        return { data: { user: { id: 'user-2', email: 'intruder@example.com', app_metadata: {} } }, error: null };
      }
      if (token === 'owner-token') {
        return { data: { user: { id: 'user-1', email: 'owner@example.com', app_metadata: { role: 'owner' } } }, error: null };
      }
      return { data: { user: null }, error: new Error('Invalid') };
    };

    await withServer(async (baseUrl) => {
      for (const route of ['/api/v1/auth/me', '/api/v1/memories', '/api/v1/tasks', '/api/v1/telegram/status']) {
        const resNonOwner = await fetch(`${baseUrl}${route}`, {
          headers: { Authorization: 'Bearer non-owner-token' },
        });
        assert.equal(resNonOwner.status, 403, `Expected 403 for non-owner on ${route}, got ${resNonOwner.status}`);

        const resOwner = await fetch(`${baseUrl}${route}`, {
          headers: { Authorization: 'Bearer owner-token' },
        });
        assert.equal(resOwner.status, 200, `Expected 200 for owner on ${route}, got ${resOwner.status}`);
      }
    });
  } finally {
    config.OWNER_EMAIL = origOwnerEmail;
    (supabaseAdmin.auth as unknown as { getUser: typeof origGetUser }).getUser = origGetUser;
  }
});

test('Phase 1 Cron Auth: /cron/* returns 401 without valid CRON_SECRET', async () => {
  const origSecret = config.CRON_SECRET;
  config.CRON_SECRET = 'test-cron-secret-123';
  try {
    await withServer(async (baseUrl) => {
      const res1 = await fetch(`${baseUrl}/api/v1/cron/companion-tick`);
      assert.equal(res1.status, 401);

      const res2 = await fetch(`${baseUrl}/api/v1/cron/classroom-sync`, {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      });
      assert.equal(res2.status, 401);
    });
  } finally {
    config.CRON_SECRET = origSecret;
  }
});

test('Phase 1 Telegram Webhook: returns 401 in production without secret header', async () => {
  const origNodeEnv = config.NODE_ENV;
  const origSecret = config.TELEGRAM_WEBHOOK_SECRET;
  config.NODE_ENV = 'production';
  config.TELEGRAM_WEBHOOK_SECRET = 'tg-prod-secret';
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/v1/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1 }),
      });
      assert.equal(res.status, 401);
    });
  } finally {
    config.NODE_ENV = origNodeEnv;
    config.TELEGRAM_WEBHOOK_SECRET = origSecret;
  }
});
