import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../utils/audit.js';
export async function hasOwnerAccount() {
    try {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 50 });
        if (error) {
            logger.warn('hasOwnerAccount failed closed due to Supabase error', { error });
            return true; // Fail closed
        }
        const users = data?.users || [];
        if (config.OWNER_USER_ID) {
            return users.some((u) => u.id === config.OWNER_USER_ID);
        }
        if (config.OWNER_EMAIL) {
            return users.some((u) => (u.email || '').toLowerCase() === config.OWNER_EMAIL.toLowerCase());
        }
        return users.some((u) => u.app_metadata?.role === 'owner') || users.length > 0;
    }
    catch (err) {
        logger.warn('hasOwnerAccount failed closed due to exception', { err });
        return true; // Fail closed
    }
}
export async function bootstrapOwner(email, pass, displayName) {
    logger.info('Attempting owner bootstrap for email:', { email });
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: pass,
        email_confirm: true,
        app_metadata: {
            role: 'owner',
        },
        user_metadata: {
            role: 'owner',
            display_name: displayName || 'Owner',
        },
    });
    if (error)
        throw error;
    await logAudit(data.user.id, 'BOOTSTRAP_OWNER', 'user', data.user.id);
    return data.user;
}
export async function loginWithPassword(email, pass) {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email,
        password: pass,
    });
    if (error)
        throw error;
    await logAudit(data.user.id, 'LOGIN', 'session');
    return data;
}
export async function logoutUser(token) {
    return supabaseAnon.auth.signOut();
}
