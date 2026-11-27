import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Sparkles, RefreshCw, Loader2, X } from 'lucide-react';
import { api, readCachedGet } from '../lib/api';
import { useGoogleIntegration } from '../hooks/useGoogleIntegration';

interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

interface FullEmail extends EmailSummary {
  to?: string;
  body: string;
}

export const GmailPage: React.FC = () => {
  const cachedEmails = readCachedGet<{ data?: EmailSummary[] }>('/gmail/messages')?.data;
  const { status: googleStatus, loading: googleLoading, error: googleError, connect } = useGoogleIntegration();
  const configured = googleStatus.configured;
  const gmailService = googleStatus.services.gmail;
  const connected = googleStatus.connected && gmailService.connected;

  const [loading, setLoading] = useState(() => !(cachedEmails && cachedEmails.length > 0));
  const [digestLoading, setDigestLoading] = useState(false);
  const [emails, setEmails] = useState<EmailSummary[]>(() => cachedEmails ?? []);
  const [digest, setDigest] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async (force = false) => {
    if (!cachedEmails?.length || force) setLoading(true);
    setError(null);
    try {
      const res = await api.get('/gmail/messages', force ? ({ skipCache: true } as any) : undefined);
      setEmails(res.data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not fetch Gmail messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (googleError) {
      setError(googleError);
    } else if (googleStatus.connected && gmailService.status === 'permission_required') {
      setError(gmailService.error || 'Gmail permission required. Click Connect / Reconnect to grant Gmail scope.');
    }
  }, [googleError, googleStatus.connected, gmailService.status, gmailService.error]);

  useEffect(() => {
    if (googleLoading) return;
    if (connected) {
      void fetchEmails(false);
    } else {
      setLoading(false);
    }
  }, [connected, googleLoading, fetchEmails]);

  const handleConnect = async () => {
    await connect('gmail');
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

  const handleOpenEmail = async (id: string) => {
    setLoadingEmail(true);
    setError(null);
    try {
      const res = await api.get(`/gmail/messages/${id}`);
      if (res.data?.data) {
        setSelectedEmail(res.data.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not open email.');
    } finally {
      setLoadingEmail(false);
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
            Click any email to read the full message, or run a Daily Digest. Karen AI can also read and send emails from AI Chat.
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
                onClick={() => void fetchEmails(true)}
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

      {selectedEmail && (
        <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-3 border-ink shadow-brutal-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b-3 border-ink flex items-start justify-between gap-4 bg-cream-100">
              <div className="min-w-0">
                <h3 className="font-black text-sm">{selectedEmail.subject}</h3>
                <p className="text-[11px] font-mono text-ink-muted truncate mt-0.5">
                  From: {selectedEmail.from} • {selectedEmail.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmail(null)}
                className="p-1 border-2 border-ink bg-white hover:bg-coral hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-xs whitespace-pre-wrap leading-relaxed">
              {selectedEmail.body}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
          <span>RECENT INBOX MESSAGES ({emails.length})</span>
          <span className="text-[10px] font-mono text-ink-muted">
            {loadingEmail ? 'OPENING EMAIL...' : connected ? 'CLICK ANY EMAIL TO READ' : configured ? 'NOT CONNECTED' : 'MISSING GOOGLE OAUTH ENV'}
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
              ? 'Click "Connect Gmail" above to authorize Gmail + Drive access with one Google sign-in.'
              : 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in Vercel Environment Variables and redeploy.'}
          </p>
        ) : emails.length === 0 ? (
          <p className="text-xs text-ink-muted">No recent emails found.</p>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => handleOpenEmail(email.id)}
                className="w-full text-left p-3 border-2 border-ink bg-cream-50 hover:bg-yellow/20 transition-colors space-y-1.5 text-xs cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 font-bold">
                  <span className="text-coral truncate">{email.subject}</span>
                  <span className="text-[10px] font-mono text-ink-muted shrink-0">{email.date}</span>
                </div>
                <div className="text-[11px] font-mono text-ink-muted truncate">{email.from}</div>
                <p className="text-ink/80 text-[11px]">{email.snippet}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default GmailPage;
