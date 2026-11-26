import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { aiLimit } from '../middleware/rateLimit.js';
import { generateAIReply } from '../services/ai.service.js';
import { clearGoogleTokensFromDb, getOwnerUserId, loadGoogleTokensWithStatus, markGoogleNeedsReauth, saveGoogleTokensToDb, } from '../services/persistence.service.js';
import { extractTextFromBuffer } from '../utils/docParser.js';
import { encryptJson, decryptJson } from '../utils/crypto.js';
import { logger } from '../config/logger.js';
import { success, error } from '../utils/response.js';
const GOOGLE_COOKIE_NAME = 'karen_google_tokens';
function readGoogleTokensFromCookie(req) {
    const rawCookie = req?.headers?.cookie;
    if (!rawCookie)
        return null;
    for (const part of rawCookie.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1)
            continue;
        const name = part.slice(0, idx).trim();
        if (name === GOOGLE_COOKIE_NAME) {
            const val = decodeURIComponent(part.slice(idx + 1).trim());
            const parsed = decryptJson(val);
            if (parsed?.accessToken)
                return parsed;
        }
    }
    return null;
}
const VALID_TARGET_PAGES = new Set(['drive', 'gmail', 'classroom', 'contacts', 'sheets', 'tasks']);
const router = Router();
const refreshMutexes = new Map();
function getStateSecret() {
    return config.APP_SECRET || config.JWT_SECRET || config.ENCRYPTION_KEY || 'karen-dev-oauth-state-secret';
}
function createSignedOAuthState(userId, target) {
    const payload = Buffer.from(JSON.stringify({
        nonce: crypto.randomBytes(16).toString('hex'),
        userId,
        target,
        exp: Date.now() + 10 * 60 * 1000,
    }), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}
export function verifySignedOAuthState(rawState) {
    const parts = rawState.split('.');
    if (parts.length !== 2)
        return null;
    const [payload, sig] = parts;
    const expectedSig = crypto
        .createHmac('sha256', getStateSecret())
        .update(payload)
        .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp)
            return null;
        const target = parsed.target && VALID_TARGET_PAGES.has(parsed.target) ? parsed.target : 'drive';
        return { userId: parsed.userId, target };
    }
    catch {
        return null;
    }
}
export async function hydrateGoogleTokensFromRequest(_req) {
    // Tokens are now loaded per request directly from provider_connections
}
function isGoogleConfigured() {
    return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}
export { isGoogleConfigured as isGoogleOAuthConfigured };
function getRedirectUri(req) {
    if (config.GOOGLE_REDIRECT_URI &&
        !config.GOOGLE_REDIRECT_URI.includes('localhost')) {
        return config.GOOGLE_REDIRECT_URI;
    }
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    if (host) {
        return `${proto}://${Array.isArray(host) ? host[0] : host}/api/v1/auth/google/callback`;
    }
    return config.GOOGLE_REDIRECT_URI;
}
export { getRedirectUri as getGoogleRedirectUri };
function buildGoogleAuthUrl(redirectUri, stateTarget = 'drive', userId = 'owner') {
    const scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/contacts.other.readonly',
    ];
    if (config.GOOGLE_CLASSROOM_ENABLED || stateTarget === 'classroom') {
        const rawClassroomScopes = config.GOOGLE_CLASSROOM_SCOPES ||
            'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/classroom.rosters';
        for (const s of rawClassroomScopes.split(/[\s,]+/).filter(Boolean)) {
            if (!scopes.includes(s))
                scopes.push(s);
        }
    }
    const signedState = createSignedOAuthState(userId, stateTarget);
    const params = new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state: signedState,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
