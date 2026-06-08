# Integrations

Every way something outside the browser talks to Odysseus: phone pairing, Claude Code and Codex plugins, GitHub Copilot as a provider, webhooks, the vault, and built-in MCP servers.

All of it rides one mechanism: **scoped API tokens** ([reference](../reference/api-tokens-and-scopes.md)). An integration is just a client holding a token whose scopes say exactly what it may touch.

## Companion pairing (phones & tablets)

The fastest way to get Odysseus on your phone without typing a URL and credentials (`companion/` package, mounted at `/api/companion/*`).

**How it works:**

1. An admin opens the pairing page (`/api/companion/pair`) in the web UI.
2. Submitting the form mints a **chat-scoped API token** and renders it as a QR code containing `{host, port, token}` — the server's LAN IP is auto-detected.
3. The phone scans, connects to `host:port`, and authenticates every request with the bearer token.

The raw token is shown once (stored bcrypt-hashed); minting is POST-only and admin-cookie-only (CSRF-safe). Discovery endpoints (`/ping`, `/info`, `/models`) let a client confirm what it's talking to. The web UI itself is also an installable PWA — pairing is for token-based clients, the PWA for the full UI.

## Claude Code and Codex plugins

Teach your coding agent to drive your workspace: todos, email, memory, calendar, documents, and Cookbook from the terminal (`integrations/claude/`, `integrations/codex/`, served by `routes/codex_routes.py`).

**Setup (Claude Code):**

1. In Odysseus: **Settings → Integrations → Add Claude Agent** — this creates a token with the scopes you toggle.
2. On the machine running Claude Code:

   ```bash
   export ODYSSEUS_URL=http://127.0.0.1:7000
   export ODYSSEUS_API_TOKEN=ody_<your_token>
   curl -fsSL -H "Authorization: Bearer $ODYSSEUS_API_TOKEN" \
     "$ODYSSEUS_URL/api/claude/plugin.zip" -o /tmp/odysseus-claude-skill.zip
   python3 -m zipfile -e /tmp/odysseus-claude-skill.zip ~/.claude/
   ```

3. Claude Code auto-loads the skill on next start. Codex setup is parallel (`/api/codex/plugin.zip`, then register in the plugin marketplace) — see `integrations/codex/README.md`.

**Verify:**

```bash
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py capabilities
```

**Runtime:** both plugins call the same scope-gated endpoints under `/api/codex/*` (capabilities, todos, emails, memory, calendar events, documents, cookbook tasks/serves). Every endpoint checks the token's scopes; a 403 means you deliberately didn't grant that scope. `cookbook:launch` deserves respect — it starts and stops model serves, i.e., host shell execution.

## GitHub Copilot as a model provider

Different category: Copilot is an *upstream model source*, not a client (`routes/copilot_routes.py`, `src/copilot.py`).

**Setup:** Settings → start the GitHub device flow → you get a `user_code` and a github.com URL → authorize in your browser → Odysseus stores the resulting token (encrypted) and registers a Copilot endpoint. Copilot models then appear in the model picker like any other endpoint.

## Webhooks (inbound triggers)

External events drive Odysseus actions (`routes/webhook_routes.py`): GitHub PRs/issues/releases, Slack messages, or anything that can POST. A webhook rule maps source → action (send into a chat session, send email, run a script), with field extraction and templating, signature/token validation on delivery, and a test-fire button. Admin-gated.

## Bitwarden vault

Credential storage for the workspace's own needs (`routes/vault_routes.py`): unlock a Bitwarden CLI session, then email/CalDAV/webhook configs can pull credentials from the vault on demand instead of storing copies. Odysseus keeps metadata only; secrets stay in Bitwarden. Works with bitwarden.com or self-hosted servers. Admin-gated.

## Built-in MCP servers

Email, memory, RAG, and image generation ship as stdio MCP servers (`mcp_servers/`) consumed by the agent loop internally — listed here for completeness, documented in [agent & tools](agent-and-tools.md). Admins can additionally register *external* MCP servers in Settings.

## The scoped REST API (roll your own)

Any HTTP client can integrate: mint a token in Settings, send `Authorization: Bearer ody_...`, and call the API within your scopes — chat (`/api/chat`, `/api/chat_stream`), todos, memory, calendar, documents, email. The [tokens & scopes reference](../reference/api-tokens-and-scopes.md) lists every scope; one token per integration is the rule that keeps revocation painless.

## Security posture, summarized

| Integration | Trust granted | Gate |
|-------------|--------------|------|
| Companion phone | chat only | `chat` scope, admin-minted |
| Claude/Codex plugin | exactly the toggled scopes | per-scope checks on `/api/codex/*` |
| Copilot provider | outbound only (Odysseus → GitHub) | OAuth device flow, encrypted token |
| Webhooks | one configured action | signature check, admin-managed |
| Vault | read-on-demand secrets | Bitwarden session, admin-only |

Create separate tokens per integration, delete unused ones, and rotate anything that ever appeared in a log or screenshot ([SECURITY.md](../../SECURITY.md)).
