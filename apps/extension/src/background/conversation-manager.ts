/**
 * Conversation Manager
 * 
 * Manages streaming LLM conversations with AI SDK.
 * Follows yeet pattern: background manages state, UI polls for updates.
 */

import { streamText, tool } from "ai";
import { z } from "zod";
import { createEmergentAnthropic } from "./emergent-anthropic-provider";
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
	totalInputTokens: number; // Track token usage
	totalOutputTokens: number;
}

export class ConversationManager {
	private conversations = new Map<string, ConversationState>();
	private anthropic: ReturnType<typeof createEmergentAnthropic>;

	constructor() {
		const apiKey = process.env.PLASMO_PUBLIC_ANTHROPIC_API_KEY;

		console.log("[Conversation Manager] 🏗️ Constructor called");
		console.log("[Conversation Manager] API Key present:", !!apiKey, apiKey ? `(${apiKey.substring(0, 10)}...)` : "MISSING");

		if (!apiKey) {
			console.error("[Conversation Manager] ❌ No ANTHROPIC_API_KEY found");
		}

		this.anthropic = createEmergentAnthropic({
			apiKey: apiKey || "",
			baseURL: "https://vulnguard-6.preview.emergentagent.com/api/v1",
			headers: {
				"anthropic-dangerous-direct-browser-access": "true",
				"x-model": "claude-sonnet-4-5-20250929"
			},
		});

		console.log("[Conversation Manager] ✅ Initialized with custom Emergent Anthropic provider");
		console.log("[Conversation Manager] Provider type:", typeof this.anthropic);
	}

