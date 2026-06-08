# Productivity suite

The workspace features the AI acts on: email, calendar, notes, scheduled tasks, and documents.

## What it is

Five everyday-life features sharing one design stance: **local-first storage, standard protocols for sync, AI as assistant rather than autopilot.** Email speaks IMAP/SMTP, calendar speaks CalDAV, documents version locally — so nothing here locks you in, and everything is reachable by the agent (permission-gated).

## Email

Multi-account IMAP/SMTP with an AI triage layer (`routes/email_routes.py`, `routes/email_pollers.py`).

**Setup:** add accounts in Settings (IMAP + SMTP credentials, stored encrypted). Per-account routing keeps multiple identities separate.

**The triage pipeline** runs as background pollers:

- **Auto-summary:** new mail is fetched periodically, batched, and summarized by your LLM.
- **Auto-reply drafts:** the model drafts responses in your writing style — drafts, not sends; you review.
- **Spam classification:** suspected spam is tagged and moved to the Spam folder.
- **Urgency reminders & auto-tagging:** important threads get flagged.
- **Calendar awareness:** invites (iCal attachments) found in mail can become calendar events.
- **Scheduled sends:** compose now, deliver later.

> **Note:** Running pollers both in-process and via external cron makes two schedulers race on the same SQLite. If you drive polling externally (`scripts/odysseus-mail poll-scheduled` / `poll-summary`), set `ODYSSEUS_INPROCESS_POLLERS=0`.

Email over high-latency IMAP providers can feel slow; a performance audit is an open roadmap item.

## Calendar

Local-first calendar with CalDAV sync (`src/caldav_sync.py`, `routes/calendar_routes.py`) to Radicale, Nextcloud, Apple, or Fastmail.

**How sync works:** Odysseus pulls a window of events (~90 days back, 1 year forward), upserts by VEVENT UID (stable across re-syncs), converts to UTC for storage, and honors remote deletions. Write-back pushes local changes out. `.ics` import/export covers one-off transfers; per-calendar colors keep multiple sources readable.

**Safety:** CalDAV URLs pointing at localhost/private IPs are blocked (SSRF protection) unless you explicitly set `ODYSSEUS_ALLOW_PRIVATE_CALDAV=1` — which you *will* need for a Radicale instance on your own LAN.

## Notes

Keep-style notes and checklists (`routes/note_routes.py`): color labels, pinning, archive, due dates with repeat intervals, and AI auto-classification. Notes with due dates ping you through your notification channels. Reminder polling is frontend-driven (the browser polls), so reminders fire while the app is open in any tab.

## Scheduled tasks

A cron-like scheduler (`src/task_scheduler.py`, `routes/task_routes.py`) for one-time, daily, weekly, monthly, or cron-expression jobs.

**What tasks do:** send a scheduled email, or run a named action — sync email, start a research run, serve a Cookbook model, run a script.

**Timezone-correct:** schedules are IANA-timezone-aware ("8 AM" means 8 AM *your* time, DST handled), stored UTC.

**Reliable:** the runner wakes every few seconds, fires due tasks, and records every run (status, output, errors) for inspection; background jobs write `.pid`/`.exit` state files so they survive restarts and don't double-fire. `Run now` exists for testing.

**Notification channels:** browser push, email, or **ntfy** — the bundled pub-sub server (port 8091); install the ntfy app and your phone gets pinged.

**Calendar cascade:** a scheduled Cookbook serve creates a linked calendar event; deleting the task removes the event.

## Documents

A multi-tab editor (`routes/document_routes.py`) for Markdown, HTML, CSV, and code, with syntax highlighting — built on the stated philosophy that *you* write and AI assists, not the reverse.

- **Versioning:** documents snapshot to `DocumentVersion` rows; restore any prior version.
- **AI assists:** suggested edits, AI tidy (cleanup/restructure), and PDF annotation filling — all proposal-style.
- **PDF import:** text extraction always works (`pypdf`); page rendering and form-filling need the optional `PyMuPDF` (AGPL).
- **Office/EPUB extraction** (.docx/.xlsx/.pptx/.epub → Markdown) needs optional `markitdown`.
- **Library view** across all documents, bulk ZIP export, and RAG indexing of personal docs.

## Everything has a CLI

Each feature ships a script under `scripts/` (`odysseus-mail`, `odysseus-calendar`, `odysseus-notes`, `odysseus-tasks`, `odysseus-docs`, `odysseus-backup`, …) for cron jobs and scripting outside the UI.

## Interaction with other subsystems

- The **agent** reads/sends email, manages events, notes, and tasks through gated tools ([agent & tools](agent-and-tools.md)).
- **Memory** makes assists personal — reply drafts in your style, summaries at your preferred density.
- **Claude Code / Codex** get scoped access to todos, email, calendar, and documents ([integrations](integrations.md)).
- Email/calendar/vault credentials can come from the **Bitwarden vault** integration.

## Common gotchas

- **Radicale/private CalDAV blocked:** that's the SSRF guard — set `ODYSSEUS_ALLOW_PRIVATE_CALDAV=1` deliberately.
- **Email features admin-only by surprise:** email tools are in the non-admin deny-list by default; check privileges.
- **Reminders not firing with the app closed:** note that browser-channel reminders need an open tab; use ntfy or email channels for away-from-keyboard pings.
- **Self-hosted mail stacks (Dovecot) refusing login:** local stacks often need cleartext-auth enabled for LAN connections — a known 30-second fix the roadmap wants documented; check your Dovecot `disable_plaintext_auth` setting.
