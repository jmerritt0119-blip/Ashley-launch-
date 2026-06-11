'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Starfield from './Starfield';
import ReactorCore from './ReactorCore';

const STATUS_LABEL = {
  idle: 'ONLINE',
  listening: 'LISTENING',
  thinking: 'PROCESSING',
  speaking: 'SPEAKING',
};

const GREETING =
  'Systems online. All faculties nominal. How may I help you today, sir?';

export default function Jarvis() {
  const [booted, setBooted] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');

  const recognitionRef = useRef(null);
  const voiceRef = useRef(null);
  const transcriptRef = useRef(null);
  const inputRef = useRef(null);

  // ---- Boot sequence ------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 2600);
    return () => clearTimeout(t);
  }, []);

  // Speak the greeting once, after boot, if voice is on.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (booted && voiceOut && !greetedRef.current) {
      greetedRef.current = true;
      speak(GREETING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted]);

  // ---- Speech synthesis ---------------------------------------------------
  const pickVoice = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const prefer = [
      'Daniel',
      'Google UK English Male',
      'Microsoft Ryan',
      'Arthur',
      'Oliver',
    ];
    for (const name of prefer) {
      const v = voices.find((vo) => vo.name.includes(name));
      if (v) return v;
    }
    const enGB = voices.find((v) => v.lang === 'en-GB');
    return enGB || voices.find((v) => v.lang.startsWith('en')) || voices[0];
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      voiceRef.current = pickVoice();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [pickVoice]);

  const speak = useCallback(
    (text) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      if (!text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voiceRef.current || pickVoice();
      u.rate = 1.02;
      u.pitch = 0.92;
      u.volume = 1;
      u.onstart = () => setStatus('speaking');
      u.onend = () => setStatus((s) => (s === 'speaking' ? 'idle' : s));
      window.speechSynthesis.speak(u);
    },
    [pickVoice]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  // ---- Speech recognition -------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setMicSupported(true);
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      setStatus('idle');
      send(text);
    };
    rec.onerror = () => {
      setListening(false);
      setStatus('idle');
    };
    rec.onend = () => {
      setListening(false);
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      try {
        rec.stop();
      } catch {}
      setListening(false);
      setStatus('idle');
      return;
    }
    stopSpeaking();
    try {
      rec.start();
      setListening(true);
      setStatus('listening');
    } catch {}
  }, [listening, stopSpeaking]);

  // ---- Auto-scroll transcript --------------------------------------------
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // ---- Send + stream ------------------------------------------------------
  const send = useCallback(
    async (raw) => {
      const text = (raw ?? '').trim();
      if (!text || busy) return;
      setError('');
      setInput('');
      stopSpeaking();

      const history = [...messages, { role: 'user', content: text }];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setBusy(true);
      setStatus('thinking');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Request failed');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';

        // read the stream, updating the last (assistant) message live
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: 'assistant', content: acc };
            return next;
          });
        }

        if (voiceOut && acc) speak(acc);
        else setStatus('idle');
      } catch (err) {
        setError('Connection to core severed. Please try again.');
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = {
            role: 'assistant',
            content:
              'I was unable to reach my core just then. Do check the connection and try once more.',
          };
          return next;
        });
        setStatus('idle');
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, voiceOut, speak, stopSpeaking]
  );

  const onSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  // ---- Render -------------------------------------------------------------
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <Starfield />
      <div className="scanline" />

      {/* radial vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(4,8,13,0) 40%, rgba(2,5,9,0.85) 100%)',
        }}
      />

      {/* Boot overlay */}
      {!booted && <BootSequence />}

      <div
        className={`relative z-10 flex h-full flex-col ${
          booted ? 'flicker-in' : 'opacity-0'
        }`}
      >
        {/* Top status bar */}
        <header className="flex items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="hud-mono text-lg font-bold tracking-[0.35em] text-glow text-[var(--cyan)] sm:text-2xl">
              J.A.R.V.I.S.
            </span>
            <span className="hidden text-xs uppercase tracking-widest text-cyan-200/50 sm:inline">
              Mark III
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <StatusPill status={status} />
            <button
              onClick={() => {
                if (voiceOut) stopSpeaking();
                setVoiceOut((v) => !v);
              }}
              className="hud-mono rounded border border-cyan-300/30 px-2 py-1 tracking-widest text-cyan-200/80 transition hover:border-cyan-300/70 hover:text-cyan-100"
              title="Toggle voice output"
            >
              VOICE {voiceOut ? 'ON' : 'OFF'}
            </button>
          </div>
        </header>

        {/* Body: reactor + transcript */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 sm:flex-row sm:px-8 sm:pb-6">
          {/* Reactor */}
          <section className="relative flex items-center justify-center sm:w-1/2">
            <div className="aspect-square w-[min(46vh,92vw)] max-w-[520px]">
              <ReactorCore status={status} />
            </div>
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
              <p className="hud-mono text-[10px] tracking-[0.4em] text-cyan-200/40">
                ARC REACTOR · STABLE
              </p>
            </div>
          </section>

          {/* Transcript + input */}
          <section className="relative flex min-h-0 flex-1 flex-col sm:w-1/2">
            <div className="relative flex min-h-0 flex-1 flex-col panel rounded-lg p-3 sm:p-4">
              <span className="bracket tl" />
              <span className="bracket tr" />
              <span className="bracket bl" />
              <span className="bracket br" />

              <div
                ref={transcriptRef}
                className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-2"
              >
                {messages.map((m, i) => (
                  <Bubble key={i} role={m.role} content={m.content} />
                ))}
                {busy &&
                  messages[messages.length - 1]?.content === '' && <Thinking />}
              </div>

              {error && (
                <p className="mt-2 text-xs text-amber-300/80">{error}</p>
              )}

              {/* Input */}
              <form
                onSubmit={onSubmit}
                className="mt-3 flex items-center gap-2"
              >
                {micSupported && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                      listening
                        ? 'border-green-300 bg-green-400/20 text-green-200'
                        : 'border-cyan-300/40 text-cyan-200/80 hover:border-cyan-300/80 hover:text-cyan-100'
                    }`}
                    title={listening ? 'Stop listening' : 'Speak to JARVIS'}
                    aria-label="Toggle microphone"
                  >
                    <MicIcon active={listening} />
                  </button>
                )}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Speak or type your request…"
                  className="h-11 min-w-0 flex-1 rounded-md border border-cyan-300/25 bg-black/30 px-4 text-cyan-50 placeholder:text-cyan-200/30 outline-none transition focus:border-cyan-300/70"
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="hud-mono h-11 shrink-0 rounded-md border border-cyan-300/40 px-4 text-sm tracking-widest text-cyan-100 transition enabled:hover:border-cyan-300 enabled:hover:bg-cyan-400/10 disabled:opacity-30"
                >
                  SEND
                </button>
              </form>
            </div>

            <p className="mt-2 text-center text-[10px] tracking-widest text-cyan-200/30 sm:text-left">
              POWERED BY CLAUDE · {micSupported ? 'VOICE INTERFACE ACTIVE' : 'TEXT INTERFACE'}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

/* ---- Sub-components -------------------------------------------------------- */

function StatusPill({ status }) {
  const color =
    status === 'thinking'
      ? 'text-amber-300 border-amber-300/50'
      : status === 'listening'
      ? 'text-green-300 border-green-300/50'
      : status === 'speaking'
      ? 'text-cyan-200 border-cyan-300/60'
      : 'text-cyan-300/80 border-cyan-300/40';
  return (
    <span
      className={`hud-mono flex items-center gap-2 rounded-full border px-3 py-1 tracking-[0.25em] ${color}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${
          status !== 'idle' ? 'blink' : ''
        }`}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Bubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`rise-in flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-lg px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? 'border border-cyan-300/20 bg-cyan-400/5 text-cyan-50'
            : 'border border-cyan-300/25 bg-black/30 text-cyan-100'
        }`}
      >
        {!isUser && (
          <span className="hud-mono mb-1 block text-[9px] tracking-[0.3em] text-cyan-300/50">
            JARVIS
          </span>
        )}
        <span className="whitespace-pre-wrap">{content || ' '}</span>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg border border-cyan-300/25 bg-black/30 px-4 py-3">
        <span className="hud-mono mb-1 block text-[9px] tracking-[0.3em] text-cyan-300/50">
          JARVIS
        </span>
        <span className="flex items-center gap-1">
          <span className="dot h-2 w-2 rounded-full bg-cyan-300" />
          <span className="dot h-2 w-2 rounded-full bg-cyan-300" />
          <span className="dot h-2 w-2 rounded-full bg-cyan-300" />
        </span>
      </div>
    </div>
  );
}

function MicIcon({ active }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? 'blink' : ''}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}

function BootSequence() {
  const lines = [
    'INITIALIZING CORE…',
    'CALIBRATING ARC REACTOR…',
    'LOADING NEURAL INTERFACE…',
    'AUTHENTICATING…',
    'ALL SYSTEMS NOMINAL',
  ];
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--bg)]">
      <div className="hud-mono text-2xl font-bold tracking-[0.4em] text-glow text-[var(--cyan)] sm:text-4xl">
        J.A.R.V.I.S.
      </div>
      <div className="mt-8 w-[280px] space-y-1.5 text-left">
        {lines.map((l, i) => (
          <p
            key={i}
            className="hud-mono text-[10px] tracking-[0.25em] text-cyan-300/70"
            style={{
              animation: `rise-in 0.4s ease-out both`,
              animationDelay: `${i * 0.45}s`,
            }}
          >
            <span className="text-cyan-300/40">›</span> {l}
          </p>
        ))}
      </div>
    </div>
  );
}