	async startConversation(opts: {
		conversationId: string;
		prompt: string;
		tabId: number;
	}): Promise<void> {
		console.log(`[Conversation Manager] 🚀 Starting conversation: ${opts.conversationId}`);
		console.log(`[Conversation Manager] Options:`, { prompt: opts.prompt.substring(0, 50) + '...', tabId: opts.tabId });

		let state = this.conversations.get(opts.conversationId);
		console.log("[Conversation Manager] 🔍 Checking for existing state:", !!state);

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
				totalInputTokens: 0,
				totalOutputTokens: 0,
			};
			this.conversations.set(opts.conversationId, state);
			console.log(`[Conversation Manager] 💾 Stored new conversation in Map. Map size: ${this.conversations.size}`);
		} else {
			// Continuing conversation - create new AbortController
			console.log(`[Conversation Manager] 🔄 Continuing existing conversation (${state.messages.length} messages, ~${state.totalInputTokens + state.totalOutputTokens} tokens used)`);
			console.log(`[Conversation Manager] 📜 Message history:`, state.messages.map(m => `${m.role}: ${m.content.slice(0, 50)}...`));
			state.abortController = new AbortController();
			state.status = "streaming";
			state.chunks = []; // Clear chunks for new response
		}

		// Add user message to history
		state.messages.push({
			role: "user",
			content: opts.prompt,
		});
		console.log(`[Conversation Manager] ➕ Added user message. Total messages now: ${state.messages.length}`);

		// Get cache data for context
		const cacheData = getEntriesForTab(opts.tabId);
		const stats = getCacheStatistics(opts.tabId);

		console.log(`[Conversation Manager] 📊 Cache has ${cacheData.length} requests`);

		// Start streaming (async, don't await)
		console.log("[Conversation Manager] 🎬 About to call streamResponse...");
		this.streamResponse(opts.conversationId, opts.tabId, state.abortController.signal).catch(error => {
			console.error("[Conversation Manager] 💥 Unhandled error in streamResponse:", error);
			console.error("[Conversation Manager] Error stack:", error.stack);
		});
	}

	private async streamResponse(
		conversationId: string,
		tabId: number,
		signal: AbortSignal
	): Promise<void> {
		console.log("[Conversation Manager] 🎯 streamResponse called for:", conversationId);
		console.log("[Conversation Manager] 🔍 About to get state from conversations Map...");
		console.log("[Conversation Manager] 🗺️ Map has", this.conversations.size, "conversations");

		// Force a different log to see if console is working
		console.warn("DEBUG CHECKPOINT 1");
		console.error("DEBUG CHECKPOINT 2");

		let state;
		try {
			console.warn("DEBUG CHECKPOINT 3 - before get");
			state = this.conversations.get(conversationId);
			console.warn("DEBUG CHECKPOINT 4 - after get, state exists:", !!state);
			console.log("[Conversation Manager] ✅ State retrieved:", !!state);
		} catch (e) {
			console.error("[Conversation Manager] ❌ Error getting state:", e);
			throw e;
		}

		if (!state) {
			console.error("[Conversation Manager] ❌ No state found for conversation:", conversationId);
			return;
		}

		try {
			console.log("[Conversation Manager] 🚦 Entering try block in streamResponse");
			// Trim message history to keep conversation manageable
			// Keep last 10 messages = 5 exchanges
			const MAX_HISTORY_MESSAGES = 10;
			if (state.messages.length > MAX_HISTORY_MESSAGES) {
				const removed = state.messages.length - MAX_HISTORY_MESSAGES;
				state.messages = state.messages.slice(-MAX_HISTORY_MESSAGES);
				console.warn(`[Conversation Manager] ✂️ Trimmed ${removed} old messages (keeping last ${MAX_HISTORY_MESSAGES} messages)`);
			}

			console.log(`[Conversation Manager] 📡 Starting AI SDK stream with ${state.messages.length} messages in history (~${state.totalInputTokens + state.totalOutputTokens} tokens used so far)...`);

			console.log("[Conversation Manager] 🔧 Creating streamText with anthropic provider:", typeof this.anthropic);

			const result = streamText({
				model: this.anthropic("claude-sonnet-4-5-20250929", {

				}),
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

Be thorough but accurate. Only report genuine security concerns.

IMPORTANT: Only use the exact tool names provided. If you try to use a tool that doesn't exist, you'll get an error.`,
				messages: state.messages, // Use message history instead of single prompt
				maxTokens: 1024 * 32,
				maxSteps: 500, // Allow many tool call rounds for thorough investigation
				tools: this.buildTools(tabId),
				abortSignal: signal,
				onStepFinish: (event) => {
					console.log("[Conversation Manager] 📍 Step finished:", event);
					// Log tool calls that failed
					if (event.toolCalls) {
						for (const toolCall of event.toolCalls) {
							console.log("[Conversation Manager] 🔧 Tool call in step:", toolCall);
						}
					}
				},
			});

			console.log("[Conversation Manager] 🌊 streamText result created, starting iteration...");

			// Track assistant response
			let assistantMessage = "";

			// Stream the full text (includes tool execution results)
			// The AI SDK will automatically execute tools and continue the conversation
			console.log("[Conversation Manager] 🔄 About to iterate over fullStream...");
			for await (const chunk of result.fullStream) {
				console.log("[Conversation Manager] 📦 Received chunk:", chunk.type);

				// Log full chunk for errors
				if (chunk.type === "error") {
					console.error("[Conversation Manager] 🚨 ERROR CHUNK:", chunk);
					console.error("[Conversation Manager] Error details:", JSON.stringify(chunk, null, 2));

					// Check if it's a "no such tool" error
					if ((chunk as any).error?.name === "AI_NoSuchToolError") {
						const toolName = (chunk as any).error?.toolName;
						const availableTools = (chunk as any).error?.availableTools || [];

						// Add error to chunks for UI
						state.chunks.push({
							type: "error",
							data: `Tool "${toolName}" does not exist. Available tools: ${availableTools.join(", ")}`,
							timestamp: Date.now(),
						});

						// Continue processing - don't throw, let the stream complete
						console.warn("[Conversation Manager] ⚠️ Continuing despite tool error...");
						continue;
					}
				}

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
					console.log(`[Conversation Manager] 🔧 Tool call details:`, JSON.stringify(chunk, null, 2));
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
					console.log(`[Conversation Manager] ✅ Tool result details:`, JSON.stringify(chunk, null, 2));
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
				} else if (chunk.type === "finish") {
					console.log(`[Conversation Manager] 🏁 Finish chunk received:`, JSON.stringify(chunk, null, 2));
				} else {
					console.log(`[Conversation Manager] ❓ Unknown chunk type:`, chunk.type, chunk);
				}
			}

			// Get usage info from result
			const usage = await result.usage;
			state.totalInputTokens += usage.promptTokens;
			state.totalOutputTokens += usage.completionTokens;

			console.log(`[Conversation Manager] 📊 Token usage: ${usage.promptTokens} in, ${usage.completionTokens} out (Total: ${state.totalInputTokens} + ${state.totalOutputTokens} = ${state.totalInputTokens + state.totalOutputTokens})`);

			// Get all steps - each step represents a model turn + tool execution
			const steps = await result.steps;
			console.log(`[Conversation Manager] 🔄 Total steps:`, steps.length);

			// Add messages for each step - put tool calls AND results in same assistant message
			for (let i = 0; i < steps.length; i++) {
				const step = steps[i];
				console.log(`[Conversation Manager] 📍 Processing step ${i + 1}/${steps.length}`);

				// Build ONE assistant message with text, tool calls, AND tool results
				const assistantContent: any[] = [];

				if (step?.text && step.text.trim().length > 0) {
					assistantContent.push({
						type: "text",
						text: step.text,
					});
				}

				// Add tool calls from this step
				for (const toolCall of step?.toolCalls || []) {
					assistantContent.push({
						type: "tool-call",
						toolCallId: toolCall.toolCallId,
						toolName: toolCall.toolName,
						args: toolCall.args,
					});
				}

				// Add tool results to the SAME message
				if (step?.toolResults && step.toolResults.length > 0) {
					for (const toolResult of step.toolResults) {
						assistantContent.push({
							type: "tool-result",
							toolCallId: toolResult.toolCallId,
							toolName: toolResult.toolName,
							result: toolResult.result,
						});
					}
				}

				// Add ONE assistant message with everything
				if (assistantContent.length > 0) {
					state.messages.push({
						role: "assistant",
						content: assistantContent.join("\n"),
					});
					console.log(`[Conversation Manager] 💾 Step ${i + 1}: Added assistant message with ${assistantContent.length} parts (text + tool calls + tool results)`);
				}
			}

			console.log(`[Conversation Manager] 📜 Total messages in history:`, state.messages.length);

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

			// Catch-all for common tool name variations/mistakes
			get_network_stats: tool({
				description: "[DEPRECATED] This tool does not exist. Use 'get_cache_statistics' instead.",
				parameters: z.object({}),
				execute: async () => {
					return {
						error: "Tool 'get_network_stats' does not exist. Please use 'get_cache_statistics' instead to get network request statistics.",
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

