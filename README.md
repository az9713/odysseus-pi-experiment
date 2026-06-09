# 🧪 The Odysseus × pi experiment

> This is an **experiment fork** of [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) that embeds [**pi**](https://github.com/earendil-works/pi) (a minimal terminal coding agent with a strong, model-portable agent loop) as a **long-horizon, memory-aware agent backend** inside Odysseus. The first commit is unmodified upstream Odysseus; everything after is the experiment.

**The goal — "Gain #1": an agent that runs long _and_ knows you.**
Odysseus has persistent memory and your data but a shallow agent loop (≤50 rounds, no compaction). pi runs for hours (auto-compaction, resumable session trees, mid-session model switching) but is amnesiac by design. Neither alone can *work over your life-data across many turns and remember what it learns* — the combination can. Scope of this experiment: **admin-only, memory-only, local-model-first.**

**How it works.** Odysseus spawns `pi --mode rpc` as a session backend (`mode=pi`), translating pi's event stream into Odysseus's existing SSE chat UI. A thin pi extension (`integrations/pi/extension/odysseus-bridge.ts`) gives the agent a scoped `manage_memory` tool and injects your relevant memories into pi's system prompt every turn. Odysseus stays the control plane (identity, policy, models, memory); pi is the execution plane (the loop). Authorization is enforced server-side by scoped `ody_` tokens — the bridge holds no policy of its own.

**Experiments run (against real `gemma4:e4b` via Ollama):**
| Test | Result |
|---|---|
| Phase 0 — can a small local model drive pi's tool loop? | ✅ tool calls + recall across **8 compaction cycles** |
| Offline cross-session memory (record in session A → recall in fresh session B) | ✅ **PASS** — recalled purely via memory injection |
| `pi_backend` module (real model, live event stream) | ✅ PASS (after fixing 2 integration bugs) |
| Live-server HTTP path (`mode=pi` over the real server) | ✅ **PASS** — record in session A, recall in a fresh session B, through real login + admin gate + scoped token + live `/api/codex/memory` |

All four tests pass: **Gain #1 is confirmed end-to-end on the real server** — a fact the agent recorded in one chat session is recalled in a brand-new session, on a local model.

**What we gain (and the honest caveat).** A durable, personal agent neither tool has alone; one shared local-model pool; and a trust boundary around an otherwise permissionless agent. Cost: ~5 files of glue and two bugs that only an end-to-end run surfaced (provider load-order; `DETACHED_PROCESS` breaking subprocess pipes). Worth it **only** for the personal/long-horizon use case — for terminal coding alone, pi by itself is better.

**Read the full story:** [`docs/odysseus-pi-journey.md`](docs/odysseus-pi-journey.md) (goals, tests, what's met and what isn't) · [`docs/odysseus-pi-integration-assessment.md`](docs/odysseus-pi-integration-assessment.md) (analysis + role contract) · [`integrations/pi/README.md`](integrations/pi/README.md) (how to run it).

> Experimental. The pi backend is **admin-only** and triggered by sending `mode=pi` to `/api/chat_stream` (no UI selector yet). Validated on the local dev server with `gemma4:e4b`/Ollama.

---

# Odysseus

```
───────────────────────────────────────────────
 ⊹ ࣪ ˖ ૮( ˶ᵔ ᵕ ᵔ˶ )っ  Odysseus vers. 1.0
───────────────────────────────────────────────
```

![Odysseus](docs/odysseus.jpg)

A self-hosted AI workspace -- meant to be the self-hosted version of the UI experience you get from ChatGPT and Claude. But with more jank and fun. Running on your own hardware, with your own data -- local-first, privacy-first, and no trojan.

## Features
  - **Chat** -- chat with any local model or API; adding them is super simple.<br>　<sub>vLLM · llama.cpp · Ollama · OpenRouter · OpenAI · GitHub Copilot</sub>
  - **Agent** -- hand it tools and let it run the whole task itself.<br>　<sub>built on [opencode](https://github.com/anomalyco/opencode) · MCP · web · files · shell · skills · memory</sub>
  - **Cookbook** -- Scans your hardware, recommends models, click to download and serve.. easy!<br>　<sub>built on [llmfit](https://github.com/AlexsJones/llmfit) · VRAM-aware · GGUF / FP8 / AWQ · fit scoring · vLLM / llama.cpp serving</sub>
  - **Deep Research** -- multi-step runs that gather, read, and synthesize sources into a nice visual report.<br>　<sub>adapted from [Tongyi DeepResearch](https://github.com/Alibaba-NLP/DeepResearch)</sub>
  - **Compare** -- a fun tool to compare models side by side. Test completely blind, no bias!<br>　<sub>multi-model · blind test · synthesis</sub>
  - **Documents** -- YOU write the text, AI is there to assist, not the opposite.<br>　<sub>multi-tab editor · markdown · HTML · CSV · syntax highlighting · AI edits · suggestions</sub>
  - **Memory / Skills** -- Persistent memory and skills, your agent evolves over time as it better understands you and your tasks!<br>　<sub>ChromaDB · fastembed (ONNX) · vector + keyword retrieval · import/export</sub>
  - **Email** -- IMAP/SMTP inbox with AI triage built in: urgency reminders, auto-tag, auto-summary, auto-reply drafts, auto-spam.<br>　<sub>IMAP · SMTP · per-account routing · CalDAV-aware</sub>
  - **Notes & Tasks** -- Quick notes with reminders, a todo list, and scheduled tasks the agent can act on.<br>　<sub>note pings · checklist · cron-style tasks · ntfy / browser / email channels</sub>
  - **Calendar** -- Local-first calendar with CalDAV sync to Radicale / Nextcloud / Apple / Fastmail.<br>　<sub>CalDAV pull · .ics import/export · per-calendar colors · agent-aware</sub>
  - **Works on mobile** -- looks and runs great on your phone, not just desktop.<br>　<sub>responsive · installable (PWA) · touch gestures</sub>
  - **Extras** -- more to explore, happy if you give it a go!<br>　<sub>image editor · theme editor · file uploads (vision + PDF) · web search · presets · sessions · 2FA</sub>

## Demo
A full, hover-to-play tour lives on the landing page (`docs/index.html`).

<details>
<summary>Screenshots / clips</summary>

### Chat & Agents
![Chat & Agents](docs/chat.gif)
### Deep Research
![Deep Research](docs/research.gif)
### Compare
![Compare](docs/compare.gif)
### Documents
![Documents](docs/document.gif)
### Notes & Tasks
![Notes & Tasks](docs/notes.gif)

</details>

## Documentation

Full docs live in [`docs/`](docs/index.md):

| You want to… | Read |
|---|---|
| Understand what this is and why | [What is Odysseus?](docs/overview/what-is-this.md) |
| Get onboarded from zero, painlessly | [Onboarding](docs/getting-started/onboarding.md) |
| Install and chat in <15 minutes | [Quickstart](docs/getting-started/quickstart.md) |
| Learn a subsystem (agent, Cookbook, memory, research, …) | [Concepts](docs/index.md) |
| Deploy with Docker, GPUs, HTTPS, Tailscale | [Docker](docs/deployment/docker.md) · [Remote access](docs/deployment/remote-access.md) |
| Look up env vars, API scopes, the data layout | [Reference](docs/reference/env-vars.md) |
| Fix something | [Troubleshooting](docs/troubleshooting/common-issues.md) |

## Quick Start

Defaults work out of the box: clone, run, then configure models/search/email
inside **Settings**. Only edit `.env` for deployment-level overrides like
`APP_BIND`, `APP_PORT`, `AUTH_ENABLED`, `DATABASE_URL`, or a pre-seeded admin password.

On first setup, Odysseus creates an admin account (`admin` unless
`ODYSSEUS_ADMIN_USER` is set) and prints a temporary password in the terminal.
For Docker installs, the same line is in `docker compose logs odysseus`.
Use that for the first login, then change it in **Settings**.

Contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and
pull request guidelines.

### Docker (recommended)
```bash
git clone https://github.com/pewdiepie-archdaemon/odysseus.git
cd odysseus
cp .env.example .env       # optional, but recommended for explicit defaults
docker compose up -d --build
```

Open `http://localhost:7000` when the containers are healthy. The stack
(Odysseus, ChromaDB, SearXNG, ntfy) binds to `127.0.0.1` by default. If the
port is taken, set `APP_PORT=7001` in `.env` and recreate the container.

GPU passthrough (NVIDIA/AMD), optional extras, persistent model storage, and
connecting a host Ollama: [docs/deployment/docker.md](docs/deployment/docker.md).

### Native Linux / macOS
```bash
git clone https://github.com/pewdiepie-archdaemon/odysseus.git
cd odysseus
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python setup.py
python -m uvicorn app:app --host 127.0.0.1 --port 7000
```
Requirements: Python 3.11+, and `tmux` for Cookbook background downloads/serves.
The app itself is lightweight; small hosts can connect to API or remote model
servers instead of serving locally. Details: [prerequisites](docs/getting-started/prerequisites.md).

### Apple Silicon
Docker on macOS cannot use the Metal GPU. For GPU-accelerated Cookbook on an
M-series Mac, run Odysseus natively:

```bash
git clone https://github.com/pewdiepie-archdaemon/odysseus.git
cd odysseus
./start-macos.sh
```

It installs Homebrew deps (tmux, llama.cpp), sets everything up, and launches at
`http://127.0.0.1:7860` (AirPlay often holds 7000). To build a clickable app
wrapper: `./build-macos-app.sh`. Exposing it to your phone over Tailscale:
[remote access](docs/deployment/remote-access.md).

### Native Windows

One-command launcher (creates the venv, installs deps, runs setup, starts the
server; safe to re-run):

```powershell
git clone https://github.com/pewdiepie-archdaemon/odysseus.git
cd odysseus
powershell -ExecutionPolicy Bypass -File .\launch-windows.ps1
```

Requirements: Python 3.11+. For full **Cookbook** background downloads and the
agent shell tool, also install [Git for Windows](https://git-scm.com/download/win)
(provides `bash.exe`). Easiest local model on Windows is
[Ollama](https://ollama.com/download) — add `http://localhost:11434/v1` in
Settings. vLLM/SGLang GPU serving needs Linux/WSL2.

Something not working? → [troubleshooting](docs/troubleshooting/common-issues.md).

## Security Notes

Odysseus is a self-hosted workspace with powerful local tools: shell access,
file uploads, model downloads, web research, email/calendar integrations, and
API tokens. Treat it like an admin console:

- Keep `AUTH_ENABLED=true` and `LOCALHOST_BYPASS=false` for any network-accessible deployment.
- Do not expose it directly to the public internet — put a trusted private layer in front (Tailscale, VPN, or an authenticated HTTPS reverse proxy with `SECURE_COOKIES=true`). Setup: [remote access](docs/deployment/remote-access.md).
- Keep `.env`, `data/`, `logs/`, and backups out of Git and shared storage; review user privileges and disable open signup after first boot.

Full policy and the trust model: [SECURITY.md](SECURITY.md) · [THREAT_MODEL.md](THREAT_MODEL.md).

## Configuration

Most setup is done inside the app with `/setup` or **Settings**. Use `.env`
only for deployment-level defaults and secrets that must exist before first
boot (`APP_BIND`, `APP_PORT`, `AUTH_ENABLED`, `DATABASE_URL`, GPU overlays, …).
Every variable, with defaults: [docs/reference/env-vars.md](docs/reference/env-vars.md).

## Architecture

```
app.py                   # FastAPI entry point
core/      auth, database, middleware, constants
src/       llm_core, agent_loop, agent_tools, chat_processor, search/
routes/    chat, session, document, memory, model … endpoints
services/  docs, memory, search, hwfit (Cookbook) …
static/    index.html + app.js + style.css + js/ (modular front-end)
docs/      documentation + landing page (index.html) + preview clips
```

The full picture — components, data flows, security model, design decisions:
[docs/architecture/system-design.md](docs/architecture/system-design.md).

All user data lives in `data/` (gitignored) — layout and backup guide:
[docs/reference/data-directory.md](docs/reference/data-directory.md).

## Contributing
Help is welcome. The best entry points are fresh-install testing, provider setup
bugs, mobile/editor polish, docs, and small focused refactors. See
[ROADMAP.md](ROADMAP.md) for the current help-wanted list.

## Star History

<a href="https://www.star-history.com/?repos=pewdiepie-archdaemon%2Fodysseus&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=pewdiepie-archdaemon/odysseus&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=pewdiepie-archdaemon/odysseus&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=pewdiepie-archdaemon/odysseus&type=date&legend=top-left" />
 </picture>
</a>

## License
MIT -- see [LICENSE](LICENSE) and [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

```
                                  |
                                 |||
                                |||||
                  |    |    |   |||||||
                 )_)  )_)  )_)   ~|~
                )___))___))___)\  |
               )____)____)_____)\\|
             _____|____|____|_____\\\__
             \                       /
       ~^~^~~^~^~~^~^~~^~^~~^~^~~^~^~~^~^~~^~^~
               ~^~  all aboard!  ~^~
       ~^~^~~^~^~~^~^~~^~^~~^~^~~^~^~~^~^~~^~^~
```
