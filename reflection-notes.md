# Reflection Notes — Session Pattern Analysis

**Date:** 2026-07-07
**Scope requested:** Cluster recurring signals across past sessions in `~/.claude/projects/` (Ember AI, Tally, Backstop, The Launch, BPEC ops) and rank skill/automation/fix candidates.
**Status: mostly blocked — the transcript corpus is not in this environment.** What follows is (1) why, (2) the clusters that *could* be verified from evidence available here, (3) the clusters that cannot be assessed and must not be built on assumption, and (4) how to run the real reflection.

---

## 0. The headline finding: no past transcripts exist here

This session runs in a fresh, ephemeral Claude Code cloud container. `~/.claude/projects/` was checked directly and contains exactly one project directory (`-home-user-Ashley-launch-`) with exactly one transcript: **this session's own** (13 lines at time of analysis — just the reflection prompt itself). A system-wide search (`/home`, `/root`, `/workspace`) found no other `.jsonl` transcripts and no other `.claude/projects` stores.

Local Claude Code session history does **not** sync to cloud sessions. The transcripts for the Ember AI, Tally, Backstop, The Launch, and BPEC sessions live wherever those sessions ran — your Mac's `~/.claude/projects/`, and/or claude.ai session storage for web/Cowork sessions.

**Consequence:** every recurrence claim below is graded by the evidence actually available: this repo's git/PR history (35 commits, 14 PRs) and its documents. Nothing else is cited, and nothing is proposed as a skill without a verifiable recurrence trail — per your own ground rule.

---

## 1. Clusters WITH evidence (from this repo's git/PR history)

### Cluster A — Netlify deploy friction for app-shaped projects: **strongest verified signal**
**Verdict: skill candidate (pending confirmation from local transcripts) — highest leverage item in this analysis.**

Evidence — four consecutive fix-the-404 PRs merged within **61 minutes** on 2026-06-11, each a different guess at the same Netlify/Next.js routing problem:

| PR | Commit | Time (merge) | Attempt |
|----|--------|--------------|---------|
| #3 | `8708f07` | 09:45 | Remove publish-dir override, let Netlify Next.js Runtime v5 manage it |
| #4 | `af9121a` | 09:53 | Link site + add self-verify/diagnose step to deploy workflow |
| #5 | `8b6c2f9` | 09:58 | Explicit catch-all redirect to the Next.js server function |
| #6 | `3daf4d5` | 10:06 | **Static export + standalone Netlify Function (streaming)** ← the fix that stuck |

That's a full session (or more) burned on deploy plumbing, and the winning pattern — *static export + a standalone Netlify Function for the API, no Next.js runtime on Netlify* — is exactly the shape of your "Netlify single-file deploy" pattern for Tally and the Netlify deploy for Ember AI. You reported this friction as cross-project; this repo independently confirms one instance of it in full.

**Recommendation:** a `netlify-deploy` skill capturing the settled recipe: `netlify.toml` shape, static export config, standalone function pattern (`netlify/functions/*.mjs`), the GitHub Actions workflow (`.github/workflows/deploy-jarvis.yml` here is a working reference), and a post-deploy self-verification curl. Build cost is low because the working artifacts already exist in this repo to crib from. **Before building, confirm against local transcripts that Ember AI/Tally sessions hit the same wall** — if they did, this pays for itself in the first avoided 404 loop.

### Cluster B — Deploy-then-discover mobile bug loop
**Verdict: fix (process note), not a skill.**

Evidence — three PRs on 2026-06-11 fixing bugs only observable on a real device after deploy:
- #7 (`d45120b`, 10:16) — no sound on mobile until audio is unlocked by a tap
- #9 (`b6b8c4f`, 10:31) — client-side crash (temporal dead zone in wake effect)
- #10 (`08a66aa` / `08ac66a`, 10:43) — no-response; rework to tap-to-talk

Combined with Cluster A, that's **7 of the first 10 PRs being fixes for the previous PR**. The pattern: ship → test on phone → find breakage → ship again. A skill can't test on your phone, but two cheap mitigations exist: (a) a pre-push checklist item in this repo's CLAUDE.md for the known mobile traps (audio autoplay unlock, speech-API quirks, WebGL fallback), and (b) asking Claude to run the Playwright browser against the built output before pushing (the cloud environment has Chromium pre-installed). Low cost, but also lower leverage than Cluster A — mobile-Safari-specific issues will still escape.

