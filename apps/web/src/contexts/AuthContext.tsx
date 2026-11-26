import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { api } from '../lib/api';

const SESSION_STORAGE_KEY = 'karen_auth_session';

interface StoredSession {
  user: User;
  accessToken: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  bootstrap: (email: string, password: string, secret: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000 <= Date.now() + 5000;
    }
    return false;
  } catch {
    return true;
  }
}

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.user && parsed?.accessToken && !isJwtExpired(parsed.accessToken)) {
      return parsed;
    }
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function writeStoredSession(user: User, accessToken: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ user, accessToken })
    );
  } catch {
    // Ignore storage quota errors
  }
}

function clearStoredSession() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialStored = readStoredSession();
  const [user, setUser] = useState<User | null>(initialStored?.user ?? null);
  const [session, setSession] = useState<Session | null>(
    initialStored ? ({ access_token: initialStored.accessToken, user: initialStored.user } as Session) : null
  );
  const [loading, setLoading] = useState(!initialStored);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      // 1. Check backend session stored in sessionStorage and verify with GET /auth/me
      const stored = readStoredSession();
      if (stored) {
        try {
          await api.get('/auth/me');
          if (mounted) {
            setUser(stored.user);
            setSession({ access_token: stored.accessToken, user: stored.user } as Session);
            setLoading(false);
          }
          return;
        } catch {
          clearStoredSession();
          if (mounted) {
            setUser(null);
            setSession(null);
            setLoading(false);
          }
          return;
        }
      }

      // 2. Check Supabase client session (also scoped to sessionStorage)
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          if (mounted) {
            if (data.session?.access_token && data.session.user) {
              writeStoredSession(data.session.user, data.session.access_token);
            }
            setSession(data.session);
            setUser(data.session?.user ?? null);
            setLoading(false);
          }
          return;
        } catch (err) {
          console.warn('Supabase auth session fetch failed:', err);
        }
      }

      if (mounted) {
        setUser(null);
        setSession(null);
        setLoading(false);
      }
    }

    void initAuth();

    if (isSupabaseConfigured && supabase) {
      try {
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, s) => {
          if (!mounted) return;
          if (s?.access_token && s.user) {
            writeStoredSession(s.user, s.access_token);
            setSession(s);
            setUser(s.user);
          } else if (!readStoredSession()) {
            setSession(null);
            setUser(null);
          }
          setLoading(false);
        });

        return () => {
          mounted = false;
          subscription.unsubscribe();
        };
      } catch {
        return () => {
          mounted = false;
        };
      }
    }

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session?.access_token && data.user) {
        writeStoredSession(data.user, data.session.access_token);
        setSession(data.session);
        setUser(data.user);
      }
      return;
    }

    const res = await api.post<{
      ok: boolean;
      data?: { user: User; session: Session };
      error?: string;
    }>('/auth/login', { email, password });

    const payload = res.data?.data;
    if (!payload?.session?.access_token || !payload?.user) {
      throw new Error(res.data?.error || 'Sign-in failed');
    }

    writeStoredSession(payload.user, payload.session.access_token);
    setSession(payload.session);
    setUser(payload.user);
  };

  const bootstrap = async (
    email: string,
    password: string,
    secret: string,
    displayName?: string
  ) => {
    const res = await api.post<{
      ok: boolean;
      data?: { user: User; session?: Session };
      error?: string;
    }>('/auth/bootstrap', { email, password, secret, displayName });

    const payload = res.data?.data;
    if (!payload?.user) {
      throw new Error(res.data?.error || 'Owner setup failed');
    }

    const token = payload.session?.access_token;
    if (token) {
      writeStoredSession(payload.user, token);
      setSession(payload.session ?? null);
      setUser(payload.user);
      if (isSupabaseConfigured && supabase && payload.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: token,
          refresh_token: payload.session.refresh_token,
        });
      }
    } else {
      await login(email, password);
    }
  };

  const logout = async () => {
    clearStoredSession();
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    setUser(null);
    setSession(null);
  };

  const refreshSession = async () => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (data.session?.access_token && data.session.user) {
        writeStoredSession(data.session.user, data.session.access_token);
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, login, bootstrap, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
