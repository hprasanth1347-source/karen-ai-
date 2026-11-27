import type { Request } from 'express';
import { AppError } from '../utils/appError.js';
import {
  disconnectGoogleAccount,
  getGoogleAccessToken,
  getGoogleConnectionStatus,
} from '../routes/googleDrive.js';
import { loadGoogleTokensWithStatus, type ConnectionStatus, type StoredGoogleTokens } from './persistence.service.js';
import { cacheService } from './cache.service.js';

export interface GoogleConnectionDetails {
  userId: string;
  status: ConnectionStatus;
  connected: boolean;
  expiresAt: number | null;
  hasRefreshToken: boolean;
}

class GoogleConnectionManager {
  public async getConnection(userId: string): Promise<StoredGoogleTokens | null> {
    if (!userId) return null;
    const { tokens, status } = await loadGoogleTokensWithStatus(userId);
    if (status === 'disconnected' || !tokens?.accessToken) return null;
    return tokens;
  }

  public async requireConnection(userId: string, req?: Request): Promise<string> {
    const token = await this.getValidAccessToken(userId, req);
    if (!token) {
      throw new AppError('GOOGLE_NOT_CONNECTED', 'Google account is not connected. Please connect Google first.');
    }
    return token;
  }

  public async getValidAccessToken(userId: string, req?: Request): Promise<string | null> {
    if (!userId && !req) return null;
    return getGoogleAccessToken(userId || undefined, req);
  }

  public async verifyScopes(userId: string, requiredScopes: string[]): Promise<{ ok: boolean; missing: string[] }> {
    const { tokens, status } = await loadGoogleTokensWithStatus(userId);
    if (status !== 'connected' || !tokens) {
      return { ok: false, missing: requiredScopes };
    }
    const rawScope = String((tokens as unknown as { scope?: string }).scope || '');
    if (!rawScope) {
      return { ok: true, missing: [] };
    }
    const granted = new Set(rawScope.split(/[\s,]+/).filter(Boolean));
    const missing = requiredScopes.filter((s) => !granted.has(s));
    return { ok: missing.length === 0, missing };
  }

  public async getStatus(userId: string, req?: Request): Promise<GoogleConnectionDetails> {
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

  public async disconnect(userId: string): Promise<void> {
    await disconnectGoogleAccount(userId);
    if (userId) cacheService.invalidateUser(userId);
  }

  public mapHttpError(status: number, message?: string): AppError {
    if (status === 401) return new AppError('GOOGLE_TOKEN_EXPIRED', message || 'Google access token expired.');
    if (status === 403) return new AppError('GOOGLE_PERMISSION_DENIED', message || 'Google permission denied or missing scope.');
    if (status === 404) return new AppError('GOOGLE_FILE_NOT_FOUND', message || 'Requested Google resource was not found.');
    if (status === 429) return new AppError('GOOGLE_RATE_LIMITED', message || 'Google API rate limit exceeded.');
    return new AppError('GOOGLE_API_ERROR', message || `Google API error (${status}).`);
  }
}

export const googleConnectionManager = new GoogleConnectionManager();
