# API tokens and scopes

The authoritative reference for programmatic access. Source of truth: `routes/api_token_routes.py` (token minting and the scope enum) and `routes/codex_routes.py` (agent-endpoint enforcement).

## Tokens

An API token is a bearer credential for external clients:

- Format: `ody_...`; sent as `Authorization: Bearer ody_...`.
- Created in **Settings** (admin) or via `POST /api/tokens`; the raw value is shown **once** and stored hashed.
- Each token carries one or more **scopes** (comma-separated). Default scope when none requested: `chat`.
- Tokens can be listed, rotated, and revoked; auth middleware caches them in memory so per-request validation doesn't hit the database.

> **Tip:** One token per integration. Revoking the phone shouldn't break your Claude Code setup.

## Scope reference

The allowed scope set (`ALLOWED_SCOPES`, routes/api_token_routes.py:15):

| Scope | Grants |
|-------|--------|
| `chat` | Chat API: send messages, stream responses, use the caller's sessions/models |
| `todos:read` | List todos |
| `todos:write` | Add, update, toggle, delete todos (read is auto-added) |
| `documents:read` | Search and read documents |
| `documents:write` | Create and delete documents (read is auto-added) |
| `email:read` | List inbox, read individual emails |
| `email:draft` | Create email drafts |
| `email:send` | Send email |
| `calendar:read` | List calendar events |
| `calendar:write` | Create and delete events (read is auto-added) |
| `memory:read` | List memories |
| `memory:write` | Add and delete memories (read is auto-added) |

When a `*:write` scope is granted, the matching `*:read` scope is inserted automatically (`_normalize_scopes`). Unknown scopes are rejected with HTTP 400.

### Cookbook scopes (agent endpoints)

The Claude/Codex agent endpoints additionally enforce two cookbook scopes (routes/codex_routes.py:22):

| Scope | Grants |
|-------|--------|
| `cookbook:read` | List serve/download tasks, tail task output, list servers/cached models/presets |
| `cookbook:launch` | Also start and stop model serves — **effectively host shell execution; grant with care** |

These are toggled when creating an agent integration token in **Settings → Integrations**.

### Token profiles

Convenience bundles (`TOKEN_PROFILES`):

| Profile | Expands to |
|---------|-----------|
| `chat` | `chat` |
| `codex_todos` | `todos:read`, `todos:write` |
| `codex_email_drafts` | `email:read`, `email:draft`, `documents:read`, `documents:write` |

## Token management endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/tokens` | List tokens (id, name, scopes — never raw values) and the allowed scope set |
| `POST /api/tokens` | Create a token (`scopes` and/or `profile`); response includes the raw token once |
| `PATCH /api/tokens/{id}` | Update scopes / rotate |
| `DELETE /api/tokens/{id}` | Revoke |

## Scope-gated agent endpoints (`/api/codex/*`)

Used by the Claude Code and Codex plugins; usable by any client with the right scopes. Every endpoint checks the caller's scopes and returns **403** when the needed scope is absent.

| Endpoint | Required scope |
|----------|---------------|
| `GET /api/codex/capabilities` | any token — returns your scopes |
| `GET /api/codex/todos` | `todos:read` |
| `POST /api/codex/todos` | `todos:write` |
| `GET /api/codex/emails`, `GET /api/codex/emails/{uid}` | `email:read` |
| `POST /api/codex/emails/draft` | `email:draft` |
| `POST /api/codex/emails/send` | `email:send` |
| `GET /api/codex/memory` | `memory:read` |
| `POST /api/codex/memory`, `DELETE /api/codex/memory/{id}` | `memory:write` |
| `GET /api/codex/calendar/events` | `calendar:read` |
| `POST /api/codex/calendar/events`, `DELETE /api/codex/calendar/events/{uid}` | `calendar:write` |
| `GET /api/codex/documents`, `GET /api/codex/documents/{id}` | `documents:read` |
| `POST /api/codex/documents`, `DELETE /api/codex/documents/{id}` | `documents:write` |
| `GET /api/codex/cookbook/tasks` · `/servers` · `/cached` · `/presets` · `/output/{session_id}` | `cookbook:read` |
| `POST /api/codex/cookbook/serve` · `/preset/{name}` · `/adopt` · `/stop/{session_id}` | `cookbook:launch` |

Plugin bundle delivery (authenticated): `GET /api/claude/plugin.zip`, `GET /api/codex/plugin.zip`.

## Chat with a token

A `chat`-scoped token can drive the chat API directly:

The endpoint reads **form fields** (`routes/chat_routes.py:367`), not a JSON body:

```bash
curl -N -X POST "http://127.0.0.1:7000/api/chat_stream" \
  -H "Authorization: Bearer ody_XXXXXXXX" \
  -F "session=my-session" \
  -F "message=hello"
```

Useful optional fields: `mode` (`chat` or `agent`), `use_web`, `use_rag`, `preset_id`, `plan_mode`, `incognito`. Responses stream as Server-Sent Events. Token owners see only their own sessions and resources.

## Companion pairing tokens

The phone-pairing QR flow ([integrations](../concepts/integrations.md)) mints a standard token with the single scope `chat` (`companion/pairing.py:18`). It behaves like any other token: persistent until revoked, raw value shown once, listed in Settings for revocation.

## Error responses

| Code | Meaning | Fix |
|------|---------|-----|
| 400 `Unknown token scope: X` | Scope not in the allowed set | Use a scope from the table above |
| 401 | Missing/invalid/revoked token | Re-check the header; mint a new token if revoked |
| 403 | Token valid, scope missing | Grant the scope listed for that endpoint (Settings → edit token) — this is deliberate least-privilege, not a malfunction |
