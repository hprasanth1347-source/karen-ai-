import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../utils/audit.js';

export async function hasOwnerAccount(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return false;
    return Array.isArray(data?.users) && data.users.length > 0;
  } catch {
    return false;
  }
}

export async function bootstrapOwner(email: string, pass: string, displayName?: string) {
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

  if (error) throw error;
  await logAudit(data.user.id, 'BOOTSTRAP_OWNER', 'user', data.user.id);
  return data.user;
}

export async function loginWithPassword(email: string, pass: string) {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error) throw error;
  await logAudit(data.user.id, 'LOGIN', 'session');
  return data;
}

export async function logoutUser(token: string) {
  return supabaseAnon.auth.signOut();
}
