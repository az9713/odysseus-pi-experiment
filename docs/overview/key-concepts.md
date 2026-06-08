# Key concepts

Every term these docs use without re-explaining. Grouped by domain.

## Models and chat

**Endpoint** — A connection to an LLM server: a base URL plus optional API key, added in Settings. Local servers (Ollama at `http://localhost:11434/v1`, a vLLM serve, llama.cpp) and remote APIs (OpenAI, OpenRouter) are all endpoints. Odysseus auto-detects the provider type (OpenAI-compatible, Anthropic, Ollama, GitHub Copilot) and routes requests to the right API shape.

**Model discovery** — Odysseus probes configured hosts (`LLM_HOST`, `LLM_HOSTS`) on common serve ports to find available models automatically, so a freshly served model appears in the model picker without manual registration.

**Session** — One conversation: a named thread of messages bound to an endpoint, a model, and settings. Sessions persist in SQLite, can be archived, foldered, exported (TXT/HTML/Markdown), and resumed.

**Preset** — A saved conversation template: system prompt, temperature, max tokens, character name. Apply a preset to start sessions with consistent behavior.

**Compare** — Side-by-side testing of two models on the same prompt. In *blind mode* the models are anonymized as "Model A"/"Model B" until you vote, eliminating brand bias.

**Streaming** — Responses arrive token-by-token over Server-Sent Events (SSE) via `POST /api/chat_stream`. A non-streaming `POST /api/chat` also exists.

## Agent

**Agent mode** — Chat where the model can invoke tools. The LLM emits tool calls, Odysseus executes them, feeds results back, and the model continues — looping until the task is done. See [agent & tools](../concepts/agent-and-tools.md).

**Tool** — One capability the agent can invoke: `bash`, `read_file`, `write_file`, `web_search`, `send_email`, calendar management, model serving, and dozens more. Each has a JSON schema and a security gate.

**Plan mode** — A read-only agent constraint: only non-mutating tools (read, grep, list, search) are allowed, so the agent can investigate and propose without changing anything.

**MCP (Model Context Protocol)** — A standard for exposing tool servers to LLMs. Odysseus is an MCP *client* (admins can register external MCP servers, stdio/SSE/HTTP) and ships built-in MCP servers for email, memory, RAG, and image generation.

**AI-to-AI tools** — Agent tools (`chat_with_model`, `send_to_session`, `pipeline`, `ask_teacher`) that let the agent delegate to *other* models: one-shot questions, worker sessions, multi-step chains, or escalation to a teacher.

**Teacher escalation** — A student-teacher pattern for self-hosted models: when a small local model fails an agent task, the problem escalates to a configured stronger "teacher" model, and a successful teacher answer is distilled into a skill so the student improves permanently.

**Privilege** — A per-user capability flag (`agent`, `bash`, `documents`, `research`, `images`, `memory`, message caps, model allowlists). Admins have everything; non-admins are blocked from shell, file, email, and all `mcp__*` tools by default. Defined in `core/auth.py`, enforced in `src/tool_security.py`.

**Internal tool token** — A random per-process secret that lets the agent loop call Odysseus's own HTTP API (loopback) without a user session. Never persisted, never sent to clients.

## Memory and knowledge

**Memory** — A stored fact or preference about you ("prefers metric units", "works at Acme"). Retrieved automatically into chat context via *hybrid retrieval*: vector similarity blended with a keyword (BM25-style) score and a small recency factor, with query-aware boosts for identity, contact, and preference categories; keyword-only when vectors are unavailable.

**Skill** — A user-editable, versioned procedure the agent can follow (SKILL.md format: description, steps, pitfalls, verification). Skills can be hand-written, imported from a URL, or *learned* by the agent, and can be auto-tested with an LLM-as-judge grader.

**RAG (retrieval-augmented generation)** — Including your own documents in chat context. Personal docs in `data/personal_docs/` are indexed; sessions with RAG enabled retrieve relevant chunks per message.

