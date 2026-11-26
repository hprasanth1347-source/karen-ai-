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
const helmetMiddleware = helmet();
app.use(helmetMiddleware);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const allowed = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
        if (allowed.includes(origin) ||
            origin.endsWith('.vercel.app') ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
}));
app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
        req.rawBody = Buffer.from(buffer);
    },
}));
app.use(requestId);
app.use(globalLimit);
app.use('/api', router);
app.use(router);
app.use(errorHandler);
export default app;
