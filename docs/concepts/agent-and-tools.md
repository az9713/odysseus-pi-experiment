# Agent and tools

How agent mode works: the tool loop, what tools exist, the security gates around them, plan mode, and MCP.

## What it is

Agent mode turns the chat model from a talker into a doer. The model emits tool invocations; Odysseus executes them and feeds results back; the model decides the next step — looping until the task is finished. Built on the same chat pipeline, plus a tool-execution layer (`src/agent_loop.py`, `src/tool_execution.py`).

## Why it's its own subsystem

Tools are where an AI workspace earns its keep — and where it can hurt you. Shell access, file writes, and email sending need a consistent permission model, not per-feature ad-hoc checks. Centralizing the loop also lets every tool consumer (chat agent, scheduled tasks, email triage, the codex API) share one gated implementation.

## How the loop works

1. The agent preamble is appended to the system prompt: available tools, their JSON schemas, and the rules (use tools only when needed; edit files via find/replace rather than rewrites; bias toward action; retry differently after failure).
2. The model responds. If the response contains a tool block —

   ```text
   <tool_use>
   name: bash
   input: {"command": "ls ~/projects"}
   </tool_use>
   ```

   — Odysseus parses it, checks the security gate, executes, and appends the result as a `<tool_result>` block.
3. The model sees the result and continues: another tool, or a final answer.
4. Results render richly in the UI — tool outputs are collapsible, and the agent can emit clickable jump links (`#session-<id>`, `#document-<id>`, `#task-<id>`, `#image-<id>`, `#email-<id>`) that navigate the workspace.

Tool calls auto-execute — there is no per-call approval prompt. The control points are *who* may use *which tools* (privileges) and *plan mode* (below), not per-invocation confirmation.

## The tool families

