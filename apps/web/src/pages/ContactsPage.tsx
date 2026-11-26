import React, { useEffect, useState } from 'react';
import { Users, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

interface GoogleContact {
  resourceName: string;
  name: string;
  emails: string[];
  phones: string[];
}

export const ContactsPage: React.FC = () => {
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: GoogleContact[] }>(`/google-contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setGoogleContacts(res.data?.data ?? []);
      setNeedsReconnect(false);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setNeedsReconnect(true);
      }
      setError(err?.response?.data?.error || 'Could not load Google Contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContacts();
  }, []);

  const handleReconnect = async () => {
    const res = await api.get<{ data: { url: string } }>('/auth/google/url?target=drive').catch(() => null);
    if (res?.data?.data?.url) window.location.href = res.data.data.url;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const res = await api.post<{ data: GoogleContact }>('/google-contacts', {
        givenName: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      if (res.data?.data) setGoogleContacts((prev) => [res.data.data, ...prev]);
      setName('');
      setEmail('');
      setPhone('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save contact to Google Contacts.');
    }
  };

  const filtered = googleContacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.emails.some((em) => em.toLowerCase().includes(search.toLowerCase())) ||
      c.phones.some((ph) => ph.includes(search))
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>GOOGLE CONTACTS (PEOPLE API)</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Contacts</h1>
          <p className="text-xs text-ink-muted mt-1">Synced directly with your Google Contacts for Gmail, WhatsApp &amp; Karen commands.</p>
        </div>
        <button type="button" onClick={() => void loadContacts(search)} className="btn-ghost text-xs flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {needsReconnect && (
        <div className="bg-yellow/40 border-2 border-ink p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold">Reconnect Google once to grant Google Contacts (People API) permission.</span>
          <button type="button" onClick={() => void handleReconnect()} className="btn-coral text-xs px-3 py-1">
            Reconnect Google
          </button>
        </div>
      )}

      {error && !needsReconnect && (
        <div className="bg-coral/20 border-2 border-ink p-3 text-xs font-bold">{error}</div>
      )}

      <form onSubmit={handleAdd} className="bg-white border-3 border-ink p-4 shadow-brutal grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border-2 border-ink p-2 text-xs" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="border-2 border-ink p-2 text-xs" />
        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="border-2 border-ink p-2 text-xs" />
        <button type="submit" className="btn-coral text-xs flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </form>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Google Contacts by name, email, or phone..." className="w-full border-2 border-ink p-2 text-xs" />
        {loading ? (
          <p className="text-xs font-mono text-ink-muted">Loading Google Contacts...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-ink-muted">No contacts found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((c) => (
              <div key={c.resourceName || c.name} className="border border-ink p-3 bg-cream-50 text-xs space-y-1">
                <div className="font-black">{c.name}</div>
                {c.emails[0] && <div className="font-mono text-[11px] text-ink-muted">{c.emails[0]}</div>}
                {c.phones[0] && <div className="font-mono text-[11px] text-ink-muted">{c.phones[0]}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default ContactsPage;
