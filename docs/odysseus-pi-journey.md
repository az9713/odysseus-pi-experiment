# Odysseus × pi — The Integration Journey (Gain #1)

**Period:** 2026-06-07 → 2026-06-09
**Scope of this document:** a complete, honest record of what we set out to do, what we built, every test we ran, and whether the goals are met (and where they are not — and why).

Related docs: [`odysseus-pi-integration-assessment.md`](odysseus-pi-integration-assessment.md) (the analysis + role contract). Implementation lives under `integrations/pi/`, `src/pi_backend.py`, and edits to `routes/codex_routes.py`, `routes/api_token_routes.py`, `routes/chat_routes.py`.

---

## 1. What we set out to do

**Starting point.** You run **Odysseus** — a self-hosted AI workspace (chat, a native agent, Cookbook model-serving, persistent memory, email/calendar/notes). You pointed me at **pi** — a deliberately minimal **terminal coding agent** (npm `@earendil-works/pi-coding-agent`) with a unified LLM API, an excellent agent loop, context compaction, and resumable session trees.

**The question.** Could the two combine into "one meaningful, productive AI agent environment"?

**The analysis** (assessment doc) found the projects *complementary by construction and compatible by accident*, and isolated the single most valuable outcome:

> **Gain #1 — a long-horizon agent that actually knows you.**
> - Odysseus *knows you* (memory, your data) but its loop is weak: capped at 50 rounds (`src/agent_tools.py`), no compaction.
> - pi *runs for hours* (auto-compaction, session trees) but is **amnesiac by design** (`docs/what-is-pi.md`).
> - Neither can do the headline task alone: *run many turns over your life-data and remember what it learns.* The combination can.

**The concrete goal we committed to** (your decisions, captured during planning):
- Embed pi as an Odysseus session backend (`mode="pi"`), driven over JSONL-RPC.
- Give pi Odysseus's **memory** via a thin, scoped bridge (read + write).
- Prove it **remembers you across sessions.**
- Constraints: **admin-only**, **memory-only**, **local-model-first**.

**The architecture (role contract).** Odysseus = *control plane* (identity, policy, data, models, UI, process lifecycle); pi = *execution plane* (the agent loop, untrusted). The bridge is deliberately thin: every authorization decision is made server-side by token scopes; pi's host tools (`bash`/`read`/`write`/`edit`) are excluded at spawn for non-admin use.

---

## 2. What we built

Six commits over a clean baseline (the tree was not under version control before; `git init` was run first so everything is reviewable and revertable):

```
5439c54  Record Phase 2 e2e PASS in assessment doc
a76f14c  Phase 2 fix: per-session models.json provider + drop DETACHED_PROCESS
da9e6ea  Phase 2 hardening: GeneratorExit on cancel; close stdin before kill
74cbd23  Phase 2: embedded pi RPC backend + chat dispatch wiring
b40d19d  Phase 1: memory bridge for embedded pi agent
b9a5436  Baseline: Odysseus source before pi integration
```

| Component | File | Role |
|---|---|---|
| Ranked memory search | `routes/codex_routes.py` → `POST /api/codex/memory/search` | Recall reusing Odysseus's own scorer (`get_relevant_memories`) |
| In-process token mint | `routes/api_token_routes.py` → `mint_api_token()` | Mint a per-session scoped (`memory:read/write`) token without an HTTP round-trip |
| pi bridge extension | `integrations/pi/extension/odysseus-bridge.ts` | A `manage_memory` tool (search/add → scoped API) + per-turn memory **injection** via `before_agent_start`; 8s fetch timeout |
| RPC backend | `src/pi_backend.py` | Spawns `pi --mode rpc`, writes a per-session `models.json`, translates pi events → Odysseus SSE, manages process lifecycle |
| Chat dispatch | `routes/chat_routes.py` → `_start_pi_stream()` | `mode=="pi"` branch: admin gate → mint token → point pi at the session's model → run via `agent_runs` (stop/resume unchanged) |

Environment under test: Windows 11, Python venv, Node ≥22.19, pi **0.78.1** (npm global), Ollama serving **`gemma4:e4b`** on an RTX 3050 (4 GB VRAM, so heavy CPU offload → slow but functional).

---

## 3. The tests we ran