| Family | Tools (representative) | Default availability |
|--------|----------------------|---------------------|
| Shell & code | `bash`, `python` | **Admin only** |
| Filesystem | `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `ls` | **Admin only** |
| Web | `web_search`, `web_fetch` | All users (policy-gated) |
| Documents | `create_document`, `edit_document` | Users with `documents` privilege |
| Email | `list_emails`, `read_email`, `send_email`, `reply_to_email` | **Admin only** |
| Memory & skills | memory CRUD, `manage_skills` | Memory: per-privilege; management: admin |
| Workspace management | `manage_tasks`, `manage_endpoints`, `manage_mcp`, `manage_webhooks`, `manage_tokens`, `manage_settings` | **Admin only** |
| Cookbook | `download_model`, `serve_model` | **Admin only** |
| Vault | `vault_search`, `vault_get` | **Admin only** |
| AI-to-AI | `chat_with_model`, `create_session`, `send_to_session`, `pipeline`, `ask_teacher`, `list_models` | Agent-capable users (see below) |
| MCP | every `mcp__*` tool from registered servers | **Admin only** |

The authoritative deny-list for non-admins is `NON_ADMIN_BLOCKED_TOOLS` in `src/tool_security.py`; the gate **fails closed** (an unrecognized or malformed tool name is blocked, and `mcp__*` is blocked wholesale for non-admins).

## Privileges

Each user carries a privilege profile (`core/auth.py`):

```python
DEFAULT_PRIVILEGES = {            # non-admin baseline
    "agent": True, "browser": True, "bash": False,
    "documents": True, "research": True, "images": True, "memory": True,
    "max_messages": 50,           # per-session cap; 0 = unlimited
    "allowed_models": [],         # empty = all; non-empty = whitelist
}
```

Admins get everything uncapped. Review per-user privileges before exposing a deployment — the [threat model](../../THREAT_MODEL.md) documents the role split.

## Plan mode

Plan mode flips the gate from deny-list to **allow-list**: only read-only tools run (`read_file`, `grep`, `glob`, `ls`, `web_search`, `web_fetch`, `search_chats`, `list_*`…). All mutating tools are blocked, and shell is blocked outright — you can't constrain `bash` to read-only. For MCP tools, read-onlyness comes from the server's `readOnlyHint` annotation, falling back to a verb heuristic (`get_*`/`list_*`/`read_*` → read-only).

Use plan mode to let the agent investigate and propose before you let it act.

## The internal tool loopback

Many tools are implemented as calls to Odysseus's own HTTP API. The agent authenticates these with `X-Odysseus-Internal-Token` — a random per-process secret generated at startup, never persisted, never sent to clients (`core/middleware.py`). External callers can't forge it, and direct-loopback detection prevents `X-Forwarded-For` spoofing.

## MCP: extending the toolset

Odysseus speaks the Model Context Protocol both ways:

- **As a client** (`src/mcp_manager.py`): admins register external MCP servers (stdio, SSE, or HTTP transport) in Settings. Tool schemas are discovered via the MCP `initialize` handshake and cached; servers spawn lazily on first use.
- **Built-in servers** (`mcp_servers/`): email, memory, RAG, and image generation ship as stdio MCP servers, so the same tool logic serves the agent without bespoke wiring.
- **The browser MCP** (`@playwright/mcp` — page navigation, screenshots, vision) auto-registers at startup *only if* the npm package is already cached, so fresh installs never block on a 300MB download. Enable it once with:

  ```bash
  npx -y @playwright/mcp@latest --version
  ```

  then restart Odysseus.

## Multi-model orchestration

Odysseus is a single-agent loop, but it ships AI-to-AI tools (`src/ai_interaction.py`) that let that agent *conduct other models* — lightweight multi-agent patterns without an external framework.

| Tool | What it does |
|------|--------------|
| `chat_with_model` | Ask a **different** model and relay its answer. Line 1 of the input is the model name (or `model@endpoint`), the rest is the message. |
| `create_session` / `send_to_session` | Spawn a separate session — a worker with its own context — and message it. Multi-round exchanges are capped (5 rounds) to prevent runaway loops. |
| `pipeline` | Chain up to 10 steps, each step's output feeding the next — across different models if desired. |
| `list_models` | Discover what's available to delegate to. |
| `ask_teacher` | Escalate the current problem to the configured teacher model (below). |

Because these are ordinary agent tools, orchestration happens **at the prompt level**: *"draft this with the local 8B, have the API model critique it, then revise"* and the agent wires the calls itself. To make a pattern repeatable, encode it as a [skill](memory-and-skills.md).

### Teacher escalation

`src/teacher_escalation.py` implements a student-teacher pattern for self-hosted models. When a small local model fails an agent task (detected by a regex-based evaluation of the turn), and a `teacher_model` is configured, the full failed context escalates to that stronger endpoint. If the teacher's answer passes the same evaluation, it is **distilled into a skill** the student follows next time — the weak model permanently improves instead of failing the same way twice. Escalation only triggers for self-hosted endpoints (API models are assumed strong enough), and the trace is treated as untrusted execution data before anything is persisted.

### Limits, honestly

Sub-calls run **sequentially inside one agent turn** (120s timeout per AI-to-AI call); there is no parallel fan-out and every delegated answer consumes the orchestrating model's context. The truly parallel built-ins are [Compare](chat-and-models.md) (two models at once) and concurrent scheduled tasks. For larger swarms, orchestrate from outside: Claude Code or any framework can drive Odysseus through scoped API tokens, treating sessions as agents ([integrations](integrations.md)).

## Prompt-injection hardening

Tool results are untrusted by definition — a fetched web page or an email can contain "ignore your instructions and...". Odysseus wraps untrusted content (web results, emails, fetched URLs, memories, skill text, notes) via `src/prompt_security.py`, placing it in a clearly-bounded user-role message with a header telling the model not to follow instructions inside, and includes an untrusted-context policy in every system prompt. Treat this as mitigation, not immunity — the [ROADMAP](../../ROADMAP.md) keeps prompt-injection auditing as an open work item.

## Configuration and tuning

- Tool availability per user: Settings → users (admin).
- MCP servers: Settings → MCP (admin).
- Context pressure: agent prompts are heavy (schemas + skills + memories). For small local models with 4–16k context, trim the toolset and skills; this is a known pain point being actively worked ([ROADMAP](../../ROADMAP.md)).

## Common gotchas

- **Agent shell on Windows** needs Git for Windows (`bash.exe`); without it the shell tool and Cookbook background jobs are limited.
- **A tool "randomly" unavailable** usually means a privilege gate, not a bug — check whether the user is admin and whether plan mode is on.
- **Small models flailing in agent mode:** the tool-schema overhead can eat their context before the task starts. Use a larger model for agent work, or cut the enabled tool count.
