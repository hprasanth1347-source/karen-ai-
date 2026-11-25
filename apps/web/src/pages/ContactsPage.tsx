import React, { useState } from 'react';
import { Users, Plus, Star, Search, Shield, Globe } from 'lucide-react';

export const ContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState([
    { id: '1', name: 'Sundar (Project Lead)', phone: '+91 98765 01234', language: 'Thanglish', isFavourite: true, permission: 'draft' },
    { id: '2', name: 'Priya (Tech Colleague)', phone: '+91 98765 56789', language: 'English', isFavourite: true, permission: 'draft' },
    { id: '3', name: 'Dr. Anand (Advisor)', email: 'anand@college.edu', language: 'English', isFavourite: false, permission: 'ask' },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-mint text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>UNIFIED IDENTITY & RELATIONSHIP DIRECTORY</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Contact Manager</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Manage authorized contacts, language preferences (Thanglish/Tamil/English), VIP priorities, and per-contact reply permissions.
          </p>
        </div>
        <button className="btn-coral text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">AUTHORIZED DIRECTORY</h3>
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="p-3 border-2 border-ink bg-cream-50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <button className={`p-1 border border-ink ${c.isFavourite ? 'bg-yellow text-ink' : 'bg-white'}`}>
                  <Star className="w-3.5 h-3.5" />
                </button>
                <div>
                  <h4 className="font-bold">{c.name}</h4>
                  <span className="text-[11px] font-mono text-ink-muted">{c.phone || c.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="px-2 py-0.5 border border-ink bg-white font-bold">
                  LANG: {c.language}
                </span>
                <span className="px-2 py-0.5 border border-ink bg-cream-200 uppercase">
                  RULE: {c.permission}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default ContactsPage;
