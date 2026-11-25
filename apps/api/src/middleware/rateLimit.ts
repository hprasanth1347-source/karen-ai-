import { rateLimit } from 'express-rate-limit';

function createLimiter(windowMs: number, max: number, error: string, code: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Vercel sends both X-Forwarded-For and Forwarded; trust proxy handles X-Forwarded-For via req.ip.
    validate: { forwardedHeader: false },
    message: { ok: false, error, code },
  });
}

export const globalLimit = createLimiter(
  60 * 1000,
  120,
  'Too many requests, please slow down',
  'RATE_LIMITED'
);

export const authLimit = createLimiter(
  15 * 60 * 1000,
  20,
  'Too many login attempts, please try again later',
  'AUTH_RATE_LIMITED'
);

export const aiLimit = createLimiter(
  60 * 1000,
  30,
  'AI inference rate limit reached',
  'AI_RATE_LIMITED'
);
