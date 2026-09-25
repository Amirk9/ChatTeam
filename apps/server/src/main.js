import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './common/logger.js';

const app = createApp();
app.listen(config.port, () => {
  logger.info(`teamchat-server listening on :${config.port}`);
});
