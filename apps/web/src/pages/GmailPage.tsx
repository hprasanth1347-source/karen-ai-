import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export const GmailPage: React.FC = () => {
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/gmail/messages');
      setEmails(res.data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not fetch Gmail messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/drive/status');
      const status = res.data?.data;
      setConfigured(Boolean(status?.configured));
      setConnected(Boolean(status?.connected));
      if (status?.connected) {
        await fetchEmails();
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(
        err?.response?.status === 401
          ? 'Sign in at /auth first to connect and view Gmail.'
          : err?.response?.data?.error || 'Failed to check Gmail status.'
      );
      setLoading(false);
    }
  }, [fetchEmails]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get('error');
    if (oauthErr) setError(`Google OAuth error: ${oauthErr}`);
    refreshStatus();
  }, [refreshStatus]);

  const handleConnect = async () => {
    setError(null);
    try {
      const res = await api.get('/drive/auth-url', { params: { source: 'gmail' } });
      if (res.data?.data?.url) {
        window.location.href = res.data.data.url;
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not start Google OAuth.');
    }
  };

  const handleRunDigest = async () => {
    setDigestLoading(true);
    setError(null);
    try {
      const res = await api.post('/gmail/digest');
      setDigest(res.data?.data?.digest || 'No digest generated.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to run daily digest.');
    } finally {
      setDigestLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-coral text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Mail className="w-3.5 h-3.5" />
            <span>GOOGLE GMAIL API • OAUTH 2.0</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Gmail Intelligence & Daily Digest</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Read your latest Gmail messages, summarize inbox activity, and extract deadlines. Read-only access—emails are never sent silently.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <button
                type="button"
                disabled={digestLoading}
                onClick={handleRunDigest}
                className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                {digestLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {digestLoading ? 'Summarizing...' : 'Run Daily Digest'}
              </button>
              <button
                type="button"
                onClick={fetchEmails}
                className="btn-coral text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Fetch Latest Emails
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              className="btn-coral text-xs flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              Connect Gmail
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      {digest && (
        <div className="bg-yellow/20 border-3 border-ink p-4 shadow-brutal space-y-2 text-xs">
          <div className="font-extrabold font-mono text-coral">KAREN DAILY EMAIL DIGEST</div>
          <p className="whitespace-pre-wrap leading-relaxed">{digest}</p>
        </div>
      )}

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
          <span>RECENT INBOX MESSAGES ({emails.length})</span>
          <span className="text-[10px] font-mono text-ink-muted">
            {connected ? 'CONNECTED' : configured ? 'NOT CONNECTED' : 'MISSING GOOGLE OAUTH ENV'}
          </span>
        </h3>

        {loading ? (
          <div className="text-xs font-mono flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading Gmail inbox...
          </div>
        ) : !connected ? (
          <p className="text-xs text-ink-muted">
            {configured
              ? 'Click "Connect Gmail" above to authorize read-only Gmail + Drive access with one Google sign-in.'
              : 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in Vercel Environment Variables and redeploy.'}
          </p>
        ) : emails.length === 0 ? (
          <p className="text-xs text-ink-muted">No recent emails found.</p>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <div key={email.id} className="p-3 border-2 border-ink bg-cream-50 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2 font-bold">
                  <span className="text-coral truncate">{email.subject}</span>
                  <span className="text-[10px] font-mono text-ink-muted shrink-0">{email.date}</span>
                </div>
                <div className="text-[11px] font-mono text-ink-muted truncate">{email.from}</div>
                <p className="text-ink/80 text-[11px]">{email.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default GmailPage;
