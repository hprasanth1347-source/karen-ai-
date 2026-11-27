// Polyfill web standards for serverless Node runtime
const g = globalThis;
if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrix {
        a = 1;
        b = 0;
        c = 0;
        d = 1;
        e = 0;
        f = 0;
        is2D = true;
        isIdentity = true;
        multiply() { return new g.DOMMatrix(); }
        translate() { return new g.DOMMatrix(); }
        scale() { return new g.DOMMatrix(); }
        invertSelf() { return this; }
    };
}
if (typeof g.ImageData === 'undefined') {
    g.ImageData = class ImageData {
        data;
        width;
        height;
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
const helmetMiddleware = helmet({
    hsts: config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
app.use(helmetMiddleware);
function isOriginAllowed(origin, reqHost) {
    const cleanOrigin = origin.replace(/\/$/, '');
    const allowed = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
    if (allowed.includes(cleanOrigin))
        return true;
    if (config.APP_URL && cleanOrigin === config.APP_URL.replace(/\/$/, ''))
        return true;
    if (config.WEB_ORIGIN && cleanOrigin === config.WEB_ORIGIN.replace(/\/$/, ''))
        return true;
    if (process.env.VERCEL_URL && cleanOrigin === `https://${process.env.VERCEL_URL}`)
        return true;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL && cleanOrigin === `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
        return true;
    if (reqHost && (cleanOrigin === `https://${reqHost}` || cleanOrigin === `http://${reqHost}`))
        return true;
    if (cleanOrigin.endsWith('.vercel.app') && cleanOrigin.startsWith('https://karen-ai'))
        return true;
    if (config.NODE_ENV !== 'production' && (cleanOrigin.includes('localhost') || cleanOrigin.includes('127.0.0.1'))) {
        return true;
    }
    return false;
}
app.use((req, res, next) => {
    const reqHost = req.get('x-forwarded-host') || req.get('host');
    return cors({
        origin: (origin, callback) => {
            if (!origin)
                return callback(null, true);
            if (isOriginAllowed(origin, reqHost)) {
                return callback(null, true);
            }
            return callback(new Error('CORS origin denied'));
        },
        credentials: true,
    })(req, res, next);
});
app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
        req.rawBody = Buffer.from(buffer);
    },
}));
app.use(requestId);
app.use((req, res, next) => {
    // CSRF Origin/Referer check for cookie-authenticated state-changing requests
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
        return next();
    if (req.path.endsWith('/webhook') || req.path.includes('/auth/google/callback'))
        return next();
    if (req.headers.authorization?.startsWith('Bearer '))
        return next();
    const origin = req.header('origin');
    const reqHost = req.get('x-forwarded-host') || req.get('host');
    if (origin && !isOriginAllowed(origin, reqHost)) {
        return res.status(403).json({ ok: false, error: 'CSRF origin check failed', code: 'FORBIDDEN', requestId: req.requestId });
    }
    return next();
});
app.use(globalLimit);
app.use('/api', router);
app.use(router);
app.use(errorHandler);
export default app;
