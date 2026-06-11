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

const WAKE_WORDS = ['jarvis', 'hey jarvis', 'okay jarvis', 'hey jervis', 'jervis'];
// After a reply, stay open for a follow-up without the wake word for this long.
const CONVERSATION_WINDOW_MS = 9000;

// Marker separating the spoken reply from a trailing JSON array of sources.
// Kept identical to app/api/chat/route.js.
const SOURCE_SENTINEL = '\n␞__SRC__␞';

// Persistent memory: JARVIS remembers the conversation across page reloads.
const STORAGE_KEY = 'jarvis:history:v1';
const MAX_STORED = 40; // cap persisted messages
const MAX_CONTEXT = 24; // cap turns sent to the API

function loadHistory() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-MAX_STORED);
  } catch {
    return null;
  }
}

function saveHistory(messages) {
  if (typeof window === 'undefined') return;
  try {
    const clean = messages
      .filter((m) => m.content && m.content.trim().length)
      .slice(-MAX_STORED);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {}
}

function greetingFor(date = new Date()) {
  const h = date.getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}. Systems online, all faculties nominal. How may I help you, sir?`;
}

export default function Jarvis() {
  const [booted, setBooted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const [heardHint, setHeardHint] = useState('');
  const [error, setError] = useState('');

  // refs that the various async callbacks read (avoids stale closures)
  const recognitionRef = useRef(null); // push-to-talk instance
  const ambientRecRef = useRef(null); // continuous wake-word instance
  const ambientActiveRef = useRef(false); // is the ambient recognizer running
  const ambientOnRef = useRef(false); // is ambient MODE enabled
  const convoOpenRef = useRef(false); // follow-up window open (no wake word needed)
  const convoTimerRef = useRef(null);
  const voiceRef = useRef(null);
  const voiceOutRef = useRef(voiceOut);
  const busyRef = useRef(false);
  const sendRef = useRef(null); // always points at the latest send()
  const transcriptRef = useRef(null);
  const inputRef = useRef(null);

  // live audio analyser shared with the reactor (no re-renders)
  const audioRef = useRef({ level: 0, freq: null });
  const audioCtxRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioRafRef = useRef(null);

  useEffect(() => {
    voiceOutRef.current = voiceOut;
  }, [voiceOut]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // ---- Boot sequence ------------------------------------------------------
  const restoredRef = useRef(false);
  const greetedRef = useRef(false);
  useEffect(() => {
    const saved = loadHistory();
    if (saved && saved.length) {
      restoredRef.current = true;
      greetedRef.current = true; // don't re-speak restored history
      setMessages([
        ...saved,
        { role: 'assistant', content: 'Welcome back, sir. Picking up where we left off.' },
      ]);
    } else {
      setMessages([{ role: 'assistant', content: greetingFor() }]);
    }
    const t = setTimeout(() => setBooted(true), 2600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (booted && voiceOut && !greetedRef.current && messages[0]) {
      greetedRef.current = true;
      speak(messages[0].content);
    } else if (booted && voiceOut && restoredRef.current && messages.length) {
      // Speak the short "welcome back" line once after a restore.
      restoredRef.current = false;
      speak(messages[messages.length - 1].content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted]);

  // Persist conversation whenever it settles (not mid-stream).
  useEffect(() => {
    if (!booted || busy) return;
    if (messages.length) saveHistory(messages);
  }, [messages, busy, booted]);

  // ---- Live audio analyser ------------------------------------------------
  const startAnalyser = useCallback(async () => {
    if (audioCtxRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ac = new Ctx();
      audioCtxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const tdata = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(tdata);
        let sum = 0;
        for (let i = 0; i < tdata.length; i++) {
          const v = (tdata[i] - 128) / 128;
          sum += v * v;
        }
        audioRef.current.level = Math.sqrt(sum / tdata.length);
        audioRef.current.freq = freq;
        audioRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // mic analysis is a bonus — degrade silently to the time-based animation
    }
  }, []);

  const stopAnalyser = useCallback(() => {
    if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
    }
    audioCtxRef.current = null;
    audioStreamRef.current = null;
    audioRef.current = { level: 0, freq: null };
  }, []);

  // ---- Speech synthesis ---------------------------------------------------
  const pickVoice = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const prefer = ['Daniel', 'Google UK English Male', 'Microsoft Ryan', 'Arthur', 'Oliver'];
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
      if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voiceRef.current || pickVoice();
      u.rate = 1.02;
      u.pitch = 0.92;
      u.volume = 1;
      u.onstart = () => setStatus('speaking');
      u.onend = () => {
        setStatus((s) => (s === 'speaking' ? 'idle' : s));
        // In ambient mode, resume listening with a follow-up window open.
        if (ambientOnRef.current) openConversationWindow();
      };
      window.speechSynthesis.speak(u);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickVoice]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  // ---- Conversation window (ambient follow-up) ----------------------------
  const openConversationWindow = useCallback(() => {
    convoOpenRef.current = true;
    if (convoTimerRef.current) clearTimeout(convoTimerRef.current);
    convoTimerRef.current = setTimeout(() => {
      convoOpenRef.current = false;
      setHeardHint('');
    }, CONVERSATION_WINDOW_MS);
    setHeardHint('Listening…');
    startAmbientRec();
  }, []);

  // ---- Push-to-talk recognition ------------------------------------------
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
      if (sendRef.current) sendRef.current(text);
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
    startAnalyser();
    try {
      rec.start();
      setListening(true);
      setStatus('listening');
    } catch {}
  }, [listening, stopSpeaking, startAnalyser]);

  // ---- Ambient wake-word recognition --------------------------------------
  const startAmbientRec = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (ambientActiveRef.current) return; // already running
    // Don't listen while JARVIS is speaking (avoid hearing himself).
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) return;

    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let finalText = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) setHeardHint(interim.trim().slice(0, 60));
      if (!finalText) return;

      const lower = finalText.toLowerCase().trim();
      let command = null;

      // Find the latest wake word and take everything after it.
      let cut = -1;
      let cutWord = '';
      for (const w of WAKE_WORDS) {
        const idx = lower.lastIndexOf(w);
        if (idx > cut) {
          cut = idx;
          cutWord = w;
        }
      }
      if (cut >= 0) {
        command = finalText.slice(cut + cutWord.length).replace(/^[\s,.:!?-]+/, '').trim();
      } else if (convoOpenRef.current) {
        // Inside a follow-up window — no wake word required.
        command = finalText.trim();
      }

      if (command == null) return; // no wake word, no open window → ignore ambient chatter

      if (command.length < 2) {
        // Just the wake word — acknowledge and open the floor.
        openConversationWindow();
        setHeardHint('Yes, sir?');
        return;
      }

      // We have a command. Stop the recognizer and act on it.
      stopAmbientRec();
      setHeardHint('');
      if (sendRef.current) sendRef.current(command);
    };

    rec.onerror = () => {
      ambientActiveRef.current = false;
    };
    rec.onend = () => {
      ambientActiveRef.current = false;
      // Auto-restart if ambient mode is still on and we're not busy/speaking.
      if (
        ambientOnRef.current &&
        !busyRef.current &&
        !(typeof window !== 'undefined' && window.speechSynthesis?.speaking)
      ) {
        setTimeout(() => startAmbientRec(), 300);
      }
    };

    try {
      rec.start();
      ambientRecRef.current = rec;
      ambientActiveRef.current = true;
      if (!convoOpenRef.current) setHeardHint('Say “Hey JARVIS”…');
    } catch {
      ambientActiveRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAmbientRec = useCallback(() => {
    const rec = ambientRecRef.current;
    ambientActiveRef.current = false;
    if (rec) {
      try {
        rec.stop();
      } catch {}
    }
  }, []);

  const toggleAmbient = useCallback(() => {
    if (ambient) {
      ambientOnRef.current = false;
      convoOpenRef.current = false;
      if (convoTimerRef.current) clearTimeout(convoTimerRef.current);
      stopAmbientRec();
      stopAnalyser();
      setAmbient(false);
      setHeardHint('');
      setStatus('idle');
    } else {
      ambientOnRef.current = true;
      setAmbient(true);
      setVoiceOut(true); // ambient mode wants spoken replies
      stopSpeaking();
      startAnalyser();
      startAmbientRec();
    }
  }, [ambient, stopAmbientRec, stopAnalyser, startAnalyser, startAmbientRec, stopSpeaking]);

  // ---- Auto-scroll transcript --------------------------------------------
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // ---- Send + stream ------------------------------------------------------
  const send = useCallback(
    async (raw) => {
      const text = (raw ?? '').trim();
      if (!text || busyRef.current) return;
      setError('');
      setInput('');
      stopSpeaking();
      stopAmbientRec(); // don't transcribe ourselves mid-turn

      const history = [...messages, { role: 'user', content: text }];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setBusy(true);
      setStatus('thinking');

      const context = {
        time: new Date().toString(),
        tz:
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
      };

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-MAX_CONTEXT), context }),
        });
        if (!res.ok || !res.body) throw new Error('Request failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const cut = acc.indexOf(SOURCE_SENTINEL);
          const visible = cut >= 0 ? acc.slice(0, cut) : acc;
          setMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: 'assistant', content: visible };
            return next;
          });
        }

        // Split the spoken reply from any trailing source list.
        let spokenText = acc;
        let sources = [];
        const cut = acc.indexOf(SOURCE_SENTINEL);
        if (cut >= 0) {
          spokenText = acc.slice(0, cut);
          try {
            sources = JSON.parse(acc.slice(cut + SOURCE_SENTINEL.length));
          } catch {
            sources = [];
          }
        }
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = {
            role: 'assistant',
            content: spokenText,
            ...(sources.length ? { sources } : {}),
          };
          return next;
        });

        if (voiceOutRef.current && spokenText) {
          speak(spokenText); // onend resumes ambient listening
        } else {
          setStatus('idle');
          if (ambientOnRef.current) openConversationWindow();
        }
      } catch {
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
        if (ambientOnRef.current) openConversationWindow();
      } finally {
        setBusy(false);
      }
    },
    [messages, speak, stopSpeaking, stopAmbientRec, openConversationWindow]
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      ambientOnRef.current = false;
      stopAmbientRec();
      stopAnalyser();
      if (convoTimerRef.current) clearTimeout(convoTimerRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopAmbientRec, stopAnalyser]);

  const onSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  const clearMemory = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    stopSpeaking();
    restoredRef.current = false;
    const greeting = greetingFor();
    setMessages([{ role: 'assistant', content: greeting }]);
    if (voiceOutRef.current) speak(greeting);
  }, [stopSpeaking, speak]);

  // ---- Render -------------------------------------------------------------
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <Starfield />
      <div className="scanline" />
      <div className="holo-band" />
      <div className="holo-flicker" />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(4,8,13,0) 40%, rgba(2,5,9,0.85) 100%)',
        }}
      />

      {!booted && <BootSequence />}

      <div className={`relative z-10 flex h-full flex-col ${booted ? 'flicker-in' : 'opacity-0'}`}>
        {/* Top status bar */}
        <header className="flex items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="glitch hud-mono text-lg font-bold tracking-[0.35em] text-glow text-[var(--cyan)] sm:text-2xl">
              J.A.R.V.I.S.
            </span>
            <span className="hidden text-xs uppercase tracking-widest text-cyan-200/50 sm:inline">
              Mark IV
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs sm:gap-4">
            <StatusPill status={status} />
            {micSupported && (
              <button
                onClick={toggleAmbient}
                className={`hud-mono rounded border px-2 py-1 tracking-widest transition ${
                  ambient
                    ? 'border-green-300/70 bg-green-400/10 text-green-200'
                    : 'border-cyan-300/30 text-cyan-200/80 hover:border-cyan-300/70 hover:text-cyan-100'
                }`}
                title='Hands-free "Hey JARVIS" mode'
              >
                {ambient ? 'AMBIENT ●' : 'AMBIENT'}
              </button>
            )}
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
            <button
              onClick={clearMemory}
              className="hud-mono hidden rounded border border-cyan-300/30 px-2 py-1 tracking-widest text-cyan-200/60 transition hover:border-amber-300/60 hover:text-amber-200 sm:block"
              title="Forget this conversation and start fresh"
            >
              RESET
            </button>
          </div>
        </header>

        {/* Body: reactor + transcript */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 sm:flex-row sm:px-8 sm:pb-6">
          {/* Reactor */}
          <section className="relative flex items-center justify-center sm:w-1/2">
            <div className="aspect-square w-[min(46vh,92vw)] max-w-[520px]">
              <ReactorCore status={status} audioRef={audioRef} />
            </div>
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
              {ambient && heardHint ? (
                <p className="hud-mono text-[11px] tracking-[0.3em] text-green-300/80 text-glow">
                  {heardHint}
                </p>
              ) : (
                <p className="hud-mono text-[10px] tracking-[0.4em] text-cyan-200/40">
                  ARC REACTOR · STABLE
                </p>
              )}
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
                  <Bubble key={i} role={m.role} content={m.content} sources={m.sources} />
                ))}
                {busy && messages[messages.length - 1]?.content === '' && <Thinking />}
              </div>

              {error && <p className="mt-2 text-xs text-amber-300/80">{error}</p>}

              <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
                {micSupported && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={ambient}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-30 ${
                      listening
                        ? 'border-green-300 bg-green-400/20 text-green-200'
                        : 'border-cyan-300/40 text-cyan-200/80 hover:border-cyan-300/80 hover:text-cyan-100'
                    }`}
                    title={ambient ? 'Disabled in ambient mode' : 'Push to talk'}
                    aria-label="Push to talk"
                  >
                    <MicIcon active={listening} />
                  </button>
                )}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={ambient ? 'Ambient mode — just speak…' : 'Speak or type your request…'}
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
              POWERED BY CLAUDE · MEMORY PERSISTENT ·{' '}
              {ambient
                ? 'HANDS-FREE — SAY “HEY JARVIS”'
                : micSupported
                ? 'VOICE INTERFACE ACTIVE'
                : 'TEXT INTERFACE'}
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
    <span className={`hud-mono flex items-center gap-2 rounded-full border px-3 py-1 tracking-[0.25em] ${color}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${status !== 'idle' ? 'blink' : ''}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Bubble({ role, content, sources }) {
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
          <span className="hud-mono mb-1 block text-[9px] tracking-[0.3em] text-cyan-300/50">JARVIS</span>
        )}
        <span className="whitespace-pre-wrap">{content || ' '}</span>
        {Array.isArray(sources) && sources.length > 0 && (
          <div className="mt-2.5 border-t border-cyan-300/15 pt-2">
            <span className="hud-mono mb-1.5 block text-[8px] tracking-[0.3em] text-cyan-300/40">
              SOURCES
            </span>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="src-chip"
                  title={s.url}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                  <span className="truncate" style={{ maxWidth: '180px' }}>
                    {hostOf(s.url)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg border border-cyan-300/25 bg-black/30 px-4 py-3">
        <span className="hud-mono mb-1 block text-[9px] tracking-[0.3em] text-cyan-300/50">JARVIS</span>
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
            style={{ animation: `rise-in 0.4s ease-out both`, animationDelay: `${i * 0.45}s` }}
          >
            <span className="text-cyan-300/40">›</span> {l}
          </p>
        ))}
      </div>
    </div>
  );
}
