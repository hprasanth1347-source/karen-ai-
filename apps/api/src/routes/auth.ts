import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import { bootstrapOwner, loginWithPassword, logoutUser } from '../services/auth.service.js';
import { config } from '../config/env.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const bootstrapSchema = z.object({
  secret: z.string(),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

router.post('/auth/bootstrap', validate(bootstrapSchema), async (req, res) => {
  if (req.body.secret !== config.BOOTSTRAP_SECRET) {
    return error(res, 'Invalid bootstrap secret', 403, 'FORBIDDEN');
  }
  try {
    const user = await bootstrapOwner(req.body.email, req.body.password, req.body.displayName);
    return success(res, { message: 'Owner account created', user }, 201);
  } catch (err: any) {
    return error(res, err.message, 400);
  }
});

router.post('/auth/login', authLimit, validate(loginSchema), async (req, res) => {
  try {
    const session = await loginWithPassword(req.body.email, req.body.password);
    return success(res, session);
  } catch (err: any) {
    return error(res, err.message || 'Login failed', 401, 'INVALID_CREDENTIALS');
  }
});

router.post('/auth/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization?.slice(7) || '';
  await logoutUser(token);
  return success(res, { message: 'Logged out successfully' });
});

router.get('/auth/me', requireAuth, (req, res) => {
  return success(res, { user: req.user });
});

export default router;
