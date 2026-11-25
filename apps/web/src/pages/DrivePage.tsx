import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Search, Lock, FileText, ExternalLink, RefreshCw, Unplug, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

function formatSize(bytes?: string): string {
  const num = Number(bytes);
  if (!num) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${Math.round(num / 1024)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export const DrivePage: React.FC = () => {
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/drive/files', { params: q ? { q } : undefined });
      setFiles(res.data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load Google Drive files.');
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
        await loadFiles();
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(
        err?.response?.status === 401
          ? 'Sign in at /auth first to connect and view Google Drive.'
          : err?.response?.data?.error || 'Failed to check Google Drive status.'
      );
      setLoading(false);
    }
  }, [loadFiles]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get('error');
    if (oauthErr) {
      setError(`Google OAuth error: ${oauthErr}`);
    }
    refreshStatus();
  }, [refreshStatus]);

  const handleConnect = async () => {
    setError(null);
    try {
      const res = await api.get('/drive/auth-url');
      const url = res.data?.data?.url;
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not start Google Drive connection.');
    }
  };

  const handleDisconnect = async () => {
    await api.post('/drive/disconnect').catch(() => {});
    setConnected(false);
    setFiles([]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (connected) loadFiles(search);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <HardDrive className="w-3.5 h-3.5" />
            <span>GOOGLE DRIVE REPOSITORY & INDEXER</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Google Drive Personal Document Vault</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Connect your Google Drive to search personal files, project documents, notes, and invoices directly from Karen Ultra.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <button
                type="button"
                onClick={() => loadFiles(search)}
                className="btn-teal text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Files
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="btn-ghost text-xs flex items-center gap-1.5"
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              className="btn-teal text-xs flex items-center gap-1.5"
            >
              <HardDrive className="w-3.5 h-3.5" />
              Connect Google Drive
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      <form onSubmit={handleSearchSubmit} className="bg-cream-100 border-3 border-ink p-4 shadow-brutal flex items-center gap-2">
        <Search className="w-4 h-4 text-ink" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your Google Drive files by name..."
          className="bg-transparent text-xs font-medium w-full outline-none"
        />
        <button type="submit" disabled={!connected} className="btn-brutal bg-white text-xs py-1 px-3 disabled:opacity-50">
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal" />
            DRIVE FILES ({files.length})
          </h3>
          {loading ? (
            <div className="text-xs font-mono flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking Google Drive...
            </div>
          ) : !connected ? (
            <p className="text-xs text-ink-muted">
              {configured
                ? 'Click "Connect Google Drive" above to authorize read-only access to your Drive files.'
                : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables first, then click "Connect Google Drive".'}
            </p>
          ) : files.length === 0 ? (
            <p className="text-xs text-ink-muted">No matching files found in Google Drive.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2 border border-ink bg-cream-50 font-medium">
                  <span className="truncate">{f.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-ink-muted">{formatSize(f.size)}</span>
                    {f.webViewLink && (
                      <a
                        href={f.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:text-teal"
                        title="Open in Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-coral" />
            OAUTH & CONNECTION STATUS
          </h3>
          <div className="p-3 border-2 border-ink bg-yellow/20 text-xs font-mono space-y-1">
            <div>GOOGLE OAUTH ENV: {configured ? 'CONFIGURED' : 'MISSING CLIENT ID / SECRET'}</div>
            <div>DRIVE SESSION: {connected ? 'CONNECTED (READ-ONLY)' : 'NOT CONNECTED'}</div>
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            In Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs, add:
            <code className="block mt-1 p-1.5 bg-cream-100 border border-ink text-[11px] break-all">
              https://karen-ai-me.vercel.app/api/v1/auth/google/callback
            </code>
          </p>
        </div>
      </div>
    </div>
  );
};
export default DrivePage;
