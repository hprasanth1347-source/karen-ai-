import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Search, Lock, FileText, ExternalLink, RefreshCw, Unplug, Loader2, Mail, X } from 'lucide-react';
import { api } from '../lib/api';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface DrivePreview {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  previewMode?: 'text' | 'pdf' | 'image' | 'binary';
  content?: string;
  previewUnavailable?: boolean;
}

interface ImportantEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
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
  const [importantEmails, setImportantEmails] = useState<ImportantEmail[]>([]);
  const [selectedFile, setSelectedFile] = useState<DrivePreview | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTab, setPreviewTab] = useState<'visual' | 'text'>('visual');
  const [selectedEmail, setSelectedEmail] = useState<ImportantEmail | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const closeFileModal = useCallback(() => {
    setSelectedFile(null);
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const loadFiles = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const [driveRes, gmailRes] = await Promise.all([
        api.get('/drive/files', { params: q ? { q } : undefined }),
        api.get('/gmail/messages', { params: { important: '1' } }).catch(() => ({ data: { data: [] } })),
      ]);
      setFiles(driveRes.data?.data ?? []);
      setImportantEmails(gmailRes.data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load Google Drive files.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/drive/status', { skipCache: true } as any);
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
    setImportantEmails([]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (connected) loadFiles(search);
  };

  const handleOpenFile = async (file: DriveFile) => {
    setError(null);
    setPreviewLoading(true);
    setPreviewTab('visual');
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const res = await api.get(`/drive/files/${file.id}/content`);
      const preview: DrivePreview | undefined = res.data?.data;
      if (preview) {
        setSelectedFile(preview);
        const needsBlob =
          preview.previewMode === 'pdf' ||
          preview.previewMode === 'image' ||
          preview.mimeType.startsWith('application/vnd.google-apps.');
        if (needsBlob) {
          const rawRes = await api.get(`/drive/files/${file.id}/raw`, { responseType: 'blob' });
          const url = URL.createObjectURL(rawRes.data);
          setPreviewBlobUrl(url);
        } else {
          setPreviewTab('text');
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not preview Drive file.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenEmail = async (email: ImportantEmail) => {
    setError(null);
    try {
      const res = await api.get(`/gmail/messages/${email.id}`);
      if (res.data?.data) {
        setSelectedEmail(res.data.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not open email.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <HardDrive className="w-3.5 h-3.5" />
            <span>GOOGLE DRIVE REPOSITORY &amp; IN-APP PREVIEW</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Google Drive Personal Document Vault</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Preview PDFs, images, Docs, Sheets, and text files directly inside Karen—no Google Drive redirect errors.
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

      {previewLoading && !selectedFile && (
        <div className="p-3 border-2 border-ink bg-yellow/20 text-xs font-mono flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading Drive file preview inside Karen...
        </div>
      )}

      {selectedFile && (
        <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-3 border-ink shadow-brutal-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b-3 border-ink flex items-center justify-between gap-4 bg-cream-100">
              <div className="min-w-0">
                <h3 className="font-black text-sm truncate">{selectedFile.name}</h3>
                <p className="text-[10px] font-mono text-ink-muted">{selectedFile.mimeType}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewBlobUrl && selectedFile.content && (
                  <div className="flex border-2 border-ink text-[11px] font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('visual')}
                      className={`px-2 py-1 ${previewTab === 'visual' ? 'bg-yellow' : 'bg-white'}`}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('text')}
                      className={`px-2 py-1 border-l-2 border-ink ${previewTab === 'text' ? 'bg-yellow' : 'bg-white'}`}
                    >
                      Extracted Text
                    </button>
                  </div>
                )}
                {selectedFile.webViewLink && (
                  <a
                    href={selectedFile.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-teal text-[11px] py-1 px-2.5 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    External
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeFileModal}
                  className="p-1 border-2 border-ink bg-white hover:bg-coral hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto text-xs flex-1">
              {previewTab === 'visual' && previewBlobUrl ? (
                selectedFile.previewMode === 'image' ? (
                  <img
                    src={previewBlobUrl}
                    alt={selectedFile.name}
                    className="max-h-[70vh] mx-auto border-2 border-ink"
                  />
                ) : (
                  <iframe
                    src={previewBlobUrl}
                    title={selectedFile.name}
                    className="w-full h-[70vh] border-2 border-ink bg-cream-50"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    onError={() => setPreviewBlobUrl(null)}
                  />
                )
              ) : previewTab === 'visual' && selectedFile.webViewLink ? (
                <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
                  <p className="text-xs text-ink-muted text-center">In-app binary preview loaded via Drive viewer.</p>
                  <iframe
                    src={`https://drive.google.com/file/d/${selectedFile.id}/preview`}
                    title={selectedFile.name}
                    className="w-full h-[60vh] border-2 border-ink bg-cream-50"
                    allow="autoplay"
                  />
                </div>
              ) : selectedFile.content ? (
                <pre className="whitespace-pre-wrap font-sans leading-relaxed">{selectedFile.content}</pre>
              ) : (
                <p className="text-ink-muted">
                  In-app preview is unavailable for this binary file format. Use the External button above to download or open it.
                </p>
              )}
            </div>
          </div>
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
              {selectedEmail.body || selectedEmail.snippet}
            </div>
          </div>
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
                ? 'Click "Connect Google Drive" above to authorize access to your Drive files.'
                : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables first, then click "Connect Google Drive".'}
            </p>
          ) : files.length === 0 ? (
            <p className="text-xs text-ink-muted">No matching files found in Google Drive.</p>
          ) : (
            <div className="space-y-2 text-xs max-h-72 overflow-y-auto">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-2 border border-ink bg-cream-50 hover:bg-yellow/20 font-medium">
                  <button
                    type="button"
                    onClick={() => handleOpenFile(f)}
                    className="truncate text-left flex-1 cursor-pointer hover:underline"
                  >
                    {f.name}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-ink-muted">{formatSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => handleOpenFile(f)}
                      className="px-1.5 py-0.5 border border-ink bg-white text-[10px] font-mono font-bold hover:bg-teal hover:text-white"
                    >
                      Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Mail className="w-4 h-4 text-coral" />
            IMPORTANT EMAILS ({importantEmails.length})
          </h3>
          {!connected ? (
            <p className="text-xs text-ink-muted">
              Connect Google above to view your important Gmail messages alongside Drive files.
            </p>
          ) : importantEmails.length === 0 ? (
            <p className="text-xs text-ink-muted">No important emails found.</p>
          ) : (
            <div className="space-y-2 text-xs max-h-72 overflow-y-auto">
              {importantEmails.map((em) => (
                <button
                  key={em.id}
                  type="button"
                  onClick={() => handleOpenEmail(em)}
                  className="w-full text-left p-2.5 border border-ink bg-cream-50 hover:bg-yellow/20 space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-coral truncate">{em.subject}</div>
                  <div className="text-[10px] font-mono text-ink-muted truncate">{em.from}</div>
                  <p className="text-[11px] text-ink/80 line-clamp-2">{em.snippet}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-coral" />
          OAUTH &amp; CONNECTION STATUS
        </h3>
        <div className="p-3 border-2 border-ink bg-yellow/20 text-xs font-mono space-y-1">
          <div>GOOGLE OAUTH ENV: {configured ? 'CONFIGURED' : 'MISSING CLIENT ID / SECRET'}</div>
          <div>DRIVE &amp; GMAIL SESSION: {connected ? 'CONNECTED (PERSISTED IN SUPABASE)' : 'NOT CONNECTED'}</div>
        </div>
      </div>
    </div>
  );
};
export default DrivePage;
