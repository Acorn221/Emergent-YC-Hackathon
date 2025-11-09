/**
 * Script Executor Content Script
 * 
 * Runs in MAIN world to execute JavaScript in page context.
 * Polls background for pending executions and sends results back.
 */

import type { PlasmoCSConfig } from "plasmo";
import { sendToBackgroundViaRelay } from "@plasmohq/messaging";
import {
	wrapCodeInAsync,
	createConsoleInterceptor,
	serializeExecutionResult,
	formatExecutionError,
	type ConsoleLog,
} from "../contents-helpers/script-execution-helpers";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	world: "MAIN",
	run_at: "document_start",
	all_frames: false,
};

console.log("[Script Executor] 🚀 Initialized in MAIN world");

/**
 * Poll for pending script execution
 */
async function pollForPendingScript() {
	try {
		const response = await sendToBackgroundViaRelay<
			object,
			{ id: string | null; code: string | null }
		>({
			name: "get-pending-script",
			body: {},
		});

		// Check if there's a pending script
		if (response?.id && response?.code) {
			console.log(
				`[Script Executor] 📥 Received script ${response.id} (${response.code.length} chars)`
			);
			await executeScript(response.id, response.code);
		}
	} catch (error) {
		console.error("[Script Executor] ❌ Polling error:", error);
	}
}

/**
 * Execute script and send result back
 */
async function executeScript(id: string, code: string) {
	const interceptor = createConsoleInterceptor();

	try {
		console.log(`[Script Executor] ⚙️ Executing ${id}...`);

		// Wrap code in async IIFE
		const wrappedCode = wrapCodeInAsync(code);

		// Execute with eval
		// eslint-disable-next-line no-eval
		const result = await eval(wrappedCode);

		// Serialize result
		const serialized = serializeExecutionResult(result);

		// Restore console
		interceptor.restore();

		console.log(`[Script Executor] ✅ Success ${id}`);

		// Send result back - wrap in try-catch to prevent breaking the loop
		try {
			await sendToBackgroundViaRelay({
				name: "script-execution-result",
				body: {
					id,
					result: serialized,
					logs: interceptor.logs,
				},
			});
			console.log(`[Script Executor] ✅ Sent success result for ${id}`);
		} catch (sendError) {
			// If sending fails, log it but don't throw - execution manager will timeout
			console.error(
				`[Script Executor] ❌ Failed to send success result for ${id}:`,
				sendError
			);
		}
	} catch (error) {
		// Restore console on error
		try {
			interceptor.restore();
		} catch (restoreError) {
			console.error(
				"[Script Executor] Failed to restore console methods:",
				restoreError
			);
		}

		const errorMessage = formatExecutionError(error);
		console.error(`[Script Executor] ❌ Error in ${id}:`, error);

		// Send error back - wrap in try-catch to prevent breaking the loop
		try {
			await sendToBackgroundViaRelay({
				name: "script-execution-result",
				body: {
					id,
					error: errorMessage,
					logs: interceptor.logs,
				},
			});
			console.log(`[Script Executor] ✅ Sent error result for ${id}`);
		} catch (sendError) {
			// If sending fails, log it but don't throw - execution manager will timeout
			console.error(
				`[Script Executor] ❌ Failed to send error result for ${id}:`,
				sendError
			);
		}
	}
}

async function startPolling() {
	while (true) {
		await pollForPendingScript();
		await new Promise(resolve => setTimeout(resolve, 500));
	}
}

// Start when content script loads
void startPolling();

