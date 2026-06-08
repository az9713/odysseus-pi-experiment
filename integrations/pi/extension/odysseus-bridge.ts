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
 *   ODYSSEUS_MODEL_BASE_URL   OpenAI-compatible base, e.g. http://127.0.0.1:11434/v1
 *   ODYSSEUS_MODEL_ID         model id to register + select, e.g. gemma4:e4b
 *   ODYSSEUS_MEMORY_INJECT_K  optional; how many memories to auto-inject (default 6)
 *
 * Loaded with:  pi --mode rpc -e <this file> --provider odysseus --model <id> ...
 */

import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const URL_BASE = (process.env.ODYSSEUS_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.ODYSSEUS_API_TOKEN ?? "";
const MODEL_BASE = process.env.ODYSSEUS_MODEL_BASE_URL ?? "";
const MODEL_ID = process.env.ODYSSEUS_MODEL_ID ?? "";
const INJECT_K = Number(process.env.ODYSSEUS_MEMORY_INJECT_K ?? "6") || 6;
const MODEL_CTX = Number(process.env.ODYSSEUS_MODEL_CONTEXT ?? "32768") || 32768;
const MODEL_MAXTOK = Number(process.env.ODYSSEUS_MODEL_MAXTOKENS ?? "4096") || 4096;
const MODEL_REASONING = (process.env.ODYSSEUS_MODEL_REASONING ?? "true") !== "false";

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
	const res = await fetch(`${URL_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
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

export default async function odysseusBridge(pi: ExtensionAPI) {
	// 1. Register the local model as a provider (only if Odysseus supplied one;
	//    otherwise rely on whatever the user configured in models.json).
	if (MODEL_BASE && MODEL_ID) {
		pi.registerProvider("odysseus", {
			name: "Odysseus (local)",
			baseUrl: MODEL_BASE,
			apiKey: "ollama", // local OpenAI-compatible servers ignore the key
			api: "openai-completions",
			models: [
				{
					id: MODEL_ID,
					name: `${MODEL_ID} (Odysseus)`,
					reasoning: MODEL_REASONING,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: MODEL_CTX,
					maxTokens: MODEL_MAXTOK,
				},
			],
		});
	}

	// 2. The memory tool — search + add, backed by the scoped API.
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

	// 3. Passive recall — inject the memories most relevant to this turn's
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
