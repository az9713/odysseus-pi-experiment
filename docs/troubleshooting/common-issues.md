# Common issues

Ordered roughly by how often people hit them. Each: symptom → cause → exact fix.

## I never saw the admin password

**Cause:** Setup prints it once to the terminal; in Docker it's in the container logs, which scroll away.

**Fix:**

```bash
docker compose logs odysseus | grep -i password
```

Native installs: re-run `python setup.py` — it's idempotent and won't overwrite an existing admin, so if the account exists but you lost the password, delete the user's entry from `data/auth.json` (or the whole file if you're the only user) and run setup again. To pre-seed instead, set `ODYSSEUS_ADMIN_PASSWORD` in `.env` before first boot.

## Port 7000 is already in use / page won't load

**Cause:** Another service holds 7000 — on macOS, AirPlay Receiver commonly does.

**Fix:** Set `APP_PORT=7001` in `.env` and recreate (`docker compose up -d`), or pass a different `--port` to uvicorn. Note `start-macos.sh` already defaults to **7860** for this reason — check which port your launcher actually printed.

## Ollama models don't appear (Docker install)

**Cause:** Inside the container, `localhost:11434` is the *container*, not your host. Additionally Ollama only listens on loopback by default.

**Fix:**

1. Start Ollama listening on all interfaces:

   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```

2. In Odysseus **Settings**, add the endpoint:

   ```text
   http://host.docker.internal:11434/v1
   ```

## ChromaDB silently degraded / memory vector search returns nothing

**Symptom:** logs mention `DEGRADED` or `MemoryVectorStore` fallback; memory still "works" but recall feels keyword-literal.

**Cause (native installs):** the full `chromadb` package and the lightweight `chromadb-client` conflict — if both are present, ChromaDB falls back to HTTP-only mode and fails.

**Fix:**

```bash
./venv/bin/pip uninstall chromadb-client -y
./venv/bin/pip install --force-reinstall chromadb
```

**Docker:** check the service is actually up — `docker compose ps` should show `chromadb` running; then:

```bash
docker compose logs odysseus | grep -E 'ChromaDB|MemoryVectorStore|DEGRADED'
```

## GPU passes through but models still run on CPU

**Symptom:** `docker compose exec odysseus nvidia-smi -L` lists your GPU, yet Cookbook serve logs show `Unable to find cudart library`, `Could NOT find CUDAToolkit`, or layers assigned to CPU.

**Cause:** Passthrough and runtime are different layers. The overlay only exposes devices; llama.cpp/vLLM also need CUDA (or ROCm) userspace builds.

**Fix:** Re-install the serve engine via **Cookbook → Dependencies** to get a CUDA-enabled build. Same logic on AMD: `/dev/kfd` visible ≠ ROCm userspace present.

**If that doesn't work:** run the diagnostic and follow its verdicts:

```bash
scripts/check-docker-gpu.sh
```

## Cookbook downloads/serves never start (native install)

**Cause:** Cookbook uses tmux for background jobs on Linux/macOS, and `bash.exe` (Git for Windows) on Windows.

**Fix:** `sudo apt install tmux` / `brew install tmux`; on Windows install [Git for Windows](https://git-scm.com/download/win). Then retry the download.

## Web search returns nothing

**Cause:** SearXNG isn't healthy, or no provider is configured for a native (non-Docker) install.

**Fix (Docker):**

```bash
docker compose ps           # searxng should be 'healthy'
docker compose logs --tail=60 searxng
```

**Fix (native):** there's no bundled SearXNG outside Docker — point `SEARXNG_INSTANCE` at one you run, or pick another provider (DuckDuckGo needs `pip install -r requirements-optional.txt`; Brave/Tavily/Serper need keys) in **Settings → search**.

## CalDAV sync fails against my LAN server (Radicale, local Nextcloud)

**Symptom:** sync errors mentioning a blocked or invalid URL for a `192.168.x.x` / `10.x.x.x` / `localhost` CalDAV server.

**Cause:** SSRF protection blocks private-IP CalDAV URLs by default.

**Fix:** set in `.env` and restart:

```bash
ODYSSEUS_ALLOW_PRIVATE_CALDAV=1
```

Also double-check the *collection* URL Radicale expects (typically `http://host:5232/user/calendar-slug/`), not just the server root.

## Agent says a tool is unavailable / 403 from the integration API

**Cause:** Permission gates working as designed, in one of three layers: the user lacks a privilege (non-admins get no shell/file/email tools), plan mode is on (read-only allow-list), or the API token lacks a scope.

**Fix:** Check in this order — is the user admin? is plan mode toggled? does the token carry the scope the [reference table](../reference/api-tokens-and-scopes.md) lists for that endpoint? Adjust in **Settings** (users / integrations) rather than working around the gate.

## Login loops or session expires immediately behind a reverse proxy

**Cause:** Cookies marked `Secure` aren't sent over plain HTTP (or vice versa: HTTPS termination without `SECURE_COOKIES`).

**Fix:** Serve through HTTPS at the proxy and set `SECURE_COOKIES=true`; keep `AUTH_ENABLED=true` and `LOCALHOST_BYPASS=false`; proxy to `http://127.0.0.1:7000`. See [remote access & HTTPS](../deployment/remote-access.md).

## First chat reply is very slow, later ones are fine

**Cause:** Cold starts are real: a local model loads into VRAM on first request; fastembed downloads its ONNX model (~50MB) on first memory/RAG use; the first vision call warms the pipeline.

**Fix:** Nothing — it's warm-up, not a bug. Pre-serve your model via Cookbook before you need it, or schedule a serve at the start of your workday.

## Email feels slow

**Cause:** Often the upstream IMAP provider's latency (folder selects and fetches), amplified by remote providers. A performance audit is an open roadmap item.

**Fix:** Reduce poll frequency in account settings; prefer a nearby/self-hosted IMAP where possible. For self-hosted Dovecot on a LAN, also ensure cleartext auth is permitted for local connections if you see login failures (`disable_plaintext_auth = no` for the LAN listener).

## Where to look when something else breaks

```bash
docker compose ps                            # are all four services up?
docker compose logs --tail=120 odysseus      # app log
docker compose logs odysseus | grep -E 'ChromaDB|MemoryVectorStore|DEGRADED'
```

Native installs log to `logs/`. For Cookbook job failures, the actual command and its output are in the task's log view (and the tmux session on native installs: `tmux ls`). If you've found a fresh-install bug, the project actively wants the report — see [CONTRIBUTING.md](../../CONTRIBUTING.md).
