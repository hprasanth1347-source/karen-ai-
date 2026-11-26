import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { success } from '../utils/response.js';
import { config } from '../config/env.js';
import { loadGoogleTokensWithStatus, loadInstagramTokensWithStatus, } from '../services/persistence.service.js';
import { getSearchHealthStatus } from '../services/search.service.js';
import { loadBrandSettings, saveBrandSettings } from '../skills/my-brand/index.js';
const router = Router();
router.get('/integrations/search-status', requireAuth, requireOwner, async (_req, res) => {
    const status = await getSearchHealthStatus();
    return success(res, status);
});
router.get('/settings/brand', requireAuth, requireOwner, async (req, res) => {
    const brand = await loadBrandSettings(req.user?.id);
    return success(res, brand);
});
router.put('/settings/brand', requireAuth, requireOwner, async (req, res) => {
    const updated = await saveBrandSettings(req.body || {}, req.user?.id);
    return success(res, updated);
});
router.get('/integrations/status', requireAuth, requireOwner, async (req, res) => {
    const [googleState, instagramState] = await Promise.all([
        loadGoogleTokensWithStatus(req.user?.id),
        loadInstagramTokensWithStatus(req.user?.id),
    ]);
    return success(res, {
        gemini: Boolean(config.GEMINI_API_KEY),
        groq: Boolean(config.GROQ_API_KEY),
        instagram: instagramState.status === 'connected',
        instagramStatus: instagramState.status,
        whatsapp: Boolean(config.WHATSAPP_ACCESS_TOKEN),
        google: googleState.status === 'connected',
        googleStatus: googleState.status,
        googleConfigured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
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
        search: Boolean(config.GOOGLE_SEARCH_API_KEY && config.GOOGLE_SEARCH_ENGINE_ID),
        github: Boolean(process.env.GITHUB_TOKEN),
        details: {
            instagramHandle: config.INSTAGRAM_USERNAME || null,
            instagramAccountId: instagramState.tokens?.accountId || config.INSTAGRAM_ACCOUNT_ID,
            aiModel: config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
            supabaseHost: config.SUPABASE_URL,
        },
    });
});
export default router;