**ChromaDB** — The vector database (bundled in Docker, port 8100 on the host) backing memory and RAG vector search. If unavailable, vector search returns nothing and keyword search still works — degraded, not broken.

**fastembed** — Local ONNX embedding fallback (`sentence-transformers/all-MiniLM-L6-v2`, ~50MB, downloaded on first use) used when no HTTP embedding endpoint is configured.

## Cookbook

**Cookbook** — The local-model manager: scans your hardware, scores every catalog model for fit, downloads the ones you pick, installs serve engines, and launches serves. Built on llmfit. See [Cookbook](../concepts/cookbook.md).

**Fit score** — Cookbook's composite ranking of a model for *your* hardware: quality (family, parameter count, quant penalty) + estimated speed + VRAM fit + context headroom, weighted per use case.

**Serve engine** — The runtime that actually executes a model: vLLM (CUDA/ROCm, multi-GPU), llama.cpp (GGUF, the only path on macOS/consumer-AMD/Windows-native), Ollama, or SGLang. Cookbook installs these into `data/local/`.

**GGUF / FP8 / AWQ** — Quantization formats. GGUF is llama.cpp's format (Q4_K_M etc.); FP8/AWQ are vLLM-oriented. Cookbook filters recommendations to formats your serve path supports.

## Productivity suite

**Document** — A versioned text artifact in the multi-tab editor (Markdown, HTML, CSV, code). Every save can snapshot a `DocumentVersion`; AI assists with edits and suggestions rather than writing for you.

**Note** — A Keep-style note or checklist with color labels, pinning, due dates, and repeat intervals.

**Scheduled task** — A cron-like job (once / daily / weekly / monthly / cron expression, timezone-aware) that sends email, runs an action (serve a model, sync email, run research), or fires a reminder.

**Notification channel** — Where reminders land: browser push, email, or **ntfy** (the bundled pub-sub notification server on port 8091, which can ping your phone).

**Triage** — The email AI pipeline: background pollers summarize new mail, draft replies in your style, flag urgency, and auto-file spam.

**CalDAV** — The calendar sync protocol. Odysseus pulls from and writes back to Radicale, Nextcloud, Apple, or Fastmail calendars; events are keyed by VEVENT UID so re-syncs are stable.

## Access and integration

**API token** — A bearer credential (`ody_...`) with explicit *scopes*, created in Settings, for external clients. See [API tokens & scopes](../reference/api-tokens-and-scopes.md).

**Scope** — One permission a token carries, e.g. `chat`, `todos:write`, `email:draft`, `calendar:read`, `memory:write`. The codex agent endpoints additionally enforce `cookbook:read` / `cookbook:launch`.

**Companion pairing** — The QR-code flow that mints a chat-scoped API token so a phone or tablet on your LAN can connect without typing credentials. Admin-only minting; the raw token is shown once.

**Integration plugin** — The downloadable skill/plugin bundle (`/api/claude/plugin.zip`, `/api/codex/plugin.zip`) that teaches Claude Code or Codex CLI to drive your Odysseus (todos, email, memory, calendar, documents, cookbook) through scoped tokens.

**Webhook** — An inbound trigger: external services (GitHub, Slack, anything that can POST) fire an Odysseus action — send to a chat session, send email, run a script.

## Deployment

**The bundled stack** — `docker compose up` starts four services: Odysseus (7000), ChromaDB (8100), SearXNG (8080), ntfy (8091) — all bound to `127.0.0.1` by default.

**SearXNG** — The self-hosted metasearch engine providing web search without an external API key. Other providers (Brave, DuckDuckGo, Tavily, Serper, Google PSE) are configurable in Settings.

**GPU overlay** — An extra compose file (`docker/gpu.nvidia.yml` or `docker/gpu.amd.yml`) layered via `COMPOSE_FILE` in `.env` to pass your GPU into the container. Passthrough alone isn't enough — serve engines still need CUDA/ROCm builds installed via Cookbook → Dependencies.

**`data/`** — The single directory holding all your state. Back it up and you've backed up Odysseus. See [data directory](../reference/data-directory.md).
