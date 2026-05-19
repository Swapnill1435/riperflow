# Riperflow — Social Launch Plan

**Constraints baked in:** solo founder, minimal time, no existing audience, open-source MIT product distributed via `npx`. This plan is *asymmetric* — it puts almost all the time into the two highest-leverage channels and ignores the ones that need an existing following to work.

---

## Platform priority (do this; skip the rest at launch)

| Rank | Platform | Why now | Weekly time |
|---|---|---|---|
| 1 | **X / Twitter** | The AI-coding-tools crowd (Cursor, Aider, Claude Code communities) lives here. Strangers can find your post. Visual demos work. | 60–90 min |
| 2 | **Reddit** (r/ClaudeAI, r/cursor, r/ChatGPTCoding, r/aipromptprogramming, r/LocalLLaMA) | Niche, pre-qualified users actively looking for tools. Long-tail Google SEO from every post. | 30 min |
| 3 | **Hacker News** (Show HN — once) | Single biggest day-one spike possible for a dev tool. One-shot. | 30 min on launch day |
| 4 | **YouTube Shorts / TikTok / Reels** | High reach, but only if you make the 60-second demo. Otherwise skip. | 45 min once + repost |
| 5 | **LinkedIn** | Worth posting *the same content* you write for X, but reach without existing connections is poor. Free to copy/paste. | 5 min per X post |

**Explicitly skip at launch:** Instagram (visual brand fit is wrong), Facebook (audience mismatch), Mastodon (small reach), Threads (still nascent for dev tools). Add them later if you ever have time to spare; you won't.

---

## The single anchor asset — record this once, everything else depends on it

**60-second screen recording** showing the wow moment. This becomes:
- The Shorts/TikTok/Reels video
- The hero GIF/MP4 embedded in Show HN, Product Hunt, X launch post, README
- Frames for Twitter card images

### Storyboard (write this on a sticky note, then record in one take):

```
[0:00–0:05]  Title card: "One workflow. Ten AI coding tools. ~1,350 tokens."
[0:05–0:15]  Terminal: `mkdir demo && cd demo && npx riperflow init`
             → memory bank fans in
[0:15–0:25]  Terminal: `npx riperflow setup --tools cursor,claude-code,
             opencode,kilocode,vscode,roo,aider,windsurf,cline,codex`
             → "✓ Successful: 10"
[0:25–0:35]  `tree -L 2` → all 10 tool dirs visible side-by-side
[0:35–0:45]  `riperflow p` → Plan mode. `riperflow e` → Execute mode.
             Status panel updates.
[0:45–0:55]  Browser: dashboard at localhost:3456. Mode tile updates live
             when you flip mode in another terminal.
[0:55–1:00]  End card: "github.com/nitingupta220/riperflow   ·   MIT   ·
             npx riperflow init"
```

**Tools that make this easy:** OBS (free) or Screen Studio ($) for capture, CapCut (free) for trim + caption overlay. Add subtitles — most social video plays muted.

**Until this video exists, every post below works as a still + claim. The video is the multiplier — make it inside week 1.**

---

## Launch-week calendar (T = launch day = the day you `npm publish`)

