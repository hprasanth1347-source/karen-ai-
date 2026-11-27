import app from './app.js';
import { config, validateProductionConfig } from './config/env.js';
import { logger } from './config/logger.js';
import { startCompanionScheduler } from './services/dailyCompanion.service.js';

validateProductionConfig();

const port = Number(config.PORT || config.API_PORT || 8080);
app.listen(port, () => {
  logger.info(`Karen AI API listening on port ${port} [${config.NODE_ENV}]`);
  startCompanionScheduler();
});

export default app;
