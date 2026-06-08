"""Embedded pi agent backend.

Drives a `pi --mode rpc` subprocess as an Odysseus chat/agent session and
translates pi's JSONL event stream into the SSE event shapes the Odysseus
frontend already understands (see ``src/agent_loop.py`` docstring for the
contract: ``{"delta": ...}``, ``{"type": "tool_start"/"tool_output"/...}``,
``data: [DONE]``).

This is the "runs long" half of Gain #1 (see
``docs/odysseus-pi-integration-assessment.md``): pi owns the agent loop,
compaction, and session tree; Odysseus owns identity, policy, the model, and
the UI. The agent's powers come solely from the ``odysseus-bridge`` extension
(a scoped ``manage_memory`` tool) plus whatever ``--tools`` allowlist we pass —
pi's host built-ins (bash/read/write/edit) are excluded for non-admin use.

Design notes:
- We use ``subprocess.Popen`` + a reader thread bridged to an ``asyncio.Queue``
  rather than ``asyncio.create_subprocess_exec``. On Windows, asyncio
  subprocesses need the Proactor loop, which uvicorn does not guarantee; the
  thread bridge is loop-agnostic and matches ``src/bg_jobs.py``.
- Each Odysseus session gets its own ``--session-dir`` and we pass
  ``--continue`` once a session file exists, so the pi conversation (and its
  compaction state) persists across turns — the long-horizon thread.
- Lifecycle is bound to the run: cancelling the stream (via
  ``agent_runs.stop``) sends ``abort`` and kills the process tree.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from core.platform_compat import detached_popen_kwargs, kill_process_tree

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
_BRIDGE_EXTENSION = _REPO_ROOT / "integrations" / "pi" / "extension" / "odysseus-bridge.ts"
_PI_SESSIONS_DIR = _REPO_ROOT / "data" / "pi_sessions"

# A general personal-assistant persona (NOT pi's default coding persona). Kept
# short; the bridge extension appends the user's relevant memories each turn.
_DEFAULT_PERSONA = (
    "You are the user's personal assistant inside Odysseus, their self-hosted "
    "workspace. You help with everyday tasks and longer multi-step work, and you "
    "remember durable facts about the user across sessions. Use the manage_memory "
    "tool to recall what you need and to record new durable facts the user shares "
    "(preferences, identity, projects, goals, contacts). Be concise and helpful."
)


def _pi_executable() -> str:
    """pi's bin name. On Windows npm installs a ``pi.cmd`` shim on PATH."""
    return "pi.cmd" if os.name == "nt" else "pi"


def _session_dir_for(session_id: str) -> Path:
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_") or "default"
    return _PI_SESSIONS_DIR / safe


