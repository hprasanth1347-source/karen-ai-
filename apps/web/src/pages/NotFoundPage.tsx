import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="bg-white border-3 border-ink p-8 shadow-brutal text-center max-w-md mx-auto my-12 space-y-4">
      <div className="p-3 bg-coral text-white border-2 border-ink shadow-brutal-sm w-fit mx-auto">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-black">404 — Module Not Found</h1>
      <p className="text-xs text-ink-muted">
        The requested module or command route does not exist in Karen Ultra.
      </p>
      <Link to="/" className="btn-ghost inline-flex items-center gap-2 text-xs">
        <ArrowLeft className="w-4 h-4" />
        Return to Overview
      </Link>
    </div>
  );
};
export default NotFoundPage;
