/**
 * Odysseus Bridge — pi extension
 * ================================
 * Makes an embedded `pi --mode rpc` process behave as Odysseus's general,
 * long-horizon agent that *knows the user*. It does three things:
 *
 *   1. Registers the local model as a pi provider (OpenAI-compatible), so
 *      Odysseus's Cookbook/Ollama-served model drives the pi loop.
 *   2. Registers a `manage_memory` tool whose body is HTTP calls to Odysseus's
 *      scope-gated agent API (`/api/codex/memory*`) — the agent can search and
 *      record what it learns about the user. Authorization is enforced
 *      server-side by the token's scopes (403 on anything not granted); this
 *      extension is a thin shim and holds no policy of its own.
 *   3. On every turn, injects the memories most relevant to the user's prompt
 *      into the system prompt (passive recall), using the same ranked retrieval
 *      Odysseus itself uses.
 *
 * Everything is configured by environment variables that Odysseus injects when
 * it spawns the subprocess (see src/pi_backend.py):
 *
 *   ODYSSEUS_URL              e.g. http://127.0.0.1:7000   (required for memory)
 *   ODYSSEUS_API_TOKEN        scoped `ody_` token (memory:read, memory:write)
 *   ODYSSEUS_MEMORY_INJECT_K  optional; how many memories to auto-inject (default 6)
 *   ODYSSEUS_FETCH_TIMEOUT_MS optional; per memory-call timeout (default 8000)
 *
 * The model provider is NOT configured here — Odysseus writes a per-session
 * models.json (read via $PI_CODING_AGENT_DIR) and selects it with --provider,
 * because pi resolves --provider before extension factories run.
 *
 * Loaded with:  pi --mode rpc -e <this file> --provider <models.json provider> ...
 */

import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const URL_BASE = (process.env.ODYSSEUS_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.ODYSSEUS_API_TOKEN ?? "";
const INJECT_K = Number(process.env.ODYSSEUS_MEMORY_INJECT_K ?? "6") || 6;
// Hard cap on any single memory call so a slow/hung Odysseus can never block a
// turn (before_agent_start runs every turn; a hang there stalls the whole agent).
const FETCH_TIMEOUT_MS = Number(process.env.ODYSSEUS_FETCH_TIMEOUT_MS ?? "8000") || 8000;

interface Memory {
	text?: string;
	category?: string;
	categories?: string[];
}

/** Call the Odysseus scoped agent API. Returns parsed JSON or throws. */
async function odysseus(path: string, init?: RequestInit): Promise<any> {
	if (!URL_BASE || !TOKEN) {
		throw new Error("Odysseus bridge not configured (ODYSSEUS_URL / ODYSSEUS_API_TOKEN missing)");
	}
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	let res: Response;
	try {
		res = await fetch(`${URL_BASE}${path}`, {
			...init,
			signal: ctrl.signal,
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				"Content-Type": "application/json",
				...(init?.headers ?? {}),
			},
		});
	} finally {
		clearTimeout(timer);
	}
	const body = await res.text();
	if (!res.ok) {
		// Surface the server's verdict verbatim (e.g. 403 scope denial) — the
		// server is the only authority; the bridge never second-guesses it.
		throw new Error(`Odysseus ${path} -> ${res.status}: ${body.slice(0, 300)}`);
	}
	return body ? JSON.parse(body) : {};
}

async function searchMemories(query: string, k: number): Promise<Memory[]> {
	const data = await odysseus("/api/codex/memory/search", {
		method: "POST",
		body: JSON.stringify({ query, k }),
	});
	return Array.isArray(data?.memories) ? (data.memories as Memory[]) : [];
}

const MEMORY_PARAMS = Type.Object({
	action: Type.Union([Type.Literal("search"), Type.Literal("add")], {
		description: "search = recall facts about the user; add = record a new durable fact about the user",
	}),
	query: Type.Optional(Type.String({ description: "For action=search: what to recall (natural language)." })),
	text: Type.Optional(Type.String({ description: "For action=add: the fact to remember about the user." })),
	category: Type.Optional(
		Type.String({
			description:
				"For action=add: one of fact, contact, preference, identity, project, goal, task (default fact).",
		}),
	),
});

export default function odysseusBridge(pi: ExtensionAPI) {
	// NOTE: the model PROVIDER is defined in the per-session models.json that
	// Odysseus writes (read via $PI_CODING_AGENT_DIR), NOT here. pi resolves
	// --provider at startup before extension factories run, so registering the
	// provider from an extension yields "Unknown provider" in rpc mode. This
	// extension owns memory only.

	// 1. The memory tool — search + add, backed by the scoped API.
	pi.registerTool({
		name: "manage_memory",
		label: "Memory",
		description:
			"Recall or record durable facts about the user (their preferences, identity, projects, goals, contacts). " +
			"Use action=search to look something up, action=add to remember a new fact worth keeping across sessions.",
		promptSnippet: "Recall (search) or record (add) durable facts about the user.",
		promptGuidelines: [
			"Use manage_memory(action=search) when you need a fact about the user you don't already have in context.",
			"Use manage_memory(action=add) when the user states a durable preference/fact worth remembering later — not transient chatter.",
		],
		parameters: MEMORY_PARAMS,
		async execute(_toolCallId, params) {
			try {
				if (params.action === "search") {
					const q = (params.query ?? "").trim();
					if (!q) {
						return { content: [{ type: "text", text: "search requires a non-empty query." }], isError: true };
					}
					const mems = await searchMemories(q, INJECT_K);
					if (mems.length === 0) {
						return { content: [{ type: "text", text: `No memories found for: ${q}` }], details: { count: 0 } };
					}
					const lines = mems.map((m, i) => `${i + 1}. ${m.text ?? ""}`).join("\n");
					return {
						content: [{ type: "text", text: `Relevant memories:\n${lines}` }],
						details: { count: mems.length, query: q },
					};
				}
				// action === "add"
				const text = (params.text ?? "").trim();
				if (!text) {
					return { content: [{ type: "text", text: "add requires non-empty text." }], isError: true };
				}
				await odysseus("/api/codex/memory", {
					method: "POST",
					body: JSON.stringify({ text, category: params.category ?? "fact", source: "agent" }),
				});
				return { content: [{ type: "text", text: `Remembered: ${text}` }], details: { added: true } };
			} catch (err) {
				return {
					content: [{ type: "text", text: `Memory operation failed: ${(err as Error).message}` }],
					isError: true,
				};
			}
		},
	});

	// 2. Passive recall — inject the memories most relevant to this turn's
	//    prompt into the system prompt, so the agent "knows the user" without
	//    having to explicitly search every time.
	pi.on("before_agent_start", async (event) => {
		const prompt = (event.prompt ?? "").trim();
		if (!prompt || !URL_BASE || !TOKEN) return undefined;
		try {
			const mems = await searchMemories(prompt, INJECT_K);
			if (mems.length === 0) return undefined;
			const block = mems.map((m) => `- ${m.text ?? ""}`).join("\n");
			const _opts: BuildSystemPromptOptions = event.systemPromptOptions;
			return {
				systemPrompt: `${event.systemPrompt}

## What you know about the user
These facts were retrieved from the user's Odysseus memory as relevant to the current request. Use them when helpful; do not repeat them verbatim unless asked.
${block}
`,
			};
		} catch {
			// Never let a memory hiccup block the turn — degrade silently.
			return undefined;
		}
	});
}
