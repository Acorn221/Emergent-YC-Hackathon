/**
 * Network Cache Message Handler
 * 
 * Original implementation - receives network request data from content scripts
 * and stores them in the background cache
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import {
	addCacheEntry,
	generateEntryId,
	getCacheStatistics,
	type NetworkCacheEntry,
} from "../cache-state";

export interface NetworkCacheMessage {
	type: "fetch" | "xhr";
	request: {
		url: string;
		method: string;
		headers: Record<string, string>;
		body?: string;
		timestamp: number;
	};
	response: {
		status: number;
		statusText: string;
		headers: Record<string, string>;
		body?: string;
		contentType?: string;
	};
	timing: {
		startTime: number;
		endTime: number;
		durationMs: number;
	};
	hasError?: boolean;
	errorMessage?: string;
}

const handler: PlasmoMessaging.MessageHandler<NetworkCacheMessage, void> = (
	req,
	res
) => {
	// Validate request body
	if (!req.body) {
		console.error("[Cache Network] No request body provided");
		res.send();
		return;
	}

	// Get tab ID from sender
	const tabId = req.sender?.tab?.id;

	if (!tabId || typeof tabId !== "number") {
		console.warn("[Cache Network] Invalid tab ID, skipping cache");
		res.send();
		return;
	}

	const { type, request, response, timing, hasError, errorMessage } = req.body;

	// Generate unique ID
	const entryId = generateEntryId(tabId, type);

	// Create cache entry
	const entry: NetworkCacheEntry = {
		id: entryId,
		tabId,
		capturedAt: Date.now(),
		request: {
			url: request.url,
			method: request.method,
			headers: request.headers,
			body: request.body,
			timestamp: request.timestamp,
		},
		response: {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
			body: response.body,
			contentType: response.contentType,
		},
		timing: {
			startTime: timing.startTime,
			endTime: timing.endTime,
			durationMs: timing.durationMs,
		},
		metadata: {
			requestType: type,
			hasError: hasError || false,
			errorMessage,
		},
	};

	// Add to cache
	addCacheEntry(entry);

	// Log to console (for debugging)
	const statusIcon = response.status >= 200 && response.status < 300 ? "✅" :
		response.status >= 400 ? "❌" : "⚠️";

	console.log(
		`[Cache Network] ${statusIcon} ${type.toUpperCase()} ${request.method} ${response.status} - ${request.url} (${timing.durationMs.toFixed(0)}ms)`
	);

	// Log stats every 25 requests
	const stats = getCacheStatistics(tabId);
	// if (stats.totalEntries % 25 === 0) {
	console.group(`[Cache Network] 📊 Stats for Tab ${tabId}`);
	console.log(`Total: ${stats.totalEntries} requests`);
	console.log(`Methods:`, stats.byMethod);
	console.log(`Status:`, stats.byStatus);
	console.log(`Types:`, stats.byType);
	if (stats.errorCount > 0) {
		console.log(`Errors: ${stats.errorCount}`);
	}
	console.groupEnd();
	// }

	res.send();
};

export default handler;

