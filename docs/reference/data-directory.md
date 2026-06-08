# The data directory

Everything Odysseus knows lives under `data/` (plus `logs/`). Back up `data/` and you've backed up Odysseus. All of it is gitignored — keep it that way.

Source of truth: `setup.py` (directory creation), `core/database.py`, `core/constants.py`, `docker-compose.yml` (mounts).

## Layout

| Path | Contains | Created by |
|------|----------|-----------|
| `data/app.db` | SQLite database: sessions, messages, documents + versions, notes, scheduled tasks + runs, calendar, email accounts, comparisons, gallery metadata, API tokens, webhooks | first run (`setup.py` / SQLAlchemy) |
| `data/auth.json` | User accounts: bcrypt password hashes, admin flags, privileges, 2FA secrets | `setup.py` (admin creation) |
| `data/sessions.json` | Active login session tokens (written atomically) | runtime |
| `data/settings.json` | In-app Settings: providers, search, email, TTS/STT, feature config (sensitive fields encrypted) | runtime |
| `data/memory.json` | Memory entries (keyword index source) | runtime |
| `data/presets.json` | Conversation presets | runtime |
| `data/uploads/` | Chat file uploads | `setup.py` |
| `data/personal_docs/` | Personal documents indexed for RAG | `setup.py` |
| `data/personal_uploads/` | Personal-document upload staging | `setup.py` |
| `data/skills/` | Skills (`{category}/{name}/SKILL.md`) | runtime |
| `data/chroma/` | ChromaDB vector store (native runs; Docker uses a named volume instead) | `setup.py` |
| `data/rag/` | RAG index storage | `setup.py` |
| `data/memory_vectors/` | Semantic-memory vector data | `setup.py` |
| `data/tts_cache/` | Text-to-speech audio cache (safe to clear) | `setup.py` |
| `data/generated_images/` | AI-generated images | `setup.py` |
| `data/deep_research/` | Research run state and reports | `setup.py` |
| `data/ssh/` | Cookbook SSH identity (`id_ed25519`, `id_ed25519.pub`) for remote servers | Cookbook |
| `data/huggingface/` | HuggingFace model cache (Docker bind-mount of the container's `~/.cache/huggingface`) | Cookbook downloads |
| `data/local/` | Cookbook-installed CLIs and serve engines (Docker bind-mount of `~/.local`) | Cookbook → Dependencies |
| `logs/` | Application logs | `setup.py` |

## Docker mounts

`docker-compose.yml` bind-mounts `./data` and `./logs` into the container, plus the three Cookbook paths (`data/ssh` → `/app/.ssh`, `data/huggingface` → HF cache, `data/local` → `~/.local`), so app state, downloaded models, and installed engines all survive container recreation. ChromaDB, SearXNG, and ntfy use named volumes (`chromadb-data`, `searxng-data`, `ntfy-cache`).

The entrypoint drops to `PUID:PGID` (default `1000:1000`) and repairs ownership of `/app/data` and `/app/logs` on start, so host-side file ownership stays sane.

## Backing up

Minimum meaningful backup — stop the app briefly for a consistent SQLite copy, then:

```bash
tar czf odysseus-backup-$(date +%F).tar.gz data/ logs/
```

To exclude re-downloadable bulk (models can be tens of GB):

```bash
tar czf odysseus-backup-$(date +%F).tar.gz \
  --exclude=data/huggingface --exclude=data/local --exclude=data/tts_cache \
  data/
```

In Docker, also export the ChromaDB volume if you want vector indexes preserved exactly (they can be rebuilt from `memory.json`/documents otherwise):

```bash
docker run --rm -v odysseus_chromadb-data:/from -v "$PWD":/to alpine \
  tar czf /to/chromadb-backup.tar.gz -C /from .
```

`scripts/odysseus-backup` provides a CLI for session/data export; session export/import is also available per-session in the UI.

## Restoring / migrating machines

1. Install Odysseus on the new machine (don't run setup yet, or let it run — it's idempotent and won't clobber existing files).
2. Unpack your backup over `data/`.
3. Start the app. Accounts (`auth.json`), sessions, memory, settings, and documents come straight back.

> **Warning:** `auth.json`, `sessions.json`, `settings.json`, and `app.db` contain password hashes, login tokens, encrypted API keys, and your private content. Treat backups like secrets: never commit them, never put them in shared storage unencrypted. Before publishing a fork, run `git status --short` and confirm nothing from `data/`, `logs/`, or `.env` is staged.

## Sensitive-file map

| File | Sensitivity |
|------|------------|
| `data/auth.json` | password hashes, 2FA secrets, privilege flags |
| `data/sessions.json` | live login tokens |
| `data/settings.json` | provider API keys (encrypted fields), email credentials |
| `data/app.db` | all content + API token hashes |
| `data/ssh/id_ed25519` | private key with access to your remote model servers |
| `.env` (repo root) | deployment secrets, pre-seeded admin password |

After first boot, review `data/auth.json` posture in Settings: disable open signup unless intended, keep only your own account admin ([SECURITY.md](../../SECURITY.md)).
