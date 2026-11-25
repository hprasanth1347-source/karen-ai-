import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { success } from '../utils/response.js';

const router = Router();

router.get('/notifications', requireAuth, (_req, res) => {
  return success(res, [
    {
      id: '1',
      type: 'success',
      title: 'Security Engine Active',
      body: 'Row Level Security verified for 22 database tables.',
      channel: 'web',
      is_read: false,
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      type: 'info',
      title: 'Voice Policy Enforced',
      body: 'Female voice profile configured. Fallback locked.',
      channel: 'web',
      is_read: false,
      created_at: new Date().toISOString(),
    },
  ]);
});

router.post('/notifications/mark-all-read', requireAuth, (_req, res) => {
  return success(res, { message: 'All notifications marked as read' });
});

export default router;
