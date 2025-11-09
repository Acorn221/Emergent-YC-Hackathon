/**
 * Custom Anthropic Provider for Emergent Proxy
 * 
 * This provider implements the AI SDK's LanguageModelV1 interface to work with
 * the Emergent proxy that wraps Anthropic's API. It handles SSE streaming and
 * transforms Anthropic's response format to AI SDK's expected format.
 */

import type { LanguageModelV1, LanguageModelV1StreamPart } from "ai";

interface EmergentAnthropicConfig {
	apiKey: string;
	baseURL: string;
	headers?: Record<string, string>;
}

interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | Array<{
		type: string;
		text?: string;
		tool_use_id?: string;
		content?: string | Array<{ type: string; text?: string }>;
		id?: string;
		name?: string;
		input?: any;
	}>;
}

interface AnthropicTool {
	name: string;
	description?: string;
	input_schema: {
		type: string;
		properties: Record<string, any>;
		required?: string[];
	};
}

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
							console.warn("[Emergent Provider] Failed to parse SSE data:", data);
						}
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Convert AI SDK messages to Anthropic format
 */
function convertMessagesToAnthropic(messages: any[]): AnthropicMessage[] {
	const result: AnthropicMessage[] = [];

	for (const msg of messages) {
		if (msg.role === "system") {
			// System messages are handled separately in the API call
			continue;
		}

		if (msg.role === "user") {
			const content: any[] = [];
			for (const part of msg.content) {
				if (part.type === "text") {
					content.push({ type: "text", text: part.text });
				}
				// Handle other content types if needed
			}
			result.push({ role: "user", content });
		} else if (msg.role === "assistant") {
			const content: any[] = [];
			for (const part of msg.content) {
				if (part.type === "text") {
					content.push({ type: "text", text: part.text });
				} else if (part.type === "tool-call") {
					content.push({
						type: "tool_use",
						id: part.toolCallId,
						name: part.toolName,
						input: part.args,
					});
				} else if (part.type === "tool-result") {
					// Tool results in assistant message
					content.push({
						type: "tool_result",
						tool_use_id: part.toolCallId,
						content: typeof part.result === "string"
							? part.result
							: JSON.stringify(part.result),
					});
				}
			}
			result.push({ role: "assistant", content });
		}
		// Note: We don't convert role="tool" to user messages anymore
		// Tool results stay in assistant messages where they belong
	}

	return result;
}

/**
 * Convert AI SDK tools to Anthropic format
 */
function convertToolsToAnthropic(tools: any): AnthropicTool[] {
	if (!tools) return [];

	// AI SDK might pass tools as an array or object
	if (Array.isArray(tools)) {
		console.log("[Emergent Provider] Tools is an array:", tools.length);
		return tools.map((toolDef: any) => ({
			name: toolDef.name || toolDef.toolName || "unknown",
			description: toolDef.description,
			input_schema: toolDef.parameters as any,
		}));
	}

	// If it's an object, convert entries
	console.log("[Emergent Provider] Tools is an object, keys:", Object.keys(tools));
	const entries = Object.entries(tools);
	return entries.map(([name, toolDef]: [string, any]) => {
		console.log("[Emergent Provider] Converting tool:", name, toolDef);
		return {
			name,
			description: toolDef.description,
			input_schema: toolDef.parameters as any,
		};
	});
}

/**
 * Custom Anthropic Language Model
 */
class EmergentAnthropicLanguageModel implements LanguageModelV1 {
	readonly specificationVersion = "v1" as const;
	readonly provider = "emergent-anthropic" as const;
	readonly defaultObjectGenerationMode = "tool" as const;
	readonly supportsImageUrls = false;
	readonly modelId: string;

	constructor(
		modelId: string,
		private config: EmergentAnthropicConfig
	) {
		this.modelId = modelId;
	}

	async doGenerate(options: any): Promise<any> {
		throw new Error("doGenerate not implemented - use doStream instead");
	}

