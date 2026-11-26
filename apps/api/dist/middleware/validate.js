import { error } from '../utils/response.js';
export function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const err = result.error;
            const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
            return error(res, `Validation error: ${issues}`, 400, 'VALIDATION_ERROR');
        }
        req.body = result.data;
        next();
    };
}
