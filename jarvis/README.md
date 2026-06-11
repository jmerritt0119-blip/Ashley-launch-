# J.A.R.V.I.S.

> Just A Rather Very Intelligent System — your own personal AI, in the spirit of
> Tony Stark's companion. Powered by Claude.

A standalone, visually rich AI assistant: a live animated arc-reactor core, a
holographic heads-up display, voice in and out, and streaming responses from
Claude.

![status](https://img.shields.io/badge/build-Mark%20III-7df9ff)

## What it does

- **Talk to it.** Click the microphone and speak; JARVIS listens, thinks, and
  replies out loud in a British-butler voice.
- **Or type.** A full chat interface with live, streaming responses.
- **Reactive arc reactor.** The central core shifts colour and energy as JARVIS
  listens (green), thinks (amber), and speaks (blue).
- **The JARVIS persona.** Composed, witty, and proactive — defined in
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

## Voice support

Voice uses the browser's built-in Web Speech API.

- **Speech recognition** (mic input) works in Chrome and Edge. Other browsers
  fall back to text only — everything else still works.
- **Speech synthesis** (spoken replies) works in all modern browsers. JARVIS
  prefers a British male voice if one is installed.

Toggle spoken replies with the **VOICE** button, top right.

## How it's built

- **Next.js 14** (App Router) + **React** + **Tailwind CSS**
- **`@anthropic-ai/sdk`** streaming from a server route (`app/api/chat/route.js`)
- Canvas-rendered arc reactor and starfield — no animation libraries
- Web Speech API for voice in/out

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
