# Odysseus ↔ pi integration (embedded general agent)

This directory wires [pi](https://github.com/earendil-works/pi) in as an
**embedded, long-horizon general agent** for Odysseus — the implementation of
"Gain #1" from [`docs/odysseus-pi-integration-assessment.md`](../../docs/odysseus-pi-integration-assessment.md):
an agent that runs for many turns (pi's auto-compaction + session trees) **and**
knows the user (Odysseus's memory).

Unlike the `claude/` and `codex/` integrations (which let an *external* terminal
agent reach into Odysseus), here **Odysseus drives pi**: it spawns
`pi --mode rpc` as a subprocess, streams its events into the chat UI, and hands
it a scoped token + this bridge extension so the agent's only powers are the
ones Odysseus grants.

## Pieces

| Piece | Where | Role |
|---|---|---|
| Bridge extension | `extension/odysseus-bridge.ts` | Registers the local model as a pi provider, a `manage_memory` tool (search/add) backed by `/api/codex/memory*`, and per-turn memory injection into the system prompt. |
| Memory search endpoint | `routes/codex_routes.py` (`POST /api/codex/memory/search`) | Ranked recall reusing Odysseus's own scorer. |
| In-code token mint | `routes/api_token_routes.py` (`mint_api_token`) | Lets Odysseus create the per-session scoped token without an HTTP round-trip. |
| RPC backend | `src/pi_backend.py` | Spawns pi, translates its JSONL events → Odysseus SSE, manages process lifecycle. |

## Role contract (who owns what)

Odysseus is the **control plane** (identity, policy, data, models, UI,
lifecycle); pi is the **execution plane** (the agent loop, untrusted). The
bridge extension is deliberately *thin*: every authorization decision is made
**server-side** by the token's scopes — a 403 is surfaced verbatim, never worked
around. See the assessment doc's "role contract" section.

## Prerequisites

- Node ≥ 22.19 and pi on PATH: `npm i -g @earendil-works/pi-coding-agent`
- A local model on an OpenAI-compatible endpoint (Cookbook/Ollama/vLLM).
  Phase 0 was validated against Ollama-served `gemma4:e4b`.

## Environment (injected by Odysseus when it spawns the subprocess)

| Var | Purpose |
|---|---|
| `ODYSSEUS_URL` | Base URL, e.g. `http://127.0.0.1:7000` |
| `ODYSSEUS_API_TOKEN` | Scoped `ody_` token (`memory:read`, `memory:write`) |
| `ODYSSEUS_MODEL_BASE_URL` | OpenAI-compatible base, e.g. `http://127.0.0.1:11434/v1` |
| `ODYSSEUS_MODEL_ID` | Model id to register + select, e.g. `gemma4:e4b` |
| `ODYSSEUS_MODEL_CONTEXT` | Optional; real context window (default 32768) |
| `ODYSSEUS_MODEL_MAXTOKENS` | Optional; max output tokens (default 4096) |
| `ODYSSEUS_MODEL_REASONING` | Optional; `false` to disable (default true) |
| `ODYSSEUS_MEMORY_INJECT_K` | Optional; memories auto-injected per turn (default 6) |

## Manual smoke test (standalone, no Odysseus dispatch)

With Odysseus running and a `memory:read,memory:write` token in `$TOK`:

```bash
export ODYSSEUS_URL=http://127.0.0.1:7000
export ODYSSEUS_API_TOKEN=$TOK
export ODYSSEUS_MODEL_BASE_URL=http://127.0.0.1:11434/v1
export ODYSSEUS_MODEL_ID=gemma4:e4b
pi -e ./extension/odysseus-bridge.ts --provider odysseus --model gemma4:e4b \
   --tools manage_memory --no-skills \
   -p "Remember that my favorite editor is Helix. Then tell me you've noted it."
# then, in a fresh run, ask "what is my favorite editor?" — recall should surface Helix
```

## Status

- ✅ Phase 0 spike (local model drives pi tool loop) — GO.
- ✅ Phase 1 (memory bridge: search endpoint, token mint, bridge extension).
- ⏳ Phase 2 (RPC backend + `mode="pi"` session wiring).

Scope of v1: **admin-only**, **memory read+write only**, local-model-first.
