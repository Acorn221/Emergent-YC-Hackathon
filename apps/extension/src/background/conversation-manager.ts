/**
 * Conversation Manager
 * 
 * Manages streaming LLM conversations with direct Anthropic API calls.
 * Follows yeet pattern: background manages state, UI polls for updates.
 */

import {
	getEntriesForTab,
	getCacheEntry,
	searchByUrl,
	filterEntries,
	getCacheStatistics
} from "./cache-state";
import { scriptExecutionManager } from "./script-execution-manager";

/**
 * Parse Server-Sent Events stream
 */
async function* parseSSE(response: Response): AsyncGenerator<{ event: string; data: any }> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("No response body");
	}

	const decoder = new TextDecoder();
	let buffer = "";
	let currentEvent = "message";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (line.startsWith("event:")) {
					currentEvent = line.slice(6).trim();
				} else if (line.startsWith("data:")) {
					const data = line.slice(5).trim();
					if (data) {
						try {
							const parsed = JSON.parse(data);
							yield { event: currentEvent, data: parsed };
						} catch (e) {
							console.warn("[Conv Manager] Failed to parse SSE data:", data);
						}
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

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
	private apiKey: string;
	private baseURL = "https://vulnguard-6.preview.emergentagent.com/api/v1";

	constructor() {
		const apiKey = process.env.PLASMO_PUBLIC_ANTHROPIC_API_KEY;

		console.log("[Conversation Manager] 🏗️ Constructor called");
		console.log("[Conversation Manager] API Key present:", !!apiKey, apiKey ? `(${apiKey.substring(0, 10)}...)` : "MISSING");

		if (!apiKey) {
			console.error("[Conversation Manager] ❌ No ANTHROPIC_API_KEY found");
		}

		this.apiKey = apiKey || "";
		console.log("[Conversation Manager] ✅ Initialized with direct Anthropic API access");
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

	/**
	 * Stream response from Anthropic API with manual tool execution.
	 * 
	 * This method:
	 * 1. Calls Anthropic API directly (no AI SDK)
	 * 2. Parses SSE stream manually
	 * 3. Executes tools ourselves when model requests them
	 * 4. Adds tool results as user messages (Anthropic format)
	 * 5. Loops back to call API again with updated history
	 * 6. Continues until model stops or max turns reached
	 */
	private async streamResponse(
		conversationId: string,
		tabId: number,
		signal: AbortSignal
	): Promise<void> {
		console.log("[Conversation Manager] 🎯 streamResponse called for:", conversationId);

		const state = this.conversations.get(conversationId);
		if (!state) {
			console.error("[Conversation Manager] ❌ No state found for conversation:", conversationId);
			return;
		}

		try {
			// Trim message history to keep conversation manageable
			const MAX_HISTORY_MESSAGES = 10;
			if (state.messages.length > MAX_HISTORY_MESSAGES) {
				const removed = state.messages.length - MAX_HISTORY_MESSAGES;
				state.messages = state.messages.slice(-MAX_HISTORY_MESSAGES);
				console.warn(`[Conversation Manager] ✂️ Trimmed ${removed} old messages (keeping last ${MAX_HISTORY_MESSAGES})`);
			}

			console.log(`[Conversation Manager] 📡 Starting conversation with ${state.messages.length} messages in history`);

			// Get tool definitions
			const tools = this.getToolDefinitions(tabId);

			const systemPrompt = `You are a security researcher analyzing web applications for vulnerabilities. Your goal is to identify ACTUAL security issues that could compromise user data, privacy, or system integrity.

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

TOOL USAGE GUIDELINES:
1. ALWAYS read tool descriptions carefully to understand required vs optional parameters
2. When a tool requires a parameter (like requestId), you MUST provide it from previous tool results
3. If you get an error saying a parameter is missing or invalid, READ THE ERROR and provide the correct parameter
4. DO NOT repeatedly call the same tool with empty/invalid parameters
5. Use get_network_requests to get IDs, then use those IDs in get_request_details

Example workflow:
1. Call get_network_requests → receives list with IDs like "fetch-123-456"
2. Call get_request_details with {"requestId": "fetch-123-456"} ← USE THE ID FROM STEP 1
3. If you get an error, check what parameter you're missing and provide it

Use your tools to:
1. Inspect network requests for sensitive data exposure
2. Execute JavaScript to check DOM, localStorage, cookies for security issues
3. Search for common vulnerability patterns in API responses
4. Verify proper authentication and authorization implementations

Be thorough but accurate. Only report genuine security concerns.

IMPORTANT: Only use the exact tool names provided. If you try to use a tool that doesn't exist, you'll get an error.`;

			// Conversation loop - keep calling API until no more tool calls
			let maxTurns = 500; // Safety limit
			let consecutiveErrors = 0;
			let lastErrorToolName = "";

			for (let turn = 0; turn < maxTurns; turn++) {
				console.log(`[Conversation Manager] 🔄 Turn ${turn + 1}/${maxTurns}`);

				// Call Anthropic API
				const response = await fetch(`${this.baseURL}/messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": this.apiKey,
						"anthropic-version": "2023-06-01",
						"anthropic-dangerous-direct-browser-access": "true",
						"x-model": "claude-sonnet-4-5-20250929",
					},
					body: JSON.stringify({
						model: "claude-sonnet-4-5-20250929",
						messages: state.messages,
						system: systemPrompt,
						tools,
						max_tokens: 65536,
						stream: true,
						temperature: 0,
					}),
					signal,
				});

				if (!response.ok) {
					throw new Error(`API error: ${response.status} ${response.statusText}`);
				}

				// Parse SSE stream
				let assistantText = "";
				const toolCalls: Array<{ id: string; name: string; input: any }> = [];
				const currentToolInputs = new Map<number, string>(); // Track JSON accumulation (SSE index -> json string)
				const indexToToolCallIndex = new Map<number, number>(); // Map SSE index to toolCalls array index
				let stopReason: string | null = null;
				let inputTokens = 0;
				let outputTokens = 0;

				for await (const { event, data } of parseSSE(response)) {
					console.log(`[Conv Manager] SSE event: ${event}`);

					if (event === "message_start") {
						if (data.message?.usage) {
							inputTokens = data.message.usage.input_tokens || 0;
						}
					} else if (event === "content_block_start") {
						const block = data.content_block;
						if (block?.type === "tool_use") {
							const sseIndex = data.index;
							const toolCallIndex = toolCalls.length; // This will be the index in our array
							console.log(`[Conv Manager] 🆕 New tool_use block at SSE index ${sseIndex}, will be toolCalls[${toolCallIndex}]:`, block.name);

							toolCalls.push({
								id: block.id,
								name: block.name,
								input: {}, // Will be filled by input_json_delta
							});
							currentToolInputs.set(sseIndex, "");
							indexToToolCallIndex.set(sseIndex, toolCallIndex);
							console.log(`[Conv Manager] 🗂️ toolCalls array now has ${toolCalls.length} items`);
						}
					} else if (event === "content_block_delta") {
						const delta = data.delta;
						if (delta?.type === "text_delta") {
							assistantText += delta.text;
							// Emit to UI
							state.chunks.push({
								type: "text-delta",
								data: delta.text,
								timestamp: Date.now(),
							});
							state.fullText += delta.text;
							console.log(`[Conv Manager] 📝 Text delta (${delta.text.length} chars)`);
						} else if (delta?.type === "input_json_delta") {
							const sseIndex = data.index;
							const current = currentToolInputs.get(sseIndex) || "";
							currentToolInputs.set(sseIndex, current + delta.partial_json);
							console.log(`[Conv Manager] 📥 Accumulating JSON for SSE index ${sseIndex}: "${delta.partial_json}"`);
						}
					} else if (event === "content_block_stop") {
						// Tool input complete - parse accumulated JSON
						const sseIndex = data.index;
						const toolCallIndex = indexToToolCallIndex.get(sseIndex);
						const jsonStr = currentToolInputs.get(sseIndex);

						console.log(`[Conv Manager] 🛑 Block stop for SSE index ${sseIndex}, toolCallIndex: ${toolCallIndex}, jsonStr: "${jsonStr}"`);

						if (jsonStr !== undefined && toolCallIndex !== undefined && toolCalls[toolCallIndex]) {
							try {
								toolCalls[toolCallIndex].input = JSON.parse(jsonStr);
								console.log(`[Conv Manager] 🔧 Tool call complete:`, toolCalls[toolCallIndex]);
								console.log(`[Conv Manager] 🔍 Raw JSON string:`, jsonStr);
								console.log(`[Conv Manager] 🔍 Parsed input:`, toolCalls[toolCallIndex].input);

								// Emit tool-call chunk
								state.chunks.push({
									type: "tool-call",
									data: {
										toolCallId: toolCalls[toolCallIndex].id,
										toolName: toolCalls[toolCallIndex].name,
										args: toolCalls[toolCallIndex].input,
									},
									timestamp: Date.now(),
								});
							} catch (e) {
								console.error("[Conv Manager] Failed to parse tool input:", jsonStr);
							}
						}
					} else if (event === "message_delta") {
						if (data.delta?.stop_reason) {
							stopReason = data.delta.stop_reason;
						}
						if (data.usage) {
							outputTokens = data.usage.output_tokens || 0;
						}
					} else if (event === "message_stop") {
						console.log("[Conv Manager] 🛑 message_stop received");
						break;
					}
				}

				// Update token usage
				state.totalInputTokens += inputTokens;
				state.totalOutputTokens += outputTokens;
				console.log(`[Conv Manager] 📊 Token usage: ${inputTokens} in, ${outputTokens} out`);

				// Build assistant message content
				const assistantContent: any[] = [];
				if (assistantText.trim().length > 0) {
					assistantContent.push({
						type: "text",
						text: assistantText,
					});
				}
				for (const toolCall of toolCalls) {
					assistantContent.push({
						type: "tool_use",
						id: toolCall.id,
						name: toolCall.name,
						input: toolCall.input,
					});
				}

				// If no tool calls or stop_reason is end_turn, we're done
				if (toolCalls.length === 0 || stopReason === "end_turn") {
					// Add assistant message to history
					if (assistantContent.length > 0) {
						state.messages.push({
							role: "assistant",
							content: assistantContent as any,
						});
						console.log(`[Conv Manager] 💾 Added final assistant message with ${assistantContent.length} parts`);
					}
					console.log(`[Conv Manager] 🏁 Conversation complete (stop_reason: ${stopReason})`);
					break;
				}

				// Execute tools
				console.log(`[Conv Manager] 🔧 Executing ${toolCalls.length} tool calls...`);
				for (const toolCall of toolCalls) {
					console.log(`[Conv Manager] ⚙️ Executing tool: ${toolCall.name}`);
					try {
						const result = await this.executeToolManually(toolCall.name, toolCall.input, tabId);

						// Check if result is an error
						const resultStr = typeof result === "string" ? result : JSON.stringify(result);
						if (resultStr.includes('"error"') || resultStr.includes('Request not found') || resultStr.includes('undefined')) {
							// This is an error result
							if (toolCall.name === lastErrorToolName) {
								consecutiveErrors++;
								console.warn(`[Conv Manager] ⚠️ Consecutive error ${consecutiveErrors} for tool: ${toolCall.name}`);

								if (consecutiveErrors >= 3) {
									console.error(`[Conv Manager] 🛑 Stopping - model is looping with same error!`);
									state.chunks.push({
										type: "error",
										data: `Model is repeatedly making the same mistake with tool '${toolCall.name}'. Please check your tool usage and provide required parameters.`,
										timestamp: Date.now(),
									});
									state.status = "error";
									return;
								}
							} else {
								consecutiveErrors = 1;
								lastErrorToolName = toolCall.name;
							}
						} else {
							// Success - reset error counter
							consecutiveErrors = 0;
							lastErrorToolName = "";
						}

						// Add tool result to the SAME assistant message
						assistantContent.push({
							type: "tool_result",
							tool_use_id: toolCall.id,
							content: resultStr,
						});

						// Emit tool-result chunk
						state.chunks.push({
							type: "tool-result",
							data: {
								toolCallId: toolCall.id,
								toolName: toolCall.name,
								result,
							},
							timestamp: Date.now(),
						});
						console.log(`[Conv Manager] ✅ Tool result:`, result);
					} catch (error: any) {
						console.error(`[Conv Manager] ❌ Tool execution error:`, error);
						consecutiveErrors++;
						lastErrorToolName = toolCall.name;

						assistantContent.push({
							type: "tool_result",
							tool_use_id: toolCall.id,
							content: `Error: ${error.message}`,
							is_error: true,
						});
					}
				}

				// Add complete assistant message with text + tool_use + tool_result to history
				if (assistantContent.length > 0) {
					state.messages.push({
						role: "assistant",
						content: assistantContent as any,
					});
					console.log(`[Conv Manager] 💾 Added assistant message with ${assistantContent.length} parts (including tool results)`);
				}

				// Loop back to call API again with updated history
			}

			console.log(`[Conv Manager] 📜 Final message history: ${state.messages.length} messages`);

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
					console.warn(`[Conversation Manager] 🔙 Removed unprocessed user message due to error`);
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


	// Get Anthropic-format tool definitions
	private getToolDefinitions(tabId: number) {
		return [
			{
				name: "get_network_requests",
				description: "List network requests with summary info only. Returns ID, URL, method, status, type, content size, duration. Use get_request_details to fetch full headers/bodies/cookies for specific requests. This is much more efficient than fetching all data at once. KEEP LIMIT SMALL to avoid rate limits.",
				input_schema: {
					type: "object",
					properties: {
						limit: {
							type: "number",
							description: "Maximum number of requests to return (default: 10, max: 20)"
						},
						offset: {
							type: "number",
							description: "Starting offset for pagination (default: 0)"
						}
					}
				}
			},
			{
				name: "get_request_details",
				description: "Get complete details for a specific request by ID. Returns full headers, cookies, auth headers, and bodies (truncated to 500 chars by default to save tokens). Use get_request_body_chunk to fetch more body content if needed.",
				input_schema: {
					type: "object",
					properties: {
						requestId: {
							type: "string",
							description: "Request ID from get_network_requests or search_requests"
						},
						bodyPreviewSize: {
							type: "number",
							description: "Size of body preview in characters (default: 500, max: 1500)"
						}
					},
					required: ["requestId"]
				}
			},
			{
				name: "get_request_body_chunk",
				description: "Fetch a specific chunk of a request or response body. Use this when the body was truncated in get_request_details and you need to see more content.",
				input_schema: {
					type: "object",
					properties: {
						requestId: { type: "string", description: "Request ID" },
						bodyType: {
							type: "string",
							enum: ["request", "response"],
							description: "Which body to fetch: 'request' or 'response'"
						},
						offset: { type: "number", description: "Starting position in the body (default: 0)" },
						length: { type: "number", description: "Number of characters to fetch (default: 2000, max: 5000)" }
					},
					required: ["requestId", "bodyType"]
				}
			},
			{
				name: "search_requests",
				description: "Search and filter network requests by URL pattern, HTTP method, and/or status code range. Returns summary info (max 10 results to save tokens). Use get_request_details for full data on specific results.",
				input_schema: {
					type: "object",
					properties: {
						url: { type: "string", description: "URL substring to search for (case-insensitive, e.g., 'api', '/users', 'example.com')" },
						method: { type: "string", description: "HTTP method to filter by (GET, POST, PUT, DELETE, etc.)" },
						minStatus: { type: "number", description: "Minimum status code (inclusive, e.g., 200)" },
						maxStatus: { type: "number", description: "Maximum status code (inclusive, e.g., 299 for all 2xx)" }
					}
				}
			},
			{
				name: "search_request_content",
				description: "Search for text in request/response URLs, bodies, and headers. Finds requests containing specific data, field names, or values. Case-insensitive substring match. Max 10 results to save tokens.",
				input_schema: {
					type: "object",
					properties: {
						query: { type: "string", description: "Search query - looks for this text in URLs, request bodies, and response bodies" },
						searchIn: {
							type: "string",
							enum: ["all", "url", "request_body", "response_body"],
							description: "Where to search: 'all' (default), 'url', 'request_body', or 'response_body'"
						},
						limit: { type: "number", description: "Max results to return (default: 10, max: 15)" }
					},
					required: ["query"]
				}
			},
			{
				name: "expose_request_data",
				description: "Inject cached request response data into the page as window.secshield.data. Makes response bodies available for JavaScript analysis in the page context without re-fetching. Data is injected as an array where each element contains {url, method, status, body, headers}.",
				input_schema: {
					type: "object",
					properties: {
						requestIds: {
							type: "array",
							items: { type: "string" },
							description: "Array of request IDs to expose (from get_network_requests or search results)"
						},
						variableName: { type: "string", description: "Custom variable name under window.secshield (default: 'data'). Will be accessible as window.secshield.{name}" }
					},
					required: ["requestIds"]
				}
			},
			{
				name: "get_cache_statistics",
				description: "Get summary statistics about cached network requests including total count, breakdown by method, status codes, request types, and how many have complete HTTP header data (cookies, auth).",
				input_schema: {
					type: "object",
					properties: {}
				}
			},
			{
				name: "execute_javascript",
				description: "Execute JavaScript code in the page context (MAIN world) for security analysis. Can access DOM, cookies, localStorage, sessionStorage, global variables, and page functions. Returns the result and any console logs captured during execution. Useful for checking security configurations, extracting tokens, analyzing page state, and testing for vulnerabilities.",
				input_schema: {
					type: "object",
					properties: {
						code: { type: "string", description: "JavaScript code to execute. Will be wrapped in async IIFE, so you can use await. Example: 'document.cookie' or 'localStorage.getItem(\"token\")'" }
					},
					required: ["code"]
				}
			},
			{
				name: "get_network_stats",
				description: "[DEPRECATED] This tool does not exist. Use 'get_cache_statistics' instead.",
				input_schema: {
					type: "object",
					properties: {}
				}
			}
		];
	}

	// Execute tool manually
	private async executeToolManually(toolName: string, input: any, tabId: number): Promise<any> {
		console.log(`[Conv Manager] Executing tool: ${toolName}`, input);

		switch (toolName) {
			case "get_network_requests": {
				const requests = getEntriesForTab(tabId);
				const limitNum = Math.min(input.limit || 10, 20);
				const offsetNum = input.offset || 0;
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
						hasWebRequestData: r.metadata.hasWebRequestData,
						hasCookies: (r.metadata.cookies?.length || 0) > 0,
						hasAuth: !!(r.metadata.authHeaders?.authorization),
					})),
				};
			}

			case "get_request_details": {
				const request = getCacheEntry(input.requestId, tabId);
				if (!request) {
					return { error: `Request not found: ${input.requestId}` };
				}

				const maxBodySize = Math.min(input.bodyPreviewSize || 500, 1500);
				const requestBodySize = request.request.body?.length || 0;
				const responseBodySize = request.response.body?.length || 0;

				const requestBody = request.request.body
					? requestBodySize > maxBodySize
						? `${request.request.body.substring(0, maxBodySize)}\n... [truncated, ${requestBodySize} total chars]`
						: request.request.body
					: undefined;

				const responseBody = request.response.body
					? responseBodySize > maxBodySize
						? `${request.response.body.substring(0, maxBodySize)}\n... [truncated, ${responseBodySize} total chars]`
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
					timing: request.timing,
					metadata: request.metadata,
				};
			}

			case "get_request_body_chunk": {
				const request = getCacheEntry(input.requestId, tabId);
				if (!request) {
					return { error: `Request not found: ${input.requestId}` };
				}

				const body = input.bodyType === "request" ? request.request.body : request.response.body;
				if (!body) {
					return { error: `No ${input.bodyType} body available` };
				}

				const offset = input.offset || 0;
				const maxLength = Math.min(input.length || 2000, 5000);
				const chunk = body.substring(offset, offset + maxLength);
				const totalSize = body.length;
				const hasMore = offset + maxLength < totalSize;

				return {
					requestId: input.requestId,
					bodyType: input.bodyType,
					offset,
					chunkSize: chunk.length,
					totalSize,
					hasMore,
					nextOffset: hasMore ? offset + maxLength : null,
					chunk,
				};
			}

			case "search_requests": {
				let results = input.url ? searchByUrl(input.url, tabId) : getEntriesForTab(tabId);

				if (input.method || input.minStatus !== undefined || input.maxStatus !== undefined) {
					results = filterEntries({
						tabId,
						method: input.method?.toUpperCase(),
						minStatus: input.minStatus,
						maxStatus: input.maxStatus,
					}).filter(r => !input.url || results.some(ur => ur.id === r.id));
				}

				return {
					found: results.length,
					filters: { url: input.url, method: input.method?.toUpperCase(), minStatus: input.minStatus, maxStatus: input.maxStatus },
					requests: results.slice(0, 10).map(r => ({
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
			}

			case "search_request_content": {
				const allRequests = getEntriesForTab(tabId);
				const queryLower = input.query.toLowerCase();
				const searchIn = input.searchIn || "all";
				const matches: Array<any> = [];

				for (const req of allRequests) {
					const matchLocations: string[] = [];

					if ((searchIn === "all" || searchIn === "url") && req.request.url.toLowerCase().includes(queryLower)) {
						matchLocations.push("url");
					}
					if ((searchIn === "all" || searchIn === "request_body") && req.request.body?.toLowerCase().includes(queryLower)) {
						matchLocations.push("request_body");
					}
					if ((searchIn === "all" || searchIn === "response_body") && req.response.body?.toLowerCase().includes(queryLower)) {
						matchLocations.push("response_body");
					}

					if (matchLocations.length > 0) {
						matches.push({
							id: req.id,
							url: req.request.url,
							method: req.request.method,
							status: req.response.status,
							matchedIn: matchLocations,
							requestBodySize: req.request.body?.length || 0,
							responseBodySize: req.response.body?.length || 0,
						});

						if (matches.length >= (input.limit || 10)) break;
					}
				}

				return {
					query: input.query,
					searchIn,
					found: matches.length,
					results: matches,
				};
			}

			case "expose_request_data": {
				const requestIds = input.requestIds;
				const variableName = input.variableName || "data";
				const requests = requestIds.map((id: string) => getCacheEntry(id, tabId)).filter(Boolean);

				const data = requests.map((r: any) => ({
					url: r.request.url,
					method: r.request.method,
					status: r.response.status,
					body: r.response.body,
					headers: r.response.headers,
				}));

				await scriptExecutionManager.queueScriptExecution(
					tabId,
					`window.secshield = window.secshield || {};
window.secshield.${variableName} = ${JSON.stringify(data)};
console.log("[SecShield] Exposed ${data.length} requests as window.secshield.${variableName}");
"Exposed ${data.length} requests as window.secshield.${variableName}"`
				);

				return {
					exposedCount: data.length,
					variableName,
					accessPath: `window.secshield.${variableName}`,
				};
			}

			case "get_cache_statistics": {
				return getCacheStatistics(tabId);
			}

			case "execute_javascript": {
				const result = await scriptExecutionManager.queueScriptExecution(tabId, input.code);
				return result;
			}

			case "get_network_stats": {
				return {
					error: "Tool 'get_network_stats' does not exist. Use 'get_cache_statistics' instead."
				};
			}

			default:
				throw new Error(`Unknown tool: ${toolName}`);
		}
	}

	getUpdates(conversationId: string) {
		const state = this.conversations.get(conversationId);
		if (!state) {
			return null;
		}

		const chunks = [...state.chunks];
		// Clear chunks after reading (they've been consumed)
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

