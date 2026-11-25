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
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '),
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

async function fetchRecentGmailMessages(token: string, query = '') {
  const params = new URLSearchParams({ maxResults: '10' });
  if (query.trim()) {
    params.set('q', query.trim());
  }
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
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

function decodeBase64Url(data?: string): string {
  if (!data) return '';
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function extractGmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const plain = extractGmailBody(part);
      if (plain) return plain;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return '';
}

async function fetchDriveFilePreview(
  token: string,
  fileId: string
): Promise<{ id: string; name: string; mimeType: string; webViewLink?: string; content?: string; previewUnavailable?: boolean }> {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  if (!metaRes.ok) {
    throw new Error(meta.error?.message || 'Could not load Drive file metadata');
  }

  const mime = String(meta.mimeType || '');
  let content = '';
  let previewUnavailable = false;

  if (mime === 'application/vnd.google-apps.document') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.ok) content = await r.text();
  } else if (mime === 'application/vnd.google-apps.spreadsheet') {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.ok) content = await r.text();
  } else if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|csv|json|log|ts|js|py|html|xml)$/i.test(meta.name || '')
  ) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.ok) content = await r.text();
  } else {
    previewUnavailable = true;
  }

  return {
    id: meta.id,
    name: meta.name,
    mimeType: mime,
    webViewLink: meta.webViewLink,
    content: content ? content.slice(0, 20000) : undefined,
    previewUnavailable,
  };
}

router.get('/drive/files/:id/content', async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return error(res, 'Google Drive is not connected yet.', 401, 'DRIVE_NOT_CONNECTED');
  }
  try {
    const file = await fetchDriveFilePreview(token, String(req.params.id));
    return success(res, file);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Failed to open Drive file', 502);
  }
});

router.get('/gmail/messages/:id', async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return error(res, 'Gmail is not connected yet.', 401, 'GMAIL_NOT_CONNECTED');
  }
  try {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(req.params.id))}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const msgJson = await msgRes.json();
    if (!msgRes.ok) {
      return error(res, msgJson.error?.message || 'Failed to open email', msgRes.status);
    }
    const headers: Array<{ name: string; value: string }> = msgJson.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    const body = extractGmailBody(msgJson.payload) || msgJson.snippet || '';
    return success(res, {
      id: msgJson.id,
      subject: getHeader('Subject') || '(No Subject)',
      from: getHeader('From') || 'Unknown sender',
      to: getHeader('To') || '',
      date: getHeader('Date') || '',
      snippet: msgJson.snippet || '',
      body,
    });
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Failed to open email', 502);
  }
});

async function findDriveFileWithContent(
  token: string,
  nameQuery: string
): Promise<{ name: string; mimeType: string; data: Buffer; webViewLink?: string } | null> {
  const clean = nameQuery.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (!clean) return null;

  const params = new URLSearchParams({
    q: `trashed = false and name contains '${clean}'`,
    pageSize: '3',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,size,webViewLink)',
  });
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return null;
  const listJson = await listRes.json();
  const file = listJson.files?.[0];
  if (!file?.id) return null;

  const sizeNum = Number(file.size || 0);
  if (sizeNum > 10 * 1024 * 1024) {
    return null;
  }

  let downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  let outMime = file.mimeType || 'application/octet-stream';
  let outName = file.name || 'attachment';

  if (String(file.mimeType).startsWith('application/vnd.google-apps.')) {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/pdf`;
    outMime = 'application/pdf';
    if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';
  }

  const fileRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) return null;
  const arrayBuf = await fileRes.arrayBuffer();
  return {
    name: outName,
    mimeType: outMime,
    data: Buffer.from(arrayBuf),
    webViewLink: file.webViewLink,
  };
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  body: string,
  attachmentQuery?: string
): Promise<{ success: boolean; attachedFile?: string; error?: string }> {
  const token = await getValidAccessToken();
  if (!token) {
    return { success: false, error: 'Gmail is not connected. Please connect Google on /drive or /gmail first.' };
  }

  let attachment: { name: string; mimeType: string; data: Buffer; webViewLink?: string } | null = null;
  if (attachmentQuery?.trim()) {
    try {
      attachment = await findDriveFileWithContent(token, attachmentQuery.trim());
    } catch (err) {
      logger.warn('Could not fetch Drive attachment, sending email without attachment', { err });
    }
  }

  let rawEmail: string;
  if (attachment) {
    const boundary = `karen_boundary_${Date.now()}`;
    const bodyWithLink = attachment.webViewLink
      ? `${body}\n\nGoogle Drive Link: ${attachment.webViewLink}`
      : body;
    rawEmail = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      bodyWithLink,
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.name}"`,
      '',
      attachment.data.toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    rawEmail = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');
  }

  const encoded = Buffer.from(rawEmail).toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { success: false, error: json.error?.message || 'Failed to send email' };
  }
  return { success: true, attachedFile: attachment?.name };
}

