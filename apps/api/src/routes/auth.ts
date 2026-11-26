import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authLimit } from '../middleware/rateLimit.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import { bootstrapOwner, hasOwnerAccount, loginWithPassword, logoutUser } from '../services/auth.service.js';
import { config } from '../config/env.js';

const router = Router();

function safeCompareSecret(provided: string, expected?: string): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const bootstrapSchema = z.object({
  secret: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

router.get('/auth/status', async (_req, res) => {
  const hasOwner = await hasOwnerAccount();
  return success(res, { hasOwner });
});

router.post('/auth/bootstrap', authLimit, validate(bootstrapSchema), async (req, res) => {
  if (!safeCompareSecret(req.body.secret, config.BOOTSTRAP_SECRET)) {
    return error(res, 'Invalid bootstrap secret', 403, 'FORBIDDEN');
  }
  const ownerExists = await hasOwnerAccount();
  if (ownerExists) {
    return error(res, 'Owner account already exists', 409, 'OWNER_EXISTS');
  }
  try {
    const user = await bootstrapOwner(req.body.email, req.body.password, req.body.displayName);
    const sessionData = await loginWithPassword(req.body.email, req.body.password);
    return success(
      res,
      { message: 'Owner account created', user: sessionData.user ?? user, session: sessionData.session },
      201
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bootstrap failed';
    return error(res, message, 400);
  }
});

router.post('/auth/login', authLimit, validate(loginSchema), async (req, res) => {
  try {
    const session = await loginWithPassword(req.body.email, req.body.password);
    return success(res, session);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return error(res, message, 401, 'INVALID_CREDENTIALS');
  }
});

router.post('/auth/logout', requireAuth, requireOwner, async (req, res) => {
  const token = req.headers.authorization?.slice(7) || '';
  await logoutUser(token);
  return success(res, { message: 'Logged out successfully' });
});

router.get('/auth/me', requireAuth, requireOwner, (req, res) => {
  return success(res, { user: req.user });
});

export default router;
