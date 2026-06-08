# System design

The technical architecture for people who will work *on* Odysseus, not just use it. Companion reading: [THREAT_MODEL.md](../../THREAT_MODEL.md) for the security boundary and [CONTRIBUTING.md](../../CONTRIBUTING.md) for workflow.

## High-level architecture

```
┌─────────────────────────── clients ────────────────────────────┐
│  Browser SPA/PWA      Phone (token)      Claude Code / Codex   │
│  (static/, vanilla JS) (companion/*)     (/api/codex/*)        │
└────────────┬────────────────┬──────────────────┬───────────────┘
             │ cookie session │ bearer token      │ bearer token + scopes
             ▼                ▼                  ▼
┌─────────────────────── FastAPI app (app.py) ────────────────────┐
│  middleware: CORS → request timeout → auth → security headers   │
│  ~40 routers (routes/)  ·  static file serving (no-cache)       │
│                                                                  │
│  src/: chat pipeline · agent loop · tool execution · memory     │
│        endpoint resolver · deep research · schedulers/pollers   │
│  core/: auth · database · session manager · middleware          │
│  services/: search · hwfit · memory · research · stt/tts · …    │
│  mcp_servers/: email · memory · rag · image-gen (stdio MCP)     │
└──────┬──────────┬───────────┬───────────┬───────────┬──────────┘
       ▼          ▼           ▼           ▼           ▼
   SQLite     ChromaDB     SearXNG      ntfy      LLM endpoints
  data/app.db (vectors)   (search)    (notify)   vLLM·llama.cpp·
   + JSON                                         Ollama·OpenAI·…
   files                                          (Cookbook-managed
                                                   or external)
```

## Component breakdown

| Component | Responsibility |
|-----------|---------------|
| `app.py` | Bootstrap: env loading (UTF-8-BOM tolerant), middleware stack, ~40 router includes, lifespan (MCP connections, tool-index warmup, endpoint pings, scheduler start) and shutdown (temp cleanup, scheduler stop, MCP disconnect) |
| `core/` | Auth (bcrypt + TOTP 2FA + privileges), SQLAlchemy models and engine, session/message persistence, security middleware, atomic file I/O |
| `routes/` | One module per feature area: chat, session, document, email (+pollers), calendar, cookbook/hwfit, memory, skills, tasks, notes, compare, research, gallery, vault, webhooks, tokens, codex/companion integration, admin |
| `src/` | The business logic: chat pipeline (`chat_handler` → `chat_processor` → `llm_core`), agent loop + tool execution + tool security, endpoint resolution, memory (keyword + vector), deep research, task scheduler, background jobs, MCP manager, prompt security |
| `services/` | Self-contained service packages: search (multi-provider), hwfit (Cookbook scoring), memory/skills, research orchestration, shell, STT/TTS, docs extraction, youtube |
| `static/` | Vanilla-JS ES-module SPA (~80 modules, dependency-ordered), PWA manifest generated per route, CSP-nonce'd inline scripts |
| `mcp_servers/` | Built-in stdio MCP servers reusing src/ logic, consumed by the agent loop |

## Key data flows

**Chat:** `POST /api/chat_stream` → auth middleware (sets `request.state.current_user` + privileges) → preprocessing (presets, attachments, vision, YouTube) → context assembly (hybrid memory retrieval + RAG + history + untrusted-content policy preamble) → provider-shaped LLM request → SSE token stream → persist to `ChatMessage`.

**Agent:** same entry, plus the tool loop — parse tool blocks from model output → gate via `tool_security` → execute (often via HTTP loopback authenticated with the in-process `INTERNAL_TOOL_TOKEN`) → append `<tool_result>` → re-prompt until completion.

**Cookbook serve:** UI → `routes/cookbook_routes.py` → command composed per engine → detached process (tmux/subprocess) → logs streamed over an exempted long-poll → served model discovered as a chat endpoint.

**Email triage:** in-process pollers (gated by `ODYSSEUS_INPROCESS_POLLERS`) fetch via IMAP → LLM summarize/draft/classify → results into SQLite → UI and notification channels.

**Scheduled task:** scheduler loop (~10s tick) → due tasks computed timezone-aware (croniter + ZoneInfo) → action handler or detached job (`src/bg_jobs.py`) with `.pid`/`.exit` state files → `TaskRun` recorded.

## Design decisions and their rationale

These are observed decisions with rationale grounded in the code and project docs — recorded so future changes are made knowingly.

**SSE over WebSockets for streaming.** Chat streaming uses Server-Sent Events through plain HTTP. Cost: no bidirectional channel (stop is a separate POST). Benefit: works through every proxy, no connection-upgrade complexity, trivially resumable (`/api/chat/resume/{id}`). Streaming endpoints are exempted from the global 30s request timeout instead.

