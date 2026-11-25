import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!isSupabaseConfigured) {
        if (mounted) {
            setUser(null);
            setSession(null);
          setLoading(false);
        }
        return;
      }

      try {
        const { data } = await supabase!.auth.getSession();
        if (mounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Supabase auth session fetch failed:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    if (isSupabaseConfigured && supabase) {
      try {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, s) => {
        if (mounted) {
          setSession(s);
          setUser(s?.user ?? null);
          setLoading(false);
        }
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
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured');
    }
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase!.auth.signOut();
    }
    setUser(null);
    setSession(null);
  };

  const refreshSession = async () => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.auth.refreshSession();
      if (error) throw error;
      setSession(data.session);
      setUser(data.session?.user ?? null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, login, logout, refreshSession }}
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
