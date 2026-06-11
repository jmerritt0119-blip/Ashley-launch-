# JARVIS Mac agent

Lets JARVIS (on your phone) **do things on your Mac** by voice — open apps and
websites, speak aloud, show notifications, report system info, and (if you opt
in) run AppleScript or shell commands.

## How it works

```
your phone (JARVIS)  ──►  Netlify relay (a private queue keyed by your code)  ──►  this agent  ──►  your Mac
```

JARVIS decides the action from what you say, dispatches it to the relay under
your **pairing code**, and this agent — running on your Mac — picks it up and
runs it. Nothing runs unless this agent is running and the code matches.

## Setup (2 minutes)

You need **Node 18+** on your Mac (`node -v`). Get it from
[nodejs.org](https://nodejs.org) if needed.

1. **Pick a pairing code** — any private string, e.g. `arc-reactor-7831`.

2. **Pair your phone:** open your JARVIS site once with the code, e.g.
   `https://jarvis-jmerritt0119.netlify.app/?pair=arc-reactor-7831`
   (it's saved on your phone and removed from the URL).

3. **Start the agent on your Mac** (in Terminal, from this folder):
   ```bash
   JARVIS_PAIR_CODE=arc-reactor-7831 node agent.mjs
   ```
   You should see "Mac agent online" and "Listening for commands…".

4. On your phone, say: **"Open Spotify"**, **"Open YouTube"**,
   **"Say hello on my Mac"**, or **"What's my battery?"** — and watch your Mac
   respond.

## What it can do

| Action        | Example phrase                        | Default |
| ------------- | ------------------------------------- | ------- |
| Open an app   | "Open Spotify"                        | ✅ on    |
| Open a website| "Open YouTube" / "Open my email"      | ✅ on    |
| Speak on Mac  | "Say good morning on my computer"     | ✅ on    |
| Notification  | "Remind me to stand up"               | ✅ on    |
| System info   | "What's my battery and the time?"     | ✅ on    |
| AppleScript   | "Set my volume to 30%"                | ⚠️ opt-in |
| Shell command | (advanced)                            | ⚠️ opt-in |

AppleScript and shell are **off by default** because they can do anything on
your Mac. Enable them only if you understand the risk:

```bash
JARVIS_PAIR_CODE=arc-reactor-7831 node agent.mjs --allow-applescript
JARVIS_PAIR_CODE=arc-reactor-7831 node agent.mjs --allow-shell   # also enables applescript
```

## Options

| Env / flag              | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `JARVIS_PAIR_CODE`      | **Required.** Must match the `?pair=` code you used. |
| `JARVIS_RELAY_URL`      | Your site URL (default `https://jarvis-jmerritt0119.netlify.app`). |
| `--allow-applescript`   | Enable the AppleScript action.                       |
| `--allow-shell`         | Enable the shell action (also enables AppleScript).  |

## Security notes

- **Treat the pairing code like a password.** Anyone with it (and a running
  agent) could send commands to your Mac. Use a long, private code; change it
  by restarting with a new code and re-pairing your phone.
- The agent only runs while **you** keep it running, and only the whitelisted
  actions above. AppleScript/shell stay disabled unless you pass the flags.
- The relay only stores tiny command payloads briefly; it never has access to
  your Mac directly.

## Keep it running

To leave it on in the background, you can run it in a `tmux`/`screen` session,
or wrap it in a `launchd` plist. Ask JARVIS (the assistant) to help you set that
up if you'd like.
