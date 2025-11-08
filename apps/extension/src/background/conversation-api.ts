/**
 * LLM Conversation API Examples
 * 
 * This file demonstrates how to use the streaming LLM conversation system
 * from popup or other extension components.
 */

import { sendToBackground } from "@plasmohq/messaging";
import type { StartConversationRequest } from "./messages/start-conversation";
import type { GetUpdatesRequest, GetUpdatesResponse } from "./messages/get-conversation-updates";
import type { AbortConversationRequest } from "./messages/abort-conversation";

/**
 * Start a new LLM conversation
 */
export async function startConversation(opts: {
	prompt: string;
	tabId?: number;
}): Promise<string> {
	const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	await sendToBackground<StartConversationRequest, void>({
		name: "start-conversation",
		body: {
			conversationId,
			prompt: opts.prompt,
			tabId: opts.tabId,
		},
	});

	return conversationId;
}

/**
 * Poll for conversation updates
 */
export async function getConversationUpdates(
	conversationId: string
): Promise<GetUpdatesResponse> {
	return await sendToBackground<GetUpdatesRequest, GetUpdatesResponse>({
		name: "get-conversation-updates",
		body: { conversationId },
	});
}

/**
 * Abort an active conversation
 */
export async function abortConversation(conversationId: string): Promise<void> {
	await sendToBackground<AbortConversationRequest, void>({
		name: "abort-conversation",
		body: { conversationId },
	});
}

/**
 * Stream a conversation with callback for each chunk
 */
export async function streamConversation(opts: {
	prompt: string;
	tabId?: number;
	onChunk?: (chunk: any) => void;
	onComplete?: (fullText: string) => void;
	onError?: (error: string) => void;
}): Promise<{ conversationId: string; stop: () => void }> {
	const conversationId = await startConversation({
		prompt: opts.prompt,
		tabId: opts.tabId,
	});

	let intervalId: NodeJS.Timeout | null = null;
	let isRunning = true;

	// Poll for updates every 300ms
	intervalId = setInterval(async () => {
		if (!isRunning) return;

		try {
			const updates = await getConversationUpdates(conversationId);

			// Process new chunks
			if (updates.chunks.length > 0 && opts.onChunk) {
				updates.chunks.forEach(chunk => opts.onChunk?.(chunk));
			}

			// Check if completed
			if (updates.status !== "streaming") {
				if (intervalId) clearInterval(intervalId);
				isRunning = false;

				if (updates.status === "completed" && opts.onComplete) {
					opts.onComplete(updates.fullText);
				} else if (updates.status === "error" && opts.onError) {
					const errorChunk = updates.chunks.find(c => c.type === "error");
					opts.onError(errorChunk?.data || "Unknown error");
				}
			}
		} catch (error: any) {
			if (intervalId) clearInterval(intervalId);
			isRunning = false;
			opts.onError?.(error.message || String(error));
		}
	}, 300);

	return {
		conversationId,
		stop: async () => {
			isRunning = false;
			if (intervalId) clearInterval(intervalId);
			await abortConversation(conversationId);
		},
	};
}

// ============= Example Usage =============

/**
 * Example 1: Simple streaming with callbacks
 */
export async function exampleSimpleStream() {
	const { conversationId, stop } = await streamConversation({
		prompt: "Analyze the network requests for security vulnerabilities",
		onChunk: (chunk) => {
			if (chunk.type === "text") {
				console.log("Text:", chunk.data);
			} else if (chunk.type === "tool_use") {
				console.log("Tool called:", chunk.data.name);
			}
		},
		onComplete: (fullText) => {
			console.log("Completed! Full text:", fullText);
		},
		onError: (error) => {
			console.error("Error:", error);
		},
	});

	// Optionally stop early
	// setTimeout(() => stop(), 5000);
}

/**
 * Example 2: Manual polling (for React components)
 */
export async function exampleManualPolling() {
	const conversationId = await startConversation({
		prompt: "Find all POST requests with 4xx or 5xx status codes",
	});

	// In React, this would be in useEffect or a custom hook
	const interval = setInterval(async () => {
		const updates = await getConversationUpdates(conversationId);

		// Update UI with chunks
		updates.chunks.forEach(chunk => {
			// setMessages(prev => [...prev, chunk])
			console.log("Chunk:", chunk);
		});

		if (updates.status !== "streaming") {
			clearInterval(interval);
			console.log("Done! Status:", updates.status);
		}
	}, 300);

	return { conversationId, interval };
}

/**
 * Example 3: React Hook Pattern
 */
export function useConversation() {
	// This would be implemented as a React hook
	// const [messages, setMessages] = useState([]);
	// const [status, setStatus] = useState("idle");
	// 
	// const start = useCallback(async (prompt: string) => {
	//   const { conversationId, stop } = await streamConversation({
	//     prompt,
	//     onChunk: (chunk) => {
	//       setMessages(prev => [...prev, chunk]);
	//     },
	//     onComplete: (fullText) => {
	//       setStatus("completed");
	//     },
	//   });
	// }, []);
	//
	// return { messages, status, start };
}

