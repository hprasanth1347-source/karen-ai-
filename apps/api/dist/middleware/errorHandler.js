import { logger } from '../config/logger.js';
import { error } from '../utils/response.js';
import { AppError } from '../utils/appError.js';
export function errorHandler(err, req, res, _next) {
    if (err instanceof AppError) {
        logger.warn('Application error', {
            code: err.code,
            statusCode: err.statusCode,
            requestId: req.requestId,
            path: req.path,
        });
        return error(res, err.message, err.statusCode, err.code, err.details);
    }
    logger.error('Unhandled request error', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        requestId: req.requestId,
        path: req.path,
    });
    if (err.message === 'CORS origin denied') {
        return error(res, 'Origin not allowed by CORS policy', 403, 'FORBIDDEN');
    }
    const message = process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal server error';
    return error(res, message, 500, 'INTERNAL_ERROR');
}