| Day | Channel | Action |
|---|---|---|
| T-2 | X | Pre-launch teaser (#buildinpublic — Draft 1) |
| T-1 | Reddit | Soft post in r/aipromptprogramming with the *journey*, not the pitch (Draft 6) |
| T-1 | X | Behind-the-scenes: "I ran a full QA pass before launch and found 5 P0 bugs in my own product" (Draft 2) |
| **T** | Hacker News | **Show HN** with the demo GIF (title in Draft 9) |
| T | X | Launch thread (Draft 3) — tag @cursor_ai, @AnthropicAI, @opencodeai |
| T | LinkedIn | Same text as launch thread, repurposed (Draft 4) |
| T | Reddit | r/ClaudeAI + r/cursor — separate posts, *different* angles per sub (Drafts 7, 8) |
| T+1 | X | Reply guy mode: comment on every "Cursor vs Claude Code" / "best AI coding workflow" tweet you can find for 2 hours |
| T+2 | YouTube Short / TikTok / Reels | Upload the 60s anchor video |
| T+3 | X | Single-feature deep dive — symbolic notation explained (Draft 5) |
| T+4 | Reddit | r/LocalLLaMA cross-post angle: "10 tools, 1.35k tokens, runs anywhere — fits your local-model context budget" |
| T+7 | X | Week-1 numbers thread: stars, npm downloads, issues opened. People love metrics in public. |

**Total time this week: ~6 hours. Most of it is the video and the Show HN post.**

---

## Sustaining cadence after week 1 (≤45 min/week)

The launch spike fades fast. Keep three lights on:

- **X — 3 posts/week.** Monday tactical tip from RIPER itself, Wednesday "what I shipped this week" build-in-public, Friday hot take or comparison.
- **Reddit — 1 high-value post/month** in whichever sub had the best response. Top-of-comments engagement is more valuable than new posts.
- **Demo asset library** — every time you ship a real feature, record a 15-second clip. Stack them. By month 3 you have 10+ assets you can recycle.

---

## 10 ready-to-post drafts

Numbers and quotes pulled from POST-FIX-VERIFICATION.md so they're real. **Replace `github.com/nitingupta220/riperflow` and the @-handle with the live values.**

### Draft 1 — X teaser, T-2 days

> Spent the last two weeks building something for everyone who's now juggling Cursor + Claude Code + Aider depending on what they're doing.
>
> One workflow methodology. Same rules, same memory, same modes. Ten coding tools.
>
> Open source. Launching in 48 hours.
>
> #buildinpublic

### Draft 2 — X behind-the-scenes, T-1 day

> Almost shipped this with 5 P0 bugs.
>
> Ran a full QA pass on my own product before launch. Found:
> • A `fs-extra` ESM import that broke MCP integration entirely (silent in tests — vitest's transformer was hiding it)
> • Dashboard auth that didn't actually enforce on read endpoints
> • Init crashed in any non-TTY context (CI, Docker, scripted demos)
>
> Fixed all of them. 215/215 tests pass now. Launching tomorrow.
>
> Lesson: 204 passing unit tests is not the same as a working product. Make yourself the first user.

### Draft 3 — X launch thread, T-day, post 1

> One workflow. Ten AI coding tools. One spec, ≈1,350 tokens.
>
> Riperflow ships today. MIT. `npx riperflow init`.
>
> 🧵 What it does, why it exists, and how the 1.35k-token figure happens 👇

**Post 2:**

> Every AI coding tool has its own way of holding context — Cursor rules, Claude Code memory, OpenCode AGENTS.md, Aider conventions, the lot.
>
> If you use more than one, you've felt it. You explain the same thing four times.

**Post 3:**

> RIPER (Research → Innovate → Plan → Execute → Review) compresses that into 5 modes, a shared memory bank, and one symbolic spec.
>
> A single `init` writes the right rule file for each tool in its native format. Switch tools mid-task without losing context.

**Post 4:**

> The trick to keeping it small: symbolic notation.
>
> Modes are Ω₁–Ω₅. Phases are Π₁–Π₄. Memory slots Σ₁–Σ₆.
>
> The full spec rendered for Claude Code is **1,355 tokens**. Cursor: 1,638. OpenCode: 1,406. Average across 14 generated rule files: 1,350.
>
> Measured, not aspirational.

**Post 5:**

> Also in the box:
> • BMAD roles (PO, Architect, Dev, QA, DevOps) with quality gates
> • Code-protection levels (6 of them — Locked files won't be touched without approval)
> • TUI + web dashboard, token-secured, localhost-bound
> • SQLite analytics + MCP integration

**Post 6:**

> Free, MIT, no signup.
>
> npx riperflow init
>
> Repo: github.com/nitingupta220/riperflow
>
> If you try it, tell me what breaks — I want this to be reliable.

### Draft 4 — LinkedIn version of the launch thread (collapsed)

> If you use more than one AI coding tool, you've felt this: every tool has its own way of holding project context. You explain the same thing four times.
>
> I just open-sourced **Riperflow** — a free CLI that brings one workflow methodology (Research → Innovate → Plan → Execute → Review) to ten of them: Cursor, Claude Code, OpenCode, KiloCode, VS Code, Roo Code, Aider, Windsurf, Cline, Codex CLI.
>
> One `npx riperflow init` writes the right rule file for each tool in its native format. Shared memory bank, role-based BMAD workflow, code-protection levels, dashboard, MCP integration.
>
> The full spec compiled for each tool averages 1,350 tokens — small enough to leave your context window alone.
>
> MIT, no signup. `npx riperflow init`
>
> Repo + docs: github.com/nitingupta220/riperflow
>
> If you try it and something breaks, please open an issue — I want this to be reliable.

### Draft 5 — X single-feature deep dive (T+3)

> The way Riperflow keeps the full coding-workflow spec under 1.5k tokens:
>
> Modes are encoded as Ω₁..Ω₅ (Greek omega).
> Phases as Π₁..Π₄ (pi).
> Memory slots as Σ₁..Σ₆ (sigma).
> Protection levels Ψ₁..Ψ₆ (psi).
>
> Same fidelity, ~10× smaller than the prose equivalent. Your model spends its budget on your code, not on remembering how to behave.

### Draft 6 — Reddit r/aipromptprogramming, T-1 day (journey post, not pitch)

> **Title:** I tried to keep one consistent workflow across Cursor, Claude Code, and Aider for a year. Here's what finally worked.
>
> The setup that always broke for me: I'd be deep in a feature in Cursor, switch to Claude Code for a specific debugging task, and lose all the project context — coding standards, memory of past decisions, which files were locked from modification.
>
> Tried just copying CLAUDE.md around. Doesn't scale.
>
> What ended up working was treating "workflow" as a separate layer from any one tool — a shared spec, a memory bank that all the tools read, and a tiny mode-switching CLI.
>
> Wrote up the approach (BMAD-style roles + RIPER methodology + symbolic notation to keep token cost down) and the CLI that generates the right rule file for each tool: github.com/nitingupta220/riperflow
>
> Curious whether anyone else has solved the multi-tool context problem differently. Genuinely interested in what's working for people.

### Draft 7 — Reddit r/ClaudeAI, T-day

> **Title:** Built a small CLI that keeps the same project memory + workflow across Claude Code and any other AI coding tool you use
>
> Use Claude Code as my main tool but bounce into Cursor for some tasks and OpenCode for others. Got tired of explaining the same project conventions to each one.
>
> Ended up writing `riperflow` — `npx riperflow init` creates a shared memory bank and generates a CLAUDE.md (plus equivalents for whatever other tools you have) so they all stay in sync. Has BMAD-style roles, quality gates, and a 6-level code protection registry you can use to mark files as off-limits.
>
> Whole spec compiled for Claude Code is 1,355 tokens — measured.
>
> MIT, open source: github.com/nitingupta220/riperflow
>
> Would love feedback from heavy Claude Code users specifically.

### Draft 8 — Reddit r/cursor, T-day (different angle)

> **Title:** Cursor users who also use other AI tools — small CLI that keeps `.cursor/rules/` in sync with the others
>
> If Cursor is your daily but you keep Aider / Claude Code / Codex CLI around for specific tasks, here's a free CLI that maintains one shared project memory + rule spec across all of them.
>
> One `init` writes `.cursor/rules/riper.mdc` plus the equivalents for the others. Mode switching (Research/Plan/Execute/Review) updates all rule files at once.
>
> No signup, MIT: `npx riperflow init` · github.com/nitingupta220/riperflow

### Draft 9 — Show HN title + opening line

> **Title:** Show HN: Riperflow – one workflow methodology across Cursor, Claude Code, Aider, and 7 more
>
> **Opening comment (post yourself in the first 10 minutes):**
>
> Hi HN — I built this because I was tired of writing four versions of the same project rules every time I switched AI coding tools.
>
> One `npx riperflow init` generates the right rule file for each tool in its native format (CLAUDE.md, .cursor/rules/, AGENTS.md, .aider/, ten total), keeps them in sync via a shared memory bank, and adds optional structure on top (BMAD roles, quality gates, 6-level code protection registry).
>
> The whole compiled spec averages ~1,350 tokens per tool — small enough to leave your context window alone.
>
> Tech: TypeScript, Express + WebSocket dashboard (localhost-bound, bearer-token auth), SQLite analytics with JSONL fallback, MCP integration. MIT.
>
> Happy to answer questions about the architecture, the symbolic encoding trick that keeps it small, or why I almost shipped with 5 P0 bugs before doing one final QA pass on my own product.

### Draft 10 — 60-second Shorts script (voiceover for the anchor video)

> **[0–3s, on text overlay]** Use four AI coding tools? You write four versions of the same rules.
>
> **[3–10s]** Watch this. `npx riperflow init`. One command, full workflow scaffold.
>
> **[10–25s]** `setup --tools cursor,claude-code,opencode,kilocode,vscode,roo,aider,windsurf,cline,codex`. Ten tool integrations. One spec. Each in its native format.
>
> **[25–40s]** Switch a mode in one terminal — `riperflow e` for Execute. The dashboard updates live. All your tools read from the same memory bank.
>
> **[40–55s]** Full RIPER spec compiled for each tool: about 1,350 tokens. Symbolic notation keeps it small. MIT. Free.
>
> **[55–60s]** `npx riperflow init`. Link in bio.

---

## Engagement playbook — the unglamorous half that actually matters

### 50 accounts to follow + interact with on X (build this list in week 1)

- The official accounts of every tool you support: @cursor_ai, @AnthropicAI (Claude Code), @opencodeai, etc.
- Power users posting about AI coding workflows daily. Search "Cursor + Claude Code" and follow the 20 most active recent posters.
- Adjacent OSS authors: BMAD-METHOD, Taskmaster-AI, claude-flow, Aider's Paul Gauthier.

**Daily for week 1 (15 min):** drop one substantive comment on the top 5 of their recent posts. Not "great post" — share a related experience or a specific question.

### Subreddits to monitor

- r/ClaudeAI · r/cursor · r/ChatGPTCoding · r/aipromptprogramming · r/LocalLLaMA · r/ArtificialIntelligence

Set up a Reddit "top of day" filter and skim for 5 min daily for threads where your tool fits the question naturally. Reply with the help first, link second.

### "Reply guy" hot spots

Any tweet like "How do you keep context consistent between [Tool A] and [Tool B]?" → answer with the help, then link.

Any "What's the right way to organize CLAUDE.md / .cursor/rules?" → answer the question, mention RIPER as one option, not the only one.

---

## Metrics worth tracking (weekly, 5 min)

| Metric | Where | What "working" looks like in month 1 |
|---|---|---|
| GitHub stars | github.com | 50–200 (Show HN spike) |
| npm weekly downloads | npmjs.com/package/riperflow | 100+ steady, 1000+ spike around launch |
| X impressions on launch thread | X Analytics | 5k+ if it lands, 1k+ if it doesn't |
| Reddit upvotes on best post | each sub | 20+ in a niche sub is a real signal |
| Issues opened by strangers | github.com | 3–10 = people are actually using it |

If GitHub stars stay flat for 2 weeks but issues are coming in, the *promotion* is failing, not the *product*. If it's the reverse — high stars, no issues — you got attention but no daily use; that's a product-fit signal, not a marketing one.

---

## Pre-launch checklist (do today, before any of the above)

- [ ] `npm publish --access public` from `cli/` (the one blocker — see POST-FIX-VERIFICATION.md)
- [ ] After publish, run `npx riperflow@latest init` in a fresh tmpdir to confirm the registry copy works
- [ ] Add a hero GIF (frame 0:15–0:25 of the anchor video) to README.md, above the install instructions
- [ ] Make a tagline you can fit in 80 chars for the GitHub repo description: *"One workflow, ten AI coding tools, ~1.35k tokens. MIT."*
- [ ] Pre-fill your X bio with the same tagline + the npm command
- [ ] Have 5 people (friends, devs you trust) ready to upvote the Show HN post in the first 30 minutes — don't ask them to comment, just to upvote

When all six boxes are ticked, you're cleared to start Draft 1.
