import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { error } from '../utils/response.js';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = result.error as ZodError;
      const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return error(res, `Validation error: ${issues}`, 400, 'VALIDATION_ERROR');
    }
    req.body = result.data;
    next();
  };
}
