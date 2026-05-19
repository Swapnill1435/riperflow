# Riperflow

> One workflow methodology across **ten** AI coding tools — Cursor, Claude Code, OpenCode, Aider, and friends — in a single ≈1,350-token spec.

[![npm version](https://img.shields.io/npm/v/riperflow.svg?logo=npm&label=npm)](https://www.npmjs.com/package/riperflow)
[![npm downloads](https://img.shields.io/npm/dw/riperflow.svg)](https://www.npmjs.com/package/riperflow)
[![provenance](https://img.shields.io/badge/npm-provenance-blue?logo=npm)](https://www.npmjs.com/package/riperflow)
[![CI](https://img.shields.io/github/actions/workflow/status/nitingupta220/riperflow/ci.yml?branch=main&label=tests)](https://github.com/nitingupta220/riperflow/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/riperflow.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/riperflow.svg)](https://www.npmjs.com/package/riperflow)
[![stars](https://img.shields.io/github/stars/nitingupta220/riperflow?style=flat&logo=github)](https://github.com/nitingupta220/riperflow/stargazers)

---

## Why this exists

If you use more than one AI coding tool — and most people do, mixing Cursor for IDE work, Claude Code for terminal sessions, Aider for refactors — you've probably written four versions of the same project rules. Each tool wants a different file in a different place: `.cursor/rules/`, `CLAUDE.md`, `AGENTS.md`, `CONVENTIONS.md`. They drift.

Riperflow keeps **one source of truth** (a small memory bank in your repo) and generates the right rule file for each tool in its native format. Switch tools mid-task and your project context comes with you.

## Quickstart

```bash
mkdir my-project && cd my-project
npx riperflow init           # interactive: pick which tools to scaffold
npx riperflow setup --tools cursor,claude-code,opencode,aider
```

That writes:

- `memory-bank/` — six markdown files capturing brief, architecture, tech context, active work, progress, and code-protection registry. **The source of truth.**
- The right rule file for each tool you picked, in its native location (full list [below](#supported-tools)).
- `.riper/config.json` + `.riper/state.json` — Riperflow's bookkeeping.

Now open the project in any of the tools you scaffolded. The AI sees the rules immediately; ask it to switch modes with `/r`, `/p`, `/e`, etc., and it'll read the correct memory file for that mode.

> **Non-interactive?** Add `-y` to `init`. The CLI detects piped stdin / CI automatically and falls back to defaults.

## The methodology — RIPER in 30 seconds

Riperflow ships a **methodology**, not a chatbot. Your AI tool runs through five modes:

| Mode | Symbol | What it can do | When to use |
|---|---|---|---|
| **Research** | Ω₁ 🔍 | Read-only — explain, analyze, summarize | Understanding new code |
| **Innovate** | Ω₂ 💡 | Suggest approaches; cannot write | Brainstorming a feature |
| **Plan** | Ω₃ 📝 | Write docs only, no source code | Speccing the work |
| **Execute** | Ω₄ ⚙️ | Full write access | Building |
| **Review** | Ω₅ 🔎 | Read-only validation | Pre-merge sanity check |

Mode permissions are enforced by the generated rule files; the AI refuses out-of-mode edits without you doing anything.

## Supported tools

| Tool | Files Riperflow writes | Native discovery? |
|---|---|---|
| Cursor | `.cursor/rules/riper.mdc` | ✅ |
| Claude Code | `CLAUDE.md`, `.claude/rules/riper.md` | ✅ |
| OpenCode | `.opencode/AGENTS.md`, `.opencode/opencode.json` | ✅ |
| KiloCode | `.kilocode/rules/riper.md` | ✅ |
| VS Code | `.vscode/.riper.md` | ✅ |
| Roo Code | `.roo/rules/riper.md` | ✅ |
| Aider | `CONVENTIONS.md`, `.aider/riper.md`, `.aider.conf.yml` | ✅ |
| Windsurf | `.windsurf/rules/riper.md`, `.windsurf/cascade.md` | ✅ |
| Cline | `.cline/instructions/riper.md` + settings | ✅ |
| Codex CLI | `AGENT.md`, `.codex/riper.md` | ✅ |

## How small the spec is

The full RIPER spec rendered for each tool — modes, permissions, memory references, BMAD roles, code-protection rules — fits in **~1,350 tokens on average** (measured across all 14 generated rule files; range 518–1,763 depending on the tool's preferred verbosity). The encoding uses symbolic notation:

- **Modes:** Ω₁ … Ω₅ (Greek omega)
- **Phases:** Π₁ … Π₄ (pi)
- **Memory slots:** Σ₁ … Σ₆ (sigma)
- **Protection levels:** Ψ₁ … Ψ₆ (psi)

Same semantics, ~10× smaller than the equivalent prose ruleset. Your model spends its context budget on your code, not on remembering how to behave.

## CLI reference

```bash
# Modes (or use the single-letter shortcuts r / i / p / e / rev)
riperflow mode research
riperflow mode plan
riperflow e                          # = mode execute

# Sync the memory bank into every configured tool's rule file
riperflow sync

# Status: current mode, phase, configured tools, memory bank state
riperflow status

# Dashboard (web UI on localhost, token-protected)
riperflow dashboard                  # TUI
riperflow dashboard web --detach     # web, backgrounded; `dashboard stop` to kill

# MCP integration (GitHub, web search, browser, Docker)
riperflow mcp add github
riperflow mcp add websearch
riperflow mcp generate               # write mcp.json into each tool

# Analytics
riperflow analytics stats
riperflow analytics weekly
riperflow analytics export --format json --output events.json
riperflow analytics migrate          # rebuild SQLite index from JSONL

# BMAD: roles, quality gates, PRDs, code protection
riperflow role list
riperflow role set architect
riperflow gate list
riperflow gate advance
riperflow prd create "Feature Name"
riperflow protect set src/auth locked
riperflow protect check src/auth

# Check for updates
riperflow update
```

Run any command with `--help` for full options.

## Concepts (in one paragraph each)

**Memory bank.** Six markdown files in `memory-bank/`: `projectbrief.md` (scope), `systemPatterns.md` (architecture), `techContext.md` (stack), `activeContext.md` (current focus — updated as you work), `progress.md` (milestones), `protection.md` (which files are off-limits). Every tool's generated rule file points back to these.

**BMAD roles.** Optional structure for teams: Product Owner, Architect, Developer, QA, DevOps. Each role has scoped permissions and a default mode. Switch with `riperflow role set <role>`.

**Quality gates.** Five stages — Design → Development → Testing → Review → Deploy. Advance with `riperflow gate advance`; approve with `gate approve <stage>`. Useful for replicating a lightweight stage-gate process inside AI-driven work.

**Code protection.** Six levels from `open` (anyone, no checks) to `frozen` (no changes ever). Apply per path: `riperflow protect set src/auth locked`. The generated rule files instruct the AI to check `protection.md` before any modification.

**Dashboard.** Live view of mode, phase, memory-bank file sizes, recent commands, violations. Web version uses Express + WebSocket for real-time updates, **bound to `127.0.0.1` only** and protected by a per-project bearer token in `.riper/dashboard.token` (mode 0600). The token is auto-injected into the served HTML so the local browser tab "just works."

**MCP.** Generates Model Context Protocol config files for each tool that supports MCP (Claude Code, Cursor, OpenCode, KiloCode, VS Code). One `mcp add <server>` + `mcp generate` cascades the same servers across every tool.

## Status

- 215/215 unit tests pass · Node 20+ · MIT
- Tested end-to-end on Linux; macOS and Windows reports welcome
- Public API stable for v1.x; breaking changes will go in v2

## Contributing

Bug reports, tool integrations, and methodology improvements all welcome.

- **Issues:** https://github.com/nitingupta220/riperflow/issues
- **Discussions:** https://github.com/nitingupta220/riperflow/discussions
- Pull requests should include a test (see `cli/test/`)

## Documentation

Deeper dives (rendered on GitHub):

- [Architecture](https://github.com/nitingupta220/riperflow/blob/main/architecture.md)
- [Product requirements (PRD)](https://github.com/nitingupta220/riperflow/blob/main/PRD.md)
- [Test report](https://github.com/nitingupta220/riperflow/blob/main/TEST-REPORT.md)

## License

MIT — see [LICENSE](./LICENSE).
