import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './common/logger.js';
import { migrate } from './database/migrate.js';

await migrate();
const app = createApp();
app.listen(config.port, () => {
  logger.info(`teamchat-server listening on :${config.port}`);
});
