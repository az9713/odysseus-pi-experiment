# Odysseus documentation

Odysseus is a self-hosted AI workspace — chat, agents, local model serving, deep research, email, calendar, notes, and documents, running on your own hardware with your own data. It exists so you can get the ChatGPT/Claude-style experience without sending anything to someone else's cloud.

> **New here?** Start with the [onboarding guide](getting-started/onboarding.md) — zero prior knowledge required. In a hurry? The [quickstart](getting-started/quickstart.md) gets you chatting in under 15 minutes.

---

## Documentation

| Section | What's inside |
|---------|--------------|
| [What is Odysseus?](overview/what-is-this.md) | Mental model, why it exists, how the pieces fit together |
| [Key concepts](overview/key-concepts.md) | Glossary of every term used in these docs |
| [Prerequisites](getting-started/prerequisites.md) | Exact dependencies per OS, with verify commands |
| [Quickstart](getting-started/quickstart.md) | Running and chatting in under 15 minutes |
| [Onboarding](getting-started/onboarding.md) | Zero-to-hero: concepts first, then a guided first hour |
| [Chat & models](concepts/chat-and-models.md) | Sessions, providers, streaming, presets, blind compare |
| [Agent & tools](concepts/agent-and-tools.md) | The agent loop, tool security, plan mode, MCP |
| [Memory & skills](concepts/memory-and-skills.md) | Hybrid recall, ChromaDB, user-editable skills |
| [Cookbook](concepts/cookbook.md) | Hardware scan → model recommendation → download → serve |
| [Deep Research](concepts/deep-research.md) | Multi-round research runs and visual reports |
| [Productivity suite](concepts/productivity-suite.md) | Email, calendar, notes, tasks, documents |
| [Integrations](concepts/integrations.md) | Companion pairing, Claude Code / Codex plugins, webhooks, API tokens |
| [Docker deployment](deployment/docker.md) | The Compose stack, persistent storage, GPU passthrough, host Ollama |
| [Remote access & HTTPS](deployment/remote-access.md) | LAN/Tailscale, reverse proxies, mkcert, systemd service |
| [Environment variables](reference/env-vars.md) | Every `.env` setting, default, and when to change it |
| [API tokens & scopes](reference/api-tokens-and-scopes.md) | Token scopes, profiles, and the agent API |
| [Data directory](reference/data-directory.md) | What lives in `data/` and what to back up |
| [System design](architecture/system-design.md) | Components, data flows, security model, design decisions |
| [Troubleshooting](troubleshooting/common-issues.md) | The most common failures and exact fixes |

Security policy lives in [SECURITY.md](../SECURITY.md) and [THREAT_MODEL.md](../THREAT_MODEL.md); contribution workflow in [CONTRIBUTING.md](../CONTRIBUTING.md); the help-wanted list in [ROADMAP.md](../ROADMAP.md).
