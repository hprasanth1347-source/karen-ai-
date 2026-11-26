import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { encryptJson, decryptJson } from '../utils/crypto.js';
export { encryptJson, decryptJson };
let cachedOwnerId = null;
const ensuredProfiles = new Set();
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
    const validExplicit = explicitUserId && UUID_RE.test(explicitUserId) ? explicitUserId : undefined;
    const userId = validExplicit || (await getOwnerUserId());
    if (!userId) {
        logger.warn('saveGoogleTokensToDb: no valid owner userId available');
        return;
    }
    await ensureProfileRow(userId);
    // Never overwrite an existing refreshToken with an empty one
    let finalTokens = tokens;
    if (!tokens.refreshToken) {
        const existing = await loadGoogleTokensWithStatus(userId);
        if (existing.tokens?.refreshToken) {
            finalTokens = { ...tokens, refreshToken: existing.tokens.refreshToken };
        }
    }
    const encrypted = encryptJson(finalTokens);
    const { error: upsertErr } = await supabaseAdmin.from('provider_connections').upsert({
        user_id: userId,
        provider: 'google',
        status: 'active',
        config: { payload: encrypted },
        scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            ...config.GOOGLE_CLASSROOM_SCOPES.split(/[\s,]+/).filter(Boolean),
        ],
        expires_at: new Date(finalTokens.expiresAt).toISOString(),
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (upsertErr) {
        logger.error('saveGoogleTokensToDb upsert failed', { userId, upsertErr });
        throw new Error(`Failed to persist Google tokens: ${upsertErr.message}`);
    }
}
export async function loadGoogleTokensWithStatus(explicitUserId) {
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
        // Single-owner fallback: if userId didn't match (e.g. callback vs auth token userId), load latest active Google row
        if (!data) {
            const fallback = await supabaseAdmin
                .from('provider_connections')
                .select('config, status')
                .eq('provider', 'google')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            data = fallback.data;
        }
        if (!data || data.status === 'inactive') {
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
    return { tokens: null, status: 'disconnected' };
}
export async function loadGoogleTokensFromDb(explicitUserId) {
    const res = await loadGoogleTokensWithStatus(explicitUserId);
    return res.status === 'connected' ? res.tokens : null;
}
export async function markGoogleNeedsReauth(explicitUserId) {
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
    try {
        const userId = explicitUserId || (await getOwnerUserId());
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
    const userId = explicitUserId || (await getOwnerUserId());
    if (!userId)
        return;
    await ensureProfileRow(userId);
    const encrypted = encryptJson(tokens);
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
        if (userId) {
            const { data } = await supabaseAdmin
                .from('provider_connections')
                .select('config, status')
                .eq('user_id', userId)
                .eq('provider', 'instagram')
                .maybeSingle();
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
    }
    catch (err) {
        logger.warn('loadInstagramTokensWithStatus failed', { err });
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