router.get('/gmail/messages', async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return error(res, 'Gmail is not connected yet. Click "Connect Google / Gmail" first.', 401, 'GMAIL_NOT_CONNECTED');
  }
  try {
    const importantOnly = req.query.important === '1' || req.query.important === 'true';
    const q = typeof req.query.q === 'string' ? req.query.q : importantOnly ? 'is:important' : '';
    const messages = await fetchRecentGmailMessages(token, q);
    return success(res, messages);
  } catch (err) {
    return error(res, err instanceof Error ? err.message : 'Failed to fetch Gmail messages', 502);
  }
});

router.post('/gmail/send', async (req, res) => {
  const { to, subject, body } = req.body || {};
  if (!to || !subject || !body) {
    return error(res, 'to, subject, and body are required', 400);
  }
  const result = await sendGmailMessage(String(to), String(subject), String(body));
  if (!result.success) {
    return error(res, result.error || 'Failed to send email', 502);
  }
  return success(res, { sent: true });
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

function extractSearchKeyword(prompt: string): string {
  const quoted = prompt.match(/["']([^"']{2,60})["']/);
  if (quoted?.[1]) return quoted[1].trim();
  const fileMatch = prompt.match(/([A-Za-z0-9._-]+\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|png|jpg|jpeg))/i);
  if (fileMatch?.[1]) return fileMatch[1].trim();
  const stopWords = new Set([
    'find', 'fetch', 'get', 'show', 'open', 'send', 'share', 'read', 'check', 'my', 'the', 'a', 'an',
    'in', 'on', 'from', 'to', 'of', 'for', 'with', 'about', 'email', 'emails', 'mail', 'gmail', 'inbox',
    'drive', 'file', 'files', 'document', 'documents', 'important', 'recent', 'latest', 'karen', 'please',
    'can', 'you', 'what', 'is', 'are', 'me', 'some', 'someone', 'name', 'called', 'named',
  ]);
  const words = prompt
    .replace(/[^\w\s.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w.toLowerCase()));
  return words.slice(0, 2).join(' ');
}

export async function getGoogleContextForPrompt(prompt: string): Promise<string> {
  const wantsEmail = /\b(email|emails|mail|gmail|inbox|message|bill|invoice|schedule|deadline|important|send)\b/i.test(prompt);
  const wantsDrive = /\b(drive|file|files|document|documents|doc|pdf|folder|notes|send|share|fetch|find|important)\b/i.test(prompt);
  if (!wantsEmail && !wantsDrive) return '';

  const token = await getValidAccessToken();
  if (!token) return '';

  const keyword = extractSearchKeyword(prompt);
  const sections: string[] = [];

  if (wantsDrive) {
    try {
      const escaped = keyword.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const q = escaped ? `trashed = false and name contains '${escaped}'` : 'trashed = false';
      const params = new URLSearchParams({
        q,
        pageSize: '8',
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
      });
      let res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let json = res.ok ? await res.json() : { files: [] };
      if ((!json.files || json.files.length === 0) && escaped) {
        params.set('q', 'trashed = false');
        res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        json = res.ok ? await res.json() : { files: [] };
      }
      const files: Array<{ id: string; name: string; webViewLink?: string }> = json.files || [];
      if (files.length > 0) {
        let topFileContent = '';
        try {
          const preview = await fetchDriveFilePreview(token, files[0].id);
          if (preview.content) {
            topFileContent = `\n   Top File Content (${preview.name}):\n   ${preview.content.slice(0, 3000)}`;
          }
        } catch {
          // Ignore preview failure
        }
        sections.push(
          `Google Drive Files${keyword ? ` (matched/recent for "${keyword}")` : ''}:\n${files
            .map((f, i) => `${i + 1}. ${f.name}${f.webViewLink ? ` — Link: ${f.webViewLink}` : ''}`)
            .join('\n')}${topFileContent}`
        );
      }
    } catch {
      // Ignore Drive context errors so chat still responds
    }
  }

  if (wantsEmail) {
    try {
      const isImportant = /\bimportant\b/i.test(prompt);
      const emailQuery = isImportant ? 'is:important' : keyword || '';
      let messages = (await fetchRecentGmailMessages(token, emailQuery)).slice(0, 6);
      if (messages.length === 0 && emailQuery) {
        messages = (await fetchRecentGmailMessages(token)).slice(0, 6);
      }
      if (messages.length > 0) {
        const detailedBodies = await Promise.all(
          messages.slice(0, 2).map(async (m) => {
            try {
              const fullRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (!fullRes.ok) return '';
              const fullJson = await fullRes.json();
              const body = extractGmailBody(fullJson.payload);
              return body ? `\n   [Full Body - ${m.subject}]: ${body.slice(0, 1500)}` : '';
            } catch {
              return '';
            }
          })
        );
        sections.push(
          `Gmail Messages${isImportant ? ' (Important)' : ''}:\n${messages
            .map((m, i) => `${i + 1}. From: ${m.from} | Subject: ${m.subject} | Snippet: ${m.snippet}`)
            .join('\n')}${detailedBodies.filter(Boolean).join('')}`
        );
      }
    } catch {
      // Ignore Gmail context errors so chat still responds
    }
  }

  return sections.length > 0 ? `\n\n${sections.join('\n\n')}` : '';
}

export default router;
