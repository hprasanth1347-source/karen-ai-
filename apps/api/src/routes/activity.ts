import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { success } from '../utils/response.js';

const router = Router();

router.get('/activity', requireAuth, (_req, res) => {
  return success(res, [
    {
      id: '1',
      action: 'SYSTEM_BOOTSTRAP',
      resource_type: 'core',
      details: { phase: 'Complete Foundation', time: new Date().toISOString() },
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      action: 'POLICY_CHECK',
      resource_type: 'voice',
      details: { policy: 'Female Voice Only', result: 'LOCKED' },
      created_at: new Date().toISOString(),
    },
  ]);
});

export default router;
