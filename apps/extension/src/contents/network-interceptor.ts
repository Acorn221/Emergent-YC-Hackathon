/**
 * Network Request Interceptor
 * 
 * Original implementation - intercepts fetch and XHR requests at JavaScript level
 * using standard Proxy patterns. Sends captured data to background for caching.
 */

import type { PlasmoCSConfig } from "plasmo";
import { sendToBackgroundViaRelay } from "@plasmohq/messaging";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_start",
	all_frames: true,
	world: "MAIN",
};

// ============= FETCH INTERCEPTION =============

const originalFetch = window.fetch;

// Helper: Extract request information from fetch arguments
function extractFetchRequest(input: RequestInfo | URL, init?: RequestInit): {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
} {
	let url: string;
	let method = "GET";
	const headers: Record<string, string> = {};
	let body: string | undefined;

	// Parse URL
	if (typeof input === "string") {
		url = input;
	} else if (input instanceof URL) {
		url = input.toString();
	} else if (input instanceof Request) {
		url = input.url;
		method = input.method;
		// Extract headers from Request
		input.headers.forEach((value, key) => {
			headers[key] = value;
		});
	} else {
		url = String(input);
	}

	// Override with init if provided
	if (init) {
		if (init.method) method = init.method;
		if (init.headers) {
			const headerSource = init.headers;
			if (headerSource instanceof Headers) {
				headerSource.forEach((value, key) => {
					headers[key] = value;
				});
			} else if (Array.isArray(headerSource)) {
				for (const [key, value] of headerSource) {
					headers[key] = value;
				}
			} else {
				Object.entries(headerSource).forEach(([key, value]) => {
					headers[key] = value;
				});
			}
		}
		if (init.body) {
			if (typeof init.body === "string") {
				body = init.body;
			} else {
				try {
					body = JSON.stringify(init.body);
				} catch {
					body = "[Unserializable body]";
				}
			}
		}
	}

	return { url, method, headers, body };
}

// Helper: Extract response information
async function extractFetchResponse(response: Response): Promise<{
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body?: string;
	contentType?: string;
}> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});

	const contentType = headers["content-type"] || "";
	let body: string | undefined;

	try {
		const cloned = response.clone();

		if (contentType.includes("application/json")) {
			const json = await cloned.json();
			body = JSON.stringify(json);
		} else if (contentType.includes("text/") || contentType.includes("application/javascript")) {
			body = await cloned.text();
		} else {
			body = `[Binary: ${contentType}]`;
		}
	} catch {
		body = "[Failed to read response]";
	}

	return {
		status: response.status,
		statusText: response.statusText,
		headers,
		body,
		contentType,
	};
}

// Install fetch interceptor
window.fetch = new Proxy(originalFetch, {
	apply: async function (target, thisArg, args: Parameters<typeof fetch>) {
		const startTime = performance.now();
		const [input, init] = args;

		const requestData = extractFetchRequest(input, init);

		try {
			const response = await Reflect.apply(target, thisArg, args);
			const endTime = performance.now();

			// Extract response data asynchronously (don't block the response)
			extractFetchResponse(response).then(responseData => {
				// Send to background for caching
				sendToBackgroundViaRelay({
					name: "cache-network",
					body: {
						type: "fetch",
						request: {
							...requestData,
							timestamp: Date.now(),
						},
						response: responseData,
						timing: {
							startTime,
							endTime,
							durationMs: endTime - startTime,
						},
					},
				}).catch(err => {
					console.error("[Network Interceptor] ❌ Failed to cache fetch:", err);
				});
			}).catch(err => {
				console.error("[Network Interceptor] ❌ Failed to extract response:", err);
			});

			return response;
		} catch (error) {
			const endTime = performance.now();

			console.error(`[Network Interceptor] ❌ FETCH ERROR ${requestData.method} ${requestData.url}:`, error);

			// Log failed request
			sendToBackgroundViaRelay({
				name: "cache-network",
				body: {
					type: "fetch",
					request: {
						...requestData,
						timestamp: Date.now(),
					},
					response: {
						status: 0,
						statusText: "Network Error",
						headers: {},
						body: error instanceof Error ? error.message : String(error),
					},
					timing: {
						startTime,
						endTime,
						durationMs: endTime - startTime,
					},
					hasError: true,
					errorMessage: error instanceof Error ? error.message : String(error),
				},
			}).catch(() => {
				// Silently fail cache - don't break the original request
			});

			throw error;
		}
	},
});

// ============= XHR INTERCEPTION =============

const OriginalXHR = window.XMLHttpRequest;

class InterceptedXHR extends OriginalXHR {
	private _requestMetadata = {
		method: "",
		url: "",
		headers: {} as Record<string, string>,
		body: undefined as string | undefined,
		startTime: 0,
	};

	constructor() {
		super();
		this._setupInterception();
	}

	private _setupInterception() {
		const startTime = performance.now();
		this._requestMetadata.startTime = startTime;

		// Capture completion
		this.addEventListener("loadend", () => {
			const endTime = performance.now();

			// Extract response headers
			const responseHeaders: Record<string, string> = {};
			const headersString = this.getAllResponseHeaders();
			if (headersString) {
				headersString.split("\r\n").forEach(line => {
					const separatorIndex = line.indexOf(": ");
					if (separatorIndex > 0) {
						const key = line.substring(0, separatorIndex);
						const value = line.substring(separatorIndex + 2);
						responseHeaders[key] = value;
					}
				});
			}

			// Get response body
			let responseBody: string | undefined;
			try {
				if (this.responseType === "" || this.responseType === "text") {
					responseBody = this.responseText;
				} else if (this.responseType === "json") {
					responseBody = JSON.stringify(this.response);
				} else {
					responseBody = `[${this.responseType}]`;
				}
			} catch {
				responseBody = "[Unable to read response]";
			}

			// Send to background
			sendToBackgroundViaRelay({
				name: "cache-network",
				body: {
					type: "xhr",
					request: {
						url: this._requestMetadata.url,
						method: this._requestMetadata.method,
						headers: this._requestMetadata.headers,
						body: this._requestMetadata.body,
						timestamp: Date.now(),
					},
					response: {
						status: this.status,
						statusText: this.statusText,
						headers: responseHeaders,
						body: responseBody,
						contentType: responseHeaders["content-type"],
					},
					timing: {
						startTime,
						endTime,
						durationMs: endTime - startTime,
					},
				},
			}).catch(err => {
				console.error("[Network Interceptor] ❌ Failed to cache XHR:", err);
			});
		});
	}

	open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
		this._requestMetadata.method = method.toUpperCase();
		this._requestMetadata.url = url.toString();
		return super.open(method, url, async ?? true, username, password);
	}

	setRequestHeader(name: string, value: string): void {
		this._requestMetadata.headers[name] = value;
		return super.setRequestHeader(name, value);
	}

	send(body?: Document | XMLHttpRequestBodyInit | null): void {
		if (body) {
			if (typeof body === "string") {
				this._requestMetadata.body = body;
			} else {
				try {
					this._requestMetadata.body = JSON.stringify(body);
				} catch {
					this._requestMetadata.body = "[Unserializable body]";
				}
			}
		}
		return super.send(body);
	}
}

// Replace XMLHttpRequest
window.XMLHttpRequest = InterceptedXHR as typeof XMLHttpRequest;

console.log("[Network Interceptor] ✅ Installed - Monitoring fetch & XHR");

