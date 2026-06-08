# Prerequisites

What you need before the [quickstart](quickstart.md). Pick your path — Docker needs almost nothing; native needs Python.

## Path A: Docker (recommended)

### Docker Engine + Compose v2

Verify:

```bash
docker compose version
```

Should print `Docker Compose version v2.x.x`. Install: [docs.docker.com/get-docker](https://docs.docker.com/get-docker/). On Linux, make sure your user can run Docker without sudo, or prefix commands with `sudo`.

### Git

Verify:

```bash
git --version
```

Install: [git-scm.com/downloads](https://git-scm.com/downloads).

That's the whole list for Docker. ChromaDB, SearXNG, and ntfy are bundled in the compose stack.

## Path B: Native (Linux / macOS / Windows)

### Python 3.11+

Verify:

```bash
python3 --version    # Linux/macOS
py -3.11 --version   # Windows
```

Should print `3.11.x` or higher. Install: [python.org/downloads](https://www.python.org/downloads/).

### Git

Same as above.

### tmux (Linux/macOS — only for Cookbook)

Cookbook uses tmux for background model downloads and serves. Skip it if you'll only connect to remote/API models.

```bash
tmux -V
```

Install: `sudo apt install tmux` (Debian/Ubuntu) or `brew install tmux` (macOS — `start-macos.sh` installs it for you).

### Git for Windows (Windows — only for Cookbook + agent shell)

Provides `bash.exe`, which Cookbook background jobs and the agent's shell tool use on Windows. Install: [git-scm.com/download/win](https://git-scm.com/download/win). The core app runs without it.

### Homebrew (macOS only)

`start-macos.sh` uses Homebrew to install tmux, llama.cpp, and Python. Verify:

```bash
brew --version
```

Install: [brew.sh](https://brew.sh).

## Optional — decide later, not now

| Want | Need |
|------|------|
| Local models on NVIDIA GPU (Docker) | NVIDIA driver + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html); `scripts/check-docker-gpu.sh` diagnoses and assists |
| Local models on AMD GPU (Docker) | Host ROCm drivers; run `scripts/check-docker-amd-gpu.sh` for the values to put in `.env` |
| Local models on Apple Silicon | Nothing extra — run natively via `./start-macos.sh` (Docker on macOS cannot use Metal) |
| Local models on Windows, easiest path | [Ollama](https://ollama.com/download); add `http://localhost:11434/v1` as an endpoint in Settings |
| Remote API models only | Just an API key (OpenAI, OpenRouter, …) — pasted into Settings after first boot, not into `.env` |
| Extra features below | `pip install -r requirements-optional.txt` (or build Docker with `--build-arg INSTALL_OPTIONAL=true`) |
| Browser automation MCP for the agent | `npx -y @playwright/mcp@latest --version` once (~300MB), then restart Odysseus |

### Optional dependencies

`requirements-optional.txt` is not installed by default. What each package unlocks:

| Package | Feature unlocked |
|---------|-----------------|
| `faster-whisper` | Local speech-to-text (microphone → text) via the "local" STT provider |
| `duckduckgo-search` | DuckDuckGo as a search provider option |
| `PyMuPDF` | PDF page rendering in the side viewer panel and form-filling (note: AGPL-3.0) |
| `markitdown` | Office/EPUB text extraction (.docx/.xlsx/.pptx/.xls/.epub → Markdown) |

## Hardware

The app itself is lightweight — a Raspberry-class box can run the workspace and talk to remote APIs. Local model *serving* is the heavy part and scales with the model: as a rough floor, a 7–8B model quantized to Q4 wants ~6 GB of VRAM (or unified memory on Apple Silicon). Cookbook's hardware scan tells you exactly what your machine can handle — that's its job, so don't agonize about it now.

## No accounts, no keys, no sign-ups required

A default install works with zero external services: bundled SearXNG covers web search, fastembed covers embeddings, and any local model covers chat. API keys only enter the picture if you choose remote providers — and they go into **Settings** inside the app, not into config files.

Next: [quickstart](quickstart.md).
