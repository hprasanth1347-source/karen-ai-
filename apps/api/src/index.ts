import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as helmet from 'helmet';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { globalLimit } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import router from './routes/index.js';

const app = express();

app.use(helmet.default());
app.use(
  cors({
    origin: config.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json({
  limit: '10mb',
  verify: (req: express.Request, _res, buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(requestId);
app.use(globalLimit);

// Mount top-level router
app.use('/api', router);
app.use(router);

app.use(errorHandler);

const port = Number(config.PORT || config.API_PORT || 8080);
app.listen(port, () => {
  logger.info(`Karen Ultra API listening on port ${port} [${config.NODE_ENV}]`);
});

export default app;
