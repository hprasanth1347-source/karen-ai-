import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './env.js';

const url = config.SUPABASE_URL;
const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = config.SUPABASE_ANON_KEY;

if (!url) {
  // In production (Vercel), log warning but do NOT throw — allows other routes to still serve
  console.error('[supabase] SUPABASE_URL is not configured — database features will be unavailable');
}

const effectiveAnonKey =
  anonKey || (config.NODE_ENV !== 'production' ? 'local-dev-placeholder-anon-key' : '');
const effectiveServiceRoleKey =
  serviceRoleKey || (config.NODE_ENV !== 'production' ? effectiveAnonKey : '');

if (config.NODE_ENV === 'production' && (!effectiveAnonKey || !effectiveServiceRoleKey)) {
  console.error('[supabase] Supabase keys are not fully configured — auth/database endpoints will fail');
}

// Use a valid placeholder URL so createClient does not throw at import time
const safeUrl = url || 'https://placeholder.supabase.co';
const safeServiceKey = effectiveServiceRoleKey || 'placeholder-service-key';
const safeAnonKey = effectiveAnonKey || 'placeholder-anon-key';

export const supabaseAdmin: SupabaseClient = createClient(
  safeUrl,
  safeServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const supabaseAnon: SupabaseClient = createClient(safeUrl, safeAnonKey);

/** Returns true only if Supabase is fully configured */
export const isSupabaseReady = (): boolean =>
  !!(url && effectiveAnonKey && effectiveServiceRoleKey);
