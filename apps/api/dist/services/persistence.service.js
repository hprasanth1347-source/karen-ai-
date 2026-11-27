import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { encryptJson, decryptJson } from '../utils/crypto.js';
import { cacheService } from './cache.service.js';
export { encryptJson, decryptJson };
let cachedOwnerId = null;
const ensuredProfiles = new Set();
let memoryGoogleTokens = null;
let memoryGoogleStatus = 'disconnected';
export async function ensureProfileRow(userId, email) {
    if (!userId)
        return false;
    if (ensuredProfiles.has(userId))
        return true;
    try {
        const { data: existing, error: selErr } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        if (!selErr && existing?.id) {
            ensuredProfiles.add(userId);
            return true;
        }
        const safeEmail = email || 'owner@karen.ai';
        const { error: upsertErr } = await supabaseAdmin
            .from('profiles')
            .upsert({
            id: userId,
            email: safeEmail,
            display_name: 'Hari Prasath',
            role: 'owner',
        }, { onConflict: 'id' });
        if (!upsertErr) {
            ensuredProfiles.add(userId);
            return true;
        }
        // Fallback for minimal 0001_karen_core schema (without email/role columns)
        const { error: fallbackErr } = await supabaseAdmin
            .from('profiles')
            .upsert({ id: userId, display_name: 'Hari Prasath' }, { onConflict: 'id' });
        if (!fallbackErr) {
            ensuredProfiles.add(userId);
            return true;
        }
        logger.warn('Failed to ensure profile row in Supabase', { userId, upsertErr, fallbackErr });
    }
    catch (err) {
        logger.warn('ensureProfileRow error', { userId, err });
    }
    return false;
}
export async function getOwnerUserId() {
    if (cachedOwnerId)
        return cachedOwnerId;
    if (config.OWNER_USER_ID && UUID_RE.test(config.OWNER_USER_ID)) {
        cachedOwnerId = config.OWNER_USER_ID;
        return cachedOwnerId;
    }
    if (!config.SUPABASE_URL || config.SUPABASE_URL.includes('example.supabase.co')) {
        return null;
    }
    try {
        const { data } = await supabaseAdmin.from('profiles').select('id').limit(1).maybeSingle();
        if (data?.id) {
            cachedOwnerId = data.id;
            ensuredProfiles.add(data.id);
            return cachedOwnerId;
        }
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
        const firstUser = usersData?.users?.[0];
        if (firstUser?.id) {
            await ensureProfileRow(firstUser.id, firstUser.email);
            cachedOwnerId = firstUser.id;
            return cachedOwnerId;
        }
        // Bootstrap a permanent default owner record in Supabase Auth + profiles
        // so relational persistence works even before explicit email sign-up.
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: 'owner@karen.ai',
            email_confirm: true,
            user_metadata: { role: 'owner', display_name: 'Hari Prasath' },
        });
        if (!createErr && created?.user?.id) {
            await ensureProfileRow(created.user.id, created.user.email);
            cachedOwnerId = created.user.id;
            return cachedOwnerId;
        }
    }
    catch (err) {
        logger.warn('Could not resolve owner user id from Supabase', { err });
    }
    return null;
}
export async function saveUserSetting(key, value) {
    try {
        const userId = await getOwnerUserId();
        if (!userId)
            return;
        await supabaseAdmin
            .from('user_settings')
            .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    }
    catch (err) {
        logger.debug(`Failed to save user_setting "${key}"`, { err });
    }
}
export async function loadUserSetting(key) {
    try {
        const userId = await getOwnerUserId();
        if (!userId)
            return null;
        const { data, error } = await supabaseAdmin
            .from('user_settings')
            .select('value')
            .eq('user_id', userId)
            .eq('key', key)
            .maybeSingle();
        if (error || !data)
            return null;
        return data.value;
    }
    catch (err) {
        logger.debug(`Failed to load user_setting "${key}"`, { err });
        return null;
    }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function saveGoogleTokensToDb(tokens, explicitUserId) {
    let finalTokens = tokens;
    if (!tokens.refreshToken && memoryGoogleTokens?.refreshToken) {
        finalTokens = { ...tokens, refreshToken: memoryGoogleTokens.refreshToken };
    }
    memoryGoogleTokens = finalTokens;
    memoryGoogleStatus = 'connected';
    const validExplicit = explicitUserId && UUID_RE.test(explicitUserId) ? explicitUserId : undefined;
    const userId = validExplicit || (await getOwnerUserId());
    if (!userId) {
        logger.warn('saveGoogleTokensToDb: no valid owner userId available (cached in memory)');
        return;
    }
    await ensureProfileRow(userId);
    // Never overwrite an existing refreshToken, scope, email, or connectedAt with empty values
    const existing = await loadGoogleTokensWithStatus(userId);
    if (existing.tokens) {
        finalTokens = {
            ...finalTokens,
            refreshToken: finalTokens.refreshToken || existing.tokens.refreshToken || '',
            scope: finalTokens.scope || existing.tokens.scope,
            email: finalTokens.email || existing.tokens.email,
            connectedAt: finalTokens.connectedAt || existing.tokens.connectedAt || Date.now(),
        };
        memoryGoogleTokens = finalTokens;
    }
    else if (!finalTokens.connectedAt) {
        finalTokens = { ...finalTokens, connectedAt: Date.now() };
        memoryGoogleTokens = finalTokens;
    }
    const scopesArray = finalTokens.scope
        ? finalTokens.scope.split(/[\s,]+/).filter(Boolean)
        : [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            ...config.GOOGLE_CLASSROOM_SCOPES.split(/[\s,]+/).filter(Boolean),
        ];
    const encrypted = encryptJson(finalTokens);
    let persisted = false;
    // 1. Always persist in Upstash Redis (survives across all Vercel serverless instances & Telegram)
    if (cacheService.isRedisConfigured()) {
        try {
            await cacheService.set(`google:oauth:tokens:${userId}`, encrypted, 2592000);
            await cacheService.set('google:oauth:tokens:owner', encrypted, 2592000);
            persisted = true;
        }
        catch (redisErr) {
            logger.warn('saveGoogleTokensToDb Redis persist failed', { redisErr });
        }
    }
    // 2. Persist in Supabase provider_connections + user_settings
    const { error: upsertErr } = await supabaseAdmin.from('provider_connections').upsert({
        user_id: userId,
        provider: 'google',
        status: 'active',
        config: { payload: encrypted, email: finalTokens.email || null },
        scopes: scopesArray,
        expires_at: new Date(finalTokens.expiresAt).toISOString(),
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (upsertErr) {
        logger.warn('saveGoogleTokensToDb provider_connections upsert failed, falling back to user_settings', {
            userId,
            upsertErr,
        });
        const { error: settingErr } = await supabaseAdmin
            .from('user_settings')
            .upsert({
            user_id: userId,
            key: 'google_oauth_tokens',
            value: {
                payload: encrypted,
                expiresAt: finalTokens.expiresAt,
                updatedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
        if (!settingErr) {
            persisted = true;
        }
        else if (!persisted) {
            throw new Error(`Failed to persist Google tokens to Supabase or Redis: ${settingErr.message}`);
        }
    }
    else {
        persisted = true;
        // Also mirror in user_settings for fast/resilient fallback
        void saveUserSetting('google_oauth_tokens', {
            payload: encrypted,
            expiresAt: finalTokens.expiresAt,
            updatedAt: new Date().toISOString(),
        });
    }
}
export async function loadGoogleTokensWithStatus(explicitUserId) {
    if (!config.SUPABASE_URL || config.SUPABASE_URL.includes('example.supabase.co')) {
        if (memoryGoogleTokens?.accessToken && memoryGoogleStatus === 'connected') {
            return { tokens: memoryGoogleTokens, status: 'connected' };
        }
        return { tokens: null, status: memoryGoogleStatus === 'needs_reauth' ? 'needs_reauth' : 'disconnected' };
    }
    try {
        const userId = explicitUserId || (await getOwnerUserId());
        let data = null;
        if (userId) {
            const res = await supabaseAdmin
                .from('provider_connections')
                .select('config, status')
                .eq('user_id', userId)
                .eq('provider', 'google')
                .maybeSingle();
            data = res.data;
        }
        // Single-owner fallback: if userId didn't have an active row, load latest active Google row across users
        if (!data || data.status !== 'active') {
            const fallback = await supabaseAdmin
                .from('provider_connections')
                .select('config, status')
                .eq('provider', 'google')
                .eq('status', 'active')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (fallback.data) {
                data = fallback.data;
            }
        }
        if (!data || data.status === 'inactive') {
            // Check user_settings fallback before returning disconnected
            const fallbackSetting = await loadUserSetting('google_oauth_tokens');
            if (fallbackSetting?.payload) {
                const parsedFallback = decryptJson(fallbackSetting.payload);
                if (parsedFallback?.accessToken) {
                    return { tokens: parsedFallback, status: 'connected' };
                }
            }
            return { tokens: null, status: 'disconnected' };
        }
        const payload = data.config?.payload;
        const parsed = decryptJson(payload);
        if (data.status === 'expired' || data.status === 'error') {
            return { tokens: parsed, status: 'needs_reauth' };
        }
        if (parsed?.accessToken) {
            return { tokens: parsed, status: 'connected' };
        }
    }
    catch (err) {
        logger.warn('loadGoogleTokensWithStatus failed', { err });
    }
    const fallbackSetting = await loadUserSetting('google_oauth_tokens');
    if (fallbackSetting?.payload) {
        const parsedFallback = decryptJson(fallbackSetting.payload);
        if (parsedFallback?.accessToken) {
            return { tokens: parsedFallback, status: 'connected' };
        }
    }
    // Upstash Redis fallback (persists across Vercel serverless cold starts even without DB tables)
    if (cacheService.isRedisConfigured()) {
        try {
            const uid = explicitUserId || (await getOwnerUserId().catch(() => null));
            const redisCipher = (uid ? await cacheService.get(`google:oauth:tokens:${uid}`) : null) ||
                (await cacheService.get('google:oauth:tokens:owner'));
            if (redisCipher) {
                const parsedRedis = decryptJson(redisCipher);
                if (parsedRedis?.accessToken) {
                    return { tokens: parsedRedis, status: 'connected' };
                }
            }
        }
        catch {
            // Ignore Redis read error
        }
    }
    if (memoryGoogleTokens?.accessToken && memoryGoogleStatus === 'connected') {
        return { tokens: memoryGoogleTokens, status: 'connected' };
    }
    return { tokens: null, status: memoryGoogleStatus === 'needs_reauth' ? 'needs_reauth' : 'disconnected' };
}
export async function loadGoogleTokensFromDb(explicitUserId) {
    const res = await loadGoogleTokensWithStatus(explicitUserId);
    return res.status === 'connected' ? res.tokens : null;
}
export async function markGoogleNeedsReauth(explicitUserId) {
    memoryGoogleStatus = 'needs_reauth';
    try {
        const userId = explicitUserId || (await getOwnerUserId());
        if (!userId)
            return;
        await supabaseAdmin
            .from('provider_connections')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('provider', 'google');
    }
    catch (err) {
        logger.warn('markGoogleNeedsReauth failed', { err });
    }
}
export async function clearGoogleTokensFromDb(explicitUserId) {
    memoryGoogleTokens = null;
    memoryGoogleStatus = 'disconnected';
    try {
        await saveUserSetting('google_oauth_tokens', null);
        const userId = explicitUserId || (await getOwnerUserId());
        if (cacheService.isRedisConfigured()) {
            if (userId)
                await cacheService.del(`google:oauth:tokens:${userId}`).catch(() => { });
            await cacheService.del('google:oauth:tokens:owner').catch(() => { });
        }
        if (!userId)
            return;
        await supabaseAdmin
            .from('provider_connections')
            .update({ status: 'inactive', config: {}, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('provider', 'google');
    }
    catch {
        // Ignore cleanup failures
    }
}
export async function saveInstagramTokensToDb(tokens, explicitUserId) {
    const encrypted = encryptJson(tokens);
    await saveUserSetting('instagram_oauth_tokens', {
        payload: encrypted,
        updatedAt: new Date().toISOString(),
    }).catch(() => { });
    const userId = explicitUserId || (await getOwnerUserId());
    if (!userId)
        return;
    await ensureProfileRow(userId);
    await supabaseAdmin.from('provider_connections').upsert({
        user_id: userId,
        provider: 'instagram',
        status: 'active',
        config: { payload: encrypted },
        expires_at: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
}
export async function loadInstagramTokensWithStatus(explicitUserId) {
    try {
        const userId = explicitUserId || (await getOwnerUserId());
        let data = null;
        if (userId) {
            const res = await supabaseAdmin
                .from('provider_connections')
                .select('config, status')
                .eq('user_id', userId)
                .eq('provider', 'instagram')
                .maybeSingle();
            data = res.data;
        }
        // Single-owner fallback across user_ids (e.g. webhook/poller vs authenticated request)
        if (!data) {
            const fallback = await supabaseAdmin
                .from('provider_connections')
                .select('config, status')
                .eq('provider', 'instagram')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            data = fallback.data;
        }
        if (data) {
            if (data.status === 'inactive')
                return { tokens: null, status: 'disconnected' };
            const payload = data.config?.payload;
            const parsed = decryptJson(payload);
            if (data.status === 'expired' || data.status === 'error') {
                return { tokens: parsed, status: 'needs_reauth' };
            }
            if (parsed?.accessToken) {
                return { tokens: parsed, status: 'connected' };
            }
        }
    }
    catch (err) {
        logger.warn('loadInstagramTokensWithStatus failed', { err });
    }
    const fallbackSetting = await loadUserSetting('instagram_oauth_tokens').catch(() => null);
    if (fallbackSetting?.payload) {
        const parsedFallback = decryptJson(fallbackSetting.payload);
        if (parsedFallback?.accessToken) {
            return { tokens: parsedFallback, status: 'connected' };
        }
    }
    if (config.INSTAGRAM_ACCESS_TOKEN) {
        return {
            tokens: {
                accessToken: config.INSTAGRAM_ACCESS_TOKEN,
                accountId: config.INSTAGRAM_ACCOUNT_ID || '',
                pageId: config.INSTAGRAM_PAGE_ID || '',
            },
            status: 'connected',
        };
    }
    return { tokens: null, status: 'disconnected' };
}
export async function markInstagramNeedsReauth(explicitUserId) {
    try {
        const userId = explicitUserId || (await getOwnerUserId());
        if (!userId)
            return;
        await supabaseAdmin
            .from('provider_connections')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('provider', 'instagram');
    }
    catch {
        // Ignore
    }
}
export async function clearInstagramTokensFromDb(explicitUserId) {
    try {
        await saveUserSetting('instagram_oauth_tokens', null);
        const userId = explicitUserId || (await getOwnerUserId());
        if (!userId)
            return;
        await supabaseAdmin
            .from('provider_connections')
            .update({ status: 'inactive', config: {}, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('provider', 'instagram');
    }
    catch {
        // Ignore
    }
}
const memoryTelegramLinkTokens = new Map();
const memoryTelegramLinks = new Map();
export async function createTelegramLinkCode(karenUserId) {
    const crypto = await import('node:crypto');
    const code = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12-char single-use code
    const expiresAtMs = Date.now() + 10 * 60 * 1000;
    memoryTelegramLinkTokens.set(code, { karenUserId, expiresAt: expiresAtMs });
    try {
        await supabaseAdmin.from('user_settings').upsert({
            user_id: karenUserId,
            key: `telegram_link_code:${code}`,
            value: { karenUserId, expiresAt: expiresAtMs, used: false },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
    }
    catch {
        // Memory map still holds it for current instance
    }
    return { code, expiresAt: new Date(expiresAtMs).toISOString() };
}
export async function linkTelegramAccountToUser(record) {
    memoryTelegramLinks.set(record.chatId, record);
    if (record.telegramUserId)
        memoryTelegramLinks.set(record.telegramUserId, record);
    try {
        await ensureProfileRow(record.karenUserId);
        await supabaseAdmin.from('provider_connections').upsert({
            user_id: record.karenUserId,
            provider: 'telegram',
            status: 'active',
            config: {
                chatId: record.chatId,
                telegramUserId: record.telegramUserId,
                username: record.username || null,
                linkedAt: record.linkedAt,
            },
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,provider' });
    }
    catch (err) {
        logger.warn('linkTelegramAccountToUser failed', { err });
    }
}
export async function consumeTelegramLinkCode(rawCode, telegramUserId, chatId, username) {
    const code = rawCode.trim().toUpperCase();
    if (!code)
        return { ok: false, error: 'Missing link code.' };
    let karenUserId;
    let expiresAtMs = 0;
    const mem = memoryTelegramLinkTokens.get(code);
    if (mem) {
        memoryTelegramLinkTokens.delete(code); // Single-use
        karenUserId = mem.karenUserId;
        expiresAtMs = mem.expiresAt;
    }
    else {
        try {
            const { data } = await supabaseAdmin
                .from('user_settings')
                .select('user_id, value')
                .eq('key', `telegram_link_code:${code}`)
                .maybeSingle();
            if (data?.value) {
                const val = data.value;
                if (val.used)
                    return { ok: false, error: 'Link code already used.' };
                karenUserId = val.karenUserId || data.user_id;
                expiresAtMs = Number(val.expiresAt || 0);
                // Mark single-use immediately
                await supabaseAdmin
                    .from('user_settings')
                    .delete()
                    .eq('key', `telegram_link_code:${code}`);
            }
        }
        catch {
            // Ignore
        }
    }
    if (!karenUserId || !expiresAtMs) {
        return { ok: false, error: 'Invalid or unknown link code. Generate a new one in Karen AI.' };
    }
    if (Date.now() > expiresAtMs) {
        return { ok: false, error: 'Link code expired (10 min limit). Generate a new one in Karen AI.' };
    }
    await linkTelegramAccountToUser({
        karenUserId,
        telegramUserId: String(telegramUserId),
        chatId: String(chatId),
        username,
        linkedAt: new Date().toISOString(),
    });
    return { ok: true, karenUserId };
}
export async function resolveKarenUserIdForTelegram(chatId, telegramUserId) {
    const chatKey = String(chatId);
    const tgKey = telegramUserId ? String(telegramUserId) : '';
    const mem = memoryTelegramLinks.get(chatKey) || (tgKey ? memoryTelegramLinks.get(tgKey) : undefined);
    if (mem?.karenUserId)
        return mem.karenUserId;
    if (config.SUPABASE_URL && !config.SUPABASE_URL.includes('example.supabase.co')) {
        try {
            const { data } = await supabaseAdmin
                .from('provider_connections')
                .select('user_id, config')
                .eq('provider', 'telegram')
                .eq('status', 'active');
            if (Array.isArray(data)) {
                const match = data.find((row) => {
                    const cfg = (row.config || {});
                    return cfg.chatId === chatKey || (tgKey && cfg.telegramUserId === tgKey);
                });
                if (match?.user_id) {
                    const cfg = (match.config || {});
                    memoryTelegramLinks.set(chatKey, {
                        karenUserId: match.user_id,
                        chatId: cfg.chatId || chatKey,
                        telegramUserId: cfg.telegramUserId || tgKey,
                        username: cfg.username,
                        linkedAt: cfg.linkedAt || new Date().toISOString(),
                    });
                    return match.user_id;
                }
            }
        }
        catch (err) {
            logger.warn('resolveKarenUserIdForTelegram query failed', { err });
        }
    }
    // Fallback ONLY for the configured owner chat ID
    if (config.TELEGRAM_OWNER_CHAT_ID && chatKey === String(config.TELEGRAM_OWNER_CHAT_ID).trim()) {
        return await getOwnerUserId();
    }
    return null;
}
