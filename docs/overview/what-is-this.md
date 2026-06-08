# What is Odysseus?

Odysseus is a self-hosted AI workspace: one web app, running on your own machine, that gives you chat with any LLM, an autonomous agent, local model serving, deep research, and a personal productivity suite (email, calendar, notes, documents) — all wired to the same memory.

## The problem it solves

Hosted AI products (ChatGPT, Claude.ai) bundle a great UI with someone else's infrastructure: your conversations, files, email, and habits live on their servers, and your model choice is their model choice. The self-hosted alternatives mostly solve one slice — a chat UI here, a model runner there, a RAG pipeline somewhere else — and leave you to glue them together.

Odysseus is the glue, pre-applied. It is local-first and privacy-first: the app, the database, the vector store, the search engine, and (if you want) the models themselves all run on hardware you control.

## The mental model

Think of Odysseus as three layers sharing one brain:

1. **A chat layer** — talk to any model. Local servers (vLLM, llama.cpp, Ollama, LM Studio) and remote APIs (OpenAI, OpenRouter, GitHub Copilot, Anthropic-compatible) are all just *endpoints*; you add them in Settings and switch freely mid-workflow.
2. **An agent layer** — hand the model tools. In agent mode the LLM can run shell commands, read and write files, search the web, send email, manage your calendar, serve models, and call MCP servers, looping until the task is done. Every tool is permission-gated per user.
3. **A workspace layer** — the things the agent acts *on*. Email inboxes, a CalDAV-synced calendar, notes and scheduled tasks, a multi-tab document editor, an image gallery, and a deep-research engine.

The shared brain is **memory**: a persistent store of facts and preferences (keyword + vector indexed) plus **skills** (reusable procedures). Every chat and agent run retrieves from it, so the system gets more useful over time instead of starting cold each session.

## Architecture at a glance

```
                       Browser (PWA)  /  Phone (companion pairing)
                       Claude Code / Codex CLI (scoped API tokens)
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │     Odysseus (FastAPI)        │
                       │  auth · routes · agent loop   │
                       │  scheduler · email pollers    │
                       └──┬───────┬────────┬───────┬──┘
                          │       │        │       │
              ┌───────────┘       │        │       └──────────────┐
              ▼                   ▼        ▼                      ▼
        LLM endpoints       ChromaDB    SearXNG               ntfy
   (vLLM · llama.cpp ·    (vector      (web search,       (push
    Ollama · OpenAI ·      memory,      self-hosted)       notifications)
    OpenRouter · Copilot)  RAG)
              │
              ▼
        Cookbook: scans your GPU/RAM, recommends models,
        downloads them, and serves them locally
```

Everything below the FastAPI box is replaceable or optional. No ChromaDB? Memory degrades gracefully to keyword search. No local GPU? Point an endpoint at any OpenAI-compatible API. The Docker Compose stack bundles ChromaDB, SearXNG, and ntfy so the default install needs zero external accounts.

All state lives in one place: SQLite (`data/app.db`) for sessions, messages, documents, email, and calendar; JSON files in `data/` for settings, auth, and memory; ChromaDB for vectors. See [data directory](../reference/data-directory.md).

## How it all fits together: one realistic flow

You type into chat: *"Find me three recent papers on speculative decoding, summarize them, and put a reading block on my calendar Friday morning."*

1. The request hits `POST /api/chat_stream`. Auth middleware identifies you and your privileges.
2. The context builder pulls your top relevant **memories** (it knows you prefer dense technical summaries) and prepends the system prompt.
3. Because tools are enabled, the **agent loop** starts: the model calls `web_search` (routed through your SearXNG container), fetches and reads the papers, and writes a summary.
4. The model calls the calendar tool to create Friday's event — which later syncs out via CalDAV to your phone.
5. Tokens stream back to your browser over SSE the whole time; the finished conversation is persisted to SQLite, and anything worth remembering can be saved to memory.

One request touched chat, agent, search, calendar, and memory. That integration — not any single feature — is the point of Odysseus.

## What Odysseus is not

- **Not a hosted service.** There is no cloud component, telemetry, or account server. If your machine is off, Odysseus is off.
- **Not a model runtime.** It orchestrates vLLM/llama.cpp/Ollama; it doesn't implement inference itself. Cookbook installs and launches the runtimes for you.
- **Not a public-facing app.** It's an admin console for trusted users on a private network. Shell access, email sending, and model serving are real powers — see [THREAT_MODEL.md](../../THREAT_MODEL.md) before exposing it beyond localhost.
- **Not finished.** Version 1.0, moving fast, self-described as "more jank and fun." The [ROADMAP](../../ROADMAP.md) lists the rough edges honestly.

## Where to go next

- New to all of this → [onboarding](../getting-started/onboarding.md)
- Want it running now → [quickstart](../getting-started/quickstart.md)
- Want the engineering detail → [system design](../architecture/system-design.md)
