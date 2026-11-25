import React, { useState } from 'react';
import { Mic, Volume2, ShieldAlert, CheckCircle2, AlertOctagon, Play, Square } from 'lucide-react';

export const VoicePage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-coral text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Mic className="w-3.5 h-3.5" />
            <span>ELEVENLABS • STRICT FEMALE VOICE POLICY</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Voice Centre (Karen Female Voice)</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Voice conversations in Thanglish, Tamil, and English. Strictly configured female voice ID required. If provider voice fails, the system refuses male fallback and stays in text mode.
          </p>
        </div>
      </div>

      {/* Strict Policy Banner */}
      <div className="bg-coral/10 border-3 border-ink p-4 shadow-brutal flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-coral shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-extrabold text-coral uppercase block">Mandatory Voice Policy Lock:</span>
          <p className="text-ink/80 text-[11px] leading-relaxed">
            As specified in the Master Architecture, Karen Ultra only speaks with an owner-approved female voice ID. Browser default male speech synthesizers and unverified generic voices are intentionally blocked by server policy.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Voice Control Board */}
        <div className="bg-white border-3 border-ink p-6 shadow-brutal flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full border-4 border-ink flex items-center justify-center bg-cream-100 shadow-brutal">
            <Mic className={`w-10 h-10 ${isRecording ? 'text-coral animate-pulse' : 'text-ink'}`} />
          </div>

          <div>
            <h3 className="font-black text-base">PUSH TO TALK</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Microphone permission is requested on click. Browser STT / Whisper.
            </p>
          </div>

          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`btn-brutal px-6 py-2.5 text-xs font-black flex items-center gap-2 ${
              isRecording ? 'bg-coral text-white' : 'bg-yellow text-ink'
            }`}
          >
            {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isRecording ? 'Stop Recording' : 'Start Voice Command'}</span>
          </button>
        </div>

        {/* Voice Configuration Audit */}
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
            <span>VOICE POLICY PARAMETERS</span>
            <span className="text-[10px] font-mono text-mint font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> LOCKED
            </span>
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">PROVIDER:</span>
              <span className="font-bold">ElevenLabs Turbo v2.5</span>
            </div>
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">VOICE ID:</span>
              <span className="font-bold">karen-female-verified</span>
            </div>
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">FALLBACK PERMITTED:</span>
              <span className="font-bold text-coral">FALSE (NEVER MALE)</span>
            </div>
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">LANGUAGES:</span>
              <span className="font-bold">Thanglish, Tamil, English</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default VoicePage;
