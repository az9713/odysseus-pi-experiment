# Onboarding: zero to confident

This is the patient version. No prior familiarity assumed — not with Odysseus, not with self-hosting, not with local LLMs. By the end you'll understand what you have, why it's shaped this way, and what to do in your first hour.

If you just want it running, do the [quickstart](quickstart.md) first and come back. This guide is the *understanding* half.

## If you've used ChatGPT, what's different here?

Odysseus looks like ChatGPT or Claude.ai: a chat box, conversation history down the side, a model picker up top. Three differences change everything underneath:

- **The brain is pluggable.** ChatGPT *is* its model. Odysseus is a workspace that talks to *any* model — one running on your GPU, one on a server in your closet, or a cloud API. You can switch mid-day, or run a blind taste-test between two and vote without knowing which is which.
- **The data is yours, physically.** Every conversation, memory, email, and document lives in one folder (`data/`) on your disk. Delete the folder and it's gone. Copy it and you've made a full backup. Nothing phones home.
- **It's a workspace, not just a chat.** Email, calendar, notes, scheduled tasks, a document editor, an image gallery, and a research engine share the building — and the AI can reach all of them, with your permission, as tools.

A fair analogy: ChatGPT is a restaurant; Odysseus is a kitchen. The restaurant is more polished. The kitchen is yours.

## The five ideas that make everything else make sense

### 1. Endpoints — "where do answers come from?"

An *endpoint* is just an address where a model lives: `http://localhost:11434/v1` for Ollama, `https://openrouter.ai/api/v1` for OpenRouter, a vLLM serve you started yourself. You collect endpoints in Settings; the model picker shows everything they offer. Odysseus probes them, figures out each one's dialect (OpenAI-style, Anthropic-style, Ollama-style), and speaks it for you.

### 2. Sessions — "where do conversations live?"

Each conversation is a *session*: pinned to a model and endpoint, saved to the local database as you type, archivable, exportable. Cheap to create, cheap to abandon. Nothing you say in a session leaves your machine except the request to whatever endpoint that session uses — which is the one privacy decision you actually make: a session on a *local* endpoint never leaves at all.

### 3. Agent mode — "when does the AI get hands?"

In plain chat the model can only talk. Flip on agent mode and it can *do*: search the web, read and write files, run shell commands, send email, manage your calendar, even download and serve other models. It works in a loop — try a tool, see the result, decide the next step — until the job is done.

This is the powerful-and-sharp part of Odysseus, which is why it's wrapped in permissions: every user has a privilege profile, and the dangerous tools (shell, files, email) are admin-only by default. There's also a *plan mode* where the agent can look but not touch.

### 4. Memory and skills — "why does it get better over time?"

Tell Odysseus once that you're vegetarian, that your boss is named Priya, that you like answers in bullet points — and it *remembers*, across all sessions and models. Memories are retrieved by a hybrid search (exact keywords + semantic similarity) and slipped into context automatically.

Skills are the same idea for *procedures*: "how to file my expenses" written down once, reusable forever, editable by you, and learnable by the agent itself.

This is the compounding asset. Models come and go; your memory and skills stay.

### 5. Cookbook — "how do I run models myself without a PhD?"

Running local LLMs normally means knowing about VRAM, quantization formats, and three competing serve engines. Cookbook's deal: it scans your actual hardware, scores every model in its catalog for *your* machine (will it fit? how fast? how good?), and gives you click-to-download, click-to-serve. The scary acronyms (GGUF, AWQ, vLLM) are handled; you pick from a ranked list.

## Your first hour, narrated

Here's a realistic first session, assuming the quickstart is done and a model is connected.

**Minutes 0–10: make it yours.** Log in, change the admin password. Open Settings and look around — don't configure everything, just see what's there. Type a few messages to your model. Watch them stream.

**Minutes 10–20: plant a memory.** Tell it: *"Remember: I'm Simon, I prefer concise answers, and my work projects live in ~/projects."* Open the Memory panel and watch the facts appear. Start a *new* session and ask *"what do you know about me?"* — the recall you see is the feature that makes everything else personal.

**Minutes 20–35: give it hands.** Enable agent mode and ask something that needs the world: *"Search for this week's biggest open-source AI release and give me a three-bullet summary."* Watch the loop — search call, page fetches, synthesis. This is the same machinery that later handles your email triage and research runs.

**Minutes 35–50: try one workspace feature.** Pick whichever matches your life:
- **Notes/Tasks:** create a checklist, set a reminder, watch it ping you.
- **Documents:** open the editor, draft something, ask the AI to suggest edits — note that *you* hold the pen; it assists.
- **Cookbook** (if you have a GPU): run the hardware scan and just *read* the recommendations. Downloading can wait.

**Minutes 50–60: take the tour of the rest.** Deep Research, Compare, Email, Calendar, Gallery. Don't set them up — just open each so you know what exists. Setup guides live in the [concepts docs](../index.md) when you want them.

> **Tip:** Odysseus works well on your phone — it's an installable PWA, and the companion pairing flow (Settings) gets your phone connected with a QR scan.

## Why is it built this way? Three choices that surprise people

**Why does it ask me to keep it on localhost?** Because Odysseus is deliberately an *admin console*, not a web app hardened for strangers. It can run shell commands and read your email — capabilities you want behind your firewall, not on the public internet. The blessed pattern for remote access is a private layer you trust: Tailscale, a VPN, or an authenticated reverse proxy. Defaults bind to `127.0.0.1` so the safe thing is the lazy thing.

**Why both keyword *and* vector memory?** Keyword search nails exact things ("Priya", "project Hermes") but misses paraphrases; vector search catches "my manager" → Priya but needs an embedding service that might be down. Odysseus blends both — and when the vector side is unavailable, it switches to keyword-only scoring, so memory keeps working — degraded, never broken. You'll find this *graceful degradation* pattern everywhere: bundled SearXNG with pluggable alternatives, local fastembed fallback for embeddings, llama.cpp fallback when vLLM can't run on your platform.

**Why is configuration in the app instead of config files?** Almost everything — providers, search, email, TTS — is set in Settings, stored in `data/settings.json`, editable without restarts. The `.env` file is only for things that must exist *before* the app boots: bind address, port, database URL, auth toggles. Frictionless onboarding is the explicit goal: clone, run, configure-by-clicking.

## What to be careful with

- **Agent + shell = real power.** The agent's shell tool runs as the app's user with no sandbox. Keep shell privileges admin-only (the default) and read [THREAT_MODEL.md](../../THREAT_MODEL.md) before widening anything.
- **Untrusted text is everywhere.** Web pages, emails, and imported skills can contain hostile instructions ("ignore your rules and..."). Odysseus wraps such content in warnings the model is told to respect — but treat prompt injection as an arms race, not a solved problem.
- **`data/` is everything.** Back it up. Never commit it (it's gitignored, with `.env`, for a reason).

## Where to go next

In rough order of payoff:

1. [Chat & models](../concepts/chat-and-models.md) — endpoints, presets, and the Compare tool
2. [Memory & skills](../concepts/memory-and-skills.md) — feed the compounding asset
3. [Agent & tools](../concepts/agent-and-tools.md) — what the agent can do and how it's gated
4. [Cookbook](../concepts/cookbook.md) — local models, demystified end to end
5. [Productivity suite](../concepts/productivity-suite.md) — email triage, calendar sync, notes, tasks
6. [Integrations](../concepts/integrations.md) — phone pairing, Claude Code/Codex, webhooks

Welcome aboard. ⛵
