'use strict';

const pino = require('pino');
const path = require('path');
const fs = require('fs');

const today = new Date().toISOString().split('T')[0];
const logsDir = path.join(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, `${today}.log`);

// Rotate: remove logs older than 14 days
try {
  const files = fs.readdirSync(logsDir);
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const file of files) {
    const filePath = path.join(logsDir, file);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
    }
  }
} catch (e) {
  // Best effort log rotation
}

const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: logFile }
    },
    {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' }
    }
  ]
});

const logger = pino({ level: 'info' }, transport);

module.exports = logger;
