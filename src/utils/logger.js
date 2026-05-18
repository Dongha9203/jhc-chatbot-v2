'use strict';

const winston = require('winston');
const path    = require('path');
const settings = require('../../config/settings');
const fs      = require('fs');

// 로그 디렉토리 생성
if (!fs.existsSync(settings.log.path)) {
  fs.mkdirSync(settings.log.path, { recursive: true });
}

const logger = winston.createLogger({
  level: settings.log.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    // 콘솔 (개발용)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    // 파일 (운영용)
    new winston.transports.File({
      filename: path.join(settings.log.path, 'app.log'),
      maxsize:  10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(settings.log.path, 'error.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

module.exports = { logger };