export { buildGoogleAuthUrl };
async function performGoogleTokenRefresh(userId, stored) {
    if (!stored.refreshToken || !isGoogleConfigured()) {
        return null;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: config.GOOGLE_CLIENT_ID,
                    client_secret: config.GOOGLE_CLIENT_SECRET,
                    refresh_token: stored.refreshToken,
                    grant_type: 'refresh_token',
                }),
                signal: AbortSignal.timeout(8000),
            });
            const json = (await res.json().catch(() => ({})));
            if (res.ok && json.access_token) {
                const refreshed = {
                    accessToken: json.access_token,
                    refreshToken: json.refresh_token || stored.refreshToken,
                    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
                };
                await saveGoogleTokensToDb(refreshed, userId);
                return refreshed.accessToken;
            }
            if (json.error === 'invalid_grant' || res.status === 400 || res.status === 401) {
                logger.warn('Google refresh token revoked or invalid_grant', { userId, error: json.error });
                await markGoogleNeedsReauth(userId);
                return null;
            }
            // Transient 5xx / 429 — retry with backoff, keep connection
            if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 800));
            }
        }
        catch (err) {
            logger.warn('Transient Google token refresh failure', { userId, attempt, err });
            if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 800));
            }
        }
    }
    return stored.expiresAt > Date.now() ? stored.accessToken : null;
}
async function getValidAccessToken(req) {
    const userId = req?.user?.id || (await getOwnerUserId()) || '';
    let tokens = null;
    let status = 'disconnected';
    const dbRes = await loadGoogleTokensWithStatus(userId || undefined);
    tokens = dbRes.tokens;
    status = dbRes.status;
    // Fallback to encrypted HttpOnly cookie if DB persistence was unavailable
    if ((!tokens || status !== 'connected') && req) {
        const cookieTokens = readGoogleTokensFromCookie(req);
        if (cookieTokens?.accessToken) {
            tokens = cookieTokens;
            status = 'connected';
        }
    }
    if (!tokens || status !== 'connected')
        return null;
    // Refresh 5 minutes before expiry
    if (Date.now() < tokens.expiresAt - 300_000) {
        return tokens.accessToken;
    }
    const existingRefresh = refreshMutexes.get(userId);
    if (existingRefresh) {
        return existingRefresh;
    }
    const refreshPromise = performGoogleTokenRefresh(userId, tokens).finally(() => {
        refreshMutexes.delete(userId);
    });
    refreshMutexes.set(userId, refreshPromise);
    const refreshedToken = await refreshPromise;
    if (refreshedToken)
        return refreshedToken;
    return tokens.expiresAt > Date.now() ? tokens.accessToken : null;
}
export { getValidAccessToken as getValidGoogleAccessToken };
export async function hasDriveFileScope(userId) {
    const { tokens, status } = await loadGoogleTokensWithStatus(userId);
    if (status !== 'connected' || !tokens)
        return false;
    const scope = tokens.scope;
    return Boolean(scope && scope.includes('drive.file'));
}
export async function getGoogleAccessToken(userId, req) {
    if (req) {
        return getValidAccessToken(req);
    }
    const { tokens, status } = await loadGoogleTokensWithStatus(userId);
    if (status !== 'connected' || !tokens?.accessToken)
        return null;
    if (tokens.expiresAt && Date.now() >= tokens.expiresAt - 5 * 60 * 1000) {
        const refreshed = await performGoogleTokenRefresh(userId || 'owner', tokens);
        return refreshed || (tokens.expiresAt > Date.now() ? tokens.accessToken : null);
    }
    return tokens.accessToken;
}
export async function getGoogleConnectionStatus(userId, req) {
    const { status } = await loadGoogleTokensWithStatus(userId);
    if (status === 'connected')
        return status;
    if (req) {
        const cookieTokens = readGoogleTokensFromCookie(req);
        if (cookieTokens?.accessToken)
            return 'connected';
    }
    return status;
}
export async function disconnectGoogleAccount(explicitUserId) {
    const userId = explicitUserId || (await getOwnerUserId()) || undefined;
    const { tokens } = await loadGoogleTokensWithStatus(userId);
    const tokenToRevoke = tokens?.refreshToken || tokens?.accessToken;
    if (tokenToRevoke) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }).catch(() => { });
    }
    await clearGoogleTokensFromDb(userId);
}
router.get('/auth/google/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
    const rawState = typeof req.query.state === 'string' ? req.query.state : '';
    const verifiedState = verifySignedOAuthState(rawState);
    if (!verifiedState) {
        return res.status(400).redirect('/drive?error=invalid_oauth_state');
    }
    const targetPage = `/${verifiedState.target}`;
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
        const json = (await tokenRes.json());
        if (!tokenRes.ok || !json.access_token) {
            logger.warn('Google OAuth token exchange failed', json);
            return res.redirect(`${targetPage}?error=${encodeURIComponent(json.error_description || json.error || 'token_exchange_failed')}`);
        }
        const tokenPayload = {
            accessToken: json.access_token,
            refreshToken: json.refresh_token || '',
            expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
        };
        try {
            await saveGoogleTokensToDb(tokenPayload, verifiedState.userId);
        }
        catch (dbErr) {
            logger.warn('saveGoogleTokensToDb threw, continuing with encrypted HttpOnly cookie', { dbErr });
        }
        // Also persist encrypted tokens in an HttpOnly cookie so Google features work even if DB is unavailable
        try {
            const encryptedCookie = encryptJson(tokenPayload);
            res.cookie(GOOGLE_COOKIE_NAME, encryptedCookie, {
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 30 * 24 * 60 * 60 * 1000,
            });
        }
        catch (cookieErr) {
            logger.warn('Failed to set Google tokens cookie', { cookieErr });
        }
        return res.redirect(`${targetPage}?connected=1`);
    }
    catch (err) {
        logger.error('Google OAuth callback error:', err);
        const reason = err instanceof Error ? err.message : 'oauth_callback_error';
        return res.redirect(`${targetPage}?error=${encodeURIComponent(reason)}`);
    }
});
router.use('/drive', requireAuth, requireOwner);
router.get('/drive/status', async (req, res) => {
    let status = await getGoogleConnectionStatus(req.user?.id);
    if (status !== 'connected') {
        const cookieTokens = readGoogleTokensFromCookie(req);
        if (cookieTokens?.accessToken) {
            status = 'connected';
        }
    }
    return success(res, {
        configured: isGoogleConfigured(),
        connected: status === 'connected',
        status,
    });
});
router.get('/drive/auth-url', async (req, res) => {
    if (!isGoogleConfigured()) {
        return error(res, 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured in Vercel.', 400, 'GOOGLE_NOT_CONFIGURED');
    }
    const userId = req.user?.id || (await getOwnerUserId()) || 'owner';
    const redirectUri = getRedirectUri(req);
    const rawSource = typeof req.query.source === 'string' ? req.query.source : 'drive';
    const state = VALID_TARGET_PAGES.has(rawSource) ? rawSource : 'drive';
    return success(res, {
        url: buildGoogleAuthUrl(redirectUri, state, userId),
        redirectUri,
    });
});
router.post('/drive/disconnect', async (req, res) => {
    res.clearCookie(GOOGLE_COOKIE_NAME, { path: '/' });
    await disconnectGoogleAccount(req.user?.id);
    return success(res, { disconnected: true });
});
router.get('/drive/files', async (req, res) => {
    const token = await getValidAccessToken(req);
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
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Failed to list Drive files', 502);
    }
});
router.use('/gmail', requireAuth, requireOwner);
async function fetchRecentGmailMessages(token, query = '') {
    const params = new URLSearchParams({ maxResults: '10' });
    if (query.trim()) {
        params.set('q', query.trim());
    }
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const listJson = await listRes.json();
    if (!listRes.ok) {
        throw new Error(listJson.error?.message || 'Gmail API error');
    }
    const refs = listJson.messages || [];
    const details = await Promise.all(refs.slice(0, 10).map(async ({ id }) => {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${token}` } });
        const msgJson = await msgRes.json();
        const headers = msgJson.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        return {
            id,
            subject: getHeader('Subject') || '(No Subject)',
            from: getHeader('From') || 'Unknown sender',
            date: getHeader('Date') || '',
            snippet: msgJson.snippet || '',
        };
    }));
    return details;
}
function decodeBase64Url(data) {
    if (!data)
        return '';
    try {
        return Buffer.from(data, 'base64url').toString('utf8');
    }
    catch {
        return '';
    }
}
function extractGmailBody(payload) {
    if (!payload)
        return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }
    if (Array.isArray(payload.parts)) {
        for (const part of payload.parts) {
            const plain = extractGmailBody(part);
            if (plain)
                return plain;
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
async function fetchDriveFilePreview(token, fileId) {
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink`, { headers: { Authorization: `Bearer ${token}` } });
    const meta = await metaRes.json();
    if (!metaRes.ok) {
        throw new Error(meta.error?.message || 'Could not load Drive file metadata');
    }
    const mime = String(meta.mimeType || '');
    const name = String(meta.name || '');
    let content = '';
    let previewMode = 'text';
    if (mime === 'application/vnd.google-apps.document') {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok)
            content = await r.text();
    }
    else if (mime === 'application/vnd.google-apps.spreadsheet') {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok)
            content = await r.text();
    }
    else if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
        previewMode = 'pdf';
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            content = await extractTextFromBuffer(buf, name, mime).catch(() => '');
        }
    }
    else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.toLowerCase().endsWith('.docx')) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            content = await extractTextFromBuffer(buf, name, mime).catch(() => '');
        }
    }
    else if (mime.startsWith('image/')) {
        previewMode = 'image';
    }
    else if (mime.startsWith('text/') ||
        mime === 'application/json' ||
        /\.(txt|md|csv|json|log|ts|js|py|html|xml)$/i.test(name)) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok)
            content = await r.text();
    }
    else {
        previewMode = 'binary';
    }
    return {
        id: meta.id,
        name,
        mimeType: mime,
        webViewLink: meta.webViewLink,
        previewMode,
        content: content ? content.slice(0, 20000) : undefined,
        previewUnavailable: previewMode === 'binary' && !content,
    };
}
router.get('/drive/files/:id/raw', async (req, res) => {
    const token = await getValidAccessToken(req);
    if (!token) {
        return error(res, 'Google Drive is not connected yet.', 401, 'DRIVE_NOT_CONNECTED');
    }
    try {
        const fileId = encodeURIComponent(String(req.params.id));
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`, { headers: { Authorization: `Bearer ${token}` } });
        const meta = await metaRes.json();
        if (!metaRes.ok) {
            return error(res, meta.error?.message || 'File not found', metaRes.status);
        }
        const mime = String(meta.mimeType || 'application/octet-stream');
        const isGoogleWorkspace = mime.startsWith('application/vnd.google-apps.');
        const url = isGoogleWorkspace
            ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
            : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!fileRes.ok) {
            return error(res, 'Failed to stream Drive file', fileRes.status);
        }
        const buf = Buffer.from(await fileRes.arrayBuffer());
        res.setHeader('Content-Type', isGoogleWorkspace ? 'application/pdf' : mime);
        res.setHeader('Content-Disposition', `inline; filename="${String(meta.name || 'file').replace(/"/g, '')}"`);
        return res.send(buf);
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Failed to load file stream', 502);
    }
});
router.get('/drive/files/:id/content', async (req, res) => {
    const token = await getValidAccessToken(req);
    if (!token) {
        return error(res, 'Google Drive is not connected yet.', 401, 'DRIVE_NOT_CONNECTED');
    }
    try {
        const file = await fetchDriveFilePreview(token, String(req.params.id));
        return success(res, file);
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Failed to open Drive file', 502);
    }
});
router.get('/gmail/messages/:id', async (req, res) => {
    const token = await getValidAccessToken(req);
    if (!token) {
        return error(res, 'Gmail is not connected yet.', 401, 'GMAIL_NOT_CONNECTED');
    }
    try {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(req.params.id))}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
        const msgJson = await msgRes.json();
        if (!msgRes.ok) {
            return error(res, msgJson.error?.message || 'Failed to open email', msgRes.status);
        }
        const headers = msgJson.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
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
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Failed to open email', 502);
    }
});
async function findDriveFileWithContent(token, nameQuery) {
    const clean = nameQuery.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    if (!clean)
        return null;
    const params = new URLSearchParams({
        q: `trashed = false and name contains '${clean}'`,
        pageSize: '3',
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,size,webViewLink)',
    });
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok)
        return null;
    const listJson = await listRes.json();
    const file = listJson.files?.[0];
    if (!file?.id)
        return null;
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
        if (!outName.toLowerCase().endsWith('.pdf'))
            outName += '.pdf';
    }
    const fileRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok)
        return null;
    const arrayBuf = await fileRes.arrayBuffer();
    return {
        name: outName,
        mimeType: outMime,
        data: Buffer.from(arrayBuf),
        webViewLink: file.webViewLink,
    };
}
export async function sendGmailMessage(to, subject, body, attachmentQuery) {
    const token = await getValidAccessToken();
    if (!token) {
        return { success: false, error: 'Gmail is not connected. Please connect Google on /drive or /gmail first.' };
    }
    let attachment = null;
    if (attachmentQuery?.trim()) {
        try {
            attachment = await findDriveFileWithContent(token, attachmentQuery.trim());
        }
        catch (err) {
            logger.warn('Could not fetch Drive attachment, sending email without attachment', { err });
        }
    }
    let rawEmail;
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
    }
    else {
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
    const token = await getValidAccessToken(req);
    if (!token) {
        return error(res, 'Gmail is not connected yet. Click "Connect Google / Gmail" first.', 401, 'GMAIL_NOT_CONNECTED');
    }
    try {
        const importantOnly = req.query.important === '1' || req.query.important === 'true';
        const q = typeof req.query.q === 'string' ? req.query.q : importantOnly ? 'is:important' : '';
        const messages = await fetchRecentGmailMessages(token, q);
        return success(res, messages);
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Failed to fetch Gmail messages', 502);
    }
});
router.post('/gmail/send', async (req, res) => {
    await hydrateGoogleTokensFromRequest(req);
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
router.post('/gmail/digest', aiLimit, async (req, res) => {
    const token = await getValidAccessToken(req);
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
        const result = await generateAIReply(`Summarize these recent emails into a crisp Daily Digest with key deadlines, bills, or action items:\n\n${summaryInput}`, []);
        return success(res, { digest: result.reply, provider: result.provider, model: result.model });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Failed to generate email digest', 502);
    }
});
function extractSearchKeyword(prompt) {
    const quoted = prompt.match(/["']([^"']{2,60})["']/);
    if (quoted?.[1])
        return quoted[1].trim();
    const fileMatch = prompt.match(/([A-Za-z0-9._-]+\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|png|jpg|jpeg))/i);
    if (fileMatch?.[1])
        return fileMatch[1].trim();
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
export async function getGoogleContextForPrompt(prompt) {
    const wantsEmail = /\b(email|emails|mail|gmail|inbox|message|bill|invoice|schedule|deadline|important|send)\b/i.test(prompt);
    const wantsDrive = /\b(drive|file|files|document|documents|doc|pdf|folder|notes|send|share|fetch|find|important)\b/i.test(prompt);
    if (!wantsEmail && !wantsDrive)
        return '';
    const token = await getValidAccessToken();
    if (!token)
        return '';
    const keyword = extractSearchKeyword(prompt);
    const sections = [];
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
            const files = json.files || [];
            if (files.length > 0) {
                let topFileContent = '';
                try {
                    const preview = await fetchDriveFilePreview(token, files[0].id);
                    if (preview.content) {
                        topFileContent = `\n   Top File Content (${preview.name}):\n   ${preview.content.slice(0, 3000)}`;
                    }
                }
                catch {
                    // Ignore preview failure
                }
                sections.push(`Google Drive Files${keyword ? ` (matched/recent for "${keyword}")` : ''}:\n${files
                    .map((f, i) => `${i + 1}. ${f.name}${f.webViewLink ? ` — Link: ${f.webViewLink}` : ''}`)
                    .join('\n')}${topFileContent}`);
            }
        }
        catch {
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
                const detailedBodies = await Promise.all(messages.slice(0, 2).map(async (m) => {
                    try {
                        const fullRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
                        if (!fullRes.ok)
                            return '';
                        const fullJson = await fullRes.json();
                        const body = extractGmailBody(fullJson.payload);
                        return body ? `\n   [Full Body - ${m.subject}]: ${body.slice(0, 1500)}` : '';
                    }
                    catch {
                        return '';
                    }
                }));
                sections.push(`Gmail Messages${isImportant ? ' (Important)' : ''}:\n${messages
                    .map((m, i) => `${i + 1}. From: ${m.from} | Subject: ${m.subject} | Snippet: ${m.snippet}`)
                    .join('\n')}${detailedBodies.filter(Boolean).join('')}`);
            }
        }
        catch {
            // Ignore Gmail context errors so chat still responds
        }
    }
    return sections.length > 0 ? `\n\n${sections.join('\n\n')}` : '';
}
export default router;
