/**
 * Conversation Manager
 * 
 * Manages streaming LLM conversations with AI SDK.
 * Follows yeet pattern: background manages state, UI polls for updates.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { z } from "zod";
import { getEntriesForTab, searchByUrl, filterEntries, getCacheStatistics } from "./cache-state";

type StreamChunk =
	| {
		type: "text-delta";
		data: string;
		timestamp: number;
	}
	| {
		type: "tool-call";
		data: {
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
		};
		timestamp: number;
	}
	| {
		type: "tool-result";
		data: {
			toolCallId: string;
			toolName: string;
			result: unknown;
		};
		timestamp: number;
	}
	| {
		type: "error";
		data: string;
		timestamp: number;
	}
	| {
		type: "finish";
		data: {
			done: boolean;
		};
		timestamp: number;
	};


interface ConversationState {
	id: string;
	status: "streaming" | "completed" | "error" | "aborted";
	chunks: StreamChunk[];
	fullText: string;
	abortController: AbortController;
	tabId: number;
}

class ConversationManager {
	private conversations = new Map<string, ConversationState>();
	private anthropic: ReturnType<typeof createAnthropic>;

	constructor() {
		const apiKey = process.env.PLASMO_PUBLIC_ANTHROPIC_API_KEY;

		if (!apiKey) {
			console.error("[Conversation Manager] ❌ No ANTHROPIC_API_KEY found");
		}

		this.anthropic = createAnthropic({
			apiKey: apiKey || "",
		});

		console.log("[Conversation Manager] ✅ Initialized with AI SDK");
	}

	async startConversation(opts: {
		conversationId: string;
		prompt: string;
		tabId: number;
	}): Promise<void> {
		console.log(`[Conversation Manager] 🚀 Starting conversation: ${opts.conversationId}`);

		const abortController = new AbortController();
		const state: ConversationState = {
			id: opts.conversationId,
			status: "streaming",
			chunks: [],
			fullText: "",
			abortController,
			tabId: opts.tabId,
		};
		this.conversations.set(opts.conversationId, state);

		// Get cache data for context
		const cacheData = getEntriesForTab(opts.tabId);
		const stats = getCacheStatistics(opts.tabId);

		console.log(`[Conversation Manager] 📊 Cache has ${cacheData.length} requests`);

		// Start streaming (async, don't await)
		this.streamResponse(opts.conversationId, opts.prompt, opts.tabId, abortController.signal);
	}

	private async streamResponse(
		conversationId: string,
		prompt: string,
		tabId: number,
		signal: AbortSignal
	): Promise<void> {
		const state = this.conversations.get(conversationId);
		if (!state) return;

		try {
			console.log(`[Conversation Manager] 📡 Starting AI SDK stream...`);

			const result = streamText({
				model: this.anthropic("claude-3-5-sonnet-20241022"),
				prompt,
				maxTokens: 4096,
				tools: this.buildTools(tabId),
				abortSignal: signal,
			});

			// Stream text deltas
			for await (const chunk of result.textStream) {
				state.chunks.push({
					type: "text-delta",
					data: chunk,
					timestamp: Date.now(),
				});
				state.fullText += chunk;
			}

			state.status = "completed";
			state.chunks.push({
				type: "finish",
				data: { done: true },
				timestamp: Date.now(),
			});

			console.log(`[Conversation Manager] ✅ Conversation completed: ${conversationId}`);
		} catch (error: any) {
			if (signal.aborted) {
				state.status = "aborted";
				console.log(`[Conversation Manager] ⏸️ Conversation aborted: ${conversationId}`);
			} else {
				state.status = "error";
				state.chunks.push({
					type: "error",
					data: error.message || String(error),
					timestamp: Date.now(),
				});
				console.error(`[Conversation Manager] ❌ Error in conversation:`, error);
			}
		}
	}

	private buildTools(tabId: number) {
		return {
			get_network_requests: tool({
				description: "Get all network requests captured for this tab. Returns request/response data including URLs, methods, headers, bodies, status codes, and timing information.",
				parameters: z.object({
					limit: z.number().optional().describe("Maximum number of requests to return (default: 50, max: 1000)"),
				}),
				execute: async ({ limit }) => {
					const requests = getEntriesForTab(tabId);
					const limitNum = Math.min(limit || 50, 1000);
					const limited = requests.slice(0, limitNum);

					return {
						total: requests.length,
						returned: limited.length,
						requests: limited.map(r => ({
							id: r.id,
							url: r.request.url,
							method: r.request.method,
							status: r.response.status,
							statusText: r.response.statusText,
							contentType: r.response.contentType,
							durationMs: r.timing.durationMs,
							timestamp: r.request.timestamp,
							hasError: r.metadata.hasError,
							requestHeaders: r.request.headers,
							responseHeaders: r.response.headers,
							requestBody: r.request.body?.substring(0, 1000),
							responseBody: r.response.body?.substring(0, 1000),
						})),
					};
				},
			}),

			search_requests_by_url: tool({
				description: "Search network requests by URL pattern. Case-insensitive substring match.",
				parameters: z.object({
					pattern: z.string().describe("URL pattern to search for (e.g., 'api', 'example.com', '/users')"),
				}),
				execute: async ({ pattern }) => {
					const results = searchByUrl(pattern, tabId);
					return {
						pattern,
						found: results.length,
						requests: results.map(r => ({
							id: r.id,
							url: r.request.url,
							method: r.request.method,
							status: r.response.status,
							durationMs: r.timing.durationMs,
						})),
					};
				},
			}),

			filter_requests_by_status: tool({
				description: "Filter network requests by HTTP status code range. Useful for finding errors (4xx, 5xx) or successful requests (2xx).",
				parameters: z.object({
					minStatus: z.number().optional().describe("Minimum status code (inclusive)"),
					maxStatus: z.number().optional().describe("Maximum status code (inclusive)"),
				}),
				execute: async ({ minStatus, maxStatus }) => {
					const results = filterEntries({
						tabId,
						minStatus,
						maxStatus,
					});
					return {
						minStatus,
						maxStatus,
						found: results.length,
						requests: results.map(r => ({
							id: r.id,
							url: r.request.url,
							method: r.request.method,
							status: r.response.status,
							statusText: r.response.statusText,
							durationMs: r.timing.durationMs,
							errorMessage: r.metadata.errorMessage,
						})),
					};
				},
			}),

			filter_requests_by_method: tool({
				description: "Filter network requests by HTTP method (GET, POST, PUT, DELETE, etc.)",
				parameters: z.object({
					method: z.string().describe("HTTP method to filter by"),
				}),
				execute: async ({ method }) => {
					const results = filterEntries({
						tabId,
						method: method.toUpperCase(),
					});
					return {
						method: method.toUpperCase(),
						found: results.length,
						requests: results.map(r => ({
							id: r.id,
							url: r.request.url,
							status: r.response.status,
							durationMs: r.timing.durationMs,
						})),
					};
				},
			}),

			get_cache_statistics: tool({
				description: "Get summary statistics about cached network requests including total count, breakdown by method, status codes, and request types.",
				parameters: z.object({}),
				execute: async () => {
					const stats = getCacheStatistics(tabId);
					return {
						totalRequests: stats.totalEntries,
						byMethod: stats.byMethod,
						byStatus: stats.byStatus,
						byType: stats.byType,
						errorCount: stats.errorCount,
					};
				},
			}),
		};
	}

	getUpdates(conversationId: string): {
		chunks: StreamChunk[];
		status: ConversationState["status"];
		fullText: string;
	} | null {
		const state = this.conversations.get(conversationId);
		if (!state) {
			return null;
		}

		// Return and clear buffered chunks
		const chunks = [...state.chunks];
		state.chunks = [];

		return {
			chunks,
			status: state.status,
			fullText: state.fullText,
		};
	}

	abort(conversationId: string): void {
		const state = this.conversations.get(conversationId);
		if (state) {
			console.log(`[Conversation Manager] 🛑 Aborting: ${conversationId}`);
			state.abortController.abort();
			state.status = "aborted";
		}
	}

	cleanup(conversationId: string): void {
		this.conversations.delete(conversationId);
		console.log(`[Conversation Manager] 🧹 Cleaned up: ${conversationId}`);
	}

	getActiveConversations(): string[] {
		return Array.from(this.conversations.keys());
	}
}

export const conversationManager = new ConversationManager();