def _has_existing_session(session_dir: Path) -> bool:
    try:
        return session_dir.is_dir() and any(session_dir.glob("**/*.jsonl"))
    except OSError:
        return False


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def stream_pi_agent(
    *,
    session_id: str,
    message: str,
    sess: Any,
    session_manager: Any,
    model_id: str,
    model_base_url: str,
    api_token: str,
    odysseus_url: str,
    incognito: bool = False,
    context_window: int = 32768,
    max_tokens: int = 4096,
    system_prompt: Optional[str] = None,
    allowed_tools: str = "manage_memory",
) -> AsyncGenerator[str, None]:
    """Run one user turn through an embedded pi RPC subprocess.

    Yields Odysseus SSE event strings. Persists the user + assistant messages to
    ``sess`` on completion (unless ``incognito``). The pi conversation persists
    on disk under ``data/pi_sessions/<session_id>/`` so the next turn continues
    it (long-horizon).
    """
    if not _BRIDGE_EXTENSION.exists():
        yield _sse({"delta": "pi bridge extension is missing; cannot start the agent."})
        yield "data: [DONE]\n\n"
        return

    session_dir = _session_dir_for(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)

    argv = [
        _pi_executable(),
        "--mode", "rpc",
        "--session-dir", str(session_dir),
        "--provider", "odysseus",
        "--model", model_id,
        "--system-prompt", system_prompt or _DEFAULT_PERSONA,
        "--tools", allowed_tools,
        "-e", str(_BRIDGE_EXTENSION),
        "--no-skills",
    ]
    if _has_existing_session(session_dir):
        argv.append("--continue")  # resume the prior turn's session

    env = dict(os.environ)
    env.update({
        "ODYSSEUS_URL": odysseus_url,
        "ODYSSEUS_API_TOKEN": api_token,
        "ODYSSEUS_MODEL_BASE_URL": model_base_url,
        "ODYSSEUS_MODEL_ID": model_id,
        "ODYSSEUS_MODEL_CONTEXT": str(context_window),
        "ODYSSEUS_MODEL_MAXTOKENS": str(max_tokens),
    })

    try:
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(session_dir),
            env=env,
            text=True,
            encoding="utf-8",
            bufsize=1,
            **detached_popen_kwargs(),
        )
    except FileNotFoundError:
        yield _sse({"delta": "pi is not installed or not on PATH (npm i -g @earendil-works/pi-coding-agent)."})
        yield "data: [DONE]\n\n"
        return

    loop = asyncio.get_event_loop()
    evq: asyncio.Queue = asyncio.Queue()
    stderr_lines: list[str] = []
    _SENTINEL = object()

    def _read_stdout() -> None:
        try:
            for line in proc.stdout:  # type: ignore[union-attr]
                line = line.rstrip("\r\n")
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                loop.call_soon_threadsafe(evq.put_nowait, ev)
        finally:
            loop.call_soon_threadsafe(evq.put_nowait, _SENTINEL)

    def _read_stderr() -> None:
        try:
            for line in proc.stderr:  # type: ignore[union-attr]
                if line.strip():
                    stderr_lines.append(line.rstrip())
        except Exception:
            pass

    threading.Thread(target=_read_stdout, daemon=True).start()
    threading.Thread(target=_read_stderr, daemon=True).start()

    def _send(cmd: dict[str, Any]) -> None:
        try:
            proc.stdin.write(json.dumps(cmd) + "\n")  # type: ignore[union-attr]
            proc.stdin.flush()  # type: ignore[union-attr]
        except (BrokenPipeError, ValueError, OSError):
            pass

    _send({"type": "prompt", "message": message})

    assistant_text: list[str] = []
    tool_events: list[dict[str, Any]] = []
    round_num = 0
    completed = False

    try:
        while True:
            ev = await evq.get()
            if ev is _SENTINEL:
                # stdout closed (process exited) without a clean agent_end
                break
            etype = ev.get("type")

            if etype == "message_update":
                ame = ev.get("assistantMessageEvent", {}) or {}
                if ame.get("type") == "text_delta":
                    delta = ame.get("delta", "")
                    if delta:
                        assistant_text.append(delta)
                        yield _sse({"delta": delta})
                # thinking_delta is intentionally not surfaced as answer text

            elif etype == "tool_execution_start":
                round_num += 1
                tool_name = ev.get("toolName", "tool")
                args = ev.get("args") or {}
                cmd_display = json.dumps(args)[:200] if args else ""
                yield _sse({
                    "type": "tool_start",
                    "tool": tool_name,
                    "command": cmd_display,
                    "round": round_num,
                })

            elif etype == "tool_execution_end":
                tool_name = ev.get("toolName", "tool")
                result = ev.get("result", {}) or {}
                out_text = _extract_tool_text(result)
                is_error = bool(ev.get("isError"))
                evt = {
                    "type": "tool_output",
                    "tool": tool_name,
                    "command": "",
                    "output": out_text,
                    "exit_code": 1 if is_error else 0,
                }
                tool_events.append({"round": round_num, "tool": tool_name, "output": out_text})
                yield _sse(evt)

            elif etype == "compaction_end":
                yield _sse({"type": "compacted", "data": {"was_compacted": True}})

            elif etype == "agent_end":
                completed = True
                break

        # Final metrics (best-effort; pi tracks real usage via get_session_stats)
        yield _sse({"type": "metrics", "data": {"backend": "pi", "rounds": round_num}})

        if not completed and stderr_lines:
            logger.warning("[pi-backend] session %s ended without agent_end. stderr tail: %s",
                           session_id, " | ".join(stderr_lines[-3:]))

        _persist(sess, session_manager, message, "".join(assistant_text),
                 tool_events, model_id, incognito)
        yield "data: [DONE]\n\n"

    except asyncio.CancelledError:
        # Stream cancelled (user hit stop). Abort pi and persist the partial.
        _send({"type": "abort"})
        _persist(sess, session_manager, message, "".join(assistant_text),
                 tool_events, model_id, incognito, partial=True)
        raise
    finally:
        try:
            kill_process_tree(proc.pid)
        except Exception:
            pass


def _extract_tool_text(result: dict[str, Any]) -> str:
    """Pull human-readable text out of a pi tool result's content blocks."""
    content = result.get("content")
    if isinstance(content, list):
        parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        return "\n".join(p for p in parts if p)
    if isinstance(content, str):
        return content
    return ""


def _persist(sess: Any, session_manager: Any, user_msg: str, assistant_msg: str,
             tool_events: list, model_id: str, incognito: bool,
             partial: bool = False) -> None:
    """Mirror the turn into Odysseus's session store so the UI history works.

    pi's own JSONL under data/pi_sessions/ remains the canonical transcript;
    this is the lightweight mirror the chat list/history reads."""
    if incognito:
        return
    try:
        from core.models import ChatMessage  # same type SessionManager.add_message expects
        if user_msg:
            sess.add_message(ChatMessage("user", user_msg))
        if assistant_msg or tool_events:
            md: dict[str, Any] = {"model": model_id, "backend": "pi"}
            if tool_events:
                md["tool_events"] = tool_events
            if partial:
                md["stopped"] = True
            sess.add_message(ChatMessage("assistant", assistant_msg or "", metadata=md))
        session_manager.save_sessions()
    except Exception as exc:
        logger.error("[pi-backend] failed to persist session turn: %s", exc, exc_info=True)
