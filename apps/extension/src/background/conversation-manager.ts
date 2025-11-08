/**
 * Conversation Manager
 * 
 * Manages streaming LLM conversations with AI SDK.
 * Follows yeet pattern: background manages state, UI polls for updates.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { z } from "zod";
import {
	getEntriesForTab,
	getCacheEntry,
	searchByUrl,
	filterEntries,
	getCacheStatistics
} from "./cache-state";
import { scriptExecutionManager } from "./script-execution-manager";

export type StreamChunk =
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
	messages: Array<{
		role: "user" | "assistant";
		content: string;
	}>;
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
			headers: {
				"anthropic-dangerous-direct-browser-access": "true",
			},
		});

		console.log("[Conversation Manager] ✅ Initialized with AI SDK + CORS headers");
	}

	async startConversation(opts: {
		conversationId: string;
		prompt: string;
		tabId: number;
	}): Promise<void> {
		console.log(`[Conversation Manager] 🚀 Starting conversation: ${opts.conversationId}`);

		let state = this.conversations.get(opts.conversationId);

		if (!state) {
			// New conversation
			console.log(`[Conversation Manager] 📝 Creating new conversation state`);
			const abortController = new AbortController();
			state = {
				id: opts.conversationId,
				status: "streaming",
				chunks: [],
				fullText: "",
				abortController,
				tabId: opts.tabId,
				messages: [], // Initialize empty history
			};
			this.conversations.set(opts.conversationId, state);
		} else {
			// Continuing conversation - create new AbortController
			console.log(`[Conversation Manager] 🔄 Continuing existing conversation (${state.messages.length} messages in history)`);
			state.abortController = new AbortController();
			state.status = "streaming";
			state.chunks = []; // Clear chunks for new response
		}

		// Add user message to history
		state.messages.push({
			role: "user",
			content: opts.prompt,
		});

		// Get cache data for context
		const cacheData = getEntriesForTab(opts.tabId);
		const stats = getCacheStatistics(opts.tabId);

		console.log(`[Conversation Manager] 📊 Cache has ${cacheData.length} requests`);

		// Start streaming (async, don't await)
		this.streamResponse(opts.conversationId, opts.tabId, state.abortController.signal);
	}

	private async streamResponse(
		conversationId: string,
		tabId: number,
		signal: AbortSignal
	): Promise<void> {
		const state = this.conversations.get(conversationId);
		if (!state) return;

		try {
			console.log(`[Conversation Manager] 📡 Starting AI SDK stream with ${state.messages.length} messages in history...`);

			const result = streamText({
				model: this.anthropic("claude-sonnet-4-5-20250929"),
				// model: this.anthropic("claude-haiku-4-5-20251001"),
				system: `You are a security researcher analyzing web applications for vulnerabilities. Your goal is to identify ACTUAL security issues that could compromise user data, privacy, or system integrity.

IMPORTANT - What constitutes a vulnerability:
- Information about OTHER USERS that the current user should not have access to (leaked emails, names, PII of others)
- Sensitive credentials, API keys, tokens, or secrets exposed in the frontend
- Authentication/authorization bypasses (accessing data without proper permissions)
- CSRF tokens missing or improperly implemented
- Security misconfigurations (CORS, CSP, etc.)
- SQL injection, XSS, or other code injection vectors
- Insecure data transmission (sensitive data over HTTP, etc.)
- Exposed admin panels or debug endpoints
- Hardcoded secrets or credentials

NOT vulnerabilities:
- The current user's own information (their name, email, profile data they are authorized to see)
- Expected functionality (user can see their own orders, settings, etc.)
- Public information that is meant to be visible
- Features working as intended

Use your tools to:
1. Inspect network requests for sensitive data exposure
2. Execute JavaScript to check DOM, localStorage, cookies for security issues
3. Search for common vulnerability patterns in API responses
4. Verify proper authentication and authorization implementations

Be thorough but accurate. Only report genuine security concerns.`,
				messages: state.messages, // Use message history instead of single prompt
				maxTokens: 4096 * 4,
				maxSteps: 5, // Allow up to 5 tool call rounds
				tools: this.buildTools(tabId),
				abortSignal: signal,
			});

			// Track assistant response
			let assistantMessage = "";

			// Stream the full text (includes tool execution results)
			// The AI SDK will automatically execute tools and continue the conversation
			for await (const chunk of result.fullStream) {
				if (chunk.type === "text-delta") {
					assistantMessage += chunk.textDelta; // Accumulate for history
					const chunkData: StreamChunk = {
						type: "text-delta",
						data: chunk.textDelta,
						timestamp: Date.now(),
					};
					state.chunks.push(chunkData);
					state.fullText += chunk.textDelta;
					console.log(`[Conversation Manager] 📝 Text delta (${chunk.textDelta.length} chars)`);
				} else if (chunk.type === "tool-call") {
					console.log(`[Conversation Manager] 🔧 Tool call: ${chunk.toolName} with args:`, chunk.args);
					const chunkData: StreamChunk = {
						type: "tool-call",
						data: {
							toolCallId: chunk.toolCallId,
							toolName: chunk.toolName,
							args: chunk.args as Record<string, unknown>,
						},
						timestamp: Date.now(),
					};
					state.chunks.push(chunkData);
				} else if (chunk.type === "tool-result") {
					console.log(`[Conversation Manager] ✅ Tool result: ${chunk.toolName}`, chunk.result);
					const chunkData: StreamChunk = {
						type: "tool-result",
						data: {
							toolCallId: chunk.toolCallId,
							toolName: chunk.toolName,
							result: chunk.result,
						},
						timestamp: Date.now(),
					};
					state.chunks.push(chunkData);
				} else if (chunk.type === "step-finish") {
					console.log(`[Conversation Manager] 🔄 Step finished, continuing...`);
				}
			}

			// Add assistant response to message history (only if not empty)
			if (assistantMessage.trim().length > 0) {
				state.messages.push({
					role: "assistant",
					content: assistantMessage,
				});
				console.log(`[Conversation Manager] 💾 Added assistant response to history (${assistantMessage.length} chars)`);
			} else {
				console.warn(`[Conversation Manager] ⚠️ Skipping empty assistant message`);
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

				// Remove the last user message since it wasn't processed
				if (state.messages.length > 0 && state.messages[state.messages.length - 1]?.role === "user") {
					const removedMsg = state.messages.pop();
					console.warn(`[Conversation Manager] 🔙 Removed unprocessed user message due to error: "${removedMsg?.content.substring(0, 50) || ''}..."`);
				}

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
				description: "List network requests with summary info only. Returns ID, URL, method, status, type, content size, duration. Use get_request_details to fetch full headers/bodies/cookies for specific requests. This is much more efficient than fetching all data at once. KEEP LIMIT SMALL to avoid rate limits.",
				parameters: z.object({
					limit: z.number().optional().describe("Maximum number of requests to return (default: 10, max: 20)"),
					offset: z.number().optional().describe("Starting offset for pagination (default: 0)"),
				}),
				execute: async ({ limit, offset }) => {
					const requests = getEntriesForTab(tabId);
					const limitNum = Math.min(limit || 10, 20); // Reduced from 20/50 to 10/20
					const offsetNum = offset || 0;
					const limited = requests.slice(offsetNum, offsetNum + limitNum);

					return {
						total: requests.length,
						returned: limited.length,
						offset: offsetNum,
						hasMore: offsetNum + limitNum < requests.length,
						requests: limited.map(r => ({
							id: r.id,
							url: r.request.url,
							method: r.request.method,
							status: r.response.status,
							statusText: r.response.statusText,
							contentType: r.response.contentType,
							requestSize: r.request.body?.length || 0,
							responseSize: r.response.body?.length || 0,
							durationMs: r.timing.durationMs,
							timestamp: r.request.timestamp,
							hasError: r.metadata.hasError,
							// Quick indicators
							hasWebRequestData: r.metadata.hasWebRequestData,
							hasCookies: (r.metadata.cookies?.length || 0) > 0,
							hasAuth: !!(r.metadata.authHeaders?.authorization),
						})),
					};
				},
			}),

			get_request_details: tool({
				description: "Get complete details for a specific request by ID. Returns full headers, cookies, auth headers, and bodies (truncated to 500 chars by default to save tokens). Use get_request_body_chunk to fetch more body content if needed.",
				parameters: z.object({
					requestId: z.string().describe("Request ID from get_network_requests or search_requests"),
					bodyPreviewSize: z.number().optional().describe("Size of body preview in characters (default: 500, max: 1500)"),
				}),
				execute: async ({ requestId, bodyPreviewSize }) => {
					const request = getCacheEntry(requestId, tabId);

					if (!request) {
						return { error: `Request not found: ${requestId}` };
					}

					// Truncate bodies with configurable size - reduced to save tokens
					const maxBodySize = Math.min(bodyPreviewSize || 500, 1500); // Reduced from 1000/2000
					const requestBodySize = request.request.body?.length || 0;
					const responseBodySize = request.response.body?.length || 0;

					const requestBody = request.request.body
						? requestBodySize > maxBodySize
							? `${request.request.body.substring(0, maxBodySize)}\n... [truncated, ${requestBodySize} total chars, use get_request_body_chunk to fetch more]`
							: request.request.body
						: undefined;

					const responseBody = request.response.body
						? responseBodySize > maxBodySize
							? `${request.response.body.substring(0, maxBodySize)}\n... [truncated, ${responseBodySize} total chars, use get_request_body_chunk to fetch more]`
							: request.response.body
						: undefined;

					return {
						id: request.id,
						request: {
							url: request.request.url,
							method: request.request.method,
							headers: request.request.headers,
							body: requestBody,
							bodySize: requestBodySize,
							timestamp: new Date(request.request.timestamp).toISOString(),
						},
						response: {
							status: request.response.status,
							statusText: request.response.statusText,
							headers: request.response.headers,
							body: responseBody,
							bodySize: responseBodySize,
							contentType: request.response.contentType,
						},
						timing: {
							durationMs: request.timing.durationMs,
							startTime: request.timing.startTime,
							endTime: request.timing.endTime,
						},
						metadata: {
							requestType: request.metadata.requestType,
							hasError: request.metadata.hasError,
							errorMessage: request.metadata.errorMessage,
							hasWebRequestData: request.metadata.hasWebRequestData,
							cookies: request.metadata.cookies,
							authHeaders: request.metadata.authHeaders,
						},
					};
				},
			}),

			get_request_body_chunk: tool({
				description: "Fetch a specific chunk of a request or response body. Use this when the body was truncated in get_request_details and you need to see more content.",
				parameters: z.object({
					requestId: z.string().describe("Request ID"),
					bodyType: z.enum(["request", "response"]).describe("Which body to fetch: 'request' or 'response'"),
					offset: z.number().optional().describe("Starting position in the body (default: 0)"),
					length: z.number().optional().describe("Number of characters to fetch (default: 2000, max: 5000)"),
				}),
				execute: async ({ requestId, bodyType, offset = 0, length = 2000 }) => {
					const request = getCacheEntry(requestId, tabId);

					if (!request) {
						return { error: `Request not found: ${requestId}` };
					}

					const body = bodyType === "request" ? request.request.body : request.response.body;

					if (!body) {
						return { error: `No ${bodyType} body available for this request` };
					}

					const maxLength = Math.min(length, 5000);
					const chunk = body.substring(offset, offset + maxLength);
					const totalSize = body.length;
					const hasMore = offset + maxLength < totalSize;

					return {
						requestId,
						bodyType,
						offset,
						chunkSize: chunk.length,
						totalSize,
						hasMore,
						nextOffset: hasMore ? offset + maxLength : null,
						chunk,
					};
				},
			}),

			search_requests: tool({
				description: "Search and filter network requests by URL pattern, HTTP method, and/or status code range. Returns summary info (max 10 results to save tokens). Use get_request_details for full data on specific results.",
				parameters: z.object({
					url: z.string().optional().describe("URL substring to search for (case-insensitive, e.g., 'api', '/users', 'example.com')"),
					method: z.string().optional().describe("HTTP method to filter by (GET, POST, PUT, DELETE, etc.)"),
					minStatus: z.number().optional().describe("Minimum status code (inclusive, e.g., 200)"),
					maxStatus: z.number().optional().describe("Maximum status code (inclusive, e.g., 299 for all 2xx)"),
				}),
				execute: async ({ url, method, minStatus, maxStatus }) => {
					let results = getEntriesForTab(tabId);

					// Apply URL filter
					if (url) {
						results = searchByUrl(url, tabId);
					}

					// Apply other filters
					if (method || minStatus !== undefined || maxStatus !== undefined) {
						results = filterEntries({
							tabId,
							method: method?.toUpperCase(),
							minStatus,
							maxStatus,
						}).filter(r => !url || results.some(ur => ur.id === r.id));
					}

					return {
						found: results.length,
						filters: { url, method: method?.toUpperCase(), minStatus, maxStatus },
						requests: results.slice(0, 10).map(r => ({ // Reduced from 20 to 10
							id: r.id,
							url: r.request.url,
							method: r.request.method,
							status: r.response.status,
							statusText: r.response.statusText,
							contentType: r.response.contentType,
							responseSize: r.response.body?.length || 0,
							durationMs: r.timing.durationMs,
							hasWebRequestData: r.metadata.hasWebRequestData,
							hasCookies: (r.metadata.cookies?.length || 0) > 0,
							hasAuth: !!(r.metadata.authHeaders?.authorization),
						})),
					};
				},
			}),

			search_request_content: tool({
				description: "Search for text in request/response URLs, bodies, and headers. Finds requests containing specific data, field names, or values. Case-insensitive substring match. Max 10 results to save tokens.",
				parameters: z.object({
					query: z.string().describe("Search query - looks for this text in URLs, request bodies, and response bodies"),
					searchIn: z.enum(["all", "url", "request_body", "response_body"]).optional().describe("Where to search: 'all' (default), 'url', 'request_body', or 'response_body'"),
					limit: z.number().optional().describe("Max results to return (default: 10, max: 15)"),
				}),
				execute: async ({ query, searchIn = "all", limit = 10 }) => {
					const allRequests = getEntriesForTab(tabId);
					const queryLower = query.toLowerCase();
					const matches: Array<{
						request: typeof allRequests[0];
						matchLocations: string[];
					}> = [];

					for (const req of allRequests) {
						const locations: string[] = [];

						// Search in URL
						if ((searchIn === "all" || searchIn === "url") && req.request.url.toLowerCase().includes(queryLower)) {
							locations.push("url");
						}

						// Search in request body
						if ((searchIn === "all" || searchIn === "request_body") && req.request.body?.toLowerCase().includes(queryLower)) {
							locations.push("request_body");
						}

						// Search in response body
						if ((searchIn === "all" || searchIn === "response_body") && req.response.body?.toLowerCase().includes(queryLower)) {
							locations.push("response_body");
						}

						if (locations.length > 0) {
							matches.push({ request: req, matchLocations: locations });
						}
					}

					const maxLimit = Math.min(limit, 15); // Cap at 15 instead of 20

					return {
						query,
						searchIn,
						found: matches.length,
						results: matches.slice(0, maxLimit).map(m => ({
							id: m.request.id,
							url: m.request.request.url,
							method: m.request.request.method,
							status: m.request.response.status,
							matchedIn: m.matchLocations,
							contentType: m.request.response.contentType,
							responseSize: m.request.response.body?.length || 0,
						})),
					};
				},
			}),

			expose_request_data: tool({
				description: "Inject cached request response data into the page as window.secshield.data. Makes response bodies available for JavaScript analysis in the page context without re-fetching. Data is injected as an array where each element contains {url, method, status, body, headers}.",
				parameters: z.object({
					requestIds: z.array(z.string()).describe("Array of request IDs to expose (from get_network_requests or search results)"),
					variableName: z.string().optional().describe("Custom variable name under window.secshield (default: 'data'). Will be accessible as window.secshield.{name}"),
				}),
				execute: async ({ requestIds, variableName = "data" }) => {
					const exposedData: Array<{
						url: string;
						method: string;
						status: number;
						body: unknown;
						headers: Record<string, string>;
					}> = [];

					for (const requestId of requestIds) {
						const request = getCacheEntry(requestId, tabId);
						if (request) {
							// Try to parse JSON responses
							let parsedBody: unknown = request.response.body;
							if (request.response.contentType?.includes("json") && request.response.body) {
								try {
									parsedBody = JSON.parse(request.response.body);
								} catch {
									// Keep as string if parse fails
								}
							}

							exposedData.push({
								url: request.request.url,
								method: request.request.method,
								status: request.response.status,
								body: parsedBody,
								headers: request.response.headers,
							});
						}
					}

					// Inject into page
					try {
						await chrome.scripting.executeScript({
							target: { tabId },
							world: "MAIN", // Inject into page's main world
							func: (varName: string, data: typeof exposedData) => {
								// Create secshield namespace if it doesn't exist
								if (typeof (window as any).secshield === "undefined") {
									(window as any).secshield = {};
								}
								// Inject data
								(window as any).secshield[varName] = data;
								console.log(`[SecShield] Exposed ${data.length} requests as window.secshield.${varName}`);
							},
							args: [variableName, exposedData],
						});

						return {
							success: true,
							exposedCount: exposedData.length,
							accessPath: `window.secshield.${variableName}`,
							message: `Injected ${exposedData.length} request responses. Access via window.secshield.${variableName}[index].body in the browser console.`,
						};
					} catch (error) {
						return {
							success: false,
							error: error instanceof Error ? error.message : "Failed to inject data into page",
						};
					}
				},
			}),

			get_cache_statistics: tool({
				description: "Get summary statistics about cached network requests including total count, breakdown by method, status codes, request types, and how many have complete HTTP header data (cookies, auth).",
				parameters: z.object({}),
				execute: async () => {
					const stats = getCacheStatistics(tabId);
					const allRequests = getEntriesForTab(tabId);

					// Count enriched requests
					const enrichedCount = allRequests.filter(r => r.metadata.hasWebRequestData).length;
					const withCookies = allRequests.filter(r => (r.metadata.cookies?.length || 0) > 0).length;
					const withAuth = allRequests.filter(r => r.metadata.authHeaders?.authorization).length;

					return {
						totalRequests: stats.totalEntries,
						byMethod: stats.byMethod,
						byStatus: stats.byStatus,
						byType: stats.byType,
						errorCount: stats.errorCount,
						enrichedWithWebRequest: enrichedCount,
						requestsWithCookies: withCookies,
						requestsWithAuth: withAuth,
						enrichmentRate: stats.totalEntries > 0
							? `${Math.round((enrichedCount / stats.totalEntries) * 100)}%`
							: "0%",
					};
				},
			}),

			execute_javascript: tool({
				description: "Execute JavaScript code in the page context (MAIN world) for security analysis. Can access DOM, cookies, localStorage, sessionStorage, global variables, and page functions. Returns the result and any console logs captured during execution. Useful for checking security configurations, extracting tokens, analyzing page state, and testing for vulnerabilities.",
				parameters: z.object({
					code: z.string().describe("JavaScript code to execute. Will be wrapped in async IIFE, so you can use await. Example: 'document.cookie' or 'localStorage.getItem(\"token\")'"),
				}),
				execute: async ({ code }) => {
					try {
						console.log(`[Tool: execute_javascript] 🔧 Executing code for tab ${tabId}:\n${code}`);
						const result = await scriptExecutionManager.queueScriptExecution(tabId, code);

						// Log the result to console for debugging
						console.log(`[Tool: execute_javascript] ✅ Result:\n${result}`);

						return {
							success: true,
							result,
							message: "Code executed successfully. Result includes any console logs captured during execution.",
						};
					} catch (error) {
						console.error(`[Tool: execute_javascript] ❌ Error:`, error);
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
							message: "Code execution failed. Check the error for details.",
						};
					}
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
