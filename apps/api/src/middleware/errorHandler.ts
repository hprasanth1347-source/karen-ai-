import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { error } from '../utils/response.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error('Unhandled request error', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.requestId,
    path: req.path,
  });
  const message = process.env.NODE_ENV === 'development'
    ? err.message
    : 'Internal server error';
  return error(res, message, 500, 'INTERNAL_SERVER_ERROR');
}
