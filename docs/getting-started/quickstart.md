# Quickstart

From zero to your first chat in under 15 minutes. Check [prerequisites](prerequisites.md) first (Docker path needs only Docker + Git).

Defaults work out of the box — you will not edit any config file in this guide. Models, search, and email are all configured inside the app afterward.

## Docker (recommended)

1. Clone and enter the repo:

   ```bash
   git clone https://github.com/pewdiepie-archdaemon/odysseus.git
   cd odysseus
   ```

2. (Optional but recommended) copy the env template so defaults are explicit:

   ```bash
   cp .env.example .env
   ```

3. Build and start the stack:

   ```bash
   docker compose up -d --build
   ```

   First build takes a few minutes. When it settles, `docker compose ps` shows four services — `odysseus`, `chromadb`, `searxng`, `ntfy` — with odysseus `running` and searxng `healthy`.

4. Grab your generated admin password:

   ```bash
   docker compose logs odysseus | grep -i password
   ```

   Expected output (your password will differ):

   ```text
   [ok] Initial admin user created (admin)
         Temporary password: kJ8x...Qw2
         ** Change it after first login. Set ODYSSEUS_ADMIN_PASSWORD to choose your own. **
   ```

5. Open **http://localhost:7000**, log in as `admin` with that password, and change it in **Settings** when prompted.

6. Connect a model — pick whichever matches you:
   - **You already run Ollama on this machine:** Settings → endpoints → add `http://host.docker.internal:11434/v1`. (Ollama must listen beyond loopback: start it with `OLLAMA_HOST=0.0.0.0:11434 ollama serve`.)
   - **You have an API key (OpenAI, OpenRouter, …):** Settings → add the provider and paste the key.
   - **You have a GPU and want a local model:** open **Cookbook**, let it scan your hardware, click a recommended model to download, then **Serve**. (GPU-in-Docker needs a one-time overlay setup — see [Docker deployment](../deployment/docker.md).)

7. Pick the model in the chat header and say hello. Tokens should stream in live.

**What just happened:** Compose started Odysseus plus its three companions (ChromaDB for vector memory, SearXNG for web search, ntfy for notifications), all bound to `127.0.0.1` so nothing is exposed to your network. `setup.py` ran inside the container: created `data/`, initialized the SQLite database, and minted the admin account. Your chat went browser → FastAPI → your chosen endpoint, streamed back over SSE, and was persisted to `data/app.db`.

## Native Linux / macOS

1. Clone, create a venv, install, set up:

   ```bash
   git clone https://github.com/pewdiepie-archdaemon/odysseus.git
   cd odysseus
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python setup.py
   ```

   `setup.py` prints the admin username and temporary password — copy it.

2. Start the server:

   ```bash
   python -m uvicorn app:app --host 127.0.0.1 --port 7000
   ```

3. Open **http://localhost:7000**, log in, change the password, and connect a model as in step 6 above (native installs reach a local Ollama at `http://localhost:11434/v1`).

> **Tip:** On Apple Silicon, use `./start-macos.sh` instead — it installs Homebrew deps (tmux, llama.cpp), handles the venv and setup, opens your browser, and serves on port **7860** (AirPlay tends to squat on 7000).

## Native Windows

1. One command does everything (venv, deps, setup, server; safe to re-run):

   ```powershell
   git clone https://github.com/pewdiepie-archdaemon/odysseus.git
   cd odysseus
   powershell -ExecutionPolicy Bypass -File .\launch-windows.ps1
   ```

2. Copy the printed admin password, open **http://localhost:7000**, log in, change it.

3. Easiest local model on Windows: install [Ollama](https://ollama.com/download), then add `http://localhost:11434/v1` in Settings. (vLLM/SGLang GPU serving needs Linux or WSL2.)

## Verify your install

- Chat streams a reply → core loop works.
- **Settings → diagnostics** (or `docker compose logs odysseus | grep -E 'ChromaDB|DEGRADED'`) shows no degraded services → memory and search are healthy.
- Ask in chat: *"Remember that I'm testing Odysseus today."* then start a new session and ask *"What am I doing today?"* → memory round-trip works.

## Next steps

- [Onboarding](onboarding.md) — the guided mental model and first-hour tour
- [Cookbook](../concepts/cookbook.md) — get a local model recommended, downloaded, and served
- [Troubleshooting](../troubleshooting/common-issues.md) — if anything above didn't match
