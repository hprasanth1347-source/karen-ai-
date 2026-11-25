import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

const url = config.SUPABASE_URL;
const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = config.SUPABASE_ANON_KEY;

if (!url) throw new Error('SUPABASE_URL is required');

const effectiveAnonKey =
  anonKey || (config.NODE_ENV !== 'production' ? 'local-dev-placeholder-anon-key' : '');
const effectiveServiceRoleKey =
  serviceRoleKey || (config.NODE_ENV !== 'production' ? effectiveAnonKey : '');

if (!effectiveAnonKey || !effectiveServiceRoleKey) {
  throw new Error('Supabase anon and service role keys are required in production');
}

export const supabaseAdmin = createClient(
  url,
  effectiveServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const supabaseAnon = createClient(url, effectiveAnonKey);
