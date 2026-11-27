import winston from 'winston';
import { config } from './env.js';
const { combine, timestamp, printf, colorize } = winston.format;
const REDACT_KEYS = new Set([
    'authorization',
    'cookie',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'api_key',
    'apikey',
    'password',
    'secret',
    'token',
    'encryption_key',
    'service_role_key',
]);
function redactObject(val, depth = 0) {
    if (depth > 4 || val === null || val === undefined)
        return val;
    if (Array.isArray(val))
        return val.map((v) => redactObject(v, depth + 1));
    if (typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            if (REDACT_KEYS.has(k.toLowerCase())) {
                out[k] = '[REDACTED]';
            }
            else {
                out[k] = redactObject(v, depth + 1);
            }
        }
        return out;
    }
    return val;
}
const redactFormat = winston.format((info) => {
    const redacted = redactObject(info);
    for (const sym of Object.getOwnPropertySymbols(info)) {
        redacted[sym] = info[sym];
    }
    return redacted;
});
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] [${level}] ${message} ${metaString}`;
});
export const logger = winston.createLogger({
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(redactFormat(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), config.NODE_ENV === 'production'
        ? winston.format.json()
        : combine(colorize(), logFormat)),
    transports: [new winston.transports.Console()],
});
