'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Starfield from './Starfield';
import Reactor from './Reactor';
import SystemHud from './SystemHud';

const STATUS_LABEL = {
  idle: 'ONLINE',
  listening: 'LISTENING',
  thinking: 'PROCESSING',
  speaking: 'SPEAKING',
};

const WAKE_WORDS = ['jarvis', 'hey jarvis', 'okay jarvis', 'hey jervis', 'jervis'];
// After a reply, stay open for a follow-up without the wake word for this long.
const CONVERSATION_WINDOW_MS = 9000;

// Pure voice experience: no transcript, no text field. Open → tap once → talk.
// The reactor's colour conveys state (green listening, amber thinking, blue
// speaking). Set to false to restore the full chat interface.
const VOICE_ONLY = true;

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

// Map a detected language to a full BCP-47 tag for the speech engine.
const LANG_TAG = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  ru: 'ru-RU',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  ar: 'ar-SA',
  el: 'el-GR',
  hi: 'hi-IN',
  he: 'he-IL',
};

// Lightweight language detection so we can pick a matching TTS voice. Script
// ranges first (unambiguous), then stop-word checks for Latin-script tongues.
function detectLang(text) {
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[Ͱ-Ͽ]/.test(text)) return 'el';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[א-ת]/.test(text)) return 'he';
  const t = ' ' + text.toLowerCase() + ' ';
  const has = (words) => words.some((w) => t.includes(' ' + w + ' '));
  if (has(['el', 'la', 'los', 'que', 'de', 'para', 'está', 'gracias', 'hola', 'cómo', 'sí'])) return 'es';
  if (has(['le', 'les', 'des', 'une', 'est', 'vous', 'bonjour', 'merci', 'oui', 'je'])) return 'fr';
  if (has(['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'danke', 'hallo', 'sie'])) return 'de';
  if (has(['il', 'lo', 'che', 'sono', 'grazie', 'ciao', 'per', 'con', 'sì'])) return 'it';
  if (has(['os', 'uma', 'não', 'obrigado', 'olá', 'você', 'com', 'sim'])) return 'pt';
  return 'en';
}

function browserLang() {
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || (navigator.languages && navigator.languages[0]) || 'en-US';
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
  const [needsTap, setNeedsTap] = useState(true);
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

  // live audio analyser shared with the reactor (no re-renders).
  // `boundary` ticks up on each spoken-word boundary so the reactor can pulse
  // in time with JARVIS's actual speech.
  const audioRef = useRef({ level: 0, freq: null, boundary: 0 });
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
  const firstSpeechRef = useRef(''); // what JARVIS says on the first wake
  useEffect(() => {
    const saved = loadHistory();
    if (saved && saved.length) {
      restoredRef.current = true;
      const wb = 'Welcome back, sir. Picking up where we left off.';
      setMessages([...saved, { role: 'assistant', content: wb }]);
      firstSpeechRef.current = wb;
    } else {
      const g = greetingFor();
      setMessages([{ role: 'assistant', content: g }]);
      firstSpeechRef.current = g;
    }
    const t = setTimeout(() => setBooted(true), 2600);
    return () => clearTimeout(t);
  }, []);

  // Browsers block speech synthesis until the user interacts with the page
  // (especially on mobile). On the first tap/keypress we "wake" JARVIS: unlock
  // the audio engine and speak his greeting.
  useEffect(() => {
    const unlock = () => {
      try {
        const ss = window.speechSynthesis;
        if (ss) {
          ss.resume();
          const primer = new SpeechSynthesisUtterance(' ');
          primer.volume = 0;
          ss.speak(primer);
        }
      } catch {}
      setNeedsTap(false);

      // Voice-only: go hands-free the moment he's woken.
      const SR =
        typeof window !== 'undefined' &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (VOICE_ONLY && SR) {
        ambientOnRef.current = true;
        setAmbient(true);
        convoOpenRef.current = true;
        startAnalyser();
      }

      const willGreet = !greetedRef.current && voiceOutRef.current && firstSpeechRef.current;
      if (!greetedRef.current) {
        greetedRef.current = true;
        if (willGreet) speak(firstSpeechRef.current);
      }
      // Start listening now if there's no greeting to wait on; otherwise the
      // greeting's end re-opens the mic (playNext -> openConversationWindow).
      if (VOICE_ONLY && SR && !willGreet) {
        startAmbientRec();
      }

      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    // `speak` and the ambient helpers are declared later in this component, so
    // they must NOT appear in the dep array (that would access them during
    // render -> temporal-dead-zone crash). The handler closes over them and
    // only runs on a user gesture, by which point they're initialized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    audioRef.current = { level: 0, freq: null, boundary: audioRef.current.boundary || 0 };
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

  // Pick a voice whose language matches the reply; fall back to the default.
  const voiceForLang = useCallback(
    (lang) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return null;
      if (lang === 'en') return voiceRef.current || pickVoice();
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(lang));
      return match || voiceRef.current || pickVoice();
    },
    [pickVoice]
  );

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

  // A speech QUEUE so JARVIS can start talking sentence-by-sentence while the
  // rest of the reply is still streaming in.
  const speechQueueRef = useRef([]);
  const speakingActiveRef = useRef(false);

  const playNext = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const q = speechQueueRef.current;
    if (!q.length) {
      speakingActiveRef.current = false;
      setStatus((s) => (s === 'speaking' ? 'idle' : s));
      // In ambient mode, reopen the floor once he's finished talking.
      if (ambientOnRef.current) openConversationWindow();
      return;
    }
    const text = q.shift();
    const u = new SpeechSynthesisUtterance(text);
    // Speak in the reply's own language with a matching voice.
    const lang = detectLang(text);
    u.lang = LANG_TAG[lang] || 'en-GB';
    u.voice = voiceForLang(lang);
    u.rate = 1.02;
    u.pitch = 0.92;
    u.volume = 1;
    u.onstart = () => setStatus('speaking');
    // Pulse the reactor on every spoken word boundary.
    u.onboundary = () => {
      if (audioRef.current) {
        audioRef.current.boundary = (audioRef.current.boundary || 0) + 1;
      }
    };
    u.onend = () => playNext();
    u.onerror = () => playNext();
    window.speechSynthesis.speak(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickVoice, voiceForLang]);

  const enqueueSpeech = useCallback(
    (text) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const clean = (text || '').trim();
      if (!clean) return;
      speechQueueRef.current.push(clean);
      if (!speakingActiveRef.current) {
        speakingActiveRef.current = true;
        playNext();
      }
    },
    [playNext]
  );

  // speak() = say a whole block as one utterance (greeting, welcome-back, reset)
  const speak = enqueueSpeech;

  const stopSpeaking = useCallback(() => {
    speechQueueRef.current = [];
    speakingActiveRef.current = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  // ---- Conversation window (ambient follow-up) ----------------------------
  const openConversationWindow = useCallback(() => {
    convoOpenRef.current = true;
    if (convoTimerRef.current) clearTimeout(convoTimerRef.current);
    // In voice-only mode we listen continuously — the window never expires.
    if (!VOICE_ONLY) {
      convoTimerRef.current = setTimeout(() => {
        convoOpenRef.current = false;
        setHeardHint('');
      }, CONVERSATION_WINDOW_MS);
    }
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
    rec.lang = browserLang();
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
    rec.lang = browserLang();
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
      } else if (convoOpenRef.current || VOICE_ONLY) {
        // Follow-up window (or voice-only mode) — no wake word required.
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
        let spokenLen = 0; // how much of the reply we've already queued to speak
        let enqueuedAny = false;

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

          // Speak each COMPLETE sentence the moment it's fully streamed.
          if (voiceOutRef.current && visible.length > spokenLen) {
            const re = /[.!?…](\s|$)/g;
            re.lastIndex = spokenLen;
            let m;
            let lastEnd = spokenLen;
            while ((m = re.exec(visible)) !== null) lastEnd = m.index + 1;
            if (lastEnd > spokenLen) {
              const chunk = visible.slice(spokenLen, lastEnd).trim();
              if (chunk) {
                enqueueSpeech(chunk);
                enqueuedAny = true;
              }
              spokenLen = lastEnd;
            }
          }
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

        // Speak whatever's left after the last sentence boundary.
        if (voiceOutRef.current) {
          const remainder = spokenText.slice(spokenLen).trim();
          if (remainder) {
            enqueueSpeech(remainder);
            enqueuedAny = true;
          }
        }
        // If nothing was queued to speak, settle now (the queue drain handles
        // ambient resume when speech IS playing).
        if (!(voiceOutRef.current && enqueuedAny)) {
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
    [messages, enqueueSpeech, stopSpeaking, stopAmbientRec, openConversationWindow]
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
            {!VOICE_ONLY && (
              <span className="hidden text-xs uppercase tracking-widest text-cyan-200/50 sm:inline">
                Mark VI
              </span>
            )}
          </div>
          {!VOICE_ONLY && (
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
          )}
        </header>

        {/* Body */}
        {VOICE_ONLY ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-10">
            <div className="relative flex flex-col items-center">
              <div className="aspect-square w-[min(74vh,94vw)] max-w-[680px]">
                <Reactor status={status} audioRef={audioRef} />
              </div>
              <div className="mt-1 h-6 text-center">
                {needsTap ? (
                  <p className="hud-mono blink text-xs tracking-[0.35em] text-cyan-200/90 text-glow">
                    ▸ TAP TO WAKE JARVIS
                  </p>
                ) : !micSupported ? (
                  <p className="hud-mono text-[11px] tracking-[0.2em] text-amber-300/80">
                    VOICE CONTROL NEEDS CHROME OR EDGE
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 sm:flex-row sm:px-8 sm:pb-6">
          {/* Reactor */}
          <section className="relative flex items-center justify-center sm:w-1/2">
            <SystemHud />
            <div className="aspect-square w-[min(46vh,92vw)] max-w-[520px]">
              <Reactor status={status} audioRef={audioRef} />
            </div>
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
              {needsTap ? (
                <p className="hud-mono blink text-[11px] tracking-[0.3em] text-cyan-200/90 text-glow">
                  ▸ TAP TO WAKE JARVIS
                </p>
              ) : ambient && heardHint ? (
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
        )}
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
