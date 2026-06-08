# Deep Research

Multi-round, LLM-steered web research that ends in a polished, sourced, visual report.

## What it is

Deep Research (adapted from [Tongyi DeepResearch](https://github.com/Alibaba-NLP/DeepResearch); code in `src/deep_research.py`, `src/research_handler.py`, `services/research/`) runs an investigation loop: plan the question, search, read, synthesize, decide whether to keep digging — then render the result as a styled HTML report with sources.

A single web search retrieves; Deep Research *investigates* — follow-up queries are generated from what earlier rounds found, which is what surfaces the things a one-shot query misses.

## How a run works

```
question
  → PLAN        decompose into sub-questions, key topics, success criteria
  → loop:
      QUERIES   3–5 focused searches per round, angled differently
      SEARCH    via your configured provider (SearXNG by default)
      READ      fetch top pages, extract content
      SYNTHESIZE  rewrite the draft report to integrate new findings
      STOP?     LLM checks the draft against the success criteria
  → FINAL       polish into a long-form article
  → RENDER      visual HTML report
```

Each stage is a dedicated prompt (`src/deep_research.py`): the plan emits structured JSON (sub-questions, success criteria), query generation is biased toward fresh angles and sources, synthesis *rewrites* rather than appends (so the draft stays coherent instead of becoming a findings dump), and the stop check compares the draft against the plan's own success criteria — the plan defines its own finish line.

Runs execute as background tasks: start one (`POST /api/research/start`), watch progress stream in (`/api/research/stream` is exempt from the normal request timeout), and fetch the result when done. Run state persists under `data/deep_research/`, so finished research survives restarts. Sources (URL, title, snippet) are tracked throughout.

## The visual report

`src/visual_report.py` renders the final markdown into a self-contained HTML article:

- Auto-generated table of contents, syntax highlighting, tables, footnotes.
- Dark/light theme via `prefers-color-scheme`; print/share toolbar.
- **Sanitized with `nh3`** — scripts, inline handlers, and `javascript:` URLs are stripped, since report content ultimately derives from untrusted web pages.

## Interaction with other subsystems

- **Search providers** come from your search settings — bundled SearXNG by default; Brave, DuckDuckGo, Tavily, Serper, or Google PSE if configured ([key concepts](../overview/key-concepts.md)).
- **Scheduled tasks** can trigger research runs ([productivity suite](productivity-suite.md)).
- A post-run summarization hook feeds results into the broader workspace.
- The `research` privilege gates who can start runs.

## Configuration and tuning

| Setting | Where | Notes |
|---------|-------|-------|
| Model/endpoint for research | Research settings in-app; optionally pre-seed `RESEARCH_LLM_ENDPOINT` in `.env` | Use the strongest model you have — every stage is LLM-judgment-bound |
| Search provider | Settings → search | SearXNG needs no key |
| Run artifacts | `data/deep_research/` | Safe to back up / prune |

> **Tip:** Research quality tracks the steering model's quality more than the search provider's. A small local model can *run* the loop but will plan and synthesize poorly; hardware-fit research presets are an open roadmap item.

## Common gotchas

- **Run seems stalled:** rounds genuinely take minutes (multiple searches + page reads + synthesis per round). Check the progress stream before assuming failure.
- **Thin reports:** usually a weak steering model or a search provider returning poor results — verify SearXNG is healthy (`docker compose ps`) and try a stronger model.
- **Timeouts elsewhere but not here:** research streaming is exempt from the 30s request timeout by design; don't put an aggressive proxy timeout in front of it.
