# Memory and skills

The persistence layer that makes Odysseus improve with use: facts about you (memory) and procedures it can follow (skills).

## What it is

Memory stores discrete facts and preferences; skills store reusable, versioned playbooks. Both are retrieved automatically into chats and agent runs, both are yours to inspect and edit, and both survive model switches — they're attached to *you*, not to any LLM.

## Memory

### How storage works

Memories live in two parallel indexes:

- **Keyword index** (`src/memory.py`): entries in `data/memory.json`, scored at query time by token-set overlap (Jaccard similarity). Fast, exact, zero dependencies.
- **Vector index** (`src/memory_vector.py`): the same entries embedded and stored in a ChromaDB collection (`odysseus_memories`, cosine metric). Embeddings come from your configured `EMBEDDING_URL` endpoint, falling back to local fastembed (ONNX, ~50MB download on first use).

New memories are deduplicated against existing ones at a high similarity threshold, so "likes coffee" doesn't accumulate five paraphrases.

### How retrieval works

At chat time (`src/chat_processor.py:147`), both indexes are queried and blended:

```
vectors healthy:    final = 0.55 × vector + 0.40 × keyword + 0.05 × recency
vectors down:       final = 0.95 × keyword + 0.05 × recency

keyword score gets a query-aware category boost before blending:
  ×1.4 identity ("my name…")  ·  ×1.3 contact ("phone/email…")  ·  ×1.2 preference ("I like…")
weak matches are gated out; the top k survivors enter the context
```

The design is deliberate: when embeddings are healthy, semantic similarity leads ("my manager" finds the memory about Priya) with keyword precision as a strong second signal; recency only breaks ties. **If ChromaDB or the embedding model is unreachable, scoring switches to keyword-only** — memory degrades, never breaks.

### Managing memories

- **Memory panel** (`/memory` in the UI): browse, add, edit, delete.
- **In chat:** ask the model to remember something; the memory tools store it (subject to the user's `memory` privilege).
- **Import/export** for backup or migration.
- **CLI:** `scripts/odysseus-memory` for scripted operations.
- **API:** memory endpoints with `memory:read`/`memory:write` token scopes ([reference](../reference/api-tokens-and-scopes.md)).

A nightly housekeeping task tidies memory (deduplication and cleanup) as part of the scheduler's maintenance jobs.

## Skills

### The format

A skill is a directory under `data/skills/{category}/{name}/` containing a `SKILL.md` with frontmatter and body:

- **Frontmatter:** name, description (≤200 chars), category, tags, platforms, when-to-use.
- **Body:** the procedure — steps, pitfalls, verification.
- **Source:** `user` (you wrote/imported it; exempt from auto-dedup) or `learned` (the agent authored it from experience).

### The lifecycle

1. **Create** — write one in the Skills tab, import from a URL, or let the agent distill one from a session that went well.
2. **Test** — each skill can be auto-tested: Odysseus builds a self-contained test prompt, runs the agent with the skill, and an LLM-as-judge grades the transcript (did the steps work? is it reproducible?). Pass/fail plus advisory feedback.
3. **Use** — relevant skills are surfaced to the agent at runtime to guide multi-step work.
4. **Maintain** — a manager enforces caps (total and per-category) and auto-deduplicates learned skills; a nightly audit task validates the installed set.

### Why skills exist as their own thing

Memory answers "what is true about this user?"; skills answer "how should this *task* be done?". Mixing them would bloat every chat with procedures, and procedures need structure memory doesn't (steps, verification, testability). Splitting them keeps each retrieval sharp.

## RAG: your documents in context

Closely related but distinct: RAG indexes *document content* (files in `data/personal_docs/`, uploads) for retrieval into sessions that have RAG enabled. Memory is facts about you; RAG is the contents of your stuff. Both use the same embedding infrastructure; a built-in MCP server (`mcp_servers/rag_server.py`) exposes document listing and directory management to the agent.

## Interaction with other subsystems

- Every **chat** request runs hybrid memory retrieval before hitting the LLM ([chat & models](chat-and-models.md)).
- The **agent** reads and writes memory through gated tools ([agent & tools](agent-and-tools.md)).
- **Claude Code / Codex** integrations get scoped memory access (`memory:read`/`memory:write`) ([integrations](integrations.md)).
- The **scheduler** runs the nightly tidy and skill-audit jobs.

## Configuration

| Setting | Where | Notes |
|---------|-------|-------|
| `EMBEDDING_URL` | `.env` | OpenAI-compatible `/v1/embeddings`; defaults toward Ollama at `http://{LLM_HOST}:11434/v1/embeddings` |
| `EMBEDDING_MODEL`, `EMBEDDING_API_KEY` | `.env` | Must exist at the endpoint |
| `FASTEMBED_MODEL` | `.env` | Local fallback; default `sentence-transformers/all-MiniLM-L6-v2` |
| `CHROMADB_HOST` / `CHROMADB_PORT` | `.env` | Docker overrides to `chromadb:8000`; manual runs default `localhost:8100` |

## Common gotchas

- **`chromadb-client` vs `chromadb`:** the requirements install the lightweight HTTP client, expecting a ChromaDB *service* (the Docker stack provides one). If you install the full `chromadb` package alongside the client in a native setup, fallback behavior gets confusing — see [troubleshooting](../troubleshooting/common-issues.md).
- **Memory "not working" after moving machines:** copy all of `data/` (including `memory.json`, `chroma/`, `memory_vectors/`), not just the database.
- **First vector query is slow:** fastembed downloads its ONNX model (~50MB) on first use; subsequent queries are fast.
