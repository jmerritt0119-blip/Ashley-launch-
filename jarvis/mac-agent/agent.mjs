#!/usr/bin/env node
// JARVIS Mac agent — runs on YOUR Mac, polls the relay for commands JARVIS
// dispatches from your phone, and executes a safe whitelist of actions.
//
// Usage:
//   JARVIS_PAIR_CODE=your-secret-code node agent.mjs
// Optional:
//   JARVIS_RELAY_URL=https://your-site.netlify.app   (defaults below)
//   --allow-applescript   enable the applescript action
//   --allow-shell         enable the shell action (also enables applescript)
//
// Requires Node 18+ (for global fetch). No npm install needed.

import { exec } from 'node:child_process';

const RELAY = (process.env.JARVIS_RELAY_URL || 'https://jarvis-jmerritt0119.netlify.app').replace(/\/$/, '');
const CODE = (process.env.JARVIS_PAIR_CODE || '').trim();
const ALLOW_SHELL = process.argv.includes('--allow-shell');
const ALLOW_APPLESCRIPT = ALLOW_SHELL || process.argv.includes('--allow-applescript');

if (!CODE) {
  console.error('✗ Set JARVIS_PAIR_CODE to your pairing code (the same one you used on your phone with ?pair=...).');
  process.exit(1);
}

const sh = (cmd) =>
  new Promise((resolve) =>
    exec(cmd, { timeout: 20000, maxBuffer: 1 << 20 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: (stdout || stderr || '').toString().trim() })
    )
  );

// single-quote for the shell, safely
const q = (s) => `'${String(s == null ? '' : s).replace(/'/g, `'\\''`)}'`;

async function execute(c) {
  switch (c.action) {
    case 'open_app':
      if (!c.target) return { ok: false, out: 'no app name' };
      return sh(`open -a ${q(c.target)}`);
    case 'open_url': {
      const u = String(c.target || '');
      if (!/^https?:\/\//i.test(u)) return { ok: false, out: 'invalid url' };
      return sh(`open ${q(u)}`);
    }
    case 'say':
      return sh(`say ${q(c.text || '')}`);
    case 'notify':
      return sh(`osascript -e ${q(`display notification ${JSON.stringify(c.text || '')} with title "JARVIS"`)}`);
    case 'system_info':
      return sh(`echo "Battery $(pmset -g batt 2>/dev/null | grep -Eo '[0-9]+%' | head -1) | $(date '+%a %-I:%M %p') | $(uptime | sed 's/.*load averages*: //')"`);
    case 'applescript':
      if (!ALLOW_APPLESCRIPT) return { ok: false, out: 'applescript disabled (start with --allow-applescript)' };
      return sh(`osascript -e ${q(c.command || '')}`);
    case 'shell':
      if (!ALLOW_SHELL) return { ok: false, out: 'shell disabled (start with --allow-shell)' };
      return sh(String(c.command || ''));
    default:
      return { ok: false, out: `unknown action: ${c.action}` };
  }
}

async function postResult(payload) {
  try {
    await fetch(`${RELAY}/api/agent?code=${encodeURIComponent(CODE)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}

console.log('╔════════════════════════════════════════════╗');
console.log('║   J.A.R.V.I.S.  ·  Mac agent online          ║');
console.log('╚════════════════════════════════════════════╝');
console.log(`  relay:       ${RELAY}`);
console.log(`  pair code:   ${CODE.slice(0, 2)}${'•'.repeat(Math.max(0, CODE.length - 2))}`);
console.log(`  applescript: ${ALLOW_APPLESCRIPT ? 'ENABLED' : 'disabled'}   shell: ${ALLOW_SHELL ? 'ENABLED' : 'disabled'}`);
console.log('  Listening for commands from JARVIS… (Ctrl+C to stop)\n');

let warned = false;
async function loop() {
  try {
    const res = await fetch(`${RELAY}/api/agent?code=${encodeURIComponent(CODE)}`);
    if (res.ok) {
      warned = false;
      const data = await res.json().catch(() => ({}));
      const commands = Array.isArray(data.commands) ? data.commands : [];
      for (const c of commands) {
        const label = c.target || c.text || c.command || '';
        console.log(`▸ ${c.action}${label ? '  ' + String(label).slice(0, 80) : ''}`);
        const r = await execute(c);
        console.log(`  ${r.ok ? '✓' : '✗'} ${r.out.slice(0, 160)}`);
        postResult({ action: c.action, ok: r.ok, out: r.out.slice(0, 200) });
      }
    }
  } catch (e) {
    if (!warned) {
      console.log('… waiting for relay (network?)');
      warned = true;
    }
  }
  setTimeout(loop, 1500);
}

loop();
