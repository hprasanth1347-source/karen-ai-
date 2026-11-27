import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  rawUrl &&
    rawKey &&
    isValidHttpUrl(rawUrl) &&
    !rawUrl.includes('placeholder') &&
    !rawKey.includes('placeholder')
);

let client: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  try {
    const persistentStorageAdapter =
      typeof window !== 'undefined' ? window.localStorage : undefined;
    client = createClient(rawUrl, rawKey, {
      auth: {
        storage: persistentStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
  }
} else if (rawUrl || rawKey) {
  console.warn('Supabase env vars are invalid or placeholder; running without client auth.');
}

export const supabase = client;
