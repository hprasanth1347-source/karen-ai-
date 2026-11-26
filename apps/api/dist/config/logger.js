import winston from 'winston';
import { config } from './env.js';
const { combine, timestamp, printf, colorize } = winston.format;
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] [${level}] ${message} ${metaString}`;
});
export const logger = winston.createLogger({
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), config.NODE_ENV === 'production'
        ? winston.format.json()
        : combine(colorize(), logFormat)),
    transports: [
        new winston.transports.Console(),
    ],
});
