# J.A.R.V.I.S.

> Just A Rather Very Intelligent System — your own personal AI, in the spirit of
> Tony Stark's companion. Powered by Claude.

A standalone, visually rich AI assistant: a live animated arc-reactor core, a
holographic heads-up display, voice in and out, and streaming responses from
Claude.

![status](https://img.shields.io/badge/build-Mark%20III-7df9ff)

## What it does

- **"Hey JARVIS" — hands-free.** Flip on **AMBIENT** mode and just talk. JARVIS
  listens for the wake word across the room, answers out loud, then keeps the
  floor open so you can follow up without repeating yourself — a real
  back-and-forth conversation, no buttons.
- **Push-to-talk or type.** Prefer control? Tap the mic for one-shot voice, or
  use the full text chat with live, streaming responses.
- **A genuinely live arc reactor.** The Web Audio API taps your microphone, so
  the core and a halo of frequency bars physically pulse to your real voice in
  real time. It also shifts colour by state — green listening, amber thinking,
  blue speaking.
- **Real-world knowledge.** Live web search (Claude's server-side tool) lets
  JARVIS answer current questions — news, prices, weather, recent events. He
  also knows your local time and greets you by time of day.
- **The JARVIS persona.** Composed, witty, proactive — defined in
  `lib/persona.js`, easy to retune.

Your Anthropic API key stays on the server — the browser never sees it.

## Getting started

You need [Node.js](https://nodejs.org) 18+ and an Anthropic API key from
[console.anthropic.com](https://console.anthropic.com/).

```bash
cd jarvis
npm install

# add your key
cp .env.example .env.local
#   then edit .env.local and paste your ANTHROPIC_API_KEY

npm run dev
```

Open <http://localhost:3000> and say hello.

## Configuration

All optional, set in `.env.local`:

| Variable             | Default            | Purpose                                    |
| -------------------- | ------------------ | ------------------------------------------ |
| `ANTHROPIC_API_KEY`  | —                  | **Required.** Your Anthropic API key.      |
| `JARVIS_MODEL`       | `claude-opus-4-8`  | Which Claude model powers JARVIS.          |
| `JARVIS_ADDRESS`     | `sir`              | What JARVIS calls you ("sir", your name…). |
| `JARVIS_WEB_SEARCH`  | `1` (on)           | Set to `0` to disable live web search.     |

> If your account doesn't have web search enabled, JARVIS automatically falls
> back to a normal answer — nothing breaks.

## Voice support

Voice uses the browser's built-in Web Speech API plus the Web Audio API.

- **Speech recognition** (mic input + the "Hey JARVIS" wake word) works in
  Chrome and Edge. Other browsers fall back to text only — everything else
  still works.
- **Speech synthesis** (spoken replies) works in all modern browsers. JARVIS
  prefers a British male voice if one is installed.
- **Live reactor** uses microphone audio analysis; if the browser denies mic
  access it simply falls back to the time-based animation.

Toggle spoken replies with **VOICE** and hands-free listening with **AMBIENT**,
top right. The first time you enable either, your browser will ask for
microphone permission.

### Wake words

JARVIS responds to "JARVIS", "Hey JARVIS", or "Okay JARVIS". After he replies,
he stays open for a follow-up for about nine seconds — so you can just keep
talking. Edit the list in `components/Jarvis.jsx` (`WAKE_WORDS`).

## How it's built

- **Next.js 14** (App Router) + **React** + **Tailwind CSS**
- **`@anthropic-ai/sdk`** streaming from a server route (`app/api/chat/route.js`),
  with Claude's server-side **web search** tool for live knowledge
- Canvas-rendered arc reactor and starfield — no animation libraries
- **Web Speech API** for voice in/out and the wake word
- **Web Audio API** (`AnalyserNode`) for real-time, audio-reactive visuals

## Project layout

```
jarvis/
├── app/
│   ├── api/chat/route.js   # streams Claude responses (server-side, holds the key)
│   ├── layout.jsx          # fonts + metadata
│   ├── page.jsx
│   └── globals.css         # HUD styling + animations
├── components/
│   ├── Jarvis.jsx          # the whole interface: chat, voice, state
│   ├── ReactorCore.jsx     # the animated arc reactor (canvas)
│   └── Starfield.jsx       # ambient background (canvas)
└── lib/persona.js          # JARVIS's personality / system prompt
```

## Built with Claude
