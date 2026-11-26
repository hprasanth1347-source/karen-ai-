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
  GOOGLE_SEARCH_API_KEY: z.string().optional().default(''),
  GOOGLE_SEARCH_ENGINE_ID: z.string().optional().default(''),
  SEARCH_DAILY_LIMIT: z.coerce.number().int().positive().max(10000).default(90),

  // Google Classroom
  GOOGLE_CLASSROOM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  GOOGLE_CLASSROOM_SCOPES: z
    .string()
    .default(
      [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
        'https://www.googleapis.com/auth/classroom.announcements.readonly',
        'https://www.googleapis.com/auth/classroom.rosters',
      ].join(' ')
    ),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().optional().default(''),
  GOOGLE_CLASSROOM_SYNC_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  GOOGLE_CLASSROOM_SYNC_INTERVAL: z.coerce.number().int().positive().default(900000),
  GOOGLE_CLASSROOM_TIMEZONE: z.string().default('Asia/Kolkata'),

  // Skills & Runner
  SKILL_RUNNER_URL: z.string().optional().default(''),
  SKILL_RUNNER_SECRET: z.string().optional().default(''),
  SKILLS_STORAGE_BUCKET: z.string().default('karen-skill-outputs'),
  E2B_API_KEY: z.string().optional().default(''),

  // Security & Owner
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  APP_SECRET: z.string().optional(),
  BOOTSTRAP_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  OWNER_USER_ID: z.string().optional().default(''),
  OWNER_EMAIL: z.string().optional().default(''),
  DEV_AUTH_BYPASS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // In production (Vercel) never hard-exit — log the problem and continue with defaults
  if (process.env.NODE_ENV === 'production') {
    console.error('[env] Environment validation warnings (non-fatal):', JSON.stringify(parsed.error.format()));
  } else {
    console.error('Environment validation failed:', parsed.error.format());
    process.exit(1);
  }
}

// Use parsed data or safe defaults if schema validation failed in production
const envData = parsed.success ? parsed.data : ({
  NODE_ENV: (process.env.NODE_ENV || 'production') as 'development' | 'production' | 'test',
  PORT: process.env.PORT || '8080',
  API_PORT: process.env.API_PORT || '8080',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:5173',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',
  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  COPILOT_GITHUB_TOKEN: process.env.COPILOT_GITHUB_TOKEN || '',
  COPILOT_MODEL_ID: process.env.COPILOT_MODEL_ID || '',
  COPILOT_BASE_DIR: process.env.COPILOT_BASE_DIR || '',
  AUTON_MODEL_ID: process.env.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
  DEFAULT_AI_PROVIDER: (process.env.DEFAULT_AI_PROVIDER || 'groq') as 'groq' | 'gemini' | 'copilot',
  MODEL_TIMEOUT_SEC: parseInt(process.env.MODEL_TIMEOUT_SEC || '90'),
  VOICE_PROVIDER: process.env.VOICE_PROVIDER || 'elevenlabs',
  VOICE_API_KEY: process.env.VOICE_API_KEY || '',
  VOICE_FEMALE_VOICE_ID: process.env.VOICE_FEMALE_VOICE_ID || 'karen-female-verified',
  VOICE_FEMALE_CONFIRMED: process.env.VOICE_FEMALE_CONFIRMED || 'true',
  VOICE_LANGUAGE: process.env.VOICE_LANGUAGE || 'en-IN',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  TELEGRAM_OWNER_CHAT_ID: process.env.TELEGRAM_OWNER_CHAT_ID || '',
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET || '',
  META_PAGE_ACCESS_TOKEN: process.env.META_PAGE_ACCESS_TOKEN || '',
  INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID,
  INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME,
  INSTAGRAM_PAGE_ID: process.env.INSTAGRAM_PAGE_ID || 'hari.ii_14',
  META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION || 'v21.0',
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  INSTAGRAM_AUTO_REPLY_POLLING_ENABLED: false,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/api/v1/auth/google/callback',
  GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY || '',
  GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
  SEARCH_DAILY_LIMIT: parseInt(process.env.SEARCH_DAILY_LIMIT || '90'),
  GOOGLE_CLASSROOM_ENABLED: true,
  GOOGLE_CLASSROOM_SCOPES:
    process.env.GOOGLE_CLASSROOM_SCOPES ||
    'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/classroom.rosters',
  GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '',
  GOOGLE_CLASSROOM_SYNC_ENABLED: true,
  GOOGLE_CLASSROOM_SYNC_INTERVAL: 900000,
  GOOGLE_CLASSROOM_TIMEZONE: process.env.GOOGLE_CLASSROOM_TIMEZONE || 'Asia/Kolkata',
  SKILL_RUNNER_URL: process.env.SKILL_RUNNER_URL || '',
  SKILL_RUNNER_SECRET: process.env.SKILL_RUNNER_SECRET || '',
  SKILLS_STORAGE_BUCKET: process.env.SKILLS_STORAGE_BUCKET || 'karen-skill-outputs',
  E2B_API_KEY: process.env.E2B_API_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  APP_SECRET: process.env.APP_SECRET,
  BOOTSTRAP_SECRET: process.env.BOOTSTRAP_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  OWNER_USER_ID: process.env.OWNER_USER_ID || '',
  OWNER_EMAIL: process.env.OWNER_EMAIL || '',
  DEV_AUTH_BYPASS: false,
} as ReturnType<typeof envSchema.parse>);

if (process.env.NODE_ENV === 'production') {
  if (envData.DEV_AUTH_BYPASS) {
    console.error('[env] WARNING: DEV_AUTH_BYPASS is enabled in production — this is a security risk.');
    // Do NOT exit — just warn
  }

  const coreRequired = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;

  const missingCore = coreRequired.filter((key) => {
    const value = process.env[key];
    return !value || value.includes('placeholder') || value.includes('replace-with');
  });

  if (missingCore.length > 0) {
    console.error(`Missing core Supabase environment variables: ${missingCore.join(', ')}`);
  }

  const featureSecrets = [
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'APP_SECRET',
    'BOOTSTRAP_SECRET',
    'CRON_SECRET',
    'TELEGRAM_WEBHOOK_SECRET',
  ] as const;

  const missingSecrets = featureSecrets.filter((key) => {
    const value = process.env[key];
    return !value || value.includes('placeholder') || value.includes('replace-with');
  });

  if (missingSecrets.length > 0) {
    console.warn(`Optional/feature secrets not configured (those endpoints will fail closed): ${missingSecrets.join(', ')}`);
  }
}

const instagramToken =
  process.env.INSTAGRAM_ACCESS_TOKEN ||
  envData.INSTAGRAM_ACCESS_TOKEN ||
  envData.META_PAGE_ACCESS_TOKEN ||
  '';

export const config = {
  ...envData,
  GROQ_API_KEY: process.env.GROQ_API_KEY || envData.GROQ_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || envData.GEMINI_API_KEY,
  SUPABASE_ANON_KEY: envData.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: envData.SUPABASE_SERVICE_ROLE_KEY || '',
  INSTAGRAM_ACCESS_TOKEN: instagramToken,
  META_PAGE_ACCESS_TOKEN: instagramToken,
  META_VERIFY_TOKEN:
    process.env.META_VERIFY_TOKEN ||
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
    envData.META_VERIFY_TOKEN ||
    envData.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
    '',
};
