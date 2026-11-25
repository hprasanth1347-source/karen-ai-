import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

export const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuthContext();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured) {
      navigate('/');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
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
          <h1 className="text-2xl font-black">Personal AI Operating System</h1>
          <p className="text-xs text-ink-muted">
            Owner Authentication Gateway. Access restricted to authorized owner.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold block">Owner Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@karen-ultra.local"
              className="w-full bg-cream-50 border-2 border-ink p-2.5 text-xs font-medium outline-none focus:border-coral"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold block">Password / Master Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-cream-50 border-2 border-ink p-2.5 text-xs font-medium outline-none focus:border-coral"
            />
          </div>

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
            <span>{submitting ? 'Signing in...' : 'Enter AI Command Centre'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="p-3 border-2 border-ink bg-yellow/20 text-xs font-mono text-center">
          <span>DEFAULT: OWNER VERIFIED IN LOCAL DEV</span>
        </div>
      </div>
    </div>
  );
};
export default AuthPage;
