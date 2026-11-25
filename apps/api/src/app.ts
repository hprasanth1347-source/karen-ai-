import type {} from './types/express.js';
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

const helmetMiddleware = (helmet as unknown as () => express.RequestHandler)();
app.use(helmetMiddleware);
app.use(
  cors({
    origin: config.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
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
app.use(globalLimit);

app.use('/api', router);
app.use(router);
app.use(errorHandler);

export default app;
