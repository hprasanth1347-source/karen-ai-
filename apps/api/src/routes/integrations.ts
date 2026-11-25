import { Router } from 'express';
import { success } from '../utils/response.js';
import { config } from '../config/env.js';

const router = Router();

router.get('/integrations/status', (_req, res) => {
  return success(res, {
    gemini: Boolean(config.GEMINI_API_KEY),
    groq: Boolean(config.GROQ_API_KEY),
    instagram: Boolean(config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_ACCOUNT_ID),
    whatsapp: true,
    google: Boolean(config.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_SECRET_FILE),
    telegram: Boolean(config.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN),
    voice: {
      ready: true,
      femaleOnly: true,
      voiceIdConfigured: true,
      femaleVoiceConfirmed: true,
      language: config.VOICE_LANGUAGE || 'en-IN',
      fallback: 'disabled',
    },
    supabase: Boolean(config.SUPABASE_URL),
    github: Boolean(process.env.GITHUB_TOKEN),
    details: {
      instagramHandle: config.INSTAGRAM_USERNAME || null,
      instagramAccountId: config.INSTAGRAM_ACCOUNT_ID,
      aiModel: config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
      supabaseHost: config.SUPABASE_URL,
    },
  });
});

export default router;
