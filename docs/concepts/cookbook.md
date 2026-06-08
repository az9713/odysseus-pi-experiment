# Cookbook

Local model serving without the folklore: scan your hardware, get a ranked shortlist, click to download, click to serve.

## What it is

Cookbook (built on [llmfit](https://github.com/AlexsJones/llmfit), code in `services/hwfit/` + `routes/cookbook_routes.py`) is the subsystem that answers "which models can *my* machine actually run, and how do I get one running?" — the question that normally requires fluency in VRAM math, quantization formats, and three serve engines.

## The pipeline: scan → rank → download → serve

### 1. Hardware scan

`services/hwfit/hardware.py` probes your machine:

- **NVIDIA** via `nvidia-smi`, **AMD** via `rocminfo`, **Apple Silicon** via `sysctl`.
- Identical GPUs are grouped (vLLM tensor-parallelism needs a homogeneous pool).
- Available system RAM is measured; **remote machines** can be scanned over SSH.
- Results cache for 24 hours; the **Rescan** button forces a fresh probe.

### 2. Fit ranking

`services/hwfit/fit.py` scores every catalog model against the detected hardware:

| Component | What it estimates |
|-----------|------------------|
| Fit | Does the model + quant + context fit in VRAM/RAM? (`estimate_memory_gb`) |
| Speed | Predicted tokens/sec from GPU memory bandwidth ÷ model bytes, adjusted for offload, MoE, and quantization |
| Quality | Model family generation, parameter count, quantization penalty, use-case match |
| Context | Headroom for your requested context window |

These combine into a weighted composite (quality-dominant) per use case, and the UI ranks by whatever column you sort. Format filtering is platform-aware: multi-GPU CUDA boxes see BF16/vLLM candidates; Apple Silicon, consumer AMD, and native Windows see GGUF only (llama.cpp is the servable path there). You can also **simulate** hardware manually to shop for a future GPU.

### 3. Download

Pick a model and Cookbook builds and runs the download (HuggingFace CLI, or Ollama pull for `name:tag` references), streaming logs to the UI. Downloads land in the HuggingFace cache — in Docker that's `./data/huggingface/`, bind-mounted so models survive container recreation. Gated models accept a HuggingFace token.

### 4. Serve

Cookbook composes and launches the serve command for your chosen engine:

| Engine | When | Example shape |
|--------|------|--------------|
| vLLM | CUDA/ROCm, especially multi-GPU | `python -m vllm.entrypoints.openai.api_server --model … --tensor-parallel-size N` |
| llama.cpp | GGUF; the path for macOS Metal, consumer AMD, Windows | `llama-server -m model.gguf --n-gpu-layers N` |
| Ollama | You already run it; self-managing | endpoint add only |
| SGLang | CUDA/ROCm alternative | cross-platform support is roadmap-active |

Serves run detached — tmux on Linux/macOS, subprocess on Windows — with GPU selection (`CUDA_VISIBLE_DEVICES`/`HIP_VISIBLE_DEVICES`), quantization and context overrides, and preflight diagnostics that try to name the failure (driver mismatch, OOM, missing deps) instead of just "crashed". Engines themselves are installed via **Cookbook → Dependencies** into `data/local/` (also persisted in Docker).

Once serving, the model appears in the chat model picker via discovery — no manual endpoint step.

### Remote serving

Generate the Odysseus SSH key in **Cookbook → Settings → Servers**, add the public key to the remote machine's `~/.ssh/authorized_keys` (or `ssh-copy-id -i data/ssh/id_ed25519.pub user@server`), and Cookbook can scan, download to, and serve from that machine.

### Scheduled serves

Serves can be scheduled through the task system (e.g., bring up the big model at 9:00, stop it at 18:00) — these tasks link to calendar events, and deleting the task cascades the event.

## Why it's designed this way

- **VRAM-aware ranking instead of a plain catalog:** the failure mode for newcomers isn't *finding* models, it's downloading ones that don't fit or crawl. Scoring against measured hardware moves that discovery before the 20GB download.
- **tmux/detached processes instead of in-app threads:** model serves outlive app restarts and are observable (`tmux attach`) when things go wrong. State stays on disk, not in process memory.
- **Persisted caches in Docker (`data/huggingface`, `data/local`):** image rebuilds are routine; re-downloading 30GB of weights must not be.

## Interaction with other subsystems

- Served models surface in [chat](chat-and-models.md) through model discovery.
- The agent (admin) can drive downloads/serves via `download_model`/`serve_model` tools.
- Claude Code / Codex can monitor and launch serves via `cookbook:read`/`cookbook:launch` scopes ([integrations](integrations.md)).
- The [scheduler](productivity-suite.md) powers timed serves.

## Configuration

| Need | Where |
|------|-------|
| GPU into Docker container | `COMPOSE_FILE` overlay in `.env` — see [Docker deployment](../deployment/docker.md) and `scripts/check-docker-gpu.sh` |
| AMD render group | `RENDER_GID` in `.env` (`getent group render \| cut -d: -f3`) |
| HuggingFace token for gated models | Cookbook UI |
| Remote servers | Cookbook → Settings → Servers (SSH key in `data/ssh/`) |

## Common gotchas

- **GPU passthrough ≠ CUDA-enabled llama.cpp.** `nvidia-smi` passing inside the container proves Docker passthrough only. If serve logs say `Unable to find cudart library` or layers fall to CPU, reinstall the engine via **Cookbook → Dependencies** to get a CUDA build. Same split on AMD: `/dev/kfd` visible ≠ ROCm userspace present.
- **macOS in Docker can't see Metal.** Run natively (`./start-macos.sh`); vLLM/SGLang are CUDA/ROCm-only and never run on macOS. MLX-only models aren't served by Odysseus.
- **Windows native can't serve vLLM/SGLang** — use WSL2 for those, or Ollama/llama.cpp natively.
- **tmux missing** (native Linux/macOS) breaks background downloads/serves; install it.
- Cookbook across diverse machines is the codebase's most environment-sensitive area — when something fails, the actual command and log are your friend, and fresh-install reports are explicitly wanted ([ROADMAP](../../ROADMAP.md)).
