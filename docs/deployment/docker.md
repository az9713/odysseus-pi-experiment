# Docker deployment

Everything about running the Compose stack beyond the [quickstart](../getting-started/quickstart.md): bundled services, persistent storage, GPU passthrough, host Ollama, and health checks.

## The bundled stack

`docker compose up -d --build` starts four services:

| Service | Host port (default bind) | Purpose |
|---------|-------------------------|---------|
| odysseus | `127.0.0.1:7000` | The app (`APP_BIND` / `APP_PORT`) |
| chromadb | `127.0.0.1:8100` | Vector store (`CHROMADB_BIND`) |
| searxng | `127.0.0.1:8080` | Web search |
| ntfy | `127.0.0.1:8091` | Push notifications (`NTFY_BIND`) |

All ports bind to loopback by default — reachable from the host, invisible to your LAN unless you opt in. Set `APP_BIND=0.0.0.0` only when you intentionally want LAN/reverse-proxy access ([remote access](remote-access.md)).

To include optional extras in the image (PDF page rendering, Office extraction; includes AGPL PyMuPDF):

```bash
docker compose build --build-arg INSTALL_OPTIONAL=true
docker compose up -d
```

The container drops privileges to `PUID:PGID` (default `1000:1000`) and repairs `data/`/`logs/` ownership on start — set them to your host IDs (`id -u` / `id -g`) in `.env` if they differ.

## Persistent storage

Bind mounts keep everything on the host (see [data directory](../reference/data-directory.md)):

- `./data` — all app state.
- `./data/huggingface` — Cookbook model downloads (`~/.cache/huggingface` in-container).
- `./data/local` — Cookbook-installed Python CLIs and serve engines (`~/.local` in-container).

Both Cookbook paths survive container recreation, so image rebuilds never re-download models or reinstall engines. ChromaDB, SearXNG, and ntfy use named volumes.

## GPU passthrough

CPU-only users can skip this section. Cookbook can only detect GPUs that Docker exposes to the container — if the host runtime or device passthrough isn't configured, Cookbook sees the iGPU, another card, or CPU instead of your intended GPU.

### NVIDIA

`scripts/check-docker-gpu.sh` diagnoses passthrough and can optionally install the host runtime or update `.env`:

```bash
# Read-only diagnostic (default — installs nothing, never edits .env):
scripts/check-docker-gpu.sh

# Print OS-specific install commands without running them:
scripts/check-docker-gpu.sh --print-install-commands

# Install NVIDIA Container Toolkit on Ubuntu/Debian (requires sudo):
scripts/check-docker-gpu.sh --install-nvidia-toolkit

# Write COMPOSE_FILE to .env (only when GPU passthrough is confirmed working):
scripts/check-docker-gpu.sh --enable-nvidia-overlay

# Full assisted setup — install toolkit, then enable overlay if passthrough works:
scripts/check-docker-gpu.sh --install-nvidia-toolkit --enable-nvidia-overlay
```

Safety guarantees:

- The app never installs host GPU runtime automatically.
- The app never edits `.env` automatically.
- `.env` is only modified when `--enable-nvidia-overlay` is explicitly passed, and only after GPU passthrough succeeds. `--yes` skips prompts but does not bypass the passthrough gate.
- `.env.bak.*` backups created by `--enable-nvidia-overlay` are ignored by Git and the Docker build context.

To enable manually without the script, add to `.env`:

```bash
COMPOSE_FILE=docker-compose.yml:docker/gpu.nvidia.yml
```

(Windows hosts use `;` instead of `:` as the separator.)

### AMD / ROCm

AMD setup is a read-only diagnostic plus a manual `.env` edit:

```bash
scripts/check-docker-amd-gpu.sh
```

Then add the reported values to `.env`, replacing `RENDER_GID` with your host's numeric render group id:

```bash
COMPOSE_FILE=docker-compose.yml:docker/gpu.amd.yml
RENDER_GID=989
```

For either vendor, also read the comments in the selected overlay file: `docker/gpu.nvidia.yml` or `docker/gpu.amd.yml`.

### Stack-management UIs (Portainer, Coolify, Dockhand, …)

These tools often accept only a single Compose file and do not reliably honor `COMPOSE_FILE` or multiple `-f` overlays. CLI users should keep the `COMPOSE_FILE` overlay workflow. For stack UIs, point the stack at one of the standalone files, which bundle the base stack plus GPU settings:

- `docker-compose.gpu-nvidia.yml` — still requires the NVIDIA Container Toolkit on the host.
- `docker-compose.gpu-amd.yml` — still requires host ROCm/kfd/DRI setup, `video`/`render` group membership, and `RENDER_GID` when needed.

The base `docker-compose.yml` plus `docker/gpu.*.yml` overlays remain the source of truth; the standalone files mirror them for single-file deployments.

### Verify passthrough

```bash
docker compose exec odysseus nvidia-smi -L   # NVIDIA
docker compose exec odysseus sh -lc 'test -e /dev/kfd && test -d /dev/dri && ls -l /dev/kfd /dev/dri/renderD*'  # AMD
```

> **Warning — GPU passthrough ≠ llama.cpp CUDA.** `nvidia-smi` passing inside the container confirms Docker GPU access, but llama.cpp also needs `cudart` and the CUDA Toolkit at runtime. If Cookbook logs show `Unable to find cudart library`, `Could NOT find CUDAToolkit`, `CUDA Toolkit not found`, or tensors/layers assigned to CPU, that's a Cookbook/llama.cpp build issue — not a Docker passthrough failure. Re-install the serve engine via **Cookbook → Dependencies** to get a CUDA-enabled build.
>
> The same split applies to AMD/ROCm: seeing `/dev/kfd` and `/dev/dri` inside the container confirms device passthrough, not ROCm userspace or a ROCm-enabled vLLM/llama.cpp build. `rocm-smi` and `rocminfo` are not expected inside the slim Odysseus image.

### macOS

Docker on macOS cannot use the Metal GPU. For GPU-accelerated Cookbook on Apple Silicon, run natively with `./start-macos.sh` instead — see the [quickstart](../getting-started/quickstart.md).

## Host Ollama from Docker

If Ollama runs on the host, add this endpoint in **Settings**:

```text
http://host.docker.internal:11434/v1
```

Ollama must listen beyond its own loopback:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

This connects containerized Odysseus to an Ollama server already running on your host; it does not start Ollama inside the container. `host.docker.internal` is Docker's hostname for the host machine. Cookbook **Serve** is a separate workflow for serving downloaded models through Odysseus/llama.cpp — users with an existing Ollama install usually only need the endpoint.

## Useful checks

```bash
docker compose ps
docker compose logs --tail=120 odysseus
docker compose logs odysseus | grep -E 'ChromaDB|MemoryVectorStore|DEGRADED'
```

More failure patterns: [troubleshooting](../troubleshooting/common-issues.md).
