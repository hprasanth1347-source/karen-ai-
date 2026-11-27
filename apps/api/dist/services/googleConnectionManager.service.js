import { AppError } from '../utils/appError.js';
import { disconnectGoogleAccount, getGoogleAccessToken, getGoogleConnectionStatus, } from '../routes/googleDrive.js';
import { loadGoogleTokensWithStatus } from './persistence.service.js';
import { cacheService } from './cache.service.js';
class GoogleConnectionManager {
    async getConnection(userId) {
        if (!userId)
            return null;
        const { tokens, status } = await loadGoogleTokensWithStatus(userId);
        if (status === 'disconnected' || !tokens?.accessToken)
            return null;
        return tokens;
    }
    async requireConnection(userId, req) {
        const token = await this.getValidAccessToken(userId, req);
        if (!token) {
            throw new AppError('GOOGLE_NOT_CONNECTED', 'Google account is not connected. Please connect Google first.');
        }
        return token;
    }
    async getValidAccessToken(userId, req) {
        if (!userId && !req)
            return null;
        return getGoogleAccessToken(userId || undefined, req);
    }
    async verifyScopes(userId, requiredScopes) {
        const { tokens, status } = await loadGoogleTokensWithStatus(userId);
        if (status !== 'connected' || !tokens) {
            return { ok: false, missing: requiredScopes };
        }
        const rawScope = String(tokens.scope || '');
        if (!rawScope) {
            return { ok: true, missing: [] };
        }
        const granted = new Set(rawScope.split(/[\s,]+/).filter(Boolean));
        const missing = requiredScopes.filter((s) => !granted.has(s));
        return { ok: missing.length === 0, missing };
    }
    async getStatus(userId, req) {
        const status = await getGoogleConnectionStatus(userId, req);
        const { tokens } = await loadGoogleTokensWithStatus(userId);
        return {
            userId,
            status,
            connected: status === 'connected',
            expiresAt: tokens?.expiresAt ?? null,
            hasRefreshToken: Boolean(tokens?.refreshToken),
        };
    }
    async disconnect(userId) {
        await disconnectGoogleAccount(userId);
        if (userId)
            cacheService.invalidateUser(userId);
    }
    mapHttpError(status, message) {
        if (status === 401)
            return new AppError('GOOGLE_TOKEN_EXPIRED', message || 'Google access token expired.');
        if (status === 403)
            return new AppError('GOOGLE_PERMISSION_DENIED', message || 'Google permission denied or missing scope.');
        if (status === 404)
            return new AppError('GOOGLE_FILE_NOT_FOUND', message || 'Requested Google resource was not found.');
        if (status === 429)
            return new AppError('GOOGLE_RATE_LIMITED', message || 'Google API rate limit exceeded.');
        return new AppError('GOOGLE_API_ERROR', message || `Google API error (${status}).`);
    }
}
export const googleConnectionManager = new GoogleConnectionManager();
