import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

let cachedOwnerId: string | null = null;
const ensuredProfiles = new Set<string>();

export async function ensureProfileRow(userId: string, email?: string): Promise<boolean> {
  if (!userId || userId === 'owner-default-id') return false;
  if (ensuredProfiles.has(userId)) return true;

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
      .upsert(
        {
          id: userId,
          email: safeEmail,
          display_name: 'Hari Prasath',
          role: 'owner',
        },
        { onConflict: 'id' }
      );

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
  } catch (err) {
    logger.warn('ensureProfileRow error', { userId, err });
  }
  return false;
}

function getCipherKey(): Buffer {
  const secret = config.ENCRYPTION_KEY || config.APP_SECRET || 'karen-local-oauth-fallback-key';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptJson<T>(raw?: string | null): T | null {
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, 'base64url');
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getCipherKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function getOwnerUserId(): Promise<string | null> {
  if (cachedOwnerId) return cachedOwnerId;
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
  } catch (err) {
    logger.warn('Could not resolve owner user id from Supabase', { err });
  }
  return null;
}

export async function saveUserSetting(key: string, value: unknown): Promise<void> {
  try {
    const userId = await getOwnerUserId();
    if (!userId) return;
    await supabaseAdmin
      .from('user_settings')
      .upsert(
        { user_id: userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' }
      );
  } catch (err) {
    logger.debug(`Failed to save user_setting "${key}"`, { err });
  }
}

export async function loadUserSetting<T>(key: string): Promise<T | null> {
  try {
    const userId = await getOwnerUserId();
    if (!userId) return null;
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value as T;
  } catch (err) {
    logger.debug(`Failed to load user_setting "${key}"`, { err });
    return null;
  }
}

export interface StoredGoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function saveGoogleTokensToDb(tokens: StoredGoogleTokens): Promise<void> {
  const encrypted = encryptJson(tokens);
  await saveUserSetting('google_oauth_tokens', { payload: encrypted });
  try {
    const userId = await getOwnerUserId();
    if (!userId) return;
    await supabaseAdmin.from('provider_connections').upsert(
      {
        user_id: userId,
        provider: 'google',
        status: 'active',
        config: { payload: encrypted },
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
        ],
        expires_at: new Date(tokens.expiresAt).toISOString(),
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
  } catch (err) {
    logger.debug('Could not upsert provider_connections for google', { err });
  }
}

export async function loadGoogleTokensFromDb(): Promise<StoredGoogleTokens | null> {
  try {
    const userId = await getOwnerUserId();
    if (userId) {
      const { data } = await supabaseAdmin
        .from('provider_connections')
        .select('config, status')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle();
      if (data?.status === 'active' && (data.config as any)?.payload) {
        const parsed = decryptJson<StoredGoogleTokens>((data.config as any).payload);
        if (parsed?.accessToken) return parsed;
      }
    }
  } catch {
    // Fall back to user_settings
  }
  const setting = await loadUserSetting<{ payload?: string }>('google_oauth_tokens');
  return decryptJson<StoredGoogleTokens>(setting?.payload);
}

export async function clearGoogleTokensFromDb(): Promise<void> {
  await saveUserSetting('google_oauth_tokens', {});
  try {
    const userId = await getOwnerUserId();
    if (!userId) return;
    await supabaseAdmin
      .from('provider_connections')
      .update({ status: 'inactive', config: {}, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', 'google');
  } catch {
    // Ignore cleanup failures
  }
}
