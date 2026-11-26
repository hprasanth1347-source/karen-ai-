import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { api } from '../lib/api';

export const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [hasOwner, setHasOwner] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('expired') === '1') {
      return 'Your session has expired. Please sign in again.';
    }
    return null;
  });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login, bootstrap, user, loading } = useAuthContext();

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  // Check whether owner account already exists
  useEffect(() => {
    let active = true;
    api
      .get<{ ok: boolean; data?: { hasOwner: boolean } }>('/auth/status')
      .then((res) => {
        if (active) setHasOwner(res.data?.data?.hasOwner ?? true);
      })
      .catch(() => {
        if (active) setHasOwner(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasOwner === false) {
        await bootstrap(email.trim(), password, secret.trim(), 'Hari Prasath');
      } else {
        await login(email.trim(), password);
      }
      navigate('/', { replace: true });
    } catch (err: any) {
      const apiMsg = err?.response?.data?.error;
      setError(apiMsg || (err instanceof Error ? err.message : 'Sign-in failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="bg-white border-4 border-ink shadow-brutal-xl p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-coral text-white font-extrabold text-sm border-2 border-ink shadow-brutal-sm">
            <Sparkles className="w-4 h-4" />
            Karen AI
          </div>
          <h1 className="text-2xl font-black">
            {hasOwner === false ? 'Create Owner Account' : 'Personal AI Operating System'}
          </h1>
          <p className="text-xs text-ink-muted">
            {hasOwner === false
              ? 'First-time setup: register your owner credentials to lock Karen AI.'
              : 'Owner Authentication Gateway. Session stays active until you close or sign out.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold block">Owner Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-cream-50 border-2 border-ink p-2.5 text-xs font-medium outline-none focus:border-coral"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold block">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-cream-50 border-2 border-ink p-2.5 text-xs font-medium outline-none focus:border-coral"
            />
          </div>

          {hasOwner === false && (
            <div className="space-y-1">
              <label className="text-xs font-bold block">Bootstrap Secret</label>
              <input
                type="password"
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter BOOTSTRAP_SECRET"
                className="w-full bg-cream-50 border-2 border-ink p-2.5 text-xs font-medium outline-none focus:border-coral"
              />
            </div>
          )}

          {error && (
            <div className="p-2.5 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-coral py-2.5 text-xs font-black flex items-center justify-center gap-2 shadow-brutal disabled:opacity-60"
          >
            <span>
              {submitting
                ? 'Authenticating...'
                : hasOwner === false
                  ? 'Create Account & Enter'
                  : 'Enter AI Command Centre'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="p-3 border-2 border-ink bg-yellow/20 text-xs font-mono flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>SESSION MAINTAINED UNTIL BROWSER CLOSE</span>
        </div>
      </div>
    </div>
  );
};
export default AuthPage;
