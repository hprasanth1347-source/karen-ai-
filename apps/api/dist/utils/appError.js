export class AppError extends Error {
    code;
    statusCode;
    details;
    constructor(code, message, statusCode, details) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.details = details;
        this.statusCode = statusCode ?? AppError.defaultStatus(code);
    }
    static defaultStatus(code) {
        switch (code) {
            case 'AUTH_REQUIRED':
            case 'GOOGLE_TOKEN_EXPIRED':
            case 'GOOGLE_REFRESH_FAILED':
            case 'INSTAGRAM_WEBHOOK_INVALID':
                return 401;
            case 'FORBIDDEN':
            case 'GOOGLE_SCOPE_MISSING':
            case 'GOOGLE_PERMISSION_DENIED':
            case 'TELEGRAM_UNAUTHORIZED':
                return 403;
            case 'NOT_FOUND':
            case 'GOOGLE_FILE_NOT_FOUND':
                return 404;
            case 'CONFLICT':
            case 'DUPLICATE_EVENT':
            case 'GOOGLE_NOT_CONNECTED':
            case 'CONFIRMATION_REQUIRED':
                return 409;
            case 'VALIDATION_ERROR':
                return 400;
            case 'DOCUMENT_PROCESSING_FAILED':
                return 422;
            case 'RATE_LIMITED':
            case 'GOOGLE_RATE_LIMITED':
                return 429;
            case 'AI_PROVIDER_TIMEOUT':
                return 504;
            case 'AI_PROVIDER_ERROR':
            case 'GOOGLE_API_ERROR':
                return 502;
            default:
                return 500;
        }
    }
}
