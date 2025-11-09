/**
 * Network Cache Message Handler
 * 
 * Original implementation - receives network request data from content scripts
 * and stores them in the background cache
 * 
 * Enhanced with webRequest API integration for complete HTTP headers
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import {
	addCacheEntry,
	generateEntryId,
	getCacheStatistics,
	type NetworkCacheEntry,
} from "../cache-state";
import { findMatchingWebRequest } from "../webrequest-buffer";

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

/**
 * Extract cookies from cookie header
 */
function extractCookies(headers: Record<string, string>): string[] {
	const cookieHeader = headers["cookie"] || headers["set-cookie"];
	if (!cookieHeader) return [];
	
	// Split by semicolon and clean up
	return cookieHeader.split(";").map(c => c.trim()).filter(c => c.length > 0);
}

/**
 * Extract auth headers
 */
function extractAuthHeaders(headers: Record<string, string>): {
	authorization?: string;
	"www-authenticate"?: string;
} {
	return {
		authorization: headers["authorization"],
		"www-authenticate": headers["www-authenticate"],
	};
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

	// Try to find matching webRequest data for header enrichment
	const webRequestData = findMatchingWebRequest(
		request.url,
		tabId,
		request.timestamp
	);

	// Generate unique ID
	const entryId = generateEntryId(tabId, type);

	// Merge headers: JavaScript headers as base, webRequest as authoritative source
	const requestHeaders = webRequestData
		? { ...request.headers, ...webRequestData.requestHeaders }
		: request.headers;

	const responseHeaders = webRequestData?.responseHeaders
		? { ...response.headers, ...webRequestData.responseHeaders }
		: response.headers;

	// Extract security-relevant headers if webRequest data is available
	const cookies = webRequestData ? extractCookies(webRequestData.requestHeaders) : undefined;
	const authHeaders = webRequestData ? extractAuthHeaders(webRequestData.requestHeaders) : undefined;

	// Create cache entry
	const entry: NetworkCacheEntry = {
		id: entryId,
		tabId,
		capturedAt: Date.now(),
		request: {
			url: request.url,
			method: request.method,
			headers: requestHeaders,
			body: request.body,
			timestamp: request.timestamp,
		},
		response: {
			status: webRequestData?.status || response.status,
			statusText: webRequestData?.statusText || response.statusText,
			headers: responseHeaders,
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
			hasWebRequestData: !!webRequestData,
			cookies,
			authHeaders,
		},
	};

	// Add to cache
	addCacheEntry(entry);

	// Log to console (for debugging)
	const statusIcon = response.status >= 200 && response.status < 300 ? "✅" :
		response.status >= 400 ? "❌" : "⚠️";
	
	const enrichmentIcon = webRequestData ? "🔐" : "";

	console.log(
		`[Cache Network] ${statusIcon}${enrichmentIcon} ${type.toUpperCase()} ${request.method} ${response.status} - ${request.url} (${timing.durationMs.toFixed(0)}ms)`
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

