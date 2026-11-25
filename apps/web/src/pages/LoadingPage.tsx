import React from 'react';
import { RefreshCw } from 'lucide-react';

export const LoadingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4">
      <div className="bg-white border-3 border-ink p-6 shadow-brutal flex items-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-coral" />
        <span className="text-xs font-mono font-bold tracking-wider">
          LOADING Karen AI CORE...
        </span>
      </div>
    </div>
  );
};
export default LoadingPage;