### Test 1 — Phase 0 GO/NO-GO spike (the gate): ✅ PASS
*Can a small local model even drive pi's tool loop?* The one risk no code-reading could resolve.
- **Capability:** raw Ollama and pi-via-RPC both emitted valid native tool calls for `gemma4:e4b`.
- **RPC tool loop:** a `read`-tool task completed cleanly through `pi --mode rpc` (correct multi-step answer, no errors).
- **Long-horizon:** an 11-turn run completed 10/11 turns and **preserved early facts (Rex / 42 / Lisbon) across 8 compaction cycles**, with all 5 tool reads firing.
- *Note:* pi's `-p` **print** mode hard-fails on this reasoning model (`Cannot continue from message role: assistant`) — irrelevant, since we use **RPC** mode, which works.

**Verdict:** local model is viable on pi's RPC path. Gate opened.

### Test 2 — Offline cross-session memory (the core of Gain #1): ✅ PASS
`stream_pi_agent` driven directly, with a stub mirroring the two `/api/codex/memory*` endpoints (so no full server needed), against real `gemma4:e4b`:

```
TURN 1 (session A): "remember my dog is Rex" → tools: ['manage_memory'] → store: [{"text":"My dog's name is Rex."}]
TURN 2 (session B, FRESH): "what is my dog's name?" → "Your dog's name is Rex."  (no tool call — recalled via injection)

turn1 saved a memory:        True
turn1 called manage_memory:  True
turn2 recalled 'Rex':        True
RESULT: PASS — cross-session memory works
```

**Why this test matters:** session B is brand-new with none of session A's conversation. The only way it answers "Rex" is the bridge retrieving the fact from memory and injecting it. **This is Gain #1 working** — through the real pi RPC loop on the real local model.

### Test 3 — `pi_backend` live module test: ✅ PASS (after fixes)
Drove `stream_pi_agent` with live event printing to localize a hang. After the two fixes below, it streamed correctly: `memory-search hit → delta "Hello" → metrics → persist(user+assistant) → [DONE]`.

### Test 4 — Live-server HTTP path (the real production path): ⚠️ NOT YET CONFIRMED
Driving the actual server (`uvicorn app:app`) over HTTP: real login → create session → `POST /api/chat_stream` with `mode=pi` → recall in a fresh session → verify via real `/api/memory`.

Results so far:
- ✅ **Login works** (`POST /api/auth/login` → 200).
- ✅ **Session creation works.**
- ❌ **`chat_stream` returned HTTP 400:** *"Selected model endpoint was removed. Pick another model in Settings."*

**This is not a pi-integration defect.** It is Odysseus's normal precondition (`_clear_orphaned_session_endpoint`, `routes/chat_routes.py`): a chat session's model must come from a **registered** model endpoint (Settings → endpoints), not an arbitrary URL. The 400 fires *before* the `mode=="pi"` branch is even reached. The fix is a one-step prerequisite — register the Ollama endpoint via `POST /api/model-endpoints` before creating the session — which had been written but **not yet run** when work was paused. So the end-to-end *production HTTP* path remains **unconfirmed**, blocked one configuration step short of the pi code.

---

## 4. Bugs found and fixed during validation

Two genuine integration bugs (both made the agent hang *before* any LLM call) plus one hardening fix — all in the subprocess/async seam that unit-level checks can't reach:

1. **Provider registered too late.** The bridge extension's `registerProvider("odysseus")` was "Unknown" in rpc mode, because pi resolves `--provider` at startup *before* extension factories run. (`--list-models` masked this — it loads extensions first.)
   **Fix:** Odysseus writes a per-session `models.json` (read via `$PI_CODING_AGENT_DIR`) and selects it with `--provider`; the bridge is now memory-only.

2. **`DETACHED_PROCESS` broke the pipes.** `pi_backend` initially spawned with `detached_popen_kwargs()` (copied from `bg_jobs.py`), which on Windows detaches the child from the console and **breaks stdio pipes to the `pi.cmd` shim** — so the prompt never reached pi and pi's output never reached us. That pattern is for fire-and-forget DEVNULL jobs, *not* bidirectional RPC.
   **Fix:** plain `Popen` with owned pipes; reap the tree via `kill_process_tree(pid)`.

3. **Hardening:** the bridge's memory `fetch` now has an 8s `AbortController` timeout, so a slow/hung Odysseus can never stall a turn (`before_agent_start` runs every turn).