### Cluster C — No CLAUDE.md anywhere in this repo
**Verdict: fix — cheap, near-certain payoff, but scope it to what this repo can verify.**

Evidence: the repo has zero `CLAUDE.md`, yet its own README encodes stable domain facts a fresh session must otherwise be told: The Launch is an RSA training app for Ashley Furniture / 5th & Home franchise (Corpus Christi, Victoria, Bay City, 5th & Home); pay calculator with bonus qualification; trainer-email reporting; Next.js on Vercel — while `jarvis/` deploys to Netlify via its own workflow. Two apps, two deploy targets, one repo: exactly the kind of thing that gets re-explained.

You listed the recurring re-explains yourself — pricing rules, KPI floors, roster data, brand voice. **None of those appear anywhere in this repo**, so I can verify the *gap* but not the *recurrence count*. A CLAUDE.md here should start with what's verifiable (project map, deploy targets, the Cluster A Netlify recipe, Cluster B mobile checklist) and grow the domain facts (KPI floors, pricing, roster) as you confirm them from real sessions — don't let me invent your KPI floors from nothing.

---

## 2. Clusters WITHOUT evidence — cannot be assessed, do not build yet

These are the things you asked me to weigh, and the honest answer for each is: **zero transcripts available → recurrence unverifiable → "nothing" for now**, explicitly *not* because they're bad candidates but because building on uncited recurrence violates the brief.

| Cluster you named | What I'd need to see | Verdict here |
|---|---|---|
| Re-explained pricing rules / KPI floors / roster / brand voice | The actual re-explanations across ≥3 sessions, verbatim, to extract the canonical values | **No data.** Likely CLAUDE.md content, not a skill — but the *content* must come from your transcripts, not reconstruction |
| Cowork handoff friction | Handoff turns in transcripts | **No data** |
| Formatting/output corrections | Your correction messages | **No data** |
| Voice-to-text typo patterns | Raw prompts with the typos + my interpretations | **No data.** Note: this one especially *cannot* be reconstructed later from memory — it only exists in raw transcripts |
| Ember AI / Tally / Backstop specifics | Those projects' transcript dirs | **No data** — none of those codebases or sessions are in this environment |

---

## 3. Ranked assessment (most leverage first)

1. **Unblock the data (prerequisite, not optional).** Run this same reflection prompt on the machine where the sessions actually ran — locally, `~/.claude/projects/` will have one directory per project (Ember AI, Tally, Backstop, The Launch, BPEC docs), each full of `.jsonl` transcripts, and the subagent fan-out you asked for becomes real. Alternative: copy/export those transcript directories into a repo or into a cloud session first. Everything in §2 hinges on this.
2. **Netlify deploy skill (Cluster A).** The only skill candidate with verified evidence from here — 4 PRs / 61 minutes of thrash, working recipe already in-repo, and it matches friction you independently reported on two other builds. Confirm cross-project recurrence in step 1, then build.
3. **CLAUDE.md for this repo (Cluster C).** Cheapest fix with the broadest surface: project map, dual deploy targets, Netlify recipe, mobile pre-push checklist. Seed domain facts (KPI floors, pricing, roster, voice) only after step 1 surfaces the canonical versions.
4. **Mobile pre-push checklist (Cluster B).** Fold into the CLAUDE.md from item 3; not worth standalone tooling.
5. **Everything in §2 — no action.** Not because it doesn't recur, but because acting without the cited sessions would be exactly the guesswork this exercise exists to eliminate.

---

*Methodology note: `~/.claude/projects/`, `/home/*`, `/root`, and `/workspace` were searched exhaustively for transcript stores before concluding the corpus is absent. Repo evidence: `git log` (35 commits, 2026-05-11 → 2026-06-11), file-churn stats (`jarvis/components/Jarvis.jsx` touched in 12 commits — the iteration hotspot), and both READMEs. No subagent fan-out was run against transcripts because there were none to fan out over; faking that analysis would have produced confident, uncitable noise.*
