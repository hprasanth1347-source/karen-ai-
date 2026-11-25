import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env and local .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8080'),
  API_PORT: z.string().default('8080'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // AI Providers
  GEMINI_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),
  GITHUB_TOKEN: z.string().optional().default(''),
  COPILOT_GITHUB_TOKEN: z.string().optional().default(''),
  COPILOT_MODEL_ID: z.string().optional().default(''),
  COPILOT_BASE_DIR: z.string().optional().default(''),
  AUTON_MODEL_ID: z.string().default('qwen/qwen3.8-27b'),
  DEFAULT_AI_PROVIDER: z.enum(['groq', 'gemini', 'copilot']).default('groq'),
  MODEL_TIMEOUT_SEC: z.coerce.number().int().positive().max(300).default(90),

  // Voice Provider
  VOICE_PROVIDER: z.string().default('elevenlabs'),
  VOICE_API_KEY: z.string().optional().default(''),
  VOICE_FEMALE_VOICE_ID: z.string().default('karen-female-verified'),
  VOICE_FEMALE_CONFIRMED: z.string().default('true'),
  VOICE_LANGUAGE: z.string().default('en-IN'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(''),
  TELEGRAM_OWNER_CHAT_ID: z.string().optional().default(''),

  // Meta & Instagram
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional().default(''),
  META_PAGE_ACCESS_TOKEN: z.string().optional().default(''),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional().default(''),
  INSTAGRAM_ACCOUNT_ID: z.string().optional(),
  INSTAGRAM_USERNAME: z.string().optional(),
  INSTAGRAM_PAGE_ID: z.string().default('hari.ii_14'),
  META_GRAPH_API_VERSION: z.string().default('v21.0'),
  META_VERIFY_TOKEN: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  INSTAGRAM_AUTO_REPLY_POLLING_ENABLED: z
    .enum(['true', 'false'])
    .default(process.env.VERCEL ? 'false' : 'true')
    .transform((value) => value === 'true'),

  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),

  // Google
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:8080/api/v1/auth/google/callback'),

  // Security
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  APP_SECRET: z.string().optional(),
  BOOTSTRAP_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed:', parsed.error.format());
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  const productionRequired = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'APP_SECRET',
    'BOOTSTRAP_SECRET',
  ] as const;

  const missing = productionRequired.filter((key) => {
    const value = process.env[key];
    return !value || value.includes('placeholder') || value.includes('replace-with') || value.includes('karen-');
  });

  if (missing.length > 0) {
    console.error(`Production startup blocked. Missing or unsafe environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!/^[a-fA-F0-9]{64}$/.test(process.env.ENCRYPTION_KEY || '') &&
      !/^[a-zA-Z0-9+/]{43}=$/.test(process.env.ENCRYPTION_KEY || '')) {
    console.error('Production startup blocked. ENCRYPTION_KEY must be 32 random bytes encoded as hex or base64.');
    process.exit(1);
  }
}

const instagramToken =
  process.env.INSTAGRAM_ACCESS_TOKEN ||
  parsed.data.INSTAGRAM_ACCESS_TOKEN ||
  parsed.data.META_PAGE_ACCESS_TOKEN ||
  '';

export const config = {
  ...parsed.data,
  GROQ_API_KEY: process.env.GROQ_API_KEY || parsed.data.GROQ_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || parsed.data.GEMINI_API_KEY,
  SUPABASE_ANON_KEY: parsed.data.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: parsed.data.SUPABASE_SERVICE_ROLE_KEY || '',
  INSTAGRAM_ACCESS_TOKEN: instagramToken,
  META_PAGE_ACCESS_TOKEN: instagramToken,
  META_VERIFY_TOKEN:
    process.env.META_VERIFY_TOKEN ||
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
    parsed.data.META_VERIFY_TOKEN ||
    parsed.data.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
    '',
};
