// Polyfill web standards for serverless Node runtime
const g = globalThis as Record<string, unknown>;
if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    multiply() { return new (g.DOMMatrix as new () => unknown)(); }
    translate() { return new (g.DOMMatrix as new () => unknown)(); }
    scale() { return new (g.DOMMatrix as new () => unknown)(); }
    invertSelf() { return this; }
  };
}
if (typeof g.ImageData === 'undefined') {
  g.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(width = 1, height = 1) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}
if (typeof g.Path2D === 'undefined') {
  g.Path2D = class Path2D {
    addPath() { }
    closePath() { }
    moveTo() { }
    lineTo() { }
    bezierCurveTo() { }
    quadraticCurveTo() { }
    rect() { }
  };
}

import type { } from './types/express.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { default as helmet } from 'helmet';
import { config } from './config/env.js';
import { globalLimit } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import router from './routes/index.js';

const app = express();
// Trust the first proxy (Vercel / reverse proxy) so req.ip reflects X-Forwarded-For.
app.set('trust proxy', 1);

const helmetMiddleware = (helmet as unknown as (opts?: unknown) => express.RequestHandler)({
  hsts: config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
app.use(helmetMiddleware);

function isOriginAllowed(origin: string): boolean {
  const allowed = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  if (config.APP_URL && origin === config.APP_URL.replace(/\/$/, '')) return true;
  if (config.WEB_ORIGIN && origin === config.WEB_ORIGIN.replace(/\/$/, '')) return true;
  if (config.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    return true;
  }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin denied'));
    },
    credentials: true,
  })
);
app.use(
  express.json({
    limit: '10mb',
    verify: (req: express.Request, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  })
);
app.use(requestId);
app.use((req, res, next) => {
  // CSRF Origin/Referer check for cookie-authenticated state-changing requests
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path.endsWith('/webhook') || req.path.includes('/auth/google/callback')) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  const origin = req.header('origin');
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ ok: false, error: 'CSRF origin check failed', code: 'FORBIDDEN', requestId: req.requestId });
  }
  return next();
});
app.use(globalLimit);

app.use('/api', router);
app.use(router);
app.use(errorHandler);

export default app;
