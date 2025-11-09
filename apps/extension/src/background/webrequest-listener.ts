/**
 * WebRequest API Listener
 * 
 * Captures complete HTTP headers from Chrome's network layer.
 * This gives us access to actual cookies, auth headers, and server-sent headers
 * that aren't visible to JavaScript fetch/XHR interception.
 */

import {
  storePendingRequest,
  updatePendingRequest,
  removePendingRequest,
  cleanupOldRequests,
  clearTabRequests,
} from "./webrequest-buffer";

/**
 * Listen for outgoing requests - captures request headers including cookies
 */
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Skip non-tab requests (extension internal, etc.)
    if (details.tabId === -1) return;
    
    // Convert headers array to object
    const headers: Record<string, string> = {};
    details.requestHeaders?.forEach((header) => {
      headers[header.name.toLowerCase()] = header.value || "";
    });
    
    // Store in pending buffer
    storePendingRequest({
      requestId: details.requestId,
      tabId: details.tabId,
      url: details.url,
      method: details.method,
      requestHeaders: headers,
      requestTimestamp: details.timeStamp,
    });
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"] // extraHeaders needed for cookies
);

/**
 * Listen for response headers - captures server response headers
 */
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    // Skip non-tab requests
    if (details.tabId === -1) return;
    
    // Convert headers array to object
    const headers: Record<string, string> = {};
    details.responseHeaders?.forEach((header) => {
      headers[header.name.toLowerCase()] = header.value || "";
    });
    
    // Update pending request with response data
    updatePendingRequest(details.requestId, {
      responseHeaders: headers,
      status: details.statusCode,
      statusText: details.statusLine,
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

/**
 * Cleanup completed requests after a short delay
 * We keep them for a bit in case JS interception is slow
 */
chrome.webRequest.onCompleted.addListener(
  (details) => {
    // Remove after 5 seconds (gives JS time to match)
    setTimeout(() => {
      removePendingRequest(details.requestId);
    }, 5000);
  },
  { urls: ["<all_urls>"] }
);

/**
 * Cleanup failed requests immediately
 */
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    // Remove failed requests after 2 seconds
    setTimeout(() => {
      removePendingRequest(details.requestId);
    }, 2000);
  },
  { urls: ["<all_urls>"] }
);

/**
 * Periodic cleanup of old requests (every 60 seconds)
 * Prevents memory leaks from requests that never complete
 */
setInterval(() => {
  cleanupOldRequests();
}, 60_000);

/**
 * Clear pending requests when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabRequests(tabId);
});

console.log("[WebRequest Listener] 🎧 Initialized - capturing HTTP headers");

