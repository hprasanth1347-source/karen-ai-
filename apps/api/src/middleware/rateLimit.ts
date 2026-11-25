import { rateLimit } from 'express-rate-limit';

export const globalLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please slow down', code: 'RATE_LIMITED' },
});

export const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts, please try again later', code: 'AUTH_RATE_LIMITED' },
});

export const aiLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'AI inference rate limit reached', code: 'AI_RATE_LIMITED' },
});
