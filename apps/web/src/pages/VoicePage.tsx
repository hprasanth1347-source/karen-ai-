import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, ShieldAlert, CheckCircle2, Square, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface VoiceStatus {
  ready: boolean;
  femaleOnly: boolean;
  language: string;
}

export const VoicePage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [voiceReady, setVoiceReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    api
      .get('/voice/status')
      .then((res) => {
        const s: VoiceStatus | undefined = res.data?.data;
        setVoiceReady(Boolean(s?.ready));
      })
      .catch(() => {});
  }, []);

  const speakFemale = async (text: string) => {
    if (!voiceReady) {
      setStatusMessage('ElevenLabs female voice is not configured yet (VOICE_API_KEY missing). Staying in text mode per female-only voice policy.');
      return;
    }
    try {
      const res = await api.post('/voice/synthesize', { text }, { responseType: 'blob' });
      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch {
      setStatusMessage('Female voice synthesis unavailable; staying in text mode.');
    }
  };

  const runVoicePrompt = async (spoken: string) => {
    if (!spoken.trim()) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await api.post('/ai/chat', {
        message: spoken.trim(),
        currentPage: window.location.pathname,
      });
      const reply = res.data?.data?.reply || '';
      setReplyText(reply);
      if (reply) await speakFemale(reply);
    } catch (err: any) {
      setStatusMessage(err?.response?.data?.error || 'Could not process voice command.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusMessage('Browser Speech Recognition is not supported here. Try Chrome/Edge or type below.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript || '';
      setTranscript(spoken);
      setIsRecording(false);
      void runVoicePrompt(spoken);
    };
    recognition.onerror = (event: any) => {
      setIsRecording(false);
      setStatusMessage(`Microphone error: ${event.error}`);
    };
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    setStatusMessage(null);
    setIsRecording(true);
    recognition.start();
  };

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
            Speak commands in English/Thanglish. Karen executes tasks, checks Drive/Gmail, and replies with ElevenLabs verified female voice (no male fallback).
          </p>
        </div>
      </div>

      <div className="bg-coral/10 border-3 border-ink p-4 shadow-brutal flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-coral shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-extrabold text-coral uppercase block">Mandatory Voice Policy Lock:</span>
          <p className="text-ink/80 text-[11px] leading-relaxed">
            Karen AI only speaks with an owner-approved ElevenLabs female voice ID. If ElevenLabs is unconfigured, Karen stays in text mode rather than using a generic browser fallback.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 border-2 border-ink bg-yellow/25 text-xs font-bold">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-6 shadow-brutal flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full border-4 border-ink flex items-center justify-center bg-cream-100 shadow-brutal">
            {isProcessing ? (
              <Loader2 className="w-10 h-10 text-coral animate-spin" />
            ) : (
              <Mic className={`w-10 h-10 ${isRecording ? 'text-coral animate-pulse' : 'text-ink'}`} />
            )}
          </div>

          <div>
            <h3 className="font-black text-base">PUSH TO TALK</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Click to speak a command to Karen AI.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleRecording}
            disabled={isProcessing}
            className={`btn-brutal px-6 py-2.5 text-xs font-black flex items-center gap-2 ${
              isRecording ? 'bg-coral text-white' : 'bg-yellow text-ink'
            }`}
          >
            {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isRecording ? 'Stop Listening' : isProcessing ? 'Thinking...' : 'Start Voice Command'}</span>
          </button>

          {transcript && (
            <div className="w-full text-left p-3 border-2 border-ink bg-cream-50 text-xs">
              <div className="font-mono text-[10px] text-ink-muted">YOU SAID:</div>
              <div className="font-bold mt-0.5">{transcript}</div>
            </div>
          )}

          {replyText && (
            <div className="w-full text-left p-3 border-2 border-ink bg-white text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-coral font-bold">KAREN REPLY:</span>
                <button
                  type="button"
                  onClick={() => speakFemale(replyText)}
                  className="px-2 py-0.5 border border-ink bg-cream-100 text-[10px] font-mono font-bold flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  Speak
                </button>
              </div>
              <p className="whitespace-pre-wrap">{replyText}</p>
            </div>
          )}
        </div>

        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
            <span>VOICE POLICY PARAMETERS</span>
            <span className="text-[10px] font-mono text-mint font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {voiceReady ? 'ELEVENLABS READY' : 'TEXT MODE (LOCKED)'}
            </span>
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">PROVIDER:</span>
              <span className="font-bold">ElevenLabs Turbo v2.5</span>
            </div>
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">VOICE STATUS:</span>
              <span className="font-bold">{voiceReady ? 'Configured & Verified' : 'Set VOICE_API_KEY in Vercel'}</span>
            </div>
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">FALLBACK PERMITTED:</span>
              <span className="font-bold text-coral">FALSE (NEVER MALE)</span>
            </div>
            <div className="p-2 border border-ink bg-cream-50 flex justify-between">
              <span className="text-ink-muted">LANGUAGES:</span>
              <span className="font-bold">English, Thanglish, Tamil</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default VoicePage;
