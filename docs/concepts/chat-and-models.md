# Chat and models

How a message becomes an answer: endpoints, provider detection, context assembly, streaming, presets, and the Compare tool.

## What it is

The chat subsystem is Odysseus's core loop: take a user message, assemble context (history + memories + RAG + attachments), send it to the session's LLM endpoint, stream the reply back, persist everything. Every other feature — agent, research, email triage — rides on this pipeline.

## Endpoints and providers

An endpoint is a base URL plus optional API key and headers, managed in **Settings**. Odysseus normalizes the URL and detects the provider dialect, then builds the right request shape (`src/endpoint_resolver.py`):

| Provider | Chat path used |
|----------|---------------|
| OpenAI-compatible (vLLM, llama.cpp server, Ollama's `/v1`, OpenRouter, LM Studio) | `{base}/chat/completions` |
| Anthropic-compatible | `{base}/v1/messages` |
| Ollama native | `{base}/chat` |
| GitHub Copilot | `https://api.githubcopilot.com/chat/completions` (OAuth device flow, see [integrations](integrations.md)) |

**Model discovery** scans `LLM_HOST`/`LLM_HOSTS` on common serve ports (including Ollama's 11434), so locally served models appear in the picker automatically. Failed hosts get a short cooldown (~20s) before being re-tried, so one dead server doesn't stall the UI. If DNS fails, a Tailscale-hostname fallback is attempted — handy for models living on another machine in your tailnet.

> **Note:** Providers with non-standard TLS chains (corporate gateways, GigaChat) can be trusted by pointing `LLM_CA_BUNDLE` at a PEM file — verification stays on, the trust set just grows. See [env-vars](../reference/env-vars.md).

## The message pipeline

```
POST /api/chat_stream
  │ auth middleware → user, privileges, message quota
  ▼
preprocessing (src/chat_handler.py)
  │ preset applied · attachments resolved (files, images→vision, YouTube→transcript)
  ▼
context assembly (src/chat_processor.py)
  │ system preamble (date/time, timezone, untrusted-content policy)
  │ + top-scoring memories via hybrid retrieval
  │ + RAG chunks if the session has RAG on
  │ + conversation history
  ▼
LLM call (src/llm_core.py) — provider-shaped request, streaming
  ▼
SSE stream to browser, token by token
  ▼
persist to SQLite (ChatMessage), update session counters
```

Two endpoints exist: `POST /api/chat` (single response) and `POST /api/chat_stream` (SSE). Streaming sessions can be stopped mid-flight (`POST /api/chat/stop/{session_id}`) and resumed after a page reload (`GET /api/chat/resume/{session_id}`), so an accidental tab close doesn't kill a long generation.

## Sessions

Sessions are rows in SQLite (`Session` table): name, endpoint, model, owner, RAG flag, archive state, folder. Messages hydrate lazily — the sidebar loads metadata only, so hundreds of sessions stay cheap.

Useful operations beyond create/rename/delete:

- **Export** to TXT, HTML, or Markdown (multimodal content flattened to text).
- **Compact** — strip message runs to shrink context for long-running threads.
- **Important flag, folders, archive** — organization for the long haul.
- **Per-user ownership** — in multi-user installs you only see your own sessions.

## Presets

A preset bundles system prompt, temperature, max tokens, and character name into a reusable template. Stored in `data/presets.json`, applied at session start or mid-session. Use them for personas ("terse code reviewer"), recurring workflows, or per-model tuning.

## Attachments and vision

Drop files into chat: images go to a vision-capable model for analysis, PDFs are text-extracted (and page-rendered if PyMuPDF is installed), YouTube links fetch transcripts. Upload sizes are capped (see `src/upload_limits.py`).

## Compare: blind model testing

Compare runs the same prompt against two models side-by-side:

1. **Compare → start** creates two ephemeral sessions (named `[CMP]…`).
2. In **blind mode**, models are shuffled and labeled "Model A"/"Model B" — you can't see which is which.
3. Both stream simultaneously; you vote for a winner (or tie).
4. Votes and transcripts persist (`Comparison` table) so you can review your own preferences over time.

Blind mode is the honest way to answer "is the 8B local model actually worse than the API model *for my tasks*?" — brand names bias everyone.

## Interaction with other subsystems

- **Memory** feeds every chat automatically ([memory & skills](memory-and-skills.md)).
- **Agent mode** extends this same pipeline with tool execution ([agent & tools](agent-and-tools.md)).
- **Cookbook** serves produce local endpoints that show up via model discovery ([cookbook](cookbook.md)).
- Web **search results** can be overlaid into chat context when search is invoked.

## Configuration

| Setting | Where |
|---------|-------|
| Endpoints, API keys, default model | Settings (in-app) |
| Hosts to scan for models | `LLM_HOST`, `LLM_HOSTS` in `.env` |
| Extra TLS roots | `LLM_CA_BUNDLE` in `.env` |
| Presets | Presets panel (stored in `data/presets.json`) |

## Common gotchas

- **Ollama in Docker:** the container can't see `localhost:11434` on your host. Use `http://host.docker.internal:11434/v1` and start Ollama with `OLLAMA_HOST=0.0.0.0:11434 ollama serve`.
- **Model missing from picker:** discovery only scans configured hosts/ports. Add the host to `LLM_HOSTS` or add the endpoint URL explicitly in Settings.
- **Endpoint shows offline with a certificate error:** the provider's CA isn't in the default trust store — see `LLM_CA_BUNDLE` above.
