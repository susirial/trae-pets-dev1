import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  logPath: string;
}

export function createLogger(logsDir: string): Logger {
  const logPath = path.join(logsDir, 'petctl.log');
  ensureDir(path.dirname(logPath));

  function write(level: string, message: string, meta?: unknown): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, message, meta });
    try {
      fs.appendFileSync(logPath, `${line}\n`, 'utf8');
    } catch {
      // Logging must never break the hook.
    }
  }

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    logPath,
  };
}
