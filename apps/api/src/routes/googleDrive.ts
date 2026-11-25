import { Router } from 'express';
import { config } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { aiLimit } from '../middleware/rateLimit.js';
import { generateAIReply } from '../services/ai.service.js';
import { logger } from '../config/logger.js';
import { success, error } from '../utils/response.js';

interface DriveTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let driveTokens: DriveTokenState | null = null;
const router = Router();

function isGoogleConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri(req: { headers: Record<string, string | string[] | undefined>; protocol?: string }): string {
  if (
    config.GOOGLE_REDIRECT_URI &&
    !config.GOOGLE_REDIRECT_URI.includes('localhost')
  ) {
    return config.GOOGLE_REDIRECT_URI;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  if (host) {
    return `${proto}://${Array.isArray(host) ? host[0] : host}/api/v1/auth/google/callback`;
  }
  return config.GOOGLE_REDIRECT_URI;
}

function buildGoogleAuthUrl(redirectUri: string, state: 'drive' | 'gmail' = 'drive'): string {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function getValidAccessToken(): Promise<string | null> {
  if (!driveTokens) return null;
  if (Date.now() < driveTokens.expiresAt - 60_000) {
    return driveTokens.accessToken;
  }
  if (!driveTokens.refreshToken || !isGoogleConfigured()) {
    return null;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: driveTokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (!json.access_token) return null;

  driveTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || driveTokens.refreshToken,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
  return driveTokens.accessToken;
}

router.get('/auth/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
  const targetPage = req.query.state === 'gmail' ? '/gmail' : '/drive';
  if (oauthError || !code) {
    return res.redirect(`${targetPage}?error=${encodeURIComponent(oauthError || 'missing_code')}`);
  }
  if (!isGoogleConfigured()) {
    return res.redirect(`${targetPage}?error=google_not_configured`);
  }

  try {
    const redirectUri = getRedirectUri(req);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const json = await tokenRes.json();
    if (!tokenRes.ok || !json.access_token) {
      logger.warn('Google OAuth token exchange failed', json);
      return res.redirect(`${targetPage}?error=${encodeURIComponent(json.error_description || json.error || 'token_exchange_failed')}`);
    }

    driveTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || driveTokens?.refreshToken || '',
      expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    };
    return res.redirect(`${targetPage}?connected=1`);
  } catch (err) {
    logger.error('Google OAuth callback error:', err);
    return res.redirect(`${targetPage}?error=oauth_callback_error`);
  }
});

router.use('/drive', (req, res, next) => {
  if (config.NODE_ENV !== 'production') {
    return next();
  }
  return requireAuth(req, res, next);
});

router.get('/drive/status', (_req, res) => {
  return success(res, {
    configured: isGoogleConfigured(),
    connected: Boolean(driveTokens?.accessToken),
  });
});

router.get('/drive/auth-url', (req, res) => {
  if (!isGoogleConfigured()) {
    return error(res, 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured in Vercel.', 400, 'GOOGLE_NOT_CONFIGURED');
  }
  const redirectUri = getRedirectUri(req);
  const state = req.query.source === 'gmail' ? 'gmail' : 'drive';
  return success(res, {
    url: buildGoogleAuthUrl(redirectUri, state),
    redirectUri,
  });
});

router.post('/drive/disconnect', (_req, res) => {
  driveTokens = null;
  return success(res, { disconnected: true });
});

router.get('/drive/files', async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return error(res, 'Google Drive is not connected yet.', 401, 'DRIVE_NOT_CONNECTED');
  }

  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const escaped = search.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const driveQuery = escaped
    ? `trashed = false and name contains '${escaped}'`
    : 'trashed = false';

  const params = new URLSearchParams({
    q: driveQuery,
    pageSize: '25',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
  });

  try {
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await driveRes.json();
    if (!driveRes.ok) {
      return error(res, json.error?.message || 'Google Drive API error', driveRes.status);
    }
    return success(res, json.files || []);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Failed to list Drive files', 502);
  }
});

router.use('/gmail', (req, res, next) => {
  if (config.NODE_ENV !== 'production') {
    return next();
  }
  return requireAuth(req, res, next);
});

async function fetchRecentGmailMessages(token: string) {
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const listJson = await listRes.json();
  if (!listRes.ok) {
    throw new Error(listJson.error?.message || 'Gmail API error');
  }

  const refs: Array<{ id: string }> = listJson.messages || [];
  const details = await Promise.all(
    refs.slice(0, 10).map(async ({ id }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msgJson = await msgRes.json();
      const headers: Array<{ name: string; value: string }> = msgJson.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      return {
        id,
        subject: getHeader('Subject') || '(No Subject)',
        from: getHeader('From') || 'Unknown sender',
        date: getHeader('Date') || '',
        snippet: msgJson.snippet || '',
      };
    })
  );
  return details;
}

router.get('/gmail/messages', async (_req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return error(res, 'Gmail is not connected yet. Click "Connect Google / Gmail" first.', 401, 'GMAIL_NOT_CONNECTED');
  }
  try {
    const messages = await fetchRecentGmailMessages(token);
    return success(res, messages);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Failed to fetch Gmail messages', 502);
  }
});

router.post('/gmail/digest', aiLimit, async (_req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return error(res, 'Gmail is not connected yet.', 401, 'GMAIL_NOT_CONNECTED');
  }
  try {
    const messages = await fetchRecentGmailMessages(token);
    if (messages.length === 0) {
      return success(res, { digest: 'No recent emails found in your inbox.' });
    }
    const summaryInput = messages
      .map((m, idx) => `${idx + 1}. From: ${m.from} | Subject: ${m.subject} | Date: ${m.date}\n   Snippet: ${m.snippet}`)
      .join('\n');
    const result = await generateAIReply(
      `Summarize these recent emails into a crisp Daily Digest with key deadlines, bills, or action items:\n\n${summaryInput}`,
      []
    );
    return success(res, { digest: result.reply, provider: result.provider, model: result.model });
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Failed to generate email digest', 502);
  }
});

export async function getGoogleContextForPrompt(prompt: string): Promise<string> {
  const wantsEmail = /\b(email|emails|mail|gmail|inbox|message|bill|invoice|schedule|deadline)\b/i.test(prompt);
  const wantsDrive = /\b(drive|file|files|document|documents|doc|pdf|folder|notes)\b/i.test(prompt);
  if (!wantsEmail && !wantsDrive) return '';

  const token = await getValidAccessToken();
  if (!token) return '';

  const sections: string[] = [];

  if (wantsDrive) {
    try {
      const params = new URLSearchParams({
        q: 'trashed = false',
        pageSize: '8',
        orderBy: 'modifiedTime desc',
        fields: 'files(name,mimeType,modifiedTime,webViewLink)',
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const files: Array<{ name: string; modifiedTime?: string }> = json.files || [];
        if (files.length > 0) {
          sections.push(
            `Recent Google Drive Files:\n${files.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}`
          );
        }
      }
    } catch {
      // Ignore Drive context errors so chat still responds
    }
  }

  if (wantsEmail) {
    try {
      const messages = (await fetchRecentGmailMessages(token)).slice(0, 6);
      if (messages.length > 0) {
        sections.push(
          `Recent Gmail Messages:\n${messages
            .map((m, i) => `${i + 1}. From: ${m.from} | Subject: ${m.subject} | Snippet: ${m.snippet}`)
            .join('\n')}`
        );
      }
    } catch {
      // Ignore Gmail context errors so chat still responds
    }
  }

  return sections.length > 0 ? `\n\n${sections.join('\n\n')}` : '';
}

export default router;