	async doStream(
		options: any
	): Promise<{
		stream: ReadableStream<LanguageModelV1StreamPart>;
		rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
		rawResponse?: { headers?: Record<string, string> };
		warnings?: any[];
	}> {
		console.log("[Emergent Provider] doStream called with options:", {
			promptLength: options.prompt?.length,
			hasMode: !!options.mode,
			hasTools: !!options.mode?.tools,
			maxTokens: options.maxTokens,
		});

		// Extract system message
		const systemMessage = options.prompt.find((m: any) => m.role === "system");
		let systemPrompt: string | undefined;

		if (systemMessage) {
			if (typeof systemMessage.content === "string") {
				systemPrompt = systemMessage.content;
			} else if (Array.isArray(systemMessage.content)) {
				systemPrompt = systemMessage.content
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n");
			}
		}

		// Convert messages
		const messages = convertMessagesToAnthropic(options.prompt);

		// Convert tools - handle both mode and tools
		console.log("[Emergent Provider] 🛠️ Raw tools from options:", options.mode);
		console.log("[Emergent Provider] 🛠️ options.mode.tools type:", typeof options.mode?.tools, Array.isArray(options.mode?.tools) ? "array" : "object");
		const tools = convertToolsToAnthropic(options.mode?.tools || {});

		// Build request body
		const requestBody = {
			model: this.modelId,
			messages,
			...(systemPrompt && { system: systemPrompt }),
			...(tools.length > 0 && { tools }),
			max_tokens: options.maxTokens || 4096,
			stream: true,
			...(options.temperature !== undefined && { temperature: options.temperature }),
			...(options.topP !== undefined && { top_p: options.topP }),
		};

		console.log("[Emergent Provider] Making request:", {
			url: `${this.config.baseURL}/messages`,
			model: this.modelId,
			messageCount: messages.length,
			toolCount: tools.length,
		});

		console.log("[Emergent Provider] Request body:", JSON.stringify(requestBody, null, 2));
		console.log("[Emergent Provider] Request headers:", {
			"Content-Type": "application/json",
			"x-api-key": this.config.apiKey ? `${this.config.apiKey.substring(0, 10)}...` : "MISSING",
			"anthropic-version": "2023-06-01",
			...this.config.headers,
		});

		// Make API request
		console.log("[Emergent Provider] 🚀 About to fetch...");
		const response = await fetch(`${this.config.baseURL}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.config.apiKey,
				"anthropic-version": "2023-06-01",
				...this.config.headers,
			},
			body: JSON.stringify(requestBody),
			signal: options.abortSignal,
		});

		console.log("[Emergent Provider] ✅ Fetch complete, status:", response.status, response.statusText);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("[Emergent Provider] ❌ API error:", response.status, errorText);
			throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
		}

		// Create transform stream for SSE -> AI SDK format
		console.log("[Emergent Provider] 📺 Creating ReadableStream...");
		const stream = new ReadableStream<LanguageModelV1StreamPart>({
			async start(controller) {
				console.log("[Emergent Provider] 🎬 Stream start() called");
				try {
					let usage = {
						promptTokens: 0,
						completionTokens: 0,
					};

					// Track tool calls being built
					const toolCalls = new Map<number, {
						id: string;
						name: string;
						argsText: string;
					}>();

					for await (const { event, data } of parseSSE(response)) {
						console.log(`[Emergent Provider] SSE event: ${event}`, data);

						if (event === "message_start") {
							// Extract initial usage
							if (data.message?.usage) {
								usage.promptTokens = data.message.usage.input_tokens || 0;
							}
						} else if (event === "content_block_start") {
							const block = data.content_block;
							if (block?.type === "text") {
								// Text block starting - don't enqueue empty delta
							} else if (block?.type === "tool_use") {
								// Tool call starting
								const index = data.index;
								toolCalls.set(index, {
									id: block.id,
									name: block.name,
									argsText: "",
								});
							}
						} else if (event === "content_block_delta") {
							const delta = data.delta;
							if (delta?.type === "text_delta") {
								// Text content
								controller.enqueue({
									type: "text-delta",
									textDelta: delta.text,
								});
							} else if (delta?.type === "input_json_delta") {
								// Tool arguments (incremental JSON)
								const index = data.index;
								const toolCall = toolCalls.get(index);
								if (toolCall) {
									toolCall.argsText += delta.partial_json;
								}
							}
						} else if (event === "content_block_stop") {
							// Tool call complete - parse accumulated args
							const index = data.index;
							const toolCall = toolCalls.get(index);
							if (toolCall) {
								try {
									// Parse the JSON to validate it
									const args = JSON.parse(toolCall.argsText);
									console.log("[Emergent Provider] 🎯 Tool call complete:", {
										id: toolCall.id,
										name: toolCall.name,
										args,
									});

									// Send to AI SDK as a JSON string (AI SDK expects string, not object)
									controller.enqueue({
										type: "tool-call",
										toolCallType: "function",
										toolCallId: toolCall.id,
										toolName: toolCall.name,
										args: toolCall.argsText, // Send as string, not parsed object!
									});
								} catch (e) {
									console.error("[Emergent Provider] Failed to parse tool args:", toolCall.argsText);
								}
								toolCalls.delete(index);
							}
						} else if (event === "message_delta") {
							// Final usage stats
							if (data.usage) {
								usage.completionTokens = data.usage.output_tokens || 0;
							}

							// Check for stop reason
							if (data.delta?.stop_reason) {
								const finishReason = data.delta.stop_reason === "end_turn"
									? "stop"
									: data.delta.stop_reason === "tool_use"
										? "tool-calls"
										: "other";

								controller.enqueue({
									type: "finish",
									finishReason,
									usage,
									logprobs: undefined,
								});
							}
						} else if (event === "message_stop") {
							// Stream complete
							console.log("[Emergent Provider] Stream complete");
						}
					}

					controller.close();
				} catch (error) {
					console.error("[Emergent Provider] 💥 Stream error:", error);
					console.error("[Emergent Provider] Error type:", error instanceof Error ? error.constructor.name : typeof error);
					console.error("[Emergent Provider] Error message:", error instanceof Error ? error.message : String(error));
					console.error("[Emergent Provider] Error stack:", error instanceof Error ? error.stack : "N/A");
					controller.error(error);
				}
			},
		});

		return {
			stream,
			rawCall: {
				rawPrompt: requestBody,
				rawSettings: {},
			},
			rawResponse: {
				headers: Object.fromEntries(response.headers.entries()),
			},
			warnings: [],
		};
	}
}

/**
 * Create Emergent Anthropic provider
 */
export function createEmergentAnthropic(config: EmergentAnthropicConfig) {
	console.log("[Emergent Provider] Factory created with config:", {
		baseURL: config.baseURL,
		hasApiKey: !!config.apiKey,
		headers: config.headers,
	});

	return (modelId: string, settings?: any) => {
		console.log("[Emergent Provider] Creating model instance:", modelId, settings);
		return new EmergentAnthropicLanguageModel(modelId, config);
	};
}