**Hybrid memory with a keyword-only fallback mode.** Two indexes — BM25-style keyword scoring and ChromaDB vectors — blended as `0.55·vector + 0.40·keyword + 0.05·recency` when embeddings are healthy, switching to `0.95·keyword + 0.05·recency` when they aren't (`src/chat_processor.py:147`). Rationale: semantic recall leads when available, but keyword search has zero dependencies, so the system stays useful when ChromaDB is absent — degradation, not failure. The same pattern (built-in default + pluggable upgrade) recurs in search providers and embeddings (fastembed fallback).

**Vanilla JS frontend, no build step.** ~80 ES modules loaded in dependency order, no bundler, no framework. Cost: large files (document.js, chat.js are hundreds of KB), manual dependency ordering. Benefit: zero toolchain for contributors, `Cache-Control: no-cache` makes every refresh current after upgrades, and the app stays hackable with a text editor — consistent with the self-hosting ethos.

**Localhost-first binding everywhere.** App and all bundled services default to `127.0.0.1`; exposure is an explicit opt-in (`APP_BIND`, `NTFY_BIND`, …). Odysseus is an admin console with shell access — the safe default must be the lazy default, and remote access is delegated to layers built for it (Tailscale, reverse proxy, VPN).

**Deny-list for users, allow-list for plan mode.** Non-admin gating uses a deny-list (`NON_ADMIN_BLOCKED_TOOLS`) that fails closed (malformed names and all `mcp__*` blocked); plan mode flips to an allow-list of known-read-only tools. Rationale: user gating must not break when new benign tools are added; plan mode's guarantee ("nothing changes") is only sound as an allow-list.

**Tool calls auto-execute, control lives in privileges.** No per-call approval prompt; instead, per-user capability flags and plan mode. Trade-off accepted: smoother agent UX for trusted users, at the cost of needing real trust boundaries — which is why the threat model insists on private-network deployment.

**Config split: `.env` for boot, Settings for everything else.** Only deployment-level values (bind, port, DB URL, auth toggles) live in `.env`; providers/search/email live in `data/settings.json`, editable live in the UI. Onboarding friction was the stated driver: clone → run → click.

**File-state background jobs.** Detached processes record `.pid`/`.exit` files rather than in-memory state; singleflight dedup prevents double-launches. Serves and long jobs survive app restarts and remain observable (tmux) — operational robustness over architectural purity.

**Internal tool loopback token.** Agent tools that call Odysseus's own API authenticate with a random per-process token, never persisted or sent to clients, combined with direct-loopback detection that ignores spoofable proxy headers. This keeps "the agent can use the app" from becoming "anyone on the network can use the app".

## Security model (summary)

- **Sessions:** bcrypt passwords, 7-day tokens, atomic writes, orphan cleanup; optional TOTP 2FA with backup codes; reserved usernames (`internal-tool`, `api`, `demo`, `system`).
- **Privileges:** per-user capability flags; admin vs. default profiles ([agent & tools](../concepts/agent-and-tools.md)).
- **API tokens:** scoped, hashed at rest, cached in middleware ([reference](../reference/api-tokens-and-scopes.md)).
- **Headers/CSP:** `X-Frame-Options: DENY`, nonce-based `script-src`, `nosniff`, `no-referrer`.
- **Prompt injection:** untrusted content wrapped with explicit do-not-follow framing (`src/prompt_security.py`); mitigation, not immunity.
- **Known gaps** (acknowledged in [THREAT_MODEL.md](../../THREAT_MODEL.md)): no shell/filesystem sandbox for agent tools; coarse token scopes in places; `src/search/` consolidation in progress.

## Scaling characteristics

Odysseus targets one host, one to a handful of trusted users. SQLite is the database (fine at this scale; the in-process pollers/schedulers assume a single app process — the `ODYSSEUS_INPROCESS_*` flags exist precisely to avoid two schedulers racing on it). Session metadata lazy-loads with a per-owner cap. The heavy resource consumer is model serving, which is intentionally out-of-process (vLLM/llama.cpp) and can live on entirely different machines via Cookbook's SSH remote serving.

## External dependencies

| Dependency | Role | If absent |
|-----------|------|----------|
| ChromaDB | vector memory/RAG | keyword-only retrieval (degraded) |
| SearXNG | default web search | other providers or no search |
| ntfy | push notifications | browser/email channels |
| LLM endpoints | all intelligence | nothing works — the one hard requirement |
| tmux (native) | Cookbook background jobs | no background downloads/serves |
| fastembed | embedding fallback | HTTP embedding endpoint required for vectors |