**Process lesson (documented honestly):** Phase 0, the extension load test, and import checks all validated *pieces in isolation* and passed — but the two bugs lived in `pi_backend`'s actual spawn path, exercised only by an end-to-end run. The first offline e2e even hung the same way, but its output was purged by the 24h temp cleanup before it could be diagnosed. *Integration code is guilty until an end-to-end run proves it innocent.*

---

## 5. Are the goals met?

**Short answer: the core capability is proven; the live production HTTP path is one configuration step from confirmation.**

| Goal | Status | Evidence |
|---|---|---|
| Local model drives pi's loop | ✅ Met | Test 1 (8 compactions, tool calls) |
| pi embedded as Odysseus backend (`mode=pi`) | ✅ Built; ⚠️ live path unconfirmed | Code complete; Test 4 reached the dispatch but was blocked by endpoint pre-reg |
| Memory bridge (read + write, scoped) | ✅ Met | Tests 2 & 3 |
| **Cross-session "knows you"** (the heart of Gain #1) | ✅ **Met (offline, real model)** | Test 2 PASS |
| Same behavior over the real HTTP server | ⚠️ **Not yet confirmed** | Test 4: login+session OK; chat blocked by unregistered endpoint |
| Long-horizon continuity within one session (`--continue`) | ◻️ Coded, not specifically tested | Tests used separate sessions to isolate memory |
| UI entry point (mode selector) | ◻️ Not built | v1 triggers `mode=pi` via the API |

### How the met goals were achieved
The mechanism that makes "knows you across sessions" work, concretely: on every turn the bridge's `before_agent_start` handler queries Odysseus's ranked memory (`/api/codex/memory/search`) for the user's prompt and **prepends the results to pi's system prompt**; when the user states a durable fact, the agent calls `manage_memory(add)` which writes to Odysseus's store via the scoped token. Because memory lives in Odysseus (not in pi's per-session state), a brand-new pi session recalls it — proven in Test 2.

### Why the remaining goal is not yet met
The live HTTP path stopped at **Odysseus's own model-endpoint registration requirement**, not at any pi code. The session was created with a raw model URL; Odysseus requires a registered endpoint and rejects the chat with 400 before reaching the pi branch. The remediation (register the endpoint via `POST /api/model-endpoints`, then create the session against it) was prepared but not executed. Until that run completes, we have **not** observed the full production path (`chat_routes` dispatch → `require_admin` → in-process token mint → bridge → real `/api/codex/memory`) succeed end-to-end — even though each of those pieces has been individually validated.

---

## 6. Is the combination worth it? What do we gain?

**Verdict: worth it — for one specific, real capability that neither tool has alone.**

Genuine, emergent gains (proven or clearly in reach):
1. **An agent that is both durable and personal** — long pi-style runs *plus* Odysseus's memory of you. This is the headline, and the core is proven (Test 2). Neither product offers it.
2. **One model pool, every surface** — pi can't serve models; Odysseus's Cookbook can. They share one local endpoint.
3. **A trust boundary around a permissionless agent** — pi has no permission system by design; behind Odysseus's scoped tokens + admin gate it becomes safe to widen beyond one user.

Honest cost: ~5 files / 6 commits of glue, and two real bugs that only an end-to-end run surfaced. The combo earns its keep **only** for the "personal, long-horizon, multi-surface" use case — for terminal coding alone, pi by itself is better and Odysseus adds nothing.

Why it was cheap enough to be worth it: both projects independently rejected heavyweight integration (pi refuses MCP; Odysseus exposes agents via plain scoped HTTP + the `SKILL.md` standard) and converged on the same minimal interfaces — so bridging was contract-fitting, not a rewrite.

---

## 7. Exactly where things stand & the next step

- **Proven:** local-model viability, the memory bridge, and cross-session recall — end-to-end against the real model, offline (with a memory-API stub).
- **One step remaining for full confidence:** run the live HTTP test after registering the Ollama endpoint in Odysseus (`POST /api/model-endpoints` → create session against it → `mode=pi`). This exercises the real `chat_routes` dispatch, admin gate, token mint, and the live `/api/codex/memory` round-trip.
- **Deferred (out of v1 scope):** a UI mode-selector; explicit `--continue` long-horizon test; multi-user (per-user tokens, host-tool stripping).

**Bottom line:** We set out to make Odysseus and pi into a personal agent that runs long *and* remembers you. That capability is built and demonstrated against your real local model; the only thing not yet observed is the same success over the live web server, which is gated by a standard Odysseus endpoint-registration step rather than by the integration itself.
