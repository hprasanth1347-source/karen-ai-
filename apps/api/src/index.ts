import app from './app.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';

const port = Number(config.PORT || config.API_PORT || 8080);
app.listen(port, () => {
  logger.info(`Karen Ultra API listening on port ${port} [${config.NODE_ENV}]`);
});

export default app;
