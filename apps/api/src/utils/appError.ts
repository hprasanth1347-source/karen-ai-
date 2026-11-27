export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'DUPLICATE_EVENT'
  | 'RATE_LIMITED'
  | 'GOOGLE_NOT_CONNECTED'
  | 'GOOGLE_TOKEN_EXPIRED'
  | 'GOOGLE_REFRESH_FAILED'
  | 'GOOGLE_SCOPE_MISSING'
  | 'GOOGLE_PERMISSION_DENIED'
  | 'GOOGLE_RATE_LIMITED'
  | 'GOOGLE_FILE_NOT_FOUND'
  | 'GOOGLE_API_ERROR'
  | 'TELEGRAM_UNAUTHORIZED'
  | 'INSTAGRAM_WEBHOOK_INVALID'
  | 'AI_PROVIDER_ERROR'
  | 'AI_PROVIDER_TIMEOUT'
  | 'DOCUMENT_PROCESSING_FAILED'
  | 'CONFIRMATION_REQUIRED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown[];

  constructor(code: AppErrorCode, message: string, statusCode?: number, details?: unknown[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode ?? AppError.defaultStatus(code);
  }

  static defaultStatus(code: AppErrorCode): number {
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
