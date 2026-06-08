# Environment variables

Every variable Odysseus reads from `.env` (or the process environment). Source of truth: [`.env.example`](../../.env.example), Docker Compose files, and `setup.py`.

Most configuration does **not** live here — providers, search, email, and feature settings are managed in-app (Settings) and stored in `data/settings.json`. Use `.env` only for deployment-level values that must exist before first boot.

> **Note:** Unless marked otherwise, "Default" is the value used when the variable is unset.

## LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_HOST` | `localhost` | Primary LLM host for model discovery. |
| `LLM_HOSTS` | — | Additional hosts, comma-separated, hostnames/IPs only. Odysseus scans common serve ports including Ollama's 11434. |
| `OLLAMA_BASE_URL` | — | Explicit Ollama base URL. In Docker, host Ollama is usually `http://host.docker.internal:11434/v1` (requires `OLLAMA_HOST=0.0.0.0:11434` on the host). |
| `LM_STUDIO_URL` | — | LM Studio URL; from Docker typically `http://host.docker.internal:1234` (LM Studio must serve on all interfaces). |
| `OPENAI_API_KEY` | — | OpenAI key. Prefer adding providers in Settings; use this only to pre-seed. |
| `RESEARCH_LLM_ENDPOINT` | — | Pre-seed the Deep Research LLM endpoint, e.g. `http://localhost:8000/v1/chat/completions`. |
| `LLM_CA_BUNDLE` | — | Path to a PEM of extra CA roots, layered on top of the system/certifi bundle. For providers with non-standard TLS chains (corporate gateways, GigaChat). Verification stays on. |

## Search & web

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARXNG_INSTANCE` | `http://localhost:8080` | SearXNG URL. Docker Compose overrides to `http://searxng:8080` in-network. |
| `SEARXNG_SECRET` | generated on first Docker boot | SearXNG cookie/CSRF secret. Leave blank unless you need to pin it. |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./data/app.db` | SQLAlchemy connection string. |

## Auth & security

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_ENABLED` | `true` | Enable login. Keep `true` for anything network-accessible. |
| `APP_BIND` | `127.0.0.1` | Docker Compose host bind address for the web UI. `0.0.0.0` only for intentional LAN/reverse-proxy exposure. |
| `APP_PORT` | `7000` | Docker Compose host port for the web UI (macOS AirPlay often holds 7000 — pick another). |
| `LOCALHOST_BYPASS` | `false` | Development-only auth bypass for loopback requests. Keep `false` for Docker, LAN, proxy, or shared deployments. |
| `SECURE_COOKIES` | `false` | Mark session cookies `Secure`. Set `true` when serving via HTTPS at a trusted proxy/gateway. |
| `ODYSSEUS_ADMIN_PASSWORD` | — | Pre-seed the first admin password during setup. Never commit a real value. |
| `ODYSSEUS_ADMIN_USER` | `admin` | First admin username (read by setup; surfaced in compose files). |
| `ALLOWED_ORIGINS` | localhost-only | CORS allowed origins, comma-separated. Restrict to your public origin in production. |

## ChromaDB & bundled services

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROMADB_HOST` | `localhost` (manual) / `chromadb` (Docker override) | ChromaDB service host. |
| `CHROMADB_PORT` | `8100` (manual) / `8000` (Docker override) | ChromaDB port. Manual runs typically map `-p 8100:8000`. |
| `CHROMADB_BIND` | `127.0.0.1` | Docker host-port bind address for ChromaDB. |
| `NTFY_BIND` | `127.0.0.1` | Docker host-port bind for ntfy. Set to a Tailscale IP to expose notifications only on your tailnet. |
| `NTFY_BASE_URL` | `http://localhost:8091` | Public base URL clients use to reach ntfy. Update together with `NTFY_BIND`. |

## RAG / embeddings

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_URL` | `http://{LLM_HOST}:11434/v1/embeddings` | OpenAI-compatible embeddings endpoint. |
| `EMBEDDING_API_KEY` | — | Key for the embeddings endpoint, if any. |
| `EMBEDDING_MODEL` | — | Embedding model name (must exist at the endpoint), e.g. `all-minilm:l6-v2`. |
| `FASTEMBED_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Local ONNX fallback when no HTTP embedding API is reachable (~50MB first-run download). |
| `FASTEMBED_CACHE_PATH` | `~/.cache/fastembed` | fastembed model cache location. |

## Background processing

| Variable | Default | Description |
|----------|---------|-------------|
| `CLEANUP_INTERVAL_HOURS` | `24` | Periodic cleanup interval. |
| `ODYSSEUS_INPROCESS_POLLERS` | `1` | In-process email pollers. Set `0` if driving polling externally via `scripts/odysseus-mail poll-scheduled` / `poll-summary`, else two schedulers race on the same SQLite. |
| `ODYSSEUS_INPROCESS_TASKS` | `1` | In-process scheduled-task runner. Set `0` to let an external driver fire tasks. Calendar reminders are frontend-driven and unaffected. |
| `ODYSSEUS_SCRIPT_HOST` | `localhost` | Host for the `run_script` scheduled-task action. Empty/`local`/`localhost` runs on the app host; an SSH alias runs scripts remotely — only set deliberately. |

## GPU (Docker Compose)

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPOSE_FILE` | — (CPU) | Overlay selection. NVIDIA: `docker-compose.yml:docker/gpu.nvidia.yml` (Windows uses `;` as separator). AMD: `docker-compose.yml:docker/gpu.amd.yml`. Overlays only expose devices — serve engines still need CUDA/ROCm builds via Cookbook → Dependencies. |
| `RENDER_GID` | — | AMD only: numeric GID of the host `render` group (`getent group render \| cut -d: -f3`). |

## Container identity (Docker)

| Variable | Default | Description |
|----------|---------|-------------|
| `PUID` | `1000` | UID the container drops to before running the app (`id -u` to find yours). The entrypoint repairs ownership of `/app/data` and `/app/logs` to match. |
| `PGID` | `1000` | Matching GID (`id -g`). |

## Setup-script behavior

| Variable | Default | Description |
|----------|---------|-------------|
| `ODYSSEUS_SKIP_ADMIN_PROMPT` | — | Set `1` to force non-interactive admin creation (random generated password). Also automatic when stdin isn't a TTY (Docker). |
| `ODYSSEUS_SKIP_RUN_HINT` | — | Set `1` to suppress setup's "how to start the server" hint (used by launchers). |

## Feature-specific escape hatches

| Variable | Default | Description |
|----------|---------|-------------|
| `ODYSSEUS_ALLOW_PRIVATE_CALDAV` | unset (blocked) | Set `1` to allow CalDAV servers on localhost/private IPs (e.g., LAN Radicale). Off by default as SSRF protection. |

## macOS launcher (`start-macos.sh`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ODYSSEUS_HOST` | `127.0.0.1` | Shell-level bind override; takes precedence over `.env`'s `APP_BIND`. |
| `ODYSSEUS_PORT` | `7860` | Shell-level port override; takes precedence over `.env`'s `APP_PORT`. |

Precedence on macOS: shell env → `.env` → built-in defaults (`127.0.0.1:7860`).

## HuggingFace (Cookbook)

`HF_TOKEN` / HuggingFace credentials for gated models are configured through the Cookbook UI rather than `.env`; in Docker, the HF cache persists at `./data/huggingface`.
