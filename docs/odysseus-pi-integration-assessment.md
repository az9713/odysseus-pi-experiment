# Odysseus × pi — Integration Assessment

**Date:** 2026-06-07 (Phase 0 spike executed 2026-06-08)
**Status:** Exploration + Phase 0 spike done. Implementation of Gain #1 planned and gated. Every claim below is grounded in a file in one of the two local repos; unresolved issues are marked **⚠ UNRESOLVED** or **⚠ FRICTION**.

> **Phase 0 GO/NO-GO spike result — 2026-06-08: ✅ GO.** The one risk no code-reading could settle (can a small local model drive pi's native tool-calling loop?) was tested empirically against the user's local model `gemma4:e4b` served by Ollama, through pi's actual RPC path. Results: native tool calls emitted correctly; RPC multi-step tool loop completed cleanly (`tool_execution_start/end`, correct answer, no errors); an 11-turn long-horizon run completed 10/11 turns and **preserved early-established personal facts (Rex / 42 / Lisbon) across 8 compaction cycles** while all 5 tool reads fired correctly. Caveats: (1) pi's `-p` **print** mode hard-fails on this reasoning model with `Cannot continue from message role: assistant` — irrelevant, since the integration uses **RPC** mode, which works; (2) the spike used an artificially small 8192 context window that forced excessive compaction — production `models.json` must set the model's real context window; (3) ~1 in 11 turns returned empty text under that stress — the Phase 2 backend should treat an empty `agent_end` gracefully (retry/surface). Net: Gain #1 is viable on local models; proceed to Phase 1.

**Repos examined:**
- **Odysseus** — `C:\Users\simon\Downloads\collections\odysseus_collection\odysseus-dev` ([github.com/pewdiepie-archdaemon/odysseus](https://github.com/pewdiepie-archdaemon/odysseus)). Python 3.11+ / FastAPI self-hosted AI workspace: chat, native agent, Cookbook model serving, deep research, memory/skills, email/calendar/notes (`README.md:11-25`).
- **pi** — `C:\Users\simon\Downloads\collections\pi_collection\pi_architecture_hugginface\pi-main` (npm `@earendil-works/pi-coding-agent`, MIT, © 2025 Mario Zechner — `LICENSE:1-3`). TypeScript monorepo: minimal terminal coding agent with a unified LLM API (~30 providers), agent loop, coding harness, TUI (`docs/what-is-pi.md:11-44`).

---

## Introduction: the two systems

This section introduces both projects on their own terms, so the integration arguments that follow have a shared foundation. Citations are to files in the two local repos listed above; pi paths are relative to `pi-main/`, Odysseus paths to the repo root.

### What Odysseus is

Odysseus is a **self-hosted AI workspace** — "the self-hosted version of the UI experience you get from ChatGPT and Claude … local-first, privacy-first" (`README.md:11`). It is a single Python 3.11+ / FastAPI application (`app.py`, `requirements.txt`) serving a responsive web UI/PWA, designed to run on your own hardware and be treated "like an admin console" (`README.md:139-141`). Its major subsystems:

- **Chat** with any local or API model behind a unified endpoint resolver — vLLM, llama.cpp, Ollama, OpenRouter, OpenAI, Anthropic, GitHub Copilot (`README.md:14`; `src/endpoint_resolver.py`, `src/llm_core.py`).
- **A native agent**: an in-process Python loop (`src/agent_loop.py`) that streams over SSE, parses tool calls from fenced blocks by regex (`src/tool_parsing.py`), and dispatches ~80 tools (shell, files, web, email, calendar, todos, documents, memory, image generation, research, Cookbook — `src/agent_tools.py:29-62`) gated by a fail-closed per-user privilege model (`src/tool_security.py:14`) and a read-only "plan mode" (`docs/concepts/agent-and-tools.md:64-68`). The loop's *patterns* were adapted from the opencode coding agent (`ACKNOWLEDGMENTS.md:22-26`) — a fact that matters greatly below.
- **Cookbook**: hardware-aware local model management — probes the GPU, scores what fits in VRAM, downloads models, and serves them via vLLM/llama.cpp on OpenAI-compatible endpoints, managed as supervised background processes (`services/hwfit/`, `src/cookbook_serve_lifecycle.py`, `src/bg_jobs.py`).
- **Memory and skills**: a dual-index memory (keyword + ChromaDB vector, blended per-request — `src/chat_processor.py:24-31`) and a skills library of `SKILL.md` documents with a full lifecycle — auto-testing by LLM-as-judge, caps, dedup, and distillation of new skills from agent sessions (`docs/concepts/memory-and-skills.md:47-63`).
- **Life-data integrations**: IMAP/SMTP email with AI triage, CalDAV calendar, notes/todos with reminders, a cron-style scheduler, and ntfy/browser/email notification channels (`README.md:21-23`; `src/task_scheduler.py`).
- **Deep research**: a multi-step gather/read/synthesize pipeline adapted from Tongyi DeepResearch (`services/research/`, `ACKNOWLEDGMENTS.md:33-38`).
- **Multi-user with scoped external access**: per-user privilege profiles (`core/auth.py`), and a scope-gated REST API for external agents (`/api/codex/*`) authenticated by `ody_…` bearer tokens whose scopes are enforced server-side — already shipped as integration bundles for Claude Code and Codex (`integrations/claude/`, `integrations/codex/`, `docs/reference/api-tokens-and-scopes.md`).

Design center: **breadth on a trusted box** — one app that owns your models, your data, and your automations, with policy enforced at its API boundary.

### What pi is

Pi is a **terminal coding agent** by Mario Zechner (npm `@earendil-works/pi-coding-agent`, MIT — `LICENSE:1-3`), whose declared design bet is the opposite of breadth: "pi keeps its core deliberately minimal and pushes everything else into user-installable extensions" (`docs/what-is-pi.md:3`). The core ships "an editor, a model connection, four tools (`read`, `write`, `edit`, `bash`), and session management" (`what-is-pi.md:7`). It is a TypeScript monorepo of four layered packages, each usable without the ones above it (`what-is-pi.md:20-44`):

| Package | Role |
|---|---|
| `@earendil-works/pi-ai` | Unified streaming LLM API over ~30 providers; a conversation is a plain serializable object, so it can move between models mid-session (`what-is-pi.md:13`) |
| `@earendil-works/pi-agent-core` | The agent loop: tool execution, events, steering, state |
| `@earendil-works/pi-coding-agent` | The harness: JSONL session trees, context files, **compaction**, model switching, auth, extensions/skills/themes discovery |
| `@earendil-works/pi-tui` | The terminal UI (no LLM dependencies) |

Four run modes matter here: interactive TUI, one-shot print/JSON, **RPC** (headless JSONL over stdin/stdout, designed "for embedding the agent in other applications" — `packages/coding-agent/docs/rpc.md:3`), and a Node.js SDK (`what-is-pi.md:52-59`).

Equally important is what pi **deliberately is not** (`what-is-pi.md:61-65`, `docs/design-rationale.md`): not a sandbox (no permission system — it runs with the invoking user's full rights; containment is the user's job), not batteries-included (no MCP, no built-in subagents, plan mode, or todo lists — each rejected with a written rationale and an extension escape hatch), and not provider-locked. Extensibility is first-class: extensions can register tools, commands, and even whole model providers, and intercept every loop event including the system prompt (`docs/extensions.md`); skills follow the [Agent Skills standard](https://agentskills.io/specification) (`docs/skills.md:7`).

Design center: **depth in a minimal core** — one excellent, model-portable agent loop, trusting its single user completely and delegating everything else to extensions.

### Why these two, together, are worth assessing

The pairing is interesting because the projects are **complementary by construction and compatible by accident**:

- **Complementary:** Odysseus has everything *around* an agent (data, models, users, schedule, UI) and a comparatively weak loop; pi has arguably the strongest minimal loop in the open-source field (compaction, session trees, mid-session model switching) and deliberately nothing around it.
- **Compatible:** without coordinating, both adopted the same three interfaces — `SKILL.md` agent skills, OpenAI-compatible model endpoints, and plain HTTP+token APIs over heavyweight protocols (Odysseus ships its agent integrations as skills, `integrations/claude/`; pi rejected MCP for exactly that approach, `design-rationale.md:15-19`).

The rest of this document tests that intuition against the actual code: first correcting the framing an obvious reading suggests (§0), then assessing the cheap direction (pi as client, §A), the expensive direction (pi embedded, §B), the user's stated ideal (pi as Odysseus's general agent runtime, §B′ with its role contract), and finally what the combination yields that neither system can provide alone.

---

## 0. The framing correction that shapes everything

Odysseus's README says its Agent is "built on opencode" (`README.md:15`), which suggests pi could "replace opencode." **That reading is wrong.** `ACKNOWLEDGMENTS.md:22-26` clarifies opencode was *"adapted for agent-loop / tool-execution patterns and UI concepts"* — its **ideas were ported into native Python** (`src/agent_loop.py`, `src/tool_execution.py`, `src/tool_implementations.py`). There is **no opencode runtime, no subprocess, no swappable agent-backend interface** in Odysseus today (`grep -i opencode` hits only `ACKNOWLEDGMENTS.md`, `README.md`, the license file, and two comments in `src/copilot.py`).

Consequently there are two distinct integration directions, with very different costs:

- **Direction A — pi as a *client* of Odysseus** (pi uses Odysseus's data, tools, and models): **near zero effort, works with what both projects already ship.**
- **Direction B — pi as an *embedded coding-agent backend* inside Odysseus** (Odysseus web UI drives pi): **feasible and well-supported by pi's RPC mode, but a genuinely new subsystem for Odysseus, with one security-model mismatch that must be engineered around, not configured away.**

---

## Direction A: pi as a client of the Odysseus workspace (low effort, high value)

### A1. Pi can load Odysseus's existing agent-integration skill — likely verbatim

Odysseus already ships its external-coding-agent integration **as an Agent Skill**: `integrations/claude/skills/odysseus/SKILL.md` + helper script `integrations/claude/skills/odysseus/scripts/odysseus_api.py` (a Codex twin exists at `integrations/codex/`). The skill teaches an agent to use Odysseus's **scoped agent REST API** (`/api/codex/*` — "the canonical scope-gated agent API, shared by all agent integrations", `integrations/claude/README.md:28-30`) for todos, email, calendar, memory, documents, and Cookbook serves, authenticated by an `ody_…` bearer token whose scopes are enforced **server-side** (`integrations/claude/README.md:32-36`; scopes reference: `docs/reference/api-tokens-and-scopes.md`).

Pi implements the same [Agent Skills standard](https://agentskills.io/specification) (`packages/coding-agent/docs/skills.md:7`) and **explicitly documents loading skills from other harnesses' directories** — its example is literally `~/.claude/skills` (`skills.md:43-62`). Pi discovers any directory containing `SKILL.md` recursively (`skills.md:36-39`), and the Odysseus skill's frontmatter (`name: odysseus`, `description: …` — `SKILL.md:1-4`) satisfies pi's required fields.

**So the integration Odysseus built for Claude Code transfers to pi by adding one line to pi's `settings.json`** (`{"skills": ["~/.claude/skills"]}`) or dropping the bundle into `~/.pi/agent/skills/`, plus `ODYSSEUS_URL`/`ODYSSEUS_API_TOKEN` in the environment. Pi executes the helper via its `bash` tool exactly as Claude Code does.

- **⚠ FRICTION (minor):** the skill body hardcodes Claude-specific paths in its examples — `python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py …` (`SKILL.md:48-50`). Under pi the bundle may live elsewhere; the model can usually adapt via relative paths, but a pi-flavored bundle (or path-neutral wording) would be cleaner. Also `python3` is frequently absent on Windows (`python` instead).
- **Note:** Odysseus's own download flow serves the bundle at `GET /api/claude/plugin.zip` (`integrations/claude/README.md:17`); a pi user can reuse the same zip.

### A2. Pi can run on the models Odysseus manages

Odysseus's Cookbook downloads and serves local models via vLLM / llama.cpp on **OpenAI-compatible endpoints** (`README.md:16`; serve command shapes in `services/hwfit/fit.py` — `python -m vllm.entrypoints.openai.api_server …`, `llama-server …`; lifecycle in `src/cookbook_serve_lifecycle.py`, `src/bg_jobs.py`).

Pi consumes any OpenAI-compatible endpoint via `~/.pi/agent/models.json` with `api: "openai-completions"` and a `baseUrl` (`packages/coding-agent/docs/models.md:18-35` — the doc's example is Ollama at `http://localhost:11434/v1`), hot-reloaded by `/model` without restart. For dynamic catalogs, a pi extension can fetch `/v1/models` and `pi.registerProvider()` the results at startup (`docs/custom-provider.md:100-130`).

**Result:** one machine, one set of GPU-resident models — Odysseus's Cookbook decides what fits and serves it; both Odysseus chat *and* pi coding sessions use the same endpoint. No duplicated model management. This is the cleanest synergy of the whole analysis.

### A3. Skills can flow the other way too — with a gap

Odysseus skills are also `SKILL.md`-with-frontmatter under `data/skills/{category}/{name}/` (`docs/concepts/memory-and-skills.md:49-53`), so pi could load Odysseus's *learned* skills by pointing its `skills` setting at `data/skills/`.

- **⚠ FRICTION:** Odysseus frontmatter uses extra fields (`category`, `tags`, `platforms`, `when-to-use` — `memory-and-skills.md:51`) beyond the standard's `name`/`description`. Pi "warns about most violations but remains lenient" (`skills.md:7`) and has a test fixture for unknown frontmatter fields (`packages/coding-agent/test/fixtures/skills/unknown-field/`), so loading should work — but this is **inferred from fixtures, not verified by running pi against an Odysseus skill**. Verify before relying on it.
- **⚠ UNRESOLVED (one-way street):** Odysseus's skill *lifecycle* — LLM-as-judge auto-testing, caps, dedup, nightly audit, teacher-escalation distillation (`memory-and-skills.md:55-63`, `src/teacher_escalation.py`) — only operates on skills created inside Odysseus. Skills pi authors (pi "can create skills", `skills.md:1`) would not enter that pipeline without import; and Odysseus's learned-skill distillation knows nothing about pi sessions. Two skill ecosystems would coexist, converging only by manual copying. No mechanism exists in either repo to sync them.

### A4. Memory: shareable only through the API

Odysseus memory is dual-indexed (keyword `src/memory.py` + ChromaDB `src/memory_vector.py`, blended in `src/chat_processor.py:24-31`) and exposed to external agents via `memory:read`/`memory:write` token scopes (`memory-and-skills.md:74`). Pi has **no memory subsystem at all** (deliberate minimalism — `docs/what-is-pi.md:61-65`). So pi can *use* Odysseus memory through the A1 skill (the skill includes memory operations), but nothing in pi will automatically retrieve-and-inject memories per prompt the way Odysseus's chat does (`chat_processor.py` runs hybrid retrieval before every LLM call). A pi extension could replicate that via `before_agent_start` event + the scoped API — possible, not built.

---

## Direction B: pi as an embedded coding-agent backend inside Odysseus (feasible, real work, one hard issue)

### B1. The mechanism exists and is well-documented

Pi's **RPC mode** (`pi --mode rpc`) is purpose-built for embedding: strict JSONL over stdin/stdout, 27 commands (`prompt`, `steer`, `follow_up`, `abort`, `set_model`, `compact`, session `fork`/`clone`/`switch_session`, `get_session_stats`, …) and 16 streamed event types (`message_update` with `text_delta`/`thinking_delta`/`toolcall_delta`, `tool_execution_start/update/end`, `agent_start/end`, …) — `packages/coding-agent/docs/rpc.md` (the doc even includes a working **Python subprocess client**, `rpc.md:1316-1350`).

Odysseus has the architectural prerequisites:
- Its chat already streams **SSE token-by-token** with stop/resume (`routes/chat_routes.py:47`, `POST /api/chat/stop/{session_id}`), so pi's `message_update` events map naturally onto the existing wire format.
- It already **manages long-lived subprocesses** with PID/exit tracking and restart-surviving state (Cookbook serves via tmux/subprocess — `src/bg_jobs.py`, `src/cookbook_serve_lifecycle.py:31-102`), so "spawn one `pi --mode rpc` per coding session" has an in-repo precedent.
- Pi's session JSONL trees are plain JSON readable from Python (`docs/session-format.md`), so transcripts could surface in the Odysseus UI.

A plausible shape (NOT implemented, NOT designed in detail): a new "Code Agent" session type whose backend is a pi RPC subprocess instead of `src/agent_loop.py`, translating RPC events → Odysseus SSE, and `abort`/`steer` from the UI → RPC commands. Pi's extension-UI sub-protocol (`extension_ui_request`/`response`, `rpc.md:985-1175`) even gives a path for surfacing confirm/select dialogs in the web UI.

### B2. ⚠ UNRESOLVED — the security-model collision (the hard issue)

This is the most important finding in the whole assessment.

- **Odysseus** is **multi-user** with per-user privileges enforced at tool-dispatch time: shell/filesystem/email tools are admin-only via a fail-closed deny list (`NON_ADMIN_BLOCKED_TOOLS`, `src/tool_security.py:14`; unmatchable tool names are treated as blocked rather than allowed, `tool_security.py:153-161`, and the entire `mcp__*` namespace is non-admin-blocked). Plan mode flips the gate to a read-only allow-list — *"shell is blocked outright — you can't constrain `bash` to read-only"* (`docs/concepts/agent-and-tools.md:64-68`). Its threat model treats the app as an admin console (`README.md:137-147`, `THREAT_MODEL.md`).
- **pi** has **no permission system by design**: *"Pi runs with your user's permissions and has no built-in permission system. For boundaries, run it in a container"* (`docs/what-is-pi.md:63`; `docs/design-rationale.md` — permission popups deliberately rejected; mitigation: `docs/containerization.md`).

Embedded naively, every pi session executes `bash`/`write`/`edit` **as the Odysseus server process**, for any user allowed to open a coding session — bypassing every gate in `tool_security.py`. There is no configuration in either project that closes this. The only honest mitigations are *engineering*, and each is marked:

1. **Restrict pi sessions to admins** (matches Odysseus's existing rule that `bash` is admin-only). Cheapest; resolves the collision by policy, not isolation.
2. **Container/workspace-per-session** (pi's own documented answer, `docs/containerization.md`; Odysseus has a `workspace` confinement parameter for its own tools, `routes/chat_routes.py:384-415`, but that confinement is implemented in *Odysseus's* tools — it does not transfer to pi's). Real isolation; real ops cost, especially on native Windows.
3. **A pi extension that intercepts `tool_call` events** (`docs/extensions.md` — extensions can intercept/deny tool calls) and proxies approval to Odysseus via the RPC extension-UI channel. Re-creates Odysseus-grade gating inside pi; it is exactly the kind of TS extension work pi expects users to do, but nobody has written it.

**Marked ⚠ UNRESOLVED** because no combination of existing, shipped features in the two repos enforces Odysseus's privilege model inside pi.

### B3. ⚠ FRICTION — runtime and dependency cost

Pi requires **Node.js ≥ 22.19** (`packages/coding-agent/package.json`) and on Windows a bash (Git Bash auto-detected at `C:\Program Files\Git\bin\bash.exe`, `docs/windows.md`). Odysseus is Python-only at its core (`requirements.txt`); it *optionally* touches npm for the Playwright browser MCP (`src/mcp_manager.py` auto-registers `@playwright/mcp` if cached) and already wants Git Bash on Windows for Cookbook/shell (`README.md:129-133`). So the prerequisites overlap partially, but hard-requiring Node for a core feature is a new install burden Odysseus has so far avoided.

### B4. ⚠ FRICTION — duplicated state and concepts

Embedding pi creates **two sources of truth** with no existing sync mechanism in either repo:

| Concept | Odysseus | pi |
|---|---|---|
| Sessions | SQLite `Session` table (`core/database.py`) | JSONL trees in `~/.pi/agent/sessions/` (`docs/session-format.md`) |
| Skills | `data/skills/` + lifecycle manager | `~/.pi/agent/skills/` etc. (`skills.md:24-40`) |
| Model config | Settings UI + endpoint resolver (`src/endpoint_resolver.py`) | `models.json` / `auth.json` (`docs/models.md`, `docs/providers.md`) |
| Compaction | n/a (per-request context assembly, `src/chat_processor.py`) | built-in auto/manual compaction (`rpc.md:354-393`) |
| Tool-call style | regex-parsed fenced tool blocks (`src/tool_parsing.py`) | native provider tool-calling (`packages/agent`) |

None of these block Direction B — RPC encapsulates pi's internals — but UI affordances Odysseus users expect (memory injection, skill surfacing, plan mode) would need explicit bridging per feature, or honest "not available in Code Agent sessions" labeling.

### B5. ⚠ NOT APPLICABLE — MCP is the wrong bridge

Odysseus speaks MCP fluently (client `src/mcp_manager.py` with stdio/SSE/HTTP transports; four built-in stdio servers in `mcp_servers/`). Pi **deliberately ships no MCP** (`docs/design-rationale.md:15-19`; rationale post: [mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)). Exposing Odysseus's MCP servers to pi would mean writing the MCP-client extension pi's authors pointedly declined to write. Both projects already agree on the alternative: **CLI/HTTP + skills** — which is exactly Direction A1. Recommendation: don't fight pi's design; use the scoped REST API.

---

## Direction B′ (user's stated ideal): pi as the *general* agent runtime inside Odysseus — not just for coding

> Added 2026-06-07 after the user clarified the goal: pi runs inside Odysseus as a general agent (todos, email, calendar, memory, research, …), not a coding sidecar.

### B′1. Pi is genuinely repurposable as a general agent — verified, not assumed

Pi's "coding agent" identity lives in its default system prompt and four default tools, **both replaceable at spawn time** (all flags verified in `packages/coding-agent/docs/usage.md`):

| Lever | Flag / API | Source |
|---|---|---|
| Replace the coding persona | `--system-prompt <text>` — *"Replace default prompt; context files and skills are still appended"* | `usage.md:229` |
| Append instead | `--append-system-prompt <text>` | `usage.md:230` |
| Allowlist tools per session | `--tools <list>` — built-in, extension, and custom tools | `usage.md:198` |
| Disable all built-ins | `--no-tools` | `usage.md:201` |
| Load a custom toolset | `-e / --extension <source>` (path, npm, or git; repeatable) | `usage.md:209` |
| Control skills | `--skill <path>` / `--no-skills` | `usage.md:211-212` |
| Per-turn prompt rewriting | `before_agent_start` extension event — *"can inject message, modify system prompt"* | `extensions.md:282,468-501` |
| Dynamic tool switching | `pi.setActiveTools([...])` from an extension | `extensions.md:1687` |

So the spawn line Odysseus would use is, schematically:

```
pi --mode rpc --session-dir <per-user dir> \
   --system-prompt "<Odysseus general-agent persona>" \
   --tools <per-user allowlist> \
   -e <odysseus-bridge extension> \
   --no-skills --skill <curated odysseus skills>
```

(NOT implemented — this is the shape the verified flags permit.)

### B′2. The architecture: pi = loop/runtime, Odysseus = all tools + policy

The key design move: **don't give pi Odysseus's powers via bash — give it an extension whose tools call Odysseus's scoped API.** A single TS extension (`odysseus-bridge`) registers native pi tools (`manage_todos`, `send_email`, `manage_calendar`, `manage_memory`, `trigger_research`, …) via `pi.registerTool()` (`extensions.md:1683-1687`), each implemented as an HTTP call to the existing scope-gated `/api/codex/*` API (`integrations/claude/README.md:28-36`) using a per-user `ody_…` token passed in the subprocess env. Custom tools support streaming progress via `onUpdate` and abort via `ctx.signal` (`docs/custom-provider.md` / `extensions.md` examples).

**This dissolves the B2 security collision for Odysseus-data tools**, because enforcement returns to where Odysseus already does it: server-side scope checks per token (`integrations/claude/README.md:32-36` — "even if Claude tries to call a forbidden endpoint, it gets 403"). The pi process becomes a *client* of Odysseus's policy, exactly like the Claude Code integration — just running as a subprocess instead of in a terminal.

The residual host-access risk is handled at spawn: **non-admin sessions get `--tools` allowlists that exclude `bash`, `read`, `write`, `edit` entirely** (pi's own built-ins touch the server filesystem as the server user — they must be absent, not merely discouraged). Admin sessions can include them, mirroring Odysseus's existing rule that shell is admin-only (`src/tool_security.py:14`).

What pi contributes as the runtime, which Odysseus's native loop (`src/agent_loop.py`) lacks:
- **Native provider tool-calling** (structured function calls via `openai-completions`) instead of regex-parsed fenced blocks (`src/tool_parsing.py`)
- **Context compaction** — auto + manual, with overflow retry (`rpc.md:354-393, 909-938`)
- **Session trees** — fork/branch/clone, resumable JSONL (`docs/session-format.md`)
- **Mid-session model switching** + per-session cost/token stats (`rpc.md:217-277, 498-535`)
- **Steering and follow-up queues** with delivery-mode control (`rpc.md:80-122, 318-350`)

### B′2a. The role contract (sharpened)

**One sentence:** Odysseus is the **control plane** — identity, policy, data, models, UI, lifecycle; pi is the **execution plane** — a per-session, disposable, *untrusted* agent loop that owns nothing but the conversation.

The analogy that holds up under load: **Odysseus is the operating system, pi is a process.** Odysseus decides what the process may touch (spawn flags + token scopes), gives it its worldview (system prompt, skills, model), supervises it (PID/health/reap, as it already does for Cookbook serves via `src/bg_jobs.py`), and renders its output. Pi just runs the loop well.

#### Ownership matrix — single source of truth per concern

| Concern | Owner | The other side's role | Grounding |
|---|---|---|---|
| Turn loop, tool-call cycle, retries | **pi** | Odysseus never re-loops or post-processes turns | `packages/agent` (loop), `rpc.md:395-421` (retry) |
| Context compaction | **pi** | Odysseus may *trigger* (`compact` cmd), never re-implements | `rpc.md:354-393` |
| Conversation content (canonical transcript) | **pi** (JSONL session trees) | Odysseus mirrors *metadata only* (id, name, owner, status) into SQLite for listing/search UI | `docs/session-format.md`; `core/database.py:Session` |
| Provider wire protocols (streaming, tool-call encoding, thinking) | **pi** (`pi-ai`) | Odysseus stops translating provider quirks for these sessions (`_HarmonyStreamRouter` etc. stay chat-only) | `docs/what-is-pi.md:13`; `src/llm_core.py:104-143` |
| Model **catalog, serving, selection** | **Odysseus** (Cookbook + endpoint resolver + Settings) | pi's `models.json` is a **generated artifact** Odysseus writes at spawn; pi never discovers endpoints itself; `set_model` is driven by Odysseus UI via RPC | `services/hwfit/`, `src/endpoint_resolver.py`; `docs/models.md:18-35` |
| Domain tools (todos, email, calendar, memory, documents, research, cookbook, contacts) | **Odysseus** implements + authorizes | pi sees them only as bridge-extension tools; their bodies are HTTP calls to `/api/codex/*` | `extensions.md:1683` (`registerTool`); `integrations/claude/README.md:28-36` |
| Host tools (`bash`, `read`, `write`, `edit`) | **pi** built-ins, **admin sessions only** | Odysseus grants/denies at spawn via `--tools`; non-admin spawns exclude them entirely | `usage.md:198`; mirrors `src/tool_security.py:14` |
| Policy & authorization | **Odysseus exclusively**, at two chokepoints: spawn-time `--tools` allowlist + server-side token scopes (403) | pi is **untrusted by design** — it has no permission system to delegate to | `what-is-pi.md:63`; `integrations/claude/README.md:32-36` |
| Identity & multi-tenancy | **Odysseus** (users, privileges, per-user tokens, per-user `--session-dir`) | pi is single-user per process; one process = one user = one session | `core/auth.py`; `rpc.md:18` (`--session-dir`) |
| Persona / system prompt | **Odysseus** composes (general-agent persona + user prefs + injected memories) and passes `--system-prompt` | pi appends skills/context files but never authors the persona | `usage.md:229` |
| Memory (store, retrieval, ranking) | **Odysseus** (ChromaDB + keyword hybrid) | pi receives memories as prompt content (via persona or `before_agent_start` bridge handler) and writes them back only through the bridge tool | `src/chat_processor.py:24-31`; `extensions.md:468-501` |
| Skills library & lifecycle (testing, caps, dedup, distillation) | **Odysseus** (`data/skills/`) | pi *consumes* a curated set via `--skill`/`--no-skills`; pi-authored skills land in a staging dir for Odysseus's lifecycle to adopt | `memory-and-skills.md:49-63`; `usage.md:211-212` |
| MCP | **Odysseus only** | pi never speaks MCP (by its own design); MCP-server tools reach pi proxied through the bridge like any domain tool | `src/mcp_manager.py`; `design-rationale.md:15-19` |
| UI, notifications, mobile | **Odysseus** (web/PWA, SSE, ntfy) | pi runs headless; its dialog requests (`extension_ui_request`) render as Odysseus UI prompts | `rpc.md:985-1175` |
| Process lifecycle (spawn, health, reap, restart) | **Odysseus** (extends `src/bg_jobs.py` pattern) | pi is disposable; crash = respawn + `switch_session` to the same JSONL | `rpc.md:564-580` |
| Scheduling / automation | **Odysseus** (cron tasks, webhooks) | scheduled jobs run pi one-shots (`pi --mode json -p`) or feed prompts into a session via RPC | `src/task_scheduler.py`; `docs/json.md` |
| Cost/token accounting | **pi computes** (`get_session_stats`), **Odysseus displays & aggregates** across users | | `rpc.md:498-535` |

#### Anti-responsibilities — what each side must NOT do (this is what makes the roles sharp)

**pi must not:**
1. Hold any credential other than its one per-session scoped `ody_` token (env var). No provider API keys in pi's `auth.json` — model access goes through endpoints Odysseus configured.
2. Discover or choose endpoints/models on its own; `models.json` is Odysseus-generated, read-only in spirit.
3. Touch the host filesystem or shell in non-admin sessions — enforced by absence (`--tools`), not by trust.
4. Persist anything outside its assigned `--session-dir`.
5. Be reached by anything other than its parent Odysseus process (stdio only; no ports).

**Odysseus must not:**
1. Re-implement loop mechanics for pi sessions — no second tool-dispatch layer, no regex re-parsing of pi's output (`src/tool_parsing.py` stays with the native loop).
2. Mutate pi's JSONL transcripts; read-only mirroring into SQLite metadata.
3. Duplicate policy inside the bridge extension — the extension stays a *thin* HTTP shim so that every authorization decision happens server-side where it's already tested (`403` semantics, `integrations/claude/SKILL.md:32`). A fat, "smart" extension would become a second policy engine — the exact failure mode to avoid.
4. Let chat-mode features (memory injection mid-loop, teacher fallback) reach into pi's turns; for pi sessions these become spawn-time inputs or bridge tools, never loop surgery.

#### The four (and only four) touchpoints

```
1. SPAWN      Odysseus → pi   CLI flags + env        (--system-prompt, --tools, -e bridge,
                                                      --session-dir, ODYSSEUS_URL, ODY_TOKEN)
2. RPC        Odysseus ↔ pi   JSONL over stdio        (prompt/steer/abort/set_model …
                                                      ← events, extension_ui_request)
3. BRIDGE     pi → Odysseus   HTTPS /api/codex/*      (scoped token; every domain tool call)
4. ARTIFACTS  Odysseus → pi   generated files          (models.json, curated skills dir,
                                                      session JSONL read-back for UI)
```

Anything that wants to cross between the systems and doesn't fit one of these four lanes is a design smell — it belongs on the Odysseus side of the line.

#### Litmus tests for future decisions

- *"Should pi know about users?"* → No. One process = one user's one session; identity is a spawn-time fact, not a runtime concept.
- *"Should the bridge tool check privileges before calling the API?"* → No. It forwards and reports the 403; the server is the only judge.
- *"Where does a new capability (e.g. smart-home control) go?"* → Implement as an Odysseus route + scope, expose through the bridge. Never as a pi extension with its own credentials.
- *"Should pi sessions appear in the regular chat list?"* → Listing yes (SQLite mirror); content rendering streams from pi's transcript — one canonical store per kind of data.

### B′3. What is lost or must be rebuilt — marked honestly

- **⚠ UNRESOLVED — weak-local-model reliability.** Odysseus's loop was *designed around small local models*: regex-parsed tool blocks work even when a model can't emit clean function-call JSON, and the teacher-escalation system (`src/teacher_escalation.py`) exists precisely because small models fail. Pi's runtime assumes provider-native tool calling. Whether a 7B GGUF served by llama.cpp drives pi's tool loop acceptably is **an empirical question neither repo answers**. If the answer is no, B′ quietly becomes "general agent for API/large models only," which contradicts Odysseus's local-first identity. This is the biggest open risk of B′.
- **⚠ UNRESOLVED — the learning loop detaches.** Teacher escalation, skill distillation from sessions, LLM-as-judge skill testing, memory auto-capture (`docs/concepts/memory-and-skills.md:55-63`) are all wired into *Odysseus's* loop. Sessions running inside pi bypass them. Rebuilding them as pi extensions or post-session analyzers is possible in principle (pi emits full transcripts) but is unscoped new work in both ecosystems.
- **Plan mode** must be re-implemented: spawn-time `--tools` covers session-level read-only, but Odysseus's *mid-session* plan toggle (`routes/chat_routes.py` `plan_mode` param) would need `pi.setActiveTools()` driven through an extension command, or a session respawn.
- **Memory injection per prompt** (`src/chat_processor.py` hybrid retrieval before every LLM call) needs a `before_agent_start` extension handler calling Odysseus's memory API — straightforward per the docs (`extensions.md:468-501`), but new TS code.
- **⚠ FRICTION — process-per-session.** One Node process (≥22.19) per active agent session, spawned/reaped by Odysseus. Precedent exists (`src/bg_jobs.py` manages Cookbook serves with PID/exit files), but the resource profile of N concurrent Node processes on a small self-hosted box is untested.
- **⚠ FRICTION — two session stores remain** (SQLite `Session` vs pi JSONL trees); the bridge must treat one as canonical (likely: pi JSONL canonical for agent sessions, mirrored into SQLite for UI listing).

### B′4. Incremental path (exploration only — ordering, not a plan)

1. **Phase 0 (config-only, today):** A1 + A2 — pi beside Odysseus, sharing models and the scoped API skill. Validates the API surface and token scopes under pi.
2. **Phase 1 (small):** Odysseus spawns `pi --mode rpc` for an **admin-only "Code Agent"** session type with stock pi tools; Python RPC client + SSE bridge. Validates process lifecycle, streaming translation, abort/steer.
3. **Phase 2 (the real build):** `odysseus-bridge` extension + per-user `--tools` gating + custom system prompt → general agent for all users. Gate on the B′3 local-model question *first* — test pi's tool loop against the user's typical local models before committing.

## Why combine — the emergent gains (what neither provides alone)

> Added 2026-06-07. Filter applied: a gain only counts if neither project could get it alone by simply adding a feature at reasonable cost. Six survive.

### 1. A long-horizon agent that actually knows you *(strongest gain)*
Odysseus has the life context — hybrid memory (`src/chat_processor.py:24-31`), email, calendar, todos — but its loop can't run long: no compaction, `MAX_AGENT_ROUNDS = 50` (`src/agent_tools.py:22`). Pi runs for hours — auto-compaction (`rpc.md:354-393`), session trees (`docs/session-format.md`) — but is amnesiac by design: no memory, no personal data (`what-is-pi.md:61-65`). Combined: tasks like "work through this 200-email backlog, update todos and calendar, maintain a summary document" become runnable. They require *both* durable personal context and a loop that survives 100+ turns.

### 2. Context-preserving model escalation *(second-strongest gain)*
Odysseus's teacher/student escalation (`src/teacher_escalation.py`) re-runs failed tasks on a stronger model — but it *restarts*, discarding session state. Pi's `set_model` switches models **mid-session with full context retained** (`rpc.md:217-233`; `what-is-pi.md:13` — "hand it from Claude to GPT-5 mid-session"). Combined: the local 7B does cheap turns; when it stalls, Odysseus's escalation policy issues one RPC command and the strong model continues *with everything the small one already learned*. Odysseus lacks the portable-context runtime; pi lacks the policy brain deciding when to escalate.

### 3. One GPU, one model pool, every surface
Pi consumes OpenAI-compatible endpoints but **cannot create them** — no hardware probing, VRAM-fit scoring, or download/serve (Cookbook's job: `services/hwfit/`, `src/cookbook_serve_lifecycle.py`). Odysseus serves models but has no terminal-grade agent runtime to spend them on. Combined: Cookbook serves what fits the card once; chat, research, and the agent share the same VRAM.

### 4. A policy boundary around an agent that has none
Pi is single-user, fully trusted, permissionless (`what-is-pi.md:63`) — it can never safely be handed to family/team members or unattended automation. Odysseus is multi-user with server-side scoped tokens (`integrations/claude/README.md:32-36`) and per-user privileges (`core/auth.py`) — but its native agent is its weakest component. Combined (per the B′2a contract): each user gets a *bounded* pi — capability-stripped at spawn (`--tools`, `usage.md:198`), scope-checked at the API. Pi gains an audience it could never have; Odysseus gains a runtime worth bounding.

### 5. Scheduled, autonomous agents that reach your phone
Pi has no scheduler, notifications, or inbox-watching — someone must sit at the terminal. Odysseus has cron tasks (`src/task_scheduler.py`), ntfy push, email triage, webhooks — but only its limited native loop to act on them. Combined: "every morning at 7, read overnight email, cross-check the calendar, push a briefing to my phone" — Odysseus triggers and notifies; a pi one-shot (`pi --mode json -p`, `docs/json.md`) does the multi-step reasoning. Agentic *automation*, not just agentic *sessions*.

### 6. One agent session, every device
Pi is terminal-only; its sessions are portable JSONL files (`docs/session-format.md`). Odysseus is a responsive PWA (`README.md:24`) with SSE streaming and stop/resume. Combined: start a task in the terminal at the desk, then steer the *same session* from a phone — Odysseus spawns pi with `switch_session` (`rpc.md:564-580`) on the same file and bridges `steer` (`rpc.md:80-100`) to the mobile UI. Neither project has any path to this alone.

### The pattern, and the honest counterweight
Every gain pairs **Odysseus's stateful periphery** (data, models, users, schedule, devices) with **pi's stateless core** (a loop that runs long and ports across models). The integration is cheap where it should be expensive because both projects independently rejected the same things (heavyweight protocols, baked-in workflow) and converged on the same interfaces — SKILL.md, OpenAI-compatible endpoints, scoped HTTP.

Counterweight: **gains 1 and 2 are the only ones where combination is strictly necessary** — the others could in principle be replicated by either project growing the missing half, at much higher cost than integrating. All six inherit B′3's marked risks unchanged: ⚠ the small-model tool-calling question and ⚠ the detached learning loop.

## Verdict

**Yes, they compose into a meaningful suite — but asymmetrically.**

| | Effort | Value | Blockers |
|---|---|---|---|
| **A1** pi loads Odysseus's agent skill → workspace access (todos/email/calendar/memory/docs/Cookbook) | ~Config only | High | minor path/`python3` wording (⚠ FRICTION) |
| **A2** pi runs on Cookbook-served models | One `models.json` entry (or small extension for dynamic discovery) | High | none found |
| **A3** Shared skill libraries | Config + verification | Medium | lifecycle one-way street (⚠ UNRESOLVED), frontmatter leniency unverified (⚠ FRICTION) |
| **A4** pi auto-uses Odysseus memory | TS extension (new code) | Medium | not built; possible per docs |
| **B** Odysseus embeds pi as a Code Agent backend via RPC | New subsystem (Python RPC client + SSE bridge + lifecycle mgmt) | High for coding tasks (Odysseus's native agent is a generalist; pi is a specialist coding harness with compaction, session trees, model-switching) | **security-model collision (⚠ UNRESOLVED)**, Node ≥22.19 (⚠ FRICTION), state duplication (⚠ FRICTION) |

**The grounded sweet spot, using only what both projects ship today:** Odysseus as the always-on workspace/model-host, pi as the terminal coding specialist *beside* it — pi pointed at Cookbook's endpoints (A2) and equipped with the Odysseus skill bundle (A1), all access scope-gated server-side by Odysseus's existing token system. Direction B is the ambitious version and is technically well-supported by pi's RPC design, but it should not be attempted until the B2 security question has an explicit, chosen answer.

## Open questions for the user (cannot be resolved from the repos)

1. ~~**B-scope:** is the goal "pi for me, the admin" or "coding agent for all Odysseus users"?~~ **Answered 2026-06-07:** the user's ideal is pi inside Odysseus as a **general agent**, not just coding → see Direction B′. The per-user scoping answer becomes: bridge-extension tools for everyone (scope-gated server-side), pi built-ins (`bash`/`read`/`write`/`edit`) admin-only via spawn-time `--tools`.
2. ~~**Which direction matters more?**~~ **Answered:** B′ is the destination; A remains the zero-cost first step and de-risks the API surface (B′4 Phase 0).
3. **A3 verification:** load one Odysseus skill in a real pi install and confirm the lenient frontmatter parse — 5 minutes with both tools installed, impossible from source reading alone.
4. **B′ gating question (new, empirical):** do the user's typical local models (small GGUFs via llama.cpp/Ollama) drive pi's native function-calling tool loop reliably? If not, B′ serves API/large models only — test before building Phase 2.
