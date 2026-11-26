/**
 * Karen AI – Love Mode API Routes
 * GET  /v1/love-mode/status       → current state
 * POST /v1/love-mode/activate     → activate for owner
 * POST /v1/love-mode/deactivate   → deactivate for owner
 */

import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import { config } from '../config/env.js';
import {
  getLoveModeState,
  setLoveModeActive,
  resetLoveModeConversation,
} from '../services/loveMode.service.js';

const router = Router();

router.use('/love-mode', requireAuth, requireOwner);

function getOwnerChatId(): string {
  return config.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || 'owner';
}

router.get('/love-mode/status', requireAuth, async (_req, res) => {
  try {
    const state = await getLoveModeState(getOwnerChatId());
    return success(res, state);
  } catch (err) {
    return error(res, 'Failed to get Love Mode status', 500);
  }
});

router.post('/love-mode/activate', requireAuth, async (_req, res) => {
  try {
    await setLoveModeActive(getOwnerChatId(), true);
    const state = await getLoveModeState(getOwnerChatId());
    return success(res, state);
  } catch (err) {
    return error(res, 'Failed to activate Love Mode', 500);
  }
});

router.post('/love-mode/deactivate', requireAuth, async (_req, res) => {
  try {
    await setLoveModeActive(getOwnerChatId(), false);
    const state = await getLoveModeState(getOwnerChatId());
    return success(res, state);
  } catch (err) {
    return error(res, 'Failed to deactivate Love Mode', 500);
  }
});

router.post('/love-mode/reset', requireAuth, async (_req, res) => {
  try {
    await resetLoveModeConversation(getOwnerChatId());
    return success(res, { reset: true });
  } catch (err) {
    return error(res, 'Failed to reset Love Mode', 500);
  }
});

export default router;
