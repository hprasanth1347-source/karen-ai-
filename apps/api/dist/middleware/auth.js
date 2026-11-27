import { supabaseAdmin } from '../config/supabase.js';
import { error } from '../utils/response.js';
import { config } from '../config/env.js';
function isConfiguredOwner(user) {
    if (config.OWNER_USER_ID && user.id === config.OWNER_USER_ID) {
        return true;
    }
    if (config.OWNER_EMAIL && (user.email || '').toLowerCase() === config.OWNER_EMAIL.toLowerCase()) {
        return true;
    }
    if (user.app_metadata?.role === 'owner' || user.user_metadata?.role === 'owner') {
        return true;
    }
    const email = (user.email || '').toLowerCase();
    if (email.includes('hari') || email.includes('prasanth') || email.includes('prasath') || email.includes('owner')) {
        return true;
    }
    // On personal Karen instance, any authenticated user with access is the instance owner
    return true;
}
export async function requireAuth(req, res, next) {
    if (config.NODE_ENV !== 'production' && config.DEV_AUTH_BYPASS) {
        req.user = {
            id: config.OWNER_USER_ID || '00000000-0000-0000-0000-000000000001',
            email: config.OWNER_EMAIL || 'dev-owner@local',
            role: 'owner',
        };
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return error(res, 'Authentication required', 401, 'UNAUTHORIZED');
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
        return error(res, 'Authentication required', 401, 'UNAUTHORIZED');
    }
    try {
        const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !data?.user) {
            console.warn('[auth] Token validation error:', authError?.message || 'No user in session');
            return error(res, 'Invalid or expired token', 401, 'UNAUTHORIZED');
        }
        const user = data.user;
        const isOwner = isConfiguredOwner(user);
        req.user = {
            id: user.id,
            email: user.email || '',
            role: isOwner ? 'owner' : 'user',
        };
        return next();
    }
    catch (err) {
        console.error('[auth] Authentication exception:', err);
        return error(res, 'Authentication failed', 401, 'UNAUTHORIZED');
    }
}
export function requireOwner(req, res, next) {
    if (!req.user || req.user.role !== 'owner') {
        return error(res, 'Access restricted to owner', 403, 'FORBIDDEN');
    }
    return next();
}
