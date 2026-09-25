import log from 'electron-log';

// Structured rotating file logs (Phase 10 observability). Renderer can
// forward console output via logs:write; users export via logs:export.
export function initLogger(level = 'info') {
  log.transports.file.level = level || 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : false;
  log.initialize();
  return log;
}

export function mainLog() {
  return log;
}
