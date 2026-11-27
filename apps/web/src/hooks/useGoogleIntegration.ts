/**
 * useGoogleIntegration — shared hook for all Google feature pages.
 *
 * Fetches /google/integration-status once per mount (or on demand) and
 * exposes per-service status so each page shows the real connection state.
 * Also handles the ?connected=1 URL param returned by the OAuth callback.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface ServiceStatus {
  connected: boolean;
  status?: 'connected' | 'permission_required' | 'disconnected' | 'error';
  error?: string;
  scopeRequired?: string;
}

export interface GoogleIntegrationStatus {
  configured: boolean;
  connected: boolean;
  googleStatus: 'connected' | 'needs_reauth' | 'disconnected';
  googleEmail?: string;
  connectedAt?: string;
  hasRefreshToken?: boolean;
  scopes?: string[];
  lastChecked?: string;
  services: {
    drive: ServiceStatus;
    gmail: ServiceStatus;
    calendar: ServiceStatus;
    sheets: ServiceStatus;
    contacts: ServiceStatus;
    classroom: ServiceStatus;
  };
}

const DEFAULT_STATUS: GoogleIntegrationStatus = {
  configured: false,
  connected: false,
  googleStatus: 'disconnected',
  services: {
    drive: { connected: false, status: 'disconnected' },
    gmail: { connected: false, status: 'disconnected' },
    calendar: { connected: false, status: 'disconnected' },
    sheets: { connected: false, status: 'disconnected' },
    contacts: { connected: false, status: 'disconnected' },
    classroom: { connected: false, status: 'disconnected' },
  },
};

export function useGoogleIntegration() {
  const [status, setStatus] = useState<GoogleIntegrationStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchStatus = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/google/integration-status', force ? ({ skipCache: true } as any) : undefined);
      const data = res.data?.data as GoogleIntegrationStatus;
      if (data) {
        setStatus(data);
        if (!data.connected && data.configured) {
          try {
            const authRes = await api.get('/drive/auth-url', { params: { source: 'drive' } } as any);
            setAuthUrl(authRes.data?.data?.url ?? null);
          } catch {
            // ignore
          }
        }
      }
    } catch (err: any) {
      const msg =
        err?.response?.status === 401
          ? 'Sign in at /auth first to view Google integration status.'
          : err?.response?.data?.error || 'Failed to load Google integration status.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async (source = 'drive', extraScopes?: string[]) => {
    setError(null);
    try {
      const params: Record<string, string> = { source };
      if (extraScopes?.length) params.scopes = extraScopes.join(' ');
      const res = await api.get('/drive/auth-url', { params } as any);
      const url = res.data?.data?.url;
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not start Google OAuth.');
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await api.post('/drive/disconnect');
      await fetchStatus(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to disconnect Google account.');
    }
  }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get('connected') === '1';
    const oauthError = params.get('error');

    if (oauthError) {
      setError(`Google sign-in error: ${oauthError}`);
      setLoading(false);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (justConnected || !fetchedRef.current) {
      fetchedRef.current = true;
      if (justConnected) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      void fetchStatus(justConnected);
    }
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    authUrl,
    refetch: () => fetchStatus(true),
    connect,
    disconnect,
  };
}
